import type { ApiResponse, PaginationMeta } from "@/types/api";

export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.details = details;
  }
}

const inFlightGetRequests = new Map<
  string,
  Promise<{ data: unknown; meta?: PaginationMeta }>
>();

const recentGetBurstCache = new Map<
  string,
  { expiresAt: number; value: { data: unknown; meta?: PaginationMeta } }
>();

const PUBLIC_BURST_TTL_MS = 2_000;

export function clearApiClientCache(): void {
  inFlightGetRequests.clear();
  recentGetBurstCache.clear();
}

async function executeApiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T; meta?: PaginationMeta }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.ok) {
    throw new ApiClientError(
      payload.error.code,
      payload.error.message,
      payload.error.details,
    );
  }

  return { data: payload.data, meta: payload.meta };
}

export async function apiRequestWithMeta<T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T; meta?: PaginationMeta }> {
  const method = (init?.method ?? "GET").toUpperCase();

  // Any mutation invalidates recent burst cache so subsequent GETs see fresh state immediately
  if (method !== "GET") {
    recentGetBurstCache.clear();
    return executeApiFetch<T>(url, init);
  }

  const isBurstCacheable =
    url.startsWith("/api/viewer/") || url.startsWith("/api/public/");
  if (isBurstCacheable) {
    const cached = recentGetBurstCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as { data: T; meta?: PaginationMeta };
    }
  }

  const existingInFlight = inFlightGetRequests.get(url);
  if (existingInFlight) {
    return existingInFlight as Promise<{ data: T; meta?: PaginationMeta }>;
  }

  const requestPromise = executeApiFetch<T>(url, init)
    .then((result) => {
      if (isBurstCacheable) {
        recentGetBurstCache.set(url, {
          expiresAt: Date.now() + PUBLIC_BURST_TTL_MS,
          value: result as { data: unknown; meta?: PaginationMeta },
        });
      }
      return result;
    })
    .finally(() => {
      inFlightGetRequests.delete(url);
    });

  inFlightGetRequests.set(
    url,
    requestPromise as Promise<{ data: unknown; meta?: PaginationMeta }>,
  );
  return requestPromise;
}

export async function apiRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await apiRequestWithMeta<T>(url, init);
  return res.data;
}

