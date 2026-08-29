import { describe, expect, test } from "bun:test";
import {
  createReproducibilityId,
  evidenceSufficiencyVerdict,
  executionResilienceVerdict,
  outOfSampleVerdict,
  parameterStabilityVerdict,
  profitConcentrationVerdict,
  regimeStabilityVerdict,
  riskProfileVerdict,
  runCourt,
  summarizeCourt,
} from "../src/index.ts";
import type { CourtVerdict, ParameterTrial, StrategyDefinition, Trade } from "@strategy-court/schemas";
import { makeBars, makeMetrics, makeSnapshot, makeStrategy } from "./helpers.ts";

describe("Court threshold boundaries", () => {
  test("keeps low evidence inconclusive at 29 and passes at 30", () => {
    expect(evidenceSufficiencyVerdict(29).status).toBe("Inconclusive");
    expect(evidenceSufficiencyVerdict(30).status).toBe("Pass");
  });

  test("applies conservative out-of-sample and cost boundaries", () => {
    expect(outOfSampleVerdict(makeMetrics({ profitFactor: 1.1 }), "Pass").status).toBe("Pass");
    expect(outOfSampleVerdict(makeMetrics({ profitFactor: 1 }), "Pass").status).toBe("Warning");
    expect(outOfSampleVerdict(makeMetrics({ expectancyPerTrade: 0 }), "Pass").status).toBe("Fail");
    expect(executionResilienceVerdict(makeMetrics({ netProfit: 100 }), makeMetrics({ netProfit: 50 })).status).toBe("Pass");
    expect(executionResilienceVerdict(makeMetrics({ netProfit: 100 }), makeMetrics({ netProfit: 49 })).status).toBe("Warning");
    expect(executionResilienceVerdict(makeMetrics({ netProfit: 100 }), makeMetrics({ netProfit: 0 })).status).toBe("Fail");
  });

  test("treats exact concentration and risk limits as pass", () => {
    expect(profitConcentrationVerdict(makeMetrics({ bestTradeContributionPercent: 20, bestFiveTradesContributionPercent: 50 })).status).toBe("Pass");
    expect(profitConcentrationVerdict(makeMetrics({ bestTradeContributionPercent: 35, bestFiveTradesContributionPercent: 75 })).status).toBe("Warning");
    expect(profitConcentrationVerdict(makeMetrics({ bestTradeContributionPercent: 35.01 })).status).toBe("Fail");
    expect(riskProfileVerdict(makeMetrics({ maximumDrawdownPercent: 25, recoveryTimeDays: 252 })).status).toBe("Pass");
    expect(riskProfileVerdict(makeMetrics({ maximumDrawdownPercent: 35, recoveryTimeDays: 504 })).status).toBe("Warning");
    expect(riskProfileVerdict(makeMetrics({ maximumDrawdownPercent: 35.01 })).status).toBe("Fail");
  });

  test("applies parameter profitability percentages without rounding the denominator", () => {
    const trials = (profitable: number, total = 5): ParameterTrial[] => Array.from({ length: total }, (_, index) => ({ path: `/p/${index}`, baseline: 10, value: index, factor: 1, status: "completed", netProfit: index < profitable ? 1 : -1, profitable: index < profitable }));
    expect(parameterStabilityVerdict([]).status).toBe("Inconclusive");
    expect(parameterStabilityVerdict(trials(3)).status).toBe("Pass");
    expect(parameterStabilityVerdict(trials(2)).status).toBe("Warning");
    expect(parameterStabilityVerdict(trials(1)).status).toBe("Fail");
  });

  test("requires ten trades in at least two regimes", () => {
    const trade = (marketRegime: Trade["marketRegime"], netProfit: number, index: number): Trade => ({
      symbol: "AAPL", entryDate: `2024-01-${String(index + 1).padStart(2, "0")}`, entryReferencePrice: 10, entryPrice: 10,
      exitDate: `2024-02-${String(index + 1).padStart(2, "0")}`, exitReferencePrice: 11, exitPrice: 11,
      quantity: 1, grossProfit: netProfit, costs: 0, netProfit, returnPercent: netProfit * 10, holdingDays: 1,
      entryReason: "entry_condition", exitReason: "rule", marketRegime,
    });
    const group = (regime: Trade["marketRegime"], profit: number) => Array.from({ length: 10 }, (_, index) => trade(regime, profit, index));
    expect(regimeStabilityVerdict(group("positive_low", 1)).status).toBe("Inconclusive");
    expect(regimeStabilityVerdict([...group("positive_low", 1), ...group("positive_high", 1)]).status).toBe("Warning");
    expect(regimeStabilityVerdict([...group("positive_low", 1), ...group("positive_high", 1), ...group("negative_low", 1)]).status).toBe("Pass");
    expect(regimeStabilityVerdict([...group("positive_low", -1), ...group("negative_low", -1)]).status).toBe("Fail");
  });

  test("uses deterministic top-level precedence", () => {
    const categories = [
      "evidence_sufficiency", "out_of_sample_robustness", "parameter_stability", "execution_resilience",
      "regime_stability", "profit_concentration", "risk_profile",
    ] as const;
    const verdicts: CourtVerdict[] = categories.map((category) => ({ category, title: category, status: "Pass", summary: "", thresholds: [], evidence: {} }));
    expect(summarizeCourt(verdicts)).toBe("Survived current tests");
    const third = verdicts[2];
    if (!third) throw new Error("Missing verdict fixture");
    verdicts[2] = { ...third, status: "Inconclusive" };
    expect(summarizeCourt(verdicts)).toBe("Inconclusive");
    verdicts[2] = { ...third, status: "Warning" };
    expect(summarizeCourt(verdicts)).toBe("Paper-trading candidate");
    verdicts[2] = { ...third, status: "Fail" };
    expect(summarizeCourt(verdicts)).toBe("Fragile");
  });
});

