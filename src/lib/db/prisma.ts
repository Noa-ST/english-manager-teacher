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
  const { DATABASE_URL, NODE_ENV } = getServerEnv();
  const adapter = new PrismaPg({ connectionString: DATABASE_URL });

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

