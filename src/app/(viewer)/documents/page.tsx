"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Download,
  FolderOpen,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  computeDocumentsStats,
  countDocumentsByFileType,
  extractDocumentLevels,
  filterAndSortDocuments,
  isSafePublicDocumentUrl,
  type DocumentFileTypeFilter,
  type DocumentSortKey,
  type PublicResourceFile,
  type PublicResourceFolder,
  type ViewerDocumentsPayload,
} from "@/services/documents-helpers";
import { apiRequest } from "@/lib/api-client";
import { DocumentsFileViews } from "@/components/viewer/documents/documents-file-views";
import { DocumentsFolderGrid } from "@/components/viewer/documents/documents-folder-grid";
import { DocumentsPreviewModal } from "@/components/viewer/documents/documents-preview-modal";
import { DocumentsToolbar } from "@/components/viewer/documents/documents-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  EmptyState,
  PaginationBar,
  Skeleton,
} from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

const VALID_FILE_TYPES = new Set<string>([
  "all",
  "PDF",
  "WORKSHEET",
  "SLIDE",
  "AUDIO",
  "IMAGE",
]);

const VALID_SORTS = new Set<string>([
  "newest",
  "downloads_desc",
  "title_asc",
  "size_asc",
]);

function parseFileTypeParam(raw: string | null): DocumentFileTypeFilter {
  if (raw && VALID_FILE_TYPES.has(raw)) {
    return raw as DocumentFileTypeFilter;
  }
  return "all";
}

function parseSortParam(raw: string | null): DocumentSortKey {
  if (raw && VALID_SORTS.has(raw)) {
    return raw as DocumentSortKey;
  }
  return "newest";
}

function DocumentsSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-120 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

function DocumentsPageContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [folders, setFolders] = React.useState<PublicResourceFolder[]>([]);
  const [files, setFiles] = React.useState<PublicResourceFile[]>([]);
  const [currentTerm, setCurrentTerm] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const [selectedFolderId, setSelectedFolderId] = React.useState<string>(
    () => searchParams.get("folder") ?? "all",
  );
  const [selectedFileType, setSelectedFileType] =
    React.useState<DocumentFileTypeFilter>(() =>
      parseFileTypeParam(searchParams.get("type")),
    );
  const [selectedLevel, setSelectedLevel] = React.useState<string>(
    () => searchParams.get("level") ?? "all",
  );
  const [sortBy, setSortBy] = React.useState<DocumentSortKey>(() =>
    parseSortParam(searchParams.get("sort")),
  );
  const [viewMode, setViewMode] = React.useState<"grid" | "list">(() =>
    searchParams.get("view") === "list" ? "list" : "grid",
  );
  const [searchQuery, setSearchQuery] = React.useState<string>(
    () => searchParams.get("q") ?? "",
  );
  const [previewFileId, setPreviewFileId] = React.useState<string | null>(
    () => searchParams.get("doc"),
  );
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  React.useEffect(() => {
    let active = true;
    apiRequest<ViewerDocumentsPayload>("/api/viewer/documents")
      .then((res) => {
        if (!active) return;
        setFolders(Array.isArray(res?.folders) ? res.folders : []);
        setFiles(Array.isArray(res?.files) ? res.files : []);
        setCurrentTerm(res?.currentTerm ?? "");
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("Không thể tải Kho tài liệu học tập. Vui lòng thử lại.");
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
    folder: string;
    type: DocumentFileTypeFilter;
    level: string;
    sort: DocumentSortKey;
    view: "grid" | "list";
    q: string;
    doc: string | null;
  }) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (next.folder !== "all") params.set("folder", next.folder);
    if (next.type !== "all") params.set("type", next.type);
    if (next.level !== "all") params.set("level", next.level);
    if (next.sort !== "newest") params.set("sort", next.sort);
    if (next.view !== "grid") params.set("view", next.view);
    if (next.q.trim()) params.set("q", next.q.trim());
    if (next.doc) params.set("doc", next.doc);
    const qs = params.toString();
    const targetUrl = qs ? `/documents?${qs}` : "/documents";
    window.history.replaceState(null, "", targetUrl);
  };

  const stats = React.useMemo(
    () => computeDocumentsStats(folders, files),
    [folders, files],
  );
  const activeFolder = React.useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );
  const typeCounts = React.useMemo(
    () => countDocumentsByFileType(files, selectedFolderId),
    [files, selectedFolderId],
  );
  const availableLevels = React.useMemo(
    () => extractDocumentLevels(files),
    [files],
  );

  const filteredFiles = React.useMemo(
    () =>
      filterAndSortDocuments(files, {
        folderId: selectedFolderId,
        fileType: selectedFileType,
        level: selectedLevel,
        search: searchQuery,
        sortBy,
      }),
    [files, selectedFolderId, selectedFileType, selectedLevel, searchQuery, sortBy],
  );

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedFiles = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFiles.slice(start, start + pageSize);
  }, [filteredFiles, currentPage, pageSize]);

  const previewFile = React.useMemo(
    () => files.find((f) => f.id === previewFileId) ?? null,
    [files, previewFileId],
  );

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    setPage(1);
    syncUrlParams({
      folder: folderId,
      type: selectedFileType,
      level: selectedLevel,
      sort: sortBy,
      view: viewMode,
      q: searchQuery,
      doc: previewFileId,
    });
  };

  const handleSelectFileType = (type: DocumentFileTypeFilter) => {
    setSelectedFileType(type);
    setPage(1);
    syncUrlParams({
      folder: selectedFolderId,
      type,
      level: selectedLevel,
      sort: sortBy,
      view: viewMode,
      q: searchQuery,
      doc: previewFileId,
    });
  };

  const handleSelectLevel = (level: string) => {
    setSelectedLevel(level);
    setPage(1);
    syncUrlParams({
      folder: selectedFolderId,
      type: selectedFileType,
      level,
      sort: sortBy,
      view: viewMode,
      q: searchQuery,
      doc: previewFileId,
    });
  };

  const handleSortChange = (sort: DocumentSortKey) => {
    setSortBy(sort);
    setPage(1);
    syncUrlParams({
      folder: selectedFolderId,
      type: selectedFileType,
      level: selectedLevel,
      sort,
      view: viewMode,
      q: searchQuery,
      doc: previewFileId,
    });
  };

  const handleViewModeChange = (view: "grid" | "list") => {
    setViewMode(view);
    syncUrlParams({
      folder: selectedFolderId,
      type: selectedFileType,
      level: selectedLevel,
      sort: sortBy,
      view,
      q: searchQuery,
      doc: previewFileId,
    });
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPage(1);
    syncUrlParams({
      folder: selectedFolderId,
      type: selectedFileType,
      level: selectedLevel,
      sort: sortBy,
      view: viewMode,
      q,
      doc: previewFileId,
    });
  };

  const handleResetFilters = () => {
    setSelectedFolderId("all");
    setSelectedFileType("all");
    setSelectedLevel("all");
    setSortBy("newest");
    setSearchQuery("");
    setPage(1);
    syncUrlParams({
      folder: "all",
      type: "all",
      level: "all",
      sort: "newest",
      view: viewMode,
      q: "",
      doc: previewFileId,
    });
  };

  const handleOpenPreview = (file: PublicResourceFile) => {
    setPreviewFileId(file.id);
    syncUrlParams({
      folder: selectedFolderId,
      type: selectedFileType,
      level: selectedLevel,
      sort: sortBy,
      view: viewMode,
      q: searchQuery,
      doc: file.id,
    });
  };

  const handleClosePreview = () => {
    setPreviewFileId(null);
    syncUrlParams({
      folder: selectedFolderId,
      type: selectedFileType,
      level: selectedLevel,
      sort: sortBy,
      view: viewMode,
      q: searchQuery,
      doc: null,
    });
  };

  const handleDownload = async (file: PublicResourceFile) => {
    if (!isSafePublicDocumentUrl(file.publicUrl)) {
      handleOpenPreview(file);
      toast({
        title: "Học liệu chỉ có bản tóm tắt",
        description:
          "Tệp tải trực tiếp đang được giáo viên cập nhật. Bạn có thể xem trước mục lục chi tiết.",
        variant: "info",
      });
      return;
    }

    setDownloadingId(file.id);
    try {
      const res = await apiRequest<{
        id: string;
        title: string;
        downloads: number;
        publicUrl: string | null;
      }>("/api/viewer/documents", {
        method: "POST",
        body: JSON.stringify({ fileId: file.id }),
      });

      setFiles((prev) =>
        prev.map((item) =>
          item.id === file.id ? { ...item, downloads: res.downloads } : item,
        ),
      );

      const targetUrl = res.publicUrl ?? file.publicUrl;
      if (isSafePublicDocumentUrl(targetUrl)) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      }

      toast({
        title: "Đang tải xuống học liệu",
        description: `${file.title} (${file.size}) — ${res.downloads} lượt tải.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể tải tài liệu lúc này",
        description:
          err instanceof Error
            ? err.message
            : "Vui lòng thử lại sau ít phút.",
        variant: "error",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleShareFile = async (file: PublicResourceFile) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/documents?doc=${encodeURIComponent(file.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Đã sao chép liên kết học liệu",
        description: file.title,
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
    selectedFolderId !== "all" ||
    selectedFileType !== "all" ||
    selectedLevel !== "all" ||
    sortBy !== "newest" ||
    searchQuery.trim().length > 0;

  if (loading) {
    return <DocumentsSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* Header & Dynamic Breadcrumb */}
      <div className="space-y-4">
        <Breadcrumb
          items={
            activeFolder
              ? [
                  { label: "Trang chủ", href: "/" },
                  {
                    label: "Kho tài liệu",
                    onClick: () => handleSelectFolder("all"),
                  },
                  { label: activeFolder.name },
                ]
              : [
                  { label: "Trang chủ", href: "/" },
                  { label: "Kho tài liệu học tập" },
                ]
          }
        />

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase">
              <BookOpen className="size-4 text-[#B8861E]" aria-hidden="true" />
              <span>Cloud Learning Resource Hub</span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Kho tài liệu &amp; Học liệu số
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Hệ thống tài liệu học thuật, đề cương ôn tập, slide bài giảng và
              bộ đề luyện nghe được phân loại khoa học theo từng trình độ.
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            <span>
              {currentTerm || "Kho học liệu mở"} · {stats.totalFiles} học liệu
              công khai
            </span>
          </Badge>
        </div>

        {/* Summary Strip */}
        {!error && (folders.length > 0 || files.length > 0) && (
          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warm text-primary">
                <BookOpen className="size-5 text-[#B8861E]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Học liệu công khai
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.totalFiles} tài liệu
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({stats.downloadableCount} tệp tải trực tiếp)
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <FolderOpen className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Thư mục mở</p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.totalFolders} chuyên mục
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-highlight/25 text-primary">
                <Download className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Tổng lượt tải về
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.totalDownloads.toLocaleString("vi-VN")} lượt
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <EmptyState
          title="Không thể tải Kho tài liệu"
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
          <DocumentsFolderGrid
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
          />

          <DocumentsToolbar
            selectedFileType={selectedFileType}
            onSelectFileType={handleSelectFileType}
            typeCounts={typeCounts}
            levels={availableLevels}
            selectedLevel={selectedLevel}
            onSelectLevel={handleSelectLevel}
            sortBy={sortBy}
            onSortChange={handleSortChange}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={handleResetFilters}
          />

          {files.length === 0 ? (
            <EmptyState
              title="Chưa có học liệu công khai"
              description="Các tài liệu mở và đề cương ôn tập sẽ hiển thị tại đây ngay khi giáo viên xuất bản."
            />
          ) : filteredFiles.length === 0 ? (
            <EmptyState
              title="Không tìm thấy học liệu phù hợp"
              description="Thử chuyển sang thư mục khác, đặt lại trình độ hoặc xóa từ khóa tìm kiếm."
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                >
                  Khôi phục danh sách
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              <DocumentsFileViews
                files={paginatedFiles}
                viewMode={viewMode}
                selectedLevel={selectedLevel}
                downloadingId={downloadingId}
                highlightedId={previewFileId}
                onSelectLevel={handleSelectLevel}
                onPreview={handleOpenPreview}
                onDownload={handleDownload}
                onShare={handleShareFile}
              />

              <PaginationBar
                page={currentPage}
                totalPages={totalPages}
                totalItems={filteredFiles.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setPage(1);
                }}
                pageSizeOptions={[6, 9, 12, 24]}
              />
            </div>
          )}
        </>
      )}

      {/* Private Bucket Notice */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-warm/45 p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Lock className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold text-foreground">
              Tài liệu nội bộ &amp; Đáp án đề thi thử (Private Bucket)
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Đề thi thử định kỳ và nhận xét bài viết cá nhân được bảo mật bằng
              Presigned URL. Học sinh vui lòng đăng nhập Cổng tra cứu cá nhân để
              truy cập.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-card shrink-0"
          render={<Link href="/student" />}
          nativeButton={false}
        >
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          <span>Tra cứu học sinh</span>
        </Button>
      </div>

      <DocumentsPreviewModal
        file={previewFile}
        downloadingId={downloadingId}
        onDownload={handleDownload}
        onShare={handleShareFile}
        onClose={handleClosePreview}
      />
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <React.Suspense fallback={<DocumentsSkeleton />}>
      <DocumentsPageContent />
    </React.Suspense>
  );
}
