import { Suspense, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";
import { SiteFooter } from "@/components/viewer/site-footer";
import { SiteHeader } from "@/components/viewer/site-header";

/**
 * Viewer (public) portal shell.
 * Rendering: static shell + `use cache` data (SEO / fast loads — SRS §4).
 * Must never read cookies/headers at layout level.
 */
export default function ViewerLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Suspense
          fallback={
            <header className="sticky top-0 z-40 h-16 w-full border-b border-border bg-card/90" />
          }
        >
          <SiteHeader />
        </Suspense>
        <main className="w-full flex-1">{children}</main>
        <SiteFooter />
      </div>
    </ToastProvider>
  );
}
