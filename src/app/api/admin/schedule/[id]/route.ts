import { adminRoute, ok, readJson } from "@/lib/http";
import { NotFoundError } from "@/services/errors";
import * as scheduleService from "@/services/schedule.service";

export const PATCH = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, { params }) => {
    const { id } = await params;
    const updated = await scheduleService.updateClassSession(
      id,
      await readJson(request),
    );
    return ok(updated);
  },
);

export const DELETE = adminRoute<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const { id } = await params;
    const deleted = await scheduleService.deleteClassSession(id);
    if (!deleted) {
      throw new NotFoundError("ClassSession", id);
    }
    return ok({ success: true });
  },
);
