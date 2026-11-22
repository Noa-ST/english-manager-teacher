import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
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

import { idSchema, optionalSafeUrlSchema, validate } from "./common";
import { matchesNormalizedDocumentText } from "./documents-helpers";
import type {
  CurriculumAttachment,
  OrphanedStorageObject,
  ResourceFileItem,
  ResourceFolder,
  StorageAuditLogEntry,
  StoredFileRecord,
} from "./domain-types";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import {
  mapPrismaOrphanedStorageFile,
  mapPrismaResourceFile,
  mapPrismaResourceFolder,
  mapPrismaStorageAuditLog,
  mapPrismaStoredFile,
} from "./prisma-mappers";

/**
 * Unified Multi-Provider Storage Service
 * - Cloudinary Free: Images (teacher avatar, projects, podcast thumbnails, announcements, articles, resources)
 * - Supabase Free Storage: Podcasts (MP3/M4A) & PDFs (public & private buckets)
 * - PostgreSQL (Prisma): Metadata, access control, reference tracking, quota & audit logs
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
  if (uploadRateBuckets.size >= 5000 && !uploadRateBuckets.has(key)) {
    for (const [bKey, bList] of uploadRateBuckets) {
      const fresh = bList.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
      if (fresh.length === 0) uploadRateBuckets.delete(bKey);
      else uploadRateBuckets.set(bKey, fresh);
    }
    if (uploadRateBuckets.size >= 5000) {
      const oldest = uploadRateBuckets.keys().next().value;
      if (oldest !== undefined) uploadRateBuckets.delete(oldest);
    }
  }
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
  if (bytes === undefined) return;
  if (bytes.length < 4) {
    throw new ValidationError(
      "Nội dung tệp tải lên quá nhỏ hoặc rỗng, không thể xác thực chữ ký tệp (magic bytes).",
    );
  }

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

async function recordAuditLog(
  entry: Omit<StorageAuditLogEntry, "id" | "createdAt">,
): Promise<void> {
  // Never allow signed tokens or secrets into audit log details
  const redactedDetail = entry.detail
    .replace(/token=[^&\s]+/gi, "token=[REDACTED]")
    .replace(/signature=[^&\s]+/gi, "signature=[REDACTED]");

  await prisma.storageAuditLog.create({
    data: {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action: entry.action,
      provider: entry.provider,
      actorId: entry.actorId,
      targetId: entry.targetId,
      targetPath: entry.targetPath,
      status: entry.status,
      detail: redactedDetail,
    },
  });

  const overflow = await prisma.storageAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: 500,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await prisma.storageAuditLog.deleteMany({
      where: { id: { in: overflow.map((r) => r.id) } },
    });
  }
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

export async function checkStorageQuota(options?: {
  provider?: "cloudinary" | "supabase";
  incomingSizeBytes?: number;
}): Promise<StorageQuotaReport> {
  const env = getServerEnv();
  const activeFiles = await prisma.storedFile.findMany({
    where: { deletedAt: null },
    select: { provider: true, fileSize: true, fileType: true },
  });

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
  existingPublicId: objectKeySchema.optional(),
  existingPublicUrl: optionalSafeUrlSchema.transform((v) => v ?? undefined),
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

  await checkStorageQuota({
    provider: "cloudinary",
    incomingSizeBytes: data.sizeBytes,
  });

  const cloudinaryFolder = CLOUDINARY_FOLDER_MAP[data.category as ImageCategory];
  const publicId =
    data.existingPublicId ??
    buildObjectKey(cloudinaryFolder, data.fileName, new Date(), false);
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
    const isTestEnv = process.env.NODE_ENV === "test" || process.env.APP_IS_TEST === "true";
    if (data.simulateMetadataFailure && isTestEnv) {
      throw new Error("Simulated PostgreSQL metadata save failure");
    }

    const sfId = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const resolvedPath = uploaded.storagePath;
    const resolvedCloudinaryId =
      data.existingPublicId ?? uploaded.cloudinaryPublicId ?? publicId;
    const resolvedPublicUrl = data.existingPublicUrl ?? uploaded.publicUrl;

    const created = await prisma.storedFile.create({
      data: {
        id: sfId,
        originalName: data.fileName,
        storedName: resolvedPath.split("/").pop() ?? data.fileName,
        provider: providerName,
        fileType: "IMAGE",
        mimeType: data.mimeType,
        fileSize: data.sizeBytes,
        bucketName: null,
        storagePath: resolvedPath,
        cloudinaryPublicId: resolvedCloudinaryId,
        publicUrl: resolvedPublicUrl,
        isPublic: true,
        ownerId: data.actorId,
        category: data.category,
        referencedBy: data.referencedBy,
      },
    });

    await recordAuditLog({
      action: "UPLOAD_IMAGE",
      provider: providerName,
      actorId: data.actorId,
      targetId: created.id,
      targetPath: created.storagePath ?? publicId,
      status: "SUCCESS",
      detail: `Đã tải ảnh "${data.fileName}" (${formatBytesLabel(data.sizeBytes)}) vào ${cloudinaryFolder}`,
    });

    return mapPrismaStoredFile(created);
  } catch (err) {
    // Rollback uploaded file on Cloudinary if metadata save fails (PHẦN 11)
    try {
      await provider.delete({
        storagePath: uploaded.storagePath,
        cloudinaryPublicId: uploaded.cloudinaryPublicId ?? publicId,
        visibility: "public",
      });
      try {
        await recordAuditLog({
          action: "ROLLBACK_ORPHAN",
          provider: providerName,
          actorId: data.actorId,
          targetId: publicId,
          targetPath: uploaded.storagePath,
          status: "ROLLED_BACK",
          detail: "Đã rollback xóa ảnh trên Cloudinary do lưu metadata thất bại",
        });
      } catch {
        // best-effort audit logging during rollback
      }
    } catch {
      try {
        await prisma.orphanedStorageFile.create({
          data: {
            id: `orphan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            provider: providerName,
            bucketName: null,
            storagePath: uploaded.storagePath,
            cloudinaryPublicId: uploaded.cloudinaryPublicId ?? publicId,
            reason: "Lưu metadata thất bại và rollback Cloudinary không thành công",
          },
        });
      } catch {
        // best-effort orphan recording
      }
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
  existingStoragePath: objectKeySchema.optional(),
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

  await checkStorageQuota({
    provider: "supabase",
    incomingSizeBytes: data.sizeBytes,
  });

  const bucket =
    data.visibility === "public"
      ? env.SUPABASE_PUBLIC_BUCKET
      : env.SUPABASE_PRIVATE_BUCKET;
  const folderPrefix = data.visibility === "public" ? "podcasts" : "teacher-resources";
  const storagePath =
    data.existingStoragePath ?? buildObjectKey(folderPrefix, data.fileName);
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
    const isTestEnv = process.env.NODE_ENV === "test" || process.env.APP_IS_TEST === "true";
    if (data.simulateMetadataFailure && isTestEnv) {
      throw new Error("Simulated PostgreSQL metadata save failure");
    }

    const sfId = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const created = await prisma.storedFile.create({
      data: {
        id: sfId,
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
        referencedBy: data.referencedBy,
      },
    });

    await recordAuditLog({
      action: "UPLOAD_PODCAST",
      provider: providerName,
      actorId: data.actorId,
      targetId: created.id,
      targetPath: `${bucket}/${uploaded.storagePath}`,
      status: "SUCCESS",
      detail: `Đã tải podcast "${data.fileName}" (${formatBytesLabel(data.sizeBytes)}) vào bucket ${bucket}`,
    });

    return mapPrismaStoredFile(created);
  } catch (err) {
    try {
      await provider.delete({
        bucket,
        storagePath: uploaded.storagePath,
        visibility: data.visibility,
      });
      try {
        await recordAuditLog({
          action: "ROLLBACK_ORPHAN",
          provider: providerName,
          actorId: data.actorId,
          targetId: uploaded.storagePath,
          targetPath: `${bucket}/${uploaded.storagePath}`,
          status: "ROLLED_BACK",
          detail: "Đã rollback xóa podcast trên Supabase do lưu metadata thất bại",
        });
      } catch {
        // best-effort audit logging during rollback
      }
    } catch {
      try {
        await prisma.orphanedStorageFile.create({
          data: {
            id: `orphan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            provider: providerName,
            bucketName: bucket,
            storagePath: uploaded.storagePath,
            cloudinaryPublicId: null,
            reason: "Lưu metadata podcast thất bại và rollback Supabase không thành công",
          },
        });
      } catch {
        // best-effort orphan recording
      }
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
  existingStoragePath: objectKeySchema.optional(),
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

  await checkStorageQuota({
    provider: "supabase",
    incomingSizeBytes: data.sizeBytes,
  });

  const bucket =
    data.visibility === "public"
      ? env.SUPABASE_PUBLIC_BUCKET
      : env.SUPABASE_PRIVATE_BUCKET;
  const storagePath =
    data.existingStoragePath ?? buildObjectKey(resolvedCategory, data.fileName);
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
    const isTestEnv = process.env.NODE_ENV === "test" || process.env.APP_IS_TEST === "true";
    if (data.simulateMetadataFailure && isTestEnv) {
      throw new Error("Simulated PostgreSQL metadata save failure");
    }

    const sfId = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const created = await prisma.storedFile.create({
      data: {
        id: sfId,
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
        referencedBy: data.referencedBy,
      },
    });

    await recordAuditLog({
      action: "UPLOAD_PDF",
      provider: providerName,
      actorId: data.actorId,
      targetId: created.id,
      targetPath: `${bucket}/${uploaded.storagePath}`,
      status: "SUCCESS",
      detail: `Đã tải PDF "${data.fileName}" (${formatBytesLabel(data.sizeBytes)}) vào ${bucket}/${resolvedCategory}`,
    });

    return mapPrismaStoredFile(created);
  } catch (err) {
    try {
      await provider.delete({
        bucket,
        storagePath: uploaded.storagePath,
        visibility: data.visibility,
      });
      try {
        await recordAuditLog({
          action: "ROLLBACK_ORPHAN",
          provider: providerName,
          actorId: data.actorId,
          targetId: uploaded.storagePath,
          targetPath: `${bucket}/${uploaded.storagePath}`,
          status: "ROLLED_BACK",
          detail: "Đã rollback xóa PDF trên Supabase do lưu metadata thất bại",
        });
      } catch {
        // best-effort audit logging during rollback
      }
    } catch {
      try {
        await prisma.orphanedStorageFile.create({
          data: {
            id: `orphan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            provider: providerName,
            bucketName: bucket,
            storagePath: uploaded.storagePath,
            cloudinaryPublicId: null,
            reason: "Lưu metadata PDF thất bại và rollback Supabase không thành công",
          },
        });
      } catch {
        // best-effort orphan recording
      }
    }
    throw err;
  }
}

// -----------------------------------------------------------------------------
//  CURRICULUM ATTACHMENT UPLOAD (MAGIC-BYTE VERIFIED & UUID STORED)
// -----------------------------------------------------------------------------

function detectCurriculumAttachmentType(
  fileName: string,
  mimeType: string,
): CurriculumAttachment["type"] {
  const { extension } = slugifyFileName(fileName);
  const mime = mimeType.toLowerCase();
  if (extension === "pdf" || mime.includes("pdf")) return "PDF";
  if (
    ["doc", "docx"].includes(extension) ||
    mime.includes("word") ||
    mime.includes("wordprocessingml")
  ) {
    return "DOCX";
  }
  if (
    ["ppt", "pptx"].includes(extension) ||
    mime.includes("presentation") ||
    mime.includes("powerpoint")
  ) {
    return "SLIDE";
  }
  if (
    ["xls", "xlsx"].includes(extension) ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    return "WORKSHEET";
  }
  if (
    ["jpg", "jpeg", "png", "webp"].includes(extension) ||
    mime.startsWith("image/")
  ) {
    return "IMAGE";
  }
  if (
    ["mp3", "m4a"].includes(extension) ||
    mime.startsWith("audio/")
  ) {
    return "AUDIO";
  }
  throw new ValidationError(
    `Định dạng tệp "${fileName}" (.${extension}) không được hỗ trợ cho tài liệu lớp học.`,
  );
}

function verifyCurriculumFileMagicBytes(
  bytes: Uint8Array | Buffer | undefined,
  fileType: CurriculumAttachment["type"],
): void {
  if (!bytes) return;
  if (bytes.length < 4) {
    throw new ValidationError(
      "Tệp tải lên quá nhỏ hoặc rỗng, không thể xác thực chữ ký tệp (magic bytes).",
    );
  }
  // Always reject PE/MZ and ELF executables regardless of claimed extension
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

  if (fileType === "PDF") {
    verifyFileMagicBytes(bytes, "pdf");
    return;
  }
  if (fileType === "IMAGE") {
    verifyFileMagicBytes(bytes, "image");
    return;
  }
  if (fileType === "AUDIO") {
    verifyFileMagicBytes(bytes, "audio");
    return;
  }

  // DOCX / SLIDE (pptx) / WORKSHEET (xlsx): OOXML ZIP (PK\x03\x04) or legacy OLE2 (D0 CF 11 E0)
  const isOoxmlZip =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  const isOle2 =
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;
  if (!isOoxmlZip && !isOle2) {
    throw new ValidationError(
      `Nội dung nhị phân thực tế không khớp định dạng tài liệu Office (${fileType}).`,
    );
  }
}

export const uploadCurriculumAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(128).default("application/octet-stream"),
  sizeBytes: z.number().int().positive(),
  classId: idSchema,
  classCode: z.string().trim().max(32).optional(),
  weekNumber: z.coerce.number().int().min(1).max(100),
  visibility: z.enum(["public", "private"]).default("private"),
  actorId: z.string().trim().min(1).default("admin"),
  actorRole: z.enum(["admin", "student"]).default("admin"),
  provider: z.enum(["cloudinary", "supabase", "r2", "s3", "local"]).optional(),
});

export type UploadCurriculumAttachmentInput = z.input<
  typeof uploadCurriculumAttachmentSchema
> & {
  fileBuffer?: Uint8Array | Buffer;
};

export async function uploadCurriculumAttachment(
  input: UploadCurriculumAttachmentInput,
): Promise<{ storedFile: StoredFileRecord; attachment: CurriculumAttachment }> {
  const data = validate(uploadCurriculumAttachmentSchema, input);
  if (data.actorRole !== "admin") {
    throw new ForbiddenError("Chỉ giáo viên/admin mới có quyền tải tài liệu lớp học.");
  }

  checkUploadRateLimit(data.actorId);
  const fileType = detectCurriculumAttachmentType(data.fileName, data.mimeType);
  verifyCurriculumFileMagicBytes(input.fileBuffer, fileType);

  const env = getServerEnv();
  if (data.sizeBytes > env.MAX_PDF_SIZE_MB * MB) {
    throw new ValidationError(
      `Tệp vượt quá giới hạn dung lượng cho phép (${env.MAX_PDF_SIZE_MB} MB).`,
    );
  }

  const providerName = resolveProviderForMedia("pdf", data.provider);
  await checkStorageQuota({
    provider: providerName === "cloudinary" ? "cloudinary" : "supabase",
    incomingSizeBytes: data.sizeBytes,
  });

  const bucket =
    data.visibility === "public"
      ? env.SUPABASE_PUBLIC_BUCKET
      : env.SUPABASE_PRIVATE_BUCKET;
  const folderPrefix =
    data.visibility === "public" ? "resources/exercises" : "student-documents";
  const storagePath = buildObjectKey(folderPrefix, data.fileName);
  const provider = getStorageProvider(providerName);

  const uploaded = await provider.upload({
    bucket,
    storagePath,
    contentType: data.mimeType || "application/octet-stream",
    sizeBytes: data.sizeBytes,
    visibility: data.visibility,
    body: input.fileBuffer,
    allowOverwrite: false,
  });

  const d = new Date();
  const dateDisplay = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const storedId = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const storedName = storagePath.split("/").pop() ?? data.fileName;
  const normalizedMime = data.mimeType || "application/octet-stream";
  const mappedStoredType: StoredFileRecord["fileType"] =
    fileType === "IMAGE"
      ? "IMAGE"
      : fileType === "AUDIO"
        ? "AUDIO"
        : fileType === "SLIDE"
          ? "SLIDE"
          : fileType === "WORKSHEET"
            ? "WORKSHEET"
            : "PDF";
  const resolvedPublicUrl = data.visibility === "public" ? uploaded.publicUrl : null;
  const isPublic = data.visibility === "public";

  let record: StoredFileRecord;
  try {
    const createdStored = await prisma.$transaction(async (tx) => {
      const sfRow = await tx.storedFile.create({
        data: {
          id: storedId,
          originalName: data.fileName,
          storedName,
          provider: providerName,
          fileType: mappedStoredType,
          mimeType: normalizedMime,
          fileSize: data.sizeBytes,
          bucketName: bucket,
          storagePath: uploaded.storagePath,
          cloudinaryPublicId: null,
          publicUrl: resolvedPublicUrl,
          isPublic,
          ownerId: data.actorId,
          category: folderPrefix,
          referencedBy: [`classroom:${data.classId}:week:${data.weekNumber}`],
        },
      });

      let targetFolder = await tx.resourceFolder.findFirst({
        orderBy: [{ id: "asc" }],
      });
      if (!targetFolder) {
        targetFolder = await tx.resourceFolder.create({
          data: {
            id: "fld-writing",
            name: "01. Academic Writing & Essays",
            description: "Thư mục học liệu số mặc định",
            parentId: null,
            itemCount: 0,
            updatedAt: dateDisplay,
            visibility: "public",
          },
        });
      }

      await tx.resourceFile.create({
        data: {
          id: storedId,
          folderId: targetFolder.id,
          folderName: targetFolder.name,
          title: data.fileName,
          description: `Tài liệu Tuần ${data.weekNumber} · Lớp ${data.classCode || data.classId}`,
          fileType: mappedStoredType,
          provider: providerName,
          mimeType: normalizedMime,
          bucketName: bucket,
          storagePath: uploaded.storagePath,
          cloudinaryPublicId: null,
          publicUrl: resolvedPublicUrl,
          objectKey: uploaded.storagePath,
          size: formatBytesLabel(data.sizeBytes),
          sizeBytes: data.sizeBytes,
          updatedAt: dateDisplay,
          downloads: 0,
          pagesOrDuration: "Tài liệu lớp",
          level: data.classCode || "IELTS",
          visibility: data.visibility,
          category: folderPrefix,
          ownerId: data.actorId,
          originalName: data.fileName,
          storedName,
          previewSummary: [
            `Gắn trực tiếp vào Tuần ${data.weekNumber} (${data.classCode || data.classId})`,
            data.visibility === "private"
              ? "Bảo mật qua Private Bucket & Signed URL cho học viên trong lớp."
              : "Tệp công khai.",
          ],
        },
      });

      await tx.resourceFolder.update({
        where: { id: targetFolder.id },
        data: { itemCount: { increment: 1 } },
      });

      return sfRow;
    });

    record = mapPrismaStoredFile(createdStored);
  } catch (err) {
    try {
      await provider.delete({
        bucket,
        storagePath: uploaded.storagePath,
        visibility: data.visibility,
      });
    } catch {
      try {
        await prisma.orphanedStorageFile.create({
          data: {
            id: `orphan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            provider: providerName,
            bucketName: bucket,
            storagePath: uploaded.storagePath,
            cloudinaryPublicId: null,
            reason: "Lưu metadata tài liệu tuần học thất bại và rollback không thành công",
          },
        });
      } catch {
        // best-effort orphan recording
      }
    }
    throw err;
  }

  await recordAuditLog({
    action: "UPLOAD_PDF",
    provider: providerName,
    actorId: data.actorId,
    targetId: record.id,
    targetPath: `${bucket}/${uploaded.storagePath}`,
    status: "SUCCESS",
    detail: `Đã tải tài liệu tuần ${data.weekNumber} (${fileType}): "${data.fileName}" (${formatBytesLabel(data.sizeBytes)})`,
  });

  const attachment: CurriculumAttachment = {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: data.fileName,
    url:
      data.visibility === "public" && record.publicUrl
        ? record.publicUrl
        : `/api/admin/storage/download-url?fileId=${record.id}`,
    size: formatBytesLabel(data.sizeBytes),
    sizeBytes: data.sizeBytes,
    type: fileType,
    uploadedAt: dateDisplay,
    storedFileId: record.id,
    visibility: data.visibility,
    classId: data.classId,
    classCode: data.classCode,
    weekNumber: data.weekNumber,
  };

  return { storedFile: record, attachment };
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

export async function getFileUrl(
  fileIdOrRecord: string | StoredFileRecord,
  options?: { preset?: CloudinaryTransformPreset },
): Promise<string> {
  const record =
    typeof fileIdOrRecord === "string"
      ? await getFileMetadata(fileIdOrRecord)
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
  skipAuditLog?: boolean;
}

export async function getSignedFileUrl(
  input: SignedFileUrlRequest,
): Promise<{ url: string; expiresInSeconds: number }> {
  if (!input.actorId || !input.actorRole) {
    throw new UnauthorizedError("Yêu cầu đăng nhập trước khi truy cập tệp riêng tư");
  }

  let record: StoredFileRecord | undefined;

  if (input.fileId) {
    const found = await prisma.storedFile.findFirst({
      where: { id: input.fileId, deletedAt: null },
    });
    if (!found) throw new NotFoundError("StoredFile", input.fileId);
    record = mapPrismaStoredFile(found);
  } else if (input.key) {
    const safeKey = validate(objectKeySchema, input.key);
    const found = await prisma.storedFile.findFirst({
      where: {
        deletedAt: null,
        OR: [{ storagePath: safeKey }, { cloudinaryPublicId: safeKey }],
      },
    });
    if (found) {
      record = mapPrismaStoredFile(found);
    }
  } else {
    throw new ValidationError("Phải cung cấp fileId hoặc key để tạo Signed URL");
  }

  const category = record?.category ?? "internal-documents";
  const storagePath = record?.storagePath ?? validate(objectKeySchema, input.key);

  // Strict authorization: students can only access public files or `student-documents` they are enrolled in
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
    if (record && !record.isPublic && record.referencedBy.some((r) => r.startsWith("classroom:"))) {
      const allowedClasses = record.referencedBy
        .filter((r) => r.startsWith("classroom:"))
        .map((r) => r.split(":")[1]);
      const student = await prisma.student.findFirst({
        where: {
          status: { not: "archived" },
          deletedAt: null,
          OR: [
            { id: input.actorId },
            { code: { equals: input.actorId, mode: "insensitive" } },
          ],
        },
        select: { classroomId: true },
      });
      if (student && !allowedClasses.includes(student.classroomId)) {
        throw new ForbiddenError(
          "Tài liệu này thuộc về lớp học khác, bạn không có quyền truy cập.",
        );
      }
    }
  }

  const env = getServerEnv();
  const setting = await prisma.teacherSetting.findUnique({
    where: { id: "default" },
    select: { presignedExpirySeconds: true },
  });
  const configuredTtl =
    setting?.presignedExpirySeconds ?? env.PRIVATE_FILE_URL_TTL_SECONDS;
  const expiresInSeconds = Math.min(
    Math.max(input.expiresInSeconds ?? configuredTtl, 60),
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
  if (!input.skipAuditLog) {
    await recordAuditLog({
      action: "CREATE_SIGNED_URL",
      provider: providerName,
      actorId: input.actorId,
      targetId: record?.id ?? storagePath,
      targetPath: storagePath,
      status: "SUCCESS",
      detail: `Đã cấp Signed URL tạm thời (${expiresInSeconds}s) cho ${input.actorRole}:${input.actorId}`,
    });
  }

  return { url, expiresInSeconds };
}

// -----------------------------------------------------------------------------
//  METADATA LOOKUP, DELETE & REPLACE (PHẦN 3.5, 4.6, 5, 11)
// -----------------------------------------------------------------------------

export async function findStoredFileById(
  id: unknown,
): Promise<StoredFileRecord | null> {
  const validId = validate(idSchema, id);
  const found = await prisma.storedFile.findFirst({
    where: { id: validId, deletedAt: null },
  });
  return found ? mapPrismaStoredFile(found) : null;
}

export async function getFileMetadata(id: unknown): Promise<StoredFileRecord> {
  const validId = validate(idSchema, id);
  const found = await findStoredFileById(validId);
  if (!found) throw new NotFoundError("StoredFile", validId);
  return found;
}

export async function findImageByPublicId(
  publicId: unknown,
): Promise<StoredFileRecord | null> {
  const safeId = validate(objectKeySchema, publicId);
  const found = await prisma.storedFile.findFirst({
    where: {
      deletedAt: null,
      provider: "cloudinary",
      OR: [{ cloudinaryPublicId: safeId }, { storagePath: safeId }],
    },
  });
  return found ? mapPrismaStoredFile(found) : null;
}

export async function checkImageExists(publicId: unknown): Promise<boolean> {
  const found = await findImageByPublicId(publicId);
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

  const record = await getFileMetadata(input.id);

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

  const now = new Date();
  const updatedRow = await prisma.$transaction(async (tx) => {
    const updatedStored = await tx.storedFile.update({
      where: { id: record.id },
      data: {
        deletedAt: now,
        publicUrl: null,
      },
    });

    const orClauses: Array<{
      id?: string;
      objectKey?: string;
      cloudinaryPublicId?: string;
    }> = [{ id: record.id }];
    if (record.storagePath) {
      orClauses.push({ objectKey: record.storagePath });
    }
    if (record.cloudinaryPublicId) {
      orClauses.push({ cloudinaryPublicId: record.cloudinaryPublicId });
    }

    const linkedRes = await tx.resourceFile.findFirst({
      where: { OR: orClauses },
    });
    if (linkedRes) {
      await tx.resourceFile.delete({ where: { id: linkedRes.id } });
      const folder = await tx.resourceFolder.findUnique({
        where: { id: linkedRes.folderId },
        select: { itemCount: true },
      });
      if (folder && folder.itemCount > 0) {
        await tx.resourceFolder.update({
          where: { id: linkedRes.folderId },
          data: { itemCount: Math.max(0, folder.itemCount - 1) },
        });
      }
    }

    return updatedStored;
  });

  await recordAuditLog({
    action: "DELETE_FILE",
    provider: record.provider,
    actorId: input.actorId ?? "admin",
    targetId: record.id,
    targetPath: record.storagePath ?? record.storedName,
    status: "SUCCESS",
    detail: `Đã xóa tệp "${record.originalName}" khỏi ${record.provider}`,
  });

  return mapPrismaStoredFile(updatedRow);
}

export async function replaceFile(input: {
  targetFileId: string;
  replacement: UploadImageInput | UploadPodcastInput | UploadPdfInput;
}): Promise<StoredFileRecord> {
  const existing = await getFileMetadata(input.targetFileId);

  const orClauses: Array<{
    id?: string;
    objectKey?: string;
    cloudinaryPublicId?: string;
  }> = [{ id: existing.id }];
  if (existing.storagePath) {
    orClauses.push({ objectKey: existing.storagePath });
  }
  if (existing.cloudinaryPublicId) {
    orClauses.push({ cloudinaryPublicId: existing.cloudinaryPublicId });
  }

  const linkedResource = await prisma.resourceFile.findFirst({
    where: {
      deletedAt: null,
      OR: orClauses,
    },
  });

  const inheritedVisibility = existing.isPublic ? "public" : "private";

  let created: StoredFileRecord;
  if (existing.fileType === "IMAGE") {
    created = await uploadImage({
      ...(input.replacement as UploadImageInput),
      referencedBy: existing.referencedBy,
    });
  } else if (existing.fileType === "AUDIO") {
    const rep = input.replacement as UploadPodcastInput;
    created = await uploadPodcast({
      ...rep,
      visibility: rep.visibility ?? inheritedVisibility,
      referencedBy: existing.referencedBy,
    });
  } else {
    const rep = input.replacement as UploadPdfInput;
    created = await uploadPdf({
      ...rep,
      visibility: rep.visibility ?? inheritedVisibility,
      referencedBy: existing.referencedBy,
    });
  }

  await deleteFile({
    id: existing.id,
    actorId: created.ownerId ?? "admin",
    actorRole: "admin",
    forceReplace: true,
  });

  const mappedFileType: ResourceFileItem["fileType"] =
    created.fileType === "AUDIO" ||
    created.fileType === "IMAGE" ||
    created.fileType === "SLIDE" ||
    created.fileType === "WORKSHEET"
      ? created.fileType
      : "PDF";

  if (linkedResource) {
    await prisma.$transaction(async (tx) => {
      const folderExists = await tx.resourceFolder.findUnique({
        where: { id: linkedResource.folderId },
        select: { id: true },
      });
      if (!folderExists) return;

      await tx.resourceFile.create({
        data: {
          id: created.id,
          folderId: linkedResource.folderId,
          folderName: linkedResource.folderName,
          title: linkedResource.title,
          description: linkedResource.description,
          fileType: mappedFileType,
          provider: created.provider,
          mimeType: created.mimeType,
          bucketName: created.bucketName,
          storagePath: created.storagePath,
          cloudinaryPublicId: created.cloudinaryPublicId,
          publicUrl: created.isPublic ? created.publicUrl : null,
          objectKey: created.storagePath,
          size: formatBytesLabel(created.fileSize),
          sizeBytes: created.fileSize,
          updatedAt: new Date().toLocaleDateString("vi-VN"),
          downloads: linkedResource.downloads,
          pagesOrDuration: linkedResource.pagesOrDuration,
          level: linkedResource.level,
          visibility: created.isPublic ? "public" : "private",
          category: created.category,
          ownerId: created.ownerId,
          originalName: created.originalName,
          storedName: created.storedName,
          previewSummary: [...linkedResource.previewSummary],
        },
      });

      await tx.resourceFolder.update({
        where: { id: linkedResource.folderId },
        data: { itemCount: { increment: 1 } },
      });
    });
  }

  const replacementUrl =
    created.isPublic && created.publicUrl
      ? created.publicUrl
      : `/api/admin/storage/download-url?fileId=${encodeURIComponent(created.id)}`;
  const replacementSize = formatBytesLabel(created.fileSize);

  const cwWhere: Array<{
    storedFileId?: string;
    id?: string;
    url?: string;
  }> = [{ storedFileId: existing.id }, { id: existing.id }];
  if (existing.publicUrl) {
    cwWhere.push({ url: existing.publicUrl });
  }
  await prisma.curriculumWeekAttachment.updateMany({
    where: { OR: cwWhere },
    data: {
      storedFileId: created.id,
      url: replacementUrl,
      sizeLabel: replacementSize,
      sizeBytes: created.fileSize,
    },
  });

  const sesWhere: Array<{
    storedFileId?: string;
    id?: string;
    url?: string;
  }> = [{ storedFileId: existing.id }, { id: existing.id }];
  if (existing.publicUrl) {
    sesWhere.push({ url: existing.publicUrl });
  }
  await prisma.sessionAttachmentFile.updateMany({
    where: { OR: sesWhere },
    data: {
      storedFileId: created.id,
      url: replacementUrl,
      size: replacementSize,
    },
  });

  await recordAuditLog({
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

export async function listStoredFiles(options?: {
  provider?: StorageProviderName | "all";
  fileType?: StoredFileRecord["fileType"] | "all";
  category?: string;
  search?: string;
  includeDeleted?: boolean;
}): Promise<StoredFileRecord[]> {
  const rows = await prisma.storedFile.findMany({
    where: {
      ...(!options?.includeDeleted ? { deletedAt: null } : {}),
      ...(options?.provider && options.provider !== "all"
        ? { provider: options.provider }
        : {}),
      ...(options?.fileType && options.fileType !== "all"
        ? { fileType: options.fileType }
        : {}),
      ...(options?.category && options.category !== "all"
        ? { category: options.category }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });

  const mapped = rows.map(mapPrismaStoredFile);
  const q = options?.search?.trim().toLowerCase() ?? "";
  if (!q) return mapped;

  return mapped.filter(
    (f) =>
      f.originalName.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q) ||
      (f.storagePath ?? "").toLowerCase().includes(q),
  );
}

export async function listStorageAuditLogs(
  limit = 500,
): Promise<StorageAuditLogEntry[]> {
  const rows = await prisma.storageAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.map(mapPrismaStorageAuditLog);
}

export async function listOrphanedFiles(): Promise<OrphanedStorageObject[]> {
  const rows = await prisma.orphanedStorageFile.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map(mapPrismaOrphanedStorageFile);
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
    await checkStorageQuota({ provider: "cloudinary", incomingSizeBytes: data.size });
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
    await checkStorageQuota({ provider: "supabase", incomingSizeBytes: data.size });
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
    await checkStorageQuota({ provider: "supabase", incomingSizeBytes: data.size });
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
  publicUrl: optionalSafeUrlSchema,
  provider: z.enum(["cloudinary", "supabase", "r2", "s3", "local"]).optional(),
  mimeType: z.string().trim().max(128).optional(),
  bucketName: z.string().trim().max(128).nullish(),
  cloudinaryPublicId: z.string().trim().max(512).nullish(),
  category: z.string().trim().max(120).optional(),
  originalName: z.string().trim().max(255).optional(),
});

export const updateResourceFileSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().trim().min(1).optional(),
  fileType: z.enum(["PDF", "SLIDE", "AUDIO", "WORKSHEET", "IMAGE"]).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  description: z.string().trim().max(1000).optional(),
  size: z.string().trim().max(32).optional(),
  sizeBytes: z.coerce.number().int().nonnegative().optional(),
  pagesOrDuration: z.string().trim().max(64).optional(),
  level: z.string().trim().max(64).optional(),
  objectKey: z.string().trim().max(512).nullish(),
  publicUrl: optionalSafeUrlSchema,
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
  const rows = await prisma.resourceFolder.findMany({
    where: options?.publicOnly ? { visibility: "public" } : undefined,
    orderBy: [{ id: "asc" }],
  });
  return rows.map(mapPrismaResourceFolder);
}

export async function listResourceFiles(options?: {
  publicOnly?: boolean;
  folderId?: string;
  fileType?: string;
  level?: string;
  search?: string;
}): Promise<ResourceFileItem[]> {
  const validFileTypes = new Set(["PDF", "SLIDE", "AUDIO", "WORKSHEET", "IMAGE"]);
  if (
    options?.fileType &&
    options.fileType !== "all" &&
    !validFileTypes.has(options.fileType)
  ) {
    return [];
  }

  const rows = await prisma.resourceFile.findMany({
    where: {
      deletedAt: null,
      // Never leak private documents on public API (PHẦN 8.14)
      ...(options?.publicOnly ? { visibility: "public" } : {}),
      ...(options?.folderId && options.folderId !== "all"
        ? { folderId: options.folderId }
        : {}),
      ...(options?.fileType && options.fileType !== "all"
        ? {
            fileType: options.fileType as ResourceFileItem["fileType"],
          }
        : {}),
      ...(options?.level && options.level !== "all"
        ? { level: options.level }
        : {}),
    },
    orderBy: [{ id: "asc" }],
  });

  const mapped = rows.map(mapPrismaResourceFile);
  const search = options?.search?.trim() ?? "";
  if (!search) return mapped;

  return mapped.filter((f) => {
    const rawText = [
      f.title,
      f.description,
      f.folderName,
      f.level,
      ...(f.previewSummary ?? []),
    ].join(" ");
    return matchesNormalizedDocumentText(rawText, search);
  });
}

export async function createResourceFile(
  input: unknown,
  actorId = "admin",
): Promise<ResourceFileItem> {
  const data = validate(createResourceFileSchema, input);
  const env = getServerEnv();

  let folder = await prisma.resourceFolder.findUnique({
    where: { id: data.folderId },
  });
  if (!folder) {
    folder = await prisma.resourceFolder.findFirst({
      orderBy: [{ id: "asc" }],
    });
  }
  if (!folder) {
    folder = await prisma.resourceFolder.create({
      data: {
        id: "fld-writing",
        name: "01. Academic Writing & Essays",
        description: "Thư mục học liệu số mặc định",
        parentId: null,
        itemCount: 0,
        updatedAt: new Date().toLocaleDateString("vi-VN"),
        visibility: "public",
      },
    });
  }

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

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const storagePath =
    data.objectKey ??
    (isImage
      ? `english-manager/resources/${yyyy}/${mm}/${Date.now()}`
      : `${data.visibility === "public" ? "resources/exercises" : "internal-documents"}/${yyyy}/${mm}/${Date.now()}.pdf`);

  const newId = `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const effectiveVisibility: FileVisibility = isImage ? "public" : data.visibility;
  const resolvedDescription =
    data.description ??
    (isImage
      ? "Hình ảnh học thuật đã được tối ưu tự động (f_auto, q_auto) trên Cloudinary Free."
      : "Tài liệu học thuật lưu trữ trên Supabase Storage Free.");
  const resolvedCloudinaryPublicId = isImage
    ? (data.cloudinaryPublicId ?? storagePath)
    : null;
  const resolvedCategory = data.category ?? (isImage ? "resource" : "resources/exercises");
  const resolvedOriginalName = data.originalName ?? data.title;
  const resolvedStoredName = storagePath.split("/").pop() ?? data.title;
  // Never save publicUrl for private files; auto-derive public URL when omitted on public files
  const resolvedPublicUrl =
    effectiveVisibility === "private" && !isImage
      ? null
      : (data.publicUrl ?? (storagePath ? getPublicUrl(storagePath) : null));
  const updatedAtLabel = now.toLocaleDateString("vi-VN");
  const previewSummary = [
    `Provider: ${resolvedProvider.toUpperCase()} · Đường dẫn: ${storagePath}`,
    effectiveVisibility === "private"
      ? "Tệp riêng tư (Private Bucket) — truy cập qua Signed URL có thời hạn 15 phút."
      : "Tệp công khai — sẵn sàng phân phối cho học sinh.",
  ];

  const createdRow = await prisma.$transaction(async (tx) => {
    const resRow = await tx.resourceFile.create({
      data: {
        id: newId,
        folderId: folder.id,
        folderName: folder.name,
        title: data.title,
        description: resolvedDescription,
        fileType: data.fileType,
        provider: resolvedProvider,
        mimeType: resolvedMime,
        bucketName: resolvedBucket,
        storagePath,
        cloudinaryPublicId: resolvedCloudinaryPublicId,
        publicUrl: resolvedPublicUrl,
        objectKey: storagePath,
        size: data.size,
        sizeBytes: data.sizeBytes,
        updatedAt: updatedAtLabel,
        downloads: 0,
        pagesOrDuration: data.pagesOrDuration,
        level: data.level,
        visibility: effectiveVisibility,
        category: resolvedCategory,
        ownerId: actorId,
        originalName: resolvedOriginalName,
        storedName: resolvedStoredName,
        previewSummary,
      },
    });

    await tx.resourceFolder.update({
      where: { id: folder.id },
      data: { itemCount: { increment: 1 } },
    });

    // Synchronize into StoredFile table so quota & file inventory stay 100% consistent
    await tx.storedFile.create({
      data: {
        id: newId,
        originalName: resolvedOriginalName,
        storedName: resolvedStoredName,
        provider: resolvedProvider,
        fileType: data.fileType,
        mimeType: resolvedMime,
        fileSize: data.sizeBytes,
        bucketName: resolvedBucket,
        storagePath,
        cloudinaryPublicId: resolvedCloudinaryPublicId,
        publicUrl: resolvedPublicUrl,
        isPublic: effectiveVisibility === "public",
        ownerId: actorId,
        category: resolvedCategory,
        referencedBy: [],
      },
    });

    return resRow;
  });

  await recordAuditLog({
    action: isImage
      ? "UPLOAD_IMAGE"
      : data.fileType === "AUDIO"
        ? "UPLOAD_PODCAST"
        : "UPLOAD_PDF",
    provider: resolvedProvider,
    actorId,
    targetId: createdRow.id,
    targetPath: `${resolvedBucket ? `${resolvedBucket}/` : ""}${storagePath}`,
    status: "SUCCESS",
    detail: `Đã lưu học liệu "${createdRow.title}" (${createdRow.size}) [${createdRow.visibility.toUpperCase()}]`,
  });

  return mapPrismaResourceFile(createdRow);
}

export async function toggleResourceFileVisibility(
  id: unknown,
  actorId = "admin",
): Promise<ResourceFileItem> {
  const validId = validate(idSchema, id);
  const env = getServerEnv();

  const current = await prisma.resourceFile.findFirst({
    where: { id: validId, deletedAt: null },
  });
  if (!current) throw new NotFoundError("ResourceFile", validId);

  const nextVisibility: FileVisibility =
    current.visibility === "public" ? "private" : "public";
  const isImage = current.fileType === "IMAGE";
  const effectiveVisibility: FileVisibility = isImage ? "public" : nextVisibility;
  const targetKey =
    current.cloudinaryPublicId ?? current.storagePath ?? current.objectKey;

  const nextBucketName =
    current.provider === "cloudinary"
      ? null
      : effectiveVisibility === "public"
        ? env.SUPABASE_PUBLIC_BUCKET
        : env.SUPABASE_PRIVATE_BUCKET;

  if (
    current.provider === "supabase" &&
    targetKey &&
    current.bucketName &&
    nextBucketName &&
    current.bucketName !== nextBucketName
  ) {
    const provider = getStorageProvider("supabase");
    await provider.moveObject?.(current.bucketName, nextBucketName, targetKey);
  }

  const restoredPublicUrl =
    effectiveVisibility === "private"
      ? null
      : current.publicUrl || (targetKey ? getPublicUrl(targetKey) : null);

  const updatedRow = await prisma.$transaction(async (tx) => {
    const resRow = await tx.resourceFile.update({
      where: { id: validId },
      data: {
        visibility: effectiveVisibility,
        bucketName: nextBucketName,
        publicUrl: restoredPublicUrl,
        updatedAt: new Date().toLocaleDateString("vi-VN"),
      },
    });

    await tx.storedFile.updateMany({
      where: { id: validId },
      data: {
        isPublic: effectiveVisibility === "public",
        bucketName: nextBucketName,
        publicUrl: restoredPublicUrl,
      },
    });

    return resRow;
  });

  await recordAuditLog({
    action: "TOGGLE_VISIBILITY",
    provider: updatedRow.provider,
    actorId,
    targetId: updatedRow.id,
    targetPath: targetKey ?? updatedRow.title,
    status: "SUCCESS",
    detail: `Đã chuyển "${updatedRow.title}" sang chế độ ${
      effectiveVisibility === "public"
        ? "Công khai (Public)"
        : "Nội bộ (Private Signed URL)"
    }`,
  });

  return mapPrismaResourceFile(updatedRow);
}

export async function deleteResourceFile(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);

  const stored = await prisma.storedFile.findFirst({
    where: { id: validId, deletedAt: null },
    select: { id: true },
  });
  if (stored) {
    await deleteFile({ id: stored.id, actorId: "admin", actorRole: "admin" });
    return;
  }

  const existing = await prisma.resourceFile.findFirst({
    where: { id: validId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError("ResourceFile", validId);

  await prisma.$transaction(async (tx) => {
    await tx.resourceFile.delete({ where: { id: validId } });
    const folder = await tx.resourceFolder.findUnique({
      where: { id: existing.folderId },
      select: { itemCount: true },
    });
    if (folder && folder.itemCount > 0) {
      await tx.resourceFolder.update({
        where: { id: existing.folderId },
        data: { itemCount: Math.max(0, folder.itemCount - 1) },
      });
    }
  });
}

export async function updateResourceFile(
  id: unknown,
  input: unknown,
  actorId = "admin",
): Promise<ResourceFileItem> {
  const validId = validate(idSchema, id);
  const data = validate(updateResourceFileSchema, input);
  const env = getServerEnv();

  const current = await prisma.resourceFile.findFirst({
    where: { id: validId, deletedAt: null },
  });
  if (!current) throw new NotFoundError("ResourceFile", validId);

  // Verify destination folder exists BEFORE mutating anything
  let nextFolderId = current.folderId;
  let nextFolderName = current.folderName;
  const folderChanged = Boolean(data.folderId && data.folderId !== current.folderId);
  if (folderChanged) {
    const newFolder = await prisma.resourceFolder.findUnique({
      where: { id: data.folderId! },
    });
    if (!newFolder) {
      throw new NotFoundError("ResourceFolder", data.folderId!);
    }
    nextFolderId = newFolder.id;
    nextFolderName = newFolder.name;
  }

  const nextFileType = data.fileType ?? current.fileType;
  const nextVisibility = data.visibility ?? current.visibility;
  const isImage = nextFileType === "IMAGE";
  const effectiveVisibility: FileVisibility = isImage ? "public" : nextVisibility;
  const resolvedProvider = data.provider ?? current.provider;
  const resolvedBucket =
    resolvedProvider === "cloudinary"
      ? null
      : data.bucketName ??
        (effectiveVisibility === "public"
          ? env.SUPABASE_PUBLIC_BUCKET
          : env.SUPABASE_PRIVATE_BUCKET);
  const nextStoragePath = data.objectKey ?? current.storagePath;
  const nextObjectKey = data.objectKey !== undefined ? data.objectKey : current.objectKey;
  const restoredPublicUrl =
    effectiveVisibility === "private"
      ? null
      : data.publicUrl !== undefined
        ? data.publicUrl
        : current.publicUrl ||
          (nextStoragePath ? getPublicUrl(nextStoragePath) : null);

  const nextTitle = data.title ?? current.title;
  const nextOriginalName = data.originalName ?? current.originalName;
  const nextSizeBytes = data.sizeBytes ?? current.sizeBytes;

  const updatedRow = await prisma.$transaction(async (tx) => {
    if (folderChanged) {
      const oldFolder = await tx.resourceFolder.findUnique({
        where: { id: current.folderId },
        select: { itemCount: true },
      });
      if (oldFolder && oldFolder.itemCount > 0) {
        await tx.resourceFolder.update({
          where: { id: current.folderId },
          data: { itemCount: Math.max(0, oldFolder.itemCount - 1) },
        });
      }
      await tx.resourceFolder.update({
        where: { id: nextFolderId },
        data: { itemCount: { increment: 1 } },
      });
    }

    const resRow = await tx.resourceFile.update({
      where: { id: validId },
      data: {
        folderId: nextFolderId,
        folderName: nextFolderName,
        title: nextTitle,
        description: data.description ?? current.description,
        fileType: nextFileType,
        size: data.size ?? current.size,
        sizeBytes: nextSizeBytes,
        pagesOrDuration: data.pagesOrDuration ?? current.pagesOrDuration,
        level: data.level ?? current.level,
        visibility: effectiveVisibility,
        objectKey: nextObjectKey,
        storagePath: nextStoragePath,
        bucketName: resolvedBucket,
        cloudinaryPublicId:
          data.cloudinaryPublicId !== undefined
            ? data.cloudinaryPublicId
            : current.cloudinaryPublicId,
        provider: resolvedProvider,
        mimeType: data.mimeType ?? current.mimeType,
        category: data.category ?? current.category,
        originalName: nextOriginalName,
        publicUrl: restoredPublicUrl,
        updatedAt: new Date().toLocaleDateString("vi-VN"),
      },
    });

    await tx.storedFile.updateMany({
      where: { id: validId },
      data: {
        originalName: nextOriginalName ?? nextTitle,
        fileType: nextFileType,
        fileSize: nextSizeBytes,
        isPublic: effectiveVisibility === "public",
        bucketName: resolvedBucket,
        publicUrl: restoredPublicUrl,
        storagePath: nextStoragePath,
      },
    });

    return resRow;
  });

  await recordAuditLog({
    action: "UPDATE_METADATA",
    provider: resolvedProvider,
    actorId,
    targetId: updatedRow.id,
    targetPath: updatedRow.storagePath ?? updatedRow.objectKey ?? updatedRow.title,
    status: "SUCCESS",
    detail: `Đã cập nhật metadata học liệu "${updatedRow.title}" (${updatedRow.folderName})`,
  });

  return mapPrismaResourceFile(updatedRow);
}

// -----------------------------------------------------------------------------
//  ORPHANED STORAGE CLEANUP & RESOURCE FOLDER CRUD
// -----------------------------------------------------------------------------

export async function cleanupOrphanedFiles(options?: {
  ids?: string[];
  actorId?: string;
  actorRole?: Role;
}): Promise<{
  cleanedCount: number;
  failedCount: number;
  remaining: OrphanedStorageObject[];
}> {
  if ((options?.actorRole ?? "admin") !== "admin") {
    throw new ForbiddenError(
      "Chỉ quản trị viên mới có quyền dọn dẹp tệp mồ côi trên hệ thống lưu trữ",
    );
  }

  const env = getServerEnv();
  const targetIds = options?.ids?.length ? options.ids : undefined;
  const targets = await prisma.orphanedStorageFile.findMany({
    where: targetIds ? { id: { in: targetIds } } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  let cleanedCount = 0;
  let failedCount = 0;
  const cleanedIds: string[] = [];

  for (const orphan of targets) {
    try {
      const provider = getStorageProvider(orphan.provider);
      await provider.delete({
        bucket: orphan.bucketName,
        storagePath: orphan.storagePath,
        cloudinaryPublicId: orphan.cloudinaryPublicId,
        visibility:
          orphan.bucketName === env.SUPABASE_PRIVATE_BUCKET
            ? "private"
            : "public",
      });
      cleanedIds.push(orphan.id);
      cleanedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  if (cleanedIds.length > 0) {
    await prisma.orphanedStorageFile.deleteMany({
      where: { id: { in: cleanedIds } },
    });
  }

  await recordAuditLog({
    action: "CLEANUP_ORPHANS",
    provider: targets[0]?.provider ?? "supabase",
    actorId: options?.actorId ?? "admin",
    targetId: "orphan-cleanup",
    targetPath: `${cleanedCount} objects`,
    status: failedCount > 0 && cleanedCount === 0 ? "FAILED" : "SUCCESS",
    detail: `Đã dọn dẹp ${cleanedCount} tệp mồ côi khỏi Cloud Storage${
      failedCount > 0 ? ` (${failedCount} tệp lỗi)` : ""
    }`,
  });

  const remaining = await listOrphanedFiles();
  return {
    cleanedCount,
    failedCount,
    remaining,
  };
}

export const createResourceFolderSchema = z.object({
  name: z.string().trim().min(1, "Tên thư mục không được để trống").max(120),
  description: z.string().trim().max(500).default("Thư mục học liệu số"),
  visibility: z.enum(["public", "private"]).default("public"),
  parentId: z.string().trim().nullish(),
});

export const updateResourceFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Tên thư mục không được để trống")
    .max(120)
    .optional(),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  parentId: z.string().trim().nullish(),
});

export async function createResourceFolder(
  input: unknown,
): Promise<ResourceFolder> {
  const data = validate(createResourceFolderSchema, input);

  const duplicate = await prisma.resourceFolder.findFirst({
    where: {
      name: { equals: data.name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new ConflictError(`Thư mục "${data.name}" đã tồn tại`);
  }

  const created = await prisma.resourceFolder.create({
    data: {
      id: `fld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: data.name,
      description: data.description,
      parentId: data.parentId ?? null,
      itemCount: 0,
      updatedAt: new Date().toLocaleDateString("vi-VN"),
      visibility: data.visibility,
    },
  });

  return mapPrismaResourceFolder(created);
}

export async function updateResourceFolder(
  id: unknown,
  input: unknown,
): Promise<ResourceFolder> {
  const validId = validate(idSchema, id);
  const data = validate(updateResourceFolderSchema, input);

  const current = await prisma.resourceFolder.findUnique({
    where: { id: validId },
  });
  if (!current) throw new NotFoundError("ResourceFolder", validId);

  if (data.name) {
    const duplicate = await prisma.resourceFolder.findFirst({
      where: {
        id: { not: validId },
        name: { equals: data.name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(`Thư mục "${data.name}" đã tồn tại`);
    }
  }

  const nextName = data.name ?? current.name;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.resourceFolder.update({
      where: { id: validId },
      data: {
        name: nextName,
        description: data.description ?? current.description,
        visibility: data.visibility ?? current.visibility,
        parentId: data.parentId !== undefined ? data.parentId : current.parentId,
        updatedAt: new Date().toLocaleDateString("vi-VN"),
      },
    });

    if (nextName !== current.name) {
      await tx.resourceFile.updateMany({
        where: { folderId: validId },
        data: { folderName: nextName },
      });
    }

    return row;
  });

  return mapPrismaResourceFolder(updated);
}

export async function deleteResourceFolder(id: unknown): Promise<void> {
  const validId = validate(idSchema, id);

  const current = await prisma.resourceFolder.findUnique({
    where: { id: validId },
  });
  if (!current) throw new NotFoundError("ResourceFolder", validId);

  const childCount = await prisma.resourceFile.count({
    where: { folderId: validId, deletedAt: null },
  });
  if (childCount > 0) {
    throw new ConflictError(
      `Không thể xóa thư mục "${current.name}" vì vẫn còn tài liệu bên trong. Hãy chuyển hoặc xóa tài liệu trước.`,
    );
  }

  await prisma.resourceFolder.delete({ where: { id: validId } });
}

export async function recordPublicResourceDownload(id: unknown): Promise<{
  id: string;
  title: string;
  downloads: number;
  publicUrl: string | null;
}> {
  const validId = validate(idSchema, id);

  const file = await prisma.resourceFile.findFirst({
    where: { id: validId, deletedAt: null },
  });
  if (!file) {
    throw new NotFoundError("ResourceFile", validId);
  }
  if (file.visibility !== "public") {
    throw new ForbiddenError(
      "Tài liệu nội bộ yêu cầu xác thực học sinh để tải xuống.",
    );
  }

  const updated = await prisma.resourceFile.update({
    where: { id: validId },
    data: { downloads: { increment: 1 } },
  });

  return {
    id: updated.id,
    title: updated.title,
    downloads: updated.downloads,
    publicUrl: updated.publicUrl ?? null,
  };
}

// -----------------------------------------------------------------------------
//  AUTO-CLEANUP REPLACED / DELETED CLOUDINARY IMAGES
// -----------------------------------------------------------------------------

const CLOUDINARY_TRANSFORM_SEGMENT_RE =
  /^(?:[a-z]{1,3}_[^/,]+)(?:,[a-z]{1,3}_[^/,]+)*$/i;

/**
 * Extracts a Cloudinary `public_id` from a Cloudinary delivery URL or a bare
 * `english-manager/...` object key. Returns `null` for external URLs (e.g.
 * Unsplash) or local static assets (e.g. `/images/teacher-avatar.jpg`).
 */
