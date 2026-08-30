import { describe, expect, test } from "bun:test";
import { evaluateLatestCompletedBar } from "../src/index.ts";
import { makeBars, makeSnapshot, makeStrategy } from "./helpers.ts";

describe("latest completed-bar monitoring", () => {
  test("reports newly activated signals without submitting or predicting an order", () => {
    const strategy = makeStrategy();
    strategy.entry = { left: { source: "close" }, operator: "gt", right: { constant: 10 } };
    strategy.exit = { left: { source: "close" }, operator: "lt", right: { constant: 8 } };
    const previousSnapshot = makeSnapshot(makeBars([
      { date: "2024-01-02", open: 9, close: 9 },
      { date: "2024-01-03", open: 9, close: 9 },
    ]));
    const previous = evaluateLatestCompletedBar({
      strategyVersionId: "v1",
      strategy,
      snapshot: previousSnapshot,
      initialCapital: 10_000,
    });
    const currentSnapshot = makeSnapshot(makeBars([
      { date: "2024-01-02", open: 9, close: 9 },
      { date: "2024-01-03", open: 9, close: 9 },
      { date: "2024-01-04", open: 12, close: 12 },
    ]));
    const current = evaluateLatestCompletedBar({
      strategyVersionId: "v1",
      strategy,
      snapshot: currentSnapshot,
      initialCapital: 10_000,
      previous,
    });

    expect(previous.signals[0]?.entry).toBe(false);
    expect(current.evaluatedDate).toBe("2024-01-04");
    expect(current.signals[0]?.entry).toBe(true);
    expect(current.changes).toContainEqual({
      type: "entry_signal_activated",
      symbol: "AAPL",
      before: false,
      after: true,
    });
    expect(current.warnings.join(" ")).toContain("does not submit orders");
  });

  test("makes an unchanged provider date explicit", () => {
    const strategy = makeStrategy();
    const snapshot = makeSnapshot(makeBars([
      { date: "2024-01-02", open: 10, close: 10 },
      { date: "2024-01-03", open: 11, close: 11 },
    ]));
    const previous = evaluateLatestCompletedBar({ strategyVersionId: "v1", strategy, snapshot, initialCapital: 10_000 });
    const repeated = evaluateLatestCompletedBar({ strategyVersionId: "v1", strategy, snapshot, initialCapital: 10_000, previous });
    expect(repeated.warnings[0]).toBe("No newer completed daily bar was available.");
  });

  test("labels generated observations as synthetic", () => {
    const snapshot = makeSnapshot(makeBars([{ date: "2024-01-02", open: 10, close: 10 }]));
    snapshot.provider = "synthetic_demo";
    const result = evaluateLatestCompletedBar({ strategyVersionId: "v1", strategy: makeStrategy(), snapshot, initialCapital: 10_000 });
    expect(result.warnings).toContain("Synthetic demo prices, not actual market observations.");
  });
});
