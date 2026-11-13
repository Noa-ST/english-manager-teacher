import { ok, publicRoute, readQuery } from "@/lib/http";
import * as cmsService from "@/services/cms.service";

export const GET = publicRoute(async (request) => {
  const query = readQuery(request);
  const items = await cmsService.listStudentProjects({
    category: query.category,
    className: query.className,
    search: query.search,
  });
  return ok(items);
});

