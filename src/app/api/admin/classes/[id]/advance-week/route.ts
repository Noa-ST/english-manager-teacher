import { adminRoute, ok, readJson } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    let payload: classroomService.UpdateWeekProgressInput | number | undefined;
    try {
      const body = (await readJson(request)) as
        | classroomService.UpdateWeekProgressInput
        | { targetWeek?: number }
        | null;
      if (body && typeof body === "object") {
        payload = body;
      }
    } catch {
      // Body can be empty when just advancing +1
    }
    const updated = await classroomService.advanceClassroomWeek(id, payload);
    return ok(updated);
  },
);
