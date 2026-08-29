import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createPinia, setActivePinia } from "pinia";
import { flattenFormula, normalizeSharedIndicator, normalizeSharedReport } from "../src/data/shared";
import { apiDownload, filenameFromDisposition } from "../src/services/api";
import { normalizeMarketEvidence, useCourtStore } from "../src/stores/court";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("public sharing contracts", () => {
  test("download responses keep server filenames and request the declared representation", async () => {
    expect(filenameFromDisposition("attachment; filename=report.csv", "fallback.csv")).toBe("report.csv");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''trade%20ledger.csv", "fallback.csv")).toBe("trade ledger.csv");
    expect(filenameFromDisposition("attachment; filename=../unsafe.csv", "fallback.csv")).toBe("..-unsafe.csv");

    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain("/api/shared/reports/token/export?format=csv");
      expect(new Headers(init?.headers).get("Accept")).toBe("text/csv");
      return new Response("symbol,net_profit\r\nSPY,12.5\r\n", {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": "attachment; filename=trades.csv",
        },
      });
    }) as typeof fetch;
    const file = await apiDownload("/api/shared/reports/token/export?format=csv", "fallback.csv");
    expect(file.filename).toBe("trades.csv");
    expect(await file.blob.text()).toContain("SPY,12.5");
  });

  test("owner and shared pages expose the full share lifecycle and both export formats", () => {
    const controls = readFileSync(new URL("../src/components/OwnerShareControls.vue", import.meta.url), "utf8");
    const audit = readFileSync(new URL("../src/components/tabs/AuditTab.vue", import.meta.url), "utf8");
    const catalog = readFileSync(new URL("../src/pages/IndicatorCatalogPage.vue", import.meta.url), "utf8");
    const report = readFileSync(new URL("../src/pages/SharedReportPage.vue", import.meta.url), "utf8");
    const indicator = readFileSync(new URL("../src/pages/SharedIndicatorPage.vue", import.meta.url), "utf8");
    expect(controls).toContain("/share");
    expect(controls).toContain("mutate('rotate')");
    expect(controls).toContain("mutate('revoke')");
    expect(audit).toContain("downloadReport('csv')");
    expect(report).toContain("download('csv')");
    expect(indicator).toContain("downloadDefinition('csv')");
    expect(`${audit}\n${catalog}\n${indicator}`).toContain("OwnerShareControls");
  });

  test("report normalization exposes the PRD fields without owner identifiers", () => {
    const report = normalizeSharedReport({
      schemaVersion: 1,
      case: { name: "Trend test", description: "Daily SMA baseline", symbols: ["SPY"], dateRange: { start: "2020-01-02", end: "2024-12-31" }, initialCapital: 10_000, profile: "balanced" },
      strategyVersion: { version: 2, interpretation: "Buy above SMA 120.", evaluationInformed: true },
      strategyDefinition: { direction: "long", entry: { left: { source: "close" }, operator: "gt", right: { indicator: "sma", parameters: { period: 120 } } } },
      run: { summary: "Inconclusive", engineVersion: "court/1", reproducibilityId: "hash" },
      verdicts: [{ category: "execution_resilience", verdict: "Warning", finding: "Costs reduce the edge.", evidence: { stressedReturn: 1.2 }, thresholds: ["Warning below 2%"] }],
      trades: [{ symbol: "SPY", entryDate: "2024-01-02", entryPrice: 470, exitDate: "2024-02-02", exitPrice: 480, netProfit: 10, costs: 1, exitReason: "signal_exit" }],
      versionHistory: [{ version: 1, interpretation: "Original", confirmed: true }, { version: 2, parentVersion: 1, interpretation: "Variant", evaluationInformed: true }],
      assumptions: { executionTiming: "next_open" },
      dataMetadata: { provider: "fixture", adjustment: "all", dateRange: { start: "2020-01-02", end: "2024-12-31" }, snapshotHash: "snapshot", barCount: 1200 },
    });
    expect(report.name).toBe("Trend test");
    expect(report.summary).toBe("Inconclusive");
    expect(report.verdicts[0]).toMatchObject({ category: "Execution resilience", status: "Warning", measure: "Stressed return: 1.2" });
    expect(report.trades[0]).toMatchObject({ symbol: "SPY", exitReason: "Signal exit" });
    expect(report.versions).toHaveLength(2);
    expect(report.data.find((item) => item.label === "Snapshot hash")?.value).toBe("snapshot");
  });

  test("indicator normalization keeps inputs, dependency manifests and inspectable formula leaves", () => {
    const indicator = normalizeSharedIndicator({
      schemaVersion: 1,
      key: "root",
      name: "Range filter",
      version: 3,
      inputs: [{ name: "period", type: "integer", default: 14 }],
      dependencies: ["dependency_1"],
      dependencyDefinitions: [{ key: "dependency_1", name: "Base range", version: 1 }],
      formula: { operation: "divide", left: { indicator: "atr", parameters: { period: 14 } }, right: { source: "close" } },
    });
    expect(indicator.inputs).toHaveLength(1);
    expect(indicator.dependencyDefinitions[0]?.key).toBe("dependency_1");
    expect(flattenFormula(indicator.formula)).toEqual(expect.arrayContaining([
      { path: "formula · Operation", value: "divide" },
      { path: "formula · Left · Indicator", value: "atr" },
      { path: "formula · Right · Source", value: "close" },
    ]));
  });
});

describe("honest sample and market evidence", () => {
  test("market evidence accepts record and nested series shapes, sorts bars and preserves regimes", () => {
    const evidence = normalizeMarketEvidence({
      SPY: { regimes: { "2024-01-02": "positive_low_volatility" }, bars: [
        { timestamp: "2024-01-03T00:00:00Z", open: 11, high: 12, low: 10, close: 11.5, volume: 120 },
        { date: "2024-01-02", open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
      ] },
      AAPL: [{ date: "bad", open: "10", high: 11, low: 9, close: 10 }],
    });
    expect(evidence.SPY?.map((bar) => bar.date)).toEqual(["2024-01-02", "2024-01-03"]);
    expect(evidence.SPY?.[0]?.regime).toBe("Positive low volatility");
    expect(evidence.AAPL).toBeUndefined();
  });

  test("the web bundle contains sample intake only, not fabricated Court output", () => {
    const demo = readFileSync(new URL("../src/data/demo.ts", import.meta.url), "utf8");
    const store = readFileSync(new URL("../src/stores/court.ts", import.meta.url), "utf8");
    for (const forbidden of ["demoCourtResult", "demoVariantVersions", "demoReplay", "createDemoCase", "rawEquity", "Offline Court completed", "Trend confirmation", "Faster time exit", "Tighter loss boundary"]) {
      expect(`${demo}\n${store}`).not.toContain(forbidden);
    }
  });

  test("an unavailable API leaves the sample retryable and never creates a local case", async () => {
    setActivePinia(createPinia());
    globalThis.fetch = (async () => { throw new TypeError("Network unavailable"); }) as typeof fetch;
    const store = useCourtStore();
    expect(await store.createSample()).toBeNull();
    expect(store.currentCase).toBeNull();
    expect(store.error).toContain("Check the API, then retry");
  });
});
