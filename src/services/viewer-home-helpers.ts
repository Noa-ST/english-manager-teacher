import type {
  AnnouncementItem,
  HallOfFameStudent,
  ResolvedScheduleOccurrence,
  ResourceFileItem,
  StudentProjectItem,
  StudentScheduleOccurrence,
  WeeklyClassSession,
} from "./classroom-data";

export const SCHEDULE_DAYS = [
  { value: 1, shortLabel: "Th 2", subLabel: "T2", dayName: "Thứ Hai" },
  { value: 2, shortLabel: "Th 3", subLabel: "T3", dayName: "Thứ Ba" },
  { value: 3, shortLabel: "Th 4", subLabel: "T4", dayName: "Thứ Tư" },
  { value: 4, shortLabel: "Th 5", subLabel: "T5", dayName: "Thứ Năm" },
  { value: 5, shortLabel: "Th 6", subLabel: "T6", dayName: "Thứ Sáu" },
  { value: 6, shortLabel: "Th 7", subLabel: "T7", dayName: "Thứ Bảy" },
  { value: 7, shortLabel: "CN", subLabel: "CN", dayName: "Chủ Nhật" },
] as const;

export const PROJECT_CATEGORY_LABELS: Record<string, string> = {
  "Research Poster": "Poster Nghiên cứu",
  "Debate Portfolio": "Hồ sơ Tranh biện",
  "Video Presentation": "Video Thuyết trình",
  "Academic Essay": "Bài luận Học thuật",
};

export const HOME_FILE_TYPE_LABELS: Record<string, string> = {
  PDF: "Tài liệu PDF",
  SLIDE: "Slide bài giảng",
  WORKSHEET: "Phiếu bài tập",
  AUDIO: "Băng nghe (Audio)",
  IMAGE: "Hình ảnh",
};

export interface HomeWeekDateRange {
  mondayIso: string;
  sundayIso: string;
  datesByDay: Record<number, { iso: string; shortDate: string }>;
  label: string;
}

export function toLocalIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getCurrentWeekDateRange(now = new Date()): HomeWeekDateRange {
  const jsDay = now.getDay();
  const currentDayNum = jsDay === 0 ? 7 : jsDay;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (currentDayNum - 1),
  );

  const datesByDay: Record<number, { iso: string; shortDate: string }> = {};
  let sunday = monday;

  for (let i = 0; i < 7; i++) {
    const d = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + i,
    );
    const dayNum = i + 1;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    datesByDay[dayNum] = {
      iso: toLocalIsoDate(d),
      shortDate: `${dd}/${mm}`,
    };
    if (i === 6) {
      sunday = d;
    }
  }

  return {
    mondayIso: datesByDay[1].iso,
    sundayIso: datesByDay[7].iso,
    datesByDay,
    label: `${datesByDay[1].shortDate} – ${datesByDay[7].shortDate}/${sunday.getFullYear()}`,
  };
}

function parseClockMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.trim().split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function resolveOccurrenceLiveStatus(
  occ: Pick<StudentScheduleOccurrence, "date" | "startTime" | "endTime" | "status">,
  now = new Date(),
): StudentScheduleOccurrence["status"] {
  if (occ.status === "canceled") return "canceled";

  const todayIso = toLocalIsoDate(now);
  if (occ.date < todayIso) return "completed";
  if (occ.date > todayIso) return "upcoming";

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = parseClockMinutes(occ.startTime);
  const endMin = parseClockMinutes(occ.endTime);

  if (nowMin >= endMin) return "completed";
  if (nowMin >= startMin) return "ongoing";
  return "upcoming";
}

export function sanitizeOccurrencesForPublic(
  occurrences: ResolvedScheduleOccurrence[],
): StudentScheduleOccurrence[] {
  return occurrences.map((occ) => ({
    occurrenceKey: occ.occurrenceKey,
    date: occ.date,
    dayOfWeek: occ.dayOfWeek,
    dayLabel: occ.dayLabel,
    startTime: occ.startTime,
    endTime: occ.endTime,
    classCode: occ.classCode,
    className: occ.className,
    level: occ.level,
    room: occ.room,
    topic: occ.topic,
    source: occ.source,
    status: occ.status,
    exceptionType: occ.exceptionType,
    exceptionReason: occ.exceptionReason,
    originalDate: occ.originalDate,
  }));
}

export type PublicWeeklyClassSession = Omit<
  WeeklyClassSession,
  "enrolledCount" | "capacity" | "hasConflict"
>;

export function sanitizeWeeklyScheduleForPublic(
  sessions: WeeklyClassSession[],
): PublicWeeklyClassSession[] {
  return sessions.map((session) => ({
    id: session.id,
    classCode: session.classCode,
    className: session.className,
    level: session.level,
    dayOfWeek: session.dayOfWeek,
    dayLabel: session.dayLabel,
    startTime: session.startTime,
    endTime: session.endTime,
    room: session.room,
    topic: session.topic,
    status: session.status,
  }));
}

export function selectFeaturedAnnouncements(
  items: AnnouncementItem[],
  secondaryLimit = 3,
): { featured: AnnouncementItem | null; secondary: AnnouncementItem[] } {
  const published = items.filter((item) => item.status === "published");
  if (published.length === 0) {
    return { featured: null, secondary: [] };
  }

  const featured =
    published.find((item) => item.isPinned && item.isUrgent) ??
    published.find((item) => item.isUrgent) ??
    published.find((item) => item.isPinned) ??
    published[0];

  const secondary = published
    .filter((item) => item.id !== featured.id)
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned))
    .slice(0, secondaryLimit);

  return { featured, secondary };
}

export function selectFeaturedHallOfFame(
  items: HallOfFameStudent[],
  limit = 4,
): HallOfFameStudent[] {
  return [...items].sort((a, b) => a.rank - b.rank).slice(0, limit);
}

export function selectFeaturedProjects(
  items: StudentProjectItem[],
  limit = 2,
): StudentProjectItem[] {
  return items
    .filter((item) => item.status === "published")
    .sort(
      (a, b) =>
        Number(Boolean(b.posterUrl?.trim())) -
        Number(Boolean(a.posterUrl?.trim())),
    )
    .slice(0, limit);
}

export function selectPublicResources(
  items: ResourceFileItem[],
  limit = 3,
): ResourceFileItem[] {
  return items
    .filter((item) => item.visibility === "public" && !item.deletedAt)
    .slice(0, limit);
}
