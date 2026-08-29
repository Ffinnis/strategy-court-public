import { describe, expect, test } from "bun:test";
import { runBacktest } from "../src/index.ts";
import type { DataSnapshot } from "@strategy-court/schemas";
import { makeBars, makeSnapshot, makeStrategy } from "./helpers.ts";

const bars = makeBars([
  { date: "2024-01-02", open: 10, close: 11 },
  { date: "2024-01-03", open: 12, close: 12 },
  { date: "2024-01-04", open: 13, close: 13 },
]);

describe("deterministic next-open backtest", () => {
  test("executes close-derived signals only at the next open", () => {
    const result = runBacktest({ strategy: makeStrategy(), snapshot: makeSnapshot(bars), initialCapital: 1_000 });
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ entryDate: "2024-01-03", entryReferencePrice: 12, exitDate: "2024-01-04", exitReferencePrice: 13, exitReason: "rule" });
    expect(result.metrics.finalEquity).toBeCloseTo(1083.3333333, 6);
  });

  test("deducts adverse slippage and commissions on both sides", () => {
    const free = runBacktest({ strategy: makeStrategy(), snapshot: makeSnapshot(bars), initialCapital: 1_000 });
    const costly = runBacktest({ strategy: makeStrategy({ commissionBpsPerSide: 100, slippageBpsPerSide: 100 }), snapshot: makeSnapshot(bars), initialCapital: 1_000 });
    expect(costly.metrics.finalEquity).toBeLessThan(free.metrics.finalEquity);
    expect(costly.trades[0]?.costs).toBeGreaterThan(0);
    expect(costly.metrics.totalEstimatedCosts).toBeCloseTo(costly.trades[0]?.costs ?? 0, 8);
  });

  test("uses the stop when a daily bar touches stop and take thresholds", () => {
    const strategy = makeStrategy();
    strategy.exit = { left: { source: "close" }, operator: "lt", right: { constant: 0.01 } };
    strategy.risk = { stopLossPercent: 5, takeProfitPercent: 10 };
    const riskBars = makeBars([
      { date: "2024-01-02", open: 10, close: 11 },
      { date: "2024-01-03", open: 100, high: 120, low: 80, close: 105 },
    ]);
    const result = runBacktest({ strategy, snapshot: makeSnapshot(riskBars), initialCapital: 1_000 });
    expect(result.trades[0]).toMatchObject({ exitReason: "stop_loss", exitReferencePrice: 95 });
  });

  test("does not manufacture a fill after the final signal bar", () => {
    const oneBar = makeBars([{ date: "2024-01-02", open: 10, close: 11 }]);
    const result = runBacktest({ strategy: makeStrategy(), snapshot: makeSnapshot(oneBar), initialCapital: 1_000 });
    expect(result.trades).toHaveLength(0);
    expect(result.openPositions).toHaveLength(0);
    expect(result.diagnostics.rejectedSignals).toBe(1);
    expect(result.diagnostics.signalEvents).toContainEqual({ symbol: "AAPL", date: "2024-01-02", signal: "entry", status: "rejected", reason: "no_next_bar" });
  });

  test("records skipped and structurally rejected signals with inspectable reasons", () => {
    const strategy = makeStrategy();
    strategy.entry = { left: { indicator: "sma", parameters: { period: 2, source: "close" } }, operator: "gt", right: { constant: 0 } };
    strategy.exit = { left: { source: "close" }, operator: "gt", right: { constant: 0 } };
    const result = runBacktest({ strategy, snapshot: makeSnapshot(bars), initialCapital: 1_000 });
    expect(result.diagnostics.signalEvents).toEqual(expect.arrayContaining([
      { symbol: "AAPL", date: "2024-01-02", signal: "entry", status: "skipped", reason: "required_values_unavailable" },
      { symbol: "AAPL", date: "2024-01-02", signal: "exit", status: "rejected", reason: "no_open_position" },
      { symbol: "AAPL", date: "2024-01-03", signal: "exit", status: "rejected", reason: "no_open_position" },
    ]));
  });

  test("uses a sixth SPY symbol as benchmark data without creating a trading sleeve", () => {
    const selected = ["AAPL", "MSFT", "NVDA", "QQQ", "XLK"] as const;
    const snapshot: DataSnapshot = {
      ...makeSnapshot(bars),
      symbols: [...selected, "SPY"],
      bars: Object.fromEntries([...selected, "SPY"].map((symbol) => [symbol, bars])),
    };
    const strategy = makeStrategy();
    strategy.universe = [...selected];
    const result = runBacktest({ strategy, snapshot, initialCapital: 5_000 });
    expect(result.trades).toHaveLength(5);
    expect(result.trades.some((trade) => trade.symbol === "SPY")).toBe(false);
    expect(result.metrics.benchmarkReturnPercent).not.toBeNull();
  });
});
