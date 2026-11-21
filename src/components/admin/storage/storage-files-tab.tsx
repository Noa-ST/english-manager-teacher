"use client";

import * as React from "react";
import {
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Lock,
  Presentation,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import type {
  ResourceFileItem,
  ResourceFolder,
  StoredFileRecord,
} from "@/services/classroom-data";
import { FILE_TYPE_LABELS } from "@/services/storage-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { Breadcrumb, EmptyState, PaginationBar } from "@/components/ui/feedback";
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

export function StorageFilesTab({
  folders,
  files,
  storedFiles,
  onRefresh,
  onReplaceStoredFile,
}: {
  folders: ResourceFolder[];
  files: ResourceFileItem[];
  storedFiles: StoredFileRecord[];
  onRefresh: () => void;
  onReplaceStoredFile: (target: StoredFileRecord) => void;
}) {
  const { toast } = useToast();

  // Filters & view state
  const [selectedFolderId, setSelectedFolderId] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [fileTypeFilter, setFileTypeFilter] = React.useState<
    "all" | ResourceFileItem["fileType"]
  >("all");
  const [visibilityFilter, setVisibilityFilter] = React.useState<
    "all" | "public" | "private"
  >("all");
  const [viewMode, setViewMode] = React.useState<"table" | "grid">("table");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  // File modals
  const [previewFile, setPreviewFile] =
    React.useState<ResourceFileItem | null>(null);
  const [editingFile, setEditingFile] =
    React.useState<ResourceFileItem | null>(null);
  const [deletingFile, setDeletingFile] =
    React.useState<ResourceFileItem | null>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);

  // Edit File Metadata Form
  const [editTitle, setEditTitle] = React.useState("");
  const [editFolderId, setEditFolderId] = React.useState("");
  const [editFileType, setEditFileType] =
    React.useState<ResourceFileItem["fileType"]>("PDF");
  const [editLevel, setEditLevel] = React.useState("");
  const [editPages, setEditPages] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editVisibility, setEditVisibility] =
    React.useState<ResourceFileItem["visibility"]>("public");

  // Folder CRUD modals
  const [folderModalOpen, setFolderModalOpen] = React.useState(false);
  const [editingFolder, setEditingFolder] =
    React.useState<ResourceFolder | null>(null);
  const [folderName, setFolderName] = React.useState("");
  const [folderDescription, setFolderDescription] = React.useState("");
  const [folderVisibility, setFolderVisibility] =
    React.useState<"public" | "private">("public");
  const [deletingFolder, setDeletingFolder] =
    React.useState<ResourceFolder | null>(null);

  const activeFolder = React.useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const filteredFiles = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return files.filter((file) => {
      if (selectedFolderId !== "all" && file.folderId !== selectedFolderId) {
        return false;
      }
      if (fileTypeFilter !== "all" && file.fileType !== fileTypeFilter) {
        return false;
      }
      if (visibilityFilter !== "all" && file.visibility !== visibilityFilter) {
        return false;
      }
      if (
        q &&
        !file.title.toLowerCase().includes(q) &&
        !file.description.toLowerCase().includes(q) &&
        !file.folderName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [files, selectedFolderId, fileTypeFilter, visibilityFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedFiles = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFiles.slice(start, start + pageSize);
  }, [filteredFiles, currentPage, pageSize]);

  const findMatchedStoredRecord = (
    file: ResourceFileItem,
  ): StoredFileRecord | undefined => {
    return storedFiles.find(
      (s) =>
        !s.deletedAt &&
        (s.id === file.id ||
          (file.objectKey && s.storagePath === file.objectKey)),
    );
  };

  const getFileIcon = (type: ResourceFileItem["fileType"]) => {
    switch (type) {
      case "PDF":
        return <FileText className="size-4 text-primary" aria-hidden="true" />;
      case "SLIDE":
        return (
          <Presentation className="size-4 text-primary" aria-hidden="true" />
        );
      case "AUDIO":
        return <FileAudio className="size-4 text-primary" aria-hidden="true" />;
      case "IMAGE":
        return <ImageIcon className="size-4 text-primary" aria-hidden="true" />;
      case "WORKSHEET":
        return (
          <FileSpreadsheet
            className="size-4 text-primary"
            aria-hidden="true"
          />
        );
    }
  };

  const openEditFileModal = (file: ResourceFileItem) => {
    setEditingFile(file);
    setEditTitle(file.title);
    setEditFolderId(file.folderId);
    setEditFileType(file.fileType);
    setEditLevel(file.level);
    setEditPages(file.pagesOrDuration);
    setEditDescription(file.description);
    setEditVisibility(file.visibility);
  };

  const handleSaveFileMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFile || !editTitle.trim()) return;
    try {
      await apiRequest<ResourceFileItem>("/api/admin/storage", {
        method: "PATCH",
        body: JSON.stringify({
          action: "updateFile",
          id: editingFile.id,
          payload: {
            title: editTitle.trim(),
            folderId: editFolderId,
            fileType: editFileType,
            level: editLevel.trim() || "IELTS 6.5+",
            pagesOrDuration: editPages.trim() || "18 trang",
            description: editDescription.trim(),
            visibility: editVisibility,
          },
        }),
      });
      toast({
        title: "Đã cập nhật metadata học liệu",
        description: editTitle.trim(),
        variant: "success",
      });
      setEditingFile(null);
      onRefresh();
    } catch (err) {
      toast({
        title: "Không thể cập nhật học liệu",
        description: err instanceof Error ? err.message : "Đã xảy ra lỗi.",
        variant: "error",
      });
    }
  };

  const handleToggleVisibility = async (file: ResourceFileItem) => {
    try {
      const updated = await apiRequest<ResourceFileItem>("/api/admin/storage", {
        method: "PATCH",
        body: JSON.stringify({ id: file.id }),
      });
      toast({
        title: "Đã cập nhật quyền truy cập",
        description: `Tệp "${updated.title}" đã chuyển sang chế độ ${
          updated.visibility === "public"
            ? "Công khai (Public Bucket)"
            : "Nội bộ (Private · 15m Signed URL)"
        }.`,
        variant: "info",
      });
      onRefresh();
    } catch (err) {
      toast({
        title: "Không thể đổi quyền truy cập",
        description: err instanceof Error ? err.message : "Đã xảy ra lỗi",
        variant: "error",
      });
    }
  };

  const handleDownloadFile = async (file: ResourceFileItem) => {
    if (file.visibility === "public" && file.publicUrl) {
      window.open(file.publicUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const key = file.storagePath ?? file.objectKey;
    if (!key) {
      toast({
        title: "Tệp mẫu chưa gắn đường dẫn lưu trữ",
        description: "Hãy tải tệp mới lên để trải nghiệm tải xuống qua Signed URL.",
        variant: "info",
      });
      return;
    }

    setIsDownloading(true);
    try {
      const { url, expiresInSeconds } = await apiRequest<{
        url: string;
        expiresInSeconds: number | null;
      }>("/api/admin/storage/download-url", {
        method: "POST",
        body: JSON.stringify({
          fileId: file.id,
          key,
          visibility: file.visibility,
          downloadName: file.originalName ?? file.title,
        }),
      });
      toast({
        title:
          file.visibility === "private"
            ? `Đã cấp Signed URL bảo mật (${Math.round((expiresInSeconds ?? 900) / 60)} phút)`
            : "Đang mở liên kết tệp công khai",
        description: file.title,
        variant: "success",
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Không thể tạo liên kết tải xuống",
        description:
          err instanceof Error ? err.message : "Vui lòng kiểm tra quyền truy cập.",
        variant: "error",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteFileConfirmed = async () => {
    if (!deletingFile) return;
    try {
      await apiRequest(
        `/api/admin/storage?id=${encodeURIComponent(deletingFile.id)}`,
        { method: "DELETE" },
      );
      toast({
        title: "Đã xóa tệp khỏi kho lưu trữ",
        description: deletingFile.title,
        variant: "info",
      });
      onRefresh();
    } catch (err) {
      toast({
        title: "Không thể xóa tệp",
        description:
          err instanceof Error
            ? err.message
            : "Tệp đang được tham chiếu hoặc xảy ra lỗi kết nối.",
        variant: "error",
      });
    } finally {
      setDeletingFile(null);
    }
  };

  const handleReplaceTrigger = (file: ResourceFileItem) => {
    const matched = findMatchedStoredRecord(file);
    if (!matched) {
      toast({
        title: "Chưa hỗ trợ thay thế trực tiếp tệp mẫu tĩnh",
        description:
          "Vui lòng tải mới hoặc chọn tệp có liên kết StoredFile trong kho.",
        variant: "info",
      });
      return;
    }
    onReplaceStoredFile(matched);
  };

  // --- Folder CRUD ---
  const openCreateFolder = () => {
    setEditingFolder(null);
    setFolderName("");
    setFolderDescription("Thư mục học liệu chuyên đề mới");
    setFolderVisibility("public");
    setFolderModalOpen(true);
  };

  const openEditFolder = (folder: ResourceFolder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDescription(folder.description);
    setFolderVisibility(folder.visibility);
    setFolderModalOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    try {
      if (editingFolder) {
        await apiRequest("/api/admin/storage", {
          method: "PATCH",
          body: JSON.stringify({
            action: "updateFolder",
            id: editingFolder.id,
            payload: {
              name: folderName.trim(),
              description: folderDescription.trim(),
              visibility: folderVisibility,
            },
          }),
        });
        toast({
          title: "Đã cập nhật thư mục",
          description: folderName.trim(),
          variant: "success",
        });
      } else {
        await apiRequest("/api/admin/storage", {
          method: "POST",
          body: JSON.stringify({
            action: "createFolder",
            payload: {
              name: folderName.trim(),
              description: folderDescription.trim(),
              visibility: folderVisibility,
            },
          }),
        });
        toast({
          title: "Đã tạo thư mục học liệu mới",
          description: folderName.trim(),
          variant: "success",
        });
      }
      setFolderModalOpen(false);
      onRefresh();
    } catch (err) {
      toast({
        title: "Không thể lưu thư mục",
        description: err instanceof Error ? err.message : "Đã xảy ra lỗi.",
        variant: "error",
      });
    }
  };

  const handleDeleteFolderConfirmed = async () => {
    if (!deletingFolder) return;
    try {
      await apiRequest(
        `/api/admin/storage?folderId=${encodeURIComponent(deletingFolder.id)}`,
        { method: "DELETE" },
      );
      if (selectedFolderId === deletingFolder.id) {
        setSelectedFolderId("all");
      }
      toast({
        title: "Đã xóa thư mục trống",
        description: deletingFolder.name,
        variant: "info",
      });
      onRefresh();
    } catch (err) {
      toast({
        title: "Không thể xóa thư mục",
        description:
          err instanceof Error
            ? err.message
            : "Thư mục vẫn còn tài liệu bên trong.",
        variant: "error",
      });
    } finally {
      setDeletingFolder(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Folder Tree Sidebar */}
      <aside className="space-y-2 lg:col-span-3">
        <div className="flex items-center justify-between px-2">
          <h2 className="font-heading text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Cây thư mục học liệu
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={openCreateFolder}
          >
            <FolderPlus className="size-3.5" aria-hidden="true" />
            Tạo mới
          </Button>
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedFolderId("all");
            setPage(1);
          }}
          className={cn(
            "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-colors",
            selectedFolderId === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-foreground hover:bg-muted",
          )}
        >
          <span className="inline-flex items-center gap-2">
            <FolderOpen className="size-4" aria-hidden="true" />
            Tất cả thư mục
          </span>
          <span className="font-mono text-[11px] opacity-80">
            {files.length}
          </span>
        </button>

        {folders.map((folder) => {
          const isSelected = selectedFolderId === folder.id;
          const count = files.filter((f) => f.folderId === folder.id).length;
          return (
            <div
              key={folder.id}
              className={cn(
                "group flex items-center justify-between gap-1 rounded-xl px-2.5 py-1.5 text-xs transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-card text-foreground hover:bg-muted",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedFolderId(folder.id);
                  setPage(1);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
              >
                {folder.visibility === "private" ? (
                  <Lock
                    className={cn(
                      "size-3.5 shrink-0",
                      isSelected ? "text-amber-300" : "text-amber-500",
                    )}
                    aria-hidden="true"
                  />
                ) : (
                  <Folder className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{folder.name}</span>
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <span className="px-1 font-mono text-[11px] opacity-75">
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => openEditFolder(folder)}
                  aria-label={`Sửa thư mục ${folder.name}`}
                  className={cn(
                    "rounded p-1 opacity-75 transition-opacity hover:opacity-100",
                    isSelected
                      ? "hover:bg-white/15"
                      : "hover:bg-muted-foreground/15",
                  )}
                >
                  <Edit3 className="size-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingFolder(folder)}
                  aria-label={`Xóa thư mục ${folder.name}`}
                  className={cn(
                    "rounded p-1 opacity-75 transition-opacity hover:opacity-100",
                    isSelected
                      ? "hover:bg-white/15"
                      : "text-destructive hover:bg-destructive/10",
                  )}
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </aside>

      {/* Main File Explorer */}
      <div className="space-y-4 lg:col-span-9">
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 xl:flex-row xl:items-center">
          <Breadcrumb
            items={[
              {
                label: "Supabase Storage",
                onClick: () => {
                  setSelectedFolderId("all");
                  setPage(1);
                },
              },
              {
                label: activeFolder
                  ? activeFolder.name
                  : "Tất cả Podcast & Tài liệu PDF",
              },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-44 flex-1 sm:flex-initial">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm tên tệp..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <select
              value={fileTypeFilter}
              onChange={(e) => {
                setFileTypeFilter(
                  e.target.value as "all" | ResourceFileItem["fileType"],
                );
                setPage(1);
              }}
              aria-label="Lọc theo định dạng tệp"
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
            >
              <option value="all">Mọi định dạng</option>
              {Object.entries(FILE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <select
              value={visibilityFilter}
              onChange={(e) => {
                setVisibilityFilter(
                  e.target.value as "all" | "public" | "private",
                );
                setPage(1);
              }}
              aria-label="Lọc theo quyền truy cập"
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
            >
              <option value="all">Mọi quyền (Public &amp; Private)</option>
              <option value="public">Public Bucket</option>
              <option value="private">Private Bucket</option>
            </select>

            <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="icon-xs"
                onClick={() => setViewMode("table")}
                aria-label="Chế độ bảng"
              >
                <List className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="icon-xs"
                onClick={() => setViewMode("grid")}
                aria-label="Chế độ lưới"
              >
                <LayoutGrid className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="size-6" aria-hidden="true" />}
            title="Không có tệp nào trong thư mục này"
            description="Hãy tải tệp mới lên hoặc điều chỉnh bộ lọc."
          />
        ) : viewMode === "table" ? (
          <div className="rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên học liệu / Podcast</TableHead>
                  <TableHead>Loại &amp; Dung lượng</TableHead>
                  <TableHead>Supabase Bucket &amp; Quyền</TableHead>
                  <TableHead>Lượt tải</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedFiles.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-warm">
                          {getFileIcon(file.fileType)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">
                            {file.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {file.folderName} · Cập nhật {file.updatedAt}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {FILE_TYPE_LABELS[file.fileType] || file.fileType} ·{" "}
                      {file.size}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(file)}
                        title="Nhấn để chuyển đổi Public / Private Bucket"
                        className="cursor-pointer"
                      >
                        {file.visibility === "public" ? (
                          <Badge variant="success">
                            <Globe className="size-3" aria-hidden="true" />
                            Public Bucket
                          </Badge>
                        ) : (
                          <Badge variant="warning">
                            <Lock className="size-3" aria-hidden="true" />
                            Private (15m Signed URL)
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-foreground">
                      {file.downloads}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setPreviewFile(file)}
                          aria-label={`Xem trước ${file.title}`}
                        >
                          <Eye className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleDownloadFile(file)}
                          aria-label={`Tải xuống ${file.title}`}
                        >
                          <Download
                            className="size-3.5 text-primary"
                            aria-hidden="true"
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEditFileModal(file)}
                          aria-label={`Sửa metadata ${file.title}`}
                        >
                          <Edit3 className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleReplaceTrigger(file)}
                          aria-label={`Thay thế tệp ${file.title}`}
                          title="Thay thế tệp an toàn"
                        >
                          <RefreshCw className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeletingFile(file)}
                          aria-label={`Xóa ${file.title}`}
                        >
                          <Trash2
                            className="size-3.5 text-destructive"
                            aria-hidden="true"
                          />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {paginatedFiles.map((file) => (
              <article
                key={file.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-warm">
                        {getFileIcon(file.fileType)}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {FILE_TYPE_LABELS[file.fileType] || file.fileType} ·{" "}
                        {file.size}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(file)}
                    >
                      <Badge
                        variant={
                          file.visibility === "public" ? "success" : "warning"
                        }
                      >
                        {file.visibility === "public" ? "Public" : "Private"}
                      </Badge>
                    </button>
                  </div>
                  <h3 className="mt-3 font-heading text-sm font-bold text-foreground">
                    {file.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {file.description}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                  <span className="text-muted-foreground">{file.folderName}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setPreviewFile(file)}
                    >
                      Chi tiết
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => openEditFileModal(file)}
                      aria-label={`Sửa ${file.title}`}
                    >
                      <Edit3 className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setDeletingFile(file)}
                      aria-label={`Xóa ${file.title}`}
                    >
                      <Trash2
                        className="size-3.5 text-destructive"
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {filteredFiles.length > 0 && (
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
            pageSizeOptions={[10, 20, 50]}
          />
        )}
      </div>

      {/* Preview File Modal */}
      <ModalDialog
        open={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.title ?? "Chi tiết tệp"}
        description={
          previewFile
            ? `${previewFile.folderName} · ${previewFile.size} · Quyền: ${previewFile.visibility.toUpperCase()}`
            : undefined
        }
        size="md"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            {previewFile && (
              <Button
                type="button"
                onClick={() => handleDownloadFile(previewFile)}
                disabled={isDownloading}
              >
                <Download className="size-4" aria-hidden="true" />
                {isDownloading
                  ? "Đang tạo Signed URL..."
                  : previewFile.visibility === "private"
                    ? "Tải xuống (15m Signed URL)"
                    : "Tải xuống tệp"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setPreviewFile(null)}>
              Đóng
            </Button>
          </div>
        }
      >
        {previewFile && (
          <div className="space-y-3 text-xs">
            <p className="text-muted-foreground">{previewFile.description}</p>
            <div className="rounded-xl border border-border bg-background p-3.5">
              <p className="font-semibold text-primary">
                Thông tin lưu trữ &amp; nội dung:
              </p>
              <ul className="mt-2 space-y-1.5">
                {previewFile.previewSummary.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Edit File Metadata Modal */}
      <ModalDialog
        open={Boolean(editingFile)}
        onClose={() => setEditingFile(null)}
        title="Chỉnh sửa metadata học liệu"
        description="Thay đổi thư mục, trình độ hoặc quyền truy cập Public/Private Bucket."
        size="md"
      >
        <form onSubmit={handleSaveFileMetadata} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="edit-res-title"
              className="block text-xs font-semibold text-foreground"
            >
              Tiêu đề học liệu
            </label>
            <Input
              id="edit-res-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-res-folder"
                className="block text-xs font-semibold text-foreground"
              >
                Thư mục
              </label>
              <select
                id="edit-res-folder"
                value={editFolderId}
                onChange={(e) => setEditFolderId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-res-vis"
                className="block text-xs font-semibold text-foreground"
              >
                Quyền truy cập
              </label>
              <select
                id="edit-res-vis"
                value={editVisibility}
                onChange={(e) =>
                  setEditVisibility(
                    e.target.value as ResourceFileItem["visibility"],
                  )
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="public">Công khai (Public Bucket)</option>
                <option value="private">Nội bộ (Private Signed URL)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-res-type"
                className="block text-xs font-semibold text-foreground"
              >
                Định dạng
              </label>
              <select
                id="edit-res-type"
                value={editFileType}
                onChange={(e) =>
                  setEditFileType(
                    e.target.value as ResourceFileItem["fileType"],
                  )
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="PDF">PDF</option>
                <option value="AUDIO">AUDIO</option>
                <option value="SLIDE">SLIDE</option>
                <option value="WORKSHEET">WORKSHEET</option>
                <option value="IMAGE">IMAGE</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-res-level"
                className="block text-xs font-semibold text-foreground"
              >
                Trình độ
              </label>
              <Input
                id="edit-res-level"
                value={editLevel}
                onChange={(e) => setEditLevel(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-res-pages"
                className="block text-xs font-semibold text-foreground"
              >
                Số trang / Thời lượng
              </label>
              <Input
                id="edit-res-pages"
                value={editPages}
                onChange={(e) => setEditPages(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="edit-res-desc"
              className="block text-xs font-semibold text-foreground"
            >
              Mô tả học liệu
            </label>
            <textarea
              id="edit-res-desc"
              rows={2}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingFile(null)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Folder Create / Edit Modal */}
      <ModalDialog
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        title={
          editingFolder
            ? `Chỉnh sửa thư mục "${editingFolder.name}"`
            : "Tạo thư mục học liệu mới"
        }
        description="Phân nhóm tài liệu khoa học và đồng bộ quyền truy cập."
        size="sm"
      >
        <form onSubmit={handleSaveFolder} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="fld-name"
              className="block text-xs font-semibold text-foreground"
            >
              Tên thư mục
            </label>
            <Input
              id="fld-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Ví dụ: 05. Speaking Part 2 & 3 Cue Cards"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="fld-vis"
              className="block text-xs font-semibold text-foreground"
            >
              Quyền thư mục
            </label>
            <select
              id="fld-vis"
              value={folderVisibility}
              onChange={(e) =>
                setFolderVisibility(e.target.value as "public" | "private")
              }
              className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
            >
              <option value="public">Công khai trên Cổng (/documents)</option>
              <option value="private">Thư mục nội bộ (Private)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="fld-desc"
              className="block text-xs font-semibold text-foreground"
            >
              Mô tả ngắn
            </label>
            <textarea
              id="fld-desc"
              rows={2}
              value={folderDescription}
              onChange={(e) => setFolderDescription(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFolderModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              {editingFolder ? "Lưu thư mục" : "Tạo thư mục"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Confirm Delete File */}
      <ConfirmDialog
        open={Boolean(deletingFile)}
        onClose={() => setDeletingFile(null)}
        onConfirm={handleDeleteFileConfirmed}
        title="Xác nhận xóa tệp khỏi Supabase Storage?"
        description={
          deletingFile
            ? `Tệp "${deletingFile.title}" sẽ bị xóa khỏi bucket lưu trữ và cập nhật metadata trong PostgreSQL.`
            : ""
        }
        confirmLabel="Xóa tệp"
        variant="destructive"
      />

      {/* Confirm Delete Folder */}
      <ConfirmDialog
        open={Boolean(deletingFolder)}
        onClose={() => setDeletingFolder(null)}
        onConfirm={handleDeleteFolderConfirmed}
        title="Xác nhận xóa thư mục?"
        description={
          deletingFolder
            ? `Thư mục "${deletingFolder.name}" sẽ bị xóa. Nếu còn tài liệu bên trong, hệ thống sẽ từ chối để bảo vệ dữ liệu.`
            : ""
        }
        confirmLabel="Xóa thư mục"
        variant="destructive"
      />
    </div>
  );
}
