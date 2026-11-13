import { ok, studentRoute } from "@/lib/http";
import { canAccessStudent } from "@/lib/rbac";
import { ForbiddenError, NotFoundError } from "@/services/errors";
import { getRuntimeStore } from "@/services/runtime-store";

/**
 * GET /api/student/me
 * Returns ONLY the authenticated student's own profile, grades, attendance, and class schedule.
 * Admin can optionally pass `?studentId=...` to preview; a student passing another studentId gets 403 Forbidden.
 */
export const GET = studentRoute(async (request, { session }) => {
  const url = new URL(request.url);
  const requestedId = url.searchParams.get("studentId")?.trim();

  if (requestedId) {
    const allowed = await canAccessStudent(requestedId);
    if (!allowed) {
      throw new ForbiddenError("Bạn không có quyền xem hồ sơ học tập của học sinh khác.");
    }
  }

  const targetKey = requestedId || session.studentId || session.studentCode;
  if (!targetKey) {
    throw new NotFoundError("Tài khoản chưa được liên kết với hồ sơ học sinh nào.");
  }

  const store = getRuntimeStore();
  const student = store.students.find(
    (s) => s.id === targetKey || s.code.toUpperCase() === targetKey.toUpperCase(),
  );

  if (!student) {
    throw new NotFoundError("Không tìm thấy hồ sơ học sinh liên kết.");
  }

  // Filter schedule & announcements relevant to this student's class
  const classSchedule = store.sessions.filter(
    (ses) =>
      ses.className.toLowerCase().includes(student.className.toLowerCase()) ||
      student.className.toLowerCase().includes(ses.className.toLowerCase()),
  );

  return ok({
    student,
    schedule: classSchedule.length > 0 ? classSchedule : store.sessions,
  });
});

