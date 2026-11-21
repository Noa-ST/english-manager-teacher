import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import { ValidationError } from "@/services/errors";
import * as scheduleService from "@/services/schedule.service";
import * as studentService from "@/services/student.service";

export const GET = adminRoute(async (request) => {
  const query = readQuery(request);
  const classId = query.classId || undefined;
  const sessionId = query.sessionId || undefined;
  const date = query.date || undefined;

  let daysBack = 7;
  if (query.daysBack !== undefined && query.daysBack.trim() !== "") {
    const parsedDays = Number(query.daysBack);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 30) {
      throw new ValidationError("Tham số daysBack phải là số nguyên từ 1 đến 30.");
    }
    daysBack = parsedDays;
  }

  const [classes, sessions, allStudents, snapshot, pendingQueue] =
    await Promise.all([
      classroomService.listClassrooms(),
      scheduleService.listWeeklySchedule(),
      studentService.listAllStudents({
        classId: classId && classId !== "all" ? classId : undefined,
        status: "non-archived",
      }),
      date
        ? scheduleService.getAttendanceSnapshot({ classId, sessionId, date })
        : Promise.resolve(null),
      scheduleService.getPendingAttendanceQueue(daysBack),
    ]);

  return ok({
    classes,
    sessions,
    students: allStudents,
    snapshot,
    pendingQueue,
  });
});

export const POST = adminRoute(async (request) => {
  const summary = await scheduleService.recordAttendance(
    await readJson(request),
  );
  return ok(summary);
});
