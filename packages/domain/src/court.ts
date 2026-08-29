import type {
  BacktestResult,
  BacktestMetrics,
  CourtCategory,
  CourtFailureEvidence,
  CourtInput,
  CourtReport,
  CourtSummaryLabel,
  CourtVerdict,
  ParameterTrial,
  StrategyDefinition,
  Trade,
  VerdictStatus,
} from "@strategy-court/schemas";
import { EXECUTABLE_INDICATOR_DEFINITIONS, parseStrategyDefinition } from "@strategy-court/schemas";
import { runBacktest } from "./backtest.ts";
import { createReproducibilityId } from "./hash.ts";

export const ENGINE_VERSION = "strategy-court-domain/0.1.0";
export const HISTORICAL_LIMITATION = "Historical tests cannot establish that a strategy will remain profitable in future market conditions.";

interface NumericParameter {
  path: string;
  value: number;
  integer: boolean;
  min: number;
  max: number;
}

const INDICATOR_PARAMETER_LIMITS = Object.fromEntries(
  EXECUTABLE_INDICATOR_DEFINITIONS.flatMap((indicator) => indicator.parameters
    .filter((parameter) => parameter.type === "integer" || parameter.type === "number")
    .map((parameter) => [parameter.name, {
      integer: parameter.type === "integer",
      min: parameter.min ?? -Number.MAX_VALUE,
      max: parameter.max ?? Number.MAX_VALUE,
    }] as const)),
);

const PARAMETER_LIMITS: Record<string, Pick<NumericParameter, "integer" | "min" | "max">> = {
  ...INDICATOR_PARAMETER_LIMITS,
  constant: { integer: false, min: -Number.MAX_VALUE, max: Number.MAX_VALUE },
  bars: { integer: true, min: 0, max: 2520 },
  stopLossPercent: { integer: false, min: 0.01, max: 100 },
  takeProfitPercent: { integer: false, min: 0.01, max: 100 },
  maxHoldingDays: { integer: true, min: 1, max: 2520 },
};

function collectParameters(value: unknown, path = "", result: NumericParameter[] = []): NumericParameter[] {
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = `${path}/${key}`;
    const limits = PARAMETER_LIMITS[key];
    if (typeof child === "number" && limits) {
      result.push({ path: next, value: child, ...limits });
    } else collectParameters(child, next, result);
  }
  return result;
}

function setAtPath(strategy: StrategyDefinition, path: string, value: number): StrategyDefinition {
  const clone = structuredClone(strategy) as unknown as Record<string, unknown>;
  const segments = path.split("/").filter(Boolean);
  let cursor: Record<string, unknown> | unknown[] = clone;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index] as string;
    cursor = (cursor as Record<string, unknown>)[key] as Record<string, unknown> | unknown[];
  }
  const key = segments.at(-1) as string;
  (cursor as Record<string, unknown>)[key] = value;
  return parseStrategyDefinition(clone);
}

function neighbourValues(parameter: NumericParameter): Array<{ value: number; factor: number }> {
  const seen = new Set<number>([parameter.value]);
  const result: Array<{ value: number; factor: number }> = [];
  for (const factor of [0.8, 0.9, 1.1, 1.2]) {
    const scaled = Math.min(parameter.max, Math.max(parameter.min, parameter.value * factor));
    const rounded = parameter.integer
      ? Math.round(scaled)
      : Math.abs(scaled) <= Number.MAX_SAFE_INTEGER / 10_000_000_000
        ? Math.round((scaled + Number.EPSILON) * 10_000_000_000) / 10_000_000_000
        : scaled;
    const value = Math.min(parameter.max, Math.max(parameter.min, rounded));
    if (!seen.has(value)) { seen.add(value); result.push({ value, factor }); }
  }
  return result;
}

function metricProfitFactor(metrics: BacktestMetrics): number {
  if (metrics.profitFactor !== null) return metrics.profitFactor;
  return metrics.winningTrades > 0 && metrics.losingTrades === 0 ? Number.POSITIVE_INFINITY : 0;
}

function verdict(category: CourtCategory, title: string, status: VerdictStatus, summary: string, thresholds: string[], evidence: CourtVerdict["evidence"]): CourtVerdict {
  return { category, title, status, summary, thresholds, evidence };
}

export function evidenceSufficiencyVerdict(outOfSampleTrades: number): CourtVerdict {
  const status = outOfSampleTrades >= 30 ? "Pass" : "Inconclusive";
  return verdict("evidence_sufficiency", "Evidence sufficiency", status, status === "Pass" ? "The evaluation period contains at least 30 completed trades." : "The evaluation period contains fewer than 30 completed trades.", ["Pass at 30 or more completed evaluation trades", "Inconclusive below 30"], { completedOutOfSampleTrades: outOfSampleTrades });
}

