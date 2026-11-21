import crypto from "node:crypto";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { removeVietnameseTones } from "@/lib/utils";
import type { Paginated } from "@/types";

import {
  DEFAULT_ALERT_SETTINGS,
  getStudentAcademicAlerts,
  matchesAcademicFilter,
  type AcademicFilterOption,
} from "./academic-alert.service";
import { idSchema, normalizeDateToIso, paginationSchema, validate } from "./common";
import type {
  AdminStudentRecord,
  CommunicationLogEntry,
  TuitionPaymentRecord,
} from "./domain-types";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import {
  computeIeltsOverall,
  formatGradeDateVi,
  parseGradeDateToIso,
  type AssessmentSummaryItem,
  type GradeAuditEntry,
} from "./grade-helpers";
import {
  mapPrismaStudent,
  toPrismaStudentStatus,
  toPrismaTuitionStatus,
} from "./prisma-mappers";
import {
  formatVnd,
  maskPhoneNumber,
  parseVndAmount,
  type StudentsSummaryStats,
} from "./student-helpers";
export type { StudentsSummaryStats };

/**
 * Student service — profiles (CRM), grades, periodic assessments & private portal lookup.
 * Backed 100% by PostgreSQL / Prisma.
 */

// ---------------------------------------------------------------- Contracts

const studentCoreShape = {
  /** Mã học sinh — public identifier used for the personal lookup. */
  code: z.string().trim().min(1).max(32),
  fullName: z.string().trim().min(1).max(120),
  classId: z.string().trim().min(1),
  status: z.enum(["active", "trial", "on-leave", "archived"]),
  targetGoal: z.string().trim().max(120),
  entryBand: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(0).max(9).optional(),
  ),
  tuitionStatus: z.enum(["paid", "due-soon", "overdue"]),
  tuitionDueDate: z.string().trim().max(50).optional(),
  tuitionAmount: z.string().trim().max(50).optional(),
  tuitionPeriod: z.string().trim().max(120).optional(),
  recentComment: z.string().trim().max(2000),
  privateNote: z.string().trim().max(2000).optional(),
  parentRelation: z.string().trim().max(120).optional(),
  parentName: z.string().trim().max(120).optional(),
  parentPhone: z.string().trim().max(20).optional(),
  parentEmail: z.union([z.email(), z.literal("")]).optional(),
  parentNote: z.string().trim().max(500).optional(),
  joinedAt: z.string().trim().max(32).optional(),
  portalPin: z
    .string()
    .trim()
    .min(4, "Mã PIN cá nhân tối thiểu 4 ký tự.")
    .max(32, "Mã PIN cá nhân tối đa 32 ký tự.")
    .optional(),
  leaveStartDate: z.string().trim().max(32).optional(),
  leaveReturnDate: z.string().trim().max(32).optional(),
  leaveReason: z.string().trim().max(500).optional(),
  transferReason: z.string().trim().max(500).optional(),
};

export const createStudentSchema = z.object({
  ...studentCoreShape,
  classId: studentCoreShape.classId.default("cls-ii-01"),
  status: studentCoreShape.status.default("active"),
  targetGoal: studentCoreShape.targetGoal.default("Đạt mục tiêu khóa học"),
  tuitionStatus: studentCoreShape.tuitionStatus.default("due-soon"),
  recentComment: studentCoreShape.recentComment.default(""),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z.object(studentCoreShape).partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const listStudentsSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  classId: z.string().trim().max(64).optional(),
  tuitionStatus: z.enum(["all", "paid", "due-soon", "overdue"]).optional(),
  status: z
    .enum(["all", "non-archived", "active", "trial", "on-leave", "archived"])
    .default("non-archived"),
  sortBy: z.enum(["score", "attendance", "name", "tuitionDueDate"]).default("score"),
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
  date: z.string().trim().max(32).optional(),
  listening: z.coerce.number().min(0).max(9),
  reading: z.coerce.number().min(0).max(9),
  writing: z.coerce.number().min(0).max(9),
  speaking: z.coerce.number().min(0).max(9),
  comment: z.string().trim().max(2000).default(""),
  privateNote: z.string().trim().max(2000).optional(),
  status: z.enum(["published", "draft"]).default("published"),
  reason: z.string().trim().max(300).optional(),
});
export type RecordGradeInput = z.infer<typeof recordGradeSchema>;

export const batchGradesSchema = z.object({
  assessmentTitle: z.string().trim().min(1).max(160),
  date: z.string().trim().max(32).optional(),
  status: z.enum(["published", "draft"]).optional(),
  reason: z.string().trim().max(300).optional(),
  entries: z.array(recordGradeSchema.omit({ assessmentTitle: true })).min(1),
});
export type BatchGradesInput = z.infer<typeof batchGradesSchema>;

export const createAssessmentSchema = z.object({
  title: z.string().trim().min(3).max(160),
});

export const renameAssessmentSchema = z.object({
  oldTitle: z.string().trim().min(1).max(160),
  newTitle: z.string().trim().min(3).max(160),
});

export const deleteAssessmentSchema = z.object({
  title: z.string().trim().min(1).max(160),
});

export const publishAssessmentSchema = z.object({
  assessmentTitle: z.string().trim().min(1).max(160),
  classId: idSchema.optional(),
});

export const deleteGradeSchema = z.object({
  studentId: idSchema,
  gradeId: idSchema,
  reason: z.string().trim().max(300).optional(),
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

export const batchTransferSchema = z.object({
  studentIds: z.array(idSchema).min(1, "Vui lòng chọn ít nhất 1 học sinh"),
  targetClassId: idSchema,
  reason: z.string().trim().max(500).optional(),
});
export type BatchTransferInput = z.infer<typeof batchTransferSchema>;

export const recordTuitionPaymentSchema = z.object({
  paymentId: z.string().trim().max(64).optional(),
  period: z.string().trim().min(1, "Vui lòng nhập kỳ học phí").max(120),
  baseAmount: z.coerce.number().min(0),
  discountAmount: z.coerce.number().min(0).default(0),
  paidAmount: z.coerce.number().min(0),
  dueDate: z.string().trim().min(1).max(32),
  paidAt: z.string().trim().max(32).optional(),
  method: z.enum(["transfer", "cash", "other"]).default("transfer"),
  note: z.string().trim().max(500).optional(),
});
export type RecordTuitionPaymentInput = z.infer<typeof recordTuitionPaymentSchema>;

export const addCommunicationLogSchema = z.object({
  date: z.string().trim().max(32).optional(),
  channel: z.enum(["zalo", "phone", "email", "in-person"]).default("zalo"),
  category: z.enum(["academic", "tuition", "attendance", "general"]).default("general"),
  summary: z.string().trim().min(1, "Vui lòng nhập nội dung trao đổi").max(1500),
  parentResponse: z.string().trim().max(1000).optional(),
  nextFollowUpDate: z.string().trim().max(32).optional(),
  loggedBy: z.string().trim().max(120).optional(),
});
export type AddCommunicationLogInput = z.infer<typeof addCommunicationLogSchema>;

export type StudentSummary = AdminStudentRecord;

// --------------------------------------------------------------- Security Helpers

export function hashPortalPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPortalPinHash(pin: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hexDigest] = parts;
  if (!salt || !hexDigest) return false;
  try {
    const expected = Buffer.from(hexDigest, "hex");
    const actual = crypto.scryptSync(pin, salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash("sha256").update(a, "utf8").digest();
  const digestB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

// --------------------------------------------------------------- Prisma Helpers

const STUDENT_INCLUDE = {
  grades: { orderBy: [{ createdAt: "desc" as const }, { id: "asc" as const }] },
  attendanceHistory: { orderBy: [{ date: "desc" as const }, { createdAt: "desc" as const }] },
  tuitionPayments: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] },
  communicationLogs: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] },
  classTransfers: { orderBy: [{ changedAt: "desc" as const }, { id: "desc" as const }] },
  gradeChangeHistory: { orderBy: [{ changedAt: "desc" as const }, { id: "desc" as const }] },
};

