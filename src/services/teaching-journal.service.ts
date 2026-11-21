import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { removeVietnameseTones } from "@/lib/utils";

import { parseTargetBand } from "./academic-alert.service";
import { normalizeHistoryDateToIso } from "./attendance-helpers";
import {
  computeClassHealthScore,
  type ClassHealthLevel,
  type StudentSpotlightItem,
} from "./class-analytics-helpers";
import * as classroomService from "./classroom.service";
import { idSchema, optionalSafeUrlSchema, validate } from "./common";
import {
  STANDARD_TIME_SLOTS,
  resolveWeekStatus,
  type AdminStudentRecord,
  type AnalyticsAlertAckRecord,
  type ClassSessionRecord,
  type PendingScheduleJournalItem,
  type SessionHomeworkStatus,
  type SessionLearningStatus,
  type SessionSkillType,
  type SessionStudentRecord,
} from "./domain-types";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { parseGradeDateToIso } from "./grade-helpers";
import {
  mapPrismaAnalyticsAlertAck,
  mapPrismaScheduleException,
  mapPrismaTeachingJournalEntry,
  mapPrismaWeeklySession,
  toPrismaCompletionResult,
  toPrismaHomeworkStatus,
  toPrismaJournalStatus,
  toPrismaLearningStatus,
} from "./prisma-mappers";
import {
  addDaysIso,
  resolveScheduleOccurrences,
  toIsoDate,
} from "./schedule-calendar-helpers";
import { parseScheduleStringToSlots, toMinutes } from "./schedule-helper";
import * as studentService from "./student.service";

const MAX_JOURNAL_REVISIONS = 50;

export const JOURNAL_ENTRY_INCLUDE = {
  classroom: { select: { id: true, code: true, name: true } },
  studentEvaluations: {
    include: {
      student: { select: { id: true, code: true, fullName: true } },
    },
    orderBy: { id: "asc" as const },
  },
  revisions: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  },
  attachments: {
    orderBy: [{ uploadedAt: "desc" as const }, { id: "desc" as const }],
  },
} satisfies Prisma.TeachingJournalEntryInclude;

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

