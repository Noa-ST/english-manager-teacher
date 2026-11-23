import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";

import {
  computeConsecutiveAbsences,
  formatAttendanceDateVi,
  normalizeHistoryDateToIso,
  type AttendanceMatrixColumn,
  type AttendanceMatrixRow,
  type AttendanceSnapshotResult,
  type AttendanceStatusValue,
  type ClassAttendanceMatrixReport,
  type DayScheduleOccurrenceOption,
  type PendingAttendanceItem,
} from "./attendance-helpers";
import * as classroomService from "./classroom.service";
import { createAnnouncement } from "./cms.service";
import { idSchema, validate } from "./common";
import type {
  ClassSessionRecord,
  ResolvedScheduleOccurrence,
  ScheduleException,
  WeeklyClassSession,
} from "./domain-types";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import {
  mapPrismaScheduleException,
  mapPrismaTeachingJournalEntry,
  mapPrismaWeeklySession,
} from "./prisma-mappers";
import {
  addDaysIso,
  computeScheduleRangeKpis,
  formatDisplayDateVi,
  getDayLabelVi,
  getDayOfWeekIso,
  resolveScheduleOccurrences,
  toIsoDate,
  type ScheduleRangeKpis,
} from "./schedule-calendar-helpers";
import {
  evaluateWeeklySessionConflict,
  formatSessionsToScheduleSummary,
  isTimeOverlapping,
  normalizeRoomKey,
  recomputeWeeklySessionConflicts,
} from "./schedule-helper";
import * as studentService from "./student.service";
import * as teachingJournalService from "./teaching-journal.service";
import {
  JOURNAL_ENTRY_INCLUDE,
  recalculateStudentAttendanceAndClassMetricsTx,
} from "./teaching-journal.service";

/**
 * Schedule service — teaching sessions (Ca học), enrolment and quick
 * attendance (SRS 3.2 "Quản lý Lịch dạy"), plus the weekly timeline shown
 * on the viewer dashboard (SRS 3.1).
 */

const DAY_LABELS: Record<number, string> = {
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
  7: "Chủ Nhật",
};

// ---------------------------------------------------------------- Contracts

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

const isoDateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải theo định dạng YYYY-MM-DD");

export const createClassSessionSchema = z
  .object({
    classCode: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(120).optional(),
    /** 1 = Monday … 7 = Sunday */
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    startTime: timeOfDay,
    endTime: timeOfDay,
    room: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .default("Phòng 302 · Cơ sở Nguyễn Du"),
    topic: z.string().trim().min(1).max(240),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: "Giờ kết thúc phải sau giờ bắt đầu",
    path: ["endTime"],
  });
export type CreateClassSessionInput = z.infer<typeof createClassSessionSchema>;

export const updateClassSessionSchema = z.object({
  classCode: z.string().trim().min(1).max(32).optional(),
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
  startTime: timeOfDay.optional(),
  endTime: timeOfDay.optional(),
  room: z.string().trim().min(1).max(120).optional(),
  topic: z.string().trim().min(1).max(240).optional(),
  status: z.enum(["upcoming", "ongoing", "completed"]).optional(),
});
export type UpdateClassSessionInput = z.infer<typeof updateClassSessionSchema>;

export const createScheduleExceptionSchema = z.object({
  type: z.enum(["canceled", "rescheduled", "makeup"]),
  originalSessionId: z.string().trim().optional(),
  classId: z.string().trim().optional(),
  classCode: z.string().trim().optional(),
  originalDate: isoDateString,
  newDate: isoDateString.optional(),
  startTime: timeOfDay.optional(),
  endTime: timeOfDay.optional(),
  room: z.string().trim().max(160).optional(),
  topic: z.string().trim().max(240).optional(),
  reason: z
    .string()
    .trim()
    .min(2, "Vui lòng nhập lý do thay đổi lịch (tối thiểu 2 ký tự).")
    .max(500),
  notifyStudents: z.boolean().optional().default(false),
});
export type CreateScheduleExceptionInput = z.input<
  typeof createScheduleExceptionSchema
>;

export const calendarRangeQuerySchema = z.object({
  fromDate: isoDateString,
  toDate: isoDateString,
  classCode: z.string().trim().optional(),
  room: z.string().trim().optional(),
  todayIso: isoDateString.optional(),
});

export const enrollStudentsSchema = z.object({
  sessionId: idSchema,
  studentIds: z.array(idSchema).min(1).max(200),
});
export type EnrollStudentsInput = z.infer<typeof enrollStudentsSchema>;

export const recordAttendanceSchema = z.object({
  sessionId: idSchema,
  classId: idSchema.optional(),
  scheduleExceptionId: z.string().trim().max(120).optional(),
  /** Calendar date of the lesson (YYYY-MM-DD). */
  date: isoDateString,
  entries: z
    .array(
      z.object({
        studentId: idSchema,
        status: z.enum(["present", "absent", "late", "excused"]),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .min(1),
});
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;

export const weekQuerySchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(7).optional(),
  classCode: z.string().trim().optional(),
  room: z.string().trim().optional(),
});

export type ClassSessionSummary = WeeklyClassSession;

// --------------------------------------------------------------- Operations

/**
 * Dynamically refreshes enrolledCount, capacity, className, level and conflict flags
 * on ClassSession rows from live classrooms & students in PostgreSQL.
 */
async function hydrateWeeklySessionsFromDb(): Promise<{
  sessions: WeeklyClassSession[];
  inactiveClassCodes: Set<string>;
}> {
  const [sessionRows, classroomRows, activeStudentRows] = await Promise.all([
    prisma.classSession.findMany({
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    prisma.classroom.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        capacity: true,
        status: true,
      },
    }),
    prisma.student.findMany({
      where: {
        status: { not: "archived" },
        deletedAt: null,
      },
      select: { classroomId: true },
    }),
  ]);

  const enrolledByClassId = new Map<string, number>();
  for (const stu of activeStudentRows) {
    enrolledByClassId.set(
      stu.classroomId,
      (enrolledByClassId.get(stu.classroomId) ?? 0) + 1,
    );
  }

  // Prefer active classrooms when mapping by code
  const classByCode = new Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      level: string;
      capacity: number;
      status: string;
    }
  >();
  for (const cls of classroomRows) {
    const key = cls.code.toUpperCase();
    const existing = classByCode.get(key);
    if (!existing || existing.status === "archived") {
      classByCode.set(key, cls);
    }
  }

  const inactiveClassCodes = new Set<string>();
  for (const [code, cls] of classByCode.entries()) {
    if (cls.status === "archived" || cls.status === "completed") {
      inactiveClassCodes.add(code);
    }
  }

  const originalById = new Map(sessionRows.map((r) => [r.id, r]));
  const sessions = sessionRows.map((row) => {
    const mapped = mapPrismaWeeklySession(row);
    const cls = classByCode.get(mapped.classCode.toUpperCase());
    if (cls) {
      mapped.className = cls.name;
      mapped.level = cls.level;
      mapped.capacity = cls.capacity;
      mapped.enrolledCount = enrolledByClassId.get(cls.id) ?? 0;
    }
    return mapped;
  });

  recomputeWeeklySessionConflicts(sessions);

  const dbUpdates: Promise<unknown>[] = [];
  for (const ses of sessions) {
    const orig = originalById.get(ses.id);
    if (!orig) continue;
    const nextConflict = Boolean(ses.hasConflict);
    if (
      orig.hasConflict !== nextConflict ||
      orig.enrolledCount !== ses.enrolledCount ||
      orig.capacity !== ses.capacity ||
      orig.className !== ses.className ||
      orig.level !== ses.level
    ) {
      dbUpdates.push(
        prisma.classSession.update({
          where: { id: ses.id },
          data: {
            hasConflict: nextConflict,
            enrolledCount: ses.enrolledCount,
            capacity: ses.capacity,
            className: ses.className,
            level: ses.level,
          },
        }),
      );
    }
  }
  if (dbUpdates.length > 0) {
    await Promise.all(dbUpdates);
  }

  return { sessions, inactiveClassCodes };
}

