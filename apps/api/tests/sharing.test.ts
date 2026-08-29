import { afterEach, describe, expect, test } from "bun:test";
import { SAMPLE_STRATEGY } from "@strategy-court/schemas";
import type { ApiApp, AuthSession } from "../src/app";
import { hashShareToken } from "../src/services/sharing";
import { createTestHarness, TEST_USER_ID, type TestDatabase } from "./test-database";

const harness = createTestHarness();

afterEach(() => harness.cleanup());

const strategy = { ...structuredClone(SAMPLE_STRATEGY), universe: ["AAPL"] as ["AAPL"] };

function courtResult() {
  return Promise.resolve({
    reproducibilityId: "sharing-reproducibility-id",
    summaryLabel: "Warning",
    result: {
      summaryLabel: "Warning",
      metrics: { initialCapital: 10_000, finalEquity: 10_100, netReturnPercent: 1, numberOfTrades: 1 },
      trades: [{ symbol: "AAPL", entryDate: "2024-03-04", exitDate: "2024-03-11", netProfit: 100 }],
      equityCurve: [{ date: "2024-01-02", equity: 10_000 }, { date: "2024-12-30", equity: 10_100 }],
      drawdownCurve: [{ date: "2024-03-11", drawdownPercent: -1 }],
      verdicts: [{ id: "risk_profile", category: "risk_profile", status: "Warning" }],
      failures: [{ id: "risk_profile", dateRange: { start: "2024-03-01", end: "2024-03-15" } }],
      assumptions: { signalTiming: "close", executionTiming: "next_open" },
      baseline: { diagnostics: { signalEvents: [{ symbol: "AAPL", date: "2024-03-01", signal: "entry" }] } },
      outOfSample: { metrics: { netReturnPercent: 0.4 }, diagnostics: { signalEvents: [{ symbol: "AAPL", date: "2024-09-03", signal: "exit" }] } },
      stressedCosts: { metrics: { netReturnPercent: 0.2 }, diagnostics: { signalEvents: [] } },
      parameterTrials: [{ label: "period 13", status: "Pass" }],
      dataWarnings: ["One session was omitted by the fixture."],
    },
  });
}

async function request(app: ApiApp, method: string, path: string, input?: unknown) {
  const response = await app.fetch(new Request(`http://api.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify(input),
  }));
  return { response, body: await response.json() as Record<string, any> };
}

async function download(app: ApiApp, path: string, accept?: string) {
  const response = await app.fetch(new Request(`http://api.test${path}`, {
    headers: accept ? { accept } : undefined,
  }));
  return { response, body: await response.text() };
}

async function completedReport(app: ApiApp) {
  const created = await request(app, "POST", "/api/cases", {
    name: "Shared Court case",
    description: "A complete read-only report.",
    symbols: ["AAPL"],
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    initialCapital: 10_000,
    costs: { commissionBpsPerSide: 1, slippageBpsPerSide: 5 },
  });
  const caseId = created.body.case.id as string;
  const draft = await request(app, "POST", `/api/cases/${caseId}/strategy-drafts`, {
    definition: strategy,
    interpretation: "Enter on the declared pullback and fill at the next open.",
  });
  const versionId = draft.body.version.id as string;
  await request(app, "POST", `/api/cases/${caseId}/strategy-versions/${versionId}/confirm`, {});
  const queued = await request(app, "POST", `/api/cases/${caseId}/court-runs`, {
    strategyVersionId: versionId,
    dataSnapshotPolicy: "frozen",
  });
  await app.queue.idle();
  return { caseId, runId: queued.body.run.id as string };
}

async function otherUserApp(database: TestDatabase) {
  const session: AuthSession = { user: { id: "other-user", email: "other@example.test", name: "Other trader" } };
  await database.pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, TRUE, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
    [session.user.id, session.user.name, session.user.email],
  );
  return harness.app({ courtExecutor: courtResult, resolveSession: async () => session }, database);
}

