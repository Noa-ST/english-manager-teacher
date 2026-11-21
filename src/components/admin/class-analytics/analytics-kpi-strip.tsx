"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Layers,
  TrendingUp,
} from "lucide-react";

import type { ClassPerformanceAnalyticsReport } from "@/services/teaching-journal.service";

interface AnalyticsKpiStripProps {
  report: ClassPerformanceAnalyticsReport;
}

export function AnalyticsKpiStrip({ report }: AnalyticsKpiStripProps) {
  const { kpi, summaryMetrics } = report;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Lớp đang vận hành
          </span>
          <Layers className="size-4 shrink-0 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
            {kpi.activeClassesCount}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {summaryMetrics.onLeaveStudentsCount > 0
              ? `Miễn CB cho ${summaryMetrics.onLeaveStudentsCount} HV bảo lưu`
              : "Tất cả lớp hoạt động thực tế"}
          </p>
        </div>
      </div>

      <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Tỷ lệ chuyên cần TB
          </span>
          <CheckCircle2
            className="size-4 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
        </div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-emerald-700">
            {kpi.overallAttendanceRate}%
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Buổi có mặt / buổi bắt buộc
          </p>
        </div>
      </div>

      <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Hoàn thành BTVN TB
          </span>
          <ClipboardList
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
        </div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-primary">
            {kpi.overallHomeworkRate}%
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Bài đã nộp / bài giao về nhà
          </p>
        </div>
      </div>

      <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Tiến độ CT & Nhật ký
          </span>
          <TrendingUp className="size-4 shrink-0 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
            {kpi.overallCurriculumProgress}%
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            Hoàn tất Nhật ký: {summaryMetrics.journalCompletionRate}%
          </p>
        </div>
      </div>

      <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Học sinh cần chú ý
          </span>
          <AlertTriangle
            className="size-4 shrink-0 text-amber-600"
            aria-hidden="true"
          />
        </div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-amber-700">
            {kpi.studentsNeedingAttentionCount}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {kpi.supportRatePercent}% HV · {summaryMetrics.highSeverityCount} cảnh báo cao
          </p>
        </div>
      </div>
    </div>
  );
}
