import { z } from "zod";

import type { WeeklyClassSession } from "./classroom-data";
import { idSchema, validate } from "./common";
import { getRuntimeStore, saveRuntimeStore } from "./runtime-store";
import { formatSessionsToScheduleSummary, isTimeOverlapping } from "./schedule-helper";
import { syncClassroomMetrics } from "./student.service";
import { recalculateStudentAttendanceRate } from "./teaching-journal.service";

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

export const createClassSessionSchema = z
  .object({
    classCode: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(120).optional(),
    /** 1 = Monday … 7 = Sunday */
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    startTime: timeOfDay,
    endTime: timeOfDay,
    room: z.string().trim().max(120).default("Phòng 302 · Cơ sở Nguyễn Du"),
    topic: z.string().trim().min(1).max(240),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: "Giờ kết thúc phải sau giờ bắt đầu",
    path: ["endTime"],
  });
export type CreateClassSessionInput = z.infer<typeof createClassSessionSchema>;

export const enrollStudentsSchema = z.object({
  sessionId: idSchema,
  studentIds: z.array(idSchema).min(1).max(200),
});
export type EnrollStudentsInput = z.infer<typeof enrollStudentsSchema>;

export const recordAttendanceSchema = z.object({
  sessionId: idSchema,
  /** Calendar date of the lesson (YYYY-MM-DD). */
  date: z.string().trim().min(1),
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
});

export type ClassSessionSummary = WeeklyClassSession;

// --------------------------------------------------------------- Operations

export async function listWeeklySchedule(
  input?: unknown,
): Promise<WeeklyClassSession[]> {
  const query = validate(weekQuerySchema, input ?? {});
  const store = getRuntimeStore();
  const sortedSessions = [...store.sessions].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });
  if (!query.dayOfWeek || query.dayOfWeek === 0) {
    return sortedSessions;
  }
  return sortedSessions.filter((s) => s.dayOfWeek === query.dayOfWeek);
}

export async function createClassSession(
  input: unknown,
): Promise<WeeklyClassSession> {
  const data = validate(createClassSessionSchema, input);
  const store = getRuntimeStore();

  const targetClass =
    store.classrooms.find((c) => c.code === data.classCode) ??
    store.classrooms[0];

  const hasConflict = store.sessions.some(
    (s) =>
      s.dayOfWeek === data.dayOfWeek &&
      (s.startTime === data.startTime ||
        isTimeOverlapping(s.startTime, s.endTime, data.startTime, data.endTime)),
  );

  const newSession: WeeklyClassSession = {
    id: `ses-${Date.now()}`,
    classCode: targetClass?.code ?? data.classCode,
    className: data.name ?? targetClass?.name ?? "IELTS Intensive",
    level: targetClass?.level ?? "CEFR B2",
    dayOfWeek: data.dayOfWeek,
    dayLabel: DAY_LABELS[data.dayOfWeek] ?? "Thứ Bảy",
    startTime: data.startTime,
    endTime: data.endTime,
    room: data.room,
    topic: data.topic,
    enrolledCount: targetClass?.enrolled ?? 12,
    capacity: targetClass?.capacity ?? 15,
    status: "upcoming",
    hasConflict,
  };

  store.sessions.push(newSession);

  // Auto-sort store.sessions chronologically: by dayOfWeek (1..7), then startTime
  store.sessions.sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  // Synchronize classroom scheduleSummary in store.classrooms
  if (targetClass) {
    const classSessions = store.sessions.filter(
      (s) => s.classCode === targetClass.code,
    );
    targetClass.scheduleSummary = formatSessionsToScheduleSummary(classSessions);
  }

  saveRuntimeStore(store);
  return newSession;
}

export async function deleteClassSession(id: string): Promise<boolean> {
  const store = getRuntimeStore();
  const idx = store.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return false;

  const [removed] = store.sessions.splice(idx, 1);
  const targetClass = store.classrooms.find((c) => c.code === removed.classCode);
  if (targetClass) {
    const classSessions = store.sessions.filter(
      (s) => s.classCode === targetClass.code,
    );
    targetClass.scheduleSummary = formatSessionsToScheduleSummary(classSessions);
  }
  saveRuntimeStore(store);
  return true;
}

export async function enrollStudents(input: unknown): Promise<void> {
  validate(enrollStudentsSchema, input);
}

/** Bulk upsert — one call per lesson for the "quick attendance" screen. */
export async function recordAttendance(input: unknown): Promise<{
  sessionId: string;
  date: string;
  attendanceRate: number;
  recordedCount: number;
}> {
  const data = validate(recordAttendanceSchema, input);
  const store = getRuntimeStore();
  const session = store.sessions.find((s) => s.id === data.sessionId);
  const sessionName = session
    ? `Ca ${session.dayLabel} · ${session.topic}`
    : "Buổi học định kỳ";

  for (const entry of data.entries) {
    const stu = store.students.find(
      (s) =>
        s.id === entry.studentId ||
        s.code.toLowerCase() === entry.studentId.toLowerCase(),
    );
    if (!stu) continue;

    const existingIdx = stu.attendanceHistory.findIndex(
      (a) => a.date === data.date && a.sessionName === sessionName,
    );
    const record = {
      date: data.date,
      sessionName,
      status: entry.status,
      note: entry.note || undefined,
    };

    if (existingIdx >= 0) {
      stu.attendanceHistory[existingIdx] = record;
    } else {
      stu.attendanceHistory.unshift(record);
    }

    recalculateStudentAttendanceRate(stu);

    // Sync with central ClassSessionRecord if one exists for this sessionId or date + class
    const matchingClassSession = store.classSessions.find(
      (cs) =>
        cs.id === data.sessionId ||
        (cs.date === data.date && cs.classId === stu.classId),
    );
    if (matchingClassSession) {
      const ssr = matchingClassSession.studentRecords.find(
        (r) =>
          r.studentId === stu.id ||
          r.studentCode.toLowerCase() === stu.code.toLowerCase(),
      );
      if (ssr) {
        ssr.attendance = entry.status;
        if (entry.note && !ssr.teacherFeedback) {
          ssr.teacherFeedback = entry.note;
        }
      }
    }
  }

  syncClassroomMetrics(store);
  saveRuntimeStore(store);

  const totalEntries = data.entries.length || 1;
  const presentOrLate = data.entries.filter(
    (e) => e.status === "present" || e.status === "late",
  ).length;

  return {
    sessionId: data.sessionId,
    date: data.date,
    attendanceRate: Math.round((presentOrLate / totalEntries) * 100),
    recordedCount: data.entries.length,
  };
}
