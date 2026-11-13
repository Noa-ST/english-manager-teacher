import { redirect } from "next/navigation";

import { getUserProfile } from "@/lib/rbac";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ForbiddenError, UnauthorizedError } from "@/services/errors";
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

/** For Route Handlers: throws 401 if unauthenticated, 403 if not STUDENT/ADMIN. */
export async function requireStudentApi(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError("Vui lòng đăng nhập để xem thông tin học tập.");
  if (session.role !== "student" && session.role !== "admin") {
    throw new ForbiddenError("Tài khoản không có quyền truy cập khu vực học sinh.");
  }
  return session;
}
