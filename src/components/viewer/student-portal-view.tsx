"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  CalendarCheck,
  CreditCard,
  Download,
  FileText,
  Lock,
  LogOut,
  MessageSquareQuote,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import type {
  AdminStudentRecord,
  StudentPortalSessionEntry,
  StudentScheduleOccurrence,
  WeeklyClassSession,
} from "@/services/classroom-data";
import {
  buildStudentAttendanceSummary,
  formatAttendanceDateVi,
  type AttendanceStatusValue,
} from "@/services/attendance-helpers";
import { removeVietnameseTones } from "@/lib/utils";
import {
  SKILL_FOCUS_META,
  type SanitizedStudentClassroomRoadmap,
} from "@/services/classroom-helpers";
import {
  buildScheduleIcsContent,
  downloadTextFile,
  formatDisplayDateVi,
} from "@/services/schedule-calendar-helpers";
import { formatDisplayDate } from "@/services/student-helpers";
import type { SessionUser } from "@/types";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, Skeleton } from "@/components/ui/feedback";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

interface StudentMeResponse {
  student: AdminStudentRecord;
  schedule: WeeklyClassSession[];
  upcomingOccurrences?: StudentScheduleOccurrence[];
  classroomRoadmap?: SanitizedStudentClassroomRoadmap | null;
  sessionTimeline?: StudentPortalSessionEntry[];
}

export type StudentPortalSection =
  | "overview"
  | "profile"
  | "grades"
  | "attendance"
  | "schedule";

