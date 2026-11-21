import type {
  AdminStudentRecord,
  AnnouncementItem,
  HallOfFameStudent,
  PodcastEpisode,
  ResourceFileItem,
  StudentProjectItem,
} from "./classroom-data";

export type CmsTab =
  | "announcements"
  | "podcast"
  | "hall-of-fame"
  | "projects"
  | "resources"
  | "brand";

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<
  AnnouncementItem["category"],
  string
> = {
  urgent: "Thông báo quan trọng",
  event: "Sự kiện học thuật",
  homework: "Bài tập tuần",
  schedule: "Lịch học",
  tuition: "Học phí & Học vụ",
};

export const PODCAST_CATEGORY_LABELS: Record<
  PodcastEpisode["category"],
  string
> = {
  "weekly-digest": "Tổng kết tuần",
  "ielts-listening": "IELTS & Học thuật",
  pronunciation: "Phát âm & Ngữ điệu",
  "parent-corner": "Góc Phụ huynh",
};

export const PROJECT_CATEGORY_LABELS: Record<
  StudentProjectItem["category"],
  string
> = {
  "Research Poster": "Poster nghiên cứu",
  "Debate Portfolio": "Hồ sơ tranh biện",
  "Video Presentation": "Video thuyết trình",
  "Academic Essay": "Bài luận học thuật",
};

export const FILE_TYPE_LABELS: Record<ResourceFileItem["fileType"], string> = {
  PDF: "Tài liệu PDF",
  SLIDE: "Slide bài giảng",
  WORKSHEET: "Phiếu bài tập",
  AUDIO: "Băng nghe (Audio)",
  IMAGE: "Hình ảnh",
};

/**
 * Returns only published student exam grades (excludes draft grades).
 */
export function getPublishedStudentGrades(
  student: Pick<AdminStudentRecord, "grades">,
): AdminStudentRecord["grades"] {
  return (student.grades ?? []).filter((g) => (g.status ?? "published") !== "draft");
}

/**
 * Computes the student's average IELTS score exclusively from published grades.
 * Falls back to `student.averageScore` only when the student has no grade records yet.
 */
export function computePublishedAverageScore(
  student: Pick<AdminStudentRecord, "grades" | "averageScore">,
): number {
  const allGrades = student.grades ?? [];
  if (allGrades.length === 0) {
    return student.averageScore || 0;
  }
  const published = getPublishedStudentGrades(student);
  if (published.length === 0) {
    return 0;
  }
  const sum = published.reduce((acc, g) => acc + g.overall, 0);
  return Math.round((sum / published.length) * 10) / 10;
}

export interface PublishedStudentHonorSnapshot {
  averageScore: number;
  headlineMetric: string;
  milestones: string[];
  endorsement: string;
  hasPublishedGrades: boolean;
}

/**
 * Extracts achievement snapshot for Hall of Fame strictly from published grades
 * so unpublished draft grades are never leaked onto the public board.
 */
export function extractPublishedStudentHonorSnapshot(
  student: AdminStudentRecord,
): PublishedStudentHonorSnapshot {
  const publishedGrades = getPublishedStudentGrades(student);
  const averageScore = computePublishedAverageScore(student);
  const hasPublishedGrades = publishedGrades.length > 0;
  const legacyScoreAvailable =
    (student.grades ?? []).length === 0 && (student.averageScore ?? 0) > 0;
  const latestPublished = publishedGrades[0];

  const headlineMetric =
    hasPublishedGrades || legacyScoreAvailable
      ? `IELTS ${averageScore.toFixed(1)} Overall`
      : "Học viên Chăm chỉ & Tiến bộ";

  const milestones = latestPublished
    ? [
        `Reading ${latestPublished.reading}`,
        `Writing ${latestPublished.writing}`,
        `${student.attendanceRate}% Chuyên cần`,
      ]
    : [
        `${student.attendanceRate}% Chuyên cần`,
        "Hoàn thành tốt bài tập định kỳ",
        "Tinh thần học tập gương mẫu",
      ];

  const endorsement =
    latestPublished?.comment ||
    student.recentComment ||
    "Nỗ lực bứt phá xuất sắc và tinh thần học tập gương mẫu.";

  return {
    averageScore,
    headlineMetric,
    milestones,
    endorsement,
    hasPublishedGrades,
  };
}

