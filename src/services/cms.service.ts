import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";

import {
  estimateReadTimeLabel,
  normalizeAnnouncementSearch,
} from "./announcement-helpers";
import {
  computePublishedAverageScore,
  getPublishedStudentGrades,
} from "./cms-helpers";
import {
  idSchema,
  isSafeHttpOrRelativeUrl,
  optionalSafeUrlSchema,
  validate,
} from "./common";
import type {
  AnnouncementAttachment,
  AnnouncementItem,
  HallOfFameStudent,
  StudentProjectItem,
} from "./domain-types";
import { ConflictError, NotFoundError } from "./errors";
import { normalizeHallOfFameSearch } from "./hall-of-fame-helpers";
import {
  cleanupReplacedCloudinaryImage,
  cleanupReplacedSupabaseFile,
} from "./storage.service";
import {
  mapPrismaAnnouncement,
  mapPrismaAnnouncementAttachment,
  mapPrismaHallOfFame,
  mapPrismaStudentForRecommendation,
  mapPrismaStudentProject,
} from "./prisma-mappers";
import {
  isSafePublicUrl,
  matchesNormalizedShowcaseText,
  normalizeShowcaseSearch,
} from "./showcase-helpers";

function getIsoWeekNumber(date: Date): number {
  const utc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
}

// -----------------------------------------------------------------------------
// 1. ANNOUNCEMENTS
// -----------------------------------------------------------------------------

const CATEGORY_LABELS: Record<AnnouncementItem["category"], string> = {
  urgent: "Thông báo quan trọng",
  event: "Sự kiện học thuật",
  homework: "Bài tập tuần",
  schedule: "Lịch học",
  tuition: "Học phí & Học vụ",
};

const VALID_ANN_CATEGORIES = new Set<AnnouncementItem["category"]>([
  "urgent",
  "schedule",
  "tuition",
  "homework",
  "event",
]);

export const announcementAttachmentSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  size: z.string().trim().min(1),
  type: z.enum(["PDF", "DOCX", "SLIDE"]).default("PDF"),
  downloadCount: z.coerce.number().int().min(0).default(0),
  url: optionalSafeUrlSchema,
  objectKey: z.string().trim().max(512).nullish(),
});
export type AnnouncementAttachmentInput = z.infer<
  typeof announcementAttachmentSchema
>;

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(240),
  excerpt: z.string().trim().max(500).optional(),
  content: z.array(z.string().trim().min(1)).optional(),
  category: z
    .enum(["urgent", "schedule", "tuition", "homework", "event"])
    .default("urgent"),
  isPinned: z.boolean().default(true),
  targetClasses: z.array(z.string()).default(["Tất cả các lớp"]),
  attachments: z.array(announcementAttachmentSchema).default([]),
  status: z.enum(["published", "draft"]).default("published"),
});

export const updateAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  excerpt: z.string().trim().max(500).optional(),
  content: z.array(z.string().trim().min(1)).optional(),
  category: z
    .enum(["urgent", "schedule", "tuition", "homework", "event"])
    .optional(),
  isPinned: z.boolean().optional(),
  targetClasses: z.array(z.string()).optional(),
  attachments: z.array(announcementAttachmentSchema).optional(),
  status: z.enum(["published", "draft"]).optional(),
});

export async function listAnnouncements(options?: {
  includeDrafts?: boolean;
  category?: string;
  search?: string;
  targetClass?: string;
  includeAllClassesTarget?: boolean;
  isPinned?: boolean;
  isUrgent?: boolean;
  onlyWithAttachments?: boolean;
}): Promise<AnnouncementItem[]> {
  if (
    options?.category &&
    options.category !== "all" &&
    !VALID_ANN_CATEGORIES.has(options.category as AnnouncementItem["category"])
  ) {
    return [];
  }

  const rows = await prisma.announcement.findMany({
    where: {
      ...(!options?.includeDrafts ? { status: "published" } : {}),
      ...(options?.category && options.category !== "all"
        ? { category: options.category as AnnouncementItem["category"] }
        : {}),
      ...(options?.isPinned !== undefined ? { isPinned: options.isPinned } : {}),
      ...(options?.isUrgent !== undefined ? { isUrgent: options.isUrgent } : {}),
    },
    include: { attachments: true },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });

  const normalizedQuery = options?.search?.trim()
    ? normalizeAnnouncementSearch(options.search)
    : "";
  const targetClassFilter = options?.targetClass?.trim() ?? "";

  return rows.map(mapPrismaAnnouncement).filter((item) => {
    if (targetClassFilter && targetClassFilter !== "all") {
      const lowerTarget = targetClassFilter.toLowerCase();
      const allowAllClasses =
        options?.includeAllClassesTarget === true &&
        targetClassFilter !== "Tất cả các lớp";
      const matchesTarget = item.targetClasses.some(
        (c) =>
          c.toLowerCase().includes(lowerTarget) ||
          (allowAllClasses && c.trim() === "Tất cả các lớp"),
      );
      if (!matchesTarget) return false;
    }
    if (options?.onlyWithAttachments && item.attachments.length === 0) {
      return false;
    }
    if (normalizedQuery) {
      const searchable = normalizeAnnouncementSearch(
        [
          item.title,
          item.excerpt,
          item.categoryLabel,
          item.targetClasses.join(" "),
          item.attachments.map((a) => a.name).join(" "),
        ].join(" "),
      );
      if (!searchable.includes(normalizedQuery)) {
        return false;
      }
    }
    return true;
  });
}

