import type { BacktestMetrics, DataSnapshot, MarketBar, StrategyDefinition } from "@strategy-court/schemas";

export function makeBars(values: Array<{ date: string; open: number; high?: number; low?: number; close: number }>): MarketBar[] {
  return values.map((value) => ({
    date: value.date,
    open: value.open,
    high: value.high ?? Math.max(value.open, value.close),
    low: value.low ?? Math.min(value.open, value.close),
    close: value.close,
    volume: 1_000,
  }));
}

export function makeSnapshot(bars: MarketBar[]): DataSnapshot {
  return {
    id: "test-snapshot",
    provider: "test",
    symbols: ["AAPL"],
    startDate: bars[0]?.date ?? "2024-01-01",
    endDate: bars.at(-1)?.date ?? "2024-01-01",
    adjustment: "all",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    contentHash: "sha256:test",
    bars: { AAPL: bars },
  };
}

export function makeStrategy(costs = { commissionBpsPerSide: 0, slippageBpsPerSide: 0 }): StrategyDefinition {
  return {
    name: "Test strategy",
    universe: ["AAPL"],
    timeframe: "1d",
    direction: "long",
    entry: { left: { source: "close" }, operator: "gt", right: { constant: 10 } },
    exit: { left: { source: "close" }, operator: "gt", right: { constant: 11.5 } },
    execution: { signalAt: "close", executeAt: "next_open", orderType: "market" },
    risk: {},
    costs,
  };
}

export function makeMetrics(patch: Partial<BacktestMetrics> = {}): BacktestMetrics {
  return {
    initialCapital: 10_000,
    finalEquity: 11_000,
    netProfit: 1_000,
    netReturnPercent: 10,
    annualizedReturnPercent: 10,
    numberOfTrades: 30,
    winningTrades: 20,
    losingTrades: 10,
    winRatePercent: 66.67,
    averageWinningTrade: 100,
    averageLosingTrade: -100,
    expectancyPerTrade: 10,
    profitFactor: 1.1,
    maximumDrawdownPercent: 10,
    maximumDrawdownDurationDays: 10,
    recoveryTimeDays: 10,
    unrecoveredDrawdown: false,
    averageHoldingPeriodDays: 5,
    longestHoldingPeriodDays: 10,
    bestTrade: 200,
    worstTrade: -100,
    bestTradeContributionPercent: 20,
    bestFiveTradesContributionPercent: 50,
    bestTenPercentTradesContributionPercent: 40,
    totalEstimatedCosts: 20,
    benchmarkReturnPercent: 5,
    exposurePercent: 25,
    maximumConsecutiveLosses: 3,
    ...patch,
  };
}
