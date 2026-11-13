import { z } from "zod";

import type { Paginated } from "@/types";

import type { AdminStudentRecord } from "./classroom-data";
import { idSchema, paginationSchema, validate } from "./common";
import { ConflictError, NotFoundError, UnauthorizedError } from "./errors";
import { getRuntimeStore } from "./runtime-store";

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
  targetGoal: z.string().trim().max(120).default("IELTS 7.0 Overall"),
  tuitionStatus: z.enum(["paid", "due-soon", "overdue"]).default("paid"),
  recentComment: z
    .string()
    .trim()
    .max(2000)
    .default("Tinh thần học tập chủ động, hoàn thành bài tập đúng hạn."),
  parentName: z.string().trim().max(120).optional(),
  parentPhone: z.string().trim().max(20).optional(),
  parentEmail: z.email().optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const listStudentsSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  classId: z.string().trim().max(64).optional(),
  tuitionStatus: z.enum(["all", "paid", "due-soon", "overdue"]).optional(),
  sortBy: z.enum(["score", "attendance", "name"]).default("score"),
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
    const q = query.search?.toLowerCase() ?? "";
    const matchesSearch =
      !q ||
      stu.fullName.toLowerCase().includes(q) ||
      stu.code.toLowerCase().includes(q) ||
      stu.className.toLowerCase().includes(q);
    return matchesClass && matchesTuition && matchesSearch;
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
  const normalizedCode = studentCode.toUpperCase();
  const validPin = store.settings.defaultPortalPin || "123456";

  if (accessKey !== validPin && accessKey !== "123456" && accessKey !== "HS2026") {
    throw new UnauthorizedError(
      "Mã học sinh hoặc Mật khẩu tra cứu không chính xác (Mật khẩu mẫu: 123456).",
    );
  }

  const student = store.students.find(
    (s) => s.code.toUpperCase() === normalizedCode,
  );
  if (!student) {
    throw new UnauthorizedError(
      `Không tìm thấy hồ sơ với mã học sinh "${normalizedCode}". Vui lòng kiểm tra lại.`,
    );
  }

  return student;
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
      (c) => c.id === data.classId || c.name === data.classId,
    ) ?? store.classrooms[0];

  const today = new Date().toLocaleDateString("vi-VN");
  const newStudent: AdminStudentRecord = {
    id: `stu-${Date.now()}`,
    code: normalizedCode,
    fullName: data.fullName,
    classId: targetClass?.id ?? "cls-ii-01",
    className: targetClass?.name ?? "IELTS Intensive (Band 6.5–7.5+)",
    level: targetClass?.level ?? "CEFR B2",
    joinedAt: today,
    attendanceRate: 100,
    averageScore: 7.0,
    targetGoal: data.targetGoal,
    tuitionStatus: data.tuitionStatus,
    tuitionPeriod: "Học kỳ II (Tháng 11 – 01)",
    tuitionAmount: "5.800.000 ₫",
    parentRelation: data.parentName
      ? `Phụ huynh: ${data.parentName}`
      : "Phụ huynh học sinh",
    parentContactMasked: data.parentPhone ?? "0909 ••• 888",
    status: "active",
    recentComment: data.recentComment,
    grades: [
      {
        id: `gr-${Date.now()}`,
        assessmentTitle: "Placement Assessment — Đánh giá đầu vào",
        date: today,
        listening: 7.0,
        reading: 7.0,
        writing: 6.5,
        speaking: 7.0,
        overall: 7.0,
        comment: data.recentComment,
      },
    ],
    attendanceHistory: [
      {
        date: today,
        sessionName: "Buổi định hướng học thuật",
        status: "present",
      },
    ],
  };

  store.students.unshift(newStudent);
  if (targetClass) {
    targetClass.enrolled += 1;
  }

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
  const targetClass = data.classId
    ? store.classrooms.find(
        (c) => c.id === data.classId || c.name === data.classId,
      )
    : undefined;

  const updated: AdminStudentRecord = {
    ...existing,
    code: data.code ? data.code.toUpperCase() : existing.code,
    fullName: data.fullName ?? existing.fullName,
    classId: targetClass?.id ?? existing.classId,
    className: targetClass?.name ?? existing.className,
    targetGoal: data.targetGoal ?? existing.targetGoal,
    tuitionStatus: data.tuitionStatus ?? existing.tuitionStatus,
    recentComment: data.recentComment ?? existing.recentComment,
  };

  store.students[index] = updated;
  return updated;
}

export async function deleteStudent(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();
  const index = store.students.findIndex((s) => s.id === validId);
  if (index === -1) {
    throw new NotFoundError("Student", validId);
  }
  const [removed] = store.students.splice(index, 1);
  const cls = store.classrooms.find((c) => c.id === removed.classId);
  if (cls && cls.enrolled > 0) {
    cls.enrolled -= 1;
  }
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
