"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Download,
  Eye,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Lock,
  Presentation,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  RESOURCE_FILES_DATA,
  RESOURCE_FOLDERS_DATA,
  STORED_FILES_DATA,
  type OrphanedStorageObject,
  type ResourceFileItem,
  type ResourceFolder,
  type StorageAuditLogEntry,
  type StoredFileRecord,
} from "@/services/classroom-data";
import type {
  StorageHealthStatus,
  StorageQuotaReport,
} from "@/services/storage.service";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
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

type StorageAdminTab = "overview" | "images" | "files" | "config";

const IMAGE_CATEGORY_LABELS: Record<string, string> = {
  all: "Tất cả danh mục ảnh",
  student_avatar: "Ảnh đại diện học sinh (avatars/students)",
  teacher_avatar: "Ảnh đại diện giáo viên (avatars/teachers)",
  project: "Ảnh dự án học sinh (projects)",
  podcast_thumbnail: "Thumbnail podcast (podcasts)",
  announcement: "Ảnh thông báo (announcements)",
  article: "Ảnh bài viết (articles)",
  resource: "Ảnh minh họa tài nguyên (resources)",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function StorageManagerPage() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = React.useState<StorageAdminTab>("overview");
  const [folders, setFolders] = React.useState<ResourceFolder[]>(RESOURCE_FOLDERS_DATA);
  const [files, setFiles] = React.useState<ResourceFileItem[]>(RESOURCE_FILES_DATA);
  const [storedFiles, setStoredFiles] =
    React.useState<StoredFileRecord[]>(STORED_FILES_DATA);
  const [storageStatus, setStorageStatus] = React.useState<StorageHealthStatus | null>(
    null,
  );
  const [quota, setQuota] = React.useState<StorageQuotaReport | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<StorageAuditLogEntry[]>([]);
  const [orphanFiles, setOrphanFiles] = React.useState<OrphanedStorageObject[]>([]);

  // Filters
  const [selectedFolderId, setSelectedFolderId] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [visibilityFilter, setVisibilityFilter] = React.useState<
    "all" | "public" | "private"
  >("all");
  const [imageCategoryFilter, setImageCategoryFilter] = React.useState<string>("all");
  const [viewMode, setViewMode] = React.useState<"table" | "grid">("table");

  // Modals & Upload state
  const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);
  const [previewFile, setPreviewFile] = React.useState<ResourceFileItem | null>(null);
  const [previewStoredImage, setPreviewStoredImage] =
    React.useState<StoredFileRecord | null>(null);
  const [deletingFile, setDeletingFile] = React.useState<ResourceFileItem | null>(null);
  const [deletingStoredFile, setDeletingStoredFile] =
    React.useState<StoredFileRecord | null>(null);

  const [uploadTargetKind, setUploadTargetKind] = React.useState<
    "image" | "podcast" | "pdf"
  >("pdf");
  const [uploadTitle, setUploadTitle] = React.useState("");
  const [uploadFolderId, setUploadFolderId] = React.useState(
    RESOURCE_FOLDERS_DATA[0]?.id ?? "fld-writing",
  );
  const [uploadImageCategory, setUploadImageCategory] =
    React.useState<string>("project");
  const [uploadPdfCategory, setUploadPdfCategory] = React.useState<string>(
    "resources/exercises",
  );
  const [uploadVisibility, setUploadVisibility] =
    React.useState<ResourceFileItem["visibility"]>("public");
  const [uploadLevel, setUploadLevel] = React.useState("B2 – C1");
  const [uploadPages, setUploadPages] = React.useState("24 trang");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [imagePreviewDataUrl, setImagePreviewDataUrl] = React.useState<string | null>(
    null,
  );
  const [uploadProgress, setUploadProgress] = React.useState<number>(0);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);

  const refreshStorageData = React.useCallback(() => {
    apiRequest<{
      folders: ResourceFolder[];
      files: ResourceFileItem[];
      storedFiles: StoredFileRecord[];
      status: StorageHealthStatus;
      quota: StorageQuotaReport;
      auditLogs: StorageAuditLogEntry[];
      orphanFiles: OrphanedStorageObject[];
    }>("/api/admin/storage")
      .then((res) => {
        setFolders(res.folders);
        setFiles(res.files);
        setStoredFiles(res.storedFiles);
        setStorageStatus(res.status);
        setQuota(res.quota);
        setAuditLogs(res.auditLogs);
        setOrphanFiles(res.orphanFiles);
      })
      .catch(() => {
        // Keep local fallback data if offline
      });
  }, []);

  React.useEffect(() => {
    apiRequest<{
      folders: ResourceFolder[];
      files: ResourceFileItem[];
      storedFiles: StoredFileRecord[];
      status: StorageHealthStatus;
      quota: StorageQuotaReport;
      auditLogs: StorageAuditLogEntry[];
      orphanFiles: OrphanedStorageObject[];
    }>("/api/admin/storage")
      .then((res) => {
        setFolders(res.folders);
        setFiles(res.files);
        setStoredFiles(res.storedFiles);
        setStorageStatus(res.status);
        setQuota(res.quota);
        setAuditLogs(res.auditLogs);
        setOrphanFiles(res.orphanFiles);
      })
      .catch(() => {});
  }, []);

  const activeFolder = React.useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const cloudinaryImages = React.useMemo(() => {
    return storedFiles.filter((item) => {
      if (item.provider !== "cloudinary" || item.deletedAt) return false;
      const matchesCat =
        imageCategoryFilter === "all" || item.category === imageCategoryFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.originalName.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.cloudinaryPublicId ?? "").toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [storedFiles, imageCategoryFilter, searchQuery]);

  const filteredFiles = React.useMemo(() => {
    return files.filter((file) => {
      const matchesFolder =
        selectedFolderId === "all" || file.folderId === selectedFolderId;
      const matchesVis =
        visibilityFilter === "all" || file.visibility === visibilityFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        file.title.toLowerCase().includes(q) ||
        file.description.toLowerCase().includes(q) ||
        file.folderName.toLowerCase().includes(q);
      return matchesFolder && matchesVis && matchesQuery;
    });
  }, [files, selectedFolderId, visibilityFilter, searchQuery]);

  const handleToggleVisibility = async (id: string) => {
    const target = files.find((f) => f.id === id);
    if (!target) return;
    try {
      const updated = await apiRequest<ResourceFileItem>("/api/admin/storage", {
        method: "PATCH",
        body: JSON.stringify({ id }),
      });
      setFiles((prev) => prev.map((f) => (f.id === id ? updated : f)));
      toast({
        title: "Đã cập nhật quyền truy cập",
        description: `Tệp "${updated.title}" đã chuyển sang chế độ ${
          updated.visibility === "public"
            ? "Công khai (english-manager-public)"
            : "Nội bộ (english-manager-private · Signed URL 15 phút)"
        }.`,
        variant: "info",
      });
      void refreshStorageData();
    } catch (err) {
      toast({
        title: "Không thể đổi quyền truy cập",
        description: err instanceof Error ? err.message : "Đã xảy ra lỗi",
        variant: "error",
      });
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim() && !selectedFile) return;

    const fileName =
      selectedFile?.name ??
      (uploadTargetKind === "image"
        ? "academic-banner.webp"
        : uploadTargetKind === "podcast"
          ? "episode-audio.mp3"
          : "academic-material.pdf");
    const mimeType =
      selectedFile?.type ||
      (uploadTargetKind === "image"
        ? "image/webp"
        : uploadTargetKind === "podcast"
          ? "audio/mpeg"
          : "application/pdf");
    const sizeBytes = selectedFile?.size ?? 1548576;

    setIsUploading(true);
    setUploadProgress(20);

    try {
      // Request signed upload ticket from server (validates MIME, extension, size & quota)
      const ticket = await apiRequest<{
        key: string;
        provider: "cloudinary" | "supabase" | "r2" | "s3" | "local";
        method: "POST" | "PUT";
        uploadUrl: string;
        headers: Record<string, string>;
        formFields?: Record<string, string>;
        bucketName: string | null;
        storagePath: string;
        cloudinaryPublicId: string | null;
        publicUrl: string | null;
      }>("/api/admin/storage/upload-url", {
        method: "POST",
        body: JSON.stringify({
          folder:
            uploadTargetKind === "image"
              ? "resources"
              : uploadTargetKind === "podcast"
                ? "podcasts"
                : "documents",
          fileName,
          contentType: mimeType,
          size: sizeBytes,
          visibility: uploadTargetKind === "image" ? "public" : uploadVisibility,
          imageCategory:
            uploadTargetKind === "image" ? uploadImageCategory : undefined,
        }),
      });

      setUploadProgress(55);

      // Perform direct browser upload if cloud provider is live-configured
      if (
        selectedFile &&
        ((ticket.provider === "cloudinary" && storageStatus?.cloudinaryConfigured) ||
          (ticket.provider === "supabase" && storageStatus?.supabaseConfigured))
      ) {
        if (ticket.method === "POST" && ticket.formFields) {
          const form = new FormData();
          Object.entries(ticket.formFields).forEach(([k, v]) => form.append(k, v));
          form.append("file", selectedFile);
          const res = await fetch(ticket.uploadUrl, { method: "POST", body: form });
          if (!res.ok) {
            throw new Error(`Tải ảnh lên Cloudinary thất bại (HTTP ${res.status})`);
          }
        } else {
          const res = await fetch(ticket.uploadUrl, {
            method: "PUT",
            headers: ticket.headers,
            body: selectedFile,
          });
          if (!res.ok) {
            throw new Error(
              `Tải tệp lên Supabase Storage thất bại (HTTP ${res.status})`,
            );
          }
        }
      }

      setUploadProgress(85);

      if (uploadTargetKind === "image") {
        await apiRequest<StoredFileRecord>("/api/admin/storage", {
          method: "POST",
          body: JSON.stringify({
            action: "uploadImage",
            fileName,
            mimeType,
            sizeBytes,
            category: uploadImageCategory,
          }),
        });
      } else {
        const created = await apiRequest<ResourceFileItem>("/api/admin/storage", {
          method: "POST",
          body: JSON.stringify({
            title: uploadTitle.trim() || fileName,
            folderId: uploadFolderId,
            fileType: uploadTargetKind === "podcast" ? "AUDIO" : "PDF",
            visibility: uploadVisibility,
            level: uploadLevel,
            pagesOrDuration: uploadPages,
            size: formatBytes(sizeBytes),
            sizeBytes,
            objectKey: ticket.storagePath,
            publicUrl: ticket.publicUrl,
            provider: ticket.provider,
            mimeType,
            bucketName: ticket.bucketName,
            category:
              uploadTargetKind === "podcast" ? "podcasts" : uploadPdfCategory,
            originalName: fileName,
          }),
        });
        setFiles((prev) => [created, ...prev]);
      }

      setUploadProgress(100);
      await refreshStorageData();

      setUploadTitle("");
      setSelectedFile(null);
      setIsUploadModalOpen(false);
      toast({
        title:
          uploadTargetKind === "image"
            ? "Đã tải ảnh lên Cloudinary Free"
            : "Đã tải tệp lên Supabase Storage Free",
        description: `Tệp "${uploadTitle.trim() || fileName}" đã được kiểm tra bảo mật và lưu metadata thành công.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể tải tệp lên hệ thống",
        description:
          err instanceof Error
            ? err.message
            : "Vui lòng kiểm tra định dạng tệp, dung lượng và cấu hình .env.",
        variant: "error",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deletingFile) return;
    try {
      await apiRequest(
        `/api/admin/storage?id=${encodeURIComponent(deletingFile.id)}`,
        { method: "DELETE" },
      );
      setFiles((prev) => prev.filter((f) => f.id !== deletingFile.id));
      toast({
        title: "Đã xóa tệp khỏi kho lưu trữ",
        description: deletingFile.title,
        variant: "info",
      });
      await refreshStorageData();
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

  const handleDeleteStoredFileConfirmed = async () => {
    if (!deletingStoredFile) return;
    try {
      await apiRequest(
        `/api/admin/storage?storedFileId=${encodeURIComponent(deletingStoredFile.id)}`,
        { method: "DELETE" },
      );
      toast({
        title: "Đã xóa tài nguyên thành công",
        description: `Đã xóa "${deletingStoredFile.originalName}" khỏi ${deletingStoredFile.provider.toUpperCase()} và cập nhật PostgreSQL metadata.`,
        variant: "info",
      });
      await refreshStorageData();
    } catch (err) {
      toast({
        title: "Từ chối xóa tài nguyên đang sử dụng",
        description:
          err instanceof Error
            ? err.message
            : "Tài nguyên vẫn đang được module khác tham chiếu.",
        variant: "error",
      });
    } finally {
      setDeletingStoredFile(null);
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

  const getFileIcon = (type: ResourceFileItem["fileType"]) => {
    switch (type) {
      case "PDF":
        return <FileText className="size-4 text-primary" aria-hidden="true" />;
      case "SLIDE":
        return <Presentation className="size-4 text-accent" aria-hidden="true" />;
      case "AUDIO":
        return <FileAudio className="size-4 text-primary" aria-hidden="true" />;
      case "IMAGE":
        return <ImageIcon className="size-4 text-primary" aria-hidden="true" />;
      case "WORKSHEET":
        return (
          <FileSpreadsheet className="size-4 text-primary" aria-hidden="true" />
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản trị Lưu trữ Đám mây (Cloudinary Free + Supabase Free)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Định tuyến tự động: Hình ảnh tối ưu qua Cloudinary Free (`f_auto, q_auto`) · Podcast &
            PDF qua Supabase Storage Free (`public` & `private` 15m Signed URL).
          </p>
        </div>

        <Button onClick={() => setIsUploadModalOpen(true)}>
          <UploadCloud className="size-4" aria-hidden="true" />
          Tải tài nguyên mới
        </Button>
      </div>

      {/* Navigation Tabs (PHẦN 9) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {(
          [
            { id: "overview", label: "1. Tổng quan & Quota", icon: HardDrive },
            {
              id: "images",
              label: `2. Quản lý Ảnh Cloudinary (${quota?.summaryCounts.cloudinaryImages ?? cloudinaryImages.length})`,
              icon: ImageIcon,
            },
            {
              id: "files",
              label: `3. Quản lý Podcast & PDF Supabase (${files.length})`,
              icon: FileText,
            },
            {
              id: "config",
              label: "4. Cấu hình, Định tuyến & Bảo mật",
              icon: Settings2,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & QUOTA MONITORING */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Tổng số tệp quản lý</p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {quota?.totalTrackedFiles ?? storedFiles.length}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Đồng bộ metadata trong PostgreSQL
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Tổng dung lượng đã lưu</p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary">
                {formatBytes(quota?.totalTrackedBytes ?? 29942103)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tính từ các tệp đang hoạt động
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Số ảnh Cloudinary Free</p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {quota?.summaryCounts.cloudinaryImages ?? 3}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tự động nén `f_auto, q_auto`
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Số Podcast Supabase</p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {quota?.summaryCounts.supabasePodcasts ?? 1}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                MP3/M4A · Hỗ trợ Range Audio
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Số PDF Supabase</p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {quota?.summaryCounts.supabasePdfs ?? 2}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Phân tách Public & Private Bucket
              </p>
            </div>
          </div>

          {/* Dual Provider Quota Cards (PHẦN 7) */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Cloudinary Free Card */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-warm text-primary">
                    <ImageIcon className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-heading text-sm font-bold text-foreground">
                      1. Cloudinary Free — Quản lý & Tối ưu Hình ảnh
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Cloud Name:{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {storageStatus?.cloudinaryCloudName ?? "Chưa cấu hình (.env)"}
                      </span>
                    </p>
                  </div>
                </div>
                <Badge
                  variant={storageStatus?.cloudinaryConfigured ? "success" : "warning"}
                >
                  {storageStatus?.cloudinaryConfigured
                    ? "Đã kết nối API Key"
                    : "Chế độ Local / Chưa điền .env"}
                </Badge>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Dung lượng ảnh theo dõi:{" "}
                    <strong className="text-foreground">
                      {formatBytes(quota?.cloudinary.trackedStorageBytes ?? 2364555)}
                    </strong>{" "}
                    / {formatBytes(quota?.cloudinary.storageLimitBytes ?? 1024 * 1024 * 1024)}
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {quota?.cloudinary.usagePercent ?? 0.23}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.max(2, Math.min(100, quota?.cloudinary.usagePercent ?? 1))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-2 rounded-xl bg-background p-3 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Băng thông & Credits tháng:</span>
                  <p className="mt-0.5 font-medium text-foreground">
                    {quota?.cloudinary.creditsOrTransformationsLabel ??
                      "Không xác định (Chưa đồng bộ từ Dashboard)"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Đồng bộ gần nhất:</span>
                  <p className="mt-0.5 font-mono text-foreground">
                    {quota?.cloudinary.lastSyncedAt ?? "Chưa đồng bộ (Chỉ số Dashboard)"}
                  </p>
                </div>
              </div>
            </div>

            {/* Supabase Free Storage Card */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-secondary/40 text-primary">
                    <Cloud className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-heading text-sm font-bold text-foreground">
                      2. Supabase Free Storage — Quản lý Podcast & PDF
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Buckets:{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {storageStatus?.publicBucket ?? "english-manager-public"}
                      </span>{" "}
                      &{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {storageStatus?.privateBucket ?? "english-manager-private"}
                      </span>
                    </p>
                  </div>
                </div>
                <Badge
                  variant={storageStatus?.supabaseConfigured ? "success" : "warning"}
                >
                  {storageStatus?.supabaseConfigured
                    ? "Đã kết nối Secret Key"
                    : "Chế độ Local / Chưa điền .env"}
                </Badge>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Dung lượng tệp theo dõi:{" "}
                    <strong className="text-foreground">
                      {formatBytes(quota?.supabase.trackedStorageBytes ?? 27577548)}
                    </strong>{" "}
                    / {formatBytes(quota?.supabase.storageLimitBytes ?? 1024 * 1024 * 1024)}
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {quota?.supabase.usagePercent ?? 2.57}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.max(3, Math.min(100, quota?.supabase.usagePercent ?? 2.6))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-2 rounded-xl bg-background p-3 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Cached / Uncached Egress:</span>
                  <p className="mt-0.5 font-medium text-foreground">
                    {quota?.supabase.cachedEgressLabel ??
                      "Không xác định (Chưa đồng bộ từ Supabase Dashboard)"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Chính sách bảo vệ Free Tier:</span>
                  <p className="mt-0.5 font-medium text-foreground">
                    Cảnh báo {quota?.thresholds.warningPercent ?? 70}% · Nghiêm trọng{" "}
                    {quota?.thresholds.criticalPercent ?? 85}% · Khóa upload{" "}
                    {quota?.thresholds.lockPercent ?? 95}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLOUDINARY IMAGE MANAGER */}
      {activeTab === "images" && (
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm ảnh theo tên file, public_id hoặc danh mục..."
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={imageCategoryFilter}
                onChange={(e) => setImageCategoryFilter(e.target.value)}
                aria-label="Lọc danh mục ảnh Cloudinary"
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {Object.entries(IMAGE_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={() => {
                  setUploadTargetKind("image");
                  setIsUploadModalOpen(true);
                }}
              >
                <UploadCloud className="size-3.5" aria-hidden="true" />
                Upload Ảnh Cloudinary
              </Button>
            </div>
          </div>

          {cloudinaryImages.length === 0 ? (
            <EmptyState
              icon={<ImageIcon className="size-6" aria-hidden="true" />}
              title="Không có hình ảnh nào khớp bộ lọc"
              description="Tất cả hình ảnh đại diện, dự án học sinh, thumbnail podcast đều được quản lý và tối ưu tự động qua Cloudinary Free."
            />
          ) : (
            <div className="rounded-2xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ảnh & Public ID</TableHead>
                    <TableHead>Danh mục Folder</TableHead>
                    <TableHead>Kích thước</TableHead>
                    <TableHead>Tham chiếu</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cloudinaryImages.map((img) => (
                    <TableRow key={img.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warm text-primary font-mono text-[10px] font-bold">
                            IMG
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {img.originalName}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {img.cloudinaryPublicId}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{img.category}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatBytes(img.fileSize)}
                      </TableCell>
                      <TableCell>
                        {img.referencedBy.length > 0 ? (
                          <Badge variant="info">
                            Đang dùng ({img.referencedBy.length})
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Chưa gắn kết</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setPreviewStoredImage(img)}
                            aria-label={`Xem thông tin ảnh ${img.originalName}`}
                          >
                            <Eye className="size-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setDeletingStoredFile(img)}
                            aria-label={`Xóa ảnh ${img.originalName}`}
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
          )}
        </div>
      )}

      {/* TAB 3: SUPABASE PODCAST & PDF MANAGER */}
      {activeTab === "files" && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Folder Tree Sidebar */}
          <aside className="space-y-2 lg:col-span-3">
            <h2 className="px-2 font-heading text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Cây thư mục học liệu
            </h2>

            <button
              type="button"
              onClick={() => setSelectedFolderId("all")}
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
              <span className="font-mono text-[11px] opacity-80">{files.length}</span>
            </button>

            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              const count = files.filter((f) => f.folderId === folder.id).length;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    {folder.visibility === "private" ? (
                      <Lock className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                    ) : (
                      <Folder className="size-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{folder.name}</span>
                  </span>
                  <span className="font-mono text-[11px] opacity-75">{count}</span>
                </button>
              );
            })}
          </aside>

          {/* Main File Explorer */}
          <div className="space-y-4 lg:col-span-9">
            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
              <Breadcrumb
                items={[
                  { label: "Supabase Storage", onClick: () => setSelectedFolderId("all") },
                  {
                    label: activeFolder
                      ? activeFolder.name
                      : "Tất cả Podcast & Tài liệu PDF",
                  },
                ]}
              />

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-52 flex-1 sm:flex-initial">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên tệp..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>

                <select
                  value={visibilityFilter}
                  onChange={(e) =>
                    setVisibilityFilter(
                      e.target.value as "all" | "public" | "private",
                    )
                  }
                  aria-label="Lọc theo quyền truy cập"
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
                >
                  <option value="all">Mọi quyền (Public & Private)</option>
                  <option value="public">Public Bucket (english-manager-public)</option>
                  <option value="private">Private Bucket (english-manager-private)</option>
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
                description="Hãy tải tệp mới lên hoặc chọn thư mục khác."
              />
            ) : viewMode === "table" ? (
              <div className="rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên học liệu / Podcast</TableHead>
                      <TableHead>Loại & Dung lượng</TableHead>
                      <TableHead>Supabase Bucket & Quyền</TableHead>
                      <TableHead>Lượt tải</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFiles.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell>
                          <div className="flex items-start gap-2.5">
                            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-warm">
                              {getFileIcon(file.fileType)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground">{file.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {file.folderName} · Cập nhật {file.updatedAt}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {file.fileType} · {file.size}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(file.id)}
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
                              <Download className="size-3.5 text-primary" aria-hidden="true" />
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
                {filteredFiles.map((file) => (
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
                            {file.fileType} · {file.size}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(file.id)}
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
          </div>
        </div>
      )}

      {/* TAB 4: CONFIGURATION, ROUTING & SECURITY AUDIT */}
      {activeTab === "config" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Automatic Provider Routing Matrix (PHẦN 6) */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                <h2 className="font-heading text-base font-bold text-foreground">
                  Bảng định tuyến Provider tự động
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Mọi yêu cầu upload sai provider (ví dụ gửi PDF vào API ảnh hoặc ngược lại) đều bị
                chặn tự động tại tầng `StorageService`.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loại tài nguyên</TableHead>
                    <TableHead>Provider đích</TableHead>
                    <TableHead>Bucket / Folder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Avatar Học sinh / Giáo viên</TableCell>
                    <TableCell>
                      <Badge variant="info">Cloudinary Free</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      english-manager/avatars/*
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      Ảnh Dự án / Thumbnail Podcast / Bài viết
                    </TableCell>
                    <TableCell>
                      <Badge variant="info">Cloudinary Free</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      english-manager/projects|podcasts|articles
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Podcast MP3 / M4A Công khai</TableCell>
                    <TableCell>
                      <Badge variant="success">Supabase Free</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      english-manager-public/podcasts/*
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">PDF Học tập Công khai</TableCell>
                    <TableCell>
                      <Badge variant="success">Supabase Free</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      english-manager-public/resources/*
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      PDF Đề thi / Đáp án / Tài liệu Riêng tư
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">Supabase Private</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      english-manager-private/exams|answers/*
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Upload Limits & Quota Thresholds */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="size-5 text-primary" aria-hidden="true" />
                <h2 className="font-heading text-base font-bold text-foreground">
                  Giới hạn Bảo vệ Gói Free & Bảo mật
                </h2>
              </div>
              <ul className="space-y-2.5 text-xs text-foreground">
                <li className="flex items-center justify-between rounded-xl bg-background px-3.5 py-2.5">
                  <span>Giới hạn kích thước Ảnh (JPEG, PNG, WebP):</span>
                  <strong className="font-mono">
                    {quota?.limits.maxImageSizeMb ?? 5} MB / ảnh
                  </strong>
                </li>
                <li className="flex items-center justify-between rounded-xl bg-background px-3.5 py-2.5">
                  <span>Giới hạn kích thước Podcast (MP3, M4A):</span>
                  <strong className="font-mono">
                    {quota?.limits.maxAudioSizeMb ?? 40} MB / tập (dự phòng dưới 50 MB)
                  </strong>
                </li>
                <li className="flex items-center justify-between rounded-xl bg-background px-3.5 py-2.5">
                  <span>Giới hạn kích thước Tài liệu PDF:</span>
                  <strong className="font-mono">
                    {quota?.limits.maxPdfSizeMb ?? 40} MB / tệp
                  </strong>
                </li>
                <li className="flex items-center justify-between rounded-xl bg-background px-3.5 py-2.5">
                  <span>Thời hạn Signed URL cho tệp riêng tư:</span>
                  <strong className="font-mono">
                    {quota?.limits.privateUrlTtlSeconds ?? 900} giây (15 phút)
                  </strong>
                </li>
                <li className="flex items-center justify-between rounded-xl bg-background px-3.5 py-2.5">
                  <span>Bảo vệ API Secret / Service Role Key:</span>
                  <Badge variant="success">
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                    Server-only (Ẩn hoàn toàn)
                  </Badge>
                </li>
              </ul>
            </div>
          </div>

          {/* Audit Logs & Orphaned Files */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm font-bold text-foreground">
                Nhật ký Thao tác Quản trị Lưu trữ (Audit Logs — Đã ẩn Token/Signed URL)
              </h3>
              {orphanFiles.length > 0 && (
                <Badge variant="warning">
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  {orphanFiles.length} file mồ côi cần đồng bộ
                </Badge>
              )}
            </div>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Chưa có thao tác tải lên, xóa hoặc cấp Signed URL nào trong phiên làm việc hiện tại.
              </p>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col justify-between gap-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs sm:flex-row sm:items-center"
                  >
                    <div>
                      <span className="font-mono font-semibold text-primary">
                        [{log.action}]
                      </span>{" "}
                      <span className="text-foreground">{log.detail}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {log.provider.toUpperCase()} · {new Date(log.createdAt).toLocaleTimeString("vi-VN")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Modal (Supports Image -> Cloudinary, Podcast/PDF -> Supabase) */}
      <ModalDialog
        open={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Tải tài nguyên lên Hệ thống Lưu trữ"
        description="Hệ thống tự động kiểm tra chữ ký tệp (Magic Bytes), dung lượng và định tuyến sang Cloudinary Free hoặc Supabase Free."
        size="md"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "pdf", label: "PDF (Supabase)" },
                { id: "podcast", label: "Podcast MP3/M4A" },
                { id: "image", label: "Hình ảnh (Cloudinary)" },
              ] as const
            ).map((kind) => (
              <button
                key={kind.id}
                type="button"
                onClick={() => {
                  setUploadTargetKind(kind.id);
                  setSelectedFile(null);
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                  uploadTargetKind === kind.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {kind.label}
              </button>
            ))}
          </div>

          <label
            htmlFor="up-file"
            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/30 bg-warm/40 p-5 text-center transition-colors hover:border-primary/60"
          >
            <UploadCloud className="size-8 text-primary" aria-hidden="true" />
            <p className="mt-2 font-heading text-sm font-semibold text-foreground">
              {selectedFile
                ? `Đã chọn: ${selectedFile.name} (${formatBytes(selectedFile.size)})`
                : "Nhấn để chọn tệp từ máy tính"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {uploadTargetKind === "image"
                ? "Chỉ chấp nhận JPEG, JPG, PNG, WebP (Tối đa 5 MB) → Cloudinary Free"
                : uploadTargetKind === "podcast"
                  ? "Chỉ chấp nhận MP3, M4A (Tối đa 40 MB) → Supabase Free"
                  : "Chỉ chấp nhận PDF (Tối đa 40 MB) → Supabase Free"}
            </p>
            <input
              id="up-file"
              type="file"
              accept={
                uploadTargetKind === "image"
                  ? ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  : uploadTargetKind === "podcast"
                    ? ".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
                    : ".pdf,application/pdf"
              }
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSelectedFile(file);
                if (file && file.type.startsWith("image/")) {
                  const reader = new FileReader();
                  reader.onload = () =>
                    setImagePreviewDataUrl(
                      typeof reader.result === "string" ? reader.result : null,
                    );
                  reader.readAsDataURL(file);
                } else {
                  setImagePreviewDataUrl(null);
                }
                if (file && !uploadTitle.trim()) {
                  setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
                }
              }}
            />
          </label>

          {/* Image preview before saving (PHẦN 3.3) */}
          {imagePreviewDataUrl && (
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="mb-2 text-xs font-semibold text-foreground">
                Xem trước ảnh trước khi lưu lên Cloudinary:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreviewDataUrl}
                alt="Xem trước ảnh tải lên"
                className="max-h-40 rounded-lg object-contain mx-auto"
              />
            </div>
          )}

          {uploadProgress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Tiến trình kiểm tra & tải lên</span>
                <span className="font-mono font-semibold text-primary">
                  {uploadProgress}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="up-title"
              className="block text-xs font-semibold text-foreground"
            >
              Tên hiển thị của tài nguyên
            </label>
            <Input
              id="up-title"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Ví dụ: Bộ đề luyện Reading Cam 19 — Kèm giải thích chi tiết"
              required
            />
          </div>

          {uploadTargetKind === "image" ? (
            <div className="space-y-1.5">
              <label
                htmlFor="up-img-cat"
                className="block text-xs font-semibold text-foreground"
              >
                Thư mục Cloudinary (`english-manager/...`)
              </label>
              <select
                id="up-img-cat"
                value={uploadImageCategory}
                onChange={(e) => setUploadImageCategory(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {Object.entries(IMAGE_CATEGORY_LABELS)
                  .filter(([k]) => k !== "all")
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="up-folder"
                  className="block text-xs font-semibold text-foreground"
                >
                  Thư mục học liệu
                </label>
                <select
                  id="up-folder"
                  value={uploadFolderId}
                  onChange={(e) => setUploadFolderId(e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
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
                  htmlFor="up-vis"
                  className="block text-xs font-semibold text-foreground"
                >
                  Supabase Bucket & Quyền truy cập
                </label>
                <select
                  id="up-vis"
                  value={uploadVisibility}
                  onChange={(e) => {
                    const nextVis =
                      e.target.value as ResourceFileItem["visibility"];
                    setUploadVisibility(nextVis);
                    setUploadPdfCategory(
                      nextVis === "public"
                        ? "resources/exercises"
                        : "internal-documents",
                    );
                  }}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
                >
                  <option value="public">
                    Public Bucket (english-manager-public)
                  </option>
                  <option value="private">
                    Private Bucket (english-manager-private · 15m Signed URL)
                  </option>
                </select>
              </div>
            </div>
          )}

          {uploadTargetKind === "pdf" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="up-pdf-cat"
                  className="block text-xs font-semibold text-foreground"
                >
                  Nhánh thư mục Bucket
                </label>
                <select
                  id="up-pdf-cat"
                  value={uploadPdfCategory}
                  onChange={(e) => setUploadPdfCategory(e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
                >
                  {uploadVisibility === "public" ? (
                    <>
                      <option value="resources/grammar">resources/grammar</option>
                      <option value="resources/vocabulary">
                        resources/vocabulary
                      </option>
                      <option value="resources/exercises">
                        resources/exercises
                      </option>
                      <option value="attachments">attachments</option>
                    </>
                  ) : (
                    <>
                      <option value="exams">exams (Đề thi)</option>
                      <option value="answers">answers (Đáp án)</option>
                      <option value="internal-documents">
                        internal-documents (Nội bộ)
                      </option>
                      <option value="student-documents">
                        student-documents (Học sinh được cấp quyền)
                      </option>
                      <option value="teacher-resources">
                        teacher-resources (Giáo viên)
                      </option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="up-level"
                  className="block text-xs font-semibold text-foreground"
                >
                  Trình độ
                </label>
                <Input
                  id="up-level"
                  value={uploadLevel}
                  onChange={(e) => setUploadLevel(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="up-pages"
                  className="block text-xs font-semibold text-foreground"
                >
                  Số trang / Thời lượng
                </label>
                <Input
                  id="up-pages"
                  value={uploadPages}
                  onChange={(e) => setUploadPages(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsUploadModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isUploading}>
              <UploadCloud className="size-4" aria-hidden="true" />
              {isUploading ? "Đang xử lý & tải lên..." : "Bắt đầu tải lên"}
            </Button>
          </div>
        </form>
      </ModalDialog>

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
              <p className="font-semibold text-primary">Thông tin lưu trữ & nội dung:</p>
              <ul className="mt-2 space-y-1.5">
                {previewFile.previewSummary.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Preview Stored Cloudinary Image Modal */}
      <ModalDialog
        open={Boolean(previewStoredImage)}
        onClose={() => setPreviewStoredImage(null)}
        title={previewStoredImage?.originalName ?? "Chi tiết ảnh Cloudinary"}
        description={previewStoredImage?.cloudinaryPublicId ?? undefined}
        size="md"
        footer={
          <Button variant="outline" onClick={() => setPreviewStoredImage(null)}>
            Đóng
          </Button>
        }
      >
        {previewStoredImage && (
          <div className="space-y-2 text-xs">
            <p>
              <strong>Provider:</strong> Cloudinary Free (`f_auto, q_auto`)
            </p>
            <p>
              <strong>Danh mục:</strong> {previewStoredImage.category}
            </p>
            <p>
              <strong>Kích thước:</strong> {formatBytes(previewStoredImage.fileSize)}
            </p>
            <p className="break-all">
              <strong>URL tối ưu:</strong>{" "}
              <span className="font-mono text-muted-foreground">
                {previewStoredImage.publicUrl}
              </span>
            </p>
          </div>
        )}
      </ModalDialog>

      {/* Delete Resource Confirm */}
      <ConfirmDialog
        open={Boolean(deletingFile)}
        onClose={() => setDeletingFile(null)}
        onConfirm={handleDeleteConfirmed}
        title="Xác nhận xóa tệp khỏi Supabase Storage?"
        description={
          deletingFile
            ? `Tệp "${deletingFile.title}" sẽ bị xóa khỏi bucket lưu trữ và cập nhật metadata trong PostgreSQL.`
            : ""
        }
        confirmLabel="Xóa tệp"
        variant="destructive"
      />

      {/* Delete Cloudinary Image Confirm */}
      <ConfirmDialog
        open={Boolean(deletingStoredFile)}
        onClose={() => setDeletingStoredFile(null)}
        onConfirm={handleDeleteStoredFileConfirmed}
        title="Xác nhận xóa ảnh khỏi Cloudinary?"
        description={
          deletingStoredFile
            ? deletingStoredFile.referencedBy.length > 0
              ? `CẢNH BÁO: Ảnh "${deletingStoredFile.originalName}" đang được tham chiếu bởi [${deletingStoredFile.referencedBy.join(", ")}]. Hệ thống sẽ từ chối xóa nếu chưa gỡ tham chiếu.`
              : `Ảnh "${deletingStoredFile.originalName}" sẽ bị xóa khỏi Cloudinary và cập nhật metadata.`
            : ""
        }
        confirmLabel="Xóa ảnh"
        variant="destructive"
      />
    </div>
  );
}
