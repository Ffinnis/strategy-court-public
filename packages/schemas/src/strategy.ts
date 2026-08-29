import type { CuratedSymbol } from "./market.ts";

export const PRICE_SOURCES = ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const BUILT_IN_INDICATOR_IDS = [
  "sma", "ema", "wma", "rma", "hma", "vwma", "dema", "tema",
  "rsi", "stochastic", "stochastic_rsi", "macd", "cci", "roc", "momentum", "williams_r", "adx", "aroon",
  "atr", "bollinger", "keltner", "donchian", "standard_deviation", "realized_volatility", "supertrend", "parabolic_sar",
  "obv", "mfi", "chaikin_money_flow", "accumulation_distribution",
] as const;
export type BuiltInIndicatorId = (typeof BUILT_IN_INDICATOR_IDS)[number];

export const PRIMITIVE_INDICATOR_IDS = ["highest", "lowest", "rolling_sum", "rolling_average", "percentage_change"] as const;
export type PrimitiveIndicatorId = (typeof PRIMITIVE_INDICATOR_IDS)[number];

export const EXECUTABLE_INDICATOR_IDS = [...BUILT_IN_INDICATOR_IDS, ...PRIMITIVE_INDICATOR_IDS] as const;
export type ExecutableIndicatorId = (typeof EXECUTABLE_INDICATOR_IDS)[number];

/** Compatibility alias retained for clients that imported the original P0 name. */
export const P0_INDICATORS = EXECUTABLE_INDICATOR_IDS;
export type P0Indicator = ExecutableIndicatorId;

export type IndicatorParameterType = "integer" | "number" | "source" | "component";

export interface IndicatorParameterDefinition {
  name: string;
  label: string;
  type: IndicatorParameterType;
  required: boolean;
  default: number | string;
  min?: number;
  max?: number;
  options?: readonly string[];
}

export interface IndicatorCatalogDefinition {
  id: ExecutableIndicatorId;
  name: string;
  category: "trend" | "momentum" | "volatility" | "volume" | "primitive";
  parameters: readonly IndicatorParameterDefinition[];
  components: readonly string[];
  outputType: "number";
  version: 1;
  catalog: boolean;
}

const integer = (name: string, label: string, fallback: number, min = 1, max = 2520): IndicatorParameterDefinition => ({
  name, label, type: "integer", required: true, default: fallback, min, max,
});
const numberParameter = (name: string, label: string, fallback: number, min: number, max: number): IndicatorParameterDefinition => ({
  name, label, type: "number", required: true, default: fallback, min, max,
});
const source = (fallback: PriceSource = "close"): IndicatorParameterDefinition => ({
  name: "source", label: "Source", type: "source", required: true, default: fallback, options: PRICE_SOURCES,
});
const component = (options: readonly string[], fallback = options[0] ?? "line"): IndicatorParameterDefinition => ({
  name: "component", label: "Component", type: "component", required: true, default: fallback, options,
});
const definition = (
  id: ExecutableIndicatorId,
  name: string,
  category: IndicatorCatalogDefinition["category"],
  parameters: readonly IndicatorParameterDefinition[],
  components: readonly string[] = [],
  catalog = true,
): IndicatorCatalogDefinition => ({ id, name, category, parameters, components, outputType: "number", version: 1, catalog });

const period20 = () => integer("period", "Period", 20);
const period14 = () => integer("period", "Period", 14);