type DbClient = Prisma.TransactionClient | typeof prisma;

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

async function getClassNameMap(
  client: DbClient = prisma,
): Promise<Map<string, string>> {
  const classes = await client.classroom.findMany({
    select: { id: true, name: true },
  });
  return new Map(classes.map((c) => [c.id, c.name]));
}

async function getTeacherNameTx(tx: Prisma.TransactionClient): Promise<string> {
  const setting = await tx.teacherSetting.findUnique({
    where: { id: "default" },
    select: { name: true },
  });
  return setting?.name || "ThS. Nguyễn Minh Anh";
}

async function generateUniqueReceiptCodeTx(
  tx: Prisma.TransactionClient,
  todayIso: string,
): Promise<string> {
  const rows = await tx.tuitionPayment.findMany({
    where: { receiptCode: { not: null } },
    select: { receiptCode: true },
  });
  const existingCodes = new Set<string>();
  for (const r of rows) {
    if (r.receiptCode) existingCodes.add(r.receiptCode);
  }
  const prefix = `PT-${todayIso.slice(2, 4)}${todayIso.slice(5, 7)}-`;
  let seq = existingCodes.size + 1;
  while (existingCodes.has(`${prefix}${String(seq).padStart(3, "0")}`)) {
    seq += 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

async function syncClassroomMetricsTx(
  tx: Prisma.TransactionClient,
  classroomIds?: string[],
): Promise<void> {
  const targetClasses = await tx.classroom.findMany({
    where:
      classroomIds && classroomIds.length > 0
        ? { id: { in: Array.from(new Set(classroomIds)) } }
        : undefined,
    select: { id: true },
  });
  if (targetClasses.length === 0) return;

  const ids = targetClasses.map((c) => c.id);
  const activeStudents = await tx.student.findMany({
    where: {
      classroomId: { in: ids },
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

  for (const classId of ids) {
    const active = byClass.get(classId) ?? [];
    let averageScore = 0;
    let attendanceRate = 100;

    if (active.length > 0) {
      const withGrades = active.filter(
        (s) =>
          s.grades.some((g) => g.status !== "draft") ||
          (s.grades.length === 0 && s.averageScore > 0),
      );
      if (withGrades.length > 0) {
        const scoreTotal = withGrades.reduce(
          (sum, s) => sum + s.averageScore,
          0,
        );
        averageScore = Math.round((scoreTotal / withGrades.length) * 10) / 10;
      }

      const withAttendance = active.filter(
        (s) => s._count.attendanceHistory > 0 || s.attendanceRate > 0,
      );
      if (withAttendance.length > 0) {
        const attTotal = withAttendance.reduce(
          (sum, s) => sum + s.attendanceRate,
          0,
        );
        attendanceRate = Math.round(attTotal / withAttendance.length);
      }
    }

    await tx.classroom.update({
      where: { id: classId },
      data: {
        enrolled: active.length,
        averageScore,
        attendanceRate,
      },
    });
  }
}

async function recalculateStudentPublishedAverageTx(
  tx: Prisma.TransactionClient,
  studentId: string,
): Promise<number> {
  const grades = await tx.gradeRecord.findMany({
    where: { studentId, status: { not: "draft" } },
    select: { overall: true, date: true },
  });
  const sorted = [...grades].sort((a, b) =>
    parseGradeDateToIso(b.date).localeCompare(parseGradeDateToIso(a.date)),
  );
  const nextAverage = sorted.length > 0 ? sorted[0].overall : 0;
  await tx.student.update({
    where: { id: studentId },
    data: { averageScore: nextAverage },
  });
  return nextAverage;
}

function classifyAssessmentCategory(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("essay") || lower.includes("writing")) {
    return "writing-task";
  }
  if (lower.includes("mid-term") || lower.includes("progress")) {
    return "progress-check";
  }
  return "mock-test";
}

function formatJoinedDate(val?: string): string {
  if (!val) return new Date().toLocaleDateString("vi-VN");
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split("-");
    return `${d}/${m}/${y}`;
  }
  return val;
}

// --------------------------------------------------------------- Operations

export function sanitizeStudentForPortal(
  student: AdminStudentRecord,
): AdminStudentRecord {
  const safe = structuredClone(student);
  delete safe.portalPinHash;
  delete safe.privateNote;
  delete safe.parentPhone;
  delete safe.parentEmail;
  delete safe.parentNote;
  delete safe.communicationLogs;
  safe.grades = (safe.grades ?? [])
    .filter((g) => (g.status ?? "published") !== "draft")
    .map((g) => {
      const cleaned = { ...g };
      delete cleaned.privateNote;
      return cleaned;
    });
  return safe;
}

/** Returns un-truncated list of students for aggregation, attendance & grading workspaces. */
export async function listAllStudents(options?: {
  classId?: string;
  status?: "all" | "non-archived" | "active";
}): Promise<AdminStudentRecord[]> {
  const statusMode = options?.status ?? "non-archived";
  const [rows, classMap] = await Promise.all([
    prisma.student.findMany({
      where: {
        ...(options?.classId && options.classId !== "all"
          ? { classroomId: options.classId }
          : {}),
        ...(statusMode === "non-archived"
          ? { status: { not: "archived" }, deletedAt: null }
          : statusMode === "active"
            ? { status: "active", deletedAt: null }
            : {}),
      },
      include: STUDENT_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    getClassNameMap(),
  ]);

  return rows.map((r) => mapPrismaStudent(r, classMap));
}

export async function listStudents(
  input: unknown,
): Promise<Paginated<AdminStudentRecord>> {
  const query = validate(listStudentsSchema, input ?? {});
  const [rows, classMap] = await Promise.all([
    prisma.student.findMany({
      where: {
        ...(query.classId && query.classId !== "all"
          ? { classroomId: query.classId }
          : {}),
        ...(query.tuitionStatus && query.tuitionStatus !== "all"
          ? {
              tuitionStatus: toPrismaTuitionStatus(query.tuitionStatus),
            }
          : {}),
        ...(query.status === "all"
          ? {}
          : query.status === "non-archived"
            ? { status: { not: "archived" } }
            : { status: toPrismaStudentStatus(query.status) }),
      },
      include: STUDENT_INCLUDE,
    }),
    getClassNameMap(),
  ]);

  const mapped = rows.map((r) => mapPrismaStudent(r, classMap));

  const filtered = mapped.filter((stu) => {
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
      removeVietnameseTones(stu.className).includes(normQ) ||
      (stu.parentName ? removeVietnameseTones(stu.parentName).includes(normQ) : false) ||
      (stu.parentPhone ? stu.parentPhone.includes(q) : false) ||
      removeVietnameseTones(stu.targetGoal).includes(normQ);

    return matchesAcademic && matchesSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (query.sortBy === "name") return a.fullName.localeCompare(b.fullName, "vi");
    if (query.sortBy === "attendance") return b.attendanceRate - a.attendanceRate;
    if (query.sortBy === "tuitionDueDate") {
      return (a.tuitionDueDate || "9999-12-31").localeCompare(
        b.tuitionDueDate || "9999-12-31",
      );
    }
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

export async function getStudentsSummary(
  attendanceThreshold: number = DEFAULT_ALERT_SETTINGS.attendanceThreshold,
): Promise<StudentsSummaryStats> {
  const all = await listAllStudents({ status: "all" });
  const nonArchived = all.filter((s) => s.status !== "archived");

  const withScore = nonArchived.filter(
    (s) => s.grades.length > 0 && s.averageScore > 0,
  );
  const avgIeltsScore =
    withScore.length > 0
      ? (
          withScore.reduce((sum, s) => sum + s.averageScore, 0) / withScore.length
        ).toFixed(1)
      : "—";

  const highAchieversCount = nonArchived.filter((s) => s.averageScore >= 8.0).length;

  const withAttendance = nonArchived.filter(
    (s) => s.attendanceHistory.length > 0,
  );
  const avgAttendanceRate =
    withAttendance.length > 0
      ? (
          withAttendance.reduce((sum, s) => sum + s.attendanceRate, 0) /
          withAttendance.length
        ).toFixed(1)
      : "100.0";

  const dueSoonCount = nonArchived.filter(
    (s) => s.tuitionStatus === "due-soon" && s.status !== "trial",
  ).length;
  const overdueCount = nonArchived.filter(
    (s) =>
      s.tuitionStatus === "overdue" &&
      s.status !== "trial" &&
      s.status !== "on-leave",
  ).length;

  const settings = { ...DEFAULT_ALERT_SETTINGS, attendanceThreshold };
  const alertsCount = nonArchived.filter(
    (s) => getStudentAcademicAlerts(s, settings).length > 0,
  ).length;

  return {
    totalAll: all.length,
    totalNonArchived: nonArchived.length,
    totalActive: all.filter((s) => s.status === "active").length,
    totalTrial: all.filter((s) => s.status === "trial").length,
    totalOnLeave: all.filter((s) => s.status === "on-leave").length,
    totalArchived: all.filter((s) => s.status === "archived").length,
    avgIeltsScore,
    highAchieversCount,
    avgAttendanceRate,
    dueSoonCount,
    overdueCount,
    totalTuitionAlerts: dueSoonCount + overdueCount,
    alertsCount,
  };
}

export async function getStudentById(id: unknown): Promise<AdminStudentRecord> {
  const validId = validate(idSchema, id);
  const [found, classMap] = await Promise.all([
    prisma.student.findFirst({
      where: {
        OR: [
          { id: validId },
          { code: { equals: validId, mode: "insensitive" } },
        ],
      },
      include: STUDENT_INCLUDE,
    }),
    getClassNameMap(),
  ]);
  if (!found) {
    throw new NotFoundError("Student", validId);
  }
  return mapPrismaStudent(found, classMap);
}

export async function setStudentPortalPin(
  studentId: unknown,
  pin: unknown,
): Promise<{ studentId: string; hasPersonalPin: true }> {
  const validId = validate(idSchema, studentId);
  const validPin = validate(
    z
      .string()
      .trim()
      .min(4, "Mã PIN cá nhân tối thiểu 4 ký tự.")
      .max(32, "Mã PIN cá nhân tối đa 32 ký tự."),
    pin,
  );
  const stu = await prisma.student.findUnique({
    where: { id: validId },
    select: { id: true },
  });
  if (!stu) {
    throw new NotFoundError("Student", validId);
  }
  await prisma.student.update({
    where: { id: validId },
    data: { accessPinHash: hashPortalPin(validPin) },
  });
  return { studentId: stu.id, hasPersonalPin: true };
}

export async function verifyStudentPortal(
  input: unknown,
): Promise<AdminStudentRecord> {
  const { studentCode, accessKey } = validate(verifyStudentPortalSchema, input);
  const normalizedCode = studentCode.trim().toUpperCase();

  const [setting, student, classMap] = await Promise.all([
    prisma.teacherSetting.findUnique({
      where: { id: "default" },
      select: { defaultPortalPin: true },
    }),
    prisma.student.findFirst({
      where: { code: { equals: normalizedCode, mode: "insensitive" } },
      include: STUDENT_INCLUDE,
    }),
    getClassNameMap(),
  ]);

  const fallbackDefaultPin = setting?.defaultPortalPin || "123456";
  const mapped = student ? mapPrismaStudent(student, classMap) : null;

  // Never allow archived/deleted students into the public lookup portal
  const isBlockedStudent =
    !mapped || mapped.status === "archived" || Boolean(mapped.deletedAt);

  // Per-student scrypt PIN hash takes strict precedence over shared center default PIN
  const isPinValid = mapped?.portalPinHash
    ? verifyPortalPinHash(accessKey, mapped.portalPinHash)
    : timingSafeStringEqual(accessKey, fallbackDefaultPin);

  if (isBlockedStudent || !isPinValid || !mapped) {
    throw new UnauthorizedError(
      "Mã học sinh hoặc Mật khẩu tra cứu không chính xác. Vui lòng kiểm tra lại thông tin.",
    );
  }

  return sanitizeStudentForPortal(mapped);
}

export async function createStudent(input: unknown): Promise<AdminStudentRecord> {
  const data = validate(createStudentSchema, input);
  const normalizedCode = data.code.toUpperCase();

  const existingByCode = await prisma.student.findFirst({
    where: { code: { equals: normalizedCode, mode: "insensitive" } },
    select: { id: true },
  });
  if (existingByCode) {
    throw new ConflictError(`Mã học sinh "${normalizedCode}" đã tồn tại.`);
  }

  const foundClass = await prisma.classroom.findFirst({
    where: {
      OR: [{ id: data.classId }, { name: data.classId }],
    },
  });
  if (!foundClass) {
    throw new NotFoundError("Classroom", data.classId);
  }
  if (
    (foundClass.status === "archived" || foundClass.status === "completed") &&
    data.status !== "archived"
  ) {
    throw new ValidationError(
      `Lớp học "${foundClass.code} — ${foundClass.name}" đã ở trạng thái lưu trữ hoặc kết thúc, không thể tiếp nhận học sinh mới.`,
    );
  }

  const joinedDate = formatJoinedDate(data.joinedAt);
  const resolvedDueDate =
    data.tuitionDueDate || foundClass.tuitionDueDate || "2026-11-20";
  const resolvedPeriod =
    data.tuitionPeriod?.trim() || "Học kỳ II (Tháng 11 – 01)";
  const hasExplicitTuition =
    data.tuitionAmount !== undefined && data.tuitionAmount.trim() !== "";
  const baseNumericAmount = hasExplicitTuition
    ? parseVndAmount(data.tuitionAmount)
    : 5800000;
  const formattedAmount = hasExplicitTuition
    ? baseNumericAmount === 0
      ? "0 ₫"
      : data.tuitionAmount!.trim()
    : formatVnd(baseNumericAmount);
  const todayIso = new Date().toISOString().slice(0, 10);

  const normalizedParentPhone = data.parentPhone?.trim() || null;
  const normalizedParentName = data.parentName?.trim() || null;
  const resolvedParentRelation =
    data.parentRelation?.trim() ||
    (normalizedParentName ? `Phụ huynh: ${normalizedParentName}` : "");

  const newStudentId = `stu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const initialPaymentId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    const createdRow = await prisma.$transaction(async (tx) => {
      // Capacity check inside transaction for race safety
      if (data.status !== "archived") {
        const currentEnrolled = await tx.student.count({
          where: {
            classroomId: foundClass.id,
            status: { not: "archived" },
            deletedAt: null,
          },
        });
        if (currentEnrolled >= foundClass.capacity) {
          throw new ValidationError(
            `Lớp học "${foundClass.code} — ${foundClass.name}" đã đủ sĩ số tối đa (${currentEnrolled}/${foundClass.capacity} học viên). Không thể tiếp nhận thêm học sinh mới.`,
          );
        }
      }

      const receiptCode =
        data.tuitionStatus === "paid"
          ? await generateUniqueReceiptCodeTx(tx, todayIso)
          : null;

      await tx.student.create({
        data: {
          id: newStudentId,
          code: normalizedCode,
          fullName: data.fullName,
          accessPinHash: data.portalPin ? hashPortalPin(data.portalPin) : "",
          classroomId: foundClass.id,
          className: foundClass.name,
          level: foundClass.level,
          joinedAt: joinedDate,
          attendanceRate: 0,
          averageScore: 0,
          targetGoal: data.targetGoal,
          entryBand: data.entryBand ?? null,
          tuitionStatus: toPrismaTuitionStatus(data.tuitionStatus),
          tuitionPeriod: resolvedPeriod,
          tuitionAmount: formattedAmount,
          tuitionDueDate: resolvedDueDate,
          parentRelation: resolvedParentRelation,
          parentContactMasked: maskPhoneNumber(normalizedParentPhone ?? undefined),
          parentName: normalizedParentName,
          parentPhone: normalizedParentPhone,
          parentEmail: data.parentEmail?.trim() || null,
          parentNote: data.parentNote?.trim() || null,
          privateNote: data.privateNote?.trim() || null,
          leaveStartDate:
            data.status === "on-leave" ? data.leaveStartDate || todayIso : null,
          leaveReturnDate:
            data.status === "on-leave" ? (data.leaveReturnDate ?? null) : null,
          leaveReason:
            data.status === "on-leave" ? (data.leaveReason ?? null) : null,
          status: toPrismaStudentStatus(data.status),
          deletedAt: data.status === "archived" ? new Date() : null,
          recentComment: data.recentComment || "Học viên mới nhập học.",
          tuitionPayments: {
            create: {
              id: initialPaymentId,
              period: resolvedPeriod,
              baseAmount: baseNumericAmount,
              discountAmount: 0,
              paidAmount: data.tuitionStatus === "paid" ? baseNumericAmount : 0,
              dueDate: resolvedDueDate,
              paidAt: data.tuitionStatus === "paid" ? todayIso : null,
              method: data.tuitionStatus === "paid" ? "transfer" : null,
              receiptCode,
              status: data.tuitionStatus,
              note:
                data.tuitionStatus === "paid"
                  ? "Đã thanh toán khi tạo hồ sơ"
                  : "Khởi tạo kỳ học phí ban đầu",
            },
          },
        },
      });

      await syncClassroomMetricsTx(tx, [foundClass.id]);

      return tx.student.findUniqueOrThrow({
        where: { id: newStudentId },
        include: STUDENT_INCLUDE,
      });
    });

    const classMap = await getClassNameMap();
    return mapPrismaStudent(createdRow, classMap);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError(`Mã học sinh "${normalizedCode}" đã tồn tại.`);
    }
    throw err;
  }
}

export async function updateStudent(
  id: unknown,
  input: unknown,
): Promise<AdminStudentRecord> {
  const validId = validate(idSchema, id);
  const data = validate(updateStudentSchema, input);

  const existingRow = await prisma.student.findUnique({
    where: { id: validId },
    include: STUDENT_INCLUDE,
  });
  if (!existingRow) {
    throw new NotFoundError("Student", validId);
  }

  const classMap = await getClassNameMap();
  const existing = mapPrismaStudent(existingRow, classMap);

  // 1. Uniqueness check if updating code
  const normalizedCode = data.code ? data.code.trim().toUpperCase() : undefined;
  if (normalizedCode && normalizedCode !== existing.code.toUpperCase()) {
    const isConflict = await prisma.student.findFirst({
      where: {
        id: { not: validId },
        code: { equals: normalizedCode, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (isConflict) {
      throw new ConflictError(
        `Mã học sinh "${normalizedCode}" đã tồn tại trong hệ thống.`,
      );
    }
  }

  // 2. Class transfer lookup & status check
  const nextStatus = data.status ?? existing.status;
  let targetClass: {
    id: string;
    code: string;
    name: string;
    level: string;
    capacity: number;
    status: string;
    tuitionDueDate: string | null;
  } | null = null;

  if (data.classId !== undefined) {
    targetClass = await prisma.classroom.findFirst({
      where: { OR: [{ id: data.classId }, { name: data.classId }] },
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        capacity: true,
        status: true,
        tuitionDueDate: true,
      },
    });
    if (!targetClass) {
      throw new NotFoundError("Classroom", data.classId);
    }
    if (
      (targetClass.status === "archived" || targetClass.status === "completed") &&
      nextStatus !== "archived"
    ) {
      throw new ValidationError(
        `Không thể chuyển học sinh vào lớp "${targetClass.code} — ${targetClass.name}" vì lớp đã ở trạng thái lưu trữ hoặc kết thúc.`,
      );
    }
  }

  const oldClassId = existing.classId;
  const newClassId = targetClass ? targetClass.id : undefined;

  const nextParentPhone =
    data.parentPhone !== undefined
      ? data.parentPhone.trim()
      : existing.parentPhone;
  const nextParentName =
    data.parentName !== undefined
      ? data.parentName.trim()
      : existing.parentName;
  const nextParentRelation =
    data.parentRelation !== undefined
      ? data.parentRelation.trim() ||
        (nextParentName ? `Phụ huynh: ${nextParentName}` : "")
      : data.parentName !== undefined
        ? nextParentName
          ? `Phụ huynh: ${nextParentName}`
          : ""
        : existing.parentRelation;

  try {
    const updatedRow = await prisma.$transaction(async (tx) => {
      if (
        targetClass &&
        newClassId &&
        newClassId !== oldClassId &&
        nextStatus !== "archived"
      ) {
        const targetEnrolled = await tx.student.count({
          where: {
            classroomId: targetClass.id,
            status: { not: "archived" },
            deletedAt: null,
          },
        });
        if (targetEnrolled >= targetClass.capacity) {
          throw new ValidationError(
            `Không thể chuyển học sinh sang lớp "${targetClass.code} — ${targetClass.name}" vì lớp đã đủ sĩ số (${targetEnrolled}/${targetClass.capacity} học viên).`,
          );
        }
      } else if (existing.status === "archived" && nextStatus !== "archived") {
        const checkClassId = targetClass?.id ?? existing.classId;
        const checkClass = await tx.classroom.findUnique({
          where: { id: checkClassId },
          select: { id: true, code: true, name: true, capacity: true },
        });
        if (checkClass) {
          const enrolled = await tx.student.count({
            where: {
              classroomId: checkClass.id,
              status: { not: "archived" },
              deletedAt: null,
            },
          });
          if (enrolled >= checkClass.capacity) {
            throw new ValidationError(
              `Không thể kích hoạt lại học sinh vào lớp "${checkClass.code} — ${checkClass.name}" vì lớp đã đủ sĩ số.`,
            );
          }
        }
      }

      if (targetClass && newClassId && newClassId !== oldClassId) {
        const teacherName = await getTeacherNameTx(tx);
        await tx.classTransferHistory.create({
          data: {
            id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            studentId: validId,
            oldClassId: existing.classId,
            oldClassName: existing.className,
            newClassId: targetClass.id,
            newClassName: targetClass.name,
            changedBy: teacherName,
            reason: data.transferReason?.trim() || "Điều chuyển lớp học",
          },
        });
      }

      const nextTuitionStatus = data.tuitionStatus ?? existing.tuitionStatus;
      await tx.student.update({
        where: { id: validId },
        data: {
          code: normalizedCode ?? existing.code,
          fullName: data.fullName ?? existing.fullName,
          ...(data.portalPin
            ? { accessPinHash: hashPortalPin(data.portalPin) }
            : {}),
          classroomId: targetClass?.id ?? existing.classId,
          className: targetClass?.name ?? existing.className,
          level: targetClass?.level ?? existing.level,
          status: toPrismaStudentStatus(nextStatus),
          deletedAt:
            nextStatus === "archived"
              ? existing.deletedAt
                ? new Date(existing.deletedAt)
                : new Date()
              : null,
          targetGoal: data.targetGoal ?? existing.targetGoal,
          entryBand:
            data.entryBand !== undefined
              ? data.entryBand
              : (existing.entryBand ?? null),
          tuitionStatus: toPrismaTuitionStatus(nextTuitionStatus),
          tuitionAmount:
            data.tuitionAmount !== undefined && data.tuitionAmount.trim()
              ? data.tuitionAmount.trim()
              : existing.tuitionAmount,
          tuitionPeriod:
            data.tuitionPeriod !== undefined && data.tuitionPeriod.trim()
              ? data.tuitionPeriod.trim()
              : existing.tuitionPeriod,
          tuitionDueDate:
            data.tuitionDueDate !== undefined
              ? data.tuitionDueDate
              : targetClass
                ? targetClass.tuitionDueDate
                : (existing.tuitionDueDate ?? null),
          parentRelation: nextParentRelation,
          parentContactMasked:
            data.parentPhone !== undefined
              ? maskPhoneNumber(nextParentPhone)
              : existing.parentContactMasked,
          parentName: nextParentName || null,
          parentPhone: nextParentPhone || null,
          parentEmail:
            data.parentEmail !== undefined
              ? data.parentEmail.trim() || null
              : (existing.parentEmail ?? null),
          parentNote:
            data.parentNote !== undefined
              ? data.parentNote.trim() || null
              : (existing.parentNote ?? null),
          privateNote:
            data.privateNote !== undefined
              ? data.privateNote.trim() || null
              : (existing.privateNote ?? null),
          leaveStartDate:
            nextStatus === "on-leave"
              ? (data.leaveStartDate ??
                  existing.leaveStartDate ??
                  new Date().toISOString().slice(0, 10))
              : (data.leaveStartDate ?? existing.leaveStartDate ?? null),
          leaveReturnDate:
            data.leaveReturnDate !== undefined
              ? data.leaveReturnDate || null
              : (existing.leaveReturnDate ?? null),
          leaveReason:
            data.leaveReason !== undefined
              ? data.leaveReason.trim() || null
              : (existing.leaveReason ?? null),
          recentComment: data.recentComment ?? existing.recentComment,
          joinedAt: data.joinedAt
            ? formatJoinedDate(data.joinedAt)
            : existing.joinedAt,
        },
      });

      const syncIds =
        targetClass && targetClass.id !== oldClassId
          ? [oldClassId, targetClass.id]
          : [oldClassId];
      await syncClassroomMetricsTx(tx, syncIds);

      return tx.student.findUniqueOrThrow({
        where: { id: validId },
        include: STUDENT_INCLUDE,
      });
    });

    const refreshedMap = await getClassNameMap();
    return mapPrismaStudent(updatedRow, refreshedMap);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError(
        `Mã học sinh "${normalizedCode}" đã tồn tại trong hệ thống.`,
      );
    }
    throw err;
  }
}

export async function archiveStudent(id: unknown): Promise<AdminStudentRecord> {
  const validId = validate(idSchema, id);
  const existingRow = await prisma.student.findUnique({
    where: { id: validId },
    include: STUDENT_INCLUDE,
  });
  if (!existingRow) {
    throw new NotFoundError("Student", validId);
  }

  const classMap = await getClassNameMap();
  if (existingRow.status === "archived") {
    return mapPrismaStudent(existingRow, classMap);
  }

  const updatedRow = await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: validId },
      data: {
        status: "archived",
        deletedAt: new Date(),
      },
    });
    await syncClassroomMetricsTx(tx, [existingRow.classroomId]);
    return tx.student.findUniqueOrThrow({
      where: { id: validId },
      include: STUDENT_INCLUDE,
    });
  });

  return mapPrismaStudent(updatedRow, classMap);
}

export async function restoreStudent(id: unknown): Promise<AdminStudentRecord> {
  const validId = validate(idSchema, id);
  const existingRow = await prisma.student.findUnique({
    where: { id: validId },
    include: STUDENT_INCLUDE,
  });
  if (!existingRow) {
    throw new NotFoundError("Student", validId);
  }

  const classMap = await getClassNameMap();
  if (existingRow.status === "active") {
    return mapPrismaStudent(existingRow, classMap);
  }

  const updatedRow = await prisma.$transaction(async (tx) => {
    const cls = await tx.classroom.findFirst({
      where: {
        id: existingRow.classroomId,
        status: { not: "archived" },
      },
      select: { id: true, code: true, name: true, capacity: true },
    });
    if (cls) {
      const currentEnrolled = await tx.student.count({
        where: {
          classroomId: cls.id,
          status: { not: "archived" },
          deletedAt: null,
        },
      });
      if (currentEnrolled >= cls.capacity) {
        throw new ValidationError(
          `Không thể khôi phục học sinh vào lớp "${cls.code} — ${cls.name}" vì lớp hiện đã đủ sĩ số (${currentEnrolled}/${cls.capacity} học viên). Vui lòng điều chỉnh sĩ số hoặc chuyển lớp trước khi khôi phục.`,
        );
      }
    }

    await tx.student.update({
      where: { id: validId },
      data: {
        status: "active",
        deletedAt: null,
      },
    });
    await syncClassroomMetricsTx(tx, [existingRow.classroomId]);
    return tx.student.findUniqueOrThrow({
      where: { id: validId },
      include: STUDENT_INCLUDE,
    });
  });

  return mapPrismaStudent(updatedRow, classMap);
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
): Promise<{
  created: AdminStudentRecord[];
  failed: { code: string; reason: string }[];
}> {
  const rawList = Array.isArray(input)
    ? input
    : ((input as { students?: unknown[] })?.students ?? []);
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

async function recordGradeWithTx(
  tx: Prisma.TransactionClient,
  data: RecordGradeInput,
  teacherName: string,
): Promise<{ classroomId: string }> {
  const stu = await tx.student.findUnique({
    where: { id: data.studentId },
    include: { grades: true },
  });
  if (!stu) {
    throw new NotFoundError("Student", data.studentId);
  }
  if (stu.deletedAt || stu.status === "archived") {
    throw new ValidationError(
      `Học viên ${stu.fullName} đã được lưu trữ, không thể nhập hoặc sửa điểm.`,
    );
  }

  const overall = computeIeltsOverall(
    data.listening,
    data.reading,
    data.writing,
    data.speaking,
  );
  const formattedDate = data.date?.trim()
    ? formatGradeDateVi(data.date.trim())
    : new Date().toLocaleDateString("vi-VN");
  const status = data.status ?? "published";

  const prevExisting =
    stu.grades.find((g) => g.assessmentTitle === data.assessmentTitle) ?? null;

  const resolvedComment =
    data.comment !== undefined && data.comment.trim().length > 0
      ? data.comment.trim()
      : prevExisting
        ? prevExisting.comment
        : status === "published"
          ? stu.recentComment
          : "";

  const nextPrivateNote =
    data.privateNote !== undefined
      ? data.privateNote.trim() || null
      : (prevExisting?.privateNote ?? null);

  await tx.assessmentCatalog.upsert({
    where: { title: data.assessmentTitle },
    update: {},
    create: {
      title: data.assessmentTitle,
      category: classifyAssessmentCategory(data.assessmentTitle),
    },
  });

  if (prevExisting) {
    const scoreChanged =
      prevExisting.overall !== overall ||
      prevExisting.listening !== data.listening ||
      prevExisting.reading !== data.reading ||
      prevExisting.writing !== data.writing ||
      prevExisting.speaking !== data.speaking;

    if (scoreChanged) {
      await tx.gradeChangeHistory.create({
        data: {
          id: `gc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          studentId: stu.id,
          gradeRecordId: prevExisting.id,
          assessmentTitle: data.assessmentTitle,
          oldScore: prevExisting.overall,
          newScore: overall,
          changedBy: teacherName,
          reason: data.reason?.trim() || "Cập nhật điểm bài kiểm tra",
        },
      });
    }

    await tx.gradeRecord.update({
      where: { id: prevExisting.id },
      data: {
        classroomId: stu.classroomId,
        date: formattedDate,
        listening: data.listening,
        reading: data.reading,
        writing: data.writing,
        speaking: data.speaking,
        overall,
        comment: resolvedComment,
        status,
        privateNote: nextPrivateNote,
      },
    });
  } else {
    await tx.gradeRecord.create({
      data: {
        id: `gr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        studentId: stu.id,
        classroomId: stu.classroomId,
        assessmentTitle: data.assessmentTitle,
        date: formattedDate,
        listening: data.listening,
        reading: data.reading,
        writing: data.writing,
        speaking: data.speaking,
        overall,
        comment: resolvedComment,
        status,
        privateNote: nextPrivateNote,
      },
    });
  }

  await recalculateStudentPublishedAverageTx(tx, stu.id);

  if (status !== "draft" && data.comment && data.comment.trim().length > 0) {
    await tx.student.update({
      where: { id: stu.id },
      data: { recentComment: data.comment.trim() },
    });
  }

  return { classroomId: stu.classroomId };
}

export async function recordGrade(
  input: unknown,
): Promise<AdminStudentRecord> {
  const data = validate(recordGradeSchema, input);

  const updatedRow = await prisma.$transaction(async (tx) => {
    const teacherName = await getTeacherNameTx(tx);
    const { classroomId } = await recordGradeWithTx(tx, data, teacherName);
    await syncClassroomMetricsTx(tx, [classroomId]);
    return tx.student.findUniqueOrThrow({
      where: { id: data.studentId },
      include: STUDENT_INCLUDE,
    });
  });

  const classMap = await getClassNameMap();
  return mapPrismaStudent(updatedRow, classMap);
}

export async function batchRecordGrades(
  input: unknown,
): Promise<{ updatedCount: number; students: AdminStudentRecord[] }> {
  const payload = validate(batchGradesSchema, input);
  const dedupedByStudent = new Map<
    string,
    (typeof payload.entries)[number]
  >();
  for (const entry of payload.entries) {
    dedupedByStudent.set(entry.studentId, entry);
  }
  const deduped = Array.from(dedupedByStudent.values());

  await prisma.$transaction(
    async (tx) => {
      // Pre-validate every student upfront before mutating any state
      const targetIds = deduped.map((e) => e.studentId);
      const foundStudents = await tx.student.findMany({
        where: { id: { in: targetIds } },
        select: { id: true, fullName: true, status: true, deletedAt: true },
      });
      const stuMap = new Map(foundStudents.map((s) => [s.id, s]));

      for (const entry of deduped) {
        const stu = stuMap.get(entry.studentId);
        if (!stu) {
          throw new NotFoundError("Student", entry.studentId);
        }
        if (stu.deletedAt || stu.status === "archived") {
          throw new ValidationError(
            `Học viên ${stu.fullName} đã được lưu trữ, không thể nhập hoặc sửa điểm.`,
          );
        }
      }

      const teacherName = await getTeacherNameTx(tx);
      const touchedClasses = new Set<string>();

      for (const entry of deduped) {
        const validEntry = validate(recordGradeSchema, {
          ...entry,
          assessmentTitle: payload.assessmentTitle,
          date: entry.date ?? payload.date,
          status: payload.status ?? entry.status,
          reason: entry.reason ?? payload.reason,
        });
        const { classroomId } = await recordGradeWithTx(
          tx,
          validEntry,
          teacherName,
        );
        touchedClasses.add(classroomId);
      }

      await syncClassroomMetricsTx(tx, Array.from(touchedClasses));
    },
    { timeout: 15000 },
  );

  const students = await listAllStudents({ status: "all" });
  return {
    updatedCount: deduped.length,
    students,
  };
}

export async function listAssessments(): Promise<string[]> {
  const rows = await prisma.assessmentCatalog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: { title: true },
  });
  return rows.map((r) => r.title);
}

export async function createAssessment(input: unknown): Promise<string[]> {
  const { title } = validate(createAssessmentSchema, input);
  await prisma.assessmentCatalog.upsert({
    where: { title },
    update: {},
    create: {
      title,
      category: classifyAssessmentCategory(title),
    },
  });
  return listAssessments();
}

export async function renameAssessment(input: unknown): Promise<{
  assessments: string[];
  updatedRecordsCount: number;
}> {
  const { oldTitle, newTitle } = validate(renameAssessmentSchema, input);

  const existing = await prisma.assessmentCatalog.findUnique({
    where: { title: oldTitle },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError("Assessment", oldTitle);
  }
  if (oldTitle !== newTitle) {
    const duplicate = await prisma.assessmentCatalog.findUnique({
      where: { title: newTitle },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(`Kỳ kiểm tra "${newTitle}" đã tồn tại.`);
    }
  }

  let updatedRecordsCount = 0;
  if (oldTitle !== newTitle) {
    updatedRecordsCount = await prisma.$transaction(async (tx) => {
      await tx.assessmentCatalog.update({
        where: { id: existing.id },
        data: { title: newTitle },
      });
      const updatedGrades = await tx.gradeRecord.updateMany({
        where: { assessmentTitle: oldTitle },
        data: { assessmentTitle: newTitle },
      });
      await tx.gradeChangeHistory.updateMany({
        where: { assessmentTitle: oldTitle },
        data: { assessmentTitle: newTitle },
      });
      return updatedGrades.count;
    });
  }

  const assessments = await listAssessments();
  return { assessments, updatedRecordsCount };
}

export async function deleteAssessment(input: unknown): Promise<string[]> {
  const { title } = validate(deleteAssessmentSchema, input);

  const existing = await prisma.assessmentCatalog.findUnique({
    where: { title },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError("Assessment", title);
  }

  const gradeCount = await prisma.gradeRecord.count({
    where: {
      assessmentTitle: title,
      student: { deletedAt: null },
    },
  });
  if (gradeCount > 0) {
    throw new ConflictError(
      `Không thể xóa kỳ kiểm tra "${title}" vì đã có điểm của học viên. Vui lòng xóa từng bản ghi điểm trước.`,
    );
  }

  await prisma.assessmentCatalog.delete({ where: { id: existing.id } });
  return listAssessments();
}

export async function publishAssessmentGrades(input: unknown): Promise<{
  publishedCount: number;
  assessmentTitle: string;
}> {
  const data = validate(publishAssessmentSchema, input);

  const publishedCount = await prisma.$transaction(async (tx) => {
    const draftGrades = await tx.gradeRecord.findMany({
      where: {
        assessmentTitle: data.assessmentTitle,
        status: "draft",
        student: {
          deletedAt: null,
          status: { not: "archived" },
          ...(data.classId ? { classroomId: data.classId } : {}),
        },
      },
      include: {
        student: { select: { id: true, classroomId: true } },
      },
    });

    if (draftGrades.length === 0) return 0;

    const touchedStudents = new Set<string>();
    const touchedClasses = new Set<string>();

    for (const gr of draftGrades) {
      await tx.gradeRecord.update({
        where: { id: gr.id },
        data: { status: "published" },
      });
      if (gr.comment && gr.comment.trim().length > 0) {
        await tx.student.update({
          where: { id: gr.student.id },
          data: { recentComment: gr.comment.trim() },
        });
      }
      touchedStudents.add(gr.student.id);
      touchedClasses.add(gr.student.classroomId);
    }

    for (const studentId of touchedStudents) {
      await recalculateStudentPublishedAverageTx(tx, studentId);
    }
    await syncClassroomMetricsTx(tx, Array.from(touchedClasses));

    return draftGrades.length;
  });

  return { publishedCount, assessmentTitle: data.assessmentTitle };
}

export async function deleteGradeRecord(
  input: unknown,
): Promise<AdminStudentRecord> {
  const { studentId, gradeId, reason } = validate(deleteGradeSchema, input);

  const updatedRow = await prisma.$transaction(async (tx) => {
    const stu = await tx.student.findUnique({
      where: { id: studentId },
      select: { id: true, classroomId: true },
    });
    if (!stu) {
      throw new NotFoundError("Student", studentId);
    }

    const removed = await tx.gradeRecord.findFirst({
      where: { id: gradeId, studentId },
    });
    if (!removed) {
      throw new NotFoundError("GradeRecord", gradeId);
    }

    const teacherName = await getTeacherNameTx(tx);
    await tx.gradeChangeHistory.create({
      data: {
        id: `gc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        studentId: stu.id,
        gradeRecordId: null,
        assessmentTitle: removed.assessmentTitle,
        oldScore: removed.overall,
        newScore: 0,
        changedBy: teacherName,
        reason: reason?.trim() || "Xóa bản ghi điểm",
      },
    });

    await tx.gradeRecord.delete({ where: { id: removed.id } });
    await recalculateStudentPublishedAverageTx(tx, stu.id);
    await syncClassroomMetricsTx(tx, [stu.classroomId]);

    return tx.student.findUniqueOrThrow({
      where: { id: stu.id },
      include: STUDENT_INCLUDE,
    });
  });

  const classMap = await getClassNameMap();
  return mapPrismaStudent(updatedRow, classMap);
}

export async function getGradesWorkspaceOverview(): Promise<{
  assessmentStats: AssessmentSummaryItem[];
  changeHistory: GradeAuditEntry[];
}> {
  const [catalogRows, studentRows] = await Promise.all([
    prisma.assessmentCatalog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { title: true },
    }),
    prisma.student.findMany({
      where: { deletedAt: null },
      include: {
        grades: true,
        gradeChangeHistory: true,
      },
    }),
  ]);

  const activeStudents = studentRows.filter((s) => s.status !== "archived");

  const assessmentSet = new Set<string>(catalogRows.map((c) => c.title));
  for (const stu of activeStudents) {
    for (const g of stu.grades) {
      assessmentSet.add(g.assessmentTitle);
    }
  }

  const assessmentStats: AssessmentSummaryItem[] = Array.from(assessmentSet).map(
    (title) => {
      let gradedCount = 0;
      let publishedCount = 0;
      let draftCount = 0;
      let sumOverall = 0;
      let latestIso = "";
      let latestDisplay = "";

      for (const stu of activeStudents) {
        const g = stu.grades.find((item) => item.assessmentTitle === title);
        if (!g) continue;
        gradedCount += 1;
        if (g.status === "draft") draftCount += 1;
        else publishedCount += 1;
        sumOverall += g.overall;
        const iso = parseGradeDateToIso(g.date);
        if (!latestIso || iso > latestIso) {
          latestIso = iso;
          latestDisplay = g.date;
        }
      }

      return {
        title,
        gradedCount,
        publishedCount,
        draftCount,
        averageOverall:
          gradedCount > 0 ? Math.round((sumOverall / gradedCount) * 10) / 10 : null,
        latestDate: latestDisplay || undefined,
      };
    },
  );

  const changeHistory: GradeAuditEntry[] = [];
  for (const stu of studentRows) {
    for (const log of stu.gradeChangeHistory) {
      changeHistory.push({
        id: log.id,
        studentId: stu.id,
        studentCode: stu.code,
        studentName: stu.fullName,
        className: stu.className,
        assessmentTitle: log.assessmentTitle,
        oldScore: log.oldScore,
        newScore: log.newScore,
        changedAt: log.changedAt.toISOString().slice(0, 10),
        changedBy: log.changedBy,
        reason: log.reason ?? undefined,
      });
    }
  }

  changeHistory.sort((a, b) => b.changedAt.localeCompare(a.changedAt));

  return { assessmentStats, changeHistory };
}

