import { ok, publicRoute, readQuery } from "@/lib/http";
import * as cmsService from "@/services/cms.service";

export const GET = publicRoute(async (request) => {
  const query = readQuery(request);
  const items = await cmsService.listAnnouncements({
    includeDrafts: false,
    category: query.category,
    search: query.search,
  });
  return ok(items);
});

