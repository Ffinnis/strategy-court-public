import { describe, expect, test } from "bun:test";
import {
  intakeStepHasErrors,
  validateCaseIntake,
  type CaseIntakeErrors,
} from "../src/lib/case-intake-validation";
import type { CaseInput } from "../src/types";

const maximumDate = "2026-08-30";
function validInput(overrides: Partial<CaseInput> = {}): CaseInput {
  return {
    name: "Trend following",
    description: "Buy above the 120-day average. Sell below it.",
    symbols: ["QQQ"],
    startDate: "2020-01-02",
    endDate: "2024-12-31",
    initialCapital: 10_000,
    commissionBpsPerSide: 0,
    slippageBpsPerSide: 5,
    ...overrides,
  };
}

function runtimeInput(field: keyof CaseInput, value: unknown): CaseInput {
  return { ...validInput(), [field]: value } as CaseInput;
}

describe("case intake validation", () => {
  test("accepts a complete setup and leaves the input unchanged", () => {
    const input = validInput({ name: "  Trend following  ", description: `  ${"r".repeat(20)}  ` });
    const original = structuredClone(input);
    Object.freeze(input.symbols);
    Object.freeze(input);
    expect(validateCaseIntake(input, maximumDate)).toEqual({});
    expect(input).toEqual(original);
  });

  test("checks trimmed name and description boundaries", () => {
    for (const length of [3, 90]) {
      expect(validateCaseIntake(validInput({ name: `  ${"a".repeat(length)}  ` }), maximumDate).name).toBeUndefined();
    }
    for (const length of [0, 2, 91]) {
      expect(validateCaseIntake(validInput({ name: `  ${"a".repeat(length)}  ` }), maximumDate).name).toBeString();
    }
    for (const length of [20, 2000]) {
      expect(validateCaseIntake(validInput({ description: `  ${"r".repeat(length)}  ` }), maximumDate).description).toBeUndefined();
    }
    for (const length of [0, 19, 2001]) {
      expect(validateCaseIntake(validInput({ description: `  ${"r".repeat(length)}  ` }), maximumDate).description).toBeString();
    }
  });

  test("rejects missing and non-string text fields without throwing", () => {
    for (const field of ["name", "description"] as const) {
      for (const value of [undefined, null, 0, false, [], {}, "\t\n   "]) {
        expect(validateCaseIntake(runtimeInput(field, value), maximumDate)[field]).toBeString();
      }
    }
    expect(Object.keys(validateCaseIntake(null as unknown as CaseInput, maximumDate))).toHaveLength(8);
    expect(Object.keys(validateCaseIntake(undefined as unknown as CaseInput, maximumDate))).toHaveLength(8);
  });

  test("accepts one to five supported symbols using the API's case-insensitive matching", () => {
    expect(validateCaseIntake(validInput({ symbols: ["qqq"] }), maximumDate).symbols).toBeUndefined();
    expect(validateCaseIntake(validInput({ symbols: ["AAPL", "QQQ", "SPY", "MSFT", "NVDA"] }), maximumDate).symbols).toBeUndefined();
    expect(validateCaseIntake(validInput({ symbols: [] }), maximumDate).symbols).toBe("Choose at least one symbol.");
    expect(validateCaseIntake(validInput({ symbols: ["AAPL", "QQQ", "SPY", "MSFT", "NVDA", "TSLA"] }), maximumDate).symbols).toBe("Choose no more than five symbols.");
  });

  test("rejects duplicates, unsupported symbols, and malformed symbol values", () => {
    for (const symbols of [["QQQ", "QQQ"], ["QQQ", "qqq"]]) {
      expect(validateCaseIntake(validInput({ symbols }), maximumDate).symbols).toBe("Remove duplicate symbols.");
    }
    for (const symbols of [["BTC"], [" QQQ "], [""], [null], [123], ["SPY", undefined], new Array(1)]) {
      expect(validateCaseIntake(runtimeInput("symbols", symbols), maximumDate).symbols).toBe("Choose symbols from the available list.");
    }
    for (const symbols of [undefined, null, "QQQ", 1, {}]) {
      expect(validateCaseIntake(runtimeInput("symbols", symbols), maximumDate).symbols).toBe("Choose at least one symbol.");
    }
  });

  test("requires real ISO calendar dates, including leap-year validity", () => {
    expect(validateCaseIntake(validInput({ startDate: "2024-02-29", endDate: "2024-03-01" }), maximumDate)).toEqual({});
    for (const value of ["", " ", "2023-02-29", "2024-02-30", "2024-04-31", "2024-00-01", "2024-13-01", "2024-01-00", "0000-01-01", "2024-1-02", "01/02/2024", "2024-01-02T00:00:00Z", " 2024-01-02 ", undefined, null, 20240102]) {
      expect(validateCaseIntake(runtimeInput("startDate", value), maximumDate).startDate).toBe("Choose a valid start date.");
      expect(validateCaseIntake(runtimeInput("endDate", value), maximumDate).endDate).toBe("Choose a valid end date.");
    }
  });

  test("requires start before end and permits an end date equal to the maximum", () => {
    for (const startDate of ["2024-12-31", "2025-01-01"]) {
      expect(validateCaseIntake(validInput({ startDate }), maximumDate)).toMatchObject({
        startDate: "Choose a start date before the end date.",
        endDate: "Choose an end date after the start date.",
      });
    }
    expect(validateCaseIntake(validInput({ endDate: maximumDate }), maximumDate)).toEqual({});
    expect(validateCaseIntake(validInput({ endDate: "2026-08-31" }), maximumDate).endDate).toBe("Choose an end date on or before 2026-08-30.");
    expect(validateCaseIntake(validInput(), "2023-02-29").endDate).toBe("The latest available date could not be verified. Reload and try again.");
  });

  test("uses inclusive form limits for starting capital and per-side costs", () => {
    for (const initialCapital of [1000, 1000.5, 10_000_000]) {
      expect(validateCaseIntake(validInput({ initialCapital }), maximumDate).initialCapital).toBeUndefined();
    }
    for (const initialCapital of [0, 100, 999.99, 10_000_000.01]) {
      expect(validateCaseIntake(validInput({ initialCapital }), maximumDate).initialCapital).toBeString();
    }
    for (const field of ["commissionBpsPerSide", "slippageBpsPerSide"] as const) {
      for (const value of [0, 0.5, 100]) expect(validateCaseIntake(validInput({ [field]: value }), maximumDate)[field]).toBeUndefined();
      for (const value of [-0.01, 100.01, 1000]) expect(validateCaseIntake(validInput({ [field]: value }), maximumDate)[field]).toBeString();
    }
  });

  test("does not coerce empty or nonfinite numeric form values", () => {
    for (const field of ["initialCapital", "commissionBpsPerSide", "slippageBpsPerSide"] as const) {
      for (const value of ["", " ", "0", "1000", null, undefined, false, [], {}, NaN, Infinity, -Infinity]) {
        expect(validateCaseIntake(runtimeInput(field, value), maximumDate)[field]).toBeString();
      }
    }
  });
});

describe("intake step errors", () => {
  test("only strategy fields block step one, and only market fields block step two", () => {
    const fields: Array<keyof CaseInput> = ["name", "description", "symbols", "startDate", "endDate", "initialCapital", "commissionBpsPerSide", "slippageBpsPerSide"];
    for (const field of fields) {
      const errors: CaseIntakeErrors = { [field]: "Correct this field." };
      expect(intakeStepHasErrors(errors, 1)).toBe(["name", "description"].includes(field));
      expect(intakeStepHasErrors(errors, 2)).toBe(["symbols", "startDate", "endDate"].includes(field));
      expect(intakeStepHasErrors(errors, 3)).toBe(true);
    }
  });

  test("empty errors never block progression, while step three includes earlier steps", () => {
    for (const step of [1, 2, 3] as const) {
      expect(intakeStepHasErrors({}, step)).toBe(false);
      expect(intakeStepHasErrors({ name: "", endDate: "" }, step)).toBe(false);
    }
    expect(intakeStepHasErrors({ name: "Enter a name.", symbols: "Choose a symbol." }, 3)).toBe(true);
  });
});
