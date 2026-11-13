import { adminRoute, ok, readJson } from "@/lib/http";
import * as storageService from "@/services/storage.service";

/**
 * POST /api/admin/storage/download-url
 * Returns either the optimized Cloudinary / public Supabase URL for public files
 * or a short-lived 15-minute Signed URL for private Supabase files.
 */
export const POST = adminRoute(async (request, { session }) => {
  const body = (await readJson(request)) as {
    fileId?: string;
    key?: string;
    visibility?: "public" | "private";
    downloadName?: string;
  };

  if (body.visibility === "public" && body.key) {
    return ok({
      url: storageService.getPublicUrl(body.key),
      expiresInSeconds: null,
    });
  }

  const signed = await storageService.getSignedFileUrl({
    fileId: body.fileId,
    key: body.key,
    actorId: session.id,
    actorRole: session.role,
    downloadName: body.downloadName,
  });

  return ok(signed);
});
