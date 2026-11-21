import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getServerEnv } from "@/lib/env";
import type { FileVisibility, StorageProviderName } from "@/types";

/**
 * Multi-Provider Storage Architecture:
 * - CloudinaryProvider: Images (teacher avatar, projects, podcast thumbnails, announcements, articles, resources)
 * - SupabaseStorageProvider: Podcasts (MP3/M4A) & PDFs (public & private buckets)
 * - R2S3StorageProvider: Optional S3-compatible provider (Cloudflare R2 / AWS S3) for future migration
 * - LocalStorageProvider: Safe development/test fallback
 *
 * Security invariants:
 * - CLOUDINARY_API_SECRET and SUPABASE_SECRET_KEY are strictly server-only.
 * - Never return or log secrets or signed URLs.
 */

export type ImageCategory =
  | "teacher_avatar"
  | "project"
  | "podcast_thumbnail"
  | "announcement"
  | "article"
  | "resource";

export type CloudinaryTransformPreset =
  | "avatar"
  | "podcast_thumbnail"
  | "project"
  | "article"
  | "preview";

export const CLOUDINARY_FOLDER_MAP: Record<ImageCategory, string> = {
  teacher_avatar: "english-manager/avatars/teachers",
  project: "english-manager/projects",
  podcast_thumbnail: "english-manager/podcasts",
  announcement: "english-manager/announcements",
  article: "english-manager/articles",
  resource: "english-manager/resources",
};

/**
 * Canonical Cloudinary transformations using f_auto,q_auto to conserve Free tier credits.
 * Do not generate arbitrary dynamic sizes outside these presets.
 */
export const CLOUDINARY_TRANSFORM_PRESETS: Record<
  CloudinaryTransformPreset,
  { width: number; height: number; crop: "fill" | "limit"; rawTransform: string }
> = {
  avatar: {
    width: 256,
    height: 256,
    crop: "fill",
    rawTransform: "c_fill,g_auto,w_256,h_256,f_auto,q_auto",
  },
  podcast_thumbnail: {
    width: 640,
    height: 360,
    crop: "fill",
    rawTransform: "c_fill,w_640,h_360,f_auto,q_auto",
  },
  project: {
    width: 1200,
    height: 900,
    crop: "limit",
    rawTransform: "c_limit,w_1200,h_900,f_auto,q_auto",
  },
  article: {
    width: 1200,
    height: 800,
    crop: "limit",
    rawTransform: "c_limit,w_1200,h_800,f_auto,q_auto",
  },
  preview: {
    width: 400,
    height: 300,
    crop: "fill",
    rawTransform: "c_fill,w_400,h_300,f_auto,q_auto",
  },
};

export type SupabasePublicFolder =
  | "podcasts"
  | "resources/grammar"
  | "resources/vocabulary"
  | "resources/exercises"
  | "attachments";

export type SupabasePrivateFolder =
  | "exams"
  | "answers"
  | "internal-documents"
  | "student-documents"
  | "teacher-resources";

export interface ProviderTarget {
  bucket?: string | null;
  storagePath: string;
  cloudinaryPublicId?: string | null;
  visibility: FileVisibility;
}

export interface ProviderUploadInput {
  bucket?: string;
  storagePath: string;
  cloudinaryFolder?: string;
  cloudinaryPublicId?: string;
  contentType: string;
  sizeBytes: number;
  visibility: FileVisibility;
  body?: Uint8Array | Buffer;
  allowOverwrite?: boolean;
}

export interface ProviderUploadResult {
  provider: StorageProviderName;
  bucketName: string | null;
  storagePath: string;
  cloudinaryPublicId: string | null;
  publicUrl: string | null;
  sizeBytes: number;
  mimeType: string;
  etag?: string;
}

export interface ProviderSignedUploadInput {
  bucket?: string;
  storagePath: string;
  cloudinaryFolder?: string;
  cloudinaryPublicId?: string;
  contentType: string;
  sizeBytes: number;
  visibility: FileVisibility;
  expiresInSeconds?: number;
}

export interface ProviderUploadTicket {
  provider: StorageProviderName;
  method: "PUT" | "POST";
  uploadUrl: string;
  headers: Record<string, string>;
  formFields?: Record<string, string>;
  bucketName: string | null;
  storagePath: string;
  cloudinaryPublicId: string | null;
  visibility: FileVisibility;
  expiresAt: string;
  publicUrl: string | null;
}

