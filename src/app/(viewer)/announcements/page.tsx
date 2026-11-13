"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Clock,
  Download,
  FileText,
  Megaphone,
  Pin,
  Search,
} from "lucide-react";
import {
  ANNOUNCEMENTS_DATA,
  type AnnouncementCategory,
  type AnnouncementItem,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Breadcrumb } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const CATEGORY_FILTERS: { value: "all" | AnnouncementCategory; label: string }[] = [
  { value: "all", label: "Tất cả thông báo" },
  { value: "urgent", label: "Thông báo quan trọng" },
  { value: "event", label: "Sự kiện học thuật" },
  { value: "homework", label: "Bài tập tuần" },
  { value: "schedule", label: "Lịch học" },
  { value: "tuition", label: "Học phí & Học vụ" },
];

export default function AnnouncementsPage() {
  const { toast } = useToast();
  const [announcements, setAnnouncements] =
    React.useState<AnnouncementItem[]>(ANNOUNCEMENTS_DATA);
  const [selectedCategory, setSelectedCategory] = React.useState<
    "all" | AnnouncementCategory
  >("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    apiRequest<AnnouncementItem[]>("/api/viewer/announcements")
      .then(setAnnouncements)
      .catch(() => {});
  }, []);

  const urgentAnnouncement = React.useMemo(
    () => announcements.find((item) => item.isUrgent),
    [announcements],
  );

  const filteredAnnouncements = React.useMemo(() => {
    return announcements.filter((item) => {
      const matchesCategory =
        selectedCategory === "all" || item.category === selectedCategory;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.excerpt.toLowerCase().includes(query) ||
        item.targetClasses.some((cls) => cls.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [announcements, selectedCategory, searchQuery]);

  const handleDownloadAttachment = (fileName: string, size: string) => {
    toast({
      title: "Đang tải tệp đính kèm",
      description: `Tệp ${fileName} (${size}) đang được tải xuống.`,
      variant: "success",
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* Page Header */}
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Trang chủ", href: "/" },
            { label: "Bảng tin & Thông báo" },
          ]}
        />
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold tracking-wider text-accent uppercase">
              Editorial Academic Feed
            </p>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Bảng tin & Thông báo lớp học
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Cập nhật chính thức về lịch thi thử, bài tập trọng tâm hàng tuần, sự kiện chuyên đề
              và thông tin học vụ dành cho học sinh và phụ huynh.
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            Tổng cộng {ANNOUNCEMENTS_DATA.length} bản tin đã xuất bản
          </Badge>
        </div>
      </div>

      {/* Pinned / Urgent Hero Card */}
      {urgentAnnouncement && selectedCategory === "all" && !searchQuery && (
        <div className="rounded-2xl border border-highlight/60 bg-gradient-to-br from-warm/85 via-card to-card p-6 shadow-xs sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="highlight">
                <Megaphone className="size-3" aria-hidden="true" />
                Ưu tiên khẩn · {urgentAnnouncement.categoryLabel}
              </Badge>
              <Badge variant="outline" className="bg-card">
                <Pin className="size-3 text-primary" aria-hidden="true" />
                Ghim đầu trang
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3.5" aria-hidden="true" />
                {urgentAnnouncement.publishedAt}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden="true" />
                {urgentAnnouncement.readTime}
              </span>
            </div>
          </div>

          <h2 className="mt-4 font-heading text-xl font-bold text-foreground sm:text-2xl">
            <Link
              href={`/announcements/${urgentAnnouncement.id}`}
              className="hover:text-primary hover:underline"
            >
              {urgentAnnouncement.title}
            </Link>
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {urgentAnnouncement.excerpt}
          </p>

          {urgentAnnouncement.attachments.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2.5">
              {urgentAnnouncement.attachments.map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => handleDownloadAttachment(att.name, att.size)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-2xs transition-colors hover:border-primary/40 hover:bg-muted/60"
                >
                  <FileText className="size-3.5 text-primary" aria-hidden="true" />
                  <span>{att.name}</span>
                  <span className="text-muted-foreground">({att.size})</span>
                  <Download className="size-3.5 text-accent" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border/80 pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Áp dụng cho:</span>
              {urgentAnnouncement.targetClasses.map((cls) => (
                <Badge key={cls} variant="secondary">
                  {cls}
                </Badge>
              ))}
            </div>
            <Button
              size="sm"
              render={<Link href={`/announcements/${urgentAnnouncement.id}`} />}
              nativeButton={false}
            >
              Đọc toàn văn thông báo
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Lọc thông báo theo danh mục"
        >
          {CATEGORY_FILTERS.map((cat) => {
            const active = selectedCategory === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(cat.value)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tiêu đề, tên lớp..."
            aria-label="Tìm kiếm thông báo"
            className="pl-9"
          />
        </div>
      </div>

      {/* Announcements List */}
      {filteredAnnouncements.length === 0 ? (
        <EmptyState
          title="Không tìm thấy thông báo phù hợp"
          description="Thử thay đổi bộ lọc danh mục hoặc từ khóa tìm kiếm để xem các bản tin khác."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCategory("all");
                setSearchQuery("");
              }}
            >
              Xóa bộ lọc
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {filteredAnnouncements.map((item) => (
            <article
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 transition-all hover:border-accent/50 hover:shadow-xs"
            >
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
                    href={`/announcements/${item.id}`}
                    className="transition-colors hover:text-primary"
                  >
                    {item.title}
                  </Link>
                </h2>

                <p className="text-sm leading-relaxed text-muted-foreground">{item.excerpt}</p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {item.targetClasses.map((cls) => (
                    <Badge key={cls} variant="outline" className="text-[11px]">
                      {cls}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs text-muted-foreground">
                  {item.attachments.length > 0
                    ? `${item.attachments.length} tệp đính kèm`
                    : "Bản tin văn bản"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href={`/announcements/${item.id}`} />}
                  nativeButton={false}
                  className="text-primary"
                >
                  Xem chi tiết
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

