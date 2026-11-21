import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import { ValidationError } from "@/services/errors";

export const GET = adminRoute(async () => {
  const templates = await classroomService.listCurriculumTemplates();
  return ok(templates);
});

export const POST = adminRoute(async (request) => {
  const body = (await readJson(request)) as {
    classId?: string;
    name?: string;
  } | null;

  if (!body?.classId || !body?.name?.trim()) {
    throw new ValidationError("Thiếu ID lớp học hoặc tên giáo trình mẫu.");
  }

  const created = await classroomService.saveClassroomAsTemplate(body.classId, {
    name: body.name.trim(),
  });
  return ok(created, { status: 201 });
});

export const DELETE = adminRoute(async (request) => {
  const query = readQuery(request);
  const templateId = query.templateId;
  if (!templateId) {
    throw new ValidationError("Thiếu templateId cần xóa.");
  }
  await classroomService.deleteCurriculumTemplate(templateId);
  return ok({ deleted: true });
});
