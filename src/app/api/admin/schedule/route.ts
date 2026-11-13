import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as scheduleService from "@/services/schedule.service";

export const GET = adminRoute(async (request) => {
  const sessions = await scheduleService.listWeeklySchedule(readQuery(request));
  return ok(sessions);
});

export const POST = adminRoute(async (request) => {
  const created = await scheduleService.createClassSession(
    await readJson(request),
  );
  return ok(created, { status: 201 });
});

