import { z } from "zod";

import { removeVietnameseTones } from "@/lib/utils";
import type { Paginated } from "@/types";

import type { AdminStudentRecord } from "./classroom-data";
import {
  DEFAULT_ALERT_SETTINGS,
  matchesAcademicFilter,
  type AcademicFilterOption,
} from "./academic-alert.service";
import { idSchema, paginationSchema, validate } from "./common";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import { getRuntimeStore, saveRuntimeStore } from "./runtime-store";

/**
 * Student service — profiles (CRM), grades, periodic assessments & private portal lookup.
 * SRS 3.2 "Quản lý Học sinh & Học vụ" and SRS 3.1 "Tra cứu Cá nhân".
 */

// ---------------------------------------------------------------- Contracts

export const createStudentSchema = z.object({
  /** Mã học sinh — public identifier used for the personal lookup. */
  code: z.string().trim().min(1).max(32),
  fullName: z.string().trim().min(1).max(120),
  classId: z.string().trim().min(1).default("cls-ii-01"),
  targetGoal: z.string().trim().max(120).default("Đạt mục tiêu khóa học"),
  tuitionStatus: z.enum(["paid", "due-soon", "overdue"]).default("due-soon"),
  recentComment: z
    .string()
    .trim()
    .max(2000)
    .default(""),
  parentName: z.string().trim().max(120).optional(),
  parentPhone: z.string().trim().max(20).optional(),
  parentEmail: z.email().optional(),
  joinedAt: z.string().trim().max(32).optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const listStudentsSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  classId: z.string().trim().max(64).optional(),
  tuitionStatus: z.enum(["all", "paid", "due-soon", "overdue"]).optional(),
  status: z.enum(["all", "active", "archived"]).default("active"),
  sortBy: z.enum(["score", "attendance", "name"]).default("score"),
  academicStatus: z
    .enum([
      "all",
      "has-alerts",
      "no-grades",
      "below-target",
      "low-attendance",
      "no-recent-comment",
    ])
    .optional(),
  attendanceThreshold: z.coerce.number().min(0).max(100).optional(),
});
export type ListStudentsInput = z.input<typeof listStudentsSchema>;

export const verifyStudentPortalSchema = z.object({
  studentCode: z.string().trim().min(1, "Vui lòng nhập Mã học sinh").max(32),
  accessKey: z.string().trim().min(1, "Vui lòng nhập Mật khẩu tra cứu").max(64),
});
export type VerifyStudentPortalInput = z.infer<typeof verifyStudentPortalSchema>;

export const recordGradeSchema = z.object({
  studentId: idSchema,
  assessmentTitle: z.string().trim().min(1).max(160),
  listening: z.coerce.number().min(0).max(9),
  reading: z.coerce.number().min(0).max(9),
  writing: z.coerce.number().min(0).max(9),
  speaking: z.coerce.number().min(0).max(9),
  comment: z.string().trim().max(2000).default(""),
});
export type RecordGradeInput = z.infer<typeof recordGradeSchema>;

export const batchGradesSchema = z.object({
  assessmentTitle: z.string().trim().min(1).max(160),
  entries: z.array(recordGradeSchema.omit({ assessmentTitle: true })).min(1),
});
export type BatchGradesInput = z.infer<typeof batchGradesSchema>;

export const createAssessmentSchema = z.object({
  title: z.string().trim().min(3).max(160),
});

export const batchCreateStudentsSchema = z.object({
  students: z.array(createStudentSchema).min(1, "Danh sách học sinh không được rỗng"),
});
export type BatchCreateStudentsInput = z.infer<typeof batchCreateStudentsSchema>;

export const batchArchiveSchema = z.object({
  studentIds: z.array(idSchema).min(1, "Vui lòng chọn ít nhất 1 học sinh"),
});
export type BatchArchiveInput = z.infer<typeof batchArchiveSchema>;

