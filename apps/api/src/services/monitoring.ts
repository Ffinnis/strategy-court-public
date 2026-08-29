import { evaluateLatestCompletedBar } from "@strategy-court/domain";
import type { LatestBarMonitoringStatus, StrategyDefinition } from "@strategy-court/schemas";
import { calendarDate, type Store } from "../store";
import type { Actor, CaseRecord, StrategyVersionRecord } from "../types";
import type { MarketProvider } from "../providers/market";
import { snapshotForDomain } from "../providers/market";
import { ApiError } from "../errors";

export interface MonitoringEvaluationRecord {
  id: string;
  caseId: string;
  strategyVersionId: string;
  dataSnapshotId: string;
  evaluatedDate: string;
  result: LatestBarMonitoringStatus;
  createdAt: string;
}

function row(value: Record<string, unknown>): MonitoringEvaluationRecord {
  const result = typeof value.result_json === "string"
    ? JSON.parse(value.result_json) as LatestBarMonitoringStatus
    : value.result_json as LatestBarMonitoringStatus;
  return {
    id: String(value.id),
    caseId: String(value.case_id),
    strategyVersionId: String(value.strategy_version_id),
    dataSnapshotId: String(value.data_snapshot_id),
    evaluatedDate: calendarDate(value.evaluated_date),
    result,
    createdAt: value.created_at instanceof Date ? value.created_at.toISOString() : String(value.created_at),
  };
}

export async function latestMonitoringEvaluation(
  store: Store,
  caseId: string,
  strategyVersionId: string,
  ownerUserId: string,
): Promise<MonitoringEvaluationRecord | null> {
  const result = await store.db.query(`SELECT evaluation.* FROM monitoring_evaluations AS evaluation
    JOIN court_cases AS court_case ON court_case.id = evaluation.case_id
    WHERE evaluation.case_id = $1 AND evaluation.strategy_version_id = $2 AND court_case.owner_user_id = $3
    ORDER BY evaluation.created_at DESC LIMIT 1`, [caseId, strategyVersionId, ownerUserId]);
  return result.rows[0] ? row(result.rows[0] as Record<string, unknown>) : null;
}

function latestCompletedDate(): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export async function refreshLatestBarMonitoring(input: {
  store: Store;
  marketProvider: MarketProvider;
  courtCase: CaseRecord;
  version: StrategyVersionRecord;
  ownerUserId: string;
  actor: Actor;
}): Promise<MonitoringEvaluationRecord> {
  const dateTo = latestCompletedDate();
  if (input.courtCase.dateFrom > dateTo) {
    throw new ApiError(422, "monitoring_range_unavailable", "The case begins after the latest completed daily bar");
  }
  const previous = await latestMonitoringEvaluation(
    input.store,
    input.courtCase.id,
    input.version.id,
    input.ownerUserId,
  );
  const marketSnapshot = await input.marketProvider.getSnapshot({
    symbols: [...new Set([...input.courtCase.symbols, "SPY"])],
    dateFrom: input.courtCase.dateFrom,
    dateTo,
  });
  const snapshot = await input.store.saveSnapshot(marketSnapshot);
  let status: LatestBarMonitoringStatus;
  try {
    status = evaluateLatestCompletedBar({
      strategyVersionId: input.version.id,
      strategy: input.version.definition as unknown as StrategyDefinition,
      snapshot: snapshotForDomain(snapshot),
      initialCapital: input.courtCase.initialCapital,
      previous: previous?.result,
    });
  } catch (error) {
    throw new ApiError(422, "monitoring_evaluation_invalid", error instanceof Error ? error.message : "Latest-bar evaluation failed");
  }
  const record: MonitoringEvaluationRecord = {
    id: crypto.randomUUID(),
    caseId: input.courtCase.id,
    strategyVersionId: input.version.id,
    dataSnapshotId: snapshot.id,
    evaluatedDate: status.evaluatedDate,
    result: status,
    createdAt: new Date().toISOString(),
  };
  const inserted = await input.store.db.query(`INSERT INTO monitoring_evaluations
    (id, case_id, strategy_version_id, data_snapshot_id, evaluated_date, result_json, created_at)
    SELECT $1, $2, $3, $4, $5, $6, $7
    WHERE EXISTS (SELECT 1 FROM court_cases WHERE id = $2 AND owner_user_id = $8)
    RETURNING *`, [
    record.id,
    record.caseId,
    record.strategyVersionId,
    record.dataSnapshotId,
    record.evaluatedDate,
    JSON.stringify(record.result),
    record.createdAt,
    input.ownerUserId,
  ]);
  if (!inserted.rows[0]) throw new ApiError(404, "case_not_found", "Court case not found");
  const saved = row(inserted.rows[0] as Record<string, unknown>);
  await input.store.audit({
    caseId: record.caseId,
    actor: input.actor,
    actorUserId: input.ownerUserId,
    action: "monitoring.evaluated",
    entityType: "monitoring_evaluation",
    entityId: record.id,
    before: previous?.result ?? null,
    after: saved.result,
  });
  return saved;
}
