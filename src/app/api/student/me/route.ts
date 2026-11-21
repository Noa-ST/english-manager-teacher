import { ok, studentRoute } from "@/lib/http";
import { canAccessStudent } from "@/lib/rbac";
import { sanitizeClassroomRoadmapForStudent } from "@/services/classroom-helpers";
import * as classroomService from "@/services/classroom.service";
import { ForbiddenError, NotFoundError } from "@/services/errors";
import {
  addDaysIso,
  resolveScheduleOccurrences,
  sanitizeOccurrencesForStudent,
  toIsoDate,
} from "@/services/schedule-calendar-helpers";
import * as scheduleService from "@/services/schedule.service";
import * as studentService from "@/services/student.service";
import { sanitizeSessionTimelineForStudent } from "@/services/teaching-journal-helpers";
import * as teachingJournalService from "@/services/teaching-journal.service";
import type { UserProfile } from "@/types";

/**
 * GET /api/student/me
 * Returns ONLY the authenticated student's own profile, grades, attendance,
 * class schedule (strictly isolated to the student's enrolled class), and sanitized classroom roadmap.
 */
export const GET = studentRoute(async (request, { session }) => {
  const url = new URL(request.url);
  const requestedId = url.searchParams.get("studentId")?.trim();

  if (requestedId) {
    const profileOverride: UserProfile = {
      id: session.id,
      email: session.label,
      fullName: session.fullName ?? session.label,
      avatarUrl: null,
      role: session.role,
      isActive: true,
      studentId: session.studentId ?? null,
      studentCode: session.studentCode ?? null,
    };
    const allowed = await canAccessStudent(requestedId, profileOverride);
    if (!allowed) {
      throw new ForbiddenError("Bạn không có quyền xem hồ sơ học tập của học sinh khác.");
    }
  }

  const targetKey = requestedId || session.studentId || session.studentCode;
  if (!targetKey) {
    throw new NotFoundError("Tài khoản chưa được liên kết với hồ sơ học sinh nào.");
  }

  const student = await studentService.getStudentById(targetKey).catch((err) => {
    if (err instanceof NotFoundError) {
      throw new NotFoundError("Không tìm thấy hồ sơ học sinh liên kết.");
    }
    throw err;
  });

  if (student.status === "archived" || student.deletedAt) {
    throw new ForbiddenError("Hồ sơ học sinh đã được lưu trữ và ngừng truy cập cổng học tập.");
  }

  const [allClasses, allWeeklySessions, allExceptions, classJournalSessions] =
    await Promise.all([
      classroomService.listAllClassrooms(true),
      scheduleService.listWeeklySchedule(),
      scheduleService.listScheduleExceptions(),
      teachingJournalService.listClassSessions({ studentId: student.id }),
    ]);

  const matchedClass = allClasses.find(
    (c) =>
      c.id === student.classId ||
      c.code.toUpperCase() === student.classId.toUpperCase() ||
      c.name.toLowerCase() === student.className.toLowerCase(),
  );

  // Strictly scope schedule to ONLY this student's class — never fall back to all classes
  const classSchedule = allWeeklySessions.filter((ses) => {
    if (
      matchedClass &&
      ses.classCode.toUpperCase() === matchedClass.code.toUpperCase()
    ) {
      return true;
    }
    return ses.className.toLowerCase() === student.className.toLowerCase();
  });

  // Strictly scope 14-day schedule occurrences (including exceptions) to ONLY this student's class
  const todayIso = toIsoDate(new Date());
  const rangeEndIso = addDaysIso(todayIso, 13);
  const upcomingOccurrences = matchedClass
    ? sanitizeOccurrencesForStudent(
        resolveScheduleOccurrences({
          fromDate: todayIso,
          toDate: rangeEndIso,
          sessions: classSchedule,
          exceptions: allExceptions,
          classes: [matchedClass],
          includeInactiveClasses: true,
          todayIso,
          classCodeFilter: matchedClass.code,
        }),
      )
    : [];

  return ok({
    student: studentService.sanitizeStudentForPortal(student),
    schedule: classSchedule,
    upcomingOccurrences,
    classroomRoadmap: matchedClass
      ? sanitizeClassroomRoadmapForStudent(matchedClass)
      : null,
    sessionTimeline: sanitizeSessionTimelineForStudent(
      classJournalSessions,
      student.id,
    ),
  });
});
