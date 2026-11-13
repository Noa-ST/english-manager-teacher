import { adminRoute, ok } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import * as cmsService from "@/services/cms.service";
import * as scheduleService from "@/services/schedule.service";
import * as studentService from "@/services/student.service";

export const GET = adminRoute(async () => {
  const [classes, sessions, studentsPage, announcements] = await Promise.all([
    classroomService.listClassrooms(),
    scheduleService.listWeeklySchedule(),
    studentService.listStudents({ page: 1, pageSize: 100 }),
    cmsService.listAnnouncements({ includeDrafts: true }),
  ]);

  return ok({
    classes,
    sessions,
    students: studentsPage.items,
    announcements,
  });
});

