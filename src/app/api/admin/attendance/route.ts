import { adminRoute, ok, readJson } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import * as scheduleService from "@/services/schedule.service";
import * as studentService from "@/services/student.service";

export const GET = adminRoute(async () => {
  const [classes, sessions, studentsPage] = await Promise.all([
    classroomService.listClassrooms(),
    scheduleService.listWeeklySchedule(),
    studentService.listStudents({ page: 1, pageSize: 100 }),
  ]);
  return ok({
    classes,
    sessions,
    students: studentsPage.items,
  });
});

export const POST = adminRoute(async (request) => {
  const summary = await scheduleService.recordAttendance(
    await readJson(request),
  );
  return ok(summary);
});