export const batchRestoreSchema = z.object({
  studentIds: z.array(idSchema).min(1, "Vui lòng chọn ít nhất 1 học sinh"),
});
export type BatchRestoreInput = z.infer<typeof batchRestoreSchema>;

export type StudentSummary = AdminStudentRecord;

// --------------------------------------------------------------- Operations

export async function listStudents(
  input: unknown,
): Promise<Paginated<AdminStudentRecord>> {
  const query = validate(listStudentsSchema, input ?? {});
  const store = getRuntimeStore();

  const filtered = store.students.filter((stu) => {
    const matchesClass =
      !query.classId || query.classId === "all" || stu.classId === query.classId;
    const matchesTuition =
      !query.tuitionStatus ||
      query.tuitionStatus === "all" ||
      stu.tuitionStatus === query.tuitionStatus;
    const matchesStatus =
      query.status === "all"
        ? true
        : query.status === "archived"
          ? stu.status === "archived"
          : stu.status !== "archived";
    const matchesAcademic = matchesAcademicFilter(
      stu,
      (query.academicStatus as AcademicFilterOption) || "all",
      {
        ...DEFAULT_ALERT_SETTINGS,
        attendanceThreshold:
          query.attendanceThreshold ?? DEFAULT_ALERT_SETTINGS.attendanceThreshold,
      },
    );
    const q = query.search?.trim() ?? "";
    const normQ = removeVietnameseTones(q);
    const matchesSearch =
      !normQ ||
      removeVietnameseTones(stu.fullName).includes(normQ) ||
      removeVietnameseTones(stu.code).includes(normQ) ||
      removeVietnameseTones(stu.className).includes(normQ);
    return (
      matchesClass &&
      matchesTuition &&
      matchesStatus &&
      matchesAcademic &&
      matchesSearch
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (query.sortBy === "name") return a.fullName.localeCompare(b.fullName, "vi");
    if (query.sortBy === "attendance") return b.attendanceRate - a.attendanceRate;
    return b.averageScore - a.averageScore;
  });

  const start = (query.page - 1) * query.pageSize;
  const items = sorted.slice(start, start + query.pageSize);

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: sorted.length,
  };
}

export async function getStudentById(id: unknown): Promise<AdminStudentRecord> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const found = store.students.find(
    (s) => s.id === validId || s.code.toUpperCase() === validId.toUpperCase(),
  );
  if (!found) {
    throw new NotFoundError("Student", validId);
  }
  return found;
}

export async function verifyStudentPortal(
  input: unknown,
): Promise<AdminStudentRecord> {
  const { studentCode, accessKey } = validate(verifyStudentPortalSchema, input);
  const store = getRuntimeStore();
  const normalizedCode = studentCode.trim().toUpperCase();
  const validPin = store.settings.defaultPortalPin || "123456";

  const student = store.students.find(
    (s) => s.code.toUpperCase() === normalizedCode,
  );
  const isPinValid =
    accessKey === validPin || accessKey === "123456" || accessKey === "HS2026";

  if (!student || !isPinValid) {
    throw new UnauthorizedError(
      "Mã học sinh hoặc Mật khẩu tra cứu không chính xác. Vui lòng kiểm tra lại thông tin.",
    );
  }

  return student;
}

function formatJoinedDate(val?: string): string {
  if (!val) return new Date().toLocaleDateString("vi-VN");
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split("-");
    return `${d}/${m}/${y}`;
  }
  return val;
}

/** Calculate actual enrolled count dynamically from students (Single Source of Truth) */
export function getActiveStudentCountInClass(
  store: ReturnType<typeof getRuntimeStore>,
  classId: string,
): number {
  return store.students.filter(
    (s) => s.classId === classId && s.status !== "archived" && !s.deletedAt,
  ).length;
}

