import { adminRoute, ok, readJson } from "@/lib/http";
import * as storageService from "@/services/storage.service";

/**
 * POST /api/admin/storage/upload-url
 * Returns either a signed Cloudinary upload payload (for images) or a signed
 * Supabase Storage upload URL (for podcasts & PDFs). Never exposes API secrets.
 */
export const POST = adminRoute(async (request, { session }) => {
  storageService.checkUploadRateLimit(session.id);
  const ticket = await storageService.createUploadUrl(await readJson(request));
  return ok(ticket, { status: 201 });
});
