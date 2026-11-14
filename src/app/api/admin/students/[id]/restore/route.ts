import { adminRoute, ok } from "@/lib/http";
import * as studentService from "@/services/student.service";

/**
 * POST /api/admin/students/[id]/restore — Restores an archived student back to active.
 */
export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (_request, context) => {
    const { id } = await context.params;
    const restored = await studentService.restoreStudent(id);
    return ok(restored);
  },
);