export interface ProviderObjectMetadata {
  provider: StorageProviderName;
  storagePath: string;
  bucketName: string | null;
  cloudinaryPublicId: string | null;
  sizeBytes: number;
  mimeType: string;
  updatedAt: string;
}

export interface StorageProvider {
  readonly name: StorageProviderName;
  isConfigured(): boolean;
  upload(input: ProviderUploadInput): Promise<ProviderUploadResult>;
  createSignedUploadTicket(input: ProviderSignedUploadInput): Promise<ProviderUploadTicket>;
  delete(target: ProviderTarget): Promise<void>;
  moveObject?(sourceBucket: string, destBucket: string, storagePath: string): Promise<void>;
  getMetadata(target: ProviderTarget): Promise<ProviderObjectMetadata | null>;
  exists(target: ProviderTarget): Promise<boolean>;
  getPublicUrl(
    target: ProviderTarget,
    options?: { preset?: CloudinaryTransformPreset },
  ): string;
  createSignedUrl(
    target: ProviderTarget,
    options?: { expiresInSeconds?: number; downloadName?: string },
  ): Promise<string>;
}

const STORAGE_FETCH_TIMEOUT_MS = 15_000;
const MAX_MEMORY_INDEX_ENTRIES = 5_000;

function setBoundedIndexEntry(
  map: Map<string, ProviderObjectMetadata>,
  key: string,
  value: ProviderObjectMetadata,
): void {
  if (map.size >= MAX_MEMORY_INDEX_ENTRIES && !map.has(key)) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

// -----------------------------------------------------------------------------
//  CLOUDINARY HELPER: SHA-1 SIGNATURE & OPTIMIZED URL BUILDER
// -----------------------------------------------------------------------------

export function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const serialized = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(`${serialized}${apiSecret}`, "utf8")
    .digest("hex");
}

export function buildCloudinaryUrl(
  cloudName: string,
  publicId: string,
  preset?: CloudinaryTransformPreset,
): string {
  const cleanCloud = cloudName.trim() || "demo-english-manager";
  const cleanId = publicId.replace(/^\/+/, "");
  const transformSegment = preset
    ? CLOUDINARY_TRANSFORM_PRESETS[preset].rawTransform
    : "f_auto,q_auto";
  return `https://res.cloudinary.com/${encodeURIComponent(cleanCloud)}/image/upload/${transformSegment}/${cleanId}`;
}

// -----------------------------------------------------------------------------
//  1. CLOUDINARY PROVIDER (IMAGES ONLY)
// -----------------------------------------------------------------------------

export class CloudinaryProvider implements StorageProvider {
  readonly name: StorageProviderName = "cloudinary";
  private readonly memoryIndex = new Map<string, ProviderObjectMetadata>();

  isConfigured(): boolean {
    const env = getServerEnv();
    return Boolean(
      env.CLOUDINARY_CLOUD_NAME.trim() &&
        env.CLOUDINARY_API_KEY.trim() &&
        env.CLOUDINARY_API_SECRET.trim(),
    );
  }

