import type { PodcastEpisode } from "./classroom-data";

export type PodcastCategory = PodcastEpisode["category"];
export type PodcastCategoryFilter = "all" | PodcastCategory;
export type PodcastSortKey = "newest" | "oldest" | "shortest" | "longest";

/**
 * Bản ghi Podcast đã được làm sạch cho Cổng công khai (Privacy-by-Design):
 * tuyệt đối loại bỏ mọi khóa lưu trữ nội bộ (`audioKey`, `thumbnailKey`) và chỉ giữ tập đã xuất bản.
 */
export type PublicPodcastEpisode = Omit<
  PodcastEpisode,
  "audioKey" | "thumbnailKey"
>;

export interface ViewerPodcastHost {
  name: string;
  title: string;
  avatarUrl: string;
}

export interface ViewerPodcastsPayload {
  items: PublicPodcastEpisode[];
  host: ViewerPodcastHost;
  currentTerm: string;
}

export interface ShowNoteChapter {
  index: number;
  seconds: number | null;
  timestampLabel: string | null;
  text: string;
  raw: string;
}

export interface PodcastStats {
  totalEpisodes: number;
  totalDurationSeconds: number;
  totalVocabulary: number;
  audioReadyCount: number;
  latestPublishedAt: string | null;
}

export const PODCAST_CATEGORY_FILTERS: {
  value: PodcastCategoryFilter;
  label: string;
}[] = [
  { value: "all", label: "Tất cả chủ đề" },
  { value: "weekly-digest", label: "Tổng kết tuần" },
  { value: "ielts-listening", label: "IELTS & Học thuật" },
  { value: "pronunciation", label: "Phát âm & Ngữ điệu" },
  { value: "parent-corner", label: "Góc Phụ huynh" },
];

/**
 * Chuẩn hóa chuỗi tiếng Việt (chữ thường, khử dấu NFD, chuyển đ -> d, gom khoảng trắng)
 * để tìm kiếm chính xác tiêu đề, Show Notes và nghĩa từ vựng.
 */
export function normalizePodcastSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chỉ cho phép URL âm thanh công khai an toàn (`https://`, `http://`, hoặc đường dẫn nội bộ `/...`).
 */
export function isSafePublicAudioUrl(
  url: string | null | undefined,
): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("//")) return false;
  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("/")
  );
}

/**
 * Loại bỏ các tập bản nháp (`draft`) và xóa sạch `audioKey`, `thumbnailKey` nội bộ.
 */
export function sanitizePodcastsForPublic(
  items: readonly PodcastEpisode[],
): PublicPodcastEpisode[] {
  return items
    .filter((ep) => ep.status === "published")
    .map((ep) => ({
      id: ep.id,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      summary: ep.summary,
      showNotes: [...ep.showNotes],
      category: ep.category,
      categoryLabel: ep.categoryLabel,
      durationSeconds: ep.durationSeconds,
      durationLabel: ep.durationLabel,
      publishedAt: ep.publishedAt,
      isFeatured: ep.isFeatured,
      coverTheme: ep.coverTheme,
      vocabularyHighlights: (ep.vocabularyHighlights ?? []).map((vocab) => ({
        ...vocab,
      })),
      status: ep.status,
      audioUrl: isSafePublicAudioUrl(ep.audioUrl) ? ep.audioUrl.trim() : null,
    }));
}

/**
 * Tách mốc thời gian MM:SS hoặc HH:MM:SS từ từng dòng Show Notes để bấm-là-tua.
 */
export function parseShowNoteChapters(
  showNotes: readonly string[],
): ShowNoteChapter[] {
  return showNotes.map((raw, index) => {
    const trimmed = raw.trim();
    const match = trimmed.match(
      /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*(?:[—–\-:]\s*)?(.*)$/,
    );

    if (match) {
      const hours = match[1] ? Number(match[1]) : 0;
      const minutes = Number(match[2]);
      const secs = Number(match[3]);
      if (secs < 60 && (hours === 0 || minutes < 60)) {
        const totalSeconds = hours * 3600 + minutes * 60 + secs;
        const timestampLabel =
          hours > 0
            ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
            : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        const text = (match[4] ?? "").trim() || trimmed;
        return {
          index,
          seconds: totalSeconds,
          timestampLabel,
          text,
          raw,
        };
      }
    }

    return {
      index,
      seconds: null,
      timestampLabel: null,
      text: trimmed,
      raw,
    };
  });
}

/**
 * Xác định chương Show Notes đang phát tại thời điểm `currentTimeSeconds`.
 */
export function resolveActiveChapterIndex(
  chapters: readonly ShowNoteChapter[],
  currentTimeSeconds: number,
): number {
  let active = -1;
  for (let i = 0; i < chapters.length; i += 1) {
    const sec = chapters[i].seconds;
    if (sec !== null && sec <= currentTimeSeconds + 0.5) {
      active = i;
    }
  }
  if (active !== -1) return active;
  return chapters.findIndex((chapter) => chapter.seconds !== null);
}

