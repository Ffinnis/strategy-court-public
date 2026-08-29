import type { CourtReport, DataSnapshot } from "@strategy-court/schemas";
import frozenSnapshotJson from "../market-data/frozen-snapshot.json";
import expectedResultJson from "../expected-results/sample-result.json";

export const frozenMarketSnapshot = frozenSnapshotJson as unknown as DataSnapshot;
export const expectedSampleResult = expectedResultJson as unknown as Pick<CourtReport, "reproducibilityId" | "summaryLabel"> & Record<string, unknown>;
export { SAMPLE_STRATEGY } from "@strategy-court/schemas";
