import { isCuratedSymbol, type DataSnapshot, type MarketBar } from "./market.ts";
import {
  EXECUTABLE_INDICATOR_DEFINITIONS,
  PRICE_SOURCES,
  getIndicatorDefinition,
  validateIndicatorParameters,
  type ConditionNode,
  type StrategyDefinition,
  type StrategyVariantRequest,
  type ValueExpression,
} from "./strategy.ts";
import type {
  CourtRunRequest,
  ReplayAdvanceRequest,
  SafeParseResult,
  ValidationIssue,
} from "./contracts.ts";

export class ContractValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = "ContractValidationError";
    this.issues = issues;
  }
}

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !isoDate.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push({ path: `${path}.${key}`, message: "Unexpected property" });
  }
}

function boundedNumber(value: unknown, path: string, issues: ValidationIssue[], min: number, max: number, integer = false): value is number {
  if (!finite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    issues.push({ path, message: `Expected ${integer ? "an integer" : "a number"} from ${min} to ${max}` });
    return false;
  }
  return true;
}

interface AstState { nodes: number; numericParameters: number }

function validateExpression(value: unknown, path: string, issues: ValidationIssue[], depth: number, state: AstState): value is ValueExpression {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a value expression object" });
    return false;
  }
  state.nodes += 1;
  if (depth > 12) issues.push({ path, message: "Expression tree exceeds maximum depth 12" });

  if (own(value, "constant")) {
    exactKeys(value, ["constant"], path, issues);
    if (finite(value.constant)) state.numericParameters += 1;
    else issues.push({ path: `${path}.constant`, message: "Expected a finite number" });
    return true;
  }
  if (own(value, "source")) {
    exactKeys(value, ["source"], path, issues);
    if (!(PRICE_SOURCES as readonly unknown[]).includes(value.source)) issues.push({ path: `${path}.source`, message: "Unsupported price source" });
    return true;
  }
  if (own(value, "indicator")) {
    exactKeys(value, ["indicator", "parameters"], path, issues);
    const definition = typeof value.indicator === "string" ? getIndicatorDefinition(value.indicator) : undefined;
    if (!definition) issues.push({ path: `${path}.indicator`, message: "Indicator is not available in the built-in runtime" });
    for (const issue of validateIndicatorParameters(String(value.indicator), value.parameters)) {
      const issuePath = issue.parameter === "parameters" || issue.parameter === "indicator"
        ? `${path}.${issue.parameter}`
        : `${path}.parameters.${issue.parameter}`;
      if (!issues.some((existing) => existing.path === issuePath && existing.message === issue.message)) {
        issues.push({ path: issuePath, message: issue.message });
      }
    }
    if (definition && isRecord(value.parameters)) {
      for (const parameter of definition.parameters) {
        if ((parameter.type === "integer" || parameter.type === "number") && finite(value.parameters[parameter.name])) state.numericParameters += 1;
      }
    }
    return true;
  }
  if (own(value, "lag")) {
    exactKeys(value, ["lag"], path, issues);
    if (!isRecord(value.lag)) {
      issues.push({ path: `${path}.lag`, message: "Expected lag configuration" });
      return true;
    }
    exactKeys(value.lag, ["value", "bars"], `${path}.lag`, issues);
    if (boundedNumber(value.lag.bars, `${path}.lag.bars`, issues, 0, 2520, true)) state.numericParameters += 1;
    validateExpression(value.lag.value, `${path}.lag.value`, issues, depth + 1, state);
    return true;
  }
  if (own(value, "operation")) {
    exactKeys(value, ["operation", "left", "right"], path, issues);
    if (!["add", "subtract", "multiply", "divide", "min", "max"].includes(String(value.operation))) {
      issues.push({ path: `${path}.operation`, message: "Unsupported arithmetic operation" });
    }
    validateExpression(value.left, `${path}.left`, issues, depth + 1, state);
    validateExpression(value.right, `${path}.right`, issues, depth + 1, state);
    return true;
  }
  if (own(value, "absolute")) {
    exactKeys(value, ["absolute"], path, issues);
    validateExpression(value.absolute, `${path}.absolute`, issues, depth + 1, state);
    return true;
  }
  issues.push({ path, message: "Unknown value expression" });
  return false;
}