describe("read-only sharing lifecycle", () => {
  test("keeps report tokens secret, isolates management, and supports rotation and revocation", async () => {
    const database = await harness.createDatabase();
    const owner = await harness.app({ courtExecutor: courtResult }, database);
    const { caseId, runId } = await completedReport(owner);
    const created = await request(owner, "POST", `/api/reports/${runId}/share`);
    expect(created.response.status).toBe(201);
    const token = created.body.share.token as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const persisted = await database.pool.query<{ token_hash: string }>("SELECT token_hash FROM share_tokens WHERE entity_id = $1", [runId]);
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]?.token_hash).not.toBe(token);
    expect(JSON.stringify(persisted.rows)).not.toContain(token);

    const anonymous = await harness.app({ courtExecutor: courtResult, resolveSession: async () => null }, database);
    const shared = await request(anonymous, "GET", `/api/shared/reports/${token}`);
    expect(shared.response.status).toBe(200);
    expect(shared.body.report).toEqual(expect.objectContaining({
      schemaVersion: 1,
      kind: "strategy_court_report",
      strategyDefinition: expect.any(Object),
      verdicts: expect.any(Array),
      assumptions: expect.any(Object),
      diagnostics: expect.objectContaining({
        baseline: expect.objectContaining({ signalEvents: expect.any(Array) }),
        outOfSample: expect.objectContaining({ signalEvents: expect.any(Array) }),
        stressedCosts: expect.objectContaining({ signalEvents: expect.any(Array) }),
      }),
      parameterTrials: expect.any(Array),
      dataWarnings: expect.any(Array),
      outOfSample: expect.any(Object),
      stressedCosts: expect.any(Object),
      trades: expect.any(Array),
      versionHistory: expect.any(Array),
      dataMetadata: expect.objectContaining({ provider: expect.any(String), fetchedAt: expect.any(String), barCount: expect.any(Number) }),
      engineVersion: expect.any(String),
      humanReadable: expect.objectContaining({ title: "Shared Court case", strategy: expect.any(String), verdicts: expect.any(Array) }),
      limitation: expect.stringContaining("do not predict"),
    }));
    expect(shared.body.report.id).toBeUndefined();
    expect(shared.body.report.case.id).toBeUndefined();
    const ownerReport = await request(owner, "GET", `/api/reports/${caseId}`);
    expect(ownerReport.body.report).toMatchObject({ id: runId, run: { id: runId, caseId } });
    const ownerExport = await request(owner, "GET", `/api/reports/${caseId}/export`);
    expect(ownerExport.response.headers.get("content-disposition")).toContain("strategy-court-report.json");
    expect(ownerExport.body).toMatchObject({ kind: "strategy_court_report", id: runId });
    expect(ownerExport.body.report).toBeUndefined();
    const ownerCsv = await download(owner, `/api/reports/${caseId}/export?format=csv`);
    expect(ownerCsv.response.headers.get("content-type")).toContain("text/csv");
    expect(ownerCsv.response.headers.get("content-disposition")).toContain("strategy-court-report-trades.csv");
    expect(ownerCsv.body).toContain("record_type,report_id,report_name,summary");
    expect(ownerCsv.body).toContain(`trade,${runId},Shared Court case,Warning`);
    expect(ownerCsv.body).toContain("AAPL");

    const publicCsv = await download(anonymous, `/api/shared/reports/${token}/export`, "text/csv");
    expect(publicCsv.response.status).toBe(200);
    expect(publicCsv.response.headers.get("content-type")).toContain("text/csv");
    expect(publicCsv.body).toContain("Shared Court case");
    expect(publicCsv.body).not.toContain(runId);

    const invalidFormat = await request(owner, "GET", `/api/reports/${caseId}/export?format=xlsx`);
    expect(invalidFormat.response.status).toBe(422);
    expect(invalidFormat.body.error).toMatchObject({ code: "validation_error", details: { field: "format", allowed: ["json", "csv"] } });

    const directId = await request(anonymous, "GET", `/api/shared/reports/${runId}`);
    const invalid = await request(anonymous, "GET", "/api/shared/reports/not-a-token");
    expect(directId.response.status).toBe(404);
    expect(directId.body).toEqual(invalid.body);

    const other = await otherUserApp(database);
    expect((await request(other, "GET", `/api/reports/${runId}/share`)).response.status).toBe(404);
    expect((await request(other, "GET", `/api/cases/${caseId}`)).response.status).toBe(404);

    const rotated = await request(owner, "POST", `/api/reports/${runId}/share/rotate`);
    expect(rotated.response.status).toBe(201);
    const rotatedToken = rotated.body.share.token as string;
    expect(rotatedToken).not.toBe(token);
    expect((await request(anonymous, "GET", `/api/shared/reports/${token}`)).response.status).toBe(404);
    expect((await request(anonymous, "GET", `/api/shared/reports/${rotatedToken}`)).response.status).toBe(200);

    const revoked = await request(owner, "POST", `/api/reports/${runId}/share/revoke`);
    expect(revoked.body.share).toMatchObject({ state: "revoked", revokedAt: expect.any(String) });
    expect(revoked.body.share.token).toBeUndefined();
    const revokedRead = await request(anonymous, "GET", `/api/shared/reports/${rotatedToken}`);
    expect(revokedRead.response.status).toBe(404);
    expect(revokedRead.body).toEqual(invalid.body);
  });

  test("exports a complete indicator manifest and imports a validated private copy", async () => {
    const database = await harness.createDatabase();
    const owner = await harness.app({ courtExecutor: courtResult }, database);
    const definition = {
      name: "Shared RSI threshold",
      description: "Returns true when RSI is below the declared threshold.",
      inputs: [{ name: "threshold", type: "number", default: 30, min: 0, max: 100 }],
      dependencies: ["rsi"],
      outputType: "boolean",
      sharingState: "unlisted",
      formula: {
        left: { indicator: "rsi", parameters: { period: 14, source: "close" } },
        operator: "lt",
        right: { input: "threshold" },
      },
    };
    const created = await request(owner, "POST", "/api/indicators", definition);
    const firstIndicatorId = created.body.indicator.id as string;
    const revisedInputs = [{ name: "threshold", type: "number", default: 25, min: 0, max: 100 }];
    const revised = await request(owner, "POST", `/api/indicators/${firstIndicatorId}/versions`, { inputs: revisedInputs });
    expect(revised.response.status).toBe(201);
    expect(revised.body.indicator).toMatchObject({ version: 2, parentIndicatorId: firstIndicatorId, inputs: revisedInputs });
    const indicatorId = revised.body.indicator.id as string;
    const versions = await request(owner, "GET", `/api/indicators/${indicatorId}/versions`);
    expect(versions.body.versions.map((item: Record<string, any>) => ({ version: item.version, default: item.inputs[0].default }))).toEqual([
      { version: 1, default: 30 },
      { version: 2, default: 25 },
    ]);
    const issued = await request(owner, "POST", `/api/indicators/${indicatorId}/share`);
    const token = issued.body.share.token as string;

    const anonymous = await harness.app({ courtExecutor: courtResult, resolveSession: async () => null }, database);
    const shared = await request(anonymous, "GET", `/api/shared/indicators/${token}`);
    expect(shared.body.indicator).toMatchObject({
      schemaVersion: 1,
      kind: "strategy_court_indicator",
      key: "root",
      name: definition.name,
      creatorType: "user",
      createdAt: expect.any(String),
      version: 2,
      inputs: revisedInputs,
      formula: definition.formula,
      sharingState: "unlisted",
    });
    expect(shared.body.indicator.id).toBeUndefined();
    const exported = await request(anonymous, "GET", `/api/shared/indicators/${token}/export`);
    expect(exported.response.headers.get("content-disposition")).toContain("strategy-court-indicator.json");
    expect(exported.body).toMatchObject({ kind: "strategy_court_indicator", key: "root" });
    expect(exported.body.indicator).toBeUndefined();
    const publicCsv = await download(anonymous, `/api/shared/indicators/${token}/export?format=csv`);
    expect(publicCsv.response.headers.get("content-type")).toContain("text/csv");
    expect(publicCsv.response.headers.get("content-disposition")).toContain("strategy-court-indicator.csv");
    expect(publicCsv.body).toContain("record_type,indicator_id,indicator_key,indicator_name");
    expect(publicCsv.body).toContain("Shared RSI threshold");
    expect(publicCsv.body).toContain("formula");
    expect(publicCsv.body).not.toContain(indicatorId);

    const ownerCsv = await download(owner, `/api/indicators/${indicatorId}/export?format=csv`);
    expect(ownerCsv.response.status).toBe(200);
    expect(ownerCsv.body).toContain(indicatorId);
    expect(ownerCsv.body).toContain("threshold");

    const unauthenticatedImport = await request(anonymous, "POST", `/api/shared/indicators/${token}/import`);
    expect(unauthenticatedImport.response.status).toBe(401);
    const other = await otherUserApp(database);
    const imported = await request(other, "POST", `/api/shared/indicators/${token}/import`);
    expect(imported.response.status).toBe(201);
    expect(imported.body.indicator).toMatchObject({
      name: definition.name,
      version: 1,
      sharingState: "private",
      creatorType: "imported",
      formula: definition.formula,
      metadata: { importedFrom: { manifestVersion: 1, indicatorVersion: 2, creatorType: "user" } },
    });
    expect(imported.body.indicator.id).not.toBe(indicatorId);
    expect(await owner.store.getIndicator(imported.body.indicator.id, TEST_USER_ID)).toBeNull();
    expect((await request(anonymous, "GET", `/api/shared/indicators/${indicatorId}`)).body.error.code).toBe("shared_resource_not_found");

    const privateIndicator = await request(owner, "POST", "/api/indicators", { ...definition, name: "Private threshold", sharingState: "private" });
    expect((await request(owner, "POST", `/api/indicators/${privateIndicator.body.indicator.id}/share`)).response.status).toBe(404);
    const privateToken = "a".repeat(64);
    await database.pool.query(`INSERT INTO share_tokens
      (id, owner_user_id, entity_type, entity_id, token_hash, created_at)
      VALUES ($1, $2, 'indicator', $3, $4, NOW())`, [
      crypto.randomUUID(),
      TEST_USER_ID,
      privateIndicator.body.indicator.id,
      await hashShareToken(privateToken),
    ]);
    const privateRead = await request(anonymous, "GET", `/api/shared/indicators/${privateToken}`);
    const invalidRead = await request(anonymous, "GET", "/api/shared/indicators/not-a-token");
    expect(privateRead.response.status).toBe(404);
    expect(privateRead.body).toEqual(invalidRead.body);
  });
});
