import type {
  BacktestInput,
  BacktestResult,
  CuratedSymbol,
  DataSnapshot,
  DateRange,
  ExitReason,
  MarketBar,
  MarketRegime,
  OpenPosition,
  SignalDiagnostic,
  StrategyDefinition,
  Trade,
} from "@strategy-court/schemas";
import { parseDataSnapshot, parseStrategyDefinition } from "@strategy-court/schemas";
import { evaluateCondition } from "./conditions.ts";
import { computeBacktestMetrics } from "./metrics.ts";
import { realizedVolatility, rollingMedian, sma } from "./indicators.ts";

interface Position {
  entryDate: string;
  entryReferencePrice: number;
  entryPrice: number;
  entryCommission: number;
  quantity: number;
  barsHeld: number;
  regime: MarketRegime | "unknown";
}

interface SleeveResult {
  trades: Trade[];
  rawCurve: Array<{ date: string; equity: number }>;
  openPosition: OpenPosition | null;
  exposedBars: number;
  availableBars: number;
  insufficientWarmupBars: number;
  ignoredBars: number;
  rejectedSignals: number;
  signalEvents: SignalDiagnostic[];
}

const round = (value: number): number => Math.round((value + Number.EPSILON) * 1e10) / 1e10;

function requestedRange(input: BacktestInput): DateRange {
  return input.dateRange ?? { start: input.snapshot.startDate, end: input.snapshot.endDate };
}

