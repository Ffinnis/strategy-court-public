import type { DataSnapshot, MarketBar } from "./market.ts";
import type { ConditionNode, StrategyDefinition, StrategyPatch, StrategyVariantRequest } from "./strategy.ts";

export interface DateRange { start: string; end: string }
export type CourtProfile = "balanced";
export type DataSnapshotPolicy = "frozen" | "prefer_cache" | "refresh" | "saved_sample";

export interface CourtRunRequest {
  strategyVersionId: string;
  dateRange: DateRange;
  courtProfile: CourtProfile;
  dataSnapshotPolicy: DataSnapshotPolicy;
  initialCapital: number;
}

export type ExitReason = "rule" | "stop_loss" | "take_profit" | "max_holding_days";

export interface Trade {
  symbol: string;
  entryDate: string;
  entryReferencePrice: number;
  entryPrice: number;
  exitDate: string;
  exitReferencePrice: number;
  exitPrice: number;
  quantity: number;
  grossProfit: number;
  costs: number;
  netProfit: number;
  returnPercent: number;
  holdingDays: number;
  entryReason: string;
  exitReason: ExitReason;
  marketRegime: MarketRegime | "unknown";
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdownPercent: number;
}

export interface BacktestMetrics {
  initialCapital: number;
  finalEquity: number;
  netProfit: number;
  netReturnPercent: number;
  annualizedReturnPercent: number | null;
  numberOfTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number | null;
  averageWinningTrade: number | null;
  averageLosingTrade: number | null;
  expectancyPerTrade: number | null;
  profitFactor: number | null;
  maximumDrawdownPercent: number;
  maximumDrawdownDurationDays: number;
  recoveryTimeDays: number | null;
  unrecoveredDrawdown: boolean;
  averageHoldingPeriodDays: number | null;
  longestHoldingPeriodDays: number;
  bestTrade: number | null;
  worstTrade: number | null;
  bestTradeContributionPercent: number | null;
  bestFiveTradesContributionPercent: number | null;
  bestTenPercentTradesContributionPercent: number | null;
  totalEstimatedCosts: number;
  benchmarkReturnPercent: number | null;
  exposurePercent: number;
  maximumConsecutiveLosses: number;
}

export interface OpenPosition {
  symbol: string;
  entryDate: string;
  entryPrice: number;
  quantity: number;
  barsHeld: number;
  markedPrice: number;
  unrealizedProfit: number;
}

export interface SignalDiagnostic {
  symbol: string;
  date: string;
  signal: "entry" | "exit";
  status: "skipped" | "rejected";
  reason: "required_values_unavailable" | "position_already_open" | "no_open_position" | "no_next_bar";
}

export interface BacktestDiagnostics {
  insufficientWarmupBars: number;
  missingBars: number;
  ignoredBars: number;
  rejectedSignals: number;
  signalEvents: SignalDiagnostic[];
}

export interface BacktestResult {
  strategyName: string;
  dateRange: DateRange;
  trades: Trade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  openPositions: OpenPosition[];
  diagnostics: BacktestDiagnostics;
}

export interface BacktestInput {
  strategy: StrategyDefinition;
  snapshot: DataSnapshot;
  dateRange?: DateRange;
  initialCapital: number;
  benchmarkSymbol?: string;
}

export type VerdictStatus = "Pass" | "Warning" | "Fail" | "Inconclusive";
export type CourtCategory =
  | "evidence_sufficiency"
  | "out_of_sample_robustness"
  | "parameter_stability"
  | "execution_resilience"
  | "regime_stability"
  | "profit_concentration"
  | "risk_profile";
export type CourtSummaryLabel = "Invalid" | "Fragile" | "Inconclusive" | "Paper-trading candidate" | "Survived current tests";

export interface CourtVerdict {
  category: CourtCategory;
  title: string;
  status: VerdictStatus;
  summary: string;
  thresholds: string[];
  evidence: Record<string, string | number | boolean | null>;
}

export interface CourtFailureEvidence {
  id: string;
  category: CourtCategory;
  status: VerdictStatus;
  finding: string;
  dateRange: DateRange;
  evidence: Record<string, string | number | boolean | null>;
}

export interface MarketEvidenceBar extends MarketBar {
  regime: MarketRegime | "unknown";
}

