import { ok, publicRoute } from "@/lib/http";
import * as cmsService from "@/services/cms.service";

export const GET = publicRoute<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const { id } = await context.params;
    const item = await cmsService.getAnnouncementById(id);
    const all = await cmsService.listAnnouncements({ includeDrafts: false });
    const related = all.filter((a) => a.id !== id).slice(0, 2);
    return ok({ item, related });
  },
);

