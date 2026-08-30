import { createHash } from "node:crypto";
import type { CuratedSymbol, DataSnapshot, MarketBar } from "@strategy-court/schemas";

const symbols = ["AAPL", "MSFT", "NVDA", "QQQ", "SPY"] as const satisfies readonly CuratedSymbol[];
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Original test values, not sampled or calibrated from any market-data source. */
export function generateSyntheticSnapshot(): DataSnapshot {
  let seed = 20260831;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Fictional weekday sessions. This is deliberately not an exchange calendar.
  const dates: string[] = [];
  for (let day = Date.parse("2020-01-02T00:00:00Z"); day <= Date.parse("2025-12-31T00:00:00Z"); day += 86_400_000) {
    const date = new Date(day);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(date.toISOString().slice(0, 10));
  }
  const commonMoves = dates.map((_, index) => {
    const phase = index % 260;
    const stress = phase >= 180 && phase < 190 ? -0.012 : phase >= 190 && phase < 220 ? 0.006 : 0;
    return 0.00045 + Math.sin(index / 45) * 0.001 + (random() - 0.5) * 0.014 + stress;
  });
  const bars: DataSnapshot["bars"] = {};
  symbols.forEach((symbol, symbolIndex) => {
    let previous = 60 + symbolIndex * 25;
    bars[symbol] = dates.map((date, index): MarketBar => {
      const open = previous * (1 + (random() - 0.5) * 0.007);
      const close = Math.max(1, previous * (1 + commonMoves[index]! + (random() - 0.5) * (0.016 + symbolIndex * 0.002)));
      const high = Math.max(open, close) * (1 + 0.001 + random() * 0.012);
      const low = Math.min(open, close) * (1 - 0.001 - random() * 0.012);
      const volume = Math.floor(500_000 + random() * 8_000_000);
      previous = close;
      return { date, open: round(open), high: round(high), low: round(low), close: round(close), volume };
    });
  });
  const contentHash = `sha256:${createHash("sha256").update(JSON.stringify({ provider: "synthetic_demo", symbols, bars })).digest("hex")}`;
  return {
    id: `synthetic-v1-2020-2025-${contentHash.slice(-12)}`,
    provider: "synthetic_demo",
    symbols: [...symbols],
    startDate: "2020-01-02",
    endDate: "2025-12-31",
    adjustment: "none",
    fetchedAt: "2026-08-31T00:00:00.000Z",
    contentHash,
    bars,
  };
}
