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

async function registeredTools(navigateToCase?: (caseId: string) => Promise<unknown>) {
  const registered = new Map<string, ModelContextTool>();
  Object.defineProperty(globalThis, "document", { configurable: true, value: { modelContext: {
    registerTool: async (tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
      registered.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => registered.delete(tool.name), { once: true });
    },
  } } });
  const scope = effectScope(); scopes.push(scope);
  const enabled = ref(true);
  const accountId = ref<string | null>("account-a");
  scope.run(() => useWebMcp(enabled, navigateToCase, accountId));
  await tick();
  return { registered, enabled, accountId };
}

test("account-level WebMCP navigation lists compact cases and opens an owned case", async () => {
  const store = setup();
  const opened: string[] = [];
  const { registered } = await registeredTools(async caseId => { opened.push(caseId); });
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://app.test");
    const path = url.pathname;
    requests.push(`${path}${url.search}`);
    if (path === "/api/cases") return json({ cases: [
      { id: "case-b", name: "QQQ pullback", description: "RSI reversal", symbols: ["QQQ"], dateFrom: "2020-01-02", dateTo: "2024-12-31", status: "draft", activeVersionId: "v2", updatedAt: "2026-09-01T10:00:00Z" },
    ], total: 1, offset: 0, nextOffset: null });
    return json({ case: { id: "case-b", name: "QQQ pullback", description: "RSI reversal", symbols: ["QQQ"], dateFrom: "2020-01-02", dateTo: "2024-12-31", status: "draft", activeVersionId: "v2", versions: [], runs: [], replays: [], audit: [] } });
  }) as typeof fetch;

  const listed = await registered.get("list_cases")!.execute({ query: "QQQ" }) as any;
  expect(listed.ok).toBe(true);
  expect(listed.data.cases).toEqual([expect.objectContaining({ id: "case-b", symbols: ["QQQ"] })]);
  const requestsAfterList = requests.length;
  const invalidList = await registered.get("list_cases")!.execute({ offset: -1, limit: 11 }) as any;
  expect(invalidList.ok).toBe(false);
  expect(requests).toHaveLength(requestsAfterList);
  const openedResult = await registered.get("open_case")!.execute({ caseId: "case-b" }) as any;
  expect(openedResult.ok).toBe(true);
  expect(opened).toEqual(["case-b"]);
  expect(openedResult.data.path).toBe("/case/case-b");
  expect(openedResult.currentState.caseId).toBe("case-b");
  expect(requests[0]).toBe("/api/cases?offset=0&limit=10&query=QQQ");
  expect(requests.filter(path => path === "/api/cases/case-b")).toHaveLength(1);
  expect(store.consumeCaseRouteHandoff("case-b")).toBe(true);
  expect(store.consumeCaseRouteHandoff("case-b")).toBe(false);
});

test("ordinary same-case route openings refresh after the one-use handoff is consumed", async () => {
  const store = setup();
  expect(store.prepareCaseRouteHandoff("case-a")).toBe(true);
  expect(store.consumeCaseRouteHandoff("case-a")).toBe(true);
  expect(store.consumeCaseRouteHandoff("case-a")).toBe(false);
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return json({ case: { ...payload(), name: "Refreshed evidence" } });
  }) as typeof fetch;

  expect(await store.loadCase("case-a")).toBe(true);
  expect(calls).toBe(1);
  expect(store.currentCase?.name).toBe("Refreshed evidence");
  const workspace = await Bun.file(new URL("../src/pages/CaseWorkspacePage.vue", import.meta.url)).text();
  expect(workspace).toContain("store.consumeCaseRouteHandoff(requestedCaseId)");
  expect(workspace).not.toContain("store.currentCase?.id !== requestedCaseId && !await store.loadCase");
});

