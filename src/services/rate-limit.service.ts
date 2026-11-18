import { prisma } from "@/lib/db/prisma";
import { TooManyRequestsError } from "./errors";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface MemoryRateLimitRecord {
  failedAttempts: number;
  firstFailedAt: number;
  lastFailedAt: number;
  lockedUntil: number | null;
}

// In-memory fallback for test and offline development environments
const memoryRateLimits = new Map<string, MemoryRateLimitRecord>();

export function getClientIp(request: Request): string {
  const headers = request.headers;
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    if (parts.length > 0 && parts[0].trim()) {
      return parts[0].trim();
    }
  }

  return "127.0.0.1";
}

/**
 * Checks if the identifier (IP or composite identifier) is currently locked.
 * Throws TooManyRequestsError if locked.
 */
export async function assertNotRateLimited(identifier: string): Promise<void> {
  const now = Date.now();
  const isTest = process.env.NODE_ENV === "test";

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
            `Bạn đã thử sai quá ${MAX_FAILED_ATTEMPTS} lần liên tiếp. Cổng tra cứu tạm thời bị khóa trong ${remainingMinutes} phút vì lý do an toàn.`,
          );
        }
        return;
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
      `Bạn đã thử sai quá ${MAX_FAILED_ATTEMPTS} lần liên tiếp. Cổng tra cứu tạm thời bị khóa trong ${remainingMinutes} phút vì lý do an toàn.`,
    );
  }

  // If lock expired, clear it
  if (memRecord.lockedUntil && memRecord.lockedUntil <= now) {
    memoryRateLimits.delete(identifier);
  }
}

/**
 * Records a failed attempt for the given identifier.
 * Automatically locks when failed attempts reach the threshold.
 */
export async function registerFailedAttempt(identifier: string): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();
  const isTest = process.env.NODE_ENV === "test";

  // 1. Try Prisma DB in non-test mode
  if (!isTest) {
    try {
      const existing = await prisma.authRateLimit.findUnique({
        where: { identifier },
      });

      if (!existing || nowMs - existing.firstFailedAt.getTime() > WINDOW_MS) {
        // New window
        await prisma.authRateLimit.upsert({
          where: { identifier },
          create: {
            identifier,
            failedAttempts: 1,
            firstFailedAt: now,
            lastFailedAt: now,
            lockedUntil: null,
          },
          update: {
            failedAttempts: 1,
            firstFailedAt: now,
            lastFailedAt: now,
            lockedUntil: null,
          },
        });
      } else {
        const nextCount = existing.failedAttempts + 1;
        const lockedUntil =
          nextCount >= MAX_FAILED_ATTEMPTS ? new Date(nowMs + LOCKOUT_MS) : null;

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

  // 2. In-memory record
  const existingMem = memoryRateLimits.get(identifier);
  if (!existingMem || nowMs - existingMem.firstFailedAt > WINDOW_MS) {
    memoryRateLimits.set(identifier, {
      failedAttempts: 1,
      firstFailedAt: nowMs,
      lastFailedAt: nowMs,
      lockedUntil: null,
    });
  } else {
    existingMem.failedAttempts += 1;
    existingMem.lastFailedAt = nowMs;
    if (existingMem.failedAttempts >= MAX_FAILED_ATTEMPTS) {
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
