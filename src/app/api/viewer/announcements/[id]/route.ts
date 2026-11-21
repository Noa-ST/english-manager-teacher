import { ok, publicRoute, readJson } from "@/lib/http";
import {
  getAdjacentAnnouncements,
  selectRelatedAnnouncements,
} from "@/services/announcement-helpers";
import * as cmsService from "@/services/cms.service";
import {
  assertNotRateLimited,
  getClientIp,
  registerFailedAttempt,
} from "@/services/rate-limit.service";
import * as settingsService from "@/services/settings.service";

export const GET = publicRoute<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const { id } = await context.params;
    const [item, all, brand] = await Promise.all([
      cmsService.getPublishedAnnouncementById(id),
      cmsService.listAnnouncements({ includeDrafts: false }),
      settingsService.getTeacherBrandProfile(),
    ]);

    const { prev, next } = getAdjacentAnnouncements(id, all);
    const related = selectRelatedAnnouncements(item, all, 2);

    return ok({
      item,
      related,
      prev,
      next,
      author: {
        name: brand.name,
        title: brand.title,
        avatarUrl: brand.avatarUrl ?? "/images/teacher-avatar.jpg",
      },
    });
  },
);

export const POST = publicRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const clientIp = getClientIp(request);
    const rlKey = `pub-ann-dl:${clientIp}`;
    await assertNotRateLimited(rlKey, {
      maxAttempts: 60,
      customLockMessage: "Bạn đã tải quá nhanh trong ít phút qua. Vui lòng thử lại sau.",
    });
    await registerFailedAttempt(rlKey, { maxAttempts: 60 });

    const { id } = await context.params;
    const body = (await readJson(request)) as { attachmentId?: unknown };
    const result = await cmsService.recordAnnouncementAttachmentDownload(
      id,
      body?.attachmentId,
    );
    return ok(result);
  },
);