test("the newest overlapping case load wins even when an older response finishes last", async () => {
  setActivePinia(createPinia());
  const store = useCourtStore();
  const pending = new Map<string, (response: Response) => void>();
  globalThis.fetch = ((input: RequestInfo | URL) => new Promise<Response>(resolve => {
    pending.set(new URL(String(input), "http://app.test").pathname, resolve);
  })) as typeof fetch;
  const response = (id: string) => json({ case: { id, name: id, description: "Rules", symbols: ["SPY"], dateFrom: "2024-01-01", dateTo: "2024-12-31", initialCapital: 10_000, status: "draft", versions: [], runs: [], replays: [], audit: [] } });

  const older = store.loadCase("case-a");
  const newer = store.loadCase("case-b");
  pending.get("/api/cases/case-b")!(response("case-b"));
  expect(await newer).toBe(true);
  pending.get("/api/cases/case-a")!(response("case-a"));
  expect(await older).toBe(false);
  expect(store.currentCase?.id).toBe("case-b");
  expect(store.loading).toBe(false);
});

test("a rejected open_case keeps the visible case and returns a normal tool error", async () => {
  const store = setup();
  const opened: string[] = [];
  const { registered } = await registeredTools(async caseId => { opened.push(caseId); });
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: "case_not_found", message: "Court case not found" } }), { status: 404, headers: { "content-type": "application/json" } })) as typeof fetch;

  const result = await registered.get("open_case")!.execute({ caseId: "foreign-case" }) as any;
  expect(result).toMatchObject({ ok: false, error: { code: "TOOL_EXECUTION_FAILED" }, currentState: { caseId: "case-a" } });
  expect(store.currentCase?.id).toBe("case-a");
  expect(opened).toEqual([]);
});

test("account changes clear case state and invalidate every prior result handle", async () => {
  const store = setup();
  const { registered, accountId } = await registeredTools();
  globalThis.fetch = (async () => json({ report: { case: { name: "Private A" }, run: { status: "completed" }, trades: Array(500).fill({ note: "private" }) } })) as typeof fetch;
  const exported = await registered.get("export_case_report")!.execute({ caseId: "case-a" }) as any;
  const resultId = exported.data.manifest.resultId;

  accountId.value = "account-b";
  await tick();
  expect(store.currentCase).toBeNull();
  const oldPage = await registered.get("read_tool_result")!.execute({ resultId, offset: 0 }) as any;
  expect(oldPage.ok).toBe(false);
  expect(oldPage.message).toContain("expired");
});

