import { expect, test } from "bun:test";
import { LANDING_MARKET_DATA, LANDING_MARKET_SOURCE } from "../src/data/landingMarket";

type SourceBar = { date: string; open: number; high: number; low: number; close: number; volume: number };

test("landing preview contains an ordered, valid year of QQQ prices", () => {
  expect(LANDING_MARKET_DATA).toHaveLength(252);
  expect(LANDING_MARKET_DATA[0]?.[0]).toBe("2024-01-02");
  expect(LANDING_MARKET_DATA.at(-1)?.[0]).toBe("2024-12-31");
  expect(LANDING_MARKET_SOURCE).toMatchObject({
    symbol: "QQQ",
    provider: "Yahoo Finance",
    mode: "Saved historical snapshot",
    adjustment: "Split and dividend adjusted",
    startDate: "2024-01-02",
    endDate: "2024-12-31",
  });

  LANDING_MARKET_DATA.forEach(([date, open, high, low, close, volume, sma120], index) => {
    expect(date).toMatch(/^2024-\d{2}-\d{2}$/);
    if (index > 0) expect(date > LANDING_MARKET_DATA[index - 1]![0]).toBe(true);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThanOrEqual(Math.max(open, close));
    expect(low).toBeLessThanOrEqual(Math.min(open, close));
    expect(Number.isInteger(volume)).toBe(true);
    expect(volume).toBeGreaterThan(0);
    expect(Number.isFinite(sma120)).toBe(true);
    expect(sma120).toBeGreaterThan(0);
  });
});

test("landing prices and SMA match the saved source, including pre-year warmup", async () => {
  const snapshot = await Bun.file(new URL("../../../packages/fixtures/market-data/frozen-snapshot.json", import.meta.url)).json() as {
    id: string;
    fetchedAt: string;
    bars: { QQQ: SourceBar[] };
  };
  const round = (value: number) => Math.round(value * 100) / 100;
  expect(LANDING_MARKET_SOURCE.snapshotId).toBe(snapshot.id);
  expect(LANDING_MARKET_SOURCE.fetchedAt).toBe(snapshot.fetchedAt);

  for (const [date, open, high, low, close, volume, sma120] of LANDING_MARKET_DATA) {
    const index = snapshot.bars.QQQ.findIndex((bar) => bar.date === date);
    expect(index).toBeGreaterThanOrEqual(119);
    const source = snapshot.bars.QQQ[index]!;
    expect([open, high, low, close, volume]).toEqual([
      round(source.open), round(source.high), round(source.low), round(source.close), source.volume,
    ]);
    const window = snapshot.bars.QQQ.slice(index - 119, index + 1);
    expect(window).toHaveLength(120);
    expect(sma120).toBe(round(window.reduce((sum, bar) => sum + bar.close, 0) / 120));
  }

  const firstIndex = snapshot.bars.QQQ.findIndex((bar) => bar.date === LANDING_MARKET_DATA[0]![0]);
  expect(snapshot.bars.QQQ[firstIndex - 119]!.date < "2024-01-01").toBe(true);
});

test("landing market module has no runtime imports or fixture payload", async () => {
  const source = await Bun.file(new URL("../src/data/landingMarket.ts", import.meta.url)).text();
  expect(source).not.toMatch(/^\s*import\s/m);
  expect(source).not.toMatch(/import\s*\(|require\s*\(/);
  expect(source).not.toContain("@strategy-court/fixtures");
  expect(source).not.toContain("frozen-snapshot.json");
});
