import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { tradeEvidenceId, type DecisionFields, type InvestigationDecision, type DataSnapshotPolicy } from "@strategy-court/schemas";
import { useEvidenceSelection } from "./evidence";
import { sampleDefinition, sampleInput } from "@/data/demo";
import { apiRequest, unwrap, type ApiActor } from "@/services/api";
import { formatProfitFactor } from "@/services/resultPresentation";
import type {
  AuditEvent, CaseInput, CourtCase, CourtResult, CourtRun, FailureEvidence, Metric,
  LatestBarMonitoringStatus, MarketEvidence, MarketEvidenceBar, MonitoringChange, MonitoringEvaluation, MonitoringPosition,
  MonitoringResponse, MonitoringSignal, ReplaySession, StrategyDefinition, StrategyVersion, Trade, Verdict, VersionComparison, WorkspaceTab,
} from "@/types";

const wait = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason ?? new Error("Operation cancelled.")); return; }
  const finish = () => { signal?.removeEventListener("abort", cancel); resolve(); };
  const timer = window.setTimeout(finish, milliseconds);
  const cancel = () => { window.clearTimeout(timer); reject(signal?.reason ?? new Error("Operation cancelled.")); };
  signal?.addEventListener("abort", cancel, { once: true });
});
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const humanize = (value: unknown) => String(value ?? "").replaceAll(/[._-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const scalar = (value: unknown) => typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value ?? "Not reported");
const messageFor = (issue: unknown, fallback: string) => issue instanceof Error ? issue.message : fallback;

function versionConfirmed(version?: StrategyVersion): boolean {
  return Boolean(version?.confirmed || version?.confirmedAt);
}

function metricCards(value: unknown): Metric[] {
  if (Array.isArray(value)) return value as Metric[];
  const metrics = record(value);
  if (Object.keys(metrics).length === 0) return [];
  const netReturn = finite(metrics.netReturnPercent);
  const drawdown = finite(metrics.maximumDrawdownPercent);
  const profitFactor = formatProfitFactor(metrics);
  const expectancy = typeof metrics.expectancyPerTrade === "number"
    ? `${metrics.expectancyPerTrade >= 0 ? "+" : "−"}$${Math.abs(metrics.expectancyPerTrade).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : "Not available";
  const recovery = metrics.unrecoveredDrawdown === true
    ? "not recovered by range end"
    : `${scalar(metrics.recoveryTimeDays ?? metrics.maximumDrawdownDurationDays)} trading days`;
  return [
    { label: "Net return", value: `${netReturn >= 0 ? "+" : "−"}${Math.abs(netReturn).toFixed(1)}%`, change: "after configured costs", tone: netReturn >= 0 ? "positive" : "negative" },
    { label: "Max drawdown", value: `−${Math.abs(drawdown).toFixed(1)}%`, change: recovery, tone: "negative" },
    { label: "Profit factor", value: profitFactor, change: "completed trades", tone: "neutral" },
    { label: "Completed trades", value: String(finite(metrics.numberOfTrades)), change: metrics.winRatePercent == null ? "win rate unavailable" : `${finite(metrics.winRatePercent).toFixed(1)}% win rate`, tone: "neutral" },
    { label: "Expectancy", value: expectancy, change: "average net result per trade", tone: typeof metrics.expectancyPerTrade === "number" && metrics.expectancyPerTrade < 0 ? "negative" : "neutral" },
  ];
}

function normalizeTrade(value: unknown, index: number): Trade {
  const trade = record(value);
  return {
    id: tradeEvidenceId(index),
    symbol: String(trade.symbol ?? "N/A"), entryDate: String(trade.entryDate ?? ""), entryPrice: finite(trade.entryPrice),
    exitDate: String(trade.exitDate ?? ""), exitPrice: finite(trade.exitPrice), quantity: finite(trade.quantity),
    netProfit: finite(trade.netProfit), costs: finite(trade.costs), exitReason: humanize(trade.exitReason),
    regime: humanize(trade.regime ?? trade.marketRegime ?? "unknown"),
  };
}

function normalizeVerdict(value: unknown, index: number): Verdict {
  const verdict = record(value);
  const evidence = record(verdict.evidence);
  const firstEvidence = Object.entries(evidence)[0];
  const rawStatus = String(verdict.status ?? verdict.verdict ?? "Inconclusive");
  const status = (["Pass", "Warning", "Fail", "Inconclusive"].includes(rawStatus) ? rawStatus : "Inconclusive") as Verdict["status"];
  const id = String(verdict.id ?? verdict.category ?? `verdict-${index + 1}`);
  return {
    id, category: String(verdict.title ?? (humanize(verdict.category) || "Court finding")), status,
    finding: String(verdict.finding ?? verdict.summary ?? "The API returned no written finding."),
    measure: String(verdict.measure ?? (firstEvidence ? `${humanize(firstEvidence[0])}: ${scalar(firstEvidence[1])}` : "No measure returned")),
    threshold: String(verdict.threshold ?? (Array.isArray(verdict.thresholds) ? verdict.thresholds.join(" · ") : "No threshold returned")),
    failureId: status === "Fail" || status === "Warning" ? id : undefined,
  };
}

export function normalizeMarketEvidence(value: unknown): MarketEvidence {
  const evidence: MarketEvidence = {};
  for (const [symbol, rawSeries] of Object.entries(record(value))) {
    const series = Array.isArray(rawSeries) ? rawSeries : Array.isArray(record(rawSeries).bars) ? record(rawSeries).bars as unknown[] : [];
    const regimes = record(record(rawSeries).regimes);
    const bars = series.flatMap((rawBar): MarketEvidenceBar[] => {
      const bar = record(rawBar);
      const date = String(bar.date ?? bar.timestamp ?? "").slice(0, 10);
      const values = [bar.open, bar.high, bar.low, bar.close];
      if (!date || !values.every((item) => typeof item === "number" && Number.isFinite(item))) return [];
      const regime = bar.regime ?? bar.marketRegime ?? regimes[date];
      return [{
        date,
        open: bar.open as number,
        high: bar.high as number,
        low: bar.low as number,
        close: bar.close as number,
        volume: finite(bar.volume),
        adjusted: typeof bar.adjusted === "boolean" ? bar.adjusted : undefined,
        regime: typeof regime === "string" && regime.trim() ? humanize(regime) : undefined,
      }];
    });
    if (bars.length) evidence[symbol] = bars.sort((left, right) => left.date.localeCompare(right.date));
  }
  return evidence;
}

export function normalizeFailure(value: unknown, index: number, fallbackTrades: Trade[] = [], runTrades: Trade[] = []): FailureEvidence {
  const failure = record(value);
  const evidence = record(failure.evidence);
  const periodRecord = record(failure.period ?? failure.dateRange);
  const equity = record(failure.equity);
  const regime = record(failure.regime);
  const costs = record(failure.costs);
  const indicatorEvidence = record(failure.indicatorEvidence);
  const explanationInputs = failure.explanationInputs ?? failure.evidence;
  const trades = Array.isArray(failure.trades) ? failure.trades.map((value, index) => {
    const trade = normalizeTrade(value, index);
    // A period's filtered array must never manufacture an ID from its local index.
    const original = runTrades.find(item => item.symbol === trade.symbol && item.entryDate === trade.entryDate && item.exitDate === trade.exitDate);
    return { ...trade, id: original?.id };
  }) : fallbackTrades;
  const inputs: Array<{ label: string; value: string }> = [];
  const addInputs = (prefix: string, source: Record<string, unknown>) => {
    for (const [key, item] of Object.entries(source)) {
      if (item && typeof item === "object") continue;
      inputs.push({ label: prefix ? `${prefix} ${humanize(key)}` : humanize(key), value: scalar(item) });
    }
  };
  addInputs("", evidence);
  addInputs("Equity", equity);
  const start = String(periodRecord.start ?? periodRecord.from ?? "");
  const end = String(periodRecord.end ?? periodRecord.to ?? "");
  const equityChange = typeof equity.change === "number"
    ? `${equity.change >= 0 ? "+" : "−"}$${Math.abs(equity.change).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : String(failure.equityChange ?? "Not reported");
  return {
    id: String(failure.id ?? failure.category ?? `failure-${index + 1}`),
    dateRange: start && end ? { start, end } : undefined,
    title: String(failure.title ?? humanize(failure.category ?? "Evidence finding")),
    period: String(typeof failure.period === "string" ? failure.period : start && end ? `${start} to ${end}` : "Range not reported"),
    summary: String(failure.summary ?? failure.finding ?? failure.explanation ?? failure.description ?? failure.message ?? "The API returned no written evidence summary."), equityChange,
    regime: String(typeof failure.regime === "string" ? failure.regime : regime.breakdown ? Object.entries(record(regime.breakdown)).map(([label, details]) => `${humanize(label)}: ${scalar(record(details).trades)} trades`).join(" · ") : "Not reported"),
    symbols: Array.isArray(failure.symbols) ? failure.symbols.map(String) : [], trades, inputs, evidence, equity, costs, indicatorEvidence, explanationInputs,
    periodRaw: failure.period ?? failure.dateRange, regimeEvidence: regime,
    indicatorValues: Array.isArray(indicatorEvidence.values) ? indicatorEvidence.values : Array.isArray(failure.indicatorValues) ? failure.indicatorValues : [],
    marketBars: Array.isArray(indicatorEvidence.marketBars) ? indicatorEvidence.marketBars : Array.isArray(failure.marketBars) ? failure.marketBars : [], raw: failure,
  };
}

type RunPayload = Partial<CourtRun> & {
  resultJson?: unknown; strategyVersionId?: unknown; summary?: unknown; engineVersion?: unknown;
  reproducibilityId?: unknown; progress?: unknown; error?: unknown;
};

function normalizeCourtResult(value: unknown, run: RunPayload): CourtResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = record(value);
  const baseline = record(raw.baseline);
  const outOfSample = record(raw.outOfSample);
  const stressedCosts = record(raw.stressedCosts);
  const metricsObject = record(raw.metrics ?? baseline.metrics);
  const verdictValues = Array.isArray(raw.verdicts) ? raw.verdicts : [];
  const summaryLabel = String(raw.summaryLabel ?? run.summary ?? "");
  const invalid = run.status === "invalid" || summaryLabel.toLowerCase() === "invalid";
  if (!invalid && (Object.keys(metricsObject).length === 0 || verdictValues.length === 0 || !summaryLabel)) return undefined;
  const trades = (Array.isArray(raw.trades) ? raw.trades : Array.isArray(baseline.trades) ? baseline.trades : []).map(normalizeTrade);
  const rawRange = record(raw.dateRange ?? baseline.dateRange);
  const start = String(rawRange.start ?? rawRange.from ?? "");
  const end = String(rawRange.end ?? rawRange.to ?? "");
  const equityValues = Array.isArray(raw.equityCurve) ? raw.equityCurve : Array.isArray(baseline.equityCurve) ? baseline.equityCurve : [];
  const drawdownValues = Array.isArray(raw.drawdownCurve) ? raw.drawdownCurve : equityValues;
  const diagnostics = record(baseline.diagnostics ?? raw.diagnostics);
  const signalDiagnostics = (Array.isArray(diagnostics.signalEvents) ? diagnostics.signalEvents : []).flatMap((value) => {
    const event = record(value);
    const signal: "entry" | "exit" | null = event.signal === "entry" || event.signal === "exit" ? event.signal : null;
    const status: "skipped" | "rejected" | null = event.status === "skipped" || event.status === "rejected" ? event.status : null;
    const symbol = String(event.symbol ?? "");
    const date = String(event.date ?? "");
    return signal && status && symbol && date ? [{ symbol, date, signal, status, reason: humanize(event.reason ?? "Not reported") }] : [];
  });
  return {
    summaryLabel: summaryLabel || "Invalid", verdicts: verdictValues.map(normalizeVerdict), metrics: metricCards(metricsObject),
    data: record(raw.data),
    equityCurve: equityValues.map((item) => { const point = record(item); return { date: String(point.date ?? ""), value: finite(point.value ?? point.equity), benchmark: typeof point.benchmark === "number" ? point.benchmark : undefined }; }),
    drawdownCurve: drawdownValues.map((item) => { const point = record(item); return { date: String(point.date ?? ""), value: -Math.abs(finite(point.value ?? point.drawdownPercent)) }; }),
    trades, failures: (Array.isArray(raw.failures) ? raw.failures : []).map((item, index) => normalizeFailure(item, index, [], trades)),
    assumptions: Object.fromEntries(Object.entries(record(raw.assumptions)).map(([key, item]) => [humanize(key), scalar(item)])),
    reproducibilityId: String(raw.reproducibilityId ?? run.reproducibilityId ?? "Not reported"),
    engineVersion: String(raw.engineVersion ?? run.engineVersion ?? "Not reported"),
    limitation: typeof raw.limitation === "string" ? raw.limitation : undefined,
    dateRange: start && end ? { start, end } : undefined,
    rawMetrics: metricsObject,
    outOfSampleMetrics: record(outOfSample.metrics),
    stressedCostMetrics: record(stressedCosts.metrics),
    splitDate: typeof raw.splitDate === "string" ? raw.splitDate : undefined,
    parameterTrials: (Array.isArray(raw.parameterTrials) ? raw.parameterTrials : []).map(record),
    dataWarnings: (Array.isArray(raw.dataWarnings) ? raw.dataWarnings : []).map(String),
    marketEvidence: normalizeMarketEvidence(raw.marketEvidence ?? baseline.marketEvidence),
    signalDiagnostics,
    invalidReason: invalid
      ? typeof raw.invalidReason === "string" ? raw.invalidReason : {
          code: typeof record(raw.invalidReason).code === "string" ? String(record(raw.invalidReason).code) : undefined,
          message: String(record(raw.invalidReason).message ?? raw.limitation ?? "This run could not be evaluated safely."),
          details: record(raw.invalidReason).details,
        }
      : undefined,
  };
}

export function normalizeRun(raw: RunPayload): CourtRun {
  const progressRecord = record(raw.progress);
  const progressValue = typeof raw.progress === "number" ? raw.progress : finite(progressRecord.percent);
  const progress = progressValue <= 1 && progressValue > 0 ? progressValue * 100 : progressValue;
  const result = normalizeCourtResult(raw.result ?? raw.resultJson, raw);
  const errorRecord = record(raw.error);
  return {
    id: String(raw.id ?? ""), versionId: String(raw.versionId ?? raw.strategyVersionId ?? ""), status: raw.status ?? "queued",
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    dataSnapshotId: String(raw.dataSnapshotId ?? record(raw.result ?? raw.resultJson).dataSnapshotId ?? "") || undefined,
    stage: String(raw.stage ?? progressRecord.stage ?? ""), result,
    createdAt: raw.createdAt,
    error: (raw.status === "completed" || raw.status === "invalid") && !result ? "The terminal run response did not include a usable result." : String(errorRecord.message ?? (typeof raw.error === "string" ? raw.error : "")) || undefined,
  };
}

function normalizeReplay(value: unknown): ReplaySession {
  const raw = record(value);
  const state = record(raw.state);
  const observedMetrics = record(state.metrics ?? raw.metrics);
  const baselineMetrics = record(state.baselineMetrics);
  const rawSignals = Array.isArray(state.signals) ? state.signals : [];
  const rawPositions = Array.isArray(state.positions) ? state.positions : [];
  const totalBars = Math.max(1, finite(state.totalBars, 1));
  const cursor = finite(state.cursor ?? raw.cursor, -1);
  const baselineDays = Math.max(1, finite(state.baselineTradingDays, 1));
  const observedDays = Math.max(0, finite(state.observedTradingDays, cursor + 1));
  const optionalNumber = (candidate: unknown): number | null => typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
  const rate = (trades: unknown, days: number) => `${(finite(trades) / Math.max(1, days) * 100).toFixed(1)} per 100 bars`;
  const percent = (candidate: unknown) => optionalNumber(candidate) === null ? "Not available" : `${optionalNumber(candidate)!.toFixed(1)}%`;
  const averageTrade = (candidate: unknown) => optionalNumber(candidate) === null
    ? "Not available"
    : `${optionalNumber(candidate)! < 0 ? "−" : "+"}$${Math.abs(optionalNumber(candidate)!).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return {
    id: String(raw.id ?? ""), versionId: String(raw.versionId ?? raw.strategyVersionId ?? ""),
    status: raw.status === "completed" || state.status === "complete" ? "completed" : "active",
    currentDate: String(state.currentDate ?? raw.currentDate ?? ""), startDate: String(raw.startDate ?? raw.reservedFrom ?? ""), endDate: String(raw.endDate ?? raw.reservedTo ?? ""),
    progress: Math.max(0, Math.min(100, Math.round(((cursor + 1) / totalBars) * 100))), regime: humanize(state.currentRegime ?? raw.regime ?? "unknown"),
    metrics: metricCards(observedMetrics),
    comparisons: [
      { label: "Trade frequency", historical: rate(baselineMetrics.numberOfTrades, baselineDays), observed: rate(observedMetrics.numberOfTrades, observedDays) },
      { label: "Win rate", historical: percent(baselineMetrics.winRatePercent), observed: percent(observedMetrics.winRatePercent) },
      { label: "Average trade", historical: averageTrade(baselineMetrics.expectancyPerTrade), observed: averageTrade(observedMetrics.expectancyPerTrade) },
    ],
    signals: rawSignals.map((item) => { const signal = record(item); return { symbol: String(signal.symbol ?? "N/A"), state: signal.entry === true ? "Entry" : signal.exit === true ? "Exit" : "No signal", detail: signal.entry === true ? "Entry rule active" : signal.exit === true ? "Exit rule active" : "No active rule" }; }),
    positions: rawPositions.map((item) => { const position = record(item); const pnl = finite(position.unrealizedProfit); return { symbol: String(position.symbol ?? "N/A"), opened: String(position.entryDate ?? ""), pnl: `${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}` }; }),
    trades: (Array.isArray(state.trades) ? state.trades : []).map(normalizeTrade),
    newTrades: (Array.isArray(state.newTrades) ? state.newTrades : []).map(normalizeTrade),
    warnings: (Array.isArray(state.warnings) ? state.warnings : []).map(String),
  };
}

function normalizeMonitoringSignal(value: unknown): MonitoringSignal {
  const raw = record(value);
  return {
    symbol: String(raw.symbol ?? "N/A"),
    completedBarDate: String(raw.completedBarDate ?? ""),
    close: finite(raw.close),
    entry: typeof raw.entry === "boolean" ? raw.entry : null,
    exit: typeof raw.exit === "boolean" ? raw.exit : null,
  };
}

function normalizeMonitoringPosition(value: unknown): MonitoringPosition {
  const raw = record(value);
  return {
    symbol: String(raw.symbol ?? "N/A"),
    entryDate: String(raw.entryDate ?? ""),
    entryPrice: finite(raw.entryPrice),
    quantity: finite(raw.quantity),
    barsHeld: finite(raw.barsHeld),
    markedPrice: finite(raw.markedPrice),
    unrealizedProfit: finite(raw.unrealizedProfit),
  };
}

function normalizeMonitoringChange(value: unknown): MonitoringChange | null {
  const raw = record(value);
  const type = String(raw.type);
  if (!["entry_signal_activated", "exit_signal_activated", "regime_changed", "metrics_changed"].includes(type)) return null;
  const scalarChange = (item: unknown): string | number | boolean | null =>
    typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? item : null;
  return {
    type: type as MonitoringChange["type"],
    symbol: typeof raw.symbol === "string" ? raw.symbol : undefined,
    metric: typeof raw.metric === "string" ? raw.metric : undefined,
    before: scalarChange(raw.before),
    after: scalarChange(raw.after),
  };
}

export function normalizeMonitoringResponse(value: unknown): MonitoringResponse {
  const envelope = record(value);
  const raw = record(envelope.monitoring);
  const rawEvaluation = record(envelope.evaluation);
  const metrics = Object.fromEntries(Object.entries(record(raw.metrics)).flatMap(([key, item]) =>
    typeof item === "number" && Number.isFinite(item) || item === null ? [[key, item as number | null]] : []));
  const signals = (Array.isArray(raw.signals) ? raw.signals : []).map(normalizeMonitoringSignal);
  const positions = (Array.isArray(raw.positions) ? raw.positions : []).map(normalizeMonitoringPosition);
  const changes = (Array.isArray(raw.changes) ? raw.changes : []).flatMap((item) => {
    const change = normalizeMonitoringChange(item);
    return change ? [change] : [];
  });
  const evaluatedDate = typeof raw.evaluatedDate === "string" ? raw.evaluatedDate : null;
  const evaluation: MonitoringEvaluation | null = rawEvaluation.id ? {
    id: String(rawEvaluation.id),
    caseId: String(rawEvaluation.caseId ?? ""),
    strategyVersionId: String(rawEvaluation.strategyVersionId ?? raw.strategyVersionId ?? ""),
    dataSnapshotId: String(rawEvaluation.dataSnapshotId ?? raw.snapshotId ?? ""),
    evaluatedDate: String(rawEvaluation.evaluatedDate ?? evaluatedDate ?? ""),
    createdAt: String(rawEvaluation.createdAt ?? ""),
  } : null;
  return {
    monitoring: {
      status: raw.status === "not_started" || !evaluatedDate ? "not_started" : "evaluated",
      strategyVersionId: String(raw.strategyVersionId ?? evaluation?.strategyVersionId ?? ""),
      snapshotId: typeof raw.snapshotId === "string" ? raw.snapshotId : null,
      snapshotFetchedAt: typeof raw.snapshotFetchedAt === "string" ? raw.snapshotFetchedAt : null,
      evaluatedDate,
      currentRegime: humanize(raw.currentRegime ?? "unknown"),
      signals,
      positions,
      metrics,
      metricCards: metricCards(metrics),
      changes,
      warnings: (Array.isArray(raw.warnings) ? raw.warnings : []).map(String),
    },
    evaluation,
  };
}

function normalizeVersion(value: unknown, index: number): StrategyVersion {
  const item = record(value);
  const metadata = record(item.metadata);
  return {
    id: String(item.id ?? ""), versionNumber: finite(item.versionNumber ?? item.version, index + 1),
    parentVersionId: typeof item.parentVersionId === "string" ? item.parentVersionId : null,
    definition: item.definition as unknown as StrategyDefinition, interpretation: String(item.interpretation ?? "No interpretation returned."),
    source: (item.source === "agent" || item.source === "system" ? item.source : "user") as StrategyVersion["source"],
    confirmed: item.confirmed === true, confirmedAt: typeof item.confirmedAt === "string" ? item.confirmedAt : item.confirmed === true ? String(item.createdAt ?? "confirmed") : null,
    evaluationInformed: item.evaluationInformed === true, createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    hypothesis: String(item.hypothesis ?? metadata.hypothesis ?? ""), rationale: String(item.rationale ?? metadata.rationale ?? ""),
  };
}

export function normalizeCase(value: unknown, fallback?: CaseInput): CourtCase {
  const raw = record(value);
  const versions = (Array.isArray(raw.versions) ? raw.versions : []).map(normalizeVersion);
  const audits = (Array.isArray(raw.audit) ? raw.audit : []).map((value, index) => {
    const item = record(value);
    return { entityType: typeof item.entityType === "string" ? item.entityType : undefined, entityId: typeof item.entityId === "string" ? item.entityId : undefined, before: item.before, after: item.after, id: String(item.id ?? `audit-${index + 1}`), actor: (item.actor === "agent" || item.actor === "system" ? item.actor : "user") as AuditEvent["actor"], action: humanize(item.action), detail: String(item.detail ?? `Recorded ${humanize(item.entityType ?? "case")} change.`), createdAt: String(item.createdAt ?? "") };
  });
  return {
    id: String(raw.id ?? ""), name: String(raw.name ?? fallback?.name ?? "Untitled Court case"), description: String(raw.description ?? fallback?.description ?? ""),
    sampleId: typeof raw.sampleId === "string" ? raw.sampleId : null,
    decisions: Array.isArray(raw.decisions) ? raw.decisions as InvestigationDecision[] : [],
    symbols: Array.isArray(raw.symbols) ? raw.symbols.map(String) : fallback?.symbols ?? [],
    startDate: String(raw.startDate ?? raw.dateFrom ?? fallback?.startDate ?? ""), endDate: String(raw.endDate ?? raw.dateTo ?? fallback?.endDate ?? ""),
    initialCapital: finite(raw.initialCapital, fallback?.initialCapital ?? 10_000), profile: humanize(raw.profile ?? raw.selectedProfile ?? "balanced"), status: String(raw.status ?? "draft"),
    activeVersionId: typeof raw.activeVersionId === "string" ? raw.activeVersionId : versions.at(-1)?.id ?? null,
    evaluationViewed: raw.evaluationViewed === true || raw.evaluationLocked === true, versions,
    runs: (Array.isArray(raw.runs) ? raw.runs : []).map((item) => normalizeRun(record(item) as RunPayload)), audit: audits,
    replays: (Array.isArray(raw.replays) ? raw.replays : []).map(normalizeReplay),
  };
}

function normalizeCaseCosts(
  value: unknown,
  fallback: { commissionBpsPerSide: number; slippageBpsPerSide: number } = sampleDefinition.costs,
): { commissionBpsPerSide: number; slippageBpsPerSide: number } {
  const raw = record(value);
  const costs = record(raw.costs);
  return {
    commissionBpsPerSide: finite(raw.commissionBps ?? costs.commissionBpsPerSide, fallback.commissionBpsPerSide),
    slippageBpsPerSide: finite(raw.slippageBps ?? costs.slippageBpsPerSide, fallback.slippageBpsPerSide),
  };
}

export const useCourtStore = defineStore("court", () => {
  const currentCase = ref<CourtCase | null>(null);
  const comparison = ref<VersionComparison | null>(null);
  const loading = ref(false);
  const mutating = ref(false);
  const comparisonLoading = ref(false);
  const failureLoading = ref(false);
  const failureEvidenceCache = ref<Record<string, FailureEvidence>>({});
  const failureEvidenceError = ref<string | null>(null);
  watch(() => currentCase.value?.id, () => {
    failureEvidenceCache.value = {};
    failureEvidenceError.value = null;
    failureLoading.value = false;
  }, { flush: "sync" });
  const error = ref<string | null>(null);
  const notice = ref<string | null>(null);
  const monitoringStatus = ref<LatestBarMonitoringStatus | null>(null);
  const monitoringEvaluation = ref<MonitoringEvaluation | null>(null);
  const monitoringLoading = ref(false);
  const monitoringError = ref<string | null>(null);
  const monitoringLastSuccessAt = ref<string | null>(null);
  const monitoringOperation = ref<"load" | "refresh" | null>(null);
  let monitoringRequestRevision = 0;
  const activeTab = ref<WorkspaceTab>("strategy");
  const caseCosts = ref(normalizeCaseCosts({}));
  const webMcpSupported = ref(false);
  const registeredToolNames = ref<string[]>([]);
  const webMcpStatus = ref<"unsupported" | "registering" | "ready" | "partial" | "failed">("unsupported");
  const webMcpExpectedToolNames = ref<string[]>([]);
  const webMcpErrors = ref<Array<{ toolName: string; message: string }>>([]);
  const selectedVersionId = ref<string | null>(null);

  const activeVersion = computed(() => currentCase.value?.versions.find((version) => version.id === (selectedVersionId.value ?? currentCase.value?.activeVersionId)) ?? currentCase.value?.versions.at(-1));
  const variantParentVersion = computed(() => currentCase.value?.versions.find((version) => version.id === currentCase.value?.activeVersionId));
  const variantParentRun = computed(() => {
    const versionId = variantParentVersion.value?.id;
    return versionId ? currentCase.value?.runs.find((run) => run.versionId === versionId && run.status === "completed" && run.result) : undefined;
  });
  const variantParentResult = computed(() => variantParentRun.value?.result);
  const confirmed = computed(() => versionConfirmed(activeVersion.value));
  const latestRun = computed(() => {
    const runs = currentCase.value?.runs ?? [];
    return runs.find((run) => run.versionId === activeVersion.value?.id);
  });
  const courtComplete = computed(() => (latestRun.value?.status === "completed" || latestRun.value?.status === "invalid") && Boolean(latestRun.value.result));
  const courtInvalid = computed(() => latestRun.value?.status === "invalid" && Boolean(latestRun.value.result));
  const result = computed(() => courtComplete.value ? latestRun.value?.result : undefined);
  const replay = computed(() => currentCase.value?.replays[0]);
  const running = computed(() => latestRun.value?.status === "queued" || latestRun.value?.status === "running");
  const variants = computed(() => currentCase.value?.versions.filter((version) => Boolean(version.parentVersionId)) ?? []);
  const eligibleReplayVersions = computed(() => (currentCase.value?.versions ?? []).filter((version) => {
    const run = currentCase.value?.runs.find((candidate) => candidate.versionId === version.id && candidate.status === "completed" && candidate.result);
    return Boolean(run && !["invalid", "fragile", "reject"].includes(String(run.result?.summaryLabel).toLowerCase()));
  }));
  const probationCandidate = computed(() => eligibleReplayVersions.value.find((version) => version.parentVersionId) ?? eligibleReplayVersions.value[0]);
  const monitoringCandidate = computed(() => {
    if (activeVersion.value && versionConfirmed(activeVersion.value)) return activeVersion.value;
    return (currentCase.value?.versions ?? []).find(versionConfirmed);
  });

  const evidence = useEvidenceSelection({
    scope: () => currentCase.value && activeVersion.value && latestRun.value?.status === "completed"
      ? { caseId: currentCase.value.id, versionId: activeVersion.value.id, runId: latestRun.value.id } : null,
    result: () => result.value,
    failure: (runId,id) => failureEvidenceCache.value[`${runId}:${id}`],
    inspect: (...args) => inspectFailure(...args),
    open: () => { activeTab.value = "evidence"; },
  });
  const runDecisions = computed(() => (currentCase.value?.decisions ?? []).filter(item => item.runId === latestRun.value?.id));
  const recordedDecision = computed(() => runDecisions.value.filter(item => item.state === "confirmed")
    .sort((a,b) => (b.confirmedAt ?? "").localeCompare(a.confirmedAt ?? ""))[0]);
  const decisionDraft = computed(() => runDecisions.value.find(item => item.state === "draft" && item.createdAt > (recordedDecision.value?.confirmedAt ?? "")));
  const decisionSaving = ref(false);
  const decisionError = ref<string | null>(null);
  async function proposeDecision(fields: DecisionFields, requestId: string, actor: ApiActor = "user", signal?: AbortSignal): Promise<InvestigationDecision | null> {
    const caseId = currentCase.value?.id;
    const versionId = activeVersion.value?.id;
    const runId = latestRun.value?.id;
    if (!caseId || !versionId || !runId) return null;
    decisionSaving.value = true; decisionError.value = null;
    try {
      const payload = await apiRequest<unknown>(`/api/cases/${encodeURIComponent(caseId)}/decision-drafts`,
        { method:"POST", body:JSON.stringify({versionId,runId,requestId,fields}),signal },actor);
      const decision = unwrap<InvestigationDecision>(payload,"decision");
      if (currentCase.value?.id === caseId) {
        await refreshCase(actor,signal);
        if (currentCase.value?.id === caseId && latestRun.value?.id === runId) activeTab.value = "court";
      }
      return decision;
    } catch(issue) { decisionError.value = messageFor(issue,"Could not save the decision draft."); return null; }
    finally { decisionSaving.value = false; }
  }
  async function confirmDecision(decisionId: string, fields: DecisionFields, expectedPredecessorId: string | null): Promise<boolean> {
    const caseId = currentCase.value?.id;
    if (!caseId) return false;
    decisionSaving.value = true; decisionError.value = null;
    try {
      await apiRequest(`/api/cases/${encodeURIComponent(caseId)}/decisions/${encodeURIComponent(decisionId)}/confirm`,
        { method:"POST",body:JSON.stringify({fields,expectedPredecessorId}) },"user");
      if (currentCase.value?.id === caseId) await refreshCase();
      return true;
    } catch(issue) { decisionError.value = messageFor(issue,"Could not record the decision."); return false; }
    finally { decisionSaving.value = false; }
  }

  function clearMonitoringState(): void {
    monitoringRequestRevision += 1;
    monitoringStatus.value = null;
    monitoringEvaluation.value = null;
    monitoringError.value = null;
    monitoringLastSuccessAt.value = null;
    monitoringLoading.value = false;
    monitoringOperation.value = null;
  }

  function addAudit(_actor: AuditEvent["actor"], _action: string, _detail: string): void {
    // Audit events are server-owned so the visible ledger cannot diverge from the exported record.
  }

  async function refreshCase(actor: ApiActor = "user", signal?: AbortSignal): Promise<boolean> {
    if (!currentCase.value) return false;
    const requestedCaseId = currentCase.value.id;
    try {
      const payload = await apiRequest<unknown>(`/api/cases/${encodeURIComponent(currentCase.value.id)}`, { signal }, actor);
      const rawCase = unwrap(payload, "case");
      const next = normalizeCase(rawCase);
      if (!next.id) throw new Error("The API returned a case without an ID.");
      if (currentCase.value?.id !== requestedCaseId) return false;
      caseCosts.value = normalizeCaseCosts(rawCase, caseCosts.value);
      const nextActiveId = next.activeVersionId ?? next.versions.at(-1)?.id;
      if (selectedVersionId.value && !next.versions.some((version) => version.id === selectedVersionId.value)) selectedVersionId.value = null;
      const nextViewedId = selectedVersionId.value ?? nextActiveId;
      if (monitoringStatus.value && monitoringStatus.value.strategyVersionId !== nextViewedId) clearMonitoringState();
      currentCase.value = next;
      return true;
    } catch (issue) {
      error.value = messageFor(issue, "Could not refresh this Court case.");
      return false;
    }
  }

  let sampleRequestId: string | null = null;
  async function createSample(): Promise<string | null> {
    sampleRequestId ??= crypto.randomUUID();
    try {
      const payload = await apiRequest<unknown>("/api/samples/rsi-pullback/cases", {method:"POST",body:JSON.stringify({requestId:sampleRequestId})});
      const created = normalizeCase(unwrap(payload,"case"));
      currentCase.value = created; selectedVersionId.value = null;
      sampleRequestId = null;
      return created.id;
    } catch(issue) { error.value = `${messageFor(issue,"Could not open saved Alpaca history.")} Check the API, then retry.`; return null; }
  }
  const createSyntheticSample = () => createCase(sampleInput,true);

  async function createCase(input: CaseInput, withDraft = false, actor: ApiActor = "user", signal?: AbortSignal, requestId?: string): Promise<string | null> {
    loading.value = true; error.value = null; notice.value = null;
    try {
      const payload = await apiRequest<unknown>("/api/cases", { method: "POST", signal, body: JSON.stringify({ ...input, requestId, commissionBps: input.commissionBpsPerSide, slippageBps: input.slippageBpsPerSide, courtProfile: "balanced" }) }, actor);
      const rawCase = unwrap(payload, "case");
      const created = normalizeCase(rawCase, input);
      if (!created.id) throw new Error("The API did not return the created case ID.");
      clearMonitoringState();
      caseCosts.value = normalizeCaseCosts(rawCase, input);
      currentCase.value = created;
      selectedVersionId.value = null;
      await refreshCase(actor, signal);
      if (withDraft && currentCase.value?.versions.length === 0) {
        await createDraft(
          { ...structuredClone(sampleDefinition), name: currentCase.value.name, universe: [...currentCase.value.symbols] },
          currentCase.value.description,
          actor, signal,
        );
      }
      return created.id;
    } catch (issue) {
      error.value = messageFor(issue, "Could not create this Court case."); return null;
    } finally { loading.value = false; }
  }

  async function loadCase(id: string, actor: ApiActor = "user"): Promise<void> {
    loading.value = true; error.value = null; comparison.value = null; failureEvidenceCache.value = {}; failureEvidenceError.value = null;
    selectedVersionId.value = null;
    clearMonitoringState();
    try {
      const payload = await apiRequest<unknown>(`/api/cases/${encodeURIComponent(id)}`, {}, actor);
      const rawCase = unwrap(payload, "case");
      const next = normalizeCase(rawCase);
      if (!next.id) throw new Error("The API returned an incomplete case response.");
      caseCosts.value = normalizeCaseCosts(rawCase);
      currentCase.value = next;
      if (variants.value.length) void loadComparison(actor);
    } catch (issue) {
      currentCase.value = null; error.value = messageFor(issue, "Could not load this Court case.");
    } finally { loading.value = false; }
  }

  async function createDraft(requestedDefinition?: StrategyDefinition, requestedInterpretation?: string, actor: ApiActor = "user", signal?: AbortSignal): Promise<boolean> {
    if (!currentCase.value) return false;
    if (!requestedDefinition || !requestedInterpretation?.trim()) {
      error.value = "Set the entry and exit rules before creating a review draft.";
      return false;
    }
    mutating.value = true; error.value = null;
    const definition = structuredClone(requestedDefinition);
    const interpretation = requestedInterpretation.trim();
    try {
      const payload = await apiRequest<unknown>(`/api/cases/${encodeURIComponent(currentCase.value.id)}/strategy-drafts`, { method: "POST", body: JSON.stringify({ definition, interpretation }), signal }, actor);
      const version = unwrap<Record<string, unknown>>(payload, "version");
      if (!version?.id) throw new Error("The API did not return the created strategy version.");
      return refreshCase(actor, signal);
    } catch (issue) { error.value = messageFor(issue, "Could not create the strategy draft."); return false; }
    finally { mutating.value = false; }
  }

  async function confirmStrategy(actor: ApiActor = "user"): Promise<boolean> {
    if (!currentCase.value || !activeVersion.value) return false;
    mutating.value = true; error.value = null;
    try {
      const payload = await apiRequest<unknown>(`/api/cases/${encodeURIComponent(currentCase.value.id)}/strategy-versions/${encodeURIComponent(activeVersion.value.id)}/confirm`, { method: "POST", body: "{}" }, actor);
      const version = unwrap<Record<string, unknown>>(payload, "version");
      if (!version?.id) throw new Error("The API did not confirm a strategy version.");
      return refreshCase(actor);
    } catch (issue) { error.value = messageFor(issue, "Could not confirm the strategy."); return false; }
    finally { mutating.value = false; }
  }

  async function runCourt(dataSnapshotPolicy: DataSnapshotPolicy = "refresh", courtProfile: "balanced" = "balanced", actor: ApiActor = "user", signal?: AbortSignal): Promise<string | null> {
    if (!currentCase.value || !activeVersion.value || !confirmed.value) return null;
    mutating.value = true; error.value = null; activeTab.value = "court";
    try {
      const payload = await apiRequest<unknown>(`/api/cases/${encodeURIComponent(currentCase.value.id)}/court-runs`, { method: "POST", body: JSON.stringify({ strategyVersionId: activeVersion.value.id, dateRange: { start: currentCase.value.startDate, end: currentCase.value.endDate }, courtProfile, dataSnapshotPolicy }), signal }, actor);
      const created = unwrap<Record<string, unknown>>(payload, "run");
      const runId = String(created.id ?? record(payload).runId ?? "");
      if (!runId) throw new Error("The API did not return a Court run ID.");
      await refreshCase(actor, signal);
      let state = normalizeRun(created as RunPayload);
      while (state.status === "queued" || state.status === "running") {
        await wait(700, signal);
        const update = await apiRequest<unknown>(`/api/court-runs/${encodeURIComponent(runId)}`, { signal }, actor);
        state = normalizeRun(unwrap<RunPayload>(update, "run"));
      }
      await refreshCase(actor, signal);
      if (state.status === "failed") throw new Error(state.error || "The Court run failed before producing a verdict.");
      if (!state.result) throw new Error("The Court run completed without a usable result.");
      return runId;
    } catch (issue) { error.value = messageFor(issue, "The Court run did not complete."); if (!signal?.aborted) await refreshCase(actor, signal); return null; }
    finally { mutating.value = false; }
  }

  async function loadComparison(actor: ApiActor = "user", signal?: AbortSignal): Promise<boolean> {
    if (!currentCase.value || variants.value.length === 0) return false;
    comparisonLoading.value = true;
    try {
      const ids = currentCase.value.versions.map((version) => version.id).join(",");
      const payload = await apiRequest<unknown>(`/api/cases/${encodeURIComponent(currentCase.value.id)}/comparison?versionIds=${encodeURIComponent(ids)}`, { signal }, actor);
      const next = unwrap<VersionComparison>(payload, "comparison");
      if (!next || !Array.isArray(next.versions)) throw new Error("The API returned an incomplete version comparison.");
      comparison.value = next; return true;
    } catch (issue) { error.value = messageFor(issue, "Could not load the version comparison."); return false; }
    finally { comparisonLoading.value = false; }
  }

  async function createVariants(requested: Array<Record<string, unknown>>, actor: ApiActor = "user", signal?: AbortSignal): Promise<string[]> {
    if (!currentCase.value || !variantParentVersion.value || !variantParentResult.value || variants.value.length >= 3) return [];
    if (!requested.length) { error.value = "Add at least one controlled variant."; return []; }
    mutating.value = true; error.value = null;
    const proposals = requested.map(({ structuredPatch, ...proposal }) => ({ ...proposal, patch: structuredPatch ?? proposal.patch }));
    try {
      const payload = await apiRequest<Record<string, unknown>>(`/api/cases/${encodeURIComponent(currentCase.value.id)}/variants`, { method: "POST", body: JSON.stringify({ parentVersionId: variantParentVersion.value.id, variants: proposals }), signal }, actor);
      const createdVersions = Array.isArray(payload.versions) ? payload.versions.map((item) => record(item)) : [];
      const createdRuns = Array.isArray(payload.runs) ? payload.runs.map((item) => record(item)) : [];
      if (createdVersions.length === 0 || createdRuns.length === 0) throw new Error("The API did not return the created variants and Court runs.");
      const ids = createdVersions.map((version) => String(version.id ?? "")).filter(Boolean);
      await refreshCase(actor, signal);
      await Promise.all(createdRuns.map(async (item) => {
        const id = String(item.id ?? ""); if (!id) return;
        let state = normalizeRun(item as RunPayload);
        while (state.status === "queued" || state.status === "running") {
          await wait(700, signal); const update = await apiRequest<unknown>(`/api/court-runs/${encodeURIComponent(id)}`, { signal }, actor); state = normalizeRun(unwrap<RunPayload>(update, "run"));
        }
      }));
      await refreshCase(actor, signal); await loadComparison(actor, signal); return ids;
    } catch (issue) { error.value = messageFor(issue, "Could not create or run the strategy variants."); if (!signal?.aborted) await refreshCase(actor, signal); return []; }
    finally { mutating.value = false; }
  }

  async function startReplay(versionId = probationCandidate.value?.id, range?: { startDate: string; endDate: string }, actor: ApiActor = "user", signal?: AbortSignal): Promise<string | null> {
    if (!currentCase.value || !versionId) { error.value = "No completed surviving or inconclusive version is eligible for probation."; return null; }
    if (!eligibleReplayVersions.value.some((version) => version.id === versionId)) { error.value = "The selected version has no eligible completed Court result."; return null; }
    mutating.value = true; error.value = null;
    try {
      const payload = await apiRequest<unknown>(`/api/cases/${encodeURIComponent(currentCase.value.id)}/replay`, {
        method: "POST",
        body: JSON.stringify({
          strategyVersionId: versionId,
          ...(range ? { reservedFrom: range.startDate, reservedTo: range.endDate } : {}),
        }),
        signal,
      }, actor);
      const rawReplay = unwrap<Record<string, unknown>>(payload, "replay");
      if (!rawReplay?.id) throw new Error("The API did not return a replay session.");
      await refreshCase(actor, signal); activeTab.value = "probation"; return String(rawReplay.id);
    } catch (issue) { error.value = messageFor(issue, "Could not start replay probation."); if (!signal?.aborted) await refreshCase(actor, signal); return null; }
    finally { mutating.value = false; }
  }

  async function advanceReplay(increment: "one_bar" | "five_bars" | "twenty_bars" | "next_signal" | "next_trade", actor: ApiActor = "user", signal?: AbortSignal): Promise<boolean> {
    if (!currentCase.value || !replay.value) return false;
    mutating.value = true; error.value = null;
    try {
      const payload = await apiRequest<unknown>(`/api/replay/${encodeURIComponent(replay.value.id)}/advance`, { method: "POST", body: JSON.stringify({ increment }), signal }, actor);
      const updated = unwrap<Record<string, unknown>>(payload, "replay");
      if (!updated?.id) throw new Error("The API did not return the advanced replay state.");
      return refreshCase(actor, signal);
    } catch (issue) { error.value = messageFor(issue, "Could not advance replay probation."); if (!signal?.aborted) await refreshCase(actor, signal); return false; }
    finally { mutating.value = false; }
  }

  async function loadMonitoringStatus(
    versionId = monitoringCandidate.value?.id,
    options: { refresh?: boolean; dataSnapshotPolicy?: "refresh" | "frozen"; actor?: ApiActor; signal?: AbortSignal } = {},
  ): Promise<MonitoringResponse | null> {
    if (!currentCase.value || !versionId) {
      monitoringError.value = "Confirm a strategy before checking its latest completed bar.";
      return null;
    }
    const version = currentCase.value.versions.find((item) => item.id === versionId);
    if (!version || !versionConfirmed(version)) {
      monitoringError.value = "Latest-bar monitoring requires a confirmed strategy version.";
      return null;
    }
    const refresh = options.refresh === true;
    const requestRevision = ++monitoringRequestRevision;
    monitoringLoading.value = true;
    monitoringOperation.value = refresh ? "refresh" : "load";
    monitoringError.value = null;
    try {
      const path = `/api/cases/${encodeURIComponent(currentCase.value.id)}/monitoring${refresh ? "" : `?strategyVersionId=${encodeURIComponent(versionId)}`}`;
      const payload = await apiRequest<unknown>(path, refresh ? {
        method: "POST",
        body: JSON.stringify({ strategyVersionId: versionId, dataSnapshotPolicy: options.dataSnapshotPolicy ?? "refresh" }),
        signal: options.signal,
      } : { signal: options.signal }, options.actor ?? "user");
      const next = normalizeMonitoringResponse(payload);
      if (next.monitoring.strategyVersionId !== versionId) throw new Error("The API returned monitoring for a different strategy version.");
      if (requestRevision !== monitoringRequestRevision) return next;
      monitoringStatus.value = next.monitoring;
      monitoringEvaluation.value = next.evaluation;
      monitoringLastSuccessAt.value = next.evaluation?.createdAt || new Date().toISOString();
      return next;
    } catch (issue) {
      if (requestRevision === monitoringRequestRevision) {
        monitoringError.value = messageFor(issue, refresh ? "Could not check the latest completed bar." : "Could not load latest-bar monitoring.");
      }
      return null;
    } finally {
      if (requestRevision === monitoringRequestRevision) {
        monitoringLoading.value = false;
        monitoringOperation.value = null;
      }
    }
  }

  async function inspectFailure(runId: string, failureId: string, actor: ApiActor = "user", signal?: AbortSignal): Promise<FailureEvidence | null> {
    const requestCaseId = currentCase.value?.id;
    const cacheKey = `${runId}:${failureId}`;
    if (failureEvidenceCache.value[cacheKey]) return failureEvidenceCache.value[cacheKey];
    const local = result.value?.failures.find((item) => item.id === failureId);
    const runTrades = result.value?.trades ?? [];
    failureLoading.value = true; failureEvidenceError.value = null;
    try {
      const payload = await apiRequest<unknown>(`/api/court-runs/${encodeURIComponent(runId)}/failures/${encodeURIComponent(failureId)}`, { signal }, actor);
      const enriched = normalizeFailure(unwrap<unknown>(payload, "failure"), 0, local?.trades ?? [], runTrades);
      if (currentCase.value?.id === requestCaseId) failureEvidenceCache.value[cacheKey] = enriched;
      return enriched;
    } catch (issue) { if (currentCase.value?.id === requestCaseId && latestRun.value?.id === runId) failureEvidenceError.value = messageFor(issue, "Could not load this period's evidence."); return null; }
    finally { failureLoading.value = false; }
  }

  async function enrichFailures(actor: ApiActor = "user"): Promise<void> {
    const requestCaseId = currentCase.value?.id;
    const runId = latestRun.value?.id;
    const failures = result.value?.failures ?? [];
    const runTrades = result.value?.trades ?? [];
    if (!runId || failures.length === 0) return;
    const pending = failures.filter((failure) => !failureEvidenceCache.value[`${runId}:${failure.id}`]);
    if (!pending.length) return;
    failureLoading.value = true; failureEvidenceError.value = null;
    const outcomes = await Promise.allSettled(pending.map(async (failure) => {
      const payload = await apiRequest<unknown>(`/api/court-runs/${encodeURIComponent(runId)}/failures/${encodeURIComponent(failure.id)}`, {}, actor);
      return normalizeFailure(unwrap<unknown>(payload, "failure"), 0, failure.trades, runTrades);
    }));
    if (currentCase.value?.id !== requestCaseId) return;
    outcomes.forEach((outcome, index) => { if (outcome.status === "fulfilled") failureEvidenceCache.value[`${runId}:${pending[index]!.id}`] = outcome.value; });
    const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    if (rejected && latestRun.value?.id === runId) failureEvidenceError.value = messageFor(rejected.reason, "Some period details could not be loaded.");
    failureLoading.value = false;
  }

  function selectVersion(id: string): void {
    if (!currentCase.value?.versions.some((version) => version.id === id)) return;
    selectedVersionId.value = id === currentCase.value.activeVersionId ? null : id;
    if (monitoringStatus.value?.strategyVersionId !== id) clearMonitoringState();
  }
  function clearError(): void { error.value = null; }

  return {
    ...evidence, runDecisions, recordedDecision, decisionDraft, decisionSaving, decisionError, proposeDecision, confirmDecision, createSyntheticSample,
    currentCase, comparison, loading, mutating, comparisonLoading, failureLoading, failureEvidenceCache, failureEvidenceError, error, notice, activeTab, caseCosts, webMcpSupported, registeredToolNames,
    monitoringStatus, monitoringEvaluation, monitoringLoading, monitoringError, monitoringLastSuccessAt, monitoringOperation,
    webMcpStatus, webMcpExpectedToolNames, webMcpErrors,
    activeVersion, variantParentVersion, variantParentRun, variantParentResult, selectedVersionId, confirmed, latestRun, courtComplete, courtInvalid, result, replay, running, variants, eligibleReplayVersions, probationCandidate, monitoringCandidate,
    createSample, createCase, loadCase, refreshCase, createDraft, confirmStrategy, runCourt, loadComparison, createVariants, startReplay, advanceReplay, loadMonitoringStatus, inspectFailure, enrichFailures,
    selectVersion, clearError, addAudit,
  };
});
