import { adminRoute, ok, readJson } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";

export const GET = adminRoute(async (request) => {
  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("includeArchived") === "true";
  const classrooms = await classroomService.listAllClassrooms(includeArchived);
  return ok(classrooms);
});

export const POST = adminRoute(async (request) => {
  const created = await classroomService.createClassroom(
    await readJson(request),
  );
  return ok(created, { status: 201 });
});