export function outOfSampleVerdict(metrics: BacktestMetrics, evidenceStatus: VerdictStatus): CourtVerdict {
  if (evidenceStatus !== "Pass") return verdict("out_of_sample_robustness", "Out-of-sample robustness", "Inconclusive", "There are too few evaluation trades to make a robustness finding.", ["Evaluated only when evidence sufficiency passes"], { netProfit: metrics.netProfit, expectancy: metrics.expectancyPerTrade, profitFactor: metrics.profitFactor });
  const expectancy = metrics.expectancyPerTrade ?? 0;
  const factor = metricProfitFactor(metrics);
  let status: VerdictStatus;
  if (metrics.netProfit <= 0 || expectancy <= 0 || factor < 1) status = "Fail";
  else if (factor >= 1.1) status = "Pass";
  else status = "Warning";
  return verdict("out_of_sample_robustness", "Out-of-sample robustness", status, status === "Pass" ? "Evaluation profit, expectancy, and profit factor clear the default thresholds." : status === "Warning" ? "Evaluation results remain positive, but profit factor is below 1.10." : "At least one required evaluation metric is non-positive or profit factor is below 1.00.", ["Pass: profit and expectancy above zero, profit factor at least 1.10", "Warning: profit and expectancy above zero, profit factor from 1.00 to below 1.10", "Fail: profit or expectancy at most zero, or profit factor below 1.00"], { netProfit: metrics.netProfit, expectancy, profitFactor: Number.isFinite(factor) ? factor : "no losing trades" });
}

export function parameterStabilityVerdict(trials: readonly ParameterTrial[]): CourtVerdict {
  if (trials.length === 0) return verdict("parameter_stability", "Parameter stability", "Inconclusive", "The strategy has no meaningfully variable numerical parameters.", ["Each parameter is tested independently at minus 20%, minus 10%, plus 10%, and plus 20%"], { neighbouringConfigurations: 0, profitableConfigurations: 0, profitablePercent: null });
  const completed = trials.filter((trial) => trial.status === "completed");
  if (completed.length === 0) return verdict("parameter_stability", "Parameter stability", "Inconclusive", "No valid neighbouring configuration could be simulated.", ["Only schema-valid one-parameter neighbours contribute to stability"], { neighbouringConfigurations: 0, invalidConfigurations: trials.length, profitableConfigurations: 0, profitablePercent: null });
  const profitable = completed.filter((trial) => trial.profitable).length;
  const percent = profitable / completed.length * 100;
  const status: VerdictStatus = percent >= 60 ? "Pass" : percent >= 40 ? "Warning" : "Fail";
  return verdict("parameter_stability", "Parameter stability", status, `${profitable} of ${completed.length} valid neighbouring configurations remained profitable after costs.`, ["Pass: at least 60% profitable", "Warning: 40% to below 60% profitable", "Fail: below 40% profitable"], { neighbouringConfigurations: completed.length, invalidConfigurations: trials.length - completed.length, profitableConfigurations: profitable, profitablePercent: percent });
}

export function executionResilienceVerdict(baseline: BacktestMetrics, stressed: BacktestMetrics): CourtVerdict {
  const drop = baseline.netProfit > 0 ? (baseline.netProfit - stressed.netProfit) / baseline.netProfit * 100 : null;
  const status: VerdictStatus = stressed.netProfit <= 0 ? "Fail" : drop !== null && drop > 50 ? "Warning" : "Pass";
  return verdict("execution_resilience", "Execution resilience", status, status === "Fail" ? "Doubling configured costs removes the evaluation-period profit." : status === "Warning" ? "The strategy remains profitable under doubled costs, but profit falls by more than half." : "The strategy remains profitable and loses no more than half its profit under doubled costs.", ["Pass: stressed profit remains positive and falls by no more than 50%", "Warning: stressed profit remains positive and falls by more than 50%", "Fail: stressed profit is zero or negative"], { baselineNetProfit: baseline.netProfit, stressedNetProfit: stressed.netProfit, profitDropPercent: drop });
}

