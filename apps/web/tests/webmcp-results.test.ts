import { expect, test } from "bun:test";
import { isProxy, reactive } from "vue";
import { catalogPage, ToolResults, TOOL_RESPONSE_BUDGET } from "../src/webmcp/results";

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
