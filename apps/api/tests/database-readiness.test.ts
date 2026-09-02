import { afterEach, expect, test } from "bun:test";
import type { Pool } from "pg";
import { createDatabaseReadinessGate, isTransientDatabaseError, waitForDatabase } from "../src/database-readiness";
import { createApp } from "../src/app";
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

test("coalesces readiness probes and caches only successful checks", async () => {
  let clock = 100;
  let probes = 0;
  const gate = createDatabaseReadinessGate({
    async query() {
      probes += 1;
      await Promise.resolve();
      return {};
    },
  }, [], 5_000, () => clock);

  await Promise.all([gate.wait(), gate.wait(), gate.wait()]);
  expect(probes).toBe(1);
  await gate.wait();
  expect(probes).toBe(1);

  clock = 5_101;
  await gate.wait();
  expect(probes).toBe(2);
  gate.invalidate();
  await gate.wait();
  expect(probes).toBe(3);
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
  expect(await unavailable.json()).toMatchObject({
    error: {
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "The account service is warming up. Try again in a moment.",
    },
  });
  expect(healthy.status).toBe(200);
});

test("retries only readiness probes before resolving a session", async () => {
  const database = await harness.createDatabase();
  let sessionCalls = 0;
  const app = await harness.app({
    databaseRetryDelaysMs: [0, 0],
    databaseReadinessTtlMs: 0,
    resolveSession: async () => {
      sessionCalls += 1;
      return { user: { id: "test-user", email: "trader@example.test", name: "Test trader" } };
    },
  }, database);
  const originalQuery = database.pool.query.bind(database.pool);
  let readinessProbes = 0;

  database.pool.query = (async (sql: unknown, ...args: unknown[]) => {
    if (sql === "SELECT 1") {
      readinessProbes += 1;
      if (readinessProbes === 1) throw Object.assign(new Error("the database system is starting up"), { code: "57P03" });
      if (readinessProbes === 2) throw Object.assign(new Error("connect refused"), { code: "ECONNREFUSED" });
    }
    return originalQuery(sql as never, ...args as never[]);
  }) as Pool["query"];

  try {
    const response = await app.fetch(new Request("http://api.test/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Database wake-up retry",
        symbols: ["AAPL"],
        dateFrom: "2024-01-01",
        dateTo: "2024-12-31",
        initialCapital: 10_000,
      }),
    }));

    expect(response.status).toBe(201);
    expect(readinessProbes).toBe(3);
    expect(sessionCalls).toBe(1);
    expect((await originalQuery("SELECT COUNT(*)::int AS count FROM court_cases")).rows[0]?.count).toBe(1);
  } finally {
    database.pool.query = originalQuery as Pool["query"];
  }
});

test("warms the database before the real Better Auth session lookup", async () => {
  const database = await harness.createDatabase();
  const app = await createApp({
    pool: database.pool,
    databaseRetryDelaysMs: [0, 0],
    databaseReadinessTtlMs: 0,
  });
  const email = `database-wakeup-${crypto.randomUUID()}@example.test`;
  const signup = await app.fetch(new Request("http://api.test/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5173" },
    body: JSON.stringify({ name: "Database wake-up", email, password: "test-password-42" }),
  }));
  const cookie = signup.headers.get("set-cookie")?.split(";", 1)[0];
  const originalQuery = database.pool.query.bind(database.pool);
  let readinessProbes = 0;

  database.pool.query = (async (sql: unknown, ...args: unknown[]) => {
    if (sql === "SELECT 1") {
      readinessProbes += 1;
      if (readinessProbes === 1) throw Object.assign(new Error("the database system is starting up"), { code: "57P03" });
      if (readinessProbes === 2) throw Object.assign(new Error("connect refused"), { code: "ECONNREFUSED" });
    }
    return originalQuery(sql as never, ...args as never[]);
  }) as Pool["query"];

  try {
    expect(signup.status).toBe(200);
    expect(cookie).toContain("session_token=");
    const response = await app.fetch(new Request("http://api.test/api/cases", {
      headers: { cookie: cookie! },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ cases: [] });
    expect(readinessProbes).toBe(3);
  } finally {
    database.pool.query = originalQuery as Pool["query"];
    await app.close();
  }
});

test("returns a retryable response without resolving a session while the database warms", async () => {
  const database = await harness.createDatabase();
  let sessionCalls = 0;
  const app = await harness.app({
    databaseRetryDelaysMs: [0, 0],
    databaseReadinessTtlMs: 0,
    resolveSession: async () => {
      sessionCalls += 1;
      return { user: { id: "test-user", email: "trader@example.test", name: "Test trader" } };
    },
  }, database);
  const originalQuery = database.pool.query.bind(database.pool);
  let readinessProbes = 0;

  database.pool.query = (async (sql: unknown, ...args: unknown[]) => {
    if (sql === "SELECT 1") {
      readinessProbes += 1;
      throw Object.assign(new Error("connect timed out"), { code: "ETIMEDOUT" });
    }
    return originalQuery(sql as never, ...args as never[]);
  }) as Pool["query"];

  try {
    const response = await app.fetch(new Request("http://api.test/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Must not be created",
        symbols: ["AAPL"],
        dateFrom: "2024-01-01",
        dateTo: "2024-12-31",
        initialCapital: 10_000,
      }),
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.json()).toEqual({
      error: {
        code: "AUTH_SERVICE_UNAVAILABLE",
        message: "The account service is warming up. Try again in a moment.",
      },
    });
    expect(readinessProbes).toBe(3);
    expect(sessionCalls).toBe(0);
    expect((await originalQuery("SELECT COUNT(*)::int AS count FROM court_cases")).rows[0]?.count).toBe(0);
  } finally {
    database.pool.query = originalQuery as Pool["query"];
  }
});

