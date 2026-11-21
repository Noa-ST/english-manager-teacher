"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Cloud,
  FileAudio,
  FileText,
  HardDrive,
  Image as ImageIcon,
} from "lucide-react";
import type { StoredFileRecord } from "@/services/classroom-data";
import type {
  StorageHealthStatus,
  StorageQuotaReport,
} from "@/services/storage.service";
import {
  formatStorageBytes,
  getQuotaAlertMeta,
  type StorageAdminTab,
} from "@/services/storage-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StorageOverviewTab({
  quota,
  storageStatus,
  storedFiles,
  orphanFilesCount,
  onSelectTab,
}: {
  quota: StorageQuotaReport | null;
  storageStatus: StorageHealthStatus | null;
  storedFiles: StoredFileRecord[];
  orphanFilesCount: number;
  onSelectTab: (tab: StorageAdminTab) => void;
}) {
  const activeFiles = React.useMemo(
    () => storedFiles.filter((f) => !f.deletedAt),
    [storedFiles],
  );

  const totalFiles = quota?.totalTrackedFiles ?? activeFiles.length;
  const totalBytes =
    quota?.totalTrackedBytes ??
    activeFiles.reduce((sum, f) => sum + f.fileSize, 0);
  const cloudinaryImages =
    quota?.summaryCounts.cloudinaryImages ??
    activeFiles.filter((f) => f.provider === "cloudinary").length;
  const supabasePodcasts =
    quota?.summaryCounts.supabasePodcasts ??
    activeFiles.filter(
      (f) => f.provider === "supabase" && f.fileType === "AUDIO",
    ).length;
  const supabasePdfs =
    quota?.summaryCounts.supabasePdfs ??
    activeFiles.filter((f) => f.provider === "supabase" && f.fileType === "PDF")
      .length;

  const cloudBytes =
    quota?.cloudinary.trackedStorageBytes ??
    activeFiles
      .filter((f) => f.provider === "cloudinary")
      .reduce((sum, f) => sum + f.fileSize, 0);
  const cloudLimitBytes =
    quota?.cloudinary.storageLimitBytes ?? 1024 * 1024 * 1024;
  const cloudPercent =
    quota?.cloudinary.usagePercent ??
    Number(((cloudBytes / cloudLimitBytes) * 100).toFixed(2));
  const cloudAlert = getQuotaAlertMeta(
    quota?.cloudinary.alertLevel ?? "healthy",
  );

  const supaBytes =
    quota?.supabase.trackedStorageBytes ??
    activeFiles
      .filter((f) => f.provider === "supabase")
      .reduce((sum, f) => sum + f.fileSize, 0);
  const supaLimitBytes =
    quota?.supabase.storageLimitBytes ?? 1024 * 1024 * 1024;
  const supaPercent =
    quota?.supabase.usagePercent ??
    Number(((supaBytes / supaLimitBytes) * 100).toFixed(2));
  const supaAlert = getQuotaAlertMeta(quota?.supabase.alertLevel ?? "healthy");

  return (
    <div className="space-y-6">
      {/* Orphan Warning Banner */}
      {orphanFilesCount > 0 && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs sm:flex-row sm:items-center">
          <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">
                Phát hiện {orphanFilesCount} tệp mồ côi trên Cloud Storage
              </p>
              <p className="mt-0.5 text-amber-800/85 dark:text-amber-300/85">
                Các tệp này chưa gắn với metadata hợp lệ và đang chiếm dụng dung lượng Free Tier.
              </p>
            </div>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onSelectTab("config")}
            className="shrink-0 border-amber-500/40 bg-background"
          >
            Kiểm tra &amp; Dọn dẹp ngay
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Summary Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Tổng số tệp quản lý</p>
            <HardDrive className="size-4 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {totalFiles}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Đồng bộ metadata trong PostgreSQL
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Tổng dung lượng đã lưu</p>
            <Cloud className="size-4 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-1 font-heading text-2xl font-bold text-primary">
            {formatStorageBytes(totalBytes)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tính từ các tệp đang hoạt động
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Số ảnh Cloudinary Free</p>
            <ImageIcon className="size-4 text-sky-600" aria-hidden="true" />
          </div>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {cloudinaryImages}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tự động nén `f_auto, q_auto`
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Số Podcast Supabase</p>
            <FileAudio className="size-4 text-indigo-600" aria-hidden="true" />
          </div>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {supabasePodcasts}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            MP3/M4A · Hỗ trợ Range Audio
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Số PDF Supabase</p>
            <FileText className="size-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {supabasePdfs}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Phân tách Public &amp; Private Bucket
          </p>
        </div>
      </div>

      {/* Dual Provider Quota Cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cloudinary Free Card */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-warm text-primary">
                <ImageIcon className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-sm font-bold text-foreground">
                  1. Cloudinary Free — Quản lý &amp; Tối ưu Hình ảnh
                </h2>
                <p className="text-xs text-muted-foreground">
                  Cloud Name:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {storageStatus?.cloudinaryCloudName ?? "Chưa cấu hình (.env)"}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={cloudAlert.badgeVariant}>
                {cloudAlert.label}
              </Badge>
              <Badge
                variant={
                  storageStatus?.cloudinaryConfigured ? "success" : "warning"
                }
              >
                {storageStatus?.cloudinaryConfigured
                  ? "Đã kết nối API Key"
                  : "Chế độ Local"}
              </Badge>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Dung lượng ảnh theo dõi:{" "}
                <strong className="text-foreground">
                  {formatStorageBytes(cloudBytes)}
                </strong>{" "}
                / {formatStorageBytes(cloudLimitBytes)}
              </span>
              <span className="font-mono font-semibold text-primary">
                {cloudPercent}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  cloudAlert.barClass,
                )}
                style={{
                  width: `${Math.max(2, Math.min(100, cloudPercent))}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {cloudAlert.recommendation}
            </p>
          </div>

          <div className="grid gap-2 rounded-xl bg-background p-3 text-xs sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">
                Băng thông &amp; Credits tháng:
              </span>
              <p className="mt-0.5 font-medium text-foreground">
                {quota?.cloudinary.creditsOrTransformationsLabel ??
                  "5 preset cố định (f_auto,q_auto)"}
              </p>
            </div>
            <div className="flex items-end justify-between sm:justify-end">
              <Button
                variant="outline"
                size="xs"
                onClick={() => onSelectTab("images")}
              >
                Mở Kho Ảnh Cloudinary
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/* Supabase Free Storage Card */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-secondary/40 text-primary">
                <Cloud className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-sm font-bold text-foreground">
                  2. Supabase Free Storage — Quản lý Podcast &amp; PDF
                </h2>
                <p className="text-xs text-muted-foreground">
                  Buckets:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {storageStatus?.publicBucket ?? "english-manager-public"}
                  </span>{" "}
                  &amp;{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {storageStatus?.privateBucket ?? "english-manager-private"}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={supaAlert.badgeVariant}>
                {supaAlert.label}
              </Badge>
              <Badge
                variant={
                  storageStatus?.supabaseConfigured ? "success" : "warning"
                }
              >
                {storageStatus?.supabaseConfigured
                  ? "Đã kết nối Secret Key"
                  : "Chế độ Local"}
              </Badge>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Dung lượng tệp theo dõi:{" "}
                <strong className="text-foreground">
                  {formatStorageBytes(supaBytes)}
                </strong>{" "}
                / {formatStorageBytes(supaLimitBytes)}
              </span>
              <span className="font-mono font-semibold text-primary">
                {supaPercent}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  supaAlert.barClass,
                )}
                style={{
                  width: `${Math.max(2, Math.min(100, supaPercent))}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {supaAlert.recommendation}
            </p>
          </div>

          <div className="grid gap-2 rounded-xl bg-background p-3 text-xs sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">
                Ngưỡng bảo vệ Free Tier:
              </span>
              <p className="mt-0.5 font-medium text-foreground">
                Cảnh báo {quota?.thresholds.warningPercent ?? 70}% · Nguy cấp{" "}
                {quota?.thresholds.criticalPercent ?? 85}% · Khóa{" "}
                {quota?.thresholds.lockPercent ?? 95}%
              </p>
            </div>
            <div className="flex items-end justify-between sm:justify-end">
              <Button
                variant="outline"
                size="xs"
                onClick={() => onSelectTab("files")}
              >
                Mở Kho Tệp Supabase
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
