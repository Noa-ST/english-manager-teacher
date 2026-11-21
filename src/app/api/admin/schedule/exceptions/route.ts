import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as scheduleService from "@/services/schedule.service";

export const GET = adminRoute(async (request) => {
  const query = readQuery(request);
  const exceptions = await scheduleService.listScheduleExceptions({
    classId: query.classId,
    classCode: query.classCode,
    fromDate: query.from,
    toDate: query.to,
  });
  return ok(exceptions);
});

export const POST = adminRoute(async (request) => {
  const created = await scheduleService.createScheduleException(
    await readJson(request),
  );
  return ok(created, { status: 201 });
});