export function regimeStabilityVerdict(trades: CourtReport["baseline"]["trades"]): CourtVerdict {
  const regimes = ["positive_low", "positive_high", "negative_low", "negative_high"] as const;
  const groups = regimes.map((regime) => {
    const matching = trades.filter((trade) => trade.marketRegime === regime);
    return { regime, trades: matching.length, netProfit: matching.reduce((sum, trade) => sum + trade.netProfit, 0), expectancy: matching.length ? matching.reduce((sum, trade) => sum + trade.netProfit, 0) / matching.length : null };
  });
  const observed = groups.filter((group) => group.trades >= 10);
  if (observed.length < 2) return verdict("regime_stability", "Regime stability", "Inconclusive", "Fewer than two market regimes contain ten completed trades.", ["A regime is observed at ten completed trades"], { observedRegimes: observed.length });
  const positive = observed.filter((group) => (group.expectancy ?? 0) > 0).length;
  const positivePercent = positive / observed.length * 100;
  const totalProfit = observed.reduce((sum, group) => sum + group.netProfit, 0);
  const largestProfit = Math.max(...observed.map((group) => group.netProfit));
  const otherProfit = totalProfit - largestProfit;
  const concentrated = totalProfit > 0 && largestProfit / totalProfit > 0.8 && otherProfit < 0;
  let status: VerdictStatus;
  if (positivePercent < 50 || concentrated) status = "Fail";
  else if (observed.length >= 3 && positivePercent >= 75) status = "Pass";
  else status = "Warning";
  return verdict("regime_stability", "Regime stability", status, `${positive} of ${observed.length} observed regimes have positive expectancy.`, ["Pass: at least three observed and at least 75% positive", "Warning: only two observed or 50% to below 75% positive", "Fail: below 50% positive or profit is concentrated in one regime while others lose"], { observedRegimes: observed.length, positiveRegimes: positive, positiveRegimePercent: positivePercent, profitConcentratedInOneRegime: concentrated });
}

export function profitConcentrationVerdict(metrics: BacktestMetrics): CourtVerdict {
  const best = metrics.bestTradeContributionPercent;
  const five = metrics.bestFiveTradesContributionPercent;
  if (metrics.netProfit <= 0 || metrics.winningTrades < 5 || best === null || five === null) return verdict("profit_concentration", "Profit concentration", "Inconclusive", "Positive net profit and at least five winning trades are required for this analysis.", ["Inconclusive when net profit is not positive or fewer than five winning trades exist"], { netProfit: metrics.netProfit, winningTrades: metrics.winningTrades, bestTradeContributionPercent: best, bestFiveTradesContributionPercent: five });
  const status: VerdictStatus = best > 35 || five > 75 ? "Fail" : best <= 20 && five <= 50 ? "Pass" : "Warning";
  return verdict("profit_concentration", "Profit concentration", status, `The best trade contributes ${best.toFixed(1)}% and the best five contribute ${five.toFixed(1)}% of completed-trade net profit.`, ["Pass: best trade at most 20% and best five at most 50%", "Warning: best trade above 20% to 35% or best five above 50% to 75%", "Fail: best trade above 35% or best five above 75%"], { bestTradeContributionPercent: best, bestFiveTradesContributionPercent: five });
}

export function riskProfileVerdict(metrics: BacktestMetrics): CourtVerdict {
  const recovery = metrics.recoveryTimeDays;
  const fails = metrics.maximumDrawdownPercent > 35 || (recovery !== null && recovery > 504) || metrics.unrecoveredDrawdown;
  const passes = metrics.maximumDrawdownPercent <= 25 && (recovery === null || recovery <= 252) && !metrics.unrecoveredDrawdown;
  const status: VerdictStatus = fails ? "Fail" : passes ? "Pass" : "Warning";
  return verdict("risk_profile", "Risk profile", status, metrics.unrecoveredDrawdown ? "The final drawdown did not recover before the test ended." : `Maximum drawdown is ${metrics.maximumDrawdownPercent.toFixed(1)}% and recovery took ${recovery ?? 0} trading days.`, ["Pass: drawdown at most 25% and recovery at most 252 trading days", "Warning: drawdown above 25% to 35% or recovery above 252 to 504 days", "Fail: drawdown above 35%, recovery above 504 days, or no recovery by period end"], { maximumDrawdownPercent: metrics.maximumDrawdownPercent, recoveryTimeDays: recovery, unrecoveredDrawdown: metrics.unrecoveredDrawdown });
}

export function summarizeCourt(verdicts: readonly CourtVerdict[], hasDataWarning = false): CourtSummaryLabel {
  const byCategory = new Map(verdicts.map((item) => [item.category, item.status]));
  const material = verdicts.filter((item) => item.category !== "evidence_sufficiency");
  if (material.some((item) => item.status === "Fail")) return "Fragile";
  if (byCategory.get("evidence_sufficiency") === "Inconclusive" || byCategory.get("out_of_sample_robustness") === "Inconclusive") return "Inconclusive";
  if (!hasDataWarning && verdicts.every((item) => item.status === "Pass")) return "Survived current tests";
  if (
    byCategory.get("evidence_sufficiency") === "Pass"
    && byCategory.get("out_of_sample_robustness") === "Pass"
    && material.every((item) => item.status === "Pass" || item.status === "Warning")
  ) return "Paper-trading candidate";
  return "Inconclusive";
}

