import { frozenMarketSnapshot } from "@strategy-court/fixtures";
import type { DataSnapshot, MarketBar } from "@strategy-court/schemas";
import type { Bar, SnapshotRecord } from "../types";
import { ApiError } from "../errors";

export interface MarketRequest {
  symbols: string[];
  dateFrom: string;
  dateTo: string;
}

export interface MarketProvider {
  getSnapshot(input: MarketRequest): Promise<SnapshotRecord>;
}

export interface SessionCoverage {
  calendarSymbol: string;
  expectedSessions: number;
  firstSession: string;
  lastSession: string;
  missingBars: Record<string, number>;
  missingDates: Record<string, string[]>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(value: unknown): string {
  return new Bun.CryptoHasher("sha256").update(canonical(value)).digest("hex");
}

function flatten(snapshot: DataSnapshot): Bar[] {
  return Object.entries(snapshot.bars).flatMap(([symbol, bars]) =>
    (bars ?? []).map((bar) => ({
      symbol,
      timestamp: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })),
  );
}

interface FixtureCoverage {
  dateFrom: string;
  dateTo: string;
  symbols: string[];
  sleeves: Record<string, { dateFrom: string; dateTo: string; barCount: number }>;
}

function fixtureCoverage(snapshot: DataSnapshot): FixtureCoverage {
  const sleeves: FixtureCoverage["sleeves"] = {};
  for (const [symbol, series] of Object.entries(snapshot.bars)) {
    const dates = (series ?? []).map((bar) => bar.date).sort();
    if (dates.length === 0) continue;
    sleeves[symbol] = {
      dateFrom: dates[0]!,
      dateTo: dates.at(-1)!,
      barCount: dates.length,
    };
  }
  const coveredSleeves = Object.values(sleeves);
  return {
    dateFrom: coveredSleeves.map((sleeve) => sleeve.dateFrom).sort()[0] ?? snapshot.startDate,
    dateTo: coveredSleeves.map((sleeve) => sleeve.dateTo).sort().at(-1) ?? snapshot.endDate,
    symbols: Object.keys(sleeves).sort(),
    sleeves,
  };
}

function fixtureCoverageDetails(input: MarketRequest, availableCoverage: FixtureCoverage) {
  return {
    requestedCoverage: { dateFrom: input.dateFrom, dateTo: input.dateTo, symbols: input.symbols },
    availableCoverage,
  };
}

export function assertCompleteSymbolCoverage(input: MarketRequest, bars: Bar[], code = "market_symbols_missing"): void {
  const present = new Set(bars.map((bar) => bar.symbol));
  const missingSymbols = input.symbols.filter((symbol) => !present.has(symbol));
  if (missingSymbols.length) {
    throw new ApiError(422, code, "Market data is missing one or more requested symbol sleeves", {
      missingSymbols,
      requestedSymbols: input.symbols,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });
  }
}

function validateBar(bar: Bar): void {
  const prices = [bar.open, bar.high, bar.low, bar.close];
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(bar.timestamp)
    || prices.some((value) => !Number.isFinite(value) || value <= 0)
    || !Number.isFinite(bar.volume)
    || bar.volume < 0
    || bar.high < Math.max(bar.open, bar.close, bar.low)
    || bar.low > Math.min(bar.open, bar.close, bar.high)
  ) {
    throw new ApiError(422, "market_bar_invalid", "The provider returned an invalid daily bar", {
      symbol: bar.symbol,
      date: bar.timestamp,
    });
  }
}

