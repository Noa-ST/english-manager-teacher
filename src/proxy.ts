import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_PATH } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { resolveProfileForAuthUser } from "@/lib/rbac";
import {
  isAdminApiPath,
  isAdminPagePath,
  isStudentApiPath,
  isStudentPagePath,
} from "@/lib/routes";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import type { ApiFailure } from "@/types/api";

function buildPerRequestCsp(nonce: string): string {
  const env = getServerEnv();
  const origins = ["https://res.cloudinary.com", "https://api.cloudinary.com"];
  for (const raw of [env.SUPABASE_URL, env.STORAGE_PUBLIC_URL]) {
    if (!raw?.trim()) continue;
    try {
      origins.push(new URL(raw.trim()).origin);
    } catch {
      // ignore invalid URL
    }
  }
  const mediaList = Array.from(new Set(origins)).join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${mediaList}`,
    `media-src 'self' blob: ${mediaList}`,
    "font-src 'self' data:",
    `connect-src 'self' ${mediaList}`,
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function applySecurityHeaders(
  response: NextResponse,
  nonce: string,
  csp: string,
): NextResponse {
  response.headers.set("x-nonce", nonce);
  response.headers.set("Content-Security-Policy-Report-Only", csp);
  response.headers.delete("Content-Security-Policy");
  return response;
}

/**
 * Proxy (Middleware) — Supabase SSR Session Refresh + Optimistic RBAC Gate.
 *
 * 1. Refreshes Supabase Auth session cookies on every request.
 * 2. Protects ADMIN pages/APIs (role === "admin") and STUDENT pages/APIs (role === "student" | "admin").
 * 3. Server Components, Route Handlers, and PostgreSQL RLS still enforce the final security boundary.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildPerRequestCsp(nonce);

  const isAdminPage = isAdminPagePath(pathname);
  const isAdminApi = isAdminApiPath(pathname);
  const isStudentPage = isStudentPagePath(pathname);
  const isStudentApi = isStudentApiPath(pathname);

  const isPublicApi =
    pathname.startsWith("/api/public/") ||
    (pathname.startsWith("/api/viewer/") &&
      pathname !== "/api/viewer/student-portal/verify");

  // 1. Pure public APIs never use auth session cookies -> skip Supabase Auth roundtrip completely.
  if (isPublicApi) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy-Report-Only", csp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return applySecurityHeaders(res, nonce, csp);
  }

  // 2. Protected APIs (/api/admin/*, /api/student/*):
  // Every route handler already enforces requireAdminApi() / requireStudentApi() before executing.
  // Fast-reject in 0ms when no auth credentials exist; otherwise avoid duplicating getUser() + profiles REST calls twice per API request.
  if (isAdminApi || isStudentApi) {
    const hasSbCookie = request.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith("sb-"));
    const hasBearer =
      isStudentApi &&
      (request.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");

    if (!hasSbCookie && !hasBearer) {
      const body: ApiFailure = {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      };
      return applySecurityHeaders(NextResponse.json(body, { status: 401 }), nonce, csp);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy-Report-Only", csp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return applySecurityHeaders(res, nonce, csp);
  }

  // 3. Page requests: refresh Supabase session if sb-* cookie is present.
  const { response, user } = await updateSupabaseSession(request, {
    "x-nonce": nonce,
    "Content-Security-Policy-Report-Only": csp,
  });

  if (!isAdminPage && !isStudentPage) {
    return applySecurityHeaders(response, nonce, csp);
  }

  // Unauthenticated request to protected page
  if (!user) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), nonce, csp);
  }

  // Resolve verified role (DB profiles -> server-only app_metadata)
  const profile = await resolveProfileForAuthUser(user);
  if (!profile || !profile.isActive) {
    return applySecurityHeaders(NextResponse.redirect(new URL(LOGIN_PATH, request.url)), nonce, csp);
  }

  // Admin page gate
  if (isAdminPage && profile.role !== "admin") {
    return applySecurityHeaders(NextResponse.redirect(new URL("/student", request.url)), nonce, csp);
  }

  // Student page gate
  return applySecurityHeaders(response, nonce, csp);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