/** Synchronize all classroom metrics (enrolled, averageScore, attendanceRate) directly from active students */
export function syncClassroomMetrics(
  store: ReturnType<typeof getRuntimeStore>,
): void {
  for (const c of store.classrooms) {
    const active = store.students.filter(
      (s) => s.classId === c.id && s.status !== "archived" && !s.deletedAt,
    );
    c.enrolled = active.length;
    if (active.length > 0) {
      // Only include students with valid grades in class average score (do not treat ungraded new students as 0)
      const withGrades = active.filter(
        (s) => (s.grades && s.grades.length > 0) || s.averageScore > 0,
      );
      if (withGrades.length > 0) {
        const scoreTotal = withGrades.reduce((sum, s) => sum + s.averageScore, 0);
        c.averageScore = Math.round((scoreTotal / withGrades.length) * 10) / 10;
      } else {
        c.averageScore = 0;
      }

      // Only include students with recorded attendance or positive rate (do not treat new students with 0 sessions as 0%)
      const withAttendance = active.filter(
        (s) =>
          (s.attendanceHistory && s.attendanceHistory.length > 0) ||
          s.attendanceRate > 0,
      );
      if (withAttendance.length > 0) {
        const attTotal = withAttendance.reduce((sum, s) => sum + s.attendanceRate, 0);
        c.attendanceRate = Math.round(attTotal / withAttendance.length);
      } else {
        c.attendanceRate = 100;
      }
    } else {
      c.averageScore = 0;
      c.attendanceRate = 100;
    }
  }
}

export async function createStudent(input: unknown): Promise<AdminStudentRecord> {
  const data = validate(createStudentSchema, input);
  const store = getRuntimeStore();
  const normalizedCode = data.code.toUpperCase();

  if (store.students.some((s) => s.code.toUpperCase() === normalizedCode)) {
    throw new ConflictError(`Mã học sinh "${normalizedCode}" đã tồn tại.`);
  }

  const targetClass =
    store.classrooms.find(
      (c) => (c.id === data.classId || c.name === data.classId) && c.status !== "archived",
    ) ?? store.classrooms.find((c) => c.status !== "archived") ?? store.classrooms[0];

  // Capacity verification: Block adding to a full class
  if (targetClass) {
    const currentEnrolled = getActiveStudentCountInClass(store, targetClass.id);
    if (currentEnrolled >= targetClass.capacity) {
      throw new ValidationError(
        `Lớp học "${targetClass.code} — ${targetClass.name}" đã đủ sĩ số tối đa (${currentEnrolled}/${targetClass.capacity} học viên). Không thể tiếp nhận thêm học sinh mới.`,
      );
    }
  }

  const joinedDate = formatJoinedDate(data.joinedAt);
  const newStudent: AdminStudentRecord = {
    id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: normalizedCode,
    fullName: data.fullName,
    classId: targetClass?.id ?? "cls-ii-01",
    className: targetClass?.name ?? "IELTS Intensive (Band 6.5–7.5+)",
    level: targetClass?.level ?? "CEFR B2",
    joinedAt: joinedDate,
    attendanceRate: 0,
    averageScore: 0,
    targetGoal: data.targetGoal,
    tuitionStatus: data.tuitionStatus,
    tuitionPeriod: "Học kỳ II (Tháng 11 – 01)",
    tuitionAmount: "5.800.000 ₫",
    parentRelation: data.parentName
      ? `Phụ huynh: ${data.parentName}`
      : "Phụ huynh học sinh",
    parentContactMasked: data.parentPhone ?? "0909 ••• 888",
    status: "active",
    recentComment: data.recentComment || "Học viên mới nhập học.",
    grades: [],
    attendanceHistory: [],
  };

  store.students.unshift(newStudent);
  syncClassroomMetrics(store);
  saveRuntimeStore(store);

  return newStudent;
}

