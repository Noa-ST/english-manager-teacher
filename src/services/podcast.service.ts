import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import type { Paginated } from "@/types";

import { parseDurationLabelToSeconds } from "./cms-helpers";
import { idSchema, paginationSchema, validate } from "./common";
import type { PodcastEpisode } from "./domain-types";
import { NotFoundError } from "./errors";
import {
  isSafePublicAudioUrl,
  normalizePodcastSearch,
} from "./podcast-helpers";
import {
  mapPrismaPodcast,
  toPrismaJson,
  toPrismaPodcastCategory,
} from "./prisma-mappers";
import {
  cleanupReplacedCloudinaryImage,
  cleanupReplacedSupabaseFile,
} from "./storage.service";

/**
 * Podcast service — Audio Newsletter (SRS 3.1) and its CMS (SRS 3.2).
 * Backed 100% by PostgreSQL via Prisma.
 */

export const vocabularyItemSchema = z.object({
  term: z.string().trim().min(1).max(100),
  ipa: z.string().trim().max(100).default(""),
  meaning: z.string().trim().min(1).max(300),
});
export type VocabularyItem = z.infer<typeof vocabularyItemSchema>;

export const createPodcastSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề không được để trống").max(200),
  summary: z.string().trim().max(5000).optional(),
  description: z.string().trim().max(5000).optional(),
  category: z
    .enum(["weekly-digest", "ielts-listening", "pronunciation", "parent-corner"])
    .default("weekly-digest"),
  audioKey: z.string().trim().max(512).nullish(),
  audioUrl: z.string().trim().max(1024).nullish(),
  thumbnailKey: z.string().trim().max(512).nullish(),
  durationSeconds: z.coerce.number().int().positive().default(750),
  durationLabel: z.string().trim().max(32).optional(),
  status: z.enum(["published", "draft"]).default("published"),
  isFeatured: z.boolean().default(false),
  coverTheme: z.enum(["navy", "cream", "sky", "coral"]).default("navy"),
  showNotes: z.array(z.string().trim().min(1)).max(50).optional(),
  vocabularyHighlights: z.array(vocabularyItemSchema).max(50).optional(),
});
export type CreatePodcastInput = z.infer<typeof createPodcastSchema>;

export const updatePodcastSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề không được để trống").max(200).optional(),
  summary: z.string().trim().max(5000).optional(),
  description: z.string().trim().max(5000).optional(),
  category: z
    .enum(["weekly-digest", "ielts-listening", "pronunciation", "parent-corner"])
    .optional(),
  audioKey: z.string().trim().max(512).nullish(),
  audioUrl: z.string().trim().max(1024).nullish(),
  thumbnailKey: z.string().trim().max(512).nullish(),
  durationSeconds: z.coerce.number().int().positive().optional(),
  durationLabel: z.string().trim().max(32).optional(),
  status: z.enum(["published", "draft"]).optional(),
  isFeatured: z.boolean().optional(),
  coverTheme: z.enum(["navy", "cream", "sky", "coral"]).optional(),
  showNotes: z.array(z.string().trim().min(1)).max(50).optional(),
  vocabularyHighlights: z.array(vocabularyItemSchema).max(50).optional(),
});
export type UpdatePodcastInput = z.infer<typeof updatePodcastSchema>;

export const listPodcastsSchema = paginationSchema.extend({
  includeDrafts: z.coerce.boolean().default(false),
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
  onlyWithAudio: z.coerce.boolean().optional(),
});
export type ListPodcastsInput = z.input<typeof listPodcastsSchema>;

export type PodcastSummary = PodcastEpisode;

const CATEGORY_LABELS: Record<PodcastEpisode["category"], string> = {
  "weekly-digest": "Tổng kết tuần",
  "ielts-listening": "IELTS & Học thuật",
  pronunciation: "Phát âm & Ngữ điệu",
  "parent-corner": "Góc Phụ huynh",
};

const VALID_CATEGORIES = new Set<PodcastEpisode["category"]>([
  "weekly-digest",
  "ielts-listening",
  "pronunciation",
  "parent-corner",
]);

