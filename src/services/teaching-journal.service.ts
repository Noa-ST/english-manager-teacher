import { z } from "zod";

import { removeVietnameseTones } from "@/lib/utils";

import {
  STANDARD_TIME_SLOTS,
  resolveWeekStatus,
  type AdminStudentRecord,
  type AnalyticsAlertAckRecord,
  type ClassSessionRecord,
  type JournalRevision,
  type SessionHomeworkStatus,
  type SessionLearningStatus,
  type SessionSkillType,
  type SessionStudentRecord,
} from "./classroom-data";
import { idSchema, validate } from "./common";
import { NotFoundError } from "./errors";
import { getRuntimeStore, saveRuntimeStore } from "./runtime-store";
import { parseScheduleStringToSlots } from "./schedule-helper";
import { syncClassroomMetrics } from "./student.service";
import { parseTargetBand } from "./academic-alert.service";

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

export const sessionAttachmentSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  type: z.enum(["PDF", "SLIDE", "IMAGE", "DOCX", "WORKSHEET"]).default("PDF"),
  size: z.string().trim().max(40).default("1.0 MB"),
  url: z.string().trim().max(500).optional(),
});

export const sessionStudentRecordInputSchema = z.object({
  studentId: idSchema,
  attendance: z
    .enum(["present", "excused", "absent", "late"])
    .default("present"),
  homeworkStatus: z
    .enum(["submitted", "not-submitted", "exempt", "unrecorded"])
    .default("unrecorded"),
  learningStatus: z
    .enum(["good", "satisfactory", "needs-support", "unrecorded"])
    .default("unrecorded"),
  skill: z
    .enum(["Listening", "Reading", "Writing", "Speaking", "General"])
    .default("General"),
  score: z.number().min(0).max(10).nullable().optional(),
  teacherFeedback: z.string().trim().max(1000).default(""),
  followUp: z.string().trim().max(1000).default(""),
});

export const createClassSessionRecordSchema = z.object({
  classId: idSchema,
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày học phải theo định dạng YYYY-MM-DD")
    .optional(),
  startTime: z.string().trim().max(20).optional(),
  endTime: z.string().trim().max(20).optional(),
  room: z.string().trim().max(160).optional(),
  weekNumber: z.coerce.number().int().min(1).max(100).optional(),
  topic: z.string().trim().max(240).optional(),
  objectives: z.string().trim().max(1000).optional(),
  copyFromPreviousSession: z.boolean().optional(),
});
export type CreateClassSessionRecordInput = z.infer<
  typeof createClassSessionRecordSchema
>;

export const updateClassSessionRecordSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z.string().trim().max(20).optional(),
  endTime: z.string().trim().max(20).optional(),
  room: z.string().trim().max(160).optional(),
  weekNumber: z.coerce.number().int().min(1).max(100).optional(),
  topic: z.string().trim().min(1).max(240).optional(),
  objectives: z.string().trim().max(1000).optional(),
  completionResult: z
    .enum(["completed", "partial", "not-completed"])
    .optional(),
  generalNotes: z.string().trim().max(2000).optional(),
  homework: z.string().trim().max(1000).optional(),
  nextSessionPlan: z.string().trim().max(1000).optional(),
  journalStatus: z.enum(["completed", "draft", "not-started"]).optional(),
  attachments: z.array(sessionAttachmentSchema).optional(),
  studentRecords: z.array(sessionStudentRecordInputSchema).optional(),
  syncCurriculumWeek: z.boolean().optional(),
});
export type UpdateClassSessionRecordInput = z.infer<
  typeof updateClassSessionRecordSchema
>;

export const listClassSessionsQuerySchema = z.object({
  classId: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
  journalStatus: z
    .enum(["all", "completed", "draft", "not-started"])
    .optional(),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  search: z.string().trim().optional(),
});
export type ListClassSessionsQuery = z.infer<
  typeof listClassSessionsQuerySchema
>;

