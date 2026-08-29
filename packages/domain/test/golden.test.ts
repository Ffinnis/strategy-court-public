import { expect, test } from "bun:test";
import { runCourt } from "../src/index.ts";
import { SAMPLE_STRATEGY, type DataSnapshot } from "@strategy-court/schemas";
import snapshotJson from "../../fixtures/market-data/frozen-snapshot.json";
import expected from "../../fixtures/expected-results/sample-result.json";

test("frozen sample reproduces the committed golden report", () => {
  const input = {
    strategyVersionId: "sample-v1",
    strategy: SAMPLE_STRATEGY,
    snapshot: snapshotJson as unknown as DataSnapshot,
    dateRange: { start: "2020-01-02", end: "2025-12-31" },
    initialCapital: 100_000,
    courtProfile: "balanced" as const,
  };
  const first = runCourt(input);
  const second = runCourt(input);
  expect(first.reproducibilityId).toBe(expected.reproducibilityId);
  expect(String(first.summaryLabel)).toBe(expected.summaryLabel);
  expect(first.baseline.metrics.finalEquity).toBe(expected.baseline.finalEquity);
  expect(first.baseline.metrics.numberOfTrades).toBe(expected.baseline.numberOfTrades);
  expect(first.verdicts).toHaveLength(7);
  expect(second).toEqual(first);
});