function periodFromTrades(trades: readonly Trade[], fallback: { start: string; end: string }): { start: string; end: string } {
  if (!trades.length) return fallback;
  return {
    start: trades.map((trade) => trade.entryDate).sort()[0] ?? fallback.start,
    end: trades.map((trade) => trade.exitDate).sort().at(-1) ?? fallback.end,
  };
}

function drawdownPeriod(result: BacktestResult, fallback: { start: string; end: string }): { start: string; end: string } {
  if (result.equityCurve.length < 2) return fallback;
  let peakIndex = 0;
  let activePeak = 0;
  let troughIndex = 0;
  let worstDrawdown = 0;
  result.equityCurve.forEach((point, index) => {
    const active = result.equityCurve[activePeak];
    if (!active || point.equity > active.equity) activePeak = index;
    if (point.drawdownPercent > worstDrawdown) {
      worstDrawdown = point.drawdownPercent;
      peakIndex = activePeak;
      troughIndex = index;
    }
  });
  if (troughIndex <= peakIndex) return fallback;
  return {
    start: result.equityCurve[peakIndex]?.date ?? fallback.start,
    end: result.equityCurve[troughIndex]?.date ?? fallback.end,
  };
}

function weakestTradeCluster(trades: readonly Trade[], fallback: { start: string; end: string }): { start: string; end: string } {
  if (!trades.length) return fallback;
  const ordered = [...trades].sort((left, right) => left.exitDate.localeCompare(right.exitDate));
  const width = Math.min(5, ordered.length);
  let selected = ordered.slice(0, width);
  let selectedProfit = selected.reduce((sum, trade) => sum + trade.netProfit, 0);
  for (let index = 1; index <= ordered.length - width; index += 1) {
    const candidate = ordered.slice(index, index + width);
    const profit = candidate.reduce((sum, trade) => sum + trade.netProfit, 0);
    if (profit < selectedProfit) {
      selected = candidate;
      selectedProfit = profit;
    }
  }
  return periodFromTrades(selected, fallback);
}

function regimeFailurePeriod(trades: readonly Trade[], fallback: { start: string; end: string }): { start: string; end: string } {
  const grouped = new Map<string, Trade[]>();
  for (const trade of trades) (grouped.get(trade.marketRegime) ?? (() => { const value: Trade[] = []; grouped.set(trade.marketRegime, value); return value; })()).push(trade);
  const weakest = [...grouped.values()]
    .filter((group) => group.length >= 10)
    .sort((left, right) => left.reduce((sum, trade) => sum + trade.netProfit, 0) - right.reduce((sum, trade) => sum + trade.netProfit, 0))[0];
  return periodFromTrades(weakest ?? [], fallback);
}

function concentrationPeriod(trades: readonly Trade[], fallback: { start: string; end: string }): { start: string; end: string } {
  return periodFromTrades([...trades].filter((trade) => trade.netProfit > 0).sort((left, right) => right.netProfit - left.netProfit).slice(0, 5), fallback);
}

function courtFailures(
  verdicts: readonly CourtVerdict[],
  baseline: BacktestResult,
  outOfSample: BacktestResult,
  stressedCosts: BacktestResult,
): CourtFailureEvidence[] {
  return verdicts
    .filter((item) => item.status === "Fail" || item.status === "Warning")
    .map((item) => {
      let dateRange = outOfSample.dateRange;
      switch (item.category) {
        case "out_of_sample_robustness": dateRange = drawdownPeriod(outOfSample, outOfSample.dateRange); break;
        case "parameter_stability": dateRange = weakestTradeCluster(outOfSample.trades, outOfSample.dateRange); break;
        case "execution_resilience": dateRange = weakestTradeCluster(stressedCosts.trades, stressedCosts.dateRange); break;
        case "regime_stability": dateRange = regimeFailurePeriod(baseline.trades, baseline.dateRange); break;
        case "profit_concentration": dateRange = concentrationPeriod(baseline.trades, baseline.dateRange); break;
        case "risk_profile": dateRange = drawdownPeriod(baseline, baseline.dateRange); break;
        case "evidence_sufficiency": dateRange = outOfSample.dateRange; break;
      }
      return {
        id: item.category,
        category: item.category,
        status: item.status,
        finding: item.summary,
        dateRange,
        evidence: item.evidence,
      };
    });
}