export async function listWeeklySchedule(
  input?: unknown,
): Promise<WeeklyClassSession[]> {
  const query = validate(weekQuerySchema, input ?? {});
  const { sessions, inactiveClassCodes } = await hydrateWeeklySessionsFromDb();

  let list = sessions.filter(
    (s) => !inactiveClassCodes.has(s.classCode.toUpperCase()),
  );

  if (query.dayOfWeek && query.dayOfWeek > 0) {
    list = list.filter((s) => s.dayOfWeek === query.dayOfWeek);
  }
  if (query.classCode && query.classCode !== "all") {
    const targetCode = query.classCode.trim().toUpperCase();
    list = list.filter((s) => s.classCode.toUpperCase() === targetCode);
  }
  if (query.room && query.room !== "all") {
    const targetRoomKey = normalizeRoomKey(query.room);
    list = list.filter((s) => normalizeRoomKey(s.room) === targetRoomKey);
  }

  return [...list].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });
}

export async function createClassSession(
  input: unknown,
): Promise<WeeklyClassSession> {
  const data = validate(createClassSessionSchema, input);

  const classrooms = await classroomService.listAllClassrooms(true);
  const targetClass =
    classrooms.find(
      (c) =>
        c.status !== "archived" &&
        c.code.toUpperCase() === data.classCode.trim().toUpperCase(),
    ) ??
    classrooms.find(
      (c) => c.code.toUpperCase() === data.classCode.trim().toUpperCase(),
    );

  if (!targetClass) {
    throw new NotFoundError("Classroom", data.classCode);
  }
  if (targetClass.status === "archived" || targetClass.status === "completed") {
    throw new ValidationError(
      `Không thể xếp ca dạy cho lớp "${targetClass.code}" đã kết thúc hoặc đã lưu trữ.`,
    );
  }

  const { sessions } = await hydrateWeeklySessionsFromDb();

  const conflict = evaluateWeeklySessionConflict(
    {
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      room: data.room,
      classCode: targetClass.code,
    },
    sessions,
  );
  if (conflict.hasConflict) {
    throw new ConflictError(
      conflict.message ?? "Khung giờ hoặc phòng học đã có ca dạy trùng lịch.",
    );
  }

  const newSessionId = `ses-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await prisma.$transaction(async (tx) => {
    await tx.classSession.create({
      data: {
        id: newSessionId,
        classroomId: targetClass.id,
        classCode: targetClass.code,
        className: data.name ?? targetClass.name,
        level: targetClass.level,
        dayOfWeek: data.dayOfWeek,
        dayLabel: DAY_LABELS[data.dayOfWeek] ?? "Thứ Bảy",
        startTime: data.startTime,
        endTime: data.endTime,
        room: data.room,
        topic: data.topic,
        enrolledCount: targetClass.enrolled,
        capacity: targetClass.capacity,
        status: "upcoming",
        hasConflict: false,
      },
    });

    const classSessionRows = await tx.classSession.findMany({
      where: {
        classCode: { equals: targetClass.code, mode: "insensitive" },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    const nextSummary = formatSessionsToScheduleSummary(
      classSessionRows.map(mapPrismaWeeklySession),
    );
    await tx.classroom.update({
      where: { id: targetClass.id },
      data: { scheduleSummary: nextSummary },
    });
  });

  const refreshed = await hydrateWeeklySessionsFromDb();
  const created = refreshed.sessions.find((s) => s.id === newSessionId);
  if (!created) {
    throw new NotFoundError("ClassSession", newSessionId);
  }
  return created;
}

export async function updateClassSession(
  id: unknown,
  input: unknown,
): Promise<WeeklyClassSession> {
  const validId = validate(idSchema, id);
  const data = validate(updateClassSessionSchema, input);

  const { sessions } = await hydrateWeeklySessionsFromDb();
  const existing = sessions.find((s) => s.id === validId);
  if (!existing) {
    throw new NotFoundError("ClassSession", validId);
  }

  const oldClassCode = existing.classCode;
  const nextClassCode = data.classCode
    ? data.classCode.trim().toUpperCase()
    : existing.classCode;

  const classrooms = await classroomService.listAllClassrooms(true);
  const targetClass =
    classrooms.find(
      (c) =>
        c.status !== "archived" &&
        c.code.toUpperCase() === nextClassCode.toUpperCase(),
    ) ??
    classrooms.find((c) => c.code.toUpperCase() === nextClassCode.toUpperCase());

  if (!targetClass) {
    throw new NotFoundError("Classroom", nextClassCode);
  }
  if (targetClass.status === "archived" || targetClass.status === "completed") {
    throw new ValidationError(
      `Không thể chuyển ca dạy sang lớp "${targetClass.code}" đã kết thúc hoặc đã lưu trữ.`,
    );
  }

  const nextDayOfWeek = data.dayOfWeek ?? existing.dayOfWeek;
  const nextStartTime = data.startTime ?? existing.startTime;
  const nextEndTime = data.endTime ?? existing.endTime;
  const nextRoom = data.room ?? existing.room;
  const nextTopic = data.topic ?? existing.topic;
  const nextStatus = data.status ?? existing.status;

  if (nextStartTime >= nextEndTime) {
    throw new ValidationError("Giờ kết thúc phải sau giờ bắt đầu");
  }

  const conflict = evaluateWeeklySessionConflict(
    {
      dayOfWeek: nextDayOfWeek,
      startTime: nextStartTime,
      endTime: nextEndTime,
      room: nextRoom,
      classCode: targetClass.code,
    },
    sessions,
    existing.id,
  );
  if (conflict.hasConflict) {
    throw new ConflictError(
      conflict.message ?? "Khung giờ hoặc phòng học đã có ca dạy trùng lịch.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.classSession.update({
      where: { id: validId },
      data: {
        classroomId: targetClass.id,
        classCode: targetClass.code,
        className: targetClass.name,
        level: targetClass.level,
        dayOfWeek: nextDayOfWeek,
        dayLabel: DAY_LABELS[nextDayOfWeek] ?? existing.dayLabel,
        startTime: nextStartTime,
        endTime: nextEndTime,
        room: nextRoom,
        topic: nextTopic,
        status: nextStatus,
        hasConflict: false,
      },
    });

    const codesToSync = new Set([
      oldClassCode.toUpperCase(),
      targetClass.code.toUpperCase(),
    ]);
    for (const code of codesToSync) {
      const cls =
        classrooms.find(
          (c) => c.status !== "archived" && c.code.toUpperCase() === code,
        ) ?? classrooms.find((c) => c.code.toUpperCase() === code);
      if (cls) {
        const clsSessions = await tx.classSession.findMany({
          where: { classCode: { equals: code, mode: "insensitive" } },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        });
        await tx.classroom.update({
          where: { id: cls.id },
          data: {
            scheduleSummary: formatSessionsToScheduleSummary(
              clsSessions.map(mapPrismaWeeklySession),
            ),
          },
        });
      }
    }
  });

  const refreshed = await hydrateWeeklySessionsFromDb();
  return (
    refreshed.sessions.find((s) => s.id === validId) ?? {
      ...existing,
      classCode: targetClass.code,
      className: targetClass.name,
      level: targetClass.level,
      dayOfWeek: nextDayOfWeek,
      dayLabel: DAY_LABELS[nextDayOfWeek] ?? existing.dayLabel,
      startTime: nextStartTime,
      endTime: nextEndTime,
      room: nextRoom,
      topic: nextTopic,
      status: nextStatus,
      hasConflict: false,
    }
  );
}

export async function deleteClassSession(id: string): Promise<boolean> {
  const existing = await prisma.classSession.findUnique({
    where: { id },
  });
  if (!existing) return false;

  await prisma.$transaction(async (tx) => {
    await tx.classSession.delete({ where: { id } });

    const targetClass = await tx.classroom.findFirst({
      where: {
        code: { equals: existing.classCode, mode: "insensitive" },
      },
      orderBy: { status: "asc" },
    });
    if (targetClass) {
      const classSessions = await tx.classSession.findMany({
        where: {
          classCode: { equals: targetClass.code, mode: "insensitive" },
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });
      await tx.classroom.update({
        where: { id: targetClass.id },
        data: {
          scheduleSummary: formatSessionsToScheduleSummary(
            classSessions.map(mapPrismaWeeklySession),
          ),
        },
      });
    }
  });

  await hydrateWeeklySessionsFromDb();
  return true;
}

export async function listScheduleExceptions(query?: {
  classId?: string;
  classCode?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<ScheduleException[]> {
  const rows = await prisma.scheduleException.findMany({
    include: {
      classroom: {
        select: { id: true, code: true, name: true, level: true },
      },
    },
    orderBy: { originalDate: "asc" },
  });

  return rows
    .map(mapPrismaScheduleException)
    .filter((exc) => {
      if (query?.classId && exc.classId !== query.classId) return false;
      if (
        query?.classCode &&
        exc.classCode.toUpperCase() !== query.classCode.trim().toUpperCase()
      ) {
        return false;
      }
      const effectiveDate = exc.newDate || exc.originalDate;
      if (
        query?.fromDate &&
        effectiveDate < query.fromDate &&
        exc.originalDate < query.fromDate
      ) {
        return false;
      }
      if (
        query?.toDate &&
        effectiveDate > query.toDate &&
        exc.originalDate > query.toDate
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.originalDate.localeCompare(b.originalDate));
}

export async function createScheduleException(
  input: unknown,
): Promise<ScheduleException> {
  const data = validate(createScheduleExceptionSchema, input);

  const origSession = data.originalSessionId
    ? await prisma.classSession.findUnique({
        where: { id: data.originalSessionId },
      })
    : null;
  if (data.originalSessionId && !origSession) {
    throw new NotFoundError("ClassSession", data.originalSessionId);
  }

  const classrooms = await classroomService.listAllClassrooms(true);
  const targetClass = classrooms.find((c) => {
    if (data.classId && c.id === data.classId) return true;
    const codeLookup = data.classCode || origSession?.classCode;
    return Boolean(
      codeLookup && c.code.toUpperCase() === codeLookup.trim().toUpperCase(),
    );
  });
  if (!targetClass) {
    throw new NotFoundError(
      "Classroom",
      data.classId || data.classCode || origSession?.classCode || "unknown",
    );
  }
  if (targetClass.status === "archived" || targetClass.status === "completed") {
    throw new ValidationError(
      `Không thể điều chỉnh lịch cho lớp "${targetClass.code}" đã kết thúc hoặc đã lưu trữ.`,
    );
  }

  const allExceptions = await listScheduleExceptions();

  // Prevent duplicate override on same recurring occurrence
  if (data.type === "canceled" || data.type === "rescheduled") {
    const duplicate = allExceptions.find((exc) => {
      if (exc.type !== "canceled" && exc.type !== "rescheduled") return false;
      if (exc.originalDate !== data.originalDate) return false;
      if (data.originalSessionId && exc.originalSessionId) {
        return exc.originalSessionId === data.originalSessionId;
      }
      return exc.classCode.toUpperCase() === targetClass.code.toUpperCase();
    });
    if (duplicate) {
      throw new ConflictError(
        `Buổi học ngày ${formatDisplayDateVi(data.originalDate)} của lớp ${targetClass.code} đã được ghi nhận ngoại lệ lịch trước đó.`,
      );
    }
  }

  const resolvedStart = data.startTime ?? origSession?.startTime ?? "18:00";
  const resolvedEnd = data.endTime ?? origSession?.endTime ?? "20:00";
  const resolvedRoom =
    data.room?.trim() || origSession?.room || targetClass.room;
  const resolvedTopic =
    data.topic?.trim() || origSession?.topic || targetClass.currentModule;

  if (data.type === "rescheduled" || data.type === "makeup") {
    if (resolvedStart >= resolvedEnd) {
      throw new ValidationError("Giờ kết thúc phải sau giờ bắt đầu");
    }
    if (data.type === "rescheduled" && !data.newDate) {
      throw new ValidationError("Vui lòng chọn ngày học mới khi dời buổi.");
    }
    const destDate = data.newDate || data.originalDate;

    const { sessions } = await hydrateWeeklySessionsFromDb();

    const existingOnDestDate = resolveScheduleOccurrences({
      fromDate: destDate,
      toDate: destDate,
      sessions,
      exceptions: allExceptions,
      classes: classrooms,
    }).filter((occ) => {
      if (occ.status === "canceled") return false;
      if (
        data.type === "rescheduled" &&
        destDate === data.originalDate &&
        origSession &&
        occ.recurringSessionId === origSession.id
      ) {
        return false;
      }
      return true;
    });

    const overlap = existingOnDestDate.find((occ) =>
      isTimeOverlapping(occ.startTime, occ.endTime, resolvedStart, resolvedEnd),
    );
    if (overlap) {
      const sameRoom =
        normalizeRoomKey(resolvedRoom) !== "" &&
        normalizeRoomKey(overlap.room) === normalizeRoomKey(resolvedRoom);
      throw new ConflictError(
        sameRoom
          ? `Xung đột phòng học ngày ${formatDisplayDateVi(destDate)}: "${resolvedRoom.split("·")[0].trim()}" đã có ca ${overlap.classCode} (${overlap.startTime} – ${overlap.endTime}).`
          : `Trùng giờ dạy giáo viên ngày ${formatDisplayDateVi(destDate)}: Đã có ca ${overlap.classCode} (${overlap.startTime} – ${overlap.endTime}) tại ${overlap.room.split("·")[0].trim()}.`,
      );
    }
  }

  let announcementId: string | undefined;
  if (data.notifyStudents) {
    const destDate = data.newDate || data.originalDate;
    const origDisplay = formatDisplayDateVi(data.originalDate);
    const destDisplay = formatDisplayDateVi(destDate);
    const destDow = getDayLabelVi(getDayOfWeekIso(destDate));
    const roomShort = resolvedRoom.split("·")[0].trim();

    let title = "";
    let body = "";
    if (data.type === "canceled") {
      title = `[${targetClass.code}] Thông báo nghỉ buổi học ngày ${origDisplay}`;
      body = `Buổi học lớp ${targetClass.name} ngày ${origDisplay} (${resolvedStart}–${resolvedEnd}) tạm nghỉ. Lý do: ${data.reason}.`;
    } else if (data.type === "rescheduled") {
      title = `[${targetClass.code}] Thông báo dời lịch buổi ${origDisplay} sang ${destDisplay}`;
      body = `Buổi học ngày ${origDisplay} của lớp ${targetClass.name} được dời sang ${destDow}, ngày ${destDisplay} (${resolvedStart}–${resolvedEnd}) tại ${roomShort}. Lý do: ${data.reason}.`;
    } else {
      title = `[${targetClass.code}] Thông báo lịch học bù ngày ${destDisplay}`;
      body = `Lớp ${targetClass.name} có thêm buổi dạy bù vào ${destDow}, ngày ${destDisplay} (${resolvedStart}–${resolvedEnd}) tại ${roomShort}. Nội dung: ${resolvedTopic}. Ghi chú: ${data.reason}.`;
    }

    const ann = await createAnnouncement({
      title,
      excerpt: body,
      content: [body],
      category: "schedule",
      isPinned: true,
      targetClasses: [targetClass.name],
      status: "published",
    });
    announcementId = ann.id;
  }

  const resolvedNewDate = data.newDate
    ? data.newDate
    : data.type === "makeup"
      ? data.originalDate
      : null;

  const createdRow = await prisma.scheduleException.create({
    data: {
      id: `exc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: data.type,
      originalSessionId: origSession ? origSession.id : null,
      classroomId: targetClass.id,
      originalDate: data.originalDate,
      newDate: resolvedNewDate,
      startTime: resolvedStart,
      endTime: resolvedEnd,
      room: resolvedRoom,
      topic: resolvedTopic,
      reason: data.reason,
      announcementId: announcementId ?? null,
    },
    include: {
      classroom: {
        select: { id: true, code: true, name: true, level: true },
      },
    },
  });

  return mapPrismaScheduleException(createdRow);
}

