import {
  resolveIndicatorParameters,
  type ExecutableIndicatorId,
  type IndicatorParameters,
  type MarketBar,
  type PriceSource,
} from "@strategy-court/schemas";

export type NullableSeries = Array<number | null>;

function validPeriod(period: number): number {
  if (!Number.isFinite(period) || period < 1) throw new RangeError("Indicator period must be at least one");
  return Math.round(period);
}

function numberAt(values: readonly (number | null)[], index: number): number | null {
  const value = values[index];
  return value === undefined ? null : value;
}

export function sourceSeries(bars: readonly MarketBar[], source: PriceSource): number[] {
  return bars.map((bar) => {
    switch (source) {
      case "open": return bar.open;
      case "high": return bar.high;
      case "low": return bar.low;
      case "close": return bar.close;
      case "volume": return bar.volume;
      case "hl2": return (bar.high + bar.low) / 2;
      case "hlc3": return (bar.high + bar.low + bar.close) / 3;
      case "ohlc4": return (bar.open + bar.high + bar.low + bar.close) / 4;
    }
  });
}

export function rollingSum(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  const result: NullableSeries = Array(values.length).fill(null);
  let sum = 0;
  let valid = 0;
  for (let index = 0; index < values.length; index += 1) {
    const current = numberAt(values, index);
    if (current !== null) { sum += current; valid += 1; }
    if (index >= period) {
      const leaving = numberAt(values, index - period);
      if (leaving !== null) { sum -= leaving; valid -= 1; }
    }
    if (valid === period) result[index] = sum;
  }
  return result;
}

export function sma(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  return rollingSum(values, period).map((value) => value === null ? null : value / period);
}

export const rollingAverage = sma;

function smoothedAverage(values: readonly (number | null)[], requestedPeriod: number, alpha: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  const seeds = sma(values, period);
  const result: NullableSeries = Array(values.length).fill(null);
  let previous: number | null = null;
  for (let index = 0; index < values.length; index += 1) {
    const current = numberAt(values, index);
    if (previous === null) {
      const seed = numberAt(seeds, index);
      if (seed !== null) { previous = seed; result[index] = seed; }
      continue;
    }
    if (current === null) { previous = null; continue; }
    previous += alpha * (current - previous);
    result[index] = previous;
  }
  return result;
}

export function ema(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  return smoothedAverage(values, period, 2 / (period + 1));
}

export function rma(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  return smoothedAverage(values, period, 1 / period);
}

export function wma(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  const denominator = period * (period + 1) / 2;
  return values.map((_, index) => {
    if (index < period - 1) return null;
    let weighted = 0;
    for (let offset = 0; offset < period; offset += 1) {
      const value = numberAt(values, index - period + 1 + offset);
      if (value === null) return null;
      weighted += value * (offset + 1);
    }
    return weighted / denominator;
  });
}

export function hma(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  const half = wma(values, Math.max(1, Math.round(period / 2)));
  const full = wma(values, period);
  const difference = values.map((_, index) => {
    const short = numberAt(half, index);
    const long = numberAt(full, index);
    return short === null || long === null ? null : 2 * short - long;
  });
  return wma(difference, Math.max(1, Math.round(Math.sqrt(period))));
}

export function vwma(values: readonly (number | null)[], volumes: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  const weighted = values.map((value, index) => {
    const volume = numberAt(volumes, index);
    return value === null || volume === null ? null : value * volume;
  });
  const numerator = rollingSum(weighted, period);
  const denominator = rollingSum(volumes, period);
  return numerator.map((value, index) => {
    const volume = numberAt(denominator, index);
    return value === null || volume === null || volume === 0 ? null : value / volume;
  });
}

export function dema(values: readonly (number | null)[], period: number): NullableSeries {
  const first = ema(values, period);
  const second = ema(first, period);
  return first.map((value, index) => {
    const nested = numberAt(second, index);
    return value === null || nested === null ? null : 2 * value - nested;
  });
}

