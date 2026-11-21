import type {
  AnnouncementCategory,
  AnnouncementItem,
} from "./classroom-data";

export const ANNOUNCEMENT_CATEGORY_FILTERS: readonly {
  value: "all" | AnnouncementCategory;
  label: string;
}[] = [
  { value: "all", label: "Tất cả thông báo" },
  { value: "urgent", label: "Thông báo quan trọng" },
  { value: "event", label: "Sự kiện học thuật" },
  { value: "homework", label: "Bài tập tuần" },
  { value: "schedule", label: "Lịch học" },
  { value: "tuition", label: "Học phí & Học vụ" },
];

export interface AnnouncementNavItem {
  id: string;
  title: string;
  categoryLabel: string;
  publishedAt: string;
}

export function normalizeAnnouncementSearch(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function estimateReadTimeLabel(paragraphs: string[]): string {
  const words = paragraphs
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const mins = Math.max(1, Math.ceil(words / 180));
  return `${mins} phút đọc`;
}

export function extractUniqueTargetClasses(
  items: AnnouncementItem[],
): string[] {
  const seen = new Set<string>();
  let hasAllClasses = false;

  for (const item of items) {
    if (item.status !== "published") continue;
    for (const raw of item.targetClasses) {
      const clean = raw.trim();
      if (!clean) continue;
      if (clean === "Tất cả các lớp") {
        hasAllClasses = true;
      } else {
        seen.add(clean);
      }
    }
  }

  const sorted = Array.from(seen).sort((a, b) => a.localeCompare(b, "vi"));
  return hasAllClasses ? ["Tất cả các lớp", ...sorted] : sorted;
}

export function countAnnouncementsByCategory(
  items: AnnouncementItem[],
): Record<"all" | AnnouncementCategory, number> {
  const counts: Record<"all" | AnnouncementCategory, number> = {
    all: 0,
    urgent: 0,
    schedule: 0,
    tuition: 0,
    homework: 0,
    event: 0,
  };

  for (const item of items) {
    if (item.status !== "published") continue;
    counts.all += 1;
    if (item.category in counts) {
      counts[item.category] += 1;
    }
  }

  return counts;
}

export function selectHeroAnnouncement(
  items: AnnouncementItem[],
): AnnouncementItem | null {
  const published = items.filter((item) => item.status === "published");
  if (published.length === 0) return null;

  return (
    published.find((item) => item.isPinned && item.isUrgent) ??
    published.find((item) => item.isUrgent) ??
    published.find((item) => item.isPinned) ??
    null
  );
}

export function filterAndSortAnnouncements(
  items: AnnouncementItem[],
  options: {
    category?: "all" | AnnouncementCategory;
    targetClass?: string;
    search?: string;
    onlyWithAttachments?: boolean;
    excludeId?: string;
  } = {},
): AnnouncementItem[] {
  const normalizedQuery = options.search
    ? normalizeAnnouncementSearch(options.search)
    : "";
  const targetClassClean = options.targetClass?.trim() ?? "";

  return items
    .filter((item) => {
      if (item.status !== "published") return false;
      if (options.excludeId && item.id === options.excludeId) return false;
      if (
        options.category &&
        options.category !== "all" &&
        item.category !== options.category
      ) {
        return false;
      }

      if (targetClassClean && targetClassClean !== "all") {
        const lowerTarget = targetClassClean.toLowerCase();
        const matchesClass =
          targetClassClean === "Tất cả các lớp"
            ? item.targetClasses.some((c) => c.trim() === "Tất cả các lớp")
            : item.targetClasses.some(
                (c) =>
                  c.trim() === "Tất cả các lớp" ||
                  c.toLowerCase().includes(lowerTarget),
              );
        if (!matchesClass) return false;
      }

      if (options.onlyWithAttachments && item.attachments.length === 0) {
        return false;
      }

      if (normalizedQuery) {
        const searchable = normalizeAnnouncementSearch(
          [
            item.title,
            item.excerpt,
            item.content.join(" "),
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
    })
    .sort((a, b) => {
      const urgentDiff = Number(Boolean(b.isUrgent)) - Number(Boolean(a.isUrgent));
      if (urgentDiff !== 0) return urgentDiff;
      return Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
    });
}

export function selectRelatedAnnouncements(
  current: AnnouncementItem,
  allPublished: AnnouncementItem[],
  limit = 2,
): AnnouncementItem[] {
  const currentSpecificClasses = new Set(
    current.targetClasses
      .map((c) => c.trim())
      .filter((c) => c && c !== "Tất cả các lớp"),
  );

  return allPublished
    .filter((a) => a.status === "published" && a.id !== current.id)
    .map((candidate) => {
      let score = candidate.category === current.category ? 3 : 0;
      for (const cls of candidate.targetClasses) {
        if (currentSpecificClasses.has(cls.trim())) {
          score += 2;
        }
      }
      if (candidate.isPinned) {
        score += 1;
      }
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function getAdjacentAnnouncements(
  currentId: string,
  allPublished: AnnouncementItem[],
): { prev: AnnouncementNavItem | null; next: AnnouncementNavItem | null } {
  const published = allPublished.filter((a) => a.status === "published");
  const idx = published.findIndex((a) => a.id === currentId);
  if (idx === -1) {
    return { prev: null, next: null };
  }

  const toNav = (item: AnnouncementItem | undefined): AnnouncementNavItem | null =>
    item
      ? {
          id: item.id,
          title: item.title,
          categoryLabel: item.categoryLabel,
          publishedAt: item.publishedAt,
        }
      : null;

  return {
    prev: toNav(idx > 0 ? published[idx - 1] : undefined),
    next: toNav(idx < published.length - 1 ? published[idx + 1] : undefined),
  };
}
