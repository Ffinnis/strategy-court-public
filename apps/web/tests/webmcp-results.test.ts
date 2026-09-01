import { expect, test } from "bun:test";
import { isProxy, reactive } from "vue";
import { caseListPage, catalogPage, reportBrief, ToolResults, TOOL_RESPONSE_BUDGET } from "../src/webmcp/results";

test("small results detach nested Vue proxies before crossing the browser boundary", () => {
  const source = reactive({ case: { symbols: ["QQQ"], metrics: [{ value: 120 }] } });
  const packed = new ToolResults().pack(source, {}) as typeof source;
  expect(packed).toEqual(source);
  expect(isProxy(packed.case)).toBe(false);
  expect(isProxy(packed.case.symbols)).toBe(false);
  source.case.symbols.push("SPY");
  expect(packed.case.symbols).toEqual(["QQQ"]);
});

test("small results stay structured and large evidence is losslessly paginated", () => {
  const results = new ToolResults();
  const envelope = { ok: true, currentState: { caseId: "case" } };
  expect(results.pack({ id: "small" }, envelope)).toEqual({ id: "small" });
  const original = { trades: Array.from({ length: 1000 }, (_, index) => ({ index, note: "Пример 🌱 \"quoted\"" })) };
  const pointer = results.pack(original, envelope) as { resultId: string };
  let json = "";
  let offset: number | null = 0;
  while (offset !== null) {
    const page = results.read(pointer.resultId, offset);
    expect(JSON.stringify({ ...envelope, data: page }).length).toBeLessThan(TOOL_RESPONSE_BUDGET);
    json += page.jsonText;
    offset = page.nextOffset;
  }
  expect(JSON.parse(json)).toEqual(original);
  expect(() => results.read(pointer.resultId, -1)).toThrow("Offset");
  expect(() => results.read(pointer.resultId, 0.5)).toThrow("Offset");
});

test("result handles expire, are bounded in count, and can be cleared on session changes", () => {
  let now = 0;
  const results = new ToolResults(() => now);
  const data = "x".repeat(9000);
  const first = results.pack(data, {}) as { resultId: string };
  for (let i = 0; i < 4; i++) results.pack(data, {});
  expect(() => results.read(first.resultId)).toThrow("expired");
  const expiring = results.pack(data, {}) as { resultId: string };
  now = 300_001;
  expect(() => results.read(expiring.resultId)).toThrow("expired");
  const last = results.pack(data, {}) as { resultId: string };
  results.clear();
  expect(() => results.read(last.resultId)).toThrow("expired");
});

test("active pagination renews a handle without reviving expired results", () => {
  let now = 0;
  const results = new ToolResults(() => now);
  const pointer = results.reference({ report: "x".repeat(20_000) });
  const first = results.read(pointer.resultId, 0);
  now = 299_999;
  const second = results.read(pointer.resultId, first.nextOffset!);
  now = 300_001;
  expect(results.read(pointer.resultId, second.nextOffset!).offset).toBe(second.nextOffset);
  now = 600_002;
  expect(() => results.read(pointer.resultId, 0)).toThrow("expired");
});

test("escaped evidence pages remain bounded without creating nested result handles", () => {
  const results = new ToolResults();
  const pointer = results.pack("\u0000".repeat(5000), {}) as { resultId: string };
  let offset: number | null = 0;
  let json = "";
  while (offset !== null) {
    const page = results.read(pointer.resultId, offset);
    expect(JSON.stringify(page).length).toBeLessThanOrEqual(6000);
    json += page.jsonText;
    offset = page.nextOffset;
  }
  expect(JSON.parse(json)).toBe("\u0000".repeat(5000));
});

test("catalog summaries are paged and selected IDs preserve exact parameters", () => {
  const indicators = Array.from({ length: 30 }, (_, index) => ({ id: `id${index}`, name: `Indicator ${index}`, parameters: [{ period: index + 1 }] }));
  const payload = { indicators, formulaPrimitives: [{ id: "highest", name: "Highest", parameters: [] }] };
  const first = catalogPage(payload, {});
  expect(first.total).toBe(31);
  expect(first.indicators).toHaveLength(10);
  expect(first.nextOffset).toBe(10);
  expect(first.indicators[0]).not.toHaveProperty("parameters");
  expect(catalogPage(payload, { ids: ["id3", "missing"] })).toMatchObject({ indicators: [indicators[3]], missingIds: ["missing"] });
  expect(catalogPage(payload, { query: "highest" }).indicators).toHaveLength(1);
  expect(catalogPage(payload, { offset: 30 }).nextOffset).toBeNull();
  expect(() => catalogPage(payload, { limit: 100 })).toThrow();
});

test("case summaries are searchable, paged, and omit internal fields", () => {
  const cases = [
    { id: "case-1", name: "QQQ pullback", description: "RSI reversal", symbols: ["QQQ"], dateFrom: "2020-01-02", dateTo: "2024-12-31", status: "draft", activeVersionId: "v1", updatedAt: "2026-09-01T10:00:00Z", evaluationLocked: true },
  ];
  expect(caseListPage({ cases, total: 12, offset: 5, nextOffset: 6 })).toEqual({
    cases: [{ id: "case-1", name: "QQQ pullback", description: "RSI reversal", symbols: ["QQQ"], startDate: "2020-01-02", endDate: "2024-12-31", status: "draft", activeVersionId: "v1", updatedAt: "2026-09-01T10:00:00Z" }],
    total: 12,
    offset: 5,
    nextOffset: 6,
  });
  expect(caseListPage({ cases, total: "bad", offset: -1, nextOffset: "bad" })).toMatchObject({ total: 1, offset: 0, nextOffset: null });
});

