import {
  resolveWeekStatus,
  type AdminStudentRecord,
  type ClassroomGroup,
  type ClassSessionRecord,
  type CurriculumAttachment,
  type CurriculumSkillFocus,
  type CurriculumWeek,
} from "./classroom-data";
import { computeStudentSkillProfile, formatDisplayDate } from "./student-helpers";

/**
 * 100% client-safe isomorphic helpers for Classroom Lifecycle, Syllabus Health,
 * Weekly Execution Tracking, Student Portal Sanitization & CSV Export.
 * NEVER import server-only modules (`fs`, `student.service`, etc.) here.
 */

export const CLASSROOM_STATUS_META: Record<
  ClassroomGroup["status"],
  { label: string; shortLabel: string; badgeClass: string }
> = {
  upcoming: {
    label: "Sắp khai giảng",
    shortLabel: "Sắp mở",
    badgeClass: "border-sky-300 bg-sky-500/10 text-sky-700",
  },
  active: {
    label: "Đang vận hành",
    shortLabel: "Đang học",
    badgeClass: "border-emerald-300 bg-emerald-500/10 text-emerald-700",
  },
  completed: {
    label: "Đã kết khóa",
    shortLabel: "Kết khóa",
    badgeClass: "border-amber-300 bg-amber-500/10 text-amber-800",
  },
  archived: {
    label: "Đã lưu trữ",
    shortLabel: "Lưu trữ",
    badgeClass: "border-slate-300 bg-slate-500/10 text-slate-600",
  },
};

export const SKILL_FOCUS_META: Record<
  CurriculumSkillFocus,
  { label: string; badgeClass: string }
> = {
  Listening: {
    label: "Listening",
    badgeClass: "border-sky-200 bg-sky-500/10 text-sky-700",
  },
  Reading: {
    label: "Reading",
    badgeClass: "border-indigo-200 bg-indigo-500/10 text-indigo-700",
  },
  Writing: {
    label: "Writing",
    badgeClass: "border-amber-200 bg-amber-500/10 text-amber-800",
  },
  Speaking: {
    label: "Speaking",
    badgeClass: "border-emerald-200 bg-emerald-500/10 text-emerald-700",
  },
  "Grammar-Vocab": {
    label: "Grammar & Vocab",
    badgeClass: "border-violet-200 bg-violet-500/10 text-violet-700",
  },
  Mixed: {
    label: "Tổng hợp 4 KN",
    badgeClass: "border-primary/25 bg-primary/10 text-primary",
  },
};

export interface ClassroomProgressMetrics {
  currentWeek: number;
  totalWeeks: number;
  completedWeeks: number;
  inProgressWeeks: number;
  postponedWeeks: number;
  completionPct: number;
  currentPositionPct: number;
  isBehindSchedule: boolean;
}

