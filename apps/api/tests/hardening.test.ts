import { afterEach, describe, expect, test } from "bun:test";
import { ENGINE_VERSION } from "@strategy-court/domain";
import { SAMPLE_STRATEGY } from "@strategy-court/schemas";
import type { ApiApp } from "../src/app";
import { AlpacaMarketProvider, FixtureMarketProvider } from "../src/providers/market";
import { createTestHarness, TEST_USER_ID } from "./test-database";

const harness = createTestHarness();

afterEach(() => harness.cleanup());

const strategy = { ...structuredClone(SAMPLE_STRATEGY), universe: ["AAPL"] as ["AAPL"] };

function courtResult() {
  return Promise.resolve({
    reproducibilityId: "hardening-repro",
    summaryLabel: "Inconclusive",
    result: {
      summaryLabel: "Inconclusive",
      metrics: { initialCapital: 10_000, finalEquity: 9_950, numberOfTrades: 1 },
      trades: [{ symbol: "AAPL", entryDate: "2024-03-04", exitDate: "2024-03-11", netProfit: -50, costs: 4, marketRegime: "positive_low" }],
      equityCurve: [{ date: "2024-03-01", equity: 10_000 }, { date: "2024-03-11", equity: 9_950 }],
      baseline: {
        dateRange: { start: "2024-01-01", end: "2024-12-31" },
        metrics: { initialCapital: 10_000, finalEquity: 9_950, numberOfTrades: 1 },
        trades: [{ symbol: "AAPL", entryDate: "2024-03-04", exitDate: "2024-03-11", netProfit: -50, costs: 4, marketRegime: "positive_low" }],
        equityCurve: [{ date: "2024-01-02", equity: 10_000 }, { date: "2024-12-30", equity: 9_950 }],
      },
      outOfSample: { dateRange: { start: "2024-09-01", end: "2024-12-31" } },
      verdicts: [{ id: "execution_resilience", category: "execution_resilience", status: "Fail", evidence: { stressedNetProfit: -60 } }],
      failures: [
        { id: "execution_resilience", dateRange: { start: "2024-03-01", end: "2024-03-15" }, evidence: { stressedNetProfit: -60 } },
        { id: "risk_profile", category: "risk_profile", evidence: { maximumDrawdownPercent: 36 } },
      ],
      assumptions: { executionTiming: "next_open" },
    },
  });
}

async function request(app: ApiApp, method: string, path: string, input?: unknown, actor = "user") {
  const response = await app.fetch(new Request(`http://api.test${path}`, {
    method,
    headers: { "content-type": "application/json", "x-actor": actor },
    body: input === undefined ? undefined : JSON.stringify(input),
  }));
  return { response, body: await response.json() as Record<string, any> };
}

async function setup(app: ApiApp, run = true) {
  const created = await request(app, "POST", "/api/cases", {
    name: "Hardening case",
    symbols: ["AAPL"],
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    initialCapital: 10_000,
  });
  const caseId = created.body.case.id as string;
  const draft = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
    definition: strategy,
    interpretation: "AAPL RSI pullback.",
  });
  const versionId = draft.body.version.id as string;
  await request(app, "POST", `/api/cases/${caseId}/strategy-versions/${versionId}/confirm`, {});
  let runId: string | undefined;
  if (run) {
    const started = await request(app, "POST", `/api/cases/${caseId}/court-runs`, { strategyVersionId: versionId, dataSnapshotPolicy: "frozen" });
    runId = started.body.run.id;
    await app.queue.idle();
  }
  return { caseId, versionId, runId };
}

const variant = (stopLossPercent: number) => ({
  name: `Stop ${stopLossPercent}`,
  hypothesis: "A different stop may reduce tail loss.",
  rationale: "Change one parameter and retain every other assumption.",
  expectedWeaknessAddressed: "drawdown",
  patch: { risk: { stopLossPercent } },
});