export function analyzeSessionCoverage(input: MarketRequest, bars: Bar[]): SessionCoverage {
  assertCompleteSymbolCoverage(input, bars);
  const grouped = new Map<string, Bar[]>();
  const seen = new Set<string>();
  for (const bar of bars) {
    validateBar(bar);
    const key = `${bar.symbol}:${bar.timestamp}`;
    if (seen.has(key)) {
      throw new ApiError(422, "market_bar_duplicate", "The provider returned duplicate daily bars", {
        symbol: bar.symbol,
        date: bar.timestamp,
      });
    }
    seen.add(key);
    (grouped.get(bar.symbol) ?? (() => { const value: Bar[] = []; grouped.set(bar.symbol, value); return value; })()).push(bar);
  }

  const calendarSymbol = grouped.has("SPY")
    ? "SPY"
    : [...grouped.entries()].sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))[0]?.[0];
  if (!calendarSymbol) throw new ApiError(422, "market_data_empty", "The provider returned no usable market sessions");
  const expectedDates = [...new Set((grouped.get(calendarSymbol) ?? []).map((bar) => bar.timestamp))].sort();
  const firstSession = expectedDates[0];
  const lastSession = expectedDates.at(-1);
  if (!firstSession || !lastSession) throw new ApiError(422, "market_data_empty", "The provider returned no usable market sessions");
  const daysBetween = (start: string, end: string) => Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  if (daysBetween(input.dateFrom, firstSession) > 7 || daysBetween(lastSession, input.dateTo) > 7) {
    throw new ApiError(422, "market_calendar_coverage_incomplete", "The market calendar does not cover the complete requested date range", {
      requested: { start: input.dateFrom, end: input.dateTo },
      returned: { start: firstSession, end: lastSession },
      calendarSymbol,
    });
  }

  const missingBars: Record<string, number> = {};
  const missingDates: Record<string, string[]> = {};
  const incompleteBoundaries: Record<string, { first: string; last: string }> = {};
  for (const symbol of input.symbols) {
    const series = (grouped.get(symbol) ?? []).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const dates = new Set(series.map((bar) => bar.timestamp));
    const missing = expectedDates.filter((date) => !dates.has(date));
    missingBars[symbol] = missing.length;
    if (missing.length) missingDates[symbol] = missing;
    const first = series[0]?.timestamp;
    const last = series.at(-1)?.timestamp;
    if (!first || !last || first > firstSession || last < lastSession) {
      incompleteBoundaries[symbol] = { first: first ?? "missing", last: last ?? "missing" };
    }
  }
  if (Object.keys(incompleteBoundaries).length) {
    throw new ApiError(422, "market_boundary_coverage_incomplete", "One or more symbol sleeves do not cover the complete market-session range", {
      calendarSymbol,
      firstSession,
      lastSession,
      incompleteSymbols: incompleteBoundaries,
    });
  }
  return {
    calendarSymbol,
    expectedSessions: expectedDates.length,
    firstSession,
    lastSession,
    missingBars,
    missingDates,
  };
}

export class FixtureMarketProvider implements MarketProvider {
  async getSnapshot(input: MarketRequest): Promise<SnapshotRecord> {
    const supplied = frozenMarketSnapshot as DataSnapshot;
    const availableCoverage = fixtureCoverage(supplied);
    const coverageDetails = fixtureCoverageDetails(input, availableCoverage);
    if (input.dateFrom < availableCoverage.dateFrom || input.dateTo > availableCoverage.dateTo || input.dateFrom > input.dateTo) {
      throw new ApiError(422, "fixture_coverage_unavailable", "The frozen fixture does not cover the complete requested date range", coverageDetails);
    }
    const missingSymbols = input.symbols.filter((symbol) => !availableCoverage.sleeves[symbol]);
    if (missingSymbols.length) {
      throw new ApiError(422, "fixture_symbols_missing", "The frozen fixture does not contain every requested symbol sleeve", {
        ...coverageDetails,
        missingSymbols,
      });
    }
    const incompleteSymbols = input.symbols.filter((symbol) => {
      const sleeve = availableCoverage.sleeves[symbol]!;
      return sleeve.dateFrom > input.dateFrom || sleeve.dateTo < input.dateTo;
    });
    if (incompleteSymbols.length) {
      throw new ApiError(422, "fixture_symbols_incomplete", "One or more frozen fixture sleeves do not cover the complete requested date range", {
        ...coverageDetails,
        incompleteSymbols,
      });
    }
    const bars = flatten(supplied).filter((bar) =>
      input.symbols.includes(bar.symbol) && bar.timestamp >= input.dateFrom && bar.timestamp <= input.dateTo,
    );
    if (bars.length === 0) {
      throw new ApiError(422, "fixture_range_empty", "The frozen fixture contains no completed market bars in the requested range", coverageDetails);
    }
    assertCompleteSymbolCoverage(input, bars, "fixture_symbols_missing");
    const sessionCoverage = analyzeSessionCoverage(input, bars);
    const fetchedAt = supplied.fetchedAt || "2026-08-26T00:00:00.000Z";
    const request = {
      ...input,
      timeframe: "1Day",
      adjustment: "all",
      frozen: true,
      availableCoverage,
      sourceSnapshotId: supplied.id,
      sourceContentHash: supplied.contentHash,
      sessionCoverage,
    };
    const hash = contentHash({ provider: "fixture", request, bars });
    return {
      id: crypto.randomUUID(),
      provider: "fixture",
      adjustment: "all",
      feed: "frozen",
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      symbols: input.symbols,
      fetchedAt,
      hash,
      request,
      bars,
    };
  }
}

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AlpacaResponse {
  bars?: Record<string, AlpacaBar[]>;
  next_page_token?: string | null;
}

/** Covers both response headers and body reads, even if a transport ignores abort. */
async function withMarketTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const issue = new ApiError(504, "market_provider_timeout", "Alpaca did not respond within the market-data deadline. Retry the run or choose Frozen snapshot.");
  let rejectAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(signal.reason ?? issue);
    signal.addEventListener("abort", rejectAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(issue), timeoutMs);
  try {
    signal.throwIfAborted();
    return await Promise.race([operation(signal), interrupted]);
  } finally {
    clearTimeout(timer);
    if (rejectAbort) signal.removeEventListener("abort", rejectAbort);
  }
}

