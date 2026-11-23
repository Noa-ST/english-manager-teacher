import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-[75vh] flex-col items-center justify-center bg-canvas px-4 py-16 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border-subtle bg-surface p-8 shadow-sm">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-deep-navy text-amber-300 shadow-sm">
          <BookOpenCheck className="h-7 w-7" />
        </div>
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Lỗi 404
        </p>
        <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">
          Không tìm thấy trang này
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Đường dẫn bạn truy cập không tồn tại, đã được di chuyển hoặc tài liệu đã bị gỡ khỏi hệ thống.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-deep-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
          >
            <Home className="h-4 w-4" />
            Về Trang chủ
          </Link>
          <Link
            href="/support"
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/60"
          >
            <ArrowLeft className="h-4 w-4" />
            Trung tâm hỗ trợ
          </Link>
        </div>
      </div>
    </main>
  );
}
