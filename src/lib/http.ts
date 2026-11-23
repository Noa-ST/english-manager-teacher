import { NextResponse } from "next/server";

import { requireAdminApi, requireStudentApi } from "@/lib/auth";
import { invalidateCachedUserProfile } from "@/lib/rbac";
import { DomainError } from "@/services/errors";
import { invalidatePublicOverviewCache } from "@/services/viewer-overview.service";
import type { SessionUser } from "@/types";
import type { ApiFailure, ApiSuccess, ErrorCode, PaginationMeta } from "@/types/api";

/**
 * HTTP translator for Route Handlers.
 *
 * Route Handlers stay ~10 lines: parse request -> call service -> respond.
 * All error-to-status mapping lives here, so services never see HTTP.
 */

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  NOT_IMPLEMENTED: 501,
  INTERNAL_ERROR: 500,
};

export function ok<T>(data: T, init?: { status?: number; meta?: PaginationMeta }) {
  const body: ApiSuccess<T> = { ok: true, data, ...(init?.meta ? { meta: init.meta } : {}) };
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function fail(error: unknown) {
  // Re-throw Next.js internal prerender bailout signals so Next.js 16 handles them natively
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string"
  ) {
    throw error;
  }

  if (error instanceof DomainError) {
    const body: ApiFailure = {
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    };
    return NextResponse.json(body, { status: STATUS_BY_CODE[error.code] });
  }

  // Unknown failure: log server-side, never leak internals to the client.
  console.error("[api] Unhandled error", error);
  const body: ApiFailure = {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  };
  return NextResponse.json(body, { status: 500 });
}

/** Parses a JSON body; malformed JSON becomes a 400 instead of a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DomainError("VALIDATION_ERROR", "Request body must be valid JSON");
  }
}

/** Converts URLSearchParams into a plain object for service-side validation. */
export function readQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

export type RouteContext<TParams = Record<string, string | string[] | undefined>> = {
  params: Promise<TParams>;
};

type Handler<TContext extends object> = (request: Request, context: TContext) => Promise<Response>;
type AdminHandler<TContext extends object> = (
  request: Request,
  context: TContext & { session: SessionUser },
) => Promise<Response>;

/** Public endpoint wrapper: uniform error envelope. */
export function publicRoute<TContext extends object = RouteContext>(
  handler: Handler<TContext>,
): Handler<TContext> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return fail(error);
    }
  };
}

/** Protected endpoint wrapper: verifies the admin session BEFORE the handler runs. */
export function adminRoute<TContext extends object = RouteContext>(
  handler: AdminHandler<TContext>,
): Handler<TContext> {
  return async (request, context) => {
    try {
      const session = await requireAdminApi();
      const response = await handler(request, { ...context, session });
      if (request.method !== "GET" && request.method !== "HEAD") {
        invalidatePublicOverviewCache();
        invalidateCachedUserProfile();
      }
      return response;
    } catch (error) {
      return fail(error);
    }
  };
}

/** Student portal endpoint wrapper: verifies authenticated student/admin session BEFORE the handler runs. */
export function studentRoute<TContext extends object = RouteContext>(
  handler: AdminHandler<TContext>,
): Handler<TContext> {
  return async (request, context) => {
    try {
      const session = await requireStudentApi(request);
      return await handler(request, { ...context, session });
    } catch (error) {
      return fail(error);
    }
  };
}
