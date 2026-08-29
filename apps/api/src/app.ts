import {
  CURATED_UNIVERSE,
  safeParseStrategyDefinition,
  safeParseVariantRequests,
  EXECUTABLE_INDICATOR_IDS,
  type ExecutableIndicatorId,
  type StrategyDefinition,
} from "@strategy-court/schemas";
import {
  ENGINE_VERSION as DOMAIN_ENGINE_VERSION,
  advanceReplay as advanceDomainReplay,
  applyStrategyPatch,
  createReplaySession,
  calculateIndicator,
  diffStrategies,
  getReplayStatus,
} from "@strategy-court/domain";
import type { BacktestMetrics, ReplayAdvanceMode, ReplaySession, ReplayStatus } from "@strategy-court/schemas";
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { createAuth, type StrategyCourtAuth } from "./auth";
import { ApiError, errorResponse, requireObject } from "./errors";
import { waitForDatabase } from "./database-readiness";
import { SequentialQueue } from "./jobs/sequential-queue";
import { selectMarketProvider, snapshotForDomain, type MarketProvider } from "./providers/market";
import { BUILT_IN_INDICATORS } from "./services/catalog";
import { executeCourt, type CourtExecutionInput } from "./services/court";
import { validateIndicatorDefinition } from "./services/indicator";
import { resolveCustomIndicatorsInStrategy } from "./services/indicator-runtime";
import { latestMonitoringEvaluation, refreshLatestBarMonitoring } from "./services/monitoring";
import { buildIndicatorManifest, buildReportManifest, shareResponse } from "./services/sharing";
import { indicatorDefinitionCsv, reportTradesCsv } from "./services/csv";
import { Store } from "./store";
import type { Actor, CourtRunRecord, ReplayRecord, StrategyVersionRecord } from "./types";

const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

export interface AppOptions {
  databaseUrl?: string;
  pool?: Pool;
  marketProvider?: MarketProvider;
  courtExecutor?: (input: CourtExecutionInput) => ReturnType<typeof executeCourt>;
  allowedOrigins?: string[];
  resolveSession?: (request: Request) => Promise<AuthSession | null>;
  migrate?: boolean;
}

export interface AuthSession {
  user: { id: string; email: string; name: string };
  session?: Record<string, unknown>;
}

export interface ApiApp {
  fetch(request: Request): Promise<Response>;
  store: Store;
  queue: SequentialQueue;
  auth: StrategyCourtAuth;
  close(): Promise<void>;
}

function actorFrom(request: Request): Actor {
  const actor = request.headers.get("x-actor")?.toLowerCase();
  return actor === "agent" ? "agent" : "user";
}

function corsHeaders(request: Request, allowedOrigins: string[]): Headers {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "access-control-allow-headers": "content-type, x-actor",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-expose-headers": "content-disposition",
    "access-control-max-age": "86400",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  if (origin && allowedOrigins.includes(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(value: unknown, status: number, headers: Headers): Response {
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { status, headers });
}

function databaseUnavailable(headers: Headers): Response {
  headers.set("retry-after", "5");
  return json({
    code: "AUTH_SERVICE_UNAVAILABLE",
    message: "The account service is warming up. Try again in a moment.",
  }, 503, headers);
}

function jsonDownload(value: unknown, filename: string, headers: Headers): Response {
  headers.set("content-disposition", `attachment; filename="${filename}"`);
  return json(value, 200, headers);
}

function csvDownload(value: string, filename: string, headers: Headers): Response {
  headers.set("content-disposition", `attachment; filename="${filename}"`);
  headers.set("content-type", "text/csv; charset=utf-8");
  return new Response(value, { status: 200, headers });
}

function exportFormat(request: Request, url: URL): "json" | "csv" {
  const requested = url.searchParams.get("format")?.toLowerCase();
  if (requested !== undefined && requested !== "json" && requested !== "csv") {
    throw new ApiError(422, "validation_error", "Export format must be json or csv", {
      field: "format",
      allowed: ["json", "csv"],
    });
  }
  if (requested) return requested;
  return request.headers.get("accept")?.toLowerCase().includes("text/csv") ? "csv" : "json";
}

function responseWithCors(response: Response, cors: Headers): Response {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1_000_000) throw new ApiError(413, "request_too_large", "JSON requests are limited to 1 MB");
  try {
    return requireObject(await request.json());
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON");
  }
}

function string(value: unknown, field: string, fallback?: string): string {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(422, "validation_error", `${field} must be a non-empty string`, { field });
  }
  return value.trim();
}

function number(value: unknown, field: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ApiError(422, "validation_error", `${field} must be between ${min} and ${max}`, { field, min, max });
  }
  return parsed;
}

function date(value: unknown, field: string): string {
  const parsed = string(value, field);
  const instant = /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? new Date(`${parsed}T00:00:00.000Z`) : null;
  if (!instant || Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== parsed) {
    throw new ApiError(422, "validation_error", `${field} must use YYYY-MM-DD`, { field });
  }
  return parsed;
}

function safeRunError(error: unknown): Record<string, unknown> {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  return { status: 500, code: "court_run_failed", message: "Court execution failed" };
}

function invalidCourtReason(error: unknown): Record<string, unknown> | null {
  if (error instanceof RangeError) {
    return { code: "invalid_simulation", message: error.message };
  }
  if (!(error instanceof ApiError)) return null;
  const documentedInvalid = [
    "invalid_strategy",
    "invalid_indicator",
    "invalid_custom_indicator",
    "market_",
    "fixture_",
    "snapshot_",
    "look_ahead",
  ].some((prefix) => error.code.startsWith(prefix));
  if (!documentedInvalid) return null;
  return {
    code: error.code,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

async function requireCase(store: Store, caseId: string, ownerUserId: string) {
  const courtCase = await store.getCase(caseId, ownerUserId);
  if (!courtCase) throw new ApiError(404, "case_not_found", "Court case not found", { caseId });
  return courtCase;
}

async function requireVersion(store: Store, caseId: string, versionId: string, ownerUserId: string) {
  const version = await store.getVersion(versionId, ownerUserId);
  if (!version || version.caseId !== caseId) {
    throw new ApiError(404, "strategy_version_not_found", "Strategy version not found", { caseId, versionId });
  }
  return version;
}

async function requireRun(store: Store, runId: string, ownerUserId: string): Promise<CourtRunRecord> {
  const run = await store.getRun(runId, ownerUserId);
  if (!run) throw new ApiError(404, "court_run_not_found", "Court run not found", { runId });
  return run;
}

async function requireReplay(store: Store, replayId: string, ownerUserId: string): Promise<ReplayRecord> {
  const replay = await store.getReplay(replayId, ownerUserId);
  if (!replay) throw new ApiError(404, "replay_not_found", "Replay session not found", { replayId });
  return replay;
}

async function parseStrategy(value: unknown): Promise<StrategyDefinition> {
  const definition = requireObject(value, "definition must be a strategy object");
  const result = safeParseStrategyDefinition(definition);
  if (!result.success) throw new ApiError(422, "invalid_strategy", "The strategy definition is invalid", { issues: result.issues });
  return result.data;
}

function sharedResourceNotFound(): ApiError {
  return new ApiError(404, "shared_resource_not_found", "Shared resource not found");
}

function remapImportedFormula(value: unknown, ids: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapImportedFormula(item, ids));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = key === "indicator" && typeof item === "string" ? ids.get(item) ?? item : remapImportedFormula(item, ids);
  }
  return result;
}

