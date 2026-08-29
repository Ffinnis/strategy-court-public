import { describe, expect, test } from "bun:test";
import {
  CURATED_UNIVERSE,
  SAMPLE_STRATEGY,
  safeParseCourtRunRequest,
  safeParseDataSnapshot,
  safeParseStrategyDefinition,
  safeParseVariantRequests,
  type ConditionNode,
} from "../src/index.ts";

const bar = (date: string) => ({ date, open: 10, high: 11, low: 9, close: 10.5, volume: 100 });

function snapshot(symbols: string[] = ["AAPL"], startDate = "2024-01-02", endDate = "2024-01-02") {
  return {
    id: "snapshot",
    provider: "fixture",
    symbols,
    startDate,
    endDate,
    adjustment: "all",
    fetchedAt: "2026-01-01T00:00:00Z",
    contentHash: "sha256:test",
    bars: Object.fromEntries(symbols.map((symbol) => [symbol, [bar(startDate)]])),
  };
}

function nestedCondition(depth: number): ConditionNode {
  let condition: ConditionNode = { left: { source: "close" }, operator: "gt", right: { constant: 1 } };
  for (let level = 1; level < depth; level += 1) condition = { not: condition };
  return condition;
}

describe("strategy contract", () => {
  test("accepts the frozen sample strategy", () => {
    expect(safeParseStrategyDefinition(SAMPLE_STRATEGY)).toEqual({ success: true, data: SAMPLE_STRATEGY });
    expect(CURATED_UNIVERSE).toContain("SPY");
  });

  test("rejects extra properties and future references", () => {
    const candidate = structuredClone(SAMPLE_STRATEGY) as unknown as Record<string, unknown>;
    candidate.executableCode = "return true";
    const entry = (candidate.entry as { all: Array<Record<string, unknown>> }).all[0];
    if (!entry) throw new Error("Missing fixture entry");
    entry.left = { lag: { value: { source: "close" }, bars: -1 } };
    const result = safeParseStrategyDefinition(candidate);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.path === "$.executableCode")).toBe(true);
      expect(result.issues.some((issue) => issue.path.endsWith(".lag.bars"))).toBe(true);
    }
  });

  test("enforces the one-to-five curated symbol boundary", () => {
    const candidate = structuredClone(SAMPLE_STRATEGY) as unknown as { universe: string[] };
    candidate.universe = ["AAPL", "MSFT", "NVDA", "QQQ", "SPY", "TSLA"];
    expect(safeParseStrategyDefinition(candidate).success).toBe(false);
    candidate.universe = ["BTCUSD"];
    expect(safeParseStrategyDefinition(candidate).success).toBe(false);
  });

  test("accepts condition depth 12 and rejects depth 13", () => {
    const candidate = structuredClone(SAMPLE_STRATEGY);
    candidate.entry = nestedCondition(12);
    expect(safeParseStrategyDefinition(candidate).success).toBe(true);
    candidate.entry = nestedCondition(13);
    const result = safeParseStrategyDefinition(candidate);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.message.includes("depth 12"))).toBe(true);
  });

  test("validates indicator-specific parameters and explicit components", () => {
    const candidate = structuredClone(SAMPLE_STRATEGY);
    candidate.entry = {
      left: {
        indicator: "macd",
        parameters: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, source: "close", component: "histogram" },
      },
      operator: "gt",
      right: { constant: 0 },
    };
    expect(safeParseStrategyDefinition(candidate).success).toBe(true);

    const invalid = structuredClone(candidate) as unknown as {
      entry: { left: { parameters: Record<string, unknown> } };
    };
    delete invalid.entry.left.parameters.component;
    invalid.entry.left.parameters.fastPeriod = 30;
    invalid.entry.left.parameters.slowPeriod = 10;
    const result = safeParseStrategyDefinition(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.path.endsWith(".component"))).toBe(true);
      expect(result.issues.some((issue) => issue.path.endsWith(".slowPeriod") && issue.message.includes("exceed"))).toBe(true);
    }
  });
});

