import type { BacktestMetrics, EquityPoint, Trade } from "@strategy-court/schemas";

export interface MetricsInput {
  initialCapital: number;
  rawEquityCurve: Array<{ date: string; equity: number }>;
  trades: readonly Trade[];
  benchmarkReturnPercent: number | null;
  exposedBars: number;
  availableBars: number;
}

const finiteOrNull = (value: number): number | null => Number.isFinite(value) ? value : null;
const round = (value: number): number => Math.round((value + Number.EPSILON) * 1e10) / 1e10;

export function addDrawdowns(rawCurve: readonly { date: string; equity: number }[]): EquityPoint[] {
  let peak = rawCurve[0]?.equity ?? 0;
  return rawCurve.map((point) => {
    peak = Math.max(peak, point.equity);
    const drawdownPercent = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    return { ...point, equity: round(point.equity), drawdownPercent: round(drawdownPercent) };
  });
}

function drawdownDurations(curve: readonly EquityPoint[]): { maximum: number; recovery: number | null; unrecovered: boolean } {
  let peak = curve[0]?.equity ?? 0;
  let duration = 0;
  let maximum = 0;
  let maximumRecovery = 0;
  let hadDrawdown = false;
  for (const point of curve) {
    if (point.equity >= peak) {
      if (duration > 0) maximumRecovery = Math.max(maximumRecovery, duration);
      peak = point.equity;
      duration = 0;
    } else {
      hadDrawdown = true;
      duration += 1;
      maximum = Math.max(maximum, duration);
    }
  }
  return {
    maximum,
    recovery: hadDrawdown ? maximumRecovery || null : 0,
    unrecovered: duration > 0,
  };
}

export function computeBacktestMetrics(input: MetricsInput): { metrics: BacktestMetrics; equityCurve: EquityPoint[] } {
  const equityCurve = addDrawdowns(input.rawEquityCurve);
  const finalEquity = equityCurve.at(-1)?.equity ?? input.initialCapital;
  const netProfit = finalEquity - input.initialCapital;
  const winners = input.trades.filter((trade) => trade.netProfit > 0);
  const losers = input.trades.filter((trade) => trade.netProfit < 0);
  const grossWins = winners.reduce((sum, trade) => sum + trade.netProfit, 0);
  const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.netProfit, 0));
  const netTradeProfit = input.trades.reduce((sum, trade) => sum + trade.netProfit, 0);
  const sortedProfits = input.trades.map((trade) => trade.netProfit).sort((left, right) => right - left);
  const bestFive = sortedProfits.slice(0, 5).reduce((sum, profit) => sum + profit, 0);
  const bestTenPercentCount = input.trades.length ? Math.max(1, Math.ceil(input.trades.length * 0.1)) : 0;
  const bestTenPercent = sortedProfits.slice(0, bestTenPercentCount).reduce((sum, profit) => sum + profit, 0);
  const duration = drawdownDurations(equityCurve);
  let consecutive = 0;
  let maximumConsecutiveLosses = 0;
  for (const trade of input.trades) {
    consecutive = trade.netProfit < 0 ? consecutive + 1 : 0;
    maximumConsecutiveLosses = Math.max(maximumConsecutiveLosses, consecutive);
  }
  const firstDate = equityCurve[0]?.date;
  const lastDate = equityCurve.at(-1)?.date;
  const elapsedDays = firstDate && lastDate ? Math.max(0, (Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000) : 0;
  const annualized = elapsedDays > 0 && input.initialCapital > 0 && finalEquity > 0
    ? (Math.pow(finalEquity / input.initialCapital, 365.25 / elapsedDays) - 1) * 100
    : null;

  const metrics: BacktestMetrics = {
    initialCapital: round(input.initialCapital),
    finalEquity: round(finalEquity),
    netProfit: round(netProfit),
    netReturnPercent: round(input.initialCapital > 0 ? netProfit / input.initialCapital * 100 : 0),
    annualizedReturnPercent: annualized === null ? null : round(annualized),
    numberOfTrades: input.trades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRatePercent: input.trades.length ? round(winners.length / input.trades.length * 100) : null,
    averageWinningTrade: winners.length ? round(grossWins / winners.length) : null,
    averageLosingTrade: losers.length ? round(-grossLosses / losers.length) : null,
    expectancyPerTrade: input.trades.length ? round(netTradeProfit / input.trades.length) : null,
    profitFactor: grossLosses > 0 ? round(grossWins / grossLosses) : winners.length ? null : 0,
    maximumDrawdownPercent: round(Math.max(0, ...equityCurve.map((point) => point.drawdownPercent))),
    maximumDrawdownDurationDays: duration.maximum,
    recoveryTimeDays: duration.recovery,
    unrecoveredDrawdown: duration.unrecovered,
    averageHoldingPeriodDays: input.trades.length ? round(input.trades.reduce((sum, trade) => sum + trade.holdingDays, 0) / input.trades.length) : null,
    longestHoldingPeriodDays: Math.max(0, ...input.trades.map((trade) => trade.holdingDays)),
    bestTrade: input.trades.length ? round(Math.max(...input.trades.map((trade) => trade.netProfit))) : null,
    worstTrade: input.trades.length ? round(Math.min(...input.trades.map((trade) => trade.netProfit))) : null,
    bestTradeContributionPercent: netTradeProfit > 0 && sortedProfits.length ? round((sortedProfits[0] ?? 0) / netTradeProfit * 100) : null,
    bestFiveTradesContributionPercent: netTradeProfit > 0 && sortedProfits.length ? round(bestFive / netTradeProfit * 100) : null,
    bestTenPercentTradesContributionPercent: netTradeProfit > 0 && sortedProfits.length ? round(bestTenPercent / netTradeProfit * 100) : null,
    totalEstimatedCosts: round(input.trades.reduce((sum, trade) => sum + trade.costs, 0)),
    benchmarkReturnPercent: input.benchmarkReturnPercent === null ? null : round(input.benchmarkReturnPercent),
    exposurePercent: input.availableBars > 0 ? round(input.exposedBars / input.availableBars * 100) : 0,
    maximumConsecutiveLosses,
  };
  metrics.annualizedReturnPercent = metrics.annualizedReturnPercent === null ? null : finiteOrNull(metrics.annualizedReturnPercent);
  return { metrics, equityCurve };
}
