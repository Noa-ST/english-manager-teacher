import { z } from "zod";

import type {
  AnnouncementItem,
  HallOfFameStudent,
  StudentProjectItem,
} from "./classroom-data";
import { idSchema, validate } from "./common";
import { NotFoundError } from "./errors";
import { getRuntimeStore, saveRuntimeStore } from "./runtime-store";

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

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(240),
  excerpt: z.string().trim().max(500).optional(),
  content: z.array(z.string().trim().min(1)).optional(),
  category: z
    .enum(["urgent", "schedule", "tuition", "homework", "event"])
    .default("urgent"),
  isPinned: z.boolean().default(true),
  targetClasses: z.array(z.string()).default(["Tất cả các lớp"]),
  status: z.enum(["published", "draft"]).default("published"),
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

export async function listAnnouncements(options?: {
  includeDrafts?: boolean;
  category?: string;
  search?: string;
}): Promise<AnnouncementItem[]> {
  const store = getRuntimeStore();
  return store.announcements.filter((item) => {
    if (!options?.includeDrafts && item.status !== "published") return false;
    if (
      options?.category &&
      options.category !== "all" &&
      item.category !== options.category
    ) {
      return false;
    }
    const q = options?.search?.trim().toLowerCase() ?? "";
    if (
      q &&
      !item.title.toLowerCase().includes(q) &&
      !item.excerpt.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export async function getAnnouncementById(
  id: unknown,
): Promise<AnnouncementItem> {
  const validId = validate(idSchema, id);
  const found = getRuntimeStore().announcements.find((a) => a.id === validId);
  if (!found) throw new NotFoundError("Announcement", validId);
  return found;
}

export async function createAnnouncement(
  input: unknown,
): Promise<AnnouncementItem> {
  const data = validate(createAnnouncementSchema, input);
  const store = getRuntimeStore();

  const paragraphs =
    data.content && data.content.length > 0
      ? data.content
      : [data.excerpt ?? data.title];

  const newItem: AnnouncementItem = {
    id: `ann-${Date.now()}`,
    title: data.title,
    excerpt: data.excerpt ?? paragraphs[0] ?? data.title,
    content: paragraphs,
    category: data.category,
    categoryLabel: CATEGORY_LABELS[data.category],
    isUrgent: data.category === "urgent",
    isPinned: data.isPinned,
    publishedAt: new Date().toLocaleDateString("vi-VN"),
    readTime: "2 phút đọc",
    targetClasses: data.targetClasses,
    attachments: [],
    status: data.status,
  };

  store.announcements.unshift(newItem);
  saveRuntimeStore(store);
  return newItem;
}

export async function updateAnnouncement(
  id: unknown,
  input: unknown,
): Promise<AnnouncementItem> {
  const validId = validate(idSchema, id);
  const data = validate(updateAnnouncementSchema, input);
  const store = getRuntimeStore();

  const idx = store.announcements.findIndex((a) => a.id === validId);
  if (idx === -1) throw new NotFoundError("Announcement", validId);

  const current = store.announcements[idx];
  const nextCat = data.category ?? current.category;
  const paragraphs =
    data.content && data.content.length > 0 ? data.content : current.content;

  const updated: AnnouncementItem = {
    ...current,
    title: data.title ?? current.title,
    excerpt: data.excerpt ?? paragraphs[0] ?? current.excerpt,
    content: paragraphs,
    category: nextCat,
    categoryLabel: CATEGORY_LABELS[nextCat],
    isUrgent: nextCat === "urgent",
    isPinned: data.isPinned ?? current.isPinned,
    status: data.status ?? current.status,
  };

  store.announcements[idx] = updated;
  saveRuntimeStore(store);
  return updated;
}

export async function deleteAnnouncement(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const idx = store.announcements.findIndex((a) => a.id === validId);
  if (idx === -1) throw new NotFoundError("Announcement", validId);
  store.announcements.splice(idx, 1);
  saveRuntimeStore(store);
}

// -----------------------------------------------------------------------------
// 2. HALL OF FAME
// -----------------------------------------------------------------------------

export const createHallOfFameSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  className: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default("IELTS Intensive (Band 6.5–7.5+)"),
  rank: z.coerce.number().int().min(1).max(5).default(1),
  period: z.enum(["week", "month", "course"]).default("week"),
  headlineMetric: z.string().trim().min(1).max(120),
  badgeTitle: z.string().trim().min(1).max(120),
  teacherEndorsement: z.string().trim().max(1000).default(""),
});

export async function listHallOfFame(options?: {
  period?: string;
  search?: string;
}): Promise<HallOfFameStudent[]> {
  const store = getRuntimeStore();
  return store.hallOfFame.filter((item) => {
    if (
      options?.period &&
      options.period !== "all" &&
      item.period !== options.period
    ) {
      return false;
    }
    const q = options?.search?.trim().toLowerCase() ?? "";
    if (
      q &&
      !item.displayName.toLowerCase().includes(q) &&
      !item.className.toLowerCase().includes(q) &&
      !item.badgeTitle.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export async function createHallOfFameEntry(
  input: unknown,
): Promise<HallOfFameStudent> {
  const data = validate(createHallOfFameSchema, input);
  const store = getRuntimeStore();

  const initials = data.displayName
    .split(" ")
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const newEntry: HallOfFameStudent = {
    id: `hof-${Date.now()}`,
    displayName: data.displayName,
    avatarInitials: initials || "HS",
    className: data.className,
    rank: data.rank as 1 | 2 | 3 | 4 | 5,
    period: data.period,
    periodLabel:
      data.period === "week"
        ? "Tuần 46 · Tháng 11/2026"
        : data.period === "month"
          ? "Vinh danh Tháng 11/2026"
          : "Toàn khóa 2026",
    headlineMetric: data.headlineMetric,
    badgeTitle: data.badgeTitle,
    teacherEndorsement:
      data.teacherEndorsement ||
      "Nỗ lực bứt phá xuất sắc và duy trì kỷ luật học tập đáng khen ngợi.",
    milestones: [data.headlineMetric, "100% bài tập hoàn thành đúng hạn"],
  };

  store.hallOfFame.unshift(newEntry);
  saveRuntimeStore(store);
  return newEntry;
}

export async function deleteHallOfFameEntry(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const idx = store.hallOfFame.findIndex((h) => h.id === validId);
  if (idx === -1) throw new NotFoundError("HallOfFameEntry", validId);
  store.hallOfFame.splice(idx, 1);
  saveRuntimeStore(store);
}

// -----------------------------------------------------------------------------
// 3. STUDENT PROJECTS (SHOWCASE)
// -----------------------------------------------------------------------------

export const createStudentProjectSchema = z.object({
  title: z.string().trim().min(1).max(240),
  studentOrTeam: z.string().trim().min(1).max(160),
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
});

export async function listStudentProjects(options?: {
  category?: string;
  className?: string;
  search?: string;
}): Promise<StudentProjectItem[]> {
  const store = getRuntimeStore();
  return store.projects.filter((p) => {
    if (
      options?.category &&
      options.category !== "all" &&
      p.category !== options.category
    ) {
      return false;
    }
    if (
      options?.className &&
      options.className !== "all" &&
      p.className !== options.className
    ) {
      return false;
    }
    const q = options?.search?.trim().toLowerCase() ?? "";
    if (
      q &&
      !p.title.toLowerCase().includes(q) &&
      !p.studentOrTeam.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export async function createStudentProject(
  input: unknown,
): Promise<StudentProjectItem> {
  const data = validate(createStudentProjectSchema, input);
  const store = getRuntimeStore();

  const newProj: StudentProjectItem = {
    id: `proj-${Date.now()}`,
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
    externalUrl: "#project-preview",
    featuredMetric: data.featuredMetric,
    accentTheme: "navy",
    status: "published",
  };

  store.projects.unshift(newProj);
  saveRuntimeStore(store);
  return newProj;
}

export async function deleteStudentProject(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const idx = store.projects.findIndex((p) => p.id === validId);
  if (idx === -1) throw new NotFoundError("StudentProject", validId);
  store.projects.splice(idx, 1);
  saveRuntimeStore(store);
}