describe("request contracts", () => {
  test("uses closed request objects", () => {
    const result = safeParseCourtRunRequest({
      strategyVersionId: "v1",
      dateRange: { start: "2020-01-01", end: "2024-01-01" },
      courtProfile: "balanced",
      dataSnapshotPolicy: "frozen",
      initialCapital: 10_000,
      surprise: true,
    });
    expect(result.success).toBe(false);
  });

  test("rejects more than three variants and protected patches", () => {
    const variant = { name: "A", hypothesis: "H", rationale: "R", expectedWeaknessAddressed: "W", patch: { universe: ["AAPL"] } };
    expect(safeParseVariantRequests([variant]).success).toBe(false);
    expect(safeParseVariantRequests([variant, variant, variant, variant]).success).toBe(false);
  });

  test("rejects empty nested variant patches", () => {
    const variant = (patch: unknown) => ({ name: "A", hypothesis: "H", rationale: "R", expectedWeaknessAddressed: "W", patch });
    expect(safeParseVariantRequests([variant({ risk: {} })]).success).toBe(false);
    expect(safeParseVariantRequests([variant({ costs: {} })]).success).toBe(false);
  });

  test("rejects snapshots that silently omit a declared symbol", () => {
    const result = safeParseDataSnapshot({
      id: "snapshot", provider: "fixture", symbols: ["AAPL", "MSFT"], startDate: "2024-01-02", endDate: "2024-01-02",
      adjustment: "all", fetchedAt: "2026-01-01T00:00:00Z", contentHash: "sha256:test",
      bars: { AAPL: [{ date: "2024-01-02", open: 10, high: 11, low: 9, close: 10.5, volume: 100 }] },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.path === "$.bars.MSFT")).toBe(true);
  });

  test("validates missing-bar keys and non-negative integer counts", () => {
    const valid = { ...snapshot(), missingBars: { AAPL: 0 } };
    expect(safeParseDataSnapshot(valid).success).toBe(true);
    for (const missingBars of [{ AAPL: "oops" }, { AAPL: -1 }, { AAPL: 1.5 }, { BTCUSD: 1 }]) {
      expect(safeParseDataSnapshot({ ...snapshot(), missingBars }).success).toBe(false);
    }
  });

  test("requires real ordered snapshot dates and contained bar dates", () => {
    expect(safeParseDataSnapshot(snapshot(["AAPL"], "2030-99-99", "2030-99-99")).success).toBe(false);
    expect(safeParseDataSnapshot(snapshot(["AAPL"], "2023-02-29", "2023-03-01")).success).toBe(false);
    expect(safeParseDataSnapshot(snapshot(["AAPL"], "2024-01-03", "2024-01-02")).success).toBe(false);
    const outside = snapshot(["AAPL"], "2024-01-02", "2024-01-03");
    outside.bars.AAPL = [bar("2024-01-04")];
    expect(safeParseDataSnapshot(outside).success).toBe(false);
    expect(safeParseDataSnapshot(snapshot(["AAPL"], "2024-02-29", "2024-02-29")).success).toBe(true);
  });

  test("allows five strategy symbols plus SPY benchmark data", () => {
    const withBenchmark = ["AAPL", "MSFT", "NVDA", "QQQ", "XLK", "SPY"];
    expect(safeParseDataSnapshot(snapshot(withBenchmark)).success).toBe(true);
    expect(safeParseDataSnapshot(snapshot(["AAPL", "MSFT", "NVDA", "QQQ", "XLK", "IWM"])).success).toBe(false);
    expect(safeParseDataSnapshot(snapshot([...withBenchmark, "IWM"])).success).toBe(false);
  });

  test("requires real calendar dates in Court requests", () => {
    const request = {
      strategyVersionId: "v1",
      dateRange: { start: "2024-02-30", end: "2024-03-01" },
      courtProfile: "balanced",
      dataSnapshotPolicy: "frozen",
      initialCapital: 10_000,
    };
    expect(safeParseCourtRunRequest(request).success).toBe(false);
  });
});
