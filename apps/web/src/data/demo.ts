import type { CaseInput, StrategyDefinition } from "@/types";

export const sampleInput: CaseInput = {
  name: "RSI pullback in a rising market",
  description: "Buy AAPL, MSFT, NVDA, QQQ, or SPY when RSI 14 is below 35 and price is above the 200-day EMA. Exit when RSI is above 60, the position loses 5%, gains 10%, or has been open for 20 trading days.",
  symbols: ["AAPL", "MSFT", "NVDA", "QQQ", "SPY"],
  startDate: "2020-01-02",
  endDate: "2024-12-31",
  initialCapital: 10_000,
  commissionBpsPerSide: 0,
  slippageBpsPerSide: 5,
};

export const sampleDefinition: StrategyDefinition = {
  name: sampleInput.name,
  universe: sampleInput.symbols,
  timeframe: "1d",
  direction: "long",
  entry: {
    all: [
      {
        left: { indicator: "rsi", parameters: { period: 14, source: "close" } },
        operator: "lt",
        right: { constant: 35 },
      },
      {
        left: { source: "close" },
        operator: "gt",
        right: { indicator: "ema", parameters: { period: 200, source: "close" } },
      },
    ],
  },
  exit: {
    left: { indicator: "rsi", parameters: { period: 14, source: "close" } },
    operator: "gt",
    right: { constant: 60 },
  },
  execution: { signalAt: "close", executeAt: "next_open", orderType: "market" },
  risk: { stopLossPercent: 5, takeProfitPercent: 10, maxHoldingDays: 20 },
  costs: { commissionBpsPerSide: 0, slippageBpsPerSide: 5 },
};
