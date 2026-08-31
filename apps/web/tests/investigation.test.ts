import { afterEach, expect, test } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, ref } from "vue";
import { normalizeCase, normalizeFailure, useCourtStore } from "../src/stores/court";
import { useWebMcp } from "../src/webmcp/useWebMcp";
import { safeParseVariantRequests } from "@strategy-court/schemas";
import type { CaseInput } from "../src/types";

const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop());
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
});
const payload = () => ({
  id: "case-a", name: "Evidence test", activeVersionId: "v1", replays: [], audit: [],
  versions: [{ id: "v1", confirmed: true, definition: {}, interpretation: "Rules" }, { id: "v2", definition: {}, interpretation: "New draft" }],
  runs: [{ id: "run-a", strategyVersionId: "v1", status: "completed", progress: 100, result: {
    summaryLabel: "Fragile", metrics: { netReturnPercent: -1 }, verdicts: [{ id: "costs", category: "costs", status: "Fail" }],
    failures: [{ id: "failure-a", period: { start: "2024-01-02", end: "2024-01-05" }, symbols: ["SPY"] }],
    trades: [
      { symbol: "SPY", entryDate: "2024-01-02", exitDate: "2024-01-05", netProfit: -20 },
      { symbol: "QQQ", entryDate: "2024-02-01", exitDate: "2024-02-02", netProfit: 10 },
    ],
  } }],
});
function setup() {
  setActivePinia(createPinia());
  const store = useCourtStore();
  store.currentCase = normalizeCase(payload());
  return store;
}
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function registeredTools() {
  const registered = new Map<string, ModelContextTool>();
  Object.defineProperty(globalThis, "document", { configurable: true, value: { modelContext: {
    registerTool: async (tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
      registered.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => registered.delete(tool.name), { once: true });
    },
  } } });
  const scope = effectScope(); scopes.push(scope);
  const enabled = ref(true);
  scope.run(() => useWebMcp(enabled));
  await tick();
  return { registered, enabled };
}

const caseInput: CaseInput = {
  name: "QA case intake", description: "Buy SPY above its SMA20 and exit below its SMA20.", symbols: ["SPY"],
  startDate: "2020-01-02", endDate: "2024-12-31", initialCapital: 10000,
  commissionBpsPerSide: 1, slippageBpsPerSide: 5,
};

test("advertised WebMCP variant input reaches the strict API contract", async () => {
  const store = setup();
  const { registered } = await registeredTools();
  const tool = registered.get("create_strategy_variants")!;
  const schema = tool.inputSchema as any;
  expect(schema.properties.variants.items.required).toContain("structuredPatch");
  const variant = {
    name: "Shorter hold", hypothesis: "A shorter holding cap reduces unrecovered exposure.",
    rationale: "Test one control against the observed recovery failure.", expectedWeaknessAddressed: "Risk profile",
    structuredPatch: { risk: { maxHoldingDays: 10 } },
  };
  const updated = payload();
  updated.versions.push({ id: "variant-a", parentVersionId: "v1", definition: {}, interpretation: "Shorter hold" } as any);
  const bodies: any[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)); bodies.push(body);
      // Use the server validator rather than accepting every body in this mock.
      const parsed = safeParseVariantRequests(body.variants);
      if (!parsed.success) return new Response(JSON.stringify({ error: { message: "The variant batch is invalid", details: parsed.issues } }), { status: 422 });
      return json({ versions: [{ id: "variant-a" }], runs: [{ ...updated.runs[0], id: "variant-run", strategyVersionId: "variant-a" }] });
    }
    if (String(input).includes("/comparison")) return json({ comparison: { caseId: "case-a", versions: [] } });
    return json({ case: updated });
  }) as typeof fetch;
  const result = await tool.execute({ caseId: "case-a", variants: [variant] }) as any;
  expect(result.ok).toBe(true);
  expect(bodies).toEqual([{ parentVersionId: "v1", variants: [{
    name: variant.name, hypothesis: variant.hypothesis, rationale: variant.rationale,
    expectedWeaknessAddressed: variant.expectedWeaknessAddressed, patch: variant.structuredPatch,
  }] }]);
  expect(result.changedIds).toEqual(["variant-a"]);
  expect(store.activeTab).toBe("variants");
});

