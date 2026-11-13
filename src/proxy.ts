import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_PATH } from "@/lib/auth";
import { resolveProfileForAuthUser } from "@/lib/rbac";
import {
  isAdminApiPath,
  isAdminPagePath,
  isStudentApiPath,
  isStudentPagePath,
} from "@/lib/routes";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import type { ApiFailure } from "@/types/api";

/**
 * Proxy (Middleware) — Supabase SSR Session Refresh + Optimistic RBAC Gate.
 *
 * 1. Refreshes Supabase Auth session cookies on every request.
 * 2. Protects ADMIN pages/APIs (role === "admin") and STUDENT pages/APIs (role === "student" | "admin").
 * 3. Server Components, Route Handlers, and PostgreSQL RLS still enforce the final security boundary.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, user } = await updateSupabaseSession(request);

  const isAdminPage = isAdminPagePath(pathname);
  const isAdminApi = isAdminApiPath(pathname);
  const isStudentPage = isStudentPagePath(pathname);
  const isStudentApi = isStudentApiPath(pathname);

  if (!isAdminPage && !isAdminApi && !isStudentPage && !isStudentApi) {
    return response;
  }

  // Unauthenticated request to protected route
  if (!user) {
    if (isAdminApi || isStudentApi) {
      const body: ApiFailure = {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      };
      return NextResponse.json(body, { status: 401 });
    }

    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Resolve verified role (DB profiles -> server-only app_metadata)
  const profile = await resolveProfileForAuthUser(user);
  if (!profile || !profile.isActive) {
    if (isAdminApi || isStudentApi) {
      const body: ApiFailure = {
        ok: false,
        error: { code: "FORBIDDEN", message: "Tài khoản chưa được kích hoạt hoặc không hợp lệ." },
      };
      return NextResponse.json(body, { status: 403 });
    }
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  // Admin route gate
  if ((isAdminPage || isAdminApi) && profile.role !== "admin") {
    if (isAdminApi) {
      const body: ApiFailure = {
        ok: false,
        error: { code: "FORBIDDEN", message: "Chỉ giáo viên (ADMIN) mới có quyền truy cập." },
      };
      return NextResponse.json(body, { status: 403 });
    }
    return NextResponse.redirect(new URL("/student", request.url));
  }

  // Student route gate (both student and admin can view /student, but only active verified roles)
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
