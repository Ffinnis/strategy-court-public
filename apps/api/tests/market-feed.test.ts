import { expect, test } from "bun:test";
import { AlpacaMarketProvider } from "../src/providers/market";

test("defaults historical requests to SIP and preserves explicit feed overrides", async () => {
  const originalFeed = process.env.ALPACA_FEED;
  const feeds: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    feeds.push(new URL(String(input)).searchParams.get("feed")!);
    return Response.json({ bars: { SPY: [{ t: "2020-01-02T05:00:00Z", o: 100, h: 102, l: 99, c: 101, v: 1_000 }] } });
  }) as typeof fetch;
  const request = { symbols: ["SPY"], dateFrom: "2020-01-02", dateTo: "2020-01-02" };

  try {
    delete process.env.ALPACA_FEED;
    const defaultProvider = new AlpacaMarketProvider("key", "secret", "https://data.alpaca.test", undefined, fetcher);
    expect((await defaultProvider.getSnapshot(request)).feed).toBe("sip");

    process.env.ALPACA_FEED = "iex";
    const configuredProvider = new AlpacaMarketProvider("key", "secret", "https://data.alpaca.test", undefined, fetcher);
    expect((await configuredProvider.getSnapshot(request)).feed).toBe("iex");

    const explicitProvider = new AlpacaMarketProvider("key", "secret", "https://data.alpaca.test", "sip", fetcher);
    expect((await explicitProvider.getSnapshot(request)).feed).toBe("sip");
    expect(feeds).toEqual(["sip", "iex", "sip"]);
  } finally {
    if (originalFeed === undefined) delete process.env.ALPACA_FEED;
    else process.env.ALPACA_FEED = originalFeed;
  }
});
