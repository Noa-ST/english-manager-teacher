import {
  DAYS_OF_WEEK,
  type ClassSessionRecord,
  type ClassroomGroup,
  type SessionHomeworkStatus,
  type SessionLearningStatus,
  type SessionStudentRecord,
  type StudentPortalSessionEntry,
  type WeekProgressStatus,
  type WeeklyClassSession,
} from "./classroom-data";
import { parseIsoDate, toIsoDate } from "./schedule-calendar-helpers";
import { parseScheduleSummaryToIntervals } from "./schedule-helper";

export interface QuickFeedbackChip {
  id: string;
  label: string;
  text: string;
  category: "positive" | "support" | "homework";
}

export const QUICK_FEEDBACK_CHIPS: QuickFeedbackChip[] = [
  {
    id: "chip-active-speaking",
    label: "Phát biểu tích cực",
    text: "Tích cực phát biểu, phát âm rõ ràng và phản xạ tốt trong buổi học.",
    category: "positive",
  },
  {
    id: "chip-good-writing",
    label: "Lập luận chặt chẽ",
    text: "Nắm chắc cấu trúc bài viết và diễn đạt ý mạch lạc, đúng trọng tâm.",
    category: "positive",
  },
  {
    id: "chip-hw-full",
    label: "Hoàn thành BTVN tốt",
    text: "Chuẩn bị bài đầy đủ trước giờ học, hoàn thành tốt bài tập về nhà.",
    category: "homework",
  },
  {
    id: "chip-hw-missing",
    label: "Nhắc nộp bù BTVN",
    text: "Cần hoàn thiện và nộp bổ sung bài tập về nhà trước buổi học kế tiếp.",
    category: "homework",
  },
  {
    id: "chip-grammar-support",
    label: "Cần củng cố ngữ pháp",
    text: "Cần ôn lại cấu trúc ngữ pháp trọng tâm và luyện thêm bài tập vận dụng.",
    category: "support",
  },
  {
    id: "chip-listening-focus",
    label: "Luyện nghe thêm",
    text: "Cần rèn thêm kỹ năng nghe bắt từ khóa và tốc độ xử lý thông tin.",
    category: "support",
  },
];

export interface SessionMetricsSummary {
  total: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  presentAndLateCount: number;
  attendanceRate: number;
  homeworkSubmittedCount: number;
  homeworkExemptCount: number;
  homeworkRate: number;
  needsSupportCount: number;
  goodLearningCount: number;
  scoredCount: number;
  avgScore: number | null;
}

export function computeSessionMetrics(session: ClassSessionRecord): SessionMetricsSummary {
  const records: SessionStudentRecord[] = session.studentRecords ?? [];
  const total = records.length;

  if (total === 0) {
    return {
      total: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      excusedCount: 0,
      presentAndLateCount: 0,
      attendanceRate: 0,
      homeworkSubmittedCount: 0,
      homeworkExemptCount: 0,
      homeworkRate: 0,
      needsSupportCount: 0,
      goodLearningCount: 0,
      scoredCount: 0,
      avgScore: null,
    };
  }

  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let excusedCount = 0;
  let homeworkSubmittedCount = 0;
  let homeworkExemptCount = 0;
  let needsSupportCount = 0;
  let goodLearningCount = 0;
  let scoreSum = 0;
  let scoredCount = 0;

  for (const r of records) {
    if (r.attendance === "present") presentCount += 1;
    else if (r.attendance === "late") lateCount += 1;
    else if (r.attendance === "absent") absentCount += 1;
    else if (r.attendance === "excused") excusedCount += 1;

    if (r.homeworkStatus === "submitted") homeworkSubmittedCount += 1;
    else if (r.homeworkStatus === "exempt") homeworkExemptCount += 1;

    if (r.learningStatus === "needs-support") needsSupportCount += 1;
    else if (r.learningStatus === "good") goodLearningCount += 1;

    if (typeof r.score === "number" && !Number.isNaN(r.score)) {
      scoreSum += r.score;
      scoredCount += 1;
    }
  }

  const presentAndLateCount = presentCount + lateCount;
  const attendanceRate = Math.round((presentAndLateCount / total) * 100);
  const hwDenominator = Math.max(total - homeworkExemptCount, 1);
  const homeworkRate =
    total - homeworkExemptCount <= 0
      ? 100
      : Math.round((homeworkSubmittedCount / hwDenominator) * 100);
  const avgScore = scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 10) / 10 : null;

  return {
    total,
    presentCount,
    lateCount,
    absentCount,
    excusedCount,
    presentAndLateCount,
    attendanceRate,
    homeworkSubmittedCount,
    homeworkExemptCount,
    homeworkRate,
    needsSupportCount,
    goodLearningCount,
    scoredCount,
    avgScore,
  };
}