test("create_case rejects unknown fields and invalid retry keys before any API call", async () => {
  const store = setup();
  const { registered } = await registeredTools();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return json({ case: { ...payload(), id: "unwanted" } }); }) as typeof fetch;
  const invalid = [
    { ...caseInput, requestId: "request-123", unexpected: true },
    ...[undefined, 12345678, "short", "contains spaces", "a".repeat(121)].map(requestId => ({ ...caseInput, requestId })),
  ];
  for (const input of invalid) {
    const result = await registered.get("create_case")!.execute(input) as any;
    expect(result.ok).toBe(false);
    expect(result.changedIds).toEqual([]);
    expect(store.currentCase?.id).toBe("case-a");
  }
  expect(calls).toBe(0);
});

test("a failed create_case keeps the current evidence, monitoring and costs", async () => {
  const store = setup();
  await store.selectEvidence("run-a", { kind: "trade", id: "trade-1" });
  store.monitoringError = "Previous evaluation is offline";
  store.monitoringLastSuccessAt = "2026-08-30T12:00:00Z";
  store.caseCosts = { commissionBpsPerSide: 2, slippageBpsPerSide: 7 };
  const before = {
    courtCase: store.currentCase, selection: store.evidenceSelection, focus: store.evidenceFocus,
    costs: store.caseCosts, monitoringError: store.monitoringError, lastSuccess: store.monitoringLastSuccessAt,
  };
  const { registered } = await registeredTools();
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: "request_conflict", message: "This requestId was already used with different case settings." } }), { status: 409 })) as typeof fetch;
  const result = await registered.get("create_case")!.execute({ ...caseInput, requestId: "request-123" }) as any;
  expect(result.ok).toBe(false);
  expect(store.error).toContain("different case settings");
  expect(store.currentCase).toBe(before.courtCase);
  expect(store.evidenceSelection).toEqual(before.selection);
  expect(store.evidenceFocus).toEqual(before.focus);
  expect(store.caseCosts).toEqual(before.costs);
  expect(store.monitoringError).toBe(before.monitoringError);
  expect(store.monitoringLastSuccessAt).toBe(before.lastSuccess);
  expect(store.loading).toBe(false);
});

test("failed creation preserves the viewed version and a successful retry opens the new case", async () => {
  const store = setup();
  store.selectVersion("v2");
  store.monitoringLastSuccessAt = "2026-08-30T12:00:00Z";
  globalThis.fetch = (async () => { throw new Error("Offline"); }) as typeof fetch;
  expect(await store.createCase(caseInput)).toBeNull();
  expect(store.activeVersion?.id).toBe("v2");
  expect(store.monitoringLastSuccessAt).toBe("2026-08-30T12:00:00Z");
  globalThis.fetch = (async () => json({ case: { ...payload(), id: "created-case" } })) as typeof fetch;
  expect(await store.createCase(caseInput)).toBe("created-case");
  expect(store.currentCase?.id).toBe("created-case");
  expect(store.activeVersion?.id).toBe("v1");
  expect(store.monitoringLastSuccessAt).toBeNull();
  expect(store.error).toBeNull();
});

test("human and agent selection share IDs and focus, and reject foreign evidence", async () => {
  const store = setup();
  await store.selectEvidence("run-a", { kind: "trade", id: "trade-1" }, "agent");
  expect(store.activeTab).toBe("evidence");
  expect(store.evidenceSelection).toMatchObject({ caseId: "case-a", versionId: "v1", runId: "run-a", actor: "agent", status: "ready" });
  expect(store.evidenceFocus).toMatchObject({ symbol: "QQQ", start: "2024-02-01", end: "2024-02-02", tradeId: "trade-1" });
  await store.selectEvidence("run-a", { kind: "trade", id: "trade-0" });
  expect(store.evidenceSelection?.actor).toBe("user");
  await expect(store.selectEvidence("other-run", { kind: "trade", id: "trade-0" })).rejects.toThrow("currently displayed");
  await expect(store.selectEvidence("run-a", { kind: "trade", id: "trade-99" })).rejects.toThrow("does not belong");
  store.selectVersion("v2");
  expect(store.latestRun).toBeUndefined();
  expect(store.evidenceSelection).toBeNull();
  expect(store.evidenceFocus).toBeNull();
});

