import { ok, publicRoute, readQuery } from "@/lib/http";
import * as cmsService from "@/services/cms.service";

export const GET = publicRoute(async (request) => {
  const query = readQuery(request);
  const items = await cmsService.listHallOfFame({
    period: query.period,
    search: query.search,
  });
  return ok(items);
});

