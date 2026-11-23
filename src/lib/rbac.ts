import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { Role, UserProfile } from "@/types";

const PROFILE_CACHE_TTL_MS = 20_000;
const profileMemoryCache = new Map<
  string,
  { profile: UserProfile | null; expiresAt: number }
>();

export function invalidateCachedUserProfile(userId?: string): void {
  if (userId) {
    profileMemoryCache.delete(userId);
  } else {
    profileMemoryCache.clear();
  }
}

/**
 * Centralized Role-Based Access Control (RBAC) layer.
 *
 * Two-Role System:
 *   - `admin`: Teacher / System Administrator (full access)
 *   - `student`: Student (read-only access to own profile, grades, attendance, schedule & allowed resources)
 *
 * Security rules:
 *   - Always verifies identity via `supabase.auth.getUser()` (server-validated JWT).
 *   - NEVER trusts client-sent role or user-editable `user_metadata`.
 *   - Reads role from `public.profiles` in DB first, falling back only to server-managed `app_metadata`.
 */

function normalizeRole(value: unknown): Role | null {
  if (value === "admin" || value === "student") return value;
  return null;
}

export async function resolveProfileForAuthUser(user: User): Promise<UserProfile | null> {
  if (!user || !user.id) return null;

  // Check Supabase Auth ban status
  const bannedUntil = (user as User & { banned_until?: string | null }).banned_until;
  if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) {
    profileMemoryCache.delete(user.id);
    return null;
  }

  const now = Date.now();
  const cached = profileMemoryCache.get(user.id);
  if (cached && cached.expiresAt > now) {
    return cached.profile;
  }

  let dbProfile: {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
    is_active: boolean;
  } | null = null;

  let linkedStudent: { id: string; code: string } | null = null;

  try {
    const adminClient = createSupabaseAdminClient();
    const { data: profileRow, error: profileErr } = await adminClient
      .from("profiles")
      .select("id, email, full_name, avatar_url, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profileErr && profileRow) {
      dbProfile = profileRow;

      if (profileRow.role === "student") {
        const { data: studentRow } = await adminClient
          .from("Student")
          .select("id, code")
          .eq("profile_id", user.id)
          .maybeSingle();

        if (studentRow) {
          linkedStudent = studentRow;
        }
      }
    }
  } catch {
    // Table may not be migrated yet in Supabase PostgreSQL; fallback to server-only app_metadata below.
  }

  // Fallback to server-only app_metadata (never user_metadata!)
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const role = normalizeRole(dbProfile?.role ?? appMeta.role);
  if (!role) return null;

  const isActive = dbProfile ? Boolean(dbProfile.is_active) : appMeta.is_active !== false;
  if (!isActive) return null;

  const studentId =
    linkedStudent?.id ??
    (typeof appMeta.student_id === "string" ? appMeta.student_id : null);
  const studentCode =
    linkedStudent?.code ??
    (typeof appMeta.student_code === "string" ? appMeta.student_code : null);

  const fullName =
    dbProfile?.full_name ??
    (typeof appMeta.full_name === "string" ? appMeta.full_name : undefined) ??
    user.email ??
    "Người dùng";

  const resolved: UserProfile = {
    id: user.id,
    email: dbProfile?.email ?? user.email ?? "",
    fullName,
    avatarUrl: dbProfile?.avatar_url ?? null,
    role,
    isActive,
    studentId,
    studentCode,
  };
  profileMemoryCache.set(user.id, {
    profile: resolved,
    expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
  });
  return resolved;
}

const getCurrentUserCached = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
});

export async function getCurrentUser(): Promise<User | null> {
  return getCurrentUserCached();
}

const getUserProfileCached = cache(async (): Promise<UserProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return resolveProfileForAuthUser(user);
});

export async function getUserProfile(): Promise<UserProfile | null> {
  return getUserProfileCached();
}

export async function getUserRole(): Promise<Role | null> {
  const profile = await getUserProfile();
  return profile?.role ?? null;
}

export async function hasRole(role: Role): Promise<boolean> {
  const currentRole = await getUserRole();
  return currentRole === role;
}

export async function isAdmin(): Promise<boolean> {
  return hasRole("admin");
}

export async function isStudent(): Promise<boolean> {
  return hasRole("student");
}

export async function canAccessStudent(
  studentIdOrCode: string,
  profileOverride?: UserProfile | null,
): Promise<boolean> {
  const profile = profileOverride ?? (await getUserProfile());
  if (!profile || !profile.isActive) return false;
  if (profile.role === "admin") return true;

  const normalizedTarget = studentIdOrCode.trim().toUpperCase();
  if (!normalizedTarget) return false;

  return (
    (profile.studentId !== null && profile.studentId.toUpperCase() === normalizedTarget) ||
    (profile.studentCode !== null && profile.studentCode.toUpperCase() === normalizedTarget)
  );
}

export async function canViewGrade(
  studentId: string,
  profileOverride?: UserProfile | null,
): Promise<boolean> {
  return canAccessStudent(studentId, profileOverride);
}

export async function canViewAttendance(
  studentId: string,
  profileOverride?: UserProfile | null,
): Promise<boolean> {
  return canAccessStudent(studentId, profileOverride);
}

export async function canAccessResource(
  resource: { visibility: "public" | "private"; ownerId?: string | null },
  profileOverride?: UserProfile | null,
): Promise<boolean> {
  if (resource.visibility === "public") return true;
  const profile = profileOverride ?? (await getUserProfile());
  if (!profile || !profile.isActive) return false;
  if (profile.role === "admin") return true;
  return Boolean(resource.ownerId && resource.ownerId === profile.id);
}