function validateCondition(value: unknown, path: string, issues: ValidationIssue[], depth: number, state: AstState): { valid: boolean; comparisons: number } {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a condition object" });
    return { valid: false, comparisons: 0 };
  }
  state.nodes += 1;
  if (depth > 12) issues.push({ path, message: "Condition tree exceeds maximum depth 12" });

  if (own(value, "all") || own(value, "any")) {
    const key = own(value, "all") ? "all" : "any";
    exactKeys(value, [key], path, issues);
    const children = value[key];
    if (!Array.isArray(children) || children.length === 0) {
      issues.push({ path: `${path}.${key}`, message: "Logical conditions require at least one child" });
      return { valid: false, comparisons: 0 };
    }
    let comparisons = 0;
    children.forEach((child, index) => { comparisons += validateCondition(child, `${path}.${key}[${index}]`, issues, depth + 1, state).comparisons; });
    return { valid: true, comparisons };
  }
  if (own(value, "not")) {
    exactKeys(value, ["not"], path, issues);
    return validateCondition(value.not, `${path}.not`, issues, depth + 1, state);
  }
  if (own(value, "left") || own(value, "operator") || own(value, "right")) {
    exactKeys(value, ["left", "operator", "right"], path, issues);
    if (!["gt", "gte", "lt", "lte", "eq", "crosses_above", "crosses_below"].includes(String(value.operator))) {
      issues.push({ path: `${path}.operator`, message: "Unsupported comparison operator" });
    }
    validateExpression(value.left, `${path}.left`, issues, 1, state);
    validateExpression(value.right, `${path}.right`, issues, 1, state);
    return { valid: true, comparisons: 1 };
  }
  issues.push({ path, message: "Unknown condition node" });
  return { valid: false, comparisons: 0 };
}

export function safeParseStrategyDefinition(value: unknown): SafeParseResult<StrategyDefinition> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { success: false, issues: [{ path: "$", message: "Expected a strategy object" }] };
  exactKeys(value, ["name", "universe", "timeframe", "direction", "entry", "exit", "execution", "risk", "costs"], "$", issues);
  if (typeof value.name !== "string" || value.name.trim().length < 1 || value.name.length > 120) issues.push({ path: "$.name", message: "Name must contain 1 to 120 characters" });
  if (!Array.isArray(value.universe) || value.universe.length < 1 || value.universe.length > 5) {
    issues.push({ path: "$.universe", message: "Select one to five curated symbols" });
  } else {
    const seen = new Set<string>();
    value.universe.forEach((symbol, index) => {
      if (typeof symbol !== "string" || !isCuratedSymbol(symbol)) issues.push({ path: `$.universe[${index}]`, message: "Symbol is outside the curated universe" });
      else if (seen.has(symbol)) issues.push({ path: `$.universe[${index}]`, message: "Symbols must be unique" });
      else seen.add(symbol);
    });
  }
  if (value.timeframe !== "1d") issues.push({ path: "$.timeframe", message: "Only daily strategies are supported" });
  if (value.direction !== "long") issues.push({ path: "$.direction", message: "Only long strategies are supported" });

  const state: AstState = { nodes: 0, numericParameters: 0 };
  const entry = validateCondition(value.entry, "$.entry", issues, 1, state);
  const exit = validateCondition(value.exit, "$.exit", issues, 1, state);
  if (entry.comparisons > 5) issues.push({ path: "$.entry", message: "Entry supports at most five comparison conditions" });
  if (exit.comparisons > 3) issues.push({ path: "$.exit", message: "Exit supports at most three comparison conditions" });

  if (!isRecord(value.execution)) issues.push({ path: "$.execution", message: "Expected execution assumptions" });
  else {
    exactKeys(value.execution, ["signalAt", "executeAt", "orderType"], "$.execution", issues);
    if (value.execution.signalAt !== "close") issues.push({ path: "$.execution.signalAt", message: "Signals must use completed closes" });
    if (value.execution.executeAt !== "next_open") issues.push({ path: "$.execution.executeAt", message: "Signals must execute at the next open" });
    if (value.execution.orderType !== "market") issues.push({ path: "$.execution.orderType", message: "Only market simulation is supported" });
  }

  if (!isRecord(value.risk)) issues.push({ path: "$.risk", message: "Expected risk settings" });
  else {
    exactKeys(value.risk, ["stopLossPercent", "takeProfitPercent", "maxHoldingDays"], "$.risk", issues);
    for (const key of ["stopLossPercent", "takeProfitPercent"] as const) {
      if (own(value.risk, key) && boundedNumber(value.risk[key], `$.risk.${key}`, issues, 0.01, 100)) state.numericParameters += 1;
    }
    if (own(value.risk, "maxHoldingDays") && boundedNumber(value.risk.maxHoldingDays, "$.risk.maxHoldingDays", issues, 1, 2520, true)) state.numericParameters += 1;
  }

  if (!isRecord(value.costs)) issues.push({ path: "$.costs", message: "Expected cost settings" });
  else {
    exactKeys(value.costs, ["commissionBpsPerSide", "slippageBpsPerSide"], "$.costs", issues);
    boundedNumber(value.costs.commissionBpsPerSide, "$.costs.commissionBpsPerSide", issues, 0, 1000);
    boundedNumber(value.costs.slippageBpsPerSide, "$.costs.slippageBpsPerSide", issues, 0, 1000);
  }
  if (state.nodes > 100) issues.push({ path: "$", message: "Strategy AST exceeds 100 nodes" });
  if (state.numericParameters > 10) issues.push({ path: "$", message: "Strategy exceeds ten numerical parameters" });
  return issues.length > 0 ? { success: false, issues } : { success: true, data: value as unknown as StrategyDefinition };
}

