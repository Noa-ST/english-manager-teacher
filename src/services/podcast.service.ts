import { z } from "zod";

import type { Paginated } from "@/types";

import type { PodcastEpisode } from "./classroom-data";
import { idSchema, paginationSchema, validate } from "./common";
import { NotFoundError } from "./errors";
import { getRuntimeStore } from "./runtime-store";

/**
 * Podcast service — Audio Newsletter (SRS 3.1) and its CMS (SRS 3.2).
 */

export const createPodcastSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(5000).optional(),
  description: z.string().trim().max(5000).optional(),
  category: z
    .enum(["weekly-digest", "ielts-listening", "pronunciation", "parent-corner"])
    .default("weekly-digest"),
  audioKey: z.string().trim().max(512).optional(),
  thumbnailKey: z.string().trim().max(512).optional(),
  durationSeconds: z.coerce.number().int().positive().default(750),
  durationLabel: z.string().trim().max(32).default("12:30"),
  status: z.enum(["published", "draft"]).default("published"),
});
export type CreatePodcastInput = z.infer<typeof createPodcastSchema>;

export const updatePodcastSchema = createPodcastSchema.partial();
export type UpdatePodcastInput = z.infer<typeof updatePodcastSchema>;

export const listPodcastsSchema = paginationSchema.extend({
  includeDrafts: z.coerce.boolean().default(false),
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
});
export type ListPodcastsInput = z.input<typeof listPodcastsSchema>;

export type PodcastSummary = PodcastEpisode;

const CATEGORY_LABELS: Record<PodcastEpisode["category"], string> = {
  "weekly-digest": "Tổng kết tuần",
  "ielts-listening": "IELTS & Học thuật",
  pronunciation: "Phát âm & Ngữ điệu",
  "parent-corner": "Góc Phụ huynh",
};

export async function listPodcasts(
  input?: unknown,
): Promise<Paginated<PodcastEpisode>> {
  const query = validate(listPodcastsSchema, input ?? {});
  const store = getRuntimeStore();

  const filtered = store.podcasts.filter((ep) => {
    if (!query.includeDrafts && ep.status !== "published") return false;
    if (query.category && query.category !== "all" && ep.category !== query.category) {
      return false;
    }
    const q = query.search?.toLowerCase() ?? "";
    if (
      q &&
      !ep.title.toLowerCase().includes(q) &&
      !ep.summary.toLowerCase().includes(q)
    ) {
      return false;
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
  const ep = getRuntimeStore().podcasts.find((p) => p.id === validId);
  if (!ep) throw new NotFoundError("Podcast", validId);
  return ep;
}

export async function createPodcast(input: unknown): Promise<PodcastEpisode> {
  const data = validate(createPodcastSchema, input);
  const store = getRuntimeStore();
  const nextNumber =
    Math.max(12, ...store.podcasts.map((p) => p.episodeNumber)) + 1;

  const newEpisode: PodcastEpisode = {
    id: `ep-${Date.now()}`,
    episodeNumber: nextNumber,
    title: data.title,
    summary:
      data.summary ??
      data.description ??
      "Bản tin âm thanh học thuật hàng tuần cùng ThS. Nguyễn Minh Anh.",
    showNotes: [
      "00:00 — Giới thiệu chủ đề học thuật trong tuần",
      "04:30 — Phân tích cấu trúc từ vựng & ngữ cảnh vận dụng",
      "09:15 — Bài tập thực hành phản xạ tại nhà",
    ],
    category: data.category,
    categoryLabel: CATEGORY_LABELS[data.category],
    durationSeconds: data.durationSeconds,
    durationLabel: data.durationLabel,
    publishedAt: new Date().toLocaleDateString("vi-VN"),
    coverTheme: "navy",
    vocabularyHighlights: [
      {
        term: "pedagogical clarity",
        ipa: "/ˌped.əˈɡɒdʒ.ɪ.kəl ˈklær.ə.ti/",
        meaning: "sự mạch lạc trong phương pháp sư phạm",
      },
    ],
    status: data.status,
  };

  store.podcasts.unshift(newEpisode);
  return newEpisode;
}

export async function updatePodcast(
  id: unknown,
  input: unknown,
): Promise<PodcastEpisode> {
  const validId = validate(idSchema, id);
  const data = validate(updatePodcastSchema, input);
  const store = getRuntimeStore();
  const idx = store.podcasts.findIndex((p) => p.id === validId);
  if (idx === -1) throw new NotFoundError("Podcast", validId);

  const current = store.podcasts[idx];
  const updated: PodcastEpisode = {
    ...current,
    title: data.title ?? current.title,
    summary: data.summary ?? data.description ?? current.summary,
    durationLabel: data.durationLabel ?? current.durationLabel,
    status: data.status ?? current.status,
  };
  store.podcasts[idx] = updated;
  return updated;
}

export async function deletePodcast(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const idx = store.podcasts.findIndex((p) => p.id === validId);
  if (idx === -1) throw new NotFoundError("Podcast", validId);
  store.podcasts.splice(idx, 1);
}