export async function batchTransferStudents(input: unknown): Promise<{
  transferredCount: number;
  transferredIds: string[];
  students: AdminStudentRecord[];
}> {
  const { studentIds, targetClassId, reason } = validate(
    batchTransferSchema,
    input,
  );

  const uniqueIds = Array.from(new Set(studentIds));

  const transferredIds = await prisma.$transaction(async (tx) => {
    const targetClass = await tx.classroom.findFirst({
      where: {
        id: targetClassId,
        status: { not: "archived" },
      },
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        capacity: true,
        tuitionDueDate: true,
      },
    });
    if (!targetClass) {
      throw new NotFoundError("Classroom", targetClassId);
    }

    const foundCandidates = await tx.student.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        classroomId: true,
        className: true,
        status: true,
      },
    });
    const byId = new Map(foundCandidates.map((s) => [s.id, s]));
    const candidates: typeof foundCandidates = [];
    for (const sid of uniqueIds) {
      const stu = byId.get(sid);
      if (!stu) {
        throw new NotFoundError("Student", sid);
      }
      candidates.push(stu);
    }

    const incomingNonArchivedCount = candidates.filter(
      (s) => s.classroomId !== targetClass.id && s.status !== "archived",
    ).length;

    const currentTargetEnrolled = await tx.student.count({
      where: {
        classroomId: targetClass.id,
        status: { not: "archived" },
        deletedAt: null,
      },
    });

    if (currentTargetEnrolled + incomingNonArchivedCount > targetClass.capacity) {
      const availableSlots = Math.max(
        0,
        targetClass.capacity - currentTargetEnrolled,
      );
      throw new ValidationError(
        `Lớp "${targetClass.code} — ${targetClass.name}" chỉ còn ${availableSlots} chỗ trống (sĩ số ${currentTargetEnrolled}/${targetClass.capacity}), không đủ tiếp nhận ${incomingNonArchivedCount} học sinh chuyển đến.`,
      );
    }

    const teacherName = await getTeacherNameTx(tx);
    const movedIds: string[] = [];
    const touchedClasses = new Set<string>([targetClass.id]);

    for (const stu of candidates) {
      if (stu.classroomId === targetClass.id) continue;
      touchedClasses.add(stu.classroomId);

      await tx.student.update({
        where: { id: stu.id },
        data: {
          classroomId: targetClass.id,
          className: targetClass.name,
          level: targetClass.level,
          ...(targetClass.tuitionDueDate
            ? { tuitionDueDate: targetClass.tuitionDueDate }
            : {}),
        },
      });

      await tx.classTransferHistory.create({
        data: {
          id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          studentId: stu.id,
          oldClassId: stu.classroomId,
          oldClassName: stu.className,
          newClassId: targetClass.id,
          newClassName: targetClass.name,
          changedBy: teacherName,
          reason: reason?.trim() || "Chuyển lớp / Lên khóa hàng loạt",
        },
      });

      movedIds.push(stu.id);
    }

    await syncClassroomMetricsTx(tx, Array.from(touchedClasses));
    return movedIds;
  });

  const students = await listAllStudents({ status: "all" });
  return {
    transferredCount: transferredIds.length,
    transferredIds,
    students,
  };
}

