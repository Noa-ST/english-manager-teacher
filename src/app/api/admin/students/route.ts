import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as studentService from "@/services/student.service";

/**
 * /api/admin/students — HTTP ONLY.
 * Auth + error envelope: adminRoute(). Validation + logic: student.service.
 */

export const GET = adminRoute(async (request) => {
  const page = await studentService.listStudents(readQuery(request));
  return ok(page.items, {
    meta: {
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: Math.ceil(page.total / page.pageSize),
    },
  });
});

export const POST = adminRoute(async (request) => {
  const student = await studentService.createStudent(await readJson(request));
  return ok(student, { status: 201 });
});

