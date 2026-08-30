import { describe, expect, test } from "bun:test";
import { safeParseDataSnapshot } from "@strategy-court/schemas";
import { expectedSampleResult, frozenMarketSnapshot } from "../src/index.ts";
import { generateSyntheticSnapshot } from "../src/synthetic-market.ts";

describe("frozen fixtures", () => {
  test("exports a valid, fully covered market snapshot", () => {
    expect(safeParseDataSnapshot(frozenMarketSnapshot).success).toBe(true);
    expect(frozenMarketSnapshot.contentHash).toBe("sha256:ab1d4dd90e134f67b04252af4724a292780ae8470e078a78a6defc26d196ff47");
    expect(frozenMarketSnapshot.provider).toBe("synthetic_demo");
    expect(frozenMarketSnapshot.adjustment).toBe("none");
    expect(generateSyntheticSnapshot()).toEqual(frozenMarketSnapshot);
    for (const symbol of frozenMarketSnapshot.symbols) {
      expect(frozenMarketSnapshot.bars[symbol]?.length).toBeGreaterThan(0);
    }
  });

  test("exports the committed golden result identity", () => {
    expect(expectedSampleResult.reproducibilityId).toBe("sha256:3d3c8a1aad1d6f6adc1e6eeb52669fa8edc44ff2f4d770ae1fea75f5abf4b9d0");
    expect(expectedSampleResult.summaryLabel).toBe("Fragile");
  });
});
