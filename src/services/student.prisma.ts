import { prisma } from "@/lib/db/prisma";
import type { AdminStudentRecord } from "./classroom-data";
import { ConflictError, NotFoundError } from "./errors";
import type {
  CreateStudentInput,
  RecordGradeInput,
  UpdateStudentInput,
} from "./student.service";

/**
 * Format a Date or ISO string into Vietnamese DD/MM/YYYY.
 */
function toViDate(d: Date | string): string {
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-");
      return `${day}/${m}/${y}`;
    }
    return d;
  }
  return d.toLocaleDateString("vi-VN");
}

/**
 * Map a Prisma Student record (with relations) to AdminStudentRecord.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPrismaStudentToRecord(stu: any): AdminStudentRecord {
  return {
    id: stu.id,
    code: stu.code,
    fullName: stu.fullName,
    classId: stu.classroomId,
    className: stu.className,
    level: stu.level,
    joinedAt: stu.joinedAt,
    attendanceRate: stu.attendanceRate,
    averageScore: stu.averageScore,
    targetGoal: stu.targetGoal,
    tuitionStatus:
      stu.tuitionStatus === "due_soon" ? "due-soon" : stu.tuitionStatus,
    tuitionPeriod: stu.tuitionPeriod,
    tuitionAmount: stu.tuitionAmount,
    parentRelation: stu.parentRelation,
    parentContactMasked: stu.parentContactMasked,
    status: stu.status === "on_leave" ? "on-leave" : stu.status,
    recentComment: stu.recentComment,
    deletedAt: stu.deletedAt ? stu.deletedAt.toISOString() : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    grades: (stu.grades || []).map((g: any) => ({
      id: g.id,
      assessmentTitle: g.assessmentTitle,
      date: g.date,
      listening: g.listening,
      reading: g.reading,
      writing: g.writing,
      speaking: g.speaking,
      overall: g.overall,
      comment: g.comment,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attendanceHistory: (stu.attendanceHistory || []).map((a: any) => ({
      date: a.date,
      sessionName: a.sessionName,
      status: a.status,
      note: a.note || undefined,
    })),
  };
}

/**
 * 1. CREATE STUDENT (Prisma Transaction)
 * Ensures code uniqueness, creates student record, and atomically increments classroom.enrolled.
 */
export async function prismaCreateStudent(
  data: CreateStudentInput,
): Promise<AdminStudentRecord> {
  const normalizedCode = data.code.trim().toUpperCase();

  return await prisma.$transaction(async (tx) => {
    // A. Check duplicate code
    const existing = await tx.student.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      throw new ConflictError(`Mã học sinh "${normalizedCode}" đã tồn tại.`);
    }

    // B. Find target classroom
    const classroom = await tx.classroom.findFirst({
      where: {
        OR: [{ id: data.classId }, { name: data.classId }],
      },
    });

    const targetClassId = classroom?.id ?? "cls-ii-01";
    const targetClassName =
      classroom?.name ?? "IELTS Intensive (Band 6.5–7.5+)";
    const targetLevel = classroom?.level ?? "CEFR B2";

    // C. Create Student
    const created = await tx.student.create({
      data: {
        code: normalizedCode,
        fullName: data.fullName,
        classroomId: targetClassId,
        className: targetClassName,
        level: targetLevel,
        joinedAt: data.joinedAt ? toViDate(data.joinedAt) : toViDate(new Date()),
        attendanceRate: 0,
        averageScore: 0,
        targetGoal: data.targetGoal,
        tuitionStatus:
          data.tuitionStatus === "due-soon" ? "due_soon" : data.tuitionStatus,
        tuitionPeriod: "Học kỳ II (Tháng 11 – 01)",
        tuitionAmount: "5.800.000 ₫",
        parentRelation: data.parentName
          ? `Phụ huynh: ${data.parentName}`
          : "Phụ huynh học sinh",
        parentContactMasked: data.parentPhone ?? "0909 ••• 888",
        status: "active",
        recentComment: data.recentComment || "Học viên mới nhập học.",
      },
      include: {
        grades: true,
        attendanceHistory: true,
      },
    });

    // D. Atomically increment class enrollment
    if (classroom) {
      await tx.classroom.update({
        where: { id: classroom.id },
        data: { enrolled: { increment: 1 } },
      });
    }

    return mapPrismaStudentToRecord(created);
  });
}

