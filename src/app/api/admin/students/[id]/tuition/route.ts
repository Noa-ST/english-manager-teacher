import { adminRoute, ok, readJson } from "@/lib/http";
import * as studentService from "@/services/student.service";

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const body = await readJson(request);
    const result = await studentService.recordTuitionPayment(id, body);
    return ok(result);
  },
);
