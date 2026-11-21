import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import { ValidationError } from "@/services/errors";
import * as studentService from "@/services/student.service";

export const GET = adminRoute(async () => {
  const [assessments, classes, allStudents, overview] = await Promise.all([
    studentService.listAssessments(),
    classroomService.listClassrooms(),
    studentService.listAllStudents({ status: "non-archived" }),
    studentService.getGradesWorkspaceOverview(),
  ]);
  return ok({
    assessments,
    classes,
    students: allStudents,
    assessmentStats: overview.assessmentStats,
    changeHistory: overview.changeHistory,
  });
});

export const POST = adminRoute(async (request) => {
  const body = (await readJson(request)) as {
    action?: "create-assessment" | "publish-assessment" | "batch-grades";
    title?: string;
    assessmentTitle?: string;
    classId?: string;
    date?: string;
    status?: "published" | "draft";
    reason?: string;
    entries?: unknown[];
  };

  if (body?.action === "create-assessment") {
    const assessments = await studentService.createAssessment({
      title: body.title,
    });
    return ok({ assessments }, { status: 201 });
  }

  if (body?.action === "publish-assessment") {
    const res = await studentService.publishAssessmentGrades({
      assessmentTitle: body.assessmentTitle,
      classId: body.classId,
    });
    return ok(res);
  }

  const result = await studentService.batchRecordGrades(body);
  return ok(result);
});

export const PATCH = adminRoute(async (request) => {
  const body = (await readJson(request)) as {
    action?: "rename-assessment";
    oldTitle?: string;
    newTitle?: string;
  };
  if (body?.action !== "rename-assessment") {
    throw new ValidationError("Hành động PATCH không hợp lệ.");
  }
  const result = await studentService.renameAssessment({
    oldTitle: body.oldTitle,
    newTitle: body.newTitle,
  });
  return ok(result);
});

export const DELETE = adminRoute(async (request) => {
  const query = readQuery(request);
  if (query.action === "delete-assessment" || query.title) {
    const assessments = await studentService.deleteAssessment({
      title: query.title,
    });
    return ok({ assessments });
  }

  if (query.studentId && query.gradeId) {
    const student = await studentService.deleteGradeRecord({
      studentId: query.studentId,
      gradeId: query.gradeId,
      reason: query.reason,
    });
    return ok({ student });
  }

  throw new ValidationError("Thiếu thông tin kỳ kiểm tra hoặc bản ghi điểm cần xóa.");
});

