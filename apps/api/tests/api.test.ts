import { afterEach, describe, expect, test } from "bun:test";
import { SAMPLE_STRATEGY } from "@strategy-court/schemas";
import { ENGINE_VERSION } from "@strategy-court/domain";
import type { ApiApp } from "../src/app";
import { AlpacaMarketProvider, snapshotForDomain } from "../src/providers/market";
import { createTestHarness } from "./test-database";

const harness = createTestHarness();

afterEach(() => harness.cleanup());

function fakeCourt() {
  return Promise.resolve({
    reproducibilityId: "test-reproducibility-id",
    summaryLabel: "Inconclusive",
    result: {
      summaryLabel: "Inconclusive",
      metrics: { initialCapital: 10_000, finalEquity: 10_250, netReturnPercent: 2.5, numberOfTrades: 4 },
      trades: [{ symbol: "AAPL", entryDate: "2024-03-04", exitDate: "2024-03-11", netProfit: -45 }],
      equityCurve: [{ date: "2024-01-02", equity: 10_000 }, { date: "2024-12-30", equity: 10_250 }],
      drawdownCurve: [{ date: "2024-03-11", drawdownPercent: -1.2 }],
      verdicts: [
        { id: "evidence_sufficiency", category: "evidence_sufficiency", status: "Inconclusive" },
        { id: "execution_resilience", category: "execution_resilience", status: "Fail" },
      ],
      failures: [{ id: "execution_resilience", dateRange: { start: "2024-03-01", end: "2024-03-15" }, trades: [] }],
      assumptions: { executeAt: "next_open" },
    },
  });
}

async function request(app: ApiApp, method: string, path: string, input?: unknown, actor = "user") {
  const response = await app.fetch(new Request(`http://api.test${path}`, {
    method,
    headers: { "content-type": "application/json", "x-actor": actor, origin: "http://localhost:5173" },
    body: input === undefined ? undefined : JSON.stringify(input),
  }));
  const result = await response.json() as Record<string, any>;
  return { response, result };
}

async function createConfirmedCase(app: ApiApp) {
  const created = await request(app, "POST", "/api/cases", {
    name: "RSI pullback trial",
    description: "Try to disprove the RSI pullback idea.",
    symbols: SAMPLE_STRATEGY.universe,
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    initialCapital: 10_000,
    costs: { commissionBpsPerSide: 0, slippageBpsPerSide: 5 },
  });
  expect(created.response.status).toBe(201);
  const caseId = created.result.case.id as string;

  const beforeConfirmation = await request(app, "POST", `/api/cases/${caseId}/court-runs`, {});
  expect(beforeConfirmation.response.status).toBe(409);
  expect(beforeConfirmation.result.error.code).toBe("strategy_not_confirmed");

  const draft = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
    definition: SAMPLE_STRATEGY,
    interpretation: "Buy an RSI pullback above the 200-day trend, then use the declared exits.",
  }, "agent");
  expect(draft.response.status).toBe(201);
  expect(draft.result.version.confirmed).toBe(false);

  const agentConfirmation = await request(app, "POST", `/api/cases/${caseId}/strategy-versions/${draft.result.version.id}/confirm`, {}, "agent");
  expect(agentConfirmation.response.status).toBe(403);
  expect(agentConfirmation.result.error.code).toBe("user_confirmation_required");
  const stillDraft = await request(app, "GET", `/api/cases/${caseId}`);
  expect(stillDraft.result.case.versions.find((version: Record<string, unknown>) => version.id === draft.result.version.id)?.confirmed).toBe(false);

  const confirmed = await request(app, "POST", `/api/cases/${caseId}/strategy-versions/${draft.result.version.id}/confirm`, {});
  expect(confirmed.response.status).toBe(200);
  expect(confirmed.result.version.confirmed).toBe(true);
  return { caseId, versionId: draft.result.version.id as string };
}

