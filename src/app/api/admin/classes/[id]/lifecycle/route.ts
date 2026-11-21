import { adminRoute, ok, readJson } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import { ValidationError } from "@/services/errors";

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const body = (await readJson(request)) as
      | ({ action?: string } & Record<string, unknown>)
      | null;

    if (!body || !body.action) {
      throw new ValidationError("Thiếu hành động vòng đời lớp học (action).");
    }

    switch (body.action) {
      case "complete": {
        const updated = await classroomService.completeClassroom(id);
        return ok(updated);
      }
      case "activate": {
        const updated = await classroomService.activateClassroom(id);
        return ok(updated);
      }
      case "clone": {
        const cloned = await classroomService.cloneClassroom(id, body);
        return ok(cloned, { status: 201 });
      }
      case "shift-schedule": {
        const shifted = await classroomService.shiftClassroomCurriculumDates(
          id,
          body,
        );
        return ok(shifted);
      }
      default:
        throw new ValidationError(
          `Hành động vòng đời không hợp lệ: "${String(body.action)}".`,
        );
    }
  },
);
