import { adminRoute, ok, readJson } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";

export const GET = adminRoute<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const { id } = await context.params;
    const classroom = await classroomService.getClassroomById(id);
    return ok(classroom);
  },
);

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

export const DELETE = adminRoute<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const { id } = await context.params;
    const archived = await classroomService.archiveClassroom(id);
    return ok(archived);
  },
);
