import { adminRoute, ok, readJson } from "@/lib/http";
import * as teachingJournalService from "@/services/teaching-journal.service";

export const GET = adminRoute(async (request) => {
  const { searchParams } = new URL(request.url);
  const studentTimelineId = searchParams.get("studentTimelineId");

  if (studentTimelineId) {
    const timeline =
      await teachingJournalService.getStudentLearningTimeline(
        studentTimelineId,
      );
    return ok(timeline);
  }

  const sessions = await teachingJournalService.listClassSessions({
    classId: searchParams.get("classId") ?? undefined,
    studentId: searchParams.get("studentId") ?? undefined,
    journalStatus:
      (searchParams.get("journalStatus") as
        | "all"
        | "completed"
        | "draft"
        | "not-started"
        | null) ?? undefined,
    fromDate: searchParams.get("fromDate") ?? undefined,
    toDate: searchParams.get("toDate") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  return ok(sessions);
});

export const POST = adminRoute(async (request) => {
  const body = await readJson(request);
  const session =
    await teachingJournalService.createOrGenerateClassSession(body);
  return ok(session, { status: 201 });
});
