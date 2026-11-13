import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import {
  buildCloudinaryUrl,
  CLOUDINARY_FOLDER_MAP,
  CLOUDINARY_TRANSFORM_PRESETS,
  getStorageProvider,
  type CloudinaryTransformPreset,
  type ImageCategory,
  type ProviderUploadTicket,
  type SupabasePrivateFolder,
  type SupabasePublicFolder,
} from "@/lib/storage";
import type { FileVisibility, Role, StorageProviderName } from "@/types";

import type {
  OrphanedStorageObject,
  ResourceFileItem,
  ResourceFolder,
  StorageAuditLogEntry,
  StoredFileRecord,
} from "./classroom-data";
import { idSchema, validate } from "./common";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import { getRuntimeStore } from "./runtime-store";

/**
 * Unified Multi-Provider Storage Service
 * - Cloudinary Free: Images (avatars, projects, podcast thumbnails, announcements, articles, resources)
 * - Supabase Free Storage: Podcasts (MP3/M4A) & PDFs (public & private buckets)
 * - PostgreSQL / RuntimeStore: Metadata, access control, reference tracking, quota & audit logs
 */

const MB = 1024 * 1024;

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

const ALLOWED_AUDIO_MIMES = ["audio/mpeg", "audio/mp4", "audio/x-m4a"] as const;
const ALLOWED_AUDIO_EXTENSIONS = ["mp3", "m4a"] as const;

const ALLOWED_PDF_MIMES = ["application/pdf"] as const;
const ALLOWED_PDF_EXTENSIONS = ["pdf"] as const;

const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "msi",
  "dll",
  "com",
  "scr",
  "php",
  "jsp",
  "asp",
  "aspx",
  "html",
  "htm",
  "js",
  "mjs",
  "cjs",
  "vbs",
  "jar",
]);

// -----------------------------------------------------------------------------
//  RATE LIMITING (IN-MEMORY SLIDING WINDOW FOR UPLOAD APIS)
// -----------------------------------------------------------------------------

const uploadRateBuckets = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_UPLOADS_PER_MINUTE = 25;

export function checkUploadRateLimit(
  actorId: string,
  maxPerMinute = RATE_LIMIT_MAX_UPLOADS_PER_MINUTE,
): void {
  const now = Date.now();
  const key = actorId || "anonymous";
  const timestamps = (uploadRateBuckets.get(key) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= maxPerMinute) {
    throw new ConflictError(
      "Tốc độ tải tệp vượt quá giới hạn bảo mật (tối đa 25 tệp/phút). Vui lòng thử lại sau ít giây.",
    );
  }
  timestamps.push(now);
  uploadRateBuckets.set(key, timestamps);
}

export function resetUploadRateLimit(): void {
  uploadRateBuckets.clear();
}

// -----------------------------------------------------------------------------
//  PATH & MAGIC-BYTE SECURITY VALIDATION
// -----------------------------------------------------------------------------

export const objectKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(
    (key) =>
      !key.startsWith("/") &&
      !key.includes("..") &&
      !key.includes("\\") &&
      !key.includes("\0"),
    "Đường dẫn lưu trữ không hợp lệ (Path traversal bị chặn)",
  );

export function slugifyFileName(fileName: string): { base: string; extension: string } {
  if (
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("\0")
  ) {
    throw new ValidationError("Tên tệp chứa ký tự điều hướng đường dẫn không hợp lệ");
  }

  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) {
    throw new ValidationError("Tệp tải lên phải có phần mở rộng hợp lệ");
  }

  const rawBase = fileName.slice(0, dot);
  const rawExtension = fileName.slice(dot + 1).toLowerCase().trim();

  if (DANGEROUS_EXTENSIONS.has(rawExtension)) {
    throw new ValidationError(
      `Phần mở rộng ".${rawExtension}" bị chặn vì lý do bảo mật (chống tệp thực thi)`,
    );
  }

  const base =
    rawBase
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file";

  const extension = rawExtension.replace(/[^a-z0-9]/g, "").slice(0, 10);
  return { base, extension };
}

/**
 * Inspects binary magic bytes when file content is provided so a browser cannot
 * spoof `Content-Type` (e.g. renaming `.exe` or `.pdf` to `.png`).
 */
export function verifyFileMagicBytes(
  bytes: Uint8Array | Buffer | undefined,
  expectedFamily: "image" | "audio" | "pdf",
): void {
  if (!bytes || bytes.length < 4) return;

  // Always block Windows PE (MZ) and Linux ELF binaries
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
    throw new ValidationError("Phát hiện chữ ký tệp thực thi (PE/MZ) bị cấm tải lên");
  }
  if (
    bytes[0] === 0x7f &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x46
  ) {
    throw new ValidationError("Phát hiện chữ ký tệp thực thi (ELF) bị cấm tải lên");
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  const isPdf =
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46; // %PDF

  const isMp3Id3 =
    bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33; // ID3
  const isMp3Frame =
    bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  const isM4aFtyp =
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70; // ....ftyp

  if (expectedFamily === "image" && !(isJpeg || isPng || isWebp)) {
    throw new ValidationError(
      "Nội dung nhị phân thực tế không khớp định dạng ảnh hợp lệ (JPEG, PNG, WebP)",
    );
  }
  if (expectedFamily === "pdf" && !isPdf) {
    throw new ValidationError(
      "Nội dung nhị phân thực tế không phải là tệp PDF hợp lệ (%PDF header missing)",
    );
  }
  if (expectedFamily === "audio" && !(isMp3Id3 || isMp3Frame || isM4aFtyp)) {
    throw new ValidationError(
      "Nội dung nhị phân thực tế không phải là tệp âm thanh MP3/M4A hợp lệ",
    );
  }
}

export function buildObjectKey(
  folderPrefix: string,
  fileName: string,
  now = new Date(),
  includeExtension = true,
): string {
  const { base, extension } = slugifyFileName(fileName);
  const cleanPrefix = validate(objectKeySchema, folderPrefix.replace(/^\/+|\/+$/g, ""));
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const suffix = includeExtension && extension ? `.${extension}` : "";
  return `${cleanPrefix}/${yyyy}/${mm}/${crypto.randomUUID()}-${base}${suffix}`;
}

