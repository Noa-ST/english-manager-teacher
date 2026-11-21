import { ok, publicRoute, readQuery } from "@/lib/http";
import {
  sanitizePodcastsForPublic,
  type ViewerPodcastsPayload,
} from "@/services/podcast-helpers";
import * as podcastService from "@/services/podcast.service";
import * as settingsService from "@/services/settings.service";

export const GET = publicRoute(async (request) => {
  const query = readQuery(request);
  const [page, teacher, settings] = await Promise.all([
    podcastService.listPodcasts({
      ...query,
      pageSize: query.pageSize ?? 100,
      includeDrafts: false,
    }),
    settingsService.getTeacherBrandProfile(),
    settingsService.getSystemSettings(),
  ]);

  const payload: ViewerPodcastsPayload = {
    items: sanitizePodcastsForPublic(page.items),
    host: {
      name: teacher.name,
      title: teacher.title,
      avatarUrl: teacher.avatarUrl ?? "/images/teacher-avatar.jpg",
    },
    currentTerm: settings.currentTerm,
  };

  return ok(payload, {
    meta: {
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: Math.ceil(page.total / page.pageSize),
    },
  });
});
