import type { ConditionNode, MarketBar, PriceSource, ValueExpression } from "@strategy-court/schemas";
import { calculateIndicator, lag, type NullableSeries } from "./indicators.ts";

export type BooleanSeries = Array<boolean | null>;

export interface ConditionEvaluation {
  values: BooleanSeries;
  insufficientWarmupBars: number;
}

function sourceSeries(bars: readonly MarketBar[], source: PriceSource): number[] {
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

function expressionKey(expression: ValueExpression): string {
  return JSON.stringify(expression);
}

export function evaluateExpression(
  expression: ValueExpression,
  bars: readonly MarketBar[],
  cache: Map<string, NullableSeries> = new Map(),
): NullableSeries {
  const key = expressionKey(expression);
  const cached = cache.get(key);
  if (cached) return cached;
  let values: NullableSeries;
  if ("constant" in expression) values = bars.map(() => expression.constant);
  else if ("source" in expression) values = sourceSeries(bars, expression.source);
  else if ("indicator" in expression) {
    values = calculateIndicator(expression.indicator, expression.parameters, bars);
  } else if ("lag" in expression) {
    values = lag(evaluateExpression(expression.lag.value, bars, cache), expression.lag.bars);
  } else if ("absolute" in expression) {
    values = evaluateExpression(expression.absolute, bars, cache).map((value) => value === null ? null : Math.abs(value));
  } else {
    const left = evaluateExpression(expression.left, bars, cache);
    const right = evaluateExpression(expression.right, bars, cache);
    values = left.map((leftValue, index) => {
      const rightValue = right[index];
      if (leftValue === null || rightValue === null || rightValue === undefined) return null;
      switch (expression.operation) {
        case "add": return leftValue + rightValue;
        case "subtract": return leftValue - rightValue;
        case "multiply": return leftValue * rightValue;
        case "divide": return rightValue === 0 ? null : leftValue / rightValue;
        case "min": return Math.min(leftValue, rightValue);
        case "max": return Math.max(leftValue, rightValue);
      }
    });
  }
  cache.set(key, values);
  return values;
}

function combineAll(series: readonly BooleanSeries[]): BooleanSeries {
  if (series.length === 0) return [];
  return series[0]?.map((_, index) => {
    const values = series.map((item) => item[index]);
    if (values.includes(false)) return false;
    if (values.some((value) => value == null)) return null;
    return true;
  }) ?? [];
}

function combineAny(series: readonly BooleanSeries[]): BooleanSeries {
  if (series.length === 0) return [];
  return series[0]?.map((_, index) => {
    const values = series.map((item) => item[index]);
    if (values.includes(true)) return true;
    if (values.some((value) => value == null)) return null;
    return false;
  }) ?? [];
}

function evaluateNode(node: ConditionNode, bars: readonly MarketBar[], cache: Map<string, NullableSeries>): BooleanSeries {
  if ("all" in node) return combineAll(node.all.map((child) => evaluateNode(child, bars, cache)));
  if ("any" in node) return combineAny(node.any.map((child) => evaluateNode(child, bars, cache)));
  if ("not" in node) return evaluateNode(node.not, bars, cache).map((value) => value === null ? null : !value);
  const left = evaluateExpression(node.left, bars, cache);
  const right = evaluateExpression(node.right, bars, cache);
  return left.map((leftValue, index) => {
    const rightValue = right[index];
    if (leftValue === null || rightValue === null || rightValue === undefined) return null;
    switch (node.operator) {
      case "gt": return leftValue > rightValue;
      case "gte": return leftValue >= rightValue;
      case "lt": return leftValue < rightValue;
      case "lte": return leftValue <= rightValue;
      case "eq": return leftValue === rightValue;
      case "crosses_above": {
        const previousLeft = left[index - 1];
        const previousRight = right[index - 1];
        return previousLeft == null || previousRight == null ? null : previousLeft <= previousRight && leftValue > rightValue;
      }
      case "crosses_below": {
        const previousLeft = left[index - 1];
        const previousRight = right[index - 1];
        return previousLeft == null || previousRight == null ? null : previousLeft >= previousRight && leftValue < rightValue;
      }
    }
  });
}

export function evaluateCondition(condition: ConditionNode, bars: readonly MarketBar[]): ConditionEvaluation {
  const values = evaluateNode(condition, bars, new Map());
  return { values, insufficientWarmupBars: values.filter((value) => value === null).length };
}

export function evaluateConditionAt(condition: ConditionNode, bars: readonly MarketBar[], index: number): boolean | null {
  return evaluateCondition(condition, bars).values[index] ?? null;
}
