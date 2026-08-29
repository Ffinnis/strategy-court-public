import { describe, expect, test } from "bun:test";
import { calendarDate } from "../src/store";

describe("calendarDate", () => {
  test("preserves a PostgreSQL DATE in the server timezone", () => {
    expect(calendarDate(new Date(2024, 11, 30))).toBe("2024-12-30");
  });

  test("passes through the string representation used by lightweight test stores", () => {
    expect(calendarDate("2024-12-30")).toBe("2024-12-30");
  });
});
