import { adminRoute, ok, readQuery } from "@/lib/http";
import * as studentService from "@/services/student.service";

export const GET = adminRoute(async (request) => {
  const q = readQuery(request);
  const rawThreshold = q.attendanceThreshold ? Number(q.attendanceThreshold) : undefined;
  const threshold =
    rawThreshold !== undefined && Number.isFinite(rawThreshold)
      ? rawThreshold
      : undefined;
  const summary = await studentService.getStudentsSummary(threshold);
  return ok(summary);
});