export async function getAnnouncementById(
  id: unknown,
  options?: { includeDrafts?: boolean },
): Promise<AnnouncementItem> {
  const validId = validate(idSchema, id);
  const found = await prisma.announcement.findUnique({
    where: { id: validId },
    include: { attachments: true },
  });
  if (!found) throw new NotFoundError("Announcement", validId);
  if (options?.includeDrafts === false && found.status !== "published") {
    throw new NotFoundError("Announcement", validId);
  }
  return mapPrismaAnnouncement(found);
}

export async function getPublishedAnnouncementById(
  id: unknown,
): Promise<AnnouncementItem> {
  return getAnnouncementById(id, { includeDrafts: false });
}

export async function createAnnouncement(
  input: unknown,
): Promise<AnnouncementItem> {
  const data = validate(createAnnouncementSchema, input);

  const paragraphs =
    data.content && data.content.length > 0
      ? data.content
      : [data.excerpt ?? data.title];

  const created = await prisma.announcement.create({
    data: {
      id: `ann-${randomUUID().slice(0, 12)}`,
      title: data.title,
      excerpt: data.excerpt ?? paragraphs[0] ?? data.title,
      content: paragraphs,
      category: data.category,
      categoryLabel: CATEGORY_LABELS[data.category],
      isUrgent: data.category === "urgent",
      isPinned: data.isPinned,
      publishedAt: new Date().toLocaleDateString("vi-VN"),
      readTime: estimateReadTimeLabel(paragraphs),
      targetClasses: data.targetClasses,
      status: data.status,
      attachments: {
        create: (data.attachments ?? []).map((att) => ({
          id: att.id,
          name: att.name,
          size: att.size,
          type: att.type,
          url: att.url ?? null,
          objectKey: att.objectKey ?? null,
          downloadCount: att.downloadCount,
        })),
      },
    },
    include: { attachments: true },
  });

  return mapPrismaAnnouncement(created);
}

