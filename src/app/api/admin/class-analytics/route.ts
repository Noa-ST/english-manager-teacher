import { adminRoute, ok, readJson } from "@/lib/http";
import * as teachingJournalService from "@/services/teaching-journal.service";

export const GET = adminRoute(async (request) => {
  const { searchParams } = new URL(request.url);
  const report = await teachingJournalService.getClassPerformanceAnalytics({
    classId: searchParams.get("classId") ?? undefined,
    period: searchParams.get("period") ?? undefined,
    programType: searchParams.get("programType") ?? undefined,
  });
  return ok(report);
});

export const POST = adminRoute(async (request) => {
  const body = await readJson(request);
  const ack = await teachingJournalService.updateAnalyticsAlertStatus(body);
  return ok(ack);
});
