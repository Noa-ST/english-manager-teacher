import { adminRoute, ok } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import { ValidationError } from "@/services/errors";

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    let payload: classroomService.UpdateWeekProgressInput | number | undefined;
    const rawBody = (await request.text()).trim();
    if (rawBody.length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        throw new ValidationError("Request body must be valid JSON");
      }
      if (parsed !== null && typeof parsed === "object") {
        payload = parsed as classroomService.UpdateWeekProgressInput;
      } else if (typeof parsed === "number") {
        payload = parsed;
      } else if (parsed !== null) {
        throw new ValidationError("Dữ liệu tiến tuần không hợp lệ.");
      }
    }
    const updated = await classroomService.advanceClassroomWeek(id, payload);
    return ok(updated);
  },
);
