import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildMarketChartSeries } from "../src/charts/marketChartData";
import type { MarketEvidenceBar, Trade } from "../src/types";

const bars: MarketEvidenceBar[] = [
  { date: "2024-01-03", open: 102, high: 105, low: 101, close: 104, volume: 1_200, regime: "Positive" },
  { date: "2024-01-02", open: 100, high: 103, low: 98, close: 99, volume: 900, regime: "Negative" },
];

const trades: Trade[] = [
  { id: "trade-1", symbol: "SPY", entryDate: "2024-01-02", entryPrice: 100.25, exitDate: "2024-01-03", exitPrice: 103.75, quantity: 1, netProfit: 3.5, costs: 0, exitReason: "Rule", regime: "Negative" },
  { id: "other", symbol: "QQQ", entryDate: "2024-01-02", entryPrice: 1, exitDate: "2024-01-03", exitPrice: 2, quantity: 1, netProfit: 1, costs: 0, exitReason: "Rule", regime: "Negative" },
];

test("builds ordered OHLCV series and exact selected-symbol fill markers", () => {
  const result = buildMarketChartSeries(bars, trades, "SPY");

  expect(result.candles.map((bar) => bar.time)).toEqual(["2024-01-02", "2024-01-03"]);
  expect(result.closes.map((point) => point.value)).toEqual([99, 104]);
  expect(result.volume.map((point) => point.value)).toEqual([900, 1_200]);
  expect(result.volume.map((point) => point.color)).toEqual(["#855050", "#4c725d"]);
  expect(result.markers).toEqual([
    expect.objectContaining({ id: "trade-1-entry", time: "2024-01-02", price: 100.25, position: "atPriceMiddle", shape: "arrowUp" }),
    expect.objectContaining({ id: "trade-1-exit", time: "2024-01-03", price: 103.75, position: "atPriceMiddle", shape: "arrowDown" }),
  ]);
});

test("the evidence chart names the active visual mode", () => {
  const source = readFileSync(new URL("../src/charts/CandlestickEvidenceChart.vue", import.meta.url), "utf8");

  expect(source).toContain('viewMode.value === "line" ? "line chart" : "candlestick chart"');
  expect(source).toContain("adjusted daily ${chartKindLabel}");
});
