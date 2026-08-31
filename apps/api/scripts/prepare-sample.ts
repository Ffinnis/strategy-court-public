import { Pool } from "pg";
import { ENGINE_VERSION } from "@strategy-court/domain";
import { Store } from "../src/store";
import { selectMarketProvider } from "../src/providers/market";
import { SAMPLE_ID, sampleSettings, sampleStrategy, type PreparedSample } from "../src/services/samples";

// Operator command only. Provider data stays in PostgreSQL, never in source files.
if (process.env.SAMPLE_DATA_DISPLAY_APPROVED !== "true") {
  throw new Error("Confirm your data agreement permits this deployment's displayed/exported sample evidence, then set SAMPLE_DATA_DISPLAY_APPROVED=true.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Run db:migrate first.");
const provider = selectMarketProvider("refresh");
const pool = new Pool({connectionString:process.env.DATABASE_URL});
const store = new Store(pool);
try {
  const snapshot = await store.saveSnapshot(await provider.getSnapshot({symbols:sampleSettings.symbols,dateFrom:sampleSettings.dateFrom,dateTo:sampleSettings.dateTo}));
  const manifest: PreparedSample = {id:SAMPLE_ID,settings:sampleSettings,definition:sampleStrategy,engineVersion:ENGINE_VERSION,
    snapshotId:snapshot.id,snapshotHash:snapshot.hash,provenance:{provider:snapshot.provider,feed:snapshot.feed,adjustment:snapshot.adjustment}};
  if (process.argv.includes("--with-replay")) {
    const replay = await store.saveSnapshot(await provider.getSnapshot({symbols:sampleSettings.symbols,dateFrom:sampleSettings.dateFrom,dateTo:"2025-12-31"}));
    manifest.replaySnapshotId=replay.id;manifest.replaySnapshotHash=replay.hash;
  }
  // Versioned preparation is deliberate; refuse to silently replace an existing judging sample.
  await pool.query("INSERT INTO prepared_samples (id,manifest_json) VALUES ($1,$2)",[SAMPLE_ID,JSON.stringify(manifest)]);
  console.log(JSON.stringify({sampleId:SAMPLE_ID,provider:snapshot.provider,feed:snapshot.feed,snapshotHash:snapshot.hash,barCount:snapshot.bars.length,engineVersion:ENGINE_VERSION}));
} finally {await pool.end();}
