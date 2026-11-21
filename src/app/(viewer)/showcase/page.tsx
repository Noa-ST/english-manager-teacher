"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  FolderGit2,
  Layers,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import {
  computeShowcaseStats,
  countProjectsByCategory,
  extractProjectClasses,
  filterAndSortProjects,
  getAdjacentProjects,
  type PublicStudentProject,
  type ShowcaseCategoryFilter,
  type ShowcaseMediaFilter,
  type ShowcaseSortKey,
  type ViewerShowcaseMentor,
  type ViewerShowcasePayload,
} from "@/services/showcase-helpers";
import { apiRequest } from "@/lib/api-client";
import { ShowcaseDetailModal } from "@/components/viewer/showcase/showcase-detail-modal";
import { ShowcaseProjectCard } from "@/components/viewer/showcase/showcase-project-card";
import { ShowcaseToolbar } from "@/components/viewer/showcase/showcase-toolbar";
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
  "Research Poster",
  "Debate Portfolio",
  "Video Presentation",
  "Academic Essay",
]);

const VALID_MEDIA = new Set<string>(["all", "video", "pdf"]);
const VALID_SORTS = new Set<string>(["newest", "oldest", "title_asc"]);

function parseCategoryParam(raw: string | null): ShowcaseCategoryFilter {
  if (raw && VALID_CATEGORIES.has(raw)) {
    return raw as ShowcaseCategoryFilter;
  }
  return "all";
}

function parseMediaParam(raw: string | null): ShowcaseMediaFilter {
  if (raw && VALID_MEDIA.has(raw)) {
    return raw as ShowcaseMediaFilter;
  }
  return "all";
}

function parseSortParam(raw: string | null): ShowcaseSortKey {
  if (raw && VALID_SORTS.has(raw)) {
    return raw as ShowcaseSortKey;
  }
  return "newest";
}

function ShowcaseSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-4 w-120 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}

function ShowcasePageContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [projects, setProjects] = React.useState<PublicStudentProject[]>([]);
  const [mentor, setMentor] = React.useState<ViewerShowcaseMentor>({
    name: "",
    title: "",
  });
  const [currentTerm, setCurrentTerm] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const [selectedCategory, setSelectedCategory] =
    React.useState<ShowcaseCategoryFilter>(() =>
      parseCategoryParam(searchParams.get("category")),
    );
  const [selectedClass, setSelectedClass] = React.useState<string>(
    () => searchParams.get("class") ?? "all",
  );
  const [selectedTag, setSelectedTag] = React.useState<string>(
    () => searchParams.get("tag") ?? "all",
  );
  const [mediaFilter, setMediaFilter] = React.useState<ShowcaseMediaFilter>(
    () => parseMediaParam(searchParams.get("media")),
  );
  const [sortBy, setSortBy] = React.useState<ShowcaseSortKey>(() =>
    parseSortParam(searchParams.get("sort")),
  );
  const [searchQuery, setSearchQuery] = React.useState<string>(
    () => searchParams.get("q") ?? "",
  );
  const [previewProjectId, setPreviewProjectId] = React.useState<string | null>(
    () => searchParams.get("project"),
  );

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(4);

  React.useEffect(() => {
    let active = true;
    apiRequest<ViewerShowcasePayload>("/api/viewer/showcase")
      .then((res) => {
        if (!active) return;
        setProjects(Array.isArray(res?.items) ? res.items : []);
        setMentor(res?.mentor ?? { name: "", title: "" });
        setCurrentTerm(res?.currentTerm ?? "");
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("Không thể tải Thư viện dự án học sinh. Vui lòng thử lại.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadNonce]);

  const syncUrlParams = (next: {
    category: ShowcaseCategoryFilter;
    cls: string;
    tag: string;
    media: ShowcaseMediaFilter;
    sort: ShowcaseSortKey;
    q: string;
    project: string | null;
  }) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (next.category !== "all") params.set("category", next.category);
    if (next.cls !== "all") params.set("class", next.cls);
    if (next.tag !== "all") params.set("tag", next.tag);
    if (next.media !== "all") params.set("media", next.media);
    if (next.sort !== "newest") params.set("sort", next.sort);
    if (next.q.trim()) params.set("q", next.q.trim());
    if (next.project) params.set("project", next.project);
    const qs = params.toString();
    const targetUrl = qs ? `/showcase?${qs}` : "/showcase";
    window.history.replaceState(null, "", targetUrl);
  };

  const stats = React.useMemo(
    () => computeShowcaseStats(projects),
    [projects],
  );
  const categoryCounts = React.useMemo(
    () => countProjectsByCategory(projects),
    [projects],
  );
  const availableClasses = React.useMemo(
    () => extractProjectClasses(projects),
    [projects],
  );

  const filteredProjects = React.useMemo(
    () =>
      filterAndSortProjects(projects, {
        category: selectedCategory,
        className: selectedClass,
        tag: selectedTag,
        media: mediaFilter,
        search: searchQuery,
        sortBy,
      }),
    [
      projects,
      selectedCategory,
      selectedClass,
      selectedTag,
      mediaFilter,
      searchQuery,
      sortBy,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedProjects = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, currentPage, pageSize]);

  const previewProject = React.useMemo(
    () => projects.find((item) => item.id === previewProjectId) ?? null,
    [projects, previewProjectId],
  );

  const modalNavigationList =
    filteredProjects.length > 0 ? filteredProjects : projects;
  const adjacentProjects = React.useMemo(
    () =>
      previewProject
        ? getAdjacentProjects(previewProject.id, modalNavigationList)
        : { prev: null, next: null },
    [previewProject, modalNavigationList],
  );

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const handleSelectCategory = (category: ShowcaseCategoryFilter) => {
    setSelectedCategory(category);
    setPage(1);
    syncUrlParams({
      category,
      cls: selectedClass,
      tag: selectedTag,
      media: mediaFilter,
      sort: sortBy,
      q: searchQuery,
      project: previewProjectId,
    });
  };

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    setPage(1);
    syncUrlParams({
      category: selectedCategory,
      cls,
      tag: selectedTag,
      media: mediaFilter,
      sort: sortBy,
      q: searchQuery,
      project: previewProjectId,
    });
  };

  const handleSelectTag = (tag: string, closeModal = false) => {
    const nextProjectId = closeModal ? null : previewProjectId;
    setSelectedTag(tag);
    if (closeModal) setPreviewProjectId(null);
    setPage(1);
    syncUrlParams({
      category: selectedCategory,
      cls: selectedClass,
      tag,
      media: mediaFilter,
      sort: sortBy,
      q: searchQuery,
      project: nextProjectId,
    });
  };

  const handleMediaFilterChange = (media: ShowcaseMediaFilter) => {
    setMediaFilter(media);
    setPage(1);
    syncUrlParams({
      category: selectedCategory,
      cls: selectedClass,
      tag: selectedTag,
      media,
      sort: sortBy,
      q: searchQuery,
      project: previewProjectId,
    });
  };

  const handleSortChange = (sort: ShowcaseSortKey) => {
    setSortBy(sort);
    setPage(1);
    syncUrlParams({
      category: selectedCategory,
      cls: selectedClass,
      tag: selectedTag,
      media: mediaFilter,
      sort,
      q: searchQuery,
      project: previewProjectId,
    });
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPage(1);
    syncUrlParams({
      category: selectedCategory,
      cls: selectedClass,
      tag: selectedTag,
      media: mediaFilter,
      sort: sortBy,
      q,
      project: previewProjectId,
    });
  };

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSelectedClass("all");
    setSelectedTag("all");
    setMediaFilter("all");
    setSortBy("newest");
    setSearchQuery("");
    setPage(1);
    syncUrlParams({
      category: "all",
      cls: "all",
      tag: "all",
      media: "all",
      sort: "newest",
      q: "",
      project: previewProjectId,
    });
  };

  const handleOpenProject = (project: PublicStudentProject) => {
    setPreviewProjectId(project.id);
    syncUrlParams({
      category: selectedCategory,
      cls: selectedClass,
      tag: selectedTag,
      media: mediaFilter,
      sort: sortBy,
      q: searchQuery,
      project: project.id,
    });
  };

  const handleCloseProject = () => {
    setPreviewProjectId(null);
    syncUrlParams({
      category: selectedCategory,
      cls: selectedClass,
      tag: selectedTag,
      media: mediaFilter,
      sort: sortBy,
      q: searchQuery,
      project: null,
    });
  };

  const handleShareProject = async (project: PublicStudentProject) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/showcase?project=${encodeURIComponent(project.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Đã sao chép liên kết dự án",
        description: project.title,
        variant: "success",
      });
    } catch {
      toast({
        title: "Không thể truy cập clipboard",
        description: "Vui lòng sao chép trực tiếp đường dẫn trên thanh địa chỉ.",
        variant: "error",
      });
    }
  };

  const hasActiveFilters =
    selectedCategory !== "all" ||
    selectedClass !== "all" ||
    selectedTag !== "all" ||
    mediaFilter !== "all" ||
    sortBy !== "newest" ||
    searchQuery.trim().length > 0;

  if (loading) {
    return <ShowcaseSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* Header */}
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Trang chủ", href: "/" },
            { label: "Thư viện dự án học sinh" },
          ]}
        />
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase">
              <FolderGit2 className="size-4 text-[#B8861E]" aria-hidden="true" />
              <span>Creative Academic Portfolio</span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Thư viện dự án &amp; Sản phẩm học sinh
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Không gian trưng bày các bài luận học thuật, poster nghiên cứu
              khoa học, hồ sơ tranh biện và bài thuyết trình xuất sắc do học
              sinh các khối lớp thực hiện.
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            <span>
              {currentTerm || "Cập nhật trực tiếp"}
              {stats.latestPublishedAt
                ? ` · Mới nhất: ${stats.latestPublishedAt}`
                : ""}
            </span>
          </Badge>
        </div>

        {/* Summary Strip */}
        {!error && projects.length > 0 && (
          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warm text-primary">
                <Layers className="size-5 text-[#B8861E]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dự án xuất bản</p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.totalProjects} sản phẩm
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Users className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Khối lớp tham gia
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.uniqueClasses} lớp học
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-highlight/25 text-primary">
                <FileText className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Học liệu đính kèm
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.videoCount} Video · {stats.pdfCount} PDF
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <EmptyState
          title="Không thể tải Thư viện dự án"
          description={error}
          action={
            <Button type="button" variant="outline" onClick={handleRetry}>
              <RefreshCw className="size-4" aria-hidden="true" />
              <span>Thử tải lại</span>
            </Button>
          }
        />
      ) : (
        <>
          <ShowcaseToolbar
            selectedCategory={selectedCategory}
            onSelectCategory={handleSelectCategory}
            categoryCounts={categoryCounts}
            classes={availableClasses}
            selectedClass={selectedClass}
            onSelectClass={handleSelectClass}
            selectedTag={selectedTag}
            onSelectTag={(t) => handleSelectTag(t, false)}
            mediaFilter={mediaFilter}
            onMediaFilterChange={handleMediaFilterChange}
            sortBy={sortBy}
            onSortChange={handleSortChange}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={handleResetFilters}
          />

          {projects.length === 0 ? (
            <EmptyState
              title="Chưa có dự án học sinh công khai"
              description="Các sản phẩm nghiên cứu, bài luận và video thuyết trình xuất sắc sẽ hiển thị tại đây ngay khi được duyệt xuất bản."
            />
          ) : filteredProjects.length === 0 ? (
            <EmptyState
              title="Không tìm thấy dự án học sinh phù hợp"
              description="Thử thay đổi bộ lọc thể loại, lớp học, chủ đề hashtag hoặc từ khóa tìm kiếm."
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                >
                  Đặt lại bộ lọc
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {paginatedProjects.map((project) => (
                  <ShowcaseProjectCard
                    key={project.id}
                    project={project}
                    selectedClass={selectedClass}
                    selectedTag={selectedTag}
                    onSelectClass={handleSelectClass}
                    onSelectTag={(t) => handleSelectTag(t, false)}
                    onPreview={handleOpenProject}
                    onShare={handleShareProject}
                    isHighlighted={previewProjectId === project.id}
                  />
                ))}
              </div>

              <PaginationBar
                page={currentPage}
                totalPages={totalPages}
                totalItems={filteredProjects.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setPage(1);
                }}
                pageSizeOptions={[2, 4, 8, 16]}
              />
            </div>
          )}
        </>
      )}

      <ShowcaseDetailModal
        project={previewProject}
        mentor={mentor}
        currentTerm={currentTerm}
        prevProject={adjacentProjects.prev}
        nextProject={adjacentProjects.next}
        onNavigate={handleOpenProject}
        onSelectTag={(t) => handleSelectTag(t, true)}
        onShare={handleShareProject}
        onClose={handleCloseProject}
      />
    </div>
  );
}

export default function ShowcasePage() {
  return (
    <React.Suspense fallback={<ShowcaseSkeleton />}>
      <ShowcasePageContent />
    </React.Suspense>
  );
}
