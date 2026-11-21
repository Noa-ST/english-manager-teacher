import { redirect } from "next/navigation";

import { getUserProfile } from "@/lib/rbac";
import { verifyStudentPortalToken } from "@/lib/student-token";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ForbiddenError, UnauthorizedError } from "@/services/errors";
import * as studentService from "@/services/student.service";
import type { SessionUser } from "@/types";

/**
 * Session & auth adapter backed by Supabase Auth (@supabase/ssr cookies).
 *
 * Enforcement layers (defence in depth):
 *   1. src/proxy.ts            optimistic session refresh + route gate
 *   2. (admin)/layout.tsx      <AdminGuard> behind <Suspense>
 *   3. requireAdmin*()         in EVERY admin Route Handler / Server Action / data read
 *   4. requireStudent*()       in EVERY student portal Route Handler / page
 */

export const LOGIN_PATH = "/login";

export async function destroySession(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Ignore if already signed out
  }
}

/** Request-time read: call only inside <Suspense>, Route Handlers or Server Actions. */
export async function getSession(): Promise<SessionUser | null> {
  const profile = await getUserProfile();
  if (!profile || !profile.isActive) return null;

  return {
    id: profile.id,
    role: profile.role,
    label: profile.email || profile.studentCode || profile.fullName,
    fullName: profile.fullName,
    ...(profile.studentId ? { studentId: profile.studentId } : {}),
    ...(profile.studentCode ? { studentCode: profile.studentCode } : {}),
  };
}

// ------------------------------------------------------------ Enforcement

/** For Server Components / Server Actions: requires ADMIN role. */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);
  if (session.role !== "admin") redirect("/student");
  return session;
}

/** For Route Handlers: throws 401 if unauthenticated, 403 if not ADMIN. */
export async function requireAdminApi(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError("Authentication required");
  if (session.role !== "admin") {
    throw new ForbiddenError("Chỉ giáo viên (ADMIN) mới có quyền thực hiện thao tác này.");
  }
  return session;
}

/** For Server Components / Server Actions: requires STUDENT (or ADMIN preview). */
export async function requireStudent(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(`${LOGIN_PATH}?next=/student`);
  return session;
}

/** For Route Handlers: throws 401 if unauthenticated, 403 if not STUDENT/ADMIN. Also accepts signed Portal JWT Bearer token. */
export async function requireStudentApi(request?: Request): Promise<SessionUser> {
  const session = await getSession();
  if (session) {
    if (session.role !== "student" && session.role !== "admin") {
      throw new ForbiddenError("Tài khoản không có quyền truy cập khu vực học sinh.");
    }
    return session;
  }

  const authHeader = request?.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const verified = token ? await verifyStudentPortalToken(token) : null;
    if (verified) {
      const student = await studentService
        .getStudentById(verified.studentId)
        .catch(() =>
          verified.studentCode
            ? studentService.getStudentById(verified.studentCode).catch(() => null)
            : null,
        );
      if (!student || student.status === "archived" || student.deletedAt) {
        throw new ForbiddenError("Hồ sơ học sinh đã được lưu trữ hoặc không còn hoạt động.");
      }
      return {
        id: student.id,
        role: "student",
        label: student.code,
        fullName: student.fullName,
        studentId: student.id,
        studentCode: student.code,
      };
    }
  }

  throw new UnauthorizedError("Vui lòng đăng nhập để xem thông tin học tập.");
}