test("does not label a permanent database error as a warm-up", async () => {
  const database = await harness.createDatabase();
  let sessionCalls = 0;
  const app = await harness.app({
    databaseRetryDelaysMs: [0, 0],
    databaseReadinessTtlMs: 0,
    resolveSession: async () => {
      sessionCalls += 1;
      return { user: { id: "test-user", email: "trader@example.test", name: "Test trader" } };
    },
  }, database);
  const originalQuery = database.pool.query.bind(database.pool);
  let readinessProbes = 0;

  database.pool.query = (async (sql: unknown, ...args: unknown[]) => {
    if (sql === "SELECT 1") {
      readinessProbes += 1;
      throw Object.assign(new Error("permission denied"), { code: "42501" });
    }
    return originalQuery(sql as never, ...args as never[]);
  }) as Pool["query"];

  try {
    const response = await app.fetch(new Request("http://api.test/api/cases"));

    expect(response.status).toBe(500);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: "internal_error" } });
    expect(readinessProbes).toBe(1);
    expect(sessionCalls).toBe(0);
  } finally {
    database.pool.query = originalQuery as Pool["query"];
  }
});

test("maps a transient store read failure to 503 without retrying the route", async () => {
  const database = await harness.createDatabase();
  let sessionCalls = 0;
  const app = await harness.app({
    databaseRetryDelaysMs: [],
    databaseReadinessTtlMs: 0,
    resolveSession: async () => {
      sessionCalls += 1;
      return { user: { id: "test-user", email: "trader@example.test", name: "Test trader" } };
    },
  }, database);
  const originalQuery = database.pool.query.bind(database.pool);
  let listAttempts = 0;

  database.pool.query = (async (sql: unknown, ...args: unknown[]) => {
    const statement = typeof sql === "string" ? sql : String((sql as { text?: unknown })?.text ?? "");
    if (statement.includes("FROM court_cases")) {
      listAttempts += 1;
      throw Object.assign(new Error("connection terminated unexpectedly"), { code: "08006" });
    }
    return originalQuery(sql as never, ...args as never[]);
  }) as Pool["query"];

  try {
    const response = await app.fetch(new Request("http://api.test/api/cases"));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.json()).toMatchObject({ error: { code: "AUTH_SERVICE_UNAVAILABLE" } });
    expect(sessionCalls).toBe(1);
    expect(listAttempts).toBe(1);
  } finally {
    database.pool.query = originalQuery as Pool["query"];
  }
});

test("does not advise retrying a mutation after its database state becomes uncertain", async () => {
  const database = await harness.createDatabase();
  const app = await harness.app({}, database);
  const originalConnect = database.pool.connect.bind(database.pool);
  let insertAttempts = 0;

  database.pool.connect = (async () => {
    const client = await originalConnect();
    const originalClientQuery = client.query.bind(client);
    client.query = (async (sql: unknown, ...args: unknown[]) => {
      const statement = typeof sql === "string" ? sql : String((sql as { text?: unknown })?.text ?? "");
      if (statement.includes("INSERT INTO court_cases")) {
        insertAttempts += 1;
        throw Object.assign(new Error("connection terminated unexpectedly"), { code: "08006" });
      }
      return originalClientQuery(sql as never, ...args as never[]);
    }) as typeof client.query;
    return client;
  }) as Pool["connect"];

  try {
    const response = await app.fetch(new Request("http://api.test/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ambiguous mutation",
        symbols: ["AAPL"],
        dateFrom: "2024-01-01",
        dateTo: "2024-12-31",
        initialCapital: 10_000,
      }),
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(await response.json()).toEqual({
      error: {
        code: "DATABASE_STATE_UNCERTAIN",
        message: "The database connection was interrupted. Reload and check the saved state before trying again.",
      },
    });
    expect(insertAttempts).toBe(1);
    database.pool.connect = originalConnect as Pool["connect"];
    expect((await database.pool.query("SELECT COUNT(*)::int AS count FROM court_cases")).rows[0]?.count).toBe(0);
  } finally {
    database.pool.connect = originalConnect as Pool["connect"];
  }
});

test("health identifies the deployed build when the host provides an identifier", async () => {
  const app = await harness.app({ buildId: "deployment-build-42" });
  const response = await app.fetch(new Request("http://api.test/api/health"));

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ buildId: "deployment-build-42" });
});
