import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as storageService from "@/services/storage.service";

export const GET = adminRoute(async (request) => {
  const query = readQuery(request);
  const [folders, files, storedFiles, quota, auditLogs, orphanFiles] =
    await Promise.all([
      storageService.listResourceFolders({ publicOnly: false }),
      storageService.listResourceFiles({
        publicOnly: false,
        folderId: query.folderId,
        fileType: query.fileType,
        search: query.search,
      }),
      storageService.listStoredFiles({
        provider: (query.provider as "cloudinary" | "supabase" | "all") ?? "all",
        category: query.category,
        search: query.search,
      }),
      storageService.checkStorageQuota(),
      storageService.listStorageAuditLogs(50),
      storageService.listOrphanedFiles(),
    ]);
  const status = storageService.getStorageStatus();

  return ok({
    folders,
    files,
    storedFiles,
    status,
    quota,
    auditLogs: auditLogs.slice(0, 50),
    orphanFiles,
  });
});

export const POST = adminRoute(async (request, { session }) => {
  const rawBody = (await readJson(request)) as Record<string, unknown>;
  // Never accept client-injected fault-simulation flags in HTTP production routes
  const body = { ...rawBody };
  delete body.simulateMetadataFailure;

  if (body?.action === "uploadImage") {
    const created = await storageService.uploadImage({
      ...(body as unknown as storageService.UploadImageInput),
      simulateMetadataFailure: false,
      actorId: session.id,
      actorRole: session.role,
    });
    return ok(created, { status: 201 });
  }

  if (body?.action === "uploadPodcast") {
    const created = await storageService.uploadPodcast({
      ...(body as unknown as storageService.UploadPodcastInput),
      simulateMetadataFailure: false,
      actorId: session.id,
      actorRole: session.role,
    });
    return ok(created, { status: 201 });
  }

  if (body?.action === "uploadPdf") {
    const created = await storageService.uploadPdf({
      ...(body as unknown as storageService.UploadPdfInput),
      simulateMetadataFailure: false,
      actorId: session.id,
      actorRole: session.role,
    });
    return ok(created, { status: 201 });
  }

  if (body?.action === "replaceFile") {
    const targetFileId = String(body.targetFileId ?? "");
    const rawReplacement = (body.replacement ?? {}) as Record<string, unknown>;
    const cleanReplacement = { ...rawReplacement };
    delete cleanReplacement.simulateMetadataFailure;
    const replaced = await storageService.replaceFile({
      targetFileId,
      replacement: {
        ...(cleanReplacement as unknown as storageService.UploadImageInput),
        simulateMetadataFailure: false,
        actorId: session.id,
        actorRole: session.role,
      },
    });
    return ok(replaced, { status: 200 });
  }

  if (body?.action === "cleanupOrphans") {
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : undefined;
    const summary = await storageService.cleanupOrphanedFiles({
      ids,
      actorId: session.id,
      actorRole: session.role,
    });
    return ok(summary, { status: 200 });
  }

  if (body?.action === "createFolder") {
    const folder = await storageService.createResourceFolder(
      body.payload ?? body,
    );
    return ok(folder, { status: 201 });
  }

  const created = await storageService.createResourceFile(body, session.id);
  return ok(created, { status: 201 });
});

export const PATCH = adminRoute(async (request, { session }) => {
  const body = (await readJson(request)) as {
    action?: "updateFile" | "updateFolder" | "toggleVisibility";
    id: string;
    payload?: unknown;
  };

  if (body?.action === "updateFile") {
    const updated = await storageService.updateResourceFile(
      body.id,
      body.payload,
      session.id,
    );
    return ok(updated);
  }

  if (body?.action === "updateFolder") {
    const updated = await storageService.updateResourceFolder(
      body.id,
      body.payload,
    );
    return ok(updated);
  }

  const updated = await storageService.toggleResourceFileVisibility(
    body?.id,
    session.id,
  );
  return ok(updated);
});

export const DELETE = adminRoute(async (request, { session }) => {
  const { id, storedFileId, folderId, forceReplace } = readQuery(request);
  if (folderId) {
    await storageService.deleteResourceFolder(folderId);
    return ok({ deleted: true });
  }
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
