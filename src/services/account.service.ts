import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Role } from "@/types";

import { validate } from "./common";
import { ConflictError, DomainError, NotFoundError } from "./errors";
import * as studentService from "./student.service";

/**
 * Admin-only Account Management service (Supabase Auth Admin API + Profiles + Student Linking).
 *
 * Security invariants:
 *   - Only called from `adminRoute` handlers after `requireAdminApi()`.
 *   - Uses `SUPABASE_SECRET_KEY` server-only via `createSupabaseAdminClient()`.
 *   - Enforces 1:1 link between a `student` Auth user and a `Student` record.
 *   - Automatically rolls back (deletes Auth user) if profile/student linking fails.
 */

export const createStudentAccountSchema = z.object({
  studentId: z.string().trim().min(1, "Vui lòng chọn hồ sơ học sinh."),
  email: z.email("Email học sinh không đúng định dạng.").max(254),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự.").max(128),
});
export type CreateStudentAccountInput = z.infer<typeof createStudentAccountSchema>;

export const toggleAccountActiveSchema = z.object({
  profileId: z.string().uuid("ID tài khoản không hợp lệ."),
  isActive: z.boolean(),
});

export const resetStudentPasswordSchema = z.object({
  profileId: z.string().uuid("ID tài khoản không hợp lệ."),
  newPassword: z.string().min(8, "Mật khẩu mới tối thiểu 8 ký tự.").max(128),
});

export interface ManagedAccountItem {
  profileId: string | null;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  email: string | null;
  role: Role;
  isActive: boolean;
  hasAuthAccount: boolean;
  lastSignInAt: string | null;
}

async function listAllAuthUsers(
  adminClient: ReturnType<typeof createSupabaseAdminClient>,
) {
  const users: User[] = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[account.service] listUsers error:", error);
      break;
    }
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users;
}

export async function listStudentAccounts(): Promise<ManagedAccountItem[]> {
  const students = await studentService.listAllStudents({ status: "all" });
  const adminClient = createSupabaseAdminClient();
  const authUsers = await listAllAuthUsers(adminClient);
  const byStudentId = new Map<string, (typeof authUsers)[number]>();
  for (const u of authUsers) {
    const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
    if (appMeta.role === "student" && typeof appMeta.student_id === "string") {
      byStudentId.set(appMeta.student_id, u);
    }
  }

  return students.map((stu) => {
    const authUser = byStudentId.get(stu.id);
    const appMeta = (authUser?.app_metadata ?? {}) as Record<string, unknown>;
    const bannedUntil = (authUser as { banned_until?: string | null } | undefined)?.banned_until;
    const isBanned = Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now());
    const isActive = authUser ? !isBanned && appMeta.is_active !== false : false;

    return {
      profileId: authUser?.id ?? null,
      studentId: stu.id,
      studentCode: stu.code,
      fullName: stu.fullName,
      className: stu.className,
      email: authUser?.email ?? null,
      role: "student",
      isActive,
      hasAuthAccount: Boolean(authUser),
      lastSignInAt: authUser?.last_sign_in_at ?? null,
    };
  });
}

