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

test("retries a wrapped connection timeout", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const database = {
    async query() {
      attempts += 1;
      if (attempts === 1) {
        const cause = new Error("timeout exceeded when trying to connect");
        throw Object.assign(new Error("database connection failed"), { cause });
      }
      return {};
    },
  };

  await waitForDatabase(database, [10], async (delayMs) => { delays.push(delayMs); });

  expect(attempts).toBe(2);
  expect(delays).toEqual([10]);
  expect(isTransientDatabaseError(new Error("Connection terminated due to connection timeout"))).toBe(true);
});

test("handles cycles in chained database errors", () => {
  const first = Object.assign(new Error("database connection failed"), { cause: undefined as unknown });
  const second = Object.assign(new Error("another database connection failed"), { cause: first });
  first.cause = second;

  expect(isTransientDatabaseError(first)).toBe(false);
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

test("health identifies the deployed build when the host provides an identifier", async () => {
  const app = await harness.app({ buildId: "deployment-build-42" });
  const response = await app.fetch(new Request("http://api.test/api/health"));

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ buildId: "deployment-build-42" });
});
