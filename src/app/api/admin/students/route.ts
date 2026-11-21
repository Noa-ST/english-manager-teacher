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
  const body = await readJson(request);
  if (body && typeof body === "object") {
    if ("action" in body) {
      if (body.action === "batch-archive") {
        const result = await studentService.batchArchiveStudents(body);
        return ok(result);
      }
      if (body.action === "batch-restore") {
        const result = await studentService.batchRestoreStudents(body);
        return ok(result);
      }
      if (body.action === "batch-create") {
        const result = await studentService.batchCreateStudents(body);
        return ok(result, { status: 201 });
      }
      if (body.action === "batch-transfer") {
        const result = await studentService.batchTransferStudents(body);
        return ok(result);
      }
    }
    if (Array.isArray(body)) {
      const result = await studentService.batchCreateStudents(body);
      return ok(result, { status: 201 });
    }
  }
  const student = await studentService.createStudent(body);
  return ok(student, { status: 201 });
});

