import { adminRoute, ok, readJson } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";

export const PATCH = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const updated = await classroomService.updateClassroom(
      id,
      await readJson(request),
    );
    return ok(updated);
  },
);

