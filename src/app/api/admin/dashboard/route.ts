import { adminRoute, ok } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import * as cmsService from "@/services/cms.service";
import * as scheduleService from "@/services/schedule.service";
import * as settingsService from "@/services/settings.service";
import * as studentService from "@/services/student.service";
import { computeDashboardMetrics } from "@/services/dashboard.service";

export const GET = adminRoute(async () => {
  const [classes, sessions, allStudents, announcements, settings] = await Promise.all([
    classroomService.listClassrooms(),
    scheduleService.listWeeklySchedule(),
    studentService.listAllStudents({ status: "non-archived" }),
    cmsService.listAnnouncements({ includeDrafts: true }),
    settingsService.getSystemSettings(),
  ]);

  const metrics = computeDashboardMetrics({
    classes,
    sessions,
    students: allStudents,
    announcements,
    attendanceThreshold: settings.lowAttendanceThresholdPercent,
  });

  return ok({
    classes,
    sessions,
    students: allStudents,
    announcements,
    metrics,
  });
});

