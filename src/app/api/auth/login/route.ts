import { ok, publicRoute, readJson } from "@/lib/http";
import { loginWithSupabase } from "@/services/auth.service";

export const POST = publicRoute(async (request) => {
  const body = await readJson(request);
  const result = await loginWithSupabase(body);
  return ok(result);
});
