import type { HallOfFameStudent } from "./classroom-data";

export type HallOfFamePeriod = HallOfFameStudent["period"];
export type HallOfFamePeriodFilter = "all" | HallOfFamePeriod;
export type HallOfFameSortKey = "rank_asc" | "period_recent" | "name_asc";

/**
 * Bản ghi vinh danh đã được làm sạch cho Cổng thông tin công khai (Privacy-by-Design):
 * tuyệt đối loại bỏ mọi định danh nội bộ (`studentId`, `classId`).
 */
export type PublicHallOfFameStudent = Omit<
  HallOfFameStudent,
  "studentId" | "classId"
>;

export interface ViewerHallOfFameEndorser {
  name: string;
  title: string;
}

export interface ViewerHallOfFamePayload {
  items: PublicHallOfFameStudent[];
  teacherEndorser: ViewerHallOfFameEndorser;
  currentTerm: string;
}

export interface PodiumSelection {
  period: HallOfFamePeriod;
  periodLabel: string;
  heading: string;
  entries: PublicHallOfFameStudent[];
  orderedEntries: PublicHallOfFameStudent[];
  entryIds: Set<string>;
}

export interface HallOfFameStats {
  totalHonors: number;
  uniqueClasses: number;
  uniquePeriods: number;
  latestPeriodLabel: string | null;
}

const PERIOD_PRIORITY: HallOfFamePeriod[] = ["month", "week", "course"];

const PERIOD_SORT_WEIGHT: Record<HallOfFamePeriod, number> = {
  month: 0,
  week: 1,
  course: 2,
};

const PODIUM_HEADINGS: Record<HallOfFamePeriod, string> = {
  month: "Top 3 Gương mặt tiêu biểu trong tháng",
  week: "Top 3 Gương mặt tiêu biểu trong tuần",
  course: "Top 3 Gương mặt tiêu biểu toàn khóa",
};

const PERIOD_DISPLAY_LABELS: Record<HallOfFamePeriod, string> = {
  month: "Vinh danh Tháng",
  week: "Vinh danh Tuần",
  course: "Toàn khóa học",
};

/**
 * Chuẩn hóa chuỗi tiếng Việt (hạ chữ thường, bỏ dấu, chuyển đ -> d, gom khoảng trắng)
 * để phục vụ tìm kiếm không dấu trên Bảng vàng.
 */
export function normalizeHallOfFameSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loại bỏ triệt để khóa nội bộ (`studentId`, `classId`) trước khi trả dữ liệu ra API công khai.
 */
export function sanitizeHallOfFameForPublic(
  items: readonly HallOfFameStudent[],
): PublicHallOfFameStudent[] {
  return items.map((item) => ({
    id: item.id,
    displayName: item.displayName,
    avatarInitials: item.avatarInitials,
    className: item.className,
    rank: item.rank,
    period: item.period,
    periodLabel: item.periodLabel,
    headlineMetric: item.headlineMetric,
    badgeTitle: item.badgeTitle,
    teacherEndorsement: item.teacherEndorsement,
    milestones: [...item.milestones],
  }));
}

export function getPeriodDisplayLabel(period: HallOfFamePeriod): string {
  return PERIOD_DISPLAY_LABELS[period];
}

/**
 * Tính điểm gần đây (thuần chuỗi, không gọi Date()) từ nhãn kỳ vinh danh tiếng Việt
 * như "Tháng 11/2026", "Tuần 45 (02/11 – 08/11)", "Khóa Hè – Thu 2026".
 */
