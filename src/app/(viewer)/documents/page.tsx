"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  Download,
  Eye,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  LayoutGrid,
  List,
  Lock,
  Presentation,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  RESOURCE_FILES_DATA,
  RESOURCE_FOLDERS_DATA,
  type ResourceFileItem,
  type ResourceFolder,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Breadcrumb, EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const FILE_TYPE_FILTERS: {
  value: "all" | ResourceFileItem["fileType"];
  label: string;
}[] = [
  { value: "all", label: "Tất cả định dạng" },
  { value: "PDF", label: "PDF" },
  { value: "WORKSHEET", label: "Worksheet" },
  { value: "SLIDE", label: "Slide bài giảng" },
  { value: "AUDIO", label: "Audio Listening" },
];

export default function DocumentsPage() {
  const { toast } = useToast();
  const [folders, setFolders] = React.useState<ResourceFolder[]>(
    RESOURCE_FOLDERS_DATA,
  );
  const [files, setFiles] =
    React.useState<ResourceFileItem[]>(RESOURCE_FILES_DATA);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string>("all");
  const [selectedFileType, setSelectedFileType] = React.useState<
    "all" | ResourceFileItem["fileType"]
  >("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [previewFile, setPreviewFile] = React.useState<ResourceFileItem | null>(
    null,
  );

  React.useEffect(() => {
    apiRequest<{ folders: ResourceFolder[]; files: ResourceFileItem[] }>(
      "/api/viewer/documents",
    )
      .then((res) => {
        setFolders(res.folders);
        setFiles(res.files);
      })
      .catch(() => {});
  }, []);

  // Public folders vs internal notice
  const publicFolders = React.useMemo(
    () => folders.filter((f) => f.visibility === "public"),
    [folders],
  );

  const activeFolder = React.useMemo(
    () => publicFolders.find((f) => f.id === selectedFolderId) ?? null,
    [publicFolders, selectedFolderId],
  );

  const filteredFiles = React.useMemo(() => {
    return files.filter((file) => {
      // Only show public files in public viewer library
      if (file.visibility !== "public") return false;
      const matchesFolder =
        selectedFolderId === "all" || file.folderId === selectedFolderId;
      const matchesType =
        selectedFileType === "all" || file.fileType === selectedFileType;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        file.title.toLowerCase().includes(q) ||
        file.description.toLowerCase().includes(q) ||
        file.level.toLowerCase().includes(q);
      return matchesFolder && matchesType && matchesQuery;
    });
  }, [files, selectedFolderId, selectedFileType, searchQuery]);

  const getFileIcon = (type: ResourceFileItem["fileType"]) => {
    switch (type) {
      case "PDF":
        return <FileText className="size-4 text-primary" aria-hidden="true" />;
      case "SLIDE":
        return <Presentation className="size-4 text-accent" aria-hidden="true" />;
      case "AUDIO":
        return <FileAudio className="size-4 text-primary" aria-hidden="true" />;
      case "WORKSHEET":
      case "IMAGE":
        return (
          <FileSpreadsheet className="size-4 text-primary" aria-hidden="true" />
        );
    }
  };

  const handleDownload = (file: ResourceFileItem) => {
    if (file.visibility === "public" && file.publicUrl) {
      window.open(file.publicUrl, "_blank", "noopener,noreferrer");
    }
    toast({
      title: "Đang tải xuống tài liệu",
      description: `${file.title} (${file.size}) đang được tải về máy.`,
      variant: "success",
    });
  };

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
                    onClick: () => setSelectedFolderId("all"),
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
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
              <BookOpen className="size-4" aria-hidden="true" />
              <span>Cloud Learning Resource Hub</span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Kho tài liệu & Học liệu số
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Hệ thống tài liệu học thuật, đề cương ôn tập, slide bài giảng và bộ đề luyện nghe
              được phân loại khoa học theo từng trình độ.
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            {filteredFiles.length} học liệu công khai sẵn sàng tải về
          </Badge>
        </div>
      </div>

      {/* Folder Navigation Cards */}
      <section aria-label="Thư mục học liệu" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold text-foreground">
            Danh mục thư mục ({publicFolders.length})
          </h2>
          {selectedFolderId !== "all" && (
            <button
              type="button"
              onClick={() => setSelectedFolderId("all")}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Xem tất cả thư mục
            </button>
          )}
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {publicFolders.map((folder) => {
            const active = selectedFolderId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() =>
                  setSelectedFolderId(active ? "all" : folder.id)
                }
                className={cn(
                  "flex flex-col justify-between rounded-2xl border p-4 text-left transition-all",
                  active
                    ? "border-primary bg-warm/60 shadow-xs"
                    : "border-border bg-card hover:border-accent/50",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-warm text-primary",
                      )}
                    >
                      {active ? (
                        <FolderOpen className="size-4" aria-hidden="true" />
                      ) : (
                        <Folder className="size-4" aria-hidden="true" />
                      )}
                    </div>
                    <Badge variant={active ? "default" : "outline"}>
                      {folder.itemCount} tệp
                    </Badge>
                  </div>
                  <h3 className="mt-3 font-heading text-sm font-bold text-foreground">
                    {folder.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {folder.description}
                  </p>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Cập nhật: {folder.updatedAt}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Toolbar: Format Filter, Search, View Toggle */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Lọc theo định dạng tài liệu"
        >
          {FILE_TYPE_FILTERS.map((ft) => {
            const active = selectedFileType === ft.value;
            return (
              <button
                key={ft.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedFileType(ft.value)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {ft.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:w-64 sm:flex-initial">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên tài liệu, trình độ..."
              aria-label="Tìm kiếm tài liệu"
              className="pl-9"
            />
          </div>

          {/* Grid / List View Switcher */}
          <div
            className="inline-flex items-center rounded-xl border border-border bg-background p-1"
            role="group"
            aria-label="Chế độ hiển thị"
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Hiển thị dạng lưới"
              aria-pressed={viewMode === "grid"}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="Hiển thị dạng danh sách"
              aria-pressed={viewMode === "list"}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* File Content Area */}
      {filteredFiles.length === 0 ? (
        <EmptyState
          title="Không tìm thấy học liệu phù hợp"
          description="Thử chuyển sang thư mục khác hoặc xóa bộ lọc định dạng."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedFolderId("all");
                setSelectedFileType("all");
                setSearchQuery("");
              }}
            >
              Khôi phục danh sách
            </Button>
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-all hover:border-accent/50 hover:shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-warm">
                      {getFileIcon(file.fileType)}
                    </div>
                    <Badge variant="outline">{file.fileType}</Badge>
                  </div>
                  <Badge variant="secondary">{file.level}</Badge>
                </div>

                <h3 className="mt-3.5 font-heading text-base font-bold text-foreground">
                  {file.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {file.description}
                </p>
              </div>

              <div className="mt-5 space-y-3 border-t border-border pt-3.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {file.size} · {file.pagesOrDuration}
                  </span>
                  <span>{file.downloads} lượt tải</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setPreviewFile(file)}
                  >
                    <Eye className="size-3.5" aria-hidden="true" />
                    Xem trước
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleDownload(file)}
                  >
                    <Download className="size-3.5" aria-hidden="true" />
                    Tải xuống
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên học liệu</TableHead>
              <TableHead>Thư mục</TableHead>
              <TableHead>Trình độ</TableHead>
              <TableHead>Dung lượng</TableHead>
              <TableHead>Cập nhật</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.map((file) => (
              <TableRow key={file.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm">
                      {getFileIcon(file.fileType)}
                    </div>
                    <div>
                      <p className="font-heading text-sm font-semibold text-foreground">
                        {file.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {file.fileType} · {file.pagesOrDuration}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {file.folderName}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{file.level}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {file.size}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {file.updatedAt}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setPreviewFile(file)}
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      Xem trước
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleDownload(file)}
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                      Tải về
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Private Bucket Notice */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-warm/45 p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Lock className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold text-foreground">
              Tài liệu nội bộ & Đáp án đề thi thử (Private Bucket)
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Đề thi thử định kỳ và nhận xét bài viết cá nhân được bảo mật bằng Presigned URL. Học
              sinh vui lòng đăng nhập Cổng tra cứu cá nhân để truy cập.
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
          Tra cứu học sinh
        </Button>
      </div>

      {/* File Preview Modal */}
      <ModalDialog
        open={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.title ?? "Xem trước tài liệu"}
        description={
          previewFile
            ? `${previewFile.folderName} · ${previewFile.fileType} (${previewFile.size})`
            : undefined
        }
        size="md"
        footer={
          previewFile ? (
            <>
              <Button variant="outline" onClick={() => setPreviewFile(null)}>
                Đóng
              </Button>
              <Button
                onClick={() => {
                  handleDownload(previewFile);
                  setPreviewFile(null);
                }}
              >
                <Download className="size-4" aria-hidden="true" />
                Tải bản đầy đủ ({previewFile.size})
              </Button>
            </>
          ) : undefined
        }
      >
        {previewFile && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{previewFile.level}</Badge>
              <Badge variant="outline">{previewFile.pagesOrDuration}</Badge>
              <Badge variant="warm">{previewFile.downloads} lượt tải</Badge>
            </div>
            <p className="text-muted-foreground">{previewFile.description}</p>
            <div className="rounded-xl border border-border bg-background p-4">
              <h4 className="font-heading text-xs font-semibold tracking-wider text-primary uppercase">
                Mục lục & Nội dung tóm tắt
              </h4>
              <ul className="mt-2.5 space-y-2 text-xs text-foreground/90">
                {previewFile.previewSummary.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
