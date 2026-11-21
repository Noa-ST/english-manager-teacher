"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type {
  AnnouncementAttachment,
  AnnouncementCategory,
  AnnouncementItem,
} from "@/services/classroom-data";
import {
  countAnnouncementsByCategory,
  extractUniqueTargetClasses,
  filterAndSortAnnouncements,
  selectHeroAnnouncement,
} from "@/services/announcement-helpers";
import { apiRequest } from "@/lib/api-client";
import { AnnouncementCard } from "@/components/viewer/announcements/announcement-card";
import { AnnouncementHeroCard } from "@/components/viewer/announcements/announcement-hero-card";
import { AnnouncementToolbar } from "@/components/viewer/announcements/announcement-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  EmptyState,
  PaginationBar,
  Skeleton,
} from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

const VALID_CATEGORIES = new Set<string>([
  "all",
  "urgent",
  "event",
  "homework",
  "schedule",
  "tuition",
]);

function parseCategoryParam(raw: string | null): "all" | AnnouncementCategory {
  if (raw && VALID_CATEGORIES.has(raw)) {
    return raw as "all" | AnnouncementCategory;
  }
  return "all";
}

function AnnouncementsFeedContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [announcements, setAnnouncements] = React.useState<AnnouncementItem[]>([]);
  const [selectedCategory, setSelectedCategory] = React.useState<
    "all" | AnnouncementCategory
  >(() => parseCategoryParam(searchParams.get("category")));
  const [selectedClass, setSelectedClass] = React.useState<string>(
    () => searchParams.get("class") ?? "all",
  );
  const [onlyWithAttachments, setOnlyWithAttachments] = React.useState<boolean>(
    () => searchParams.get("attachments") === "1",
  );
  const [searchQuery, setSearchQuery] = React.useState<string>(
    () => searchParams.get("q") ?? "",
  );
  const [downloadingAttId, setDownloadingAttId] = React.useState<string | null>(
    null,
  );

  // Pagination state
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  React.useEffect(() => {
    let active = true;
    apiRequest<AnnouncementItem[]>("/api/viewer/announcements")
      .then((res) => {
        if (!active || !Array.isArray(res)) return;
        setAnnouncements(res.filter((item) => item.status === "published"));
      })
      .catch(() => {
        // Keep seed fallback cleanly
      });

    return () => {
      active = false;
    };
  }, []);

  const syncUrlParams = (next: {
    category: "all" | AnnouncementCategory;
    cls: string;
    attachments: boolean;
    q: string;
  }) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (next.category !== "all") params.set("category", next.category);
    if (next.cls !== "all") params.set("class", next.cls);
    if (next.attachments) params.set("attachments", "1");
    if (next.q.trim()) params.set("q", next.q.trim());
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `/announcements?${qs}` : "/announcements",
    );
  };

  const hasActiveFilters =
    selectedCategory !== "all" ||
    selectedClass !== "all" ||
    onlyWithAttachments ||
    searchQuery.trim().length > 0;

  const categoryCounts = React.useMemo(
    () => countAnnouncementsByCategory(announcements),
    [announcements],
  );
  const availableClasses = React.useMemo(
    () => extractUniqueTargetClasses(announcements),
    [announcements],
  );
  const heroAnnouncement = React.useMemo(
    () => selectHeroAnnouncement(announcements),
    [announcements],
  );

  const showHero = Boolean(!hasActiveFilters && heroAnnouncement);

  const filteredAnnouncements = React.useMemo(
    () =>
      filterAndSortAnnouncements(announcements, {
        category: selectedCategory,
        targetClass: selectedClass,
        search: searchQuery,
        onlyWithAttachments,
        excludeId: showHero ? heroAnnouncement?.id : undefined,
      }),
    [
      announcements,
      selectedCategory,
      selectedClass,
      searchQuery,
      onlyWithAttachments,
      showHero,
      heroAnnouncement?.id,
    ],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAnnouncements.length / pageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedAnnouncements = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAnnouncements.slice(start, start + pageSize);
  }, [filteredAnnouncements, currentPage, pageSize]);

  const handleSelectCategory = (cat: "all" | AnnouncementCategory) => {
    setSelectedCategory(cat);
    setPage(1);
    syncUrlParams({
      category: cat,
      cls: selectedClass,
      attachments: onlyWithAttachments,
      q: searchQuery,
    });
  };

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    setPage(1);
    syncUrlParams({
      category: selectedCategory,
      cls,
      attachments: onlyWithAttachments,
      q: searchQuery,
    });
  };

  const handleToggleAttachments = () => {
    const next = !onlyWithAttachments;
    setOnlyWithAttachments(next);
    setPage(1);
    syncUrlParams({
      category: selectedCategory,
      cls: selectedClass,
      attachments: next,
      q: searchQuery,
    });
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPage(1);
    syncUrlParams({
      category: selectedCategory,
      cls: selectedClass,
      attachments: onlyWithAttachments,
      q,
    });
  };

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSelectedClass("all");
    setOnlyWithAttachments(false);
    setSearchQuery("");
    setPage(1);
    syncUrlParams({
      category: "all",
      cls: "all",
      attachments: false,
      q: "",
    });
  };

  const handleDownloadAttachment = async (
    annId: string,
    att: AnnouncementAttachment,
  ) => {
    setDownloadingAttId(att.id);
    try {
      const res = await apiRequest<{
        announcementId: string;
        attachmentId: string;
        downloadCount: number;
        url: string | null;
      }>(`/api/viewer/announcements/${encodeURIComponent(annId)}`, {
        method: "POST",
        body: JSON.stringify({ attachmentId: att.id }),
      });

      setAnnouncements((prev) =>
        prev.map((ann) =>
          ann.id !== annId
            ? ann
            : {
                ...ann,
                attachments: ann.attachments.map((item) =>
                  item.id === att.id
                    ? { ...item, downloadCount: res.downloadCount }
                    : item,
                ),
              },
        ),
      );

      const targetUrl = res.url ?? att.url ?? null;
      if (
        targetUrl &&
        (targetUrl.startsWith("https://") ||
          targetUrl.startsWith("http://") ||
          targetUrl.startsWith("/"))
      ) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
        toast({
          title: "Đang tải tệp đính kèm",
          description: `${att.name} (${att.size}) — ${res.downloadCount} lượt tải.`,
          variant: "success",
        });
      } else {
        toast({
          title: "Bản tin mẫu chưa gắn tệp gốc",
          description: `Đã ghi nhận lượt quan tâm (${res.downloadCount}). Xem bản tài liệu công khai đầy đủ tại mục Tài liệu.`,
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
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">
              Editorial Academic Feed
            </p>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Bảng tin &amp; Thông báo lớp học
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Cập nhật chính thức về lịch thi thử, bài tập trọng tâm hàng tuần,
              sự kiện chuyên đề và thông tin học vụ dành cho học sinh và phụ
              huynh.
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            Tổng cộng {announcements.length} bản tin đã xuất bản
          </Badge>
        </div>
      </div>

      {/* Pinned / Urgent Hero Card (rendered only when no filter active, excluded from grid below) */}
      {showHero && heroAnnouncement && (
        <AnnouncementHeroCard
          item={heroAnnouncement}
          downloadingAttId={downloadingAttId}
          onDownloadAttachment={(annId, att) =>
            void handleDownloadAttachment(annId, att)
          }
          onSelectClass={handleSelectClass}
        />
      )}

      {/* Filter & Search Toolbar */}
      <AnnouncementToolbar
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        categoryCounts={categoryCounts}
        availableClasses={availableClasses}
        selectedClass={selectedClass}
        onSelectClass={handleSelectClass}
        onlyWithAttachments={onlyWithAttachments}
        onToggleAttachments={handleToggleAttachments}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
      />

      {/* Announcements List */}
      {filteredAnnouncements.length === 0 ? (
        <EmptyState
          title="Không tìm thấy thông báo phù hợp"
          description="Thử thay đổi bộ lọc danh mục, lớp áp dụng hoặc từ khóa tìm kiếm để xem các bản tin khác."
          action={
            <Button variant="outline" size="sm" onClick={handleResetFilters}>
              Xóa toàn bộ bộ lọc
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            {paginatedAnnouncements.map((item) => (
              <AnnouncementCard
                key={item.id}
                item={item}
                onSelectClass={handleSelectClass}
              />
            ))}
          </div>

          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            totalItems={filteredAnnouncements.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            pageSizeOptions={[4, 6, 10, 20]}
          />
        </div>
      )}
    </div>
  );
}

export default function AnnouncementsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
          <div className="grid gap-5 md:grid-cols-2">
            <Skeleton className="h-52 w-full rounded-2xl" />
            <Skeleton className="h-52 w-full rounded-2xl" />
          </div>
        </div>
      }
    >
      <AnnouncementsFeedContent />
    </React.Suspense>
  );
}