export function parseStrategyDefinition(value: unknown): StrategyDefinition {
  const result = safeParseStrategyDefinition(value);
  if (!result.success) throw new ContractValidationError("Invalid strategy definition", result.issues);
  return result.data;
}

export function safeParseDataSnapshot(value: unknown): SafeParseResult<DataSnapshot> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { success: false, issues: [{ path: "$", message: "Expected a data snapshot object" }] };
  exactKeys(value, ["id", "provider", "symbols", "startDate", "endDate", "adjustment", "fetchedAt", "contentHash", "bars", "missingBars"], "$", issues);
  for (const key of ["id", "provider", "fetchedAt", "contentHash"] as const) if (typeof value[key] !== "string" || value[key].length === 0) issues.push({ path: `$.${key}`, message: "Expected a non-empty string" });
  const startDate = isCalendarDate(value.startDate) ? value.startDate : null;
  const endDate = isCalendarDate(value.endDate) ? value.endDate : null;
  if (startDate === null) issues.push({ path: "$.startDate", message: "Expected a real YYYY-MM-DD calendar date" });
  if (endDate === null) issues.push({ path: "$.endDate", message: "Expected a real YYYY-MM-DD calendar date" });
  if (startDate !== null && endDate !== null && startDate > endDate) issues.push({ path: "$", message: "Snapshot startDate must not follow endDate" });
  if (!["all", "split", "dividend", "none"].includes(String(value.adjustment))) issues.push({ path: "$.adjustment", message: "Unsupported adjustment mode" });
  const validSnapshotSymbols = Array.isArray(value.symbols)
    && value.symbols.length >= 1
    && (value.symbols.length <= 5 || (value.symbols.length === 6 && value.symbols.includes("SPY")))
    && value.symbols.every((symbol) => typeof symbol === "string" && isCuratedSymbol(symbol))
    && new Set(value.symbols).size === value.symbols.length;
  if (!validSnapshotSymbols) issues.push({ path: "$.symbols", message: "Expected one to five unique curated symbols, plus optional SPY benchmark data" });
  if (own(value, "missingBars")) {
    if (!isRecord(value.missingBars)) issues.push({ path: "$.missingBars", message: "Expected missing-bar counts keyed by curated symbol" });
    else {
      for (const [symbol, count] of Object.entries(value.missingBars)) {
        if (!isCuratedSymbol(symbol)) issues.push({ path: `$.missingBars.${symbol}`, message: "Symbol is outside the curated universe" });
        if (!finite(count) || !Number.isInteger(count) || count < 0) issues.push({ path: `$.missingBars.${symbol}`, message: "Missing-bar count must be a non-negative integer" });
      }
    }
  }
  if (!isRecord(value.bars)) issues.push({ path: "$.bars", message: "Expected bars keyed by symbol" });
  else {
    const barsBySymbol = value.bars;
    for (const [symbol, bars] of Object.entries(barsBySymbol)) {
      if (!isCuratedSymbol(symbol)) issues.push({ path: `$.bars.${symbol}`, message: "Symbol is outside the curated universe" });
      if (!Array.isArray(bars)) { issues.push({ path: `$.bars.${symbol}`, message: "Expected an array of bars" }); continue; }
      let previous = "";
      bars.forEach((bar, index) => {
        const barPath = `$.bars.${symbol}[${index}]`;
        if (!isRecord(bar)) { issues.push({ path: barPath, message: "Expected a market bar" }); return; }
        exactKeys(bar, ["date", "open", "high", "low", "close", "volume"], barPath, issues);
        const barDate = isCalendarDate(bar.date) ? bar.date : null;
        if (barDate === null) issues.push({ path: `${barPath}.date`, message: "Expected a real YYYY-MM-DD calendar date" });
        else {
          if (barDate <= previous) issues.push({ path: `${barPath}.date`, message: "Bars must have strictly increasing dates" });
          if (startDate !== null && endDate !== null && (barDate < startDate || barDate > endDate)) {
            issues.push({ path: `${barPath}.date`, message: "Bar date must fall within the snapshot date range" });
          }
          previous = barDate;
        }
        for (const field of ["open", "high", "low", "close"] as const) if (!finite(bar[field]) || bar[field] <= 0) issues.push({ path: `${barPath}.${field}`, message: "Price must be positive" });
        if (!finite(bar.volume) || bar.volume < 0) issues.push({ path: `${barPath}.volume`, message: "Volume must be non-negative" });
        if (finite(bar.low) && finite(bar.high) && bar.low > bar.high) issues.push({ path: barPath, message: "Low cannot exceed high" });
        if (finite(bar.low) && finite(bar.high) && finite(bar.open) && (bar.open < bar.low || bar.open > bar.high)) issues.push({ path: `${barPath}.open`, message: "Open must fall within the daily low and high" });
        if (finite(bar.low) && finite(bar.high) && finite(bar.close) && (bar.close < bar.low || bar.close > bar.high)) issues.push({ path: `${barPath}.close`, message: "Close must fall within the daily low and high" });
      });
    }
    if (Array.isArray(value.symbols)) {
      value.symbols.forEach((symbol) => {
        const symbolBars = typeof symbol === "string" ? barsBySymbol[symbol] : undefined;
        if (typeof symbol === "string" && isCuratedSymbol(symbol) && (!Array.isArray(symbolBars) || symbolBars.length === 0)) {
          issues.push({ path: `$.bars.${symbol}`, message: "Every declared snapshot symbol requires at least one bar" });
        }
      });
    }
  }
  return issues.length ? { success: false, issues } : { success: true, data: value as unknown as DataSnapshot };
}