export function tema(values: readonly (number | null)[], period: number): NullableSeries {
  const first = ema(values, period);
  const second = ema(first, period);
  const third = ema(second, period);
  return first.map((value, index) => {
    const twice = numberAt(second, index);
    const thrice = numberAt(third, index);
    return value === null || twice === null || thrice === null ? null : 3 * value - 3 * twice + thrice;
  });
}

export function rsi(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  const gains: NullableSeries = values.map((value, index) => {
    const previous = numberAt(values, index - 1);
    return index === 0 || value === null || previous === null ? null : Math.max(value - previous, 0);
  });
  const losses: NullableSeries = values.map((value, index) => {
    const previous = numberAt(values, index - 1);
    return index === 0 || value === null || previous === null ? null : Math.max(previous - value, 0);
  });
  // Wilder's first RSI uses period changes, so seed the smoothers at index period.
  const result: NullableSeries = Array(values.length).fill(null);
  if (values.length <= period) return result;
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const gain = numberAt(gains, index);
    const loss = numberAt(losses, index);
    if (gain === null || loss === null) return result;
    averageGain += gain / period;
    averageLoss += loss / period;
  }
  result[period] = rsiFromAverages(averageGain, averageLoss);
  for (let index = period + 1; index < values.length; index += 1) {
    const gain = numberAt(gains, index);
    const loss = numberAt(losses, index);
    if (gain === null || loss === null) continue;
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    result[index] = rsiFromAverages(averageGain, averageLoss);
  }
  return result;
}

function rsiFromAverages(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  if (averageGain === 0) return 0;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

export interface TrueRangeBar { high: number; low: number; close: number }

export function trueRange(bars: readonly TrueRangeBar[]): number[] {
  return bars.map((bar, index) => {
    const previous = bars[index - 1];
    if (!previous) return bar.high - bar.low;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previous.close), Math.abs(bar.low - previous.close));
  });
}

export function atr(bars: readonly TrueRangeBar[], requestedPeriod: number): NullableSeries {
  return rma(trueRange(bars), requestedPeriod);
}

export function standardDeviation(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    if (window.some((value) => value === null)) return null;
    const numbers = window as number[];
    const mean = numbers.reduce((sum, value) => sum + value, 0) / period;
    return Math.sqrt(numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period);
  });
}

export function realizedVolatility(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  const returns: NullableSeries = values.map((value, index) => {
    const previous = numberAt(values, index - 1);
    return value !== null && previous !== null && previous > 0 ? Math.log(value / previous) : null;
  });
  return standardDeviation(returns, period).map((value) => value === null ? null : value * Math.sqrt(252) * 100);
}

function rollingExtreme(values: readonly (number | null)[], requestedPeriod: number, direction: "highest" | "lowest"): NullableSeries {
  const period = validPeriod(requestedPeriod);
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    if (window.some((value) => value === null)) return null;
    return direction === "highest" ? Math.max(...window as number[]) : Math.min(...window as number[]);
  });
}

export const highest = (values: readonly (number | null)[], period: number): NullableSeries => rollingExtreme(values, period, "highest");
export const lowest = (values: readonly (number | null)[], period: number): NullableSeries => rollingExtreme(values, period, "lowest");

export function percentageChange(values: readonly (number | null)[], requestedPeriod = 1): NullableSeries {
  const period = validPeriod(requestedPeriod);
  return values.map((value, index) => {
    const previous = numberAt(values, index - period);
    return value === null || previous === null || previous === 0 ? null : (value / previous - 1) * 100;
  });
}

export function lag(values: readonly (number | null)[], bars: number): NullableSeries {
  const offset = Math.round(bars);
  if (!Number.isFinite(bars) || offset < 0) throw new RangeError("Lag cannot reference future bars");
  return values.map((_, index) => index >= offset ? numberAt(values, index - offset) : null);
}

export function crossover(left: readonly (number | null)[], right: readonly (number | null)[]): Array<boolean | null> {
  return left.map((value, index) => {
    const currentRight = numberAt(right, index);
    const previousLeft = numberAt(left, index - 1);
    const previousRight = numberAt(right, index - 1);
    if (value === null || currentRight === null || previousLeft === null || previousRight === null) return null;
    return previousLeft <= previousRight && value > currentRight;
  });
}

