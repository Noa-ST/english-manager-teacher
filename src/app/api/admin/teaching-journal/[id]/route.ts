import { adminRoute, ok, readJson } from "@/lib/http";
import * as teachingJournalService from "@/services/teaching-journal.service";

export const GET = adminRoute<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const { id } = await context.params;
    const session = await teachingJournalService.getClassSessionById(id);
    return ok(session);
  },
);

export const PATCH = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const body = await readJson(request);
    const updated = await teachingJournalService.updateClassSession(id, body);
    return ok(updated);
  },
);
