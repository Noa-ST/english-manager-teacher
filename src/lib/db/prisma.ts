import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env";

/**
 * Prisma Client singleton.
 *
 * - One instance per process; reused across hot reloads in development so we
 *   don't exhaust PostgreSQL connections.
 * - Uses the `pg` driver adapter (Prisma 7 default runtime, no Rust engine).
 * - Framework-agnostic: safe to import from services, scripts and tests.
 *
 * ⚠️ Only `src/services/**` may import this module (ESLint-enforced).
 */

function createPrismaClient(): PrismaClient {
  const { DATABASE_URL, NODE_ENV, TEST_DATABASE_URL } = getServerEnv();
  const connectionString =
    NODE_ENV === "test" && TEST_DATABASE_URL ? TEST_DATABASE_URL : DATABASE_URL;
  const adapter = new PrismaPg({
    connectionString,
    max: process.env.VERCEL ? 6 : 10,
  });

  return new PrismaClient({
    adapter,
    log: NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.prisma) {
    await globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }
}

/**
 * Lazily-initialised client. Accessing any property creates the connection
 * pool on first use, so importing this module never requires env at build time.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

