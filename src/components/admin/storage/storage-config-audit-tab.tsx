"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type {
  OrphanedStorageObject,
  StorageAuditLogEntry,
} from "@/services/classroom-data";
import type {
  StorageHealthStatus,
  StorageQuotaReport,
} from "@/services/storage.service";
import { AUDIT_ACTION_LABELS } from "@/services/storage-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
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

export function StorageConfigAuditTab({
  quota,
  storageStatus,
  auditLogs,
  orphanFiles,
  onRefresh,
}: {
  quota: StorageQuotaReport | null;
  storageStatus: StorageHealthStatus | null;
  auditLogs: StorageAuditLogEntry[];
  orphanFiles: OrphanedStorageObject[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();

  const [auditSearch, setAuditSearch] = React.useState("");
  const [providerFilter, setProviderFilter] = React.useState<
    "all" | "cloudinary" | "supabase"
  >("all");
  const [actionFilter, setActionFilter] = React.useState("all");
  const [cleanupDialogOpen, setCleanupDialogOpen] = React.useState(false);
  const [isCleaning, setIsCleaning] = React.useState(false);

  const filteredLogs = React.useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (providerFilter !== "all" && log.provider !== providerFilter) {
        return false;
      }
      if (actionFilter !== "all" && log.action !== actionFilter) {
        return false;
      }
      if (
        q &&
        !log.detail.toLowerCase().includes(q) &&
        !log.targetPath.toLowerCase().includes(q) &&
        !log.actorId.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [auditLogs, providerFilter, actionFilter, auditSearch]);

  const handleCleanupOrphans = async () => {
    setIsCleaning(true);
    try {
      const res = await apiRequest<{
        cleanedCount: number;
        failedCount: number;
      }>("/api/admin/storage", {
        method: "POST",
        body: JSON.stringify({ action: "cleanupOrphans" }),
      });
      toast({
        title: "Đã dọn dẹp tệp mồ côi",
        description: `Đã xóa ${res.cleanedCount} tệp mồ côi khỏi Cloud Storage${
          res.failedCount > 0 ? ` (${res.failedCount} tệp lỗi)` : ""
        }.`,
        variant: "success",
      });
      setCleanupDialogOpen(false);
      onRefresh();
    } catch (err) {
      toast({
        title: "Không thể dọn dẹp tệp mồ côi",
        description: err instanceof Error ? err.message : "Đã xảy ra lỗi.",
        variant: "error",
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Provider Routing Matrix */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-foreground">
              Bảng định tuyến Provider tự động
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Mọi yêu cầu upload sai provider đều bị chặn tự động tại tầng `StorageService`, đảm bảo cấu hình{" "}
            <span className="font-mono font-semibold text-foreground">
              {storageStatus?.routing.images ?? "cloudinary"} /{" "}
              {storageStatus?.routing.documents ?? "supabase"}
            </span>
            .
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
                <TableCell className="font-medium">
                  Avatar Giáo viên
                </TableCell>
                <TableCell>
                  <Badge variant="info">Cloudinary Free</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  english-manager/avatars/teachers
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
                <TableCell className="font-medium">
                  Podcast MP3 / M4A Công khai
                </TableCell>
                <TableCell>
                  <Badge variant="success">Supabase Free</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {storageStatus?.publicBucket ?? "english-manager-public"}
                  /podcasts/*
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  PDF Học tập Công khai
                </TableCell>
                <TableCell>
                  <Badge variant="success">Supabase Free</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {storageStatus?.publicBucket ?? "english-manager-public"}
                  /resources/*
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
                  {storageStatus?.privateBucket ?? "english-manager-private"}
                  /exams|answers/*
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Upload Limits & Free Tier Guards */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Settings2 className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-foreground">
              Giới hạn Bảo vệ Gói Free &amp; Bảo mật
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
                {quota?.limits.maxAudioSizeMb ?? 40} MB / tập
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

      {/* Orphaned Files Management Panel */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="size-4 text-amber-500"
              aria-hidden="true"
            />
            <h3 className="font-heading text-sm font-bold text-foreground">
              Quản lý Tệp mồ côi ({orphanFiles.length})
            </h3>
          </div>
          {orphanFiles.length > 0 && (
            <Button
              size="xs"
              variant="destructive"
              onClick={() => setCleanupDialogOpen(true)}
              disabled={isCleaning}
            >
              {isCleaning ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
              Dọn dẹp toàn bộ tệp mồ côi
            </Button>
          )}
        </div>

        {orphanFiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Kho lưu trữ đồng bộ hoàn hảo — không có tệp mồ côi nào chưa gắn metadata.
          </p>
        ) : (
          <div className="space-y-2">
            {orphanFiles.map((orphan) => (
              <div
                key={orphan.id}
                className="flex flex-col justify-between gap-1 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-xs sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono font-semibold text-foreground">
                    {orphan.cloudinaryPublicId ?? orphan.storagePath}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {orphan.reason}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {orphan.provider.toUpperCase()} ·{" "}
                  {new Date(orphan.createdAt).toLocaleString("vi-VN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit Logs */}
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-heading text-sm font-bold text-foreground">
            Nhật ký Thao tác Quản trị Lưu trữ ({filteredLogs.length}/
            {auditLogs.length}) — Đã ẩn Token &amp; Signed URL
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Lọc chi tiết nhật ký..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <select
              value={providerFilter}
              onChange={(e) =>
                setProviderFilter(
                  e.target.value as "all" | "cloudinary" | "supabase",
                )
              }
              aria-label="Lọc nhật ký theo Provider"
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
            >
              <option value="all">Mọi Provider</option>
              <option value="cloudinary">Cloudinary</option>
              <option value="supabase">Supabase</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="Lọc nhật ký theo Hành động"
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
            >
              <option value="all">Mọi hành động</option>
              {Object.entries(AUDIT_ACTION_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Chưa có bản ghi nhật ký phù hợp trong phiên làm việc hiện tại.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs sm:flex-row sm:items-center"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={
                        log.status === "SUCCESS"
                          ? "success"
                          : log.status === "ROLLED_BACK"
                            ? "warning"
                            : "destructive"
                      }
                      className="text-[10px]"
                    >
                      {log.status}
                    </Badge>
                    <span className="font-semibold text-primary">
                      {AUDIT_ACTION_LABELS[log.action] || log.action}
                    </span>
                  </div>
                  <p className="text-foreground">{log.detail}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {log.provider.toUpperCase()} · {log.actorId} ·{" "}
                  {new Date(log.createdAt).toLocaleTimeString("vi-VN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={cleanupDialogOpen}
        onClose={() => setCleanupDialogOpen(false)}
        onConfirm={handleCleanupOrphans}
        title="Dọn dẹp toàn bộ tệp mồ côi?"
        description={`Hệ thống sẽ xóa ${orphanFiles.length} tệp mồ côi khỏi Cloudinary Free / Supabase Storage và ghi nhận vào Audit Log.`}
        confirmLabel="Dọn dẹp ngay"
        variant="destructive"
      />
    </div>
  );
}
