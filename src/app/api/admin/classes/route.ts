import { adminRoute, ok, readJson } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";

export const GET = adminRoute(async () => {
  const classrooms = await classroomService.listClassrooms();
  return ok(classrooms);
});

export const POST = adminRoute(async (request) => {
  const created = await classroomService.createClassroom(
    await readJson(request),
  );
  return ok(created, { status: 201 });
});

