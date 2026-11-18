import { z } from "zod";

import type {
  ClassroomGroup,
  CurriculumAttachment,
  CurriculumWeek,
  MaterialClassAssignment,
  WeekProgressStatus,
} from "./classroom-data";
import { idSchema, validate } from "./common";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { getRuntimeStore, saveRuntimeStore } from "./runtime-store";
import { formatSessionsToScheduleSummary } from "./schedule-helper";

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
  url: z.string().trim().min(1),
  size: z.string().trim().max(50),
  sizeBytes: z.number().int().min(0).optional(),
  type: z.enum(["PDF", "DOCX", "SLIDE", "WORKSHEET", "IMAGE", "AUDIO"]),
  uploadedAt: z.string().trim().max(50),
  classId: z.string().trim().optional(),
  classCode: z.string().trim().optional(),
  weekNumber: z.number().int().optional(),
  assignments: z.array(materialAssignmentSchema).optional(),
});
export type CurriculumAttachmentInput = z.infer<typeof curriculumAttachmentSchema>;

export const curriculumWeekSchema = z.object({
  weekNumber: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  focus: z.string().trim().max(200).optional(),
  status: z
    .enum(["not-started", "in-progress", "completed", "postponed"])
    .optional(),
  scheduledDate: z.string().trim().max(50).optional(),
  completedDate: z.string().trim().max(50).optional(),
  teacherName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  homework: z.string().trim().max(1000).optional(),
  materialsCount: z.coerce.number().int().min(0).optional(),
  attachments: z.array(curriculumAttachmentSchema).optional(),
});

export const updateWeekProgressSchema = z.object({
  targetWeek: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .enum(["not-started", "in-progress", "completed", "postponed"])
    .optional(),
  scheduledDate: z.string().trim().max(50).optional(),
  completedDate: z.string().trim().max(50).optional(),
  teacherName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  homework: z.string().trim().max(1000).optional(),
  attachments: z.array(curriculumAttachmentSchema).optional(),
  setAsActiveWeek: z.boolean().optional(),
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
});
export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;

export const updateClassroomSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  level: z.string().trim().min(1).max(60).optional(),
  targetBand: z.string().trim().min(1).max(80).optional(),
  scheduleSummary: z.string().trim().min(1).max(160).optional(),
  room: z.string().trim().min(1).max(120).optional(),
  capacity: z.coerce.number().int().min(5).max(50).optional(),
  totalWeeks: z.coerce.number().int().min(1).max(52).optional(),
  currentWeekIndex: z.coerce.number().int().min(1).max(52).optional(),
  currentModule: z.string().trim().min(1).max(200).optional(),
  curriculum: z.array(curriculumWeekSchema).optional(),
  tuitionDueDate: z.string().trim().max(50).optional(),
});

// ---------------------------------------------------------------------------
// Helpers — compute live metrics from student data
// ---------------------------------------------------------------------------

/** Count active (non-archived, non-deleted) students in a classroom. */
function computeEnrolled(classId: string): number {
  return getRuntimeStore().students.filter(
    (s) =>
      s.classId === classId &&
      s.status !== "archived" &&
      !s.deletedAt,
  ).length;
}

/** Average score of active students in a classroom (excludes ungraded new students so 0 does not skew the report). */
function computeAverageScore(classId: string): number {
  const active = getRuntimeStore().students.filter(
    (s) =>
      s.classId === classId &&
      s.status !== "archived" &&
      !s.deletedAt &&
      ((s.grades && s.grades.length > 0) || s.averageScore > 0),
  );
  if (active.length === 0) return 0;
  const total = active.reduce((sum, s) => sum + s.averageScore, 0);
  return Math.round((total / active.length) * 10) / 10;
}

/** Average attendance rate of active students in a classroom (excludes students with 0 recorded sessions). */
function computeAttendanceRate(classId: string): number {
  const active = getRuntimeStore().students.filter(
    (s) =>
      s.classId === classId &&
      s.status !== "archived" &&
      !s.deletedAt &&
      ((s.attendanceHistory && s.attendanceHistory.length > 0) ||
        s.attendanceRate > 0),
  );
  if (active.length === 0) return 100;
  const total = active.reduce((sum, s) => sum + s.attendanceRate, 0);
  return Math.round(total / active.length);
}

