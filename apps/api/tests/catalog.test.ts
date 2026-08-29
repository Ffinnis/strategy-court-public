import { describe, expect, test } from "bun:test";
import {
  BUILT_IN_INDICATOR_IDS,
  PRIMITIVE_INDICATOR_IDS,
} from "@strategy-court/schemas";
import {
  BUILT_IN_INDICATORS,
  FORMULA_PRIMITIVES,
} from "../src/services/catalog";

describe("built-in indicator catalog", () => {
  test("publishes all 30 visible indicators with complete metadata", () => {
    expect(BUILT_IN_INDICATORS).toHaveLength(30);
    expect(BUILT_IN_INDICATORS.map((indicator) => indicator.id)).toEqual([...BUILT_IN_INDICATOR_IDS]);
    for (const indicator of BUILT_IN_INDICATORS) {
      expect(indicator.available, indicator.id).toBe(true);
      expect(indicator.parameters.map((parameter) => parameter.name), indicator.id).toEqual(indicator.requiredParameters);
      expect(indicator.components.length === 0 || indicator.requiredParameters.includes("component"), indicator.id).toBe(true);
    }
  });

  test("keeps executable formula primitives outside the visible catalog", () => {
    expect(FORMULA_PRIMITIVES.map((indicator) => indicator.id)).toEqual([...PRIMITIVE_INDICATOR_IDS]);
    const visibleIds = new Set<string>(BUILT_IN_INDICATORS.map((indicator) => indicator.id));
    for (const primitiveId of PRIMITIVE_INDICATOR_IDS) expect(visibleIds.has(primitiveId)).toBe(false);
  });
});
