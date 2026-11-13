import { getSession } from "@/lib/auth";
import { ok, publicRoute } from "@/lib/http";
import { UnauthorizedError } from "@/services/errors";

export const GET = publicRoute(async () => {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError("Chưa đăng nhập.");
  }
  return ok({ user: session });
});