/**
 * Chọn tập phát mặc định: ưu tiên `requestedId` -> `isFeatured` -> số tập cao nhất.
 */
export function selectDefaultEpisode(
  items: readonly PublicPodcastEpisode[],
  requestedId?: string | null,
): PublicPodcastEpisode | null {
  if (items.length === 0) return null;

  if (requestedId) {
    const requested = items.find((ep) => ep.id === requestedId);
    if (requested) return requested;
  }

  const featured = items.find((ep) => ep.isFeatured === true);
  if (featured) return featured;

  return [...items].sort((a, b) => b.episodeNumber - a.episodeNumber)[0] ?? null;
}

export function matchesPodcastQuery(
  ep: PublicPodcastEpisode,
  query: string,
): boolean {
  const q = normalizePodcastSearch(query);
  if (!q) return true;

  const haystack = normalizePodcastSearch(
    [
      ep.title,
      ep.summary,
      ep.categoryLabel,
      `tap ${ep.episodeNumber}`,
      `#${ep.episodeNumber}`,
      ep.publishedAt,
      ...ep.showNotes,
      ...(ep.vocabularyHighlights ?? []).flatMap((vocab) => [
        vocab.term,
        vocab.meaning,
      ]),
    ].join(" "),
  );

  return haystack.includes(q);
}

export function filterAndSortPodcasts(
  items: readonly PublicPodcastEpisode[],
  options?: {
    category?: PodcastCategoryFilter;
    search?: string;
    onlyWithAudio?: boolean;
    sortBy?: PodcastSortKey;
  },
): PublicPodcastEpisode[] {
  const category = options?.category ?? "all";
  const search = options?.search ?? "";
  const onlyWithAudio = Boolean(options?.onlyWithAudio);
  const sortBy = options?.sortBy ?? "newest";

  const filtered = items.filter((ep) => {
    if (category !== "all" && ep.category !== category) return false;
    if (onlyWithAudio && !isSafePublicAudioUrl(ep.audioUrl)) return false;
    if (!matchesPodcastQuery(ep, search)) return false;
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === "oldest") {
      return a.episodeNumber - b.episodeNumber;
    }
    if (sortBy === "shortest") {
      const diff = a.durationSeconds - b.durationSeconds;
      return diff !== 0 ? diff : b.episodeNumber - a.episodeNumber;
    }
    if (sortBy === "longest") {
      const diff = b.durationSeconds - a.durationSeconds;
      return diff !== 0 ? diff : b.episodeNumber - a.episodeNumber;
    }
    return b.episodeNumber - a.episodeNumber;
  });
}

export function countPodcastsByCategory(
  items: readonly PublicPodcastEpisode[],
): Record<PodcastCategoryFilter, number> {
  const counts: Record<PodcastCategoryFilter, number> = {
    all: items.length,
    "weekly-digest": 0,
    "ielts-listening": 0,
    pronunciation: 0,
    "parent-corner": 0,
  };

  for (const ep of items) {
    counts[ep.category] += 1;
  }

  return counts;
}

export function computePodcastStats(
  items: readonly PublicPodcastEpisode[],
): PodcastStats {
  let totalDurationSeconds = 0;
  let totalVocabulary = 0;
  let audioReadyCount = 0;
  let latestEp: PublicPodcastEpisode | null = null;

  for (const ep of items) {
    totalDurationSeconds += Math.max(0, ep.durationSeconds);
    totalVocabulary += ep.vocabularyHighlights?.length ?? 0;
    if (isSafePublicAudioUrl(ep.audioUrl)) {
      audioReadyCount += 1;
    }
    if (!latestEp || ep.episodeNumber > latestEp.episodeNumber) {
      latestEp = ep;
    }
  }

  return {
    totalEpisodes: items.length,
    totalDurationSeconds,
    totalVocabulary,
    audioReadyCount,
    latestPublishedAt: latestEp?.publishedAt ?? null,
  };
}

export function formatTotalListeningDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  if (safeSeconds === 0) return "0 phút";
  const totalMinutes = Math.max(1, Math.round(safeSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${totalMinutes} phút`;
  if (mins === 0) return `${hours} giờ`;
  return `${hours} giờ ${mins} phút`;
}

export function getAdjacentEpisodes(
  currentId: string,
  orderedList: readonly PublicPodcastEpisode[],
): { prev: PublicPodcastEpisode | null; next: PublicPodcastEpisode | null } {
  const idx = orderedList.findIndex((ep) => ep.id === currentId);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? orderedList[idx - 1] : null,
    next: idx < orderedList.length - 1 ? orderedList[idx + 1] : null,
  };
}
