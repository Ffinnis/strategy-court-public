import { expect, test } from "bun:test";
import type { Pool } from "pg";
import { createAuth } from "../src/auth";

test("rejects the documented placeholder auth secret in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    expect(() => createAuth({} as Pool, {
      secret: "replace-with-at-least-32-random-characters",
    })).toThrow("non-placeholder secret");
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
