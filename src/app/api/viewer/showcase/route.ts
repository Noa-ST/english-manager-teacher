import { ok, publicRoute, readQuery } from "@/lib/http";
import * as cmsService from "@/services/cms.service";
import * as settingsService from "@/services/settings.service";
import {
  sanitizeProjectsForPublic,
  type ShowcaseMediaFilter,
  type ViewerShowcasePayload,
} from "@/services/showcase-helpers";

export const GET = publicRoute(async (request) => {
  const query = readQuery(request);
  const mediaParam: ShowcaseMediaFilter | undefined =
    query.media === "video" || query.media === "pdf" ? query.media : undefined;

  const [items, teacher, settings] = await Promise.all([
    cmsService.listStudentProjects({
      category: query.category,
      className: query.className,
      search: query.search,
      tag: query.tag,
      media: mediaParam,
      includeDrafts: false,
    }),
    settingsService.getTeacherBrandProfile(),
    settingsService.getSystemSettings(),
  ]);

  const payload: ViewerShowcasePayload = {
    items: sanitizeProjectsForPublic(items),
    mentor: {
      name: teacher.name,
      title: teacher.title,
    },
    currentTerm: settings.currentTerm,
  };

  return ok(payload);
});