/**
 * 2. UPDATE STUDENT & CLASS TRANSFER (Prisma Transaction)
 * Handles code conflict, data update, class transfer synchronization, and audit trail logging.
 */
export async function prismaUpdateStudent(
  id: string,
  data: UpdateStudentInput,
): Promise<AdminStudentRecord> {
  return await prisma.$transaction(async (tx) => {
    const existing = await tx.student.findUnique({
      where: { id },
      include: { grades: true, attendanceHistory: true },
    });
    if (!existing) {
      throw new NotFoundError("Student", id);
    }

    // A. Uniqueness check if updating code
    const normalizedCode = data.code ? data.code.trim().toUpperCase() : undefined;
    if (normalizedCode && normalizedCode !== existing.code.toUpperCase()) {
      const conflict = await tx.student.findFirst({
        where: {
          code: normalizedCode,
          id: { not: id },
        },
      });
      if (conflict) {
        throw new ConflictError(
          `Mã học sinh "${normalizedCode}" đã tồn tại trong hệ thống.`,
        );
      }
    }

    // B. Class transfer check
    let targetClass = undefined;
    if (data.classId) {
      targetClass = await tx.classroom.findFirst({
        where: {
          OR: [{ id: data.classId }, { name: data.classId }],
        },
      });
    }

    const oldClassId = existing.classroomId;
    const newClassId = targetClass ? targetClass.id : undefined;

    if (targetClass && newClassId && newClassId !== oldClassId) {
      // Transfer enrollment only if student is active
      if (existing.status === "active") {
        await tx.classroom.update({
          where: { id: oldClassId },
          data: { enrolled: { decrement: 1 } },
        });
        await tx.classroom.update({
          where: { id: newClassId },
          data: { enrolled: { increment: 1 } },
        });
      }

      // Record Audit Trail
      await tx.classTransferHistory.create({
        data: {
          studentId: existing.id,
          oldClassId,
          newClassId,
          changedBy: "admin",
          reason: "Cập nhật chuyển lớp từ trang quản trị",
        },
      });
    }

    // C. Update student
    const updated = await tx.student.update({
      where: { id },
      data: {
        ...(normalizedCode ? { code: normalizedCode } : {}),
        ...(data.fullName ? { fullName: data.fullName } : {}),
        ...(targetClass ? { classroomId: targetClass.id, className: targetClass.name, level: targetClass.level } : {}),
        ...(data.targetGoal ? { targetGoal: data.targetGoal } : {}),
        ...(data.tuitionStatus
          ? {
              tuitionStatus:
                data.tuitionStatus === "due-soon"
                  ? "due_soon"
                  : data.tuitionStatus,
            }
          : {}),
        ...(data.recentComment ? { recentComment: data.recentComment } : {}),
        ...(data.joinedAt ? { joinedAt: toViDate(data.joinedAt) } : {}),
      },
      include: { grades: true, attendanceHistory: true },
    });

    return mapPrismaStudentToRecord(updated);
  });
}

/**
 * 3. ARCHIVE STUDENT / SOFT DELETE (Prisma Transaction)
 * Idempotent soft delete with atomic enrollment decrement.
 */
export async function prismaArchiveStudent(id: string): Promise<AdminStudentRecord> {
  return await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id },
      include: { grades: true, attendanceHistory: true },
    });
    if (!student) {
      throw new NotFoundError("Student", id);
    }

    // Idempotency: if already archived, return immediately
    if (student.status === "archived") {
      return mapPrismaStudentToRecord(student);
    }

    const updated = await tx.student.update({
      where: { id },
      data: {
        status: "archived",
        deletedAt: new Date(),
      },
      include: { grades: true, attendanceHistory: true },
    });

    // Atomically decrement class enrolled
    await tx.classroom.update({
      where: { id: student.classroomId },
      data: { enrolled: { decrement: 1 } },
    });

    return mapPrismaStudentToRecord(updated);
  });
}