describe("Strategy Court API integration", () => {
  test("paginates adjusted Alpaca daily bars and records the request", async () => {
    const urls: URL[] = [];
    const pages = [
      { bars: { AAPL: [{ t: "2024-01-02T05:00:00Z", o: 100, h: 103, l: 99, c: 102, v: 1_000 }] }, next_page_token: "page-2" },
      { bars: { AAPL: [{ t: "2024-01-03T05:00:00Z", o: 102, h: 104, l: 101, c: 103, v: 1_100 }] }, next_page_token: null },
    ];
    const fetcher = (async (input: string | URL | Request) => {
      urls.push(new URL(String(input)));
      return Response.json(pages.shift());
    }) as typeof fetch;
    const provider = new AlpacaMarketProvider("key", "secret", "https://data.alpaca.test", "iex", fetcher);
    const snapshot = await provider.getSnapshot({ symbols: ["AAPL"], dateFrom: "2024-01-01", dateTo: "2024-01-03" });

    expect(urls).toHaveLength(2);
    expect(urls[0]?.searchParams.get("timeframe")).toBe("1Day");
    expect(urls[0]?.searchParams.get("adjustment")).toBe("all");
    expect(urls[0]?.searchParams.get("sort")).toBe("asc");
    expect(urls[1]?.searchParams.get("page_token")).toBe("page-2");
    expect(snapshot.bars).toHaveLength(2);
    expect(snapshot.request.adjustment).toBe("all");
    expect(snapshot.feed).toBe("iex");
    expect(snapshot.hash).toHaveLength(64);
  });

  test("records interior missing sessions and rejects incomplete sleeve boundaries", async () => {
    const completeResponse = {
      bars: {
        SPY: [
          { t: "2024-01-02T05:00:00Z", o: 100, h: 101, l: 99, c: 100, v: 1_000 },
          { t: "2024-01-03T05:00:00Z", o: 100, h: 102, l: 99, c: 101, v: 1_100 },
          { t: "2024-01-04T05:00:00Z", o: 101, h: 103, l: 100, c: 102, v: 1_200 },
        ],
        AAPL: [
          { t: "2024-01-02T05:00:00Z", o: 50, h: 51, l: 49, c: 50, v: 900 },
          { t: "2024-01-04T05:00:00Z", o: 51, h: 53, l: 50, c: 52, v: 950 },
        ],
      },
      next_page_token: null,
    };
    const provider = new AlpacaMarketProvider("key", "secret", "https://data.alpaca.test", "iex", (async () => Response.json(completeResponse)) as unknown as typeof fetch);
    const snapshot = await provider.getSnapshot({ symbols: ["AAPL", "SPY"], dateFrom: "2024-01-02", dateTo: "2024-01-04" });
    expect((snapshot.request.sessionCoverage as Record<string, any>).missingBars).toEqual({ AAPL: 1, SPY: 0 });
    expect(snapshotForDomain(snapshot).missingBars).toEqual({ AAPL: 1, SPY: 0 });

    const incomplete = structuredClone(completeResponse);
    incomplete.bars.AAPL = incomplete.bars.AAPL.slice(0, 1);
    const boundaryProvider = new AlpacaMarketProvider("key", "secret", "https://data.alpaca.test", "iex", (async () => Response.json(incomplete)) as unknown as typeof fetch);
    await expect(boundaryProvider.getSnapshot({ symbols: ["AAPL", "SPY"], dateFrom: "2024-01-02", dateTo: "2024-01-04" }))
      .rejects.toMatchObject({ code: "market_boundary_coverage_incomplete" });
  });

  test("executes the shared deterministic Court against frozen fixture data", async () => {
    const app = await harness.app();
    const strategy = { ...structuredClone(SAMPLE_STRATEGY), universe: ["AAPL"] as ["AAPL"] };
    const created = await request(app, "POST", "/api/cases", {
      name: "Shared domain run",
      symbols: ["AAPL"],
      dateFrom: "2022-01-01",
      dateTo: "2024-12-31",
      initialCapital: 10_000,
      slippageBps: 17,
    });
    const caseId = created.result.case.id as string;
    const draft = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
      definition: strategy,
      interpretation: "RSI pullback on AAPL with next-open execution.",
    });
    const versionId = draft.result.version.id as string;
    await request(app, "POST", `/api/cases/${caseId}/strategy-versions/${versionId}/confirm`, {});

    const first = await request(app, "POST", `/api/cases/${caseId}/court-runs`, { strategyVersionId: versionId, dataSnapshotPolicy: "frozen" });
    const second = await request(app, "POST", `/api/cases/${caseId}/court-runs`, { strategyVersionId: versionId, dataSnapshotPolicy: "frozen" });
    await app.queue.idle();
    const firstRun = (await request(app, "GET", `/api/court-runs/${first.result.run.id}`)).result.run;
    const secondRun = (await request(app, "GET", `/api/court-runs/${second.result.run.id}`)).result.run;

    expect(firstRun.status).toBe("completed");
    expect(firstRun.engineVersion).toBe(ENGINE_VERSION);
    expect(firstRun.result.engineVersion).toBe(ENGINE_VERSION);
    expect(firstRun.result.verdicts).toHaveLength(7);
    expect(firstRun.result.baseline.metrics.initialCapital).toBe(10_000);
    expect(firstRun.result.assumptions.executionTiming).toBe("next_open");
    expect(firstRun.result.assumptions.slippageBpsPerSide).toBe(strategy.costs.slippageBpsPerSide);
    const storedSnapshot = (await app.store.getSnapshot(firstRun.dataSnapshotId))!;
    expect(storedSnapshot.symbols).toContain("SPY");
    const benchmarkCurve = firstRun.result.equityCurve as Array<{ date: string; benchmark?: number }>;
    const spyBars = storedSnapshot.bars.filter((bar) => bar.symbol === "SPY").sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const firstBenchmarkDate = benchmarkCurve.find((point) => point.benchmark !== undefined)!.date;
    const lastBenchmarkPoint = [...benchmarkCurve].reverse().find((point) => point.benchmark !== undefined)!;
    const lastBenchmarkDate = lastBenchmarkPoint.date;
    const firstSpyClose = spyBars.filter((bar) => bar.timestamp.slice(0, 10) <= firstBenchmarkDate.slice(0, 10)).at(-1)!.close;
    const lastSpyClose = spyBars.filter((bar) => bar.timestamp.slice(0, 10) <= lastBenchmarkDate.slice(0, 10)).at(-1)!.close;
    expect(benchmarkCurve.find((point) => point.benchmark !== undefined)!.benchmark).toBe(10_000);
    expect(lastBenchmarkPoint.benchmark).toBeCloseTo(10_000 * lastSpyClose / firstSpyClose, 2);
    expect(firstRun.reproducibilityId).toBe(secondRun.reproducibilityId);
  });

  test("runs the complete case, evidence, variants, comparison, replay, audit, and report flow", async () => {
    const app = await harness.app({ courtExecutor: fakeCourt });
    const { caseId, versionId } = await createConfirmedCase(app);

    const started = await request(app, "POST", `/api/cases/${caseId}/court-runs`, {
      strategyVersionId: versionId,
      courtProfile: "balanced",
      dataSnapshotPolicy: "frozen",
    }, "agent");
    expect(started.response.status).toBe(202);
    await app.queue.idle();

    const completed = await request(app, "GET", `/api/court-runs/${started.result.run.id}`);
    expect(completed.result.run.status).toBe("completed");
    expect(completed.result.run.progress.percent).toBe(100);
    expect(completed.result.run.reproducibilityId).toBe("test-reproducibility-id");

    const failure = await request(app, "GET", `/api/court-runs/${started.result.run.id}/failures/execution_resilience`);
    expect(failure.response.status).toBe(200);
    expect(failure.result.failure.id).toBe("execution_resilience");

    const variants = await request(app, "POST", `/api/cases/${caseId}/variants`, {
      parentVersionId: versionId,
      variants: [4, 6, 7].map((stopLossPercent) => ({
        name: `Stop ${stopLossPercent}`,
        hypothesis: `A ${stopLossPercent}% stop may reduce tail loss`,
        rationale: "Change one risk parameter and preserve every other assumption.",
        expectedWeaknessAddressed: "drawdown",
        patch: { risk: { stopLossPercent } },
      })),
    }, "agent");
    expect(variants.response.status).toBe(202);
    expect(variants.result.versions).toHaveLength(3);
    await app.queue.idle();

    const fourth = await request(app, "POST", `/api/cases/${caseId}/variants`, {
      parentVersionId: versionId,
      name: "Forbidden fourth",
      hypothesis: "The limit should hold",
      rationale: "This must be rejected.",
      expectedWeaknessAddressed: "drawdown",
      patch: { risk: { stopLossPercent: 8 } },
    }, "agent");
    expect(fourth.response.status).toBe(422);
    expect(fourth.result.error.code).toBe("variant_limit_exceeded");

    const comparison = await request(app, "GET", `/api/cases/${caseId}/comparison`);
    expect(comparison.result.comparison.rows).toHaveLength(4);
    expect(comparison.result.comparison.rows[1].evaluationInformed).toBe(true);
    expect(comparison.result.comparison.rows[1].diffs.length).toBeGreaterThan(0);

    const replayStarted = await request(app, "POST", `/api/cases/${caseId}/replay`, {
      strategyVersionId: versionId,
      runId: started.result.run.id,
      reservedFrom: "2025-01-01",
      reservedTo: "2025-12-31",
    });
    expect(replayStarted.response.status).toBe(201);
    const replayId = replayStarted.result.replay.id as string;

    const advanced = await request(app, "POST", `/api/replay/${replayId}/advance`, { command: "five_bars" });
    expect(advanced.response.status).toBe(200);
    expect(advanced.result.replay.cursor).toBe(4);
    expect(advanced.result.replay.state.currentDate).toBeTruthy();

    const status = await request(app, "GET", `/api/replay/${replayId}/status`);
    expect(status.result.monitoring.latestEvaluatedBar).toBeTruthy();

    const report = await request(app, "GET", `/api/reports/${started.result.run.id}`);
    expect(report.response.status).toBe(200);
    expect(report.result.report.trades).toHaveLength(1);
    expect(report.result.report.limitation).toContain("do not predict");

    const context = await request(app, "GET", `/api/cases/${caseId}`);
    expect(context.result.case.versions).toHaveLength(4);
    expect(context.result.case.runs).toHaveLength(4);
    expect(context.result.case.replays).toHaveLength(1);
    expect(context.result.case.audit.some((event: Record<string, unknown>) => event.actor === "agent" && event.action === "court.queued")).toBe(true);
    expect(context.result.case.audit.some((event: Record<string, unknown>) => event.actor === "system" && event.action === "court.completed")).toBe(true);
  });

  test("uses consistent JSON errors and allowlisted CORS", async () => {
    const app = await harness.app({ courtExecutor: fakeCourt });
    const invalid = await request(app, "POST", "/api/cases", { name: "Bad", symbols: ["BTC"], dateFrom: "2024-01-01", dateTo: "2024-02-01" });
    expect(invalid.response.status).toBe(422);
    expect(invalid.result).toEqual({
      error: expect.objectContaining({ code: "validation_error", message: expect.any(String) }),
    });
    expect(invalid.response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const missing = await request(app, "GET", "/api/does-not-exist");
    expect(missing.response.status).toBe(404);
    expect(missing.result.error.code).toBe("route_not_found");
  });

  test("requires authentication and isolates cases by owner", async () => {
    const database = await harness.createDatabase();
    const owner = await harness.app({ courtExecutor: fakeCourt }, database);
    const { caseId } = await createConfirmedCase(owner);
    const otherUser = await harness.app({
      courtExecutor: fakeCourt,
      resolveSession: async () => ({ user: { id: "other-user", email: "other@example.test", name: "Other trader" } }),
    }, database);
    const hidden = await request(otherUser, "GET", `/api/cases/${caseId}`);
    expect(hidden.response.status).toBe(404);
    expect((await request(otherUser, "GET", "/api/cases")).result.cases).toEqual([]);

    const anonymous = await harness.app({ courtExecutor: fakeCourt, resolveSession: async () => null }, database);
    const unauthorized = await request(anonymous, "GET", `/api/cases/${caseId}`);
    expect(unauthorized.response.status).toBe(401);
    expect(unauthorized.result.error.code).toBe("authentication_required");
  });

  test("persists case state across app restarts", async () => {
    const database = await harness.createDatabase();
    const first = await harness.app({ courtExecutor: fakeCourt }, database);
    const { caseId } = await createConfirmedCase(first);
    await harness.closeApp(first);

    const second = await harness.app({ courtExecutor: fakeCourt }, database);
    const loaded = await request(second, "GET", `/api/cases/${caseId}`);
    expect(loaded.response.status).toBe(200);
    expect(loaded.result.case.versions).toHaveLength(1);
    expect(loaded.result.case.audit.length).toBeGreaterThanOrEqual(3);
  });
});
