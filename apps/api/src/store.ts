import type { Pool, PoolClient } from "pg";
import migration from "./migrations/001_postgres.sql" with { type: "text" };
import { createOpaqueToken, hashShareToken } from "./services/sharing";
import { DecisionRepository, requestKey } from "./services/decisions";
import { contentHash } from "./providers/market";
import { ApiError } from "./errors";
import type {
  Actor,
  AuditRecord,
  CaseContext,
  CaseRecord,
  CourtRunRecord,
  IndicatorRecord,
  ReplayRecord,
  ShareEntityType,
  ShareTokenRecord,
  SnapshotRecord,
  StrategyVersionRecord,
} from "./types";

type Row = Record<string, unknown>;
type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const encoded = (value: unknown) => JSON.stringify(value);
const encodedOrNull = (value: unknown) => value === null ? null : encoded(value);

function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function calendarDate(value: unknown): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value);
}

function caseFromRow(row: Row): CaseRecord {
  return {
    sampleId: row.sample_id ? String(row.sample_id) : null,
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    symbols: json<string[]>(row.symbols_json, []),
    dateFrom: calendarDate(row.date_from),
    dateTo: calendarDate(row.date_to),
    initialCapital: Number(row.initial_capital),
    commissionBps: Number(row.commission_bps),
    slippageBps: Number(row.slippage_bps),
    status: String(row.status),
    selectedProfile: String(row.selected_profile),
    activeVersionId: row.active_version_id === null ? null : String(row.active_version_id),
    evaluationLocked: Boolean(row.evaluation_locked),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function versionFromRow(row: Row): StrategyVersionRecord {
  return {
    id: String(row.id),
    version: Number(row.version_number),
    caseId: String(row.case_id),
    parentVersionId: row.parent_version_id === null ? null : String(row.parent_version_id),
    definition: json<Record<string, unknown>>(row.definition_json, {}),
    interpretation: String(row.interpretation),
    source: String(row.source) as Actor,
    metadata: json<Record<string, unknown>>(row.metadata_json, {}),
    confirmed: Boolean(row.confirmed),
    evaluationInformed: Boolean(row.evaluation_informed),
    createdAt: timestamp(row.created_at),
  };
}

function runFromRow(row: Row): CourtRunRecord {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    strategyVersionId: String(row.strategy_version_id),
    dataSnapshotId: row.data_snapshot_id === null ? null : String(row.data_snapshot_id),
    engineVersion: String(row.engine_version),
    reproducibilityId: row.reproducibility_id === null ? null : String(row.reproducibility_id),
    profile: String(row.profile),
    status: String(row.status) as CourtRunRecord["status"],
    progress: json(row.progress_json, { percent: 0, stage: "queued" }),
    summary: row.summary === null ? null : String(row.summary),
    result: json<Record<string, unknown> | null>(row.result_json, null),
    error: json<Record<string, unknown> | null>(row.error_json, null),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function replayFromRow(row: Row): ReplayRecord {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    strategyVersionId: String(row.strategy_version_id),
    runId: String(row.run_id),
    reservedFrom: calendarDate(row.reserved_from),
    reservedTo: calendarDate(row.reserved_to),
    cursor: Number(row.cursor),
    status: String(row.status) as ReplayRecord["status"],
    state: json<Record<string, unknown>>(row.state_json, {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function snapshotFromRow(row: Row): SnapshotRecord {
  return {
    id: String(row.id),
    provider: String(row.provider),
    adjustment: String(row.adjustment),
    feed: String(row.feed),
    dateFrom: calendarDate(row.date_from),
    dateTo: calendarDate(row.date_to),
    symbols: json(row.symbols_json, []),
    fetchedAt: timestamp(row.fetched_at),
    hash: String(row.hash),
    request: json(row.request_json, {}),
    bars: json(row.bars_json, []),
  };
}

function auditFromRow(row: Row): AuditRecord {
  return {
    id: String(row.id),
    caseId: row.case_id === null ? null : String(row.case_id),
    actor: String(row.actor) as Actor,
    actorUserId: row.actor_user_id === null ? null : String(row.actor_user_id),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    before: json(row.before_json, null),
    after: json(row.after_json, null),
    createdAt: timestamp(row.created_at),
  };
}

function indicatorFromRow(row: Row): IndicatorRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    version: Number(row.version),
    description: String(row.description),
    formula: json(row.formula_json, null),
    inputs: json(row.inputs_json, []),
    dependencies: json(row.dependencies_json, []),
    outputType: String(row.output_type),
    sharingState: String(row.sharing_state),
    creatorType: String(row.creator_type ?? "user"),
    metadata: json(row.metadata_json, {}),
    lineageId: String(row.lineage_id ?? row.id),
    parentIndicatorId: row.parent_indicator_id === null || row.parent_indicator_id === undefined ? null : String(row.parent_indicator_id),
    createdAt: timestamp(row.created_at),
  };
}

function shareFromRow(row: Row): ShareTokenRecord {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    entityType: String(row.entity_type) as ShareEntityType,
    entityId: String(row.entity_id),
    rotatedFromId: row.rotated_from_id === null ? null : String(row.rotated_from_id),
    createdAt: timestamp(row.created_at),
    revokedAt: row.revoked_at === null ? null : timestamp(row.revoked_at),
  };
}

export class Store {
  readonly db: Pool;
  readonly decisions: DecisionRepository;

  constructor(pool: Pool) {
    this.db = pool;
    this.decisions = new DecisionRepository(pool);
  }

  async migrate(): Promise<void> {
    await this.db.query(migration);
  }

  async close(): Promise<void> {
    // The caller owns the injected pool lifecycle.
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async requireOwnedCase(client: Queryable, caseId: string, ownerUserId: string): Promise<void> {
    const result = await client.query(
      "SELECT id FROM court_cases WHERE id = $1 AND owner_user_id = $2 FOR UPDATE",
      [caseId, ownerUserId],
    );
    if (!result.rowCount) throw new Error(`Unknown case ${caseId}`);
  }

  private async insertAudit(client: Queryable, input: {
    caseId?: string | null;
    actor: Actor;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  }): Promise<AuditRecord> {
    const event: AuditRecord = {
      id: id(),
      caseId: input.caseId ?? null,
      actor: input.actor,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before ?? null,
      after: input.after ?? null,
      createdAt: now(),
    };
    await client.query(`INSERT INTO audit_events
      (id, case_id, actor, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
      event.id,
      event.caseId,
      event.actor,
      event.actorUserId,
      event.action,
      event.entityType,
      event.entityId,
      encodedOrNull(event.before),
      encodedOrNull(event.after),
      event.createdAt,
    ]);
    return event;
  }

  async audit(input: {
    caseId?: string | null;
    actor: Actor;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  }): Promise<AuditRecord> {
    return this.insertAudit(this.db, input);
  }

  async createCase(
    input: Omit<CaseRecord, "id" | "status" | "activeVersionId" | "evaluationLocked" | "createdAt" | "updatedAt">,
    actor: Actor,
    ownerUserId: string,
    creationRequestId?: string,
  ): Promise<CaseRecord> {
    const key = creationRequestId === undefined ? null : requestKey(creationRequestId);
    const hash = contentHash(input);
    const createdAt = now();
    const record: CaseRecord = {
      ...input,
      id: id(),
      status: "draft",
      activeVersionId: null,
      evaluationLocked: false,
      createdAt,
      updatedAt: createdAt,
    };
    return this.transaction(async (client) => {
      if (key) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${ownerUserId}:${key}`]);
        const prior = await client.query("SELECT * FROM court_cases WHERE owner_user_id=$1 AND creation_request_id=$2", [ownerUserId,key]);
        if (prior.rows[0]) {
          if (prior.rows[0].creation_input_hash !== hash) throw new ApiError(409,"request_conflict","This requestId was already used with different case settings.");
          return caseFromRow(prior.rows[0]);
        }
      }
      await client.query(`INSERT INTO court_cases
        (id, owner_user_id, name, description, symbols_json, date_from, date_to, initial_capital,
         commission_bps, slippage_bps, status, selected_profile, active_version_id,
         evaluation_locked, created_at, updated_at, creation_request_id, creation_input_hash, sample_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, FALSE, $13, $13, $14, $15, $16)`, [
        record.id,
        ownerUserId,
        record.name,
        record.description,
        encoded(record.symbols),
        record.dateFrom,
        record.dateTo,
        record.initialCapital,
        record.commissionBps,
        record.slippageBps,
        record.status,
        record.selectedProfile,
        createdAt,
        key, hash, input.sampleId ?? null,
      ]);
      await this.insertAudit(client, {
        caseId: record.id,
        actor,
        actorUserId: ownerUserId,
        action: "case.created",
        entityType: "case",
        entityId: record.id,
        after: record,
      });
      return record;
    });
  }

  async listCases(ownerUserId: string): Promise<CaseRecord[]> {
    const result = await this.db.query(
      "SELECT * FROM court_cases WHERE owner_user_id = $1 ORDER BY updated_at DESC",
      [ownerUserId],
    );
    return (result.rows as Row[]).map(caseFromRow);
  }

  async listCasesPage(
    ownerUserId: string,
    options: { query: string; offset: number; limit: number },
  ): Promise<{ cases: CaseRecord[]; total: number; offset: number; nextOffset: number | null }> {
    const filter = `owner_user_id = $1 AND (
      $2 = ''
      OR POSITION(LOWER($2) IN LOWER(name)) > 0
      OR POSITION(LOWER($2) IN LOWER(description)) > 0
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(symbols_json) AS symbol(value)
        WHERE POSITION(LOWER($2) IN LOWER(symbol.value)) > 0
      )
    )`;
    const result = await this.db.query<{ cases_json: Row[]; total: string }>(
      `WITH filtered AS MATERIALIZED (
         SELECT * FROM court_cases WHERE ${filter}
       ), page AS (
         SELECT * FROM filtered ORDER BY updated_at DESC, id DESC LIMIT $3 OFFSET $4
       )
       SELECT
         COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY updated_at DESC, id DESC) FROM page), '[]'::jsonb) AS cases_json,
         (SELECT COUNT(*)::text FROM filtered) AS total`,
      [ownerUserId, options.query, options.limit, options.offset],
    );
    const cases = (result.rows[0]?.cases_json ?? []).map(caseFromRow);
    const total = Number(result.rows[0]?.total ?? 0);
    const consumed = options.offset + cases.length;
    return {
      cases,
      total,
      offset: options.offset,
      nextOffset: consumed < total ? consumed : null,
    };
  }

  async getCase(caseId: string, ownerUserId: string): Promise<CaseRecord | null> {
    const result = await this.db.query(
      "SELECT * FROM court_cases WHERE id = $1 AND owner_user_id = $2",
      [caseId, ownerUserId],
    );
    return result.rows[0] ? caseFromRow(result.rows[0] as Row) : null;
  }

  async getCaseContext(caseId: string, ownerUserId: string): Promise<CaseContext | null> {
    const courtCase = await this.getCase(caseId, ownerUserId);
    if (!courtCase) return null;
    const [versions, runs, replays, audit] = await Promise.all([
      this.db.query("SELECT * FROM strategy_versions WHERE case_id = $1 ORDER BY version_number ASC", [caseId]),
      this.db.query("SELECT * FROM court_runs WHERE case_id = $1 ORDER BY created_at DESC", [caseId]),
      this.db.query("SELECT * FROM replay_sessions WHERE case_id = $1 ORDER BY created_at DESC", [caseId]),
      this.db.query("SELECT * FROM audit_events WHERE case_id = $1 ORDER BY created_at ASC", [caseId]),
    ]);
    return {
      ...courtCase,
      decisions: await this.decisions.list(caseId, ownerUserId),
      versions: (versions.rows as Row[]).map(versionFromRow),
      runs: (runs.rows as Row[]).map(runFromRow),
      replays: (replays.rows as Row[]).map(replayFromRow),
      audit: (audit.rows as Row[]).map(auditFromRow),
    };
  }

  async ensureSampleDraft(caseId: string, definition: unknown, interpretation: string, actor: Actor, ownerId: string): Promise<void> {
    await this.transaction(async client => {
      await this.requireOwnedCase(client, caseId, ownerId);
      const existing = await client.query("SELECT id FROM strategy_versions WHERE case_id=$1 LIMIT 1", [caseId]);
      if (existing.rowCount) return;
      const versionId = id();
      await client.query(`INSERT INTO strategy_versions (id,case_id,version_number,definition_json,interpretation,source,created_at)
        VALUES ($1,$2,1,$3,$4,$5,NOW())`, [versionId,caseId,encoded(definition),interpretation,actor]);
      await client.query("UPDATE court_cases SET active_version_id=$1,updated_at=NOW() WHERE id=$2", [versionId,caseId]);
      await this.insertAudit(client,{caseId,actor,actorUserId:ownerId,action:"strategy.draft_created",entityType:"strategy_version",entityId:versionId});
    });
  }

  async createVersion(input: {
    caseId: string;
    parentVersionId?: string | null;
    definition: Record<string, unknown>;
    interpretation: string;
    source: Actor;
    metadata?: Record<string, unknown>;
    confirmed?: boolean;
    evaluationInformed?: boolean;
  }, actor: Actor, ownerUserId: string): Promise<StrategyVersionRecord> {
    return this.transaction(async (client) => {
      await this.requireOwnedCase(client, input.caseId, ownerUserId);
      if (input.parentVersionId) {
        const parent = await client.query(
          "SELECT id FROM strategy_versions WHERE id = $1 AND case_id = $2",
          [input.parentVersionId, input.caseId],
        );
        if (!parent.rowCount) throw new Error(`Unknown parent version ${input.parentVersionId}`);
      }
      if (input.evaluationInformed) {
        const count = await client.query(
          "SELECT COUNT(*) AS count FROM strategy_versions WHERE case_id = $1 AND evaluation_informed = TRUE",
          [input.caseId],
        );
        if (Number(count.rows[0]?.count ?? 0) >= 3) {
          throw new RangeError("A case may create at most three evaluation-informed versions");
        }
      }
      const next = await this.nextVersionNumber(client, input.caseId);
      const record: StrategyVersionRecord = {
        id: id(),
        version: next,
        caseId: input.caseId,
        parentVersionId: input.parentVersionId ?? null,
        definition: input.definition,
        interpretation: input.interpretation,
        source: input.source,
        metadata: input.metadata ?? {},
        confirmed: input.confirmed ?? false,
        evaluationInformed: input.evaluationInformed ?? false,
        createdAt: now(),
      };
      await client.query(`INSERT INTO strategy_versions
        (id, case_id, version_number, parent_version_id, definition_json, interpretation, source,
         metadata_json, confirmed, evaluation_informed, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
        record.id,
        record.caseId,
        record.version,
        record.parentVersionId,
        encoded(record.definition),
        record.interpretation,
        record.source,
        encoded(record.metadata),
        record.confirmed,
        record.evaluationInformed,
        record.createdAt,
      ]);
      await this.insertAudit(client, {
        caseId: record.caseId,
        actor,
        actorUserId: ownerUserId,
        action: record.evaluationInformed ? "variant.created" : "strategy.draft_created",
        entityType: "strategy_version",
        entityId: record.id,
        after: record,
      });
      return record;
    });
  }

  private async nextVersionNumber(client: Queryable, caseId: string): Promise<number> {
    const result = await client.query(
      "SELECT COALESCE(MAX(version_number), 0) AS value FROM strategy_versions WHERE case_id = $1",
      [caseId],
    );
    return Number(result.rows[0]?.value ?? 0) + 1;
  }

  async createVersionRunBatch(input: {
    caseId: string;
    versions: Array<{
      parentVersionId: string;
      definition: Record<string, unknown>;
      interpretation: string;
      source: Actor;
      metadata: Record<string, unknown>;
      evaluationInformed: boolean;
    }>;
    profile: string;
    engineVersion: string;
    actor: Actor;
  }, ownerUserId: string): Promise<{ versions: StrategyVersionRecord[]; runs: CourtRunRecord[] }> {
    if (input.versions.length < 1 || input.versions.length > 3) {
      throw new RangeError("A variant batch must contain one to three versions");
    }
    return this.transaction(async (client) => {
      await this.requireOwnedCase(client, input.caseId, ownerUserId);
      const count = await client.query(
        "SELECT COUNT(*) AS count FROM strategy_versions WHERE case_id = $1 AND evaluation_informed = TRUE",
        [input.caseId],
      );
      if (Number(count.rows[0]?.count ?? 0) + input.versions.length > 3) {
        throw new RangeError("A case may create at most three evaluation-informed versions");
      }
      const parentIds = [...new Set(input.versions.map((candidate) => candidate.parentVersionId))];
      const parents = await client.query(
        "SELECT id FROM strategy_versions WHERE case_id = $1 AND id = ANY($2::text[])",
        [input.caseId, parentIds],
      );
      if (parents.rowCount !== parentIds.length) throw new Error("A variant parent does not belong to this case");

      const createdAt = now();
      let versionNumber = await this.nextVersionNumber(client, input.caseId);
      const versions: StrategyVersionRecord[] = [];
      const runs: CourtRunRecord[] = [];
      for (const candidate of input.versions) {
        const version: StrategyVersionRecord = {
          id: id(),
          version: versionNumber++,
          caseId: input.caseId,
          parentVersionId: candidate.parentVersionId,
          definition: candidate.definition,
          interpretation: candidate.interpretation,
          source: candidate.source,
          metadata: candidate.metadata,
          confirmed: true,
          evaluationInformed: candidate.evaluationInformed,
          createdAt,
        };
        await client.query(`INSERT INTO strategy_versions
          (id, case_id, version_number, parent_version_id, definition_json, interpretation, source,
           metadata_json, confirmed, evaluation_informed, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10)`, [
          version.id,
          version.caseId,
          version.version,
          version.parentVersionId,
          encoded(version.definition),
          version.interpretation,
          version.source,
          encoded(version.metadata),
          version.evaluationInformed,
          version.createdAt,
        ]);
        const run: CourtRunRecord = {
          id: id(),
          caseId: input.caseId,
          strategyVersionId: version.id,
          dataSnapshotId: null,
          engineVersion: input.engineVersion,
          reproducibilityId: null,
          profile: input.profile,
          status: "queued",
          progress: { percent: 0, stage: "queued" },
          summary: null,
          result: null,
          error: null,
          createdAt,
          updatedAt: createdAt,
        };
        await client.query(`INSERT INTO court_runs
          (id, case_id, strategy_version_id, data_snapshot_id, engine_version, reproducibility_id,
           profile, status, progress_json, summary, result_json, error_json, created_at, updated_at)
          VALUES ($1, $2, $3, NULL, $4, NULL, $5, 'queued', $6, NULL, NULL, NULL, $7, $7)`, [
          run.id,
          run.caseId,
          run.strategyVersionId,
          run.engineVersion,
          run.profile,
          encoded(run.progress),
          createdAt,
        ]);
        await this.insertAudit(client, {
          caseId: input.caseId,
          actor: input.actor,
          actorUserId: ownerUserId,
          action: "variant.created",
          entityType: "strategy_version",
          entityId: version.id,
          after: version,
        });
        await this.insertAudit(client, {
          caseId: input.caseId,
          actor: input.actor,
          actorUserId: ownerUserId,
          action: "court.queued",
          entityType: "court_run",
          entityId: run.id,
          after: run,
        });
        versions.push(version);
        runs.push(run);
      }
      await client.query(
        "UPDATE court_cases SET status = 'running', updated_at = $1 WHERE id = $2 AND owner_user_id = $3",
        [createdAt, input.caseId, ownerUserId],
      );
      return { versions, runs };
    });
  }

  async getVersion(versionId: string, ownerUserId: string): Promise<StrategyVersionRecord | null> {
    const result = await this.db.query(`SELECT version.* FROM strategy_versions AS version
      JOIN court_cases AS court_case ON court_case.id = version.case_id
      WHERE version.id = $1 AND court_case.owner_user_id = $2`, [versionId, ownerUserId]);
    return result.rows[0] ? versionFromRow(result.rows[0] as Row) : null;
  }

  async countVariants(caseId: string, ownerUserId: string): Promise<number> {
    const result = await this.db.query(`SELECT COUNT(*) AS count FROM strategy_versions AS version
      JOIN court_cases AS court_case ON court_case.id = version.case_id
      WHERE version.case_id = $1 AND court_case.owner_user_id = $2 AND version.evaluation_informed = TRUE`, [caseId, ownerUserId]);
    return Number(result.rows[0]?.count ?? 0);
  }

  async confirmVersion(caseId: string, versionId: string, actor: Actor, ownerUserId: string): Promise<{ case: CaseRecord; version: StrategyVersionRecord } | null> {
    return this.transaction(async (client) => {
      const owned = await client.query(
        "SELECT * FROM court_cases WHERE id = $1 AND owner_user_id = $2 FOR UPDATE",
        [caseId, ownerUserId],
      );
      if (!owned.rows[0]) return null;
      const versionResult = await client.query(
        "SELECT * FROM strategy_versions WHERE id = $1 AND case_id = $2 FOR UPDATE",
        [versionId, caseId],
      );
      if (!versionResult.rows[0]) return null;
      const before = versionFromRow(versionResult.rows[0] as Row);
      const updatedAt = now();
      await client.query("UPDATE strategy_versions SET confirmed = TRUE WHERE id = $1", [versionId]);
      const caseResult = await client.query(`UPDATE court_cases
        SET active_version_id = $1, status = 'confirmed', updated_at = $2
        WHERE id = $3 AND owner_user_id = $4 RETURNING *`, [versionId, updatedAt, caseId, ownerUserId]);
      const version = { ...before, confirmed: true };
      await this.insertAudit(client, {
        caseId,
        actor,
        actorUserId: ownerUserId,
        action: "strategy.confirmed",
        entityType: "strategy_version",
        entityId: versionId,
        before,
        after: version,
      });
      return { case: caseFromRow(caseResult.rows[0] as Row), version };
    });
  }

  async createRun(
    caseId: string,
    versionId: string,
    profile: string,
    engineVersion: string,
    actor: Actor,
    ownerUserId: string,
  ): Promise<CourtRunRecord> {
    return this.transaction(async (client) => {
      await this.requireOwnedCase(client, caseId, ownerUserId);
      const version = await client.query(
        "SELECT id FROM strategy_versions WHERE id = $1 AND case_id = $2",
        [versionId, caseId],
      );
      if (!version.rowCount) throw new Error(`Unknown version ${versionId}`);
      const createdAt = now();
      const record: CourtRunRecord = {
        id: id(),
        caseId,
        strategyVersionId: versionId,
        dataSnapshotId: null,
        engineVersion,
        reproducibilityId: null,
        profile,
        status: "queued",
        progress: { percent: 0, stage: "queued" },
        summary: null,
        result: null,
        error: null,
        createdAt,
        updatedAt: createdAt,
      };
      await client.query(`INSERT INTO court_runs
        (id, case_id, strategy_version_id, data_snapshot_id, engine_version, reproducibility_id,
         profile, status, progress_json, summary, result_json, error_json, created_at, updated_at)
        VALUES ($1, $2, $3, NULL, $4, NULL, $5, $6, $7, NULL, NULL, NULL, $8, $8)`, [
        record.id,
        caseId,
        versionId,
        engineVersion,
        profile,
        record.status,
        encoded(record.progress),
        createdAt,
      ]);
      await client.query(
        "UPDATE court_cases SET status = 'running', updated_at = $1 WHERE id = $2 AND owner_user_id = $3",
        [createdAt, caseId, ownerUserId],
      );
      await this.insertAudit(client, {
        caseId,
        actor,
        actorUserId: ownerUserId,
        action: "court.queued",
        entityType: "court_run",
        entityId: record.id,
        after: record,
      });
      return record;
    });
  }

  async getRun(runId: string, ownerUserId: string): Promise<CourtRunRecord | null> {
    const result = await this.db.query(`SELECT run.* FROM court_runs AS run
      JOIN court_cases AS court_case ON court_case.id = run.case_id
      WHERE run.id = $1 AND court_case.owner_user_id = $2`, [runId, ownerUserId]);
    return result.rows[0] ? runFromRow(result.rows[0] as Row) : null;
  }

  async latestCompletedRun(caseId: string, ownerUserId: string, versionId?: string): Promise<CourtRunRecord | null> {
    const values = versionId ? [caseId, ownerUserId, versionId] : [caseId, ownerUserId];
    const result = await this.db.query(`SELECT run.* FROM court_runs AS run
      JOIN court_cases AS court_case ON court_case.id = run.case_id
      WHERE run.case_id = $1 AND court_case.owner_user_id = $2 AND run.status = 'completed'
      ${versionId ? "AND run.strategy_version_id = $3" : ""}
      ORDER BY run.created_at DESC LIMIT 1`, values);
    return result.rows[0] ? runFromRow(result.rows[0] as Row) : null;
  }

  async recoverInterruptedRuns(): Promise<number> {
    const result = await this.db.query(
      "SELECT id FROM court_runs WHERE status IN ('queued', 'running') ORDER BY created_at ASC",
    );
    for (const row of result.rows as Row[]) {
      await this.updateRunInternal(String(row.id), {
        status: "failed",
        progress: { percent: 100, stage: "interrupted" },
        error: { code: "server_restarted", message: "The API restarted before this Court run completed. Start a new run." },
      }, null);
    }
    return result.rowCount ?? 0;
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<CourtRunRecord, "status" | "progress" | "dataSnapshotId" | "reproducibilityId" | "summary" | "result" | "error">>,
    ownerUserId: string,
  ): Promise<CourtRunRecord> {
    return this.updateRunInternal(runId, patch, ownerUserId);
  }

  private async updateRunInternal(
    runId: string,
    patch: Partial<Pick<CourtRunRecord, "status" | "progress" | "dataSnapshotId" | "reproducibilityId" | "summary" | "result" | "error">>,
    ownerUserId: string | null,
  ): Promise<CourtRunRecord> {
    return this.transaction(async (client) => {
      const result = await client.query(`SELECT run.* FROM court_runs AS run
        JOIN court_cases AS court_case ON court_case.id = run.case_id
        WHERE run.id = $1 AND ($2::text IS NULL OR court_case.owner_user_id = $2)
        FOR UPDATE OF run`, [runId, ownerUserId]);
      if (!result.rows[0]) throw new Error(`Unknown run ${runId}`);
      const current = runFromRow(result.rows[0] as Row);
      const next: CourtRunRecord = { ...current, ...patch, updatedAt: now() };
      await client.query(`UPDATE court_runs SET status = $1, progress_json = $2, data_snapshot_id = $3,
        reproducibility_id = $4, summary = $5, result_json = $6, error_json = $7, updated_at = $8
        WHERE id = $9`, [
        next.status,
        encoded(next.progress),
        next.dataSnapshotId,
        next.reproducibilityId,
        next.summary,
        encodedOrNull(next.result),
        encodedOrNull(next.error),
        next.updatedAt,
        runId,
      ]);
      if (next.status === "completed" || next.status === "invalid" || next.status === "failed") {
        await client.query(`UPDATE court_cases SET status = $1,
          evaluation_locked = CASE WHEN $2::boolean THEN TRUE ELSE evaluation_locked END,
          updated_at = $3 WHERE id = $4`, [
          next.status === "completed" ? "evaluated" : next.status === "invalid" ? "invalid" : "confirmed",
          next.status === "completed",
          next.updatedAt,
          next.caseId,
        ]);
        await this.insertAudit(client, {
          caseId: next.caseId,
          actor: "system",
          action: next.status === "completed" ? "court.completed" : next.status === "invalid" ? "court.invalid" : "court.failed",
          entityType: "court_run",
          entityId: runId,
          before: current,
          after: next,
        });
      }
      return next;
    });
  }

  async saveSnapshot(snapshot: SnapshotRecord): Promise<SnapshotRecord> {
    const result = await this.db.query(`INSERT INTO market_snapshots
      (id, provider, adjustment, feed, date_from, date_to, symbols_json, fetched_at, hash, request_json, bars_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (hash) DO UPDATE SET hash = EXCLUDED.hash RETURNING *`, [
      snapshot.id,
      snapshot.provider,
      snapshot.adjustment,
      snapshot.feed,
      snapshot.dateFrom,
      snapshot.dateTo,
      encoded(snapshot.symbols),
      snapshot.fetchedAt,
      snapshot.hash,
      encoded(snapshot.request),
      encoded(snapshot.bars),
    ]);
    return snapshotFromRow(result.rows[0] as Row);
  }

  async getSnapshot(snapshotId: string): Promise<SnapshotRecord | null> {
    const result = await this.db.query("SELECT * FROM market_snapshots WHERE id = $1", [snapshotId]);
    return result.rows[0] ? snapshotFromRow(result.rows[0] as Row) : null;
  }

  async findSnapshot(symbols: string[], dateFrom: string, dateTo: string, provenance: Pick<SnapshotRecord, "provider" | "feed" | "adjustment">): Promise<SnapshotRecord | null> {
    const result = await this.db.query(
      "SELECT * FROM market_snapshots WHERE date_from <= $1 AND date_to >= $2 AND provider = $3 AND feed = $4 AND adjustment = $5 ORDER BY fetched_at DESC",
      [dateFrom, dateTo, provenance.provider, provenance.feed, provenance.adjustment],
    );
    const requested = [...symbols].sort().join(",");
    const row = (result.rows as Row[]).find(
      (candidate) => json<string[]>(candidate.symbols_json, []).sort().join(",") === requested,
    );
    return row ? snapshotFromRow(row) : null;
  }

  async createReplay(input: Omit<ReplayRecord, "id" | "cursor" | "status" | "state" | "createdAt" | "updatedAt"> & {
    id?: string;
    cursor?: number;
    state?: Record<string, unknown>;
  }, actor: Actor, ownerUserId: string): Promise<ReplayRecord> {
    return this.transaction(async (client) => {
      await this.requireOwnedCase(client, input.caseId, ownerUserId);
      const related = await client.query(`SELECT version.id FROM strategy_versions AS version
        JOIN court_runs AS run ON run.strategy_version_id = version.id AND run.case_id = version.case_id
        WHERE version.id = $1 AND run.id = $2 AND version.case_id = $3`, [
        input.strategyVersionId,
        input.runId,
        input.caseId,
      ]);
      if (!related.rowCount) throw new Error("Replay run and version must belong to this case");
      const createdAt = now();
      const record: ReplayRecord = {
        ...input,
        id: input.id ?? id(),
        cursor: input.cursor ?? -1,
        status: "active",
        state: input.state ?? {},
        createdAt,
        updatedAt: createdAt,
      };
      await client.query(`INSERT INTO replay_sessions
        (id, case_id, strategy_version_id, run_id, reserved_from, reserved_to, cursor, status, state_json, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`, [
        record.id,
        record.caseId,
        record.strategyVersionId,
        record.runId,
        record.reservedFrom,
        record.reservedTo,
        record.cursor,
        record.status,
        encoded(record.state),
        createdAt,
      ]);
      await this.insertAudit(client, {
        caseId: record.caseId,
        actor,
        actorUserId: ownerUserId,
        action: "replay.started",
        entityType: "replay",
        entityId: record.id,
        after: record,
      });
      return record;
    });
  }

  async getReplay(replayId: string, ownerUserId: string): Promise<ReplayRecord | null> {
    const result = await this.db.query(`SELECT replay.* FROM replay_sessions AS replay
      JOIN court_cases AS court_case ON court_case.id = replay.case_id
      WHERE replay.id = $1 AND court_case.owner_user_id = $2`, [replayId, ownerUserId]);
    return result.rows[0] ? replayFromRow(result.rows[0] as Row) : null;
  }

  async updateReplay(
    replayId: string,
    cursor: number,
    status: ReplayRecord["status"],
    state: Record<string, unknown>,
    actor: Actor,
    ownerUserId: string,
  ): Promise<ReplayRecord> {
    return this.transaction(async (client) => {
      const result = await client.query(`SELECT replay.* FROM replay_sessions AS replay
        JOIN court_cases AS court_case ON court_case.id = replay.case_id
        WHERE replay.id = $1 AND court_case.owner_user_id = $2 FOR UPDATE OF replay`, [replayId, ownerUserId]);
      if (!result.rows[0]) throw new Error(`Unknown replay ${replayId}`);
      const before = replayFromRow(result.rows[0] as Row);
      const updatedAt = now();
      const updated = { ...before, cursor, status, state, updatedAt };
      await client.query(`UPDATE replay_sessions SET cursor = $1, status = $2, state_json = $3, updated_at = $4
        WHERE id = $5`, [cursor, status, encoded(state), updatedAt, replayId]);
      await this.insertAudit(client, {
        caseId: before.caseId,
        actor,
        actorUserId: ownerUserId,
        action: "replay.advanced",
        entityType: "replay",
        entityId: replayId,
        before,
        after: updated,
      });
      return updated;
    });
  }

  async listIndicators(ownerUserId: string): Promise<IndicatorRecord[]> {
    const result = await this.db.query(
      "SELECT * FROM indicator_definitions WHERE owner_user_id = $1 ORDER BY name ASC",
      [ownerUserId],
    );
    return (result.rows as Row[]).map(indicatorFromRow);
  }

  async getIndicator(indicatorId: string, ownerUserId: string): Promise<IndicatorRecord | null> {
    const result = await this.db.query(
      "SELECT * FROM indicator_definitions WHERE id = $1 AND owner_user_id = $2",
      [indicatorId, ownerUserId],
    );
    return result.rows[0] ? indicatorFromRow(result.rows[0] as Row) : null;
  }

  async createIndicator(input: {
    name: string;
    description: string;
    formula: unknown;
    inputs: unknown;
    dependencies: string[];
    outputType: string;
    sharingState: string;
    creatorType?: string;
    metadata?: Record<string, unknown>;
  }, actor: Actor, ownerUserId: string): Promise<IndicatorRecord> {
    return this.transaction(async (client) => {
      const createdAt = now();
      const recordId = id();
      const record: IndicatorRecord = {
        id: recordId,
        name: input.name,
        version: 1,
        description: input.description,
        formula: input.formula,
        inputs: input.inputs,
        dependencies: input.dependencies,
        outputType: input.outputType,
        sharingState: input.sharingState,
        creatorType: input.creatorType ?? actor,
        metadata: input.metadata ?? {},
        lineageId: recordId,
        parentIndicatorId: null,
        createdAt,
      };
      await client.query(`INSERT INTO indicator_definitions
        (id, owner_user_id, name, version, description, formula_json, inputs_json, dependencies_json,
         output_type, sharing_state, creator_type, metadata_json, lineage_id, parent_indicator_id, created_at)
        VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, $13)`, [
        record.id,
        ownerUserId,
        record.name,
        record.description,
        encoded(record.formula),
        encoded(record.inputs),
        encoded(record.dependencies),
        record.outputType,
        record.sharingState,
        record.creatorType,
        encoded(record.metadata),
        record.lineageId,
        createdAt,
      ]);
      await this.insertAudit(client, {
        actor,
        actorUserId: ownerUserId,
        action: "indicator.created",
        entityType: "indicator",
        entityId: record.id,
        after: record,
      });
      return record;
    });
  }

  async listIndicatorVersions(indicatorId: string, ownerUserId: string): Promise<IndicatorRecord[] | null> {
    const current = await this.getIndicator(indicatorId, ownerUserId);
    if (!current) return null;
    const result = await this.db.query(`SELECT * FROM indicator_definitions
      WHERE owner_user_id = $1 AND (lineage_id = $2 OR id = $2)
      ORDER BY version ASC`, [ownerUserId, current.lineageId]);
    return (result.rows as Row[]).map(indicatorFromRow);
  }

  async createIndicatorVersion(input: {
    parentIndicatorId: string;
    name: string;
    description: string;
    formula: unknown;
    inputs: unknown;
    dependencies: string[];
    outputType: string;
    sharingState: string;
    metadata?: Record<string, unknown>;
  }, actor: Actor, ownerUserId: string): Promise<IndicatorRecord | null> {
    return this.transaction(async (client) => {
      const parentResult = await client.query(`SELECT * FROM indicator_definitions
        WHERE id = $1 AND owner_user_id = $2 FOR UPDATE`, [input.parentIndicatorId, ownerUserId]);
      if (!parentResult.rows[0]) return null;
      const parent = indicatorFromRow(parentResult.rows[0] as Row);
      const lineageId = parent.lineageId;
      const versionResult = await client.query(`SELECT COALESCE(MAX(version), 0) AS version
        FROM indicator_definitions WHERE owner_user_id = $1 AND (lineage_id = $2 OR id = $2)`, [ownerUserId, lineageId]);
      const createdAt = now();
      const record: IndicatorRecord = {
        id: id(),
        name: input.name,
        version: Number(versionResult.rows[0]?.version ?? 0) + 1,
        description: input.description,
        formula: input.formula,
        inputs: input.inputs,
        dependencies: input.dependencies,
        outputType: input.outputType,
        sharingState: input.sharingState,
        creatorType: actor,
        metadata: input.metadata ?? {},
        lineageId,
        parentIndicatorId: parent.id,
        createdAt,
      };
      await client.query(`INSERT INTO indicator_definitions
        (id, owner_user_id, name, version, description, formula_json, inputs_json, dependencies_json,
         output_type, sharing_state, creator_type, metadata_json, lineage_id, parent_indicator_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, [
        record.id,
        ownerUserId,
        record.name,
        record.version,
        record.description,
        encoded(record.formula),
        encoded(record.inputs),
        encoded(record.dependencies),
        record.outputType,
        record.sharingState,
        record.creatorType,
        encoded(record.metadata),
        record.lineageId,
        record.parentIndicatorId,
        createdAt,
      ]);
      await this.insertAudit(client, {
        actor,
        actorUserId: ownerUserId,
        action: "indicator.version_created",
        entityType: "indicator",
        entityId: record.id,
        before: parent,
        after: record,
      });
      return record;
    });
  }

  private async shareTarget(
    client: Queryable,
    entityType: ShareEntityType,
    entityId: string,
    ownerUserId: string,
  ): Promise<{ caseId: string | null } | null> {
    if (entityType === "report") {
      const result = await client.query(`SELECT run.case_id FROM court_runs AS run
        JOIN court_cases AS court_case ON court_case.id = run.case_id
        WHERE run.id = $1 AND court_case.owner_user_id = $2 AND run.status = 'completed'
        FOR UPDATE OF run`, [entityId, ownerUserId]);
      return result.rows[0] ? { caseId: String(result.rows[0].case_id) } : null;
    }
    const result = await client.query(`SELECT id FROM indicator_definitions
      WHERE id = $1 AND owner_user_id = $2 AND sharing_state = 'unlisted'
      FOR UPDATE`, [entityId, ownerUserId]);
    return result.rows[0] ? { caseId: null } : null;
  }

  async getShareStatus(
    entityType: ShareEntityType,
    entityId: string,
    ownerUserId: string,
  ): Promise<ShareTokenRecord | null | undefined> {
    if (!await this.shareTarget(this.db, entityType, entityId, ownerUserId)) return undefined;
    const result = await this.db.query(`SELECT * FROM share_tokens
      WHERE owner_user_id = $1 AND entity_type = $2 AND entity_id = $3
      ORDER BY created_at DESC LIMIT 1`, [ownerUserId, entityType, entityId]);
    return result.rows[0] ? shareFromRow(result.rows[0] as Row) : null;
  }

  async issueShareToken(
    entityType: ShareEntityType,
    entityId: string,
    ownerUserId: string,
    actor: Actor,
    rotate = false,
  ): Promise<
    | { status: "issued"; share: ShareTokenRecord; token: string }
    | { status: "not_found" | "already_shared" | "not_shared" }
  > {
    return this.transaction(async (client) => {
      const target = await this.shareTarget(client, entityType, entityId, ownerUserId);
      if (!target) return { status: "not_found" } as const;
      const currentResult = await client.query(`SELECT * FROM share_tokens
        WHERE owner_user_id = $1 AND entity_type = $2 AND entity_id = $3 AND revoked_at IS NULL
        FOR UPDATE`, [ownerUserId, entityType, entityId]);
      const current = currentResult.rows[0] ? shareFromRow(currentResult.rows[0] as Row) : null;
      if (current && !rotate) return { status: "already_shared" } as const;
      if (!current && rotate) return { status: "not_shared" } as const;
      const issuedAt = now();
      if (current) {
        await client.query("UPDATE share_tokens SET revoked_at = $1 WHERE id = $2", [issuedAt, current.id]);
      }
      const token = createOpaqueToken();
      const tokenHash = await hashShareToken(token);
      const share: ShareTokenRecord = {
        id: id(),
        ownerUserId,
        entityType,
        entityId,
        rotatedFromId: current?.id ?? null,
        createdAt: issuedAt,
        revokedAt: null,
      };
      await client.query(`INSERT INTO share_tokens
        (id, owner_user_id, entity_type, entity_id, token_hash, rotated_from_id, created_at, revoked_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`, [
        share.id,
        share.ownerUserId,
        share.entityType,
        share.entityId,
        tokenHash,
        share.rotatedFromId,
        share.createdAt,
      ]);
      await this.insertAudit(client, {
        caseId: target.caseId,
        actor,
        actorUserId: ownerUserId,
        action: current ? "share.rotated" : "share.created",
        entityType,
        entityId,
        before: current ? { state: "active", createdAt: current.createdAt } : null,
        after: { state: "active", createdAt: share.createdAt },
      });
      return { status: "issued", share, token } as const;
    });
  }

  async revokeShareToken(
    entityType: ShareEntityType,
    entityId: string,
    ownerUserId: string,
    actor: Actor,
  ): Promise<
    | { status: "revoked"; share: ShareTokenRecord }
    | { status: "not_found" | "not_shared" }
  > {
    return this.transaction(async (client) => {
      const target = await this.shareTarget(client, entityType, entityId, ownerUserId);
      if (!target) return { status: "not_found" } as const;
      const result = await client.query(`SELECT * FROM share_tokens
        WHERE owner_user_id = $1 AND entity_type = $2 AND entity_id = $3 AND revoked_at IS NULL
        FOR UPDATE`, [ownerUserId, entityType, entityId]);
      if (!result.rows[0]) return { status: "not_shared" } as const;
      const current = shareFromRow(result.rows[0] as Row);
      const revokedAt = now();
      await client.query("UPDATE share_tokens SET revoked_at = $1 WHERE id = $2", [revokedAt, current.id]);
      const revoked = { ...current, revokedAt };
      await this.insertAudit(client, {
        caseId: target.caseId,
        actor,
        actorUserId: ownerUserId,
        action: "share.revoked",
        entityType,
        entityId,
        before: { state: "active", createdAt: current.createdAt },
        after: { state: "revoked", createdAt: current.createdAt, revokedAt },
      });
      return { status: "revoked", share: revoked } as const;
    });
  }

  async resolveShareToken(token: string, entityType: ShareEntityType): Promise<ShareTokenRecord | null> {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const tokenHash = await hashShareToken(token);
    const targetGuard = entityType === "report"
      ? `EXISTS (
          SELECT 1 FROM court_runs AS run
          JOIN court_cases AS court_case ON court_case.id = run.case_id
          WHERE run.id = share.entity_id AND court_case.owner_user_id = share.owner_user_id AND run.status = 'completed'
        )`
      : `EXISTS (
          SELECT 1 FROM indicator_definitions AS indicator
          WHERE indicator.id = share.entity_id AND indicator.owner_user_id = share.owner_user_id
            AND indicator.sharing_state = 'unlisted'
        )`;
    const result = await this.db.query(`SELECT share.* FROM share_tokens AS share
      WHERE share.token_hash = $1 AND share.entity_type = $2 AND share.revoked_at IS NULL AND ${targetGuard}
      LIMIT 1`, [tokenHash, entityType]);
    return result.rows[0] ? shareFromRow(result.rows[0] as Row) : null;
  }
}