export function parseDataSnapshot(value: unknown): DataSnapshot {
  const result = safeParseDataSnapshot(value);
  if (!result.success) throw new ContractValidationError("Invalid data snapshot", result.issues);
  return result.data;
}

export function safeParseCourtRunRequest(value: unknown): SafeParseResult<CourtRunRequest> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { success: false, issues: [{ path: "$", message: "Expected a Court run request" }] };
  exactKeys(value, ["strategyVersionId", "dateRange", "courtProfile", "dataSnapshotPolicy", "initialCapital"], "$", issues);
  if (typeof value.strategyVersionId !== "string" || value.strategyVersionId.length === 0) issues.push({ path: "$.strategyVersionId", message: "Expected a strategy version ID" });
  if (!isRecord(value.dateRange)) issues.push({ path: "$.dateRange", message: "Expected a date range" });
  else {
    exactKeys(value.dateRange, ["start", "end"], "$.dateRange", issues);
    const start = isCalendarDate(value.dateRange.start) ? value.dateRange.start : null;
    const end = isCalendarDate(value.dateRange.end) ? value.dateRange.end : null;
    if (start === null) issues.push({ path: "$.dateRange.start", message: "Expected a real YYYY-MM-DD calendar date" });
    if (end === null) issues.push({ path: "$.dateRange.end", message: "Expected a real YYYY-MM-DD calendar date" });
    if (start !== null && end !== null && start > end) issues.push({ path: "$.dateRange", message: "Start must not follow end" });
  }
  if (value.courtProfile !== "balanced") issues.push({ path: "$.courtProfile", message: "Only the balanced profile is available" });
  if (!["frozen", "prefer_cache", "refresh"].includes(String(value.dataSnapshotPolicy))) issues.push({ path: "$.dataSnapshotPolicy", message: "Unsupported snapshot policy" });
  boundedNumber(value.initialCapital, "$.initialCapital", issues, 100, 100_000_000);
  return issues.length ? { success: false, issues } : { success: true, data: value as unknown as CourtRunRequest };
}

