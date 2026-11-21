import { adminRoute, ok, readJson } from "@/lib/http";
import * as teachingJournalService from "@/services/teaching-journal.service";

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const body = await readJson(request);
    const updated = await teachingJournalService.restoreJournalRevision(id, body);
    return ok(updated);
  },
);
