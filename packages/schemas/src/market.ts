export const CURATED_STOCKS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD",
  "NFLX", "JPM", "XOM", "WMT", "COST", "JNJ", "KO",
] as const;

export const CURATED_ETFS = ["SPY", "QQQ", "IWM", "DIA", "XLK"] as const;
export const CURATED_UNIVERSE = [...CURATED_STOCKS, ...CURATED_ETFS] as const;

export type CuratedSymbol = (typeof CURATED_UNIVERSE)[number];

export interface MarketBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DataSnapshot {
  id: string;
  provider: string;
  symbols: CuratedSymbol[];
  startDate: string;
  endDate: string;
  adjustment: "all" | "split" | "dividend" | "none";
  fetchedAt: string;
  contentHash: string;
  bars: Partial<Record<CuratedSymbol, MarketBar[]>>;
  missingBars?: Partial<Record<CuratedSymbol, number>>;
}

export function isCuratedSymbol(value: string): value is CuratedSymbol {
  return (CURATED_UNIVERSE as readonly string[]).includes(value);
}
