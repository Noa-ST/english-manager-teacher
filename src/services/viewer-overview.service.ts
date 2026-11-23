import type {
  AnnouncementItem,
  StudentScheduleOccurrence,
  TeacherProfile,
} from "./classroom-data";
import * as cmsService from "./cms.service";
import {
  sanitizeDocumentFilesForPublic,
  type PublicResourceFile,
} from "./documents-helpers";
import {
  sanitizeHallOfFameForPublic,
  type PublicHallOfFameStudent,
} from "./hall-of-fame-helpers";
import {
  sanitizePodcastsForPublic,
  type PublicPodcastEpisode,
} from "./podcast-helpers";
import {
  sanitizeProjectsForPublic,
  type PublicStudentProject,
} from "./showcase-helpers";
import * as podcastService from "./podcast.service";
import * as scheduleService from "./schedule.service";
import * as settingsService from "./settings.service";
import * as storageService from "./storage.service";
import {
  getCurrentWeekDateRange,
  resolveOccurrenceLiveStatus,
  sanitizeOccurrencesForPublic,
  sanitizeWeeklyScheduleForPublic,
  toLocalIsoDate,
  type HomeWeekDateRange,
  type PublicWeeklyClassSession,
} from "./viewer-home-helpers";

export interface PublicOverviewPayload {
  teacher: TeacherProfile;
  currentTerm: string;
  weekRange: HomeWeekDateRange;
  weekOccurrences: StudentScheduleOccurrence[];
  schedule: PublicWeeklyClassSession[];
  announcements: AnnouncementItem[];
  hallOfFame: PublicHallOfFameStudent[];
  podcasts: PublicPodcastEpisode[];
  projects: PublicStudentProject[];
  resources: PublicResourceFile[];
}

const OVERVIEW_CACHE_TTL_MS = 15_000;
let cachedOverviewEntry: {
  expiresAt: number;
  data: PublicOverviewPayload;
} | null = null;
let inFlightOverviewPromise: Promise<PublicOverviewPayload> | null = null;

export function invalidatePublicOverviewCache(): void {
  cachedOverviewEntry = null;
  inFlightOverviewPromise = null;
}

async function computePublicOverviewData(
  now = new Date(),
): Promise<PublicOverviewPayload> {
  const weekRange = getCurrentWeekDateRange(now);
  const todayIso = toLocalIsoDate(now);

  const [
    teacher,
    settings,
    announcements,
    calendarRange,
    hallOfFame,
    podcastsPage,
    projects,
    resources,
  ] = await Promise.all([
    settingsService.getTeacherBrandProfile(),
    settingsService.getSystemSettings(),
    cmsService.listAnnouncements({ includeDrafts: false }),
    scheduleService.getScheduleCalendarRange({
      fromDate: weekRange.mondayIso,
      toDate: weekRange.sundayIso,
      todayIso,
    }),
    cmsService.listHallOfFame(),
    podcastService.listPodcasts({ includeDrafts: false, page: 1, pageSize: 20 }),
    cmsService.listStudentProjects({ includeDrafts: false }),
    storageService.listResourceFiles({ publicOnly: true }),
  ]);

  const weekOccurrences = sanitizeOccurrencesForPublic(
    calendarRange.occurrences,
  ).map((occ) => ({
    ...occ,
    status: resolveOccurrenceLiveStatus(occ, now),
  }));

  return {
    teacher,
    currentTerm: settings.currentTerm,
    weekRange,
    weekOccurrences,
    schedule: sanitizeWeeklyScheduleForPublic(calendarRange.sessions),
    announcements: announcements.filter((a) => a.status === "published"),
    hallOfFame: sanitizeHallOfFameForPublic(hallOfFame),
    podcasts: sanitizePodcastsForPublic(podcastsPage.items),
    projects: sanitizeProjectsForPublic(projects),
    resources: sanitizeDocumentFilesForPublic(resources),
  };
}

export async function getPublicOverviewData(
  now?: Date,
): Promise<PublicOverviewPayload> {
  // When callers pass a custom Date (e.g. unit tests), bypass cache
  if (now) {
    return computePublicOverviewData(now);
  }

  const nowMs = Date.now();
  if (cachedOverviewEntry && cachedOverviewEntry.expiresAt > nowMs) {
    return cachedOverviewEntry.data;
  }

  if (inFlightOverviewPromise) {
    return inFlightOverviewPromise;
  }

  inFlightOverviewPromise = computePublicOverviewData(new Date())
    .then((result) => {
      cachedOverviewEntry = {
        data: result,
        expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS,
      };
      return result;
    })
    .finally(() => {
      inFlightOverviewPromise = null;
    });

  return inFlightOverviewPromise;
}
