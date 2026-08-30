import type {
  DataSnapshot,
  CuratedSymbol,
  LatestBarMonitoringStatus,
  MonitoringChange,
  MonitoringSignal,
  StrategyDefinition,
} from "@strategy-court/schemas";
import { parseDataSnapshot, parseStrategyDefinition } from "@strategy-court/schemas";
import { classifyMarketRegimes, runBacktest } from "./backtest.ts";
import { evaluateCondition } from "./conditions.ts";
import { HISTORICAL_LIMITATION } from "./court.ts";

export interface LatestBarMonitoringInput {
  strategyVersionId: string;
  strategy: StrategyDefinition;
  snapshot: DataSnapshot;
  initialCapital: number;
  previous?: LatestBarMonitoringStatus | null;
}

function newestCompletedDate(strategy: StrategyDefinition, snapshot: DataSnapshot): string {
  const dates = strategy.universe.flatMap((symbol) => (snapshot.bars[symbol] ?? []).map((bar) => bar.date));
  const value = dates.sort().at(-1);
  if (!value) throw new RangeError("Latest-bar monitoring requires completed daily bars");
  for (const symbol of strategy.universe) {
    if (!(snapshot.bars[symbol] ?? []).some((bar) => bar.date === value)) {
      throw new RangeError(`Latest completed bar is unavailable for ${symbol}`);
    }
  }
  return value;
}

function signalFor(symbol: string, strategy: StrategyDefinition, snapshot: DataSnapshot, date: string): MonitoringSignal {
  const bars = snapshot.bars[symbol as CuratedSymbol] ?? [];
  const index = bars.findIndex((bar) => bar.date === date);
  const bar = bars[index];
  if (!bar || index < 0) throw new RangeError(`Latest completed bar is unavailable for ${symbol}`);
  return {
    symbol,
    completedBarDate: date,
    close: bar.close,
    entry: evaluateCondition(strategy.entry, bars).values[index] ?? null,
    exit: evaluateCondition(strategy.exit, bars).values[index] ?? null,
  };
}

function changesFrom(previous: LatestBarMonitoringStatus | null | undefined, current: Omit<LatestBarMonitoringStatus, "changes">): MonitoringChange[] {
  if (!previous) return [];
  const changes: MonitoringChange[] = [];
  for (const signal of current.signals) {
    const before = previous.signals.find((item) => item.symbol === signal.symbol);
    if (signal.entry === true && before?.entry !== true) {
      changes.push({ type: "entry_signal_activated", symbol: signal.symbol, before: before?.entry ?? null, after: true });
    }
    if (signal.exit === true && before?.exit !== true) {
      changes.push({ type: "exit_signal_activated", symbol: signal.symbol, before: before?.exit ?? null, after: true });
    }
  }
  if (previous.currentRegime !== current.currentRegime) {
    changes.push({ type: "regime_changed", before: previous.currentRegime, after: current.currentRegime });
  }
  for (const metric of ["numberOfTrades", "maximumDrawdownPercent", "expectancyPerTrade"] as const) {
    const before = previous.metrics[metric];
    const after = current.metrics[metric];
    if (before !== after) changes.push({ type: "metrics_changed", metric, before, after });
  }
  return changes;
}

export function evaluateLatestCompletedBar(input: LatestBarMonitoringInput): LatestBarMonitoringStatus {
  const strategy = parseStrategyDefinition(input.strategy);
  const snapshot = parseDataSnapshot(input.snapshot);
  const evaluatedDate = newestCompletedDate(strategy, snapshot);
  const result = runBacktest({
    strategy,
    snapshot,
    initialCapital: input.initialCapital,
    dateRange: { start: snapshot.startDate, end: evaluatedDate },
  });
  const regimes = classifyMarketRegimes(snapshot);
  const signals = strategy.universe.map((symbol) => signalFor(symbol, strategy, snapshot, evaluatedDate));
  const warnings = [HISTORICAL_LIMITATION, "Signals are evaluated observations. Strategy Court does not submit orders."];
  if (snapshot.provider === "synthetic_demo") warnings.unshift("Synthetic demo prices, not actual market observations.");
  if (result.diagnostics.missingBars > 0) warnings.unshift(`${result.diagnostics.missingBars} missing market sessions were recorded in this snapshot.`);
  if (input.previous?.evaluatedDate === evaluatedDate) warnings.unshift("No newer completed daily bar was available.");
  const current: Omit<LatestBarMonitoringStatus, "changes"> = {
    strategyVersionId: input.strategyVersionId,
    snapshotId: snapshot.id,
    snapshotFetchedAt: snapshot.fetchedAt,
    evaluatedDate,
    currentRegime: regimes.get(evaluatedDate) ?? "unknown",
    signals,
    positions: result.openPositions,
    metrics: result.metrics,
    warnings,
  };
  return { ...current, changes: changesFrom(input.previous, current) };
}
