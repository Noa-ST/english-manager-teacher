import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import { ValidationError } from "@/services/errors";
import * as scheduleService from "@/services/schedule.service";

export const GET = adminRoute(async (request) => {
  const query = readQuery(request);
  const sessions = await scheduleService.listWeeklySchedule({
    dayOfWeek: query.dayOfWeek,
    classCode: query.classCode,
    room: query.room,
  });
  return ok(sessions);
});

export const POST = adminRoute(async (request) => {
  const created = await scheduleService.createClassSession(
    await readJson(request),
  );
  return ok(created, { status: 201 });
});

export const DELETE = adminRoute(async (request) => {
  const { id } = readQuery(request);
  if (!id) {
    throw new ValidationError("Thiếu ID ca học cần xóa.");
  }
  const success = await scheduleService.deleteClassSession(String(id));
  return ok({ success });
});

