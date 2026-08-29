import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { createAuth } from "./auth";
import { Store } from "./store";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://strategy_court:strategy_court@localhost/strategy_court",
});

try {
  const auth = createAuth(pool);
  await (await getMigrations(auth.options)).runMigrations();
  await new Store(pool).migrate();
  console.log("Better Auth and Strategy Court database migrations are current");
} finally {
  await pool.end();
}
