/** Keep agent messages bounded without silently dropping evidence. */
export const TOOL_RESPONSE_BUDGET = 8_000;
export const RESULT_PAGE_SIZE = 2_000;
const RESULT_TTL_MS = 5 * 60_000;
const CACHE_BUDGET = 16_000_000;

export class ToolResults {
  private entries = new Map<string, { json: string; expires: number }>();

  constructor(private readonly now = Date.now) {}

  clear(): void { this.entries.clear(); }

  private prune(): void {
    for (const [id, entry] of this.entries) if (entry.expires <= this.now()) this.entries.delete(id);
  }

  pack(data: unknown, envelope: unknown): unknown {
    const serialized = JSON.stringify({ ...envelope as object, data });
    // WebMCP crosses a structured-clone boundary; Vue proxies are not transferable.
    if (serialized.length <= TOOL_RESPONSE_BUDGET) return JSON.parse(serialized).data;
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
    let end = Math.min(entry.json.length, offset + RESULT_PAGE_SIZE);
    const page = () => ({
      resultId, offset, totalCharacters: entry.json.length,
      nextOffset: end < entry.json.length ? end : null,
      encoding: "json-text", jsonText: entry.json.slice(offset, end),
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
