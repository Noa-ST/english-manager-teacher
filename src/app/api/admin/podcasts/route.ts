import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as podcastService from "@/services/podcast.service";

/**
 * /api/admin/podcasts — HTTP ONLY.
 * Audio files are uploaded directly to object storage via a presigned URL
 * (storage.service); this endpoint only receives the resulting object keys.
 */

export const GET = adminRoute(async (request) => {
  const page = await podcastService.listPodcasts({
    ...readQuery(request),
    includeDrafts: true,
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

export const POST = adminRoute(async (request) => {
  const podcast = await podcastService.createPodcast(await readJson(request));
  return ok(podcast, { status: 201 });
});

