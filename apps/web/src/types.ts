export type VerdictStatus = "Pass" | "Warning" | "Fail" | "Inconclusive";
export type WorkspaceTab = "strategy" | "court" | "evidence" | "variants" | "probation" | "audit";

export interface ValueExpression {
  constant?: number;
  source?: string;
  indicator?: string;
  parameters?: { period?: number; source?: string; [key: string]: unknown };
  lag?: { value: ValueExpression; bars: number };
  operation?: "add" | "subtract" | "multiply" | "divide" | "min" | "max";
  left?: ValueExpression;
  right?: ValueExpression;
  absolute?: ValueExpression;
}

export interface ConditionNode {
  all?: ConditionNode[];
  any?: ConditionNode[];
  not?: ConditionNode;
  left?: ValueExpression;
  operator?: "gt" | "gte" | "lt" | "lte" | "eq" | "crosses_above" | "crosses_below";
  right?: ValueExpression;
}

export interface StrategyDefinition {
  name: string;
  universe: string[];
  timeframe: "1d";
  direction: "long";
  entry: ConditionNode;
  exit: ConditionNode;
  execution: { signalAt: "close"; executeAt: "next_open"; orderType: "market" };
  risk: { stopLossPercent?: number; takeProfitPercent?: number; maxHoldingDays?: number };
  costs: { commissionBpsPerSide: number; slippageBpsPerSide: number };
}

export interface StrategyVersion {
  id: string;
  versionNumber?: number;
  parentVersionId?: string | null;
  definition: StrategyDefinition;
  interpretation: string;
  source?: "user" | "agent" | "system";
  confirmedAt?: string | null;
  confirmed?: boolean;
  evaluationInformed?: boolean;
  createdAt?: string;
  rationale?: string;
  hypothesis?: string;
}

export interface Verdict {
  id: string;
  category: string;
  status: VerdictStatus;
  finding: string;
  measure: string;
  threshold: string;
  failureId?: string;
}

export interface Metric {
  label: string;
  value: string;
  change?: string;
  tone?: "positive" | "negative" | "neutral";
}

export interface CurvePoint { date: string; value: number; benchmark?: number }

export interface Trade {
  id?: string;
  symbol: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  quantity: number;
  netProfit: number;
  costs: number;
  exitReason: string;
  regime: string;
}

export interface MarketEvidenceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjusted?: boolean;
  regime?: string;
}

export type MarketEvidence = Record<string, MarketEvidenceBar[]>;

export interface FailureEvidence {
  id: string;
  title: string;
  period: string;
  summary: string;
  equityChange: string;
  regime: string;
  symbols: string[];
  trades: Trade[];
  inputs: Array<{ label: string; value: string }>;
  evidence?: Record<string, unknown>;
  equity?: Record<string, unknown>;
  costs?: Record<string, unknown>;
  indicatorEvidence?: Record<string, unknown>;
  explanationInputs?: unknown;
  periodRaw?: unknown;
  regimeEvidence?: Record<string, unknown>;
  indicatorValues?: unknown[];
  marketBars?: unknown[];
  raw?: Record<string, unknown>;
}

export interface CourtResult {
  summaryLabel: string;
  verdicts: Verdict[];
  metrics: Metric[];
  equityCurve: CurvePoint[];
  drawdownCurve: CurvePoint[];
  trades: Trade[];
  failures: FailureEvidence[];
  assumptions: Record<string, string>;
  reproducibilityId: string;
  engineVersion: string;
  limitation?: string;
  dateRange?: { start: string; end: string };
  rawMetrics?: Record<string, unknown>;
  outOfSampleMetrics?: Record<string, unknown>;
  stressedCostMetrics?: Record<string, unknown>;
  parameterTrials: Array<Record<string, unknown>>;
  dataWarnings: string[];
  marketEvidence: MarketEvidence;
  signalDiagnostics: Array<{
    symbol: string;
    date: string;
    signal: "entry" | "exit";
    status: "skipped" | "rejected";
    reason: string;
  }>;
  invalidReason?: string | { code?: string; message: string; details?: unknown };
}

export interface CourtRun {
  id: string;
  versionId: string;
  status: "queued" | "running" | "completed" | "invalid" | "failed";
  progress: number;
  dataSnapshotId?: string;
  stage?: string;
  result?: CourtResult;
  createdAt?: string;
  error?: string;
}

export interface AuditEvent {
  id: string;
  actor: "user" | "agent" | "system";
  action: string;
  detail: string;
  createdAt: string;
}

export interface ReplaySession {
  id: string;
  versionId: string;
  status: "active" | "completed";
  currentDate: string;
  startDate: string;
  endDate: string;
  progress: number;
  regime: string;
  metrics: Metric[];
  comparisons: Array<{ label: string; historical: string; observed: string }>;
  signals: Array<{ symbol: string; state: string; detail: string }>;
  positions: Array<{ symbol: string; opened: string; pnl: string }>;
  trades: Trade[];
  newTrades: Trade[];
  warnings: string[];
}

export interface MonitoringSignal {
  symbol: string;
  completedBarDate: string;
  close: number;
  entry: boolean | null;
  exit: boolean | null;
}

export interface MonitoringPosition {
  symbol: string;
  entryDate: string;
  entryPrice: number;
  quantity: number;
  barsHeld: number;
  markedPrice: number;
  unrealizedProfit: number;
}

export interface MonitoringChange {
  type: "entry_signal_activated" | "exit_signal_activated" | "regime_changed" | "metrics_changed";
  symbol?: string;
  metric?: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface LatestBarMonitoringStatus {
  status: "not_started" | "evaluated";
  strategyVersionId: string;
  snapshotId: string | null;
  snapshotFetchedAt: string | null;
  evaluatedDate: string | null;
  currentRegime: string;
  signals: MonitoringSignal[];
  positions: MonitoringPosition[];
  metrics: Record<string, number | null>;
  metricCards: Metric[];
  changes: MonitoringChange[];
  warnings: string[];
}

export interface MonitoringEvaluation {
  id: string;
  caseId: string;
  strategyVersionId: string;
  dataSnapshotId: string;
  evaluatedDate: string;
  createdAt: string;
}

export interface MonitoringResponse {
  monitoring: LatestBarMonitoringStatus;
  evaluation: MonitoringEvaluation | null;
}

export interface ComparisonVersion {
  versionId: string;
  name: string;
  parentVersionId: string | null;
  evaluationInformed: boolean;
  diffs: Array<{ path: string; before: unknown; after: unknown }>;
  summaryLabel: string | null;
  metrics: Record<string, unknown> | null;
  verdicts: Array<Record<string, unknown>>;
  tradeCount: number;
  assumptions: Record<string, unknown> | null;
}

export interface VersionComparison {
  caseId: string;
  versions: ComparisonVersion[];
}

export interface CourtCase {
  id: string;
  name: string;
  description: string;
  symbols: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  profile: string;
  status: string;
  activeVersionId?: string | null;
  evaluationViewed?: boolean;
  versions: StrategyVersion[];
  runs: CourtRun[];
  audit: AuditEvent[];
  replays: ReplaySession[];
}

export interface CaseInput {
  name: string;
  description: string;
  symbols: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  commissionBpsPerSide: number;
  slippageBpsPerSide: number;
}
