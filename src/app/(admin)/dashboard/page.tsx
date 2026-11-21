"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  ExternalLink,
  FolderUp,
  Layers,
  Megaphone,
  Plus,
  Search,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  AdminStudentRecord,
  AnnouncementItem,
  ClassroomGroup,
  WeeklyClassSession,
} from "@/services/classroom-data";
import {
  computeDashboardMetrics,
  type PrioritizedAlertItem,
} from "@/services/dashboard.service";
import {
  addDaysIso,
  formatShortDateVi,
  getMondayOfWeek,
} from "@/services/schedule-calendar-helpers";
import { apiRequest } from "@/lib/api-client";
import { useTodayIso } from "@/lib/use-today-iso";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export default function AdminDashboardPage() {
  const { toast } = useToast();

  const [classes, setClasses] = React.useState<ClassroomGroup[]>([]);
  const [sessions, setSessions] = React.useState<WeeklyClassSession[]>([]);
  const [students, setStudents] = React.useState<AdminStudentRecord[]>([]);
  const [announcements, setAnnouncements] = React.useState<AnnouncementItem[]>([]);

  // Interactive Quick Action modal states
  const [quickAnnouncementOpen, setQuickAnnouncementOpen] = React.useState(false);

  // Quick announcement form
  const [quickAnnTitle, setQuickAnnTitle] = React.useState("");
  const [quickAnnExcerpt, setQuickAnnExcerpt] = React.useState("");

  React.useEffect(() => {
    apiRequest<{
      classes: ClassroomGroup[];
      sessions: WeeklyClassSession[];
      students: AdminStudentRecord[];
      announcements: AnnouncementItem[];
    }>("/api/admin/dashboard")
      .then((res) => {
        if (Array.isArray(res.classes)) {
          setClasses(res.classes);
        }
        if (Array.isArray(res.sessions)) {
          setSessions(res.sessions);
        }
        if (Array.isArray(res.students)) {
          setStudents(res.students);
        }
        if (Array.isArray(res.announcements)) {
          setAnnouncements(res.announcements);
        }
      })
      .catch(() => {});
  }, []);

  // Computed metrics using unified dashboard service
  const metrics = React.useMemo(() => {
    return computeDashboardMetrics({
      classes,
      sessions,
      students,
      announcements,
    });
  }, [classes, sessions, students, announcements]);

  // View mode for Class Performance card: "tracks" (theo khối) or "classes" (theo từng lớp)
  const [classViewMode, setClassViewMode] = React.useState<"tracks" | "classes">("tracks");

  // Alert Center Modal state
  const [alertHubOpen, setAlertHubOpen] = React.useState(false);
  const [alertFilterCategory, setAlertFilterCategory] = React.useState<
    "all" | "critical" | "tuition" | "academic"
  >("all");
  const [alertSearchQuery, setAlertSearchQuery] = React.useState("");
  const [copiedAlertId, setCopiedAlertId] = React.useState<string | null>(null);

  const handleCopyReminder = (item: PrioritizedAlertItem) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(item.quickReminderText);
      setCopiedAlertId(item.id);
      setTimeout(() => setCopiedAlertId(null), 2500);
      toast({
        title: "Đã sao chép tin nhắn nhắc nhở",
        description: `Mẫu tin gửi học sinh/phụ huynh ${item.studentName} đã được lưu vào bộ nhớ tạm.`,
        variant: "success",
      });
    }
  };

  const filteredAlerts = React.useMemo(() => {
    return metrics.prioritizedAlerts.filter((item) => {
      if (alertFilterCategory === "critical" && item.severity !== "critical") return false;
      if (alertFilterCategory === "tuition" && item.category !== "tuition") return false;
      if (alertFilterCategory === "academic" && item.category !== "academic" && item.category !== "attendance")
        return false;

      if (alertSearchQuery.trim()) {
        const q = alertSearchQuery.toLowerCase();
        const matchesName = item.studentName.toLowerCase().includes(q);
        const matchesCode = item.studentCode.toLowerCase().includes(q);
        const matchesClass = item.className.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        return matchesName || matchesCode || matchesClass || matchesDesc;
      }
      return true;
    });
  }, [metrics.prioritizedAlerts, alertFilterCategory, alertSearchQuery]);

  const handleQuickPostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAnnTitle.trim()) return;
    try {
      const created = await apiRequest<AnnouncementItem>("/api/admin/cms", {
        method: "POST",
        body: JSON.stringify({
          module: "announcements",
          payload: {
            title: quickAnnTitle.trim(),
            excerpt: quickAnnExcerpt.trim(),
            content: [quickAnnExcerpt.trim()],
            category: "urgent",
            isPinned: true,
            status: "published",
          },
        }),
      });
      if (created) {
        setAnnouncements((prev) => [created, ...prev]);
      }
    } catch {
      // Fallback handled gracefully
    }
    toast({
      title: "Đã xuất bản thông báo nhanh",
      description: `Bản tin "${quickAnnTitle.trim()}" đã hiển thị trên Cổng học sinh.`,
      variant: "success",
    });
    setQuickAnnTitle("");
    setQuickAnnExcerpt("");
    setQuickAnnouncementOpen(false);
  };

  const todayIso = useTodayIso();
  const currentWeekStart = getMondayOfWeek(todayIso);
  const currentWeekEnd = addDaysIso(currentWeekStart, 6);

  return (
    <div className="space-y-7">
      {/* Top Workspace Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-widest text-[#496B9A] uppercase">
            Học kỳ I · Tuần thực tế ({formatShortDateVi(currentWeekStart)} –{" "}
            {formatShortDateVi(currentWeekEnd)}/{currentWeekEnd.slice(0, 4)})
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Tổng quan Học vụ — ThS. Nguyễn Minh Anh
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hôm nay có{" "}
            <strong className="font-semibold text-foreground">
              {metrics.todaySessionsCount} ca dạy
            </strong>{" "}
            và{" "}
            <strong className="font-semibold text-foreground">
              {metrics.urgentAnnouncementsCount} thông báo quan trọng
            </strong>{" "}
            đang hiển thị trên cổng thông tin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            className="h-9 rounded-lg bg-card px-3.5 text-xs font-medium"
            render={<Link href="/students?create=1" />}
            nativeButton={false}
          >
            <UserPlus className="size-3.5 text-primary" aria-hidden="true" />
            Thêm học sinh
          </Button>
          <Button
            className="h-9 rounded-lg px-3.5 text-xs font-semibold"
            render={
              <Link
                href={(() => {
                  const firstToday = metrics.todaySessions[0];
                  const targetCls = classes.find((c) => c.code === firstToday?.classCode);
                  return targetCls
                    ? `/attendance?classId=${targetCls.id}&sessionId=${encodeURIComponent(firstToday.id)}&date=${todayIso}`
                    : `/attendance?date=${todayIso}`;
                })()}
              />
            }
            nativeButton={false}
          >
            <ClipboardCheck className="size-3.5" aria-hidden="true" />
            Điểm danh ca hôm nay
          </Button>
        </div>
      </div>

      {/* 1. KPI Summary Strip */}
      <section aria-label="Chỉ số vận hành lớp học" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tổng số học viên đang học
            </span>
            <Users className="size-4 text-[#496B9A]" aria-hidden="true" />
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold text-foreground">
            {metrics.totalStudents}
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2 text-xs">
            <span className="font-medium text-emerald-700">
              +{metrics.newStudentsThisMonth} học viên tháng 11
            </span>
            <Link href="/students" className="font-medium text-primary hover:underline">
              Hồ sơ →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Lớp học đang vận hành
            </span>
            <Layers className="size-4 text-[#496B9A]" aria-hidden="true" />
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold text-foreground">
            {metrics.activeClassesCount}
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2 text-xs">
            <span className="text-muted-foreground">
              Công suất lấp đầy: {metrics.occupancyRate}%
            </span>
            <Link href="/classes" className="font-medium text-primary hover:underline">
              Chi tiết →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Ca dạy trong tuần
            </span>
            <Calendar className="size-4 text-[#496B9A]" aria-hidden="true" />
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold text-foreground">
            {metrics.weeklySessionsCount}
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2 text-xs">
            <span className="text-muted-foreground">
              {metrics.scheduleConflictCount} xung đột lịch dạy
            </span>
            <Link href="/schedule" className="font-medium text-primary hover:underline">
              Lịch dạy →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tỷ lệ chuyên cần trung bình
            </span>
            <TrendingUp className="size-4 text-emerald-700" aria-hidden="true" />
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold text-emerald-700">
            {metrics.avgAttendanceRate}%
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2 text-xs">
            <span className="text-muted-foreground">Mục tiêu học kỳ: ≥ 92%</span>
            <Link href="/attendance" className="font-medium text-primary hover:underline">
              Điểm danh →
            </Link>
          </div>
        </div>
      </section>

      {/* 2. QUICK ACTIONS BAR */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-base font-bold text-foreground">
              Thao tác tác vụ nhanh (Quick Actions)
            </h2>
            <p className="text-xs text-muted-foreground">
              Truy cập 1 chạm vào các nghiệp vụ quản lý lớp học thường xuyên nhất.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Link
            href="/students?create=1"
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UserPlus className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Thêm học sinh</p>
              <p className="text-[11px] text-muted-foreground">Tạo mã HS mới</p>
            </div>
          </Link>

          <Link
            href="/classes"
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
              <Plus className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Tạo lớp học</p>
              <p className="text-[11px] text-muted-foreground">Thiết lập sĩ số & ca</p>
            </div>
          </Link>

          <Link
            href="/attendance"
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-warm text-primary">
              <ClipboardCheck className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Điểm danh nhanh</p>
              <p className="text-[11px] text-muted-foreground">1 chạm toàn lớp</p>
            </div>
          </Link>

          <Link
            href="/grades"
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
              <Award className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Nhập bảng điểm</p>
              <p className="text-[11px] text-muted-foreground">4 kỹ năng & nhận xét</p>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setQuickAnnouncementOpen(true)}
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-highlight/30 text-foreground">
              <Megaphone className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Đăng thông báo</p>
              <p className="text-[11px] text-muted-foreground">Xuất bản bản tin</p>
            </div>
          </button>

          <Link
            href="/storage"
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-warm text-primary">
              <FolderUp className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Tải lên tài liệu</p>
              <p className="text-[11px] text-muted-foreground">Cloud R2 / S3</p>
            </div>
          </Link>
        </div>
      </section>

      {/* 3. TODAY'S SCHEDULE & CLASS PERFORMANCE CHART */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Today's / Upcoming Teaching Schedule (7 cols) */}
        <section className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-2xs lg:col-span-7">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">
                  Ca dạy trọng tâm trong tuần
                </h2>
                <p className="text-xs text-muted-foreground">
                  Chuyển nhanh sang màn hình Điểm danh cho từng ca học.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/schedule" />}
                nativeButton={false}
              >
                Lịch đầy đủ
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-5 space-y-3">
              {sessions.slice(0, 4).map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default" className="font-mono">
                        {session.classCode}
                      </Badge>
                      <span className="font-heading text-sm font-bold text-foreground">
                        {session.className}
                      </span>
                      <Badge
                        variant={
                          session.status === "ongoing"
                            ? "success"
                            : session.status === "completed"
                              ? "outline"
                              : "info"
                        }
                      >
                        {session.status === "ongoing"
                          ? "Đang học"
                          : session.status === "completed"
                            ? "Đã hoàn thành"
                            : "Sắp diễn ra"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Chuyên đề: <strong className="text-foreground">{session.topic}</strong>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5 text-primary" aria-hidden="true" />
                        {session.dayLabel} · {session.startTime} – {session.endTime}
                      </span>
                      <span>{session.room}</span>
                      <span className="font-mono">
                        Sĩ số: {session.enrolledCount}/{session.capacity}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 bg-card"
                    render={
                      <Link
                        href={(() => {
                          const targetCls = classes.find(
                            (c) => c.code === session.classCode,
                          );
                          return targetCls
                            ? `/attendance?classId=${targetCls.id}&sessionId=${encodeURIComponent(session.id)}&date=${todayIso}`
                            : `/attendance?date=${todayIso}`;
                        })()}
                      />
                    }
                    nativeButton={false}
                  >
                    <ClipboardCheck className="size-3.5 text-primary" aria-hidden="true" />
                    Điểm danh
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Class Performance & Actionable Alerts (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Class Performance Comparison */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Thống kê học tập theo khối lớp
                </h2>
                <p className="text-xs text-muted-foreground">
                  Điểm trung bình quy đổi &amp; tỷ lệ chuyên cần hiện tại
                </p>
              </div>

              <Link
                href="/class-analytics"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Xem chi tiết {classes.length} lớp
                <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </div>

            {/* View Mode Toggle: Theo khối vs Theo từng lớp */}
            <div className="mt-3.5 flex items-center justify-between gap-2 border-b border-border/70 pb-3">
              <div className="inline-flex rounded-lg bg-muted/60 p-0.5 text-xs font-medium text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setClassViewMode("tracks")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-all",
                    classViewMode === "tracks"
                      ? "bg-card font-semibold text-foreground shadow-xs"
                      : "hover:text-foreground",
                  )}
                >
                  Theo khối đào tạo ({metrics.programTracks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setClassViewMode("classes")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-all",
                    classViewMode === "classes"
                      ? "bg-card font-semibold text-foreground shadow-xs"
                      : "hover:text-foreground",
                  )}
                >
                  Theo từng lớp ({metrics.classPerformance.length})
                </button>
              </div>

              <span className="text-[11px] text-muted-foreground">
                {classViewMode === "tracks" ? "Tổng hợp chiến lược" : "Cuộn danh sách"}
              </span>
            </div>

            {classViewMode === "tracks" ? (
              <div className="mt-3.5 space-y-3">
                {metrics.programTracks.map((track) => (
                  <div
                    key={track.id}
                    className="space-y-1.5 rounded-xl border border-border/60 bg-background/50 p-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">
                          {track.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          {track.classCount} lớp · {track.totalEnrolled} HS
                        </Badge>
                      </div>
                      <span className="font-mono font-bold text-primary">
                        TB {track.avgScore} · {track.attendanceRate}% CC
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          track.attendanceRate >= 95 ? "bg-emerald-600" : "bg-primary",
                        )}
                        style={{ width: `${Math.min(100, track.attendanceRate)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3.5 max-h-[300px] space-y-2.5 overflow-y-auto pr-1">
                {metrics.classPerformance.map((cls) => (
                  <div
                    key={cls.id}
                    className="space-y-1.5 rounded-lg border border-border/50 bg-background/40 p-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">
                          {cls.code} · {cls.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          ({cls.enrolled}/{cls.capacity})
                        </span>
                      </div>
                      <span className="font-mono font-bold text-primary">
                        TB {cls.averageScore.toFixed(1)} · {cls.attendanceRate}% CC
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          cls.attendanceRate >= 95 ? "bg-emerald-600" : "bg-primary",
                        )}
                        style={{ width: `${Math.min(100, cls.attendanceRate)}%` }}
                      />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-center text-[11px] text-muted-foreground">
                  Đang hiển thị toàn bộ {metrics.classPerformance.length} lớp học đang vận hành
                </p>
              </div>
            )}
          </section>

          {/* Actionable Alerts */}
          {metrics.prioritizedAlerts.length === 0 ? (
            <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-900 uppercase">
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                <span>Vận hành học vụ ổn định</span>
              </div>
              <p className="mt-2 text-xs text-emerald-800">
                Toàn bộ học sinh đã hoàn tất học phí và đảm bảo tiến độ chuyên cần, không có cảnh báo tồn đọng.
              </p>
            </section>
          ) : (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase">
                  <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
                  <span>
                    Cảnh báo học vụ cần lưu ý ({metrics.prioritizedAlerts.length})
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAlertHubOpen(true)}
                  className="h-7 px-2 text-xs font-semibold text-amber-900 hover:bg-amber-500/20"
                >
                  Mở trung tâm xử lý
                  <ExternalLink className="size-3" aria-hidden="true" />
                </Button>
              </div>

              {/* Top 3 High-Priority Alert Items */}
              <div className="mt-3.5 space-y-2.5">
                {metrics.prioritizedAlerts.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs shadow-2xs transition-colors hover:border-amber-500/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-semibold text-foreground">
                          {item.studentName}
                        </p>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          ({item.studentCode})
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {item.className} · {item.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          item.severity === "critical"
                            ? "destructive"
                            : item.severity === "warning"
                            ? "warning"
                            : "outline"
                        }
                      >
                        {item.badgeLabel}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => handleCopyReminder(item)}
                        title="Sao chép mẫu tin nhắn nhắc nhở"
                        className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        {copiedAlertId === item.id ? (
                          <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <Copy className="size-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* View More Button if alerts > 3 */}
              {metrics.prioritizedAlerts.length > 3 && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAlertHubOpen(true)}
                    className="w-full h-8 text-xs font-medium border-amber-500/30 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20"
                  >
                    Xem thêm {metrics.prioritizedAlerts.length - 3} cảnh báo học vụ khác →
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Quick Post Announcement Modal */}
      <ModalDialog
        open={quickAnnouncementOpen}
        onClose={() => setQuickAnnouncementOpen(false)}
        title="Đăng thông báo nhanh lên Cổng học sinh"
        description="Xuất bản thông báo trực tiếp tới bảng tin công khai."
        size="md"
      >
        <form onSubmit={handleQuickPostAnnouncement} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="quick-ann-title"
              className="block text-xs font-semibold text-foreground"
            >
              Tiêu đề bản tin
            </label>
            <Input
              id="quick-ann-title"
              value={quickAnnTitle}
              onChange={(e) => setQuickAnnTitle(e.target.value)}
              placeholder="Ví dụ: Lịch học bù ca Thứ Sáu lớp IELTS Intensive"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="quick-ann-excerpt"
              className="block text-xs font-semibold text-foreground"
            >
              Nội dung tóm tắt
            </label>
            <textarea
              id="quick-ann-excerpt"
              rows={4}
              value={quickAnnExcerpt}
              onChange={(e) => setQuickAnnExcerpt(e.target.value)}
              placeholder="Nhập nội dung thông báo gửi tới phụ huynh và học sinh..."
              required
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuickAnnouncementOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <Megaphone className="size-4" aria-hidden="true" />
              Xuất bản ngay
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Trung tâm xử lý Cảnh báo Học vụ & Học phí Modal */}
      <ModalDialog
        open={alertHubOpen}
        onClose={() => setAlertHubOpen(false)}
        title="Trung tâm xử lý Cảnh báo Học vụ & Học phí"
        description={`Tổng hợp ${metrics.prioritizedAlerts.length} trường hợp học sinh cần giáo viên can thiệp, nhắc nhở hoặc hỗ trợ.`}
        size="lg"
      >
        <div className="space-y-4">
          {/* Controls: Search and Categories */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={alertSearchQuery}
                onChange={(e) => setAlertSearchQuery(e.target.value)}
                placeholder="Tìm theo tên học sinh, mã HS, lớp học..."
                className="h-9 pl-8 text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setAlertFilterCategory("all")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  alertFilterCategory === "all"
                    ? "bg-card font-semibold text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Tất cả ({metrics.prioritizedAlerts.length})
              </button>
              <button
                type="button"
                onClick={() => setAlertFilterCategory("critical")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  alertFilterCategory === "critical"
                    ? "bg-card font-semibold text-destructive shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Khẩn cấp ({metrics.criticalAlertsCount})
              </button>
              <button
                type="button"
                onClick={() => setAlertFilterCategory("tuition")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  alertFilterCategory === "tuition"
                    ? "bg-card font-semibold text-amber-700 shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Học phí (
                {
                  metrics.prioritizedAlerts.filter(
                    (a) => a.category === "tuition",
                  ).length
                }
                )
              </button>
              <button
                type="button"
                onClick={() => setAlertFilterCategory("academic")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  alertFilterCategory === "academic"
                    ? "bg-card font-semibold text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Học thuật (
                {
                  metrics.prioritizedAlerts.filter(
                    (a) => a.category !== "tuition",
                  ).length
                }
                )
              </button>
            </div>
          </div>

          {/* Alert List */}
          <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
            {filteredAlerts.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Không tìm thấy cảnh báo nào phù hợp với bộ lọc hiện tại.
              </div>
            ) : (
              filteredAlerts.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 transition-all sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-heading text-sm font-bold text-foreground">
                        {item.studentName}
                      </p>
                      <span className="font-mono text-xs text-muted-foreground">
                        ({item.studentCode})
                      </span>
                      <Badge
                        variant={
                          item.severity === "critical"
                            ? "destructive"
                            : item.severity === "warning"
                              ? "warning"
                              : "outline"
                        }
                      >
                        {item.badgeLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong className="font-medium text-foreground">
                        {item.className}
                      </strong>{" "}
                      · {item.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyReminder(item)}
                      className="h-8 gap-1.5 text-xs"
                    >
                      {copiedAlertId === item.id ? (
                        <>
                          <Check
                            className="size-3.5 text-emerald-600"
                            aria-hidden="true"
                          />
                          Đã chép
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" aria-hidden="true" />
                          Sao chép mẫu nhắc
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      render={
                        <Link
                          href={`/students?search=${encodeURIComponent(item.studentCode)}`}
                        />
                      }
                      nativeButton={false}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <Users className="size-3.5" aria-hidden="true" />
                      Xem hồ sơ
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
            <span>
              Đang hiển thị {filteredAlerts.length}/
              {metrics.prioritizedAlerts.length} cảnh báo
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAlertHubOpen(false)}
            >
              Đóng
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
