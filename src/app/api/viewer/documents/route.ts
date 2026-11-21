import { ok, publicRoute, readJson, readQuery } from "@/lib/http";
import {
  filterAndSortDocuments,
  isSafePublicDocumentUrl,
  sanitizeDocumentFilesForPublic,
  sanitizeDocumentFoldersForPublic,
  type DocumentFileTypeFilter,
  type ViewerDocumentsPayload,
} from "@/services/documents-helpers";
import {
  assertNotRateLimited,
  getClientIp,
  registerFailedAttempt,
} from "@/services/rate-limit.service";
import * as settingsService from "@/services/settings.service";
import * as storageService from "@/services/storage.service";

export const GET = publicRoute(async (request) => {
  const query = readQuery(request);
  const [rawFolders, rawAllPublicFiles, settings] = await Promise.all([
    storageService.listResourceFolders({ publicOnly: true }),
    storageService.listResourceFiles({ publicOnly: true }),
    settingsService.getSystemSettings(),
  ]);

  const allPublicFiles = sanitizeDocumentFilesForPublic(rawAllPublicFiles);
  const publicFolders = sanitizeDocumentFoldersForPublic(
    rawFolders,
    allPublicFiles,
  );

  const hasFilters = Boolean(
    (query.folderId && query.folderId !== "all") ||
      (query.fileType && query.fileType !== "all") ||
      (query.level && query.level !== "all") ||
      query.search?.trim(),
  );

  const files = hasFilters
    ? filterAndSortDocuments(allPublicFiles, {
        folderId: query.folderId,
        fileType: (query.fileType as DocumentFileTypeFilter | undefined) ?? "all",
        level: query.level,
        search: query.search,
      })
    : allPublicFiles;

  const payload: ViewerDocumentsPayload = {
    folders: publicFolders,
    files,
    currentTerm: settings.currentTerm,
  };

  return ok(payload);
});

export const POST = publicRoute(async (request) => {
  const clientIp = getClientIp(request);
  const rlKey = `pub-doc-dl:${clientIp}`;
  await assertNotRateLimited(rlKey, {
    maxAttempts: 60,
    customLockMessage: "Bạn đã tải quá nhanh trong ít phút qua. Vui lòng thử lại sau.",
  });
  await registerFailedAttempt(rlKey, { maxAttempts: 60 });

  const body = (await readJson(request)) as { fileId?: unknown };
  const result = await storageService.recordPublicResourceDownload(
    body?.fileId,
  );
  return ok({
    ...result,
    publicUrl: isSafePublicDocumentUrl(result.publicUrl)
      ? result.publicUrl
      : null,
  });
});
