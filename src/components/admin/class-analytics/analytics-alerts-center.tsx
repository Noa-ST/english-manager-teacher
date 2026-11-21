"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Eye,
  Filter,
  RotateCcw,
  Sparkles,
  Users,
} from "lucide-react";

import { removeVietnameseTones } from "@/lib/utils";
import type { AnalyticsEarlyWarningAlert } from "@/services/teaching-journal.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AnalyticsAlertsCenterProps {
  alerts: AnalyticsEarlyWarningAlert[];
  isLoading: boolean;
  onUpdateAlert: (
    alert: AnalyticsEarlyWarningAlert,
    status: "active" | "acknowledged" | "resolved",
    note?: string,
  ) => Promise<void>;
  onBatchAcknowledge: (
    alertIds: string[],
    status: "acknowledged" | "resolved",
    note?: string,
  ) => Promise<void>;
}

export function AnalyticsAlertsCenter({
  alerts,
  isLoading,
  onUpdateAlert,
  onBatchAcknowledge,
}: AnalyticsAlertsCenterProps) {
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "active" | "acknowledged" | "resolved"
  >("active");
  const [severityFilter, setSeverityFilter] = React.useState<
    "all" | "high" | "medium"
  >("all");
  const [searchText, setSearchText] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  const [pendingAction, setPendingAction] = React.useState<{
    alert: AnalyticsEarlyWarningAlert;
    targetStatus: "acknowledged" | "resolved";
  } | null>(null);
  const [actionNote, setActionNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const filteredAlerts = React.useMemo(() => {
    const q = removeVietnameseTones(searchText.trim().toLowerCase());
    return alerts.filter((a) => {
      if (statusFilter === "active") {
        if (a.ackStatus !== "active" && a.ackStatus !== "acknowledged") {
          return false;
        }
      } else if (statusFilter !== "all" && a.ackStatus !== statusFilter) {
        return false;
      }

      if (severityFilter !== "all" && a.severity !== severityFilter) {
        return false;
      }

      if (q) {
        const hay = removeVietnameseTones(
          `${a.title} ${a.detail} ${a.studentName ?? ""} ${a.studentCode ?? ""} ${a.classCode}`.toLowerCase(),
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [alerts, statusFilter, severityFilter, searchText]);

  const unacknowledgedIds = React.useMemo(
    () =>
      filteredAlerts
        .filter((a) => a.ackStatus === "active")
        .map((a) => a.alertId),
    [filteredAlerts],
  );

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedAlerts = filteredAlerts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const openNoteModal = (
    alert: AnalyticsEarlyWarningAlert,
    targetStatus: "acknowledged" | "resolved",
  ) => {
    setPendingAction({ alert, targetStatus });
    setActionNote(alert.note ?? "");
  };

  const handleConfirmAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAction) return;
    setSubmitting(true);
    try {
      await onUpdateAlert(
        pendingAction.alert,
        pendingAction.targetStatus,
        actionNote.trim() || undefined,
      );
      setPendingAction(null);
      setActionNote("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle
                className="size-4 text-amber-600"
                aria-hidden="true"
              />
              <h2 className="font-heading text-base font-bold text-foreground">
                Trung tâm Cảnh báo sớm & Can thiệp Sư phạm ({filteredAlerts.length})
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tự động đối chiếu chuyên cần, BTVN, điểm kiểm tra công bố và tiến độ khung chương trình.
            </p>
          </div>

          {unacknowledgedIds.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void onBatchAcknowledge(unacknowledgedIds, "acknowledged")
              }
              className="h-8 shrink-0 text-xs whitespace-nowrap"
            >
              <CheckCheck className="size-3.5 text-primary" aria-hidden="true" />
              Đánh dấu đã xem ({unacknowledgedIds.length})
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                [
                  "active",
                  `Đang cần chú ý (${
                    alerts.filter(
                      (a) =>
                        a.ackStatus === "active" ||
                        a.ackStatus === "acknowledged",
                    ).length
                  })`,
                ],
                [
                  "acknowledged",
                  `Đã xem (${alerts.filter((a) => a.ackStatus === "acknowledged").length})`,
                ],
                [
                  "resolved",
                  `Đã xử lý (${alerts.filter((a) => a.ackStatus === "resolved").length})`,
                ],
                ["all", `Tất cả (${alerts.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setStatusFilter(key);
                  setPage(1);
                }}
                className={`h-8 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Lọc theo mức độ cảnh báo"
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value as "all" | "high" | "medium");
                setPage(1);
              }}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs"
            >
              <option value="all">Mọi mức độ</option>
              <option value="high">Ưu tiên cao</option>
              <option value="medium">Mức trung bình</option>
            </select>

            <Input
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm học viên, lớp, cảnh báo..."
              className="h-8 w-full text-xs sm:w-52"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-xs text-muted-foreground">
          Đang tổng hợp và phân tích dữ liệu lớp học...
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Sparkles
            className="size-9 text-emerald-600/50"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-semibold text-foreground">
            Không có cảnh báo nào khớp bộ lọc
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Các chỉ số học vụ trong phạm vi đang chọn đều ở trạng thái ổn định.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {paginatedAlerts.map((alert) => (
              <div
                key={alert.alertId}
                className={`flex flex-col justify-between gap-3 rounded-xl border p-4 text-xs transition-all ${
                  alert.ackStatus === "resolved"
                    ? "border-border bg-muted/20 opacity-80"
                    : alert.severity === "high"
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-amber-500/40 bg-amber-500/5"
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          alert.severity === "high" ? "destructive" : "warning"
                        }
                        className="text-[10px]"
                      >
                        {alert.metricLabel}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {alert.classCode}
                      </Badge>
                      {alert.studentName && (
                        <span className="font-bold text-foreground">
                          {alert.studentName} ({alert.studentCode})
                        </span>
                      )}
                    </div>

                    {alert.ackStatus === "acknowledged" && (
                      <Badge variant="outline" className="text-[10px]">
                        Đã xem
                      </Badge>
                    )}
                    {alert.ackStatus === "resolved" && (
                      <Badge variant="success" className="text-[10px]">
                        Đã xử lý
                      </Badge>
                    )}
                  </div>

                  <p className="font-heading text-sm font-bold text-foreground">
                    {alert.title}
                  </p>
                  <p className="text-muted-foreground">{alert.detail}</p>
                  <p className="rounded-lg bg-background/80 p-2 text-[11px] font-medium text-primary">
                    <strong>Khuyến nghị:</strong> {alert.suggestion}
                  </p>
                  {alert.note && (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 text-[11px] text-emerald-900">
                      <strong>Ghi chú xử lý:</strong> {alert.note}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                  <div>
                    {alert.studentId ? (
                      <Link
                        href={{
                          pathname: "/students",
                          query: {
                            search: alert.studentCode ?? alert.studentName ?? "",
                          },
                        }}
                        className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <Users className="size-3" aria-hidden="true" />
                        Mở hồ sơ HS
                      </Link>
                    ) : (
                      <Link
                        href={{
                          pathname: "/classes",
                          query: { classId: alert.classId },
                        }}
                        className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <Filter className="size-3" aria-hidden="true" />
                        Xem lộ trình lớp
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {alert.ackStatus === "active" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => openNoteModal(alert, "acknowledged")}
                        className="h-7 text-[11px]"
                      >
                        <Eye className="size-3" aria-hidden="true" />
                        Đánh dấu đã xem
                      </Button>
                    )}
                    {alert.ackStatus !== "resolved" ? (
                      <Button
                        type="button"
                        size="xs"
                        onClick={() => openNoteModal(alert, "resolved")}
                        className="h-7 text-[11px]"
                      >
                        <Check className="size-3" aria-hidden="true" />
                        Đã xử lý
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() =>
                          void onUpdateAlert(alert, "active", undefined)
                        }
                        className="h-7 text-[11px]"
                      >
                        <RotateCcw className="size-3" aria-hidden="true" />
                        Mở lại
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredAlerts.length > 0 && (
            <PaginationBar
              page={currentPage}
              totalPages={totalPages}
              totalItems={filteredAlerts.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setPage(1);
              }}
              pageSizeOptions={[6, 12, 24]}
            />
          )}
        </div>
      )}

      {/* Pedagogical Intervention Note Modal */}
      <ModalDialog
        open={Boolean(pendingAction)}
        onClose={() => setPendingAction(null)}
        title={
          pendingAction?.targetStatus === "resolved"
            ? "Xác nhận Đã xử lý cảnh báo"
            : "Đánh dấu Đã xem cảnh báo"
        }
        description={pendingAction?.alert.title}
        size="sm"
      >
        <form onSubmit={handleConfirmAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="alert-ack-note">
              Ghi chú biện pháp xử lý / trao đổi phụ huynh (tùy chọn)
            </Label>
            <textarea
              id="alert-ack-note"
              rows={3}
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              placeholder="Ví dụ: Đã gọi phụ huynh thống nhất lịch phụ đạo Writing tối Thứ 7..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingAction(null)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Đang lưu..." : "Xác nhận lưu"}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </section>
  );
}