export function crossunder(left: readonly (number | null)[], right: readonly (number | null)[]): Array<boolean | null> {
  return left.map((value, index) => {
    const currentRight = numberAt(right, index);
    const previousLeft = numberAt(left, index - 1);
    const previousRight = numberAt(right, index - 1);
    if (value === null || currentRight === null || previousLeft === null || previousRight === null) return null;
    return previousLeft >= previousRight && value < currentRight;
  });
}

export function rollingMedian(values: readonly (number | null)[], requestedPeriod: number): NullableSeries {
  const period = validPeriod(requestedPeriod);
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    if (window.some((value) => value === null)) return null;
    const sorted = [...window as number[]].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] ?? null : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  });
}

function stochastic(bars: readonly MarketBar[], period: number, smoothK: number, smoothD: number, selected: "k" | "d"): NullableSeries {
  const highs = highest(bars.map((bar) => bar.high), period);
  const lows = lowest(bars.map((bar) => bar.low), period);
  const raw = bars.map((bar, index) => {
    const high = numberAt(highs, index);
    const low = numberAt(lows, index);
    if (high === null || low === null) return null;
    return high === low ? 50 : (bar.close - low) / (high - low) * 100;
  });
  const k = sma(raw, smoothK);
  return selected === "k" ? k : sma(k, smoothD);
}

function stochasticRsi(values: readonly number[], period: number, smoothK: number, smoothD: number, selected: "k" | "d"): NullableSeries {
  const strength = rsi(values, period);
  const highs = highest(strength, period);
  const lows = lowest(strength, period);
  const raw = strength.map((value, index) => {
    const high = numberAt(highs, index);
    const low = numberAt(lows, index);
    return value === null || high === null || low === null ? null : high === low ? 50 : (value - low) / (high - low) * 100;
  });
  const k = sma(raw, smoothK);
  return selected === "k" ? k : sma(k, smoothD);
}

function macd(values: readonly number[], fast: number, slow: number, signalPeriod: number, component: "line" | "signal" | "histogram"): NullableSeries {
  const fastLine = ema(values, fast);
  const slowLine = ema(values, slow);
  const line = values.map((_, index) => {
    const left = numberAt(fastLine, index);
    const right = numberAt(slowLine, index);
    return left === null || right === null ? null : left - right;
  });
  if (component === "line") return line;
  const signal = ema(line, signalPeriod);
  if (component === "signal") return signal;
  return line.map((value, index) => {
    const signalValue = numberAt(signal, index);
    return value === null || signalValue === null ? null : value - signalValue;
  });
}

function cci(values: readonly number[], period: number): NullableSeries {
  const average = sma(values, period);
  return values.map((value, index) => {
    const mean = numberAt(average, index);
    if (mean === null) return null;
    const window = values.slice(index - period + 1, index + 1);
    const deviation = window.reduce((sum, current) => sum + Math.abs(current - mean), 0) / period;
    return deviation === 0 ? 0 : (value - mean) / (0.015 * deviation);
  });
}

function momentum(values: readonly number[], period: number): NullableSeries {
  return values.map((value, index) => {
    const previous = values[index - period];
    return previous === undefined ? null : value - previous;
  });
}

function williamsR(bars: readonly MarketBar[], period: number): NullableSeries {
  const highs = highest(bars.map((bar) => bar.high), period);
  const lows = lowest(bars.map((bar) => bar.low), period);
  return bars.map((bar, index) => {
    const high = numberAt(highs, index);
    const low = numberAt(lows, index);
    return high === null || low === null ? null : high === low ? -50 : (high - bar.close) / (high - low) * -100;
  });
}

