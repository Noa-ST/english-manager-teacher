import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as storageService from "@/services/storage.service";

export const GET = adminRoute(async (request) => {
  const query = readQuery(request);
  const [folders, files] = await Promise.all([
    storageService.listResourceFolders({ publicOnly: false }),
    storageService.listResourceFiles({
      publicOnly: false,
      folderId: query.folderId,
      fileType: query.fileType,
      search: query.search,
    }),
  ]);
  const storedFiles = storageService.listStoredFiles({
    provider: (query.provider as "cloudinary" | "supabase" | "all") ?? "all",
    category: query.category,
    search: query.search,
  });
  const status = storageService.getStorageStatus();
  const quota = storageService.checkStorageQuota();
  const auditLogs = storageService.listStorageAuditLogs().slice(0, 20);
  const orphanFiles = storageService.listOrphanedFiles();

  return ok({
    folders,
    files,
    storedFiles,
    status,
    quota,
    auditLogs,
    orphanFiles,
  });
});

export const POST = adminRoute(async (request, { session }) => {
  const body = (await readJson(request)) as Record<string, unknown>;

  if (body?.action === "uploadImage") {
    const created = await storageService.uploadImage({
      ...(body as unknown as storageService.UploadImageInput),
      actorId: session.id,
      actorRole: session.role,
    });
    return ok(created, { status: 201 });
  }

  if (body?.action === "uploadPodcast") {
    const created = await storageService.uploadPodcast({
      ...(body as unknown as storageService.UploadPodcastInput),
      actorId: session.id,
      actorRole: session.role,
    });
    return ok(created, { status: 201 });
  }

  if (body?.action === "uploadPdf") {
    const created = await storageService.uploadPdf({
      ...(body as unknown as storageService.UploadPdfInput),
      actorId: session.id,
      actorRole: session.role,
    });
    return ok(created, { status: 201 });
  }

  const created = await storageService.createResourceFile(body);
  return ok(created, { status: 201 });
});

export const PATCH = adminRoute(async (request) => {
  const body = (await readJson(request)) as { id: string };
  const updated = await storageService.toggleResourceFileVisibility(body?.id);
  return ok(updated);
});

export const DELETE = adminRoute(async (request, { session }) => {
  const { id, storedFileId, forceReplace } = readQuery(request);
  if (storedFileId) {
    const deleted = await storageService.deleteFile({
      id: storedFileId,
      actorId: session.id,
      actorRole: session.role,
      forceReplace: forceReplace === "true",
    });
    return ok({ deleted: true, record: deleted });
  }
  await storageService.deleteResourceFile(id);
  return ok({ deleted: true });
});
