import type { ReactNode } from "react";
import { connection } from "next/server";

import { requireAdmin } from "@/lib/auth";

/**
 * Server-side admin gate. Reads the session (request-time), so it MUST be
 * rendered inside <Suspense> under Cache Components.
 *
 * Layout checks don't re-run on every client navigation — each admin data
 * read / Server Action / Route Handler must still call requireAdmin*().
 */
export async function AdminGuard({ children }: { children: ReactNode }) {
  await connection();
  await requireAdmin();
  return <>{children}</>;
}