export async function deleteScheduleException(id: unknown): Promise<boolean> {
  const validId = validate(idSchema, id);
  const existing = await prisma.scheduleException.findUnique({
    where: { id: validId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError("ScheduleException", validId);
  }
  await prisma.scheduleException.delete({ where: { id: validId } });
  return true;
}

export async function getScheduleCalendarRange(input: unknown): Promise<{
  fromDate: string;
  toDate: string;
  occurrences: ResolvedScheduleOccurrence[];
  exceptions: ScheduleException[];
  sessions: WeeklyClassSession[];
  kpis: ScheduleRangeKpis;
}> {
  const data = validate(calendarRangeQuerySchema, input);
  if (data.toDate < data.fromDate) {
    throw new ValidationError(
      "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.",
    );
  }

  const [
    hydrated,
    allExceptions,
    classrooms,
    students,
    classSessions,
    filteredExceptions,
    filteredSessions,
  ] = await Promise.all([
    hydrateWeeklySessionsFromDb(),
    listScheduleExceptions(),
    classroomService.listAllClassrooms(true),
    studentService.listAllStudents({ status: "all" }),
    teachingJournalService.listClassSessions(),
    listScheduleExceptions({
      classCode:
        data.classCode && data.classCode !== "all" ? data.classCode : undefined,
      fromDate: data.fromDate,
      toDate: data.toDate,
    }),
    listWeeklySchedule({
      classCode:
        data.classCode && data.classCode !== "all" ? data.classCode : undefined,
      room: data.room && data.room !== "all" ? data.room : undefined,
    }),
  ]);

  const allOccurrences = resolveScheduleOccurrences({
    fromDate: data.fromDate,
    toDate: data.toDate,
    sessions: hydrated.sessions,
    exceptions: allExceptions,
    classes: classrooms,
    students,
    classSessions,
    todayIso: data.todayIso || toIsoDate(new Date()),
    classCodeFilter:
      data.classCode && data.classCode !== "all" ? data.classCode : undefined,
  });

  const roomKey =
    data.room && data.room !== "all" ? normalizeRoomKey(data.room) : "";
  const occurrences = roomKey
    ? allOccurrences.filter((o) => normalizeRoomKey(o.room) === roomKey)
    : allOccurrences;

  return {
    fromDate: data.fromDate,
    toDate: data.toDate,
    occurrences,
    exceptions: filteredExceptions,
    sessions: filteredSessions,
    kpis: computeScheduleRangeKpis(occurrences),
  };
}

export async function enrollStudents(input: unknown): Promise<void> {
  const data = validate(enrollStudentsSchema, input);

  const session = await prisma.classSession.findUnique({
    where: { id: data.sessionId },
  });
  if (!session) {
    throw new NotFoundError("ClassSession", data.sessionId);
  }

  const classrooms = await classroomService.listAllClassrooms(true);
  const classroom =
    classrooms.find(
      (c) =>
        c.status !== "archived" &&
        c.code.toUpperCase() === session.classCode.toUpperCase(),
    ) ??
    classrooms.find(
      (c) => c.code.toUpperCase() === session.classCode.toUpperCase(),
    );

  if (!classroom) {
    throw new NotFoundError("Classroom", session.classCode);
  }
  if (classroom.status === "archived" || classroom.status === "completed") {
    throw new ValidationError(
      `Không thể ghi danh học viên vào lớp "${classroom.code}" đã kết thúc hoặc đã lưu trữ.`,
    );
  }

  const uniqueStudentIds = Array.from(new Set(data.studentIds));
  const studentRows = await prisma.student.findMany({
    where: { id: { in: uniqueStudentIds } },
  });
  const stuById = new Map(studentRows.map((s) => [s.id, s]));

  const targets = uniqueStudentIds.map((studentId) => {
    const stu = stuById.get(studentId);
    if (!stu) {
      throw new NotFoundError("Student", studentId);
    }
    if (stu.deletedAt || stu.status === "archived") {
      throw new ValidationError(
        `Học viên "${stu.fullName}" đã được lưu trữ, không thể ghi danh vào lớp.`,
      );
    }
    return stu;
  });

  const currentActiveInClass = await prisma.student.count({
    where: {
      classroomId: classroom.id,
      status: { not: "archived" },
      deletedAt: null,
    },
  });
  const newcomers = targets.filter((stu) => stu.classroomId !== classroom.id);
  if (currentActiveInClass + newcomers.length > classroom.capacity) {
    throw new ValidationError(
      `Lớp "${classroom.code}" không đủ sĩ số trống (còn ${Math.max(0, classroom.capacity - currentActiveInClass)} chỗ).`,
    );
  }

  if (newcomers.length > 0) {
    const affectedClassIds = new Set<string>([classroom.id]);
    for (const stu of newcomers) {
      affectedClassIds.add(stu.classroomId);
    }

    await prisma.$transaction(async (tx) => {
      await tx.student.updateMany({
        where: { id: { in: newcomers.map((s) => s.id) } },
        data: {
          classroomId: classroom.id,
          className: classroom.name,
          level: classroom.level,
        },
      });

      await recalculateStudentAttendanceAndClassMetricsTx(
        tx,
        [],
        affectedClassIds,
      );
    });
  }

  await hydrateWeeklySessionsFromDb();
}

export async function getAttendanceSnapshot(input: {
  classId?: string;
  sessionId?: string;
  date: string;
}): Promise<AttendanceSnapshotResult> {
  const entries: Record<
    string,
    { status: AttendanceStatusValue; note: string }
  > = {};

  const targetClassId =
    input.classId && input.classId !== "all" ? input.classId : undefined;

  const [
    hydrated,
    allExceptions,
    classrooms,
    students,
    classSessions,
  ] = await Promise.all([
    hydrateWeeklySessionsFromDb(),
    listScheduleExceptions(),
    classroomService.listAllClassrooms(true),
    studentService.listAllStudents({ status: "all" }),
    teachingJournalService.listClassSessions(),
  ]);

  const targetClassroom = targetClassId
    ? classrooms.find((c) => c.id === targetClassId)
    : undefined;

  const occurrencesForDay = /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? resolveScheduleOccurrences({
        fromDate: input.date,
        toDate: input.date,
        sessions: hydrated.sessions,
        exceptions: allExceptions,
        classes: classrooms,
        students,
        classSessions,
        includeInactiveClasses: true,
        todayIso: toIsoDate(new Date()),
        classCodeFilter: targetClassroom?.code,
      })
    : [];

  const dayOccurrences: DayScheduleOccurrenceOption[] = occurrencesForDay.map(
    (occ) => ({
      occurrenceKey: occ.occurrenceKey,
      sessionId: occ.recurringSessionId ?? occ.classSessionId,
      scheduleExceptionId: occ.exceptionId,
      classId: occ.classId,
      classCode: occ.classCode,
      className: occ.className,
      date: occ.date,
      dayLabel: occ.dayLabel,
      startTime: occ.startTime,
      endTime: occ.endTime,
      room: occ.room,
      topic: occ.topic,
      source: occ.source,
      status: occ.status,
      attendanceRecorded: occ.attendanceRecorded,
      attendanceRate: occ.attendanceRate,
      exceptionReason: occ.exceptionReason,
    }),
  );

  const canceledExceptions = targetClassId
    ? allExceptions.filter(
        (e) =>
          e.type === "canceled" &&
          e.classId === targetClassId &&
          e.originalDate === input.date,
      )
    : [];
  const activeNonCanceledOnDay = dayOccurrences.filter(
    (o) => o.status !== "canceled",
  );
  const selectedOccIsCanceled = Boolean(
    input.sessionId &&
      dayOccurrences.some(
        (o) =>
          o.status === "canceled" &&
          (o.occurrenceKey === input.sessionId ||
            o.sessionId === input.sessionId),
      ),
  );
  const isCanceledDate =
    selectedOccIsCanceled ||
    (canceledExceptions.length > 0 && activeNonCanceledOnDay.length === 0);
  const canceledReason =
    canceledExceptions[0]?.reason ??
    dayOccurrences.find((o) => o.status === "canceled")?.exceptionReason;

  // 1. Check matching ClassSessionRecord by sessionId or (classId + date)
  const matchingClassSession = classSessions.find(
    (cs) =>
      (input.sessionId && cs.id === input.sessionId) ||
      (cs.date === input.date &&
        (!targetClassId || cs.classId === targetClassId)),
  );
  if (matchingClassSession) {
    for (const rec of matchingClassSession.studentRecords) {
      entries[rec.studentId] = {
        status: rec.attendance,
        note: rec.teacherFeedback || "",
      };
    }
  }

  // 2. Fallback/supplement from students' attendanceHistory on that date
  const displayDate = formatAttendanceDateVi(input.date);

  for (const stu of students) {
    if (stu.status === "archived" || stu.deletedAt) continue;
    if (targetClassId && stu.classId !== targetClassId) continue;
    if (entries[stu.id]) continue;
    const hit = stu.attendanceHistory.find(
      (a) =>
        normalizeHistoryDateToIso(a.date) === input.date ||
        a.date === displayDate,
    );
    if (hit) {
      entries[stu.id] = {
        status: hit.status,
        note: hit.note ?? "",
      };
    }
  }

  const onLeaveStudents = students
    .filter(
      (s) =>
        s.status === "on-leave" &&
        !s.deletedAt &&
        (!targetClassId || s.classId === targetClassId),
    )
    .map((s) => ({
      id: s.id,
      code: s.code,
      fullName: s.fullName,
      leaveReason: s.leaveReason,
    }));

  const consecutiveAbsencesByStudentId: Record<string, number> = {};
  for (const stu of students) {
    if (stu.status === "archived" || stu.deletedAt) continue;
    if (targetClassId && stu.classId !== targetClassId) continue;
    consecutiveAbsencesByStudentId[stu.id] = computeConsecutiveAbsences(
      stu.attendanceHistory,
    );
  }

  return {
    date: input.date,
    alreadyRecorded:
      Boolean(matchingClassSession) || Object.keys(entries).length > 0,
    classSessionId: matchingClassSession?.id,
    journalStatus: matchingClassSession?.journalStatus,
    isCanceledDate,
    canceledReason,
    dayOccurrences,
    entries,
    onLeaveStudents,
    consecutiveAbsencesByStudentId,
  };
}

/** Bulk upsert — one call per lesson for the "quick attendance" screen. */
export async function recordAttendance(input: unknown): Promise<{
  sessionId: string;
  date: string;
  attendanceRate: number;
  recordedCount: number;
  classSessionId?: string;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
}> {
  const data = validate(recordAttendanceSchema, input);

  // Deduplicate entries by studentId (keeping latest status/note)
  const dedupedEntryMap = new Map<
    string,
    { studentId: string; status: AttendanceStatusValue; note?: string }
  >();
  for (const entry of data.entries) {
    dedupedEntryMap.set(entry.studentId.toLowerCase(), entry);
  }
  const dedupedEntries = Array.from(dedupedEntryMap.values());

  const [weeklySession, existingCsRow, matchedExceptionRow, classrooms] =
    await Promise.all([
      prisma.classSession.findUnique({ where: { id: data.sessionId } }),
      prisma.teachingJournalEntry.findUnique({
        where: { id: data.sessionId },
        include: JOURNAL_ENTRY_INCLUDE,
      }),
      data.scheduleExceptionId
        ? prisma.scheduleException.findUnique({
            where: { id: data.scheduleExceptionId },
            include: {
              classroom: {
                select: { id: true, code: true, name: true, level: true },
              },
            },
          })
        : Promise.resolve(null),
      classroomService.listAllClassrooms(true),
    ]);

  const existingCsById = existingCsRow
    ? mapPrismaTeachingJournalEntry(existingCsRow)
    : undefined;
  const matchedException = matchedExceptionRow
    ? mapPrismaScheduleException(matchedExceptionRow)
    : undefined;

  let targetClassroom = data.classId
    ? classrooms.find((c) => c.id === data.classId)
    : undefined;
  if (data.classId && !targetClassroom) {
    throw new NotFoundError("Classroom", data.classId);
  }

  if (!targetClassroom && weeklySession) {
    targetClassroom =
      classrooms.find(
        (c) =>
          c.status !== "archived" &&
          c.code.toUpperCase() === weeklySession.classCode.toUpperCase(),
      ) ??
      classrooms.find(
        (c) => c.code.toUpperCase() === weeklySession.classCode.toUpperCase(),
      );
  }
  if (!targetClassroom && existingCsById) {
    targetClassroom = classrooms.find((c) => c.id === existingCsById.classId);
  }

  // Load only students belonging to targetClassroom or referenced in dedupedEntries
  const candidateIdsOrCodes = Array.from(
    new Set(dedupedEntries.map((e) => e.studentId.trim()).filter(Boolean)),
  );
  const allStudentsInDb = await prisma.student.findMany({
    where: {
      OR: [
        ...(targetClassroom ? [{ classroomId: targetClassroom.id }] : []),
        ...(candidateIdsOrCodes.length > 0
          ? [
              { id: { in: candidateIdsOrCodes } },
              {
                OR: candidateIdsOrCodes.map((code) => ({
                  code: { equals: code, mode: "insensitive" as const },
                })),
              },
            ]
          : []),
      ],
    },
    include: { attendanceHistory: true },
  });
  const findStudentByIdOrCode = (idOrCode: string) => {
    const lower = idOrCode.toLowerCase();
    return allStudentsInDb.find(
      (s) => s.id === idOrCode || s.code.toLowerCase() === lower,
    );
  };

  if (!targetClassroom) {
    for (const entry of dedupedEntries) {
      const stu = findStudentByIdOrCode(entry.studentId);
      if (stu) {
        targetClassroom = classrooms.find((c) => c.id === stu.classroomId);
        if (targetClassroom) break;
      }
    }
  }

  if (
    targetClassroom &&
    (targetClassroom.status === "archived" ||
      targetClassroom.status === "completed")
  ) {
    throw new ValidationError(
      `Lớp ${targetClassroom.code} đã ở trạng thái ${targetClassroom.status === "archived" ? "lưu trữ" : "kết thúc"}, không thể ghi điểm danh.`,
    );
  }

  // Enforce hard block on canceled schedule dates (unless attending a makeup/rescheduled exception)
  if (targetClassroom) {
    const classExceptions = await listScheduleExceptions({
      classId: targetClassroom.id,
    });
    const canceledOnDate = classExceptions.find(
      (e) => e.type === "canceled" && e.originalDate === data.date,
    );
    const hasOverrideMakeupOrRescheduled = Boolean(
      (matchedException &&
        (matchedException.type === "makeup" ||
          matchedException.type === "rescheduled") &&
        (matchedException.newDate ?? matchedException.originalDate) ===
          data.date) ||
        classExceptions.some(
          (e) =>
            (e.type === "makeup" || e.type === "rescheduled") &&
            (e.newDate ?? e.originalDate) === data.date,
        ),
    );

    if (
      canceledOnDate &&
      (!hasOverrideMakeupOrRescheduled ||
        (weeklySession &&
          canceledOnDate.originalSessionId === weeklySession.id))
    ) {
      throw new ValidationError(
        `Ngày ${formatDisplayDateVi(data.date)} lớp ${targetClassroom.code} đã đánh dấu Tạm nghỉ (${canceledOnDate.reason}). Không thể điểm danh vào ngày nghỉ.`,
      );
    }
  }

  // Validate every student exists & is active/non-on-leave
  for (const entry of dedupedEntries) {
    const stu = findStudentByIdOrCode(entry.studentId);
    if (!stu) {
      throw new NotFoundError("Student", entry.studentId);
    }
    if (stu.deletedAt || stu.status === "archived") {
      throw new ValidationError(
        `Học viên ${stu.fullName} đã được lưu trữ, không thể điểm danh.`,
      );
    }
    if (stu.status === "on_leave") {
      throw new ValidationError(
        `Học viên ${stu.fullName} đang bảo lưu (tạm nghỉ), được miễn điểm danh.`,
      );
    }
    if (
      targetClassroom &&
      stu.classroomId !== targetClassroom.id
    ) {
      throw new ValidationError(
        `Học viên ${stu.fullName} không thuộc lớp ${targetClassroom.code}.`,
      );
    }
  }

  const sessionName = matchedException
    ? `${matchedException.type === "makeup" ? "Ca dạy bù" : "Ca đổi lịch"} · ${matchedException.topic}`
    : weeklySession
      ? `Ca ${weeklySession.dayLabel} · ${weeklySession.topic}`
      : existingCsById
        ? `Ca ${existingCsById.dayLabel} · ${existingCsById.topic}`
        : "Buổi học định kỳ";

  const entryByStudentId = new Map<
    string,
    { status: AttendanceStatusValue; note?: string }
  >();
  for (const entry of dedupedEntries) {
    const stu = findStudentByIdOrCode(entry.studentId);
    if (stu) {
      entryByStudentId.set(stu.id, {
        status: entry.status,
        note: entry.note,
      });
    }
  }

  const displayDate = formatAttendanceDateVi(data.date);

  const syncedClassSessionId = await prisma.$transaction(async (tx) => {
    let journalId: string | undefined;
    let journalClassId: string | undefined;

    if (targetClassroom) {
      journalClassId = targetClassroom.id;
      const existingJournal =
        existingCsRow ??
        (await tx.teachingJournalEntry.findFirst({
          where: {
            classroomId: targetClassroom.id,
            date: data.date,
          },
          include: JOURNAL_ENTRY_INCLUDE,
          orderBy: { startTime: "asc" },
        }));

      if (existingJournal) {
        journalId = existingJournal.id;
      } else {
        const dayDow = getDayOfWeekIso(data.date);
        const dayLabel = matchedException
          ? getDayLabelVi(dayDow)
          : weeklySession?.dayLabel ?? getDayLabelVi(dayDow);
        const newCsId = `cs-att-${data.date}-${targetClassroom.code.toLowerCase().replace(/[^a-z0-9]/g, "")}-${randomUUID().slice(0, 8)}`;
        const weekNum = targetClassroom.currentWeekIndex ?? 1;
        const matchedWeek = targetClassroom.curriculum?.find(
          (w) => w.weekNumber === weekNum,
        );
        const classStudents = allStudentsInDb.filter(
          (s) =>
            s.classroomId === targetClassroom.id &&
            s.status !== "archived" &&
            s.status !== "on_leave" &&
            !s.deletedAt,
        );

        await tx.teachingJournalEntry.create({
          data: {
            id: newCsId,
            classroomId: targetClassroom.id,
            scheduleExceptionId: matchedException ? matchedException.id : null,
            date: data.date,
            dayLabel,
            startTime:
              matchedException?.startTime ??
              weeklySession?.startTime ??
              "18:00",
            endTime:
              matchedException?.endTime ?? weeklySession?.endTime ?? "20:00",
            room:
              matchedException?.room ??
              weeklySession?.room ??
              targetClassroom.room,
            weekNumber: weekNum,
            topic:
              matchedException?.topic ||
              matchedWeek?.title ||
              targetClassroom.currentModule.replace(
                /^Tuần\s+\d+\/\d+\s*·\s*/i,
                "",
              ) ||
              "Buổi học định kỳ",
            objectives:
              matchedWeek?.focus ||
              `Hoàn thành nội dung Tuần ${weekNum} (${targetClassroom.code}).`,
            completionResult: "not_completed",
            generalNotes: "",
            privateNotes: "",
            homework: matchedWeek?.homework ?? "",
            nextSessionPlan: "",
            journalStatus: "draft",
            studentEvaluations: {
              create: classStudents.map((stu) => {
                const recorded = entryByStudentId.get(stu.id);
                return {
                  id: `ssr-${newCsId}-${stu.id}`,
                  studentId: stu.id,
                  attendance: recorded?.status ?? "present",
                  homeworkStatus: "unrecorded",
                  learningStatus: "unrecorded",
                  skill: "General",
                  score: null,
                  teacherFeedback: recorded?.note ?? "",
                  followUp: "",
                };
              }),
            },
          },
        });
        journalId = newCsId;
      }
    }

    const affectedStudentIds = new Set<string>();
    const affectedClassroomIds = new Set<string>();
    if (targetClassroom) {
      affectedClassroomIds.add(targetClassroom.id);
    }

    for (const entry of dedupedEntries) {
      const stu = findStudentByIdOrCode(entry.studentId);
      if (!stu) continue;
      affectedStudentIds.add(stu.id);
      affectedClassroomIds.add(stu.classroomId);

      const sessionIdForStudent =
        journalId && stu.classroomId === journalClassId ? journalId : undefined;

      const matchedAtt = stu.attendanceHistory.find(
        (a) =>
          (sessionIdForStudent &&
            (a.teachingJournalEntryId === sessionIdForStudent ||
              a.sessionId === sessionIdForStudent)) ||
          ((normalizeHistoryDateToIso(a.date) === data.date ||
            a.date === displayDate) &&
            (a.sessionName === sessionName ||
              (!a.teachingJournalEntryId && !a.sessionId))),
      );

      if (matchedAtt) {
        await tx.attendanceRecord.update({
          where: { id: matchedAtt.id },
          data: {
            classroomId: stu.classroomId,
            sessionId: weeklySession ? weeklySession.id : matchedAtt.sessionId,
            teachingJournalEntryId:
              sessionIdForStudent ?? matchedAtt.teachingJournalEntryId,
            date: data.date,
            sessionName,
            status: entry.status,
            note: entry.note || null,
          },
        });
      } else {
        await tx.attendanceRecord.create({
          data: {
            id: `att-${Date.now()}-${stu.id}-${Math.random().toString(36).slice(2, 6)}`,
            studentId: stu.id,
            classroomId: stu.classroomId,
            sessionId: weeklySession ? weeklySession.id : null,
            teachingJournalEntryId: sessionIdForStudent ?? null,
            date: data.date,
            sessionName,
            status: entry.status,
            note: entry.note || null,
          },
        });
      }

      if (journalId && stu.classroomId === journalClassId) {
        const existingEval = await tx.sessionStudentEvaluation.findUnique({
          where: {
            entryId_studentId: {
              entryId: journalId,
              studentId: stu.id,
            },
          },
        });
        if (existingEval) {
          await tx.sessionStudentEvaluation.update({
            where: { id: existingEval.id },
            data: {
              attendance: entry.status,
              ...(entry.note && entry.note.trim().length > 0
                ? { teacherFeedback: entry.note.trim() }
                : {}),
            },
          });
        } else {
          await tx.sessionStudentEvaluation.create({
            data: {
              id: `ssr-${journalId}-${stu.id}`,
              entryId: journalId,
              studentId: stu.id,
              attendance: entry.status,
              homeworkStatus: "unrecorded",
              learningStatus: "unrecorded",
              skill: "General",
              score: null,
              teacherFeedback: entry.note ?? "",
              followUp: "",
            },
          });
        }
        await tx.teachingJournalEntry.update({
          where: { id: journalId },
          data: { updatedAt: new Date() },
        });
      }
    }

    await recalculateStudentAttendanceAndClassMetricsTx(
      tx,
      affectedStudentIds,
      affectedClassroomIds,
    );

    return journalId;
  });

  const totalEntries = dedupedEntries.length || 1;
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let excusedCount = 0;
  for (const e of dedupedEntries) {
    if (e.status === "present") presentCount += 1;
    else if (e.status === "late") lateCount += 1;
    else if (e.status === "absent") absentCount += 1;
    else if (e.status === "excused") excusedCount += 1;
  }

  return {
    sessionId: data.sessionId,
    date: data.date,
    attendanceRate: Math.round(
      ((presentCount + lateCount) / totalEntries) * 100,
    ),
    recordedCount: dedupedEntries.length,
    presentCount,
    lateCount,
    absentCount,
    excusedCount,
    ...(syncedClassSessionId ? { classSessionId: syncedClassSessionId } : {}),
  };
}

export async function getPendingAttendanceQueue(
  daysBackInput = 7,
): Promise<PendingAttendanceItem[]> {
  const daysBack = Number.isFinite(daysBackInput)
    ? Math.min(Math.max(Math.trunc(daysBackInput), 1), 30)
    : 7;

  const todayIso = toIsoDate(new Date());
  const fromDate = addDaysIso(todayIso, -(daysBack - 1));

  const [hydrated, exceptions, classrooms, students, classSessions] =
    await Promise.all([
      hydrateWeeklySessionsFromDb(),
      listScheduleExceptions(),
      classroomService.listAllClassrooms(true),
      studentService.listAllStudents({ status: "all" }),
      teachingJournalService.listClassSessions(),
    ]);

  const occurrences = resolveScheduleOccurrences({
    fromDate,
    toDate: todayIso,
    sessions: hydrated.sessions,
    exceptions,
    classes: classrooms,
    students,
    classSessions,
    includeInactiveClasses: false,
    todayIso,
  });

  return occurrences
    .filter((occ) => occ.status !== "canceled" && !occ.attendanceRecorded)
    .map((occ) => ({
      occurrenceKey: occ.occurrenceKey,
      sessionId:
        occ.recurringSessionId ??
        occ.classSessionId ??
        `manual-${occ.classId}`,
      scheduleExceptionId: occ.exceptionId,
      classId: occ.classId,
      classCode: occ.classCode,
      className: occ.className,
      date: occ.date,
      dayLabel: occ.dayLabel,
      startTime: occ.startTime,
      endTime: occ.endTime,
      room: occ.room,
      topic: occ.topic,
      enrolledCount: occ.enrolledCount,
      source: occ.source,
      isToday: occ.date === todayIso,
    }))
    .sort((a, b) => {
      if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.startTime.localeCompare(a.startTime);
    });
}

export async function getClassAttendanceMatrix(input: {
  classId: string;
  fromDate?: string;
  toDate?: string;
}): Promise<ClassAttendanceMatrixReport> {
  const validClassId = validate(idSchema, input.classId);

  const [classrooms, students, classSessions, teacherSetting] =
    await Promise.all([
      classroomService.listAllClassrooms(true),
      studentService.listAllStudents({
        classId: validClassId,
        status: "all",
      }),
      teachingJournalService.listClassSessions({ classId: validClassId }),
      prisma.teacherSetting.findUnique({
        where: { id: "default" },
        select: { lowAttendanceThresholdPercent: true },
      }),
    ]);

  const classroom = classrooms.find((c) => c.id === validClassId);
  if (!classroom) {
    throw new NotFoundError("Classroom", validClassId);
  }

  const todayIso = toIsoDate(new Date());
  const toDate =
    input.toDate && /^\d{4}-\d{2}-\d{2}$/.test(input.toDate)
      ? input.toDate
      : todayIso;
  const fromDate =
    input.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(input.fromDate)
      ? input.fromDate
      : addDaysIso(toDate, -29);

  if (fromDate > toDate) {
    throw new ValidationError(
      "Ngày bắt đầu (fromDate) phải sớm hơn hoặc bằng ngày kết thúc (toDate).",
    );
  }

  const classStudents = students.filter(
    (s) =>
      s.classId === classroom.id &&
      s.status !== "archived" &&
      s.status !== "on-leave" &&
      !s.deletedAt,
  );

  // Collect columns keyed by session ID (so multiple sessions on the same day never collide)
  const columnMap = new Map<
    string,
    {
      columnId: string;
      date: string;
      startTime: string;
      topic: string;
      classSessionId?: string;
      recordsByStudentId: Map<
        string,
        { status: AttendanceStatusValue; note?: string }
      >;
    }
  >();

  const coveredSessionDates = new Map<string, Set<string>>();
  const classSessionsInRange: ClassSessionRecord[] = classSessions
    .filter(
      (cs) =>
        cs.classId === classroom.id &&
        cs.date >= fromDate &&
        cs.date <= toDate,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
    );

  for (const cs of classSessionsInRange) {
    const recMap = new Map<
      string,
      { status: AttendanceStatusValue; note?: string }
    >();
    const coveredStudents =
      coveredSessionDates.get(cs.date) ?? new Set<string>();
    for (const r of cs.studentRecords) {
      recMap.set(r.studentId, {
        status: r.attendance,
        note: r.teacherFeedback || undefined,
      });
      coveredStudents.add(r.studentId);
    }
    coveredSessionDates.set(cs.date, coveredStudents);
    columnMap.set(cs.id, {
      columnId: cs.id,
      date: cs.date,
      startTime: cs.startTime,
      topic: cs.topic,
      classSessionId: cs.id,
      recordsByStudentId: recMap,
    });
  }

  for (const stu of classStudents) {
    for (const att of stu.attendanceHistory) {
      const iso = normalizeHistoryDateToIso(att.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
      if (iso < fromDate || iso > toDate) continue;
      if (att.sessionId && columnMap.has(att.sessionId)) continue;
      if (coveredSessionDates.get(iso)?.has(stu.id)) continue;

      const dateKey = `date-${iso}`;
      let col = columnMap.get(dateKey);
      if (!col) {
        col = {
          columnId: dateKey,
          date: iso,
          startTime: "23:59",
          topic: att.sessionName || "Buổi học định kỳ",
          recordsByStudentId: new Map(),
        };
        columnMap.set(dateKey, col);
      }
      if (!col.recordsByStudentId.has(stu.id)) {
        col.recordsByStudentId.set(stu.id, {
          status: att.status,
          note: att.note,
        });
      }
    }
  }

  const sortedCols = Array.from(columnMap.values()).sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );

  const columns: AttendanceMatrixColumn[] = sortedCols.map((col) => {
    const dow = getDayOfWeekIso(col.date);
    const label = getDayLabelVi(dow);
    const recs = Array.from(col.recordsByStudentId.values());
    const required = recs.filter((r) => r.status !== "excused");
    const attended = required.filter(
      (r) => r.status === "present" || r.status === "late",
    ).length;
    const rate =
      required.length > 0 ? Math.round((attended / required.length) * 100) : 100;

    return {
      columnId: col.columnId,
      date: col.date,
      displayDate: formatAttendanceDateVi(col.date),
      label,
      topic: col.topic,
      classSessionId: col.classSessionId,
      attendanceRate: rate,
    };
  });

  const lowAttendanceThreshold =
    teacherSetting?.lowAttendanceThresholdPercent ?? 90;
  let highRiskStudentsCount = 0;
  let sumRates = 0;

  const rows: AttendanceMatrixRow[] = classStudents.map((stu) => {
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let excusedCount = 0;
    const cells: AttendanceMatrixRow["cells"] = {};

    for (const colMeta of columns) {
      const colData = columnMap.get(colMeta.columnId);
      const cellRec = colData?.recordsByStudentId.get(stu.id);
      if (cellRec) {
        cells[colMeta.columnId] = {
          status: cellRec.status,
          note: cellRec.note,
        };
        if (cellRec.status === "present") presentCount += 1;
        else if (cellRec.status === "late") lateCount += 1;
        else if (cellRec.status === "absent") absentCount += 1;
        else if (cellRec.status === "excused") excusedCount += 1;
      } else {
        cells[colMeta.columnId] = { status: null };
      }
    }

    const mandatoryTotal = presentCount + lateCount + absentCount;
    const rate =
      mandatoryTotal > 0
        ? Math.round(((presentCount + lateCount) / mandatoryTotal) * 100)
        : stu.attendanceRate;
    const consecutiveAbsences = computeConsecutiveAbsences(
      stu.attendanceHistory,
    );

    if (rate < lowAttendanceThreshold || consecutiveAbsences >= 2) {
      highRiskStudentsCount += 1;
    }
    sumRates += rate;

    return {
      studentId: stu.id,
      studentCode: stu.code,
      studentName: stu.fullName,
      studentStatus: stu.status,
      attendanceRate: rate,
      presentCount,
      lateCount,
      absentCount,
      excusedCount,
      consecutiveAbsences,
      cells,
    };
  });

  const averageAttendanceRate =
    rows.length > 0 ? Math.round(sumRates / rows.length) : 100;

  return {
    classId: classroom.id,
    classCode: classroom.code,
    className: classroom.name,
    fromDate,
    toDate,
    columns,
    rows,
    averageAttendanceRate,
    highRiskStudentsCount,
  };
}
