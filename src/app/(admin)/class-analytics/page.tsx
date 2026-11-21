"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  Download,
  FileText,
  RefreshCw,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { useTodayIso } from "@/lib/use-today-iso";
import {
  buildAnalyticsExecutiveSummary,
  buildClassAnalyticsCsv,
} from "@/services/class-analytics-helpers";
import type { ClassroomGroup } from "@/services/classroom-data";
import { addDaysIso } from "@/services/schedule-calendar-helpers";
import type {
  AnalyticsEarlyWarningAlert,
  ClassPerformanceAnalyticsReport,
} from "@/services/teaching-journal.service";
import { AnalyticsAlertsCenter } from "@/components/admin/class-analytics/analytics-alerts-center";
import { AnalyticsChartsGrid } from "@/components/admin/class-analytics/analytics-charts-grid";
import { AnalyticsClassComparisonTable } from "@/components/admin/class-analytics/analytics-class-comparison-table";
import { AnalyticsKpiStrip } from "@/components/admin/class-analytics/analytics-kpi-strip";
import { AnalyticsStudentSpotlights } from "@/components/admin/class-analytics/analytics-student-spotlights";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

function ClassAnalyticsWorkspace() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialClassId = searchParams.get("classId") ?? "all";

  const [classes, setClasses] = React.useState<ClassroomGroup[]>([]);
  const [report, setReport] =
    React.useState<ClassPerformanceAnalyticsReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [reloadNonce, setReloadNonce] = React.useState(0);

  // Filters
  const todayIso = useTodayIso();
  const [classFilter, setClassFilter] = React.useState<string>(initialClassId);
  const [periodFilter, setPeriodFilter] = React.useState<string>("all");
  const [fromDateOverride, setFromDate] = React.useState<string | null>(null);
  const [toDateOverride, setToDate] = React.useState<string | null>(null);
  const fromDate = fromDateOverride ?? addDaysIso(todayIso, -29);
  const toDate = toDateOverride ?? todayIso;
  const [programFilter, setProgramFilter] = React.useState<string>("all");

  // Executive Summary Modal
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [copiedSummary, setCopiedSummary] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (classFilter !== "all") params.set("classId", classFilter);
    if (programFilter !== "all") params.set("programType", programFilter);
    if (periodFilter === "custom") {
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
    } else if (periodFilter !== "all") {
      params.set("period", periodFilter);
    }

    Promise.all([
      apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=false"),
      apiRequest<ClassPerformanceAnalyticsReport>(
        `/api/admin/class-analytics?${params.toString()}`,
      ),
    ])
      .then(([clsList, analyticsReport]) => {
        if (!active) return;
        setClasses(clsList ?? []);
        setReport(analyticsReport);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setIsLoading(false);
        toast({
          variant: "error",
          title: "Không thể tải báo cáo Phân tích Hiệu quả",
          description: err instanceof Error ? err.message : undefined,
        });
      });

    return () => {
      active = false;
    };
  }, [
    classFilter,
    periodFilter,
    fromDate,
    toDate,
    programFilter,
    reloadNonce,
    toast,
  ]);

  const executiveSummaryText = React.useMemo(
    () => (report ? buildAnalyticsExecutiveSummary(report) : ""),
    [report],
  );

  const handleUpdateAlertStatus = async (
    alert: AnalyticsEarlyWarningAlert,
    newStatus: "active" | "acknowledged" | "resolved",
    note?: string,
  ) => {
    try {
      await apiRequest("/api/admin/class-analytics", {
        method: "POST",
        body: JSON.stringify({
          alertId: alert.alertId,
          status: newStatus,
          ...(note ? { note } : {}),
        }),
      });
      setReloadNonce((n) => n + 1);
      toast({
        variant: "success",
        title:
          newStatus === "resolved"
            ? "Đã đánh dấu xử lý cảnh báo"
            : newStatus === "acknowledged"
              ? "Đã đánh dấu đã xem cảnh báo"
              : "Đã mở lại cảnh báo",
        description: alert.title,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể cập nhật trạng thái cảnh báo",
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleBatchAcknowledge = async (
    alertIds: string[],
    status: "acknowledged" | "resolved",
    note?: string,
  ) => {
    try {
      const res = await apiRequest<{ updatedCount: number }>(
        "/api/admin/class-analytics",
        {
          method: "POST",
          body: JSON.stringify({
            action: "batch-ack",
            alertIds,
            status,
            ...(note ? { note } : {}),
          }),
        },
      );
      setReloadNonce((n) => n + 1);
      toast({
        variant: "success",
        title: `Đã cập nhật ${res.updatedCount} cảnh báo`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể cập nhật hàng loạt cảnh báo",
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleExportCsv = () => {
    if (!report) return;
    const csv = buildClassAnalyticsCsv(report);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `phan-tich-hieu-qua-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({
      variant: "success",
      title: "Đã xuất báo cáo Phân tích Hiệu quả dạng CSV",
    });
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(executiveSummaryText);
      setCopiedSummary(true);
      toast({
        variant: "success",
        title: "Đã sao chép tóm tắt điều hành",
      });
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      toast({
        variant: "error",
        title: "Không thể tự động sao chép",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Phân tích Hiệu quả Lớp học
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Tổng hợp chuyên cần, tiến độ chương trình, tỷ lệ BTVN, xu hướng 4 kỹ năng đã công bố và cảnh báo hỗ trợ kịp thời.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!report}
            onClick={() => setSummaryOpen(true)}
            className="h-9 shrink-0 px-3 text-xs whitespace-nowrap"
          >
            <FileText className="size-4 text-primary" aria-hidden="true" />
            Tóm tắt báo cáo
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!report}
            onClick={handleExportCsv}
            className="h-9 shrink-0 px-3 text-xs whitespace-nowrap"
          >
            <Download className="size-4" aria-hidden="true" />
            Xuất CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="h-9 shrink-0 px-3 text-xs whitespace-nowrap"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Làm mới
          </Button>
          <Link
            href="/teaching-journal"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted"
          >
            <ClipboardList className="size-4 text-primary" aria-hidden="true" />
            Nhật ký giảng dạy
          </Link>
          <Link
            href="/classes"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted"
          >
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
            Quản lý Lớp
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label
              htmlFor="analytics-class-filter"
              className="block text-[11px] font-semibold text-muted-foreground"
            >
              Lọc theo Lớp học
            </label>
            <select
              id="analytics-class-filter"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              <option value="all">
                Tất cả lớp đang hoạt động ({classes.length})
              </option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.code} — {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="analytics-period-filter"
              className="block text-[11px] font-semibold text-muted-foreground"
            >
              Khoảng thời gian
            </label>
            <select
              id="analytics-period-filter"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              <option value="all">Toàn bộ Học kỳ I (2026–2027)</option>
              <option value="30d">30 ngày gần nhất</option>
              <option value="7d">7 ngày gần nhất</option>
              <option value="custom">Tùy chọn khoảng ngày...</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="analytics-program-filter"
              className="block text-[11px] font-semibold text-muted-foreground"
            >
              Chương trình đào tạo
            </label>
            <select
              id="analytics-program-filter"
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              <option value="all">Tất cả chương trình</option>
              <option value="IELTS">Luyện thi IELTS (Foundation / Intensive)</option>
              <option value="Writing">Academic Writing & Critical Thinking</option>
              <option value="Junior">Junior Academic Explorers</option>
              <option value="Basic">Basic Level (Lấy lại gốc)</option>
            </select>
          </div>
        </div>

        {periodFilter === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span>Từ ngày:</span>
            <Input
              type="date"
              aria-label="Phân tích từ ngày"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 w-40 text-xs"
            />
            <span>Đến ngày:</span>
            <Input
              type="date"
              aria-label="Phân tích đến ngày"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 w-40 text-xs"
            />
          </div>
        )}
      </div>

      {isLoading && !report ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : report ? (
        <>
          <AnalyticsKpiStrip report={report} />

          <AnalyticsClassComparisonTable rows={report.classComparisons} />

          <AnalyticsChartsGrid charts={report.charts} />

          <AnalyticsStudentSpotlights
            atRiskStudents={report.studentSpotlights.atRiskStudents}
            topPerformers={report.studentSpotlights.topPerformers}
          />

          <AnalyticsAlertsCenter
            alerts={report.alerts}
            isLoading={isLoading}
            onUpdateAlert={handleUpdateAlertStatus}
            onBatchAcknowledge={handleBatchAcknowledge}
          />
        </>
      ) : null}

      <ModalDialog
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="Tóm tắt Điều hành Hiệu quả Lớp học"
        description="Bản tổng hợp nhanh tình hình lớp, sức khỏe giảng dạy và các cảnh báo ưu tiên cao."
        size="lg"
      >
        <div className="space-y-3">
          <textarea
            readOnly
            rows={14}
            value={executiveSummaryText}
            className="w-full rounded-xl border border-input bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSummaryOpen(false)}
            >
              Đóng
            </Button>
            <Button type="button" onClick={() => void handleCopySummary()}>
              {copiedSummary ? (
                <>
                  <Check className="size-4" aria-hidden="true" />
                  Đã sao chép
                </>
              ) : (
                <>
                  <Copy className="size-4" aria-hidden="true" />
                  Sao chép báo cáo
                </>
              )}
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}

export default function ClassAnalyticsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      }
    >
      <ClassAnalyticsWorkspace />
    </React.Suspense>
  );
}
