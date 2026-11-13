import { ok, publicRoute, readJson } from "@/lib/http";
import { requestPasswordReset } from "@/services/auth.service";

export const POST = publicRoute(async (request) => {
  const body = await readJson(request);
  const result = await requestPasswordReset(body);
  return ok(result);
});

