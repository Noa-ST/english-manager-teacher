import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

import {
  addDaysToIsoDate,
  generateWeeklyScheduledDates,
  shiftCurriculumDates,
} from "./classroom-helpers";
import { idSchema, normalizeDateToIso, safeUrlSchema, validate } from "./common";
import {
  DAYS_OF_WEEK,
  type ClassroomGroup,
  type CurriculumAttachment,
  type CurriculumTemplate,
  type CurriculumWeek,
  type MaterialClassAssignment,
  type WeekProgressStatus,
} from "./domain-types";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import {
  mapPrismaClassroom,
  mapPrismaCurriculumTemplate,
  mapPrismaResourceFile,
  mapPrismaWeeklySession,
  type ClassroomWithCurriculum,
} from "./prisma-mappers";
import {
  detectScheduleConflicts,
  formatSessionsToScheduleSummary,
  parseScheduleSummaryToIntervals,
} from "./schedule-helper";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const materialAssignmentSchema = z.object({
  classId: z.string().trim().min(1),
  classCode: z.string().trim().min(1),
  className: z.string().trim().min(1),
  weekNumber: z.number().int().min(1),
  assignedAt: z.string().trim().optional(),
});
export type MaterialAssignmentInput = z.infer<typeof materialAssignmentSchema>;

export const curriculumAttachmentSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(255),
  url: safeUrlSchema,
  size: z.string().trim().max(50),
  sizeBytes: z.number().int().min(0).optional(),
  type: z.enum(["PDF", "DOCX", "SLIDE", "WORKSHEET", "IMAGE", "AUDIO"]),
  uploadedAt: z.string().trim().max(50),
  storedFileId: z.string().trim().optional(),
  visibility: z.enum(["public", "private"]).optional(),
  classId: z.string().trim().optional(),
  classCode: z.string().trim().optional(),
  weekNumber: z.number().int().optional(),
  assignments: z.array(materialAssignmentSchema).optional(),
});
export type CurriculumAttachmentInput = z.infer<typeof curriculumAttachmentSchema>;

export const curriculumSkillFocusSchema = z.enum([
  "Listening",
  "Reading",
  "Writing",
  "Speaking",
  "Grammar-Vocab",
  "Mixed",
]);

export const curriculumWeekSchema = z.object({
  weekNumber: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  focus: z.string().trim().max(240).optional(),
  focusSkill: curriculumSkillFocusSchema.optional(),
  plannedSessions: z.coerce.number().int().min(1).max(14).optional(),
  status: z
    .enum(["not-started", "in-progress", "completed", "postponed"])
    .optional(),
  scheduledDate: z.string().trim().max(50).optional(),
  completedDate: z.string().trim().max(50).optional(),
  teacherName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1500).optional(),
  homework: z.string().trim().max(1000).optional(),
  homeworkDueDate: z.string().trim().max(50).optional(),
  isAssessmentMilestone: z.boolean().optional(),
  assessmentTitle: z.string().trim().max(200).optional(),
  lessonObjectives: z.array(z.string().trim().max(200)).optional(),
  materialsCount: z.coerce.number().int().min(0).optional(),
  attachments: z.array(curriculumAttachmentSchema).optional(),
});

export const updateWeekProgressSchema = z.object({
  targetWeek: z.coerce.number().int().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  focus: z.string().trim().max(240).optional(),
  focusSkill: curriculumSkillFocusSchema.optional(),
  plannedSessions: z.coerce.number().int().min(1).max(14).optional(),
  status: z
    .enum(["not-started", "in-progress", "completed", "postponed"])
    .optional(),
  scheduledDate: z.string().trim().max(50).optional(),
  completedDate: z.string().trim().max(50).optional(),
  teacherName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1500).optional(),
  homework: z.string().trim().max(1000).optional(),
  homeworkDueDate: z.string().trim().max(50).optional(),
  isAssessmentMilestone: z.boolean().optional(),
  assessmentTitle: z.string().trim().max(200).optional(),
  lessonObjectives: z.array(z.string().trim().max(200)).optional(),
  attachments: z.array(curriculumAttachmentSchema).optional(),
  setAsActiveWeek: z.boolean().optional(),
  markPreviousCompleted: z.boolean().optional(),
});
export type UpdateWeekProgressInput = z.infer<typeof updateWeekProgressSchema>;

export const createClassroomSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  level: z.string().trim().min(1).max(60).default("CEFR B2"),
  targetBand: z.string().trim().min(1).max(80).default("IELTS 6.5–7.5+"),
  scheduleSummary: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .default("Thứ 3 & Thứ 6 · 18:00 – 20:00"),
  room: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default("Phòng 302 · Cơ sở Nguyễn Du"),
  capacity: z.coerce.number().int().min(5).max(50).default(15),
  status: z.enum(["upcoming", "active", "completed", "archived"]).default("active"),
  startDate: z.string().trim().max(32).optional(),
  expectedEndDate: z.string().trim().max(32).optional(),
  totalWeeks: z.coerce.number().int().min(1).max(52).default(12),
  currentWeekIndex: z.coerce.number().int().min(1).max(52).default(1),
  currentModule: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .default("Module 1: Critical Reading & Essay Architecture"),
  curriculum: z.array(curriculumWeekSchema).optional(),
  tuitionDueDate: z.string().trim().max(50).optional().default("2026-11-20"),
  validateScheduleConflict: z.boolean().optional().default(false),
});
export type CreateClassroomInput = z.input<typeof createClassroomSchema>;

export const updateClassroomSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  level: z.string().trim().min(1).max(60).optional(),
  targetBand: z.string().trim().min(1).max(80).optional(),
  scheduleSummary: z.string().trim().min(1).max(160).optional(),
  room: z.string().trim().min(1).max(120).optional(),
  capacity: z.coerce.number().int().min(5).max(50).optional(),
  status: z.enum(["upcoming", "active", "completed", "archived"]).optional(),
  startDate: z.string().trim().max(32).optional(),
  expectedEndDate: z.string().trim().max(32).optional(),
  completedAt: z.string().trim().max(32).optional(),
  totalWeeks: z.coerce.number().int().min(1).max(52).optional(),
  currentWeekIndex: z.coerce.number().int().min(1).max(52).optional(),
  currentModule: z.string().trim().min(1).max(200).optional(),
  curriculum: z.array(curriculumWeekSchema).optional(),
  tuitionDueDate: z.string().trim().max(50).optional(),
  validateScheduleConflict: z.boolean().optional().default(false),
  markPreviousCompleted: z.boolean().optional().default(false),
});

export const cloneClassroomSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  startDate: z.string().trim().max(32).optional(),
  scheduleSummary: z.string().trim().min(1).max(160).optional(),
  room: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["upcoming", "active"]).default("upcoming"),
  copyMaterials: z.boolean().default(true),
  validateScheduleConflict: z.boolean().optional().default(false),
});

export const shiftCurriculumSchema = z.object({
  fromWeekNumber: z.coerce.number().int().min(1).max(100),
  shiftDays: z.coerce.number().int().min(-90).max(90),
});