export function runCourt(input: CourtInput): CourtReport {
  const strategy = parseStrategyDefinition(input.strategy);
  const range = input.dateRange ?? { start: input.snapshot.startDate, end: input.snapshot.endDate };
  const dates = [...new Set(strategy.universe.flatMap((symbol) => (input.snapshot.bars[symbol] ?? []).filter((bar) => bar.date >= range.start && bar.date <= range.end).map((bar) => bar.date)))].sort();
  if (dates.length < 2) throw new RangeError("Court requires at least two market dates in the selected range");
  const splitIndex = Math.min(dates.length - 1, Math.max(1, Math.floor(dates.length * 0.7)));
  const splitDate = dates[splitIndex] as string;
  const evaluationRange = { start: splitDate, end: range.end };
  const baseline = runBacktest({ ...input, strategy, dateRange: range });
  const outOfSample = runBacktest({ ...input, strategy, dateRange: evaluationRange });
  const stressedStrategy = structuredClone(strategy);
  stressedStrategy.costs.commissionBpsPerSide = Math.min(1000, stressedStrategy.costs.commissionBpsPerSide * 2);
  stressedStrategy.costs.slippageBpsPerSide = Math.min(1000, stressedStrategy.costs.slippageBpsPerSide * 2);
  const stressedCosts = runBacktest({ ...input, strategy: stressedStrategy, dateRange: evaluationRange });
  const parameterTrials: ParameterTrial[] = [];
  for (const parameter of collectParameters(strategy)) {
    for (const neighbour of neighbourValues(parameter)) {
      let candidate: StrategyDefinition;
      try {
        candidate = setAtPath(strategy, parameter.path, neighbour.value);
      } catch (error) {
        // Relational constraints such as MACD fast < slow or SAR acceleration <= maximum
        // can make an otherwise in-range one-at-a-time neighbour invalid.
        parameterTrials.push({
          path: parameter.path,
          baseline: parameter.value,
          value: neighbour.value,
          factor: neighbour.factor,
          status: "invalid",
          netProfit: null,
          profitable: null,
          invalidReason: error instanceof Error ? error.message : "The neighbouring strategy is invalid.",
        });
        continue;
      }
      const result = runBacktest({ ...input, strategy: candidate, dateRange: evaluationRange });
      parameterTrials.push({ path: parameter.path, baseline: parameter.value, value: neighbour.value, factor: neighbour.factor, status: "completed", netProfit: result.metrics.netProfit, profitable: result.metrics.netProfit > 0 });
    }
  }
  const evidence = evidenceSufficiencyVerdict(outOfSample.metrics.numberOfTrades);
  const verdicts: CourtVerdict[] = [
    evidence,
    outOfSampleVerdict(outOfSample.metrics, evidence.status),
    parameterStabilityVerdict(parameterTrials),
    executionResilienceVerdict(outOfSample.metrics, stressedCosts.metrics),
    regimeStabilityVerdict(baseline.trades),
    profitConcentrationVerdict(baseline.metrics),
    riskProfileVerdict(baseline.metrics),
  ];
  const dataWarnings: string[] = [];
  if (baseline.diagnostics.missingBars > 0) dataWarnings.push(`${baseline.diagnostics.missingBars} missing bars were reported by the data snapshot.`);
  if ((input.snapshot.bars.SPY?.filter((bar) => bar.date >= range.start && bar.date <= range.end).length ?? 0) < 272) dataWarnings.push("SPY history is too short for complete 200-day trend and trailing volatility-regime classification.");
  const reproducibilityId = createReproducibilityId({
    strategyVersionId: input.strategyVersionId ?? null,
    strategy,
    dataSnapshotId: input.snapshot.id,
    dataSnapshotHash: input.snapshot.contentHash,
    dateRange: range,
    universe: strategy.universe,
    initialCapital: input.initialCapital,
    costs: strategy.costs,
    courtProfile: input.courtProfile ?? "balanced",
    engineVersion: ENGINE_VERSION,
  });
  return {
    engineVersion: ENGINE_VERSION,
    reproducibilityId,
    summaryLabel: summarizeCourt(verdicts, dataWarnings.length > 0),
    limitation: HISTORICAL_LIMITATION,
    splitDate,
    baseline,
    outOfSample,
    stressedCosts,
    parameterTrials,
    verdicts,
    failures: courtFailures(verdicts, baseline, outOfSample, stressedCosts),
    dataWarnings,
  };
}