function adx(bars: readonly MarketBar[], period: number, component: "adx" | "plus_di" | "minus_di"): NullableSeries {
  const upward: number[] = bars.map((bar, index) => index === 0 ? 0 : Math.max(bar.high - (bars[index - 1]?.high ?? bar.high), 0));
  const downward: number[] = bars.map((bar, index) => index === 0 ? 0 : Math.max((bars[index - 1]?.low ?? bar.low) - bar.low, 0));
  const plusMovement = upward.map((value, index) => value > (downward[index] ?? 0) ? value : 0);
  const minusMovement = downward.map((value, index) => value > (upward[index] ?? 0) ? value : 0);
  const ranges = rma(trueRange(bars), period);
  const plusSmooth = rma(plusMovement, period);
  const minusSmooth = rma(minusMovement, period);
  const plus = ranges.map((range, index) => {
    const movement = numberAt(plusSmooth, index);
    return range === null || movement === null || range === 0 ? null : movement / range * 100;
  });
  const minus = ranges.map((range, index) => {
    const movement = numberAt(minusSmooth, index);
    return range === null || movement === null || range === 0 ? null : movement / range * 100;
  });
  if (component === "plus_di") return plus;
  if (component === "minus_di") return minus;
  const dx = plus.map((value, index) => {
    const minusValue = numberAt(minus, index);
    return value === null || minusValue === null || value + minusValue === 0 ? null : Math.abs(value - minusValue) / (value + minusValue) * 100;
  });
  return rma(dx, period);
}

function aroon(bars: readonly MarketBar[], period: number, component: "up" | "down" | "oscillator"): NullableSeries {
  const up: NullableSeries = Array(bars.length).fill(null);
  const down: NullableSeries = Array(bars.length).fill(null);
  for (let index = period - 1; index < bars.length; index += 1) {
    let highOffset = 0;
    let lowOffset = 0;
    for (let offset = 1; offset < period; offset += 1) {
      const current = bars[index - offset];
      const highBar = bars[index - highOffset];
      const lowBar = bars[index - lowOffset];
      if (current && highBar && current.high > highBar.high) highOffset = offset;
      if (current && lowBar && current.low < lowBar.low) lowOffset = offset;
    }
    const denominator = Math.max(1, period - 1);
    up[index] = (period - 1 - highOffset) / denominator * 100;
    down[index] = (period - 1 - lowOffset) / denominator * 100;
  }
  if (component === "up") return up;
  if (component === "down") return down;
  return up.map((value, index) => {
    const downValue = numberAt(down, index);
    return value === null || downValue === null ? null : value - downValue;
  });
}

function bollinger(values: readonly number[], period: number, deviations: number, component: string): NullableSeries {
  const middle = sma(values, period);
  const spread = standardDeviation(values, period);
  return values.map((value, index) => {
    const center = numberAt(middle, index);
    const deviation = numberAt(spread, index);
    if (center === null || deviation === null) return null;
    const upper = center + deviations * deviation;
    const lower = center - deviations * deviation;
    if (component === "upper") return upper;
    if (component === "middle") return center;
    if (component === "lower") return lower;
    if (component === "width") return center === 0 ? null : (upper - lower) / center;
    return upper === lower ? 0.5 : (value - lower) / (upper - lower);
  });
}

function keltner(bars: readonly MarketBar[], values: readonly number[], period: number, atrPeriod: number, multiplier: number, component: string): NullableSeries {
  const middle = ema(values, period);
  const ranges = atr(bars, atrPeriod);
  return middle.map((center, index) => {
    const range = numberAt(ranges, index);
    if (center === null || range === null) return null;
    if (component === "upper") return center + multiplier * range;
    if (component === "lower") return center - multiplier * range;
    return center;
  });
}

function donchian(bars: readonly MarketBar[], period: number, component: string): NullableSeries {
  const upper = highest(bars.map((bar) => bar.high), period);
  const lower = lowest(bars.map((bar) => bar.low), period);
  if (component === "upper") return upper;
  if (component === "lower") return lower;
  return upper.map((value, index) => {
    const low = numberAt(lower, index);
    return value === null || low === null ? null : (value + low) / 2;
  });
}