export const saveTemplateSchema = z.object({
  name: z.string().trim().min(2).max(160),
});

// ---------------------------------------------------------------------------
// Prisma Queries & Transaction Helpers
// ---------------------------------------------------------------------------

const CLASSROOM_INCLUDE = {
  curriculumWeeks: {
    orderBy: { weekNumber: "asc" as const },
    include: { attachments: true },
  },
  sessions: {
    orderBy: [{ dayOfWeek: "asc" as const }, { startTime: "asc" as const }],
  },
};

type DbClient = Prisma.TransactionClient | typeof prisma;

async function hydrateClassrooms(
  rows: ClassroomWithCurriculum[],
  client: DbClient = prisma,
): Promise<ClassroomGroup[]> {
  if (rows.length === 0) return [];
  const classIds = rows.map((r) => r.id);

  const activeStudents = await client.student.findMany({
    where: {
      classroomId: { in: classIds },
      status: { not: "archived" },
      deletedAt: null,
    },
    select: {
      classroomId: true,
      averageScore: true,
      attendanceRate: true,
      grades: { select: { status: true } },
      _count: { select: { attendanceHistory: true } },
    },
  });

  const byClass = new Map<string, typeof activeStudents>();
  for (const stu of activeStudents) {
    const list = byClass.get(stu.classroomId) ?? [];
    list.push(stu);
    byClass.set(stu.classroomId, list);
  }

  return rows.map((row) => {
    const classStudents = byClass.get(row.id) ?? [];
    const enrolled = classStudents.length;

    const withGrades = classStudents.filter(
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

    const withAttendance = classStudents.filter(
      (s) => s._count.attendanceHistory > 0 || s.attendanceRate > 0,
    );
    const attendanceRate =
      withAttendance.length > 0
        ? Math.round(
            withAttendance.reduce((sum, s) => sum + s.attendanceRate, 0) /
              withAttendance.length,
          )
        : 100;

    const mappedSessions = (row.sessions ?? []).map(mapPrismaWeeklySession);
    const scheduleSummary =
      row.scheduleSummary?.trim() ||
      (mappedSessions.length > 0
        ? formatSessionsToScheduleSummary(mappedSessions)
        : row.scheduleSummary);

    return mapPrismaClassroom(row, {
      enrolled,
      averageScore,
      attendanceRate,
      scheduleSummary,
    });
  });
}

async function replaceCurriculumWeeksTx(
  tx: Prisma.TransactionClient,
  classroomId: string,
  weeks: CurriculumWeek[],
): Promise<void> {
  const candidateIds = Array.from(
    new Set(
      weeks
        .flatMap((w) => w.attachments ?? [])
        .map((a) => a.storedFileId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const validStoredIds = new Set<string>();
  if (candidateIds.length > 0) {
    const found = await tx.storedFile.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true },
    });
    for (const item of found) validStoredIds.add(item.id);
  }

  await tx.curriculumWeek.deleteMany({ where: { classroomId } });

  const stamp = Date.now().toString(36);
  for (let wi = 0; wi < weeks.length; wi += 1) {
    const w = weeks[wi];
    const weekId = `cw-${classroomId}-w${w.weekNumber}-${stamp}-${wi}`;
    const atts = w.attachments ?? [];

    await tx.curriculumWeek.create({
      data: {
        id: weekId,
        classroomId,
        weekNumber: w.weekNumber,
        title: w.title,
        focus: w.focus ?? null,
        focusSkill: w.focusSkill ?? null,
        notes: w.notes ?? null,
        status: w.status ?? "not-started",
        scheduledDate: w.scheduledDate ?? null,
        completedDate: w.completedDate ?? null,
        teacherName: w.teacherName ?? null,
        plannedSessions: w.plannedSessions ?? 2,
        isAssessmentMilestone: Boolean(w.isAssessmentMilestone),
        assessmentTitle: w.assessmentTitle ?? null,
        lessonObjectives: w.lessonObjectives ?? [],
        homework: w.homework ?? null,
        homeworkDueDate: w.homeworkDueDate ?? null,
        materialsCount: atts.length > 0 ? atts.length : (w.materialsCount ?? 0),
        attachments: {
          create: atts.map((att, ai) => ({
            id: `cwa-${weekId}-${ai}-${Math.random().toString(36).slice(2, 6)}`,
            attachmentKey: att.id,
            title: att.name,
            type: att.type,
            url: att.url,
            storedFileId:
              att.storedFileId && validStoredIds.has(att.storedFileId)
                ? att.storedFileId
                : null,
            sizeLabel: att.size,
            sizeBytes: att.sizeBytes ?? null,
            visibility: att.visibility === "private" ? "private" : "public",
            uploadedAt: att.uploadedAt,
          })),
        },
      },
    });
  }
}

async function syncClassroomWeeklySessionsTx(
  tx: Prisma.TransactionClient,
  cls: {
    id: string;
    code: string;
    name: string;
    level: string;
    room: string;
    enrolled: number;
    capacity: number;
    status: ClassroomGroup["status"];
    scheduleSummary: string;
    currentModule: string;
  },
  previousCode?: string,
  forceRebuildIntervals = true,
): Promise<void> {
  const matchCodes = [cls.code.toUpperCase()];
  if (previousCode && previousCode.toUpperCase() !== cls.code.toUpperCase()) {
    matchCodes.push(previousCode.toUpperCase());
  }

  const sessionMatchWhere: Prisma.ClassSessionWhereInput = {
    OR: [
      { classroomId: cls.id },
      ...matchCodes.map((c) => ({
        classCode: { equals: c, mode: "insensitive" as const },
      })),
    ],
  };

  if (cls.status === "archived" || cls.status === "completed") {
    await tx.classSession.deleteMany({ where: sessionMatchWhere });
    return;
  }

  const existingForClass = await tx.classSession.findMany({
    where: sessionMatchWhere,
  });

  if (!forceRebuildIntervals && existingForClass.length > 0) {
    await tx.classSession.updateMany({
      where: { id: { in: existingForClass.map((s) => s.id) } },
      data: {
        classroomId: cls.id,
        classCode: cls.code,
        className: cls.name,
        level: cls.level,
        room: cls.room,
        enrolledCount: cls.enrolled,
        capacity: cls.capacity,
      },
    });
    return;
  }

  const intervals = parseScheduleSummaryToIntervals(cls.scheduleSummary);
  if (intervals.length === 0) {
    return;
  }

  const existingBySlot = new Map<
    string,
    { id: string; topic: string; status: "upcoming" | "ongoing" | "completed" }
  >();
  for (const s of existingForClass) {
    existingBySlot.set(`${s.dayOfWeek}-${s.startTime}-${s.endTime}`, {
      id: s.id,
      topic: s.topic,
      status: s.status,
    });
  }

  await tx.classSession.deleteMany({ where: sessionMatchWhere });

  const safeCodeSlug =
    cls.code.toLowerCase().replace(/[^a-z0-9]/g, "") || "cls";

  for (const iv of intervals) {
    const key = `${iv.dayNumber}-${iv.startTime}-${iv.endTime}`;
    const kept = existingBySlot.get(key);
    const dayDef = DAYS_OF_WEEK.find((d) => d.dayNumber === iv.dayNumber);

    await tx.classSession.create({
      data: {
        id:
          kept?.id ??
          `ses-${safeCodeSlug}-d${iv.dayNumber}-${iv.startTime.replace(":", "")}-${Math.random().toString(36).slice(2, 6)}`,
        classroomId: cls.id,
        classCode: cls.code,
        className: cls.name,
        level: cls.level,
        dayOfWeek: iv.dayNumber,
        dayLabel: dayDef?.fullLabel ?? iv.dayLabel,
        startTime: iv.startTime,
        endTime: iv.endTime,
        room: cls.room,
        topic: kept?.topic ?? cls.currentModule,
        enrolledCount: cls.enrolled,
        capacity: cls.capacity,
        status: kept?.status ?? "upcoming",
        hasConflict: false,
      },
    });
  }
}

function assertNoScheduleConflict(
  scheduleSummary: string,
  room: string,
  existingClasses: ClassroomGroup[],
  excludeClassId?: string,
): void {
  const result = detectScheduleConflicts(
    scheduleSummary,
    room,
    existingClasses,
    excludeClassId,
  );
  if (result.hasConflict) {
    const first = result.conflicts[0];
    throw new ConflictError(
      `Trùng lịch dạy vào ${first.dayLabel} (${first.startTime}–${first.endTime}): lớp ${first.existingClassCode} — ${first.existingClassName} đã xếp ca ${first.existingStartTime}–${first.existingEndTime}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listClassrooms(): Promise<ClassroomGroup[]> {
  const rows = await prisma.classroom.findMany({
    where: { status: { not: "archived" } },
    include: CLASSROOM_INCLUDE,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return hydrateClassrooms(rows);
}

export async function listAllClassrooms(
  includeArchived = false,
): Promise<ClassroomGroup[]> {
  const rows = await prisma.classroom.findMany({
    where: includeArchived ? undefined : { status: { not: "archived" } },
    include: CLASSROOM_INCLUDE,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return hydrateClassrooms(rows);
}

export async function getClassroomById(
  id: unknown,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const row = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!row) throw new NotFoundError("Classroom", validId);
  const [hydrated] = await hydrateClassrooms([row]);
  return hydrated;
}

export async function createClassroom(
  input: unknown,
): Promise<ClassroomGroup> {
  const data = validate(createClassroomSchema, input);
  const upperCode = data.code.toUpperCase();

  // Active unique code check (archived classes free up their code)
  const duplicate = await prisma.classroom.findFirst({
    where: {
      code: { equals: upperCode, mode: "insensitive" },
      status: { not: "archived" },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new ConflictError(`Mã lớp "${upperCode}" đã tồn tại.`);
  }

  if (
    data.validateScheduleConflict &&
    data.status !== "archived" &&
    data.status !== "completed"
  ) {
    const existingRows = await prisma.classroom.findMany({
      where: { status: { not: "archived" } },
      include: CLASSROOM_INCLUDE,
    });
    const hydratedExisting = await hydrateClassrooms(existingRows);
    assertNoScheduleConflict(data.scheduleSummary, data.room, hydratedExisting);
  }

  const totalWeeks = data.totalWeeks ?? 12;
  const currentWeekIndex = Math.max(
    1,
    Math.min(totalWeeks, data.currentWeekIndex ?? 1),
  );

  // Auto-generate weekly scheduledDates if startDate is supplied
  const generatedDates = data.startDate
    ? generateWeeklyScheduledDates(data.startDate, totalWeeks)
    : [];
  const baseCurriculum: CurriculumWeek[] = data.curriculum
    ? data.curriculum.map((w) => ({ ...w }))
    : [];
  if (generatedDates.length > 0 && baseCurriculum.length > 0) {
    for (const week of baseCurriculum) {
      if (!week.scheduledDate && generatedDates[week.weekNumber - 1]) {
        week.scheduledDate = generatedDates[week.weekNumber - 1];
      }
    }
  } else if (generatedDates.length > 0 && baseCurriculum.length === 0) {
    for (let i = 0; i < totalWeeks; i += 1) {
      baseCurriculum.push({
        weekNumber: i + 1,
        title: `Bài học tuần ${i + 1}`,
        scheduledDate: generatedDates[i],
        status: i + 1 === currentWeekIndex ? "in-progress" : "not-started",
      });
    }
  }

  const computedExpectedEndDate =
    data.expectedEndDate ||
    (data.startDate
      ? addDaysToIsoDate(data.startDate, Math.max(0, (totalWeeks - 1) * 7))
      : undefined);

  let computedModule = data.currentModule;
  if (
    !computedModule ||
    computedModule === "Module 1: Critical Reading & Essay Architecture"
  ) {
    if (baseCurriculum.length > 0) {
      const currentItem = baseCurriculum.find(
        (w) => w.weekNumber === currentWeekIndex,
      );
      computedModule = currentItem
        ? `Tuần ${currentWeekIndex}/${totalWeeks} · ${currentItem.title}`
        : `Tuần ${currentWeekIndex}/${totalWeeks} · Bài học tuần ${currentWeekIndex}`;
    } else {
      computedModule = `Tuần ${currentWeekIndex}/${totalWeeks} · Bài học khởi động`;
    }
  }

  const newId = `cls-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const nextStatus = data.status ?? "active";
  const resolvedDueDate = data.tuitionDueDate || "2026-11-20";

  const createdRow = await prisma.$transaction(async (tx) => {
    await tx.classroom.create({
      data: {
        id: newId,
        code: upperCode,
        name: data.name,
        level: data.level,
        targetBand: data.targetBand,
        scheduleSummary: data.scheduleSummary,
        room: data.room,
        enrolled: 0,
        capacity: data.capacity,
        attendanceRate: 100,
        averageScore: 0,
        currentModule: computedModule,
        status: nextStatus,
        startDate: data.startDate ?? null,
        expectedEndDate: computedExpectedEndDate ?? null,
        totalWeeks,
        currentWeekIndex,
        tuitionDueDate: resolvedDueDate,
      },
    });

    if (baseCurriculum.length > 0) {
      await replaceCurriculumWeeksTx(tx, newId, baseCurriculum);
    }

    await syncClassroomWeeklySessionsTx(
      tx,
      {
        id: newId,
        code: upperCode,
        name: data.name,
        level: data.level,
        room: data.room,
        enrolled: 0,
        capacity: data.capacity,
        status: nextStatus,
        scheduleSummary: data.scheduleSummary,
        currentModule: computedModule,
      },
      undefined,
      true,
    );

    return tx.classroom.findUniqueOrThrow({
      where: { id: newId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([createdRow]);
  return hydrated;
}

export async function updateClassroom(
  id: unknown,
  input: unknown,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const data = validate(updateClassroomSchema, input);

  const existingRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!existingRow) throw new NotFoundError("Classroom", validId);

  const [existing] = await hydrateClassrooms([existingRow]);

  // Unique code check when changing code
  if (data.code) {
    const upperCode = data.code.toUpperCase();
    const duplicate = await prisma.classroom.findFirst({
      where: {
        id: { not: validId },
        code: { equals: upperCode, mode: "insensitive" },
        status: { not: "archived" },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(`Mã lớp "${upperCode}" đã tồn tại.`);
    }
  }

  // Validate tuitionDueDate upfront before mutating
  let normalizedDue: string | null = null;
  if (data.tuitionDueDate !== undefined && data.tuitionDueDate.trim() !== "") {
    normalizedDue = normalizeDateToIso(data.tuitionDueDate);
    if (!normalizedDue) {
      throw new ValidationError(
        "Hạn học phí của lớp không hợp lệ (định dạng YYYY-MM-DD hoặc DD/MM/YYYY).",
      );
    }
  }

  // Capacity check: cannot shrink capacity below active enrolled count
  const currentEnrolled = existing.enrolled;
  if (data.capacity !== undefined && data.capacity < currentEnrolled) {
    throw new ValidationError(
      `Không thể giảm sĩ số tối đa xuống ${data.capacity} khi lớp đang có ${currentEnrolled} học viên hoạt động.`,
    );
  }

  const nextStatus = data.status ?? existing.status;
  const nextSchedule = data.scheduleSummary ?? existing.scheduleSummary;
  const nextRoom = data.room ?? existing.room;

  if (
    data.validateScheduleConflict &&
    nextStatus !== "archived" &&
    nextStatus !== "completed"
  ) {
    const allRows = await prisma.classroom.findMany({
      where: { status: { not: "archived" } },
      include: CLASSROOM_INCLUDE,
    });
    const hydratedAll = await hydrateClassrooms(allRows);
    assertNoScheduleConflict(nextSchedule, nextRoom, hydratedAll, validId);
  }

  const totalWeeks = data.totalWeeks ?? existing.totalWeeks ?? 12;
  const currentWeekIndex = Math.max(
    1,
    Math.min(
      totalWeeks,
      data.currentWeekIndex ?? existing.currentWeekIndex ?? 1,
    ),
  );
  const curriculum = (data.curriculum ?? existing.curriculum ?? []).map((w) => ({
    ...w,
  }));
  let curriculumDirty = data.curriculum !== undefined;

  const nextStartDate = data.startDate ?? existing.startDate;
  if (data.startDate && curriculum.length > 0) {
    const dates = generateWeeklyScheduledDates(data.startDate, totalWeeks);
    for (const w of curriculum) {
      if (!w.scheduledDate && dates[w.weekNumber - 1]) {
        w.scheduledDate = dates[w.weekNumber - 1];
        curriculumDirty = true;
      }
    }
  }

  if (data.markPreviousCompleted && data.currentWeekIndex !== undefined) {
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const w of curriculum) {
      if (w.weekNumber < currentWeekIndex && w.status !== "postponed") {
        w.status = "completed";
        w.completedDate = w.completedDate || todayIso;
        curriculumDirty = true;
      } else if (
        w.weekNumber === currentWeekIndex &&
        w.status !== "completed"
      ) {
        w.status = "in-progress";
        curriculumDirty = true;
      }
    }
  }

  let currentModule = data.currentModule ?? existing.currentModule;
  if (
    data.currentWeekIndex !== undefined &&
    data.currentModule === undefined &&
    curriculum.length > 0
  ) {
    const matched = curriculum.find((w) => w.weekNumber === currentWeekIndex);
    currentModule = matched
      ? `Tuần ${currentWeekIndex}/${totalWeeks} · ${matched.title}`
      : `Tuần ${currentWeekIndex}/${totalWeeks} · Bài học tuần ${currentWeekIndex}`;
  }

  const nextCode = data.code ? data.code.toUpperCase() : existing.code;
  const nextName = data.name ?? existing.name;
  const nextLevel = data.level ?? existing.level;
  const scheduleOrStatusChanged =
    data.scheduleSummary !== undefined || nextStatus !== existing.status;

  const updatedRow = await prisma.$transaction(async (tx) => {
    await tx.classroom.update({
      where: { id: validId },
      data: {
        code: nextCode,
        name: nextName,
        level: nextLevel,
        targetBand: data.targetBand ?? existing.targetBand,
        scheduleSummary: nextSchedule,
        room: nextRoom,
        capacity: data.capacity ?? existing.capacity,
        status: nextStatus,
        startDate: nextStartDate ?? null,
        expectedEndDate:
          data.expectedEndDate ?? existing.expectedEndDate ?? null,
        completedAt: data.completedAt ?? existing.completedAt ?? null,
        currentModule,
        totalWeeks,
        currentWeekIndex,
        tuitionDueDate:
          data.tuitionDueDate !== undefined
            ? data.tuitionDueDate
            : (existing.tuitionDueDate ?? null),
      },
    });

    if (curriculumDirty) {
      await replaceCurriculumWeeksTx(tx, validId, curriculum);
    }

    // Synchronize tuition status for active, unpaid students if tuitionDueDate changed
    if (normalizedDue) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const parts = normalizedDue.split("-");
      const displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      const isOverdue = normalizedDue < todayStr;

      const classStudents = await tx.student.findMany({
        where: {
          classroomId: validId,
          status: { notIn: ["archived", "on_leave"] },
          deletedAt: null,
        },
        select: { id: true, tuitionStatus: true, tuitionPeriod: true },
      });

      for (const stu of classStudents) {
        await tx.student.update({
          where: { id: stu.id },
          data: {
            tuitionDueDate: normalizedDue,
            tuitionStatus:
              stu.tuitionStatus === "paid"
                ? "paid"
                : isOverdue
                  ? "overdue"
                  : "due_soon",
            tuitionPeriod:
              stu.tuitionStatus === "paid"
                ? stu.tuitionPeriod
                : isOverdue
                  ? `Học kỳ II (Quá hạn từ ${displayDate})`
                  : `Học kỳ II (Hạn ${displayDate})`,
          },
        });
      }
    }

    // Synchronize denormalized classroom metadata across students
    if (
      nextCode !== existing.code ||
      nextName !== existing.name ||
      nextLevel !== existing.level
    ) {
      await tx.student.updateMany({
        where: { classroomId: validId },
        data: {
          className: nextName,
          level: nextLevel,
        },
      });
    }

    // 2-way sync with Weekly Schedule (ClassSession)
    await syncClassroomWeeklySessionsTx(
      tx,
      {
        id: validId,
        code: nextCode,
        name: nextName,
        level: nextLevel,
        room: nextRoom,
        enrolled: currentEnrolled,
        capacity: data.capacity ?? existing.capacity,
        status: nextStatus,
        scheduleSummary: nextSchedule,
        currentModule,
      },
      existing.code,
      scheduleOrStatusChanged,
    );

    return tx.classroom.findUniqueOrThrow({
      where: { id: validId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([updatedRow]);
  return hydrated;
}

export async function advanceClassroomWeek(
  id: unknown,
  input?: number | UpdateWeekProgressInput,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const existingRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!existingRow) throw new NotFoundError("Classroom", validId);

  const [existing] = await hydrateClassrooms([existingRow]);
  if (existing.status === "completed" || existing.status === "archived") {
    throw new ValidationError(
      "Không thể cập nhật tiến độ cho lớp đã kết thúc hoặc đã lưu trữ.",
    );
  }
  const totalWeeks = existing.totalWeeks ?? 12;

  let targetWeek: number;
  let progressData: UpdateWeekProgressInput;

  if (typeof input === "number") {
    targetWeek = Math.max(1, Math.min(totalWeeks, input));
    progressData = {
      targetWeek,
      status: "in-progress",
      setAsActiveWeek: true,
    };
  } else if (input && typeof input === "object") {
    progressData = validate(updateWeekProgressSchema, input);
    targetWeek =
      progressData.targetWeek !== undefined
        ? Math.max(1, Math.min(totalWeeks, progressData.targetWeek))
        : (existing.currentWeekIndex ?? 1);
    if (
      progressData.targetWeek !== undefined &&
      progressData.status === undefined &&
      progressData.setAsActiveWeek !== false
    ) {
      progressData.status = "in-progress";
    }
  } else {
    targetWeek = Math.min(totalWeeks, (existing.currentWeekIndex ?? 1) + 1);
    progressData = {
      targetWeek,
      status: "in-progress",
      setAsActiveWeek: true,
    };
  }

  const curriculum: CurriculumWeek[] =
    existing.curriculum && existing.curriculum.length > 0
      ? existing.curriculum.map((w) => ({ ...w }))
      : Array.from({ length: totalWeeks }, (_, i) => ({
          weekNumber: i + 1,
          title: `Bài học tuần ${i + 1}`,
          status: (i + 1 === (existing.currentWeekIndex ?? 1)
            ? "in-progress"
            : "not-started") as WeekProgressStatus,
        }));

  let weekObj = curriculum.find((w) => w.weekNumber === targetWeek);
  if (!weekObj) {
    weekObj = {
      weekNumber: targetWeek,
      title: `Bài học tuần ${targetWeek}`,
      status: "not-started",
    };
    curriculum.push(weekObj);
    curriculum.sort((a, b) => a.weekNumber - b.weekNumber);
  }

  const prevWeekNum = existing.currentWeekIndex ?? 1;
  if (progressData.markPreviousCompleted && targetWeek > prevWeekNum) {
    const prevWeekObj = curriculum.find((w) => w.weekNumber === prevWeekNum);
    if (
      prevWeekObj &&
      (prevWeekObj.status === undefined || prevWeekObj.status === "in-progress")
    ) {
      prevWeekObj.status = "completed";
      prevWeekObj.completedDate =
        prevWeekObj.completedDate || new Date().toISOString().slice(0, 10);
    }
  }

  if (progressData.title !== undefined) weekObj.title = progressData.title;
  if (progressData.focus !== undefined) weekObj.focus = progressData.focus;
  if (progressData.focusSkill !== undefined) {
    weekObj.focusSkill = progressData.focusSkill;
  }
  if (progressData.plannedSessions !== undefined) {
    weekObj.plannedSessions = progressData.plannedSessions;
  }
  if (progressData.status !== undefined) weekObj.status = progressData.status;
  if (progressData.scheduledDate !== undefined) {
    weekObj.scheduledDate = progressData.scheduledDate;
  }
  if (progressData.completedDate !== undefined) {
    weekObj.completedDate = progressData.completedDate;
  }
  if (progressData.teacherName !== undefined) {
    weekObj.teacherName = progressData.teacherName;
  }
  if (progressData.notes !== undefined) weekObj.notes = progressData.notes;
  if (progressData.homework !== undefined) {
    weekObj.homework = progressData.homework;
  }
  if (progressData.homeworkDueDate !== undefined) {
    weekObj.homeworkDueDate = progressData.homeworkDueDate;
  }
  if (progressData.isAssessmentMilestone !== undefined) {
    weekObj.isAssessmentMilestone = progressData.isAssessmentMilestone;
  }
  if (progressData.assessmentTitle !== undefined) {
    weekObj.assessmentTitle = progressData.assessmentTitle;
  }
  if (progressData.lessonObjectives !== undefined) {
    weekObj.lessonObjectives = progressData.lessonObjectives;
  }
  if (progressData.attachments !== undefined) {
    weekObj.attachments = progressData.attachments;
    weekObj.materialsCount = progressData.attachments.length;
  }

  let newCurrentWeekIndex = existing.currentWeekIndex ?? 1;
  let newCurrentModule = existing.currentModule;

  const shouldSetActive =
    progressData.setAsActiveWeek === false
      ? false
      : progressData.setAsActiveWeek === true ||
        progressData.setAsActiveWeek === undefined ||
        progressData.status === "in-progress" ||
        typeof input === "number" ||
        input === undefined;

  if (shouldSetActive) {
    newCurrentWeekIndex = targetWeek;
    if (progressData.status === "in-progress" || weekObj.status === undefined) {
      weekObj.status = "in-progress";
    }
    const weekTitle = weekObj.title || `Bài học tuần ${targetWeek}`;
    newCurrentModule = `Tuần ${targetWeek}/${totalWeeks} · ${weekTitle}`;
  }

  const updatedRow = await prisma.$transaction(async (tx) => {
    await tx.classroom.update({
      where: { id: validId },
      data: {
        currentWeekIndex: newCurrentWeekIndex,
        currentModule: newCurrentModule,
      },
    });
    await replaceCurriculumWeeksTx(tx, validId, curriculum);
    return tx.classroom.findUniqueOrThrow({
      where: { id: validId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([updatedRow]);
  return hydrated;
}

export async function archiveClassroom(id: unknown): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const existingRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!existingRow) throw new NotFoundError("Classroom", validId);

  const [existing] = await hydrateClassrooms([existingRow]);
  if (existing.enrolled > 0) {
    throw new ValidationError(
      `Không thể lưu trữ lớp đang có ${existing.enrolled} học sinh hoạt động. ` +
        `Vui lòng chuyển hoặc lưu trữ học sinh trước.`,
    );
  }

  const updatedRow = await prisma.$transaction(async (tx) => {
    await tx.classroom.update({
      where: { id: validId },
      data: { status: "archived" },
    });
    await syncClassroomWeeklySessionsTx(tx, {
      ...existing,
      status: "archived",
    });
    return tx.classroom.findUniqueOrThrow({
      where: { id: validId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([updatedRow]);
  return hydrated;
}

export async function restoreClassroom(id: unknown): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const existingRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!existingRow) throw new NotFoundError("Classroom", validId);

  const conflict = await prisma.classroom.findFirst({
    where: {
      id: { not: validId },
      status: { not: "archived" },
      code: { equals: existingRow.code, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (conflict) {
    throw new ConflictError(
      `Không thể khôi phục vì mã lớp "${existingRow.code}" đang được sử dụng bởi một lớp học hoạt động khác.`,
    );
  }

  const [existing] = await hydrateClassrooms([existingRow]);
  const updatedRow = await prisma.$transaction(async (tx) => {
    await tx.classroom.update({
      where: { id: validId },
      data: { status: "active" },
    });
    await syncClassroomWeeklySessionsTx(
      tx,
      {
        ...existing,
        status: "active",
      },
      undefined,
      true,
    );
    return tx.classroom.findUniqueOrThrow({
      where: { id: validId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([updatedRow]);
  return hydrated;
}

export async function completeClassroom(id: unknown): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const existingRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!existingRow) throw new NotFoundError("Classroom", validId);

  const [existing] = await hydrateClassrooms([existingRow]);
  const completedAt = new Date().toISOString().slice(0, 10);

  const updatedRow = await prisma.$transaction(async (tx) => {
    await tx.classroom.update({
      where: { id: validId },
      data: {
        status: "completed",
        completedAt,
      },
    });
    await syncClassroomWeeklySessionsTx(tx, {
      ...existing,
      status: "completed",
    });
    return tx.classroom.findUniqueOrThrow({
      where: { id: validId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([updatedRow]);
  return hydrated;
}

export async function activateClassroom(id: unknown): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const existingRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!existingRow) throw new NotFoundError("Classroom", validId);

  const [existing] = await hydrateClassrooms([existingRow]);
  const updatedRow = await prisma.$transaction(async (tx) => {
    await tx.classroom.update({
      where: { id: validId },
      data: { status: "active" },
    });
    await syncClassroomWeeklySessionsTx(
      tx,
      {
        ...existing,
        status: "active",
      },
      undefined,
      true,
    );
    return tx.classroom.findUniqueOrThrow({
      where: { id: validId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([updatedRow]);
  return hydrated;
}

export async function cloneClassroom(
  sourceId: unknown,
  input: unknown,
): Promise<ClassroomGroup> {
  const validSourceId = validate(idSchema, sourceId);
  const data = validate(cloneClassroomSchema, input);
  const sourceRow = await prisma.classroom.findUnique({
    where: { id: validSourceId },
    include: CLASSROOM_INCLUDE,
  });
  if (!sourceRow) throw new NotFoundError("Classroom", validSourceId);

  const [source] = await hydrateClassrooms([sourceRow]);
  const totalWeeks = source.totalWeeks ?? source.curriculum?.length ?? 12;
  const generatedDates = data.startDate
    ? generateWeeklyScheduledDates(data.startDate, totalWeeks)
    : [];

  const sourceCurriculum: CurriculumWeek[] =
    source.curriculum && source.curriculum.length > 0
      ? source.curriculum
      : Array.from(
          { length: totalWeeks },
          (_, i): CurriculumWeek => ({
            weekNumber: i + 1,
            title: `Bài học tuần ${i + 1}`,
          }),
        );

  const clonedCurriculum: CurriculumWeek[] = sourceCurriculum.map((w, idx) => {
    const attachments = data.copyMaterials
      ? structuredClone(w.attachments ?? [])
      : [];
    return {
      weekNumber: w.weekNumber,
      title: w.title,
      ...(w.focus ? { focus: w.focus } : {}),
      ...(w.focusSkill ? { focusSkill: w.focusSkill } : {}),
      ...(w.plannedSessions ? { plannedSessions: w.plannedSessions } : {}),
      ...(w.homework ? { homework: w.homework } : {}),
      ...(w.isAssessmentMilestone
        ? {
            isAssessmentMilestone: true,
            assessmentTitle: w.assessmentTitle,
          }
        : {}),
      ...(w.lessonObjectives
        ? { lessonObjectives: [...w.lessonObjectives] }
        : {}),
      status: w.weekNumber === 1 ? "in-progress" : "not-started",
      ...(generatedDates[idx] ? { scheduledDate: generatedDates[idx] } : {}),
      attachments,
      materialsCount: attachments.length,
    };
  });

  return createClassroom({
    code: data.code,
    name: data.name,
    level: source.level,
    targetBand: source.targetBand,
    scheduleSummary: data.scheduleSummary ?? source.scheduleSummary,
    room: data.room ?? source.room,
    capacity: source.capacity,
    status: data.status,
    startDate: data.startDate,
    totalWeeks,
    currentWeekIndex: 1,
    curriculum: clonedCurriculum,
    tuitionDueDate: source.tuitionDueDate,
    validateScheduleConflict: data.validateScheduleConflict,
  });
}

export async function shiftClassroomCurriculumDates(
  id: unknown,
  input: unknown,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const data = validate(shiftCurriculumSchema, input);
  const existingRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!existingRow) throw new NotFoundError("Classroom", validId);

  const [existing] = await hydrateClassrooms([existingRow]);
  if (existing.status === "completed" || existing.status === "archived") {
    throw new ValidationError(
      "Không thể cập nhật tiến độ cho lớp đã kết thúc hoặc đã lưu trữ.",
    );
  }
  const totalWeeks = existing.totalWeeks ?? 12;
  const fallbackStart =
    existing.startDate || new Date().toISOString().slice(0, 10);
  const generatedDates = generateWeeklyScheduledDates(fallbackStart, totalWeeks);

  const baseCurriculum: CurriculumWeek[] =
    existing.curriculum && existing.curriculum.length > 0
      ? existing.curriculum.map((w, i) => ({
          ...w,
          scheduledDate: w.scheduledDate || generatedDates[i],
        }))
      : Array.from({ length: totalWeeks }, (_, i) => ({
          weekNumber: i + 1,
          title: `Bài học tuần ${i + 1}`,
          scheduledDate: generatedDates[i],
        }));

  const shifted = shiftCurriculumDates(
    baseCurriculum,
    data.fromWeekNumber,
    data.shiftDays,
  );
  const lastScheduled = shifted[shifted.length - 1]?.scheduledDate;

  const updatedRow = await prisma.$transaction(async (tx) => {
    await tx.classroom.update({
      where: { id: validId },
      data: {
        ...(lastScheduled ? { expectedEndDate: lastScheduled } : {}),
      },
    });
    await replaceCurriculumWeeksTx(tx, validId, shifted);
    return tx.classroom.findUniqueOrThrow({
      where: { id: validId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([updatedRow]);
  return hydrated;
}

export async function listCurriculumTemplates(): Promise<CurriculumTemplate[]> {
  const rows = await prisma.curriculumTemplate.findMany({
    orderBy: [{ isCustom: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(mapPrismaCurriculumTemplate);
}

export async function saveClassroomAsTemplate(
  classId: unknown,
  input: unknown,
): Promise<CurriculumTemplate> {
  const validId = validate(idSchema, classId);
  const data = validate(saveTemplateSchema, input);
  const clsRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!clsRow) throw new NotFoundError("Classroom", validId);

  const [cls] = await hydrateClassrooms([clsRow]);
  const totalWeeks = cls.totalWeeks ?? cls.curriculum?.length ?? 12;
  const templateWeeks: CurriculumWeek[] = (cls.curriculum ?? []).map((w) => ({
    weekNumber: w.weekNumber,
    title: w.title,
    ...(w.focus ? { focus: w.focus } : {}),
    ...(w.focusSkill ? { focusSkill: w.focusSkill } : {}),
    ...(w.plannedSessions ? { plannedSessions: w.plannedSessions } : {}),
    ...(w.homework ? { homework: w.homework } : {}),
    ...(w.isAssessmentMilestone
      ? {
          isAssessmentMilestone: true,
          assessmentTitle: w.assessmentTitle,
        }
      : {}),
    ...(w.lessonObjectives ? { lessonObjectives: [...w.lessonObjectives] } : {}),
    attachments: structuredClone(w.attachments ?? []),
    materialsCount: w.attachments?.length ?? 0,
  }));

  const created = await prisma.curriculumTemplate.create({
    data: {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: data.name,
      level: cls.level,
      targetBand: cls.targetBand,
      description: `Mẫu giáo trình lưu từ lớp ${cls.code}`,
      totalWeeks,
      isCustom: true,
      weeksJson: JSON.stringify(templateWeeks),
    },
  });

  return mapPrismaCurriculumTemplate(created);
}

export async function deleteCurriculumTemplate(
  templateId: unknown,
): Promise<boolean> {
  const validId = validate(idSchema, templateId);
  const target = await prisma.curriculumTemplate.findUnique({
    where: { id: validId },
  });
  if (!target) throw new NotFoundError("CurriculumTemplate", validId);
  if (!target.isCustom) {
    throw new ValidationError(
      "Không thể xóa giáo trình mẫu mặc định của hệ thống.",
    );
  }
  await prisma.curriculumTemplate.delete({ where: { id: validId } });
  return true;
}

export interface MasterCurriculumMaterial {
  id: string;
  name: string;
  url: string;
  size: string;
  sizeBytes?: number;
  type: "PDF" | "DOCX" | "SLIDE" | "WORKSHEET" | "IMAGE" | "AUDIO";
  uploadedAt: string;
  assignments: MaterialClassAssignment[];
}

export type ClassroomMaterialItem = MasterCurriculumMaterial;

export async function listAllCurriculumMaterials(): Promise<
  MasterCurriculumMaterial[]
> {
  const [activeRows, resourceRows] = await Promise.all([
    prisma.classroom.findMany({
      where: { status: { not: "archived" } },
      include: CLASSROOM_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.resourceFile.findMany({
      where: { deletedAt: null },
      orderBy: [{ id: "asc" }],
    }),
  ]);

  const activeClassrooms = await hydrateClassrooms(activeRows);
  const materialMap = new Map<string, MasterCurriculumMaterial>();

  // 1. Scan active classrooms and aggregate curriculum attachments
  for (const cls of activeClassrooms) {
    if (cls.curriculum) {
      for (const week of cls.curriculum) {
        if (week.attachments && week.attachments.length > 0) {
          for (const att of week.attachments) {
            const key = att.name.toLowerCase().trim();
            const assignment: MaterialClassAssignment = {
              classId: cls.id,
              classCode: cls.code,
              className: cls.name,
              weekNumber: week.weekNumber,
              assignedAt: att.uploadedAt,
            };

            const existing = materialMap.get(key);
            if (existing) {
              const already = existing.assignments.some(
                (a) => a.classId === cls.id && a.weekNumber === week.weekNumber,
              );
              if (!already) {
                existing.assignments.push(assignment);
              }
            } else {
              materialMap.set(key, {
                id: att.id,
                name: att.name,
                url: att.url,
                size: att.size,
                sizeBytes: att.sizeBytes,
                type: att.type,
                uploadedAt: att.uploadedAt,
                assignments: [assignment],
              });
            }
          }
        }
      }
    }
  }

  // 2. Also incorporate central resources from ResourceFile table
  for (const row of resourceRows) {
    const f = mapPrismaResourceFile(row);
    const key = f.title.toLowerCase().trim();
    if (!materialMap.has(key)) {
      materialMap.set(key, {
        id: f.id,
        name: f.title,
        url:
          f.publicUrl ||
          (f.visibility === "private"
            ? `/api/admin/storage/download-url?fileId=${encodeURIComponent(f.id)}`
            : `/documents?search=${encodeURIComponent(f.title)}`),
        size: f.size,
        sizeBytes: f.sizeBytes,
        type:
          f.fileType === "AUDIO"
            ? "AUDIO"
            : f.fileType === "SLIDE"
              ? "SLIDE"
              : f.fileType === "WORKSHEET"
                ? "WORKSHEET"
                : "PDF",
        uploadedAt: f.updatedAt || "01/11/2026",
        assignments: [],
      });
    }
  }

  return Array.from(materialMap.values());
}

export const assignMaterialSchema = z.object({
  attachment: curriculumAttachmentSchema,
  assignments: z.array(
    z.object({
      classId: z.string().trim().min(1),
      weekNumber: z.number().int().min(1),
    }),
  ),
});

export async function assignMaterialToClasses(
  input: unknown,
): Promise<{
  material: MasterCurriculumMaterial;
  updatedClassrooms: ClassroomGroup[];
}> {
  const data = validate(assignMaterialSchema, input);
  const att = data.attachment;
  const targetMap = new Map<string, number[]>();

  for (const item of data.assignments) {
    const list = targetMap.get(item.classId) ?? [];
    if (!list.includes(item.weekNumber)) {
      list.push(item.weekNumber);
    }
    targetMap.set(item.classId, list);
  }

  const updatedClassIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    const rows = await tx.classroom.findMany({
      where: { status: { not: "archived" } },
      include: CLASSROOM_INCLUDE,
    });
    const activeClasses = rows.map((r) => mapPrismaClassroom(r));

    for (const cls of activeClasses) {
      const desiredWeeks = targetMap.get(cls.id);
      let classMutated = false;

      const totalWeeks = cls.totalWeeks ?? 12;
      const curriculum: CurriculumWeek[] =
        cls.curriculum && cls.curriculum.length > 0
          ? cls.curriculum.map((w) => ({
              ...w,
              attachments: [...(w.attachments ?? [])],
            }))
          : Array.from({ length: totalWeeks }, (_, i) => ({
              weekNumber: i + 1,
              title: `Bài học tuần ${i + 1}`,
              attachments: [],
            }));

      if (desiredWeeks && desiredWeeks.length > 0) {
        for (const targetWeekNum of desiredWeeks) {
          let weekObj = curriculum.find((w) => w.weekNumber === targetWeekNum);
          if (!weekObj) {
            weekObj = {
              weekNumber: targetWeekNum,
              title: `Bài học tuần ${targetWeekNum}`,
              attachments: [],
            };
            curriculum.push(weekObj);
            curriculum.sort((a, b) => a.weekNumber - b.weekNumber);
          }

          const existingAtts = weekObj.attachments
            ? [...weekObj.attachments]
            : [];
          const matchIdx = existingAtts.findIndex(
            (a) =>
              a.id === att.id || a.name.toLowerCase() === att.name.toLowerCase(),
          );

          if (matchIdx === -1) {
            existingAtts.push({
              ...att,
              classId: cls.id,
              classCode: cls.code,
              weekNumber: targetWeekNum,
            });
            weekObj.attachments = existingAtts;
            weekObj.materialsCount = existingAtts.length;
            classMutated = true;
          }
        }

        for (const weekObj of curriculum) {
          if (
            !desiredWeeks.includes(weekObj.weekNumber) &&
            weekObj.attachments
          ) {
            const beforeLen = weekObj.attachments.length;
            weekObj.attachments = weekObj.attachments.filter(
              (a) =>
                a.id !== att.id &&
                a.name.toLowerCase() !== att.name.toLowerCase(),
            );
            if (weekObj.attachments.length !== beforeLen) {
              weekObj.materialsCount = weekObj.attachments.length;
              classMutated = true;
            }
          }
        }
      } else {
        for (const weekObj of curriculum) {
          if (weekObj.attachments) {
            const beforeLen = weekObj.attachments.length;
            weekObj.attachments = weekObj.attachments.filter(
              (a) =>
                a.id !== att.id &&
                a.name.toLowerCase() !== att.name.toLowerCase(),
            );
            if (weekObj.attachments.length !== beforeLen) {
              weekObj.materialsCount = weekObj.attachments.length;
              classMutated = true;
            }
          }
        }
      }

      if (classMutated) {
        await replaceCurriculumWeeksTx(tx, cls.id, curriculum);
        updatedClassIds.push(cls.id);
      }
    }
  });

  const updatedClassrooms =
    updatedClassIds.length > 0
      ? await hydrateClassrooms(
          await prisma.classroom.findMany({
            where: { id: { in: updatedClassIds } },
            include: CLASSROOM_INCLUDE,
          }),
        )
      : [];

  const all = await listAllCurriculumMaterials();
  const matched =
    all.find(
      (m) => m.id === att.id || m.name.toLowerCase() === att.name.toLowerCase(),
    ) ?? {
      id: att.id,
      name: att.name,
      url: att.url,
      size: att.size,
      sizeBytes: att.sizeBytes,
      type: att.type,
      uploadedAt: att.uploadedAt,
      assignments: [],
    };

  return { material: matched, updatedClassrooms };
}

export async function addClassroomMaterial(
  classId: unknown,
  weekNumber: number,
  attachment: CurriculumAttachment,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, classId);
  const validAtt = validate(curriculumAttachmentSchema, attachment);
  const existingRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!existingRow) throw new NotFoundError("Classroom", validId);

  if (existingRow.status === "archived" || existingRow.status === "completed") {
    throw new ValidationError(
      `Không thể thêm học liệu vào lớp "${existingRow.code}" đã kết thúc hoặc đã lưu trữ.`,
    );
  }
  const totalWeeks = existingRow.totalWeeks ?? 12;
  if (
    !Number.isInteger(weekNumber) ||
    weekNumber < 1 ||
    weekNumber > Math.max(totalWeeks, 52)
  ) {
    throw new ValidationError(
      `Số tuần học không hợp lệ (${weekNumber}). Phải là số nguyên từ 1 đến ${Math.max(totalWeeks, 52)}.`,
    );
  }

  const [cls] = await hydrateClassrooms([existingRow]);
  const curriculum: CurriculumWeek[] =
    cls.curriculum && cls.curriculum.length > 0
      ? cls.curriculum.map((w) => ({
          ...w,
          attachments: [...(w.attachments ?? [])],
        }))
      : Array.from({ length: totalWeeks }, (_, i) => ({
          weekNumber: i + 1,
          title: `Bài học tuần ${i + 1}`,
          attachments: [],
        }));

  let weekObj = curriculum.find((w) => w.weekNumber === weekNumber);
  if (!weekObj) {
    weekObj = {
      weekNumber,
      title: `Bài học tuần ${weekNumber}`,
      attachments: [],
    };
    curriculum.push(weekObj);
    curriculum.sort((a, b) => a.weekNumber - b.weekNumber);
  }

  const existingAttachments = weekObj.attachments ?? [];
  const nextAttachment: CurriculumAttachment = {
    ...validAtt,
    classId: cls.id,
    classCode: cls.code,
    weekNumber,
  };
  const existingAttIdx = existingAttachments.findIndex(
    (a) => a.id === nextAttachment.id,
  );
  weekObj.attachments =
    existingAttIdx >= 0
      ? existingAttachments.map((a, i) =>
          i === existingAttIdx ? nextAttachment : a,
        )
      : [...existingAttachments, nextAttachment];
  weekObj.materialsCount = weekObj.attachments.length;

  const updatedRow = await prisma.$transaction(async (tx) => {
    await replaceCurriculumWeeksTx(tx, validId, curriculum);
    return tx.classroom.findUniqueOrThrow({
      where: { id: validId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([updatedRow]);
  return hydrated;
}

export async function removeClassroomMaterial(
  classId: unknown,
  weekNumber: number,
  attachmentId: string,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, classId);
  const existingRow = await prisma.classroom.findUnique({
    where: { id: validId },
    include: CLASSROOM_INCLUDE,
  });
  if (!existingRow) throw new NotFoundError("Classroom", validId);

  const [cls] = await hydrateClassrooms([existingRow]);
  if (!cls.curriculum || cls.curriculum.length === 0) return cls;

  const curriculum = cls.curriculum.map((w) => {
    if (w.weekNumber === weekNumber && w.attachments) {
      const filtered = w.attachments.filter((a) => a.id !== attachmentId);
      return {
        ...w,
        attachments: filtered,
        materialsCount: filtered.length,
      };
    }
    return w;
  });

  const updatedRow = await prisma.$transaction(async (tx) => {
    await replaceCurriculumWeeksTx(tx, validId, curriculum);
    return tx.classroom.findUniqueOrThrow({
      where: { id: validId },
      include: CLASSROOM_INCLUDE,
    });
  });

  const [hydrated] = await hydrateClassrooms([updatedRow]);
  return hydrated;
}

export async function removeMaterialFromAllClasses(
  attachmentIdOrName: string,
): Promise<{ removed: boolean; affectedClassesCount: number }> {
  const trimmed = attachmentIdOrName.trim();
  const searchKey = trimmed.toLowerCase();
  let affectedClassesCount = 0;

  await prisma.$transaction(async (tx) => {
    const rows = await tx.classroom.findMany({
      include: CLASSROOM_INCLUDE,
    });

    for (const row of rows) {
      const cls = mapPrismaClassroom(row);
      if (!cls.curriculum || cls.curriculum.length === 0) continue;

      let classMutated = false;
      const curriculum = cls.curriculum.map((w) => {
        if (w.attachments && w.attachments.length > 0) {
          const filtered = w.attachments.filter(
            (a) =>
              a.id !== trimmed && a.name.trim().toLowerCase() !== searchKey,
          );
          if (filtered.length !== w.attachments.length) {
            classMutated = true;
            return {
              ...w,
              attachments: filtered,
              materialsCount: filtered.length,
            };
          }
        }
        return w;
      });

      if (classMutated) {
        await replaceCurriculumWeeksTx(tx, row.id, curriculum);
        affectedClassesCount += 1;
      }
    }
  });

  return { removed: true, affectedClassesCount };
}
