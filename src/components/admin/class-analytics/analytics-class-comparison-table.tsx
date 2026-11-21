"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";

import type { ClassHealthLevel } from "@/services/class-analytics-helpers";
import type { ClassComparisonMetric } from "@/services/teaching-journal.service";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";

interface AnalyticsClassComparisonTableProps {
  rows: ClassComparisonMetric[];
}

const HEALTH_META: Record<
  ClassHealthLevel,
  { label: string; className: string }
> = {
  healthy: {
    label: "Ổn định",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  watch: {
    label: "Theo dõi",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  "at-risk": {
    label: "Rủi ro",
    className: "border-red-200 bg-red-50 text-red-700",
  },
};

export function AnalyticsClassComparisonTable({
  rows,
}: AnalyticsClassComparisonTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warm/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-sm font-bold text-foreground">
            So sánh Hiệu quả & Sức khỏe các Lớp học
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          Chỉ tính điểm đã công bố (published); bỏ qua học sinh bảo lưu khỏi cảnh báo rủi ro.
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="Chưa có lớp học khớp bộ lọc"
            description="Hãy điều chỉnh lớp học hoặc chương trình đào tạo ở thanh lọc phía trên."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap text-muted-foreground">
                <th className="px-3.5 py-3">Lớp học</th>
                <th className="px-3 py-3 text-center">Sĩ số</th>
                <th className="px-3 py-3 text-center">Sức khỏe</th>
                <th className="px-3 py-3 text-center">Chuyên cần</th>
                <th className="px-3 py-3 text-center">Nộp BTVN</th>
                <th className="px-3.5 py-3">Tiến độ CT</th>
                <th className="px-3 py-3 text-center">Điểm TB</th>
                <th className="px-3 py-3 text-center">Cần chú ý</th>
                <th className="px-3.5 py-3 text-right">Đi tới nhanh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((cls) => {
                const healthMeta = HEALTH_META[cls.healthLevel];
                return (
                  <tr
                    key={cls.classId}
                    className="transition-colors hover:bg-muted/20"
                  >
                    <td className="px-3.5 py-3.5 align-middle">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="font-mono text-[10px]">
                          {cls.classCode}
                        </Badge>
                        <span className="font-semibold text-foreground">
                          {cls.className}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {cls.level} · Mục tiêu: {cls.targetBand}
                      </p>
                    </td>

                    <td className="px-3 py-3.5 text-center align-middle font-mono font-semibold tabular-nums text-foreground">
                      {cls.enrolled}/{cls.capacity}
                    </td>

                    <td className="px-3 py-3.5 text-center align-middle whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${healthMeta.className}`}
                      >
                        {healthMeta.label} · {cls.healthScore}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 text-center align-middle">
                      <span
                        className={`inline-flex rounded-lg px-2 py-0.5 font-mono font-bold tabular-nums ${
                          cls.attendanceRate >= 90
                            ? "bg-emerald-500/10 text-emerald-700"
                            : cls.attendanceRate >= 80
                              ? "bg-amber-500/15 text-amber-700"
                              : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {cls.attendanceRate}%
                      </span>
                    </td>

                    <td className="px-3 py-3.5 text-center align-middle font-mono font-semibold tabular-nums text-foreground">
                      {cls.homeworkRate !== null ? `${cls.homeworkRate}%` : "—"}
                    </td>

                    <td className="px-3.5 py-3.5 align-middle">
                      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                        <span className="font-mono font-bold tabular-nums text-foreground">
                          {cls.curriculumProgress}% ({cls.completedWeeks}/{cls.totalWeeks})
                        </span>
                        {cls.isBehindSchedule && (
                          <Badge
                            variant="warning"
                            className="text-[10px]"
                          >
                            Chậm (T{cls.expectedWeek})
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 h-2 w-full max-w-[160px] overflow-hidden rounded-full bg-border/60">
                        <div
                          className={`h-full transition-all ${
                            cls.isBehindSchedule ? "bg-amber-500" : "bg-primary"
                          }`}
                          style={{ width: `${cls.curriculumProgress}%` }}
                        />
                      </div>
                    </td>

                    <td className="px-3 py-3.5 text-center align-middle font-mono font-bold tabular-nums text-primary">
                      {cls.averageScore !== null
                        ? cls.averageScore.toFixed(1)
                        : "—"}
                    </td>

                    <td className="px-3 py-3.5 text-center align-middle whitespace-nowrap">
                      {cls.attentionStudentCount > 0 ? (
                        <Badge variant="destructive" className="font-mono text-[10px]">
                          {cls.attentionStudentCount} HV
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px]">
                          0 (Ổn định)
                        </Badge>
                      )}
                    </td>

                    <td className="px-3.5 py-3.5 text-right align-middle whitespace-nowrap">
                      <div className="flex flex-nowrap items-center justify-end gap-1.5">
                        <Link
                          href={{
                            pathname: "/teaching-journal",
                            query: { classId: cls.classId },
                          }}
                          className="inline-flex h-7 items-center rounded-lg border border-border bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          Nhật ký ({cls.sessionsCompletedCount})
                        </Link>
                        <Link
                          href={{
                            pathname: "/attendance",
                            query: { classId: cls.classId },
                          }}
                          className="inline-flex h-7 items-center rounded-lg border border-border bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          Điểm danh
                        </Link>
                        <Link
                          href={{
                            pathname: "/grades",
                            query: { classId: cls.classId },
                          }}
                          className="inline-flex h-7 items-center rounded-lg border border-border bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          Điểm số
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