export function parseModuleWeekRange(module?: string): { current: number; total: number } | null {
  if (!module) return null;
  const m = module.match(/[Tt]uần\s+(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const current = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  return { current, total };
}

/**
 * Unified progress calculator used consistently across Class Cards, Detail Modal & Analytics.
 */
export function computeClassroomProgress(cls: ClassroomGroup): ClassroomProgressMetrics {
  const parsed = parseModuleWeekRange(cls.currentModule);
  const totalWeeks = Math.max(1, cls.totalWeeks ?? parsed?.total ?? 12);
  const currentWeek = Math.max(1, Math.min(totalWeeks, cls.currentWeekIndex ?? parsed?.current ?? 1));

  const curriculum: CurriculumWeek[] =
    cls.curriculum && cls.curriculum.length > 0
      ? cls.curriculum
      : Array.from({ length: totalWeeks }, (_, i) => ({
          weekNumber: i + 1,
          title: `Học phần tuần ${i + 1}`,
        }));

  let completedWeeks = 0;
  let inProgressWeeks = 0;
  let postponedWeeks = 0;

  for (let wNum = 1; wNum <= totalWeeks; wNum++) {
    const found = curriculum.find((w) => w.weekNumber === wNum);
    const status = found
      ? resolveWeekStatus(found, currentWeek)
      : wNum < currentWeek
        ? "completed"
        : wNum === currentWeek
          ? "in-progress"
          : "not-started";
    if (status === "completed") completedWeeks++;
    else if (status === "in-progress") inProgressWeeks++;
    else if (status === "postponed") postponedWeeks++;
  }

  if (cls.status === "completed") {
    completedWeeks = Math.max(completedWeeks, totalWeeks - postponedWeeks);
  }

  const completionPct = Math.min(100, Math.round((completedWeeks / totalWeeks) * 100));
  const currentPositionPct = Math.min(100, Math.round((currentWeek / totalWeeks) * 100));
  const isBehindSchedule = cls.status === "active" && currentWeek - completedWeeks >= 2;

  return {
    currentWeek,
    totalWeeks,
    completedWeeks,
    inProgressWeeks,
    postponedWeeks,
    completionPct,
    currentPositionPct,
    isBehindSchedule,
  };
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function generateWeeklyScheduledDates(startDate: string, totalWeeks: number): string[] {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || totalWeeks <= 0) {
    return [];
  }
  return Array.from({ length: totalWeeks }, (_, idx) => addDaysToIsoDate(startDate, idx * 7));
}

export function shiftCurriculumDates(
  curriculum: CurriculumWeek[],
  fromWeekNumber: number,
  shiftDays: number,
): CurriculumWeek[] {
  return curriculum.map((week) => {
    if (week.weekNumber < fromWeekNumber || !week.scheduledDate) {
      return { ...week };
    }
    return {
      ...week,
      scheduledDate: addDaysToIsoDate(week.scheduledDate, shiftDays),
    };
  });
}

export interface WeekSessionExecutionStats {
  weekNumber: number;
  sessionsCount: number;
  completedSessionsCount: number;
  attendanceRate: number | null;
  homeworkRate: number | null;
  absentStudents: Array<{ studentId: string; studentCode: string; studentName: string; date: string }>;
}

export interface ClassroomHealthAlert {
  id: string;
  level: "warning" | "destructive" | "info";
  title: string;
  description: string;
}

export interface ClassroomHealthSummary {
  totalNonArchived: number;
  activeCount: number;
  trialCount: number;
  onLeaveCount: number;
  paidCount: number;
  dueSoonCount: number;
  overdueCount: number;
  tuitionCollectionPct: number;
  skillAverages: {
    hasData: boolean;
    listening: number;
    reading: number;
    writing: number;
    speaking: number;
    weakestSkill: string | null;
  };
  weekExecutionMap: Record<number, WeekSessionExecutionStats>;
  missingCurrentMaterials: boolean;
  missingNextMaterials: boolean;
  alerts: ClassroomHealthAlert[];
}

export function computeClassroomHealthSummary(
  cls: ClassroomGroup,
  allStudents: AdminStudentRecord[],
  allSessions: ClassSessionRecord[],
): ClassroomHealthSummary {
  const classStudents = allStudents.filter(
    (s) => s.classId === cls.id && s.status !== "archived" && !s.deletedAt,
  );

  const activeCount = classStudents.filter((s) => s.status === "active").length;
  const trialCount = classStudents.filter((s) => s.status === "trial").length;
  const onLeaveCount = classStudents.filter((s) => s.status === "on-leave").length;

  const billableStudents = classStudents.filter((s) => s.status !== "trial");
  const paidCount = billableStudents.filter((s) => s.tuitionStatus === "paid").length;
  const dueSoonCount = billableStudents.filter((s) => s.tuitionStatus === "due-soon").length;
  const overdueCount = billableStudents.filter((s) => s.tuitionStatus === "overdue").length;
  const tuitionCollectionPct =
    billableStudents.length > 0 ? Math.round((paidCount / billableStudents.length) * 100) : 100;

  // 4-Skill class averages
  const gradedProfiles = classStudents
    .map((s) => computeStudentSkillProfile(s))
    .filter((p) => p.hasGrades);
  let skillAverages: ClassroomHealthSummary["skillAverages"] = {
    hasData: false,
    listening: 0,
    reading: 0,
    writing: 0,
    speaking: 0,
    weakestSkill: null,
  };
  if (gradedProfiles.length > 0) {
    const avgOf = (idx: number) =>
      Number(
        (
          gradedProfiles.reduce((sum, p) => sum + p.skills[idx].score, 0) / gradedProfiles.length
        ).toFixed(1),
      );
    const l = avgOf(0);
    const r = avgOf(1);
    const w = avgOf(2);
    const sp = avgOf(3);
    const pairList = [
      { name: "Listening", score: l },
      { name: "Reading", score: r },
      { name: "Writing", score: w },
      { name: "Speaking", score: sp },
    ].sort((a, b) => a.score - b.score);
    skillAverages = {
      hasData: true,
      listening: l,
      reading: r,
      writing: w,
      speaking: sp,
      weakestSkill: pairList[0].name,
    };
  }

  // Per-week session execution aggregation
  const classSessions = allSessions.filter((s) => s.classId === cls.id);
  const weekExecutionMap: Record<number, WeekSessionExecutionStats> = {};
  for (const ses of classSessions) {
    const wn = ses.weekNumber || 1;
    if (!weekExecutionMap[wn]) {
      weekExecutionMap[wn] = {
        weekNumber: wn,
        sessionsCount: 0,
        completedSessionsCount: 0,
        attendanceRate: null,
        homeworkRate: null,
        absentStudents: [],
      };
    }
    const bucket = weekExecutionMap[wn];
    bucket.sessionsCount += 1;
    if (ses.journalStatus === "completed") bucket.completedSessionsCount += 1;
    for (const sr of ses.studentRecords) {
      if (sr.attendance === "absent") {
        bucket.absentStudents.push({
          studentId: sr.studentId,
          studentCode: sr.studentCode,
          studentName: sr.studentName,
          date: formatDisplayDate(ses.date),
        });
      }
    }
  }

  for (const wnStr of Object.keys(weekExecutionMap)) {
    const wn = Number(wnStr);
    const sessionsForWeek = classSessions.filter((s) => (s.weekNumber || 1) === wn);
    let attRequired = 0;
    let attPresent = 0;
    let hwRequired = 0;
    let hwSubmitted = 0;
    for (const ses of sessionsForWeek) {
      for (const r of ses.studentRecords) {
        if (r.attendance !== "excused") {
          attRequired += 1;
          if (r.attendance === "present" || r.attendance === "late") {
            attPresent += 1;
          }
        }
        if (r.homeworkStatus === "submitted") {
          hwRequired += 1;
          hwSubmitted += 1;
        } else if (r.homeworkStatus === "not-submitted") {
          hwRequired += 1;
        }
      }
    }
    weekExecutionMap[wn].attendanceRate =
      attRequired > 0 ? Math.round((attPresent / attRequired) * 100) : null;
    weekExecutionMap[wn].homeworkRate =
      hwRequired > 0 ? Math.round((hwSubmitted / hwRequired) * 100) : null;
  }

  // Material readiness check for current week & next week
  const progress = computeClassroomProgress(cls);
  const currWeekObj = cls.curriculum?.find((w) => w.weekNumber === progress.currentWeek);
  const nextWeekObj =
    progress.currentWeek < progress.totalWeeks
      ? cls.curriculum?.find((w) => w.weekNumber === progress.currentWeek + 1)
      : undefined;

  const missingCurrentMaterials =
    cls.status === "active" &&
    Boolean(currWeekObj) &&
    (currWeekObj?.attachments?.length ?? 0) === 0 &&
    !currWeekObj?.homework?.trim();
  const missingNextMaterials =
    cls.status === "active" &&
    Boolean(nextWeekObj) &&
    (nextWeekObj?.attachments?.length ?? 0) === 0 &&
    !nextWeekObj?.homework?.trim();

  const alerts: ClassroomHealthAlert[] = [];
  if (progress.isBehindSchedule) {
    alerts.push({
      id: "behind-schedule",
      level: "warning",
      title: "Tiến độ giảng dạy đang chậm nhịp",
      description: `Lớp đang ở Tuần ${progress.currentWeek}/${progress.totalWeeks} nhưng mới chốt hoàn thành ${progress.completedWeeks} tuần.`,
    });
  }
  if (
    cls.status === "active" &&
    progress.totalWeeks - progress.currentWeek <= 1
  ) {
    alerts.push({
      id: "near-completion",
      level: "info",
      title: "Lớp sắp kết khóa",
      description: `Chỉ còn ${Math.max(0, progress.totalWeeks - progress.currentWeek)} tuần cuối. Hãy chuẩn bị kiểm tra đầu ra & mở lớp khóa kế tiếp.`,
    });
  }
  if (missingCurrentMaterials) {
    alerts.push({
      id: "missing-curr-mat",
      level: "warning",
      title: `Tuần ${progress.currentWeek} (đang dạy) chưa có học liệu hoặc BTVN`,
      description: "Hãy tải slide/phiếu bài tập hoặc gán từ Kho học liệu để học sinh xem trên Cổng học tập.",
    });
  } else if (missingNextMaterials) {
    alerts.push({
      id: "missing-next-mat",
      level: "info",
      title: `Tuần ${progress.currentWeek + 1} (tuần kế tiếp) chưa chuẩn bị học liệu`,
      description: "Nên chuẩn bị trước tài liệu cho tuần sau để lớp vận hành trơn tru.",
    });
  }
  if (overdueCount > 0) {
    alerts.push({
      id: "overdue-tuition",
      level: "destructive",
      title: `${overdueCount} học viên quá hạn học phí`,
      description: "Kiểm tra danh sách học viên để thu học phí hoặc gửi nhắc nhở phụ huynh.",
    });
  }

  return {
    totalNonArchived: classStudents.length,
    activeCount,
    trialCount,
    onLeaveCount,
    paidCount,
    dueSoonCount,
    overdueCount,
    tuitionCollectionPct,
    skillAverages,
    weekExecutionMap,
    missingCurrentMaterials,
    missingNextMaterials,
    alerts,
  };
}

export interface SanitizedStudentWeekItem {
  weekNumber: number;
  title: string;
  focus?: string;
  focusSkill?: CurriculumSkillFocus;
  status: "not-started" | "in-progress" | "completed" | "postponed";
  scheduledDate?: string;
  isAssessmentMilestone?: boolean;
  assessmentTitle?: string;
  homework?: string;
  homeworkDueDate?: string;
  attachments: CurriculumAttachment[];
  isLocked: boolean;
}

export interface SanitizedStudentClassroomRoadmap {
  classId: string;
  classCode: string;
  className: string;
  level: string;
  targetBand: string;
  scheduleSummary: string;
  room: string;
  currentModule: string;
  currentWeek: number;
  totalWeeks: number;
  completionPct: number;
  weeks: SanitizedStudentWeekItem[];
}

/**
 * Privacy-hardened classroom syllabus projection for the Student Portal.
 * Strips internal `notes` & teacher metadata, and locks homework/attachments for future weeks.
 */
export function sanitizeClassroomRoadmapForStudent(
  cls: ClassroomGroup,
): SanitizedStudentClassroomRoadmap {
  const progress = computeClassroomProgress(cls);
  const rawWeeks: CurriculumWeek[] =
    cls.curriculum && cls.curriculum.length > 0
      ? cls.curriculum
      : Array.from({ length: progress.totalWeeks }, (_, i) => ({
          weekNumber: i + 1,
          title: `Học phần tuần ${i + 1}`,
        }));

  const weeks: SanitizedStudentWeekItem[] = rawWeeks
    .slice()
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((w) => {
      const effectiveStatus = resolveWeekStatus(w, progress.currentWeek);
      const isUnlocked =
        effectiveStatus === "completed" ||
        effectiveStatus === "in-progress" ||
        w.weekNumber <= progress.currentWeek ||
        cls.status === "completed";

      return {
        weekNumber: w.weekNumber,
        title: w.title,
        ...(w.focus ? { focus: w.focus } : {}),
        ...(w.focusSkill ? { focusSkill: w.focusSkill } : {}),
        status: effectiveStatus,
        ...(w.scheduledDate ? { scheduledDate: w.scheduledDate } : {}),
        ...(w.isAssessmentMilestone
          ? { isAssessmentMilestone: true, assessmentTitle: w.assessmentTitle }
          : {}),
        ...(isUnlocked && w.homework ? { homework: w.homework } : {}),
        ...(isUnlocked && w.homeworkDueDate ? { homeworkDueDate: w.homeworkDueDate } : {}),
        attachments: isUnlocked ? (w.attachments ?? []) : [],
        isLocked: !isUnlocked,
      };
    });

  return {
    classId: cls.id,
    classCode: cls.code,
    className: cls.name,
    level: cls.level,
    targetBand: cls.targetBand,
    scheduleSummary: cls.scheduleSummary,
    room: cls.room,
    currentModule: cls.currentModule,
    currentWeek: progress.currentWeek,
    totalWeeks: progress.totalWeeks,
    completionPct: progress.completionPct,
    weeks,
  };
}

export function exportClassRosterCsv(
  cls: ClassroomGroup,
  students: AdminStudentRecord[],
): string {
  const esc = (v: string | number | undefined) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return `"${s}"`;
  };
  const header = [
    "Mã HS",
    "Họ và tên",
    "Tình trạng",
    "Ngày nhập học",
    "Điểm TB",
    "Chuyên cần (%)",
    "Học phí",
    "Hạn nộp HP",
    "Mục tiêu",
    "Nhận xét gần nhất",
  ];
  const rows = students.map((s) =>
    [
      esc(s.code),
      esc(s.fullName),
      esc(s.status),
      esc(s.joinedAt),
      esc(s.grades.length > 0 ? s.averageScore.toFixed(1) : "—"),
      esc(s.attendanceHistory.length > 0 ? `${s.attendanceRate}%` : "—"),
      esc(s.tuitionStatus === "paid" ? "Đã đóng" : s.tuitionStatus === "due-soon" ? "Sắp đến hạn" : "Quá hạn"),
      esc(formatDisplayDate(s.tuitionDueDate || cls.tuitionDueDate)),
      esc(s.targetGoal),
      esc(s.recentComment),
    ].join(","),
  );
  return `\uFEFF${[header.map((h) => esc(h)).join(","), ...rows].join("\n")}`;
}
