import { classifyMarketRegimes, createReproducibilityId, runCourt } from "@strategy-court/domain";
import type { CourtInput, StrategyDefinition } from "@strategy-court/schemas";
import type { CaseRecord, SnapshotRecord } from "../types";
import { contentHash, snapshotForDomain } from "../providers/market";

export interface CourtExecutionInput {
  courtCase: CaseRecord;
  strategyVersionId: string;
  strategy: StrategyDefinition;
  snapshot: SnapshotRecord;
  profile: string;
  engineVersion: string;
}

export interface CourtExecution {
  reproducibilityId: string;
  summaryLabel: string;
  result: Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function addSpyBenchmark(
  equityCurve: unknown[],
  snapshot: SnapshotRecord,
  initialCapital: number,
): unknown[] {
  const spyBars = snapshot.bars
    .filter((bar) => bar.symbol === "SPY" && Number.isFinite(bar.close))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  if (!equityCurve.length || !spyBars.length) return equityCurve;

  let cursor = -1;
  const alignedCloses = equityCurve.map((item) => {
    const date = String(object(item).date ?? "").slice(0, 10);
    while (cursor + 1 < spyBars.length && spyBars[cursor + 1]!.timestamp.slice(0, 10) <= date) cursor += 1;
    return cursor >= 0 ? spyBars[cursor]!.close : undefined;
  });
  const baseClose = alignedCloses.find((close): close is number => typeof close === "number" && close > 0);
  if (!baseClose) return equityCurve;

  return equityCurve.map((item, index) => {
    const close = alignedCloses[index];
    if (typeof close !== "number") return item;
    return {
      ...object(item),
      benchmark: Math.round((initialCapital * close / baseClose) * 100) / 100,
    };
  });
}

function normalizeResult(value: unknown, input: CourtExecutionInput): CourtExecution {
  const raw = object(value);
  const baseline = object(raw.baseline);
  const summaryLabel = String(raw.summaryLabel ?? raw.summary ?? "Inconclusive");
  const metrics = object(raw.metrics ?? baseline.metrics);
  const trades = Array.isArray(raw.trades) ? raw.trades : Array.isArray(baseline.trades) ? baseline.trades : [];
  const rawEquityCurve = Array.isArray(raw.equityCurve) ? raw.equityCurve : Array.isArray(baseline.equityCurve) ? baseline.equityCurve : [];
  const equityCurve = addSpyBenchmark(rawEquityCurve, input.snapshot, input.courtCase.initialCapital);
  const drawdownCurve = Array.isArray(raw.drawdownCurve)
    ? raw.drawdownCurve
    : Array.isArray(baseline.drawdownCurve)
      ? baseline.drawdownCurve
      : equityCurve.map((item) => {
          const point = object(item);
          return { date: point.date, drawdownPercent: point.drawdownPercent ?? 0 };
        });
  const verdicts = Array.isArray(raw.verdicts) ? raw.verdicts : [];
  const failures = Array.isArray(raw.failures)
    ? raw.failures
    : verdicts
      .filter((item) => object(item).verdict === "Fail" || object(item).status === "Fail")
      .map((item, index) => ({ id: String(object(item).id ?? object(item).category ?? `failure-${index + 1}`), ...object(item) }));
  const reproducibilityId = String(
    raw.reproducibilityId ?? contentHash({
      strategy: input.strategy,
      snapshot: input.snapshot.hash,
      profile: input.profile,
      engineVersion: input.engineVersion,
      initialCapital: input.courtCase.initialCapital,
    }),
  );
  const domainSnapshot = snapshotForDomain(input.snapshot);
  const regimes = classifyMarketRegimes(domainSnapshot);
  const marketEvidence = Object.fromEntries(input.courtCase.symbols.map((symbol) => {
    const symbolTrades = trades.filter((trade) => String(object(trade).symbol ?? "") === symbol);
    const bars = (domainSnapshot.bars[symbol as keyof typeof domainSnapshot.bars] ?? [])
      .filter((bar) => bar.date >= input.courtCase.dateFrom && bar.date <= input.courtCase.dateTo)
      .map((bar) => ({ ...bar, regime: regimes.get(bar.date) ?? "unknown" }));
    return [symbol, { symbol, bars, trades: symbolTrades }];
  }));
  const result = {
    ...raw,
    summaryLabel,
    metrics,
    trades,
    equityCurve,
    drawdownCurve,
    verdicts,
    failures,
    assumptions: {
      signalTiming: "completed_daily_close",
      executionTiming: "next_open",
      orderType: "market",
      longOnly: true,
      positionSizing: "equal_starting_capital_per_symbol",
      maximumOpenPositionsPerSymbol: 1,
      riskGapFill: "opening_price_when_open_is_beyond_the_stop_or_take_profit_threshold",
      intradayRiskFill: "configured_stop_or_take_profit_threshold",
      sameBarRiskPriority: "stop_loss_before_take_profit",
      adjustment: input.snapshot.adjustment,
      provider: input.snapshot.provider,
      commissionBpsPerSide: input.strategy.costs.commissionBpsPerSide,
      slippageBpsPerSide: input.strategy.costs.slippageBpsPerSide,
      ...object(raw.assumptions),
    },
    dateRange: { from: input.courtCase.dateFrom, to: input.courtCase.dateTo },
    dataSnapshotId: input.snapshot.id,
    engineVersion: input.engineVersion,
    marketEvidence,
    data: {
      provider: input.snapshot.provider,
      feed: input.snapshot.feed,
      adjustment: input.snapshot.adjustment,
      dateFrom: input.snapshot.dateFrom,
      dateTo: input.snapshot.dateTo,
      fetchedAt: input.snapshot.fetchedAt,
      contentHash: input.snapshot.hash,
      request: input.snapshot.request,
    },
    reproducibilityId,
  };
  return { reproducibilityId, summaryLabel, result };
}

export async function executeCourt(input: CourtExecutionInput): Promise<CourtExecution> {
  const domainInput: CourtInput = {
    strategy: input.strategy,
    snapshot: snapshotForDomain(input.snapshot),
    initialCapital: input.courtCase.initialCapital,
    dateRange: { start: input.courtCase.dateFrom, end: input.courtCase.dateTo },
    courtProfile: "balanced",
    strategyVersionId: input.strategyVersionId,
  };
  const raw = runCourt(domainInput);
  const normalized = normalizeResult(raw, input);
  if (!object(raw).reproducibilityId) {
    normalized.reproducibilityId = createReproducibilityId({
      strategy: input.strategy,
      snapshotId: input.snapshot.id,
      snapshotHash: input.snapshot.hash,
      dateRange: { from: input.courtCase.dateFrom, to: input.courtCase.dateTo },
      symbols: input.courtCase.symbols,
      initialCapital: input.courtCase.initialCapital,
      costs: input.strategy.costs,
      profile: input.profile,
      engineVersion: input.engineVersion,
    });
    normalized.result.reproducibilityId = normalized.reproducibilityId;
  }
  return normalized;
}
