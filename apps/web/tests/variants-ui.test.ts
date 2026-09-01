import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("variant builder", () => {
  test("keeps one structured change in the primary flow", () => {
    const source = readFileSync(new URL("../src/components/tabs/VariantsTab.vue", import.meta.url), "utf8");

    expect(source).toContain("Try one change");
    expect(source).toContain('<FormSelect\n              id="variant-change"');
    expect(source).toContain('store.createVariants([{');
    expect(source).toContain('<details class="advanced-fields">');
    expect(source).toContain("Enter a value to preview the rule change.");
    expect(source).toContain('`${scope}IndicatorPeriod:${target.index}`');
    expect(source).toContain("store.variantParentVersion?.definition");
    expect(source).not.toContain("v-for=\"(draft,index) in drafts\"");
    expect(source).not.toContain("v-model=\"draft.patch\"");
  });

  test("keeps detailed result data behind progressive disclosure", () => {
    const source = readFileSync(new URL("../src/components/tabs/VariantsTab.vue", import.meta.url), "utf8");

    expect(source).toContain("Compare versions");
    expect(source).toContain("Full comparison");
    expect(source).toContain("Hypothesis and rule changes");
    expect(source).toContain('<details class="dial-disclosure">');
  });
});
