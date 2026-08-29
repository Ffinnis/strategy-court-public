import { describe, expect, test } from "bun:test";
import { safeParseDataSnapshot } from "@strategy-court/schemas";
import { expectedSampleResult, frozenMarketSnapshot } from "../src/index.ts";

describe("frozen fixtures", () => {
  test("exports a valid, fully covered market snapshot", () => {
    expect(safeParseDataSnapshot(frozenMarketSnapshot).success).toBe(true);
    expect(frozenMarketSnapshot.contentHash).toBe("sha256:8fce207a1224b9a865924d411af9fb4a1fa08b721b177acdb566903d11706681");
    for (const symbol of frozenMarketSnapshot.symbols) {
      expect(frozenMarketSnapshot.bars[symbol]?.length).toBeGreaterThan(0);
    }
  });

  test("exports the committed golden result identity", () => {
    expect(expectedSampleResult.reproducibilityId).toBe("sha256:7176edcbacca87f8d2ccabedaf58b236ec3ae87a7791a350fa9d2bef45cb2de9");
    expect(expectedSampleResult.summaryLabel).toBe("Fragile");
  });
});