function formatBytesLabel(sizeBytes: number): string {
  if (sizeBytes >= MB) {
    return `${(sizeBytes / MB).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

function recordAuditLog(
  entry: Omit<StorageAuditLogEntry, "id" | "createdAt">,
): void {
  const store = getRuntimeStore();
  // Never allow signed tokens or secrets into audit log details
  const redactedDetail = entry.detail
    .replace(/token=[^&\s]+/gi, "token=[REDACTED]")
    .replace(/signature=[^&\s]+/gi, "signature=[REDACTED]");

  store.storageAuditLogs.unshift({
    ...entry,
    detail: redactedDetail,
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  });
}

// -----------------------------------------------------------------------------
//  PROVIDER ROUTING & QUOTA MONITORING (PHẦN 6 & PHẦN 7)
// -----------------------------------------------------------------------------

export function resolveProviderForMedia(
  mediaKind: "image" | "audio" | "pdf",
  requestedProvider?: StorageProviderName,
): StorageProviderName {
  const env = getServerEnv();

  if (mediaKind === "image") {
    const expected = env.STORAGE_PROVIDER_IMAGES;
    if (requestedProvider && requestedProvider !== expected) {
      throw new ValidationError(
        `Không cho phép tải hình ảnh lên provider "${requestedProvider}". Hình ảnh phải định tuyến qua "${expected}".`,
      );
    }
    return expected;
  }

  if (mediaKind === "audio") {
    const expected = env.STORAGE_PROVIDER_AUDIO;
    if (requestedProvider && requestedProvider !== expected) {
      throw new ValidationError(
        `Không cho phép tải podcast/audio lên provider "${requestedProvider}". Audio phải định tuyến qua "${expected}".`,
      );
    }
    return expected;
  }

  const expected = env.STORAGE_PROVIDER_DOCUMENTS;
  if (requestedProvider && requestedProvider !== expected) {
    throw new ValidationError(
      `Không cho phép tải tài liệu PDF lên provider "${requestedProvider}". PDF phải định tuyến qua "${expected}".`,
    );
  }
  return expected;
}

export type QuotaAlertLevel = "healthy" | "warning" | "critical" | "locked" | "unknown";

export interface ProviderQuotaStatus {
  provider: "cloudinary" | "supabase";
  trackedFilesCount: number;
  trackedStorageBytes: number;
  storageLimitBytes: number;
  usagePercent: number;
  alertLevel: QuotaAlertLevel;
  canUploadNewFiles: boolean;
  externalMetricsStatus: "Chưa đồng bộ từ Dashboard" | "Đã đồng bộ thủ công";
  cachedEgressLabel: string;
  uncachedEgressLabel: string;
  creditsOrTransformationsLabel: string;
  lastSyncedAt: string | null;
}

export interface StorageQuotaReport {
  cloudinary: ProviderQuotaStatus;
  supabase: ProviderQuotaStatus;
  thresholds: {
    warningPercent: number;
    criticalPercent: number;
    lockPercent: number;
  };
  limits: {
    maxImageSizeMb: number;
    maxAudioSizeMb: number;
    maxPdfSizeMb: number;
    privateUrlTtlSeconds: number;
  };
  totalTrackedFiles: number;
  totalTrackedBytes: number;
  summaryCounts: {
    cloudinaryImages: number;
    supabasePodcasts: number;
    supabasePdfs: number;
  };
}

function evaluateAlertLevel(
  usagePercent: number,
  warning: number,
  critical: number,
  lock: number,
): QuotaAlertLevel {
  if (usagePercent >= lock) return "locked";
  if (usagePercent >= critical) return "critical";
  if (usagePercent >= warning) return "warning";
  return "healthy";
}

export function checkStorageQuota(options?: {
  provider?: "cloudinary" | "supabase";
  incomingSizeBytes?: number;
}): StorageQuotaReport {
  const env = getServerEnv();
  const store = getRuntimeStore();
  const activeFiles = store.storedFiles.filter((f) => !f.deletedAt);

  const cloudinaryFiles = activeFiles.filter((f) => f.provider === "cloudinary");
  const supabaseFiles = activeFiles.filter((f) => f.provider === "supabase");

  const cloudinaryBytes =
    cloudinaryFiles.reduce((acc, f) => acc + f.fileSize, 0) +
    (options?.provider === "cloudinary" ? (options.incomingSizeBytes ?? 0) : 0);
  const supabaseBytes =
    supabaseFiles.reduce((acc, f) => acc + f.fileSize, 0) +
    (options?.provider === "supabase" ? (options.incomingSizeBytes ?? 0) : 0);

  const cloudinaryLimitBytes = env.CLOUDINARY_FREE_STORAGE_LIMIT_MB * MB;
  const supabaseLimitBytes = env.SUPABASE_FREE_STORAGE_LIMIT_MB * MB;

  const cloudinaryPercent = Number(
    ((cloudinaryBytes / cloudinaryLimitBytes) * 100).toFixed(2),
  );
  const supabasePercent = Number(
    ((supabaseBytes / supabaseLimitBytes) * 100).toFixed(2),
  );

  const cloudinaryAlert = evaluateAlertLevel(
    cloudinaryPercent,
    env.QUOTA_WARNING_PERCENT,
    env.QUOTA_CRITICAL_PERCENT,
    env.QUOTA_LOCK_PERCENT,
  );
  const supabaseAlert = evaluateAlertLevel(
    supabasePercent,
    env.QUOTA_WARNING_PERCENT,
    env.QUOTA_CRITICAL_PERCENT,
    env.QUOTA_LOCK_PERCENT,
  );

  if (options?.provider === "cloudinary" && cloudinaryAlert === "locked") {
    throw new ConflictError(
      `Tạm khóa tải ảnh mới: Dung lượng Cloudinary đã chạm ngưỡng bảo vệ Free (${cloudinaryPercent}% >= ${env.QUOTA_LOCK_PERCENT}%).`,
    );
  }
  if (options?.provider === "supabase" && supabaseAlert === "locked") {
    throw new ConflictError(
      `Tạm khóa tải tệp mới: Dung lượng Supabase Storage đã chạm ngưỡng bảo vệ Free (${supabasePercent}% >= ${env.QUOTA_LOCK_PERCENT}%).`,
    );
  }

  return {
    cloudinary: {
      provider: "cloudinary",
      trackedFilesCount: cloudinaryFiles.length,
      trackedStorageBytes: cloudinaryBytes,
      storageLimitBytes: cloudinaryLimitBytes,
      usagePercent: cloudinaryPercent,
      alertLevel: cloudinaryAlert,
      canUploadNewFiles: cloudinaryAlert !== "locked",
      externalMetricsStatus: "Chưa đồng bộ từ Dashboard",
      cachedEgressLabel: "Không xác định (Chưa đồng bộ từ Cloudinary Dashboard)",
      uncachedEgressLabel: "Không xác định (Chưa đồng bộ từ Cloudinary Dashboard)",
      creditsOrTransformationsLabel:
        "5 preset cố định (f_auto,q_auto) · Credits tháng: Không xác định",
      lastSyncedAt: null,
    },
    supabase: {
      provider: "supabase",
      trackedFilesCount: supabaseFiles.length,
      trackedStorageBytes: supabaseBytes,
      storageLimitBytes: supabaseLimitBytes,
      usagePercent: supabasePercent,
      alertLevel: supabaseAlert,
      canUploadNewFiles: supabaseAlert !== "locked",
      externalMetricsStatus: "Chưa đồng bộ từ Dashboard",
      cachedEgressLabel: "Không xác định (Chưa đồng bộ từ Supabase Dashboard)",
      uncachedEgressLabel: "Không xác định (Chưa đồng bộ từ Supabase Dashboard)",
      creditsOrTransformationsLabel: "Giới hạn Free: 50 MB/file (Cấu hình an toàn: 40 MB)",
      lastSyncedAt: null,
    },
    thresholds: {
      warningPercent: env.QUOTA_WARNING_PERCENT,
      criticalPercent: env.QUOTA_CRITICAL_PERCENT,
      lockPercent: env.QUOTA_LOCK_PERCENT,
    },
    limits: {
      maxImageSizeMb: env.MAX_IMAGE_SIZE_MB,
      maxAudioSizeMb: env.MAX_AUDIO_SIZE_MB,
      maxPdfSizeMb: env.MAX_PDF_SIZE_MB,
      privateUrlTtlSeconds: env.PRIVATE_FILE_URL_TTL_SECONDS,
    },
    totalTrackedFiles: activeFiles.length,
    totalTrackedBytes: activeFiles.reduce((acc, f) => acc + f.fileSize, 0),
    summaryCounts: {
      cloudinaryImages: cloudinaryFiles.length,
      supabasePodcasts: supabaseFiles.filter((f) => f.fileType === "AUDIO").length,
      supabasePdfs: supabaseFiles.filter((f) => f.fileType === "PDF").length,
    },
  };
}

// -----------------------------------------------------------------------------
//  HIGH-LEVEL STORAGE OPERATIONS (PHẦN 3, 4, 5, 6, 11)
// -----------------------------------------------------------------------------

export const uploadImageSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive(),
  category: z
    .enum([
      "student_avatar",
      "teacher_avatar",
      "project",
      "podcast_thumbnail",
      "announcement",
      "article",
      "resource",
    ])
    .default("resource"),
  actorId: z.string().trim().min(1).default("admin"),
  actorRole: z.enum(["admin", "student"]).default("admin"),
  provider: z.enum(["cloudinary", "supabase", "r2", "s3", "local"]).optional(),
  maxSizeMbOverride: z.number().positive().max(25).optional(),
  referencedBy: z.array(z.string()).default([]),
  simulateMetadataFailure: z.boolean().optional(),
});

export type UploadImageInput = z.input<typeof uploadImageSchema> & {
  fileBuffer?: Uint8Array | Buffer;
};

export async function uploadImage(input: UploadImageInput): Promise<StoredFileRecord> {
  const data = validate(uploadImageSchema, input);

  if (data.actorRole !== "admin") {
    throw new ForbiddenError("Chỉ quản trị viên mới có quyền tải hình ảnh lên hệ thống");
  }

  checkUploadRateLimit(data.actorId);
  const providerName = resolveProviderForMedia("image", data.provider);

  const { extension } = slugifyFileName(data.fileName);
  if (
    !ALLOWED_IMAGE_EXTENSIONS.includes(
      extension as (typeof ALLOWED_IMAGE_EXTENSIONS)[number],
    ) ||
    !ALLOWED_IMAGE_MIMES.includes(
      data.mimeType as (typeof ALLOWED_IMAGE_MIMES)[number],
    )
  ) {
    throw new ValidationError(
      `Định dạng "${data.mimeType}" (.${extension}) không hợp lệ. Chỉ chấp nhận JPEG, JPG, PNG, WebP.`,
    );
  }

  verifyFileMagicBytes(input.fileBuffer, "image");

  const env = getServerEnv();
  const maxMb = data.maxSizeMbOverride ?? env.MAX_IMAGE_SIZE_MB;
  if (data.sizeBytes > maxMb * MB) {
    throw new ValidationError(
      `Ảnh vượt quá giới hạn dung lượng cho phép (${maxMb} MB).`,
    );
  }

  checkStorageQuota({
    provider: "cloudinary",
    incomingSizeBytes: data.sizeBytes,
  });

  const cloudinaryFolder = CLOUDINARY_FOLDER_MAP[data.category as ImageCategory];
  const publicId = buildObjectKey(cloudinaryFolder, data.fileName, new Date(), false);
  const provider = getStorageProvider(providerName);

  const uploaded = await provider.upload({
    storagePath: publicId,
    cloudinaryFolder,
    cloudinaryPublicId: publicId,
    contentType: data.mimeType,
    sizeBytes: data.sizeBytes,
    visibility: "public",
    body: input.fileBuffer,
    allowOverwrite: false,
  });

  try {
    if (data.simulateMetadataFailure) {
      throw new Error("Simulated PostgreSQL metadata save failure");
    }

    const nowIso = new Date().toISOString();
    const record: StoredFileRecord = {
      id: `sf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originalName: data.fileName,
      storedName: uploaded.storagePath.split("/").pop() ?? data.fileName,
      provider: providerName,
      fileType: "IMAGE",
      mimeType: data.mimeType,
      fileSize: data.sizeBytes,
      bucketName: null,
      storagePath: uploaded.storagePath,
      cloudinaryPublicId: uploaded.cloudinaryPublicId ?? publicId,
      publicUrl: uploaded.publicUrl,
      isPublic: true,
      ownerId: data.actorId,
      category: data.category,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      referencedBy: data.referencedBy,
    };

    const store = getRuntimeStore();
    store.storedFiles.unshift(record);

    recordAuditLog({
      action: "UPLOAD_IMAGE",
      provider: providerName,
      actorId: data.actorId,
      targetId: record.id,
      targetPath: record.storagePath ?? publicId,
      status: "SUCCESS",
      detail: `Đã tải ảnh "${data.fileName}" (${formatBytesLabel(data.sizeBytes)}) vào ${cloudinaryFolder}`,
    });

    return record;
  } catch (err) {
    // Rollback uploaded file on Cloudinary if metadata save fails (PHẦN 11)
    try {
      await provider.delete({
        storagePath: uploaded.storagePath,
        cloudinaryPublicId: uploaded.cloudinaryPublicId ?? publicId,
        visibility: "public",
      });
      recordAuditLog({
        action: "ROLLBACK_ORPHAN",
        provider: providerName,
        actorId: data.actorId,
        targetId: publicId,
        targetPath: uploaded.storagePath,
        status: "ROLLED_BACK",
        detail: "Đã rollback xóa ảnh trên Cloudinary do lưu metadata thất bại",
      });
    } catch {
      const orphan: OrphanedStorageObject = {
        id: `orphan-${Date.now()}`,
        provider: providerName,
        bucketName: null,
        storagePath: uploaded.storagePath,
        cloudinaryPublicId: uploaded.cloudinaryPublicId ?? publicId,
        reason: "Lưu metadata thất bại và rollback Cloudinary không thành công",
        createdAt: new Date().toISOString(),
      };
      getRuntimeStore().orphanFiles.unshift(orphan);
    }
    throw err;
  }
}

