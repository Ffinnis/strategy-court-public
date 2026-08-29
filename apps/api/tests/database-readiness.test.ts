import { afterEach, expect, test } from "bun:test";
import { isTransientDatabaseError, waitForDatabase } from "../src/database-readiness";
import { createTestHarness } from "./test-database";

const harness = createTestHarness();

afterEach(() => harness.cleanup());

test("waits through a restarting Postgres instance", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const database = {
    async query() {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("the database system is starting up"), { code: "57P03" });
      return {};
    },
  };

  await waitForDatabase(database, [10, 20], async (delayMs) => { delays.push(delayMs); });

  expect(attempts).toBe(3);
  expect(delays).toEqual([10, 20]);
});

test("does not retry a permanent database error", async () => {
  let attempts = 0;
  const database = {
    async query() {
      attempts += 1;
      throw Object.assign(new Error("permission denied"), { code: "42501" });
    },
  };

  await expect(waitForDatabase(database, [10], async () => {})).rejects.toThrow("permission denied");
  expect(attempts).toBe(1);
  expect(isTransientDatabaseError({ code: "08006" })).toBe(true);
});

test("health reports unavailable until Postgres accepts queries", async () => {
  const database = await harness.createDatabase();
  const app = await harness.app({}, database);
  const originalQuery = database.pool.query.bind(database.pool);

  database.pool.query = (async () => {
    throw Object.assign(new Error("the database system is starting up"), { code: "57P03" });
  }) as typeof database.pool.query;
  const unavailable = await app.fetch(new Request("http://api.test/api/health"));
  database.pool.query = originalQuery as typeof database.pool.query;
  const healthy = await app.fetch(new Request("http://api.test/api/health"));

  expect(unavailable.status).toBe(503);
  expect(unavailable.headers.get("retry-after")).toBe("5");
  expect(await unavailable.json()).toMatchObject({ code: "AUTH_SERVICE_UNAVAILABLE" });
  expect(healthy.status).toBe(200);
});
