import { adminRoute, ok, readJson } from "@/lib/http";
import * as studentService from "@/services/student.service";

export const GET = adminRoute<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const { id } = await context.params;
    const student = await studentService.getStudentById(id);
    return ok(student);
  },
);

export const PATCH = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const updated = await studentService.updateStudent(
      id,
      await readJson(request),
    );
    return ok(updated);
  },
);

export const DELETE = adminRoute<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const { id } = await context.params;
    await studentService.deleteStudent(id);
    return ok({ deleted: true });
  },
);

