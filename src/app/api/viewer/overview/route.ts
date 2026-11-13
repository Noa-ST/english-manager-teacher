import { ok, publicRoute } from "@/lib/http";
import * as cmsService from "@/services/cms.service";
import * as podcastService from "@/services/podcast.service";
import * as scheduleService from "@/services/schedule.service";
import * as settingsService from "@/services/settings.service";
import * as storageService from "@/services/storage.service";

export const GET = publicRoute(async () => {
  const [
    teacher,
    announcements,
    schedule,
    hallOfFame,
    podcastsPage,
    projects,
    resources,
  ] = await Promise.all([
    settingsService.getSystemSettings(),
    cmsService.listAnnouncements({ includeDrafts: false }),
    scheduleService.listWeeklySchedule({ dayOfWeek: 0 }),
    cmsService.listHallOfFame(),
    podcastService.listPodcasts({ includeDrafts: false, page: 1, pageSize: 20 }),
    cmsService.listStudentProjects(),
    storageService.listResourceFiles({ publicOnly: true }),
  ]);

  return ok({
    teacher,
    announcements,
    schedule,
    hallOfFame,
    podcasts: podcastsPage.items,
    projects,
    resources,
  });
});

