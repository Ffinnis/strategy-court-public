import type { Store } from "../store";
import type { IndicatorRecord, ShareEntityType, ShareTokenRecord } from "../types";

export const SHARE_MANIFEST_VERSION = 1;

export function createOpaqueToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function shareResponse(record: ShareTokenRecord | null, token?: string) {
  if (!record) return { state: "not_shared" as const };
  return {
    state: record.revokedAt ? "revoked" as const : "active" as const,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
    ...(token ? {
      token,
      publicPath: `/${record.entityType === "report" ? "report" : "indicator"}/${token}`,
      apiPath: `/api/shared/${record.entityType === "report" ? "reports" : "indicators"}/${token}`,
    } : {}),
  };
}

function publicVersion(version: {
  id: string;
  version: number;
  parentVersionId: string | null;
  definition: Record<string, unknown>;
  interpretation: string;
  source: string;
  metadata: Record<string, unknown>;
  confirmed: boolean;
  evaluationInformed: boolean;
  createdAt: string;
}, versionNumbers: Map<string, number>) {
  return {
    version: version.version,
    parentVersion: version.parentVersionId ? versionNumbers.get(version.parentVersionId) ?? null : null,
    definition: version.definition,
    interpretation: version.interpretation,
    source: version.source,
    metadata: version.metadata,
    confirmed: version.confirmed,
    evaluationInformed: version.evaluationInformed,
    createdAt: version.createdAt,
  };
}

export async function buildReportManifest(
  store: Store,
  runId: string,
  ownerUserId: string,
  exposeOwnerIds = false,
): Promise<Record<string, unknown> | null> {
  const run = await store.getRun(runId, ownerUserId);
  if (!run || run.status !== "completed") return null;
  const courtCase = await store.getCaseContext(run.caseId, ownerUserId);
  if (!courtCase) return null;
  const strategyVersion = courtCase.versions.find((version) => version.id === run.strategyVersionId);
  if (!strategyVersion) return null;
  const snapshot = run.dataSnapshotId ? await store.getSnapshot(run.dataSnapshotId) : null;
  const versionNumbers = new Map(courtCase.versions.map((version) => [version.id, version.version]));
  const strategy = publicVersion(strategyVersion, versionNumbers);
  const result = run.result ?? {};
  const dataMetadata = snapshot ? {
    provider: snapshot.provider,
    adjustment: snapshot.adjustment,
    feed: snapshot.feed,
    dateRange: { start: snapshot.dateFrom, end: snapshot.dateTo },
    symbols: snapshot.symbols,
    fetchedAt: snapshot.fetchedAt,
    snapshotHash: snapshot.hash,
    request: snapshot.request,
    barCount: snapshot.bars.length,
  } : null;
  return {
    schemaVersion: SHARE_MANIFEST_VERSION,
    kind: "strategy_court_report",
    ...(exposeOwnerIds ? { id: run.id } : {}),
    case: {
      ...(exposeOwnerIds ? { id: courtCase.id } : {}),
      name: courtCase.name,
      description: courtCase.description,
      symbols: courtCase.symbols,
      dateRange: { start: courtCase.dateFrom, end: courtCase.dateTo },
      initialCapital: courtCase.initialCapital,
      costs: {
        commissionBpsPerSide: courtCase.commissionBps,
        slippageBpsPerSide: courtCase.slippageBps,
      },
      profile: run.profile,
    },
    strategyVersion: {
      ...(exposeOwnerIds ? { id: strategyVersion.id } : {}),
      ...strategy,
    },
    strategyDefinition: strategyVersion.definition,
    run: {
      ...(exposeOwnerIds ? {
        id: run.id,
        caseId: run.caseId,
        strategyVersionId: run.strategyVersionId,
        dataSnapshotId: run.dataSnapshotId,
      } : {}),
      status: run.status,
      profile: run.profile,
      summary: run.summary,
      engineVersion: run.engineVersion,
      reproducibilityId: run.reproducibilityId,
      createdAt: run.createdAt,
      completedAt: run.updatedAt,
    },
    verdicts: result.verdicts ?? [],
    assumptions: result.assumptions ?? {},
    trades: result.trades ?? [],
    failures: result.failures ?? [],
    metrics: result.metrics ?? result.baseline ?? {},
    diagnostics: {
      baseline: result.baseline && typeof result.baseline === "object"
        ? (result.baseline as Record<string, unknown>).diagnostics ?? {}
        : {},
      outOfSample: result.outOfSample && typeof result.outOfSample === "object"
        ? (result.outOfSample as Record<string, unknown>).diagnostics ?? {}
        : {},
      stressedCosts: result.stressedCosts && typeof result.stressedCosts === "object"
        ? (result.stressedCosts as Record<string, unknown>).diagnostics ?? {}
        : {},
    },
    parameterTrials: result.parameterTrials ?? [],
    dataWarnings: result.dataWarnings ?? [],
    outOfSample: result.outOfSample ?? {},
    stressedCosts: result.stressedCosts ?? {},
    equityCurve: result.equityCurve ?? [],
    drawdownCurve: result.drawdownCurve ?? [],
    versionHistory: courtCase.versions.map((version) => ({
      ...(exposeOwnerIds ? { id: version.id, parentVersionId: version.parentVersionId } : {}),
      ...publicVersion(version, versionNumbers),
    })),
    dataMetadata,
    engineVersion: run.engineVersion,
    humanReadable: {
      title: courtCase.name,
      summary: run.summary,
      strategy: strategyVersion.interpretation,
      verdicts: Array.isArray(result.verdicts)
        ? result.verdicts.map((item) => {
            const verdict = item && typeof item === "object" ? item as Record<string, unknown> : {};
            return `${String(verdict.label ?? verdict.category ?? verdict.id ?? "Court category")}: ${String(verdict.status ?? verdict.verdict ?? "Inconclusive")}`;
          })
        : [],
      limitation: "Historical results do not predict or guarantee future performance.",
    },
    limitation: "Historical results do not predict or guarantee future performance.",
  };
}

