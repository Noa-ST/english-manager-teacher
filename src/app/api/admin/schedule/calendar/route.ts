import { adminRoute, ok, readQuery } from "@/lib/http";
import {
  addDaysIso,
  getMondayOfWeek,
  toIsoDate,
} from "@/services/schedule-calendar-helpers";
import * as scheduleService from "@/services/schedule.service";

export const GET = adminRoute(async (request) => {
  const query = readQuery(request);
  const todayIso = toIsoDate(new Date());
  const defaultFrom = getMondayOfWeek(todayIso);
  const defaultTo = addDaysIso(defaultFrom, 6);

  const calendar = await scheduleService.getScheduleCalendarRange({
    fromDate: query.from || defaultFrom,
    toDate: query.to || defaultTo,
    classCode: query.classCode,
    room: query.room,
    todayIso,
  });

  return ok(calendar);
});