test("filtered failure trades retain original run IDs without inventing references", () => {
  const store = setup();
  const second = store.result!.trades[1]!;
  const failure = normalizeFailure({ id: "subset", trades: [second, { symbol: "UNKNOWN" }] }, 0, [], store.result!.trades);
  expect(failure.trades[0]?.id).toBe("trade-1");
  expect(failure.trades[1]?.id).toBeUndefined();
});

test("closing or switching selection wins over a late failure response", async () => {
  const store = setup();
  let finish!: (response: Response) => void;
  globalThis.fetch = (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch;
  const selecting = store.selectEvidence("run-a", { kind: "failure", id: "failure-a" }, "agent");
  expect(store.evidenceSelection?.status).toBe("loading");
  await store.selectEvidence("run-a", { kind: "trade", id: "trade-1" });
  finish(json({ failure: { id: "failure-a", period: { start: "2024-01-02", end: "2024-01-05" } } }));
  expect(await selecting).toBeNull();
  expect(store.selectedTrade?.id).toBe("trade-1");
  store.clearEvidenceSelection();
  expect(store.selectedTrade).toBeNull();
});

test("signing out clears evidence and late enrichment cannot restore it", async () => {
  const store = setup();
  let finish!: (response: Response) => void;
  globalThis.fetch = (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch;
  const loading = store.enrichFailures();
  store.currentCase = null;
  finish(json({ failure: { id: "failure-a" } }));
  await loading;
  expect(store.failureEvidenceCache).toEqual({});
  expect(store.failureLoading).toBe(false);
  expect(store.evidenceSelection).toBeNull();
});

test("failure errors stay visible and a retry recovers the same selection", async () => {
  const store = setup();
  globalThis.fetch = (() => Promise.reject(new Error("Offline"))) as typeof fetch;
  await expect(store.selectEvidence("run-a", { kind: "failure", id: "failure-a" })).rejects.toThrow();
  expect(store.evidenceSelection).toMatchObject({ id: "failure-a", status: "error" });
  globalThis.fetch = (async () => json({ failure: { id: "failure-a", symbols: ["SPY"], period: { start: "2024-01-02", end: "2024-01-05" } } })) as typeof fetch;
  await store.selectEvidence("run-a", { kind: "failure", id: "failure-a" });
  expect(store.evidenceSelection).toMatchObject({ id: "failure-a", status: "ready", error: null });
  expect(store.evidenceFocus).toMatchObject({ start: "2024-01-02", end: "2024-01-05" });
});

test("WebMCP opens the shared inspector and cannot confirm a decision", async () => {
  const store = setup();
  const { registered, enabled } = await registeredTools();
  expect(registered.has("propose_case_decision")).toBe(true);
  expect([...registered.keys()].some(name => name.includes("confirm"))).toBe(false);
  const result = await registered.get("inspect_trade")!.execute({ runId: "run-a", tradeId: "trade-1" }) as any;
  expect(result.ok).toBe(true);
  expect(result.data.trade.id).toBe("trade-1");
  expect(store.selectedTrade?.id).toBe("trade-1");
  globalThis.fetch = (async () => json({ case: payload() })) as typeof fetch;
  await store.selectEvidence("run-a", { kind: "trade", id: "trade-0" });
  const context = await registered.get("get_case_context")!.execute({}) as any;
  expect(context.data.case.evidenceSelection).toMatchObject({ id: "trade-0", actor: "user" });
  enabled.value = false;
  await tick();
  expect(store.currentCase).toBeNull();
  expect(store.evidenceSelection).toBeNull();
});
