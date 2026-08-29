import { describe, expect, test } from "bun:test";
import {
  BUILT_IN_INDICATOR_DEFINITIONS,
  BUILT_IN_INDICATOR_IDS,
  PRIMITIVE_INDICATOR_IDS,
  validateIndicatorParameters,
  type IndicatorCatalogDefinition,
  type IndicatorParameters,
  type MarketBar,
} from "@strategy-court/schemas";
import { atr, calculateIndicator, crossover, ema, evaluateExpression, highest, lag, lowest, realizedVolatility, rsi, sma } from "../src/index.ts";

function parametersFor(definition: IndicatorCatalogDefinition): IndicatorParameters {
  return Object.fromEntries(definition.parameters.map((parameter) => [parameter.name, parameter.default])) as IndicatorParameters;
}

function marketBars(length = 180): MarketBar[] {
  return Array.from({ length }, (_, index) => {
    const close = 100 + index * 0.17 + Math.sin(index / 4) * 4 + Math.cos(index / 11) * 2;
    const open = close + Math.sin(index / 3) * 0.6;
    return {
      date: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) + 1 + index % 3 * 0.1,
      low: Math.min(open, close) - 1 - index % 2 * 0.1,
      close,
      volume: 1_000 + index * 13 + index % 7 * 80,
    };
  });
}

describe("P0 indicators", () => {
  test("calculates moving averages with inspectable warm-up", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(highest([1, 4, 2, 5], 2)).toEqual([null, 4, 4, 5]);
    expect(lowest([1, 4, 2, 5], 2)).toEqual([null, 1, 2, 2]);
  });

  test("uses Wilder RSI and ATR seeds", () => {
    expect(rsi([1, 2, 3, 2, 4], 3)[3]).toBeCloseTo(66.6666667, 6);
    expect(rsi([1, 2, 3, 2, 4], 3)[4]).toBeCloseTo(83.3333333, 6);
    const bars = [
      { high: 10, low: 8, close: 9 },
      { high: 12, low: 9, close: 11 },
      { high: 13, low: 10, close: 12 },
    ];
    expect(atr(bars, 2)).toEqual([null, 2.5, 2.75]);
  });

  test("lags only into the past and detects a strict crossover", () => {
    expect(lag([1, 2, 3], 1)).toEqual([null, 1, 2]);
    expect(() => lag([1], -1)).toThrow("future bars");
    expect(crossover([1, 2, 2, 4], [2, 2, 3, 3])).toEqual([null, false, false, true]);
  });

  test("exposes rolling and change primitives to safe formulas", () => {
    expect(PRIMITIVE_INDICATOR_IDS).toEqual(["highest", "lowest", "rolling_sum", "rolling_average", "percentage_change"]);
    const bars = [1, 2, 3, 6].map((close, index) => ({ date: `2024-01-0${index + 1}`, open: close, high: close, low: close, close, volume: 1 }));
    expect(calculateIndicator("rolling_sum", { period: 2, source: "close" }, bars)).toEqual([null, 3, 5, 9]);
    expect(calculateIndicator("percentage_change", { period: 1, source: "close" }, bars)).toEqual([null, 100, 50, 100]);
  });

  test("annualizes realized volatility after a complete return window", () => {
    const values = [100, 101, 99, 102, 100];
    const result = realizedVolatility(values, 3);
    expect(result.slice(0, 3)).toEqual([null, null, null]);
    expect(result[3]).toBeGreaterThan(0);
  });

  test("publishes one executable contract for all 30 PRD indicators", () => {
    expect(BUILT_IN_INDICATOR_IDS).toHaveLength(30);
    expect(BUILT_IN_INDICATOR_DEFINITIONS).toHaveLength(30);
    expect(new Set(BUILT_IN_INDICATOR_DEFINITIONS.map((item) => item.id))).toEqual(new Set(BUILT_IN_INDICATOR_IDS));
    for (const definition of BUILT_IN_INDICATOR_DEFINITIONS) {
      const parameters = parametersFor(definition);
      expect(validateIndicatorParameters(definition.id, parameters)).toEqual([]);
      if (definition.components.length) {
        expect(definition.parameters.find((parameter) => parameter.name === "component")?.required).toBe(true);
      }
    }
  });

  test("executes every catalog indicator as an aligned nullable series", () => {
    const bars = marketBars();
    for (const definition of BUILT_IN_INDICATOR_DEFINITIONS) {
      const values = calculateIndicator(definition.id, parametersFor(definition), bars);
      expect(values, definition.id).toHaveLength(bars.length);
      expect(values.some((value) => value !== null && Number.isFinite(value)), definition.id).toBe(true);
      expect(evaluateExpression({ indicator: definition.id, parameters: parametersFor(definition) }, bars), definition.id).toEqual(values);
    }
  });

  test("keeps all indicator prefixes invariant when future bars are appended", () => {
    const full = marketBars();
    const prefix = full.slice(0, 120);
    for (const definition of BUILT_IN_INDICATOR_DEFINITIONS) {
      const parameters = parametersFor(definition);
      expect(calculateIndicator(definition.id, parameters, full).slice(0, prefix.length), definition.id)
        .toEqual(calculateIndicator(definition.id, parameters, prefix));
    }
  });

  test("matches inspectable golden values across trend, momentum, volatility, and volume families", () => {
    const closes = [1, 2, 3, 4].map((close, index) => ({
      date: `2024-01-0${index + 1}`,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: (index + 1) * 10,
    }));
    expect(calculateIndicator("wma", { period: 3, source: "close" }, closes)[2]).toBeCloseTo(14 / 6, 12);
    const rateOfChange = calculateIndicator("roc", { period: 1, source: "close" }, closes);
    expect(rateOfChange.slice(0, 3)).toEqual([null, 100, 50]);
    expect(rateOfChange[3]).toBeCloseTo(100 / 3, 12);
    expect(calculateIndicator("bollinger", { period: 2, standardDeviations: 2, source: "close", component: "middle" }, closes))
      .toEqual([null, 1.5, 2.5, 3.5]);
    expect(calculateIndicator("obv", {}, closes)).toEqual([0, 20, 50, 90]);
    expect(calculateIndicator("accumulation_distribution", {}, closes)).toEqual([0, 0, 0, 0]);
  });

  test("requires and selects explicit multi-line components", () => {
    const bars = marketBars(80);
    expect(validateIndicatorParameters("macd", { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, source: "close" })
      .some((issue) => issue.parameter === "component")).toBe(true);
    const base = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, source: "close" as const };
    const line = calculateIndicator("macd", { ...base, component: "line" }, bars);
    const signal = calculateIndicator("macd", { ...base, component: "signal" }, bars);
    const histogram = calculateIndicator("macd", { ...base, component: "histogram" }, bars);
    const index = histogram.findIndex((value) => value !== null);
    expect(index).toBeGreaterThan(0);
    expect(histogram[index]).toBeCloseTo((line[index] ?? 0) - (signal[index] ?? 0), 12);
  });
});
