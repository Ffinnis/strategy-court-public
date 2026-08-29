import { Pool } from "pg";
import { createApp, type ApiApp, type AppOptions, type AuthSession } from "../src/app";

export const TEST_USER_ID = "test-user";

const TEST_SESSION: AuthSession = {
  user: { id: TEST_USER_ID, email: "trader@example.test", name: "Test trader" },
};

export interface TestDatabase {
  pool: Pool;
  schema: string;
}

export function createTestHarness() {
  const baseUrl = process.env.TEST_DATABASE_URL
    || process.env.DATABASE_URL
    || "postgresql://strategy_court:strategy_court@localhost/strategy_court";
  const apps = new Set<ApiApp>();
  const databases = new Set<TestDatabase>();

  async function adminQuery(sql: string): Promise<void> {
    const pool = new Pool({ connectionString: baseUrl });
    try {
      await pool.query(sql);
    } finally {
      await pool.end();
    }
  }

  async function createDatabase(): Promise<TestDatabase> {
    const schema = `test_${crypto.randomUUID().replaceAll("-", "")}`;
    await adminQuery(`CREATE SCHEMA "${schema}"`);
    const database = {
      schema,
      pool: new Pool({ connectionString: baseUrl, options: `-c search_path=${schema}` }),
    };
    databases.add(database);
    return database;
  }

  async function app(options: AppOptions = {}, database?: TestDatabase): Promise<ApiApp> {
    const target = database ?? await createDatabase();
    const instance = await createApp({
      ...options,
      pool: target.pool,
      resolveSession: options.resolveSession ?? (async () => TEST_SESSION),
    });
    await target.pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, TRUE, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID, TEST_SESSION.user.name, TEST_SESSION.user.email],
    );
    apps.add(instance);
    return instance;
  }

  async function closeApp(instance: ApiApp): Promise<void> {
    if (!apps.delete(instance)) return;
    await instance.close();
  }

  async function cleanup(): Promise<void> {
    await Promise.all([...apps].map((instance) => instance.close()));
    apps.clear();
    for (const database of databases) {
      await database.pool.end();
      await adminQuery(`DROP SCHEMA IF EXISTS "${database.schema}" CASCADE`);
    }
    databases.clear();
  }

  return { app, cleanup, closeApp, createDatabase };
}