export async function updateAnnouncement(
  id: unknown,
  input: unknown,
): Promise<AnnouncementItem> {
  const validId = validate(idSchema, id);
  const data = validate(updateAnnouncementSchema, input);

  const { updated, removedAttachments } = await prisma.$transaction(async (tx) => {
    const existing = await tx.announcement.findUnique({
      where: { id: validId },
      include: { attachments: true },
    });
    if (!existing) throw new NotFoundError("Announcement", validId);

    const nextCat = data.category ?? existing.category;
    const paragraphs =
      data.content && data.content.length > 0 ? data.content : existing.content;

    let removed: Array<{ url: string | null; objectKey: string | null; name: string }> =
      [];

    if (data.attachments !== undefined) {
      const nextUrlSet = new Set(
        data.attachments.map((a) => a.url?.trim()).filter(Boolean),
      );
      const nextKeySet = new Set(
        data.attachments.map((a) => a.objectKey?.trim()).filter(Boolean),
      );
      removed = existing.attachments
        .filter((oldAtt) => {
          const urlKept = oldAtt.url && nextUrlSet.has(oldAtt.url.trim());
          const keyKept = oldAtt.objectKey && nextKeySet.has(oldAtt.objectKey.trim());
          return !urlKept && !keyKept;
        })
        .map((a) => ({ url: a.url, objectKey: a.objectKey, name: a.name }));

      await tx.announcementAttachment.deleteMany({
        where: { announcementId: validId },
      });
      if (data.attachments.length > 0) {
        await tx.announcementAttachment.createMany({
          data: data.attachments.map((att) => ({
            id: att.id,
            announcementId: validId,
            name: att.name,
            size: att.size,
            type: att.type,
            url: att.url ?? null,
            objectKey: att.objectKey ?? null,
            downloadCount: att.downloadCount,
          })),
        });
      }
    }

    const row = await tx.announcement.update({
      where: { id: validId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        excerpt: data.excerpt ?? paragraphs[0] ?? existing.excerpt,
        content: paragraphs,
        category: nextCat,
        categoryLabel: CATEGORY_LABELS[nextCat],
        isUrgent: nextCat === "urgent",
        ...(data.isPinned !== undefined ? { isPinned: data.isPinned } : {}),
        readTime: estimateReadTimeLabel(paragraphs),
        ...(data.targetClasses !== undefined
          ? { targetClasses: data.targetClasses }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: { attachments: true },
    });

    return { updated: row, removedAttachments: removed };
  });

  if (removedAttachments.length > 0) {
    await Promise.all(
      removedAttachments.map((att) =>
        cleanupReplacedSupabaseFile({
          oldUrl: att.url,
          oldKey: att.objectKey,
          newUrl: null,
          newKey: null,
          reason: `Gỡ tệp đính kèm "${att.name}" khỏi Thông báo "${updated.title}"`,
        }),
      ),
    );
  }

  return mapPrismaAnnouncement(updated);
}

export async function addAnnouncementAttachment(
  id: unknown,
  attachmentInput: unknown,
): Promise<AnnouncementItem> {
  const validId = validate(idSchema, id);
  const attachment: AnnouncementAttachment = validate(
    announcementAttachmentSchema,
    attachmentInput,
  );

  const refreshed = await prisma.$transaction(async (tx) => {
    const existing = await tx.announcement.findUnique({
      where: { id: validId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("Announcement", validId);

    const existingAtt = await tx.announcementAttachment.findUnique({
      where: { id: attachment.id },
    });
    if (existingAtt && existingAtt.announcementId === validId) {
      await tx.announcementAttachment.update({
        where: { id: attachment.id },
        data: {
          name: attachment.name,
          size: attachment.size,
          type: attachment.type,
          url: attachment.url ?? existingAtt.url,
          objectKey: attachment.objectKey ?? existingAtt.objectKey,
          downloadCount: attachment.downloadCount,
        },
      });
    } else {
      await tx.announcementAttachment.create({
        data: {
          id: existingAtt ? `${attachment.id}-${randomUUID().slice(0, 6)}` : attachment.id,
          announcementId: validId,
          name: attachment.name,
          size: attachment.size,
          type: attachment.type,
          url: attachment.url ?? null,
          objectKey: attachment.objectKey ?? null,
          downloadCount: attachment.downloadCount,
        },
      });
    }

    return tx.announcement.findUniqueOrThrow({
      where: { id: validId },
      include: { attachments: true },
    });
  });

  return mapPrismaAnnouncement(refreshed);
}

export async function removeAnnouncementAttachment(
  id: unknown,
  attachmentId: unknown,
): Promise<AnnouncementItem> {
  const validId = validate(idSchema, id);
  const validAttId = validate(idSchema, attachmentId);

  const { refreshed, removedAttachment } = await prisma.$transaction(async (tx) => {
    const existing = await tx.announcement.findUnique({
      where: { id: validId },
      select: { id: true, title: true },
    });
    if (!existing) throw new NotFoundError("Announcement", validId);

    const targetAtt = await tx.announcementAttachment.findFirst({
      where: { id: validAttId, announcementId: validId },
      select: { url: true, objectKey: true, name: true },
    });

    await tx.announcementAttachment.deleteMany({
      where: { id: validAttId, announcementId: validId },
    });

    const row = await tx.announcement.findUniqueOrThrow({
      where: { id: validId },
      include: { attachments: true },
    });
    return {
      refreshed: row,
      removedAttachment: targetAtt
        ? { ...targetAtt, title: existing.title }
        : null,
    };
  });

  if (removedAttachment) {
    await cleanupReplacedSupabaseFile({
      oldUrl: removedAttachment.url,
      oldKey: removedAttachment.objectKey,
      newUrl: null,
      newKey: null,
      reason: `Gỡ tệp đính kèm "${removedAttachment.name}" khỏi Thông báo "${removedAttachment.title}"`,
    });
  }

  return mapPrismaAnnouncement(refreshed);
}

export async function deleteAnnouncement(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const existing = await prisma.announcement.findUnique({
    where: { id: validId },
    include: { attachments: true },
  });
  if (!existing) throw new NotFoundError("Announcement", validId);
  await prisma.announcement.delete({ where: { id: validId } });

  if (existing.attachments.length > 0) {
    await Promise.all(
      existing.attachments.map((att) =>
        cleanupReplacedSupabaseFile({
          oldUrl: att.url,
          oldKey: att.objectKey,
          newUrl: null,
          newKey: null,
          reason: `Xóa Thông báo "${existing.title}" (dọn tệp "${att.name}")`,
        }),
      ),
    );
  }
}

export async function recordAnnouncementAttachmentDownload(
  announcementId: unknown,
  attachmentId: unknown,
): Promise<{
  announcementId: string;
  attachmentId: string;
  name: string;
  size: string;
  type: AnnouncementAttachment["type"];
  downloadCount: number;
  url: string | null;
}> {
  const validAnnId = validate(idSchema, announcementId);
  const validAttId = validate(idSchema, attachmentId);

  const announcement = await prisma.announcement.findFirst({
    where: { id: validAnnId, status: "published" },
    select: { id: true },
  });
  if (!announcement) {
    throw new NotFoundError("Announcement", validAnnId);
  }

  const existingAtt = await prisma.announcementAttachment.findFirst({
    where: { id: validAttId, announcementId: validAnnId },
  });
  if (!existingAtt) {
    throw new NotFoundError("AnnouncementAttachment", validAttId);
  }

  const updated = await prisma.announcementAttachment.update({
    where: { id: validAttId },
    data: { downloadCount: { increment: 1 } },
  });
  const mapped = mapPrismaAnnouncementAttachment(updated);

  return {
    announcementId: validAnnId,
    attachmentId: mapped.id,
    name: mapped.name,
    size: mapped.size,
    type: mapped.type,
    downloadCount: mapped.downloadCount,
    url: mapped.url ?? null,
  };
}

// -----------------------------------------------------------------------------
// 2. HALL OF FAME
// -----------------------------------------------------------------------------

export const createHallOfFameSchema = z.object({
  studentId: z.string().trim().optional(),
  classId: z.string().trim().optional(),
  displayName: z.string().trim().min(1).max(120),
  className: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default("IELTS Intensive (Band 6.5–7.5+)"),
  rank: z.coerce.number().int().min(1).max(5).default(1),
  period: z.enum(["week", "month", "course"]).default("week"),
  periodLabel: z.string().trim().max(120).optional(),
  headlineMetric: z.string().trim().min(1).max(120),
  badgeTitle: z.string().trim().min(1).max(120),
  teacherEndorsement: z.string().trim().max(1000).default(""),
  milestones: z.array(z.string().trim()).default([]),
});

export const updateHallOfFameSchema = z.object({
  studentId: z.string().trim().optional(),
  classId: z.string().trim().optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  className: z.string().trim().min(1).max(120).optional(),
  rank: z.coerce.number().int().min(1).max(5).optional(),
  period: z.enum(["week", "month", "course"]).optional(),
  periodLabel: z.string().trim().max(120).optional(),
  headlineMetric: z.string().trim().min(1).max(120).optional(),
  badgeTitle: z.string().trim().min(1).max(120).optional(),
  teacherEndorsement: z.string().trim().max(1000).optional(),
  milestones: z.array(z.string().trim()).optional(),
});

const VALID_HOF_PERIODS = new Set<HallOfFameStudent["period"]>([
  "week",
  "month",
  "course",
]);

export async function listHallOfFame(options?: {
  period?: string;
  search?: string;
  maxRank?: number;
  className?: string;
  periodLabel?: string;
}): Promise<HallOfFameStudent[]> {
  if (
    options?.period &&
    options.period !== "all" &&
    !VALID_HOF_PERIODS.has(options.period as HallOfFameStudent["period"])
  ) {
    return [];
  }

  const rows = await prisma.hallOfFameEntry.findMany({
    where: {
      ...(options?.period && options.period !== "all"
        ? { period: options.period as HallOfFameStudent["period"] }
        : {}),
      ...(options?.maxRank !== undefined
        ? { rank: { lte: options.maxRank } }
        : {}),
      ...(options?.className && options.className !== "all"
        ? { className: options.className.trim() }
        : {}),
    },
    orderBy: [{ rank: "asc" }, { createdAt: "desc" }],
  });

  const q = options?.search ? normalizeHallOfFameSearch(options.search) : "";
  const batch = options?.periodLabel?.trim();

  return rows.map(mapPrismaHallOfFame).filter((item) => {
    if (batch && batch !== "all" && item.periodLabel.trim() !== batch) {
      return false;
    }
    if (q) {
      const haystack = normalizeHallOfFameSearch(
        [
          item.displayName,
          item.className,
          item.badgeTitle,
          item.headlineMetric,
          item.periodLabel,
          item.teacherEndorsement,
          ...item.milestones,
        ].join(" "),
      );
      if (!haystack.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

export async function getHallOfFameById(
  id: unknown,
): Promise<HallOfFameStudent> {
  const validId = validate(idSchema, id);
  const found = await prisma.hallOfFameEntry.findUnique({
    where: { id: validId },
  });
  if (!found) throw new NotFoundError("HallOfFameEntry", validId);
  return mapPrismaHallOfFame(found);
}

export async function createHallOfFameEntry(
  input: unknown,
): Promise<HallOfFameStudent> {
  const data = validate(createHallOfFameSchema, input);

  const initials = data.displayName
    .split(" ")
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const isoWeek = getIsoWeekNumber(now);
  const defaultPeriodLabel =
    data.period === "week"
      ? `Vinh danh Tuần ${isoWeek} · ${month}/${year}`
      : data.period === "month"
        ? `Vinh danh Tháng ${month}/${year}`
        : `Vinh danh Toàn khóa ${year}`;

  const periodLabel = data.periodLabel?.trim() || defaultPeriodLabel;
  const endorsement =
    data.teacherEndorsement ||
    "Nỗ lực bứt phá xuất sắc và duy trì kỷ luật học tập đáng khen ngợi.";
  const milestones =
    data.milestones && data.milestones.length > 0
      ? data.milestones
      : [data.headlineMetric, "100% bài tập hoàn thành đúng hạn"];

  const saved = await prisma.$transaction(async (tx) => {
    if (data.period === "month") {
      await tx.hallOfFameEntry.deleteMany({
        where: {
          period: "month",
          rank: data.rank,
          periodLabel: { equals: periodLabel, mode: "insensitive" },
        },
      });
    }

    return tx.hallOfFameEntry.create({
      data: {
        id: `hof-${randomUUID().slice(0, 12)}`,
        studentId: data.studentId ?? null,
        classId: data.classId ?? null,
        displayName: data.displayName,
        avatarInitials: initials || "HS",
        className: data.className,
        rank: data.rank,
        period: data.period,
        periodLabel,
        headlineMetric: data.headlineMetric,
        badgeTitle: data.badgeTitle,
        teacherEndorsement: endorsement,
        milestones,
      },
    });
  });

  return mapPrismaHallOfFame(saved);
}

export async function updateHallOfFameEntry(
  id: unknown,
  input: unknown,
): Promise<HallOfFameStudent> {
  const validId = validate(idSchema, id);
  const data = validate(updateHallOfFameSchema, input);

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.hallOfFameEntry.findUnique({
      where: { id: validId },
    });
    if (!current) throw new NotFoundError("HallOfFameEntry", validId);

    const nextName = data.displayName ?? current.displayName;
    const initials = nextName
      .split(" ")
      .slice(-2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

    const nextPeriod = data.period ?? current.period;
    const nextPeriodLabel = data.periodLabel ?? current.periodLabel;
    const nextRank = data.rank ?? current.rank;

    if (nextPeriod === "month") {
      const conflict = await tx.hallOfFameEntry.findFirst({
        where: {
          id: { not: validId },
          period: "month",
          rank: nextRank,
          periodLabel: { equals: nextPeriodLabel, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictError(
          `Đã tồn tại học viên xếp hạng #${nextRank} cho kỳ "${nextPeriodLabel}".`,
        );
      }
    }

    return tx.hallOfFameEntry.update({
      where: { id: validId },
      data: {
        ...(data.studentId !== undefined ? { studentId: data.studentId || null } : {}),
        ...(data.classId !== undefined ? { classId: data.classId || null } : {}),
        displayName: nextName,
        avatarInitials: initials || current.avatarInitials,
        ...(data.className !== undefined ? { className: data.className } : {}),
        rank: nextRank,
        period: nextPeriod,
        periodLabel: nextPeriodLabel,
        ...(data.headlineMetric !== undefined
          ? { headlineMetric: data.headlineMetric }
          : {}),
        ...(data.badgeTitle !== undefined ? { badgeTitle: data.badgeTitle } : {}),
        ...(data.teacherEndorsement !== undefined
          ? { teacherEndorsement: data.teacherEndorsement }
          : {}),
        ...(data.milestones !== undefined ? { milestones: data.milestones } : {}),
      },
    });
  });

  return mapPrismaHallOfFame(updated);
}

export async function deleteHallOfFameEntry(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const existing = await prisma.hallOfFameEntry.findUnique({
    where: { id: validId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("HallOfFameEntry", validId);
  await prisma.hallOfFameEntry.delete({ where: { id: validId } });
}

/**
 * Hoán đổi thứ hạng giữa 2 học sinh trên Bục Vinh Danh (ví dụ Hạng 1 ⇄ Hạng 2)
 */
export async function swapPodiumRanks(
  periodLabel: string,
  rankA: 1 | 2 | 3,
  rankB: 1 | 2 | 3,
): Promise<HallOfFameStudent[]> {
  const label = periodLabel.trim();

  const updatedList = await prisma.$transaction(async (tx) => {
    const entries = await tx.hallOfFameEntry.findMany({
      where: {
        period: "month",
        periodLabel: { equals: label, mode: "insensitive" },
      },
      orderBy: [{ rank: "asc" }, { createdAt: "desc" }],
    });

    const itemA = entries.find((h) => h.rank === rankA);
    const itemB = entries.find((h) => h.rank === rankB);

    if (itemA && itemB) {
      await tx.hallOfFameEntry.update({
        where: { id: itemA.id },
        data: { rank: rankB },
      });
      await tx.hallOfFameEntry.update({
        where: { id: itemB.id },
        data: { rank: rankA },
      });
      return tx.hallOfFameEntry.findMany({
        where: {
          period: "month",
          periodLabel: { equals: label, mode: "insensitive" },
        },
        orderBy: [{ rank: "asc" }, { createdAt: "desc" }],
      });
    }

    return entries;
  });

  return updatedList.map(mapPrismaHallOfFame);
}

/**
 * Gợi ý Top 3 học sinh xuất sắc nhất từ dữ liệu điểm đã công bố (published)
 * và chuyên cần thực tế của học viên đang theo học (active).
 */
export async function recommendTop3Students(): Promise<
  {
    rank: 1 | 2 | 3;
    studentId: string;
    classId: string;
    displayName: string;
    className: string;
    headlineMetric: string;
    badgeTitle: string;
    teacherEndorsement: string;
    milestones: string[];
  }[]
> {
  const activeRows = await prisma.student.findMany({
    where: { status: "active", deletedAt: null },
    include: { grades: true },
  });

  const activeStudents = activeRows.map(mapPrismaStudentForRecommendation);

  const ranked = activeStudents
    .map((student) => {
      const publishedGrades = getPublishedStudentGrades(student);
      const score = computePublishedAverageScore(student);
      const hasPublished =
        publishedGrades.length > 0 ||
        ((student.grades?.length ?? 0) === 0 && (student.averageScore ?? 0) > 0);
      return { student, publishedGrades, score, hasPublished };
    })
    .sort((a, b) => {
      if (a.hasPublished !== b.hasPublished) {
        return a.hasPublished ? -1 : 1;
      }
      if (b.score !== a.score) return b.score - a.score;
      return b.student.attendanceRate - a.student.attendanceRate;
    });

  const badges = [
    "Học viên Xuất sắc Tháng",
    "Cây bút Học thuật Ấn tượng",
    "Bứt phá Nền tảng",
  ] as const;

  const fallbackMetrics = [
    "Học viên Chăm chỉ & Tiến bộ",
    "Best Research Essay",
    "Bứt phá Nền tảng",
  ] as const;

  const defaultEndorsements = [
    "Thành tích dẫn đầu toàn diện, tư duy phản biện sắc sảo và kỷ luật học tập gương mẫu.",
    "Bài viết học thuật đạt điểm tối đa về bố cục logic, lập luận chặt chẽ và trích dẫn chuẩn mực.",
    "Bứt phá mạnh mẽ từ nền tảng với tinh thần tự học kiên trì và sổ tay collocations mẫu mực.",
  ] as const;

  return ranked.slice(0, 3).map((candidate, index) => {
    const grade = candidate.publishedGrades[0];
    const rank = (index + 1) as 1 | 2 | 3;
    const rate = candidate.student.attendanceRate ?? 100;

    let milestones: string[];
    if (grade) {
      if (index === 0) {
        milestones = [
          `Reading ${grade.reading}`,
          `Writing ${grade.writing}`,
          `${rate}% Chuyên cần`,
        ];
      } else if (index === 1) {
        milestones = [
          `Writing ${grade.writing}`,
          `Reading ${grade.reading}`,
          `${rate}% Chuyên cần`,
        ];
      } else {
        milestones = [
          `Listening ${grade.listening}`,
          `Speaking ${grade.speaking}`,
          `${rate}% Chuyên cần`,
        ];
      }
    } else if (index === 0) {
      milestones = [
        `${rate}% Chuyên cần`,
        "Hoàn thành tốt bài tập định kỳ",
        "Tinh thần học tập gương mẫu",
      ];
    } else if (index === 1) {
      milestones = [
        `${rate}% Chuyên cần`,
        "Top Mock Test Writing",
        "Trưởng nhóm Debate",
      ];
    } else {
      milestones = [
        `${rate}% Chuyên cần`,
        "Hoàn thành 100% bài tập",
        "Sổ tay Từ vựng mẫu",
      ];
    }

    return {
      rank,
      studentId: candidate.student.id,
      classId: candidate.student.classId,
      displayName: candidate.student.fullName,
      className: candidate.student.className,
      headlineMetric: candidate.hasPublished
        ? `IELTS ${candidate.score.toFixed(1)} Overall`
        : fallbackMetrics[index],
      badgeTitle: badges[index],
      teacherEndorsement:
        grade?.comment ||
        candidate.student.recentComment ||
        defaultEndorsements[index],
      milestones,
    };
  });
}

// -----------------------------------------------------------------------------
// 3. STUDENT PROJECTS (SHOWCASE)
// -----------------------------------------------------------------------------

export { getYoutubeEmbedUrl } from "@/lib/utils";

export const createStudentProjectSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề dự án không được để trống").max(240),
  studentOrTeam: z
    .string()
    .trim()
    .min(1, "Tác giả hoặc Nhóm tác giả không được để trống")
    .max(160),
  className: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default("IELTS Intensive (Band 6.5–7.5+)"),
  category: z
    .enum([
      "Academic Essay",
      "Video Presentation",
      "Research Poster",
      "Debate Portfolio",
    ])
    .default("Research Poster"),
  summary: z.string().trim().max(2000).default(""),
  keyTakeaway: z.string().trim().max(1000).optional(),
  featuredMetric: z.string().trim().max(80).default("Điểm Đồ án: 9.2/10"),
  accentTheme: z.enum(["navy", "blue", "coral", "cream"]).default("navy"),
  status: z.enum(["published", "draft", "pending_review"]).default("published"),
  externalUrl: z
    .string()
    .trim()
    .max(512)
    .default("#project-preview")
    .refine(
      (val) =>
        isSafeHttpOrRelativeUrl(val, { allowHashPlaceholder: "#project-preview" }),
      "Liên kết ngoài không hợp lệ hoặc sử dụng giao thức không an toàn.",
    ),
  posterUrl: optionalSafeUrlSchema,
  posterPublicId: z.string().trim().max(512).nullish(),
  documentUrl: optionalSafeUrlSchema,
  documentName: z.string().trim().max(255).nullish(),
  documentSize: z.string().trim().max(32).nullish(),
  videoUrl: optionalSafeUrlSchema,
  tags: z.array(z.string().trim().min(1).max(50)).max(15).optional(),
});
export type CreateStudentProjectInput = z.infer<
  typeof createStudentProjectSchema
>;

export const updateStudentProjectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Tiêu đề dự án không được để trống")
    .max(240)
    .optional(),
  studentOrTeam: z
    .string()
    .trim()
    .min(1, "Tác giả hoặc Nhóm tác giả không được để trống")
    .max(160)
    .optional(),
  className: z.string().trim().min(1).max(120).optional(),
  category: z
    .enum([
      "Academic Essay",
      "Video Presentation",
      "Research Poster",
      "Debate Portfolio",
    ])
    .optional(),
  summary: z.string().trim().max(2000).optional(),
  keyTakeaway: z.string().trim().max(1000).optional(),
  featuredMetric: z.string().trim().max(80).optional(),
  accentTheme: z.enum(["navy", "blue", "coral", "cream"]).optional(),
  status: z.enum(["published", "draft", "pending_review"]).optional(),
  externalUrl: z
    .string()
    .trim()
    .max(512)
    .refine(
      (val) =>
        isSafeHttpOrRelativeUrl(val, { allowHashPlaceholder: "#project-preview" }),
      "Liên kết ngoài không hợp lệ hoặc sử dụng giao thức không an toàn.",
    )
    .optional(),
  posterUrl: optionalSafeUrlSchema,
  posterPublicId: z.string().trim().max(512).nullish(),
  documentUrl: optionalSafeUrlSchema,
  documentName: z.string().trim().max(255).nullish(),
  documentSize: z.string().trim().max(32).nullish(),
  videoUrl: optionalSafeUrlSchema,
  tags: z.array(z.string().trim().min(1).max(50)).max(15).optional(),
});
export type UpdateStudentProjectInput = z.infer<
  typeof updateStudentProjectSchema
>;

const VALID_PROJECT_STATUSES = new Set<StudentProjectItem["status"]>([
  "published",
  "draft",
  "pending_review",
]);

export async function listStudentProjects(options?: {
  category?: string;
  className?: string;
  search?: string;
  status?: string;
  includeDrafts?: boolean;
  tag?: string;
  media?: "all" | "video" | "pdf";
}): Promise<StudentProjectItem[]> {
  if (
    options?.status &&
    options.status !== "all" &&
    !VALID_PROJECT_STATUSES.has(options.status as StudentProjectItem["status"])
  ) {
    return [];
  }

  const rows = await prisma.studentProject.findMany({
    where: {
      ...(!options?.includeDrafts ? { status: "published" } : {}),
      ...(options?.status && options.status !== "all"
        ? { status: options.status as StudentProjectItem["status"] }
        : {}),
      ...(options?.category && options.category !== "all"
        ? { category: options.category }
        : {}),
      ...(options?.className && options.className !== "all"
        ? { className: options.className }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });

  const q = options?.search ? normalizeShowcaseSearch(options.search) : "";
  const normalizedTag =
    options?.tag && options.tag !== "all"
      ? normalizeShowcaseSearch(options.tag)
      : "";

  return rows.map(mapPrismaStudentProject).filter((p) => {
    if (
      normalizedTag &&
      !(p.tags ?? []).some((t) => normalizeShowcaseSearch(t) === normalizedTag)
    ) {
      return false;
    }
    if (options?.media === "video" && !isSafePublicUrl(p.videoUrl)) {
      return false;
    }
    if (options?.media === "pdf" && !isSafePublicUrl(p.documentUrl)) {
      return false;
    }
    if (q) {
      const rawText = [
        p.title,
        p.studentOrTeam,
        p.className,
        p.summary,
        p.keyTakeaway,
        p.featuredMetric,
        ...(p.tags ?? []),
      ].join(" ");
      if (!matchesNormalizedShowcaseText(rawText, options?.search ?? "")) {
        return false;
      }
    }
    return true;
  });
}

export async function getStudentProjectById(
  id: unknown,
): Promise<StudentProjectItem> {
  const validId = validate(idSchema, id);
  const row = await prisma.studentProject.findUnique({
    where: { id: validId },
  });
  if (!row) throw new NotFoundError("StudentProject", validId);
  return mapPrismaStudentProject(row);
}

export async function createStudentProject(
  input: unknown,
): Promise<StudentProjectItem> {
  const data = validate(createStudentProjectSchema, input);

  const created = await prisma.studentProject.create({
    data: {
      id: `proj-${randomUUID().slice(0, 12)}`,
      title: data.title,
      studentOrTeam: data.studentOrTeam,
      className: data.className,
      category: data.category,
      summary:
        data.summary ||
        "Dự án nghiên cứu và thuyết trình học thuật bằng tiếng Anh.",
      keyTakeaway:
        data.keyTakeaway ??
        "Bố cục chặt chẽ, dẫn chứng số liệu thuyết phục và phong thái trình bày tự tin.",
      publishedAt: new Date().toLocaleDateString("vi-VN"),
      externalUrl: data.externalUrl,
      featuredMetric: data.featuredMetric,
      accentTheme: data.accentTheme,
      status: data.status,
      posterUrl: data.posterUrl ?? null,
      posterPublicId: data.posterPublicId ?? null,
      documentUrl: data.documentUrl ?? null,
      documentName: data.documentName ?? null,
      documentSize: data.documentSize ?? null,
      videoUrl: data.videoUrl ?? null,
      tags: data.tags ?? [],
    },
  });

  return mapPrismaStudentProject(created);
}

export async function updateStudentProject(
  id: unknown,
  input: unknown,
): Promise<StudentProjectItem> {
  const validId = validate(idSchema, id);
  const data = validate(updateStudentProjectSchema, input);

  const existing = await prisma.studentProject.findUnique({
    where: { id: validId },
    select: { id: true, posterUrl: true, posterPublicId: true, documentUrl: true },
  });
  if (!existing) throw new NotFoundError("StudentProject", validId);

  const updated = await prisma.studentProject.update({
    where: { id: validId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.studentOrTeam !== undefined
        ? { studentOrTeam: data.studentOrTeam }
        : {}),
      ...(data.className !== undefined ? { className: data.className } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.summary !== undefined ? { summary: data.summary } : {}),
      ...(data.keyTakeaway !== undefined
        ? { keyTakeaway: data.keyTakeaway }
        : {}),
      ...(data.featuredMetric !== undefined
        ? { featuredMetric: data.featuredMetric }
        : {}),
      ...(data.accentTheme !== undefined
        ? { accentTheme: data.accentTheme }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.externalUrl !== undefined
        ? { externalUrl: data.externalUrl }
        : {}),
      ...(data.posterUrl !== undefined ? { posterUrl: data.posterUrl } : {}),
      ...(data.posterPublicId !== undefined
        ? { posterPublicId: data.posterPublicId }
        : {}),
      ...(data.documentUrl !== undefined
        ? { documentUrl: data.documentUrl }
        : {}),
      ...(data.documentName !== undefined
        ? { documentName: data.documentName }
        : {}),
      ...(data.documentSize !== undefined
        ? { documentSize: data.documentSize }
        : {}),
      ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl } : {}),
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
    },
  });

  if (data.posterUrl !== undefined || data.posterPublicId !== undefined) {
    await cleanupReplacedCloudinaryImage({
      oldUrl: existing.posterUrl,
      oldPublicId: existing.posterPublicId,
      newUrl: updated.posterUrl,
      newPublicId: updated.posterPublicId,
      reason: `Đổi ảnh bìa Dự án "${updated.title}"`,
    });
  }

  if (data.documentUrl !== undefined) {
    await cleanupReplacedSupabaseFile({
      oldUrl: existing.documentUrl,
      newUrl: updated.documentUrl,
      reason: `Đổi tài liệu PDF Dự án "${updated.title}"`,
    });
  }

  return mapPrismaStudentProject(updated);
}

export async function approveStudentProject(
  id: unknown,
  feedback?: { keyTakeaway?: string; featuredMetric?: string },
): Promise<StudentProjectItem> {
  return updateStudentProject(id, {
    status: "published",
    ...(feedback?.keyTakeaway ? { keyTakeaway: feedback.keyTakeaway } : {}),
    ...(feedback?.featuredMetric
      ? { featuredMetric: feedback.featuredMetric }
      : {}),
  });
}

export async function deleteStudentProject(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const existing = await prisma.studentProject.findUnique({
    where: { id: validId },
    select: {
      id: true,
      title: true,
      posterUrl: true,
      posterPublicId: true,
      documentUrl: true,
    },
  });
  if (!existing) throw new NotFoundError("StudentProject", validId);
  await prisma.studentProject.delete({ where: { id: validId } });

  await Promise.all([
    cleanupReplacedCloudinaryImage({
      oldUrl: existing.posterUrl,
      oldPublicId: existing.posterPublicId,
      newUrl: null,
      newPublicId: null,
      reason: `Xóa Dự án "${existing.title}"`,
    }),
    cleanupReplacedSupabaseFile({
      oldUrl: existing.documentUrl,
      newUrl: null,
      reason: `Xóa Dự án "${existing.title}" (dọn tệp PDF)`,
    }),
  ]);
}