function supertrend(bars: readonly MarketBar[], atrPeriod: number, multiplier: number, component: "line" | "direction"): NullableSeries {
  const ranges = atr(bars, atrPeriod);
  const upper: NullableSeries = Array(bars.length).fill(null);
  const lower: NullableSeries = Array(bars.length).fill(null);
  const line: NullableSeries = Array(bars.length).fill(null);
  const direction: NullableSeries = Array(bars.length).fill(null);
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const range = numberAt(ranges, index);
    if (!bar || range === null) continue;
    const midpoint = (bar.high + bar.low) / 2;
    const basicUpper = midpoint + multiplier * range;
    const basicLower = midpoint - multiplier * range;
    const previousBar = bars[index - 1];
    const previousUpper = numberAt(upper, index - 1);
    const previousLower = numberAt(lower, index - 1);
    upper[index] = previousUpper === null || !previousBar || basicUpper < previousUpper || previousBar.close > previousUpper ? basicUpper : previousUpper;
    lower[index] = previousLower === null || !previousBar || basicLower > previousLower || previousBar.close < previousLower ? basicLower : previousLower;
    const previousLine = numberAt(line, index - 1);
    if (previousLine === null) direction[index] = bar.close >= midpoint ? 1 : -1;
    else if (previousUpper !== null && previousLine === previousUpper) direction[index] = bar.close > (upper[index] as number) ? 1 : -1;
    else direction[index] = bar.close < (lower[index] as number) ? -1 : 1;
    line[index] = direction[index] === 1 ? lower[index] ?? null : upper[index] ?? null;
  }
  return component === "direction" ? direction : line;
}

function parabolicSar(bars: readonly MarketBar[], acceleration: number, maximum: number): NullableSeries {
  const result: NullableSeries = Array(bars.length).fill(null);
  if (bars.length === 0) return result;
  if (bars.length === 1) { result[0] = bars[0]?.low ?? null; return result; }
  let rising = (bars[1]?.close ?? 0) >= (bars[0]?.close ?? 0);
  let sar = rising ? (bars[0]?.low ?? 0) : (bars[0]?.high ?? 0);
  let extreme = rising ? Math.max(bars[0]?.high ?? 0, bars[1]?.high ?? 0) : Math.min(bars[0]?.low ?? 0, bars[1]?.low ?? 0);
  let factor = acceleration;
  result[0] = sar;
  for (let index = 1; index < bars.length; index += 1) {
    const bar = bars[index];
    if (!bar) continue;
    sar += factor * (extreme - sar);
    if (rising) {
      sar = Math.min(sar, bars[index - 1]?.low ?? sar, bars[index - 2]?.low ?? sar);
      if (bar.low < sar) { rising = false; sar = extreme; extreme = bar.low; factor = acceleration; }
      else if (bar.high > extreme) { extreme = bar.high; factor = Math.min(maximum, factor + acceleration); }
    } else {
      sar = Math.max(sar, bars[index - 1]?.high ?? sar, bars[index - 2]?.high ?? sar);
      if (bar.high > sar) { rising = true; sar = extreme; extreme = bar.high; factor = acceleration; }
      else if (bar.low < extreme) { extreme = bar.low; factor = Math.min(maximum, factor + acceleration); }
    }
    result[index] = sar;
  }
  return result;
}

function obv(bars: readonly MarketBar[]): NullableSeries {
  let total = 0;
  return bars.map((bar, index) => {
    const previous = bars[index - 1];
    if (previous) total += bar.close > previous.close ? bar.volume : bar.close < previous.close ? -bar.volume : 0;
    return total;
  });
}

function mfi(bars: readonly MarketBar[], period: number): NullableSeries {
  const typical = bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
  const positive = bars.map((bar, index) => index === 0 || typical[index] === typical[index - 1] ? 0 : typical[index]! > typical[index - 1]! ? typical[index]! * bar.volume : 0);
  const negative = bars.map((bar, index) => index === 0 || typical[index] === typical[index - 1] ? 0 : typical[index]! < typical[index - 1]! ? typical[index]! * bar.volume : 0);
  const positiveSum = rollingSum(positive, period);
  const negativeSum = rollingSum(negative, period);
  return positiveSum.map((value, index) => {
    const negativeFlow = numberAt(negativeSum, index);
    if (value === null || negativeFlow === null) return null;
    if (negativeFlow === 0) return value === 0 ? 50 : 100;
    return 100 - 100 / (1 + value / negativeFlow);
  });
}

