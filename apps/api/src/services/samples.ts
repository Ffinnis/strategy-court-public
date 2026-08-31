import { SAMPLE_STRATEGY, type StrategyDefinition } from "@strategy-court/schemas";
import { ENGINE_VERSION } from "@strategy-court/domain";
import type { Store } from "../store";
import type { CaseRecord, SnapshotRecord } from "../types";
import { ApiError } from "../errors";
import { analyzeSessionCoverage, contentHash } from "../providers/market";

export const SAMPLE_ID = "rsi-pullback";
export const sampleSettings = {
  name: "RSI pullback in a rising market",
  description: "Buy AAPL, MSFT, NVDA, QQQ, or SPY when RSI 14 is below 35 and price is above the 200-day EMA. Exit when RSI is above 60, the position loses 5%, gains 10%, or has been open for 20 trading days.",
  symbols: ["AAPL", "MSFT", "NVDA", "QQQ", "SPY"], dateFrom: "2020-01-02", dateTo: "2024-12-31",
  initialCapital: 10000, commissionBps: 0, slippageBps: 5, selectedProfile: "balanced",
};
export const sampleStrategy: StrategyDefinition = { ...structuredClone(SAMPLE_STRATEGY), name: sampleSettings.name, universe: [...sampleSettings.symbols] as StrategyDefinition["universe"] };

export interface PreparedSample {
  id: string;
  settings: typeof sampleSettings;
  definition: StrategyDefinition;
  engineVersion: string;
  snapshotId: string;
  snapshotHash: string;
  provenance: { provider: string; feed: string; adjustment: string };
  replaySnapshotId?: string;
  replaySnapshotHash?: string;
}

export async function readPreparedSample(store: Store, sampleId: string): Promise<PreparedSample> {
  const result = await store.db.query("SELECT manifest_json FROM prepared_samples WHERE id=$1", [sampleId]);
  if (!result.rows[0]) throw new ApiError(409, "sample_unavailable", "The saved Alpaca sample has not been prepared on this server. Create your own case, or ask the operator to prepare the sample.");
  const manifest = result.rows[0].manifest_json as PreparedSample;
  if (manifest.engineVersion !== ENGINE_VERSION) throw new ApiError(409, "sample_engine_mismatch", "The saved sample needs verification with the current engine version.");
  return manifest;
}

export async function sampleSnapshot(store: Store, courtCase: CaseRecord, replayTo?: string): Promise<SnapshotRecord> {
  if (!courtCase.sampleId) throw new ApiError(422, "sample_required", "Saved sample data is available only for a prepared sample case.");
  const manifest = await readPreparedSample(store, courtCase.sampleId);
  const snapshotId = replayTo ? manifest.replaySnapshotId : manifest.snapshotId;
  const expectedHash = replayTo ? manifest.replaySnapshotHash : manifest.snapshotHash;
  const snapshot = snapshotId ? await store.getSnapshot(snapshotId) : null;
  if (!snapshot || !expectedHash) throw new ApiError(409, "sample_snapshot_missing", "The saved market snapshot is unavailable. No substitute data was used.");
  const { provider, feed, adjustment } = manifest.provenance;
  if (provider !== "alpaca" || snapshot.provider !== provider || snapshot.feed !== feed || snapshot.adjustment !== adjustment
    || snapshot.hash !== expectedHash || contentHash({ request: snapshot.request, bars: snapshot.bars }) !== expectedHash) {
    throw new ApiError(409, "sample_snapshot_mismatch", "The saved Alpaca evidence does not match its prepared manifest.");
  }
  const symbols = [...new Set([...courtCase.symbols, "SPY"])].sort();
  const dateTo = replayTo ?? courtCase.dateTo;
  if (snapshot.dateFrom !== courtCase.dateFrom || snapshot.dateTo !== dateTo || [...snapshot.symbols].sort().join() !== symbols.join()) {
    throw new ApiError(422, "sample_range_mismatch", "The saved snapshot does not match this case's exact dates and symbols.");
  }
  analyzeSessionCoverage({ symbols, dateFrom: courtCase.dateFrom, dateTo }, snapshot.bars);
  return snapshot;
}

export async function createSampleCase(store: Store, sampleId: string, ownerId: string, actor: "user" | "agent", requestId: string) {
  const manifest = await readPreparedSample(store, sampleId);
  // Validate before creating any account-owned records.
  await sampleSnapshot(store, { ...manifest.settings, id: "preflight", sampleId, status: "draft", activeVersionId: null,
    evaluationLocked: false, createdAt: "", updatedAt: "" });
  const courtCase = await store.createCase({ ...manifest.settings, sampleId }, actor, ownerId, requestId);
  // Case creation is idempotent; protect the sample draft against overlapping retries too.
  await store.ensureSampleDraft(courtCase.id, manifest.definition, manifest.settings.description, actor, ownerId);
  return store.getCaseContext(courtCase.id, ownerId);
}