function within(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function classifyMarketRegimes(snapshot: DataSnapshot): Map<string, MarketRegime | "unknown"> {
  const spy = snapshot.bars.SPY ?? [];
  const closes = spy.map((bar) => bar.close);
  const trend = sma(closes, 200);
  const volatility = realizedVolatility(closes, 20);
  const volatilityMedian = rollingMedian(volatility, 252);
  const regimes = new Map<string, MarketRegime | "unknown">();
  spy.forEach((bar, index) => {
    const average = trend[index];
    const vol = volatility[index];
    const median = volatilityMedian[index];
    if (average == null || vol == null || median == null) regimes.set(bar.date, "unknown");
    else regimes.set(bar.date, `${bar.close > average ? "positive" : "negative"}_${vol > median ? "high" : "low"}` as MarketRegime);
  });
  return regimes;
}

function closeTrade(
  symbol: CuratedSymbol,
  position: Position,
  date: string,
  referencePrice: number,
  reason: ExitReason,
  commissionRate: number,
  slippageRate: number,
): { trade: Trade; proceeds: number } {
  const exitPrice = referencePrice * (1 - slippageRate);
  const exitNotional = exitPrice * position.quantity;
  const exitCommission = exitNotional * commissionRate;
  const entryPaid = position.entryPrice * position.quantity + position.entryCommission;
  const proceeds = exitNotional - exitCommission;
  const grossProfit = (referencePrice - position.entryReferencePrice) * position.quantity;
  const netProfit = proceeds - entryPaid;
  const costs = grossProfit - netProfit;
  return {
    proceeds,
    trade: {
      symbol,
      entryDate: position.entryDate,
      entryReferencePrice: round(position.entryReferencePrice),
      entryPrice: round(position.entryPrice),
      exitDate: date,
      exitReferencePrice: round(referencePrice),
      exitPrice: round(exitPrice),
      quantity: round(position.quantity),
      grossProfit: round(grossProfit),
      costs: round(costs),
      netProfit: round(netProfit),
      returnPercent: round(entryPaid > 0 ? netProfit / entryPaid * 100 : 0),
      holdingDays: Math.max(1, position.barsHeld),
      entryReason: "entry_condition",
      exitReason: reason,
      marketRegime: position.regime,
    },
  };
}

function simulateSleeve(
  symbol: CuratedSymbol,
  allBars: readonly MarketBar[],
  strategy: StrategyDefinition,
  range: DateRange,
  startingCapital: number,
  regimes: ReadonlyMap<string, MarketRegime | "unknown">,
): SleeveResult {
  const entry = evaluateCondition(strategy.entry, allBars);
  const exit = evaluateCondition(strategy.exit, allBars);
  const commissionRate = strategy.costs.commissionBpsPerSide / 10_000;
  const slippageRate = strategy.costs.slippageBpsPerSide / 10_000;
  let cash = startingCapital;
  let position: Position | null = null;
  let pendingEntry = false;
  let pendingExit: ExitReason | null = null;
  let exposedBars = 0;
  let availableBars = 0;
  let insufficientWarmupBars = 0;
  let ignoredBars = 0;
  const trades: Trade[] = [];
  const rawCurve: Array<{ date: string; equity: number }> = [];
  const signalEvents: SignalDiagnostic[] = [];

  for (let index = 0; index < allBars.length; index += 1) {
    const bar = allBars[index];
    if (!bar || !within(bar.date, range)) continue;
    availableBars += 1;

    if (pendingExit && position) {
      const closed = closeTrade(symbol, position, bar.date, bar.open, pendingExit, commissionRate, slippageRate);
      cash = closed.proceeds;
      trades.push(closed.trade);
      position = null;
      pendingExit = null;
    }

    if (pendingEntry && !position) {
      const entryPrice = bar.open * (1 + slippageRate);
      const quantity = cash / (entryPrice * (1 + commissionRate));
      const entryCommission = entryPrice * quantity * commissionRate;
      position = {
        entryDate: bar.date,
        entryReferencePrice: bar.open,
        entryPrice,
        entryCommission,
        quantity,
        barsHeld: 0,
        regime: regimes.get(bar.date) ?? "unknown",
      };
      cash = Math.max(0, cash - entryPrice * quantity - entryCommission);
      pendingEntry = false;
    }

    if (position) {
      const stopPrice = strategy.risk.stopLossPercent === undefined ? null : position.entryPrice * (1 - strategy.risk.stopLossPercent / 100);
      const takePrice = strategy.risk.takeProfitPercent === undefined ? null : position.entryPrice * (1 + strategy.risk.takeProfitPercent / 100);
      let riskExit: { price: number; reason: ExitReason } | null = null;
      if (stopPrice !== null && bar.open <= stopPrice) riskExit = { price: bar.open, reason: "stop_loss" };
      else if (takePrice !== null && bar.open >= takePrice) riskExit = { price: bar.open, reason: "take_profit" };
      else {
        const stopTouched = stopPrice !== null && bar.low <= stopPrice;
        const takeTouched = takePrice !== null && bar.high >= takePrice;
        if (stopTouched) riskExit = { price: stopPrice as number, reason: "stop_loss" };
        else if (takeTouched) riskExit = { price: takePrice as number, reason: "take_profit" };
      }
      if (riskExit) {
        const closed = closeTrade(symbol, position, bar.date, riskExit.price, riskExit.reason, commissionRate, slippageRate);
        cash = closed.proceeds;
        trades.push(closed.trade);
        position = null;
        pendingExit = null;
      }
    }

    if (position) {
      exposedBars += 1;
      position.barsHeld += 1;
    }

    const entryValue = entry.values[index];
    const exitValue = exit.values[index];
    if (entryValue === null || exitValue === null) {
      insufficientWarmupBars += 1;
      ignoredBars += 1;
    }
    if (entryValue === null) signalEvents.push({ symbol, date: bar.date, signal: "entry", status: "skipped", reason: "required_values_unavailable" });
    if (exitValue === null) signalEvents.push({ symbol, date: bar.date, signal: "exit", status: "skipped", reason: "required_values_unavailable" });
    if (position && !pendingExit) {
      if (entryValue === true) signalEvents.push({ symbol, date: bar.date, signal: "entry", status: "rejected", reason: "position_already_open" });
      if (exitValue === true) pendingExit = "rule";
      else if (strategy.risk.maxHoldingDays !== undefined && position.barsHeld >= strategy.risk.maxHoldingDays) pendingExit = "max_holding_days";
    } else if (!position) {
      if (exitValue === true) signalEvents.push({ symbol, date: bar.date, signal: "exit", status: "rejected", reason: "no_open_position" });
      if (!pendingEntry && entryValue === true) pendingEntry = true;
    }

    const equity = position ? cash + position.quantity * bar.close : cash;
    rawCurve.push({ date: bar.date, equity });
  }
  const lastBar = [...allBars].reverse().find((bar) => within(bar.date, range));
  if (lastBar && pendingEntry) signalEvents.push({ symbol, date: lastBar.date, signal: "entry", status: "rejected", reason: "no_next_bar" });
  if (lastBar && pendingExit) signalEvents.push({ symbol, date: lastBar.date, signal: "exit", status: "rejected", reason: "no_next_bar" });
  return {
    trades,
    rawCurve,
    openPosition: position && lastBar ? {
      symbol,
      entryDate: position.entryDate,
      entryPrice: round(position.entryPrice),
      quantity: round(position.quantity),
      barsHeld: position.barsHeld,
      markedPrice: lastBar.close,
      unrealizedProfit: round(position.quantity * (lastBar.close - position.entryPrice) - position.entryCommission),
    } : null,
    exposedBars,
    availableBars,
    insufficientWarmupBars,
    ignoredBars,
    rejectedSignals: signalEvents.filter((event) => event.status === "rejected").length,
    signalEvents,
  };
}

function aggregateCurves(sleeves: readonly SleeveResult[], dates: readonly string[], capitalPerSleeve: number): Array<{ date: string; equity: number }> {
  const maps = sleeves.map((sleeve) => new Map(sleeve.rawCurve.map((point) => [point.date, point.equity])));
  const latest = sleeves.map(() => capitalPerSleeve);
  return dates.map((date) => {
    maps.forEach((map, index) => {
      const value = map.get(date);
      if (value !== undefined) latest[index] = value;
    });
    return { date, equity: latest.reduce((sum, value) => sum + value, 0) };
  });
}

function benchmarkReturn(snapshot: DataSnapshot, symbol: string, range: DateRange): number | null {
  const bars = snapshot.bars[symbol as CuratedSymbol]?.filter((bar) => within(bar.date, range)) ?? [];
  const first = bars[0];
  const last = bars.at(-1);
  return first && last ? (last.close / first.close - 1) * 100 : null;
}

export function runBacktest(input: BacktestInput): BacktestResult {
  const strategy = parseStrategyDefinition(input.strategy);
  const snapshot = parseDataSnapshot(input.snapshot);
  if (!Number.isFinite(input.initialCapital) || input.initialCapital <= 0) throw new RangeError("Initial capital must be positive");
  const range = requestedRange(input);
  if (range.start > range.end) throw new RangeError("Backtest start must not follow end");
  for (const symbol of strategy.universe) {
    if (!snapshot.symbols.includes(symbol)) throw new RangeError(`Data snapshot does not declare required symbol ${symbol}`);
    if (!(snapshot.bars[symbol] ?? []).some((bar) => within(bar.date, range))) throw new RangeError(`No ${symbol} bars exist inside the requested range`);
  }
  const regimes = classifyMarketRegimes(snapshot);
  const capitalPerSleeve = input.initialCapital / strategy.universe.length;
  const sleeves = strategy.universe.map((symbol) => simulateSleeve(symbol, snapshot.bars[symbol] ?? [], strategy, range, capitalPerSleeve, regimes));
  const dates = [...new Set(strategy.universe.flatMap((symbol) => (snapshot.bars[symbol] ?? []).filter((bar) => within(bar.date, range)).map((bar) => bar.date)))].sort();
  const rawEquityCurve = aggregateCurves(sleeves, dates, capitalPerSleeve);
  const trades = sleeves.flatMap((sleeve) => sleeve.trades).sort((left, right) => left.exitDate.localeCompare(right.exitDate) || left.symbol.localeCompare(right.symbol));
  const signalEvents = sleeves.flatMap((sleeve) => sleeve.signalEvents).sort((left, right) => left.date.localeCompare(right.date) || left.symbol.localeCompare(right.symbol) || left.signal.localeCompare(right.signal));
  const measured = computeBacktestMetrics({
    initialCapital: input.initialCapital,
    rawEquityCurve,
    trades,
    benchmarkReturnPercent: benchmarkReturn(snapshot, input.benchmarkSymbol ?? "SPY", range),
    exposedBars: sleeves.reduce((sum, sleeve) => sum + sleeve.exposedBars, 0),
    availableBars: sleeves.reduce((sum, sleeve) => sum + sleeve.availableBars, 0),
  });
  return {
    strategyName: strategy.name,
    dateRange: range,
    trades,
    equityCurve: measured.equityCurve,
    metrics: measured.metrics,
    openPositions: sleeves.map((sleeve) => sleeve.openPosition).filter((position): position is OpenPosition => position !== null),
    diagnostics: {
      insufficientWarmupBars: sleeves.reduce((sum, sleeve) => sum + sleeve.insufficientWarmupBars, 0),
      missingBars: strategy.universe.reduce((sum, symbol) => sum + (snapshot.missingBars?.[symbol] ?? 0), 0),
      ignoredBars: sleeves.reduce((sum, sleeve) => sum + sleeve.ignoredBars, 0),
      rejectedSignals: sleeves.reduce((sum, sleeve) => sum + sleeve.rejectedSignals, 0),
      signalEvents,
    },
  };
}