export function StudentPortalView({
  initialStudentCode = "",
  session,
  initialSection = "overview",
}: {
  initialStudentCode?: string;
  session?: SessionUser;
  initialSection?: StudentPortalSection;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [authenticatedStudent, setAuthenticatedStudent] =
    React.useState<AdminStudentRecord | null>(null);
  const [classSchedule, setClassSchedule] = React.useState<WeeklyClassSession[]>([]);
  const [upcomingOccurrences, setUpcomingOccurrences] = React.useState<
    StudentScheduleOccurrence[]
  >([]);
  const [roadmap, setRoadmap] = React.useState<SanitizedStudentClassroomRoadmap | null>(
    null,
  );
  const [sessionTimeline, setSessionTimeline] = React.useState<
    StudentPortalSessionEntry[]
  >([]);
  const [attendanceStatusFilter, setAttendanceStatusFilter] = React.useState<
    AttendanceStatusValue | "all"
  >("all");
  const [gradeSearchQuery, setGradeSearchQuery] = React.useState("");
  const [downloadingFileId, setDownloadingFileId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    async function loadMyPortal() {
      setIsLoading(true);
      setErrorMessage(null);
      setErrorStatus(null);
      try {
        const query = initialStudentCode
          ? `?studentId=${encodeURIComponent(initialStudentCode)}`
          : "";
        const payload = await apiRequest<StudentMeResponse>(`/api/student/me${query}`);
        if (!active) return;
        setAuthenticatedStudent(payload.student);
        setClassSchedule(payload.schedule ?? []);
        setUpcomingOccurrences(payload.upcomingOccurrences ?? []);
        setRoadmap(payload.classroomRoadmap ?? null);
        setSessionTimeline(payload.sessionTimeline ?? []);
      } catch (err) {
        if (!active) return;
        const status =
          err instanceof ApiClientError && err.code === "FORBIDDEN"
            ? 403
            : err instanceof ApiClientError && err.code === "UNAUTHORIZED"
              ? 401
              : 500;
        setErrorStatus(status);
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Không thể tải dữ liệu học tập cá nhân.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadMyPortal();
    return () => {
      active = false;
    };
  }, [initialStudentCode]);

  const handleCloseSession = async () => {
    setIsLoggingOut(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      toast({
        title: "Đã đăng xuất",
        description: "Phiên đăng nhập học sinh đã được đóng an toàn.",
        variant: "info",
      });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleDownloadMaterial = async (fileId: string, fileName: string) => {
    setDownloadingFileId(fileId);
    try {
      const query = initialStudentCode
        ? `?studentId=${encodeURIComponent(initialStudentCode)}`
        : "";
      const res = await apiRequest<{
        url: string;
        expiresInSeconds: number | null;
        fileName: string;
      }>(`/api/student/materials/${encodeURIComponent(fileId)}${query}`);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: `Không thể mở tài liệu ${fileName}`,
        description:
          err instanceof Error
            ? err.message
            : "Tài liệu chưa được mở khóa hoặc không tồn tại.",
        variant: "error",
      });
    } finally {
      setDownloadingFileId(null);
    }
  };

  const latestGrade = authenticatedStudent?.grades[0];

  const navItems = [
    { label: "Tổng quan", href: "/student", key: "overview" },
    { label: "Hồ sơ cá nhân", href: "/student/profile", key: "profile" },
    { label: "Bảng điểm", href: "/student/grades", key: "grades" },
    { label: "Điểm danh", href: "/student/attendance", key: "attendance" },
    { label: "Lịch học lớp", href: "/student/schedule", key: "schedule" },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* Header */}
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Trang chủ", href: "/" },
            { label: "Cổng Học sinh" },
          ]}
        />
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase">
              <ShieldCheck className="size-4" aria-hidden="true" />
              <span>
                {session?.role === "admin"
                  ? "Teacher Preview Mode (ADMIN)"
                  : "Authenticated Student Portal"}
              </span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Cổng tra cứu thông tin cá nhân
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Theo dõi kết quả bài kiểm tra định kỳ, biểu đồ năng lực 4 kỹ năng, lịch sử điểm danh
              và nhận xét trực tiếp từ giáo viên.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {session?.role === "admin" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/dashboard")}
              >
                Về Teacher Dashboard
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseSession}
              disabled={isLoggingOut}
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              {isLoggingOut
                ? "Đang đăng xuất..."
                : `Đăng xuất${authenticatedStudent ? ` (${authenticatedStudent.code})` : ""}`}
            </Button>
          </div>
        </div>

        {/* Sub-navigation for /student/* routes */}
        <nav aria-label="Điều hướng cổng học sinh" className="flex flex-wrap gap-2 border-b border-border pb-3">
          {navItems.map((item) => {
            const isActive = initialSection === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-12">
            <Skeleton className="h-64 rounded-2xl lg:col-span-5" />
            <Skeleton className="h-64 rounded-2xl lg:col-span-7" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : !authenticatedStudent ? (
        <div className="mx-auto max-w-xl rounded-2xl border border-destructive/30 bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              {errorStatus === 403 ? (
                <ShieldAlert className="size-5" aria-hidden="true" />
              ) : (
                <AlertCircle className="size-5" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-2">
              <h2 className="font-heading text-lg font-bold text-foreground">
                {errorStatus === 403
                  ? "Không có quyền truy cập hồ sơ (403 Forbidden)"
                  : "Không thể tải hồ sơ học sinh"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {errorMessage ?? "Phiên đăng nhập không hợp lệ hoặc chưa được liên kết hồ sơ."}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" onClick={() => router.push("/student")}>
                  Về hồ sơ của tôi
                </Button>
                <Button size="sm" variant="outline" onClick={handleCloseSession}>
                  Đăng nhập tài khoản khác
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* AFTER AUTHENTICATION: FULL STUDENT DASHBOARD */
        <div className="space-y-8">
          {/* Upcoming Schedule Exception Alert Banner (Holiday cancel / Reschedule / Makeup) */}
          {upcomingOccurrences.some(
            (o) => o.source !== "recurring" || o.status === "canceled",
          ) && (
            <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-950">
              <p className="font-heading font-bold">
                Thông báo điều chỉnh lịch học sắp tới ({authenticatedStudent.className}):
              </p>
              <ul className="mt-1.5 space-y-1">
                {upcomingOccurrences
                  .filter((o) => o.source !== "recurring" || o.status === "canceled")
                  .map((o) => (
                    <li key={o.occurrenceKey} className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          o.status === "canceled"
                            ? "destructive"
                            : o.source === "makeup"
                              ? "info"
                              : "warning"
                        }
                        className="text-[10px]"
                      >
                        {o.status === "canceled"
                          ? "Tạm nghỉ"
                          : o.source === "makeup"
                            ? "Học bù"
                            : "Đổi lịch"}
                      </Badge>
                      <span className="font-semibold">
                        {o.dayLabel}, {formatDisplayDateVi(o.date)} ({o.startTime}–{o.endTime})
                      </span>
                      <span>· {o.room.split("·")[0].trim()}</span>
                      {o.exceptionReason && <span>— {o.exceptionReason}</span>}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {initialSection === "schedule" &&
            (upcomingOccurrences.length > 0 || classSchedule.length > 0) && (
              <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-lg font-bold text-foreground">
                      Lịch học lớp {authenticatedStudent.className}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Lịch học 14 ngày tới (đã cập nhật nghỉ lễ / dời lịch / dạy bù) và khung giờ cố định hàng tuần.
                    </p>
                  </div>
                  {upcomingOccurrences.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        const ics = buildScheduleIcsContent(
                          upcomingOccurrences,
                          `Lịch học ${authenticatedStudent.className}`,
                        );
                        downloadTextFile(
                          `lich-hoc-${authenticatedStudent.code}.ics`,
                          ics,
                          "text/calendar;charset=utf-8",
                        );
                        toast({
                          title: "Đã tải tệp lịch .ICS",
                          description: "Mở tệp để thêm lịch học vào Google Calendar hoặc Apple Calendar.",
                          variant: "success",
                        });
                      }}
                    >
                      <Download className="size-3.5 text-primary" aria-hidden="true" />
                      Tải lịch 14 ngày (.ICS)
                    </Button>
                  )}
                </div>

                {upcomingOccurrences.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="font-heading text-sm font-bold text-foreground">
                      Lịch học chi tiết 14 ngày tới
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {upcomingOccurrences.map((occ) => (
                        <div
                          key={occ.occurrenceKey}
                          className="rounded-xl border border-border bg-background p-4 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="font-semibold text-foreground">
                              {occ.dayLabel}, {formatDisplayDateVi(occ.date)}
                            </span>
                            {occ.status === "canceled" ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Tạm nghỉ
                              </Badge>
                            ) : occ.source === "makeup" ? (
                              <Badge variant="info" className="text-[10px]">
                                Dạy bù
                              </Badge>
                            ) : occ.source === "rescheduled" ? (
                              <Badge variant="warning" className="text-[10px]">
                                Đổi lịch
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                Định kỳ
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 font-mono font-bold text-primary">
                            {occ.startTime} – {occ.endTime}
                          </p>
                          <p className="mt-1 font-medium text-foreground">{occ.topic}</p>
                          <p className="mt-0.5 text-muted-foreground">Phòng: {occ.room}</p>
                          {occ.exceptionReason && (
                            <p className="mt-1.5 rounded bg-muted/60 px-2 py-1 text-[11px] text-foreground/80">
                              Ghi chú: {occ.exceptionReason}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {classSchedule.length > 0 && (
                  <div className="space-y-2.5 border-t border-border pt-4">
                    <h3 className="font-heading text-sm font-bold text-foreground">
                      Khung giờ học cố định hàng tuần
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {classSchedule.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border bg-muted/30 p-4 text-xs"
                        >
                          <div className="flex items-center justify-between font-semibold text-foreground">
                            <span>{item.dayLabel}</span>
                            <span className="font-mono text-primary">
                              {item.startTime} - {item.endTime}
                            </span>
                          </div>
                          <p className="mt-1 font-medium text-foreground">{item.topic}</p>
                          <p className="mt-0.5 text-muted-foreground">Phòng: {item.room}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          {/* 1. Student Profile & Academic KPIs */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Profile Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="default" className="font-mono">
                    {authenticatedStudent.code}
                  </Badge>
                  <Badge variant="success">Đang theo học chính thức</Badge>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  <div className="flex size-15 shrink-0 items-center justify-center rounded-2xl bg-primary font-heading text-xl font-bold text-primary-foreground">
                    {authenticatedStudent.fullName
                      .split(" ")
                      .slice(-2)
                      .map((w) => w[0])
                      .join("")}
                  </div>
                  <div>
                    <h2 className="font-heading text-xl font-bold text-foreground">
                      {authenticatedStudent.fullName}
                    </h2>
                    <p className="text-xs font-medium text-muted-foreground">
                      {authenticatedStudent.className}
                    </p>
                    <p className="mt-1 text-xs text-primary">
                      Mục tiêu cá nhân:{" "}
                      <strong className="font-semibold">
                        {authenticatedStudent.targetGoal}
                      </strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Trình độ hiện tại</span>
                  <p className="mt-0.5 font-semibold text-foreground">
                    CEFR {authenticatedStudent.level}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ngày nhập học</span>
                  <p className="mt-0.5 font-semibold text-foreground">
                    {authenticatedStudent.joinedAt}
                  </p>
                </div>
                {(authenticatedStudent.parentRelation ||
                  authenticatedStudent.parentContactMasked) && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Thông tin liên hệ gia đình</span>
                    <p className="mt-0.5 font-semibold text-foreground">
                      {authenticatedStudent.parentRelation || "Phụ huynh"}
                      {authenticatedStudent.parentContactMasked
                        ? ` (${authenticatedStudent.parentContactMasked})`
                        : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* KPI & 4-Skill Breakdown */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-heading text-base font-bold text-foreground">
                    Hiệu suất học thuật & Biểu đồ 4 kỹ năng
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Cập nhật từ kỳ đánh giá gần nhất:{" "}
                    {latestGrade?.assessmentTitle ?? "Đánh giá định kỳ"}
                  </p>
                </div>
                <Badge variant="warm">
                  <TrendingUp className="size-3.5 text-primary" aria-hidden="true" />
                  Overall TB: {authenticatedStudent.averageScore.toFixed(1)}
                </Badge>
              </div>

              {/* 3 Summary Stat Boxes */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-background p-3.5">
                  <span className="text-[11px] text-muted-foreground">Điểm trung bình</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-primary">
                    {authenticatedStudent.averageScore.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3.5">
                  <span className="text-[11px] text-muted-foreground">Tỷ lệ chuyên cần</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-700">
                    {authenticatedStudent.attendanceRate}%
                  </p>
                </div>
                <div className="rounded-xl bg-warm/60 p-3.5">
                  <span className="text-[11px] text-foreground/80">Số bài kiểm tra</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-primary">
                    {authenticatedStudent.grades.length}
                  </p>
                </div>
              </div>

              {/* 4-Skill Progress Bars */}
              {latestGrade && (
                <div className="mt-5 space-y-2.5 border-t border-border pt-4">
                  {(
                    [
                      { label: "Listening", score: latestGrade.listening },
                      { label: "Reading", score: latestGrade.reading },
                      { label: "Writing", score: latestGrade.writing },
                      { label: "Speaking", score: latestGrade.speaking },
                    ] as const
                  ).map((skill) => {
                    const pct = Math.min(100, Math.round((skill.score / 9) * 100));
                    return (
                      <div key={skill.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">{skill.label}</span>
                          <span className="font-mono font-bold text-primary">
                            {skill.score.toFixed(1)} / 9.0
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 2. Teacher Comment & Tuition Status Row */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Teacher Comment */}
            <div className="rounded-2xl border border-primary/20 bg-warm/50 p-6 lg:col-span-7">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase">
                <MessageSquareQuote className="size-4 text-primary" aria-hidden="true" />
                <span>Nhận xét chuyên môn gần nhất của giáo viên</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                “{authenticatedStudent.recentComment}”
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Giảng viên phụ trách: ThS. Nguyễn Minh Anh
              </p>
            </div>

            {/* Tuition Status */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
                    <CreditCard className="size-4 text-primary" aria-hidden="true" />
                    <span>Trạng thái học phí</span>
                  </div>
                  <Badge
                    variant={
                      authenticatedStudent.tuitionStatus === "paid"
                        ? "success"
                        : authenticatedStudent.tuitionStatus === "due-soon"
                          ? "warning"
                          : "destructive"
                    }
                  >
                    {authenticatedStudent.tuitionStatus === "paid"
                      ? "Đã hoàn thành"
                      : authenticatedStudent.tuitionStatus === "due-soon"
                        ? "Sắp đến hạn"
                        : "Quá hạn thanh toán"}
                  </Badge>
                </div>

                <h3 className="mt-3 font-heading text-base font-bold text-foreground">
                  {authenticatedStudent.tuitionPeriod}
                </h3>
                <p className="mt-1 font-mono text-xl font-bold text-primary">
                  {authenticatedStudent.tuitionAmount}
                </p>
              </div>

              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                Mọi thắc mắc về học vụ và biên lai học phí, Quý Phụ huynh vui lòng liên hệ trực tiếp
                văn phòng lớp học.
              </p>
            </div>
          </div>

          {/* 2.5 Classroom Syllabus Roadmap & Unlocked Materials */}
          {roadmap &&
            roadmap.weeks.length > 0 &&
            (initialSection === "overview" || initialSection === "schedule") && (
              <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
                      <BookOpen className="size-5 text-primary" aria-hidden="true" />
                      Lộ trình học phần & Tài liệu lớp {roadmap.classCode}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {roadmap.className} · Học phần hiện tại: {roadmap.currentModule}
                    </p>
                  </div>
                  <Badge variant="warm">
                    Tuần {roadmap.currentWeek}/{roadmap.totalWeeks} · {roadmap.completionPct}%
                    hoàn thành
                  </Badge>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${roadmap.completionPct}%` }}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {roadmap.weeks.map((week) => {
                    const statusBadge =
                      week.status === "completed"
                        ? { label: "Hoàn thành", variant: "success" as const }
                        : week.status === "in-progress"
                          ? { label: "Đang học", variant: "default" as const }
                          : week.status === "postponed"
                            ? { label: "Tạm dời lịch", variant: "warning" as const }
                            : { label: "Sắp tới", variant: "outline" as const };
                    const skillMeta = week.focusSkill
                      ? SKILL_FOCUS_META[week.focusSkill]
                      : null;

                    return (
                      <div
                        key={week.weekNumber}
                        className="flex flex-col justify-between rounded-xl border border-border bg-muted/20 p-4"
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-primary">
                              Tuần {week.weekNumber}
                              {week.scheduledDate ? ` · ${formatDisplayDate(week.scheduledDate)}` : ""}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {skillMeta && (
                                <Badge variant="outline" className="text-[10px]">
                                  {skillMeta.label}
                                </Badge>
                              )}
                              {week.isAssessmentMilestone && (
                                <Badge variant="warning" className="text-[10px]">
                                  {week.assessmentTitle || "Kiểm tra định kỳ"}
                                </Badge>
                              )}
                              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                            </div>
                          </div>

                          <p className="font-heading text-sm font-bold text-foreground">
                            {week.title}
                          </p>
                          {week.focus && (
                            <p className="text-xs text-muted-foreground">{week.focus}</p>
                          )}
                        </div>

                        <div className="mt-3 border-t border-border/70 pt-3">
                          {week.isLocked ? (
                            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                              Tài liệu & BTVN sẽ tự động mở khóa khi lớp học tới tuần này.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {week.homework && (
                                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-xs">
                                  <p className="font-semibold text-foreground">
                                    Bài tập về nhà: {week.homework}
                                  </p>
                                  {week.homeworkDueDate && (
                                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Calendar className="size-3" aria-hidden="true" />
                                      Hạn nộp: {formatDisplayDate(week.homeworkDueDate)}
                                    </p>
                                  )}
                                </div>
                              )}
                              {week.attachments.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {week.attachments.map((att) => {
                                    const fileKey = att.storedFileId || att.id;
                                    const isBusy = downloadingFileId === fileKey;
                                    return (
                                      <Button
                                        key={att.id}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={isBusy}
                                        onClick={() =>
                                          void handleDownloadMaterial(fileKey, att.name)
                                        }
                                        className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
                                      >
                                        <FileText className="size-3 text-primary" aria-hidden="true" />
                                        <span className="max-w-44 truncate">{att.name}</span>
                                        <Download className="size-3 text-muted-foreground" aria-hidden="true" />
                                      </Button>
                                    );
                                  })}
                                </div>
                              ) : (
                                !week.homework && (
                                  <p className="text-xs text-muted-foreground">
                                    Chưa có tài liệu đính kèm cho tuần này.
                                  </p>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          {/* 3. Grade History Table */}
          {(() => {
            const publishedGrades = authenticatedStudent.grades.filter(
              (g) => (g.status ?? "published") !== "draft",
            );
            const q = removeVietnameseTones(
              gradeSearchQuery.trim().toLowerCase(),
            );
            const filteredGrades = q
              ? publishedGrades.filter((g) =>
                  removeVietnameseTones(
                    `${g.assessmentTitle} ${g.comment}`.toLowerCase(),
                  ).includes(q),
                )
              : publishedGrades;

            return (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
                    <Award className="size-5 text-primary" aria-hidden="true" />
                    Lịch sử điểm kiểm tra & Đánh giá chi tiết
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {publishedGrades.length >= 2 && (
                      <input
                        type="search"
                        value={gradeSearchQuery}
                        onChange={(e) => setGradeSearchQuery(e.target.value)}
                        placeholder="Tìm kỳ kiểm tra..."
                        aria-label="Tìm kỳ kiểm tra"
                        className="h-8 rounded-lg border border-input bg-background px-3 text-xs"
                      />
                    )}
                    <span className="text-xs text-muted-foreground">
                      Thang điểm quy chuẩn 9.0
                    </span>
                  </div>
                </div>

                {publishedGrades.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                    Chưa có bài kiểm tra nào được giáo viên công bố điểm.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bài kiểm tra / Đánh giá</TableHead>
                        <TableHead>Ngày thi</TableHead>
                        <TableHead className="text-center">Listening</TableHead>
                        <TableHead className="text-center">Reading</TableHead>
                        <TableHead className="text-center">Writing</TableHead>
                        <TableHead className="text-center">Speaking</TableHead>
                        <TableHead className="text-center">Overall</TableHead>
                        <TableHead>Nhận xét bài làm</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGrades.map((g) => {
                        const originalIdx = publishedGrades.findIndex(
                          (item) => item.id === g.id,
                        );
                        const prevGrade =
                          originalIdx >= 0
                            ? publishedGrades[originalIdx + 1]
                            : undefined;
                        const delta = prevGrade
                          ? Math.round((g.overall - prevGrade.overall) * 10) / 10
                          : null;

                        return (
                          <TableRow key={g.id}>
                            <TableCell className="font-heading font-semibold text-foreground">
                              {g.assessmentTitle}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {g.date}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {g.listening.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {g.reading.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {g.writing.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {g.speaking.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="inline-flex items-center gap-1.5">
                                <Badge variant="default" className="font-mono">
                                  {g.overall.toFixed(1)}
                                </Badge>
                                {delta !== null && delta !== 0 && (
                                  <span
                                    className={`text-[11px] font-semibold tabular-nums ${
                                      delta > 0
                                        ? "text-emerald-700"
                                        : "text-destructive"
                                    }`}
                                  >
                                    {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs text-xs text-muted-foreground">
                              {g.comment}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </section>
            );
          })()}

          {/* 3.5 Nhật ký từng buổi học đã hoàn tất & BTVN */}
          {sessionTimeline.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
                  <CalendarCheck className="size-5 text-primary" aria-hidden="true" />
                  Nhật ký từng buổi học & Bài tập về nhà
                </h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Hiển thị {sessionTimeline.length} buổi đã hoàn tất
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {sessionTimeline.map((entry) => {
                  const attBadge =
                    entry.studentAttendance === "present"
                      ? { label: "Có mặt", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                      : entry.studentAttendance === "late"
                        ? { label: "Đi muộn", cls: "bg-amber-50 text-amber-800 border-amber-200" }
                        : entry.studentAttendance === "excused"
                          ? { label: "Có phép", cls: "bg-blue-50 text-blue-700 border-blue-200" }
                          : { label: "Vắng", cls: "bg-red-50 text-red-700 border-red-200" };

                  const hwBadge =
                    entry.homeworkStatus === "submitted"
                      ? "Đã nộp BTVN"
                      : entry.homeworkStatus === "not-submitted"
                        ? "Chưa nộp BTVN"
                        : entry.homeworkStatus === "exempt"
                          ? "Miễn BTVN"
                          : null;

                  return (
                    <div
                      key={entry.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xs"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="text-[11px] font-semibold">
                              Tuần {entry.weekNumber}
                            </Badge>
                            <span className="text-xs font-medium text-muted-foreground tabular-nums">
                              {entry.dayLabel}, {formatDisplayDateVi(entry.date)} ·{" "}
                              {entry.startTime}–{entry.endTime}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${attBadge.cls}`}
                            >
                              {attBadge.label}
                            </span>
                            {typeof entry.score === "number" && (
                              <Badge variant="secondary" className="text-[11px] tabular-nums">
                                Điểm: {entry.score}/10
                              </Badge>
                            )}
                          </div>
                        </div>

                        <h4 className="font-heading text-sm font-semibold text-foreground">
                          {entry.topic}
                        </h4>

                        {entry.generalNotes && (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {entry.generalNotes}
                          </p>
                        )}

                        {entry.studentFeedback && (
                          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                            <span className="font-semibold text-primary">
                              Nhận xét từ cô giáo:{" "}
                            </span>
                            {entry.studentFeedback}
                          </div>
                        )}

                        {entry.homework && (
                          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2 font-semibold text-foreground">
                              <span>Bài tập về nhà:</span>
                              {hwBadge && (
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  {hwBadge}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-muted-foreground">{entry.homework}</p>
                          </div>
                        )}

                        {entry.nextSessionPlan && (
                          <p className="text-[11px] text-muted-foreground">
                            <strong>Chuẩn bị buổi sau:</strong> {entry.nextSessionPlan}
                          </p>
                        )}
                      </div>

                      {entry.attachments.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
                          {entry.attachments.map((att) => {
                            const rawUrl = att.url?.trim() ?? "";
                            const safeUrl =
                              rawUrl &&
                              ((rawUrl.startsWith("/") &&
                                !rawUrl.startsWith("//") &&
                                !rawUrl.startsWith("/\\")) ||
                                rawUrl.startsWith("https://") ||
                                rawUrl.startsWith("http://"))
                                ? rawUrl
                                : null;
                            return safeUrl ? (
                              <a
                                key={att.id}
                                href={safeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                              >
                                <Download className="size-3 text-primary" aria-hidden="true" />
                                {att.name} ({att.size})
                              </a>
                            ) : (
                              <span
                                key={att.id}
                                className="inline-flex items-center rounded-lg border border-border bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground"
                              >
                                {att.name} ({att.size})
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 4. Attendance History Timeline */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
                <CalendarCheck className="size-5 text-primary" aria-hidden="true" />
                Nhật ký chuyên cần các buổi học gần đây
              </h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {authenticatedStudent.attendanceHistory.length} buổi đã ghi nhận
              </span>
            </div>

            {(() => {
              const summary = buildStudentAttendanceSummary(
                authenticatedStudent.attendanceHistory,
              );
              const filteredHistory =
                attendanceStatusFilter === "all"
                  ? authenticatedStudent.attendanceHistory
                  : authenticatedStudent.attendanceHistory.filter(
                      (a) => a.status === attendanceStatusFilter,
                    );

              return (
                <>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    <div className="rounded-xl border border-border bg-card p-3">
                      <span className="text-[11px] text-muted-foreground">
                        Tỷ lệ chuyên cần
                      </span>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-primary">
                        {summary.rate}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      <span className="text-[11px] text-emerald-800">
                        Có mặt đúng giờ
                      </span>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-emerald-700">
                        {summary.present}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                      <span className="text-[11px] text-amber-800">Đi muộn</span>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-amber-700">
                        {summary.late}
                      </p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
                      <span className="text-[11px] text-red-700">Vắng mặt</span>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-red-700">
                        {summary.absent}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3 sm:col-span-1">
                      <span className="text-[11px] text-blue-800">Nghỉ có phép</span>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-blue-700">
                        {summary.excused}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ["all", "Tất cả"],
                        ["present", "Có mặt"],
                        ["late", "Đi muộn"],
                        ["absent", "Vắng mặt"],
                        ["excused", "Có phép"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAttendanceStatusFilter(key)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                          attendanceStatusFilter === key
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {filteredHistory.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                      Không có buổi điểm danh nào khớp trạng thái đang chọn.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredHistory.map((att, idx) => {
                        const statusBadge = {
                          present: {
                            label: "Có mặt đúng giờ",
                            variant: "success" as const,
                          },
                          late: {
                            label: "Đi muộn",
                            variant: "warning" as const,
                          },
                          absent: {
                            label: "Vắng mặt",
                            variant: "destructive" as const,
                          },
                          excused: {
                            label: "Nghỉ có phép",
                            variant: "info" as const,
                          },
                        }[att.status];

                        return (
                          <div
                            key={`${att.date}-${att.sessionName}-${idx}`}
                            className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-semibold text-primary tabular-nums">
                                  {formatAttendanceDateVi(att.date)}
                                </span>
                                <Badge variant={statusBadge.variant}>
                                  {statusBadge.label}
                                </Badge>
                              </div>
                              <p className="mt-2 font-heading text-sm font-semibold text-foreground">
                                {att.sessionName}
                              </p>
                            </div>
                            {att.note && (
                              <p className="mt-2.5 border-t border-border pt-2 text-xs text-muted-foreground">
                                Ghi chú: {att.note}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        </div>
      )}
    </div>
  );
}
