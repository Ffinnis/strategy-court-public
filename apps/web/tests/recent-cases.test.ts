import { afterEach, expect, test } from "bun:test";
import { effectScope, ref } from "vue";
import { loadRecentCases, normalizeRecentCase, recentCaseStatus, useRecentCases } from "../src/services/recentCases";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("recent investigations normalize the lightweight list response", async () => {
  let requested = "";
  globalThis.fetch = (async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ cases: [{
    id: "case-2",
    name: " RSI pullback ",
    symbols: ["QQQ", 3],
    dateFrom: "2020-01-02",
    dateTo: "2024-12-31",
    status: "evaluated",
    updatedAt: "2026-09-01T06:30:00.000Z",
    }, { name: "Missing id" }], total: 2, offset: 0, nextOffset: null }));
  }) as typeof fetch;

  expect(await loadRecentCases()).toEqual([{
    id: "case-2",
    name: "RSI pullback",
    symbols: ["QQQ"],
    startDate: "2020-01-02",
    endDate: "2024-12-31",
    status: "evaluated",
    updatedAt: "2026-09-01T06:30:00.000Z",
  }]);
  expect(requested).toContain("/api/cases?offset=0&limit=5");
});

test("recent case helpers accept detail-style dates and explain workflow status", () => {
  expect(normalizeRecentCase({ id: "case-1", name: "Trend", startDate: "2023-01-01", endDate: "2024-01-01" }))
    .toMatchObject({ startDate: "2023-01-01", endDate: "2024-01-01", status: "draft" });
  expect(recentCaseStatus("draft")).toBe("Rules needed");
  expect(recentCaseStatus("evaluated")).toBe("Evidence ready");
  expect(recentCaseStatus("needs_review")).toBe("needs review");
});

test("recent investigations include credentials and preserve API errors", async () => {
  let credentials = "";
  globalThis.fetch = (async (_input, init) => {
    credentials = String(init?.credentials);
    return new Response(JSON.stringify({ error: { message: "Database is warming up" } }), { status: 503 });
  }) as typeof fetch;

  await expect(loadRecentCases()).rejects.toThrow("Database is warming up");
  expect(credentials).toBe("include");
});

test("switching from account A to B clears A immediately and rejects A's delayed response", async () => {
  const pending: Array<{ signal?: AbortSignal; resolve: (response: Response) => void }> = [];
  globalThis.fetch = ((_input, init) => new Promise<Response>((resolve) => {
    pending.push({ signal: init?.signal ?? undefined, resolve });
  })) as typeof fetch;
  const accountId = ref<string | null>("account-a");
  const active = ref(true);
  const scope = effectScope();
  const state = scope.run(() => useRecentCases(accountId, active))!;
  const response = (id: string, name: string) => new Response(JSON.stringify({ cases: [{ id, name }] }));

  pending[0]!.resolve(response("case-a", "Private account A case"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.cases.value.map(item => item.id)).toEqual(["case-a"]);

  void state.refresh();
  const delayedA = pending[1]!;
  accountId.value = "account-b";
  expect(delayedA.signal?.aborted).toBe(true);
  expect(state.cases.value).toEqual([]);
  expect(pending).toHaveLength(3);

  pending[2]!.resolve(response("case-b", "Account B case"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.cases.value.map(item => item.id)).toEqual(["case-b"]);

  delayedA.resolve(response("late-case-a", "Late private account A case"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.cases.value.map(item => item.id)).toEqual(["case-b"]);

  accountId.value = null;
  expect(state.cases.value).toEqual([]);
  scope.stop();

  const landing = await Bun.file(new URL("../src/pages/LandingPage.vue", import.meta.url)).text();
  const recent = await Bun.file(new URL("../src/components/RecentInvestigations.vue", import.meta.url)).text();
  expect(landing).toContain(':account-id="sessionState.data.user.id"');
  expect(recent).toContain("accountId: string");
});
