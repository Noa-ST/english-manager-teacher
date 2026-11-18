import { ok, publicRoute, readJson } from "@/lib/http";
import { createStudentPortalToken } from "@/lib/student-token";
import {
  assertNotRateLimited,
  getClientIp,
  registerFailedAttempt,
  resetRateLimit,
} from "@/services/rate-limit.service";
import * as studentService from "@/services/student.service";

/**
 * Public portal verification by studentCode + PIN.
 * Hardened with:
 * - Persistent/Multi-instance Rate Limiting (max 5 failed attempts per 15m)
 * - Anti-Enumeration uniform error responses
 * - Expiring signed JWT token (2 hours TTL)
 * - Safe response payload (masked parent contact, no secrets)
 */
export const POST = publicRoute(async (request) => {
  const body = (await readJson(request)) as {
    studentCode?: string;
    accessKey?: string;
  };
  const clientIp = getClientIp(request);
  const normalizedCode = (body?.studentCode || "").trim().toUpperCase();

  const ipKey = `ip:${clientIp}`;
  const codeKey = normalizedCode ? `code:${normalizedCode}` : "";

  // 1. Assert rate limits before processing
  await assertNotRateLimited(ipKey);
  if (codeKey) {
    await assertNotRateLimited(codeKey);
  }

  // 2. Perform verification
  try {
    const student = await studentService.verifyStudentPortal(body);

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
  } catch (error) {
    // 5. Track failed attempts
    await registerFailedAttempt(ipKey);
    if (codeKey) {
      await registerFailedAttempt(codeKey);
    }
    throw error;
  }
});
