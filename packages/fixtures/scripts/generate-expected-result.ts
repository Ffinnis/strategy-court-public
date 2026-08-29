import { runCourt } from "../../domain/src/index.ts";
import { SAMPLE_STRATEGY, type DataSnapshot } from "@strategy-court/schemas";
import snapshotJson from "../market-data/frozen-snapshot.json";

const report = runCourt({
  strategyVersionId: "sample-v1",
  strategy: SAMPLE_STRATEGY,
  snapshot: snapshotJson as unknown as DataSnapshot,
  dateRange: { start: "2020-01-02", end: "2025-12-31" },
  initialCapital: 100_000,
  courtProfile: "balanced",
});

const expected = {
  engineVersion: report.engineVersion,
  reproducibilityId: report.reproducibilityId,
  summaryLabel: report.summaryLabel,
  splitDate: report.splitDate,
  baseline: {
    finalEquity: report.baseline.metrics.finalEquity,
    netProfit: report.baseline.metrics.netProfit,
    numberOfTrades: report.baseline.metrics.numberOfTrades,
    maximumDrawdownPercent: report.baseline.metrics.maximumDrawdownPercent,
    totalEstimatedCosts: report.baseline.metrics.totalEstimatedCosts,
  },
  outOfSample: {
    finalEquity: report.outOfSample.metrics.finalEquity,
    netProfit: report.outOfSample.metrics.netProfit,
    numberOfTrades: report.outOfSample.metrics.numberOfTrades,
  },
  verdicts: Object.fromEntries(report.verdicts.map((item) => [item.category, item.status])),
};

await Bun.write(new URL("../expected-results/sample-result.json", import.meta.url), `${JSON.stringify(expected, null, 2)}\n`);
console.log(`Wrote ${report.reproducibilityId} with ${report.baseline.metrics.numberOfTrades} baseline trades.`);
