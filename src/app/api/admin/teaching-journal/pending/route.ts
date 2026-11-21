import { adminRoute, ok, readQuery } from "@/lib/http";
import * as teachingJournalService from "@/services/teaching-journal.service";

export const GET = adminRoute(async (request) => {
  const query = readQuery(request);
  const daysBack = query.daysBack ? Number(query.daysBack) : 7;
  const pending = await teachingJournalService.getPendingSessionsFromSchedule(daysBack);
  return ok(pending);
});
