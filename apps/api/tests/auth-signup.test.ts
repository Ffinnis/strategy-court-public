import { afterEach, expect, test } from "bun:test";
import { createTestHarness } from "./test-database";

const harness = createTestHarness();

afterEach(() => harness.cleanup());

test("creates an email account and resolves its session", async () => {
  const app = await harness.app();
  const email = `signup-${crypto.randomUUID()}@example.test`;
  const signup = await app.fetch(new Request("http://api.test/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5173" },
    body: JSON.stringify({ name: "Signup test", email, password: "test-password-42" }),
  }));

  expect(signup.status).toBe(200);
  const cookie = signup.headers.get("set-cookie")?.split(";", 1)[0];
  expect(cookie).toContain("session_token=");

  const session = await app.fetch(new Request("http://api.test/api/auth/get-session", {
    headers: { cookie: cookie! },
  }));
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({ user: { email } });
});