test("report briefs preserve decision and provenance facts without raw evidence arrays", () => {
  expect(reportBrief({
    case: { name: "QQQ pullback", symbols: ["QQQ"], dateRange: { start: "2020-01-02", end: "2024-12-31" } },
    run: { status: "completed", summary: "Fragile", engineVersion: "court-1", reproducibilityId: "repro-1", completedAt: "2026-09-01T10:00:00Z" },
    verdicts: [{ id: "risk", category: "risk_profile", status: "Fail", finding: "Drawdown exceeded the limit", failureId: "risk-period", evidence: { large: true } }],
    metrics: { netReturnPercent: -2 },
    decisions: [{ outcome: "rejected", state: "confirmed" }],
    dataMetadata: { provider: "alpaca", feed: "sip", adjustment: "all", snapshotHash: "hash-1", barCount: 1200 },
    trades: [{}, {}], failures: [{ id: "risk-period", category: "risk_profile", status: "Fail", finding: "Drawdown exceeded the limit", dateRange: { start: "2024-03-01", end: "2024-03-15" } }], versionHistory: [{}, {}, {}], dataWarnings: ["One symbol starts late"],
  })).toEqual({
    case: { name: "QQQ pullback", symbols: ["QQQ"], dateRange: { start: "2020-01-02", end: "2024-12-31" } },
    run: { status: "completed", summary: "Fragile", engineVersion: "court-1", reproducibilityId: "repro-1", completedAt: "2026-09-01T10:00:00Z" },
    verdicts: [{ id: "risk", category: "risk_profile", status: "Fail", finding: "Drawdown exceeded the limit", failureId: "risk-period" }],
    failureIds: ["risk-period"],
    failures: [{ id: "risk-period", category: "risk_profile", status: "Fail", finding: "Drawdown exceeded the limit", dateRange: { start: "2024-03-01", end: "2024-03-15" } }],
    metrics: { netReturnPercent: -2 },
    decisions: [{ outcome: "rejected", state: "confirmed", rationale: undefined, uncertainties: undefined, revisitCriteria: undefined, evidenceRefs: [] }],
    data: { provider: "alpaca", feed: "sip", adjustment: "all", dateRange: { start: undefined, end: undefined }, snapshotHash: "hash-1", fetchedAt: undefined, barCount: 1200 },
    counts: { trades: 2, failures: 1, versions: 3 },
    returned: { verdicts: 1, failures: 1, decisions: 1, warnings: 1 },
    dataWarnings: ["One symbol starts late"],
  });
});

test("report briefs retain the seventh risk verdict and its failure link", () => {
  const verdicts = Array.from({ length: 6 }, (_, index) => ({ id: `check-${index}`, status: "Pass" }));
  verdicts.push({ id: "risk-profile", status: "Fail", failureId: "risk-period" } as typeof verdicts[number]);
  const brief = reportBrief({ verdicts });
  expect(brief.verdicts).toHaveLength(7);
  expect(brief.verdicts[6]).toMatchObject({ id: "risk-profile", status: "Fail", failureId: "risk-period" });
  expect(brief.returned.verdicts).toBe(7);
});

test("maximum-size report briefs stay bounded beside one stable manifest handle", () => {
  const long = "x".repeat(4_000);
  const report = {
    case: { name: long, symbols: Array(20).fill(long), dateRange: { start: long, end: long } },
    run: { status: long, summary: long, engineVersion: long, reproducibilityId: long, completedAt: long },
    verdicts: Array.from({ length: 100 }, (_, index) => ({ id: `${index}-${long}`, category: long, status: long, finding: long, failureId: long })),
    metrics: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`${index}-${long}`, { nested: long }])),
    decisions: Array.from({ length: 20 }, () => ({ outcome: long, state: long, rationale: long, uncertainties: long, revisitCriteria: long, evidenceRefs: Array.from({ length: 20 }, () => ({ kind: long, id: long })) })),
    dataMetadata: { provider: long, feed: long, adjustment: long, dateRange: { start: long, end: long }, snapshotHash: long, fetchedAt: long, barCount: 1_000_000 },
    trades: Array(100).fill({}), failures: Array(100).fill({}), versionHistory: Array(100).fill({}), dataWarnings: Array(100).fill(long),
  };
  const brief = reportBrief(report);
  expect(JSON.stringify(brief).length).toBeLessThan(6_000);
  expect(brief.counts).toEqual({ trades: 100, failures: 100, versions: 100 });
  expect(brief.returned).toEqual({ verdicts: 7, failures: 7, decisions: 1, warnings: 3 });
  expect(brief.verdicts).toHaveLength(7);
  expect(brief.failureIds).toHaveLength(100);

  const results = new ToolResults();
  const manifest = results.reference(report);
  const outer = results.pack({ summary: brief, manifest }, { ok: true });
  expect(outer).toMatchObject({ manifest: { resultId: manifest.resultId } });
  expect(results.read(manifest.resultId, 0).jsonText.length).toBeGreaterThan(0);
});