/** Hydrate a classroom with live computed metrics and dynamic schedule summary. */
function hydrate(cls: ClassroomGroup): ClassroomGroup {
  const store = getRuntimeStore();
  const classSessions = store.sessions.filter(
    (s) => s.classCode === cls.code,
  );
  const dynamicScheduleSummary =
    classSessions.length > 0
      ? formatSessionsToScheduleSummary(classSessions)
      : cls.scheduleSummary;

  return {
    ...cls,
    scheduleSummary: dynamicScheduleSummary,
    enrolled: computeEnrolled(cls.id),
    averageScore: computeAverageScore(cls.id),
    attendanceRate: computeAttendanceRate(cls.id),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listClassrooms(): Promise<ClassroomGroup[]> {
  return getRuntimeStore()
    .classrooms.filter((c) => c.status !== "archived")
    .map(hydrate);
}

export async function listAllClassrooms(
  includeArchived = false,
): Promise<ClassroomGroup[]> {
  const all = getRuntimeStore().classrooms;
  const filtered = includeArchived
    ? all
    : all.filter((c) => c.status !== "archived");
  return filtered.map(hydrate);
}

export async function getClassroomById(
  id: unknown,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const cls = store.classrooms.find((c) => c.id === validId);
  if (!cls) throw new NotFoundError("Classroom", validId);
  return hydrate(cls);
}

export async function createClassroom(
  input: unknown,
): Promise<ClassroomGroup> {
  const data = validate(createClassroomSchema, input);
  const store = getRuntimeStore();
  const upperCode = data.code.toUpperCase();

  // Unique code check
  const exists = store.classrooms.some(
    (c) => c.code.toUpperCase() === upperCode && c.status !== "archived",
  );
  if (exists) {
    throw new ConflictError(`Mã lớp "${upperCode}" đã tồn tại.`);
  }

  const totalWeeks = data.totalWeeks ?? 12;
  const currentWeekIndex = Math.max(
    1,
    Math.min(totalWeeks, data.currentWeekIndex ?? 1),
  );

  let computedModule = data.currentModule;
  if (!computedModule || computedModule === "Module 1: Critical Reading & Essay Architecture") {
    if (data.curriculum && data.curriculum.length > 0) {
      const currentItem = data.curriculum.find((w) => w.weekNumber === currentWeekIndex);
      if (currentItem) {
        computedModule = `Tuần ${currentWeekIndex}/${totalWeeks} · ${currentItem.title}`;
      } else {
        computedModule = `Tuần ${currentWeekIndex}/${totalWeeks} · Bài học tuần ${currentWeekIndex}`;
      }
    } else {
      computedModule = `Tuần ${currentWeekIndex}/${totalWeeks} · Bài học khởi động`;
    }
  }

  const newClassroom: ClassroomGroup = {
    id: `cls-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    status: "active",
    totalWeeks,
    currentWeekIndex,
    curriculum: data.curriculum ?? [],
    tuitionDueDate: data.tuitionDueDate || "2026-11-20",
  };

  store.classrooms.push(newClassroom);
  saveRuntimeStore(store);
  return hydrate(newClassroom);
}

export async function updateClassroom(
  id: unknown,
  input: unknown,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const data = validate(updateClassroomSchema, input);
  const store = getRuntimeStore();

  const idx = store.classrooms.findIndex((c) => c.id === validId);
  if (idx === -1) throw new NotFoundError("Classroom", validId);

  const existing = store.classrooms[idx];

  // Unique code check when changing code
  if (data.code) {
    const upperCode = data.code.toUpperCase();
    const duplicate = store.classrooms.some(
      (c) =>
        c.id !== validId &&
        c.code.toUpperCase() === upperCode &&
        c.status !== "archived",
    );
    if (duplicate) {
      throw new ConflictError(`Mã lớp "${upperCode}" đã tồn tại.`);
    }
  }

  // Capacity check: cannot shrink capacity below active enrolled count
  const currentEnrolled = computeEnrolled(validId);
  if (data.capacity !== undefined && data.capacity < currentEnrolled) {
    throw new ValidationError(
      `Không thể giảm sĩ số tối đa xuống ${data.capacity} khi lớp đang có ${currentEnrolled} học viên hoạt động.`,
    );
  }

  const totalWeeks = data.totalWeeks ?? existing.totalWeeks ?? 12;
  const currentWeekIndex = Math.max(
    1,
    Math.min(totalWeeks, data.currentWeekIndex ?? existing.currentWeekIndex ?? 1),
  );
  const curriculum = data.curriculum ?? existing.curriculum ?? [];

  let currentModule = data.currentModule ?? existing.currentModule;
  if (data.currentWeekIndex !== undefined && data.currentModule === undefined && curriculum.length > 0) {
    const matched = curriculum.find((w) => w.weekNumber === currentWeekIndex);
    if (matched) {
      currentModule = `Tuần ${currentWeekIndex}/${totalWeeks} · ${matched.title}`;
    } else {
      currentModule = `Tuần ${currentWeekIndex}/${totalWeeks} · Bài học tuần ${currentWeekIndex}`;
    }
  }

  const updated: ClassroomGroup = {
    ...existing,
    code: data.code ? data.code.toUpperCase() : existing.code,
    name: data.name ?? existing.name,
    level: data.level ?? existing.level,
    targetBand: data.targetBand ?? existing.targetBand,
    scheduleSummary: data.scheduleSummary ?? existing.scheduleSummary,
    room: data.room ?? existing.room,
    capacity: data.capacity ?? existing.capacity,
    currentModule,
    totalWeeks,
    currentWeekIndex,
    curriculum,
    tuitionDueDate:
      data.tuitionDueDate !== undefined
        ? data.tuitionDueDate
        : existing.tuitionDueDate,
  };

  store.classrooms[idx] = updated;

  // Synchronize tuition status for unpaid students if tuitionDueDate changed
  if (data.tuitionDueDate !== undefined) {
    const todayStr = "2026-11-18";
    const parts = data.tuitionDueDate.split("-");
    const displayDate =
      parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : data.tuitionDueDate;

    for (let i = 0; i < store.students.length; i++) {
      if (
        store.students[i].classId === validId &&
        store.students[i].tuitionStatus !== "paid"
      ) {
        const isOverdue = data.tuitionDueDate < todayStr;
        store.students[i] = {
          ...store.students[i],
          tuitionStatus: isOverdue ? "overdue" : "due-soon",
          tuitionPeriod: isOverdue
            ? `Học kỳ II (Quá hạn từ ${displayDate})`
            : `Học kỳ II (Hạn ${displayDate})`,
        };
      }
    }
  }

  // Synchronize denormalized classroom metadata across students & sessions
  if (
    updated.code !== existing.code ||
    updated.name !== existing.name ||
    updated.level !== existing.level
  ) {
    for (let i = 0; i < store.students.length; i++) {
      if (store.students[i].classId === validId) {
        store.students[i] = {
          ...store.students[i],
          className: updated.name,
          level: updated.level,
        };
      }
    }
    for (let i = 0; i < store.classSessions.length; i++) {
      if (store.classSessions[i].classId === validId) {
        store.classSessions[i] = {
          ...store.classSessions[i],
          classCode: updated.code,
          className: updated.name,
        };
      }
    }
    for (let i = 0; i < store.sessions.length; i++) {
      if (store.sessions[i].classCode === existing.code) {
        store.sessions[i] = {
          ...store.sessions[i],
          classCode: updated.code,
          className: updated.name,
          level: updated.level,
        };
      }
    }
  }

  saveRuntimeStore(store);
  return hydrate(updated);
}

export async function advanceClassroomWeek(
  id: unknown,
  input?: number | UpdateWeekProgressInput,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const idx = store.classrooms.findIndex((c) => c.id === validId);
  if (idx === -1) throw new NotFoundError("Classroom", validId);

  const existing = store.classrooms[idx];
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

  // Clone curriculum or generate default template up to totalWeeks
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

  // Apply updates to the target week ONLY (do NOT mutate other weeks)
  if (progressData.status !== undefined) {
    weekObj.status = progressData.status;
  }
  if (progressData.scheduledDate !== undefined) {
    weekObj.scheduledDate = progressData.scheduledDate;
  }
  if (progressData.completedDate !== undefined) {
    weekObj.completedDate = progressData.completedDate;
  }
  if (progressData.teacherName !== undefined) {
    weekObj.teacherName = progressData.teacherName;
  }
  if (progressData.notes !== undefined) {
    weekObj.notes = progressData.notes;
  }
  if (progressData.homework !== undefined) {
    weekObj.homework = progressData.homework;
  }
  if (progressData.attachments !== undefined) {
    weekObj.attachments = progressData.attachments;
    weekObj.materialsCount = progressData.attachments.length;
  }

  // Determine active week index & currentModule
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

  const updated: ClassroomGroup = {
    ...existing,
    currentWeekIndex: newCurrentWeekIndex,
    currentModule: newCurrentModule,
    curriculum,
  };

  store.classrooms[idx] = updated;
  saveRuntimeStore(store);
  return hydrate(updated);
}

export async function archiveClassroom(id: unknown): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const idx = store.classrooms.findIndex((c) => c.id === validId);
  if (idx === -1) throw new NotFoundError("Classroom", validId);

  // Block archive if classroom still has active students
  const activeStudentCount = computeEnrolled(validId);
  if (activeStudentCount > 0) {
    throw new ValidationError(
      `Không thể lưu trữ lớp đang có ${activeStudentCount} học sinh hoạt động. ` +
        `Vui lòng chuyển hoặc lưu trữ học sinh trước.`,
    );
  }

  store.classrooms[idx] = { ...store.classrooms[idx], status: "archived" };
  saveRuntimeStore(store);
  return hydrate(store.classrooms[idx]);
}

export async function restoreClassroom(id: unknown): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const idx = store.classrooms.findIndex((c) => c.id === validId);
  if (idx === -1) throw new NotFoundError("Classroom", validId);

  const existing = store.classrooms[idx];
  const conflict = store.classrooms.some(
    (c) =>
      c.id !== validId &&
      c.status !== "archived" &&
      c.code.toUpperCase() === existing.code.toUpperCase(),
  );
  if (conflict) {
    throw new ConflictError(
      `Không thể khôi phục vì mã lớp "${existing.code}" đang được sử dụng bởi một lớp học hoạt động khác.`,
    );
  }

  store.classrooms[idx] = { ...existing, status: "active" };
  saveRuntimeStore(store);
  return hydrate(store.classrooms[idx]);
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

export async function listAllCurriculumMaterials(): Promise<MasterCurriculumMaterial[]> {
  const store = getRuntimeStore();
  const activeClassrooms = store.classrooms.filter((c) => c.status !== "archived");
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

  // 2. Also incorporate central resources from store.files (ResourceFileItem)
  for (const f of store.files) {
    if (f.deletedAt) continue;
    const key = f.title.toLowerCase().trim();
    if (!materialMap.has(key)) {
      materialMap.set(key, {
        id: f.id,
        name: f.title,
        url: f.publicUrl || `/documents/${encodeURIComponent(f.title)}`,
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
): Promise<{ material: MasterCurriculumMaterial; updatedClassrooms: ClassroomGroup[] }> {
  const data = validate(assignMaterialSchema, input);
  const store = getRuntimeStore();
  const att = data.attachment;
  const targetMap = new Map<string, number[]>();

  for (const item of data.assignments) {
    const list = targetMap.get(item.classId) ?? [];
    if (!list.includes(item.weekNumber)) {
      list.push(item.weekNumber);
    }
    targetMap.set(item.classId, list);
  }

  const updatedClassrooms: ClassroomGroup[] = [];

  for (let idx = 0; idx < store.classrooms.length; idx++) {
    const cls = store.classrooms[idx];
    if (cls.status === "archived") continue;

    const desiredWeeks = targetMap.get(cls.id);
    let classMutated = false;

    const totalWeeks = cls.totalWeeks ?? 12;
    const curriculum: CurriculumWeek[] =
      cls.curriculum && cls.curriculum.length > 0
        ? cls.curriculum.map((w) => ({ ...w }))
        : Array.from({ length: totalWeeks }, (_, i) => ({
            weekNumber: i + 1,
            title: `Bài học tuần ${i + 1}`,
          }));

    if (desiredWeeks && desiredWeeks.length > 0) {
      for (const targetWeekNum of desiredWeeks) {
        let weekObj = curriculum.find((w) => w.weekNumber === targetWeekNum);
        if (!weekObj) {
          weekObj = {
            weekNumber: targetWeekNum,
            title: `Bài học tuần ${targetWeekNum}`,
          };
          curriculum.push(weekObj);
          curriculum.sort((a, b) => a.weekNumber - b.weekNumber);
        }

        const existingAtts = weekObj.attachments ? [...weekObj.attachments] : [];
        const matchIdx = existingAtts.findIndex(
          (a) => a.id === att.id || a.name.toLowerCase() === att.name.toLowerCase(),
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
        if (!desiredWeeks.includes(weekObj.weekNumber) && weekObj.attachments) {
          const beforeLen = weekObj.attachments.length;
          weekObj.attachments = weekObj.attachments.filter(
            (a) => a.id !== att.id && a.name.toLowerCase() !== att.name.toLowerCase(),
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
            (a) => a.id !== att.id && a.name.toLowerCase() !== att.name.toLowerCase(),
          );
          if (weekObj.attachments.length !== beforeLen) {
            weekObj.materialsCount = weekObj.attachments.length;
            classMutated = true;
          }
        }
      }
    }

    if (classMutated) {
      store.classrooms[idx] = { ...cls, curriculum };
      updatedClassrooms.push(hydrate(store.classrooms[idx]));
    }
  }

  saveRuntimeStore(store);

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
  const store = getRuntimeStore();
  const idx = store.classrooms.findIndex((c) => c.id === validId);
  if (idx === -1) throw new NotFoundError("Classroom", validId);

  const cls = store.classrooms[idx];
  const totalWeeks = cls.totalWeeks ?? 12;
  const curriculum: CurriculumWeek[] =
    cls.curriculum && cls.curriculum.length > 0
      ? cls.curriculum.map((w) => ({ ...w }))
      : Array.from({ length: totalWeeks }, (_, i) => ({
          weekNumber: i + 1,
          title: `Bài học tuần ${i + 1}`,
        }));

  let weekObj = curriculum.find((w) => w.weekNumber === weekNumber);
  if (!weekObj) {
    weekObj = { weekNumber, title: `Bài học tuần ${weekNumber}` };
    curriculum.push(weekObj);
    curriculum.sort((a, b) => a.weekNumber - b.weekNumber);
  }

  const existingAttachments = weekObj.attachments ?? [];
  weekObj.attachments = [
    ...existingAttachments,
    {
      ...validAtt,
      classId: cls.id,
      classCode: cls.code,
      weekNumber,
    },
  ];
  weekObj.materialsCount = weekObj.attachments.length;

  const updated: ClassroomGroup = { ...cls, curriculum };
  store.classrooms[idx] = updated;
  saveRuntimeStore(store);
  return hydrate(updated);
}

export async function removeClassroomMaterial(
  classId: unknown,
  weekNumber: number,
  attachmentId: string,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, classId);
  const store = getRuntimeStore();
  const idx = store.classrooms.findIndex((c) => c.id === validId);
  if (idx === -1) throw new NotFoundError("Classroom", validId);

  const cls = store.classrooms[idx];
  if (!cls.curriculum) return hydrate(cls);

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

  const updated: ClassroomGroup = { ...cls, curriculum };
  store.classrooms[idx] = updated;
  saveRuntimeStore(store);
  return hydrate(updated);
}

export async function removeMaterialFromAllClasses(
  attachmentIdOrName: string,
): Promise<{ removed: boolean; affectedClassesCount: number }> {
  const store = getRuntimeStore();
  const searchKey = attachmentIdOrName.trim().toLowerCase();
  let affectedClassesCount = 0;

  for (let idx = 0; idx < store.classrooms.length; idx++) {
    const cls = store.classrooms[idx];
    if (!cls.curriculum) continue;

    let classMutated = false;
    const curriculum = cls.curriculum.map((w) => {
      if (w.attachments && w.attachments.length > 0) {
        const filtered = w.attachments.filter(
          (a) =>
            a.id !== attachmentIdOrName &&
            a.name.trim().toLowerCase() !== searchKey,
        );
        if (filtered.length !== w.attachments.length) {
          classMutated = true;
          return { ...w, attachments: filtered, materialsCount: filtered.length };
        }
      }
      return w;
    });

    if (classMutated) {
      store.classrooms[idx] = { ...cls, curriculum };
      affectedClassesCount++;
    }
  }

  if (affectedClassesCount > 0) {
    saveRuntimeStore(store);
  }

  return { removed: true, affectedClassesCount };
}
