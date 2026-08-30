import { expect, test } from "bun:test";
import { AlpacaMarketProvider } from "../src/providers/market";
import { SequentialQueue } from "../src/jobs/sequential-queue";

const request = { symbols: ["SPY"], dateFrom: "2024-01-02", dateTo: "2024-01-02" };
const response = () => new Response(JSON.stringify({ bars: { SPY: [{ t: "2024-01-02", o: 100, h: 102, l: 99, c: 101, v: 1000 }] } }));
const provider = (fetcher: NonNullable<ConstructorParameters<typeof AlpacaMarketProvider>[4]>, requestMs = 20, snapshotMs = 100) => new AlpacaMarketProvider("private-key", "private-secret", "https://data.alpaca.markets", "iex", fetcher, { requestMs, snapshotMs });

test("aborts a stalled fetch and releases the next queued job", async () => {
  let signal: AbortSignal | undefined;
  const market = provider(async (_url, init) => { signal = init?.signal as AbortSignal; return new Promise(() => {}); });
  const queue = new SequentialQueue();
  const outcomes: string[] = [];
  queue.enqueue(async () => {
    try { await market.getSnapshot(request); }
    catch (error) { outcomes.push((error as { code: string }).code); }
  });
  queue.enqueue(async () => { outcomes.push("next-job"); });
  await queue.idle();
  expect(outcomes).toEqual(["market_provider_timeout", "next-job"]);
  expect(signal?.aborted).toBe(true);
  expect(queue.size).toBe(0);
});

test("also bounds a stalled response body", async () => {
  const market = provider(async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response);
  await expect(market.getSnapshot(request)).rejects.toMatchObject({ status: 504, code: "market_provider_timeout" });
});

test("bounds the total snapshot separately from each page", async () => {
  const market = provider(async () => new Promise(() => {}), 200, 20);
  await expect(market.getSnapshot(request)).rejects.toMatchObject({ code: "market_provider_timeout" });
});

test("does not expose transport secrets in errors and keeps provider status actionable", async () => {
  await expect(provider(async () => { throw new Error("private-key private-secret"); }).getSnapshot(request))
    .rejects.toMatchObject({ code: "market_provider_unavailable", message: "Could not read Alpaca market data. Retry the run or choose Frozen snapshot." });
  await expect(provider(async () => new Response("denied", { status: 401 })).getSnapshot(request))
    .rejects.toMatchObject({ code: "market_provider_error", details: { status: 401, provider: "alpaca" } });
});

test("successful requests keep the real prices and clear their timeout", async () => {
  const result = await provider(async () => response()).getSnapshot(request);
  expect(result.provider).toBe("alpaca");
  expect(result.bars).toHaveLength(1);
  expect(result.bars[0]?.close).toBe(101);
});