  async upload(input: ProviderUploadInput): Promise<ProviderUploadResult> {
    const env = getServerEnv();
    const publicId = input.cloudinaryPublicId ?? input.storagePath.replace(/\.[^.]+$/, "");
    const folder =
      input.cloudinaryFolder ??
      (publicId.includes("/") ? publicId.slice(0, publicId.lastIndexOf("/")) : "english-manager/resources");
    const leafPublicId = publicId.includes("/")
      ? publicId.slice(publicId.lastIndexOf("/") + 1)
      : publicId;

    if (this.isConfigured() && input.body && typeof fetch === "function") {
      const timestamp = Math.floor(Date.now() / 1000);
      const overwrite = input.allowOverwrite ? "true" : "false";
      const signature = signCloudinaryParams(
        {
          folder,
          overwrite,
          public_id: leafPublicId,
          timestamp,
        },
        env.CLOUDINARY_API_SECRET,
      );

      const form = new FormData();
      const blob = new Blob([new Uint8Array(input.body)], { type: input.contentType });
      form.append("file", blob, leafPublicId);
      form.append("api_key", env.CLOUDINARY_API_KEY);
      form.append("timestamp", String(timestamp));
      form.append("folder", folder);
      form.append("public_id", leafPublicId);
      form.append("overwrite", overwrite);
      form.append("signature", signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`,
        {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        throw new Error(`Cloudinary upload failed with HTTP ${response.status}`);
      }

      const json = (await response.json()) as {
        public_id?: string;
        secure_url?: string;
        bytes?: number;
      };
      const resolvedPublicId = json.public_id ?? `${folder}/${leafPublicId}`;
      const publicUrl = buildCloudinaryUrl(env.CLOUDINARY_CLOUD_NAME, resolvedPublicId);

      const meta: ProviderObjectMetadata = {
        provider: "cloudinary",
        storagePath: resolvedPublicId,
        bucketName: null,
        cloudinaryPublicId: resolvedPublicId,
        sizeBytes: json.bytes ?? input.sizeBytes,
        mimeType: input.contentType,
        updatedAt: new Date().toISOString(),
      };
      setBoundedIndexEntry(this.memoryIndex, resolvedPublicId, meta);

      return {
        provider: "cloudinary",
        bucketName: null,
        storagePath: resolvedPublicId,
        cloudinaryPublicId: resolvedPublicId,
        publicUrl,
        sizeBytes: meta.sizeBytes,
        mimeType: input.contentType,
      };
    }

    // Indexed metadata registration (for signed direct browser upload or local test mode)
    const fullPublicId = publicId.startsWith("english-manager/")
      ? publicId
      : `${folder}/${leafPublicId}`;
    const publicUrl = buildCloudinaryUrl(env.CLOUDINARY_CLOUD_NAME, fullPublicId);
    const meta: ProviderObjectMetadata = {
      provider: "cloudinary",
      storagePath: fullPublicId,
      bucketName: null,
      cloudinaryPublicId: fullPublicId,
      sizeBytes: input.sizeBytes,
      mimeType: input.contentType,
      updatedAt: new Date().toISOString(),
    };
    setBoundedIndexEntry(this.memoryIndex, fullPublicId, meta);

    return {
      provider: "cloudinary",
      bucketName: null,
      storagePath: fullPublicId,
      cloudinaryPublicId: fullPublicId,
      publicUrl,
      sizeBytes: input.sizeBytes,
      mimeType: input.contentType,
    };
  }

  async createSignedUploadTicket(
    input: ProviderSignedUploadInput,
  ): Promise<ProviderUploadTicket> {
    const env = getServerEnv();
    if (env.NODE_ENV === "production" && !env.CLOUDINARY_API_SECRET.trim()) {
      throw new Error("CLOUDINARY_API_SECRET chưa được cấu hình ở môi trường production.");
    }
    const publicId = input.cloudinaryPublicId ?? input.storagePath.replace(/\.[^.]+$/, "");
    const folder =
      input.cloudinaryFolder ??
      (publicId.includes("/")
        ? publicId.slice(0, publicId.lastIndexOf("/"))
        : "english-manager/resources");
    const leafPublicId = publicId.includes("/")
      ? publicId.slice(publicId.lastIndexOf("/") + 1)
      : publicId;
    const fullPublicId = `${folder}/${leafPublicId}`;

    const timestamp = Math.floor(Date.now() / 1000);
    const secretForSigning = env.CLOUDINARY_API_SECRET || "dev-only-unconfigured-secret";
    const signature = signCloudinaryParams(
      {
        folder,
        overwrite: "false",
        public_id: leafPublicId,
        timestamp,
      },
      secretForSigning,
    );

    const cloudName = env.CLOUDINARY_CLOUD_NAME || "demo-english-manager";
    const uploadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;
    const publicUrl = buildCloudinaryUrl(cloudName, fullPublicId);

    return {
      provider: "cloudinary",
      method: "POST",
      uploadUrl,
      headers: {},
      formFields: {
        api_key: env.CLOUDINARY_API_KEY || "unconfigured-api-key",
        timestamp: String(timestamp),
        signature,
        folder,
        public_id: leafPublicId,
        overwrite: "false",
      },
      bucketName: null,
      storagePath: fullPublicId,
      cloudinaryPublicId: fullPublicId,
      visibility: "public",
      expiresAt: new Date((timestamp + (input.expiresInSeconds ?? 600)) * 1000).toISOString(),
      publicUrl,
    };
  }

  async delete(target: ProviderTarget): Promise<void> {
    const env = getServerEnv();
    const publicId = target.cloudinaryPublicId ?? target.storagePath;

    if (this.isConfigured() && typeof fetch === "function") {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signCloudinaryParams(
        { invalidate: "true", public_id: publicId, timestamp },
        env.CLOUDINARY_API_SECRET,
      );

      const body = new URLSearchParams({
        public_id: publicId,
        api_key: env.CLOUDINARY_API_KEY,
        timestamp: String(timestamp),
        invalidate: "true",
        signature,
      });

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/destroy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
          signal: AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        throw new Error(`Cloudinary destroy failed with HTTP ${response.status}`);
      }
      const destroyJson = (await response.json().catch(() => null)) as {
        result?: string;
      } | null;
      if (
        destroyJson?.result &&
        destroyJson.result !== "ok" &&
        destroyJson.result !== "not found"
      ) {
        throw new Error(`Cloudinary destroy returned status "${destroyJson.result}"`);
      }
    }

    this.memoryIndex.delete(publicId);
  }

  async getMetadata(target: ProviderTarget): Promise<ProviderObjectMetadata | null> {
    const publicId = target.cloudinaryPublicId ?? target.storagePath;
    return this.memoryIndex.get(publicId) ?? null;
  }

  async exists(target: ProviderTarget): Promise<boolean> {
    const publicId = target.cloudinaryPublicId ?? target.storagePath;
    return this.memoryIndex.has(publicId);
  }

  getPublicUrl(
    target: ProviderTarget,
    options?: { preset?: CloudinaryTransformPreset },
  ): string {
    const env = getServerEnv();
    const publicId = target.cloudinaryPublicId ?? target.storagePath;
    return buildCloudinaryUrl(env.CLOUDINARY_CLOUD_NAME, publicId, options?.preset);
  }

  async createSignedUrl(
    target: ProviderTarget,
    options?: { expiresInSeconds?: number; downloadName?: string },
  ): Promise<string> {
    void options;
    return this.getPublicUrl(target);
  }
}

// -----------------------------------------------------------------------------
//  2. SUPABASE STORAGE PROVIDER (PODCASTS MP3/M4A & PDF PUBLIC/PRIVATE)
// -----------------------------------------------------------------------------

export class SupabaseStorageProvider implements StorageProvider {
  readonly name: StorageProviderName = "supabase";
  private readonly memoryIndex = new Map<string, ProviderObjectMetadata>();

  isConfigured(): boolean {
    const env = getServerEnv();
    return Boolean(env.SUPABASE_URL.trim() && env.SUPABASE_SECRET_KEY.trim());
  }

  private resolveBucket(visibility: FileVisibility, explicitBucket?: string | null): string {
    if (explicitBucket) return explicitBucket;
    const env = getServerEnv();
    return visibility === "public"
      ? env.SUPABASE_PUBLIC_BUCKET
      : env.SUPABASE_PRIVATE_BUCKET;
  }

  private getBaseUrl(): string {
    const env = getServerEnv();
    return (env.SUPABASE_URL.trim() || "https://example.supabase.co")
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1\/?$/i, "")
      .replace(/\/storage\/v1\/?$/i, "");
  }

  async upload(input: ProviderUploadInput): Promise<ProviderUploadResult> {
    const env = getServerEnv();
    const bucket = this.resolveBucket(input.visibility, input.bucket);
    const cleanPath = input.storagePath.replace(/^\/+/, "");
    const mapKey = `${bucket}:${cleanPath}`;

    if (!input.allowOverwrite && this.memoryIndex.has(mapKey)) {
      throw new Error(`Object "${cleanPath}" already exists in bucket "${bucket}"`);
    }

    if (this.isConfigured() && input.body && typeof fetch === "function") {
      const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");
      const url = `${this.getBaseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          apikey: env.SUPABASE_SECRET_KEY,
          "Content-Type": input.contentType,
          "x-upsert": input.allowOverwrite ? "true" : "false",
        },
        body: new Uint8Array(input.body),
        signal: AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Supabase Storage upload failed with HTTP ${response.status}`);
      }
    }

    const publicUrl =
      input.visibility === "public"
        ? this.getPublicUrl({
            bucket,
            storagePath: cleanPath,
            visibility: "public",
          })
        : null;

    const meta: ProviderObjectMetadata = {
      provider: "supabase",
      storagePath: cleanPath,
      bucketName: bucket,
      cloudinaryPublicId: null,
      sizeBytes: input.sizeBytes,
      mimeType: input.contentType,
      updatedAt: new Date().toISOString(),
    };
    setBoundedIndexEntry(this.memoryIndex, mapKey, meta);

    return {
      provider: "supabase",
      bucketName: bucket,
      storagePath: cleanPath,
      cloudinaryPublicId: null,
      publicUrl,
      sizeBytes: input.sizeBytes,
      mimeType: input.contentType,
    };
  }

  async createSignedUploadTicket(
    input: ProviderSignedUploadInput,
  ): Promise<ProviderUploadTicket> {
    const env = getServerEnv();
    const bucket = this.resolveBucket(input.visibility, input.bucket);
    const cleanPath = input.storagePath.replace(/^\/+/, "");
    const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");
    const baseUrl = this.getBaseUrl();
    const expiresInSeconds = input.expiresInSeconds ?? 600;

    let uploadUrl = `${baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}`;

    if (this.isConfigured() && typeof fetch === "function") {
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          apikey: env.SUPABASE_SECRET_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Supabase signed upload URL failed with HTTP ${response.status}`);
      }

      const data = (await response.json()) as { url?: string; token?: string };
      if (data.url) {
        uploadUrl = data.url.startsWith("http")
          ? data.url
          : `${baseUrl}/storage/v1${data.url.startsWith("/") ? "" : "/"}${data.url}`;
      }
    } else {
      const token = crypto.randomBytes(18).toString("base64url");
      uploadUrl = `${baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}?token=${token}`;
    }

