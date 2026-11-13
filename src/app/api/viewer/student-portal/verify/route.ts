import { ok, readJson, studentRoute } from "@/lib/http";
import { canAccessStudent } from "@/lib/rbac";
import { ForbiddenError } from "@/services/errors";
import * as studentService from "@/services/student.service";

export const POST = studentRoute(async (request) => {
  const student = await studentService.verifyStudentPortal(
    await readJson(request),
  );
  const allowed = await canAccessStudent(student.id);
  if (!allowed) {
    throw new ForbiddenError(
      "Bạn chỉ được phép tra cứu hồ sơ học tập của chính mình.",
    );
  }
  return ok(student);
});
