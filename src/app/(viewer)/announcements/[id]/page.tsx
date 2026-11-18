"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  FileText,
  Megaphone,
  Share2,
} from "lucide-react";
import {
  ANNOUNCEMENTS_DATA,
  type AnnouncementItem,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, EmptyState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

function AnnouncementDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const { toast } = useToast();

  const [announcement, setAnnouncement] = React.useState<
    AnnouncementItem | undefined
  >(() => ANNOUNCEMENTS_DATA.find((item) => item.id === id));
  const [relatedAnnouncements, setRelatedAnnouncements] = React.useState<
    AnnouncementItem[]
  >(() => ANNOUNCEMENTS_DATA.filter((item) => item.id !== id).slice(0, 2));

  React.useEffect(() => {
    apiRequest<{ item: AnnouncementItem; related: AnnouncementItem[] }>(
      `/api/viewer/announcements/${encodeURIComponent(id)}`,
    )
      .then((res) => {
        setAnnouncement(res.item);
        setRelatedAnnouncements(res.related);
      })
      .catch(() => {});
  }, [id]);

  if (!announcement) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <EmptyState
          title="Không tìm thấy bản tin thông báo"
          description="Thông báo bạn đang tìm kiếm không tồn tại hoặc đã được lưu trữ."
          action={
            <Button render={<Link href="/announcements" />} nativeButton={false}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Quay lại Bảng tin
            </Button>
          }
        />
      </div>
    );
  }

  const handleDownload = (fileName: string, size: string) => {
    toast({
      title: "Tải xuống tệp đính kèm",
      description: `${fileName} (${size}) đang được tải về máy.`,
      variant: "success",
    });
  };

  const handleShare = () => {
    toast({
      title: "Đã sao chép liên kết",
      description: "Liên kết thông báo đã được sao chép vào bộ nhớ tạm.",
      variant: "info",
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Breadcrumb
          items={[
            { label: "Trang chủ", href: "/" },
            { label: "Thông báo", href: "/announcements" },
            { label: announcement.categoryLabel },
          ]}
        />
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/announcements" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Danh sách thông báo
        </Button>
      </div>

      {/* Main Article Card */}
      <article className="rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-10">
        <header className="space-y-4 border-b border-border pb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={announcement.isUrgent ? "highlight" : "secondary"}>
                <Megaphone className="size-3" aria-hidden="true" />
                {announcement.categoryLabel}
              </Badge>
              {announcement.targetClasses.map((cls) => (
                <Badge key={cls} variant="outline">
                  {cls}
                </Badge>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={handleShare}>
              <Share2 className="size-3.5" aria-hidden="true" />
              Chia sẻ
            </Button>
          </div>

          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            {announcement.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5 text-accent" aria-hidden="true" />
              Ngày đăng: {announcement.publishedAt}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 text-accent" aria-hidden="true" />
              {announcement.readTime}
            </span>
            <span>Người đăng: ThS. Nguyễn Minh Anh</span>
          </div>
        </header>

        {/* Editorial Body */}
        <div className="mt-6 space-y-4 text-base leading-relaxed text-foreground/90">
          <p className="rounded-xl bg-warm/50 p-4 text-sm font-medium text-foreground">
            {announcement.excerpt}
          </p>
          {announcement.content.map((paragraph, index) => (
            <p key={index} className="leading-7">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Attachments Section */}
        {announcement.attachments.length > 0 && (
          <div className="mt-8 rounded-2xl border border-border bg-background p-5">
            <h2 className="font-heading text-sm font-semibold text-foreground">
              Tài liệu & Biểu mẫu đính kèm ({announcement.attachments.length})
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {announcement.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warm text-primary">
                      <FileText className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">{att.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {att.type.toUpperCase()} · {att.size} · {att.downloadCount} lượt tải
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleDownload(att.name, att.size)}
                  >
                    <Download className="size-3" aria-hidden="true" />
                    Tải về
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </article>

      {/* Related Announcements */}
      {relatedAnnouncements.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-heading text-lg font-bold text-foreground">Các thông báo khác</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {relatedAnnouncements.map((item) => (
              <Link
                key={item.id}
                href={`/announcements/${item.id}`}
                className="group rounded-2xl border border-border bg-card p-5 transition-all hover:border-accent/50"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <Badge variant="secondary">{item.categoryLabel}</Badge>
                  <span>{item.publishedAt}</span>
                </div>
                <h3 className="mt-2 font-heading text-base font-semibold text-foreground group-hover:text-primary">
                  {item.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function AnnouncementDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 sm:px-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      }
    >
      <AnnouncementDetailContent params={props.params} />
    </React.Suspense>
  );
}

