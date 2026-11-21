import { NextResponse } from "next/server";

import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import { ForbiddenError } from "@/services/errors";
import * as storageService from "@/services/storage.service";

/**
 * GET /api/admin/storage/download-url
 * Browser-friendly download/redirect endpoint for both public files and
 * private Supabase files via short-lived 15-minute Signed URLs (never mutates audit state on GET).
 */
export const GET = adminRoute(async (request, { session }) => {
  const { fileId, key, downloadName, mode } = readQuery(request);

  if (fileId) {
    const record = await storageService.getFileMetadata(fileId);
    if (record.isPublic && record.publicUrl) {
      return mode === "json"
        ? ok({ url: record.publicUrl, expiresInSeconds: null })
        : NextResponse.redirect(record.publicUrl, { status: 302 });
    }
  }

  const signed = await storageService.getSignedFileUrl({
    fileId,
    key,
    actorId: session.id,
    actorRole: session.role,
    downloadName,
    skipAuditLog: true,
  });

  return mode === "json"
    ? ok(signed)
    : NextResponse.redirect(signed.url, { status: 302 });
});

/**
 * POST /api/admin/storage/download-url
 * Returns either the verified public URL or a short-lived Signed URL for private files.
 */
export const POST = adminRoute(async (request, { session }) => {
  const body = (await readJson(request)) as {
    fileId?: string;
    key?: string;
    visibility?: "public" | "private";
    downloadName?: string;
  };

  if (body.visibility === "public" && body.key) {
    const stored = (
      await storageService.listStoredFiles({ includeDeleted: true })
    ).find(
      (f) => f.storagePath === body.key || f.cloudinaryPublicId === body.key,
    );
    if (stored && (stored.deletedAt || !stored.isPublic)) {
      throw new ForbiddenError("Tệp đã bị xóa hoặc ở chế độ riêng tư, không thể lấy Public URL.");
    }
    if (!stored && !body.key.startsWith("english-manager/") && !body.key.startsWith("resources/") && !body.key.startsWith("podcasts/")) {
      throw new ForbiddenError("Key lưu trữ không nằm trong danh mục công khai.");
    }
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
