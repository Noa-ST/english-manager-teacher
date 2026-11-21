import { ok, publicRoute, readQuery } from "@/lib/http";
import * as cmsService from "@/services/cms.service";
import {
  sanitizeHallOfFameForPublic,
  type ViewerHallOfFamePayload,
} from "@/services/hall-of-fame-helpers";
import * as settingsService from "@/services/settings.service";

export const GET = publicRoute(async (request) => {
  const query = readQuery(request);
  const [items, teacher, settings] = await Promise.all([
    cmsService.listHallOfFame({
      period: query.period,
      search: query.search,
      className: query.className,
      periodLabel: query.periodLabel,
    }),
    settingsService.getTeacherBrandProfile(),
    settingsService.getSystemSettings(),
  ]);

  const payload: ViewerHallOfFamePayload = {
    items: sanitizeHallOfFameForPublic(items),
    teacherEndorser: {
      name: teacher.name,
      title: teacher.title,
    },
    currentTerm: settings.currentTerm,
  };

  return ok(payload);
});
