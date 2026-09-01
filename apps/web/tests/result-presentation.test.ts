import { describe, expect, test } from "bun:test";
import { formatProfitFactor, metricDifference, numericMetric, parameterMatrix, runStageIndex } from "../src/services/resultPresentation";
import { evidenceLink } from "../src/services/evidenceLink";
import { useNotifications } from "../src/stores/notifications";
import { createPinia, setActivePinia } from "pinia";
import type { ComparisonVersion, CourtRun } from "../src/types";

describe("honest result presentation", () => {
  test("progress never invents completed sub-stages from percent", () => {
    const run: CourtRun = {id:"run",versionId:"version",status:"running",stage:"baseline",progress:95};
    expect(runStageIndex(run)).toBe(2);
    expect(runStageIndex({...run,stage:"unknown_new_stage"})).toBe(-1);
    expect(runStageIndex({...run,status:"completed",stage:"completed"})).toBe(3);
    expect(runStageIndex(undefined)).toBe(-1);
  });
  test("percentage differences use percentage points, keep negative signs and missing values", () => {
    expect(metricDifference(-7.2,3.8,"netReturnPercent")).toBe("+11.0 pp");
    expect(metricDifference(12.4,9.2,"maximumDrawdownPercent")).toBe("−3.2 pp");
    expect(metricDifference(1.52,1.67,"profitFactor")).toBe("+0.15");
    expect(metricDifference(13,18,"tradeCount")).toBe("+5 trades");
    expect(metricDifference(null,18,"tradeCount")).toBe("Not available");
    expect(metricDifference(0,0,"netReturnPercent")).toBe("0.0 pp");
    expect(numericMetric({metrics:{profitFactor:Infinity}} as unknown as ComparisonVersion,"profitFactor")).toBeNull();
  });
  test("profit factor distinguishes no losses from missing data", () => {
    expect(formatProfitFactor({ profitFactor: 1.456 })).toBe("1.46");
    expect(formatProfitFactor({ profitFactor: null, winningTrades: 4, losingTrades: 0 })).toBe("No losing trades");
    expect(formatProfitFactor({ profitFactor: null, winningTrades: 0, losingTrades: 0 })).toBe("Not reported");
    expect(formatProfitFactor(undefined)).toBe("Not reported");
  });
  test("matrix only contains actual returned trials and distinguishes invalid, missing and zero", () => {
    const matrix=parameterMatrix([
      {path:"/risk/stopLossPercent",baseline:5,value:4,factor:.8,status:"completed",netProfit:120},
      {path:"/risk/stopLossPercent",baseline:5,value:6,factor:1.2,status:"completed",netProfit:-20},
      {path:"/entry/period",factor:.8,status:"invalid",invalidReason:"Fast exceeds slow",netProfit:null},
      {path:"/entry/period",factor:1.2,status:"completed",netProfit:0},
      {path:"/exit/period",factor:1.2,status:"completed",netProfit:null},
      {path:"/exit/period",factor:NaN,netProfit:999},
    ]);
    expect(matrix.cells).toHaveLength(5);
    expect(matrix.paths).toEqual(["/risk/stopLossPercent","/entry/period","/exit/period"]);
    expect(matrix.factors).toEqual([.8,1.2]);
    expect(matrix.cells.map(cell=>cell.state)).toEqual(["profit","loss","invalid","flat","unavailable"]);
    expect(matrix.cells[2]?.reason).toBe("Fast exceeds slow");
  });
  test("private links preserve case, version, run and exact evidence without issuing share tokens", () => {
    const url=new URL(evidenceLink("http://localhost:5173",{caseId:"case-1",versionId:"v-2",runId:"r-3",kind:"trade",id:"SPY / 2024?x=1",actor:"user",revision:1,status:"ready",error:null}));
    expect(url.pathname).toBe("/case/case-1");
    expect(Object.fromEntries(url.searchParams)).toEqual({tab:"evidence",version:"v-2",run:"r-3",kind:"trade",evidence:"SPY / 2024?x=1"});
    expect(url.pathname).not.toContain("report");
  });
});

test("notifications deduplicate, cap at three and can be cleared on account change", () => {
  setActivePinia(createPinia());const notifications=useNotifications();
  notifications.push("Saved");const first=notifications.items[0]!.id;
  notifications.push("Saved");expect(notifications.items).toHaveLength(1);expect(notifications.items[0]!.id).toBe(first);
  notifications.push("Copied");notifications.push("Exported");notifications.push("Completed");
  expect(notifications.items.map(item=>item.message)).toEqual(["Copied","Exported","Completed"]);
  notifications.dismiss(notifications.items[1]!.id);expect(notifications.items).toHaveLength(2);
  notifications.clear();expect(notifications.items).toEqual([]);
});