/**
 * Splits hero slogan on the first em-dash (`—`) or en-dash (`–`) into two lines.
 */
export function splitSloganLines(slogan: string): [string, string] {
  const trimmed = slogan.trim();
  if (!trimmed) return ["", ""];
  const dashIndex = trimmed.search(/[—–]/);
  if (dashIndex === -1) {
    return [trimmed, ""];
  }
  const first = trimmed.slice(0, dashIndex).trim();
  const second = trimmed.slice(dashIndex + 1).trim();
  return [first, second];
}

/**
 * Splits a credential string on `—`/`–` or trailing parenthetical into title & subtitle.
 */
export function parseCredentialDisplay(credential: string): {
  title: string;
  subtitle: string;
} {
  const trimmed = credential.trim();
  if (!trimmed) return { title: "", subtitle: "" };

  const dashIndex = trimmed.search(/[—–]/);
  if (dashIndex !== -1) {
    return {
      title: trimmed.slice(0, dashIndex).trim(),
      subtitle: trimmed.slice(dashIndex + 1).trim(),
    };
  }

  const openParen = trimmed.indexOf("(");
  const closeParen = trimmed.lastIndexOf(")");
  if (openParen > 0 && closeParen > openParen) {
    return {
      title: trimmed.slice(0, openParen).trim(),
      subtitle: trimmed.slice(openParen, closeParen + 1).trim(),
    };
  }

  return { title: trimmed, subtitle: "" };
}

/**
 * Parses `"MM:SS"` or `"HH:MM:SS"` duration labels into positive integer seconds.
 */
export function parseDurationLabelToSeconds(
  label: string,
  fallback = 720,
): number {
  const trimmed = label.trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split(":");
  if (parts.length !== 2 && parts.length !== 3) return fallback;

  const nums = parts.map((p) => (/^\d+$/.test(p.trim()) ? Number(p.trim()) : NaN));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return fallback;

  let total = 0;
  if (nums.length === 2) {
    const [mins, secs] = nums;
    if (secs >= 60) return fallback;
    total = mins * 60 + secs;
  } else {
    const [hours, mins, secs] = nums;
    if (mins >= 60 || secs >= 60) return fallback;
    total = hours * 3600 + mins * 60 + secs;
  }

  return total > 0 ? total : fallback;
}

export interface CmsSummaryStats {
  announcementsPublished: number;
  announcementsDraft: number;
  announcementsPinned: number;
  podcastsPublished: number;
  podcastsDraft: number;
  podcastsFeatured: number;
  honorsTotal: number;
  honorsMonthly: number;
  projectsPublished: number;
  projectsPending: number;
  projectsDraft: number;
  resourcesPublic: number;
  resourcesPrivate: number;
}

/**
 * Computes publication and status counts across all CMS tabs.
 */
export function computeCmsSummaryStats(input: {
  announcements: AnnouncementItem[];
  podcasts: PodcastEpisode[];
  hallOfFame: HallOfFameStudent[];
  projects: StudentProjectItem[];
  resources: ResourceFileItem[];
}): CmsSummaryStats {
  return {
    announcementsPublished: input.announcements.filter(
      (a) => a.status === "published",
    ).length,
    announcementsDraft: input.announcements.filter((a) => a.status === "draft")
      .length,
    announcementsPinned: input.announcements.filter((a) => Boolean(a.isPinned))
      .length,
    podcastsPublished: input.podcasts.filter((p) => p.status === "published")
      .length,
    podcastsDraft: input.podcasts.filter((p) => p.status === "draft").length,
    podcastsFeatured: input.podcasts.filter((p) => Boolean(p.isFeatured))
      .length,
    honorsTotal: input.hallOfFame.length,
    honorsMonthly: input.hallOfFame.filter((h) => h.period === "month").length,
    projectsPublished: input.projects.filter((p) => p.status === "published")
      .length,
    projectsPending: input.projects.filter(
      (p) => p.status === "pending_review",
    ).length,
    projectsDraft: input.projects.filter((p) => p.status === "draft").length,
    resourcesPublic: input.resources.filter((r) => r.visibility === "public")
      .length,
    resourcesPrivate: input.resources.filter((r) => r.visibility === "private")
      .length,
  };
}
