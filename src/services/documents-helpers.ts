import type { ResourceFileItem, ResourceFolder } from "./classroom-data";

export type DocumentFileType = ResourceFileItem["fileType"];
export type DocumentFileTypeFilter = "all" | DocumentFileType;
export type DocumentSortKey =
  | "newest"
  | "downloads_desc"
  | "title_asc"
  | "size_asc";

/**
 * Thư mục học liệu công khai (Privacy-by-Design) với `itemCount` được tính động
 * từ số tệp công khai thực tế đang hoạt động trong thư mục.
 */
export type PublicResourceFolder = ResourceFolder;

/**
 * Tệp học liệu công khai (Privacy-by-Design):
 * chỉ giữ `visibility === "public"` chưa xóa mềm và loại bỏ toàn bộ 8 trường
 * hạ tầng lưu trữ nội bộ (`objectKey`, `provider`, `bucketName`, `storagePath`,
 * `cloudinaryPublicId`, `ownerId`, `storedName`, `deletedAt`).
 */
export type PublicResourceFile = Omit<
  ResourceFileItem,
  | "objectKey"
  | "provider"
  | "bucketName"
  | "storagePath"
  | "cloudinaryPublicId"
  | "ownerId"
  | "storedName"
  | "deletedAt"
>;

export interface ViewerDocumentsPayload {
  folders: PublicResourceFolder[];
  files: PublicResourceFile[];
  currentTerm: string;
}

export interface DocumentsStats {
  totalFiles: number;
  totalFolders: number;
  totalDownloads: number;
  downloadableCount: number;
  latestUpdatedAt: string | null;
}

export const DOCUMENT_FILE_TYPE_LABELS: Record<DocumentFileType, string> = {
  PDF: "Tài liệu PDF",
  SLIDE: "Slide bài giảng",
  WORKSHEET: "Phiếu bài tập (Worksheet)",
  AUDIO: "Băng nghe (Audio Listening)",
  IMAGE: "Hình ảnh",
};

export const DOCUMENT_FILE_TYPE_FILTERS: {
  value: DocumentFileTypeFilter;
  label: string;
}[] = [
  { value: "all", label: "Tất cả định dạng" },
  { value: "PDF", label: "Tài liệu PDF" },
  { value: "WORKSHEET", label: "Phiếu bài tập (Worksheet)" },
  { value: "SLIDE", label: "Slide bài giảng" },
  { value: "AUDIO", label: "Băng nghe (Audio)" },
  { value: "IMAGE", label: "Hình ảnh" },
];

export function normalizeDocumentSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesNormalizedDocumentText(
  rawText: string,
  query: string,
): boolean {
  const q = normalizeDocumentSearch(query);
  if (!q) return true;

  const haystack = normalizeDocumentSearch(rawText);
  if (q.length <= 2 && /^[a-z0-9]+$/.test(q)) {
    const tokens = haystack.split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.some((token) => token.startsWith(q));
  }

  return haystack.includes(q);
}

export function isSafePublicDocumentUrl(
  url: string | null | undefined,
): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("//")) return false;
  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("/")
  );
}

export function parseDocumentDateKey(updatedAt: string): number {
  const trimmed = updatedAt.trim();
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    return (
      Number(dmyMatch[3]) * 10000 +
      Number(dmyMatch[2]) * 100 +
      Number(dmyMatch[1])
    );
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return (
      Number(isoMatch[1]) * 10000 +
      Number(isoMatch[2]) * 100 +
      Number(isoMatch[3])
    );
  }
  return 0;
}

/**
 * Lọc tệp công khai chưa xóa và xóa triệt để 8 trường metadata hạ tầng lưu trữ nội bộ.
 */
export function sanitizeDocumentFilesForPublic(
  files: readonly ResourceFileItem[],
): PublicResourceFile[] {
  return files
    .filter((f) => f.visibility === "public" && !f.deletedAt)
    .map((f) => {
      const sanitized: PublicResourceFile = {
        id: f.id,
        folderId: f.folderId,
        folderName: f.folderName,
        title: f.title,
        description: f.description,
        fileType: f.fileType,
        size: f.size,
        sizeBytes: f.sizeBytes,
        updatedAt: f.updatedAt,
        downloads: f.downloads,
        pagesOrDuration: f.pagesOrDuration,
        level: f.level,
        visibility: f.visibility,
        previewSummary: [...(f.previewSummary ?? [])],
        publicUrl: isSafePublicDocumentUrl(f.publicUrl)
          ? f.publicUrl.trim()
          : null,
      };

      if (f.mimeType !== undefined) sanitized.mimeType = f.mimeType;
      if (f.category !== undefined) sanitized.category = f.category;
      if (f.originalName !== undefined) sanitized.originalName = f.originalName;

      return sanitized;
    });
}