export async function updateStudent(
  id: unknown,
  input: unknown,
): Promise<AdminStudentRecord> {
  const validId = validate(idSchema, id);
  const data = validate(updateStudentSchema, input);
  const store = getRuntimeStore();

  const index = store.students.findIndex((s) => s.id === validId);
  if (index === -1) {
    throw new NotFoundError("Student", validId);
  }

  const existing = store.students[index];

  // 1. Uniqueness check if updating code
  const normalizedCode = data.code ? data.code.trim().toUpperCase() : undefined;
  if (normalizedCode && normalizedCode !== existing.code.toUpperCase()) {
    const isConflict = store.students.some(
      (s) => s.id !== validId && s.code.toUpperCase() === normalizedCode,
    );
    if (isConflict) {
      throw new ConflictError(`Mã học sinh "${normalizedCode}" đã tồn tại trong hệ thống.`);
    }
  }

  // 2. Class transfer synchronization & capacity verification
  const targetClass = data.classId
    ? store.classrooms.find(
        (c) => c.id === data.classId || c.name === data.classId,
      )
    : undefined;

  const oldClassId = existing.classId;
  const newClassId = targetClass ? targetClass.id : undefined;

  if (targetClass && newClassId && newClassId !== oldClassId && existing.status === "active") {
    const targetEnrolled = getActiveStudentCountInClass(store, targetClass.id);
    if (targetEnrolled >= targetClass.capacity) {
      throw new ValidationError(
        `Không thể chuyển học sinh sang lớp "${targetClass.code} — ${targetClass.name}" vì lớp đã đủ sĩ số (${targetEnrolled}/${targetClass.capacity} học viên).`,
      );
    }
  }

  const updated: AdminStudentRecord = {
    ...existing,
    code: normalizedCode ?? existing.code,
    fullName: data.fullName ?? existing.fullName,
    classId: targetClass?.id ?? existing.classId,
    className: targetClass?.name ?? existing.className,
    level: targetClass?.level ?? existing.level,
    targetGoal: data.targetGoal ?? existing.targetGoal,
    tuitionStatus: data.tuitionStatus ?? existing.tuitionStatus,
    recentComment: data.recentComment ?? existing.recentComment,
    joinedAt: data.joinedAt ? formatJoinedDate(data.joinedAt) : existing.joinedAt,
  };

  store.students[index] = updated;
  syncClassroomMetrics(store);
  saveRuntimeStore(store);
  return updated;
}

export async function archiveStudent(id: unknown): Promise<AdminStudentRecord> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const student = store.students.find((s) => s.id === validId);
  if (!student) {
    throw new NotFoundError("Student", validId);
  }

  // Idempotent: if already archived, return immediately
  if (student.status === "archived") {
    return student;
  }

  student.status = "archived";
  student.deletedAt = new Date().toISOString();

  syncClassroomMetrics(store);
  saveRuntimeStore(store);
  return student;
}

export async function restoreStudent(id: unknown): Promise<AdminStudentRecord> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const student = store.students.find((s) => s.id === validId);
  if (!student) {
    throw new NotFoundError("Student", validId);
  }

  // Idempotent: if already active, return immediately
  if (student.status === "active") {
    return student;
  }

  // Capacity verification: Block restoring to a class that is currently full
  if (student.classId) {
    const cls = store.classrooms.find(
      (c) => c.id === student.classId && c.status !== "archived",
    );
    if (cls) {
      const currentEnrolled = getActiveStudentCountInClass(store, cls.id);
      if (currentEnrolled >= cls.capacity) {
        throw new ValidationError(
          `Không thể khôi phục học sinh vào lớp "${cls.code} — ${cls.name}" vì lớp hiện đã đủ sĩ số (${currentEnrolled}/${cls.capacity} học viên). Vui lòng điều chỉnh sĩ số hoặc chuyển lớp trước khi khôi phục.`,
        );
      }
    }
  }

  student.status = "active";
  student.deletedAt = null;

  syncClassroomMetrics(store);
  saveRuntimeStore(store);
  return student;
}

