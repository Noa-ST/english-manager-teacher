"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  Filter,
  Layers,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  CLASSROOMS_DATA,
  type ClassroomGroup,
} from "@/services/classroom-data";
import type {
  AnalyticsEarlyWarningAlert,
  ClassPerformanceAnalyticsReport,
} from "@/services/teaching-journal.service";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export default function ClassAnalyticsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialClassId = searchParams.get("classId") ?? "all";

  const [classes, setClasses] = React.useState<ClassroomGroup[]>(CLASSROOMS_DATA);
  const [report, setReport] = React.useState<ClassPerformanceAnalyticsReport | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(true);

  // Filters
  const [classFilter, setClassFilter] = React.useState<string>(initialClassId);
  const [periodFilter, setPeriodFilter] = React.useState<string>("all");
  const [programFilter, setProgramFilter] = React.useState<string>("all");
  const [alertStatusFilter, setAlertStatusFilter] = React.useState<
    "all" | "active" | "acknowledged" | "resolved"
  >("active");

  const loadAnalytics = React.useCallback(() => {
    const params = new URLSearchParams();
    if (classFilter !== "all") params.set("classId", classFilter);
    if (periodFilter !== "all") params.set("period", periodFilter);
    if (programFilter !== "all") params.set("programType", programFilter);

    apiRequest<ClassPerformanceAnalyticsReport>(
      `/api/admin/class-analytics?${params.toString()}`,
    )
      .then((res) => {
        setReport(res);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [classFilter, periodFilter, programFilter]);

  React.useEffect(() => {
    apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=false")
      .then((clsList) => {
        if (clsList && clsList.length > 0) setClasses(clsList);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleUpdateAlertStatus = async (
    alert: AnalyticsEarlyWarningAlert,
    newStatus: "active" | "acknowledged" | "resolved",
  ) => {
    try {
      await apiRequest("/api/admin/class-analytics", {
        method: "POST",
        body: JSON.stringify({
          alertId: alert.alertId,
          status: newStatus,
        }),
      });
      loadAnalytics();
      toast({
        title:
          newStatus === "resolved"
            ? "Đã đánh dấu xử lý cảnh báo"
            : newStatus === "acknowledged"
              ? "Đã đánh dấu đã xem cảnh báo"
              : "Đã mở lại cảnh báo",
        description: alert.title,
        variant: "success",
      });
    } catch {
      toast({
        title: "Không thể cập nhật trạng thái cảnh báo",
        variant: "error",
      });
    }
  };

  const filteredAlerts = React.useMemo(() => {
    if (!report) return [];
    if (alertStatusFilter === "all") return report.alerts;
    if (alertStatusFilter === "active") {
      return report.alerts.filter(
        (a) => a.ackStatus === "active" || a.ackStatus === "acknowledged",
      );
    }
    return report.alerts.filter((a) => a.ackStatus === alertStatusFilter);
  }, [report, alertStatusFilter]);

  return (
    <div className="space-y-6">
      {/* ================ HEADER ================ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="default">P1 · Decision Support Analytics</Badge>
            <span className="text-xs font-medium text-muted-foreground">
              Tổng hợp trực tiếp từ Nhật ký buổi học, Điểm danh & Bảng điểm
            </span>
          </div>
          <h1 className="mt-1 font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Phân tích Hiệu quả Lớp học
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
            Theo dõi bức tranh tổng thể về chuyên cần, tiến độ chương trình, tỷ lệ hoàn thành bài tập, xu hướng 4 kỹ năng và phát hiện sớm học sinh cần hỗ trợ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/teaching-journal" />}
            nativeButton={false}
          >
            <ClipboardList className="mr-1.5 size-4" aria-hidden="true" />
            Nhật ký giảng dạy
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/classes" />}
            nativeButton={false}
          >
            <BookOpen className="mr-1.5 size-4" aria-hidden="true" />
            Quản lý Lớp & Khung CT
          </Button>
        </div>
      </div>

      {/* ================ FILTER BAR ================ */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-muted-foreground">
              Lọc theo Lớp học
            </label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              <option value="all">Tất cả lớp đang hoạt động ({classes.length})</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.code} — {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-muted-foreground">
              Khoảng thời gian
            </label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              <option value="all">Toàn bộ Học kỳ I (2026–2027)</option>
              <option value="30d">30 ngày gần nhất</option>
              <option value="7d">7 ngày gần nhất</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-muted-foreground">
              Loại chương trình đào tạo
            </label>
            <select
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
      </div>

      {report && (
        <>
          {/* ================ A. KPI DASHBOARD OVERVIEW ================ */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Tổng số lớp đang học
                </span>
                <Layers className="size-4 text-primary" aria-hidden="true" />
              </div>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                {report.kpi.activeClassesCount}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Lớp đang vận hành thực tế
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Tỷ lệ chuyên cần
                </span>
                <CheckCircle2
                  className="size-4 text-emerald-600"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-700">
                {report.kpi.overallAttendanceRate}%
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Buổi có mặt / buổi phải tham gia
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Tỷ lệ nộp bài tập
                </span>
                <ClipboardList
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-1 font-mono text-2xl font-bold text-primary">
                {report.kpi.overallHomeworkRate}%
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Bài đã nộp / bài phải nộp
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Hoàn thành chương trình
                </span>
                <TrendingUp className="size-4 text-primary" aria-hidden="true" />
              </div>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                {report.kpi.overallCurriculumProgress}%
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Số tuần hoàn thành / tổng số tuần
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Học sinh cần chú ý
                </span>
                <AlertTriangle
                  className="size-4 text-amber-600"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-1 font-mono text-2xl font-bold text-amber-700">
                {report.kpi.studentsNeedingAttentionCount}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Chiếm {report.kpi.supportRatePercent}% tổng học viên hoạt động
              </p>
            </div>
          </div>

          {/* ================ B. CLASS COMPARISON TABLE ================ */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warm/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-primary" aria-hidden="true" />
                <h2 className="font-heading text-sm font-bold text-foreground">
                  So sánh Hiệu quả giữa các Lớp học
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">
                Học sinh chưa có điểm hoặc mới nhập học không bị tính thành 0 để đảm bảo độ chính xác của báo cáo
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Lớp học</th>
                    <th className="px-4 py-3 text-center">Sĩ số</th>
                    <th className="px-4 py-3 text-center">Chuyên cần</th>
                    <th className="px-4 py-3 text-center">Tỷ lệ nộp BTVN</th>
                    <th className="px-4 py-3">Tiến độ chương trình</th>
                    <th className="px-4 py-3 text-center">Điểm TB hợp lệ</th>
                    <th className="px-4 py-3 text-center">HS cần chú ý</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.classComparisons.map((cls) => (
                    <tr
                      key={cls.classId}
                      className="transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3.5">
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

                      <td className="px-4 py-3.5 text-center font-mono font-semibold text-foreground">
                        {cls.enrolled}/{cls.capacity}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex rounded-lg px-2 py-0.5 font-mono font-bold ${
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

                      <td className="px-4 py-3.5 text-center font-mono font-semibold text-foreground">
                        {cls.homeworkRate !== null ? `${cls.homeworkRate}%` : "—"}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-foreground">
                            {cls.curriculumProgress}% ({cls.completedWeeks}/{cls.totalWeeks} tuần)
                          </span>
                          {cls.isBehindSchedule && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700"
                            >
                              Chậm tiến độ (Dự kiến T{cls.expectedWeek})
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1.5 h-2 w-full max-w-[180px] overflow-hidden rounded-full bg-border/60">
                          <div
                            className={`h-full transition-all ${
                              cls.isBehindSchedule ? "bg-amber-500" : "bg-primary"
                            }`}
                            style={{ width: `${cls.curriculumProgress}%` }}
                          />
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center font-mono font-bold text-primary">
                        {cls.averageScore !== null
                          ? cls.averageScore.toFixed(1)
                          : "Chưa có điểm"}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {cls.attentionStudentCount > 0 ? (
                          <Badge variant="destructive" className="font-mono text-[10px]">
                            {cls.attentionStudentCount} học viên
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-500/15 text-[10px] text-emerald-700"
                          >
                            0 (Ổn định)
                          </Badge>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          render={
                            <Link
                              href={`/teaching-journal?classId=${encodeURIComponent(cls.classId)}`}
                            />
                          }
                          nativeButton={false}
                        >
                          Nhật ký ({cls.sessionsCompletedCount})
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ================ C. LEARNING PROGRESS CHARTS (3 INDICATOR GROUPS) ================ */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Chart 1: Weekly Attendance & Homework Trend */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
              <h3 className="font-heading text-sm font-bold text-foreground">
                1. Chuyên cần & Nộp bài theo Buổi học
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Theo dõi tỷ lệ tham gia và hoàn thành bài tập qua từng buổi dạy thực tế
              </p>

              <div className="mt-4 space-y-3">
                {report.charts.weeklySessions.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Chưa có dữ liệu buổi học trong khoảng thời gian này.
                  </p>
                ) : (
                  report.charts.weeklySessions.map((ws) => (
                    <div key={ws.sessionId} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span
                          className="font-medium text-foreground truncate max-w-[180px]"
                          title={ws.topic}
                        >
                          {ws.label}: {ws.topic}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          CC: <strong className="text-emerald-700">{ws.attendanceRate}%</strong> · BT:{" "}
                          <strong className="text-primary">{ws.homeworkRate}%</strong>
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

            {/* Chart 2: Curriculum Progress (Expected vs Actual Completed Weeks) */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
              <h3 className="font-heading text-sm font-bold text-foreground">
                2. Tiến độ Chương trình (Dự kiến vs Thực tế)
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Đối chiếu số tuần dự kiến hiện tại với số tuần đã hoàn thành thực tế
              </p>

              <div className="mt-4 space-y-3.5">
                {report.charts.curriculumProgress.map((cp) => {
                  const expectedPercent =
                    cp.totalWeeks > 0
                      ? Math.round((cp.expectedWeek / cp.totalWeeks) * 100)
                      : 0;
                  return (
                    <div key={cp.classId} className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          {cp.classCode} — {cp.className}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          Thực tế: <strong>{cp.completedWeeks}</strong> / Dự kiến:{" "}
                          <strong>{cp.expectedWeek}</strong> ({cp.totalWeeks} tuần)
                        </span>
                      </div>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                        {/* Expected progress marker bar */}
                        <div
                          className="absolute inset-y-0 left-0 bg-primary/25"
                          style={{ width: `${expectedPercent}%` }}
                          title={`Tuần dự kiến: ${cp.expectedWeek}/${cp.totalWeeks}`}
                        />
                        {/* Completed progress bar */}
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
                })}
              </div>
            </div>

            {/* Chart 3: 4-Skill Assessment Performance */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
              <h3 className="font-heading text-sm font-bold text-foreground">
                3. Kết quả Học tập 4 Kỹ năng (L · R · W · S)
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Điểm trung bình các kỹ năng từ các bài kiểm tra chính thức ({report.charts.skillAverages.gradedStudentCount} học viên có điểm)
              </p>

              <div className="mt-4 space-y-3">
                {[
                  {
                    label: "■ Listening",
                    score: report.charts.skillAverages.listening,
                    color: "bg-sky-600",
                  },
                  {
                    label: "■ Reading",
                    score: report.charts.skillAverages.reading,
                    color: "bg-emerald-600",
                  },
                  {
                    label: "■ Writing",
                    score: report.charts.skillAverages.writing,
                    color: "bg-amber-600",
                  },
                  {
                    label: "■ Speaking",
                    score: report.charts.skillAverages.speaking,
                    color: "bg-purple-600",
                  },
                ].map((sk) => {
                  const pct = Math.min(100, Math.round((sk.score / 9) * 100));
                  return (
                    <div key={sk.label} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          {sk.label}
                        </span>
                        <span className="font-mono font-bold text-foreground">
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

                <div className="mt-3 flex items-center justify-between rounded-xl bg-warm/40 p-3 pt-2.5">
                  <span className="text-xs font-bold text-foreground">
                    Overall Band Trung bình
                  </span>
                  <span className="font-mono text-lg font-bold text-primary">
                    {report.charts.skillAverages.overall > 0
                      ? report.charts.skillAverages.overall.toFixed(1)
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ================ D. EARLY-WARNING ALERTS (STUDENTS & CLASSES NEEDING ATTENTION) ================ */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className="size-4 text-amber-600"
                    aria-hidden="true"
                  />
                  <h2 className="font-heading text-base font-bold text-foreground">
                    Cảnh báo Học sinh & Lớp học cần quan tâm ({filteredAlerts.length})
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Hệ thống tự động đối chiếu chuyên cần, bài tập về nhà, xu hướng điểm kiểm tra và tiến độ tuần để gợi ý can thiệp sư phạm kịp thời.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant={alertStatusFilter === "active" ? "default" : "outline"}
                  onClick={() => setAlertStatusFilter("active")}
                >
                  Đang cần chú ý (
                  {
                    report.alerts.filter(
                      (a) =>
                        a.ackStatus === "active" ||
                        a.ackStatus === "acknowledged",
                    ).length
                  }
                  )
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={
                    alertStatusFilter === "acknowledged" ? "default" : "outline"
                  }
                  onClick={() => setAlertStatusFilter("acknowledged")}
                >
                  Đã xem (
                  {
                    report.alerts.filter((a) => a.ackStatus === "acknowledged")
                      .length
                  }
                  )
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={
                    alertStatusFilter === "resolved" ? "default" : "outline"
                  }
                  onClick={() => setAlertStatusFilter("resolved")}
                >
                  Đã xử lý (
                  {
                    report.alerts.filter((a) => a.ackStatus === "resolved")
                      .length
                  }
                  )
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={alertStatusFilter === "all" ? "default" : "outline"}
                  onClick={() => setAlertStatusFilter("all")}
                >
                  Tất cả ({report.alerts.length})
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Đang phân tích dữ liệu lớp học...
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Sparkles
                  className="size-9 text-emerald-600/50"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm font-semibold text-foreground">
                  Không có cảnh báo nào trong mục này
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tất cả các chỉ số học vụ hiện tại đều đang trong ngưỡng ổn định.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {filteredAlerts.map((alert) => (
                  <div
                    key={alert.alertId}
                    className={`flex flex-col justify-between gap-3 rounded-xl border p-4 text-xs transition-all ${
                      alert.ackStatus === "resolved"
                        ? "border-border bg-muted/20 opacity-75"
                        : alert.severity === "high"
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-amber-500/40 bg-amber-500/5"
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={
                              alert.severity === "high"
                                ? "destructive"
                                : "secondary"
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
                            👁 Đã xem
                          </Badge>
                        )}
                        {alert.ackStatus === "resolved" && (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-500/15 text-[10px] text-emerald-700"
                          >
                            ✓ Đã xử lý
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
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                      <div className="flex items-center gap-1.5">
                        {alert.studentId ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            render={
                              <Link
                                href={`/students?classId=${encodeURIComponent(alert.classId)}`}
                              />
                            }
                            nativeButton={false}
                            className="h-7 text-[11px]"
                          >
                            <Users className="mr-1 size-3" aria-hidden="true" />
                            Mở hồ sơ HS
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="xs"
                            render={
                              <Link
                                href={`/classes?classId=${encodeURIComponent(alert.classId)}`}
                              />
                            }
                            nativeButton={false}
                            className="h-7 text-[11px]"
                          >
                            <Filter className="mr-1 size-3" aria-hidden="true" />
                            Xem lộ trình lớp
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {alert.ackStatus === "active" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              handleUpdateAlertStatus(alert, "acknowledged")
                            }
                            className="h-7 text-[11px]"
                          >
                            <Eye className="mr-1 size-3" aria-hidden="true" />
                            Đánh dấu đã xem
                          </Button>
                        )}
                        {alert.ackStatus !== "resolved" ? (
                          <Button
                            type="button"
                            size="xs"
                            onClick={() =>
                              handleUpdateAlertStatus(alert, "resolved")
                            }
                            className="h-7 text-[11px]"
                          >
                            <Check className="mr-1 size-3" aria-hidden="true" />
                            Đã xử lý
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              handleUpdateAlertStatus(alert, "active")
                            }
                            className="h-7 text-[11px]"
                          >
                            <RotateCcw
                              className="mr-1 size-3"
                              aria-hidden="true"
                            />
                            Mở lại
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