export function extractCloudinaryPublicIdFromUrl(
  urlOrKey?: string | null,
): string | null {
  if (!urlOrKey) return null;
  const trimmed = urlOrKey.trim();
  if (!trimmed) return null;

  // Bare Cloudinary key under our app folder
  if (trimmed.startsWith("english-manager/")) {
    return trimmed.replace(/\.[a-z0-9]{2,5}$/i, "");
  }

  // Must be a Cloudinary delivery URL
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const marker = "/image/upload/";
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;

    const rest = parsed.pathname.slice(idx + marker.length);
    const segments = rest.split("/").filter(Boolean);

    // Strip leading transformation segments (e.g. c_fill,w_800,f_auto,q_auto)
    while (
      segments.length > 1 &&
      CLOUDINARY_TRANSFORM_SEGMENT_RE.test(segments[0])
    ) {
      segments.shift();
    }

    // Strip version segment (e.g. v1732291234)
    if (segments.length > 1 && /^v\d+$/.test(segments[0])) {
      segments.shift();
    }

    if (segments.length === 0) return null;
    const joined = decodeURIComponent(segments.join("/"));
    return joined.replace(/\.[a-z0-9]{2,5}$/i, "");
  } catch {
    return null;
  }
}

/**
 * Safely deletes a replaced or removed Cloudinary image AFTER the parent DB
 * update/delete has already succeeded.
 *
 * Safety guarantees:
 * 1. Ignores non-Cloudinary URLs (Unsplash, local `/images/...`, etc.).
 * 2. No-op when the old and new public IDs are identical.
 * 3. Checks remaining references across StudentProject, PodcastEpisode, and
 *    TeacherSetting before deleting so shared images are never broken.
 * 4. Best-effort: never throws to the caller — if Cloudinary fails transiently,
 *    the asset is queued in `orphaned_storage_files` for later cleanup.
 */
