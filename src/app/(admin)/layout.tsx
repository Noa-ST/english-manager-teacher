import { Suspense, type ReactNode } from "react";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * Admin (protected) dashboard shell.
 * Rendering: request-time SSR/CSR (SRS §4).
 *
 * `<AdminGuard>` sits inside `<Suspense>` so the static shell renders without
 * blocking, while session enforcement stays strictly server-side before any
 * protected children stream.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen animate-pulse bg-background" />}>
      <AdminGuard>
        <AdminShell>{children}</AdminShell>
      </AdminGuard>
    </Suspense>
  );
}
