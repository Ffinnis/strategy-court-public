import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { apiRequest } from "../src/services/api";
import { createPinia, setActivePinia } from "pinia";
import { normalizeCase, normalizeFailure, normalizeMonitoringResponse, normalizeRun, useCourtStore } from "../src/stores/court";
import { transformAgentFormula, useWebMcp, webMcpSchemaContract } from "../src/webmcp/useWebMcp";
import { trappedFocusTarget } from "../src/services/focusTrap";
import { EXECUTABLE_INDICATOR_IDS, safeParseStrategyDefinition } from "@strategy-court/schemas";
import { ref } from "vue";

const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
});

describe("connected-state integrity", () => {
  test("an incomplete completed run remains unusable", () => {
    const run = normalizeRun({ id: "r1", versionId: "v1", status: "completed", progress: 100, result: { summaryLabel: "Surviving", metrics: {} } } as never);
    expect(run.result).toBeUndefined();
    expect(run.error).toContain("did not include a usable result");
  });

  test("an invalid run is a usable terminal outcome without invented metrics", () => {
    const run = normalizeRun({
      id: "r-invalid",
      versionId: "v1",
      status: "invalid",
      progress: 100,
      result: {
        summaryLabel: "Invalid",
        invalidReason: { code: "insufficient_history", message: "The snapshot does not contain enough warm-up bars." },
        verdicts: [],
        failures: [],
        limitation: "No historical result was produced.",
      },
    } as never);
    expect(run.error).toBeUndefined();
    expect(run.result?.summaryLabel).toBe("Invalid");
    expect(run.result?.metrics).toEqual([]);
    expect(run.result?.equityCurve).toEqual([]);
    expect(run.result?.invalidReason).toMatchObject({ code: "insufficient_history", message: "The snapshot does not contain enough warm-up bars." });

    setActivePinia(createPinia());
    const store = useCourtStore();
    store.currentCase = normalizeCase({ id: "c1", name: "Invalid case", versions: [{ id: "v1", confirmed: true, definition: {}, interpretation: "Test" }], activeVersionId: "v1", runs: [{ ...run, strategyVersionId: "v1" }], replays: [], audit: [] });
    expect(store.courtComplete).toBe(true);
    expect(store.courtInvalid).toBe(true);
  });

  test("drawdown normalization always plots below the equity baseline", () => {
    const run = normalizeRun({
      id: "r1", versionId: "v1", status: "completed", progress: 100,
      result: {
        summaryLabel: "Surviving",
        metrics: { netReturnPercent: 4.2 },
        verdicts: [{ id: "risk", category: "risk", status: "Pass" }],
        equityCurve: [{ date: "2024-01-02", equity: 10_000 }],
        drawdownCurve: [
          { date: "2024-01-03", drawdownPercent: 3.4 },
          { date: "2024-01-04", value: -1.2 },
        ],
      },
    } as never);
    expect(run.result?.drawdownCurve.map((point) => point.value)).toEqual([-3.4, -1.2]);
  });

  test("case normalization preserves API newest-first run and replay order", () => {
    const courtCase = normalizeCase({ id: "c1", name: "Case", versions: [], runs: [{ id: "new", status: "failed" }, { id: "old", status: "failed" }], replays: [{ id: "new-replay" }, { id: "old-replay" }], audit: [] });
    expect(courtCase.runs.map((item) => item.id)).toEqual(["new", "old"]);
    expect(courtCase.replays.map((item) => item.id)).toEqual(["new-replay", "old-replay"]);
  });

  test("viewing a variant does not change the server-confirmed variant parent", () => {
    setActivePinia(createPinia());
    const store = useCourtStore();
    store.currentCase = normalizeCase({
      id: "c1", name: "Trend", activeVersionId: "baseline", runs: [], replays: [], audit: [],
      versions: [
        { id: "baseline", confirmed: true, definition: {}, interpretation: "Baseline" },
        { id: "variant", parentVersionId: "baseline", definition: {}, interpretation: "Variant" },
      ],
    });
    store.selectVersion("variant");

    expect(store.activeVersion?.id).toBe("variant");
    expect(store.variantParentVersion?.id).toBe("baseline");
    expect(store.currentCase.activeVersionId).toBe("baseline");
  });

  test("variant creation sends the server-confirmed parent after viewing a child", async () => {
    setActivePinia(createPinia());
    const store = useCourtStore();
    const result = {
      summaryLabel: "Surviving",
      metrics: { netReturnPercent: 4.2 },
      verdicts: [{ id: "risk", category: "risk", status: "Pass" }],
      failures: [],
    };
    const casePayload = {
      id: "c1", name: "Trend", activeVersionId: "baseline", replays: [], audit: [],
      versions: [
        { id: "baseline", confirmed: true, definition: {}, interpretation: "Baseline" },
        { id: "viewed", parentVersionId: "baseline", definition: {}, interpretation: "Viewed" },
      ],
      runs: [{ id: "baseline-run", strategyVersionId: "baseline", status: "completed", progress: 100, result }],
    };
    store.currentCase = normalizeCase(casePayload);
    store.selectVersion("viewed");
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({
          versions: [{ id: "created" }],
          runs: [{ id: "created-run", strategyVersionId: "created", status: "completed", progress: 100, result }],
        }), { status: 202, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/comparison")) {
        return new Response(JSON.stringify({ comparison: { caseId: "c1", versions: [] } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ case: casePayload }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const created = await store.createVariants([{
      name: "Shorter hold", hypothesis: "Reduce tail risk", rationale: "One controlled change",
      expectedWeaknessAddressed: "Risk", patch: { risk: { maxHoldingDays: 60 } },
    }]);

    expect(created).toEqual(["created"]);
    expect(bodies[0]?.parentVersionId).toBe("baseline");
    expect(store.currentCase?.activeVersionId).toBe("baseline");
  });

  test("replay normalization keeps cumulative trades and historical comparisons", () => {
    const courtCase = normalizeCase({
      id: "c1", name: "Case", versions: [], runs: [], audit: [], replays: [{
        id: "replay-1", strategyVersionId: "v1", reservedFrom: "2025-01-02", reservedTo: "2025-12-31",
        state: {
          cursor: 19, totalBars: 100, observedTradingDays: 20, baselineTradingDays: 200,
          currentDate: "2025-01-31", metrics: { numberOfTrades: 2, winRatePercent: 50, expectancyPerTrade: -5 },
          baselineMetrics: { numberOfTrades: 10, winRatePercent: 60, expectancyPerTrade: 12 },
          trades: [{ symbol: "SPY", entryDate: "2025-01-02", exitDate: "2025-01-10", netProfit: 8 }],
          newTrades: [{ symbol: "SPY", entryDate: "2025-01-02", exitDate: "2025-01-10", netProfit: 8 }],
        },
      }],
    });
    expect(courtCase.replays[0]?.trades).toHaveLength(1);
    expect(courtCase.replays[0]?.newTrades[0]?.symbol).toBe("SPY");
    expect(courtCase.replays[0]?.comparisons).toEqual([
      { label: "Trade frequency", historical: "5.0 per 100 bars", observed: "10.0 per 100 bars" },
      { label: "Win rate", historical: "60.0%", observed: "50.0%" },
      { label: "Average trade", historical: "+$12", observed: "−$5" },
    ]);
  });

  test("latest-bar monitoring normalization preserves the complete evaluation contract", () => {
    const response = normalizeMonitoringResponse({
      monitoring: {
        strategyVersionId: "v1", snapshotId: "snapshot-1", snapshotFetchedAt: "2026-08-28T12:00:00.000Z",
        evaluatedDate: "2026-08-27", currentRegime: "positive_low_volatility",
        signals: [{ symbol: "SPY", completedBarDate: "2026-08-27", close: 649.2, entry: true, exit: false }],
        positions: [{ symbol: "SPY", entryDate: "2026-08-20", entryPrice: 640, quantity: 10, barsHeld: 5, markedPrice: 649.2, unrealizedProfit: 92 }],
        metrics: { netReturnPercent: 4.2, maximumDrawdownPercent: 3.1, numberOfTrades: 8, profitFactor: 1.4 },
        changes: [{ type: "entry_signal_activated", symbol: "SPY", before: false, after: true }],
        warnings: ["Signals are evaluated observations."],
      },
      evaluation: { id: "evaluation-1", caseId: "c1", strategyVersionId: "v1", dataSnapshotId: "snapshot-1", evaluatedDate: "2026-08-27", createdAt: "2026-08-28T12:00:01.000Z" },
    });
    expect(response.monitoring).toMatchObject({
      status: "evaluated", strategyVersionId: "v1", evaluatedDate: "2026-08-27", currentRegime: "Positive low volatility",
      signals: [{ symbol: "SPY", entry: true, exit: false }], positions: [{ symbol: "SPY", unrealizedProfit: 92 }],
      changes: [{ type: "entry_signal_activated", symbol: "SPY" }],
    });
    expect(response.monitoring.metricCards.map((item) => item.label)).toEqual(["Net return", "Max drawdown", "Profit factor", "Completed trades", "Expectancy"]);
    expect(response.evaluation?.dataSnapshotId).toBe("snapshot-1");
  });

  test("latest-bar store action keeps replay separate and recovers after an API error", async () => {
    setActivePinia(createPinia());
    const store = useCourtStore();
    store.currentCase = normalizeCase({
      id: "c1", name: "Trend", symbols: ["SPY"], startDate: "2020-01-02", endDate: "2024-12-31", initialCapital: 10_000,
      activeVersionId: "v1", versions: [{ id: "v1", confirmed: true, definition: {}, interpretation: "Confirmed" }],
      runs: [], replays: [{ id: "replay-1", strategyVersionId: "v1", state: { currentDate: "2025-02-03", totalBars: 20, cursor: 1 } }], audit: [],
    });
    const requests: Array<{ path: string; method: string; actor: string }> = [];
    let refreshAttempts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      requests.push({ path, method: init?.method ?? "GET", actor: new Headers(init?.headers).get("X-Actor") ?? "" });
      if (init?.method === "POST" && refreshAttempts++ === 0) {
        return new Response(JSON.stringify({ error: { code: "market_unavailable", message: "Market feed unavailable" } }), { status: 503, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        monitoring: {
          strategyVersionId: "v1", snapshotId: "snapshot-1", snapshotFetchedAt: "2026-08-28T12:00:00.000Z",
          evaluatedDate: "2026-08-27", currentRegime: "negative_high_volatility",
          signals: [{ symbol: "SPY", completedBarDate: "2026-08-27", close: 645, entry: false, exit: true }],
          positions: [], metrics: { netReturnPercent: 1, maximumDrawdownPercent: 2, numberOfTrades: 3 }, changes: [], warnings: [],
        },
        evaluation: { id: "evaluation-1", caseId: "c1", strategyVersionId: "v1", dataSnapshotId: "snapshot-1", evaluatedDate: "2026-08-27", createdAt: "2026-08-28T12:00:01.000Z" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    expect(await store.loadMonitoringStatus("v1", { actor: "agent" })).not.toBeNull();
    expect(requests[0]).toMatchObject({ method: "GET", actor: "agent" });
    expect(requests[0]?.path).toContain("/api/cases/c1/monitoring?strategyVersionId=v1");
    expect(store.replay?.id).toBe("replay-1");
    const successfulAt = store.monitoringLastSuccessAt;

    expect(await store.loadMonitoringStatus("v1", { refresh: true, actor: "user" })).toBeNull();
    expect(store.monitoringError).toBe("Market feed unavailable");
    expect(store.monitoringStatus?.evaluatedDate).toBe("2026-08-27");
    expect(store.monitoringLastSuccessAt).toBe(successfulAt);
    expect(store.monitoringLoading).toBe(false);
    expect(store.monitoringOperation).toBeNull();

    expect(await store.loadMonitoringStatus("v1", { refresh: true, actor: "user" })).not.toBeNull();
    expect(requests.at(-1)).toMatchObject({ method: "POST", actor: "user" });
    expect(store.monitoringError).toBeNull();
    expect(store.replay?.id).toBe("replay-1");
  });

  test("real WebMCP registration is progressive, strict, and keeps monitoring status read-only during probation", async () => {
    setActivePinia(createPinia());
    const store = useCourtStore();
    const casePayload = {
      id: "c1", name: "Trend", symbols: ["SPY"], startDate: "2020-01-02", endDate: "2024-12-31", initialCapital: 10_000,
      activeVersionId: "v1", versions: [{ id: "v1", confirmed: false, confirmedAt: null as string | null, definition: {}, interpretation: "Draft" }], runs: [], replays: [], audit: [],
    };
    store.currentCase = normalizeCase(casePayload);
    const registered = new Map<string, ModelContextTool>();
    const context = {
      registerTool: async (tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
        registered.set(tool.name, tool);
        options?.signal?.addEventListener("abort", () => registered.delete(tool.name), { once: true });
      },
    } as ModelContext;
    Object.defineProperty(globalThis, "document", { configurable: true, value: { modelContext: context } });
    const enabled = ref(true);
    useWebMcp(enabled);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...registered.keys()].sort()).toEqual(["create_custom_indicator", "create_strategy_draft", "get_case_context", "list_indicator_catalog"]);
    expect(registered.has("get_monitoring_status")).toBe(false);

    store.currentCase.versions[0]!.confirmed = true;
    store.currentCase.versions[0]!.confirmedAt = "2026-08-28T10:00:00.000Z";
    casePayload.versions[0]!.confirmed = true;
    casePayload.versions[0]!.confirmedAt = "2026-08-28T10:00:00.000Z";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(registered.has("get_monitoring_status")).toBe(false);
    expect(registered.has("create_strategy_draft")).toBe(false);
    expect(registered.has("run_court")).toBe(true);
    const runCourtSchema = registered.get("run_court")!.inputSchema as { required: string[]; properties: Record<string, { default?: unknown }> };
    expect(runCourtSchema.required).not.toContain("dataSnapshotPolicy");
    expect(runCourtSchema.properties.dataSnapshotPolicy?.default).toBe("refresh");

    const assertClosed = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      const schema = value as Record<string, unknown>;
      if (schema.type === "object") expect(schema.additionalProperties).toBe(false);
      Object.values(schema).forEach(assertClosed);
    };
    [...registered.values()].forEach((registeredTool) => assertClosed(registeredTool.inputSchema));

    const requests: Array<{ path: string; method: string; actor: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      requests.push({ path, method, actor: new Headers(init?.headers).get("X-Actor") ?? "", body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {} });
      if (path.endsWith("/api/indicators")) {
        return new Response(JSON.stringify({ indicators: [{ id: "sma", name: "Simple moving average", parameters: [] }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/api/cases/c1")) {
        return new Response(JSON.stringify({ case: casePayload }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/api/replay/replay-1/status")) {
        return new Response(JSON.stringify({ replay: { id: "replay-1", state: { currentDate: "2025-01-03" } } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        monitoring: {
          strategyVersionId: "v1", snapshotId: "snapshot-2", snapshotFetchedAt: "2026-08-28T13:00:00.000Z",
          evaluatedDate: "2026-08-27", currentRegime: "positive_low_volatility",
          signals: [{ symbol: "SPY", completedBarDate: "2026-08-27", close: 650, entry: true, exit: false }],
          positions: [], metrics: { netReturnPercent: 2, maximumDrawdownPercent: 1, numberOfTrades: 4 }, changes: [], warnings: [],
        },
        evaluation: { id: "evaluation-2", caseId: "c1", strategyVersionId: "v1", dataSnapshotId: "snapshot-2", evaluatedDate: "2026-08-27", createdAt: "2026-08-28T13:00:01.000Z" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const catalogResponse = await registered.get("list_indicator_catalog")!.execute({}) as Record<string, unknown>;
    expect((catalogResponse.data as Record<string, unknown>).indicators).toHaveLength(1);
    const contextResponse = await registered.get("get_case_context")!.execute({ caseId: "c1" }) as Record<string, unknown>;
    expect((contextResponse.currentState as Record<string, unknown>).confirmed).toBe(true);
    store.currentCase!.runs.unshift(normalizeRun({
      id: "run-1", strategyVersionId: "v1", status: "completed", progress: 100,
      result: { summaryLabel: "Surviving", metrics: { netReturnPercent: 2 }, verdicts: [{ id: "risk", category: "risk", status: "Pass" }] },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const expected of ["inspect_failure_period", "create_strategy_variants", "compare_strategy_versions", "start_replay_probation", "export_case_report"]) {
      expect(registered.has(expected)).toBe(true);
    }
    expect(new TextEncoder().encode(JSON.stringify([...registered.values()])).byteLength).toBeLessThan(65_536);

    store.currentCase!.replays.unshift({
      id: "replay-1", versionId: "v1", status: "active", currentDate: "2025-01-03", startDate: "2025-01-02", endDate: "2025-12-31",
      progress: 1, regime: "Unknown", metrics: [], comparisons: [], signals: [], positions: [], trades: [], newTrades: [], warnings: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(new TextEncoder().encode(JSON.stringify([...registered.values()])).byteLength).toBeLessThan(65_536);
    const tool = registered.get("get_monitoring_status");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema).toMatchObject({
      type: "object", additionalProperties: false, required: ["caseId", "strategyVersionId"],
      properties: { caseId: { minLength: 1, maxLength: 100 }, strategyVersionId: { minLength: 1, maxLength: 100 } },
    });
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    const response = await tool!.execute({ caseId: "c1", strategyVersionId: "v1" }) as Record<string, unknown>;
    expect(requests.slice(-2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: expect.stringContaining("/api/replay/replay-1/status"), method: "GET", actor: "agent" }),
      expect.objectContaining({ path: expect.stringContaining("/api/cases/c1/monitoring?strategyVersionId=v1"), method: "GET", actor: "agent" }),
    ]));
    expect(Object.keys(response).sort()).toEqual(["changedIds", "currentState", "data", "message", "ok"]);
    expect(response.changedIds).toEqual([]);
    expect(((response.data as Record<string, unknown>).latestBar as Record<string, unknown>).monitoring).toMatchObject({ status: "evaluated", strategyVersionId: "v1", evaluatedDate: "2026-08-27" });
    expect(store.monitoringEvaluation?.id).toBe("evaluation-2");
    expect(store.replay?.id).toBe("replay-1");

    const probationSource = readFileSync(new URL("../src/components/tabs/ProbationTab.vue", import.meta.url), "utf8");
    expect(probationSource).toContain("store.loadMonitoringStatus(store.monitoringCandidate?.id, { refresh: true })");
    enabled.value = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test("failure normalization preserves enriched endpoint evidence", () => {
    const failure = normalizeFailure({
      id: "risk_profile", period: { start: "2024-02-01", end: "2024-03-01" }, finding: "Returned explanation",
      costs: { commissionBpsPerSide: 0, slippageBpsPerSide: 5, estimatedPeriodCosts: 12.75 },
      regime: { breakdown: { negative_high_volatility: { trades: 3, netProfit: -40 } }, evidence: { sample: true } },
      equity: { start: 10_000, end: 9_900, change: -100 }, trades: [{ symbol: "SPY", entryDate: "2024-02-02", exitDate: "2024-02-09", costs: 4 }],
      indicatorEvidence: { inputs: [{ indicator: "rsi", parameters: { period: 14 } }], values: [{ symbol: "SPY", indicator: "rsi", values: [{ date: "2024-02-02", value: 31 }] }], marketBars: [{ symbol: "SPY", timestamp: "2024-02-02" }] },
      explanationInputs: { drawdown: 10 },
    }, 0);
    expect(failure.period).toBe("2024-02-01 to 2024-03-01");
    expect(failure.costs).toEqual({ commissionBpsPerSide: 0, slippageBpsPerSide: 5, estimatedPeriodCosts: 12.75 });
    expect(failure.indicatorValues).toHaveLength(1);
    expect(failure.marketBars).toHaveLength(1);
    expect(failure.regime).toContain("3 trades");
    expect(failure.summary).toBe("Returned explanation");
  });

  test("UI and agent requests carry explicit actor headers", async () => {
    const actors: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { actors.push(new Headers(init?.headers).get("X-Actor") ?? ""); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }); }) as typeof fetch;
    await apiRequest("/api/test");
    await apiRequest("/api/test", {}, "agent");
    expect(actors).toEqual(["user", "agent"]);
  });

  test("custom indicator and strategy unions use closed object branches", () => {
    const walk = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      if (node.type === "object") expect(node.additionalProperties).toBe(false);
      Object.values(node).forEach(walk);
    };
    walk(webMcpSchemaContract);
    const formulaBranches = webMcpSchemaContract.formula.oneOf as Array<Record<string, unknown>>;
    expect(formulaBranches).toHaveLength(11);
    const indicatorBranch = formulaBranches.find((branch) => "indicator" in ((branch.properties ?? {}) as Record<string, unknown>));
    const indicatorIdBranches = ((indicatorBranch?.properties as Record<string, Record<string, unknown>>).indicator.oneOf as Array<Record<string, unknown>>);
    expect(indicatorIdBranches[0]?.enum).toEqual([...EXECUTABLE_INDICATOR_IDS]);
    expect((webMcpSchemaContract.condition.oneOf as unknown[]).length).toBe(5);
    const definition = webMcpSchemaContract.definition as Record<string, unknown>;
    const properties = definition.properties as Record<string, Record<string, unknown>>;
    expect(properties.universe.maxItems).toBe(5);
    expect((properties.costs.required as string[]).sort()).toEqual(["commissionBpsPerSide", "slippageBpsPerSide"]);
    expect(((properties.risk.properties as Record<string, Record<string, unknown>>).takeProfitPercent).maximum).toBe(100);
    expect(webMcpSchemaContract.indicatorDependencies).toMatchObject({
      type: "array",
      maxItems: 20,
      uniqueItems: true,
      description: "All built-in or owner-scoped custom indicator IDs referenced anywhere in the formula.",
    });
  });

  test("manual draft creation never substitutes the sample strategy", async () => {
    setActivePinia(createPinia());
    const store = useCourtStore();
    store.currentCase = normalizeCase({ id: "c1", name: "SMA strategy", description: "Buy above the 120-day SMA and sell below it.", symbols: ["SPY"], startDate: "2020-01-02", endDate: "2024-12-31", initialCapital: 10_000, versions: [], runs: [], replays: [], audit: [] });
    expect(await store.createDraft()).toBe(false);
    expect(store.currentCase.versions).toHaveLength(0);
    expect(store.error).toContain("Set the entry and exit rules");
  });

  test("the owner workspace keeps the persistent summary and full run evidence inspectable", () => {
    const header = readFileSync(new URL("../src/components/VerdictHeader.vue", import.meta.url), "utf8");
    const court = readFileSync(new URL("../src/components/tabs/CourtTab.vue", import.meta.url), "utf8");
    const probation = readFileSync(new URL("../src/components/tabs/ProbationTab.vue", import.meta.url), "utf8");
    const indicatorBuilder = readFileSync(new URL("../src/pages/IndicatorCatalogPage.vue", import.meta.url), "utf8");
    expect(header).toContain('<div class="verdict-header__result">');
    expect(header).toContain("Current version {{ store.activeVersion?.evaluationInformed");
    for (const field of ["verdict.threshold", "rawMetrics", "outOfSampleMetrics", "stressedCostMetrics", "parameterTrials", "dataWarnings"]) expect(court).toContain(field);
    for (const field of ["store.replay.comparisons", "store.replay.trades", "Completed probation trades"]) expect(probation).toContain(field);
    expect(indicatorBuilder).toContain("activeParameters");
    expect(indicatorBuilder).toContain("parameter.options");
  });

  test("focus trap enters and wraps in both directions", () => {
    const items = ["first", "last"];
    expect(trappedFocusTarget("dialog", "dialog", items, false)).toBe("first");
    expect(trappedFocusTarget("dialog", "dialog", items, true)).toBe("last");
    expect(trappedFocusTarget("last", "dialog", items, false)).toBe("first");
    expect(trappedFocusTarget("first", "dialog", items, true)).toBe("last");
  });

  test("custom dependency arguments are closed, bounded, transformed, and duplicate-safe", () => {
    const formulaBranches = webMcpSchemaContract.formula.oneOf as Array<Record<string, unknown>>;
    const customBranch = formulaBranches.find((branch) => "arguments" in ((branch.properties ?? {}) as Record<string, unknown>));
    const constantBranch = formulaBranches.find((branch) => "constant" in ((branch.properties ?? {}) as Record<string, unknown>));
    const argumentItems = (((customBranch?.properties as Record<string, unknown>).arguments as Record<string, unknown>).items as Record<string, unknown>);
    expect(argumentItems.additionalProperties).toBe(false);
    expect(((constantBranch?.properties as Record<string, Record<string, unknown>>).constant).minimum).toBe(-1e12);
    expect(((constantBranch?.properties as Record<string, Record<string, unknown>>).constant).maximum).toBe(1e12);
    const strategyBranches = webMcpSchemaContract.valueExpression.oneOf as Array<Record<string, unknown>>;
    const customStrategyBranch = strategyBranches.find((branch) => "arguments" in ((branch.properties ?? {}) as Record<string, unknown>));
    const strategyIndicatorBranches = ((customStrategyBranch?.properties as Record<string, Record<string, unknown>>).indicator.oneOf as Array<Record<string, unknown>>);
    expect(strategyIndicatorBranches[0]?.enum).toEqual([...EXECUTABLE_INDICATOR_IDS]);
    expect(strategyIndicatorBranches[1]?.pattern).toContain("[0-9a-fA-F]{8}");
    const conditionBranches = webMcpSchemaContract.condition.oneOf as Array<Record<string, unknown>>;
    const customConditionBranch = conditionBranches.find((branch) => "arguments" in ((branch.properties ?? {}) as Record<string, unknown>));
    expect(((customConditionBranch?.properties as Record<string, Record<string, unknown>>).indicator).pattern).toContain("[0-9a-fA-F]{8}");
    expect(transformAgentFormula({ operation: "add", left: { indicator: "stored-custom", arguments: [{ name: "lookback", value: 21 }, { name: "filter", value: { source: "close" } }] }, right: { constant: 1 } })).toEqual({ operation: "add", left: { indicator: "stored-custom", parameters: { lookback: 21, filter: { source: "close" } } }, right: { constant: 1 } });
    expect(transformAgentFormula([{ structuredPatch: { entry: { indicator: "stored-boolean", arguments: [{ name: "threshold", value: 30 }] } } }])).toEqual([
      { structuredPatch: { entry: { indicator: "stored-boolean", parameters: { threshold: 30 } } } },
    ]);
    expect(() => transformAgentFormula({ indicator: "stored-custom", arguments: [{ name: "period", value: 10 }, { name: "period", value: 20 }] })).toThrow("Duplicate indicator argument period");
  });

  test("compound SMA and percentage-change rules survive the compact WebMCP transform", () => {
    const definition = transformAgentFormula({
      name: "QQQ long-term dislocation",
      universe: ["QQQ"],
      timeframe: "1d",
      direction: "long",
      entry: {
        any: [
          { left: { source: "close" }, operator: "gt", right: { indicator: "sma", arguments: [{ name: "period", value: 120 }, { name: "source", value: "close" }] } },
          { left: { indicator: "percentage_change", arguments: [{ name: "period", value: 30 }, { name: "source", value: "close" }] }, operator: "lt", right: { constant: -30 } },
        ],
      },
      exit: {
        any: [
          { left: { source: "close" }, operator: "lt", right: { indicator: "sma", arguments: [{ name: "period", value: 120 }, { name: "source", value: "close" }] } },
          { left: { indicator: "percentage_change", arguments: [{ name: "period", value: 30 }, { name: "source", value: "close" }] }, operator: "gt", right: { constant: 30 } },
        ],
      },
      execution: { signalAt: "close", executeAt: "next_open", orderType: "market" },
      risk: {},
      costs: { commissionBpsPerSide: 0, slippageBpsPerSide: 5 },
    });
    expect(safeParseStrategyDefinition(definition)).toMatchObject({ success: true });
    expect(definition).toMatchObject({
      entry: { any: [{}, { left: { indicator: "percentage_change", parameters: { period: 30, source: "close" } } }] },
      exit: { any: [{}, { left: { indicator: "percentage_change", parameters: { period: 30, source: "close" } } }] },
    });
  });
});