async function importIndicatorManifest(
  manifest: Record<string, unknown>,
  store: Store,
  ownerUserId: string,
  actor: Actor,
) {
  if (manifest.kind !== "strategy_court_indicator" || manifest.schemaVersion !== 1) throw sharedResourceNotFound();
  const definitions = Array.isArray(manifest.dependencyDefinitions)
    ? [...manifest.dependencyDefinitions, manifest]
    : [manifest];
  const importedIds = new Map<string, string>();
  let importedRoot = null;
  for (const value of definitions) {
    const definition = requireObject(value, "Shared indicator definition is invalid");
    const key = string(definition.key, "key");
    const dependencies = Array.isArray(definition.dependencies)
      ? definition.dependencies.map((dependency) => importedIds.get(String(dependency)) ?? String(dependency))
      : [];
    const candidate: Record<string, unknown> = {
      name: string(definition.name, "name"),
      description: string(definition.description, "description"),
      inputs: definition.inputs,
      dependencies,
      outputType: definition.outputType,
      sharingState: "private",
      formula: remapImportedFormula(definition.formula, importedIds),
    };
    const validated = await validateIndicatorDefinition(candidate, store, ownerUserId);
    const indicator = await store.createIndicator({
      name: candidate.name as string,
      description: candidate.description as string,
      formula: candidate.formula,
      inputs: validated.inputs,
      dependencies: validated.dependencies,
      outputType: validated.outputType,
      sharingState: "private",
      creatorType: "imported",
      metadata: {
        importedFrom: {
          manifestVersion: manifest.schemaVersion,
          indicatorVersion: definition.version,
          creatorType: definition.creatorType,
        },
      },
    }, actor, ownerUserId);
    importedIds.set(key, indicator.id);
    if (key === "root") importedRoot = indicator;
  }
  if (!importedRoot) throw sharedResourceNotFound();
  return importedRoot;
}

function caseInput(value: Record<string, unknown>) {
  const range = value.dateRange && typeof value.dateRange === "object" ? value.dateRange as Record<string, unknown> : {};
  const costs = value.costs && typeof value.costs === "object" ? value.costs as Record<string, unknown> : {};
  const symbols = value.symbols;
  if (!Array.isArray(symbols) || symbols.length < 1 || symbols.length > 5) {
    throw new ApiError(422, "validation_error", "symbols must contain one to five curated instruments", { field: "symbols" });
  }
  const normalizedSymbols = [...new Set(symbols.map((item) => String(item).toUpperCase()))];
  if (normalizedSymbols.length !== symbols.length || normalizedSymbols.some((symbol) => !CURATED_UNIVERSE.includes(symbol as never))) {
    throw new ApiError(422, "validation_error", "symbols contains duplicates or unsupported instruments", { field: "symbols", allowed: CURATED_UNIVERSE });
  }
  const dateFrom = date(value.dateFrom ?? value.startDate ?? range.from ?? range.start, "dateFrom");
  const dateTo = date(value.dateTo ?? value.endDate ?? range.to ?? range.end, "dateTo");
  if (dateFrom >= dateTo) throw new ApiError(422, "validation_error", "dateFrom must be earlier than dateTo");
  const today = new Date().toISOString().slice(0, 10);
  if (dateTo > today) throw new ApiError(422, "validation_error", "dateTo cannot be in the future", { field: "dateTo", maximum: today });
  return {
    name: string(value.name, "name"),
    description: typeof value.description === "string" ? value.description.trim() : "",
    symbols: normalizedSymbols,
    dateFrom,
    dateTo,
    initialCapital: number(value.initialCapital ?? value.capital, "initialCapital", 10_000, 100, 10_000_000),
    commissionBps: number(value.commissionBps ?? costs.commissionBpsPerSide, "commissionBps", 0, 0, 1_000),
    slippageBps: number(value.slippageBps ?? costs.slippageBpsPerSide, "slippageBps", 5, 0, 1_000),
    selectedProfile: value.courtProfile === undefined || value.courtProfile === "balanced"
      ? "balanced"
      : (() => { throw new ApiError(422, "validation_error", "Only the balanced Court profile is available"); })(),
  };
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function holdoutEnd(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  const latestCompleted = new Date();
  latestCompleted.setUTCDate(latestCompleted.getUTCDate() - 1);
  const maximum = latestCompleted.toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10) < maximum ? date.toISOString().slice(0, 10) : maximum;
}

async function replayState(store: Store, replay: ReplayRecord, ownerUserId: string): Promise<Record<string, unknown>> {
  const context = await replayDomainContext(store, replay, ownerUserId);
  const session = replay.state.session as unknown as ReplaySession;
  const status = replay.state.monitoring
    ? replay.state.monitoring as unknown as ReplayStatus
    : getReplayStatus(session, { strategy: context.strategy, snapshot: context.snapshot });
  return monitoringFromReplay(status);
}

async function replayDomainContext(store: Store, replay: ReplayRecord, ownerUserId: string) {
  const run = await requireRun(store, replay.runId, ownerUserId);
  const version = await requireVersion(store, replay.caseId, replay.strategyVersionId, ownerUserId);
  const replaySnapshotId = typeof replay.state.dataSnapshotId === "string" ? replay.state.dataSnapshotId : run.dataSnapshotId;
  const snapshot = replaySnapshotId ? await store.getSnapshot(replaySnapshotId) : null;
  if (!snapshot) throw new ApiError(409, "snapshot_not_found", "Replay data snapshot is unavailable");
  return {
    run,
    strategy: version.definition as unknown as StrategyDefinition,
    snapshot: snapshotForDomain(snapshot),
  };
}