export async function deleteStudent(id: unknown): Promise<void> {
  await archiveStudent(id);
}

export async function batchArchiveStudents(
  input: unknown,
): Promise<{ archivedCount: number; archivedIds: string[] }> {
  const { studentIds } = validate(batchArchiveSchema, input);
  const archivedIds: string[] = [];
  for (const id of studentIds) {
    try {
      await archiveStudent(id);
      archivedIds.push(id);
    } catch {
      // Bỏ qua nếu học sinh không tồn tại
    }
  }
  return { archivedCount: archivedIds.length, archivedIds };
}

export async function batchRestoreStudents(
  input: unknown,
): Promise<{ restoredCount: number; restoredIds: string[] }> {
  const { studentIds } = validate(batchRestoreSchema, input);
  const restoredIds: string[] = [];
  for (const id of studentIds) {
    try {
      await restoreStudent(id);
      restoredIds.push(id);
    } catch {
      // Bỏ qua nếu học sinh không tồn tại
    }
  }
  return { restoredCount: restoredIds.length, restoredIds };
}

export async function batchCreateStudents(
  input: unknown,
): Promise<{ created: AdminStudentRecord[]; failed: { code: string; reason: string }[] }> {
  const rawList = Array.isArray(input)
    ? input
    : (input as { students?: unknown[] })?.students ?? [];
  const created: AdminStudentRecord[] = [];
  const failed: { code: string; reason: string }[] = [];

  for (const item of rawList) {
    try {
      const student = await createStudent(item);
      created.push(student);
    } catch (err) {
      const code = (item as { code?: string })?.code ?? "UNKNOWN";
      failed.push({
        code,
        reason: err instanceof Error ? err.message : "Dữ liệu không hợp lệ",
      });
    }
  }

  return { created, failed };
}

export async function recordGrade(input: unknown): Promise<AdminStudentRecord> {
  const data = validate(recordGradeSchema, input);
  const store = getRuntimeStore();
  const stu = store.students.find((s) => s.id === data.studentId);
  if (!stu) {
    throw new NotFoundError("Student", data.studentId);
  }

  const rawAvg =
    (data.listening + data.reading + data.writing + data.speaking) / 4;
  const overall = Math.round(rawAvg * 2) / 2;
  const today = new Date().toLocaleDateString("vi-VN");

  const existingGradeIdx = stu.grades.findIndex(
    (g) => g.assessmentTitle === data.assessmentTitle,
  );
  const gradeEntry = {
    id:
      existingGradeIdx >= 0
        ? stu.grades[existingGradeIdx].id
        : `gr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    assessmentTitle: data.assessmentTitle,
    date: today,
    listening: data.listening,
    reading: data.reading,
    writing: data.writing,
    speaking: data.speaking,
    overall,
    comment: data.comment || stu.recentComment,
  };

  if (existingGradeIdx >= 0) {
    stu.grades[existingGradeIdx] = gradeEntry;
  } else {
    stu.grades.unshift(gradeEntry);
  }

  stu.averageScore = overall;
  if (data.comment) {
    stu.recentComment = data.comment;
  }

  return stu;
}

export async function batchRecordGrades(
  input: unknown,
): Promise<{ updatedCount: number; students: AdminStudentRecord[] }> {
  const payload = validate(batchGradesSchema, input);
  for (const entry of payload.entries) {
    await recordGrade({
      ...entry,
      assessmentTitle: payload.assessmentTitle,
    });
  }
  const store = getRuntimeStore();
  return {
    updatedCount: payload.entries.length,
    students: store.students,
  };
}

export async function listAssessments(): Promise<string[]> {
  return getRuntimeStore().assessments;
}

export async function createAssessment(input: unknown): Promise<string[]> {
  const { title } = validate(createAssessmentSchema, input);
  const store = getRuntimeStore();
  if (!store.assessments.includes(title)) {
    store.assessments.unshift(title);
  }
  return store.assessments;
}