test("reproducibility hashes ignore object key order", () => {
  expect(createReproducibilityId({ a: 1, b: { c: 2 } })).toBe(createReproducibilityId({ b: { c: 2 }, a: 1 }));
});

test("keeps generated stress and parameter trials inside contract boundaries", () => {
  const strategy = makeStrategy({ commissionBpsPerSide: 1_000, slippageBpsPerSide: 1_000 });
  strategy.entry = {
    left: { indicator: "sma", parameters: { period: 2_520, source: "close" } },
    operator: "gt",
    right: { constant: -Number.MAX_VALUE },
  };
  strategy.exit = { left: { source: "close" }, operator: "gt", right: { constant: Number.MAX_VALUE } };
  strategy.risk = { stopLossPercent: 100, takeProfitPercent: 100, maxHoldingDays: 2_520 };
  const snapshot = makeSnapshot(makeBars([
    { date: "2024-01-02", open: 10, close: 10 },
    { date: "2024-01-03", open: 10, close: 11 },
    { date: "2024-01-04", open: 11, close: 12 },
    { date: "2024-01-05", open: 12, close: 13 },
  ]));

  const report = runCourt({ strategy, snapshot, initialCapital: 10_000 });
  expect(report.verdicts).toHaveLength(7);
  expect(report.parameterTrials.every((trial) => Number.isFinite(trial.value) && trial.value !== trial.baseline)).toBe(true);
  for (const path of new Set(report.parameterTrials.map((trial) => trial.path))) {
    const trials = report.parameterTrials.filter((trial) => trial.path === path);
    expect(new Set(trials.map((trial) => trial.value)).size).toBe(trials.length);
  }
  expect(report.parameterTrials.filter((trial) => trial.path.endsWith("/period")).every((trial) => trial.value >= 1 && trial.value <= 2_520)).toBe(true);
  expect(report.parameterTrials.filter((trial) => trial.path.includes("/risk/")).every((trial) => trial.value >= 0.01 && trial.value <= 2_520)).toBe(true);
});