export const EXECUTABLE_INDICATOR_DEFINITIONS: readonly IndicatorCatalogDefinition[] = [
  definition("sma", "Simple moving average", "trend", [period20(), source()]),
  definition("ema", "Exponential moving average", "trend", [period20(), source()]),
  definition("wma", "Weighted moving average", "trend", [period20(), source()]),
  definition("rma", "Running moving average", "trend", [period20(), source()]),
  definition("hma", "Hull moving average", "trend", [period20(), source()]),
  definition("vwma", "Volume-weighted moving average", "trend", [period20(), source()]),
  definition("dema", "Double exponential moving average", "trend", [period20(), source()]),
  definition("tema", "Triple exponential moving average", "trend", [period20(), source()]),
  definition("rsi", "Relative strength index", "momentum", [period14(), source()]),
  definition("stochastic", "Stochastic oscillator", "momentum", [period14(), integer("smoothK", "K smoothing", 3), integer("smoothD", "D smoothing", 3), component(["k", "d"])], ["k", "d"]),
  definition("stochastic_rsi", "Stochastic RSI", "momentum", [period14(), integer("smoothK", "K smoothing", 3), integer("smoothD", "D smoothing", 3), source(), component(["k", "d"])], ["k", "d"]),
  definition("macd", "MACD", "momentum", [integer("fastPeriod", "Fast period", 12), integer("slowPeriod", "Slow period", 26), integer("signalPeriod", "Signal period", 9), source(), component(["line", "signal", "histogram"])], ["line", "signal", "histogram"]),
  definition("cci", "Commodity channel index", "momentum", [period20(), source("hlc3")]),
  definition("roc", "Rate of change", "momentum", [integer("period", "Period", 12), source()]),
  definition("momentum", "Momentum", "momentum", [integer("period", "Period", 10), source()]),
  definition("williams_r", "Williams %R", "momentum", [period14()]),
  definition("adx", "ADX and directional movement", "momentum", [period14(), component(["adx", "plus_di", "minus_di"])], ["adx", "plus_di", "minus_di"]),
  definition("aroon", "Aroon", "momentum", [integer("period", "Period", 25), component(["up", "down", "oscillator"])], ["up", "down", "oscillator"]),
  definition("atr", "Average true range", "volatility", [period14()]),
  definition("bollinger", "Bollinger bands", "volatility", [period20(), numberParameter("standardDeviations", "Standard deviations", 2, 0.1, 10), source(), component(["upper", "middle", "lower", "width", "percent_b"])], ["upper", "middle", "lower", "width", "percent_b"]),
  definition("keltner", "Keltner channels", "volatility", [period20(), integer("atrPeriod", "ATR period", 10), numberParameter("multiplier", "ATR multiplier", 2, 0.1, 20), source(), component(["upper", "middle", "lower"])], ["upper", "middle", "lower"]),
  definition("donchian", "Donchian channels", "volatility", [period20(), component(["upper", "middle", "lower"])], ["upper", "middle", "lower"]),
  definition("standard_deviation", "Standard deviation", "volatility", [period20(), source()]),
  definition("realized_volatility", "Historical volatility", "volatility", [period20(), source()]),
  definition("supertrend", "Supertrend", "volatility", [integer("atrPeriod", "ATR period", 10), numberParameter("multiplier", "ATR multiplier", 3, 0.1, 20), component(["line", "direction"])], ["line", "direction"]),
  definition("parabolic_sar", "Parabolic SAR", "volatility", [numberParameter("acceleration", "Acceleration", 0.02, 0.001, 1), numberParameter("maximum", "Maximum acceleration", 0.2, 0.001, 1)]),
  definition("obv", "On-balance volume", "volume", []),
  definition("mfi", "Money flow index", "volume", [period14()]),
  definition("chaikin_money_flow", "Chaikin money flow", "volume", [period20()]),
  definition("accumulation_distribution", "Accumulation/distribution", "volume", []),
  definition("highest", "Highest value", "primitive", [period20(), source()], [], false),
  definition("lowest", "Lowest value", "primitive", [period20(), source()], [], false),
  definition("rolling_sum", "Rolling sum", "primitive", [period20(), source()], [], false),
  definition("rolling_average", "Rolling average", "primitive", [period20(), source()], [], false),
  definition("percentage_change", "Percentage change", "primitive", [integer("period", "Lag", 1), source()], [], false),
];

export const BUILT_IN_INDICATOR_DEFINITIONS = EXECUTABLE_INDICATOR_DEFINITIONS.filter((item) => item.catalog);

export function getIndicatorDefinition(id: string): IndicatorCatalogDefinition | undefined {
  return EXECUTABLE_INDICATOR_DEFINITIONS.find((item) => item.id === id);
}

export interface IndicatorParameterIssue { parameter: string; message: string }

export function validateIndicatorParameters(indicatorId: string, value: unknown): IndicatorParameterIssue[] {
  const definition = getIndicatorDefinition(indicatorId);
  if (!definition) return [{ parameter: "indicator", message: "Unknown indicator" }];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ parameter: "parameters", message: "Expected indicator parameters" }];
  }
  const parameters = value as Record<string, unknown>;
  const issues: IndicatorParameterIssue[] = [];
  const allowed = new Set(definition.parameters.map((item) => item.name));
  for (const key of Object.keys(parameters)) {
    if (!allowed.has(key)) issues.push({ parameter: key, message: "Parameter is not supported by this indicator" });
  }
  for (const parameter of definition.parameters) {
    const supplied = Object.prototype.hasOwnProperty.call(parameters, parameter.name);
    if (!supplied && parameter.required) {
      issues.push({ parameter: parameter.name, message: "Parameter is required" });
      continue;
    }
    if (!supplied) continue;
    const current = parameters[parameter.name];
    if (parameter.type === "integer" || parameter.type === "number") {
      if (typeof current !== "number" || !Number.isFinite(current) || (parameter.type === "integer" && !Number.isInteger(current))) {
        issues.push({ parameter: parameter.name, message: parameter.type === "integer" ? "Expected an integer" : "Expected a finite number" });
      } else if ((parameter.min !== undefined && current < parameter.min) || (parameter.max !== undefined && current > parameter.max)) {
        issues.push({ parameter: parameter.name, message: `Expected a value from ${parameter.min ?? "negative infinity"} to ${parameter.max ?? "infinity"}` });
      }
    } else if (typeof current !== "string" || !parameter.options?.includes(current)) {
      issues.push({ parameter: parameter.name, message: `Expected one of ${parameter.options?.join(", ") ?? "the supported values"}` });
    }
  }
  if (indicatorId === "macd" && typeof parameters.fastPeriod === "number" && typeof parameters.slowPeriod === "number" && parameters.fastPeriod >= parameters.slowPeriod) {
    issues.push({ parameter: "slowPeriod", message: "Slow period must exceed fast period" });
  }
  if (indicatorId === "parabolic_sar" && typeof parameters.acceleration === "number" && typeof parameters.maximum === "number" && parameters.acceleration > parameters.maximum) {
    issues.push({ parameter: "maximum", message: "Maximum acceleration must not be below acceleration" });
  }
  return issues;
}

