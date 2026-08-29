import type {
  BacktestResult,
  ReplayAdvanceRequest,
  ReplayContext,
  ReplayCreateInput,
  ReplaySession,
  ReplayStatus,
  ReplaySymbolSignal,
  Trade,
} from "@strategy-court/schemas";
import { parseReplayAdvance, parseStrategyDefinition } from "@strategy-court/schemas";
import { classifyMarketRegimes, runBacktest } from "./backtest.ts";
import { evaluateCondition } from "./conditions.ts";

export function createReplaySession(input: ReplayCreateInput): ReplaySession {
  const strategy = parseStrategyDefinition(input.strategy);
  if (input.range.start > input.range.end) throw new RangeError("Replay start must not follow end");
  const dates = [...new Set(strategy.universe.flatMap((symbol) => (input.snapshot.bars[symbol] ?? []).filter((bar) => bar.date >= input.range.start && bar.date <= input.range.end).map((bar) => bar.date)))].sort();
  if (dates.length === 0) throw new RangeError("Replay range contains no market bars");
  return {
    id: input.id,
    strategyVersionId: input.strategyVersionId,
    snapshotId: input.snapshot.id,
    range: input.range,
    dates,
    cursor: -1,
    status: "ready",
    baselineMetrics: structuredClone(input.baselineMetrics),
    baselineTradingDays: Math.max(1, input.baselineTradingDays ?? 1),
    initialCapital: input.initialCapital,
  };
}

function resultAt(session: ReplaySession, context: ReplayContext, cursor: number): BacktestResult | null {
  const end = session.dates[cursor];
  if (!end) return null;
  return runBacktest({ strategy: context.strategy, snapshot: context.snapshot, dateRange: { start: session.range.start, end }, initialCapital: session.initialCapital });
}

function tradeKey(trade: Trade): string {
  return `${trade.symbol}|${trade.entryDate}|${trade.exitDate}|${trade.exitReason}`;
}

function signalsAt(session: ReplaySession, context: ReplayContext, cursor: number): ReplaySymbolSignal[] {
  const date = session.dates[cursor];
  if (!date) return context.strategy.universe.map((symbol) => ({ symbol, entry: null, exit: null }));
  return context.strategy.universe.map((symbol) => {
    const bars = context.snapshot.bars[symbol] ?? [];
    const index = bars.findIndex((bar) => bar.date === date);
    if (index < 0) return { symbol, entry: null, exit: null };
    return {
      symbol,
      entry: evaluateCondition(context.strategy.entry, bars).values[index] ?? null,
      exit: evaluateCondition(context.strategy.exit, bars).values[index] ?? null,
    };
  });
}

function nextSignalCursor(session: ReplaySession, context: ReplayContext): number {
  const series = context.strategy.universe.map((symbol) => {
    const bars = context.snapshot.bars[symbol] ?? [];
    return { bars, entry: evaluateCondition(context.strategy.entry, bars).values, exit: evaluateCondition(context.strategy.exit, bars).values };
  });
  for (let cursor = session.cursor + 1; cursor < session.dates.length; cursor += 1) {
    const date = session.dates[cursor];
    if (series.some((item) => {
      const index = item.bars.findIndex((bar) => bar.date === date);
      return index >= 0 && (item.entry[index] === true || item.exit[index] === true);
    })) return cursor;
  }
  return session.dates.length - 1;
}

function nextTradeCursor(session: ReplaySession, context: ReplayContext): number {
  const currentDate = session.dates[session.cursor] ?? "";
  const full = runBacktest({ strategy: context.strategy, snapshot: context.snapshot, dateRange: session.range, initialCapital: session.initialCapital });
  const next = full.trades.find((trade) => trade.exitDate > currentDate);
  return next ? Math.max(session.cursor + 1, session.dates.indexOf(next.exitDate)) : session.dates.length - 1;
}

function replayWarnings(session: ReplaySession, result: BacktestResult | null): string[] {
  if (!result || result.metrics.numberOfTrades === 0) return [];
  const warnings: string[] = [];
  const baseline = session.baselineMetrics;
  const observed = result.metrics;
  if (baseline.winRatePercent !== null && observed.winRatePercent !== null && observed.winRatePercent < baseline.winRatePercent - 20) warnings.push("Probation win rate is more than 20 percentage points below the historical baseline.");
  if (baseline.expectancyPerTrade !== null && observed.expectancyPerTrade !== null && baseline.expectancyPerTrade > 0 && observed.expectancyPerTrade <= 0) warnings.push("Probation expectancy is no longer positive.");
  if (observed.maximumDrawdownPercent > Math.max(5, baseline.maximumDrawdownPercent * 1.25)) warnings.push("Probation drawdown exceeds 125% of the historical maximum drawdown.");
  return warnings;
}

export function getReplayStatus(session: ReplaySession, context: ReplayContext, previousCursor = session.cursor): ReplayStatus {
  const strategy = parseStrategyDefinition(context.strategy);
  const result = resultAt(session, { ...context, strategy }, session.cursor);
  const previousResult = resultAt(session, { ...context, strategy }, previousCursor);
  const previousKeys = new Set(previousResult?.trades.map(tradeKey) ?? []);
  const currentDate = session.dates[session.cursor] ?? null;
  const regimes = classifyMarketRegimes(context.snapshot);
  return {
    session,
    currentDate,
    currentRegime: currentDate ? regimes.get(currentDate) ?? "unknown" : "unknown",
    signals: signalsAt(session, { ...context, strategy }, session.cursor),
    result,
    newTrades: result?.trades.filter((trade) => !previousKeys.has(tradeKey(trade))) ?? [],
    warnings: replayWarnings(session, result),
  };
}

export function advanceReplay(sessionInput: ReplaySession, commandInput: ReplayAdvanceRequest, context: ReplayContext): ReplayStatus {
  const command = parseReplayAdvance(commandInput);
  const session = structuredClone(sessionInput);
  if (session.status === "complete") return getReplayStatus(session, context);
  const previousCursor = session.cursor;
  const fixed = command.mode === "one_bar" ? 1 : command.mode === "five_bars" ? 5 : command.mode === "twenty_bars" ? 20 : null;
  const target = fixed !== null
    ? Math.min(session.dates.length - 1, session.cursor + fixed)
    : command.mode === "next_signal"
      ? nextSignalCursor(session, context)
      : nextTradeCursor(session, context);
  session.cursor = Math.max(0, target);
  session.status = session.cursor >= session.dates.length - 1 ? "complete" : "active";
  return getReplayStatus(session, context, previousCursor);
}