test("a late report cannot publish a handle after its case scope changes", async () => {
  const store = setup();
  const { registered } = await registeredTools();
  let finish!: (response: Response) => void;
  globalThis.fetch = (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch;
  const exporting = registered.get("export_case_report")!.execute({ caseId: "case-a" });
  store.currentCase = normalizeCase({ ...payload(), id: "case-b" });
  finish(json({ report: { case: { name: "Private A" }, run: { status: "completed" }, trades: Array(500).fill({ note: "private" }) } }));
  await expect(exporting).rejects.toMatchObject({ name: "AbortError" });
});

test("a late report from the previous signed-in account is discarded", async () => {
  const store = setup();
  const { registered, accountId } = await registeredTools();
  let finish!: (response: Response) => void;
  globalThis.fetch = (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch;
  const exporting = registered.get("export_case_report")!.execute({ caseId: "case-a" });
  accountId.value = "account-b";
  finish(json({ report: { case: { name: "Private A" }, run: { status: "completed" }, trades: Array(500).fill({ note: "private" }) } }));

  await expect(exporting).rejects.toMatchObject({ name: "AbortError" });
  expect(store.currentCase).toBeNull();
});

test("a late case creation from the previous account cannot repopulate the store", async () => {
  const store = setup();
  const { registered, accountId } = await registeredTools();
  let finish!: (response: Response) => void;
  globalThis.fetch = (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch;
  const creating = registered.get("create_case")!.execute({ ...caseInput, requestId: "request-account-a" });

  accountId.value = "account-b";
  finish(json({ case: { ...payload(), id: "private-account-a-case" } }));

  await expect(creating).rejects.toThrow();
  expect(store.currentCase).toBeNull();
  expect(store.loading).toBe(false);
});

test("WebMCP defers heavy case schemas until an investigation is open", async () => {
  setActivePinia(createPinia());
  const { registered } = await registeredTools(async () => {});
  expect([...registered.keys()].sort()).toEqual(["create_case", "list_cases", "open_case", "read_tool_result"]);
});

test("account-level case lists remain readable when descriptions exceed one response", async () => {
  setActivePinia(createPinia());
  const { registered } = await registeredTools(async () => {});
  const cases = Array.from({ length: 20 }, (_, index) => ({
    id: `case-${index}`,
    name: `Investigation ${index}`,
    description: `Description ${index} ${"x".repeat(1_900)}`,
    symbols: ["SPY"],
    dateFrom: "2020-01-02",
    dateTo: "2024-12-31",
  }));
  let requested = "";
  globalThis.fetch = (async (input) => {
    requested = String(input);
    return json({ cases: cases.slice(10, 20), total: 20, offset: 10, nextOffset: null });
  }) as typeof fetch;

  const listed = await registered.get("list_cases")!.execute({ offset: 10, limit: 10 }) as any;
  expect(listed.data.cases).toHaveLength(10);
  expect(listed.data.cases[0].id).toBe("case-10");
  expect(listed.data.cases.every((item: { description: string }) => item.description.length === 240)).toBe(true);
  expect(requested).toContain("/api/cases?offset=10&limit=10");
  expect(listed.data).toMatchObject({ total: 20, offset: 10, nextOffset: null });
  expect(listed.data).not.toHaveProperty("resultId");
  expect(registered.has("read_tool_result")).toBe(true);
});

test("WebMCP exports the active run by run ID and returns a compact brief", async () => {
  setup();
  const { registered } = await registeredTools();
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(new URL(String(input), "http://app.test").pathname);
    return json({ report: {
      case: { name: "Evidence test", symbols: ["SPY"] },
      run: { status: "completed", summary: "Fragile", reproducibilityId: "repro-1" },
      verdicts: [{ id: "costs", status: "Fail" }],
      trades: [{}, {}], failures: [{}], versionHistory: [{}],
    } });
  }) as typeof fetch;

  const result = await registered.get("export_case_report")!.execute({ caseId: "case-a" }) as any;
  expect(result.ok).toBe(true);
  expect(requested).toEqual(["/api/reports/run-a"]);
  expect(result.data.summary).toMatchObject({
    case: { name: "Evidence test", symbols: ["SPY"] },
    run: { status: "completed", summary: "Fragile", reproducibilityId: "repro-1" },
    counts: { trades: 2, failures: 1, versions: 1 },
  });
  expect(result.data.summary.failureIds).toEqual(["1"]);
  expect(result.data.manifest).toMatchObject({ resultId: expect.any(String), readWith: "read_tool_result" });
});

test("maximum report fields cannot wrap the manifest in a second result handle", async () => {
  setup();
  const { registered } = await registeredTools();
  const maximum = "x".repeat(4_000);
  globalThis.fetch = (async () => json({ report: {
    case: { name: maximum, symbols: Array(5).fill("SPY"), dateRange: { start: "2020-01-02", end: "2024-12-31" } },
    run: { status: "completed", summary: maximum, reproducibilityId: maximum, engineVersion: maximum },
    verdicts: Array.from({ length: 20 }, (_, index) => ({ id: `verdict-${index}`, category: maximum, status: "Fail", finding: maximum, failureId: `failure-${index}` })),
    metrics: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`metric-${index}`, maximum])),
    decisions: [{ outcome: "rejected", state: "confirmed", rationale: maximum, uncertainties: maximum, revisitCriteria: maximum, evidenceRefs: Array.from({ length: 20 }, (_, index) => ({ kind: "failure", id: `failure-${index}-${maximum}` })) }],
    dataWarnings: Array(20).fill(maximum),
    trades: Array(100).fill({}), failures: Array(100).fill({}), versionHistory: Array(20).fill({}),
  } })) as typeof fetch;

  const result = await registered.get("export_case_report")!.execute({ caseId: "case-a" }) as any;
  expect(result.ok).toBe(true);
  expect(result.data).not.toHaveProperty("resultId");
  expect(result.data.manifest).toMatchObject({ resultId: expect.any(String), readWith: "read_tool_result" });
  expect(result.data.summary.decisions[0].revisitCriteria).toHaveLength(100);
  expect(JSON.stringify(result).length).toBeLessThan(8_000);
});

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
  await expect(store.selectEvidence("run-a", { kind: "failure", id: "failure-a" })).rejects.toThrow("Offline");
  expect(store.evidenceSelection).toMatchObject({ id: "failure-a", status: "error", error: "Offline" });
  expect(store.failureEvidenceError).toBe("Offline");
  globalThis.fetch = (async () => json({ failure: { id: "failure-a", symbols: ["SPY"], period: { start: "2024-01-02", end: "2024-01-05" } } })) as typeof fetch;
  await store.selectEvidence("run-a", { kind: "failure", id: "failure-a" });
  expect(store.evidenceSelection).toMatchObject({ id: "failure-a", status: "ready", error: null });
  expect(store.evidenceFocus).toMatchObject({ start: "2024-01-02", end: "2024-01-05" });
});

