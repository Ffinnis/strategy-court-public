/** Keep agent messages bounded without silently dropping evidence. */
export const TOOL_RESPONSE_BUDGET = 8_000;
export const RESULT_PAGE_SIZE = 5_000;
const RESULT_TTL_MS = 5 * 60_000;
const CACHE_BUDGET = 16_000_000;

export class ToolResults {
  private entries = new Map<string, { json: string; expires: number }>();
  private generation = 0;

  constructor(private readonly now = Date.now) {}

  clear(): void {
    this.generation += 1;
    this.entries.clear();
  }

  scope(): number { return this.generation; }

  isCurrent(scope: number): boolean { return scope === this.generation; }

  private requireCurrent(scope: number): void {
    if (!this.isCurrent(scope)) throw new DOMException("The account or case changed while this result was being prepared.", "AbortError");
  }

  private prune(): void {
    for (const [id, entry] of this.entries) if (entry.expires <= this.now()) this.entries.delete(id);
  }

  pack(data: unknown, envelope: unknown, scope = this.scope()): unknown {
    this.requireCurrent(scope);
    const serialized = JSON.stringify({ ...envelope as object, data });
    // WebMCP crosses a structured-clone boundary; Vue proxies are not transferable.
    if (serialized.length <= TOOL_RESPONSE_BUDGET) return JSON.parse(serialized).data;
    return this.reference(data, scope);
  }

  reference(data: unknown, scope = this.scope()) {
    this.requireCurrent(scope);
    const json = JSON.stringify(data);
    if (json.length > CACHE_BUDGET) throw new Error("This result exceeds the browser evidence cache. Narrow the request or download the report from Audit.");
    this.prune();
    let used = [...this.entries.values()].reduce((sum, entry) => sum + entry.json.length, 0);
    for (const [id, entry] of this.entries) {
      if (used + json.length <= CACHE_BUDGET && this.entries.size < 4) break;
      used -= entry.json.length;
      this.entries.delete(id);
    }
    const resultId = crypto.randomUUID();
    this.entries.set(resultId, { json, expires: this.now() + RESULT_TTL_MS });
    return { resultId, totalCharacters: json.length, nextOffset: 0, readWith: "read_tool_result", expiresInSeconds: 300 };
  }

  read(resultId: string, offset = 0) {
    this.prune();
    const entry = this.entries.get(resultId);
    if (!entry) throw new Error("This result expired or belongs to another case or session. Repeat the original read-only request.");
    if (!Number.isInteger(offset) || offset < 0 || offset > entry.json.length) throw new Error("Offset must be an integer within the returned totalCharacters.");
    entry.expires = this.now() + RESULT_TTL_MS;
    let end = Math.min(entry.json.length, offset + RESULT_PAGE_SIZE);
    const page = () => ({
      resultId, offset, totalCharacters: entry.json.length,
      nextOffset: end < entry.json.length ? end : null,
      encoding: "json-text", jsonText: entry.json.slice(offset, end), expiresInSeconds: 300,
    });
    // JSON escaping can expand control characters sixfold. Reserve space for the tool envelope.
    while (JSON.stringify(page()).length > 6_000) end = offset + Math.floor((end - offset) / 2);
    return page();
  }
}

export function catalogPage(payload: unknown, input: Record<string, unknown>) {
  const catalog = payload as { indicators?: Array<Record<string, unknown>>; formulaPrimitives?: Array<Record<string, unknown>> };
  const ids = input.ids as string[] | undefined;
  const query = String(input.query ?? "").trim().toLowerCase();
  const offset = Number(input.offset ?? 0);
  const limit = Number(input.limit ?? (ids ? 3 : 10));
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("Use a nonnegative offset and a limit from 1 to 10.");
  const all = [...catalog.indicators ?? [], ...catalog.formulaPrimitives ?? []];
  const matches = all.filter(item => (!ids || ids.includes(String(item.id))) && (!query || `${item.id} ${item.name}`.toLowerCase().includes(query)));
  return {
    indicators: matches.slice(offset, offset + limit).map(item => ids ? item : {
      id: item.id, name: item.name, category: item.category, outputType: item.outputType, available: item.available,
    }),
    total: matches.length, offset, nextOffset: offset + limit < matches.length ? offset + limit : null,
    ...(ids ? { missingIds: ids.filter(id => !all.some(item => item.id === id)) } : { hint: "Pass ids to read exact parameters before using an indicator." }),
  };
}