export function parseCourtRunRequest(value: unknown): CourtRunRequest {
  const result = safeParseCourtRunRequest(value);
  if (!result.success) throw new ContractValidationError("Invalid Court run request", result.issues);
  return result.data;
}

export function safeParseVariantRequests(value: unknown): SafeParseResult<StrategyVariantRequest[]> {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return { success: false, issues: [{ path: "$", message: "Submit one to three variants" }] };
  value.forEach((variant, index) => {
    const path = `$[${index}]`;
    if (!isRecord(variant)) { issues.push({ path, message: "Expected a variant object" }); return; }
    exactKeys(variant, ["name", "hypothesis", "rationale", "expectedWeaknessAddressed", "patch"], path, issues);
    for (const key of ["name", "hypothesis", "rationale", "expectedWeaknessAddressed"] as const) {
      if (typeof variant[key] !== "string" || variant[key].trim().length === 0 || variant[key].length > 500) issues.push({ path: `${path}.${key}`, message: "Expected 1 to 500 characters" });
    }
    if (!isRecord(variant.patch)) { issues.push({ path: `${path}.patch`, message: "Expected a structured patch" }); return; }
    exactKeys(variant.patch, ["name", "entry", "exit", "risk", "costs"], `${path}.patch`, issues);
    for (const prohibited of ["universe", "timeframe", "direction", "execution"] as const) if (own(variant.patch, prohibited)) issues.push({ path: `${path}.patch.${prohibited}`, message: "Variants cannot change this field" });
    if (Object.keys(variant.patch).length === 0) issues.push({ path: `${path}.patch`, message: "Variant patch must change at least one supported field" });
    if (own(variant.patch, "name") && (typeof variant.patch.name !== "string" || variant.patch.name.trim().length === 0 || variant.patch.name.length > 120)) issues.push({ path: `${path}.patch.name`, message: "Name must contain 1 to 120 characters" });
    const state: AstState = { nodes: 0, numericParameters: 0 };
    if (own(variant.patch, "entry")) {
      const entry = validateCondition(variant.patch.entry, `${path}.patch.entry`, issues, 1, state);
      if (entry.comparisons > 5) issues.push({ path: `${path}.patch.entry`, message: "Entry supports at most five comparison conditions" });
    }
    if (own(variant.patch, "exit")) {
      const exit = validateCondition(variant.patch.exit, `${path}.patch.exit`, issues, 1, state);
      if (exit.comparisons > 3) issues.push({ path: `${path}.patch.exit`, message: "Exit supports at most three comparison conditions" });
    }
    if (own(variant.patch, "risk")) {
      if (!isRecord(variant.patch.risk)) issues.push({ path: `${path}.patch.risk`, message: "Expected risk patch" });
      else {
        exactKeys(variant.patch.risk, ["stopLossPercent", "takeProfitPercent", "maxHoldingDays"], `${path}.patch.risk`, issues);
        if (Object.keys(variant.patch.risk).length === 0) issues.push({ path: `${path}.patch.risk`, message: "Risk patch must change at least one setting" });
        for (const key of ["stopLossPercent", "takeProfitPercent"] as const) if (own(variant.patch.risk, key)) boundedNumber(variant.patch.risk[key], `${path}.patch.risk.${key}`, issues, 0.01, 100);
        if (own(variant.patch.risk, "maxHoldingDays")) boundedNumber(variant.patch.risk.maxHoldingDays, `${path}.patch.risk.maxHoldingDays`, issues, 1, 2520, true);
      }
    }
    if (own(variant.patch, "costs")) {
      if (!isRecord(variant.patch.costs)) issues.push({ path: `${path}.patch.costs`, message: "Expected cost patch" });
      else {
        exactKeys(variant.patch.costs, ["commissionBpsPerSide", "slippageBpsPerSide"], `${path}.patch.costs`, issues);
        if (Object.keys(variant.patch.costs).length === 0) issues.push({ path: `${path}.patch.costs`, message: "Cost patch must change at least one setting" });
        for (const key of ["commissionBpsPerSide", "slippageBpsPerSide"] as const) if (own(variant.patch.costs, key)) boundedNumber(variant.patch.costs[key], `${path}.patch.costs.${key}`, issues, 0, 1000);
      }
    }
  });
  return issues.length ? { success: false, issues } : { success: true, data: value as unknown as StrategyVariantRequest[] };
}