function moneyFlowVolume(bars: readonly MarketBar[]): number[] {
  return bars.map((bar) => bar.high === bar.low ? 0 : ((bar.close - bar.low) - (bar.high - bar.close)) / (bar.high - bar.low) * bar.volume);
}

function chaikinMoneyFlow(bars: readonly MarketBar[], period: number): NullableSeries {
  const flow = rollingSum(moneyFlowVolume(bars), period);
  const volume = rollingSum(bars.map((bar) => bar.volume), period);
  return flow.map((value, index) => {
    const volumeValue = numberAt(volume, index);
    return value === null || volumeValue === null || volumeValue === 0 ? null : value / volumeValue;
  });
}

function accumulationDistribution(bars: readonly MarketBar[]): NullableSeries {
  let total = 0;
  return moneyFlowVolume(bars).map((value) => (total += value));
}

export function calculateIndicator(
  indicator: ExecutableIndicatorId,
  suppliedParameters: IndicatorParameters,
  bars: readonly MarketBar[],
): NullableSeries {
  const parameters = resolveIndicatorParameters(indicator, suppliedParameters);
  const period = parameters.period ?? 1;
  const values = sourceSeries(bars, parameters.source ?? "close");
  switch (indicator) {
    case "sma": return sma(values, period);
    case "ema": return ema(values, period);
    case "wma": return wma(values, period);
    case "rma": return rma(values, period);
    case "hma": return hma(values, period);
    case "vwma": return vwma(values, bars.map((bar) => bar.volume), period);
    case "dema": return dema(values, period);
    case "tema": return tema(values, period);
    case "rsi": return rsi(values, period);
    case "stochastic": return stochastic(bars, period, parameters.smoothK!, parameters.smoothD!, parameters.component as "k" | "d");
    case "stochastic_rsi": return stochasticRsi(values, period, parameters.smoothK!, parameters.smoothD!, parameters.component as "k" | "d");
    case "macd": return macd(values, parameters.fastPeriod!, parameters.slowPeriod!, parameters.signalPeriod!, parameters.component as "line" | "signal" | "histogram");
    case "cci": return cci(values, period);
    case "roc": return percentageChange(values, period);
    case "momentum": return momentum(values, period);
    case "williams_r": return williamsR(bars, period);
    case "adx": return adx(bars, period, parameters.component as "adx" | "plus_di" | "minus_di");
    case "aroon": return aroon(bars, period, parameters.component as "up" | "down" | "oscillator");
    case "atr": return atr(bars, period);
    case "bollinger": return bollinger(values, period, parameters.standardDeviations!, parameters.component!);
    case "keltner": return keltner(bars, values, period, parameters.atrPeriod!, parameters.multiplier!, parameters.component!);
    case "donchian": return donchian(bars, period, parameters.component!);
    case "standard_deviation": return standardDeviation(values, period);
    case "realized_volatility": return realizedVolatility(values, period);
    case "supertrend": return supertrend(bars, parameters.atrPeriod!, parameters.multiplier!, parameters.component as "line" | "direction");
    case "parabolic_sar": return parabolicSar(bars, parameters.acceleration!, parameters.maximum!);
    case "obv": return obv(bars);
    case "mfi": return mfi(bars, period);
    case "chaikin_money_flow": return chaikinMoneyFlow(bars, period);
    case "accumulation_distribution": return accumulationDistribution(bars);
    case "highest": return highest(values, period);
    case "lowest": return lowest(values, period);
    case "rolling_sum": return rollingSum(values, period);
    case "rolling_average": return rollingAverage(values, period);
    case "percentage_change": return percentageChange(values, period);
  }
}
