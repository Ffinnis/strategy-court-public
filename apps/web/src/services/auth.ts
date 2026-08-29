import { createAuthClient } from "better-auth/vue";

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export const authClient = createAuthClient({
  baseURL: apiBase || undefined,
  fetchOptions: { credentials: "include" },
  sessionOptions: {
    refetchOnWindowFocus: true,
    refetchWhenOffline: false,
  },
});

export function safeAuthRedirect(value: unknown, fallback = "/new"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : fallback;
}