export async function cleanupReplacedCloudinaryImage(params: {
  oldUrl?: string | null;
  oldPublicId?: string | null;
  newUrl?: string | null;
  newPublicId?: string | null;
  actorId?: string;
  reason?: string;
}): Promise<{ deleted: boolean; skippedReason?: string; publicId?: string }> {
  const oldPublicId =
    params.oldPublicId?.trim() ||
    extractCloudinaryPublicIdFromUrl(params.oldUrl);
  if (!oldPublicId) {
    return { deleted: false, skippedReason: "not-cloudinary" };
  }

  const newPublicId =
    params.newPublicId?.trim() ||
    extractCloudinaryPublicIdFromUrl(params.newUrl);
  if (newPublicId && newPublicId === oldPublicId) {
    return { deleted: false, skippedReason: "unchanged", publicId: oldPublicId };
  }

  try {
    // 1. Check if any other record still references this Cloudinary public_id
    const [projectRefs, podcastRefs, settingRefs] = await Promise.all([
      prisma.studentProject.count({
        where: {
          OR: [
            { posterPublicId: oldPublicId },
            { posterUrl: { contains: oldPublicId } },
          ],
        },
      }),
      prisma.podcastEpisode.count({
        where: { thumbnailKey: { contains: oldPublicId } },
      }),
      prisma.teacherSetting.count({
        where: { avatarUrl: { contains: oldPublicId } },
      }),
    ]);

    if (projectRefs + podcastRefs + settingRefs > 0) {
      return {
        deleted: false,
        skippedReason: "still-referenced",
        publicId: oldPublicId,
      };
    }

    // 2. Find matching StoredFile metadata row(s) if tracked
    const storedRow = await prisma.storedFile.findFirst({
      where: {
        provider: "cloudinary",
        OR: [
          { cloudinaryPublicId: oldPublicId },
          { storagePath: oldPublicId },
          ...(params.oldUrl ? [{ publicUrl: params.oldUrl }] : []),
        ],
      },
      select: { id: true, storagePath: true, cloudinaryPublicId: true },
    });

    const targetPublicId = storedRow?.cloudinaryPublicId ?? oldPublicId;
    const targetPath = storedRow?.storagePath ?? oldPublicId;

    // 3. Delete asset on Cloudinary
    const provider = getStorageProvider("cloudinary");
    try {
      await provider.delete({
        storagePath: targetPath,
        cloudinaryPublicId: targetPublicId,
        visibility: "public",
      });
    } catch (cloudErr) {
      // Enqueue as orphan for retry in /storage so parent save never breaks
      await prisma.orphanedStorageFile
        .create({
          data: {
            id: `orph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            provider: "cloudinary",
            bucketName: null,
            storagePath: targetPath,
            cloudinaryPublicId: targetPublicId,
            reason: `Auto-cleanup failed (${params.reason ?? "image-replaced"}): ${
              cloudErr instanceof Error ? cloudErr.message : "unknown"
            }`,
          },
        })
        .catch(() => {});

      await recordAuditLog({
        action: "DELETE_FILE",
        provider: "cloudinary",
        actorId: params.actorId ?? "admin",
        targetId: storedRow?.id ?? targetPublicId,
        targetPath,
        status: "FAILED",
        detail: `Không thể xóa tự động ảnh cũ trên Cloudinary (${params.reason ?? "đổi ảnh"}) — đã đưa vào hàng đợi dọn tệp mồ côi.`,
      }).catch(() => {});

      return {
        deleted: false,
        skippedReason: "queued-as-orphan",
        publicId: targetPublicId,
      };
    }

    // 4. Remove matching StoredFile row(s) in PostgreSQL
    if (storedRow) {
      await prisma.storedFile
        .delete({ where: { id: storedRow.id } })
        .catch(() => {});
    }

    await recordAuditLog({
      action: "DELETE_FILE",
      provider: "cloudinary",
      actorId: params.actorId ?? "admin",
      targetId: storedRow?.id ?? targetPublicId,
      targetPath,
      status: "SUCCESS",
      detail: `Tự động xóa ảnh cũ trên Cloudinary để tiết kiệm dung lượng (${params.reason ?? "đổi ảnh"}).`,
    }).catch(() => {});

    return { deleted: true, publicId: targetPublicId };
  } catch {
    return {
      deleted: false,
      skippedReason: "unexpected-error",
      publicId: oldPublicId,
    };
  }
}

// -----------------------------------------------------------------------------
//  AUTO-CLEANUP REPLACED / DELETED SUPABASE STORAGE FILES (AUDIO / PDF / DOCS)
// -----------------------------------------------------------------------------

const SUPABASE_BARE_KEY_PREFIXES = [
  "podcasts/",
  "documents/",
  "resources/",
  "attachments/",
  "curriculum/",
];

/**
 * Extracts `{ bucket, storagePath, visibility }` from a Supabase Storage URL
 * or a bare object key (`podcasts/...`, `documents/...`, etc.).
 * Returns `null` for external non-Supabase URLs (e.g. `https://example.com/...`)
 * or local relative paths.
 */
export function extractSupabaseStorageTarget(
  urlOrKey?: string | null,
  fallbackPublicBucket = "english-manager-public",
  privateBucketName = "english-manager-private",
): { bucket: string; storagePath: string; visibility: "public" | "private" } | null {
  if (!urlOrKey) return null;
  const trimmed = urlOrKey.trim();
  if (!trimmed) return null;

  // Bare Supabase storage key
  if (
    !trimmed.startsWith("http://") &&
    !trimmed.startsWith("https://") &&
    !trimmed.startsWith("/")
  ) {
    const cleanKey = trimmed.replace(/^\/+/, "");
    if (
      SUPABASE_BARE_KEY_PREFIXES.some((prefix) => cleanKey.startsWith(prefix))
    ) {
      return {
        bucket: fallbackPublicBucket,
        storagePath: cleanKey,
        visibility: "public",
      };
    }
    return null;
  }

  // Must be a Supabase Storage URL
  if (!/^https?:\/\/[^/]*supabase\.co\/storage\/v1\/object\//i.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    // Matches /storage/v1/object/(public|sign|authenticated)/<bucket>/<path...>
    const match = parsed.pathname.match(
      /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i,
    );
    if (!match) return null;

    const bucket = decodeURIComponent(match[1]);
    const storagePath = decodeURIComponent(match[2]).replace(/^\/+/, "");
    if (!bucket || !storagePath) return null;

    const visibility: "public" | "private" =
      bucket === privateBucketName ? "private" : "public";
    return { bucket, storagePath, visibility };
  } catch {
    return null;
  }
}

/**
 * Safely deletes a replaced or removed Supabase Storage object (MP3/M4A audio,
 * PDF document, attachment) AFTER the parent DB update/delete has succeeded.
 *
 * Safety guarantees:
 * 1. Ignores non-Supabase external URLs.
 * 2. No-op when old and new storagePath are identical.
 * 3. Checks remaining references across PodcastEpisode, StudentProject,
 *    AnnouncementAttachment, and ResourceFile before deleting.
 * 4. Best-effort: never throws to the caller — on transient Supabase failure,
 *    enqueues into `orphaned_storage_files` for later cleanup.
 */
export async function cleanupReplacedSupabaseFile(params: {
  oldUrl?: string | null;
  oldKey?: string | null;
  newUrl?: string | null;
  newKey?: string | null;
  actorId?: string;
  reason?: string;
}): Promise<{ deleted: boolean; skippedReason?: string; storagePath?: string }> {
  const env = getServerEnv();
  const publicBucket = env.SUPABASE_PUBLIC_BUCKET;
  const privateBucket = env.SUPABASE_PRIVATE_BUCKET;

  const oldTarget =
    extractSupabaseStorageTarget(params.oldUrl, publicBucket, privateBucket) ??
    extractSupabaseStorageTarget(params.oldKey, publicBucket, privateBucket);
  if (!oldTarget) {
    return { deleted: false, skippedReason: "not-supabase" };
  }

  const newTarget =
    extractSupabaseStorageTarget(params.newUrl, publicBucket, privateBucket) ??
    extractSupabaseStorageTarget(params.newKey, publicBucket, privateBucket);
  if (newTarget && newTarget.storagePath === oldTarget.storagePath) {
    return {
      deleted: false,
      skippedReason: "unchanged",
      storagePath: oldTarget.storagePath,
    };
  }

  try {
    // 1. Check remaining references across all domain tables
    const [podcastRefs, projectRefs, attachmentRefs, resourceRefs] =
      await Promise.all([
        prisma.podcastEpisode.count({
          where: {
            OR: [
              { audioKey: oldTarget.storagePath },
              { audioUrl: { contains: oldTarget.storagePath } },
            ],
          },
        }),
        prisma.studentProject.count({
          where: { documentUrl: { contains: oldTarget.storagePath } },
        }),
        prisma.announcementAttachment.count({
          where: {
            OR: [
              { objectKey: oldTarget.storagePath },
              { url: { contains: oldTarget.storagePath } },
            ],
          },
        }),
        prisma.resourceFile.count({
          where: {
            deletedAt: null,
            OR: [
              { objectKey: oldTarget.storagePath },
              { publicUrl: { contains: oldTarget.storagePath } },
            ],
          },
        }),
      ]);

    if (podcastRefs + projectRefs + attachmentRefs + resourceRefs > 0) {
      return {
        deleted: false,
        skippedReason: "still-referenced",
        storagePath: oldTarget.storagePath,
      };
    }

    // 2. Find matching StoredFile metadata row if tracked
    const storedRow = await prisma.storedFile.findFirst({
      where: {
        provider: "supabase",
        OR: [
          { storagePath: oldTarget.storagePath },
          ...(params.oldUrl ? [{ publicUrl: params.oldUrl }] : []),
        ],
      },
      select: { id: true, bucketName: true, storagePath: true, isPublic: true },
    });

    const targetBucket = storedRow?.bucketName ?? oldTarget.bucket;
    const targetPath = storedRow?.storagePath ?? oldTarget.storagePath;
    const targetVisibility: "public" | "private" = storedRow
      ? storedRow.isPublic
        ? "public"
        : "private"
      : oldTarget.visibility;

    // 3. Delete object on Supabase Storage
    const provider = getStorageProvider("supabase");
    try {
      await provider.delete({
        bucket: targetBucket,
        storagePath: targetPath,
        visibility: targetVisibility,
      });
    } catch (cloudErr) {
      await prisma.orphanedStorageFile
        .create({
          data: {
            id: `orph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            provider: "supabase",
            bucketName: targetBucket,
            storagePath: targetPath,
            cloudinaryPublicId: null,
            reason: `Auto-cleanup failed (${params.reason ?? "file-replaced"}): ${
              cloudErr instanceof Error ? cloudErr.message : "unknown"
            }`,
          },
        })
        .catch(() => {});

      await recordAuditLog({
        action: "DELETE_FILE",
        provider: "supabase",
        actorId: params.actorId ?? "admin",
        targetId: storedRow?.id ?? targetPath,
        targetPath,
        status: "FAILED",
        detail: `Không thể xóa tự động tệp cũ trên Supabase Storage (${params.reason ?? "đổi tệp"}) — đã đưa vào hàng đợi dọn tệp mồ côi.`,
      }).catch(() => {});

      return {
        deleted: false,
        skippedReason: "queued-as-orphan",
        storagePath: targetPath,
      };
    }

    // 4. Clean matching StoredFile metadata row
    if (storedRow) {
      await prisma.storedFile
        .delete({ where: { id: storedRow.id } })
        .catch(() => {});
    }

    await recordAuditLog({
      action: "DELETE_FILE",
      provider: "supabase",
      actorId: params.actorId ?? "admin",
      targetId: storedRow?.id ?? targetPath,
      targetPath,
      status: "SUCCESS",
      detail: `Tự động xóa tệp cũ trên Supabase Storage để tiết kiệm dung lượng (${params.reason ?? "đổi tệp"}).`,
    }).catch(() => {});

    return { deleted: true, storagePath: targetPath };
  } catch {
    return {
      deleted: false,
      skippedReason: "unexpected-error",
      storagePath: oldTarget.storagePath,
    };
  }
}