function monitoringFromReplay(status: ReplayStatus): Record<string, unknown> {
  return {
    cursor: status.session.cursor,
    currentDate: status.currentDate,
    latestEvaluatedBar: status.currentDate,
    totalBars: status.session.dates.length,
    metrics: status.result?.metrics ?? status.session.baselineMetrics,
    baselineMetrics: status.session.baselineMetrics,
    baselineTradingDays: Math.max(1, status.session.baselineTradingDays ?? 1),
    observedTradingDays: Math.max(0, status.session.cursor + 1),
    positions: status.result?.openPositions ?? [],
    signals: status.signals,
    trades: status.result?.trades ?? [],
    newTrades: status.newTrades,
    warnings: [...status.warnings, "Historical replay is probation evidence, not a prediction."],
    currentRegime: status.currentRegime,
    status: status.session.status,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function inspectFailure(store: Store, run: CourtRunRecord, failureValue: unknown, ownerUserId: string): Promise<Record<string, unknown>> {
  const failure = asObject(failureValue);
  const result = run.result ?? {};
  const baseline = asObject(result.baseline);
  const outOfSample = asObject(result.outOfSample);
  const version = await requireVersion(store, run.caseId, run.strategyVersionId, ownerUserId);
  const courtCase = await requireCase(store, run.caseId, ownerUserId);
  const period = asObject(failure.dateRange);
  const failureCategory = String(failure.category ?? failure.id ?? "");
  const baselineDerived = ["regime_stability", "profit_concentration", "risk_profile"].includes(failureCategory);
  const fallbackPeriod = baselineDerived
    ? asObject(baseline.dateRange)
    : asObject(outOfSample.dateRange ?? baseline.dateRange);
  const start = String(period.start ?? period.from ?? fallbackPeriod.start ?? courtCase.dateFrom);
  const end = String(period.end ?? period.to ?? fallbackPeriod.end ?? courtCase.dateTo);
  const allTrades = Array.isArray(result.trades) ? result.trades : Array.isArray(baseline.trades) ? baseline.trades : [];
  const trades = allTrades.filter((trade) => {
    const item = asObject(trade);
    const entry = String(item.entryDate ?? "");
    const exit = String(item.exitDate ?? entry);
    return exit >= start && entry <= end;
  });
  const regimeCounts: Record<string, { trades: number; netProfit: number }> = {};
  for (const trade of trades) {
    const item = asObject(trade);
    const regime = String(item.marketRegime ?? "unknown");
    const group = regimeCounts[regime] ??= { trades: 0, netProfit: 0 };
    group.trades += 1;
    group.netProfit += Number(item.netProfit ?? 0);
  }
  const allEquity = Array.isArray(result.equityCurve) ? result.equityCurve : Array.isArray(baseline.equityCurve) ? baseline.equityCurve : [];
  const equityCurve = allEquity.filter((point) => {
    const pointDate = String(asObject(point).date ?? "");
    return pointDate >= start && pointDate <= end;
  });
  const firstEquity = Number(asObject(equityCurve[0]).equity ?? 0);
  const lastEquity = Number(asObject(equityCurve.at(-1)).equity ?? firstEquity);
  const indicatorInputs: unknown[] = [];
  const collectIndicators = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(collectIndicators);
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (typeof node.indicator === "string") indicatorInputs.push({ indicator: node.indicator, parameters: node.parameters ?? {} });
    Object.values(node).forEach(collectIndicators);
  };
  collectIndicators(version.definition.entry);
  collectIndicators(version.definition.exit);
  const snapshot = run.dataSnapshotId ? await store.getSnapshot(run.dataSnapshotId) : null;
  const marketBars = (snapshot?.bars ?? [])
    .filter((bar) => bar.timestamp >= start && bar.timestamp <= end)
    .slice(0, 250);
  const indicatorValues: unknown[] = [];
  const uniqueIndicators = [...new Map(indicatorInputs.map((item) => [JSON.stringify(item), item as Record<string, unknown>])).values()];
  for (const symbol of courtCase.symbols) {
    const bars = (snapshot?.bars ?? []).filter((bar) => bar.symbol === symbol).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    for (const definition of uniqueIndicators) {
      const indicator = String(definition.indicator);
      const parameters = asObject(definition.parameters);
      if (!EXECUTABLE_INDICATOR_IDS.includes(indicator as ExecutableIndicatorId)) continue;
      const series = calculateIndicator(indicator as ExecutableIndicatorId, parameters, bars.map((bar) => ({
        date: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      })));
      indicatorValues.push({
        symbol,
        indicator,
        parameters,
        values: bars.map((bar, index) => ({ date: bar.timestamp, value: series[index] ?? null }))
          .filter((point) => point.date >= start && point.date <= end),
      });
    }
  }
  const costs = asObject(version.definition.costs);
  return {
    ...failure,
    id: failure.id,
    runId: run.id,
    period: { start, end },
    dateRange: { start, end },
    symbols: [...new Set(trades.map((trade) => String(asObject(trade).symbol ?? "")).filter(Boolean))],
    trades,
    regime: { breakdown: regimeCounts, evidence: failure.evidence ?? null },
    equity: { curve: equityCurve, start: firstEquity, end: lastEquity, change: lastEquity - firstEquity },
    indicatorEvidence: { inputs: indicatorInputs, values: indicatorValues, marketBars },
    costs: {
      commissionBpsPerSide: costs.commissionBpsPerSide ?? courtCase.commissionBps,
      slippageBpsPerSide: costs.slippageBpsPerSide ?? courtCase.slippageBps,
      estimatedPeriodCosts: trades.reduce((sum, trade) => sum + Number(asObject(trade).costs ?? 0), 0),
    },
    explanationInputs: failure.evidence ?? failure.explanationInputs ?? null,
    assumptions: result.assumptions ?? null,
  };
}

export async function createApp(options: AppOptions = {}): Promise<ApiApp> {
  const allowedOrigins = options.allowedOrigins ?? (process.env.CORS_ORIGINS?.split(",").map((item) => item.trim()).filter(Boolean) || DEFAULT_ORIGINS);
  const ownsPool = !options.pool;
  const pool = options.pool ?? new Pool({
    connectionString: options.databaseUrl ?? process.env.DATABASE_URL ?? "postgresql://strategy_court:strategy_court@localhost/strategy_court",
    connectionTimeoutMillis: 5_000,
  });
  if (ownsPool) {
    pool.on("error", (error) => console.error("Strategy Court database pool lost an idle connection", error));
  }
  const auth = createAuth(pool, { trustedOrigins: allowedOrigins });
  if (options.migrate !== false) {
    await waitForDatabase(pool);
    const authMigrations = await getMigrations(auth.options);
    await authMigrations.runMigrations();
  }
  const store = new Store(pool);
  if (options.migrate !== false) await store.migrate();
  const recoveredJobs = await store.recoverInterruptedRuns();
  const queue = new SequentialQueue();
  const courtExecutor = options.courtExecutor ?? executeCourt;

  const queueRun = (run: CourtRunRecord, policy: string, ownerUserId: string, providerOverride?: MarketProvider): void => {
    queue.enqueue(async () => {
      try {
        await store.updateRun(run.id, { status: "running", progress: { percent: 10, stage: "market_data" } }, ownerUserId);
        const courtCase = await requireCase(store, run.caseId, ownerUserId);
        const version = await requireVersion(store, run.caseId, run.strategyVersionId, ownerUserId);
        const marketRequest = {
          symbols: [...new Set([...courtCase.symbols, "SPY"])],
          dateFrom: courtCase.dateFrom,
          dateTo: courtCase.dateTo,
        };
        const cached = policy === "prefer_cache" ? await store.findSnapshot(marketRequest.symbols, marketRequest.dateFrom, marketRequest.dateTo) : null;
        const providerPolicy = policy === "prefer_cache" ? "refresh" : policy;
        const provider = providerOverride ?? options.marketProvider ?? selectMarketProvider(providerPolicy);
        const snapshot = cached ?? await store.saveSnapshot(await provider.getSnapshot(marketRequest));
        await store.updateRun(run.id, { dataSnapshotId: snapshot.id, progress: { percent: 35, stage: "baseline" } }, ownerUserId);
        const execution = await courtExecutor({
          courtCase,
          strategyVersionId: version.id,
          strategy: version.definition as unknown as StrategyDefinition,
          snapshot,
          profile: run.profile,
          engineVersion: run.engineVersion,
        });
        await store.updateRun(run.id, {
          status: "completed",
          progress: { percent: 100, stage: "completed" },
          reproducibilityId: execution.reproducibilityId,
          summary: execution.summaryLabel,
          result: execution.result,
        }, ownerUserId);
      } catch (error) {
        const invalidReason = invalidCourtReason(error);
        if (invalidReason) {
          await store.updateRun(run.id, {
            status: "invalid",
            progress: { percent: 100, stage: "invalid" },
            summary: "Invalid",
            result: {
              summaryLabel: "Invalid",
              invalidReason,
              verdicts: [],
              failures: [{ id: "invalid", category: "invalid", status: "Fail", finding: invalidReason.message }],
              dataWarnings: [String(invalidReason.message)],
              limitation: "No historical result was produced because the strategy, data, or execution model could not be evaluated safely.",
              engineVersion: run.engineVersion,
            },
            error: null,
          }, ownerUserId);
        } else {
          await store.updateRun(run.id, {
            status: "failed",
            progress: { percent: 100, stage: "failed" },
            error: safeRunError(error),
          }, ownerUserId);
        }
      }
    });
  };

  const fetch = async (request: Request): Promise<Response> => {
    const headers = corsHeaders(request, allowedOrigins);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const actor = actorFrom(request);

    try {
      if (path.startsWith("/api/auth")) {
        try {
          await waitForDatabase(pool);
        } catch (error) {
          console.error("Strategy Court auth database is unavailable", error);
          return databaseUnavailable(headers);
        }
        return responseWithCors(await auth.handler(request), headers);
      }

      if (request.method === "GET" && path === "/api/health") {
        try {
          await waitForDatabase(pool, []);
        } catch {
          return databaseUnavailable(headers);
        }
        return json({ status: "ok", queueDepth: queue.size, recoveredJobs, engineVersion: DOMAIN_ENGINE_VERSION }, 200, headers);
      }

      const session = options.resolveSession
        ? await options.resolveSession(request)
        : await auth.api.getSession({ headers: request.headers }) as AuthSession | null;
      const ownerUserId = session?.user.id;

      const sharedReportMatch = path.match(/^\/api\/shared\/reports\/([^/]+)(\/export)?$/);
      if (request.method === "GET" && sharedReportMatch) {
        const share = await store.resolveShareToken(sharedReportMatch[1]!, "report");
        if (!share) throw sharedResourceNotFound();
        const report = await buildReportManifest(store, share.entityId, share.ownerUserId);
        if (!report) throw sharedResourceNotFound();
        if (!sharedReportMatch[2]) return json({ report }, 200, headers);
        return exportFormat(request, url) === "csv"
          ? csvDownload(reportTradesCsv(report), "strategy-court-report-trades.csv", headers)
          : jsonDownload(report, "strategy-court-report.json", headers);
      }

      const sharedIndicatorMatch = path.match(/^\/api\/shared\/indicators\/([^/]+)(\/export)?$/);
      if (request.method === "GET" && sharedIndicatorMatch) {
        const share = await store.resolveShareToken(sharedIndicatorMatch[1]!, "indicator");
        if (!share) throw sharedResourceNotFound();
        const indicator = await buildIndicatorManifest(store, share.entityId, share.ownerUserId);
        if (!indicator) throw sharedResourceNotFound();
        if (!sharedIndicatorMatch[2]) return json({ indicator }, 200, headers);
        return exportFormat(request, url) === "csv"
          ? csvDownload(indicatorDefinitionCsv(indicator), "strategy-court-indicator.csv", headers)
          : jsonDownload(indicator, "strategy-court-indicator.json", headers);
      }

      if (request.method === "GET" && path === "/api/indicators") {
        const custom = ownerUserId ? (await store.listIndicators(ownerUserId)).map((row) => ({
          id: row.id,
          name: row.name,
          version: row.version,
          description: row.description,
          formula: row.formula,
          inputs: row.inputs,
          dependencies: row.dependencies,
          outputType: row.outputType,
          sharingState: row.sharingState,
          creatorType: row.creatorType,
          metadata: row.metadata,
          lineageId: row.lineageId,
          parentIndicatorId: row.parentIndicatorId,
          createdAt: row.createdAt,
          available: true,
          custom: true,
        })) : [];
        return json({ indicators: [...BUILT_IN_INDICATORS, ...custom] }, 200, headers);
      }

      if (!ownerUserId) {
        throw new ApiError(401, "authentication_required", "Sign in to access Strategy Court");
      }

      const sharedIndicatorImportMatch = path.match(/^\/api\/shared\/indicators\/([^/]+)\/import$/);
      if (request.method === "POST" && sharedIndicatorImportMatch) {
        const share = await store.resolveShareToken(sharedIndicatorImportMatch[1]!, "indicator");
        if (!share) throw sharedResourceNotFound();
        const manifest = await buildIndicatorManifest(store, share.entityId, share.ownerUserId);
        if (!manifest) throw sharedResourceNotFound();
        const indicator = await importIndicatorManifest(manifest, store, ownerUserId, actor);
        return json({ indicator }, 201, headers);
      }

      if (request.method === "POST" && path === "/api/indicators") {
        const input = await body(request);
        const validated = await validateIndicatorDefinition(input, store, ownerUserId);
        const indicator = await store.createIndicator({
          name: string(input.name, "name"),
          description: string(input.description, "description"),
          formula: input.formula,
          inputs: validated.inputs,
          dependencies: validated.dependencies,
          outputType: validated.outputType,
          sharingState: validated.sharingState,
        }, actor, ownerUserId);
        return json({ indicator }, 201, headers);
      }

      const indicatorVersionsMatch = path.match(/^\/api\/indicators\/([^/]+)\/versions$/);
      if (indicatorVersionsMatch && request.method === "GET") {
        const versions = await store.listIndicatorVersions(indicatorVersionsMatch[1]!, ownerUserId);
        if (!versions) throw new ApiError(404, "indicator_not_found", "Indicator not found");
        return json({ versions }, 200, headers);
      }
      if (indicatorVersionsMatch && request.method === "POST") {
        const parent = await store.getIndicator(indicatorVersionsMatch[1]!, ownerUserId);
        if (!parent) throw new ApiError(404, "indicator_not_found", "Indicator not found");
        const input = await body(request);
        const allowed = new Set(["name", "description", "inputs", "dependencies", "outputType", "sharingState", "formula"]);
        const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
        if (unexpected.length) throw new ApiError(422, "invalid_indicator", "Indicator version contains unsupported fields", { unexpected });
        const candidate: Record<string, unknown> = {
          name: input.name ?? parent.name,
          description: input.description ?? parent.description,
          inputs: input.inputs ?? parent.inputs,
          dependencies: input.dependencies ?? parent.dependencies,
          outputType: input.outputType ?? parent.outputType,
          sharingState: input.sharingState ?? parent.sharingState,
          formula: input.formula ?? parent.formula,
        };
        const validated = await validateIndicatorDefinition(candidate, store, ownerUserId);
        const indicator = await store.createIndicatorVersion({
          parentIndicatorId: parent.id,
          name: string(candidate.name, "name"),
          description: string(candidate.description, "description"),
          formula: candidate.formula,
          inputs: validated.inputs,
          dependencies: validated.dependencies,
          outputType: validated.outputType,
          sharingState: validated.sharingState,
        }, actor, ownerUserId);
        if (!indicator) throw new ApiError(404, "indicator_not_found", "Indicator not found");
        return json({ indicator }, 201, headers);
      }

      const indicatorShareMatch = path.match(/^\/api\/indicators\/([^/]+)\/share(?:\/(rotate|revoke))?$/);
      if (indicatorShareMatch) {
        const indicatorId = indicatorShareMatch[1]!;
        const operation = indicatorShareMatch[2];
        if (request.method === "GET" && !operation) {
          const share = await store.getShareStatus("indicator", indicatorId, ownerUserId);
          if (share === undefined) throw new ApiError(404, "indicator_not_found", "Indicator not found");
          return json({ share: shareResponse(share) }, 200, headers);
        }
        if (request.method === "POST" && operation === "revoke") {
          const result = await store.revokeShareToken("indicator", indicatorId, ownerUserId, actor);
          if (result.status === "not_found") throw new ApiError(404, "indicator_not_found", "Indicator not found");
          if (result.status === "not_shared") throw new ApiError(409, "share_not_active", "This indicator has no active share link");
          if (result.status !== "revoked") throw new ApiError(409, "share_not_active", "This indicator has no active share link");
          return json({ share: shareResponse(result.share) }, 200, headers);
        }
        if (request.method === "POST" && (!operation || operation === "rotate")) {
          const result = await store.issueShareToken("indicator", indicatorId, ownerUserId, actor, operation === "rotate");
          if (result.status === "not_found") throw new ApiError(404, "indicator_not_found", "Indicator not found");
          if (result.status === "already_shared") throw new ApiError(409, "share_already_active", "This indicator already has an active share link; rotate it to issue a new token");
          if (result.status === "not_shared") throw new ApiError(409, "share_not_active", "This indicator has no active share link");
          if (result.status !== "issued") throw new ApiError(409, "share_not_active", "This indicator has no active share link");
          return json({ share: shareResponse(result.share, result.token) }, 201, headers);
        }
      }

      const indicatorExportMatch = path.match(/^\/api\/indicators\/([^/]+)\/export$/);
      if (request.method === "GET" && indicatorExportMatch) {
        const indicator = await store.getIndicator(indicatorExportMatch[1]!, ownerUserId);
        if (!indicator) throw new ApiError(404, "indicator_not_found", "Indicator not found");
        return exportFormat(request, url) === "csv"
          ? csvDownload(indicatorDefinitionCsv(indicator), "strategy-court-indicator.csv", headers)
          : jsonDownload(indicator, "strategy-court-indicator.json", headers);
      }

      const indicatorMatch = path.match(/^\/api\/indicators\/([^/]+)$/);
      if (request.method === "GET" && indicatorMatch) {
        const builtIn = BUILT_IN_INDICATORS.find((item) => item.id === indicatorMatch[1]);
        if (builtIn) return json({ indicator: builtIn }, 200, headers);
        const row = await store.getIndicator(indicatorMatch[1]!, ownerUserId);
        if (!row) throw new ApiError(404, "indicator_not_found", "Indicator not found");
        return json({ indicator: {
          ...row,
        } }, 200, headers);
      }

      if (request.method === "GET" && path === "/api/cases") {
        return json({ cases: await store.listCases(ownerUserId) }, 200, headers);
      }

      if (request.method === "POST" && path === "/api/cases") {
        const courtCase = await store.createCase(caseInput(await body(request)), actor, ownerUserId);
        return json({ case: courtCase }, 201, headers);
      }

      const caseMatch = path.match(/^\/api\/cases\/([^/]+)$/);
      if (request.method === "GET" && caseMatch) {
        const context = await store.getCaseContext(caseMatch[1]!, ownerUserId);
        if (!context) throw new ApiError(404, "case_not_found", "Court case not found");
        return json({ case: context }, 200, headers);
      }

      const draftMatch = path.match(/^\/api\/cases\/([^/]+)\/strategy-drafts$/);
      if (request.method === "POST" && draftMatch) {
        const caseId = draftMatch[1]!;
        const courtCase = await requireCase(store, caseId, ownerUserId);
        const input = await body(request);
        const resolved = await resolveCustomIndicatorsInStrategy(input.definition ?? input.strategy, store, ownerUserId);
        const strategy = await parseStrategy(resolved.definition);
        if (JSON.stringify(strategy.universe) !== JSON.stringify(courtCase.symbols)) {
          throw new ApiError(422, "strategy_universe_mismatch", "Strategy symbols must match the case symbols");
        }
        if (courtCase.evaluationLocked && await store.countVariants(caseId, ownerUserId) >= 3) {
          throw new ApiError(422, "variant_limit_exceeded", "A case may create at most three evaluation-informed versions");
        }
        const parentVersionId = courtCase.evaluationLocked ? courtCase.activeVersionId : null;
        if (courtCase.evaluationLocked && !parentVersionId) {
          throw new ApiError(409, "active_version_required", "An evaluated case requires an active parent version");
        }
        const version = await store.createVersion({
          caseId,
          parentVersionId,
          definition: strategy as unknown as Record<string, unknown>,
          interpretation: string(input.interpretation ?? input.plainLanguageInterpretation, "interpretation"),
          source: actor,
          metadata: resolved.customIndicators.length ? { customIndicators: resolved.customIndicators } : undefined,
          evaluationInformed: courtCase.evaluationLocked,
        }, actor, ownerUserId);
        return json({ case: await store.getCase(caseId, ownerUserId), version }, 201, headers);
      }

      const confirmMatch = path.match(/^\/api\/cases\/([^/]+)\/strategy-versions\/([^/]+)\/confirm$/);
      if (request.method === "POST" && confirmMatch) {
        if (actor !== "user") {
          throw new ApiError(403, "user_confirmation_required", "Only the user may confirm a strategy interpretation");
        }
        await requireCase(store, confirmMatch[1]!, ownerUserId);
        const version = await requireVersion(store, confirmMatch[1]!, confirmMatch[2]!, ownerUserId);
        if (version.confirmed) return json({ case: await store.getCase(confirmMatch[1]!, ownerUserId), version }, 200, headers);
        const confirmed = await store.confirmVersion(confirmMatch[1]!, confirmMatch[2]!, actor, ownerUserId);
        return json(confirmed, 200, headers);
      }

      const runCreateMatch = path.match(/^\/api\/cases\/([^/]+)\/court-runs$/);
      if (request.method === "POST" && runCreateMatch) {
        const caseId = runCreateMatch[1]!;
        const courtCase = await requireCase(store, caseId, ownerUserId);
        const input = await body(request);
        const unexpected = Object.keys(input).filter((key) => ![
          "strategyVersionId",
          "dateRange",
          "courtProfile",
          "dataSnapshotPolicy",
          "initialCapital",
        ].includes(key));
        if (unexpected.length) throw new ApiError(422, "validation_error", "Court run request contains unsupported fields", { unexpected });
        if (input.dateRange !== undefined) {
          const requestedRange = requireObject(input.dateRange, "dateRange must be an object");
          const start = date(requestedRange.start, "dateRange.start");
          const end = date(requestedRange.end, "dateRange.end");
          if (start !== courtCase.dateFrom || end !== courtCase.dateTo) {
            throw new ApiError(422, "court_range_mismatch", "Court dateRange must match the confirmed case range", {
              requested: { start, end },
              caseRange: { start: courtCase.dateFrom, end: courtCase.dateTo },
            });
          }
        }
        if (input.initialCapital !== undefined && Number(input.initialCapital) !== courtCase.initialCapital) {
          throw new ApiError(422, "court_capital_mismatch", "Court initialCapital must match the case capital", {
            requested: input.initialCapital,
            caseInitialCapital: courtCase.initialCapital,
          });
        }
        const versionId = typeof input.strategyVersionId === "string" ? input.strategyVersionId : courtCase.activeVersionId;
        if (!versionId) throw new ApiError(409, "strategy_not_confirmed", "Confirm a strategy before running Court");
        const version = await requireVersion(store, caseId, versionId, ownerUserId);
        if (!version.confirmed) throw new ApiError(409, "strategy_not_confirmed", "Confirm this strategy version before running Court");
        const profile = input.courtProfile === undefined || input.courtProfile === "balanced"
          ? "balanced"
          : (() => { throw new ApiError(422, "validation_error", "Only the balanced Court profile is available"); })();
        const policy = typeof input.dataSnapshotPolicy === "string" ? input.dataSnapshotPolicy : "frozen";
        if (!["frozen", "prefer_cache", "refresh"].includes(policy)) throw new ApiError(422, "validation_error", "Unsupported dataSnapshotPolicy");
        const run = await store.createRun(caseId, versionId, profile, DOMAIN_ENGINE_VERSION, actor, ownerUserId);
        queueRun(run, policy, ownerUserId);
        return json({ run, runId: run.id }, 202, headers);
      }

      const runMatch = path.match(/^\/api\/court-runs\/([^/]+)$/);
      if (request.method === "GET" && runMatch) return json({ run: await requireRun(store, runMatch[1]!, ownerUserId) }, 200, headers);

      const failureMatch = path.match(/^\/api\/court-runs\/([^/]+)\/failures\/([^/]+)$/);
      if (request.method === "GET" && failureMatch) {
        const run = await requireRun(store, failureMatch[1]!, ownerUserId);
        if (run.status !== "completed" || !run.result) throw new ApiError(409, "court_run_incomplete", "Failure evidence is available after Court completes");
        const failures = Array.isArray(run.result.failures) ? run.result.failures : [];
        const failure = failures.find((item) => String((item as Record<string, unknown>).id) === failureMatch[2]);
        if (!failure) throw new ApiError(404, "failure_not_found", "Failure evidence not found");
        return json({ failure: await inspectFailure(store, run, failure, ownerUserId) }, 200, headers);
      }

      const variantsMatch = path.match(/^\/api\/cases\/([^/]+)\/variants$/);
      if (request.method === "POST" && variantsMatch) {
        const caseId = variantsMatch[1]!;
        const courtCase = await requireCase(store, caseId, ownerUserId);
        const input = await body(request);
        const single = { ...input };
        delete single.parentVersionId;
        delete single.variants;
        const candidateRequests = Array.isArray(input.variants) ? input.variants : [single];
        const resolvedCandidates = await Promise.all(candidateRequests.map((candidate) =>
          resolveCustomIndicatorsInStrategy(candidate, store, ownerUserId)));
        const parsedRequests = safeParseVariantRequests(resolvedCandidates.map((candidate) => candidate.definition));
        if (!parsedRequests.success) {
          throw new ApiError(422, "invalid_variants", "The variant batch is invalid", { issues: parsedRequests.issues });
        }
        const requests = parsedRequests.data;
        if (requests.length < 1 || requests.length > 3 || await store.countVariants(caseId, ownerUserId) + requests.length > 3) {
          throw new ApiError(422, "variant_limit_exceeded", "A case may create at most three evaluation-informed variants");
        }
        if (!courtCase.evaluationLocked) throw new ApiError(409, "evaluation_required", "Run Court before creating evaluation-informed variants");
        const parentId = courtCase.activeVersionId;
        if (!parentId) throw new ApiError(409, "strategy_not_confirmed", "A confirmed parent version is required");
        if (typeof input.parentVersionId === "string" && input.parentVersionId !== parentId) {
          throw new ApiError(409, "active_parent_required", "Variants must use the case's active strategy version", { activeVersionId: parentId });
        }
        const parent = await requireVersion(store, caseId, parentId, ownerUserId);
        if (!parent.confirmed) throw new ApiError(409, "strategy_not_confirmed", "The parent version is not confirmed");
        const prepared = requests.map((requestItem, index) => {
          let definition: StrategyDefinition;
          try {
            definition = applyStrategyPatch(parent.definition as unknown as StrategyDefinition, requestItem.patch);
          } catch (error) {
            if (error instanceof RangeError) {
              throw new ApiError(422, "invalid_variant_patch", "A variant patch must make a semantic change to the active strategy", {
                variantName: requestItem.name,
                reason: error.message,
              });
            }
            throw error;
          }
          return {
            parentVersionId: parent.id,
            definition: definition as unknown as Record<string, unknown>,
            interpretation: `${requestItem.name}: ${requestItem.rationale}`,
            source: actor,
            metadata: {
              hypothesis: requestItem.hypothesis,
              rationale: requestItem.rationale,
              expectedWeaknessAddressed: requestItem.expectedWeaknessAddressed,
              ...(resolvedCandidates[index]?.customIndicators.length
                ? { customIndicators: resolvedCandidates[index]?.customIndicators }
                : {}),
            },
            evaluationInformed: true,
          };
        });
        const parentRun = await store.latestCompletedRun(caseId, ownerUserId, parentId);
        const parentSnapshot = parentRun?.dataSnapshotId ? await store.getSnapshot(parentRun.dataSnapshotId) : null;
        if (!parentSnapshot) throw new ApiError(409, "snapshot_not_found", "Variants require the parent run's persisted market snapshot");
        const { versions, runs } = await store.createVersionRunBatch({
          caseId,
          versions: prepared,
          profile: courtCase.selectedProfile,
          engineVersion: DOMAIN_ENGINE_VERSION,
          actor,
        }, ownerUserId);
        runs.forEach((run) => queueRun(run, "frozen", ownerUserId, { getSnapshot: async () => parentSnapshot }));
        return json({ versions, runs }, 202, headers);
      }

      const comparisonMatch = path.match(/^\/api\/cases\/([^/]+)\/comparison$/);
      if (request.method === "GET" && comparisonMatch) {
        const context = await store.getCaseContext(comparisonMatch[1]!, ownerUserId);
        if (!context) throw new ApiError(404, "case_not_found", "Court case not found");
        const requestedIds = url.searchParams.get("versionIds")?.split(",").filter(Boolean);
        const versions = context.versions.filter((version) => !requestedIds || requestedIds.includes(version.id));
        const rows = versions.map((version) => {
          const run = context.runs.find((item) => item.strategyVersionId === version.id && item.status === "completed");
          return {
            versionId: version.id,
            name: version.definition.name,
            parentVersionId: version.parentVersionId,
            evaluationInformed: version.evaluationInformed,
            diffs: version.parentVersionId
              ? diffStrategies(
                  context.versions.find((item) => item.id === version.parentVersionId)?.definition as unknown as StrategyDefinition,
                  version.definition as unknown as StrategyDefinition,
                )
              : [],
            summaryLabel: run?.summary ?? null,
            metrics: run?.result?.metrics ?? null,
            verdicts: run?.result?.verdicts ?? [],
            tradeCount: (run?.result?.metrics as Record<string, unknown> | undefined)?.tradeCount ?? (run?.result?.trades as unknown[] | undefined)?.length ?? 0,
            assumptions: run?.result?.assumptions ?? null,
          };
        });
        return json({ comparison: { caseId: context.id, versions: rows, rows } }, 200, headers);
      }

      const replayCreateMatch = path.match(/^\/api\/cases\/([^/]+)\/replay$/);
      if (request.method === "POST" && replayCreateMatch) {
        const caseId = replayCreateMatch[1]!;
        const courtCase = await requireCase(store, caseId, ownerUserId);
        const input = await body(request);
        const versionId = typeof input.strategyVersionId === "string" ? input.strategyVersionId : courtCase.activeVersionId;
        if (!versionId) throw new ApiError(409, "strategy_not_confirmed", "A strategy version is required");
        await requireVersion(store, caseId, versionId, ownerUserId);
        const run = typeof input.runId === "string"
          ? await requireRun(store, input.runId, ownerUserId)
          : await store.latestCompletedRun(caseId, ownerUserId, versionId);
        if (!run || run.caseId !== caseId || run.strategyVersionId !== versionId || run.status !== "completed") {
          throw new ApiError(409, "completed_run_required", "Replay requires a completed Court run for this version");
        }
        if (["invalid", "fragile", "reject"].includes(String(run.summary).toLowerCase())) {
          throw new ApiError(409, "replay_not_allowed", "Only surviving or inconclusive strategies can start probation replay");
        }
        const courtSnapshot = run.dataSnapshotId ? await store.getSnapshot(run.dataSnapshotId) : null;
        if (!courtSnapshot) throw new ApiError(409, "snapshot_not_found", "The Court data snapshot is unavailable");
        const version = await requireVersion(store, caseId, versionId, ownerUserId);
        const reservedFrom = date(input.reservedFrom ?? input.dateFrom ?? nextDate(courtCase.dateTo), "reservedFrom");
        const reservedTo = date(input.reservedTo ?? input.dateTo ?? holdoutEnd(courtCase.dateTo), "reservedTo");
        if (reservedFrom > reservedTo) {
          throw new ApiError(422, "invalid_replay_range", "reservedFrom must not follow reservedTo", { reservedFrom, reservedTo });
        }
        if (reservedFrom <= courtCase.dateTo) {
          throw new ApiError(422, "replay_range_not_holdout", "Replay probation must start after the original Court range", {
            courtDateTo: courtCase.dateTo,
            minimumReservedFrom: nextDate(courtCase.dateTo),
          });
        }
        const replayRequest = {
          symbols: [...new Set([...courtCase.symbols, "SPY"])],
          dateFrom: courtCase.dateFrom,
          dateTo: reservedTo,
        };
        let snapshot = courtSnapshot.dateFrom <= replayRequest.dateFrom && courtSnapshot.dateTo >= replayRequest.dateTo
          ? courtSnapshot
          : null;
        if (!snapshot) {
          const requestedPolicy = typeof input.dataSnapshotPolicy === "string"
            ? input.dataSnapshotPolicy
            : courtSnapshot.provider === "fixture" ? "frozen" : "prefer_cache";
          if (!["frozen", "prefer_cache", "refresh"].includes(requestedPolicy)) {
            throw new ApiError(422, "invalid_snapshot_policy", "Replay dataSnapshotPolicy must be frozen, prefer_cache, or refresh");
          }
          snapshot = requestedPolicy === "prefer_cache"
            ? await store.findSnapshot(replayRequest.symbols, replayRequest.dateFrom, replayRequest.dateTo)
            : null;
          if (!snapshot) {
            const providerPolicy = requestedPolicy === "prefer_cache" ? "refresh" : requestedPolicy;
            const provider = options.marketProvider ?? selectMarketProvider(providerPolicy);
            try {
              snapshot = await store.saveSnapshot(await provider.getSnapshot(replayRequest));
            } catch (error) {
              if (error instanceof ApiError && error.code.startsWith("fixture_")) {
                throw new ApiError(422, "replay_range_unavailable", "The frozen data source does not cover the requested replay holdout", {
                  requested: { start: reservedFrom, end: reservedTo },
                  cause: error.code,
                  providerDetails: error.details,
                });
              }
              throw error;
            }
          }
        }
        const replayBars = snapshot.bars.filter((bar) => bar.timestamp >= reservedFrom && bar.timestamp <= reservedTo);
        const coveredSymbols = new Set(replayBars.map((bar) => bar.symbol));
        const missingSymbols = courtCase.symbols.filter((symbol) => !coveredSymbols.has(symbol));
        if (missingSymbols.length) {
          throw new ApiError(422, "replay_data_missing", "The replay range lacks bars for one or more strategy symbols", {
            missingSymbols,
            reservedFrom,
            reservedTo,
          });
        }
        const replayId = crypto.randomUUID();
        let domainSession: ReplaySession;
        try {
          domainSession = createReplaySession({
            id: replayId,
            strategyVersionId: versionId,
            strategy: version.definition as unknown as StrategyDefinition,
            snapshot: snapshotForDomain(snapshot),
            range: { start: reservedFrom, end: reservedTo },
            initialCapital: courtCase.initialCapital,
            baselineMetrics: (run.result?.baseline as Record<string, unknown> | undefined)?.metrics as BacktestMetrics
              ?? run.result?.metrics as unknown as BacktestMetrics,
            baselineTradingDays: Array.isArray((run.result?.baseline as Record<string, unknown> | undefined)?.equityCurve)
              ? ((run.result?.baseline as Record<string, unknown>).equityCurve as unknown[]).length
              : 1,
          });
        } catch (error) {
          throw new ApiError(422, "invalid_replay_range", error instanceof Error ? error.message : "Replay range is invalid");
        }
        const replay = await store.createReplay({
          id: replayId,
          caseId,
          strategyVersionId: versionId,
          runId: run.id,
          reservedFrom,
          reservedTo,
          cursor: domainSession.cursor,
          state: { dataSnapshotId: snapshot.id, session: domainSession },
        }, actor, ownerUserId);
        return json({ replay: { ...replay, state: await replayState(store, replay, ownerUserId) } }, 201, headers);
      }

      const replayAdvanceMatch = path.match(/^\/api\/replay\/([^/]+)\/advance$/);
      if (request.method === "POST" && replayAdvanceMatch) {
        const replay = await requireReplay(store, replayAdvanceMatch[1]!, ownerUserId);
        if (replay.status === "completed") return json({ replay: { ...replay, state: await replayState(store, replay, ownerUserId) } }, 200, headers);
        const input = await body(request);
        const command = String(input.mode ?? input.command ?? input.increment ?? "one_bar");
        const modes: Record<string, ReplayAdvanceMode> = {
          one_bar: "one_bar", "1": "one_bar",
          five_bars: "five_bars", "5": "five_bars",
          twenty_bars: "twenty_bars", "20": "twenty_bars",
          to_next_signal: "next_signal", next_signal: "next_signal",
          to_next_completed_trade: "next_trade", next_completed_trade: "next_trade", next_trade: "next_trade",
        };
        const mode = modes[command];
        if (!mode) {
          throw new ApiError(422, "invalid_replay_command", "Unsupported replay command", { command });
        }
        const context = await replayDomainContext(store, replay, ownerUserId);
        const advanced = advanceDomainReplay(
          replay.state.session as unknown as ReplaySession,
          { mode },
          { strategy: context.strategy, snapshot: context.snapshot },
        );
        const status = advanced.session.status === "complete" ? "completed" : "active";
        const updated = await store.updateReplay(replay.id, advanced.session.cursor, status, { ...replay.state, session: advanced.session, monitoring: advanced }, actor, ownerUserId);
        return json({ replay: { ...updated, state: await replayState(store, updated, ownerUserId) } }, 200, headers);
      }

      const replayStatusMatch = path.match(/^\/api\/replay\/([^/]+)\/status$/);
      if (request.method === "GET" && replayStatusMatch) {
        const replay = await requireReplay(store, replayStatusMatch[1]!, ownerUserId);
        const state = await replayState(store, replay, ownerUserId);
        return json({ replay: { ...replay, state }, monitoring: state }, 200, headers);
      }

      const monitoringMatch = path.match(/^\/api\/cases\/([^/]+)\/monitoring$/);
      if (request.method === "GET" && monitoringMatch) {
        const courtCase = await requireCase(store, monitoringMatch[1]!, ownerUserId);
        const versionId = url.searchParams.get("strategyVersionId") ?? courtCase.activeVersionId;
        if (!versionId) throw new ApiError(409, "strategy_not_confirmed", "Confirm a strategy before checking latest-bar monitoring");
        await requireVersion(store, courtCase.id, versionId, ownerUserId);
        const evaluation = await latestMonitoringEvaluation(store, courtCase.id, versionId, ownerUserId);
        return json({
          monitoring: evaluation?.result ?? {
            status: "not_started",
            strategyVersionId: versionId,
            positions: [],
            signals: [],
            changes: [],
            warnings: [],
          },
          evaluation,
        }, 200, headers);
      }

      if (request.method === "POST" && monitoringMatch) {
        const courtCase = await requireCase(store, monitoringMatch[1]!, ownerUserId);
        const input = await body(request);
        const versionId = typeof input.strategyVersionId === "string" ? input.strategyVersionId : courtCase.activeVersionId;
        if (!versionId) throw new ApiError(409, "strategy_not_confirmed", "Confirm a strategy before checking latest-bar monitoring");
        const version = await requireVersion(store, courtCase.id, versionId, ownerUserId);
        if (!version.confirmed) throw new ApiError(409, "strategy_not_confirmed", "Confirm this strategy version before checking latest-bar monitoring");
        const policy = input.dataSnapshotPolicy === undefined ? "refresh" : String(input.dataSnapshotPolicy);
        if (policy !== "refresh" && policy !== "frozen") {
          throw new ApiError(422, "validation_error", "Latest-bar monitoring supports refresh or frozen data", {
            field: "dataSnapshotPolicy",
            allowed: ["refresh", "frozen"],
          });
        }
        const evaluation = await refreshLatestBarMonitoring({
          store,
          marketProvider: options.marketProvider ?? selectMarketProvider(policy),
          courtCase,
          version,
          ownerUserId,
          actor,
        });
        return json({ monitoring: evaluation.result, evaluation }, 201, headers);
      }

      const reportMatch = path.match(/^\/api\/reports\/([^/]+)$/);
      if (request.method === "GET" && reportMatch) {
        const reportId = reportMatch[1]!;
        let report = await buildReportManifest(store, reportId, ownerUserId, true);
        if (!report) {
          const context = await store.getCaseContext(reportId, ownerUserId);
          const latest = context?.runs.find((run) => run.status === "completed");
          if (latest) report = await buildReportManifest(store, latest.id, ownerUserId, true);
        }
        if (!report) throw new ApiError(404, "report_not_found", "Completed report not found");
        return json({ report }, 200, headers);
      }

      const reportExportMatch = path.match(/^\/api\/reports\/([^/]+)\/export$/);
      if (request.method === "GET" && reportExportMatch) {
        const reportId = reportExportMatch[1]!;
        let report = await buildReportManifest(store, reportId, ownerUserId, true);
        if (!report) {
          const context = await store.getCaseContext(reportId, ownerUserId);
          const latest = context?.runs.find((run) => run.status === "completed");
          if (latest) report = await buildReportManifest(store, latest.id, ownerUserId, true);
        }
        if (!report) throw new ApiError(404, "report_not_found", "Completed report not found");
        return exportFormat(request, url) === "csv"
          ? csvDownload(reportTradesCsv(report), "strategy-court-report-trades.csv", headers)
          : jsonDownload(report, "strategy-court-report.json", headers);
      }

      const reportShareMatch = path.match(/^\/api\/reports\/([^/]+)\/share(?:\/(rotate|revoke))?$/);
      if (reportShareMatch) {
        const reportId = reportShareMatch[1]!;
        const operation = reportShareMatch[2];
        if (request.method === "GET" && !operation) {
          const share = await store.getShareStatus("report", reportId, ownerUserId);
          if (share === undefined) throw new ApiError(404, "report_not_found", "Completed report not found");
          return json({ share: shareResponse(share) }, 200, headers);
        }
        if (request.method === "POST" && operation === "revoke") {
          const result = await store.revokeShareToken("report", reportId, ownerUserId, actor);
          if (result.status === "not_found") throw new ApiError(404, "report_not_found", "Completed report not found");
          if (result.status === "not_shared") throw new ApiError(409, "share_not_active", "This report has no active share link");
          if (result.status !== "revoked") throw new ApiError(409, "share_not_active", "This report has no active share link");
          return json({ share: shareResponse(result.share) }, 200, headers);
        }
        if (request.method === "POST" && (!operation || operation === "rotate")) {
          const result = await store.issueShareToken("report", reportId, ownerUserId, actor, operation === "rotate");
          if (result.status === "not_found") throw new ApiError(404, "report_not_found", "Completed report not found");
          if (result.status === "already_shared") throw new ApiError(409, "share_already_active", "This report already has an active share link; rotate it to issue a new token");
          if (result.status === "not_shared") throw new ApiError(409, "share_not_active", "This report has no active share link");
          if (result.status !== "issued") throw new ApiError(409, "share_not_active", "This report has no active share link");
          return json({ share: shareResponse(result.share, result.token) }, 201, headers);
        }
      }

      throw new ApiError(404, "route_not_found", "API route not found", { method: request.method, path });
    } catch (error) {
      return errorResponse(error, headers);
    }
  };

  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      await store.close();
      if (ownsPool) await pool.end();
    })();
    return closePromise;
  };

  return {
    fetch,
    store,
    queue,
    auth,
    close,
  };
}