export async function createStudentAccount(input: unknown): Promise<ManagedAccountItem> {
  const { studentId, email, password } = validate(createStudentAccountSchema, input);
  const student = await studentService.getStudentById(studentId).catch((err) => {
    if (err instanceof NotFoundError) {
      throw new NotFoundError("Không tìm thấy hồ sơ học sinh để liên kết tài khoản.");
    }
    throw err;
  });

  const normalizedEmail = email.trim().toLowerCase();
  const adminClient = createSupabaseAdminClient();

  // Check across ALL auth pages if this student already has a linked Supabase Auth account
  const existingUsers = await listAllAuthUsers(adminClient);
  const alreadyLinked = existingUsers.find((u) => {
    const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
    return meta.student_id === student.id || u.email?.toLowerCase() === normalizedEmail;
  });

  if (alreadyLinked) {
    throw new ConflictError(
      "Học sinh này đã có tài khoản hoặc email đã được sử dụng trong hệ thống.",
    );
  }

  // 1. Create Supabase Auth user with server-only app_metadata (never user_metadata for role)
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    app_metadata: {
      role: "student",
      student_id: student.id,
      student_code: student.code,
      full_name: student.fullName,
      is_active: true,
    },
    user_metadata: {
      full_name: student.fullName,
    },
  });

  if (createErr || !created.user) {
    console.error("[account.service] createUser failed:", createErr);
    throw new DomainError(
      "CONFLICT",
      "Không thể tạo tài khoản học sinh. Email có thể đã tồn tại hoặc mật khẩu chưa đáp ứng yêu cầu bảo mật.",
    );
  }

  const createdUser = created.user;

  // 2. Link profile & student row in Supabase DB (if migrated); rollback Auth user on failure!
  try {
    const { error: profileErr } = await adminClient.from("profiles").upsert({
      id: createdUser.id,
      email: normalizedEmail,
      full_name: student.fullName,
      role: "student",
      is_active: true,
    });

    // PGRST205 = table does not exist yet in Supabase REST; allow continuing if SQL migration pending
    if (profileErr && profileErr.code !== "PGRST205") {
      throw new Error(profileErr.message);
    }

    if (!profileErr) {
      const { error: linkErr } = await adminClient
        .from("Student")
        .update({ profile_id: createdUser.id })
        .eq("id", student.id);

      if (linkErr && linkErr.code !== "PGRST205") {
        throw new Error(linkErr.message);
      }
    }
  } catch (err) {
    // Rollback created Auth user so no orphan account remains
    console.error("[account.service] DB link failed (rolled back Auth user):", err);
    await adminClient.auth.admin.deleteUser(createdUser.id);
    throw new DomainError(
      "INTERNAL_ERROR",
      "Liên kết hồ sơ học sinh thất bại và đã tự động hoàn tác. Vui lòng thử lại sau.",
    );
  }

  return {
    profileId: createdUser.id,
    studentId: student.id,
    studentCode: student.code,
    fullName: student.fullName,
    className: student.className,
    email: normalizedEmail,
    role: "student",
    isActive: true,
    hasAuthAccount: true,
    lastSignInAt: null,
  };
}

export async function toggleStudentAccountActive(input: unknown): Promise<{
  profileId: string;
  isActive: boolean;
}> {
  const { profileId, isActive } = validate(toggleAccountActiveSchema, input);
  const adminClient = createSupabaseAdminClient();

  const { data: target, error: getErr } = await adminClient.auth.admin.getUserById(profileId);
  if (getErr || !target.user) {
    throw new NotFoundError("Không tìm thấy tài khoản.");
  }

  const appMeta = (target.user.app_metadata ?? {}) as Record<string, unknown>;
  if (appMeta.role === "admin") {
    throw new DomainError("FORBIDDEN", "Không thể vô hiệu hóa tài khoản ADMIN tại đây.");
  }

  const { error: updateErr } = await adminClient.auth.admin.updateUserById(profileId, {
    ban_duration: isActive ? "none" : "876000h",
    app_metadata: {
      ...appMeta,
      is_active: isActive,
    },
  });

  if (updateErr) {
    console.error("[account.service] toggleStudentAccountActive failed:", updateErr);
    throw new DomainError("INTERNAL_ERROR", "Không thể cập nhật trạng thái tài khoản lúc này.");
  }

  // Sync profiles table if present
  await adminClient.from("profiles").update({ is_active: isActive }).eq("id", profileId);

  return { profileId, isActive };
}

export async function resetStudentPassword(input: unknown): Promise<{ profileId: string }> {
  const { profileId, newPassword } = validate(resetStudentPasswordSchema, input);
  const adminClient = createSupabaseAdminClient();

  const { data: target, error: getErr } = await adminClient.auth.admin.getUserById(profileId);
  if (getErr || !target.user) {
    throw new NotFoundError("Không tìm thấy tài khoản.");
  }

  const appMeta = (target.user.app_metadata ?? {}) as Record<string, unknown>;
  if (appMeta.role === "admin") {
    throw new DomainError("FORBIDDEN", "Không thể đặt lại mật khẩu ADMIN qua API học sinh.");
  }

  const { error: updateErr } = await adminClient.auth.admin.updateUserById(profileId, {
    password: newPassword,
  });

  if (updateErr) {
    console.error("[account.service] toggleStudentAccountActive failed:", updateErr);
    throw new DomainError("INTERNAL_ERROR", "Không thể cập nhật trạng thái tài khoản lúc này.");
  }

  return { profileId };
}

