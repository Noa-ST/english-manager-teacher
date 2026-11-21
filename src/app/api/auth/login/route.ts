import { ok, publicRoute, readJson } from "@/lib/http";
import { loginWithSupabase } from "@/services/auth.service";
import {
  assertNotRateLimited,
  getClientIp,
  registerFailedAttempt,
  resetRateLimit,
} from "@/services/rate-limit.service";

export const POST = publicRoute(async (request) => {
  const body = (await readJson(request)) as { email?: string; password?: string; rememberMe?: boolean };
  const clientIp = getClientIp(request);
  const normalizedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  const ipKey = `login-ip:${clientIp}`;
  const emailKey = normalizedEmail ? `login-email:${normalizedEmail}` : "";

  await assertNotRateLimited(ipKey, {
    customLockMessage: "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.",
  });
  if (emailKey) {
    await assertNotRateLimited(emailKey, {
      customLockMessage: "Tài khoản tạm thời bị giới hạn đăng nhập do thử sai liên tiếp. Vui lòng thử lại sau 15 phút.",
    });
  }

  try {
    const result = await loginWithSupabase(body);
    await resetRateLimit(ipKey);
    if (emailKey) await resetRateLimit(emailKey);
    return ok(result);
  } catch (err) {
    await registerFailedAttempt(ipKey);
    if (emailKey) await registerFailedAttempt(emailKey);
    throw err;
  }
});