test("tests every numeric parameter exposed by multi-parameter indicators", () => {
  const dates = Array.from({ length: 80 }, (_, index) => {
    const value = new Date(Date.UTC(2024, 0, 2 + index));
    return value.toISOString().slice(0, 10);
  });
  const snapshot = makeSnapshot(makeBars(dates.map((date, index) => ({
    date,
    open: 100 + index,
    close: 100 + index,
    high: 101 + index,
    low: 99 + index,
    volume: 1_000 + index,
  }))));
  const cases: Array<{ entry: StrategyDefinition["entry"]; expected: string[] }> = [
    {
      entry: {
        left: { indicator: "macd", parameters: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, source: "close", component: "line" } },
        operator: "gt",
        right: { indicator: "stochastic", parameters: { period: 14, smoothK: 3, smoothD: 3, component: "k" } },
      },
      expected: ["fastPeriod", "slowPeriod", "signalPeriod", "period", "smoothK", "smoothD"],
    },
    {
      entry: {
        left: { indicator: "bollinger", parameters: { period: 20, standardDeviations: 2, source: "close", component: "upper" } },
        operator: "gt",
        right: { indicator: "keltner", parameters: { period: 20, atrPeriod: 10, multiplier: 2, source: "close", component: "upper" } },
      },
      expected: ["standardDeviations", "atrPeriod", "multiplier"],
    },
    {
      entry: {
        left: { indicator: "supertrend", parameters: { atrPeriod: 10, multiplier: 3, component: "line" } },
        operator: "gt",
        right: { indicator: "parabolic_sar", parameters: { acceleration: 0.02, maximum: 0.2 } },
      },
      expected: ["atrPeriod", "multiplier", "acceleration", "maximum"],
    },
  ];

  for (const item of cases) {
    const strategy = makeStrategy();
    strategy.entry = item.entry;
    strategy.risk = {};
    const report = runCourt({ strategy, snapshot, initialCapital: 10_000 });
    const paths = report.parameterTrials.map((trial) => trial.path);
    for (const parameter of item.expected) {
      expect(paths.some((path) => path.endsWith(`/${parameter}`))).toBe(true);
    }
  }
});

test("records invalid relational neighbours without aborting the Court", () => {
  const dates = Array.from({ length: 50 }, (_, index) => new Date(Date.UTC(2024, 0, 2 + index)).toISOString().slice(0, 10));
  const snapshot = makeSnapshot(makeBars(dates.map((date, index) => ({ date, open: 100 + index, close: 100 + index }))));
  const strategy = makeStrategy();
  strategy.risk = {};
  strategy.entry = {
    left: { indicator: "macd", parameters: { fastPeriod: 9, slowPeriod: 10, signalPeriod: 3, source: "close", component: "line" } },
    operator: "gt",
    right: { indicator: "parabolic_sar", parameters: { acceleration: 0.19, maximum: 0.2 } },
  };

  const report = runCourt({ strategy, snapshot, initialCapital: 10_000 });
  const invalid = report.parameterTrials.filter((trial) => trial.status === "invalid");
  expect(invalid.length).toBeGreaterThan(0);
  expect(invalid.every((trial) => trial.netProfit === null && trial.profitable === null && Boolean(trial.invalidReason))).toBe(true);
  expect(report.parameterTrials.some((trial) => trial.status === "completed" && trial.path.endsWith("/fastPeriod"))).toBe(true);
  expect(report.parameterTrials.some((trial) => trial.status === "completed" && trial.path.endsWith("/maximum"))).toBe(true);
});

test("localizes risk evidence to the actual peak-to-trough period", () => {
  const dates = Array.from({ length: 40 }, (_, index) => {
    const value = new Date(Date.UTC(2024, 0, 2 + index));
    return value.toISOString().slice(0, 10);
  });
  const bars = makeBars(dates.map((date, index) => ({
    date,
    open: index < 20 ? 100 + index : Math.max(35, 120 - (index - 19) * 6),
    close: index < 20 ? 100 + index : Math.max(35, 120 - (index - 19) * 6),
  })));
  const strategy = makeStrategy();
  strategy.entry = { left: { source: "close" }, operator: "gt", right: { constant: 0 } };
  strategy.exit = { left: { source: "close" }, operator: "lt", right: { constant: 0 } };
  const report = runCourt({ strategy, snapshot: makeSnapshot(bars), initialCapital: 10_000 });
  const risk = report.failures.find((failure) => failure.category === "risk_profile");

  if (!risk) throw new Error("Expected localized risk evidence");
  expect(risk?.status).toBe("Fail");
  expect(risk?.dateRange.start).not.toBe(report.baseline.dateRange.start);
  expect(risk?.dateRange.end).not.toBe(report.baseline.dateRange.end);
  expect(risk.dateRange.end >= risk.dateRange.start).toBe(true);
});
