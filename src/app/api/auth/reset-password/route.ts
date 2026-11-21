import { ok, publicRoute, readJson } from "@/lib/http";
import { requestPasswordReset } from "@/services/auth.service";
import {
  assertNotRateLimited,
  getClientIp,
  registerFailedAttempt,
} from "@/services/rate-limit.service";

export const POST = publicRoute(async (request) => {
  const body = (await readJson(request)) as { email?: string };
  const clientIp = getClientIp(request);
  const normalizedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  const ipKey = `reset-ip:${clientIp}`;
  const emailKey = normalizedEmail ? `reset-email:${normalizedEmail}` : "";

  await assertNotRateLimited(ipKey, {
    maxAttempts: 5,
    customLockMessage: "Bạn đã gửi quá nhiều yêu cầu khôi phục mật khẩu. Vui lòng thử lại sau 15 phút.",
  });
  if (emailKey) {
    await assertNotRateLimited(emailKey, {
      maxAttempts: 3,
      customLockMessage: "Email này vừa nhận yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.",
    });
  }

  await registerFailedAttempt(ipKey, { maxAttempts: 5 });
  if (emailKey) {
    await registerFailedAttempt(emailKey, { maxAttempts: 3 });
  }

  const result = await requestPasswordReset(body);
  return ok(result);
});

