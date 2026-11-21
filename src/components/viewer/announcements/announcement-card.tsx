"use client";

import Link from "next/link";
import { ArrowRight, Paperclip, Pin } from "lucide-react";
import type { AnnouncementItem } from "@/services/classroom-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AnnouncementCard({
  item,
  onSelectClass,
}: {
  item: AnnouncementItem;
  onSelectClass: (className: string) => void;
}) {
  const totalDownloads = item.attachments.reduce(
    (sum, att) => sum + (att.downloadCount ?? 0),
    0,
  );

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 transition-all hover:border-accent/50 hover:shadow-xs">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Badge variant={item.isUrgent ? "highlight" : "secondary"}>
              {item.categoryLabel}
            </Badge>
            {item.isPinned && (
              <span className="inline-flex items-center gap-1 font-medium text-primary">
                <Pin className="size-3" aria-hidden="true" />
                Đã ghim
              </span>
            )}
          </div>
          <span>
            {item.publishedAt} · {item.readTime}
          </span>
        </div>

        <h2 className="font-heading text-lg font-bold text-foreground">
          <Link
            href={`/announcements/${item.id}` as const}
            className="transition-colors hover:text-primary"
          >
            {item.title}
          </Link>
        </h2>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {item.excerpt}
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {item.targetClasses.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => onSelectClass(cls)}
              title={`Lọc thông báo lớp ${cls}`}
              className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
            >
              {cls}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.attachments.length > 0 ? (
            <>
              <Paperclip className="size-3.5 text-primary" aria-hidden="true" />
              <span>
                {item.attachments.length} tệp đính kèm ({totalDownloads} lượt
                tải)
              </span>
            </>
          ) : (
            "Bản tin văn bản"
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/announcements/${item.id}` as const} />}
          nativeButton={false}
          className="text-primary"
        >
          Xem chi tiết
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
