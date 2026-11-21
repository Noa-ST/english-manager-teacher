import { ok, publicRoute } from "@/lib/http";
import { getPublicOverviewData } from "@/services/viewer-overview.service";

export const GET = publicRoute(async () => {
  const overview = await getPublicOverviewData();
  return ok(overview);
});
