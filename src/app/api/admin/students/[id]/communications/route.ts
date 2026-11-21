import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as studentService from "@/services/student.service";

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const body = await readJson(request);
    const result = await studentService.addCommunicationLog(id, body);
    return ok(result, { status: 201 });
  },
);

export const DELETE = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const { logId } = readQuery(request);
    const student = await studentService.deleteCommunicationLog(id, logId);
    return ok({ student });
  },
);