export const uploadPodcastSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive(),
  visibility: z.enum(["public", "private"]).default("public"),
  actorId: z.string().trim().min(1).default("admin"),
  actorRole: z.enum(["admin", "student"]).default("admin"),
  provider: z.enum(["cloudinary", "supabase", "r2", "s3", "local"]).optional(),
  referencedBy: z.array(z.string()).default([]),
  simulateMetadataFailure: z.boolean().optional(),
});

export type UploadPodcastInput = z.input<typeof uploadPodcastSchema> & {
  fileBuffer?: Uint8Array | Buffer;
};

export async function uploadPodcast(input: UploadPodcastInput): Promise<StoredFileRecord> {
  const data = validate(uploadPodcastSchema, input);

  if (data.actorRole !== "admin") {
    throw new ForbiddenError("Chỉ quản trị viên mới có quyền tải podcast lên hệ thống");
  }

  checkUploadRateLimit(data.actorId);
  const providerName = resolveProviderForMedia("audio", data.provider);

  const { extension } = slugifyFileName(data.fileName);
  if (
    !ALLOWED_AUDIO_EXTENSIONS.includes(
      extension as (typeof ALLOWED_AUDIO_EXTENSIONS)[number],
    ) ||
    !ALLOWED_AUDIO_MIMES.includes(
      data.mimeType as (typeof ALLOWED_AUDIO_MIMES)[number],
    )
  ) {
    throw new ValidationError(
      `Định dạng "${data.mimeType}" (.${extension}) không hợp lệ cho podcast. Chỉ chấp nhận MP3, M4A.`,
    );
  }

  verifyFileMagicBytes(input.fileBuffer, "audio");

  const env = getServerEnv();
  if (data.sizeBytes > env.MAX_AUDIO_SIZE_MB * MB) {
    throw new ValidationError(
      `Tệp podcast vượt quá giới hạn an toàn ${env.MAX_AUDIO_SIZE_MB} MB của gói Supabase Free.`,
    );
  }

  checkStorageQuota({
    provider: "supabase",
    incomingSizeBytes: data.sizeBytes,
  });

  const bucket =
    data.visibility === "public"
      ? env.SUPABASE_PUBLIC_BUCKET
      : env.SUPABASE_PRIVATE_BUCKET;
  const folderPrefix = data.visibility === "public" ? "podcasts" : "teacher-resources";
  const storagePath = buildObjectKey(folderPrefix, data.fileName);
  const provider = getStorageProvider(providerName);

  const uploaded = await provider.upload({
    bucket,
    storagePath,
    contentType: data.mimeType,
    sizeBytes: data.sizeBytes,
    visibility: data.visibility,
    body: input.fileBuffer,
    allowOverwrite: false,
  });

  try {
    if (data.simulateMetadataFailure) {
      throw new Error("Simulated PostgreSQL metadata save failure");
    }

    const nowIso = new Date().toISOString();
    const record: StoredFileRecord = {
      id: `sf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originalName: data.fileName,
      storedName: storagePath.split("/").pop() ?? data.fileName,
      provider: providerName,
      fileType: "AUDIO",
      mimeType: data.mimeType,
      fileSize: data.sizeBytes,
      bucketName: bucket,
      storagePath: uploaded.storagePath,
      cloudinaryPublicId: null,
      // Never persist temporary signed URLs in database metadata
      publicUrl: data.visibility === "public" ? uploaded.publicUrl : null,
      isPublic: data.visibility === "public",
      ownerId: data.actorId,
      category: folderPrefix,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      referencedBy: data.referencedBy,
    };

    getRuntimeStore().storedFiles.unshift(record);

    recordAuditLog({
      action: "UPLOAD_PODCAST",
      provider: providerName,
      actorId: data.actorId,
      targetId: record.id,
      targetPath: `${bucket}/${uploaded.storagePath}`,
      status: "SUCCESS",
      detail: `Đã tải podcast "${data.fileName}" (${formatBytesLabel(data.sizeBytes)}) vào bucket ${bucket}`,
    });

    return record;
  } catch (err) {
    try {
      await provider.delete({
        bucket,
        storagePath: uploaded.storagePath,
        visibility: data.visibility,
      });
    } catch {
      getRuntimeStore().orphanFiles.unshift({
        id: `orphan-${Date.now()}`,
        provider: providerName,
        bucketName: bucket,
        storagePath: uploaded.storagePath,
        cloudinaryPublicId: null,
        reason: "Lưu metadata podcast thất bại và rollback Supabase không thành công",
        createdAt: new Date().toISOString(),
      });
    }
    throw err;
  }
}

export const uploadPdfSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive(),
  visibility: z.enum(["public", "private"]).default("public"),
  category: z
    .enum([
      "resources/grammar",
      "resources/vocabulary",
      "resources/exercises",
      "attachments",
      "exams",
      "answers",
      "internal-documents",
      "student-documents",
      "teacher-resources",
    ])
    .optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  folderId: z.string().trim().optional(),
  level: z.string().trim().max(64).default("IELTS 6.5+"),
  pagesOrDuration: z.string().trim().max(64).default("20 trang"),
  actorId: z.string().trim().min(1).default("admin"),
  actorRole: z.enum(["admin", "student"]).default("admin"),
  provider: z.enum(["cloudinary", "supabase", "r2", "s3", "local"]).optional(),
  referencedBy: z.array(z.string()).default([]),
  simulateMetadataFailure: z.boolean().optional(),
});

export type UploadPdfInput = z.input<typeof uploadPdfSchema> & {
  fileBuffer?: Uint8Array | Buffer;
};

const PUBLIC_PDF_CATEGORIES = new Set<SupabasePublicFolder>([
  "podcasts",
  "resources/grammar",
  "resources/vocabulary",
  "resources/exercises",
  "attachments",
]);

const PRIVATE_PDF_CATEGORIES = new Set<SupabasePrivateFolder>([
  "exams",
  "answers",
  "internal-documents",
  "student-documents",
  "teacher-resources",
]);

export async function uploadPdf(input: UploadPdfInput): Promise<StoredFileRecord> {
  const data = validate(uploadPdfSchema, input);

  if (data.actorRole !== "admin") {
    throw new ForbiddenError("Chỉ quản trị viên mới có quyền tải tài liệu PDF lên hệ thống");
  }

  checkUploadRateLimit(data.actorId);
  const providerName = resolveProviderForMedia("pdf", data.provider);

  const { extension } = slugifyFileName(data.fileName);
  if (
    !ALLOWED_PDF_EXTENSIONS.includes(
      extension as (typeof ALLOWED_PDF_EXTENSIONS)[number],
    ) ||
    !ALLOWED_PDF_MIMES.includes(
      data.mimeType as (typeof ALLOWED_PDF_MIMES)[number],
    )
  ) {
    throw new ValidationError(
      `Định dạng "${data.mimeType}" (.${extension}) không hợp lệ. Chỉ chấp nhận tệp PDF.`,
    );
  }

  verifyFileMagicBytes(input.fileBuffer, "pdf");

  const env = getServerEnv();
  if (data.sizeBytes > env.MAX_PDF_SIZE_MB * MB) {
    throw new ValidationError(
      `Tệp PDF vượt quá giới hạn an toàn ${env.MAX_PDF_SIZE_MB} MB của gói Supabase Free.`,
    );
  }

  // Enforce strict public/private bucket separation (PHẦN 4.2)
  const resolvedCategory =
    data.category ??
    (data.visibility === "public" ? "resources/exercises" : "internal-documents");

  if (
    data.visibility === "public" &&
    PRIVATE_PDF_CATEGORIES.has(resolvedCategory as SupabasePrivateFolder)
  ) {
    throw new ValidationError(
      `Danh mục riêng tư "${resolvedCategory}" bắt buộc phải lưu trong Private Bucket (english-manager-private).`,
    );
  }

  if (
    data.visibility === "private" &&
    PUBLIC_PDF_CATEGORIES.has(resolvedCategory as SupabasePublicFolder)
  ) {
    throw new ValidationError(
      `Danh mục "${resolvedCategory}" thuộc nhóm công khai; tài liệu riêng tư phải dùng exams, answers, internal-documents, student-documents hoặc teacher-resources.`,
    );
  }

  checkStorageQuota({
    provider: "supabase",
    incomingSizeBytes: data.sizeBytes,
  });

  const bucket =
    data.visibility === "public"
      ? env.SUPABASE_PUBLIC_BUCKET
      : env.SUPABASE_PRIVATE_BUCKET;
  const storagePath = buildObjectKey(resolvedCategory, data.fileName);
  const provider = getStorageProvider(providerName);

  const uploaded = await provider.upload({
    bucket,
    storagePath,
    contentType: data.mimeType,
    sizeBytes: data.sizeBytes,
    visibility: data.visibility,
    body: input.fileBuffer,
    allowOverwrite: false,
  });

  try {
    if (data.simulateMetadataFailure) {
      throw new Error("Simulated PostgreSQL metadata save failure");
    }

    const nowIso = new Date().toISOString();
    const record: StoredFileRecord = {
      id: `sf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originalName: data.fileName,
      storedName: storagePath.split("/").pop() ?? data.fileName,
      provider: providerName,
      fileType: "PDF",
      mimeType: data.mimeType,
      fileSize: data.sizeBytes,
      bucketName: bucket,
      storagePath: uploaded.storagePath,
      cloudinaryPublicId: null,
      // Strictly null for private PDFs — signed URLs are generated on demand only
      publicUrl: data.visibility === "public" ? uploaded.publicUrl : null,
      isPublic: data.visibility === "public",
      ownerId: data.actorId,
      category: resolvedCategory,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      referencedBy: data.referencedBy,
    };

    const store = getRuntimeStore();
    store.storedFiles.unshift(record);

    recordAuditLog({
      action: "UPLOAD_PDF",
      provider: providerName,
      actorId: data.actorId,
      targetId: record.id,
      targetPath: `${bucket}/${uploaded.storagePath}`,
      status: "SUCCESS",
      detail: `Đã tải PDF "${data.fileName}" (${formatBytesLabel(data.sizeBytes)}) vào ${bucket}/${resolvedCategory}`,
    });

    return record;
  } catch (err) {
    try {
      await provider.delete({
        bucket,
        storagePath: uploaded.storagePath,
        visibility: data.visibility,
      });
    } catch {
      getRuntimeStore().orphanFiles.unshift({
        id: `orphan-${Date.now()}`,
        provider: providerName,
        bucketName: bucket,
        storagePath: uploaded.storagePath,
        cloudinaryPublicId: null,
        reason: "Lưu metadata PDF thất bại và rollback Supabase không thành công",
        createdAt: new Date().toISOString(),
      });
    }
    throw err;
  }
}