export function caseListPage(payload: unknown) {
  const source = payload as {
    cases?: Array<Record<string, unknown>>;
    total?: unknown;
    offset?: unknown;
    nextOffset?: unknown;
  };
  const cases = Array.isArray(source.cases) ? source.cases : [];
  const offset = Number(source.offset);
  const total = Number(source.total);
  const nextOffset = source.nextOffset === null ? null : Number(source.nextOffset);
  return {
    cases: cases.map((item) => ({
      id: typeof item.id === "string" ? item.id.slice(0, 100) : item.id,
      name: typeof item.name === "string" ? item.name.slice(0, 90) : item.name,
      description: typeof item.description === "string" ? item.description.slice(0, 240) : item.description,
      symbols: Array.isArray(item.symbols) ? item.symbols.slice(0, 5).map((value) => String(value).slice(0, 20)) : [],
      startDate: typeof item.dateFrom === "string" ? item.dateFrom.slice(0, 20) : item.dateFrom,
      endDate: typeof item.dateTo === "string" ? item.dateTo.slice(0, 20) : item.dateTo,
      status: typeof item.status === "string" ? item.status.slice(0, 40) : item.status,
      activeVersionId: typeof item.activeVersionId === "string" ? item.activeVersionId.slice(0, 100) : item.activeVersionId,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt.slice(0, 40) : item.updatedAt,
    })),
    total: Number.isSafeInteger(total) && total >= 0 ? total : cases.length,
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
    nextOffset: nextOffset === null || (Number.isSafeInteger(nextOffset) && nextOffset >= 0) ? nextOffset : null,
  };
}

export function reportBrief(payload: unknown) {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const text = (value: unknown, maximum = 180): string | undefined => typeof value === "string" ? value.slice(0, maximum) : undefined;
  const scalar = (value: unknown): string | number | boolean | null | undefined => {
    if (value === null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return value.slice(0, 120);
    return value === undefined ? undefined : "Complex value omitted from brief";
  };
  const report = record(payload);
  const caseValue = record(report.case);
  const run = record(report.run);
  const data = record(report.dataMetadata);
  const verdicts = Array.isArray(report.verdicts) ? report.verdicts : [];
  const decisions = Array.isArray(report.decisions) ? report.decisions : [];
  const failures = Array.isArray(report.failures) ? report.failures : [];
  const warnings = Array.isArray(report.dataWarnings) ? report.dataWarnings : [];
  const metrics = Object.fromEntries(Object.entries(record(report.metrics)).slice(0, 8).map(([key, value]) => [key.slice(0, 40), scalar(value)]));
  return {
    case: {
      name: text(caseValue.name, 120),
      symbols: Array.isArray(caseValue.symbols) ? caseValue.symbols.slice(0, 5).map((value) => text(value, 20)) : [],
      dateRange: { start: text(record(caseValue.dateRange).start, 20), end: text(record(caseValue.dateRange).end, 20) },
    },
    run: {
      status: text(run.status, 40),
      summary: text(run.summary, 120),
      engineVersion: text(run.engineVersion ?? report.engineVersion, 120),
      reproducibilityId: text(run.reproducibilityId, 160),
      completedAt: text(run.completedAt, 40),
    },
    verdicts: verdicts.slice(0, 7).map((value) => {
      const verdict = record(value);
      return { id: text(verdict.id, 48), category: text(verdict.category, 32), status: text(verdict.status, 16), finding: text(verdict.finding, 64), failureId: text(verdict.failureId, 48) };
    }),
    failureIds: failures.map((value, index) => text(record(value).id, 48) ?? String(index + 1)),
    failures: failures.filter((value) => typeof record(value).id === "string").slice(0, 7).map((value) => {
      const failure = record(value);
      const range = record(failure.dateRange ?? failure.period);
      return {
        id: text(failure.id, 48),
        category: text(failure.category, 32),
        status: text(failure.status, 16),
        finding: text(failure.finding, 100),
        dateRange: { start: text(range.start, 20), end: text(range.end, 20) },
      };
    }),
    metrics,
    decisions: decisions.slice(0, 1).map((value) => {
      const decision = record(value);
      const refs = Array.isArray(decision.evidenceRefs) ? decision.evidenceRefs : [];
      return {
        outcome: text(decision.outcome, 20),
        state: text(decision.state, 20),
        rationale: text(decision.rationale, 180),
        uncertainties: text(decision.uncertainties, 100),
        revisitCriteria: text(decision.revisitCriteria, 100),
        evidenceRefs: refs.slice(0, 4).map((value) => {
          const ref = record(value);
          return { kind: text(ref.kind, 20), id: text(ref.id, 60) };
        }),
      };
    }),
    data: {
      provider: text(data.provider, 80),
      feed: text(data.feed, 40),
      adjustment: text(data.adjustment, 40),
      dateRange: { start: text(record(data.dateRange).start, 20), end: text(record(data.dateRange).end, 20) },
      snapshotHash: text(data.snapshotHash, 160),
      fetchedAt: text(data.fetchedAt, 40),
      barCount: typeof data.barCount === "number" ? data.barCount : undefined,
    },
    counts: {
      trades: Array.isArray(report.trades) ? report.trades.length : 0,
      failures: Array.isArray(report.failures) ? report.failures.length : 0,
      versions: Array.isArray(report.versionHistory) ? report.versionHistory.length : 0,
    },
    returned: { verdicts: Math.min(verdicts.length, 7), failures: Math.min(failures.length, 7), decisions: Math.min(decisions.length, 1), warnings: Math.min(warnings.length, 3) },
    dataWarnings: warnings.slice(0, 3).map((value) => text(value, 120)),
  };
}