export interface SymbolMarketEvidence {
  symbol: string;
  bars: MarketEvidenceBar[];
  trades: Trade[];
}

export interface ParameterTrial {
  path: string;
  baseline: number;
  value: number;
  factor: number;
  status: "completed" | "invalid";
  netProfit: number | null;
  profitable: boolean | null;
  invalidReason?: string;
}

export interface CourtReport {
  engineVersion: string;
  reproducibilityId: string;
  summaryLabel: CourtSummaryLabel;
  limitation: string;
  splitDate: string;
  baseline: BacktestResult;
  outOfSample: BacktestResult;
  stressedCosts: BacktestResult;
  parameterTrials: ParameterTrial[];
  verdicts: CourtVerdict[];
  failures: CourtFailureEvidence[];
  dataWarnings: string[];
}

export interface CourtInput extends BacktestInput {
  courtProfile?: CourtProfile;
  strategyVersionId?: string;
}

export type MarketRegime = "positive_low" | "positive_high" | "negative_low" | "negative_high";

export interface StrategyVersionRecord {
  id: string;
  version: number;
  parentVersionId: string | null;
  definition: StrategyDefinition;
  source: "user" | "agent" | "system";
  evaluationInformed: boolean;
  hypothesis?: string;
  rationale?: string;
  expectedWeaknessAddressed?: string;
}

export interface StrategyVersionResult {
  version: StrategyVersionRecord;
  report?: CourtReport;
}

export interface StrategyDifference {
  path: string;
  before: unknown;
  after: unknown;
}

export interface MetricDifference {
  metric: keyof BacktestMetrics;
  baseline: number | boolean | null;
  candidate: number | boolean | null;
  delta: number | null;
}

export interface VerdictDifference {
  category: CourtCategory;
  baseline: VerdictStatus | null;
  candidate: VerdictStatus | null;
}

export interface VersionComparison {
  baselineVersionId: string;
  candidateVersionId: string;
  definitionDifferences: StrategyDifference[];
  metricDifferences: MetricDifference[];
  verdictDifferences: VerdictDifference[];
  tradeCountDifference: number | null;
  evaluationInformed: boolean;
  assumptionsChanged: boolean;
}

export type ReplayAdvanceMode = "one_bar" | "five_bars" | "twenty_bars" | "next_signal" | "next_trade";
export interface ReplayAdvanceRequest { mode: ReplayAdvanceMode }

export interface ReplaySession {
  id: string;
  strategyVersionId: string;
  snapshotId: string;
  range: DateRange;
  dates: string[];
  cursor: number;
  status: "ready" | "active" | "complete";
  baselineMetrics: BacktestMetrics;
  baselineTradingDays: number;
  initialCapital: number;
}

export interface ReplaySymbolSignal {
  symbol: string;
  entry: boolean | null;
  exit: boolean | null;
}

export interface ReplayStatus {
  session: ReplaySession;
  currentDate: string | null;
  currentRegime: MarketRegime | "unknown";
  signals: ReplaySymbolSignal[];
  result: BacktestResult | null;
  newTrades: Trade[];
  warnings: string[];
}

export interface MonitoringSignal extends ReplaySymbolSignal {
  completedBarDate: string;
  close: number;
}

export interface MonitoringChange {
  type: "entry_signal_activated" | "exit_signal_activated" | "regime_changed" | "metrics_changed";
  symbol?: string;
  metric?: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface LatestBarMonitoringStatus {
  strategyVersionId: string;
  snapshotId: string;
  snapshotFetchedAt: string;
  evaluatedDate: string;
  currentRegime: MarketRegime | "unknown";
  signals: MonitoringSignal[];
  positions: OpenPosition[];
  metrics: BacktestMetrics;
  changes: MonitoringChange[];
  warnings: string[];
}

export interface ReplayCreateInput {
  id: string;
  strategyVersionId: string;
  strategy: StrategyDefinition;
  snapshot: DataSnapshot;
  range: DateRange;
  initialCapital: number;
  baselineMetrics: BacktestMetrics;
  baselineTradingDays?: number;
}

export interface ReplayContext { strategy: StrategyDefinition; snapshot: DataSnapshot }

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ValidationIssue[] };

export type { ConditionNode, DataSnapshot, MarketBar, StrategyDefinition, StrategyPatch, StrategyVariantRequest };