// -----------------------------------------------------------------------------
//  URL RETRIEVAL, SIGNED URLS & ACCESS CONTROL (PHẦN 3.4, 4.4, 4.5, 6, 8)
// -----------------------------------------------------------------------------

export function getOptimizedImageUrl(
  cloudinaryPublicId: string,
  preset: CloudinaryTransformPreset = "preview",
): string {
  const safeId = validate(objectKeySchema, cloudinaryPublicId);
  if (!CLOUDINARY_TRANSFORM_PRESETS[preset]) {
    throw new ValidationError(`Preset tối ưu ảnh "${preset}" không hợp lệ`);
  }
  const env = getServerEnv();
  return buildCloudinaryUrl(env.CLOUDINARY_CLOUD_NAME, safeId, preset);
}

export function getFileUrl(
  fileIdOrRecord: string | StoredFileRecord,
  options?: { preset?: CloudinaryTransformPreset },
): string {
  const record =
    typeof fileIdOrRecord === "string"
      ? getFileMetadata(fileIdOrRecord)
      : fileIdOrRecord;

  if (!record.isPublic) {
    throw new ForbiddenError(
      "Tệp riêng tư không có Public URL. Vui lòng sử dụng getSignedFileUrl() sau khi xác thực quyền truy cập.",
    );
  }

  if (record.provider === "cloudinary" && record.cloudinaryPublicId) {
    return getOptimizedImageUrl(record.cloudinaryPublicId, options?.preset ?? "preview");
  }

  if (record.publicUrl) {
    return record.publicUrl;
  }

  const provider = getStorageProvider(record.provider);
  return provider.getPublicUrl(
    {
      bucket: record.bucketName,
      storagePath: record.storagePath ?? record.storedName,
      cloudinaryPublicId: record.cloudinaryPublicId,
      visibility: "public",
    },
    options,
  );
}

