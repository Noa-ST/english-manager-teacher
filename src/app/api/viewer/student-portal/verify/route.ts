import { ok, readJson, studentRoute } from "@/lib/http";
import { canAccessStudent } from "@/lib/rbac";
import { createStudentPortalToken } from "@/lib/student-token";
import { ForbiddenError } from "@/services/errors";
import {
  assertNotRateLimited,
  getClientIp,
  registerFailedAttempt,
  resetRateLimit,
} from "@/services/rate-limit.service";
import * as studentService from "@/services/student.service";
import type { UserProfile } from "@/types";

/**
 * Portal secondary PIN verification by studentCode + PIN.
 * Hardened with:
 * - Required authenticated student/admin session (401 when unauthenticated)
 * - Ownership authorization via canAccessStudent (403 on cross-student access)
 * - Persistent/Multi-instance Rate Limiting (max 5 failed attempts per 15m)
 * - Anti-Enumeration uniform error responses
 * - Expiring signed JWT token (2 hours TTL)
 * - Safe response payload (masked parent contact, no secrets)
 */
export const POST = studentRoute(async (request, { session }) => {
  const body = (await readJson(request)) as {
    studentCode?: string;
    accessKey?: string;
  };
  const clientIp = getClientIp(request);
  const normalizedCode = (body?.studentCode || "").trim().toUpperCase();

  const profileOverride: UserProfile = {
    id: session.id,
    email: session.label,
    fullName: session.fullName ?? session.label,
    avatarUrl: null,
    role: session.role,
    isActive: true,
    studentId: session.studentId ?? null,
    studentCode: session.studentCode ?? null,
  };

  if (normalizedCode) {
    const allowedByCode = await canAccessStudent(normalizedCode, profileOverride);
    if (!allowedByCode) {
      throw new ForbiddenError(
        "Bạn chỉ được phép tra cứu hồ sơ học tập của chính mình.",
      );
    }
  }

  const ipKey = `ip:${clientIp}`;
  const codeKey = normalizedCode ? `code:${normalizedCode}` : "";

  // 1. Assert rate limits before processing
  await assertNotRateLimited(ipKey);
  if (codeKey) {
    await assertNotRateLimited(codeKey);
  }

  // 2. Perform verification
  let student: Awaited<ReturnType<typeof studentService.verifyStudentPortal>>;
  try {
    student = await studentService.verifyStudentPortal(body);
  } catch (error) {
    // Track failed attempts
    await registerFailedAttempt(ipKey);
    if (codeKey) {
      await registerFailedAttempt(codeKey);
    }
    throw error;
  }

  const allowedByStudent = await canAccessStudent(student.id, profileOverride);
  if (!allowedByStudent) {
    throw new ForbiddenError(
      "Bạn chỉ được phép tra cứu hồ sơ học tập của chính mình.",
    );
  }

  // 3. Clear failed counters on success
  await resetRateLimit(ipKey);
  if (codeKey) {
    await resetRateLimit(codeKey);
  }

  // 4. Generate signed portal token
  const token = await createStudentPortalToken({
    studentId: student.id,
    studentCode: student.code,
  });

  return ok({ student, token });
});
