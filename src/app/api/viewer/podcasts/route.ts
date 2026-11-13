import { ok, publicRoute, readQuery } from "@/lib/http";
import * as podcastService from "@/services/podcast.service";

export const GET = publicRoute(async (request) => {
  const query = readQuery(request);
  const page = await podcastService.listPodcasts({
    ...query,
    includeDrafts: false,
  });
  return ok(page.items, {
    meta: {
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: Math.ceil(page.total / page.pageSize),
    },
  });
});