export interface SignedFileUrlRequest {
  fileId?: string;
  key?: string;
  bucketName?: string;
  actorId?: string | null;
  actorRole?: Role | null;
  downloadName?: string;
  expiresInSeconds?: number;
}

export async function getSignedFileUrl(
  input: SignedFileUrlRequest,
): Promise<{ url: string; expiresInSeconds: number }> {
  if (!input.actorId || !input.actorRole) {
    throw new UnauthorizedError("Yêu cầu đăng nhập trước khi truy cập tệp riêng tư");
  }

  const store = getRuntimeStore();
  let record: StoredFileRecord | undefined;

  if (input.fileId) {
    record = store.storedFiles.find((f) => f.id === input.fileId && !f.deletedAt);
    if (!record) throw new NotFoundError("StoredFile", input.fileId);
  } else if (input.key) {
    const safeKey = validate(objectKeySchema, input.key);
    record = store.storedFiles.find(
      (f) =>
        !f.deletedAt &&
        (f.storagePath === safeKey || f.cloudinaryPublicId === safeKey),
    );
  } else {
    throw new ValidationError("Phải cung cấp fileId hoặc key để tạo Signed URL");
  }

  const category = record?.category ?? "internal-documents";
  const storagePath = record?.storagePath ?? validate(objectKeySchema, input.key);

  // Strict authorization: students can only access public files or `student-documents`
  if (input.actorRole !== "admin") {
    const isAllowedStudentCategory =
      record?.isPublic === true ||
      category === "student-documents" ||
      storagePath.startsWith("student-documents/");
    if (!isAllowedStudentCategory) {
      throw new ForbiddenError(
        "Bạn không có quyền truy cập tài liệu nội bộ hoặc đề thi/đáp án riêng tư của giáo viên",
      );
    }
  }

  const env = getServerEnv();
  const expiresInSeconds = Math.min(
    Math.max(input.expiresInSeconds ?? env.PRIVATE_FILE_URL_TTL_SECONDS, 60),
    3600,
  );

  const providerName = record?.provider ?? "supabase";
  const provider = getStorageProvider(providerName);
  const url = await provider.createSignedUrl(
    {
      bucket: record?.bucketName ?? input.bucketName ?? env.SUPABASE_PRIVATE_BUCKET,
      storagePath,
      cloudinaryPublicId: record?.cloudinaryPublicId,
      visibility: "private",
    },
    {
      expiresInSeconds,
      downloadName: input.downloadName ?? record?.originalName,
    },
  );

  // Audit log NEVER records the signed URL or token (PHẦN 8.13)
  recordAuditLog({
    action: "CREATE_SIGNED_URL",
    provider: providerName,
    actorId: input.actorId,
    targetId: record?.id ?? storagePath,
    targetPath: storagePath,
    status: "SUCCESS",
    detail: `Đã cấp Signed URL tạm thời (${expiresInSeconds}s) cho ${input.actorRole}:${input.actorId}`,
  });

  return { url, expiresInSeconds };
}

// -----------------------------------------------------------------------------
//  METADATA LOOKUP, DELETE & REPLACE (PHẦN 3.5, 4.6, 5, 11)
// -----------------------------------------------------------------------------