export const updateAlertAckSchema = z.object({
  alertId: z.string().trim().min(1),
  status: z.enum(["active", "acknowledged", "resolved"]),
  note: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS_FROM_JS_DAY: Record<number, string> = {
  0: "Chủ Nhật",
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
};

function getDayLabelFromDate(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return "Thứ Hai";
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return DAY_LABELS_FROM_JS_DAY[d.getDay()] ?? "Thứ Hai";
}

function formatDisplayDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatNowTimestamp(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

/**
 * Recalculates a student's attendanceRate accurately:
 * - Excused absences ("excused") are not counted in the required denominator.
 * - Students with 0 required sessions default to 100% (never penalized as 0%).
 */
export function recalculateStudentAttendanceRate(stu: AdminStudentRecord): void {
  const history = stu.attendanceHistory ?? [];
  const requiredSessions = history.filter((a) => a.status !== "excused");
  if (requiredSessions.length === 0) {
    stu.attendanceRate = 100;
    return;
  }
  const attended = requiredSessions.filter(
    (a) => a.status === "present" || a.status === "late",
  ).length;
  stu.attendanceRate = Math.round((attended / requiredSessions.length) * 100);
}

/**
 * Ensures all active students in the classroom have a corresponding record in the session
 * when the session is being viewed or edited.
 */
function ensureSessionRosterSynced(
  session: ClassSessionRecord,
  activeStudentsInClass: AdminStudentRecord[],
): ClassSessionRecord {
  const existingMap = new Map<string, SessionStudentRecord>();
  for (const sr of session.studentRecords) {
    existingMap.set(sr.studentId, sr);
  }

  const mergedRecords: SessionStudentRecord[] = [...session.studentRecords];

  for (const stu of activeStudentsInClass) {
    if (!existingMap.has(stu.id)) {
      mergedRecords.push({
        id: `ssr-${session.id}-${stu.id}`,
        sessionId: session.id,
        studentId: stu.id,
        studentCode: stu.code,
        studentName: stu.fullName,
        attendance: "present",
        homeworkStatus: "unrecorded",
        learningStatus: "unrecorded",
        skill: "General",
        score: null,
        teacherFeedback: "",
        followUp: "",
      });
    } else {
      // Keep studentName & studentCode fresh
      const existing = existingMap.get(stu.id)!;
      existing.studentName = stu.fullName;
      existing.studentCode = stu.code;
    }
  }

  return {
    ...session,
    studentRecords: mergedRecords,
  };
}

// ---------------------------------------------------------------------------
// 1. Teaching Journal & Class Session Operations
// ---------------------------------------------------------------------------

export async function listClassSessions(
  input?: unknown,
): Promise<ClassSessionRecord[]> {
  const query = validate(listClassSessionsQuerySchema, input ?? {});
  const store = getRuntimeStore();

  let list = store.classSessions.map((session) => {
    const activeStudents = store.students.filter(
      (s) =>
        s.classId === session.classId &&
        s.status !== "archived" &&
        !s.deletedAt,
    );
    return ensureSessionRosterSynced(session, activeStudents);
  });

  if (query.classId && query.classId !== "all") {
    list = list.filter((s) => s.classId === query.classId);
  }

  if (query.studentId) {
    list = list.filter((s) =>
      s.studentRecords.some((r) => r.studentId === query.studentId),
    );
  }

  if (query.journalStatus && query.journalStatus !== "all") {
    list = list.filter((s) => s.journalStatus === query.journalStatus);
  }

  if (query.fromDate) {
    list = list.filter((s) => s.date >= query.fromDate!);
  }

  if (query.toDate) {
    list = list.filter((s) => s.date <= query.toDate!);
  }

  if (query.search && query.search.trim().length > 0) {
    const q = removeVietnameseTones(query.search.trim().toLowerCase());
    list = list.filter((s) => {
      const hay = removeVietnameseTones(
        `${s.topic} ${s.objectives} ${s.generalNotes} ${s.homework} ${s.className} ${s.classCode} ${s.date}`.toLowerCase(),
      );
      return hay.includes(q);
    });
  }

  return list.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.startTime.localeCompare(a.startTime);
  });
}

export async function getClassSessionById(
  id: unknown,
): Promise<ClassSessionRecord> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const session = store.classSessions.find((s) => s.id === validId);
  if (!session) {
    throw new NotFoundError("ClassSession", validId);
  }
  const activeStudents = store.students.filter(
    (s) =>
      s.classId === session.classId &&
      s.status !== "archived" &&
      !s.deletedAt,
  );
  return ensureSessionRosterSynced(session, activeStudents);
}

/**
 * Automatically creates a new ClassSessionRecord from the classroom's fixed schedule
 * and curriculum week so the teacher does not need to re-enter schedule/curriculum details.
 */