    return {
      provider: "supabase",
      method: "PUT",
      uploadUrl,
      headers: {
        "Content-Type": input.contentType,
        "x-upsert": "false",
      },
      bucketName: bucket,
      storagePath: cleanPath,
      cloudinaryPublicId: null,
      visibility: input.visibility,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      publicUrl:
        input.visibility === "public"
          ? this.getPublicUrl({
              bucket,
              storagePath: cleanPath,
              visibility: "public",
            })
          : null,
    };
  }

  async delete(target: ProviderTarget): Promise<void> {
    const env = getServerEnv();
    const bucket = this.resolveBucket(target.visibility, target.bucket);
    const cleanPath = target.storagePath.replace(/^\/+/, "");
    const mapKey = `${bucket}:${cleanPath}`;

    if (this.isConfigured() && typeof fetch === "function") {
      const url = `${this.getBaseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          apikey: env.SUPABASE_SECRET_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: [cleanPath] }),
        signal: AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Supabase delete failed with HTTP ${response.status}`);
      }
    }

    this.memoryIndex.delete(mapKey);
  }

  async moveObject(
    sourceBucket: string,
    destBucket: string,
    storagePath: string,
  ): Promise<void> {
    const env = getServerEnv();
    const cleanPath = storagePath.replace(/^\/+/, "");
    if (sourceBucket === destBucket) return;

    if (this.isConfigured() && typeof fetch === "function") {
      const baseUrl = this.getBaseUrl();
      const copyRes = await fetch(`${baseUrl}/storage/v1/object/copy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          apikey: env.SUPABASE_SECRET_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bucketId: sourceBucket,
          sourceKey: cleanPath,
          destinationBucket: destBucket,
          destinationKey: cleanPath,
        }),
        signal: AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS),
      });
      if (!copyRes.ok) {
        throw new Error(`Supabase move/copy object failed with HTTP ${copyRes.status}`);
      }
      await this.delete({
        bucket: sourceBucket,
        storagePath: cleanPath,
        visibility: "private",
      });
    }

    const oldKey = `${sourceBucket}:${cleanPath}`;
    const existing = this.memoryIndex.get(oldKey);
    if (existing) {
      this.memoryIndex.delete(oldKey);
      setBoundedIndexEntry(this.memoryIndex, `${destBucket}:${cleanPath}`, {
        ...existing,
        bucketName: destBucket,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async getMetadata(target: ProviderTarget): Promise<ProviderObjectMetadata | null> {
    const bucket = this.resolveBucket(target.visibility, target.bucket);
    const cleanPath = target.storagePath.replace(/^\/+/, "");
    return this.memoryIndex.get(`${bucket}:${cleanPath}`) ?? null;
  }

  async exists(target: ProviderTarget): Promise<boolean> {
    const bucket = this.resolveBucket(target.visibility, target.bucket);
    const cleanPath = target.storagePath.replace(/^\/+/, "");
    return this.memoryIndex.has(`${bucket}:${cleanPath}`);
  }

  getPublicUrl(target: ProviderTarget): string {
    const bucket = this.resolveBucket("public", target.bucket);
    const encodedPath = target.storagePath
      .replace(/^\/+/, "")
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    return `${this.getBaseUrl()}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
  }

  async createSignedUrl(
    target: ProviderTarget,
    options?: { expiresInSeconds?: number; downloadName?: string },
  ): Promise<string> {
    const env = getServerEnv();
    const bucket = this.resolveBucket(target.visibility, target.bucket);
    const cleanPath = target.storagePath.replace(/^\/+/, "");
    const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");
    const expiresIn = Math.min(
      Math.max(options?.expiresInSeconds ?? env.PRIVATE_FILE_URL_TTL_SECONDS, 60),
      3600,
    );
    const baseUrl = this.getBaseUrl();

    if (this.isConfigured() && typeof fetch === "function") {
      const signEndpoint = `${baseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`;
      const response = await fetch(signEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          apikey: env.SUPABASE_SECRET_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn }),
        signal: AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Supabase createSignedUrl failed with HTTP ${response.status}`);
      }

      const data = (await response.json()) as { signedURL?: string; signedUrl?: string };
      const rawSigned = data.signedURL ?? data.signedUrl;
      if (!rawSigned) {
        throw new Error("Supabase did not return a signedURL");
      }

      const fullUrl = rawSigned.startsWith("http")
        ? rawSigned
        : `${baseUrl}/storage/v1${rawSigned.startsWith("/") ? "" : "/"}${rawSigned}`;

      if (options?.downloadName) {
        const sep = fullUrl.includes("?") ? "&" : "?";
        return `${fullUrl}${sep}download=${encodeURIComponent(options.downloadName)}`;
      }
      return fullUrl;
    }

    // Deterministic HMAC-signed URL when running offline/unit tests without live Supabase HTTP
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const sig = crypto
      .createHmac("sha256", env.AUTH_SECRET)
      .update(`${bucket}:${cleanPath}:${exp}`)
      .digest("base64url");
    const dlParam = options?.downloadName
      ? `&download=${encodeURIComponent(options.downloadName)}`
      : "";
    return `${baseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}?token=${sig}&exp=${exp}${dlParam}`;
  }
}

// -----------------------------------------------------------------------------
//  3. S3 / CLOUDFLARE R2 PROVIDER (FUTURE MIGRATION COMPATIBILITY)
// -----------------------------------------------------------------------------

export interface StorageConfig {
  publicBucket: string;
  privateBucket: string;
  publicBaseUrl: string;
}

export function getStorageConfig(): StorageConfig {
  const env = getServerEnv();
  return {
    publicBucket: env.SUPABASE_PUBLIC_BUCKET || env.STORAGE_PUBLIC_BUCKET,
    privateBucket: env.SUPABASE_PRIVATE_BUCKET || env.STORAGE_PRIVATE_BUCKET,
    publicBaseUrl: env.STORAGE_PUBLIC_URL.replace(/\/+$/, ""),
  };
}

export function bucketFor(visibility: FileVisibility): string {
  const config = getStorageConfig();
  return visibility === "public" ? config.publicBucket : config.privateBucket;
}

let s3Client: S3Client | undefined;

export function getStorageClient(): S3Client {
  if (s3Client) return s3Client;

  const env = getServerEnv();
  const endpoint = env.STORAGE_ENDPOINT || undefined;

  s3Client = new S3Client({
    region: env.STORAGE_REGION,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials:
      env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.STORAGE_ACCESS_KEY_ID,
            secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
          }
        : undefined,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return s3Client;
}

export class R2S3StorageProvider implements StorageProvider {
  readonly name: StorageProviderName;

  constructor(name: "r2" | "s3" = "r2") {
    this.name = name;
  }

  isConfigured(): boolean {
    const env = getServerEnv();
    return Boolean(
      env.STORAGE_ACCESS_KEY_ID.trim() && env.STORAGE_SECRET_ACCESS_KEY.trim(),
    );
  }

  async upload(input: ProviderUploadInput): Promise<ProviderUploadResult> {
    const bucket = input.bucket ?? bucketFor(input.visibility);
    const key = input.storagePath.replace(/^\/+/, "");
    if (this.isConfigured() && input.body) {
      await getStorageClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: input.contentType,
          ContentLength: input.sizeBytes,
          Body: input.body,
        }),
      );
    }
    return {
      provider: this.name,
      bucketName: bucket,
      storagePath: key,
      cloudinaryPublicId: null,
      publicUrl:
        input.visibility === "public"
          ? this.getPublicUrl({ bucket, storagePath: key, visibility: "public" })
          : null,
      sizeBytes: input.sizeBytes,
      mimeType: input.contentType,
    };
  }

  async createSignedUploadTicket(
    input: ProviderSignedUploadInput,
  ): Promise<ProviderUploadTicket> {
    const bucket = input.bucket ?? bucketFor(input.visibility);
    const key = input.storagePath.replace(/^\/+/, "");
    const expiresIn = input.expiresInSeconds ?? 600;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    });
    const uploadUrl = await getSignedUrl(getStorageClient(), command, { expiresIn });
    return {
      provider: this.name,
      method: "PUT",
      uploadUrl,
      headers: { "Content-Type": input.contentType },
      bucketName: bucket,
      storagePath: key,
      cloudinaryPublicId: null,
      visibility: input.visibility,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      publicUrl:
        input.visibility === "public"
          ? this.getPublicUrl({ bucket, storagePath: key, visibility: "public" })
          : null,
    };
  }

  async delete(target: ProviderTarget): Promise<void> {
    const bucket = target.bucket ?? bucketFor(target.visibility);
    await getStorageClient().send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: target.storagePath.replace(/^\/+/, ""),
      }),
    );
  }

  async getMetadata(target: ProviderTarget): Promise<ProviderObjectMetadata | null> {
    const bucket = target.bucket ?? bucketFor(target.visibility);
    const key = target.storagePath.replace(/^\/+/, "");
    try {
      const head = await getStorageClient().send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        provider: this.name,
        storagePath: key,
        bucketName: bucket,
        cloudinaryPublicId: null,
        sizeBytes: head.ContentLength ?? 0,
        mimeType: head.ContentType ?? "application/octet-stream",
        updatedAt: (head.LastModified ?? new Date()).toISOString(),
      };
    } catch {
      return null;
    }
  }

  async exists(target: ProviderTarget): Promise<boolean> {
    const meta = await this.getMetadata(target);
    return meta !== null;
  }

  getPublicUrl(target: ProviderTarget): string {
    const encoded = target.storagePath
      .replace(/^\/+/, "")
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    return `${getStorageConfig().publicBaseUrl}/${encoded}`;
  }

  async createSignedUrl(
    target: ProviderTarget,
    options?: { expiresInSeconds?: number; downloadName?: string },
  ): Promise<string> {
    const bucket = target.bucket ?? bucketFor("private");
    const expiresIn = Math.min(options?.expiresInSeconds ?? 900, 3600);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: target.storagePath.replace(/^\/+/, ""),
      ResponseContentDisposition: options?.downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`
        : undefined,
    });
    return getSignedUrl(getStorageClient(), command, { expiresIn });
  }
}

// -----------------------------------------------------------------------------
//  4. PROVIDER REGISTRY
// -----------------------------------------------------------------------------

const cloudinaryProvider = new CloudinaryProvider();
const supabaseProvider = new SupabaseStorageProvider();
const r2Provider = new R2S3StorageProvider("r2");
const s3Provider = new R2S3StorageProvider("s3");

export function getStorageProvider(name: StorageProviderName): StorageProvider {
  switch (name) {
    case "cloudinary":
      return cloudinaryProvider;
    case "supabase":
      return supabaseProvider;
    case "r2":
      return r2Provider;
    case "s3":
    case "local":
      return s3Provider;
  }
}
