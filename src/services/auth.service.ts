import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { resolveProfileForAuthUser } from "@/lib/rbac";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/types";

import { validate } from "./common";
import { ForbiddenError, UnauthorizedError } from "./errors";

/**
 * Auth service — Supabase Auth integration for both ADMIN (Teacher) and STUDENT roles.
 * No custom JWTs; Supabase Auth + @supabase/ssr cookies own identity & session lifecycle.
 */

export const loginCredentialsSchema = z.object({
  email: z.email("Email không đúng định dạng.").max(254),
  password: z.string().min(1, "Vui lòng nhập mật khẩu.").max(256),
});
export type LoginCredentials = z.infer<typeof loginCredentialsSchema>;

export const resetPasswordRequestSchema = z.object({
  email: z.email("Email không đúng định dạng.").max(254),
});

export interface LoginResult {
  user: SessionUser;
  redirectTo: "/dashboard" | "/student";
}

export async function loginWithSupabase(input: unknown): Promise<LoginResult> {
  const { email, password } = validate(loginCredentialsSchema, input);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.user) {
    throw new UnauthorizedError("Email hoặc mật khẩu không chính xác.");
  }

  const profile = await resolveProfileForAuthUser(data.user);
  if (!profile) {
    await supabase.auth.signOut();
    throw new ForbiddenError("Tài khoản chưa được kích hoạt hoặc chưa được gán vai trò hợp lệ.");
  }

  if (!profile.isActive) {
    await supabase.auth.signOut();
    throw new ForbiddenError("Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ giáo viên.");
  }

  const sessionUser: SessionUser = {
    id: profile.id,
    role: profile.role,
    label: profile.email || profile.studentCode || profile.fullName,
    fullName: profile.fullName,
    ...(profile.studentId ? { studentId: profile.studentId } : {}),
    ...(profile.studentCode ? { studentCode: profile.studentCode } : {}),
  };

  return {
    user: sessionUser,
    redirectTo: profile.role === "admin" ? "/dashboard" : "/student",
  };
}

export async function logoutWithSupabase(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export async function requestPasswordReset(input: unknown): Promise<{ sent: true }> {
  const { email } = validate(resetPasswordRequestSchema, input);
  const env = getServerEnv();
  const supabase = await createSupabaseServerClient();

  try {
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${env.APP_URL}/login?reset=1`,
    });
  } catch {
    // Never leak whether email exists in Supabase Auth
  }

  return { sent: true };
}