export function extractPeriodRecencyScore(periodLabel: string): number {
  const normalized = normalizeHallOfFameSearch(periodLabel);
  if (!normalized) return 0;

  let score = 0;

  const yearMatch = normalized.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) {
    score += Number(yearMatch[1]) * 10000;
  }

  let explicitMonth = 0;
  const monthWordMatch = normalized.match(/thang\s*(\d{1,2})/);
  const monthYearMatch = normalized.match(/(\d{1,2})\s*\/\s*(?:19|20)\d{2}/);
  if (monthWordMatch) {
    const m = Number(monthWordMatch[1]);
    if (m >= 1 && m <= 12) explicitMonth = m;
  } else if (monthYearMatch) {
    const m = Number(monthYearMatch[1]);
    if (m >= 1 && m <= 12) explicitMonth = m;
  }

  if (explicitMonth > 0) {
    score += explicitMonth * 100;
  } else {
    const datePairs = Array.from(
      normalized.matchAll(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/g),
    );
    if (datePairs.length > 0) {
      const lastPair = datePairs[datePairs.length - 1];
      const day = Number(lastPair[1]);
      const month = Number(lastPair[2]);
      if (month >= 1 && month <= 12) {
        score += month * 100 + Math.min(day, 31);
      }
    }
  }

  const weekMatch = normalized.match(/tuan\s*(\d{1,2})/);
  if (weekMatch) {
    score += Number(weekMatch[1]) * 2;
  }

  if (explicitMonth === 0 && !weekMatch) {
    if (/\b(?:thu|dong|cuoi|hk2|ii)\b/.test(normalized)) {
      score += 900;
    } else if (/\b(?:he|giua)\b/.test(normalized)) {
      score += 600;
    } else if (/\b(?:xuan|dau|hk1|i)\b/.test(normalized)) {
      score += 300;
    }
  }

  return score;
}

export function matchesHallOfFameQuery(
  item: PublicHallOfFameStudent,
  query: string,
): boolean {
  const q = normalizeHallOfFameSearch(query);
  if (!q) return true;

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

  return haystack.includes(q);
}

/**
 * Chọn Bục Top 3 theo kỳ đang chọn (mặc định ưu tiên month -> week -> course khi chọn "all"),
 * gom đúng 1 đợt (periodLabel) mới nhất để không trộn chéo giữa các tháng/tuần khác nhau,
 * và sắp thứ tự hiển thị desktop (#2 – #1 – #3).
 */
export function selectPodiumForPeriod(
  items: readonly PublicHallOfFameStudent[],
  selectedPeriod: HallOfFamePeriodFilter,
): PodiumSelection | null {
  const targetPeriod: HallOfFamePeriod | undefined =
    selectedPeriod !== "all"
      ? selectedPeriod
      : PERIOD_PRIORITY.find((p) =>
          items.some((item) => item.period === p && item.rank <= 3),
        );

  if (!targetPeriod) return null;

  const candidates = items.filter(
    (item) => item.period === targetPeriod && item.rank <= 3,
  );
  if (candidates.length === 0) return null;

  // Nhóm theo periodLabel giữ thứ tự xuất hiện ban đầu
  const groups = new Map<string, PublicHallOfFameStudent[]>();
  for (const item of candidates) {
    const key = item.periodLabel.trim() || getPeriodDisplayLabel(targetPeriod);
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  let winningLabel = "";
  let winningGroup: PublicHallOfFameStudent[] = [];
  let bestRecency = -1;
  let bestDistinctRanks = -1;

  for (const [label, group] of groups.entries()) {
    const recency = extractPeriodRecencyScore(label);
    const distinctRanks = new Set(group.map((g) => g.rank)).size;
    if (
      recency > bestRecency ||
      (recency === bestRecency && distinctRanks > bestDistinctRanks)
    ) {
      winningLabel = label;
      winningGroup = group;
      bestRecency = recency;
      bestDistinctRanks = distinctRanks;
    }
  }

  if (winningGroup.length === 0) return null;

  const rankMap = new Map<number, PublicHallOfFameStudent>();
  for (const candidate of winningGroup) {
    if (candidate.rank >= 1 && candidate.rank <= 3 && !rankMap.has(candidate.rank)) {
      rankMap.set(candidate.rank, candidate);
    }
  }

  const r1 = rankMap.get(1);
  const r2 = rankMap.get(2);
  const r3 = rankMap.get(3);

  const entries = [r1, r2, r3].filter(
    (item): item is PublicHallOfFameStudent => Boolean(item),
  );
  if (entries.length === 0) return null;

  let orderedEntries: PublicHallOfFameStudent[];
  if (r1 && r2 && r3) {
    orderedEntries = [r2, r1, r3];
  } else if (r1 && r2) {
    orderedEntries = [r2, r1];
  } else {
    orderedEntries = entries;
  }

  return {
    period: targetPeriod,
    periodLabel: winningLabel,
    heading: PODIUM_HEADINGS[targetPeriod],
    entries,
    orderedEntries,
    entryIds: new Set(entries.map((entry) => entry.id)),
  };
}

export function filterAndSortHallOfFame(
  items: readonly PublicHallOfFameStudent[],
  options?: {
    period?: HallOfFamePeriodFilter;
    className?: string;
    periodLabel?: string;
    search?: string;
    sortBy?: HallOfFameSortKey;
    excludeIds?: ReadonlySet<string>;
  },
): PublicHallOfFameStudent[] {
  const period = options?.period ?? "all";
  const className = options?.className?.trim() ?? "";
  const periodLabel = options?.periodLabel?.trim() ?? "";
  const search = options?.search ?? "";
  const sortBy = options?.sortBy ?? "rank_asc";
  const excludeIds = options?.excludeIds;

  const filtered = items.filter((item) => {
    if (period !== "all" && item.period !== period) return false;
    if (className && className !== "all" && item.className !== className) {
      return false;
    }
    if (
      periodLabel &&
      periodLabel !== "all" &&
      item.periodLabel.trim() !== periodLabel
    ) {
      return false;
    }
    if (excludeIds?.has(item.id)) return false;
    if (!matchesHallOfFameQuery(item, search)) return false;
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === "name_asc") {
      const nameDiff = a.displayName.localeCompare(b.displayName, "vi");
      return nameDiff !== 0 ? nameDiff : a.rank - b.rank;
    }

    if (sortBy === "period_recent") {
      const recencyDiff =
        extractPeriodRecencyScore(b.periodLabel) -
        extractPeriodRecencyScore(a.periodLabel);
      if (recencyDiff !== 0) return recencyDiff;
      const rankDiff = a.rank - b.rank;
      return rankDiff !== 0
        ? rankDiff
        : a.displayName.localeCompare(b.displayName, "vi");
    }

    // "rank_asc": ưu tiên nhóm kỳ (month -> week -> course), trong cùng nhóm ưu tiên đợt mới hơn -> hạng cao hơn
    const periodDiff =
      PERIOD_SORT_WEIGHT[a.period] - PERIOD_SORT_WEIGHT[b.period];
    if (periodDiff !== 0) return periodDiff;

    const recencyDiff =
      extractPeriodRecencyScore(b.periodLabel) -
      extractPeriodRecencyScore(a.periodLabel);
    if (recencyDiff !== 0) return recencyDiff;

    const rankDiff = a.rank - b.rank;
    return rankDiff !== 0
      ? rankDiff
      : a.displayName.localeCompare(b.displayName, "vi");
  });
}

