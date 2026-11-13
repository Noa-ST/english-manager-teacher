import { z } from "zod";

/**
 * Centralised, validated environment configuration.
 *
 * - Framework-agnostic (no `next/*` imports) so it can be used by services,
 *   scripts, seeders and tests alike.
 * - Parsed lazily and memoised: a missing variable fails loudly the first
 *   time the dependent subsystem is used, not at import time (keeps
 *   `next build` working for pages that never touch that subsystem).
 */

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Auth
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD_HASH: z.string().default(""),

  // Cloudinary Free (Server-only — Images)
  CLOUDINARY_CLOUD_NAME: z.string().trim().default(""),
  CLOUDINARY_API_KEY: z.string().trim().default(""),
  CLOUDINARY_API_SECRET: z.string().trim().default(""),

  // Supabase Free Storage (Server-only — Podcasts & PDFs)
  SUPABASE_URL: z.string().trim().default(""),
  SUPABASE_PUBLISHABLE_KEY: z.string().trim().default(""),
  SUPABASE_SECRET_KEY: z.string().trim().default(""),
  SUPABASE_PUBLIC_BUCKET: z.string().trim().min(1).default("english-manager-public"),
  SUPABASE_PRIVATE_BUCKET: z.string().trim().min(1).default("english-manager-private"),

  // Provider Routing
  STORAGE_PROVIDER_IMAGES: z
    .enum(["cloudinary", "supabase", "r2", "s3", "local"])
    .default("cloudinary"),
  STORAGE_PROVIDER_DOCUMENTS: z
    .enum(["supabase", "r2", "s3", "local", "cloudinary"])
    .default("supabase"),
  STORAGE_PROVIDER_AUDIO: z
    .enum(["supabase", "r2", "s3", "local", "cloudinary"])
    .default("supabase"),

  // Upload Limits & Signed URL TTL
  MAX_IMAGE_SIZE_MB: z.coerce.number().positive().max(25).default(5),
  MAX_AUDIO_SIZE_MB: z.coerce.number().positive().max(50).default(40),
  MAX_PDF_SIZE_MB: z.coerce.number().positive().max(50).default(40),
  PRIVATE_FILE_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

  // Quota Monitoring Thresholds (%)
  QUOTA_WARNING_PERCENT: z.coerce.number().min(10).max(99).default(70),
  QUOTA_CRITICAL_PERCENT: z.coerce.number().min(20).max(99).default(85),
  QUOTA_LOCK_PERCENT: z.coerce.number().min(50).max(100).default(95),
  SUPABASE_FREE_STORAGE_LIMIT_MB: z.coerce.number().positive().default(1024),
  CLOUDINARY_FREE_STORAGE_LIMIT_MB: z.coerce.number().positive().default(1024),

  // Storage (S3-compatible fallback: Cloudflare R2 / AWS S3)
  STORAGE_ENDPOINT: z.string().default(""),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_ACCESS_KEY_ID: z.string().default(""),
  STORAGE_SECRET_ACCESS_KEY: z.string().default(""),
  STORAGE_PUBLIC_BUCKET: z.string().min(1).default("english-manager-public"),
  STORAGE_PRIVATE_BUCKET: z.string().min(1).default("english-manager-private"),
  STORAGE_PUBLIC_URL: z.url().default("https://media.example.com"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function resetServerEnvCache(): void {
  cached = undefined;
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

