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

export async function apiRequestWithMeta<T>(
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

export async function apiRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await apiRequestWithMeta<T>(url, init);
  return res.data;
}

