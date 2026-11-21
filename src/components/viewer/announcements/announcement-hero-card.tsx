"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Clock,
  Download,
  FileText,
  Loader2,
  Megaphone,
  Pin,
} from "lucide-react";
import type {
  AnnouncementAttachment,
  AnnouncementItem,
} from "@/services/classroom-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AnnouncementHeroCard({
  item,
  downloadingAttId,
  onDownloadAttachment,
  onSelectClass,
}: {
  item: AnnouncementItem;
  downloadingAttId: string | null;
  onDownloadAttachment: (annId: string, att: AnnouncementAttachment) => void;
  onSelectClass: (className: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-highlight/60 bg-gradient-to-br from-warm/85 via-card to-card p-6 shadow-xs sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={item.isUrgent ? "highlight" : "secondary"}>
            <Megaphone className="size-3" aria-hidden="true" />
            {item.isUrgent ? `Ưu tiên khẩn · ${item.categoryLabel}` : item.categoryLabel}
          </Badge>
          {item.isPinned && (
            <Badge variant="outline" className="bg-card">
              <Pin className="size-3 text-primary" aria-hidden="true" />
              Ghim đầu trang
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3.5" aria-hidden="true" />
            {item.publishedAt}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            {item.readTime}
          </span>
        </div>
      </div>

      <h2 className="mt-4 font-heading text-xl font-bold text-foreground sm:text-2xl">
        <Link
          href={`/announcements/${item.id}` as const}
          className="hover:text-primary hover:underline"
        >
          {item.title}
        </Link>
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {item.excerpt}
      </p>

      {item.attachments.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2.5">
          {item.attachments.map((att) => {
            const isBusy = downloadingAttId === att.id;
            return (
              <button
                key={att.id}
                type="button"
                disabled={isBusy}
                onClick={() => onDownloadAttachment(item.id, att)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-2xs transition-colors hover:border-primary/40 hover:bg-muted/60 disabled:opacity-60"
              >
                <FileText className="size-3.5 text-primary" aria-hidden="true" />
                <span>{att.name}</span>
                <span className="text-muted-foreground">
                  ({att.size} · {att.downloadCount} lượt tải)
                </span>
                {isBusy ? (
                  <Loader2
                    className="size-3.5 animate-spin text-primary"
                    aria-hidden="true"
                  />
                ) : (
                  <Download className="size-3.5 text-primary" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border/80 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Áp dụng cho:</span>
          {item.targetClasses.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => onSelectClass(cls)}
              title={`Lọc thông báo lớp ${cls}`}
              className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {cls}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          render={<Link href={`/announcements/${item.id}` as const} />}
          nativeButton={false}
        >
          Đọc toàn văn thông báo
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
