"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Award,
  CalendarCheck,
  CreditCard,
  LogOut,
  MessageSquareQuote,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import type { AdminStudentRecord, WeeklyClassSession } from "@/services/classroom-data";
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
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
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
          {initialSection === "schedule" && classSchedule.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
              <h2 className="font-heading text-lg font-bold text-foreground">
                Lịch học lớp {authenticatedStudent.className}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Các buổi học định kỳ của lớp bạn đang theo học.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                <div className="col-span-2">
                  <span className="text-muted-foreground">Thông tin liên hệ gia đình</span>
                  <p className="mt-0.5 font-semibold text-foreground">
                    {authenticatedStudent.parentRelation} ({authenticatedStudent.parentContactMasked})
                  </p>
                </div>
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
                <MessageSquareQuote className="size-4 text-accent" aria-hidden="true" />
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

          {/* 3. Grade History Table */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
                <Award className="size-5 text-primary" aria-hidden="true" />
                Lịch sử điểm kiểm tra & Đánh giá chi tiết
              </h3>
              <span className="text-xs text-muted-foreground">
                Thang điểm quy chuẩn 9.0
              </span>
            </div>

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
                {authenticatedStudent.grades.map((g) => (
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
                      <Badge variant="default" className="font-mono">
                        {g.overall.toFixed(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">
                      {g.comment}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          {/* 4. Attendance History Timeline */}
          <section className="space-y-3">
            <h3 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <CalendarCheck className="size-5 text-primary" aria-hidden="true" />
              Nhật ký chuyên cần các buổi học gần đây
            </h3>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {authenticatedStudent.attendanceHistory.map((att, idx) => {
                const statusBadge = {
                  present: { label: "Có mặt đúng giờ", variant: "success" as const },
                  late: { label: "Đi muộn", variant: "warning" as const },
                  absent: { label: "Vắng mặt", variant: "destructive" as const },
                  excused: { label: "Nghỉ có phép", variant: "info" as const },
                }[att.status];

                return (
                  <div
                    key={`${att.date}-${idx}`}
                    className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {att.date}
                        </span>
                        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
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
          </section>
        </div>
      )}
    </div>
  );
}