/**
 * Chỉ giữ thư mục công khai và tính lại `itemCount` chính xác theo tệp công khai đang có.
 */
export function sanitizeDocumentFoldersForPublic(
  folders: readonly ResourceFolder[],
  publicFiles: readonly PublicResourceFile[],
): PublicResourceFolder[] {
  const counts = new Map<string, number>();
  for (const file of publicFiles) {
    counts.set(file.folderId, (counts.get(file.folderId) ?? 0) + 1);
  }

  return folders
    .filter((folder) => folder.visibility === "public")
    .map((folder) => ({
      ...folder,
      itemCount: counts.get(folder.id) ?? 0,
    }));
}

export function matchesDocumentQuery(
  file: PublicResourceFile,
  query: string,
): boolean {
  if (!query.trim()) return true;

  const rawText = [
    file.title,
    file.description,
    file.folderName,
    file.level,
    file.fileType,
    DOCUMENT_FILE_TYPE_LABELS[file.fileType] ?? "",
    file.pagesOrDuration,
    ...(file.previewSummary ?? []),
  ].join(" ");

  return matchesNormalizedDocumentText(rawText, query);
}

export function filterAndSortDocuments(
  files: readonly PublicResourceFile[],
  options?: {
    folderId?: string;
    fileType?: DocumentFileTypeFilter;
    level?: string;
    search?: string;
    sortBy?: DocumentSortKey;
  },
): PublicResourceFile[] {
  const folderId = options?.folderId?.trim() ?? "all";
  const fileType = options?.fileType ?? "all";
  const level = options?.level?.trim() ?? "all";
  const search = options?.search ?? "";
  const sortBy = options?.sortBy ?? "newest";

  const filtered = files.filter((file) => {
    if (folderId !== "all" && file.folderId !== folderId) return false;
    if (fileType !== "all" && file.fileType !== fileType) return false;
    if (level !== "all" && file.level !== level) return false;
    if (!matchesDocumentQuery(file, search)) return false;
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === "downloads_desc") {
      const diff = (b.downloads ?? 0) - (a.downloads ?? 0);
      return diff !== 0 ? diff : a.title.localeCompare(b.title, "vi");
    }
    if (sortBy === "title_asc") {
      return a.title.localeCompare(b.title, "vi");
    }
    if (sortBy === "size_asc") {
      const diff = (a.sizeBytes || 0) - (b.sizeBytes || 0);
      return diff !== 0 ? diff : a.title.localeCompare(b.title, "vi");
    }

    const dateDiff =
      parseDocumentDateKey(b.updatedAt) - parseDocumentDateKey(a.updatedAt);
    if (dateDiff !== 0) return dateDiff;
    const dlDiff = (b.downloads ?? 0) - (a.downloads ?? 0);
    return dlDiff !== 0 ? dlDiff : a.title.localeCompare(b.title, "vi");
  });
}

export function countDocumentsByFileType(
  files: readonly PublicResourceFile[],
  folderId = "all",
): Record<DocumentFileTypeFilter, number> {
  const scoped =
    folderId && folderId !== "all"
      ? files.filter((f) => f.folderId === folderId)
      : files;

  const counts: Record<DocumentFileTypeFilter, number> = {
    all: scoped.length,
    PDF: 0,
    WORKSHEET: 0,
    SLIDE: 0,
    AUDIO: 0,
    IMAGE: 0,
  };

  for (const file of scoped) {
    counts[file.fileType] += 1;
  }

  return counts;
}

export function extractDocumentLevels(
  files: readonly PublicResourceFile[],
): string[] {
  const set = new Set<string>();
  for (const file of files) {
    const level = file.level.trim();
    if (level) set.add(level);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
}

export function computeDocumentsStats(
  folders: readonly PublicResourceFolder[],
  files: readonly PublicResourceFile[],
): DocumentsStats {
  let totalDownloads = 0;
  let downloadableCount = 0;
  let latestUpdatedAt: string | null = null;
  let bestDateKey = -1;

  for (const file of files) {
    totalDownloads += Math.max(0, file.downloads ?? 0);
    if (isSafePublicDocumentUrl(file.publicUrl)) {
      downloadableCount += 1;
    }
    const key = parseDocumentDateKey(file.updatedAt);
    if (key > bestDateKey && file.updatedAt.trim()) {
      bestDateKey = key;
      latestUpdatedAt = file.updatedAt;
    }
  }

  return {
    totalFiles: files.length,
    totalFolders: folders.length,
    totalDownloads,
    downloadableCount,
    latestUpdatedAt,
  };
}