/**
 * 4. RESTORE STUDENT (Prisma Transaction)
 * Idempotent restoration with atomic enrollment increment.
 */
export async function prismaRestoreStudent(id: string): Promise<AdminStudentRecord> {
  return await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id },
      include: { grades: true, attendanceHistory: true },
    });
    if (!student) {
      throw new NotFoundError("Student", id);
    }

    // Idempotency: if already active, return immediately
    if (student.status === "active") {
      return mapPrismaStudentToRecord(student);
    }

    const updated = await tx.student.update({
      where: { id },
      data: {
        status: "active",
        deletedAt: null,
      },
      include: { grades: true, attendanceHistory: true },
    });

    // Atomically increment class enrolled
    await tx.classroom.update({
      where: { id: student.classroomId },
      data: { enrolled: { increment: 1 } },
    });

    return mapPrismaStudentToRecord(updated);
  });
}

/**
 * 5. RECORD GRADE & AUDIT TRAIL (Prisma Transaction)
 * Calculates IELTS 0.5 step overall and logs grade adjustments to GradeChangeHistory.
 */
export async function prismaRecordGrade(
  data: RecordGradeInput,
): Promise<AdminStudentRecord> {
  return await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: data.studentId },
      include: { grades: true, attendanceHistory: true },
    });
    if (!student) {
      throw new NotFoundError("Student", data.studentId);
    }

    const rawAvg =
      (data.listening + data.reading + data.writing + data.speaking) / 4;
    const overall = Math.round(rawAvg * 2) / 2;
    const today = new Date().toLocaleDateString("vi-VN");

    const existingGrade = student.grades.find(
      (g) => g.assessmentTitle === data.assessmentTitle,
    );

    if (existingGrade) {
      // Log to GradeChangeHistory if score changed
      if (existingGrade.overall !== overall) {
        await tx.gradeChangeHistory.create({
          data: {
            studentId: student.id,
            gradeRecordId: existingGrade.id,
            assessmentTitle: data.assessmentTitle,
            oldScore: existingGrade.overall,
            newScore: overall,
            changedBy: "admin",
            reason: data.comment || "Cập nhật điểm định kỳ",
          },
        });
      }

      await tx.gradeRecord.update({
        where: { id: existingGrade.id },
        data: {
          date: today,
          listening: data.listening,
          reading: data.reading,
          writing: data.writing,
          speaking: data.speaking,
          overall,
          comment: data.comment || existingGrade.comment,
        },
      });
    } else {
      await tx.gradeRecord.create({
        data: {
          studentId: student.id,
          assessmentTitle: data.assessmentTitle,
          date: today,
          listening: data.listening,
          reading: data.reading,
          writing: data.writing,
          speaking: data.speaking,
          overall,
          comment: data.comment || student.recentComment,
        },
      });
    }

    const updatedStudent = await tx.student.update({
      where: { id: student.id },
      data: {
        averageScore: overall,
        ...(data.comment ? { recentComment: data.comment } : {}),
      },
      include: { grades: true, attendanceHistory: true },
    });

    return mapPrismaStudentToRecord(updatedStudent);
  });
}

/**
 * 6. RECONCILE CLASS ENROLLMENT
 * Ground-truth reconciliation between Classroom.enrolled and active students count.
 */
export async function prismaReconcileClassEnrollment(
  classroomId?: string,
): Promise<{ classId: string; beforeCount: number; afterCount: number }[]> {
  const classrooms = classroomId
    ? await prisma.classroom.findMany({ where: { id: classroomId } })
    : await prisma.classroom.findMany();

  const results: { classId: string; beforeCount: number; afterCount: number }[] = [];

  for (const cls of classrooms) {
    const actualCount = await prisma.student.count({
      where: {
        classroomId: cls.id,
        status: "active",
        deletedAt: null,
      },
    });

    if (cls.enrolled !== actualCount) {
      await prisma.classroom.update({
        where: { id: cls.id },
        data: { enrolled: actualCount },
      });
    }

    results.push({
      classId: cls.id,
      beforeCount: cls.enrolled,
      afterCount: actualCount,
    });
  }

  return results;
}