export function parseVariantRequests(value: unknown): StrategyVariantRequest[] {
  const result = safeParseVariantRequests(value);
  if (!result.success) throw new ContractValidationError("Invalid strategy variants", result.issues);
  return result.data;
}

export function safeParseReplayAdvance(value: unknown): SafeParseResult<ReplayAdvanceRequest> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { success: false, issues: [{ path: "$", message: "Expected a replay advance request" }] };
  exactKeys(value, ["mode"], "$", issues);
  if (!["one_bar", "five_bars", "twenty_bars", "next_signal", "next_trade"].includes(String(value.mode))) issues.push({ path: "$.mode", message: "Unsupported replay advance mode" });
  return issues.length ? { success: false, issues } : { success: true, data: value as unknown as ReplayAdvanceRequest };
}

export function parseReplayAdvance(value: unknown): ReplayAdvanceRequest {
  const result = safeParseReplayAdvance(value);
  if (!result.success) throw new ContractValidationError("Invalid replay advance request", result.issues);
  return result.data;
}

const indicatorValueJsonSchemas = EXECUTABLE_INDICATOR_DEFINITIONS.map((definition) => ({
  type: "object",
  additionalProperties: false,
  required: ["indicator", "parameters"],
  properties: {
    indicator: { const: definition.id },
    parameters: {
      type: "object",
      additionalProperties: false,
      required: definition.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name),
      properties: Object.fromEntries(definition.parameters.map((parameter) => [parameter.name,
        parameter.type === "integer"
          ? { type: "integer", minimum: parameter.min, maximum: parameter.max }
          : parameter.type === "number"
            ? { type: "number", minimum: parameter.min, maximum: parameter.max }
            : { enum: parameter.options },
      ])),
    },
  },
}));

