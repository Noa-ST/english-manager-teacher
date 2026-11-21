import { adminRoute, ok } from "@/lib/http";
import * as scheduleService from "@/services/schedule.service";

export const DELETE = adminRoute<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const { id } = await params;
    await scheduleService.deleteScheduleException(id);
    return ok({ success: true });
  },
);
