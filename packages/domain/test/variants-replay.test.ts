import { describe, expect, test } from "bun:test";
import { advanceReplay, applyStrategyPatch, compareStrategyVersions, createReplaySession, createVariants, runCourt } from "../src/index.ts";
import type { StrategyVersionRecord } from "@strategy-court/schemas";
import { makeBars, makeSnapshot, makeStrategy } from "./helpers.ts";

describe("controlled variants", () => {
  test("creates immutable evaluation-informed children and compares exact paths", () => {
    const baseline: StrategyVersionRecord = { id: "v1", version: 1, parentVersionId: null, definition: makeStrategy(), source: "user", evaluationInformed: false };
    const [candidate] = createVariants(baseline, [{ name: "Shorter hold", hypothesis: "H", rationale: "R", expectedWeaknessAddressed: "drawdown", patch: { risk: { maxHoldingDays: 5 } } }], { evaluationViewed: true });
    expect(candidate?.parentVersionId).toBe("v1");
    expect(candidate?.evaluationInformed).toBe(true);
    expect(baseline.definition.risk.maxHoldingDays).toBeUndefined();
    if (!candidate) throw new Error("Missing candidate");
    const comparison = compareStrategyVersions({ version: baseline }, { version: candidate });
    expect(comparison.definitionDifferences).toContainEqual({ path: "/risk/maxHoldingDays", before: undefined, after: 5 });
  });

  test("rejects a fourth investigation variant", () => {
    const baseline: StrategyVersionRecord = { id: "v1", version: 1, parentVersionId: null, definition: makeStrategy(), source: "user", evaluationInformed: false };
    const request = [{ name: "A", hypothesis: "H", rationale: "R", expectedWeaknessAddressed: "W", patch: { risk: { maxHoldingDays: 5 } } }];
    expect(() => createVariants(baseline, request, { existingAttemptCount: 3 })).toThrow("at most three");
  });

  test("rejects empty and baseline-equal patches before creating a variant", () => {
    const baseline: StrategyVersionRecord = { id: "v1", version: 1, parentVersionId: null, definition: makeStrategy(), source: "user", evaluationInformed: false };
    const request = (patch: Record<string, unknown>) => [{ name: "A", hypothesis: "H", rationale: "R", expectedWeaknessAddressed: "W", patch }];
    expect(() => createVariants(baseline, request({ risk: {} }))).toThrow("Invalid strategy variants");
    expect(() => applyStrategyPatch(baseline.definition, { costs: { ...baseline.definition.costs } })).toThrow("must change");
    expect(() => createVariants(baseline, request({ costs: { commissionBpsPerSide: baseline.definition.costs.commissionBpsPerSide } }))).toThrow("must change");
    expect(createVariants(baseline, request({ risk: { maxHoldingDays: 5 } }), { existingAttemptCount: 2 })[0]?.version).toBe(4);
  });
});

test("replay reveals only the requested completed bars", () => {
  const bars = makeBars([
    { date: "2024-01-02", open: 10, close: 11 },
    { date: "2024-01-03", open: 12, close: 12 },
    { date: "2024-01-04", open: 13, close: 13 },
  ]);
  const strategy = makeStrategy();
  const snapshot = makeSnapshot(bars);
  const baseline = runCourt({ strategy, snapshot, initialCapital: 1_000 }).baseline.metrics;
  const session = createReplaySession({ id: "r1", strategyVersionId: "v1", strategy, snapshot, range: { start: "2024-01-02", end: "2024-01-04" }, initialCapital: 1_000, baselineMetrics: baseline });
  const first = advanceReplay(session, { mode: "one_bar" }, { strategy, snapshot });
  expect(first.currentDate).toBe("2024-01-02");
  expect(first.result?.trades).toHaveLength(0);
  const finished = advanceReplay(first.session, { mode: "five_bars" }, { strategy, snapshot });
  expect(finished.session.status).toBe("complete");
  expect(finished.newTrades).toHaveLength(1);
});