test("bulk enrichment and selected inspection share one realistic failure request", async () => {
  const store = setup();
  let finish!: (response: Response) => void;
  let requests = 0;
  globalThis.fetch = (() => {
    requests += 1;
    if (requests > 1) return Promise.resolve(new Response(JSON.stringify({ error: { message: "Duplicate inspection rejected" } }), { status: 409 }));
    return new Promise<Response>(resolve => { finish = resolve; });
  }) as typeof fetch;

  const enriching = store.enrichFailures();
  const selecting = store.selectEvidence("run-a", { kind: "failure", id: "failure-a" }, "agent");
  const marketBars = Array.from({ length: 250 }, (_, index) => ({
    symbol: "SPY", timestamp: `2024-01-${String((index % 31) + 1).padStart(2, "0")}`,
    open: 100 + index, high: 101 + index, low: 99 + index, close: 100.5 + index, volume: 1_000_000 + index,
  }));
  finish(json({ failure: {
    id: "failure-a", category: "risk_profile", finding: "The final drawdown did not recover before the test ended.",
    period: { start: "2024-01-02", end: "2024-01-05" }, symbols: ["SPY"],
    trades: [{ symbol: "SPY", entryDate: "2024-01-02", exitDate: "2024-01-05", netProfit: -20 }],
    regime: { breakdown: { negative_high_volatility: { trades: 1, netProfit: -20 } } },
    equity: { start: 10_000, end: 9_980, change: -20 }, costs: { commissionBpsPerSide: 1, slippageBpsPerSide: 5, estimatedPeriodCosts: 2.5 },
    indicatorEvidence: { inputs: [{ indicator: "rsi", parameters: { period: 14 } }], values: [], marketBars },
  } }));

  await enriching;
  const selected = await selecting;
  expect(requests).toBe(1);
  expect(selected?.id).toBe("failure-a");
  expect(store.evidenceSelection).toMatchObject({ id: "failure-a", actor: "agent", status: "ready", error: null });
  expect(store.failureEvidenceCache["run-a:failure-a"]?.marketBars).toHaveLength(250);
  expect(store.failureEvidenceError).toBeNull();
  expect(store.failureLoading).toBe(false);
});

test("one aborted failure waiter does not cancel another waiter or report a false global error", async () => {
  const store = setup();
  const firstController = new AbortController();
  let requestSignal: AbortSignal | null = null;
  let finish!: (response: Response) => void;
  let requests = 0;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    requests += 1;
    requestSignal = init?.signal as AbortSignal;
    return new Promise<Response>(resolve => { finish = resolve; });
  }) as typeof fetch;

  const cancelled = store.selectEvidence("run-a", { kind: "failure", id: "failure-a" }, "agent", firstController.signal);
  const surviving = store.selectEvidence("run-a", { kind: "failure", id: "failure-a" });
  firstController.abort(new DOMException("Agent stopped inspecting.", "AbortError"));
  expect(await cancelled).toBeNull();
  expect(requests).toBe(1);
  expect(requestSignal?.aborted).toBe(false);
  expect(store.failureEvidenceError).toBeNull();

  finish(json({ failure: { id: "failure-a", symbols: ["SPY"], period: { start: "2024-01-02", end: "2024-01-05" } } }));
  expect((await surviving)?.id).toBe("failure-a");
  expect(store.evidenceSelection).toMatchObject({ id: "failure-a", actor: "user", status: "ready", error: null });
  expect(store.failureEvidenceCache["run-a:failure-a"]?.id).toBe("failure-a");
  expect(store.failureEvidenceError).toBeNull();
  expect(store.failureLoading).toBe(false);
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