function remapFormula(value: unknown, aliases: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapFormula(item, aliases));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = key === "indicator" && typeof item === "string" ? aliases.get(item) ?? item : remapFormula(item, aliases);
  }
  return result;
}

function publicIndicator(record: IndicatorRecord, key: string, aliases: Map<string, string>) {
  return {
    key,
    name: record.name,
    description: record.description,
    version: record.version,
    creatorType: record.creatorType,
    createdAt: record.createdAt,
    inputs: record.inputs,
    dependencies: record.dependencies.map((dependency) => aliases.get(dependency) ?? dependency),
    outputType: record.outputType,
    formula: remapFormula(record.formula, aliases),
  };
}

export async function buildIndicatorManifest(
  store: Store,
  indicatorId: string,
  ownerUserId: string,
): Promise<Record<string, unknown> | null> {
  const available = new Map((await store.listIndicators(ownerUserId)).map((indicator) => [indicator.id, indicator]));
  const root = available.get(indicatorId);
  if (!root || root.sharingState !== "unlisted") return null;

  const ordered: IndicatorRecord[] = [];
  const visited = new Set<string>();
  const visit = (record: IndicatorRecord) => {
    if (visited.has(record.id)) return;
    visited.add(record.id);
    for (const dependencyId of record.dependencies) {
      const dependency = available.get(dependencyId);
      if (dependency) visit(dependency);
    }
    ordered.push(record);
  };
  visit(root);
  const aliases = new Map<string, string>();
  let dependencyNumber = 0;
  for (const record of ordered) aliases.set(record.id, record.id === root.id ? "root" : `dependency_${++dependencyNumber}`);
  const dependencies = ordered.filter((record) => record.id !== root.id).map((record) => publicIndicator(record, aliases.get(record.id)!, aliases));
  return {
    schemaVersion: SHARE_MANIFEST_VERSION,
    kind: "strategy_court_indicator",
    ...publicIndicator(root, "root", aliases),
    sharingState: "unlisted",
    dependencyDefinitions: dependencies,
  };
}

export interface ResolvedShare {
  record: ShareTokenRecord;
  ownerUserId: string;
  entityId: string;
  entityType: ShareEntityType;
}
