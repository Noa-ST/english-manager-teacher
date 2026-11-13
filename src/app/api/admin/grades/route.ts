import { adminRoute, ok, readJson } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import * as studentService from "@/services/student.service";

export const GET = adminRoute(async () => {
  const [assessments, classes, studentsPage] = await Promise.all([
    studentService.listAssessments(),
    classroomService.listClassrooms(),
    studentService.listStudents({ page: 1, pageSize: 100 }),
  ]);
  return ok({
    assessments,
    classes,
    students: studentsPage.items,
  });
});

export const POST = adminRoute(async (request) => {
  const body = (await readJson(request)) as {
    action?: "create-assessment" | "batch-grades";
    title?: string;
    assessmentTitle?: string;
    entries?: unknown[];
  };

  if (body?.action === "create-assessment") {
    const assessments = await studentService.createAssessment({
      title: body.title,
    });
    return ok({ assessments }, { status: 201 });
  }

  const result = await studentService.batchRecordGrades(body);
  return ok(result);
});

