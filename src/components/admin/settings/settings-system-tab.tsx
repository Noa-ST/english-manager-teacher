"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  History,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { SettingsAuditLogEntry } from "@/services/classroom-data";
import {
  SETTINGS_AUDIT_ACTION_LABELS,
  SETTINGS_FIELD_LABELS,
} from "@/services/settings-helpers";
import type { SystemHealthSummary } from "@/services/settings.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function SettingsSystemTab({
  health,
  auditLogs,
  onResetSettings,
  onExportSnapshot,
  isResetting,
  isExporting,
}: {
  health: SystemHealthSummary | null;
  auditLogs: SettingsAuditLogEntry[];
  onResetSettings: () => Promise<void>;
  onExportSnapshot: () => Promise<void>;
  isResetting: boolean;
  isExporting: boolean;
}) {
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState<string>("all");

  const filteredLogs = React.useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (!q) return true;
      return (
        log.summary.toLowerCase().includes(q) ||
        log.actorId.toLowerCase().includes(q) ||
        log.changedFields.some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [auditLogs, searchTerm, actionFilter]);

  return (
    <div className="space-y-6">
      {/* Row 1: Health Checks & Snapshot/Reset Tools */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: System Health Check (7 cols) */}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Activity className="size-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Kiểm tra Sức khỏe Hạ tầng (Health Check)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Khóa bí mật (.env) luôn giữ phía máy chủ và ẩn hoàn toàn khỏi phản hồi.
                </p>
              </div>
            </div>
            <Badge
              variant={
                health?.overallStatus === "healthy" ? "success" : "warning"
              }
            >
              {health?.overallStatus === "healthy"
                ? "Hệ thống ổn định"
                : "Có khuyến nghị bảo mật"}
            </Badge>
          </div>

          {/* Safe Data Counts */}
          {health && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-background/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Lớp học</p>
                <p className="font-heading text-base font-bold text-foreground">
                  {health.counts.classrooms}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">HS hoạt động</p>
                <p className="font-heading text-base font-bold text-foreground">
                  {health.counts.activeStudents}/{health.counts.students}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Nhật ký dạy</p>
                <p className="font-heading text-base font-bold text-foreground">
                  {health.counts.sessions}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Tệp lưu trữ</p>
                <p className="font-heading text-base font-bold text-foreground">
                  {health.counts.storedFiles}
                </p>
              </div>
            </div>
          )}

          {/* Individual Subsystem Checks */}
          <div className="space-y-2.5">
            {(health?.checks ?? []).map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-background/60 p-3.5 sm:flex-row sm:items-center"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    {item.status === "healthy" ? (
                      <CheckCircle2
                        className="size-4 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <AlertTriangle
                        className="size-4 shrink-0 text-amber-500"
                        aria-hidden="true"
                      />
                    )}
                    <p className="text-xs font-semibold text-foreground">
                      {item.name}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.summary}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
                <Badge
                  variant={
                    item.status === "healthy"
                      ? "success"
                      : item.status === "warning"
                        ? "warning"
                        : "outline"
                  }
                  className="shrink-0 self-start sm:self-center"
                >
                  {item.status === "healthy"
                    ? "Sẵn sàng"
                    : item.status === "warning"
                      ? "Khuyến nghị"
                      : "Chế độ Mock"}
                </Badge>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Backup Snapshot & Factory Reset (5 cols) */}
        <section className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-5">
          <div className="flex items-center gap-2.5 border-b border-border pb-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-warm text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Sao lưu &amp; Khôi phục Cài đặt
              </h2>
              <p className="text-xs text-muted-foreground">
                Bảo toàn an toàn dữ liệu vận hành và cấu hình mặc định.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-background/70 p-4">
            <h3 className="text-xs font-bold text-foreground">
              Xuất bản sao lưu cấu hình &amp; vận hành (JSON)
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tạo tệp JSON gồm hồ sơ thương hiệu, danh sách lớp học, tóm tắt học viên, thư mục học liệu và tin tức CMS. Mã PIN tra cứu và các khóa bí mật được che giấu tự động (<code className="font-mono">[REDACTED]</code>).
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onExportSnapshot()}
              disabled={isExporting}
              className="w-full"
            >
              <Download className="size-4" aria-hidden="true" />
              {isExporting
                ? "Đang đóng gói sao lưu..."
                : "Xuất bản sao lưu JSON"}
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <h3 className="text-xs font-bold text-destructive">
              Khôi phục cài đặt mặc định
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Đưa toàn bộ Hồ sơ Thương hiệu giáo viên, Học kỳ, PIN mặc định (<code className="font-mono">123456</code>), thời hạn Signed URL (<code className="font-mono">900s</code>) và ngưỡng chuyên cần (<code className="font-mono">90%</code>) về chuẩn ban đầu. Không xóa dữ liệu lớp học hay học sinh.
            </p>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setResetConfirmOpen(true)}
              disabled={isResetting}
              className="w-full"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {isResetting
                ? "Đang khôi phục..."
                : "Khôi phục cài đặt mặc định"}
            </Button>
          </div>
        </section>
      </div>

      {/* Row 2: Settings Audit Trail */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-secondary/40 text-primary">
              <History className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Nhật ký Thay đổi Cài đặt &amp; Tài khoản ({filteredLogs.length}/
                {auditLogs.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Ghi nhận mọi thao tác cấu hình, đổi PIN, sao lưu và cấp/khóa tài khoản học sinh (đã ẩn toàn bộ mật khẩu/PIN).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm chi tiết thay đổi..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="Lọc theo hành động"
              className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
            >
              <option value="all">Tất cả hành động</option>
              {Object.entries(SETTINGS_AUDIT_ACTION_LABELS).map(
                ([action, label]) => (
                  <option key={action} value={action}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={<History className="size-5" aria-hidden="true" />}
            title="Chưa có nhật ký thay đổi phù hợp"
            description="Các thay đổi cài đặt, đổi PIN bảo mật, xuất sao lưu hoặc cấp tài khoản mới sẽ tự động ghi nhận tại đây."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Hành động</TableHead>
                  <TableHead>Tác nhân</TableHead>
                  <TableHead>Trường thay đổi</TableHead>
                  <TableHead>Chi tiết (Đã lọc nhạy cảm)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.action === "RESET_SETTINGS"
                            ? "warning"
                            : log.action === "UPDATE_SECURITY" ||
                                log.action === "RESET_STUDENT_PASSWORD"
                              ? "info"
                              : "secondary"
                        }
                      >
                        {SETTINGS_AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground">
                      {log.actorId}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.changedFields.length > 0
                        ? log.changedFields
                            .map((f) => SETTINGS_FIELD_LABELS[f] ?? f)
                            .join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-foreground">
                      {log.summary}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={() => void onResetSettings()}
        title="Khôi phục toàn bộ cài đặt về mặc định?"
        description="Hồ sơ thương hiệu giáo viên, học kỳ hiện tại, mã PIN tra cứu mặc định (123456), thời hạn Signed URL (900s) và ngưỡng chuyên cần (90%) sẽ được đặt lại. Toàn bộ dữ liệu lớp học và học sinh vẫn được giữ nguyên."
        confirmLabel="Xác nhận khôi phục"
        variant="destructive"
      />
    </div>
  );
}