export function getFileMetadata(id: unknown): StoredFileRecord {
  const validId = validate(idSchema, id);
  const found = getRuntimeStore().storedFiles.find(
    (f) => f.id === validId && !f.deletedAt,
  );
  if (!found) throw new NotFoundError("StoredFile", validId);
  return found;
}

export function findImageByPublicId(publicId: unknown): StoredFileRecord | null {
  const safeId = validate(objectKeySchema, publicId);
  return (
    getRuntimeStore().storedFiles.find(
      (f) =>
        !f.deletedAt &&
        f.provider === "cloudinary" &&
        (f.cloudinaryPublicId === safeId || f.storagePath === safeId),
    ) ?? null
  );
}

export async function checkImageExists(publicId: unknown): Promise<boolean> {
  const found = findImageByPublicId(publicId);
  if (found) return true;
  const safeId = validate(objectKeySchema, publicId);
  return getStorageProvider("cloudinary").exists({
    storagePath: safeId,
    cloudinaryPublicId: safeId,
    visibility: "public",
  });
}

export interface DeleteFileInput {
  id: string;
  actorId?: string;
  actorRole?: Role;
  forceReplace?: boolean;
}

export async function deleteFile(input: DeleteFileInput): Promise<StoredFileRecord> {
  if ((input.actorRole ?? "admin") !== "admin") {
    throw new ForbiddenError("Chỉ quản trị viên mới có quyền xóa tệp khỏi hệ thống");
  }

  const record = getFileMetadata(input.id);

  if (record.referencedBy.length > 0 && !input.forceReplace) {
    throw new ConflictError(
      `Không thể xóa tệp "${record.originalName}" vì đang được tham chiếu bởi: ${record.referencedBy.join(", ")}. Hãy gỡ liên kết hoặc dùng chức năng thay thế tệp.`,
    );
  }

  const provider = getStorageProvider(record.provider);

  // Delete from cloud provider FIRST. If this fails, do NOT mark metadata deleted (PHẦN 11)
  await provider.delete({
    bucket: record.bucketName,
    storagePath: record.storagePath ?? record.storedName,
    cloudinaryPublicId: record.cloudinaryPublicId,
    visibility: record.isPublic ? "public" : "private",
  });

  const nowIso = new Date().toISOString();
  record.deletedAt = nowIso;
  record.updatedAt = nowIso;
  record.publicUrl = null;

  // Also remove any linked ResourceFileItem in runtime store so UI never shows stale URLs
  const store = getRuntimeStore();
  const resIdx = store.files.findIndex(
    (f) =>
      f.id === record.id ||
      (record.storagePath && f.objectKey === record.storagePath) ||
      (record.cloudinaryPublicId && f.cloudinaryPublicId === record.cloudinaryPublicId),
  );
  if (resIdx !== -1) {
    const [removed] = store.files.splice(resIdx, 1);
    const folder = store.folders.find((fld) => fld.id === removed.folderId);
    if (folder && folder.itemCount > 0) {
      folder.itemCount -= 1;
    }
  }

  recordAuditLog({
    action: "DELETE_FILE",
    provider: record.provider,
    actorId: input.actorId ?? "admin",
    targetId: record.id,
    targetPath: record.storagePath ?? record.storedName,
    status: "SUCCESS",
    detail: `Đã xóa tệp "${record.originalName}" khỏi ${record.provider}`,
  });

  return record;
}

export async function replaceFile(input: {
  targetFileId: string;
  replacement: UploadImageInput | UploadPodcastInput | UploadPdfInput;
}): Promise<StoredFileRecord> {
  const existing = getFileMetadata(input.targetFileId);

  let created: StoredFileRecord;
  if (existing.fileType === "IMAGE") {
    created = await uploadImage({
      ...(input.replacement as UploadImageInput),
      referencedBy: existing.referencedBy,
    });
  } else if (existing.fileType === "AUDIO") {
    created = await uploadPodcast({
      ...(input.replacement as UploadPodcastInput),
      referencedBy: existing.referencedBy,
    });
  } else {
    created = await uploadPdf({
      ...(input.replacement as UploadPdfInput),
      referencedBy: existing.referencedBy,
    });
  }

  await deleteFile({
    id: existing.id,
    actorId: created.ownerId ?? "admin",
    actorRole: "admin",
    forceReplace: true,
  });

  recordAuditLog({
    action: "REPLACE_FILE",
    provider: created.provider,
    actorId: created.ownerId ?? "admin",
    targetId: created.id,
    targetPath: created.storagePath ?? created.storedName,
    status: "SUCCESS",
    detail: `Đã thay thế tệp "${existing.originalName}" bằng "${created.originalName}"`,
  });

  return created;
}