export function countHallOfFameByPeriod(
  items: readonly PublicHallOfFameStudent[],
): Record<HallOfFamePeriodFilter, number> {
  const counts: Record<HallOfFamePeriodFilter, number> = {
    all: items.length,
    month: 0,
    week: 0,
    course: 0,
  };

  for (const item of items) {
    counts[item.period] += 1;
  }

  return counts;
}

export function extractHallOfFameClasses(
  items: readonly PublicHallOfFameStudent[],
): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const name = item.className.trim();
    if (name) set.add(name);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
}

export function extractHallOfFamePeriodLabels(
  items: readonly PublicHallOfFameStudent[],
  period: HallOfFamePeriodFilter = "all",
): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (period !== "all" && item.period !== period) continue;
    const label = item.periodLabel.trim();
    if (label) set.add(label);
  }
  return Array.from(set).sort(
    (a, b) => extractPeriodRecencyScore(b) - extractPeriodRecencyScore(a),
  );
}

export function computeHallOfFameStats(
  items: readonly PublicHallOfFameStudent[],
): HallOfFameStats {
  const classes = new Set<string>();
  const periods = new Set<string>();
  let latestPeriodLabel: string | null = null;
  let bestScore = -1;

  for (const item of items) {
    const cls = item.className.trim();
    if (cls) classes.add(cls);

    const lbl = item.periodLabel.trim();
    if (lbl) {
      periods.add(lbl);
      const score = extractPeriodRecencyScore(lbl);
      if (score > bestScore) {
        bestScore = score;
        latestPeriodLabel = lbl;
      }
    }
  }

  return {
    totalHonors: items.length,
    uniqueClasses: classes.size,
    uniquePeriods: periods.size,
    latestPeriodLabel,
  };
}
