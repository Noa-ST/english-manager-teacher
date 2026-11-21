"use client";

import type { ClassPerformanceAnalyticsReport } from "@/services/teaching-journal.service";
import { Badge } from "@/components/ui/badge";

interface AnalyticsChartsGridProps {
  charts: ClassPerformanceAnalyticsReport["charts"];
}

export function AnalyticsChartsGrid({ charts }: AnalyticsChartsGridProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Chart 1: Weekly Attendance & Homework Trend */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <h3 className="font-heading text-sm font-bold text-foreground">
          1. Chuyên cần & Nộp bài theo Buổi học
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Tỷ lệ tham gia và hoàn thành BTVN qua từng buổi dạy thực tế
        </p>

        <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
          {charts.weeklySessions.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Chưa có dữ liệu buổi học trong khoảng thời gian đã chọn.
            </p>
          ) : (
            charts.weeklySessions.map((ws) => (
              <div key={ws.sessionId} className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="max-w-[230px] truncate font-medium text-foreground"
                    title={ws.topic}
                  >
                    {ws.label}: {ws.topic}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                    CC: <strong className="text-emerald-700">{ws.attendanceRate}%</strong>{" "}
                    · BT: <strong className="text-primary">{ws.homeworkRate}%</strong>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-border/50">
                    <div
                      className="h-full bg-emerald-600"
                      style={{ width: `${ws.attendanceRate}%` }}
                    />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border/50">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${ws.homeworkRate}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chart 2: Curriculum Progress */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <h3 className="font-heading text-sm font-bold text-foreground">
          2. Tiến độ Chương trình (Dự kiến vs Thực tế)
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Đối chiếu tuần dự kiến hiện tại với số tuần đã hoàn thành thực tế
        </p>

        <div className="mt-4 max-h-72 space-y-3.5 overflow-y-auto pr-1">
          {charts.curriculumProgress.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Không có dữ liệu lớp học.
            </p>
          ) : (
            charts.curriculumProgress.map((cp) => {
              const expectedPercent =
                cp.totalWeeks > 0
                  ? Math.round((cp.expectedWeek / cp.totalWeeks) * 100)
                  : 0;
              return (
                <div key={cp.classId} className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-foreground">
                      {cp.classCode} — {cp.className}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                      Thực tế: <strong>{cp.completedWeeks}</strong> / Dự kiến:{" "}
                      <strong>{cp.expectedWeek}</strong> ({cp.totalWeeks} tuần)
                    </span>
                  </div>
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/25"
                      style={{ width: `${expectedPercent}%` }}
                      title={`Tuần dự kiến: ${cp.expectedWeek}/${cp.totalWeeks}`}
                    />
                    <div
                      className={`relative h-full transition-all ${
                        cp.isBehind ? "bg-amber-500" : "bg-primary"
                      }`}
                      style={{ width: `${cp.progressPercent}%` }}
                      title={`Tuần đã hoàn thành: ${cp.completedWeeks}/${cp.totalWeeks}`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chart 3: 4-Skill Assessment Performance */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <h3 className="font-heading text-sm font-bold text-foreground">
          3. Kết quả Trung bình 4 Kỹ năng (L · R · W · S)
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Chỉ tính trên bài kiểm tra đã công bố ({charts.skillAverages.gradedStudentCount} học viên có điểm)
        </p>

        <div className="mt-4 space-y-3">
          {[
            {
              label: "Listening",
              score: charts.skillAverages.listening,
              color: "bg-sky-600",
            },
            {
              label: "Reading",
              score: charts.skillAverages.reading,
              color: "bg-emerald-600",
            },
            {
              label: "Writing",
              score: charts.skillAverages.writing,
              color: "bg-amber-600",
            },
            {
              label: "Speaking",
              score: charts.skillAverages.speaking,
              color: "bg-purple-600",
            },
          ].map((sk) => {
            const pct = Math.min(100, Math.round((sk.score / 9) * 100));
            return (
              <div key={sk.label} className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{sk.label}</span>
                  <span className="font-mono font-bold tabular-nums text-foreground">
                    {sk.score > 0 ? sk.score.toFixed(1) : "—"} / 9.0
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-border/60">
                  <div
                    className={`h-full ${sk.color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}

          <div className="mt-3 flex items-center justify-between rounded-xl bg-warm/40 p-3">
            <span className="text-xs font-bold text-foreground">
              Overall Band Trung bình
            </span>
            <span className="font-mono text-lg font-bold tabular-nums text-primary">
              {charts.skillAverages.overall > 0
                ? charts.skillAverages.overall.toFixed(1)
                : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Chart 4: Assessment Trends Across Official Exams */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <h3 className="font-heading text-sm font-bold text-foreground">
          4. Xu hướng Điểm qua các Kỳ kiểm tra chính thức
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Theo dõi sự tiến bộ band điểm giữa các đợt đánh giá đã công bố
        </p>

        <div className="mt-4 max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {charts.assessmentTrends.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Chưa có kỳ kiểm tra đã công bố nào trong phạm vi lọc.
            </p>
          ) : (
            charts.assessmentTrends.map((trend) => (
              <div
                key={trend.assessmentTitle}
                className="space-y-1.5 rounded-xl border border-border/80 bg-muted/20 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-foreground">
                    {trend.assessmentTitle}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {trend.date}
                    </span>
                    <Badge variant="default" className="font-mono text-[11px]">
                      Overall {trend.overall.toFixed(1)}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[11px] text-muted-foreground tabular-nums">
                  <span>
                    L: <strong className="text-foreground">{trend.listening.toFixed(1)}</strong>
                  </span>
                  <span>
                    R: <strong className="text-foreground">{trend.reading.toFixed(1)}</strong>
                  </span>
                  <span>
                    W: <strong className="text-foreground">{trend.writing.toFixed(1)}</strong>
                  </span>
                  <span>
                    S: <strong className="text-foreground">{trend.speaking.toFixed(1)}</strong>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