export async function createOrGenerateClassSession(
  input: unknown,
): Promise<ClassSessionRecord> {
  const data = validate(createClassSessionRecordSchema, input);
  const store = getRuntimeStore();

  const classroom = store.classrooms.find((c) => c.id === data.classId);
  if (!classroom) {
    throw new NotFoundError("Classroom", data.classId);
  }

  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const sessionDate = data.date ?? defaultDate;
  const dayLabel = getDayLabelFromDate(sessionDate);

  // 1. Auto-detect time slot from fixed schedule
  let startTime = data.startTime ?? "18:00";
  let endTime = data.endTime ?? "20:00";

  if (!data.startTime || !data.endTime) {
    const parsedSlots = parseScheduleStringToSlots(classroom.scheduleSummary);
    const firstSlotDef =
      parsedSlots.length > 0
        ? STANDARD_TIME_SLOTS.find((ts) => ts.id === parsedSlots[0].slotId)
        : undefined;
    if (firstSlotDef) {
      startTime = data.startTime ?? firstSlotDef.startTime;
      endTime = data.endTime ?? firstSlotDef.endTime;
    } else {
      const matchingWeekly = store.sessions.find(
        (ws) => ws.classCode.toUpperCase() === classroom.code.toUpperCase(),
      );
      if (matchingWeekly) {
        startTime = data.startTime ?? matchingWeekly.startTime;
        endTime = data.endTime ?? matchingWeekly.endTime;
      }
    }
  }

  // 2. Auto-detect curriculum week & topic
  const weekNumber = data.weekNumber ?? classroom.currentWeekIndex ?? 1;
  const matchedWeek = classroom.curriculum?.find(
    (w) => w.weekNumber === weekNumber,
  );

  // 3. Check previous session of the same class if copyFromPreviousSession is requested
  const previousSessions = store.classSessions
    .filter((s) => s.classId === classroom.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const latestPrevious = previousSessions[0];

  let suggestedTopic =
    data.topic?.trim() ||
    matchedWeek?.title ||
    classroom.currentModule.replace(/^Tuần\s+\d+\/\d+\s*·\s*/i, "") ||
    `Bài học tuần ${weekNumber}`;

  let suggestedObjectives =
    data.objectives?.trim() ||
    matchedWeek?.focus ||
    `Hoàn thành mục tiêu trọng tâm Tuần ${weekNumber} (${classroom.targetBand}).`;

  let suggestedHomework = matchedWeek?.homework ?? "";
  let suggestedNotes = "";

  if (data.copyFromPreviousSession && latestPrevious) {
    if (!data.topic?.trim() && latestPrevious.nextSessionPlan) {
      suggestedTopic = latestPrevious.nextSessionPlan;
    }
    if (!data.objectives?.trim() && latestPrevious.objectives) {
      suggestedObjectives = latestPrevious.objectives;
    }
    suggestedHomework = latestPrevious.homework;
    suggestedNotes = `Tiếp nối nội dung từ buổi ${formatDisplayDate(latestPrevious.date)}: ${latestPrevious.topic}`;
  }

  const sessionId = `cs-${sessionDate}-${classroom.code.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now().toString(36).slice(-4)}`;

  // 4. Build initial student records from active students in this class
  const activeStudents = store.students.filter(
    (s) =>
      s.classId === classroom.id && s.status !== "archived" && !s.deletedAt,
  );

  const studentRecords: SessionStudentRecord[] = activeStudents.map((stu) => ({
    id: `ssr-${sessionId}-${stu.id}`,
    sessionId,
    studentId: stu.id,
    studentCode: stu.code,
    studentName: stu.fullName,
    attendance: "present",
    homeworkStatus: "unrecorded",
    learningStatus: "unrecorded",
    skill: "General",
    score: null,
    teacherFeedback: "",
    followUp: "",
  }));

  const newSession: ClassSessionRecord = {
    id: sessionId,
    classId: classroom.id,
    classCode: classroom.code,
    className: classroom.name,
    date: sessionDate,
    dayLabel,
    startTime,
    endTime,
    room: data.room?.trim() || classroom.room,
    weekNumber,
    topic: suggestedTopic,
    objectives: suggestedObjectives,
    completionResult: "not-completed",
    generalNotes: suggestedNotes,
    homework: suggestedHomework,
    nextSessionPlan: "",
    journalStatus: data.copyFromPreviousSession ? "draft" : "not-started",
    attachments: [],
    revisions: [],
    studentRecords,
    updatedAt: new Date().toISOString(),
  };

  store.classSessions.unshift(newSession);
  saveRuntimeStore(store);
  return newSession;
}

/**
 * Updates a ClassSessionRecord:
 * - Saves Teaching Journal fields and records revision history if modified
 * - Saves SessionStudentRecords (individual student learning history)
 * - Synchronizes attendance with student.attendanceHistory and recalculates attendanceRate
 * - Optionally syncs curriculum week status/notes
 */
export async function updateClassSession(
  id: unknown,
  input: unknown,
): Promise<ClassSessionRecord> {
  const validId = validate(idSchema, id);
  const data = validate(updateClassSessionRecordSchema, input);
  const store = getRuntimeStore();

  const idx = store.classSessions.findIndex((s) => s.id === validId);
  if (idx === -1) {
    throw new NotFoundError("ClassSession", validId);
  }

  const existing = store.classSessions[idx];

  // 1. Track revision history if modifying an already saved journal
  const revisions: JournalRevision[] = [...(existing.revisions ?? [])];
  const isAlreadyRecorded = existing.journalStatus !== "not-started";
  const topicChanged =
    data.topic !== undefined && data.topic !== existing.topic;
  const notesChanged =
    data.generalNotes !== undefined &&
    data.generalNotes !== existing.generalNotes;
  const resultChanged =
    data.completionResult !== undefined &&
    data.completionResult !== existing.completionResult;
  const homeworkChanged =
    data.homework !== undefined && data.homework !== existing.homework;

  if (
    isAlreadyRecorded &&
    (topicChanged || notesChanged || resultChanged || homeworkChanged)
  ) {
    const changedParts: string[] = [];
    if (topicChanged) changedParts.push("nội dung bài dạy");
    if (resultChanged) changedParts.push("kết quả thực hiện");
    if (notesChanged) changedParts.push("nhận xét chung");
    if (homeworkChanged) changedParts.push("bài tập về nhà");

    revisions.unshift({
      id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      updatedAt: formatNowTimestamp(),
      summary: `Chỉnh sửa ${changedParts.join(", ")}`,
      previousTopic: existing.topic,
      previousNotes: existing.generalNotes,
      previousCompletionResult: existing.completionResult,
    });
  }

  // 2. Update student records & synchronize attendance with Student module
  let updatedStudentRecords = [...existing.studentRecords];
  if (data.studentRecords) {
    updatedStudentRecords = data.studentRecords.map((incoming) => {
      const stu = store.students.find((s) => s.id === incoming.studentId);
      const prevRec = existing.studentRecords.find(
        (r) => r.studentId === incoming.studentId,
      );
      return {
        id: prevRec?.id ?? `ssr-${existing.id}-${incoming.studentId}`,
        sessionId: existing.id,
        studentId: incoming.studentId,
        studentCode: stu?.code ?? prevRec?.studentCode ?? "HS",
        studentName: stu?.fullName ?? prevRec?.studentName ?? "Học viên",
        attendance: incoming.attendance,
        homeworkStatus: incoming.homeworkStatus,
        learningStatus: incoming.learningStatus,
        skill: incoming.skill,
        score: incoming.score ?? null,
        teacherFeedback: incoming.teacherFeedback,
        followUp: incoming.followUp,
      };
    });

    // Synchronize attendance to store.students[i].attendanceHistory
    const displayDate = formatDisplayDate(data.date ?? existing.date);
    const sessionLabel = `Ca ${existing.dayLabel} · ${data.topic ?? existing.topic}`;

    for (const rec of updatedStudentRecords) {
      const stu = store.students.find((s) => s.id === rec.studentId);
      if (!stu) continue;

      const attIdx = stu.attendanceHistory.findIndex(
        (a) =>
          a.sessionId === existing.id ||
          (a.date === displayDate && a.sessionName === sessionLabel) ||
          (a.date === (data.date ?? existing.date) &&
            a.sessionName === sessionLabel),
      );

      const attEntry = {
        sessionId: existing.id,
        date: displayDate,
        sessionName: sessionLabel,
        status: rec.attendance,
        note: rec.teacherFeedback || undefined,
      };

      if (attIdx >= 0) {
        stu.attendanceHistory[attIdx] = attEntry;
      } else {
        stu.attendanceHistory.unshift(attEntry);
      }

      recalculateStudentAttendanceRate(stu);

      if (rec.teacherFeedback && rec.teacherFeedback.trim().length > 0) {
        stu.recentComment = rec.teacherFeedback.trim();
      }
    }
  }

  const newDate = data.date ?? existing.date;
  const newDayLabel = data.date
    ? getDayLabelFromDate(data.date)
    : existing.dayLabel;

  const updated: ClassSessionRecord = {
    ...existing,
    date: newDate,
    dayLabel: newDayLabel,
    startTime: data.startTime ?? existing.startTime,
    endTime: data.endTime ?? existing.endTime,
    room: data.room ?? existing.room,
    weekNumber: data.weekNumber ?? existing.weekNumber,
    topic: data.topic ?? existing.topic,
    objectives: data.objectives ?? existing.objectives,
    completionResult: data.completionResult ?? existing.completionResult,
    generalNotes: data.generalNotes ?? existing.generalNotes,
    homework: data.homework ?? existing.homework,
    nextSessionPlan: data.nextSessionPlan ?? existing.nextSessionPlan,
    journalStatus: data.journalStatus ?? existing.journalStatus,
    attachments: data.attachments ?? existing.attachments,
    revisions,
    studentRecords: updatedStudentRecords,
    updatedAt: new Date().toISOString(),
  };

  store.classSessions[idx] = updated;

  // 3. Optionally sync curriculum week progress on the classroom
  if (data.syncCurriculumWeek || updated.journalStatus === "completed") {
    const cls = store.classrooms.find((c) => c.id === updated.classId);
    if (cls && cls.curriculum) {
      const weekObj = cls.curriculum.find(
        (w) => w.weekNumber === updated.weekNumber,
      );
      if (weekObj) {
        if (updated.completionResult === "completed") {
          weekObj.status = "completed";
          weekObj.completedDate = updated.date;
        } else if (updated.completionResult === "partial") {
          weekObj.status = "in-progress";
        }
        if (updated.generalNotes) {
          weekObj.notes = updated.generalNotes;
        }
        if (updated.homework) {
          weekObj.homework = updated.homework;
        }
      }
    }
  }

  syncClassroomMetrics(store);
  saveRuntimeStore(store);

  return updated;
}

// ---------------------------------------------------------------------------
// 2. Student Session Learning History Timeline
// ---------------------------------------------------------------------------

export interface StudentTimelineEntry {
  sessionId: string;
  classId: string;
  classCode: string;
  className: string;
  date: string;
  displayDate: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  weekNumber: number;
  topic: string;
  sessionHomework: string;
  attendance: SessionStudentRecord["attendance"];
  homeworkStatus: SessionHomeworkStatus;
  learningStatus: SessionLearningStatus;
  skill: SessionSkillType;
  score: number | null;
  teacherFeedback: string;
  followUp: string;
}

export interface StudentLearningHistorySummary {
  studentId: string;
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  excusedCount: number;
  absentCount: number;
  attendanceRate: number;
  homeworkSubmittedCount: number;
  homeworkRequiredCount: number;
  homeworkSubmissionRate: number | null;
  needsSupportCount: number;
  timeline: StudentTimelineEntry[];
}

export async function getStudentLearningTimeline(
  studentId: unknown,
): Promise<StudentLearningHistorySummary> {
  const validStudentId = validate(idSchema, studentId);
  const store = getRuntimeStore();

  const matchingSessions = store.classSessions
    .filter((s) =>
      s.studentRecords.some((r) => r.studentId === validStudentId),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const timeline: StudentTimelineEntry[] = matchingSessions.map((session) => {
    const rec = session.studentRecords.find(
      (r) => r.studentId === validStudentId,
    )!;
    return {
      sessionId: session.id,
      classId: session.classId,
      classCode: session.classCode,
      className: session.className,
      date: session.date,
      displayDate: formatDisplayDate(session.date),
      dayLabel: session.dayLabel,
      startTime: session.startTime,
      endTime: session.endTime,
      weekNumber: session.weekNumber,
      topic: session.topic,
      sessionHomework: session.homework,
      attendance: rec.attendance,
      homeworkStatus: rec.homeworkStatus,
      learningStatus: rec.learningStatus,
      skill: rec.skill,
      score: rec.score ?? null,
      teacherFeedback: rec.teacherFeedback,
      followUp: rec.followUp,
    };
  });

  const presentCount = timeline.filter(
    (t) => t.attendance === "present",
  ).length;
  const lateCount = timeline.filter((t) => t.attendance === "late").length;
  const excusedCount = timeline.filter(
    (t) => t.attendance === "excused",
  ).length;
  const absentCount = timeline.filter((t) => t.attendance === "absent").length;

  const requiredAttendance = timeline.length - excusedCount;
  const attendanceRate =
    requiredAttendance > 0
      ? Math.round(((presentCount + lateCount) / requiredAttendance) * 100)
      : 100;

  const homeworkSubmittedCount = timeline.filter(
    (t) => t.homeworkStatus === "submitted",
  ).length;
  const homeworkNotSubmittedCount = timeline.filter(
    (t) => t.homeworkStatus === "not-submitted",
  ).length;
  const homeworkRequiredCount =
    homeworkSubmittedCount + homeworkNotSubmittedCount;
  const homeworkSubmissionRate =
    homeworkRequiredCount > 0
      ? Math.round((homeworkSubmittedCount / homeworkRequiredCount) * 100)
      : null;

  const needsSupportCount = timeline.filter(
    (t) => t.learningStatus === "needs-support",
  ).length;

  return {
    studentId: validStudentId,
    totalSessions: timeline.length,
    presentCount,
    lateCount,
    excusedCount,
    absentCount,
    attendanceRate,
    homeworkSubmittedCount,
    homeworkRequiredCount,
    homeworkSubmissionRate,
    needsSupportCount,
    timeline,
  };
}

// ---------------------------------------------------------------------------
// 3. Class Performance Analytics Engine
// ---------------------------------------------------------------------------

export interface ClassComparisonMetric {
  classId: string;
  classCode: string;
  className: string;
  level: string;
  targetBand: string;
  enrolled: number;
  capacity: number;
  attendanceRate: number;
  homeworkRate: number | null;
  completedWeeks: number;
  expectedWeek: number;
  totalWeeks: number;
  curriculumProgress: number;
  isBehindSchedule: boolean;
  averageScore: number | null;
  attentionStudentCount: number;
  sessionsCompletedCount: number;
}

export interface AnalyticsEarlyWarningAlert {
  alertId: string;
  type:
    | "consecutive-absences"
    | "low-attendance"
    | "missing-homework"
    | "score-drop"
    | "skill-below-target"
    | "curriculum-behind";
  severity: "high" | "medium";
  targetType: "student" | "class";
  classId: string;
  classCode: string;
  className: string;
  studentId?: string;
  studentCode?: string;
  studentName?: string;
  title: string;
  detail: string;
  suggestion: string;
  metricLabel: string;
  ackStatus: "active" | "acknowledged" | "resolved";
  note?: string;
}

export interface ClassPerformanceAnalyticsReport {
  kpi: {
    activeClassesCount: number;
    overallAttendanceRate: number;
    overallHomeworkRate: number;
    overallCurriculumProgress: number;
    studentsNeedingAttentionCount: number;
    supportRatePercent: number;
  };
  classComparisons: ClassComparisonMetric[];
  charts: {
    weeklySessions: {
      sessionId: string;
      label: string;
      date: string;
      classCode: string;
      topic: string;
      attendanceRate: number;
      homeworkRate: number;
    }[];
    curriculumProgress: {
      classId: string;
      classCode: string;
      className: string;
      completedWeeks: number;
      expectedWeek: number;
      totalWeeks: number;
      progressPercent: number;
      isBehind: boolean;
    }[];
    skillAverages: {
      listening: number;
      reading: number;
      writing: number;
      speaking: number;
      overall: number;
      gradedStudentCount: number;
    };
    assessmentTrends: {
      assessmentTitle: string;
      date: string;
      listening: number;
      reading: number;
      writing: number;
      speaking: number;
      overall: number;
    }[];
  };
  alerts: AnalyticsEarlyWarningAlert[];
}

export async function getClassPerformanceAnalytics(input?: {
  classId?: string;
  period?: string;
  programType?: string;
}): Promise<ClassPerformanceAnalyticsReport> {
  const store = getRuntimeStore();
  const ackMap = new Map<string, AnalyticsAlertAckRecord>();
  for (const ack of store.analyticsAlertAcks ?? []) {
    ackMap.set(ack.alertId, ack);
  }

  let activeClasses = store.classrooms.filter((c) => c.status !== "archived");

  if (input?.programType && input.programType !== "all") {
    const pt = input.programType.toLowerCase();
    activeClasses = activeClasses.filter(
      (c) =>
        c.name.toLowerCase().includes(pt) ||
        c.targetBand.toLowerCase().includes(pt) ||
        c.level.toLowerCase().includes(pt),
    );
  }

  const filteredClasses =
    input?.classId && input.classId !== "all"
      ? activeClasses.filter((c) => c.id === input.classId)
      : activeClasses;

  const classIdSet = new Set(filteredClasses.map((c) => c.id));

  const activeStudents = store.students.filter(
    (s) =>
      s.status !== "archived" && !s.deletedAt && classIdSet.has(s.classId),
  );

  let relevantSessions = store.classSessions.filter((s) =>
    classIdSet.has(s.classId),
  );

  if (input?.period === "7d") {
    relevantSessions = relevantSessions.filter((s) => s.date >= "2026-11-10");
  } else if (input?.period === "30d") {
    relevantSessions = relevantSessions.filter((s) => s.date >= "2026-10-18");
  }

  const alerts: AnalyticsEarlyWarningAlert[] = [];
  const studentsWithActiveAlerts = new Set<string>();

  const registerAlert = (
    raw: Omit<AnalyticsEarlyWarningAlert, "ackStatus" | "note">,
  ) => {
    const ack = ackMap.get(raw.alertId);
    const ackStatus = ack?.status ?? "active";
    alerts.push({
      ...raw,
      ackStatus,
      note: ack?.note,
    });
    if (raw.studentId && ackStatus !== "resolved") {
      studentsWithActiveAlerts.add(raw.studentId);
    }
  };

  // 1. Evaluate Student-Level Early-Warning Alerts
  for (const stu of activeStudents) {
    const cls = store.classrooms.find((c) => c.id === stu.classId);
    const classCode = cls?.code ?? "LỚP";

    // Gather session records for this student
    const stuSessionRecords = relevantSessions
      .filter((s) => s.studentRecords.some((r) => r.studentId === stu.id))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((s) => ({
        date: s.date,
        topic: s.topic,
        record: s.studentRecords.find((r) => r.studentId === stu.id)!,
      }));

    // (a) Unexcused absences / consecutive absences
    const absentSessions = stuSessionRecords.filter(
      (x) => x.record.attendance === "absent",
    );
    const historyAbsences = (stu.attendanceHistory ?? []).filter(
      (a) => a.status === "absent",
    );
    if (absentSessions.length >= 1 && historyAbsences.length >= 1) {
      registerAlert({
        alertId: `alert-absent-${stu.id}`,
        type: "consecutive-absences",
        severity: absentSessions.length >= 2 ? "high" : "medium",
        targetType: "student",
        classId: stu.classId,
        classCode,
        className: stu.className,
        studentId: stu.id,
        studentCode: stu.code,
        studentName: stu.fullName,
        title: "Cần kiểm tra tình hình học tập (Vắng không phép)",
        detail: `Học sinh ${stu.fullName} có buổi vắng học không phép gần đây (${absentSessions[0]?.topic ?? "Buổi học định kỳ"}).`,
        suggestion:
          "Liên hệ phụ huynh xác nhận lý do vắng và gửi tài liệu/video học bù trước buổi kế tiếp.",
        metricLabel: `${absentSessions.length} buổi vắng`,
      });
    }

    // (b) Low attendance (< 90% threshold or < 80% critical) only when student has recorded sessions
    const hasRecordedAttendance =
      (stu.attendanceHistory && stu.attendanceHistory.length > 0) ||
      stuSessionRecords.length > 0;
    if (hasRecordedAttendance && stu.attendanceRate < 90) {
      registerAlert({
        alertId: `alert-low-att-${stu.id}`,
        type: "low-attendance",
        severity: stu.attendanceRate < 80 ? "high" : "medium",
        targetType: "student",
        classId: stu.classId,
        classCode,
        className: stu.className,
        studentId: stu.id,
        studentCode: stu.code,
        studentName: stu.fullName,
        title: "Tỷ lệ chuyên cần thấp",
        detail: `Tỷ lệ tham gia buổi học của ${stu.fullName} đạt ${stu.attendanceRate}% (dưới mức khuyến nghị 90%).`,
        suggestion:
          "Nhắc nhở lịch học cố định và kiểm tra nguyên nhân đi muộn/vắng mặt.",
        metricLabel: `Chuyên cần ${stu.attendanceRate}%`,
      });
    }

    // (c) Missing homework
    const missingHw = stuSessionRecords.filter(
      (x) => x.record.homeworkStatus === "not-submitted",
    );
    if (missingHw.length >= 1) {
      registerAlert({
        alertId: `alert-hw-${stu.id}`,
        type: "missing-homework",
        severity: missingHw.length >= 2 ? "high" : "medium",
        targetType: "student",
        classId: stu.classId,
        classCode,
        className: stu.className,
        studentId: stu.id,
        studentCode: stu.code,
        studentName: stu.fullName,
        title: "Chưa hoàn thành bài tập về nhà",
        detail: `${stu.fullName} có ${missingHw.length} buổi chưa nộp bài tập (${missingHw.map((m) => m.topic).join("; ")}).`,
        suggestion:
          "Yêu cầu học sinh nộp bù bài tập và kiểm tra lại phần kiến thức chưa nắm vững.",
        metricLabel: `Thiếu ${missingHw.length} bài tập`,
      });
    }

    // (d) Consecutive score drop across official assessments
    if (stu.grades && stu.grades.length >= 2) {
      const latest = stu.grades[0];
      const previous = stu.grades[1];
      if (latest.overall < previous.overall) {
        const diff = Math.round((previous.overall - latest.overall) * 10) / 10;
        registerAlert({
          alertId: `alert-scoredrop-${stu.id}`,
          type: "score-drop",
          severity: diff >= 0.5 ? "high" : "medium",
          targetType: "student",
          classId: stu.classId,
          classCode,
          className: stu.className,
          studentId: stu.id,
          studentCode: stu.code,
          studentName: stu.fullName,
          title: "Có dấu hiệu sa sút điểm kiểm tra",
          detail: `Điểm bài "${latest.assessmentTitle}" (${latest.overall}) giảm ${diff} điểm so với kỳ trước (${previous.overall}).`,
          suggestion:
            "Rà soát lại bài thi gần nhất và phụ đạo 1:1 phần kỹ năng bị tụt điểm.",
          metricLabel: `Giảm ${diff} band`,
        });
      }
    }

    // (e) Skill below target band
    const targetBand = parseTargetBand(stu.targetGoal);
    if (targetBand && stu.grades && stu.grades.length > 0) {
      const latestGrade = stu.grades[0];
      const skills: { name: string; val: number }[] = [
        { name: "Listening", val: latestGrade.listening },
        { name: "Reading", val: latestGrade.reading },
        { name: "Writing", val: latestGrade.writing },
        { name: "Speaking", val: latestGrade.speaking },
      ];
      const weakest = skills.reduce((min, cur) =>
        cur.val < min.val ? cur : min,
      );
      if (weakest.val <= targetBand - 0.5) {
        registerAlert({
          alertId: `alert-skill-${stu.id}`,
          type: "skill-below-target",
          severity: weakest.val <= targetBand - 1.0 ? "high" : "medium",
          targetType: "student",
          classId: stu.classId,
          classCode,
          className: stu.className,
          studentId: stu.id,
          studentCode: stu.code,
          studentName: stu.fullName,
          title: `Cần bổ trợ kỹ năng ${weakest.name}`,
          detail: `Kỹ năng ${weakest.name} của ${stu.fullName} hiện đạt ${weakest.val.toFixed(1)}, thấp hơn mục tiêu đầu ra (${stu.targetGoal}).`,
          suggestion: `Giao thêm bài luyện tập chuyên sâu kỹ năng ${weakest.name} trong tuần tới.`,
          metricLabel: `${weakest.name} ${weakest.val.toFixed(1)}`,
        });
      }
    }
  }

  // 2. Build Per-Class Comparisons & Class-Level Alerts
  const classComparisons: ClassComparisonMetric[] = filteredClasses.map(
    (cls) => {
      const classStudents = activeStudents.filter((s) => s.classId === cls.id);
      const classSessions = relevantSessions.filter(
        (s) => s.classId === cls.id,
      );

      // Attendance Rate from active students who have recorded sessions
      const studentsWithAtt = classStudents.filter(
        (s) =>
          (s.attendanceHistory && s.attendanceHistory.length > 0) ||
          s.attendanceRate > 0,
      );
      const attendanceRate =
        studentsWithAtt.length > 0
          ? Math.round(
              studentsWithAtt.reduce((sum, s) => sum + s.attendanceRate, 0) /
                studentsWithAtt.length,
            )
          : 100;

      // Homework submission rate across sessions of this class
      let submittedHw = 0;
      let requiredHw = 0;
      for (const ses of classSessions) {
        for (const r of ses.studentRecords) {
          if (r.homeworkStatus === "submitted") {
            submittedHw += 1;
            requiredHw += 1;
          } else if (r.homeworkStatus === "not-submitted") {
            requiredHw += 1;
          }
        }
      }
      const homeworkRate =
        requiredHw > 0 ? Math.round((submittedHw / requiredHw) * 100) : null;

      // Curriculum Progress: compare completedWeeks vs expectedWeek (currentWeekIndex)
      const totalWeeks = cls.totalWeeks ?? 12;
      const expectedWeek = cls.currentWeekIndex ?? 1;
      const curriculumList =
        cls.curriculum && cls.curriculum.length > 0
          ? cls.curriculum
          : Array.from({ length: totalWeeks }, (_, i) => ({
              weekNumber: i + 1,
              title: `Tuần ${i + 1}`,
            }));
      const completedWeeks = curriculumList.filter(
        (w) => resolveWeekStatus(w, cls.currentWeekIndex) === "completed",
      ).length;
      const curriculumProgress =
        totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0;

      // A class is behind schedule if expectedWeek - completedWeeks >= 2
      const isBehindSchedule = expectedWeek - completedWeeks >= 2;
      if (isBehindSchedule) {
        registerAlert({
          alertId: `alert-class-behind-${cls.id}`,
          type: "curriculum-behind",
          severity: expectedWeek - completedWeeks >= 3 ? "high" : "medium",
          targetType: "class",
          classId: cls.id,
          classCode: cls.code,
          className: cls.name,
          title: "Chương trình giảng dạy chậm tiến độ",
          detail: `Lớp ${cls.code} dự kiến đang ở Tuần ${expectedWeek}/${totalWeeks} nhưng mới hoàn thành dứt điểm ${completedWeeks} tuần.`,
          suggestion:
            "Rà soát các tuần đang tạm hoãn hoặc chưa hoàn thành để sắp xếp buổi dạy bù.",
          metricLabel: `Hoàn thành ${completedWeeks}/${expectedWeek} tuần dự kiến`,
        });
      }

      // Average score (strictly excluding students with no grades)
      const gradedStudents = classStudents.filter(
        (s) => (s.grades && s.grades.length > 0) || s.averageScore > 0,
      );
      const averageScore =
        gradedStudents.length > 0
          ? Math.round(
              (gradedStudents.reduce((sum, s) => sum + s.averageScore, 0) /
                gradedStudents.length) *
                10,
            ) / 10
          : null;

      // Count students in this class needing attention
      const attentionStudentCount = classStudents.filter((s) =>
        studentsWithActiveAlerts.has(s.id),
      ).length;

      const sessionsCompletedCount = classSessions.filter(
        (s) => s.journalStatus === "completed",
      ).length;

      return {
        classId: cls.id,
        classCode: cls.code,
        className: cls.name,
        level: cls.level,
        targetBand: cls.targetBand,
        enrolled: classStudents.length,
        capacity: cls.capacity,
        attendanceRate,
        homeworkRate,
        completedWeeks,
        expectedWeek,
        totalWeeks,
        curriculumProgress,
        isBehindSchedule,
        averageScore,
        attentionStudentCount,
        sessionsCompletedCount,
      };
    },
  );

  // 3. Compute Overall KPIs
  const overallAttendanceRate =
    classComparisons.length > 0
      ? Math.round(
          classComparisons.reduce((sum, c) => sum + c.attendanceRate, 0) /
            classComparisons.length,
        )
      : 100;

  const classesWithHw = classComparisons.filter((c) => c.homeworkRate !== null);
  const overallHomeworkRate =
    classesWithHw.length > 0
      ? Math.round(
          classesWithHw.reduce((sum, c) => sum + (c.homeworkRate ?? 0), 0) /
            classesWithHw.length,
        )
      : 100;

  const overallCurriculumProgress =
    classComparisons.length > 0
      ? Math.round(
          classComparisons.reduce((sum, c) => sum + c.curriculumProgress, 0) /
            classComparisons.length,
        )
      : 0;

  const studentsNeedingAttentionCount = studentsWithActiveAlerts.size;
  const supportRatePercent =
    activeStudents.length > 0
      ? Math.round(
          (studentsNeedingAttentionCount / activeStudents.length) * 100,
        )
      : 0;

  // 4. Build Chart Datasets
  const weeklySessions = [...relevantSessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((ses) => {
      const total = ses.studentRecords.length;
      const excused = ses.studentRecords.filter(
        (r) => r.attendance === "excused",
      ).length;
      const requiredAtt = total - excused;
      const attended = ses.studentRecords.filter(
        (r) => r.attendance === "present" || r.attendance === "late",
      ).length;
      const attRate =
        requiredAtt > 0 ? Math.round((attended / requiredAtt) * 100) : 100;

      const hwSub = ses.studentRecords.filter(
        (r) => r.homeworkStatus === "submitted",
      ).length;
      const hwNotSub = ses.studentRecords.filter(
        (r) => r.homeworkStatus === "not-submitted",
      ).length;
      const hwReq = hwSub + hwNotSub;
      const hwRate = hwReq > 0 ? Math.round((hwSub / hwReq) * 100) : 100;

      return {
        sessionId: ses.id,
        label: `${formatDisplayDate(ses.date).slice(0, 5)} (${ses.classCode})`,
        date: ses.date,
        classCode: ses.classCode,
        topic: ses.topic,
        attendanceRate: attRate,
        homeworkRate: hwRate,
      };
    });

  const curriculumProgress = classComparisons.map((c) => ({
    classId: c.classId,
    classCode: c.classCode,
    className: c.className,
    completedWeeks: c.completedWeeks,
    expectedWeek: c.expectedWeek,
    totalWeeks: c.totalWeeks,
    progressPercent: c.curriculumProgress,
    isBehind: c.isBehindSchedule,
  }));

  // 4-Skill Averages across all graded active students
  const gradedStudentsAll = activeStudents.filter(
    (s) => s.grades && s.grades.length > 0,
  );
  let listeningSum = 0;
  let readingSum = 0;
  let writingSum = 0;
  let speakingSum = 0;
  let overallSum = 0;

  const assessmentMap = new Map<
    string,
    {
      assessmentTitle: string;
      date: string;
      count: number;
      l: number;
      r: number;
      w: number;
      s: number;
      o: number;
    }
  >();

  for (const stu of gradedStudentsAll) {
    const latest = stu.grades[0];
    listeningSum += latest.listening;
    readingSum += latest.reading;
    writingSum += latest.writing;
    speakingSum += latest.speaking;
    overallSum += latest.overall;

    for (const g of stu.grades) {
      const existingAss = assessmentMap.get(g.assessmentTitle);
      if (existingAss) {
        existingAss.count += 1;
        existingAss.l += g.listening;
        existingAss.r += g.reading;
        existingAss.w += g.writing;
        existingAss.s += g.speaking;
        existingAss.o += g.overall;
      } else {
        assessmentMap.set(g.assessmentTitle, {
          assessmentTitle: g.assessmentTitle,
          date: g.date,
          count: 1,
          l: g.listening,
          r: g.reading,
          w: g.writing,
          s: g.speaking,
          o: g.overall,
        });
      }
    }
  }

  const gCount = gradedStudentsAll.length;
  const skillAverages = {
    listening: gCount > 0 ? Math.round((listeningSum / gCount) * 10) / 10 : 0,
    reading: gCount > 0 ? Math.round((readingSum / gCount) * 10) / 10 : 0,
    writing: gCount > 0 ? Math.round((writingSum / gCount) * 10) / 10 : 0,
    speaking: gCount > 0 ? Math.round((speakingSum / gCount) * 10) / 10 : 0,
    overall: gCount > 0 ? Math.round((overallSum / gCount) * 10) / 10 : 0,
    gradedStudentCount: gCount,
  };

  const assessmentTrends = Array.from(assessmentMap.values()).map((a) => ({
    assessmentTitle: a.assessmentTitle,
    date: a.date,
    listening: Math.round((a.l / a.count) * 10) / 10,
    reading: Math.round((a.r / a.count) * 10) / 10,
    writing: Math.round((a.w / a.count) * 10) / 10,
    speaking: Math.round((a.s / a.count) * 10) / 10,
    overall: Math.round((a.o / a.count) * 10) / 10,
  }));

  return {
    kpi: {
      activeClassesCount: filteredClasses.length,
      overallAttendanceRate,
      overallHomeworkRate,
      overallCurriculumProgress,
      studentsNeedingAttentionCount,
      supportRatePercent,
    },
    classComparisons,
    charts: {
      weeklySessions,
      curriculumProgress,
      skillAverages,
      assessmentTrends,
    },
    alerts,
  };
}

export async function updateAnalyticsAlertStatus(
  input: unknown,
): Promise<AnalyticsAlertAckRecord> {
  const data = validate(updateAlertAckSchema, input);
  const store = getRuntimeStore();

  if (!Array.isArray(store.analyticsAlertAcks)) {
    store.analyticsAlertAcks = [];
  }

  const idx = store.analyticsAlertAcks.findIndex(
    (a) => a.alertId === data.alertId,
  );
  const record: AnalyticsAlertAckRecord = {
    alertId: data.alertId,
    status: data.status,
    updatedAt: new Date().toISOString(),
    note: data.note,
  };

  if (idx >= 0) {
    store.analyticsAlertAcks[idx] = record;
  } else {
    store.analyticsAlertAcks.push(record);
  }

  saveRuntimeStore(store);
  return record;
}
