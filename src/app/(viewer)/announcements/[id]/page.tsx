"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Megaphone,
  Printer,
  Share2,
} from "lucide-react";
import type {
  AnnouncementAttachment,
  AnnouncementItem,
} from "@/services/classroom-data";
import type { AnnouncementNavItem } from "@/services/announcement-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, EmptyState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

interface AnnouncementDetailResponse {
  item: AnnouncementItem;
  related: AnnouncementItem[];
  prev: AnnouncementNavItem | null;
  next: AnnouncementNavItem | null;
  author: {
    name: string;
    title: string;
    avatarUrl?: string;
  };
}

interface FetchedDetailState extends Omit<AnnouncementDetailResponse, "item"> {
  id: string;
  item: AnnouncementItem | null;
}

function AnnouncementDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const { toast } = useToast();

  const [fetched, setFetched] = React.useState<FetchedDetailState | null>(null);
  const [downloadingAttId, setDownloadingAttId] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    let active = true;

    apiRequest<AnnouncementDetailResponse>(
      `/api/viewer/announcements/${encodeURIComponent(id)}`,
    )
      .then((res) => {
        if (!active) return;
        setFetched({
          id,
          item: res.item,
          related: res.related ?? [],
          prev: res.prev ?? null,
          next: res.next ?? null,
          author: res.author ?? {
            name: "",
            title: "",
            avatarUrl: "/images/teacher-avatar.jpg",
          },
        });
      })
      .catch(() => {
        if (!active) return;
        setFetched({
          id,
          item: null,
          related: [],
          prev: null,
          next: null,
          author: {
            name: "",
            title: "",
            avatarUrl: "/images/teacher-avatar.jpg",
          },
        });
      });

    return () => {
      active = false;
    };
  }, [id]);

  const isCurrentFetched = fetched?.id === id;

  if (!isCurrentFetched) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 sm:px-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const announcement = fetched.item;

  if (!announcement) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <EmptyState
          title="Không tìm thấy bản tin thông báo"
          description="Thông báo bạn đang tìm kiếm không tồn tại, đang ở chế độ nháp hoặc đã được lưu trữ."
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

  const authorName = fetched.author.name;
  const authorTitle = fetched.author.title;
  const relatedAnnouncements = fetched.related;
  const adjacent = { prev: fetched.prev, next: fetched.next };

  const handleDownload = async (att: AnnouncementAttachment) => {
    setDownloadingAttId(att.id);
    try {
      const res = await apiRequest<{
        attachmentId: string;
        downloadCount: number;
        url: string | null;
      }>(`/api/viewer/announcements/${encodeURIComponent(announcement.id)}`, {
        method: "POST",
        body: JSON.stringify({ attachmentId: att.id }),
      });

      setFetched((prev) => {
        if (!prev || prev.id !== id || !prev.item) return prev;
        return {
          ...prev,
          item: {
            ...prev.item,
            attachments: prev.item.attachments.map((item) =>
              item.id === att.id
                ? { ...item, downloadCount: res.downloadCount }
                : item,
            ),
          },
        };
      });

      const targetUrl = (res.url ?? att.url ?? "").trim();
      const isSafeDownloadUrl =
        Boolean(targetUrl) &&
        (targetUrl.startsWith("https://") ||
          targetUrl.startsWith("http://") ||
          (targetUrl.startsWith("/") &&
            !targetUrl.startsWith("//") &&
            !targetUrl.startsWith("/\\")));
      if (isSafeDownloadUrl) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
        toast({
          title: "Tải xuống tệp đính kèm",
          description: `${att.name} (${att.size}) — ${res.downloadCount} lượt tải.`,
          variant: "success",
        });
      } else {
        toast({
          title: "Bản tin mẫu chưa gắn liên kết tải trực tiếp",
          description: `Đã ghi nhận lượt quan tâm (${res.downloadCount}). Xem tài liệu đầy đủ tại Kho tài liệu.`,
          variant: "info",
        });
      }
    } catch (err) {
      toast({
        title: "Không thể tải tệp đính kèm",
        description:
          err instanceof Error
            ? err.message
            : "Đã xảy ra lỗi khi kết nối máy chủ.",
        variant: "error",
      });
    } finally {
      setDownloadingAttId(null);
    }
  };

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard?.writeText(window.location.href).catch(() => {});
    }
    toast({
      title: "Đã sao chép liên kết",
      description: "Liên kết thông báo đã được sao chép vào bộ nhớ tạm.",
      variant: "info",
    });
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
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
                <Link
                  key={cls}
                  href={{ pathname: "/announcements", query: { class: cls } }}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                >
                  {cls}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
              <Button variant="ghost" size="sm" onClick={handlePrint}>
                <Printer className="size-3.5" aria-hidden="true" />
                In / Lưu PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={handleShare}>
                <Share2 className="size-3.5" aria-hidden="true" />
                Chia sẻ
              </Button>
            </div>
          </div>

          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            {announcement.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5 text-primary" aria-hidden="true" />
              Ngày đăng: {announcement.publishedAt}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" aria-hidden="true" />
              {announcement.readTime}
            </span>
            <span>
              Người đăng: <strong className="text-foreground">{authorName}</strong>{" "}
              <span className="hidden sm:inline">({authorTitle})</span>
            </span>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Tài liệu &amp; Biểu mẫu đính kèm (
                {announcement.attachments.length})
              </h2>
              <Link
                href="/documents"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline print:hidden"
              >
                Mở Kho tài liệu
                <ExternalLink className="size-3" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {announcement.attachments.map((att) => {
                const isBusy = downloadingAttId === att.id;
                return (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warm text-primary">
                        <FileText className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {att.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {att.type.toUpperCase()} · {att.size} ·{" "}
                          {att.downloadCount} lượt tải
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={isBusy}
                      onClick={() => void handleDownload(att)}
                      className="print:hidden"
                    >
                      {isBusy ? (
                        <Loader2
                          className="size-3 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Download className="size-3" aria-hidden="true" />
                      )}
                      Tải về
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </article>

      {/* Previous / Next Navigation */}
      {(adjacent.prev || adjacent.next) && (
        <nav
          aria-label="Điều hướng bản tin trước và tiếp theo"
          className="grid gap-4 sm:grid-cols-2 print:hidden"
        >
          <div>
            {adjacent.prev && (
              <Link
                href={`/announcements/${adjacent.prev.id}` as const}
                className="group flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  Bản tin mới hơn
                </span>
                <p className="mt-1.5 line-clamp-2 font-heading text-sm font-bold text-foreground group-hover:text-primary">
                  {adjacent.prev.title}
                </p>
              </Link>
            )}
          </div>
          <div>
            {adjacent.next && (
              <Link
                href={`/announcements/${adjacent.next.id}` as const}
                className="group flex h-full flex-col items-end justify-between rounded-2xl border border-border bg-card p-4 text-right transition-colors hover:border-primary/40"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  Bản tin trước đó
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </span>
                <p className="mt-1.5 line-clamp-2 font-heading text-sm font-bold text-foreground group-hover:text-primary">
                  {adjacent.next.title}
                </p>
              </Link>
            )}
          </div>
        </nav>
      )}

      {/* Related Announcements */}
      {relatedAnnouncements.length > 0 && (
        <section className="space-y-4 print:hidden">
          <h2 className="font-heading text-lg font-bold text-foreground">
            Các thông báo liên quan
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {relatedAnnouncements.map((item) => (
              <Link
                key={item.id}
                href={`/announcements/${item.id}` as const}
                className="group rounded-2xl border border-border bg-card p-5 transition-all hover:border-accent/50"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <Badge variant="secondary">{item.categoryLabel}</Badge>
                  <span>{item.publishedAt}</span>
                </div>
                <h3 className="mt-2 font-heading text-base font-semibold text-foreground group-hover:text-primary">
                  {item.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {item.excerpt}
                </p>
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
