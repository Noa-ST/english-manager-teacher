import { adminRoute, ok, readQuery } from "@/lib/http";
import { ValidationError } from "@/services/errors";
import * as scheduleService from "@/services/schedule.service";

export const GET = adminRoute(async (request) => {
  const query = readQuery(request);
  const classId = query.classId?.trim();
  if (!classId) {
    throw new ValidationError("Vui lòng cung cấp classId để xem ma trận điểm danh.");
  }

  const report = await scheduleService.getClassAttendanceMatrix({
    classId,
    fromDate: query.fromDate?.trim() || undefined,
    toDate: query.toDate?.trim() || undefined,
  });
  return ok(report);
});
