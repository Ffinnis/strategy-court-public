import type { Pool, PoolClient } from "pg";
import { evidenceReferenceExists, parseDecisionFields, type DecisionFields, type InvestigationDecision } from "@strategy-court/schemas";
import { ApiError } from "../errors";
import { contentHash } from "../providers/market";

type Row = Record<string, any>;
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
function decision(row: Row): InvestigationDecision {
  return { ...row.fields_json, id: row.id, caseId: row.case_id, versionId: row.strategy_version_id,
    runId: row.run_id, state: row.state, source: row.source, createdAt: iso(row.created_at),
    confirmedAt: row.confirmed_at ? iso(row.confirmed_at) : null, supersedesId: row.supersedes_id ?? null };
}
export function requestKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(value)) throw new ApiError(422, "invalid_request_id", "Use a stable requestId of 8 to 120 letters, numbers, dashes or underscores for retries.");
  return value;
}
export function readDecisionFields(value: unknown): DecisionFields {
  try { return parseDecisionFields(value); }
  catch (error) { throw new ApiError(422, "invalid_decision", error instanceof Error ? error.message : "Invalid decision fields."); }
}

export class DecisionRepository {
  constructor(private readonly pool: Pool) {}

  private async owned<T>(caseId: string, ownerId: string, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query("SELECT id FROM court_cases WHERE id=$1 AND owner_user_id=$2 FOR UPDATE", [caseId, ownerId]);
      if (!owned.rowCount) throw new ApiError(404, "case_not_found", "Case not found.");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  private async validateEvidence(client: PoolClient, caseId: string, versionId: string, runId: string, fields: DecisionFields) {
    const found = await client.query("SELECT * FROM court_runs WHERE id=$1 AND case_id=$2 AND strategy_version_id=$3", [runId, caseId, versionId]);
    const run = found.rows[0];
    if (!run || run.status !== "completed" || !run.result_json || String(run.summary).toLowerCase() === "invalid") {
      throw new ApiError(409, "completed_run_required", "A decision needs a valid completed run for this version.");
    }
    if (fields.evidenceRefs.some(ref => !evidenceReferenceExists(run.result_json, ref))) throw new ApiError(422, "evidence_not_found", "Every citation must belong to this exact Court run.");
    if (fields.outcome === "ready_for_replay" && !["surviving", "inconclusive"].includes(String(run.summary).toLowerCase())) {
      throw new ApiError(409, "replay_not_allowed", "This Court result is not eligible for replay.");
    }
  }

  private async audit(client: PoolClient, item: InvestigationDecision, ownerId: string, action: string, actor: "user" | "agent") {
    await client.query(`INSERT INTO audit_events (id,case_id,actor,actor_user_id,action,entity_type,entity_id,after_json,created_at)
      VALUES ($1,$2,$3,$4,$5,'investigation_decision',$6,$7,NOW())`,
    [crypto.randomUUID(), item.caseId, actor, ownerId, action, item.id, JSON.stringify({ outcome: item.outcome, runId: item.runId, state: item.state, supersedesId: item.supersedesId })]);
  }

  async list(caseId: string, ownerId: string, runId?: string): Promise<InvestigationDecision[]> {
    const result = await this.pool.query(`SELECT d.* FROM investigation_decisions d JOIN court_cases c ON c.id=d.case_id
      WHERE d.case_id=$1 AND c.owner_user_id=$2 AND ($3::text IS NULL OR d.run_id=$3)
      ORDER BY COALESCE(d.confirmed_at,d.created_at) DESC, d.id DESC`, [caseId, ownerId, runId ?? null]);
    return result.rows.map(decision);
  }

  async propose(caseId: string, ownerId: string, input: { versionId: string; runId: string; requestId: string; fields: DecisionFields }, source: "user" | "agent") {
    const fields = readDecisionFields(input.fields);
    const key = requestKey(input.requestId);
    const hash = contentHash({ fields, versionId: input.versionId, runId: input.runId });
    return this.owned(caseId, ownerId, async client => {
      const existing = await client.query("SELECT * FROM investigation_decisions WHERE case_id=$1 AND request_id=$2", [caseId, key]);
      if (existing.rows[0]) {
        if (existing.rows[0].input_hash !== hash) throw new ApiError(409, "request_conflict", "This requestId was already used with different decision fields.");
        return decision(existing.rows[0]);
      }
      await this.validateEvidence(client, caseId, input.versionId, input.runId, fields);
      const result = await client.query(`INSERT INTO investigation_decisions
        (id,case_id,strategy_version_id,run_id,state,fields_json,source,creator_user_id,request_id,input_hash,created_at)
        VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,NOW()) RETURNING *`,
      [crypto.randomUUID(), caseId, input.versionId, input.runId, JSON.stringify(fields), source, ownerId, key, hash]);
      const item = decision(result.rows[0]);
      await this.audit(client, item, ownerId, "decision.proposed", source);
      return item;
    });
  }

  async confirm(caseId: string, decisionId: string, ownerId: string, fieldsInput: unknown, expectedPredecessorId: string | null) {
    const fields = readDecisionFields(fieldsInput);
    return this.owned(caseId, ownerId, async client => {
      const found = await client.query("SELECT * FROM investigation_decisions WHERE id=$1 AND case_id=$2", [decisionId, caseId]);
      if (!found.rows[0]) throw new ApiError(404, "decision_not_found", "Decision draft not found.");
      const previous = decision(found.rows[0]);
      if (previous.state === "confirmed") {
        if (contentHash(found.rows[0].fields_json) !== contentHash(fields) || previous.supersedesId !== expectedPredecessorId) throw new ApiError(409, "decision_immutable", "Confirmed decisions cannot be edited. Create a new draft.");
        return previous;
      }
      const current = await client.query("SELECT id FROM investigation_decisions WHERE case_id=$1 AND run_id=$2 AND state='confirmed' ORDER BY confirmed_at DESC,id DESC LIMIT 1", [caseId, previous.runId]);
      if ((current.rows[0]?.id ?? null) !== expectedPredecessorId) throw new ApiError(409, "decision_changed", "The recorded decision changed. Refresh and review it before confirming.");
      await this.validateEvidence(client, caseId, previous.versionId, previous.runId, fields);
      const result = await client.query(`UPDATE investigation_decisions SET state='confirmed',fields_json=$1,confirmed_at=NOW(),confirmed_by=$2,supersedes_id=$3 WHERE id=$4 RETURNING *`,
        [JSON.stringify(fields), ownerId, expectedPredecessorId, decisionId]);
      const item = decision(result.rows[0]);
      await this.audit(client, item, ownerId, expectedPredecessorId ? "decision.superseded" : "decision.confirmed", "user");
      return item;
    });
  }
}
