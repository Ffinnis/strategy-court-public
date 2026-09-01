import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  formatCalendarDate,
  getCalendarMonthGrid,
  moveCalendarDay,
  moveCalendarMonth,
  parseCalendarDate,
} from "../src/components/forms/calendar";

describe("custom form controls", () => {
  test("calendar math remains date-only across month, leap-year, and range boundaries", () => {
    const leapDay = parseCalendarDate("2024-02-29");
    expect(leapDay).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseCalendarDate("2023-02-29")).toBeNull();
    expect(formatCalendarDate(moveCalendarDay(leapDay!, 1))).toBe("2024-03-01");
    expect(formatCalendarDate(moveCalendarMonth(leapDay!, 12))).toBe("2025-02-28");
    expect(formatCalendarDate(moveCalendarMonth(parseCalendarDate("2024-12-31")!, -60))).toBe("2019-12-31");

    const grid = getCalendarMonthGrid(
      { year: 2020, month: 1, day: 1 },
      parseCalendarDate("2020-01-02"),
      parseCalendarDate("2020-01-31"),
    );
    expect(grid).toHaveLength(42);
    expect(grid[0]).toMatchObject({ value: "2019-12-30", inMonth: false, disabled: true });
    expect(grid.find((day) => day.value === "2020-01-02")).toMatchObject({ inMonth: true, disabled: false });
  });

  test("the intake owns its select, calendar, and ticker chip UI", () => {
    const select = readFileSync(new URL("../src/components/forms/FormSelect.vue", import.meta.url), "utf8");
    const date = readFileSync(new URL("../src/components/forms/FormDatePicker.vue", import.meta.url), "utf8");
    const chip = readFileSync(new URL("../src/components/forms/FormChip.vue", import.meta.url), "utf8");
    const intake = readFileSync(new URL("../src/pages/CaseIntakePage.vue", import.meta.url), "utf8");

    expect(select).not.toContain("<select");
    expect(select).toContain('role="combobox"');
    expect(select).toContain('role="listbox"');
    expect(date).not.toContain('type="date"');
    expect(date).toContain('role="grid"');
    expect(date).toContain("button:hover:not(:disabled):not(.calendar-day--selected)");
    expect(date).toContain("calendar-day--today:not(.calendar-day--selected):not(:disabled)");
    expect(chip).toContain("padding-inline: 11px");
    expect(chip).toContain(".form-chip:has(button)");
    expect(intake).toContain("<FormChip");
    expect(intake).toContain("<FormDatePicker");
  });

  test("an open select stays above the sticky workspace tabs", () => {
    const select = readFileSync(new URL("../src/components/forms/FormSelect.vue", import.meta.url), "utf8");
    const workspace = readFileSync(new URL("../src/pages/CaseWorkspacePage.vue", import.meta.url), "utf8");
    const selectLayer = Number(select.match(/\.form-select--open\s*\{[^}]*z-index:\s*(\d+)/s)?.[1]);
    const tabsLayer = Number(workspace.match(/\.workspace-tabs\s*\{[^}]*z-index:\s*(\d+)/s)?.[1]);

    expect(selectLayer).toBeGreaterThan(tabsLayer);
  });

  test("selecting an option closes the menu before notifying its parent", () => {
    const select = readFileSync(new URL("../src/components/forms/FormSelect.vue", import.meta.url), "utf8");
    const selection = select.match(/function selectOption\(index: number\) \{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? "";

    expect(selection.indexOf("closeMenu(true)")).toBeGreaterThanOrEqual(0);
    expect(selection.indexOf("closeMenu(true)")).toBeLessThan(selection.indexOf("model.value = option.value"));
    expect(select).toContain('@click.stop="selectOption(index)"');
  });

  test("workspace tabs do not combine keyed cached panels with an out-in transition", () => {
    const workspace = readFileSync(new URL("../src/pages/CaseWorkspacePage.vue", import.meta.url), "utf8");

    expect(workspace).toContain("<KeepAlive :max=\"6\">");
    expect(workspace).not.toContain('<Transition name="workspace-panel"');
  });

  test("Vue sources do not use native select or date controls", () => {
    const sourceRoot = new URL("../src/", import.meta.url);
    const vueFiles = [...new Bun.Glob("**/*.vue").scanSync(fileURLToPath(sourceRoot))].sort();
    const violations = vueFiles.flatMap((file) => {
      const source = readFileSync(new URL(file, sourceRoot), "utf8");
      return [
        /<select\b/i.test(source) && `${file}: native <select>`,
        /<input\b[^>]*\btype\s*=\s*(?:"date"|'date'|date(?=\s|\/?\>))/is.test(source) && `${file}: native date input`,
      ].filter(Boolean);
    });

    expect(violations).toEqual([]);
  });
});