export class AlpacaMarketProvider implements MarketProvider {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly baseUrl = process.env.ALPACA_DATA_URL || "https://data.alpaca.markets",
    private readonly feed = process.env.ALPACA_FEED || "iex",
    private readonly fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
    private readonly deadlines = { requestMs: 15_000, snapshotMs: 60_000 },
  ) {}

  async getSnapshot(input: MarketRequest): Promise<SnapshotRecord> {
    return withMarketTimeout(signal => this.fetchSnapshot(input, signal), this.deadlines.snapshotMs);
  }

  private async fetchSnapshot(input: MarketRequest, signal: AbortSignal): Promise<SnapshotRecord> {
    const bars: Bar[] = [];
    let pageToken: string | undefined;
    const seenPageTokens = new Set<string>();
    let pageCount = 0;
    do {
      signal.throwIfAborted();
      pageCount += 1;
      if (pageCount > 1_000) throw new ApiError(502, "market_pagination_limit", "Alpaca pagination exceeded 1,000 pages");
      if (pageToken) {
        if (seenPageTokens.has(pageToken)) throw new ApiError(502, "market_pagination_cycle", "Alpaca repeated a pagination token", { pageToken, pageCount });
        seenPageTokens.add(pageToken);
      }
      const url = new URL("/v2/stocks/bars", this.baseUrl);
      url.searchParams.set("symbols", input.symbols.join(","));
      url.searchParams.set("timeframe", "1Day");
      url.searchParams.set("start", `${input.dateFrom}T00:00:00Z`);
      url.searchParams.set("end", `${input.dateTo}T23:59:59Z`);
      url.searchParams.set("adjustment", "all");
      url.searchParams.set("feed", this.feed);
      url.searchParams.set("sort", "asc");
      url.searchParams.set("limit", "10000");
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const body = await withMarketTimeout(async requestSignal => {
        try {
          const response = await this.fetcher(url, {
            signal: requestSignal,
            headers: { "APCA-API-KEY-ID": this.apiKey, "APCA-API-SECRET-KEY": this.apiSecret },
          });
          if (!response.ok) throw new ApiError(502, "market_provider_error", `Alpaca returned ${response.status}`, { provider: "alpaca", status: response.status });
          return await response.json() as AlpacaResponse;
        } catch (error) {
          requestSignal.throwIfAborted();
          if (error instanceof ApiError) throw error;
          throw new ApiError(502, "market_provider_unavailable", "Could not read Alpaca market data. Retry the run or choose Frozen snapshot.");
        }
      }, this.deadlines.requestMs, signal);
      signal.throwIfAborted();
      for (const [symbol, symbolBars] of Object.entries(body.bars ?? {})) {
        for (const bar of symbolBars) {
          bars.push({
            symbol,
            timestamp: bar.t.slice(0, 10),
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v,
          });
        }
      }
      pageToken = body.next_page_token || undefined;
    } while (pageToken);

    bars.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.symbol.localeCompare(b.symbol));
    if (bars.length === 0) throw new ApiError(422, "market_data_empty", "The provider returned no bars for this request");
    assertCompleteSymbolCoverage(input, bars);
    const sessionCoverage = analyzeSessionCoverage(input, bars);
    const request = { ...input, timeframe: "1Day", adjustment: "all", feed: this.feed, sort: "asc", sessionCoverage };
    return {
      id: crypto.randomUUID(),
      provider: "alpaca",
      adjustment: "all",
      feed: this.feed,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      symbols: input.symbols,
      fetchedAt: new Date().toISOString(),
      hash: contentHash({ request, bars }),
      request,
      bars,
    };
  }
}

export function selectMarketProvider(policy: string): MarketProvider {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (policy === "refresh") {
    if (!key || !secret) {
      throw new ApiError(422, "market_credentials_missing", "Refresh requires ALPACA_API_KEY and ALPACA_API_SECRET");
    }
    return new AlpacaMarketProvider(key, secret);
  }
  return new FixtureMarketProvider();
}

export function snapshotForDomain(snapshot: SnapshotRecord): DataSnapshot {
  const grouped: Record<string, MarketBar[]> = {};
  for (const bar of snapshot.bars) {
    (grouped[bar.symbol] ??= []).push({
      date: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    });
  }
  const coverage = snapshot.request.sessionCoverage && typeof snapshot.request.sessionCoverage === "object"
    ? snapshot.request.sessionCoverage as Record<string, unknown>
    : {};
  const missingBars = coverage.missingBars && typeof coverage.missingBars === "object"
    ? coverage.missingBars as Record<string, number>
    : {};
  return {
    id: snapshot.id,
    provider: snapshot.provider,
    symbols: snapshot.symbols as DataSnapshot["symbols"],
    startDate: snapshot.dateFrom,
    endDate: snapshot.dateTo,
    adjustment: "all",
    fetchedAt: snapshot.fetchedAt,
    contentHash: snapshot.hash,
    bars: grouped as DataSnapshot["bars"],
    missingBars: missingBars as DataSnapshot["missingBars"],
  };
}
