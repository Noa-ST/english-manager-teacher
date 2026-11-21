"use client";

import Link from "next/link";
import { Award, ShieldAlert } from "lucide-react";

import type { StudentSpotlightItem } from "@/services/class-analytics-helpers";
import { Badge } from "@/components/ui/badge";

interface AnalyticsStudentSpotlightsProps {
  atRiskStudents: StudentSpotlightItem[];
  topPerformers: StudentSpotlightItem[];
}

export function AnalyticsStudentSpotlights({
  atRiskStudents,
  topPerformers,
}: AnalyticsStudentSpotlightsProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* At-Risk Students */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
            <h2 className="font-heading text-sm font-bold text-foreground">
              Học viên cần ưu tiên can thiệp ({atRiskStudents.length})
            </h2>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Ưu tiên theo mức độ cảnh báo
          </span>
        </div>

        {atRiskStudents.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Chưa phát hiện học viên nào có rủi ro học vụ nổi bật.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border/70">
            {atRiskStudents.map((stu) => (
              <div
                key={stu.studentId}
                className="flex items-center justify-between gap-3 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">
                      {stu.studentName}
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {stu.classCode}
                    </Badge>
                    <Badge
                      variant={stu.highAlertCount > 0 ? "destructive" : "warning"}
                      className="text-[10px]"
                    >
                      {stu.activeAlertCount} cảnh báo
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {stu.highlightReason} · Chuyên cần {stu.attendanceRate}%
                  </p>
                </div>

                <Link
                  href={{
                    pathname: "/students",
                    query: { search: stu.studentCode },
                  }}
                  className="inline-flex h-7 shrink-0 items-center rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted"
                >
                  Mở hồ sơ
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Top Performers */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Award className="size-4 text-emerald-600" aria-hidden="true" />
            <h2 className="font-heading text-sm font-bold text-foreground">
              Học viên nổi bật & Tiến bộ tốt ({topPerformers.length})
            </h2>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Điểm công bố & tăng band
          </span>
        </div>

        {topPerformers.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Chưa đủ dữ liệu điểm đã công bố để xếp hạng học viên nổi bật.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border/70">
            {topPerformers.map((stu) => (
              <div
                key={stu.studentId}
                className="flex items-center justify-between gap-3 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">
                      {stu.studentName}
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {stu.classCode}
                    </Badge>
                    {stu.latestOverall !== null && (
                      <Badge variant="success" className="font-mono text-[10px]">
                        Overall {stu.latestOverall.toFixed(1)}
                      </Badge>
                    )}
                    {stu.bandDelta !== null && stu.bandDelta > 0 && (
                      <span className="font-semibold text-emerald-700 tabular-nums">
                        +{stu.bandDelta.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {stu.highlightReason}
                  </p>
                </div>

                <Link
                  href={{
                    pathname: "/students",
                    query: { search: stu.studentCode },
                  }}
                  className="inline-flex h-7 shrink-0 items-center rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted"
                >
                  Mở hồ sơ
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
