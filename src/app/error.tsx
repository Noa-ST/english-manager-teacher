"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[AppErrorBoundary]", error);
  }, [error]);

  return (
    <main className="flex min-h-[75vh] flex-col items-center justify-center bg-canvas px-4 py-16 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border-subtle bg-surface p-8 shadow-sm">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground">
          Đã xảy ra sự cố không mong muốn
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Hệ thống gặp lỗi tạm thời khi tải dữ liệu trang này. Bạn có thể thử tải lại hoặc quay về Trang chủ.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-deep-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
          >
            <RotateCcw className="h-4 w-4" />
            Thử lại
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/60"
          >
            <Home className="h-4 w-4" />
            Về Trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}
