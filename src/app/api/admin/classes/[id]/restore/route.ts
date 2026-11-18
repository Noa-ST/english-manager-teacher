import { adminRoute, ok } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const { id } = await context.params;
    const restored = await classroomService.restoreClassroom(id);
    return ok(restored);
  },
);
