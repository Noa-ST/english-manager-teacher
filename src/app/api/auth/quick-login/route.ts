import { publicRoute } from "@/lib/http";
import { NotFoundError } from "@/services/errors";

/**
 * Quick-login mode has been permanently removed per security policy.
 * All users (Teacher & Student) must authenticate via /api/auth/login with valid credentials.
 */
export const POST = publicRoute(async () => {
  throw new NotFoundError(
    "Chế độ đăng nhập nhanh đã bị loại bỏ. Vui lòng đăng nhập bằng email và mật khẩu tại /login.",
  );
});