export function resolveIndicatorParameters(indicatorId: string, value: unknown): IndicatorParameters {
  const definition = getIndicatorDefinition(indicatorId);
  if (!definition) throw new RangeError(`Unknown indicator ${indicatorId}`);
  const issues = validateIndicatorParameters(indicatorId, value);
  if (issues.length) throw new RangeError(`${indicatorId}: ${issues.map((issue) => `${issue.parameter} ${issue.message}`).join("; ")}`);
  const supplied = value as Record<string, number | string>;
  return Object.fromEntries(definition.parameters.map((parameter) => [parameter.name, supplied[parameter.name] ?? parameter.default])) as IndicatorParameters;
}

export type ComparisonOperator = "gt" | "gte" | "lt" | "lte" | "eq" | "crosses_above" | "crosses_below";
export type ArithmeticOperator = "add" | "subtract" | "multiply" | "divide" | "min" | "max";

export interface IndicatorParameters {
  period?: number;
  source?: PriceSource;
  component?: string;
  smoothK?: number;
  smoothD?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  standardDeviations?: number;
  atrPeriod?: number;
  multiplier?: number;
  acceleration?: number;
  maximum?: number;
}

export interface ConstantExpression { constant: number }
export interface SourceExpression { source: PriceSource }
export interface IndicatorExpression { indicator: ExecutableIndicatorId; parameters: IndicatorParameters }
export interface LagExpression { lag: { value: ValueExpression; bars: number } }
export interface ArithmeticExpression { operation: ArithmeticOperator; left: ValueExpression; right: ValueExpression }
export interface AbsoluteExpression { absolute: ValueExpression }

export type ValueExpression = ConstantExpression | SourceExpression | IndicatorExpression | LagExpression | ArithmeticExpression | AbsoluteExpression;

export interface AllCondition { all: ConditionNode[] }
export interface AnyCondition { any: ConditionNode[] }
export interface NotCondition { not: ConditionNode }
export interface ComparisonCondition { left: ValueExpression; operator: ComparisonOperator; right: ValueExpression }
export type ConditionNode = AllCondition | AnyCondition | NotCondition | ComparisonCondition;

export interface StrategyDefinition {
  name: string;
  universe: CuratedSymbol[];
  timeframe: "1d";
  direction: "long";
  entry: ConditionNode;
  exit: ConditionNode;
  execution: { signalAt: "close"; executeAt: "next_open"; orderType: "market" };
  risk: { stopLossPercent?: number; takeProfitPercent?: number; maxHoldingDays?: number };
  costs: { commissionBpsPerSide: number; slippageBpsPerSide: number };
}

export interface StrategyPatch {
  name?: string;
  entry?: ConditionNode;
  exit?: ConditionNode;
  risk?: Partial<StrategyDefinition["risk"]>;
  costs?: Partial<StrategyDefinition["costs"]>;
}

export interface StrategyVariantRequest {
  name: string;
  hypothesis: string;
  rationale: string;
  expectedWeaknessAddressed: string;
  patch: StrategyPatch;
}

export const SAMPLE_STRATEGY: StrategyDefinition = {
  name: "RSI pullback above long-term trend",
  universe: ["AAPL", "MSFT", "NVDA", "QQQ", "SPY"],
  timeframe: "1d",
  direction: "long",
  entry: {
    all: [
      { left: { indicator: "rsi", parameters: { period: 14, source: "close" } }, operator: "lt", right: { constant: 35 } },
      { left: { source: "close" }, operator: "gt", right: { indicator: "ema", parameters: { period: 200, source: "close" } } },
    ],
  },
  exit: { left: { indicator: "rsi", parameters: { period: 14, source: "close" } }, operator: "gt", right: { constant: 60 } },
  execution: { signalAt: "close", executeAt: "next_open", orderType: "market" },
  risk: { stopLossPercent: 5, takeProfitPercent: 10, maxHoldingDays: 20 },
  costs: { commissionBpsPerSide: 0, slippageBpsPerSide: 5 },
};