export function formatPodcastDuration(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function listPodcasts(
  input?: unknown,
): Promise<Paginated<PodcastEpisode>> {
  const query = validate(listPodcastsSchema, input ?? {});

  const categoryFilter =
    query.category &&
    query.category !== "all" &&
    VALID_CATEGORIES.has(query.category as PodcastEpisode["category"])
      ? toPrismaPodcastCategory(query.category as PodcastEpisode["category"])
      : undefined;

  if (query.category && query.category !== "all" && !categoryFilter) {
    return {
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      total: 0,
    };
  }

  const rows = await prisma.podcastEpisode.findMany({
    where: {
      ...(!query.includeDrafts ? { status: "published" } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { episodeNumber: "desc" }],
  });

  const mapped = rows.map(mapPrismaPodcast);
  const q = query.search ? normalizePodcastSearch(query.search) : "";

  const filtered = mapped.filter((ep) => {
    if (query.onlyWithAudio && !isSafePublicAudioUrl(ep.audioUrl)) {
      return false;
    }
    if (q) {
      const haystack = normalizePodcastSearch(
        [
          ep.title,
          ep.summary,
          ep.categoryLabel,
          `tap ${ep.episodeNumber}`,
          ...ep.showNotes,
          ...(ep.vocabularyHighlights ?? []).flatMap((v) => [
            v.term,
            v.meaning,
          ]),
        ].join(" "),
      );
      if (!haystack.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const start = (query.page - 1) * query.pageSize;
  const items = filtered.slice(start, start + query.pageSize);

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: filtered.length,
  };
}

export async function getPodcastById(id: unknown): Promise<PodcastEpisode> {
  const validId = validate(idSchema, id);
  const row = await prisma.podcastEpisode.findUnique({
    where: { id: validId },
  });
  if (!row) throw new NotFoundError("Podcast", validId);
  return mapPrismaPodcast(row);
}

export async function createPodcast(input: unknown): Promise<PodcastEpisode> {
  const rawObj =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const hasExplicitDurationSeconds =
    rawObj.durationSeconds !== undefined &&
    rawObj.durationSeconds !== null &&
    rawObj.durationSeconds !== "";

  const data = validate(createPodcastSchema, input);

  const durationSec =
    !hasExplicitDurationSeconds && data.durationLabel
      ? parseDurationLabelToSeconds(data.durationLabel, data.durationSeconds)
      : data.durationSeconds;
  const durationLabel = data.durationLabel ?? formatPodcastDuration(durationSec);

  const created = await prisma.$transaction(async (tx) => {
    const agg = await tx.podcastEpisode.aggregate({
      _max: { episodeNumber: true },
    });
    const nextNumber = Math.max(12, agg._max.episodeNumber ?? 0) + 1;

    if (data.isFeatured === true) {
      await tx.podcastEpisode.updateMany({
        where: { isFeatured: true },
        data: { isFeatured: false },
      });
    }

    return tx.podcastEpisode.create({
      data: {
        id: `ep-${randomUUID().slice(0, 12)}`,
        episodeNumber: nextNumber,
        title: data.title,
        summary:
          data.summary ??
          data.description ??
          "Bản tin âm thanh học thuật hàng tuần cùng ThS. Nguyễn Minh Anh.",
        showNotes: data.showNotes ?? [
          "00:00 — Giới thiệu chủ đề học thuật trong tuần",
          "04:30 — Phân tích cấu trúc từ vựng & ngữ cảnh vận dụng",
          "09:15 — Bài tập thực hành phản xạ tại nhà",
        ],
        category: toPrismaPodcastCategory(data.category),
        categoryLabel: CATEGORY_LABELS[data.category],
        durationSeconds: durationSec,
        durationLabel,
        publishedAt: new Date().toLocaleDateString("vi-VN"),
        isFeatured: data.isFeatured ?? false,
        coverTheme: data.coverTheme ?? "navy",
        vocabularyHighlights: toPrismaJson(
          data.vocabularyHighlights ?? [
            {
              term: "pedagogical clarity",
              ipa: "/ˌped.əˈɡɒdʒ.ɪ.kəl ˈklær.ə.ti/",
              meaning: "sự mạch lạc trong phương pháp sư phạm",
            },
          ],
        ),
        status: data.status,
        audioKey: data.audioKey ?? null,
        audioUrl: data.audioUrl ?? null,
        thumbnailKey: data.thumbnailKey ?? null,
      },
    });
  });

  return mapPrismaPodcast(created);
}

export async function updatePodcast(
  id: unknown,
  input: unknown,
): Promise<PodcastEpisode> {
  const validId = validate(idSchema, id);
  const rawObj =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const hasExplicitDurationSeconds =
    rawObj.durationSeconds !== undefined &&
    rawObj.durationSeconds !== null &&
    rawObj.durationSeconds !== "";

  const data = validate(updatePodcastSchema, input);

  const {
    updated,
    previousThumbnailKey,
    previousAudioUrl,
    previousAudioKey,
  } = await prisma.$transaction(async (tx) => {
    const existing = await tx.podcastEpisode.findUnique({
      where: { id: validId },
    });
    if (!existing) throw new NotFoundError("Podcast", validId);

    const newDurationSec =
      hasExplicitDurationSeconds && data.durationSeconds !== undefined
        ? data.durationSeconds
        : data.durationLabel
          ? parseDurationLabelToSeconds(data.durationLabel, existing.durationSeconds)
          : existing.durationSeconds;
    const newDurationLabel =
      data.durationLabel ??
      (hasExplicitDurationSeconds && data.durationSeconds
        ? formatPodcastDuration(newDurationSec)
        : existing.durationLabel);

    if (data.isFeatured === true) {
      await tx.podcastEpisode.updateMany({
        where: { id: { not: validId }, isFeatured: true },
        data: { isFeatured: false },
      });
    }

    const row = await tx.podcastEpisode.update({
      where: { id: validId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.summary !== undefined || data.description !== undefined
          ? { summary: data.summary ?? data.description ?? existing.summary }
          : {}),
        ...(data.category !== undefined
          ? {
              category: toPrismaPodcastCategory(data.category),
              categoryLabel: CATEGORY_LABELS[data.category],
            }
          : {}),
        durationSeconds: newDurationSec,
        durationLabel: newDurationLabel,
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
        ...(data.coverTheme !== undefined ? { coverTheme: data.coverTheme } : {}),
        ...(data.showNotes !== undefined ? { showNotes: data.showNotes } : {}),
        ...(data.vocabularyHighlights !== undefined
          ? { vocabularyHighlights: toPrismaJson(data.vocabularyHighlights) }
          : {}),
        ...(data.audioKey !== undefined ? { audioKey: data.audioKey } : {}),
        ...(data.audioUrl !== undefined ? { audioUrl: data.audioUrl } : {}),
        ...(data.thumbnailKey !== undefined
          ? { thumbnailKey: data.thumbnailKey }
          : {}),
      },
    });
    return {
      updated: row,
      previousThumbnailKey: existing.thumbnailKey,
      previousAudioUrl: existing.audioUrl,
      previousAudioKey: existing.audioKey,
    };
  });

  if (data.thumbnailKey !== undefined) {
    await cleanupReplacedCloudinaryImage({
      oldUrl: previousThumbnailKey,
      newUrl: updated.thumbnailKey,
      reason: `Đổi ảnh bìa Podcast "${updated.title}"`,
    });
  }

  if (data.audioUrl !== undefined || data.audioKey !== undefined) {
    await cleanupReplacedSupabaseFile({
      oldUrl: previousAudioUrl,
      oldKey: previousAudioKey,
      newUrl: updated.audioUrl,
      newKey: updated.audioKey,
      reason: `Đổi tệp âm thanh Podcast "${updated.title}"`,
    });
  }

  return mapPrismaPodcast(updated);
}

export async function deletePodcast(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const existing = await prisma.podcastEpisode.findUnique({
    where: { id: validId },
    select: {
      id: true,
      title: true,
      thumbnailKey: true,
      audioUrl: true,
      audioKey: true,
    },
  });
  if (!existing) throw new NotFoundError("Podcast", validId);
  await prisma.podcastEpisode.delete({ where: { id: validId } });

  await Promise.all([
    cleanupReplacedCloudinaryImage({
      oldUrl: existing.thumbnailKey,
      newUrl: null,
      reason: `Xóa tập Podcast "${existing.title}"`,
    }),
    cleanupReplacedSupabaseFile({
      oldUrl: existing.audioUrl,
      oldKey: existing.audioKey,
      newUrl: null,
      newKey: null,
      reason: `Xóa tập Podcast "${existing.title}"`,
    }),
  ]);
}
