export type Actor = "user" | "agent" | "system";

export interface Bar {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CaseRecord {
  sampleId?: string | null;
  id: string;
  name: string;
  description: string;
  symbols: string[];
  dateFrom: string;
  dateTo: string;
  initialCapital: number;
  commissionBps: number;
  slippageBps: number;
  status: string;
  selectedProfile: string;
  activeVersionId: string | null;
  evaluationLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyVersionRecord {
  id: string;
  version: number;
  caseId: string;
  parentVersionId: string | null;
  definition: Record<string, unknown>;
  interpretation: string;
  source: Actor;
  metadata: Record<string, unknown>;
  confirmed: boolean;
  evaluationInformed: boolean;
  createdAt: string;
}

export interface CourtRunRecord {
  id: string;
  caseId: string;
  strategyVersionId: string;
  dataSnapshotId: string | null;
  engineVersion: string;
  reproducibilityId: string | null;
  profile: string;
  status: "queued" | "running" | "completed" | "invalid" | "failed";
  progress: { percent: number; stage: string };
  summary: string | null;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReplayRecord {
  id: string;
  caseId: string;
  strategyVersionId: string;
  runId: string;
  reservedFrom: string;
  reservedTo: string;
  cursor: number;
  status: "active" | "completed";
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SnapshotRecord {
  id: string;
  provider: string;
  adjustment: string;
  feed: string;
  dateFrom: string;
  dateTo: string;
  symbols: string[];
  fetchedAt: string;
  hash: string;
  request: Record<string, unknown>;
  bars: Bar[];
}

export interface AuditRecord {
  id: string;
  caseId: string | null;
  actor: Actor;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface IndicatorRecord {
  id: string;
  name: string;
  version: number;
  description: string;
  formula: unknown;
  inputs: unknown;
  dependencies: string[];
  outputType: string;
  sharingState: string;
  creatorType: string;
  metadata: Record<string, unknown>;
  lineageId: string;
  parentIndicatorId: string | null;
  createdAt: string;
}

export type ShareEntityType = "report" | "indicator";

export interface ShareTokenRecord {
  id: string;
  ownerUserId: string;
  entityType: ShareEntityType;
  entityId: string;
  rotatedFromId: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface CaseContext extends CaseRecord {
  decisions: import("@strategy-court/schemas").InvestigationDecision[];
  versions: StrategyVersionRecord[];
  runs: CourtRunRecord[];
  replays: ReplayRecord[];
  audit: AuditRecord[];
}
