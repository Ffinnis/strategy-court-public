export interface DatabaseProbe {
  query(sql: string): Promise<unknown>;
}

const TRANSIENT_CONNECTION_CODES = new Set([
  "57P03",
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
]);

const TRANSIENT_CONNECTION_MESSAGE =
  /database system is starting up|connection terminated unexpectedly|connection terminated due to connection timeout|timeout exceeded when trying to connect/i;

export const AUTH_DATABASE_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000] as const;

export function isTransientDatabaseError(error: unknown): boolean {
  const pending = [error];
  const seen = new Set<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    const issue = current as { cause?: unknown; code?: unknown; message?: unknown };
    const code = typeof issue.code === "string" ? issue.code : "";
    if (TRANSIENT_CONNECTION_CODES.has(code) || code.startsWith("08")) return true;

    const message = typeof issue.message === "string" ? issue.message : "";
    if (TRANSIENT_CONNECTION_MESSAGE.test(message)) return true;

    pending.push(issue.cause);
  }

  return false;
}

export async function waitForDatabase(
  database: DatabaseProbe,
  retryDelaysMs: readonly number[] = AUTH_DATABASE_RETRY_DELAYS_MS,
  sleep: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await database.query("SELECT 1");
      return;
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt >= retryDelaysMs.length) throw error;
      await sleep(retryDelaysMs[attempt]!);
    }
  }
}
