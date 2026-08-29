import { describe, expect, test } from "bun:test";
import { indicatorPeriodTargets, withIndicatorPeriod } from "../src/services/strategyVariantControls";
import type { ConditionNode } from "../src/types";

describe("strategy variant controls", () => {
  test("finds and immutably updates periods nested inside lag, arithmetic, and absolute expressions", () => {
    const condition: ConditionNode = {
      left: {
        operation: "add",
        left: { lag: { value: { indicator: "sma", parameters: { period: 120, source: "close" } }, bars: 1 } },
        right: { absolute: { indicator: "rsi", parameters: { period: 14, source: "close" } } },
      },
      operator: "gt",
      right: { constant: 0 },
    };

    expect(indicatorPeriodTargets(condition).map((target) => [target.index, target.label, target.period])).toEqual([
      [0, "Simple moving average", 120],
      [1, "Relative strength index", 14],
    ]);

    const changed = withIndicatorPeriod(condition, 1, 21);
    expect(changed.left?.right?.absolute?.parameters?.period).toBe(21);
    expect(condition.left?.right?.absolute?.parameters?.period).toBe(14);
  });
});
