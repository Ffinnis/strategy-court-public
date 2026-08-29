export class ApiError extends Error {
  constructor(message: string, readonly code = "REQUEST_FAILED", readonly details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export type ApiActor = "user" | "agent";

export interface ApiDownload {
  blob: Blob;
  filename: string;
}

export function filenameFromDisposition(value: string | null, fallback: string): string {
  const encoded = value?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = value?.match(/filename="([^"]+)"/i)?.[1];
  const bare = value?.match(/filename=([^;]+)/i)?.[1]?.trim();
  let decoded = encoded ?? quoted ?? bare ?? fallback;
  try { decoded = decodeURIComponent(decoded); } catch { /* Keep the server-provided text. */ }
  const safe = decoded.replaceAll(/[\\/\u0000-\u001f\u007f]/g, "-").trim();
  return safe || fallback;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, actor: ApiActor = "user"): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Actor": actor,
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const issue = data.error as { code?: string; message?: string; details?: unknown } | undefined;
    throw new ApiError(issue?.message ?? `Request failed with status ${response.status}`, issue?.code, issue?.details);
  }
  return data as T;
}

export async function apiDownload(path: string, fallbackFilename: string, actor: ApiActor = "user"): Promise<ApiDownload> {
  const csv = new URLSearchParams(path.split("?", 2)[1] ?? "").get("format") === "csv";
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      Accept: csv ? "text/csv" : "application/json",
      "X-Actor": actor,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    const issue = data.error as { code?: string; message?: string; details?: unknown } | undefined;
    throw new ApiError(issue?.message ?? `Request failed with status ${response.status}`, issue?.code, issue?.details);
  }
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get("content-disposition"), fallbackFilename),
  };
}

export function saveDownload(download: ApiDownload): void {
  const url = URL.createObjectURL(download.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = download.filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const unwrap = <T>(value: unknown, key: string): T => {
  if (value && typeof value === "object" && key in value) return (value as Record<string, T>)[key] as T;
  return value as T;
};
