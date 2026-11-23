import { isIP } from "node:net";

import { prisma } from "@/lib/db/prisma";
import { TooManyRequestsError } from "./errors";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_MEMORY_ENTRIES = 10_000;

interface MemoryRateLimitRecord {
  failedAttempts: number;
  firstFailedAt: number;
  lastFailedAt: number;
  lockedUntil: number | null;
}

// In-memory fallback for test and offline development environments
const memoryRateLimits = new Map<string, MemoryRateLimitRecord>();

function pruneMemoryRateLimits(now: number): void {
  for (const [k, rec] of memoryRateLimits) {
    const expiredWindow = now - rec.firstFailedAt > WINDOW_MS && (!rec.lockedUntil || rec.lockedUntil <= now);
    const expiredLock = Boolean(rec.lockedUntil && rec.lockedUntil <= now);
    if (expiredWindow || expiredLock) {
      memoryRateLimits.delete(k);
    }
  }
  while (memoryRateLimits.size >= MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryRateLimits.keys().next().value;
    if (oldestKey === undefined) break;
    memoryRateLimits.delete(oldestKey);
  }
}

/**
 * Extracts client IP ONLY from forwarding headers when running behind a
 * explicitly trusted proxy (TRUST_PROXY=true or VERCEL=1); otherwise falls back
 * to a fixed non-spoofable key so attackers cannot bypass IP lockouts by rotating
 * X-Forwarded-For / CF-Connecting-IP headers.
 */
export function getClientIp(request: Request): string {
  const trustProxy =
    process.env.TRUST_PROXY === "true" || process.env.VERCEL === "1";
  const trustCloudflare = process.env.TRUST_CLOUDFLARE === "true";

  if (trustProxy) {
    const headers = request.headers;
    if (trustCloudflare) {
      const cfIp = headers.get("cf-connecting-ip")?.trim();
      if (cfIp && isIP(cfIp)) return cfIp;
    }

    const realIp = headers.get("x-real-ip")?.trim();
    if (realIp && isIP(realIp)) return realIp;

    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded
        .split(",")
        .map((p) => p.trim())
        .filter((p) => isIP(p) !== 0);
      if (parts.length > 0) {
        return parts[parts.length - 1];
      }
    }
  }

  return "untrusted-proxy-client";
}

/**
 * Checks if the identifier (IP or composite identifier) is currently locked.
 * Throws TooManyRequestsError if locked.
 */
export async function assertNotRateLimited(
  identifier: string,
  options?: { maxAttempts?: number; customLockMessage?: string },
): Promise<void> {
  const now = Date.now();
  const isTest = process.env.NODE_ENV === "test";
  const maxAttempts = options?.maxAttempts ?? MAX_FAILED_ATTEMPTS;

  // 1. Try Prisma DB if available in non-test mode
  if (!isTest) {
    try {
      const record = await prisma.authRateLimit.findUnique({
        where: { identifier },
      });

      if (record) {
        if (record.lockedUntil && record.lockedUntil.getTime() > now) {
          const remainingMinutes = Math.ceil(
            (record.lockedUntil.getTime() - now) / 60000,
          );
          throw new TooManyRequestsError(
            options?.customLockMessage ??
              `Bạn đã thử sai quá ${maxAttempts} lần liên tiếp. Cổng tra cứu tạm thời bị khóa trong ${remainingMinutes} phút vì lý do an toàn.`,
          );
        }
        // Clear expired lock so old windows don't linger or bypass memory check
        if (record.lockedUntil && record.lockedUntil.getTime() <= now) {
          await prisma.authRateLimit.delete({ where: { identifier } }).catch(() => {});
        }
      }
    } catch (err) {
      if (err instanceof TooManyRequestsError) throw err;
    }
  }

  // 2. In-memory check
  const memRecord = memoryRateLimits.get(identifier);
  if (!memRecord) return;

  if (memRecord.lockedUntil && memRecord.lockedUntil > now) {
    const remainingMinutes = Math.ceil((memRecord.lockedUntil - now) / 60000);
    throw new TooManyRequestsError(
      options?.customLockMessage ??
        `Bạn đã thử sai quá ${maxAttempts} lần liên tiếp. Cổng tra cứu tạm thời bị khóa trong ${remainingMinutes} phút vì lý do an toàn.`,
    );
  }

  // If lock or window expired, clear it
  if (
    (memRecord.lockedUntil && memRecord.lockedUntil <= now) ||
    now - memRecord.firstFailedAt > WINDOW_MS
  ) {
    memoryRateLimits.delete(identifier);
  }
}

/**
 * Records a failed attempt for the given identifier.
 * Automatically locks when failed attempts reach the threshold.
 */
export async function registerFailedAttempt(
  identifier: string,
  options?: { maxAttempts?: number },
): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();
  const isTest = process.env.NODE_ENV === "test";
  const maxAttempts = options?.maxAttempts ?? MAX_FAILED_ATTEMPTS;

  // 1. Try Prisma DB in non-test mode
  if (!isTest) {
    try {
      const existing = await prisma.authRateLimit.findUnique({
        where: { identifier },
      });

      if (!existing || nowMs - existing.firstFailedAt.getTime() > WINDOW_MS) {
        await prisma.authRateLimit.upsert({
          where: { identifier },
          create: {
            identifier,
            failedAttempts: 1,
            firstFailedAt: now,
            lastFailedAt: now,
            lockedUntil: maxAttempts <= 1 ? new Date(nowMs + LOCKOUT_MS) : null,
          },
          update: {
            failedAttempts: 1,
            firstFailedAt: now,
            lastFailedAt: now,
            lockedUntil: maxAttempts <= 1 ? new Date(nowMs + LOCKOUT_MS) : null,
          },
        });
      } else {
        const nextCount = existing.failedAttempts + 1;
        const lockedUntil =
          nextCount >= maxAttempts ? new Date(nowMs + LOCKOUT_MS) : null;

        await prisma.authRateLimit.update({
          where: { identifier },
          data: {
            failedAttempts: nextCount,
            lastFailedAt: now,
            lockedUntil,
          },
        });
      }
    } catch {
      // Database unreachable or test fallback
    }
  }

  // 2. In-memory record with bounded pruning
  if (memoryRateLimits.size >= MAX_MEMORY_ENTRIES) {
    pruneMemoryRateLimits(nowMs);
  }
  const existingMem = memoryRateLimits.get(identifier);
  if (!existingMem || nowMs - existingMem.firstFailedAt > WINDOW_MS) {
    memoryRateLimits.set(identifier, {
      failedAttempts: 1,
      firstFailedAt: nowMs,
      lastFailedAt: nowMs,
      lockedUntil: maxAttempts <= 1 ? nowMs + LOCKOUT_MS : null,
    });
  } else {
    existingMem.failedAttempts += 1;
    existingMem.lastFailedAt = nowMs;
    if (existingMem.failedAttempts >= maxAttempts) {
      existingMem.lockedUntil = nowMs + LOCKOUT_MS;
    }
  }
}

/**
 * Resets the failed attempts counter upon successful verification.
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  const isTest = process.env.NODE_ENV === "test";
  // 1. Try Prisma DB
  if (!isTest) {
    try {
      await prisma.authRateLimit.delete({
        where: { identifier },
      });
    } catch {
      // Ignore if not in DB
    }
  }

  // 2. In-memory
  memoryRateLimits.delete(identifier);
}

/**
 * Helper to clear all rate limits (for automated testing).
 */
export function clearAllMemoryRateLimits(): void {
  memoryRateLimits.clear();
}