export async function recordTuitionPayment(
  studentId: unknown,
  input: unknown,
): Promise<{ student: AdminStudentRecord; payment: TuitionPaymentRecord }> {
  const validId = validate(idSchema, studentId);
  const data = validate(recordTuitionPaymentSchema, input);

  if (data.discountAmount > data.baseAmount) {
    throw new ValidationError(
      "Số tiền miễn giảm không được lớn hơn học phí gốc.",
    );
  }
  const normalizedDueDate = normalizeDateToIso(data.dueDate);
  if (!normalizedDueDate) {
    throw new ValidationError(
      "Hạn thanh toán không hợp lệ (định dạng YYYY-MM-DD hoặc DD/MM/YYYY).",
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const payable = Math.max(0, data.baseAmount - data.discountAmount);
  const paidAmount = Math.max(0, data.paidAmount);

  let derivedStatus: TuitionPaymentRecord["status"];
  if (paidAmount >= payable) {
    derivedStatus = "paid";
  } else if (paidAmount > 0) {
    derivedStatus = "partial";
  } else {
    derivedStatus = normalizedDueDate < todayIso ? "overdue" : "due-soon";
  }

  const { updatedStudentRow, savedPayment } = await prisma.$transaction(
    async (tx) => {
      const stu = await tx.student.findUnique({
        where: { id: validId },
        include: {
          tuitionPayments: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          },
        },
      });
      if (!stu) {
        throw new NotFoundError("Student", validId);
      }
      if (stu.deletedAt || stu.status === "archived") {
        throw new ValidationError(
          `Học viên ${stu.fullName} đã được lưu trữ, không thể ghi nhận thanh toán học phí.`,
        );
      }

      const existingPayment = data.paymentId
        ? stu.tuitionPayments.find((p) => p.id === data.paymentId)
        : undefined;

      const existingReceipt = existingPayment?.receiptCode ?? undefined;
      const generatedReceipt =
        paidAmount > 0
          ? existingReceipt || (await generateUniqueReceiptCodeTx(tx, todayIso))
          : existingReceipt;

      const paymentId =
        existingPayment?.id ??
        `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const paymentData = {
        studentId: stu.id,
        period: data.period,
        baseAmount: data.baseAmount,
        discountAmount: data.discountAmount,
        paidAmount,
        dueDate: normalizedDueDate,
        paidAt: paidAmount > 0 ? data.paidAt || todayIso : null,
        method: paidAmount > 0 ? data.method : null,
        status: derivedStatus,
        note: data.note?.trim() || null,
        receiptCode: generatedReceipt ?? null,
      };

      if (existingPayment) {
        await tx.tuitionPayment.update({
          where: { id: paymentId },
          data: paymentData,
        });
      } else {
        await tx.tuitionPayment.create({
          data: {
            id: paymentId,
            ...paymentData,
          },
        });
      }

      const allPayments = await tx.tuitionPayment.findMany({
        where: { studentId: stu.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

      const latest = allPayments[0];
      const hasOverdue = allPayments.some((p) => p.status === "overdue");
      const hasPending = allPayments.some(
        (p) => p.status === "partial" || p.status === "due-soon",
      );
      const nextTuitionStatus: AdminStudentRecord["tuitionStatus"] = hasOverdue
        ? "overdue"
        : hasPending
          ? "due-soon"
          : "paid";

      await tx.student.update({
        where: { id: stu.id },
        data: {
          ...(latest
            ? {
                tuitionPeriod: latest.period,
                tuitionDueDate: latest.dueDate,
                tuitionAmount: formatVnd(
                  Math.max(0, latest.baseAmount - (latest.discountAmount || 0)),
                ),
              }
            : {}),
          tuitionStatus: toPrismaTuitionStatus(nextTuitionStatus),
        },
      });

      const refreshed = await tx.student.findUniqueOrThrow({
        where: { id: stu.id },
        include: STUDENT_INCLUDE,
      });

      const paymentObj: TuitionPaymentRecord = {
        id: paymentId,
        period: data.period,
        baseAmount: data.baseAmount,
        discountAmount: data.discountAmount,
        paidAmount,
        dueDate: normalizedDueDate,
        ...(paidAmount > 0
          ? { paidAt: data.paidAt || todayIso, method: data.method }
          : {}),
        status: derivedStatus,
        ...(data.note?.trim() ? { note: data.note.trim() } : {}),
        ...(generatedReceipt ? { receiptCode: generatedReceipt } : {}),
      };

      return { updatedStudentRow: refreshed, savedPayment: paymentObj };
    },
  );

  const classMap = await getClassNameMap();
  return {
    student: mapPrismaStudent(updatedStudentRow, classMap),
    payment: savedPayment,
  };
}

export async function addCommunicationLog(
  studentId: unknown,
  input: unknown,
): Promise<{ student: AdminStudentRecord; entry: CommunicationLogEntry }> {
  const validId = validate(idSchema, studentId);
  const data = validate(addCommunicationLogSchema, input);

  const stu = await prisma.student.findUnique({
    where: { id: validId },
    select: { id: true },
  });
  if (!stu) {
    throw new NotFoundError("Student", validId);
  }

  const { updatedStudentRow, entry } = await prisma.$transaction(async (tx) => {
    const teacherName = await getTeacherNameTx(tx);
    const createdLog = await tx.communicationLog.create({
      data: {
        id: `comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        studentId: stu.id,
        date: data.date?.trim() || new Date().toISOString().slice(0, 10),
        channel: data.channel,
        category: data.category,
        summary: data.summary,
        parentResponse: data.parentResponse?.trim() || null,
        nextFollowUpDate: data.nextFollowUpDate?.trim() || null,
        loggedBy: data.loggedBy?.trim() || teacherName,
      },
    });

    const refreshed = await tx.student.findUniqueOrThrow({
      where: { id: stu.id },
      include: STUDENT_INCLUDE,
    });

    const mappedEntry: CommunicationLogEntry = {
      id: createdLog.id,
      date: createdLog.date,
      channel: data.channel,
      category: data.category,
      summary: createdLog.summary,
      ...(createdLog.parentResponse
        ? { parentResponse: createdLog.parentResponse }
        : {}),
      ...(createdLog.nextFollowUpDate
        ? { nextFollowUpDate: createdLog.nextFollowUpDate }
        : {}),
      loggedBy: createdLog.loggedBy,
    };

    return { updatedStudentRow: refreshed, entry: mappedEntry };
  });

  const classMap = await getClassNameMap();
  return {
    student: mapPrismaStudent(updatedStudentRow, classMap),
    entry,
  };
}

export async function deleteCommunicationLog(
  studentId: unknown,
  logId: unknown,
): Promise<AdminStudentRecord> {
  const validStudentId = validate(idSchema, studentId);
  const validLogId = validate(idSchema, logId);

  const stu = await prisma.student.findUnique({
    where: { id: validStudentId },
    select: { id: true },
  });
  if (!stu) {
    throw new NotFoundError("Student", validStudentId);
  }

  await prisma.communicationLog.deleteMany({
    where: { id: validLogId, studentId: validStudentId },
  });

  const refreshed = await prisma.student.findUniqueOrThrow({
    where: { id: validStudentId },
    include: STUDENT_INCLUDE,
  });
  const classMap = await getClassNameMap();
  return mapPrismaStudent(refreshed, classMap);
}