export const sessionAttachmentSchema = z.object({
  id: z.string().trim().min(1),
  storedFileId: z.string().trim().max(120).optional(),
  name: z.string().trim().min(1).max(200),
  type: z
    .enum(["PDF", "SLIDE", "IMAGE", "DOCX", "WORKSHEET", "AUDIO"])
    .default("PDF"),
  size: z.string().trim().max(40).default("1.0 MB"),
  url: optionalSafeUrlSchema.transform((val) => val ?? undefined),
  uploadedAt: z.string().trim().max(60).optional(),
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
  scheduleExceptionId: z.string().trim().max(120).optional(),
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
  privateNotes: z.string().trim().max(4000).optional(),
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

/**
 * Pure helper: recalculates a student's attendanceRate in-memory:
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
 * Transactional PostgreSQL helper: recalculates attendanceRate for affected students
 * and updates enrolled / averageScore / attendanceRate on affected classrooms.
 */
export async function recalculateStudentAttendanceAndClassMetricsTx(
  tx: Prisma.TransactionClient,
  studentIds: Iterable<string>,
  classroomIds: Iterable<string>,
): Promise<void> {
  const uniqueStudentIds = Array.from(new Set(studentIds)).filter(Boolean);
  for (const studentId of uniqueStudentIds) {
    const attRows = await tx.attendanceRecord.findMany({
      where: { studentId },
      select: { status: true },
    });
    const requiredSessions = attRows.filter((a) => a.status !== "excused");
    const nextRate =
      requiredSessions.length === 0
        ? 100
        : Math.round(
            (requiredSessions.filter(
              (a) => a.status === "present" || a.status === "late",
            ).length /
              requiredSessions.length) *
              100,
          );
    await tx.student.update({
      where: { id: studentId },
      data: { attendanceRate: nextRate },
    });
  }

  const uniqueClassroomIds = Array.from(new Set(classroomIds)).filter(Boolean);
  for (const classroomId of uniqueClassroomIds) {
    const classStudents = await tx.student.findMany({
      where: {
        classroomId,
        status: { not: "archived" },
        deletedAt: null,
      },
      select: {
        status: true,
        attendanceRate: true,
        averageScore: true,
        grades: { select: { status: true } },
        _count: { select: { attendanceHistory: true } },
      },
    });

    const enrolled = classStudents.length;
    const activeForMetrics = classStudents.filter(
      (s) => s.status !== "on_leave",
    );

    const withGrades = activeForMetrics.filter(
      (s) =>
        s.grades.some((g) => g.status !== "draft") ||
        (s.grades.length === 0 && s.averageScore > 0),
    );
    const averageScore =
      withGrades.length > 0
        ? Math.round(
            (withGrades.reduce((sum, s) => sum + s.averageScore, 0) /
              withGrades.length) *
              10,
          ) / 10
        : 0;

    const withAttendance = activeForMetrics.filter(
      (s) => s._count.attendanceHistory > 0 || s.attendanceRate > 0,
    );
    const attendanceRate =
      withAttendance.length > 0
        ? Math.round(
            withAttendance.reduce((sum, s) => sum + s.attendanceRate, 0) /
              withAttendance.length,
          )
        : 100;

    await tx.classroom.update({
      where: { id: classroomId },
      data: { enrolled, averageScore, attendanceRate },
    });

    await tx.classSession.updateMany({
      where: { classroomId },
      data: { enrolledCount: enrolled },
    });
  }
}

/**
 * Ensures all active students in the classroom have a corresponding record in the session
 * when the session is being viewed or edited.
 */
function ensureSessionRosterSynced(
  session: ClassSessionRecord,
  activeStudentsInClass: Array<{ id: string; code: string; fullName: string }>,
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

  const where: Prisma.TeachingJournalEntryWhereInput = {};
  if (query.classId && query.classId !== "all") {
    where.classroomId = query.classId;
  }
  if (query.journalStatus && query.journalStatus !== "all") {
    where.journalStatus = toPrismaJournalStatus(query.journalStatus);
  }
  if (query.fromDate || query.toDate) {
    where.date = {
      ...(query.fromDate ? { gte: query.fromDate } : {}),
      ...(query.toDate ? { lte: query.toDate } : {}),
    };
  }

  const [rows, activeStudents] = await Promise.all([
    prisma.teachingJournalEntry.findMany({
      where,
      include: JOURNAL_ENTRY_INCLUDE,
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
    }),
    prisma.student.findMany({
      where: {
        status: { notIn: ["archived", "on_leave"] },
        deletedAt: null,
        ...(query.classId && query.classId !== "all"
          ? { classroomId: query.classId }
          : {}),
      },
      select: { id: true, code: true, fullName: true, classroomId: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const studentsByClassId = new Map<
    string,
    Array<{ id: string; code: string; fullName: string }>
  >();
  for (const stu of activeStudents) {
    const arr = studentsByClassId.get(stu.classroomId);
    if (arr) {
      arr.push(stu);
    } else {
      studentsByClassId.set(stu.classroomId, [stu]);
    }
  }

  let list = rows.map((row) => {
    const mapped = mapPrismaTeachingJournalEntry(row);
    const classStudents = studentsByClassId.get(row.classroomId) ?? [];
    return ensureSessionRosterSynced(mapped, classStudents);
  });

  if (query.studentId) {
    list = list.filter((s) =>
      s.studentRecords.some((r) => r.studentId === query.studentId),
    );
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
  const row = await prisma.teachingJournalEntry.findUnique({
    where: { id: validId },
    include: JOURNAL_ENTRY_INCLUDE,
  });
  if (!row) {
    throw new NotFoundError("ClassSession", validId);
  }

  const activeStudents = await prisma.student.findMany({
    where: {
      classroomId: row.classroomId,
      status: { notIn: ["archived", "on_leave"] },
      deletedAt: null,
    },
    select: { id: true, code: true, fullName: true },
    orderBy: { id: "asc" },
  });

  return ensureSessionRosterSynced(
    mapPrismaTeachingJournalEntry(row),
    activeStudents,
  );
}

/**
 * Automatically creates a new ClassSessionRecord from the classroom's fixed schedule
 * and curriculum week so the teacher does not need to re-enter schedule/curriculum details.
 */
export async function createOrGenerateClassSession(
  input: unknown,
): Promise<ClassSessionRecord> {
  const data = validate(createClassSessionRecordSchema, input);

  const classroom = await prisma.classroom.findUnique({
    where: { id: data.classId },
    include: {
      curriculumWeeks: { orderBy: { weekNumber: "asc" } },
      sessions: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
    },
  });
  if (!classroom) {
    throw new NotFoundError("Classroom", data.classId);
  }

  if (classroom.status === "archived" || classroom.status === "completed") {
    throw new ValidationError(
      `Lớp ${classroom.code} đã ở trạng thái ${classroom.status === "archived" ? "lưu trữ" : "kết thúc"}, không thể tạo nhật ký buổi học mới.`,
    );
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
      const matchingWeekly =
        classroom.sessions[0] ??
        (await prisma.classSession.findFirst({
          where: {
            classCode: { equals: classroom.code, mode: "insensitive" },
          },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        }));
      if (matchingWeekly) {
        startTime = data.startTime ?? matchingWeekly.startTime;
        endTime = data.endTime ?? matchingWeekly.endTime;
      }
    }
  }

  if (toMinutes(startTime) >= toMinutes(endTime)) {
    throw new ValidationError(
      `Giờ bắt đầu (${startTime}) phải sớm hơn giờ kết thúc (${endTime}).`,
    );
  }

  const duplicateSession = await prisma.teachingJournalEntry.findFirst({
    where: {
      classroomId: classroom.id,
      date: sessionDate,
      startTime,
    },
    select: { id: true },
  });
  if (duplicateSession) {
    throw new ConflictError(
      `Lớp ${classroom.code} đã có nhật ký buổi học ngày ${formatDisplayDate(sessionDate)} lúc ${startTime}.`,
    );
  }

  // 2. Auto-detect curriculum week & topic
  const weekNumber = data.weekNumber ?? classroom.currentWeekIndex ?? 1;
  const matchedWeek = classroom.curriculumWeeks.find(
    (w) => w.weekNumber === weekNumber,
  );

  // 3. Check previous session of the same class if copyFromPreviousSession is requested
  const latestPrevious = data.copyFromPreviousSession
    ? await prisma.teachingJournalEntry.findFirst({
        where: { classroomId: classroom.id },
        orderBy: [{ date: "desc" }, { startTime: "desc" }],
      })
    : null;

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

  const sessionId = `cs-${sessionDate}-${classroom.code.toLowerCase().replace(/[^a-z0-9]/g, "")}-${randomUUID().slice(0, 8)}`;

  // 4. Build initial student records from active students in this class (excluding archived & on-leave)
  const activeStudents = await prisma.student.findMany({
    where: {
      classroomId: classroom.id,
      status: { notIn: ["archived", "on_leave"] },
      deletedAt: null,
    },
    select: { id: true, code: true, fullName: true },
    orderBy: { id: "asc" },
  });

  let validScheduleExceptionId: string | null = null;
  if (data.scheduleExceptionId) {
    const foundExc = await prisma.scheduleException.findUnique({
      where: { id: data.scheduleExceptionId },
      select: { id: true },
    });
    if (foundExc) {
      validScheduleExceptionId = foundExc.id;
    }
  }

  try {
    const createdRow = await prisma.teachingJournalEntry.create({
      data: {
        id: sessionId,
        classroomId: classroom.id,
        scheduleExceptionId: validScheduleExceptionId,
        date: sessionDate,
        dayLabel,
        startTime,
        endTime,
        room: data.room?.trim() || classroom.room,
        weekNumber,
        topic: suggestedTopic,
        objectives: suggestedObjectives,
        completionResult: "not_completed",
        generalNotes: suggestedNotes,
        privateNotes: "",
        homework: suggestedHomework,
        nextSessionPlan: "",
        journalStatus: data.copyFromPreviousSession ? "draft" : "not_started",
        studentEvaluations: {
          create: activeStudents.map((stu) => ({
            id: `ssr-${sessionId}-${stu.id}`,
            studentId: stu.id,
            attendance: "present",
            homeworkStatus: "unrecorded",
            learningStatus: "unrecorded",
            skill: "General",
            score: null,
            teacherFeedback: "",
            followUp: "",
          })),
        },
      },
      include: JOURNAL_ENTRY_INCLUDE,
    });

    const mapped = mapPrismaTeachingJournalEntry(createdRow);
    if (data.scheduleExceptionId && !mapped.scheduleExceptionId) {
      mapped.scheduleExceptionId = data.scheduleExceptionId;
    }
    return mapped;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new ConflictError(
        `Lớp ${classroom.code} đã có nhật ký buổi học ngày ${formatDisplayDate(sessionDate)} lúc ${startTime}.`,
      );
    }
    throw err;
  }
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

  const existingRow = await prisma.teachingJournalEntry.findUnique({
    where: { id: validId },
    include: JOURNAL_ENTRY_INCLUDE,
  });
  if (!existingRow) {
    throw new NotFoundError("ClassSession", validId);
  }
  const existing = mapPrismaTeachingJournalEntry(existingRow);

  const nextDate = data.date ?? existing.date;
  const nextStartTime = data.startTime ?? existing.startTime;
  const nextEndTime = data.endTime ?? existing.endTime;
  if (toMinutes(nextStartTime) >= toMinutes(nextEndTime)) {
    throw new ValidationError(
      `Giờ bắt đầu (${nextStartTime}) phải sớm hơn giờ kết thúc (${nextEndTime}).`,
    );
  }

  // Enforce schedule uniqueness & canceled-date blocks when date or startTime changes
  if (nextDate !== existing.date || nextStartTime !== existing.startTime) {
    const duplicate = await prisma.teachingJournalEntry.findFirst({
      where: {
        id: { not: existing.id },
        classroomId: existing.classId,
        date: nextDate,
        startTime: nextStartTime,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(
        `Lớp ${existing.classCode} đã có nhật ký buổi học ngày ${formatDisplayDate(nextDate)} lúc ${nextStartTime}.`,
      );
    }

    const canceledOnDate = await prisma.scheduleException.findFirst({
      where: {
        type: "canceled",
        classroomId: existing.classId,
        originalDate: nextDate,
      },
      select: { reason: true },
    });
    if (canceledOnDate) {
      throw new ValidationError(
        `Ngày ${formatDisplayDate(nextDate)} lớp ${existing.classCode} đã đánh dấu Tạm nghỉ (${canceledOnDate.reason}).`,
      );
    }
  }

  const isAlreadyRecorded = existing.journalStatus !== "not-started";
  const topicChanged =
    data.topic !== undefined && data.topic !== existing.topic;
  const objectivesChanged =
    data.objectives !== undefined && data.objectives !== existing.objectives;
  const notesChanged =
    data.generalNotes !== undefined &&
    data.generalNotes !== existing.generalNotes;
  const resultChanged =
    data.completionResult !== undefined &&
    data.completionResult !== existing.completionResult;
  const homeworkChanged =
    data.homework !== undefined && data.homework !== existing.homework;
  const nextPlanChanged =
    data.nextSessionPlan !== undefined &&
    data.nextSessionPlan !== existing.nextSessionPlan;

  const shouldCreateRevision =
    isAlreadyRecorded &&
    (topicChanged ||
      objectivesChanged ||
      notesChanged ||
      resultChanged ||
      homeworkChanged ||
      nextPlanChanged);

  const newDate = data.date ?? existing.date;
  const newDayLabel = data.date
    ? getDayLabelFromDate(data.date)
    : existing.dayLabel;
  const nextTopic = data.topic ?? existing.topic;
  const nextObjectives = data.objectives ?? existing.objectives;
  const nextCompletionResult =
    data.completionResult ?? existing.completionResult;
  const nextGeneralNotes = data.generalNotes ?? existing.generalNotes;
  const nextPrivateNotes =
    data.privateNotes !== undefined
      ? data.privateNotes
      : existing.privateNotes ?? "";
  const nextHomework = data.homework ?? existing.homework;
  const nextSessionPlan = data.nextSessionPlan ?? existing.nextSessionPlan;
  const nextJournalStatus = data.journalStatus ?? existing.journalStatus;
  const nextWeekNumber = data.weekNumber ?? existing.weekNumber;

  const updatedRow = await prisma.$transaction(async (tx) => {
    // 1. Track revision history if modifying an already saved journal
    if (shouldCreateRevision) {
      const changedParts: string[] = [];
      if (topicChanged) changedParts.push("nội dung bài dạy");
      if (objectivesChanged) changedParts.push("mục tiêu");
      if (resultChanged) changedParts.push("kết quả thực hiện");
      if (notesChanged) changedParts.push("nhận xét chung");
      if (homeworkChanged) changedParts.push("bài tập về nhà");
      if (nextPlanChanged) changedParts.push("kế hoạch buổi sau");

      const latestRevTime =
        existingRow.revisions[0]?.createdAt.getTime() ?? 0;
      const nextRevCreatedAt = new Date(
        Math.max(Date.now(), latestRevTime + 1),
      );

      await tx.journalRevisionLog.create({
        data: {
          id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          entryId: existing.id,
          summary: `Chỉnh sửa ${changedParts.join(", ")}`,
          previousTopic: existing.topic,
          previousObjectives: existing.objectives,
          previousNotes: existing.generalNotes,
          previousHomework: existing.homework,
          previousNextSessionPlan: existing.nextSessionPlan,
          previousCompletionResult: toPrismaCompletionResult(
            existing.completionResult,
          ),
          createdAt: nextRevCreatedAt,
        },
      });

      const allRevs = await tx.journalRevisionLog.findMany({
        where: { entryId: existing.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (allRevs.length > MAX_JOURNAL_REVISIONS) {
        const overflowIds = allRevs
          .slice(MAX_JOURNAL_REVISIONS)
          .map((r) => r.id);
        await tx.journalRevisionLog.deleteMany({
          where: { id: { in: overflowIds } },
        });
      }
    }

    // 2. Update student records & synchronize attendance with Student module
    const affectedStudentIds = new Set<string>();
    if (data.studentRecords) {
      const dedupedIncomingMap = new Map<
        string,
        (typeof data.studentRecords)[number]
      >();
      for (const incoming of data.studentRecords) {
        dedupedIncomingMap.set(incoming.studentId, incoming);
      }
      const incomingList = Array.from(dedupedIncomingMap.values());
      const incomingIds = incomingList.map((i) => i.studentId);

      const studentsInDb = await tx.student.findMany({
        where: { id: { in: incomingIds } },
        include: { attendanceHistory: true },
      });
      const stuById = new Map(studentsInDb.map((s) => [s.id, s]));

      for (const incoming of incomingList) {
        const stu = stuById.get(incoming.studentId);
        if (!stu) {
          throw new NotFoundError("Student", incoming.studentId);
        }
        if (stu.deletedAt || stu.status === "archived") {
          throw new ValidationError(
            `Học viên ${stu.fullName} đã được lưu trữ, không thể cập nhật nhật ký buổi học.`,
          );
        }
      }

      await tx.sessionStudentEvaluation.deleteMany({
        where: {
          entryId: existing.id,
          ...(incomingIds.length > 0
            ? { studentId: { notIn: incomingIds } }
            : {}),
        },
      });

      const displayDate = formatDisplayDate(newDate);
      const sessionLabel = `Ca ${newDayLabel} · ${nextTopic}`;

      for (const incoming of incomingList) {
        const stu = stuById.get(incoming.studentId)!;
        affectedStudentIds.add(stu.id);

        const prevRec = existing.studentRecords.find(
          (r) => r.studentId === incoming.studentId,
        );

        await tx.sessionStudentEvaluation.upsert({
          where: {
            entryId_studentId: {
              entryId: existing.id,
              studentId: incoming.studentId,
            },
          },
          update: {
            attendance: incoming.attendance,
            homeworkStatus: toPrismaHomeworkStatus(incoming.homeworkStatus),
            learningStatus: toPrismaLearningStatus(incoming.learningStatus),
            skill: incoming.skill,
            score: incoming.score ?? null,
            teacherFeedback: incoming.teacherFeedback,
            followUp: incoming.followUp,
          },
          create: {
            id: prevRec?.id ?? `ssr-${existing.id}-${incoming.studentId}`,
            entryId: existing.id,
            studentId: incoming.studentId,
            attendance: incoming.attendance,
            homeworkStatus: toPrismaHomeworkStatus(incoming.homeworkStatus),
            learningStatus: toPrismaLearningStatus(incoming.learningStatus),
            skill: incoming.skill,
            score: incoming.score ?? null,
            teacherFeedback: incoming.teacherFeedback,
            followUp: incoming.followUp,
          },
        });

        const matchedAtt = stu.attendanceHistory.find(
          (a) =>
            a.teachingJournalEntryId === existing.id ||
            a.sessionId === existing.id ||
            (!a.teachingJournalEntryId &&
              !a.sessionId &&
              (normalizeHistoryDateToIso(a.date) === newDate ||
                a.date === displayDate)) ||
            ((normalizeHistoryDateToIso(a.date) === newDate ||
              a.date === displayDate) &&
              a.sessionName === sessionLabel),
        );

        if (matchedAtt) {
          await tx.attendanceRecord.update({
            where: { id: matchedAtt.id },
            data: {
              teachingJournalEntryId: existing.id,
              classroomId: existing.classId,
              date: newDate,
              sessionName: sessionLabel,
              status: incoming.attendance,
              note: incoming.teacherFeedback || null,
            },
          });
        } else {
          await tx.attendanceRecord.create({
            data: {
              id: `att-${existing.id}-${stu.id}`,
              studentId: stu.id,
              classroomId: existing.classId,
              teachingJournalEntryId: existing.id,
              date: newDate,
              sessionName: sessionLabel,
              status: incoming.attendance,
              note: incoming.teacherFeedback || null,
            },
          });
        }

        if (incoming.teacherFeedback && incoming.teacherFeedback.trim().length > 0) {
          await tx.student.update({
            where: { id: stu.id },
            data: { recentComment: incoming.teacherFeedback.trim() },
          });
        }
      }
    }

    // 3. Replace attachments if explicitly passed
    if (data.attachments !== undefined) {
      await tx.sessionAttachmentFile.deleteMany({
        where: { entryId: existing.id },
      });
      for (const att of data.attachments) {
        let validStoredId: string | null = null;
        if (att.storedFileId) {
          const sf = await tx.storedFile.findUnique({
            where: { id: att.storedFileId },
            select: { id: true },
          });
          if (sf) validStoredId = sf.id;
        }
        await tx.sessionAttachmentFile.create({
          data: {
            id: att.id,
            entryId: existing.id,
            storedFileId: validStoredId,
            name: att.name,
            fileType: att.type,
            size: att.size,
            url: att.url ?? null,
          },
        });
      }
    }

    // 4. Update TeachingJournalEntry
    await tx.teachingJournalEntry.update({
      where: { id: existing.id },
      data: {
        date: newDate,
        dayLabel: newDayLabel,
        startTime: nextStartTime,
        endTime: nextEndTime,
        room: data.room ?? existing.room,
        weekNumber: nextWeekNumber,
        topic: nextTopic,
        objectives: nextObjectives,
        completionResult: toPrismaCompletionResult(nextCompletionResult),
        generalNotes: nextGeneralNotes,
        privateNotes: nextPrivateNotes,
        homework: nextHomework,
        nextSessionPlan,
        journalStatus: toPrismaJournalStatus(nextJournalStatus),
      },
    });

    // 5. Optionally sync curriculum week progress on the classroom
    if (data.syncCurriculumWeek || nextJournalStatus === "completed") {
      const weekObj = await tx.curriculumWeek.findUnique({
        where: {
          classroomId_weekNumber: {
            classroomId: existing.classId,
            weekNumber: nextWeekNumber,
          },
        },
      });
      if (weekObj) {
        const weekUpdate: Prisma.CurriculumWeekUpdateInput = {};
        if (nextCompletionResult === "completed") {
          weekUpdate.status = "completed";
          weekUpdate.completedDate = newDate;
        } else if (nextCompletionResult === "partial") {
          weekUpdate.status = "in-progress";
        }
        if (nextGeneralNotes) {
          weekUpdate.notes = nextGeneralNotes;
        }
        if (nextHomework) {
          weekUpdate.homework = nextHomework;
        }
        if (Object.keys(weekUpdate).length > 0) {
          await tx.curriculumWeek.update({
            where: { id: weekObj.id },
            data: weekUpdate,
          });
        }
      }
    }

    await recalculateStudentAttendanceAndClassMetricsTx(
      tx,
      affectedStudentIds,
      [existing.classId],
    );

    return tx.teachingJournalEntry.findUniqueOrThrow({
      where: { id: existing.id },
      include: JOURNAL_ENTRY_INCLUDE,
    });
  });

  return mapPrismaTeachingJournalEntry(updatedRow);
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

  const matchingRows = await prisma.teachingJournalEntry.findMany({
    where: {
      studentEvaluations: {
        some: { studentId: validStudentId },
      },
    },
    include: JOURNAL_ENTRY_INCLUDE,
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
  });

  const matchingSessions = matchingRows
    .map(mapPrismaTeachingJournalEntry)
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
  healthScore: number;
  healthLevel: ClassHealthLevel;
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
  summaryMetrics: {
    totalAlerts: number;
    activeAlertsCount: number;
    highSeverityCount: number;
    mediumSeverityCount: number;
    resolvedAlertsCount: number;
    journalCompletionRate: number;
    onLeaveStudentsCount: number;
  };
  studentSpotlights: {
    topPerformers: StudentSpotlightItem[];
    atRiskStudents: StudentSpotlightItem[];
  };
}

export async function getClassPerformanceAnalytics(input?: {
  classId?: string;
  period?: string;
  programType?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<ClassPerformanceAnalyticsReport> {
  const [
    allClassrooms,
    allStudents,
    allClassSessions,
    ackRows,
    teacherSetting,
  ] = await Promise.all([
    classroomService.listAllClassrooms(true),
    studentService.listAllStudents({ status: "all" }),
    listClassSessions(),
    prisma.analyticsAlertAck.findMany(),
    prisma.teacherSetting.findUnique({
      where: { id: "default" },
      select: { lowAttendanceThresholdPercent: true },
    }),
  ]);

  const ackMap = new Map<string, AnalyticsAlertAckRecord>();
  for (const row of ackRows) {
    const mapped = mapPrismaAnalyticsAlertAck(row);
    ackMap.set(mapped.alertId, mapped);
  }

  let activeClasses = allClassrooms.filter((c) => c.status !== "archived");

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

  const activeStudents = allStudents.filter(
    (s) =>
      s.status !== "archived" && !s.deletedAt && classIdSet.has(s.classId),
  );
  // Miễn cảnh báo học vụ và phân tích rủi ro cho học viên đang bảo lưu (on-leave)
  const evaluatableStudents = activeStudents.filter(
    (s) => s.status !== "on-leave",
  );
  const onLeaveStudentsCount =
    activeStudents.length - evaluatableStudents.length;

  const getPublishedGrades = (stu: AdminStudentRecord) =>
    [...(stu.grades ?? [])]
      .filter((g) => (g.status ?? "published") !== "draft")
      .sort((a, b) =>
        parseGradeDateToIso(b.date).localeCompare(parseGradeDateToIso(a.date)),
      );

  let relevantSessions = allClassSessions.filter((s) =>
    classIdSet.has(s.classId),
  );

  const todayIso = toIsoDate(new Date());
  if (input?.fromDate || input?.toDate) {
    if (input.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(input.fromDate)) {
      const fromD = input.fromDate;
      relevantSessions = relevantSessions.filter((s) => s.date >= fromD);
    }
    if (input.toDate && /^\d{4}-\d{2}-\d{2}$/.test(input.toDate)) {
      const toD = input.toDate;
      relevantSessions = relevantSessions.filter((s) => s.date <= toD);
    }
  } else if (input?.period === "7d") {
    const cutoff7d = addDaysIso(todayIso, -7);
    relevantSessions = relevantSessions.filter((s) => s.date >= cutoff7d);
  } else if (input?.period === "30d") {
    const cutoff30d = addDaysIso(todayIso, -30);
    relevantSessions = relevantSessions.filter((s) => s.date >= cutoff30d);
  }

  const alerts: AnalyticsEarlyWarningAlert[] = [];
  const studentsWithActiveAlerts = new Set<string>();
  const studentAlertCounts = new Map<
    string,
    { active: number; high: number; reasons: string[] }
  >();

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
      const cur = studentAlertCounts.get(raw.studentId) ?? {
        active: 0,
        high: 0,
        reasons: [],
      };
      cur.active += 1;
      if (raw.severity === "high") cur.high += 1;
      cur.reasons.push(raw.metricLabel);
      studentAlertCounts.set(raw.studentId, cur);
    }
  };

  const lowAttendanceThreshold =
    teacherSetting?.lowAttendanceThresholdPercent ?? 90;
  const classroomById = new Map(allClassrooms.map((c) => [c.id, c]));

  const relevantSessionsDesc = [...relevantSessions].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const sessionsByStudentId = new Map<
    string,
    Array<{ date: string; topic: string; record: SessionStudentRecord }>
  >();
  const sessionsByClassId = new Map<string, ClassSessionRecord[]>();
  for (const ses of relevantSessionsDesc) {
    const clsList = sessionsByClassId.get(ses.classId);
    if (clsList) {
      clsList.push(ses);
    } else {
      sessionsByClassId.set(ses.classId, [ses]);
    }
    for (const rec of ses.studentRecords) {
      const stuList = sessionsByStudentId.get(rec.studentId);
      const entry = { date: ses.date, topic: ses.topic, record: rec };
      if (stuList) {
        stuList.push(entry);
      } else {
        sessionsByStudentId.set(rec.studentId, [entry]);
      }
    }
  }

  const activeStudentsByClassId = new Map<string, AdminStudentRecord[]>();
  for (const stu of activeStudents) {
    const list = activeStudentsByClassId.get(stu.classId);
    if (list) {
      list.push(stu);
    } else {
      activeStudentsByClassId.set(stu.classId, [stu]);
    }
  }

  const evalStudentsByClassId = new Map<string, AdminStudentRecord[]>();
  for (const stu of evaluatableStudents) {
    const list = evalStudentsByClassId.get(stu.classId);
    if (list) {
      list.push(stu);
    } else {
      evalStudentsByClassId.set(stu.classId, [stu]);
    }
  }

  // 1. Evaluate Student-Level Early-Warning Alerts (excluding on-leave students)
  for (const stu of evaluatableStudents) {
    const cls = classroomById.get(stu.classId);
    const classCode = cls?.code ?? "LỚP";

    const stuSessionRecords = sessionsByStudentId.get(stu.id) ?? [];

    // (a) Unexcused absences / consecutive absences
    let consecutiveAbsences = 0;
    for (const item of stuSessionRecords) {
      if (item.record.attendance === "absent") {
        consecutiveAbsences += 1;
      } else {
        break;
      }
    }
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
        severity: consecutiveAbsences >= 2 ? "high" : "medium",
        targetType: "student",
        classId: stu.classId,
        classCode,
        className: stu.className,
        studentId: stu.id,
        studentCode: stu.code,
        studentName: stu.fullName,
        title:
          consecutiveAbsences >= 2
            ? "Vắng học liên tiếp không phép"
            : "Cần kiểm tra tình hình học tập (Vắng không phép)",
        detail:
          consecutiveAbsences >= 2
            ? `Học sinh ${stu.fullName} đã vắng học không phép ${consecutiveAbsences} buổi liên tiếp (gần nhất: ${absentSessions[0]?.topic ?? "Buổi học định kỳ"}).`
            : `Học sinh ${stu.fullName} có buổi vắng học không phép gần đây (${absentSessions[0]?.topic ?? "Buổi học định kỳ"}).`,
        suggestion:
          "Liên hệ phụ huynh xác nhận lý do vắng và gửi tài liệu/video học bù trước buổi kế tiếp.",
        metricLabel:
          consecutiveAbsences >= 2
            ? `${consecutiveAbsences} buổi vắng liên tiếp`
            : `${absentSessions.length} buổi vắng`,
      });
    }

    // (b) Low attendance (< configured threshold, default 90%)
    const hasRecordedAttendance =
      (stu.attendanceHistory && stu.attendanceHistory.length > 0) ||
      stuSessionRecords.length > 0;
    if (hasRecordedAttendance && stu.attendanceRate < lowAttendanceThreshold) {
      registerAlert({
        alertId: `alert-low-att-${stu.id}`,
        type: "low-attendance",
        severity:
          stu.attendanceRate < Math.max(50, lowAttendanceThreshold - 10)
            ? "high"
            : "medium",
        targetType: "student",
        classId: stu.classId,
        classCode,
        className: stu.className,
        studentId: stu.id,
        studentCode: stu.code,
        studentName: stu.fullName,
        title: "Tỷ lệ chuyên cần thấp",
        detail: `Tỷ lệ tham gia buổi học của ${stu.fullName} đạt ${stu.attendanceRate}% (dưới mức khuyến nghị ${lowAttendanceThreshold}%).`,
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

    // (d) Consecutive score drop across PUBLISHED assessments only
    const pubGrades = getPublishedGrades(stu);
    if (pubGrades.length >= 2) {
      const latest = pubGrades[0];
      const previous = pubGrades[1];
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

    // (e) Skill below target band (PUBLISHED grades only)
    const targetBand = parseTargetBand(stu.targetGoal);
    if (targetBand && pubGrades.length > 0) {
      const latestGrade = pubGrades[0];
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
      const classStudentsAll = activeStudentsByClassId.get(cls.id) ?? [];
      const classStudentsEval = evalStudentsByClassId.get(cls.id) ?? [];
      const classSessions = sessionsByClassId.get(cls.id) ?? [];

      const studentsWithAtt = classStudentsEval.filter(
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

      // Average score from PUBLISHED grades only (or explicit averageScore > 0 when no draft override)
      const gradedStudents = classStudentsEval.filter(
        (s) => getPublishedGrades(s).length > 0 || s.averageScore > 0,
      );
      const averageScore =
        gradedStudents.length > 0
          ? Math.round(
              (gradedStudents.reduce((sum, s) => {
                const pubLatest = getPublishedGrades(s)[0]?.overall;
                return sum + (pubLatest ?? s.averageScore);
              }, 0) /
                gradedStudents.length) *
                10,
            ) / 10
          : null;

      const attentionStudentCount = classStudentsEval.filter((s) =>
        studentsWithActiveAlerts.has(s.id),
      ).length;

      const sessionsCompletedCount = classSessions.filter(
        (s) => s.journalStatus === "completed",
      ).length;

      const attentionRatio =
        classStudentsEval.length > 0
          ? attentionStudentCount / classStudentsEval.length
          : 0;
      const health = computeClassHealthScore({
        attendanceRate,
        homeworkRate,
        curriculumProgress,
        isBehindSchedule,
        averageScore,
        targetBand: cls.targetBand,
        attentionRatio,
      });

      return {
        classId: cls.id,
        classCode: cls.code,
        className: cls.name,
        level: cls.level,
        targetBand: cls.targetBand,
        enrolled: classStudentsAll.length,
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
        healthScore: health.score,
        healthLevel: health.level,
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
    evaluatableStudents.length > 0
      ? Math.round(
          (studentsNeedingAttentionCount / evaluatableStudents.length) * 100,
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

  // 4-Skill Averages & Trends across PUBLISHED grades of evaluatable students
  const gradedStudentsAll = evaluatableStudents.filter(
    (s) => getPublishedGrades(s).length > 0,
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
    const pubGrades = getPublishedGrades(stu);
    const latest = pubGrades[0];
    listeningSum += latest.listening;
    readingSum += latest.reading;
    writingSum += latest.writing;
    speakingSum += latest.speaking;
    overallSum += latest.overall;

    for (const g of pubGrades) {
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

  const assessmentTrends = Array.from(assessmentMap.values())
    .map((a) => ({
      assessmentTitle: a.assessmentTitle,
      date: a.date,
      listening: Math.round((a.l / a.count) * 10) / 10,
      reading: Math.round((a.r / a.count) * 10) / 10,
      writing: Math.round((a.w / a.count) * 10) / 10,
      speaking: Math.round((a.s / a.count) * 10) / 10,
      overall: Math.round((a.o / a.count) * 10) / 10,
    }))
    .sort((a, b) =>
      parseGradeDateToIso(a.date).localeCompare(parseGradeDateToIso(b.date)),
    );

  // 5. Build Student Spotlights (At-Risk & Top Performers)
  const classCodeById = new Map(filteredClasses.map((c) => [c.id, c.code]));
  const spotlightCandidates: StudentSpotlightItem[] = evaluatableStudents.map(
    (stu) => {
      const pubGrades = getPublishedGrades(stu);
      const latestOverall =
        pubGrades[0]?.overall ??
        (stu.averageScore > 0 ? stu.averageScore : null);
      const prevOverall = pubGrades[1]?.overall ?? null;
      const bandDelta =
        latestOverall !== null && prevOverall !== null
          ? Math.round((latestOverall - prevOverall) * 10) / 10
          : null;
      const alertInfo = studentAlertCounts.get(stu.id) ?? {
        active: 0,
        high: 0,
        reasons: [],
      };
      const highlightReason =
        alertInfo.reasons.length > 0
          ? alertInfo.reasons.slice(0, 2).join(" · ")
          : bandDelta !== null && bandDelta > 0
            ? `Tăng +${bandDelta.toFixed(1)} band`
            : latestOverall !== null
              ? `Overall ${latestOverall.toFixed(1)} · CC ${stu.attendanceRate}%`
              : `Chuyên cần ${stu.attendanceRate}%`;

      return {
        studentId: stu.id,
        studentCode: stu.code,
        studentName: stu.fullName,
        classId: stu.classId,
        classCode: classCodeById.get(stu.classId) ?? "LỚP",
        className: stu.className,
        status: stu.status,
        attendanceRate: stu.attendanceRate,
        latestOverall,
        bandDelta,
        activeAlertCount: alertInfo.active,
        highAlertCount: alertInfo.high,
        highlightReason,
      };
    },
  );

  const atRiskStudents = spotlightCandidates
    .filter(
      (item) =>
        item.activeAlertCount >= 1 ||
        item.attendanceRate < lowAttendanceThreshold,
    )
    .sort(
      (a, b) =>
        b.highAlertCount - a.highAlertCount ||
        b.activeAlertCount - a.activeAlertCount ||
        a.attendanceRate - b.attendanceRate,
    )
    .slice(0, 6);

  const topPerformers = spotlightCandidates
    .filter(
      (item) =>
        item.highAlertCount === 0 &&
        ((item.latestOverall !== null && item.latestOverall >= 7.0) ||
          (item.bandDelta !== null && item.bandDelta >= 0.5)),
    )
    .sort(
      (a, b) =>
        (b.latestOverall ?? 0) - (a.latestOverall ?? 0) ||
        (b.bandDelta ?? 0) - (a.bandDelta ?? 0) ||
        b.attendanceRate - a.attendanceRate,
    )
    .slice(0, 6);

  // 6. Summary Metrics
  const unresolvedAlerts = alerts.filter((a) => a.ackStatus !== "resolved");
  const completedJournalsCount = relevantSessions.filter(
    (s) => s.journalStatus === "completed",
  ).length;
  const journalCompletionRate =
    relevantSessions.length > 0
      ? Math.round((completedJournalsCount / relevantSessions.length) * 100)
      : 0;

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
    summaryMetrics: {
      totalAlerts: alerts.length,
      activeAlertsCount: unresolvedAlerts.length,
      highSeverityCount: unresolvedAlerts.filter((a) => a.severity === "high")
        .length,
      mediumSeverityCount: unresolvedAlerts.filter(
        (a) => a.severity === "medium",
      ).length,
      resolvedAlertsCount: alerts.length - unresolvedAlerts.length,
      journalCompletionRate,
      onLeaveStudentsCount,
    },
    studentSpotlights: {
      topPerformers,
      atRiskStudents,
    },
  };
}

export async function updateAnalyticsAlertStatus(
  input: unknown,
): Promise<AnalyticsAlertAckRecord> {
  const data = validate(updateAlertAckSchema, input);

  const saved = await prisma.analyticsAlertAck.upsert({
    where: { alertId: data.alertId },
    update: {
      status: data.status,
      note: data.note ?? null,
    },
    create: {
      alertId: data.alertId,
      status: data.status,
      note: data.note ?? null,
    },
  });

  return mapPrismaAnalyticsAlertAck(saved);
}

const batchAlertAckSchema = z.object({
  alertIds: z.array(idSchema).min(1).max(100),
  status: z.enum(["active", "acknowledged", "resolved"]),
  note: z.string().trim().max(500).optional(),
});

export async function batchUpdateAnalyticsAlertStatus(input: unknown): Promise<{
  updatedCount: number;
  records: AnalyticsAlertAckRecord[];
}> {
  const data = validate(batchAlertAckSchema, input);

  const savedRows = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const alertId of data.alertIds) {
      const row = await tx.analyticsAlertAck.upsert({
        where: { alertId },
        update: {
          status: data.status,
          note: data.note ?? null,
        },
        create: {
          alertId,
          status: data.status,
          note: data.note ?? null,
        },
      });
      results.push(row);
    }
    return results;
  });

  const records = savedRows.map(mapPrismaAnalyticsAlertAck);
  return { updatedCount: records.length, records };
}

const restoreRevisionInputSchema = z.object({
  revisionId: idSchema,
});

export async function deleteClassSession(
  id: unknown,
): Promise<{ deleted: true; id: string }> {
  const validId = validate(idSchema, id);

  const existingRow = await prisma.teachingJournalEntry.findUnique({
    where: { id: validId },
    include: {
      studentEvaluations: { select: { studentId: true } },
      attendanceRecords: { select: { studentId: true } },
    },
  });
  if (!existingRow) {
    throw new NotFoundError("ClassSession", validId);
  }

  await prisma.$transaction(async (tx) => {
    const linkedAttendances = await tx.attendanceRecord.findMany({
      where: {
        OR: [{ teachingJournalEntryId: validId }, { sessionId: validId }],
      },
      select: { studentId: true },
    });

    const affectedStudentIds = new Set<string>();
    for (const ev of existingRow.studentEvaluations) {
      affectedStudentIds.add(ev.studentId);
    }
    for (const att of existingRow.attendanceRecords) {
      affectedStudentIds.add(att.studentId);
    }
    for (const att of linkedAttendances) {
      affectedStudentIds.add(att.studentId);
    }

    await tx.attendanceRecord.deleteMany({
      where: {
        OR: [{ teachingJournalEntryId: validId }, { sessionId: validId }],
      },
    });

    await tx.teachingJournalEntry.delete({
      where: { id: validId },
    });

    if (existingRow.weekNumber) {
      const weekObj = await tx.curriculumWeek.findUnique({
        where: {
          classroomId_weekNumber: {
            classroomId: existingRow.classroomId,
            weekNumber: existingRow.weekNumber,
          },
        },
      });
      if (
        weekObj &&
        weekObj.status === "completed" &&
        weekObj.completedDate === existingRow.date
      ) {
        const hasOtherCompleted = await tx.teachingJournalEntry.count({
          where: {
            classroomId: existingRow.classroomId,
            weekNumber: existingRow.weekNumber,
            completionResult: "completed",
          },
        });
        if (hasOtherCompleted === 0) {
          await tx.curriculumWeek.update({
            where: { id: weekObj.id },
            data: {
              status: "in-progress",
              completedDate: null,
            },
          });
        }
      }
    }

    await recalculateStudentAttendanceAndClassMetricsTx(
      tx,
      affectedStudentIds,
      [existingRow.classroomId],
    );
  });

  return { deleted: true, id: validId };
}

export async function restoreJournalRevision(
  sessionId: unknown,
  input: unknown,
): Promise<ClassSessionRecord> {
  const validId = validate(idSchema, sessionId);
  const data = validate(restoreRevisionInputSchema, input);

  const existingRow = await prisma.teachingJournalEntry.findUnique({
    where: { id: validId },
    include: JOURNAL_ENTRY_INCLUDE,
  });
  if (!existingRow) {
    throw new NotFoundError("ClassSession", validId);
  }
  const existing = mapPrismaTeachingJournalEntry(existingRow);

  const targetRev = existing.revisions.find((r) => r.id === data.revisionId);
  if (!targetRev) {
    throw new NotFoundError("JournalRevision", data.revisionId);
  }

  const updatedRow = await prisma.$transaction(async (tx) => {
    const latestRevTime = existingRow.revisions[0]?.createdAt.getTime() ?? 0;
    const nextRevCreatedAt = new Date(
      Math.max(Date.now(), latestRevTime + 1),
    );

    await tx.journalRevisionLog.create({
      data: {
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        entryId: existing.id,
        summary: `Khôi phục về phiên bản (${targetRev.updatedAt})`,
        previousTopic: existing.topic,
        previousObjectives: existing.objectives,
        previousNotes: existing.generalNotes,
        previousHomework: existing.homework,
        previousNextSessionPlan: existing.nextSessionPlan,
        previousCompletionResult: toPrismaCompletionResult(
          existing.completionResult,
        ),
        createdAt: nextRevCreatedAt,
      },
    });

    const allRevs = await tx.journalRevisionLog.findMany({
      where: { entryId: existing.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (allRevs.length > MAX_JOURNAL_REVISIONS) {
      const overflowIds = allRevs
        .slice(MAX_JOURNAL_REVISIONS)
        .map((r) => r.id);
      await tx.journalRevisionLog.deleteMany({
        where: { id: { in: overflowIds } },
      });
    }

    return tx.teachingJournalEntry.update({
      where: { id: existing.id },
      data: {
        topic: targetRev.previousTopic || existing.topic,
        objectives: targetRev.previousObjectives ?? existing.objectives,
        generalNotes: targetRev.previousNotes,
        homework: targetRev.previousHomework ?? existing.homework,
        nextSessionPlan:
          targetRev.previousNextSessionPlan ?? existing.nextSessionPlan,
        completionResult: toPrismaCompletionResult(
          targetRev.previousCompletionResult,
        ),
      },
      include: JOURNAL_ENTRY_INCLUDE,
    });
  });

  return mapPrismaTeachingJournalEntry(updatedRow);
}

export async function addSessionAttachment(
  sessionId: unknown,
  attachmentInput: unknown,
): Promise<ClassSessionRecord> {
  const validId = validate(idSchema, sessionId);
  const att = validate(sessionAttachmentSchema, attachmentInput);

  const existingRow = await prisma.teachingJournalEntry.findUnique({
    where: { id: validId },
    select: { id: true },
  });
  if (!existingRow) {
    throw new NotFoundError("ClassSession", validId);
  }

  const updatedRow = await prisma.$transaction(async (tx) => {
    await tx.sessionAttachmentFile.deleteMany({
      where: {
        entryId: validId,
        OR: [
          { id: att.id },
          ...(att.storedFileId ? [{ storedFileId: att.storedFileId }] : []),
        ],
      },
    });

    let validStoredId: string | null = null;
    if (att.storedFileId) {
      const sf = await tx.storedFile.findUnique({
        where: { id: att.storedFileId },
        select: { id: true },
      });
      if (sf) validStoredId = sf.id;
    }

    await tx.sessionAttachmentFile.create({
      data: {
        id: att.id,
        entryId: validId,
        storedFileId: validStoredId,
        name: att.name,
        fileType: att.type,
        size: att.size,
        url: att.url ?? null,
      },
    });

    return tx.teachingJournalEntry.update({
      where: { id: validId },
      data: { updatedAt: new Date() },
      include: JOURNAL_ENTRY_INCLUDE,
    });
  });

  return mapPrismaTeachingJournalEntry(updatedRow);
}

export async function getPendingSessionsFromSchedule(
  daysBackInput = 7,
): Promise<PendingScheduleJournalItem[]> {
  const daysBack = Number.isFinite(daysBackInput)
    ? Math.min(Math.max(Math.trunc(daysBackInput), 1), 60)
    : 7;

  const todayIso = toIsoDate(new Date());
  const fromDate = addDaysIso(todayIso, -(daysBack - 1));

  const [sessionRows, exceptionRows, classrooms, students, classSessions] =
    await Promise.all([
      prisma.classSession.findMany({
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      prisma.scheduleException.findMany({
        include: {
          classroom: {
            select: { id: true, code: true, name: true, level: true },
          },
        },
        orderBy: { originalDate: "asc" },
      }),
      classroomService.listAllClassrooms(true),
      studentService.listAllStudents({ status: "all" }),
      listClassSessions(),
    ]);

  const sessions = sessionRows.map(mapPrismaWeeklySession);
  const exceptions = exceptionRows.map(mapPrismaScheduleException);

  const occurrences = resolveScheduleOccurrences({
    fromDate,
    toDate: todayIso,
    sessions,
    exceptions,
    classes: classrooms,
    students,
    classSessions,
    includeInactiveClasses: false,
    todayIso,
  });

  const classroomById = new Map(classrooms.map((c) => [c.id, c]));

  return occurrences
    .filter((occ) => occ.status !== "canceled" && !occ.classSessionId)
    .map((occ) => {
      const cls = classroomById.get(occ.classId);
      const matchedWeek = cls?.curriculum?.find(
        (w) => w.weekNumber === occ.weekNumber,
      );
      return {
        occurrenceKey: occ.occurrenceKey,
        classId: occ.classId,
        classCode: occ.classCode,
        className: occ.className,
        date: occ.date,
        dayLabel: occ.dayLabel,
        startTime: occ.startTime,
        endTime: occ.endTime,
        room: occ.room,
        weekNumber: occ.weekNumber,
        topic: matchedWeek?.title || occ.topic,
        source: occ.source === "recurring" ? "weekly" : occ.source,
        scheduleExceptionId: occ.exceptionId,
      } satisfies PendingScheduleJournalItem;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.startTime.localeCompare(a.startTime);
    });
}