export const strategyDefinitionJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["name", "universe", "timeframe", "direction", "entry", "exit", "execution", "risk", "costs"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    universe: { type: "array", minItems: 1, maxItems: 5, uniqueItems: true, items: { enum: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "NFLX", "JPM", "XOM", "WMT", "COST", "JNJ", "KO", "SPY", "QQQ", "IWM", "DIA", "XLK"] } },
    timeframe: { const: "1d" },
    direction: { const: "long" },
    entry: { $ref: "#/$defs/condition" },
    exit: { $ref: "#/$defs/condition" },
    execution: {
      type: "object", additionalProperties: false, required: ["signalAt", "executeAt", "orderType"],
      properties: { signalAt: { const: "close" }, executeAt: { const: "next_open" }, orderType: { const: "market" } },
    },
    risk: {
      type: "object", additionalProperties: false,
      properties: {
        stopLossPercent: { type: "number", exclusiveMinimum: 0, maximum: 100 },
        takeProfitPercent: { type: "number", exclusiveMinimum: 0, maximum: 100 },
        maxHoldingDays: { type: "integer", minimum: 1, maximum: 2520 },
      },
    },
    costs: {
      type: "object", additionalProperties: false, required: ["commissionBpsPerSide", "slippageBpsPerSide"],
      properties: {
        commissionBpsPerSide: { type: "number", minimum: 0, maximum: 1000 },
        slippageBpsPerSide: { type: "number", minimum: 0, maximum: 1000 },
      },
    },
  },
  $defs: {
    value: {
      oneOf: [
        { type: "object", additionalProperties: false, required: ["constant"], properties: { constant: { type: "number" } } },
        { type: "object", additionalProperties: false, required: ["source"], properties: { source: { enum: ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4"] } } },
        ...indicatorValueJsonSchemas,
        {
          type: "object", additionalProperties: false, required: ["lag"],
          properties: { lag: { type: "object", additionalProperties: false, required: ["value", "bars"], properties: { value: { $ref: "#/$defs/value" }, bars: { type: "integer", minimum: 0, maximum: 2520 } } } },
        },
        {
          type: "object", additionalProperties: false, required: ["operation", "left", "right"],
          properties: { operation: { enum: ["add", "subtract", "multiply", "divide", "min", "max"] }, left: { $ref: "#/$defs/value" }, right: { $ref: "#/$defs/value" } },
        },
        { type: "object", additionalProperties: false, required: ["absolute"], properties: { absolute: { $ref: "#/$defs/value" } } },
      ],
    },
    condition: {
      oneOf: [
        { type: "object", additionalProperties: false, required: ["all"], properties: { all: { type: "array", minItems: 1, maxItems: 5, items: { $ref: "#/$defs/condition" } } } },
        { type: "object", additionalProperties: false, required: ["any"], properties: { any: { type: "array", minItems: 1, maxItems: 5, items: { $ref: "#/$defs/condition" } } } },
        { type: "object", additionalProperties: false, required: ["not"], properties: { not: { $ref: "#/$defs/condition" } } },
        {
          type: "object", additionalProperties: false, required: ["left", "operator", "right"],
          properties: { left: { $ref: "#/$defs/value" }, operator: { enum: ["gt", "gte", "lt", "lte", "eq", "crosses_above", "crosses_below"] }, right: { $ref: "#/$defs/value" } },
        },
      ],
    },
  },
} as const;

export const courtRunRequestJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["strategyVersionId", "dateRange", "courtProfile", "dataSnapshotPolicy", "initialCapital"],
  properties: {
    strategyVersionId: { type: "string", minLength: 1 },
    dateRange: {
      type: "object", additionalProperties: false, required: ["start", "end"],
      properties: { start: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, end: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
    },
    courtProfile: { enum: ["balanced"] },
    dataSnapshotPolicy: { enum: ["frozen", "prefer_cache", "refresh"] },
    initialCapital: { type: "number", minimum: 100, maximum: 100000000 },
  },
} as const;

export const replayAdvanceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mode"],
  properties: { mode: { enum: ["one_bar", "five_bars", "twenty_bars", "next_signal", "next_trade"] } },
} as const;

export const variantRequestsJsonSchema = {
  type: "array",
  minItems: 1,
  maxItems: 3,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["name", "hypothesis", "rationale", "expectedWeaknessAddressed", "patch"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 500 },
      hypothesis: { type: "string", minLength: 1, maxLength: 500 },
      rationale: { type: "string", minLength: 1, maxLength: 500 },
      expectedWeaknessAddressed: { type: "string", minLength: 1, maxLength: 500 },
      patch: {
        type: "object", additionalProperties: false, minProperties: 1,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          entry: { $ref: "#/$defs/condition" },
          exit: { $ref: "#/$defs/condition" },
          risk: {
            type: "object", additionalProperties: false, minProperties: 1,
            properties: {
              stopLossPercent: { type: "number", exclusiveMinimum: 0, maximum: 100 },
              takeProfitPercent: { type: "number", exclusiveMinimum: 0, maximum: 100 },
              maxHoldingDays: { type: "integer", minimum: 1, maximum: 2520 },
            },
          },
          costs: {
            type: "object", additionalProperties: false, minProperties: 1,
            properties: {
              commissionBpsPerSide: { type: "number", minimum: 0, maximum: 1000 },
              slippageBpsPerSide: { type: "number", minimum: 0, maximum: 1000 },
            },
          },
        },
      },
    },
  },
  $defs: strategyDefinitionJsonSchema.$defs,
} as const;

export function cloneStrategy(strategy: StrategyDefinition): StrategyDefinition {
  return structuredClone(strategy);
}

export function assertMarketBar(value: MarketBar): MarketBar {
  return value;
}

export function assertConditionNode(value: ConditionNode): ConditionNode {
  return value;
}
