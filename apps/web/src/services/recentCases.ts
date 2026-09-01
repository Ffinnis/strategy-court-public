import { apiRequest } from "@/services/api";
import { getCurrentScope, onScopeDispose, readonly, ref, watch, type Ref } from "vue";

export interface RecentCase {
  id: string;
  name: string;
  symbols: string[];
  startDate: string;
  endDate: string;
  status: string;
  updatedAt: string;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

export function normalizeRecentCase(value: unknown): RecentCase | null {
  const item = record(value);
  const id = typeof item.id === "string" ? item.id : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    symbols: Array.isArray(item.symbols) ? item.symbols.filter((symbol): symbol is string => typeof symbol === "string") : [],
    startDate: String(item.dateFrom ?? item.startDate ?? ""),
    endDate: String(item.dateTo ?? item.endDate ?? ""),
    status: String(item.status ?? "draft"),
    updatedAt: String(item.updatedAt ?? item.createdAt ?? ""),
  };
}

export function recentCaseStatus(status: string): string {
  return ({
    draft: "Rules needed",
    confirmed: "Ready to test",
    queued: "Queued",
    running: "Court running",
    evaluated: "Evidence ready",
    invalid: "Needs revision",
  } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
}

export async function loadRecentCases(signal?: AbortSignal): Promise<RecentCase[]> {
  const payload = await apiRequest<{ cases?: unknown }>("/api/cases?offset=0&limit=5", { signal });
  return (Array.isArray(payload.cases) ? payload.cases : [])
    .map(normalizeRecentCase)
    .filter((item): item is RecentCase => item !== null);
}

export function useRecentCases(
  accountId: Readonly<Ref<string | null>>,
  active: Readonly<Ref<boolean>>,
) {
  const cases = ref<RecentCase[]>([]);
  const loading = ref(false);
  const error = ref("");
  let request: AbortController | null = null;

  async function refresh(): Promise<void> {
    request?.abort();
    const requestAccountId = accountId.value;
    if (!active.value || !requestAccountId) {
      request = null;
      cases.value = [];
      error.value = "";
      loading.value = false;
      return;
    }
    const controller = new AbortController();
    request = controller;
    loading.value = true;
    error.value = "";
    try {
      const nextCases = await loadRecentCases(controller.signal);
      if (request === controller && accountId.value === requestAccountId && active.value) cases.value = nextCases;
    } catch (issue) {
      if (controller.signal.aborted || request !== controller || accountId.value !== requestAccountId || !active.value) return;
      error.value = issue instanceof Error ? issue.message : "Could not load your investigations.";
    } finally {
      if (request === controller && accountId.value === requestAccountId && active.value && !controller.signal.aborted) loading.value = false;
    }
  }

  watch([active, accountId], ([isActive, nextAccountId]) => {
    request?.abort();
    request = null;
    cases.value = [];
    error.value = "";
    loading.value = false;
    if (isActive && nextAccountId) void refresh();
  }, { immediate: true, flush: "sync" });

  if (getCurrentScope()) onScopeDispose(() => request?.abort());
  return { cases: readonly(cases), loading: readonly(loading), error: readonly(error), refresh };
}
