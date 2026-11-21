import type { StudentProjectItem } from "./classroom-data";

export type ShowcaseCategory = StudentProjectItem["category"];
export type ShowcaseCategoryFilter = "all" | ShowcaseCategory;
export type ShowcaseMediaFilter = "all" | "video" | "pdf";
export type ShowcaseSortKey = "newest" | "oldest" | "title_asc";

/**
 * Bản ghi Dự án học sinh đã làm sạch cho Cổng công khai (Privacy-by-Design):
 * chỉ giữ dự án đã xuất bản (`published`), loại bỏ khóa Cloudinary nội bộ (`posterPublicId`)
 * và kiểm duyệt giao thức an toàn cho mọi đường dẫn media/tài liệu.
 */
export type PublicStudentProject = Omit<StudentProjectItem, "posterPublicId">;

export interface ViewerShowcaseMentor {
  name: string;
  title: string;
}

export interface ViewerShowcasePayload {
  items: PublicStudentProject[];
  mentor: ViewerShowcaseMentor;
  currentTerm: string;
}

export interface ShowcaseStats {
  totalProjects: number;
  uniqueClasses: number;
  videoCount: number;
  pdfCount: number;
  latestPublishedAt: string | null;
}

export const SHOWCASE_CATEGORY_LABELS: Record<ShowcaseCategory, string> = {
  "Research Poster": "Poster Nghiên Cứu",
  "Debate Portfolio": "Hồ Sơ Tranh Biện",
  "Video Presentation": "Video Thuyết Trình",
  "Academic Essay": "Bài Luận Học Thuật",
};

export const SHOWCASE_CATEGORY_FILTERS: {
  value: ShowcaseCategoryFilter;
  label: string;
}[] = [
  { value: "all", label: "Tất cả thể loại" },
  { value: "Research Poster", label: "Poster Nghiên Cứu" },
  { value: "Debate Portfolio", label: "Hồ Sơ Tranh Biện" },
  { value: "Video Presentation", label: "Video Thuyết Trình" },
  { value: "Academic Essay", label: "Bài Luận Học Thuật" },
];

/**
 * Chuẩn hóa chuỗi tiếng Việt (chữ thường, khử dấu NFD, đ -> d, gom khoảng trắng)
 * để tìm kiếm chính xác trên Thư viện dự án.
 */
export function normalizeShowcaseSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kiểm duyệt URL công khai an toàn (`https://`, `http://`, hoặc đường dẫn tương đối `/...`).
 * Chặn `javascript:`, `data:`, protocol-relative `//...` và chuỗi rỗng.
 */
export function isSafePublicUrl(
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
 * Chỉ cho phép nhúng `<iframe>` từ hai nguồn video tin cậy (`youtube-nocookie.com` & `player.vimeo.com`).
 * Mọi liên kết video khác trả về `null` để giao diện hiển thị thẻ liên kết ngoài an toàn thay vì nhúng iframe tùy ý.
 */
export function resolveSafeVideoEmbedUrl(
  url: string | null | undefined,
): string | null {
  if (!isSafePublicUrl(url)) return null;
  const trimmed = url.trim();

  const youtubeMatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
  );
  if (youtubeMatch?.[1]) {
    return `https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}`;
  }

  const vimeoMatch = trimmed.match(
    /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/i,
  );
  if (vimeoMatch?.[1]) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  return null;
}

export function parseShowcaseDateKey(publishedAt: string): number {
  const trimmed = publishedAt.trim();
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    return (
      Number(dmyMatch[3]) * 10000 +
      Number(dmyMatch[2]) * 100 +
      Number(dmyMatch[1])
    );
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return (
      Number(isoMatch[1]) * 10000 +
      Number(isoMatch[2]) * 100 +
      Number(isoMatch[3])
    );
  }
  return 0;
}

/**
 * Lọc chỉ dự án `published`, xóa sạch `posterPublicId` và chuẩn hóa URL an toàn cho Cổng công khai.
 */
export function sanitizeProjectsForPublic(
  items: readonly StudentProjectItem[],
): PublicStudentProject[] {
  return items
    .filter((item) => item.status === "published")
    .map((item) => ({
      id: item.id,
      title: item.title,
      studentOrTeam: item.studentOrTeam,
      className: item.className,
      category: item.category,
      summary: item.summary,
      keyTakeaway: item.keyTakeaway,
      publishedAt: item.publishedAt,
      externalUrl: isSafePublicUrl(item.externalUrl)
        ? item.externalUrl.trim()
        : "",
      featuredMetric: item.featuredMetric,
      accentTheme: item.accentTheme,
      status: item.status,
      posterUrl: isSafePublicUrl(item.posterUrl) ? item.posterUrl.trim() : null,
      documentUrl: isSafePublicUrl(item.documentUrl)
        ? item.documentUrl.trim()
        : null,
      documentName: item.documentName ?? null,
      documentSize: item.documentSize ?? null,
      videoUrl: isSafePublicUrl(item.videoUrl) ? item.videoUrl.trim() : null,
      tags: [...(item.tags ?? [])],
    }));
}

