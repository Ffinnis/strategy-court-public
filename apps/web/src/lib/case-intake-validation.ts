import { isCuratedSymbol } from "@strategy-court/schemas";
import { parseCalendarDate } from "../components/forms/calendar";
import type { CaseInput } from "../types";

export type CaseIntakeErrors = Partial<Record<keyof CaseInput, string>>;

function isRealDate(value: unknown): value is string {
  return typeof value === "string" && parseCalendarDate(value) !== null;
}

function isNumberInRange(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

/** The intake deliberately uses tighter limits than the API's general case contract. */
export function validateCaseIntake(input: CaseInput, maximumDate: string): CaseIntakeErrors {
  const value: Partial<CaseInput> = input && typeof input === "object" ? input : {};
  const errors: CaseIntakeErrors = {};
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";

  if (name.length < 3) errors.name = "Enter a strategy name with at least 3 characters.";
  else if (name.length > 90) errors.name = "Keep the strategy name to 90 characters or fewer.";

  if (description.length < 20) errors.description = "Describe the entry and exit rules in at least 20 characters.";
  else if (description.length > 2000) errors.description = "Keep the strategy rules to 2,000 characters or fewer.";

  const symbols = Array.isArray(value.symbols) ? Array.from(value.symbols) : [];
  if (symbols.length === 0) {
    errors.symbols = "Choose at least one symbol.";
  } else if (symbols.length > 5) {
    errors.symbols = "Choose no more than five symbols.";
  } else if (symbols.some((symbol) => typeof symbol !== "string" || !isCuratedSymbol(symbol.toUpperCase()))) {
    errors.symbols = "Choose symbols from the available list.";
  } else if (new Set(symbols.map((symbol) => symbol.toUpperCase())).size !== symbols.length) {
    errors.symbols = "Remove duplicate symbols.";
  }

  const startDate = value.startDate;
  const endDate = value.endDate;
  const validStart = isRealDate(startDate);
  const validEnd = isRealDate(endDate);
  if (!validStart) errors.startDate = "Choose a valid start date.";
  if (!validEnd) errors.endDate = "Choose a valid end date.";
  if (validStart && validEnd && startDate >= endDate) {
    errors.startDate = "Choose a start date before the end date.";
    errors.endDate = "Choose an end date after the start date.";
  }
  if (validEnd) {
    if (!isRealDate(maximumDate)) {
      errors.endDate = "The latest available date could not be verified. Reload and try again.";
    } else if (endDate > maximumDate) {
      errors.endDate = `Choose an end date on or before ${maximumDate}.`;
    }
  }

  if (!isNumberInRange(value.initialCapital, 1_000, 10_000_000)) {
    errors.initialCapital = "Enter starting capital between $1,000 and $10,000,000.";
  }
  if (!isNumberInRange(value.commissionBpsPerSide, 0, 100)) {
    errors.commissionBpsPerSide = "Enter commission between 0 and 100 bps per side.";
  }
  if (!isNumberInRange(value.slippageBpsPerSide, 0, 100)) {
    errors.slippageBpsPerSide = "Enter slippage between 0 and 100 bps per side.";
  }

  return errors;
}

export function intakeStepHasErrors(errors: CaseIntakeErrors, step: 1 | 2 | 3): boolean {
  if (step === 1) return Boolean(errors.name || errors.description);
  if (step === 2) return Boolean(errors.symbols || errors.startDate || errors.endDate);
  return Object.values(errors).some(Boolean);
}