function formatViDateFromIso(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Tạo bản tin tổng kết buổi học gửi Phụ huynh (Zalo / Email).
 * TUYỆT ĐỐI không đưa privateNotes hoặc followUp nội bộ vào bản tin này.
 */
export function buildParentSessionDigest(session: ClassSessionRecord): string {
  const metrics = computeSessionMetrics(session);
  const displayDate = formatViDateFromIso(session.date);
  const lines: string[] = [
    `[NHẬT KÝ BUỔI HỌC] ${session.className} (${session.classCode})`,
    `Thời gian: ${session.dayLabel}, ${displayDate} · ${session.startTime}–${session.endTime} (${session.room})`,
    `Tuần ${session.weekNumber} — Chuyên đề: ${session.topic || "Đang cập nhật"}`,
  ];

  if (session.objectives?.trim()) {
    lines.push(`Mục tiêu buổi học: ${session.objectives.trim()}`);
  }

  lines.push(
    `Chuyên cần lớp: ${metrics.presentAndLateCount}/${metrics.total} học sinh có mặt (${metrics.attendanceRate}%) · Hoàn thành BTVN: ${metrics.homeworkRate}%${metrics.avgScore !== null ? ` · Điểm TB kiểm tra ngắn: ${metrics.avgScore}/10` : ""}`,
  );

  if (session.generalNotes?.trim()) {
    lines.push("", `Tình hình lớp học:`, session.generalNotes.trim());
  }

  if (session.homework?.trim()) {
    lines.push("", `Bài tập về nhà:`, session.homework.trim());
  }

  if (session.nextSessionPlan?.trim()) {
    lines.push("", `Chuẩn bị buổi kế tiếp:`, session.nextSessionPlan.trim());
  }

  const feedbackRows = (session.studentRecords ?? []).filter(
    (r) => r.teacherFeedback?.trim() || typeof r.score === "number",
  );
  if (feedbackRows.length > 0) {
    lines.push("", "Ghi nhận cá nhân từng học viên:");
    for (const row of feedbackRows) {
      const scoreBadge = typeof row.score === "number" ? ` [${row.score}/10]` : "";
      const feedbackText = row.teacherFeedback?.trim() || "Hoàn thành tốt nội dung trên lớp.";
      lines.push(`• ${row.studentName} (${row.studentCode})${scoreBadge}: ${feedbackText}`);
    }
  }

  lines.push("", "Trân trọng,", "ThS. Nguyễn Minh Anh");
  return lines.join("\n");
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const JOURNAL_STATUS_LABEL_VI: Record<ClassSessionRecord["journalStatus"], string> = {
  completed: "Đã hoàn tất",
  draft: "Bản nháp",
  "not-started": "Chưa ghi",
};

const COMPLETION_LABEL_VI: Record<ClassSessionRecord["completionResult"], string> = {
  completed: "Đạt mục tiêu",
  partial: "Hoàn thành 1 phần",
  "not-completed": "Cần bù kiến thức",
};

/**
 * Xuất bảng tổng hợp Nhật ký Giảng dạy dạng CSV chuẩn UTF-8 (có BOM mở được bằng Excel).
 * Không xuất trường ghi chú nội bộ (privateNotes).
 */
export function buildTeachingJournalCsv(sessions: ClassSessionRecord[]): string {
  const headers = [
    "Ngày học",
    "Thứ",
    "Giờ học",
    "Mã lớp",
    "Tên lớp",
    "Tuần",
    "Chuyên đề",
    "Trạng thái nhật ký",
    "Kết quả buổi học",
    "Sĩ số",
    "Có mặt",
    "Chuyên cần (%)",
    "Hoàn thành BTVN (%)",
    "Cần hỗ trợ",
    "Điểm TB kiểm tra",
    "Bài tập về nhà",
    "Kế hoạch buổi sau",
  ];

  const rows = sessions.map((ses) => {
    const m = computeSessionMetrics(ses);
    return [
      formatViDateFromIso(ses.date),
      ses.dayLabel,
      `${ses.startTime}-${ses.endTime}`,
      ses.classCode,
      ses.className,
      ses.weekNumber,
      ses.topic,
      JOURNAL_STATUS_LABEL_VI[ses.journalStatus] ?? ses.journalStatus,
      COMPLETION_LABEL_VI[ses.completionResult] ?? ses.completionResult,
      m.total,
      m.presentAndLateCount,
      m.attendanceRate,
      m.homeworkRate,
      m.needsSupportCount,
      m.avgScore ?? "",
      ses.homework,
      ses.nextSessionPlan,
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return `\uFEFF${[headers.map(escapeCsvCell).join(","), ...rows].join("\r\n")}`;
}

/**
 * Lọc và làm sạch nhật ký buổi học cho Cổng Học sinh (/student):
 * - CHỈ trả về các buổi có journalStatus === "completed" (ẩn draft & not-started)
 * - Ẩn hoàn toàn privateNotes nội bộ của giáo viên và followUp nội bộ
 * - Chỉ đính kèm nhận xét / điểm danh / BTVN / điểm của CHÍNH studentId yêu cầu
 */
export function sanitizeSessionTimelineForStudent(
  sessions: ClassSessionRecord[],
  studentId: string,
): StudentPortalSessionEntry[] {
  const result: StudentPortalSessionEntry[] = [];

  for (const ses of sessions) {
    if (ses.journalStatus !== "completed") continue;
    const ownRecord = (ses.studentRecords ?? []).find((r) => r.studentId === studentId);
    if (!ownRecord) continue;

    result.push({
      id: ses.id,
      classId: ses.classId,
      classCode: ses.classCode,
      className: ses.className,
      date: ses.date,
      dayLabel: ses.dayLabel,
      startTime: ses.startTime,
      endTime: ses.endTime,
      room: ses.room,
      weekNumber: ses.weekNumber,
      topic: ses.topic,
      objectives: ses.objectives,
      completionResult: ses.completionResult,
      generalNotes: ses.generalNotes,
      homework: ses.homework,
      nextSessionPlan: ses.nextSessionPlan,
      attachments: (ses.attachments ?? []).map((att) => ({
        id: att.id,
        storedFileId: att.storedFileId,
        name: att.name,
        type: att.type,
        size: att.size,
        url: att.url,
        uploadedAt: att.uploadedAt,
      })),
      studentFeedback: ownRecord.teacherFeedback || undefined,
      studentAttendance: ownRecord.attendance,
      homeworkStatus: ownRecord.homeworkStatus as SessionHomeworkStatus,
      learningStatus: ownRecord.learningStatus as SessionLearningStatus,
      score: typeof ownRecord.score === "number" ? ownRecord.score : undefined,
    });
  }

  return result.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface ClassWeekOption {
  weekNumber: number;
  label: string;
  title: string;
  objectives: string;
  homework: string;
  status: WeekProgressStatus;
}

export function buildClassWeekOptions(
  classroom: ClassroomGroup | null | undefined,
): ClassWeekOption[] {
  if (!classroom) return [];
  if (classroom.curriculum && classroom.curriculum.length > 0) {
    const activeWeek = classroom.currentWeekIndex ?? 1;
    return classroom.curriculum.map((wk) => {
      const effectiveStatus =
        wk.status ??
        (wk.weekNumber < activeWeek
          ? "completed"
          : wk.weekNumber === activeWeek
            ? "in-progress"
            : "not-started");
      return {
        weekNumber: wk.weekNumber,
        label: `Tuần ${wk.weekNumber} · ${wk.title}`,
        title: wk.title,
        objectives:
          wk.lessonObjectives && wk.lessonObjectives.length > 0
            ? wk.lessonObjectives.join("; ")
            : wk.focus ?? "",
        homework: wk.homework ?? "",
        status: effectiveStatus,
      };
    });
  }

  const total = classroom.totalWeeks ?? 12;
  const activeWeek = classroom.currentWeekIndex ?? 1;
  return Array.from({ length: total }, (_, idx) => {
    const weekNumber = idx + 1;
    const status: WeekProgressStatus =
      weekNumber < activeWeek
        ? "completed"
        : weekNumber === activeWeek
          ? "in-progress"
          : "not-started";
    return {
      weekNumber,
      label: `Tuần ${weekNumber}${weekNumber === activeWeek ? " (Hiện tại)" : ""}`,
      title: weekNumber === activeWeek ? classroom.currentModule : `Chuyên đề Tuần ${weekNumber}`,
      objectives: "",
      homework: "",
      status,
    };
  });
}

/** Trả về ngày YYYY-MM-DD tương ứng với thứ dayNumber (1 = T2 ... 7 = CN) trong tuần chứa referenceDate */
export function getTargetDateForDayOfWeek(
  dayNumber: number,
  referenceDate: Date = new Date(),
): string {
  const base = parseIsoDate(toIsoDate(referenceDate));
  const jsDay = base.getDay();
  const currentIsoDow = jsDay === 0 ? 7 : jsDay;
  const diff = dayNumber - currentIsoDow;
  base.setDate(base.getDate() + diff);
  return toIsoDate(base);
}

export interface ClassSlotOption {
  id: string;
  dayNumber: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
  room: string;
  topic: string;
}

export function getClassAvailableSlots(
  classroom: ClassroomGroup | null | undefined,
  weeklySessions: WeeklyClassSession[],
): ClassSlotOption[] {
  if (!classroom) return [];
  const matched = weeklySessions.filter(
    (s) => s.classCode.toUpperCase() === classroom.code.toUpperCase(),
  );

  if (matched.length > 0) {
    return matched
      .map((s) => ({
        id: s.id,
        dayNumber: s.dayOfWeek,
        dayLabel: s.dayLabel,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room || classroom.room,
        topic: s.topic || classroom.currentModule,
      }))
      .sort((a, b) => a.dayNumber - b.dayNumber || a.startTime.localeCompare(b.startTime));
  }

  const parsed = parseScheduleSummaryToIntervals(classroom.scheduleSummary);
  return parsed.map((slot, idx) => {
    const def = DAYS_OF_WEEK.find((d) => d.dayNumber === slot.dayNumber);
    return {
      id: `parsed-${classroom.id}-${idx}`,
      dayNumber: slot.dayNumber,
      dayLabel: def?.fullLabel ?? slot.dayLabel,
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: classroom.room,
      topic: classroom.currentModule,
    };
  });
}
