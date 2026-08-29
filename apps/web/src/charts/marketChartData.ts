import type { CandlestickData, HistogramData, SeriesMarker, Time } from "lightweight-charts";
import type { MarketEvidenceBar, Trade } from "@/types";

export interface MarketChartSeries {
  bars: MarketEvidenceBar[];
  candles: CandlestickData<Time>[];
  closes: Array<{ time: Time; value: number }>;
  volume: HistogramData<Time>[];
  markers: SeriesMarker<Time>[];
}

const chartTime = (date: string) => date.slice(0, 10) as Time;

export function buildMarketChartSeries(
  bars: MarketEvidenceBar[],
  trades: Trade[],
  symbol: string,
): MarketChartSeries {
  const sortedBars = [...bars].sort((left, right) => left.date.localeCompare(right.date));
  const dates = new Set(sortedBars.map((bar) => bar.date.slice(0, 10)));
  const markers = trades
    .filter((trade) => trade.symbol === symbol)
    .flatMap((trade, index): Array<SeriesMarker<Time> & { sortOrder: number }> => {
      const id = trade.id ?? `${symbol}-${trade.entryDate}-${trade.exitDate}-${index}`;
      return [
        {
          id: `${id}-entry`,
          time: chartTime(trade.entryDate),
          position: "atPriceMiddle",
          price: trade.entryPrice,
          shape: "arrowUp",
          color: "#f2f2f2",
          size: 1.1,
          sortOrder: 0,
        },
        {
          id: `${id}-exit`,
          time: chartTime(trade.exitDate),
          position: "atPriceMiddle",
          price: trade.exitPrice,
          shape: "arrowDown",
          color: "#969696",
          size: 1.1,
          sortOrder: 1,
        },
      ];
    })
    .filter((marker) => dates.has(String(marker.time)))
    .sort((left, right) => String(left.time).localeCompare(String(right.time)) || left.sortOrder - right.sortOrder)
    .map(({ sortOrder: _sortOrder, ...marker }) => marker);

  return {
    bars: sortedBars,
    candles: sortedBars.map((bar) => ({
      time: chartTime(bar.date),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })),
    closes: sortedBars.map((bar) => ({ time: chartTime(bar.date), value: bar.close })),
    volume: sortedBars.map((bar) => ({
      time: chartTime(bar.date),
      value: bar.volume,
      color: bar.close >= bar.open ? "rgba(224,224,224,.30)" : "rgba(112,112,112,.48)",
    })),
    markers,
  };
}