describe("Stage C verifier regressions", () => {
  test("applies PostgreSQL migrations idempotently and persists numeric versions", async () => {
    const database = await harness.createDatabase();
    const first = await harness.app({ courtExecutor: courtResult }, database);
    await first.store.migrate();
    const { caseId, versionId } = await setup(first, false);
    const second = await request(first, "POST", `/api/cases/${caseId}/strategy-drafts`, {
      definition: { ...strategy, name: "Preserved second version" },
      interpretation: "Second",
    });
    expect(second.body.version).toMatchObject({ version: 2, parentVersionId: null });
    await request(first, "POST", `/api/cases/${caseId}/strategy-versions/${second.body.version.id}/confirm`, {});
    await harness.closeApp(first);

    const reopened = await harness.app({ courtExecutor: courtResult }, database);
    const loaded = await request(reopened, "GET", `/api/cases/${caseId}`);
    expect(loaded.response.status).toBe(200);
    expect(loaded.body.case.activeVersionId).toBe(second.body.version.id);
    expect(loaded.body.case.versions.map((item: Record<string, unknown>) => item.version)).toEqual([1, 2]);
    expect(loaded.body.case.versions[0].id).toBe(versionId);
    const columns = await database.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'indicator_definitions'`,
    );
    expect(columns.rows.some((column) => column.column_name === "dependencies_json")).toBe(true);
  });

  test("labels every post-evaluation draft, uses the active parent, caps attempts, and persists numeric versions", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const { caseId, versionId } = await setup(app);

    const second = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
      definition: { ...strategy, name: "Evaluation informed 2" },
      interpretation: "First evaluation-informed revision.",
    }, "agent");
    expect(second.response.status).toBe(201);
    expect(second.body.version).toMatchObject({ version: 2, parentVersionId: versionId, evaluationInformed: true });
    await request(app, "POST", `/api/cases/${caseId}/strategy-versions/${second.body.version.id}/confirm`, {});

    const third = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
      definition: { ...strategy, name: "Evaluation informed 3" },
      interpretation: "Second evaluation-informed revision.",
    });
    expect(third.body.version).toMatchObject({ version: 3, parentVersionId: second.body.version.id, evaluationInformed: true });
    const fourth = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
      definition: { ...strategy, name: "Evaluation informed 4" },
      interpretation: "Third evaluation-informed revision.",
    });
    expect(fourth.body.version.version).toBe(4);
    const rejected = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
      definition: { ...strategy, name: "Forbidden fifth" },
      interpretation: "This exceeds the investigation cap.",
    });
    expect(rejected.response.status).toBe(422);
    expect(rejected.body.error.code).toBe("variant_limit_exceeded");
  });

  test("validates a complete variant batch before an atomic version and run write", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const { caseId, versionId } = await setup(app);
    const invalid = variant(6) as Record<string, unknown>;
    delete invalid.rationale;
    const rejected = await request(app, "POST", `/api/cases/${caseId}/variants`, {
      parentVersionId: versionId,
      variants: [variant(4), invalid],
    }, "agent");
    expect(rejected.response.status).toBe(422);
    expect(rejected.body.error.details.issues).toBeArray();
    const unchanged = await request(app, "GET", `/api/cases/${caseId}`);
    expect(unchanged.body.case.versions).toHaveLength(1);
    expect(unchanged.body.case.runs).toHaveLength(1);

    const accepted = await request(app, "POST", `/api/cases/${caseId}/variants`, {
      parentVersionId: versionId,
      variants: [variant(4), variant(6)],
    }, "agent");
    expect(accepted.response.status).toBe(202);
    expect(accepted.body.versions.map((item: Record<string, unknown>) => item.version)).toEqual([2, 3]);
    expect(accepted.body.versions.every((item: Record<string, unknown>) => item.parentVersionId === versionId)).toBe(true);
  });

  test("rejects semantic no-op variants without consuming an attempt", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const { caseId, versionId } = await setup(app);

    const rejected = await request(app, "POST", `/api/cases/${caseId}/variants`, {
      parentVersionId: versionId,
      variants: [variant(strategy.risk.stopLossPercent!)],
    }, "agent");
    expect(rejected.response.status).toBe(422);
    expect(rejected.body.error).toMatchObject({
      code: "invalid_variant_patch",
      details: { variantName: `Stop ${strategy.risk.stopLossPercent}` },
    });
    expect(await app.store.countVariants(caseId, TEST_USER_ID)).toBe(0);
    const unchanged = await request(app, "GET", `/api/cases/${caseId}`);
    expect(unchanged.body.case.versions).toHaveLength(1);
    expect(unchanged.body.case.runs).toHaveLength(1);

    const accepted = await request(app, "POST", `/api/cases/${caseId}/variants`, {
      parentVersionId: versionId,
      variants: [variant(4)],
    }, "agent");
    expect(accepted.response.status).toBe(202);
    expect(accepted.body.versions[0]).toMatchObject({ version: 2, parentVersionId: versionId });
    expect(await app.store.countVariants(caseId, TEST_USER_ID)).toBe(1);
  });

  test("does not trust a client system actor and returns schema issues", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const created = await request(app, "POST", "/api/cases", {
      name: "Forged actor",
      symbols: ["AAPL"],
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
    }, "system");
    const caseId = created.body.case.id as string;
    const context = await request(app, "GET", `/api/cases/${caseId}`);
    expect(context.body.case.audit[0].actor).toBe("user");

    const invalid = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
      definition: { ...strategy, futureBars: true },
      interpretation: "Invalid schema.",
    });
    expect(invalid.response.status).toBe(422);
    expect(invalid.body.error.details.issues[0]).toEqual(expect.objectContaining({ path: expect.any(String), message: expect.any(String) }));

    for (const impossibleDate of ["2024-02-30", "2023-02-29", "2024-13-01"]) {
      const impossible = await request(app, "POST", "/api/cases", {
        name: "Impossible date",
        symbols: ["AAPL"],
        dateFrom: impossibleDate,
        dateTo: "2025-01-01",
      });
      expect(impossible.response.status).toBe(422);
      expect(impossible.body.error).toMatchObject({ code: "validation_error", details: { field: "dateFrom" } });
    }
  });

  test("accepts an OR strategy with a moving average and percentage change", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const created = await request(app, "POST", "/api/cases", {
      name: "Long-term trend or pullback",
      symbols: ["AAPL"],
      dateFrom: "2020-01-02",
      dateTo: "2024-12-31",
      initialCapital: 10_000,
    });
    const definition = structuredClone(strategy);
    definition.entry = {
      any: [
        {
          left: { source: "close" },
          operator: "gt",
          right: { indicator: "sma", parameters: { period: 120, source: "close" } },
        },
        {
          left: { indicator: "percentage_change", parameters: { period: 30, source: "close" } },
          operator: "lt",
          right: { constant: -30 },
        },
      ],
    };
    definition.exit = {
      any: [
        {
          left: { source: "close" },
          operator: "lt",
          right: { indicator: "sma", parameters: { period: 120, source: "close" } },
        },
        {
          left: { indicator: "percentage_change", parameters: { period: 30, source: "close" } },
          operator: "gt",
          right: { constant: 30 },
        },
      ],
    };

    const draft = await request(app, "POST", `/api/cases/${created.body.case.id}/strategy-drafts`, {
      definition,
      interpretation: "Buy above the 120-day average or after a 30-day decline greater than 30 percent.",
    }, "agent");

    expect(draft.response.status).toBe(201);
    expect(draft.body.version.definition.entry).toEqual(definition.entry);
    expect(draft.body.version.definition.exit).toEqual(definition.exit);
  });

  test("accepts percentage change and rolling sum as custom-indicator dependencies", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const created = await request(app, "POST", "/api/indicators", {
      name: "Pullback with rolling price",
      description: "Combines a percentage change with a scaled rolling price sum.",
      inputs: [{ name: "scale", type: "number", default: 1, min: 0, max: 10 }],
      dependencies: ["percentage_change", "rolling_sum"],
      outputType: "number",
      sharingState: "private",
      formula: {
        operation: "add",
        left: { indicator: "percentage_change", parameters: { period: 30, source: "close" } },
        right: {
          operation: "multiply",
          left: { indicator: "rolling_sum", parameters: { period: 30, source: "close" } },
          right: { input: "scale" },
        },
      },
    }, "agent");

    expect(created.response.status).toBe(201);
    expect(created.body.indicator.dependencies).toEqual(["percentage_change", "rolling_sum"]);
  });

  test("publishes formula primitives separately and supports direct inspection", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const catalog = await request(app, "GET", "/api/indicators");

    expect(catalog.response.status).toBe(200);
    expect(catalog.body.formulaPrimitives.map((indicator: Record<string, unknown>) => indicator.id)).toEqual([
      "highest",
      "lowest",
      "rolling_sum",
      "rolling_average",
      "percentage_change",
    ]);
    expect(catalog.body.indicators.some((indicator: Record<string, unknown>) => indicator.id === "percentage_change")).toBe(false);

    const primitive = await request(app, "GET", "/api/indicators/percentage_change");
    expect(primitive.response.status).toBe(200);
    expect(primitive.body.indicator).toMatchObject({
      id: "percentage_change",
      category: "primitive",
      requiredParameters: ["period", "source"],
    });
  });

  test("enforces custom-indicator inputs, dependencies, operations, output, and sharing enums", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const valid = {
      name: "RSI threshold",
      description: "Returns true when RSI is below a declared threshold.",
      inputs: [{ name: "threshold", type: "number", default: 30, min: 0, max: 100 }],
      dependencies: ["rsi"],
      outputType: "boolean",
      sharingState: "private",
      formula: {
        left: { indicator: "rsi", parameters: { period: 14, source: "close" } },
        operator: "lt",
        right: { input: "threshold" },
      },
    };
    const created = await request(app, "POST", "/api/indicators", valid, "agent");
    expect(created.response.status).toBe(201);
    expect(created.body.indicator.dependencies).toEqual(["rsi"]);

    const booleanDependencyId = created.body.indicator.id as string;
    const booleanComposition = await request(app, "POST", "/api/indicators", {
      name: "Not RSI threshold",
      description: "Negates a stored boolean custom indicator.",
      inputs: [{ name: "enabled", type: "boolean", default: true }],
      dependencies: [booleanDependencyId],
      outputType: "boolean",
      sharingState: "private",
      formula: { not: { indicator: booleanDependencyId, parameters: { threshold: 35 } } },
    });
    expect(booleanComposition.response.status).toBe(201);

    const defaultedComposition = await request(app, "POST", "/api/indicators", {
      name: "Defaulted RSI threshold",
      description: "An omitted custom parameter uses its stored declared default.",
      inputs: [{ name: "enabled", type: "boolean", default: true }],
      dependencies: [booleanDependencyId],
      outputType: "boolean",
      sharingState: "private",
      formula: { not: { indicator: booleanDependencyId, parameters: {} } },
    });
    expect(defaultedComposition.response.status).toBe(201);

    const booleanAsNumber = await request(app, "POST", "/api/indicators", {
      name: "Invalid boolean arithmetic",
      description: "A boolean custom dependency cannot be added to a number.",
      inputs: [{ name: "offset", type: "number", default: 1 }],
      dependencies: [booleanDependencyId],
      outputType: "number",
      sharingState: "private",
      formula: { operation: "add", left: { indicator: booleanDependencyId, parameters: { threshold: 35 } }, right: { input: "offset" } },
    });
    expect(booleanAsNumber.response.status).toBe(422);
    expect(booleanAsNumber.body.error.code).toBe("invalid_indicator_output");

    for (const parameters of [{ threshold: null }, { threshold: "35" }, { threshold: 35, surprise: 1 }]) {
      const badParameters = await request(app, "POST", "/api/indicators", {
        name: "Invalid custom parameters",
        description: "Custom dependency parameters must match their declaration.",
        inputs: [{ name: "enabled", type: "boolean", default: true }],
        dependencies: [booleanDependencyId],
        outputType: "boolean",
        sharingState: "private",
        formula: { not: { indicator: booleanDependencyId, parameters } },
      });
      expect(badParameters.response.status).toBe(422);
    }

    const storedInputs = [{ name: "enabled", type: "boolean", default: true }];
    const insertStored = (id: string, name: string, dependencies: string[]) => app.store.db.query(
      `INSERT INTO indicator_definitions
       (id, owner_user_id, name, version, description, formula_json, inputs_json, dependencies_json, output_type, sharing_state, created_at)
       VALUES ($1, $2, $3, 1, '', '{}'::jsonb, $4, $5, 'boolean', 'private', NOW())`,
      [id, TEST_USER_ID, name, JSON.stringify(storedInputs), JSON.stringify(dependencies)],
    );
    await insertStored("cycle-a", "Cycle A", ["cycle-b"]);
    await insertStored("cycle-b", "Cycle B", ["cycle-a"]);
    const cyclic = await request(app, "POST", "/api/indicators", {
      name: "Cycle consumer",
      description: "Stored dependency cycles must be rejected.",
      inputs: [{ name: "enabled", type: "boolean", default: true }],
      dependencies: ["cycle-a"],
      outputType: "boolean",
      sharingState: "private",
      formula: { not: { indicator: "cycle-a", parameters: {} } },
    });
    expect(cyclic.response.status).toBe(422);
    expect(cyclic.body.error).toMatchObject({ code: "invalid_indicator_dependencies", details: { cycle: ["cycle-a", "cycle-b", "cycle-a"] } });

    const undeclared = structuredClone(valid);
    undeclared.dependencies = [];
    expect((await request(app, "POST", "/api/indicators", undeclared)).body.error.code).toBe("invalid_indicator_dependencies");
    const badOperation = { ...valid, outputType: "number", dependencies: [], formula: { operation: "eval", left: { constant: 1 }, right: { constant: 2 } } };
    expect((await request(app, "POST", "/api/indicators", badOperation)).body.error.code).toBe("invalid_indicator");
    expect((await request(app, "POST", "/api/indicators", { ...valid, outputType: "string" })).body.error.code).toBe("invalid_indicator_output");
    expect((await request(app, "POST", "/api/indicators", { ...valid, sharingState: "public" })).body.error.code).toBe("invalid_indicator_sharing");
    expect((await request(app, "POST", "/api/indicators", { ...valid, script: "return true" })).body.error.code).toBe("invalid_indicator");
    expect((await request(app, "POST", "/api/indicators", { ...valid, dependencies: [], formula: { all: [{ constant: 1 }] } })).body.error.code).toBe("invalid_indicator_output");
    expect((await request(app, "POST", "/api/indicators", {
      ...valid,
      formula: { left: { indicator: "rsi", parameters: { foo: 1 } }, operator: "lt", right: { input: "threshold" } },
    })).body.error.code).toBe("invalid_indicator");
    expect((await request(app, "POST", "/api/indicators", {
      ...valid,
      dependencies: ["not_a_real_indicator"],
      formula: { left: { indicator: "not_a_real_indicator", parameters: { period: 14, source: "close" } }, operator: "lt", right: { input: "threshold" } },
    })).body.error.code).toBe("invalid_indicator_dependencies");
  });

  test("compiles nested custom indicators into an immutable executable strategy", async () => {
    let executedEntry: unknown;
    const app = await harness.app({
      courtExecutor: async (input) => {
        executedEntry = input.strategy.entry;
        return courtResult();
      },
    });
    const base = await request(app, "POST", "/api/indicators", {
      name: "RSI threshold",
      description: "Returns true when RSI is below a declared threshold.",
      inputs: [{ name: "threshold", type: "number", default: 30, min: 0, max: 100 }],
      dependencies: ["rsi"],
      outputType: "boolean",
      sharingState: "private",
      formula: {
        left: { indicator: "rsi", parameters: { period: 14, source: "close" } },
        operator: "lt",
        right: { input: "threshold" },
      },
    });
    const nested = await request(app, "POST", "/api/indicators", {
      name: "Not oversold",
      description: "Negates the stored RSI threshold formula.",
      inputs: [{ name: "threshold", type: "number", default: 35, min: 0, max: 100 }],
      dependencies: [base.body.indicator.id],
      outputType: "boolean",
      sharingState: "private",
      formula: { not: { indicator: base.body.indicator.id, parameters: { threshold: { input: "threshold" } } } },
    });
    expect(nested.response.status).toBe(201);

    const created = await request(app, "POST", "/api/cases", {
      name: "Custom indicator case",
      symbols: ["AAPL"],
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
      initialCapital: 10_000,
    });
    const customDefinition = structuredClone(strategy) as unknown as Record<string, unknown>;
    customDefinition.entry = { indicator: nested.body.indicator.id, parameters: { threshold: 35 } };
    const draft = await request(app, "POST", `/api/cases/${created.body.case.id}/strategy-drafts`, {
      definition: customDefinition,
      interpretation: "Use the nested custom indicator as the entry condition.",
    }, "agent");
    expect(draft.response.status).toBe(201);
    expect(JSON.stringify(draft.body.version.definition)).not.toContain(String(nested.body.indicator.id));
    expect(JSON.stringify(draft.body.version.definition.entry)).toContain('"rsi"');
    expect(draft.body.version.metadata.customIndicators).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: nested.body.indicator.id }),
      expect.objectContaining({ id: base.body.indicator.id }),
    ]));

    await request(app, "POST", `/api/cases/${created.body.case.id}/strategy-versions/${draft.body.version.id}/confirm`, {});
    const queued = await request(app, "POST", `/api/cases/${created.body.case.id}/court-runs`, {
      strategyVersionId: draft.body.version.id,
      dataSnapshotPolicy: "frozen",
    });
    await app.queue.idle();
    expect(queued.response.status).toBe(202);
    expect(executedEntry).toEqual(draft.body.version.definition.entry);
  });

  test("evaluates and persists the latest completed bar independently of replay", async () => {
    const marketProvider = {
      getSnapshot: async (input: { symbols: string[]; dateFrom: string; dateTo: string }) => {
        const dates: string[] = [];
        const cursor = new Date(`${input.dateFrom}T00:00:00.000Z`);
        const end = new Date(`${input.dateTo}T00:00:00.000Z`);
        while (cursor <= end) {
          dates.push(cursor.toISOString().slice(0, 10));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        const bars = input.symbols.flatMap((symbol, symbolIndex) => dates.map((timestamp, index) => {
          const close = 100 + symbolIndex * 5 + index * 0.02;
          return { symbol, timestamp, open: close - 0.1, high: close + 0.4, low: close - 0.4, close, volume: 1_000 + index };
        }));
        return {
          id: crypto.randomUUID(),
          provider: "test-latest",
          adjustment: "all",
          feed: "test",
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          symbols: input.symbols,
          fetchedAt: "2026-08-28T12:00:00.000Z",
          hash: `latest-${input.dateFrom}-${input.dateTo}`,
          request: { ...input, timeframe: "1Day", adjustment: "all" },
          bars,
        };
      },
    };
    const app = await harness.app({ marketProvider, courtExecutor: courtResult });
    const { caseId, versionId } = await setup(app, false);

    const created = await request(app, "POST", `/api/cases/${caseId}/monitoring`, {
      strategyVersionId: versionId,
      dataSnapshotPolicy: "refresh",
    }, "agent");
    expect(created.response.status).toBe(201);
    expect(created.body.monitoring).toMatchObject({
      strategyVersionId: versionId,
      snapshotFetchedAt: "2026-08-28T12:00:00.000Z",
      signals: [expect.objectContaining({ symbol: "AAPL", completedBarDate: expect.any(String) })],
      positions: expect.any(Array),
      changes: [],
    });

    const loaded = await request(app, "GET", `/api/cases/${caseId}/monitoring?strategyVersionId=${versionId}`);
    expect(loaded.response.status).toBe(200);
    expect(loaded.body.evaluation.id).toBe(created.body.evaluation.id);
    const repeated = await request(app, "POST", `/api/cases/${caseId}/monitoring`, {
      strategyVersionId: versionId,
      dataSnapshotPolicy: "refresh",
    });
    expect(repeated.body.monitoring.warnings[0]).toBe("No newer completed daily bar was available.");
    const context = await request(app, "GET", `/api/cases/${caseId}`);
    expect(context.body.case.replays).toHaveLength(0);
    expect(context.body.case.audit.some((event: Record<string, unknown>) => event.action === "monitoring.evaluated")).toBe(true);
  });

  test("persists structured safe API errors for asynchronous Court failures", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const created = await request(app, "POST", "/api/cases", {
      name: "Outside fixture coverage",
      symbols: ["AAPL"],
      dateFrom: "2019-01-01",
      dateTo: "2020-12-31",
      initialCapital: 10_000,
    });
    const caseId = created.body.case.id as string;
    const draft = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
      definition: strategy,
      interpretation: "AAPL RSI pullback outside fixture coverage.",
    });
    const versionId = draft.body.version.id as string;
    await request(app, "POST", `/api/cases/${caseId}/strategy-versions/${versionId}/confirm`, {});
    const queued = await request(app, "POST", `/api/cases/${caseId}/court-runs`, { strategyVersionId: versionId, dataSnapshotPolicy: "frozen" });
    expect(queued.response.status).toBe(202);
    await app.queue.idle();

    const failed = await request(app, "GET", `/api/court-runs/${queued.body.run.id}`);
    expect(failed.body.run).toMatchObject({
      status: "invalid",
      summary: "Invalid",
      error: null,
      result: {
        summaryLabel: "Invalid",
        invalidReason: {
        code: "fixture_coverage_unavailable",
        message: "The frozen fixture does not cover the complete requested date range",
        details: {
          requestedCoverage: { dateFrom: "2019-01-01", dateTo: "2020-12-31", symbols: ["AAPL", "SPY"] },
          availableCoverage: { dateFrom: "2020-01-02", dateTo: "2025-12-31" },
        },
        },
      },
    });
    expect(failed.body.run.result.invalidReason.stack).toBeUndefined();
  });

  test("keeps the Court snapshot scoped to the Court range and fetches replay holdout separately", async () => {
    const fixture = new FixtureMarketProvider();
    const requests: Array<{ symbols: string[]; dateFrom: string; dateTo: string }> = [];
    const app = await harness.app({
      courtExecutor: courtResult,
      marketProvider: {
        getSnapshot: async (input) => {
          requests.push(structuredClone(input));
          return fixture.getSnapshot(input);
        },
      },
    });
    const { caseId, versionId, runId } = await setup(app);
    if (!runId) throw new Error("Expected a completed Court run");

    expect(requests[0]).toEqual(expect.objectContaining({ dateFrom: "2024-01-01", dateTo: "2024-12-31" }));
    const run = await app.store.getRun(runId, TEST_USER_ID);
    const courtSnapshot = run?.dataSnapshotId ? await app.store.getSnapshot(run.dataSnapshotId) : null;
    expect(courtSnapshot?.dateTo).toBe("2024-12-31");

    const replayResponse = await request(app, "POST", `/api/cases/${caseId}/replay`, { strategyVersionId: versionId, runId });
    expect(replayResponse.response.status).toBe(201);
    expect(requests[1]).toEqual(expect.objectContaining({ dateFrom: "2024-01-01", dateTo: "2025-12-31" }));
    const replay = await app.store.getReplay(replayResponse.body.replay.id, TEST_USER_ID);
    expect(replay?.state.dataSnapshotId).not.toBe(run?.dataSnapshotId);
    const replaySnapshot = typeof replay?.state.dataSnapshotId === "string" ? await app.store.getSnapshot(replay.state.dataSnapshotId) : null;
    expect(replaySnapshot?.dateTo).toBe("2025-12-31");
  });

  test("rejects a Court range that ends in the future", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const created = await request(app, "POST", "/api/cases", {
      name: "Future case",
      symbols: ["AAPL"],
      dateFrom: "2024-01-01",
      dateTo: tomorrow.toISOString().slice(0, 10),
      initialCapital: 10_000,
    });
    expect(created.response.status).toBe(422);
    expect(created.body.error.message).toBe("dateTo cannot be in the future");
  });

  test("uses a future covered replay holdout and returns complete failure evidence", async () => {
    const app = await harness.app({ courtExecutor: courtResult });
    const { caseId, versionId, runId } = await setup(app);
    const originalRange = await request(app, "POST", `/api/cases/${caseId}/replay`, {
      strategyVersionId: versionId,
      runId,
      reservedFrom: "2024-01-01",
      reservedTo: "2024-12-31",
    });
    expect(originalRange.body.error.code).toBe("replay_range_not_holdout");
    const reversed = await request(app, "POST", `/api/cases/${caseId}/replay`, {
      strategyVersionId: versionId,
      runId,
      reservedFrom: "2025-12-31",
      reservedTo: "2025-01-01",
    });
    expect(reversed.body.error.code).toBe("invalid_replay_range");
    const unavailable = await request(app, "POST", `/api/cases/${caseId}/replay`, {
      strategyVersionId: versionId,
      runId,
      reservedFrom: "2026-01-01",
      reservedTo: "2026-02-01",
    });
    expect(unavailable.body.error.code).toBe("replay_range_unavailable");
    const replay = await request(app, "POST", `/api/cases/${caseId}/replay`, { strategyVersionId: versionId, runId });
    expect(replay.response.status).toBe(201);
    expect(replay.body.replay.reservedFrom).toBe("2025-01-01");

    const failure = await request(app, "GET", `/api/court-runs/${runId}/failures/execution_resilience`);
    expect(failure.body.failure).toEqual(expect.objectContaining({
      period: expect.objectContaining({ start: "2024-03-01", end: "2024-03-15" }),
      trades: expect.any(Array),
      regime: expect.any(Object),
      equity: expect.any(Object),
      indicatorEvidence: expect.any(Object),
      costs: expect.any(Object),
    }));
    const baselineFailure = await request(app, "GET", `/api/court-runs/${runId}/failures/risk_profile`);
    expect(baselineFailure.body.failure.period).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  });

  test("recovers interrupted jobs, serves real cache hits, guards pagination cycles, and rejects incomplete fixture requests", async () => {
    const database = await harness.createDatabase();
    const first = await harness.app({ courtExecutor: courtResult }, database);
    const { caseId, versionId } = await setup(first, false);
    const abandoned = await first.store.createRun(caseId, versionId, "balanced", ENGINE_VERSION, "user", TEST_USER_ID);
    await harness.closeApp(first);
    const recovered = await harness.app({ courtExecutor: courtResult }, database);
    const recoveredRun = await request(recovered, "GET", `/api/court-runs/${abandoned.id}`);
    expect(recoveredRun.body.run).toMatchObject({ status: "failed", error: { code: "server_restarted" } });
    const recoveredCase = await request(recovered, "GET", `/api/cases/${caseId}`);
    expect(recoveredCase.body.case.audit.some((item: Record<string, unknown>) => item.actor === "system" && item.action === "court.failed")).toBe(true);

    const fixture = new FixtureMarketProvider();
    let calls = 0;
    const countingProvider = { getSnapshot: async (input: Parameters<typeof fixture.getSnapshot>[0]) => { calls += 1; return fixture.getSnapshot(input); } };
    const cachedApp = await harness.app({ courtExecutor: courtResult, marketProvider: countingProvider });
    const cachedSetup = await setup(cachedApp, false);
    await request(cachedApp, "POST", `/api/cases/${cachedSetup.caseId}/court-runs`, { strategyVersionId: cachedSetup.versionId, dataSnapshotPolicy: "frozen" });
    await cachedApp.queue.idle();
    await request(cachedApp, "POST", `/api/cases/${cachedSetup.caseId}/court-runs`, { strategyVersionId: cachedSetup.versionId, dataSnapshotPolicy: "prefer_cache" });
    await cachedApp.queue.idle();
    expect(calls).toBe(1);

    let fetchCalls = 0;
    const alpaca = new AlpacaMarketProvider("key", "secret", "https://data.alpaca.test", "iex", (async () => {
      fetchCalls += 1;
      return Response.json({ bars: { AAPL: [{ t: "2024-01-02T00:00:00Z", o: 1, h: 2, l: 1, c: 2, v: 10 }] }, next_page_token: "repeat" });
    }) as unknown as typeof fetch);
    await expect(alpaca.getSnapshot({ symbols: ["AAPL"], dateFrom: "2024-01-01", dateTo: "2024-01-31" })).rejects.toMatchObject({ code: "market_pagination_cycle" });
    expect(fetchCalls).toBe(2);
    const validFixture = await fixture.getSnapshot({ symbols: ["AAPL", "SPY"], dateFrom: "2020-01-02", dateTo: "2025-12-31" });
    expect(validFixture).toMatchObject({
      provider: "fixture",
      feed: "frozen",
      dateFrom: "2020-01-02",
      dateTo: "2025-12-31",
      symbols: ["AAPL", "SPY"],
      request: {
        dateFrom: "2020-01-02",
        dateTo: "2025-12-31",
        frozen: true,
        availableCoverage: { dateFrom: "2020-01-02", dateTo: "2025-12-31" },
      },
    });
    expect(validFixture.bars.every((bar) => bar.timestamp >= validFixture.dateFrom && bar.timestamp <= validFixture.dateTo)).toBe(true);

    for (const requested of [
      { symbols: ["AAPL"], dateFrom: "2019-01-01", dateTo: "2021-12-31" },
      { symbols: ["AAPL"], dateFrom: "2024-01-01", dateTo: "2026-01-02" },
    ]) {
      try {
        await fixture.getSnapshot(requested);
        throw new Error("Expected fixture coverage rejection");
      } catch (error) {
        expect(error).toMatchObject({
          status: 422,
          code: "fixture_coverage_unavailable",
          details: {
            requestedCoverage: requested,
            availableCoverage: { dateFrom: "2020-01-02", dateTo: "2025-12-31" },
          },
        });
      }
    }

    try {
      await fixture.getSnapshot({ symbols: ["AAPL", "IWM"], dateFrom: "2024-01-01", dateTo: "2024-12-31" });
      throw new Error("Expected fixture symbol rejection");
    } catch (error) {
      expect(error).toMatchObject({
        status: 422,
        code: "fixture_symbols_missing",
        details: {
          missingSymbols: ["IWM"],
          requestedCoverage: { symbols: ["AAPL", "IWM"], dateFrom: "2024-01-01", dateTo: "2024-12-31" },
          availableCoverage: { dateFrom: "2020-01-02", dateTo: "2025-12-31" },
        },
      });
    }

    const health = await request(cachedApp, "GET", "/api/health");
    expect(health.body.engineVersion).toBe(ENGINE_VERSION);
  });
});
