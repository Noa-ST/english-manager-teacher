import { z } from "zod";

import { ok, publicRoute, readJson } from "@/lib/http";
import { loginWithSupabase } from "@/services/auth.service";
import { validate } from "@/services/common";
import { NotFoundError } from "@/services/errors";

const quickLoginSchema = z.object({
  role: z.enum(["admin", "student"]),
});

/**
 * Development-ONLY 1-click quick login.
 * Strictly disabled in production (returns 404) and uses real Supabase Auth.
 */
export const POST = publicRoute(async (request) => {
  if (process.env.NODE_ENV === "production") {
    throw new NotFoundError("Endpoint không khả dụng trong môi trường Production.");
  }

  const { role } = validate(quickLoginSchema, await readJson(request));

  const email =
    role === "admin"
      ? process.env.DEV_ADMIN_EMAIL || process.env.ADMIN_EMAIL
      : process.env.DEV_STUDENT_EMAIL;
  const password =
    role === "admin"
      ? process.env.DEV_ADMIN_PASSWORD
      : process.env.DEV_STUDENT_PASSWORD;

  if (!email || !password) {
    throw new NotFoundError(
      "Chưa cấu hình tài khoản kiểm thử DEV_* trong .env.",
    );
  }

  const result = await loginWithSupabase({ email, password });
  return ok(result);
});