export function listStoredFiles(options?: {
  provider?: StorageProviderName | "all";
  fileType?: StoredFileRecord["fileType"] | "all";
  category?: string;
  search?: string;
  includeDeleted?: boolean;
}): StoredFileRecord[] {
  const store = getRuntimeStore();
  return store.storedFiles.filter((f) => {
    if (!options?.includeDeleted && f.deletedAt) return false;
    if (options?.provider && options.provider !== "all" && f.provider !== options.provider) {
      return false;
    }
    if (options?.fileType && options.fileType !== "all" && f.fileType !== options.fileType) {
      return false;
    }
    if (options?.category && options.category !== "all" && f.category !== options.category) {
      return false;
    }
    const q = options?.search?.trim().toLowerCase() ?? "";
    if (
      q &&
      !f.originalName.toLowerCase().includes(q) &&
      !f.category.toLowerCase().includes(q) &&
      !(f.storagePath ?? "").toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export function listStorageAuditLogs(): StorageAuditLogEntry[] {
  return getRuntimeStore().storageAuditLogs;
}

export function listOrphanedFiles(): OrphanedStorageObject[] {
  return getRuntimeStore().orphanFiles;
}

// -----------------------------------------------------------------------------
//  SIGNED BROWSER UPLOAD TICKET & LEGACY COMPATIBILITY (ROUTES & UI)
// -----------------------------------------------------------------------------

export const createUploadUrlSchema = z.object({
  folder: z.string().trim().min(1).max(120).default("documents"),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  visibility: z.enum(["public", "private"]).default("public"),
  imageCategory: z
    .enum([
      "student_avatar",
      "teacher_avatar",
      "project",
      "podcast_thumbnail",
      "announcement",
      "article",
      "resource",
    ])
    .optional(),
});

export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;

export interface UploadTicket extends ProviderUploadTicket {
  key: string;
}

export async function createUploadUrl(input: unknown): Promise<UploadTicket> {
  const data = validate(createUploadUrlSchema, input);
  const { extension } = slugifyFileName(data.fileName);
  const env = getServerEnv();

  const isImage = ALLOWED_IMAGE_MIMES.includes(
    data.contentType as (typeof ALLOWED_IMAGE_MIMES)[number],
  );
  const isAudio = ALLOWED_AUDIO_MIMES.includes(
    data.contentType as (typeof ALLOWED_AUDIO_MIMES)[number],
  );
  const isPdf = ALLOWED_PDF_MIMES.includes(
    data.contentType as (typeof ALLOWED_PDF_MIMES)[number],
  );

  if (isImage) {
    if (
      !ALLOWED_IMAGE_EXTENSIONS.includes(
        extension as (typeof ALLOWED_IMAGE_EXTENSIONS)[number],
      )
    ) {
      throw new ValidationError("Phần mở rộng tệp ảnh không khớp với MIME type");
    }
    if (data.size > env.MAX_IMAGE_SIZE_MB * MB) {
      throw new ValidationError(
        `Ảnh vượt quá giới hạn ${env.MAX_IMAGE_SIZE_MB} MB của Cloudinary Free`,
      );
    }
    checkStorageQuota({ provider: "cloudinary", incomingSizeBytes: data.size });
    const category: ImageCategory =
      data.imageCategory ??
      (data.folder === "thumbnails"
        ? "podcast_thumbnail"
        : data.folder === "showcase" || data.folder === "projects"
          ? "project"
          : "resource");
    const cloudinaryFolder = CLOUDINARY_FOLDER_MAP[category];
    const publicId = buildObjectKey(cloudinaryFolder, data.fileName, new Date(), false);
    const ticket = await getStorageProvider("cloudinary").createSignedUploadTicket({
      storagePath: publicId,
      cloudinaryFolder,
      cloudinaryPublicId: publicId,
      contentType: data.contentType,
      sizeBytes: data.size,
      visibility: "public",
    });
    return { ...ticket, key: ticket.storagePath };
  }

  if (isAudio) {
    if (
      !ALLOWED_AUDIO_EXTENSIONS.includes(
        extension as (typeof ALLOWED_AUDIO_EXTENSIONS)[number],
      )
    ) {
      throw new ValidationError("Phần mở rộng âm thanh phải là .mp3 hoặc .m4a");
    }
    if (data.size > env.MAX_AUDIO_SIZE_MB * MB) {
      throw new ValidationError(
        `Podcast vượt quá giới hạn ${env.MAX_AUDIO_SIZE_MB} MB của Supabase Free`,
      );
    }
    checkStorageQuota({ provider: "supabase", incomingSizeBytes: data.size });
    const bucket =
      data.visibility === "public"
        ? env.SUPABASE_PUBLIC_BUCKET
        : env.SUPABASE_PRIVATE_BUCKET;
    const prefix = data.visibility === "public" ? "podcasts" : "teacher-resources";
    const storagePath = buildObjectKey(prefix, data.fileName);
    const ticket = await getStorageProvider("supabase").createSignedUploadTicket({
      bucket,
      storagePath,
      contentType: data.contentType,
      sizeBytes: data.size,
      visibility: data.visibility,
    });
    return { ...ticket, key: ticket.storagePath };
  }

  if (isPdf) {
    if (extension !== "pdf") {
      throw new ValidationError("Tệp PDF phải có phần mở rộng .pdf");
    }
    if (data.size > env.MAX_PDF_SIZE_MB * MB) {
      throw new ValidationError(
        `PDF vượt quá giới hạn ${env.MAX_PDF_SIZE_MB} MB của Supabase Free`,
      );
    }
    checkStorageQuota({ provider: "supabase", incomingSizeBytes: data.size });
    const bucket =
      data.visibility === "public"
        ? env.SUPABASE_PUBLIC_BUCKET
        : env.SUPABASE_PRIVATE_BUCKET;
    const prefix =
      data.visibility === "public" ? "resources/exercises" : "internal-documents";
    const storagePath = buildObjectKey(prefix, data.fileName);
    const ticket = await getStorageProvider("supabase").createSignedUploadTicket({
      bucket,
      storagePath,
      contentType: data.contentType,
      sizeBytes: data.size,
      visibility: data.visibility,
    });
    return { ...ticket, key: ticket.storagePath };
  }

  throw new ValidationError(
    `Định dạng tệp "${data.contentType}" không được hỗ trợ. Chỉ hỗ trợ Ảnh (JPEG/PNG/WebP -> Cloudinary), Podcast (MP3/M4A -> Supabase) và Tài liệu (PDF -> Supabase).`,
  );
}

export function getPublicUrl(key: string): string {
  const safeKey = validate(objectKeySchema, key);
  if (safeKey.startsWith("english-manager/")) {
    return getOptimizedImageUrl(safeKey, "preview");
  }
  return getStorageProvider("supabase").getPublicUrl({
    storagePath: safeKey,
    visibility: "public",
  });
}

export async function createDownloadUrl(
  key: unknown,
  options: { downloadName?: string; expiresInSeconds?: number; actorId?: string; actorRole?: Role } = {},
): Promise<string> {
  const safeKey = validate(objectKeySchema, key);
  const { url } = await getSignedFileUrl({
    key: safeKey,
    actorId: options.actorId ?? "admin",
    actorRole: options.actorRole ?? "admin",
    downloadName: options.downloadName,
    expiresInSeconds: options.expiresInSeconds,
  });
  return url;
}

export interface StorageHealthStatus {
  configured: boolean;
  provider: "cloudinary+supabase" | "cloudinary" | "supabase" | "unconfigured";
  cloudinaryConfigured: boolean;
  supabaseConfigured: boolean;
  cloudinaryCloudName: string;
  publicBucket: string;
  privateBucket: string;
  publicBaseUrl: string;
  routing: {
    images: StorageProviderName;
    audio: StorageProviderName;
    documents: StorageProviderName;
  };
}

export function getStorageStatus(): StorageHealthStatus {
  const env = getServerEnv();
  const cloudinaryConfigured = getStorageProvider("cloudinary").isConfigured();
  const supabaseConfigured = getStorageProvider("supabase").isConfigured();

  const provider: StorageHealthStatus["provider"] =
    cloudinaryConfigured && supabaseConfigured
      ? "cloudinary+supabase"
      : cloudinaryConfigured
        ? "cloudinary"
        : supabaseConfigured
          ? "supabase"
          : "unconfigured";

  return {
    configured: cloudinaryConfigured && supabaseConfigured,
    provider,
    cloudinaryConfigured,
    supabaseConfigured,
    cloudinaryCloudName: env.CLOUDINARY_CLOUD_NAME || "Chưa cấu hình",
    publicBucket: env.SUPABASE_PUBLIC_BUCKET,
    privateBucket: env.SUPABASE_PRIVATE_BUCKET,
    publicBaseUrl: env.SUPABASE_URL
      ? `${env.SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/${env.SUPABASE_PUBLIC_BUCKET}`
      : env.STORAGE_PUBLIC_URL.replace(/\/+$/, ""),
    routing: {
      images: env.STORAGE_PROVIDER_IMAGES,
      audio: env.STORAGE_PROVIDER_AUDIO,
      documents: env.STORAGE_PROVIDER_DOCUMENTS,
    },
  };
}

// -----------------------------------------------------------------------------
//  DOMAIN REPOSITORY OPERATIONS (Folders & Resource Files)
// -----------------------------------------------------------------------------

export const createResourceFileSchema = z.object({
  title: z.string().trim().min(1).max(200),
  folderId: z.string().trim().min(1).default("fld-writing"),
  fileType: z.enum(["PDF", "SLIDE", "AUDIO", "WORKSHEET", "IMAGE"]).default("PDF"),
  visibility: z.enum(["public", "private"]).default("public"),
  description: z.string().trim().max(1000).optional(),
  size: z.string().trim().max(32).default("2.4 MB"),
  sizeBytes: z.coerce.number().int().nonnegative().default(2516582),
  pagesOrDuration: z.string().trim().max(64).default("18 trang"),
  level: z.string().trim().max(64).default("IELTS 6.5+"),
  objectKey: z.string().trim().max(512).nullish(),
  publicUrl: z.string().trim().max(1024).nullish(),
  provider: z.enum(["cloudinary", "supabase", "r2", "s3", "local"]).optional(),
  mimeType: z.string().trim().max(128).optional(),
  bucketName: z.string().trim().max(128).nullish(),
  cloudinaryPublicId: z.string().trim().max(512).nullish(),
  category: z.string().trim().max(120).optional(),
  originalName: z.string().trim().max(255).optional(),
});

export async function listResourceFolders(options?: {
  publicOnly?: boolean;
}): Promise<ResourceFolder[]> {
  const store = getRuntimeStore();
  if (options?.publicOnly) {
    return store.folders.filter((f) => f.visibility === "public");
  }
  return store.folders;
}

export async function listResourceFiles(options?: {
  publicOnly?: boolean;
  folderId?: string;
  fileType?: string;
  search?: string;
}): Promise<ResourceFileItem[]> {
  const store = getRuntimeStore();
  return store.files.filter((f) => {
    if (f.deletedAt) return false;
    // Never leak private documents on public API (PHẦN 8.14)
    if (options?.publicOnly && f.visibility !== "public") return false;
    if (
      options?.folderId &&
      options.folderId !== "all" &&
      f.folderId !== options.folderId
    ) {
      return false;
    }
    if (
      options?.fileType &&
      options.fileType !== "all" &&
      f.fileType !== options.fileType
    ) {
      return false;
    }
    const q = options?.search?.trim().toLowerCase() ?? "";
    if (
      q &&
      !f.title.toLowerCase().includes(q) &&
      !f.description.toLowerCase().includes(q) &&
      !f.folderName.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export async function createResourceFile(
  input: unknown,
): Promise<ResourceFileItem> {
  const data = validate(createResourceFileSchema, input);
  const env = getServerEnv();
  const store = getRuntimeStore();
  const folder =
    store.folders.find((f) => f.id === data.folderId) ?? store.folders[0];

  const isImage = data.fileType === "IMAGE";
  const resolvedProvider: StorageProviderName =
    data.provider ?? (isImage ? "cloudinary" : "supabase");
  const resolvedBucket =
    resolvedProvider === "cloudinary"
      ? null
      : data.bucketName ??
        (data.visibility === "public"
          ? env.SUPABASE_PUBLIC_BUCKET
          : env.SUPABASE_PRIVATE_BUCKET);
  const resolvedMime =
    data.mimeType ??
    (data.fileType === "IMAGE"
      ? "image/webp"
      : data.fileType === "AUDIO"
        ? "audio/mpeg"
        : "application/pdf");

  const storagePath =
    data.objectKey ??
    (isImage
      ? `english-manager/resources/2026/11/${Date.now()}`
      : `${data.visibility === "public" ? "resources/exercises" : "internal-documents"}/2026/11/${Date.now()}.pdf`);

  const newFile: ResourceFileItem = {
    id: `res-${Date.now()}`,
    folderId: folder?.id ?? data.folderId,
    folderName: folder?.name ?? "01. Academic Writing & Essays",
    title: data.title,
    description:
      data.description ??
      (isImage
        ? "Hình ảnh học thuật đã được tối ưu tự động (f_auto, q_auto) trên Cloudinary Free."
        : "Tài liệu học thuật lưu trữ trên Supabase Storage Free."),
    fileType: data.fileType,
    size: data.size,
    sizeBytes: data.sizeBytes,
    updatedAt: new Date().toLocaleDateString("vi-VN"),
    downloads: 0,
    pagesOrDuration: data.pagesOrDuration,
    level: data.level,
    visibility: isImage ? "public" : data.visibility,
    objectKey: storagePath,
    storagePath,
    bucketName: resolvedBucket,
    cloudinaryPublicId: isImage ? (data.cloudinaryPublicId ?? storagePath) : null,
    provider: resolvedProvider,
    mimeType: resolvedMime,
    category: data.category ?? (isImage ? "resource" : "resources/exercises"),
    originalName: data.originalName ?? data.title,
    // Never save publicUrl for private files
    publicUrl:
      data.visibility === "private" && !isImage ? null : (data.publicUrl ?? null),
    previewSummary: [
      `Provider: ${resolvedProvider.toUpperCase()} · Đường dẫn: ${storagePath}`,
      data.visibility === "private"
        ? "Tệp riêng tư (Private Bucket) — truy cập qua Signed URL có thời hạn 15 phút."
        : "Tệp công khai — sẵn sàng phân phối cho học sinh.",
    ],
  };

  store.files.unshift(newFile);
  if (folder) {
    folder.itemCount += 1;
  }

  // Synchronize into StoredFileRecord table so quota & file inventory stay 100% consistent
  const nowIso = new Date().toISOString();
  store.storedFiles.unshift({
    id: newFile.id,
    originalName: newFile.originalName ?? newFile.title,
    storedName: storagePath.split("/").pop() ?? newFile.title,
    provider: resolvedProvider,
    fileType: newFile.fileType,
    mimeType: resolvedMime,
    fileSize: newFile.sizeBytes,
    bucketName: resolvedBucket,
    storagePath,
    cloudinaryPublicId: newFile.cloudinaryPublicId ?? null,
    publicUrl: newFile.publicUrl ?? null,
    isPublic: newFile.visibility === "public",
    ownerId: "admin",
    category: newFile.category ?? "general",
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    referencedBy: [],
  });

  return newFile;
}

export async function toggleResourceFileVisibility(
  id: unknown,
): Promise<ResourceFileItem> {
  const validId = validate(idSchema, id);
  const env = getServerEnv();
  const store = getRuntimeStore();
  const idx = store.files.findIndex((f) => f.id === validId);
  if (idx === -1) throw new NotFoundError("ResourceFile", validId);

  const current = store.files[idx];
  const nextVisibility: FileVisibility =
    current.visibility === "public" ? "private" : "public";
  const updated: ResourceFileItem = {
    ...current,
    visibility: nextVisibility,
    bucketName:
      current.provider === "cloudinary"
        ? null
        : nextVisibility === "public"
          ? env.SUPABASE_PUBLIC_BUCKET
          : env.SUPABASE_PRIVATE_BUCKET,
    publicUrl: nextVisibility === "private" ? null : current.publicUrl,
  };
  store.files[idx] = updated;

  const sf = store.storedFiles.find((s) => s.id === validId);
  if (sf) {
    sf.isPublic = nextVisibility === "public";
    sf.bucketName = updated.bucketName ?? null;
    if (!sf.isPublic) sf.publicUrl = null;
    sf.updatedAt = new Date().toISOString();
  }

  return updated;
}

export async function deleteResourceFile(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);
  const store = getRuntimeStore();

  const stored = store.storedFiles.find((s) => s.id === validId && !s.deletedAt);
  if (stored) {
    await deleteFile({ id: stored.id, actorId: "admin", actorRole: "admin" });
    return;
  }

  const idx = store.files.findIndex((f) => f.id === validId);
  if (idx === -1) throw new NotFoundError("ResourceFile", validId);

  const [removed] = store.files.splice(idx, 1);
  const folder = store.folders.find((f) => f.id === removed.folderId);
  if (folder && folder.itemCount > 0) {
    folder.itemCount -= 1;
  }
}
