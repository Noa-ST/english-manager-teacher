"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  UploadCloud,
} from "lucide-react";
import type {
  ClassroomGroup,
  MasterCurriculumMaterial,
  OrphanedStorageObject,
  ResourceFileItem,
  ResourceFolder,
  StorageAuditLogEntry,
  StoredFileRecord,
} from "@/services/classroom-data";
import type {
  StorageHealthStatus,
  StorageQuotaReport,
} from "@/services/storage.service";
import {
  buildStorageInventoryCsv,
  type StorageAdminTab,
} from "@/services/storage-helpers";
import { apiRequest } from "@/lib/api-client";
import { StorageConfigAuditTab } from "@/components/admin/storage/storage-config-audit-tab";
import { StorageCurriculumTab } from "@/components/admin/storage/storage-curriculum-tab";
import { StorageFilesTab } from "@/components/admin/storage/storage-files-tab";
import { StorageImagesTab } from "@/components/admin/storage/storage-images-tab";
import { StorageOverviewTab } from "@/components/admin/storage/storage-overview-tab";
import { StorageUploadModal } from "@/components/admin/storage/storage-upload-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface StorageApiResponse {
  folders: ResourceFolder[];
  files: ResourceFileItem[];
  storedFiles: StoredFileRecord[];
  status: StorageHealthStatus;
  quota: StorageQuotaReport;
  auditLogs: StorageAuditLogEntry[];
  orphanFiles: OrphanedStorageObject[];
}

const VALID_TABS: readonly StorageAdminTab[] = [
  "overview",
  "images",
  "files",
  "curriculum",
  "config",
];

function parseTabParam(raw: string | null): StorageAdminTab {
  if (raw && (VALID_TABS as readonly string[]).includes(raw)) {
    return raw as StorageAdminTab;
  }
  return "overview";
}

function StorageWorkspaceContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const rawTabParam = searchParams.get("tab");
  const [prevTabParam, setPrevTabParam] = React.useState(rawTabParam);
  const [activeTab, setActiveTab] = React.useState<StorageAdminTab>(() =>
    parseTabParam(rawTabParam),
  );
  if (rawTabParam !== prevTabParam) {
    setPrevTabParam(rawTabParam);
    setActiveTab(parseTabParam(rawTabParam));
  }

  const [folders, setFolders] = React.useState<ResourceFolder[]>([]);
  const [files, setFiles] = React.useState<ResourceFileItem[]>([]);
  const [storedFiles, setStoredFiles] = React.useState<StoredFileRecord[]>([]);
  const [storageStatus, setStorageStatus] =
    React.useState<StorageHealthStatus | null>(null);
  const [quota, setQuota] = React.useState<StorageQuotaReport | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<StorageAuditLogEntry[]>([]);
  const [orphanFiles, setOrphanFiles] = React.useState<OrphanedStorageObject[]>(
    [],
  );
  const [classes, setClasses] = React.useState<ClassroomGroup[]>([]);
  const [curriculumMaterials, setCurriculumMaterials] = React.useState<
    MasterCurriculumMaterial[]
  >([]);

  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const [uploadModalKind, setUploadModalKind] = React.useState<
    "image" | "podcast" | "pdf"
  >("image");
  const [replaceTarget, setReplaceTarget] =
    React.useState<StoredFileRecord | null>(null);

  const applyFetchedData = React.useCallback(
    (
      storageData: StorageApiResponse,
      classesData: ClassroomGroup[],
      materialsData: MasterCurriculumMaterial[],
    ) => {
      setFolders(storageData.folders ?? []);
      setFiles(storageData.files ?? []);
      setStoredFiles(storageData.storedFiles ?? []);
      setStorageStatus(storageData.status ?? null);
      setQuota(storageData.quota ?? null);
      setAuditLogs(storageData.auditLogs ?? []);
      setOrphanFiles(storageData.orphanFiles ?? []);
      setClasses(Array.isArray(classesData) ? classesData : []);
      setCurriculumMaterials(
        Array.isArray(materialsData) ? materialsData : [],
      );
    },
    [],
  );

  React.useEffect(() => {
    let active = true;

    Promise.all([
      apiRequest<StorageApiResponse>("/api/admin/storage"),
      apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true"),
      apiRequest<MasterCurriculumMaterial[]>("/api/admin/classes/materials"),
    ])
      .then(([storageData, classesData, materialsData]) => {
        if (!active) return;
        applyFetchedData(storageData, classesData, materialsData);
      })
      .catch((err) => {
        if (!active) return;
        toast({
          variant: "error",
          title: "Không thể tải dữ liệu Lưu trữ Đám mây",
          description:
            err instanceof Error
              ? err.message
              : "Đã xảy ra lỗi khi kết nối API lưu trữ.",
        });
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyFetchedData, toast]);

  const refreshStorageData = React.useCallback(() => {
    setIsRefreshing(true);
    Promise.all([
      apiRequest<StorageApiResponse>("/api/admin/storage"),
      apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true"),
      apiRequest<MasterCurriculumMaterial[]>("/api/admin/classes/materials"),
    ])
      .then(([storageData, classesData, materialsData]) => {
        applyFetchedData(storageData, classesData, materialsData);
      })
      .catch((err) => {
        toast({
          variant: "error",
          title: "Làm mới dữ liệu thất bại",
          description:
            err instanceof Error
              ? err.message
              : "Không thể đồng bộ trạng thái kho lưu trữ.",
        });
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [applyFetchedData, toast]);

  const openUploadModal = React.useCallback(
    (kind: "image" | "podcast" | "pdf", target: StoredFileRecord | null) => {
      setUploadModalKind(kind);
      setReplaceTarget(target);
      setUploadModalOpen(true);
    },
    [],
  );

  const handleOpenNewResource = React.useCallback(() => {
    const defaultKind: "image" | "podcast" | "pdf" =
      activeTab === "images" ? "image" : activeTab === "files" ? "pdf" : "image";
    openUploadModal(defaultKind, null);
  }, [activeTab, openUploadModal]);

  const handleExportInventoryCsv = React.useCallback(() => {
    const activeFiles = storedFiles.filter((item) => !item.deletedAt);
    const csvContent = buildStorageInventoryCsv(activeFiles);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `storage-inventory-${dateStamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    toast({
      variant: "success",
      title: "Đã xuất báo cáo kiểm kê CSV",
      description: `Đã xuất ${activeFiles.length} tệp lưu trữ hiện hành.`,
    });
  }, [storedFiles, toast]);

  const activeStoredCount = React.useMemo(
    () => storedFiles.filter((f) => !f.deletedAt).length,
    [storedFiles],
  );
  const activeImagesCount = React.useMemo(
    () =>
      storedFiles.filter(
        (f) => !f.deletedAt && f.provider === "cloudinary" && f.fileType === "IMAGE",
      ).length,
    [storedFiles],
  );
  const activeFilesCount = React.useMemo(
    () => files.filter((f) => !f.deletedAt).length,
    [files],
  );

  const tabs: Array<{
    id: StorageAdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeCount?: number;
    badgeTone?: "default" | "warning";
  }> = [
    {
      id: "overview",
      label: "Tổng quan & Quota",
      icon: LayoutDashboard,
    },
    {
      id: "images",
      label: "Quản lý Ảnh Cloudinary",
      icon: ImageIcon,
      badgeCount: activeImagesCount,
    },
    {
      id: "files",
      label: "Quản lý Podcast & PDF Supabase",
      icon: FolderOpen,
      badgeCount: activeFilesCount,
    },
    {
      id: "curriculum",
      label: "Tài liệu Lớp học & Lộ trình",
      icon: BookOpen,
      badgeCount: curriculumMaterials.length,
    },
    {
      id: "config",
      label: "Cấu hình, Dọn dẹp & Audit Log",
      icon: Settings2,
      badgeCount: orphanFiles.length,
      badgeTone: orphanFiles.length > 0 ? "warning" : "default",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              Quản trị Lưu trữ Đám mây
            </h1>
            <Badge variant="outline" className="text-xs">
              Cloudinary Free + Supabase Free
            </Badge>
            {activeStoredCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeStoredCount} tệp đang quản lý
              </Badge>
            )}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Quản lý tập trung ảnh CDN và tài liệu PDF/Audio theo nguyên tắc{" "}
            <span className="font-medium text-foreground">
              1 khóa duy nhất (Single-Key)
            </span>
            , bảo vệ tệp đang có tham chiếu và tách biệt hoàn toàn bucket{" "}
            <span className="font-medium text-foreground">Public / Private</span>{" "}
            với Signed URL ngắn hạn.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={refreshStorageData}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin")}
            />
            Làm mới
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleExportInventoryCsv}
            disabled={isLoading || activeStoredCount === 0}
          >
            <Download className="size-4" />
            Xuất CSV kiểm kê
          </Button>
          <Button
            type="button"
            onClick={handleOpenNewResource}
            disabled={isLoading}
          >
            <UploadCloud className="size-4" />
            Tải tài nguyên mới
          </Button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Phân hệ quản trị lưu trữ"
        className="flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/40 p-1.5"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{tab.label}</span>
              {typeof tab.badgeCount === "number" && tab.badgeCount > 0 && (
                <span
                  className={cn(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                    tab.badgeTone === "warning"
                      ? "bg-amber-500/15 text-amber-700"
                      : isActive
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {tab.badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <StorageOverviewTab
              quota={quota}
              storageStatus={storageStatus}
              storedFiles={storedFiles}
              orphanFilesCount={orphanFiles.length}
              onSelectTab={setActiveTab}
            />
          )}

          {activeTab === "images" && (
            <StorageImagesTab
              storedFiles={storedFiles}
              onOpenUploadImage={() => openUploadModal("image", null)}
              onReplaceImage={(img) => openUploadModal("image", img)}
              onDeleted={refreshStorageData}
            />
          )}

          {activeTab === "files" && (
            <StorageFilesTab
              folders={folders}
              files={files}
              storedFiles={storedFiles}
              onRefresh={refreshStorageData}
              onReplaceStoredFile={(target) =>
                openUploadModal(
                  target.fileType === "AUDIO" ? "podcast" : "pdf",
                  target,
                )
              }
            />
          )}

          {activeTab === "curriculum" && (
            <StorageCurriculumTab
              classes={classes}
              curriculumMaterials={curriculumMaterials}
              onRefresh={refreshStorageData}
            />
          )}

          {activeTab === "config" && (
            <StorageConfigAuditTab
              quota={quota}
              storageStatus={storageStatus}
              auditLogs={auditLogs}
              orphanFiles={orphanFiles}
              onRefresh={refreshStorageData}
            />
          )}
        </>
      )}

      <StorageUploadModal
        open={uploadModalOpen}
        initialKind={uploadModalKind}
        replaceTarget={replaceTarget}
        folders={folders}
        storageStatus={storageStatus}
        onClose={() => {
          setUploadModalOpen(false);
          setReplaceTarget(null);
        }}
        onUploaded={() => {
          setUploadModalOpen(false);
          setReplaceTarget(null);
          refreshStorageData();
        }}
      />
    </div>
  );
}

export default function StorageManagerPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-4" />
              <span>Đang khởi tạo phân hệ Quản trị Lưu trữ Đám mây...</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      }
    >
      <StorageWorkspaceContent />
    </React.Suspense>
  );
}