export function matchesNormalizedShowcaseText(
  rawText: string,
  query: string,
): boolean {
  const q = normalizeShowcaseSearch(query);
  if (!q) return true;

  const haystack = normalizeShowcaseSearch(rawText);
  if (q.length <= 2 && /^[a-z0-9]+$/.test(q)) {
    const tokens = haystack.split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.some((token) => token.startsWith(q));
  }

  return haystack.includes(q);
}

export function matchesShowcaseQuery(
  project: PublicStudentProject,
  query: string,
): boolean {
  if (!query.trim()) return true;

  const rawText = [
    project.title,
    project.studentOrTeam,
    project.className,
    project.category,
    SHOWCASE_CATEGORY_LABELS[project.category] ?? "",
    project.summary,
    project.keyTakeaway,
    project.featuredMetric,
    ...(project.tags ?? []),
  ].join(" ");

  return matchesNormalizedShowcaseText(rawText, query);
}

export function filterAndSortProjects(
  items: readonly PublicStudentProject[],
  options?: {
    category?: ShowcaseCategoryFilter;
    className?: string;
    tag?: string;
    media?: ShowcaseMediaFilter;
    search?: string;
    sortBy?: ShowcaseSortKey;
  },
): PublicStudentProject[] {
  const category = options?.category ?? "all";
  const className = options?.className?.trim() ?? "all";
  const tag = options?.tag?.trim() ?? "all";
  const normalizedTag =
    tag && tag !== "all" ? normalizeShowcaseSearch(tag) : "";
  const media = options?.media ?? "all";
  const search = options?.search ?? "";
  const sortBy = options?.sortBy ?? "newest";

  const filtered = items.filter((project) => {
    if (category !== "all" && project.category !== category) return false;
    if (className !== "all" && project.className !== className) return false;
    if (
      normalizedTag &&
      !(project.tags ?? []).some(
        (t) => normalizeShowcaseSearch(t) === normalizedTag,
      )
    ) {
      return false;
    }
    if (media === "video" && !isSafePublicUrl(project.videoUrl)) return false;
    if (media === "pdf" && !isSafePublicUrl(project.documentUrl)) return false;
    if (!matchesShowcaseQuery(project, search)) return false;
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === "title_asc") {
      return a.title.localeCompare(b.title, "vi");
    }
    if (sortBy === "oldest") {
      const dateDiff =
        parseShowcaseDateKey(a.publishedAt) -
        parseShowcaseDateKey(b.publishedAt);
      return dateDiff !== 0 ? dateDiff : a.title.localeCompare(b.title, "vi");
    }
    const dateDiff =
      parseShowcaseDateKey(b.publishedAt) - parseShowcaseDateKey(a.publishedAt);
    return dateDiff !== 0 ? dateDiff : a.title.localeCompare(b.title, "vi");
  });
}

export function countProjectsByCategory(
  items: readonly PublicStudentProject[],
): Record<ShowcaseCategoryFilter, number> {
  const counts: Record<ShowcaseCategoryFilter, number> = {
    all: items.length,
    "Research Poster": 0,
    "Debate Portfolio": 0,
    "Video Presentation": 0,
    "Academic Essay": 0,
  };

  for (const project of items) {
    counts[project.category] += 1;
  }

  return counts;
}

export function extractProjectClasses(
  items: readonly PublicStudentProject[],
): string[] {
  const set = new Set<string>();
  for (const project of items) {
    const cls = project.className.trim();
    if (cls) set.add(cls);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
}

export function extractProjectTags(
  items: readonly PublicStudentProject[],
): string[] {
  const counts = new Map<string, number>();
  for (const project of items) {
    for (const rawTag of project.tags ?? []) {
      const tag = rawTag.trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"))
    .map(([tag]) => tag);
}

export function computeShowcaseStats(
  items: readonly PublicStudentProject[],
): ShowcaseStats {
  const classes = new Set<string>();
  let videoCount = 0;
  let pdfCount = 0;
  let latestPublishedAt: string | null = null;
  let bestDateKey = -1;

  for (const project of items) {
    const cls = project.className.trim();
    if (cls) classes.add(cls);
    if (isSafePublicUrl(project.videoUrl)) videoCount += 1;
    if (isSafePublicUrl(project.documentUrl)) pdfCount += 1;

    const key = parseShowcaseDateKey(project.publishedAt);
    if (key > bestDateKey && project.publishedAt.trim()) {
      bestDateKey = key;
      latestPublishedAt = project.publishedAt;
    }
  }

  return {
    totalProjects: items.length,
    uniqueClasses: classes.size,
    videoCount,
    pdfCount,
    latestPublishedAt,
  };
}

export function getAdjacentProjects(
  currentId: string,
  orderedList: readonly PublicStudentProject[],
): { prev: PublicStudentProject | null; next: PublicStudentProject | null } {
  const idx = orderedList.findIndex((p) => p.id === currentId);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? orderedList[idx - 1] : null,
    next: idx < orderedList.length - 1 ? orderedList[idx + 1] : null,
  };
}
