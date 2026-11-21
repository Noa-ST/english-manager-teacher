import { adminRoute, ok, readJson } from "@/lib/http";
import * as studentService from "@/services/student.service";

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const body = (await readJson(request)) as Record<string, unknown>;
    const student = await studentService.recordGrade({
      ...body,
      studentId: id,
    });
    return ok(student);
  },
);
