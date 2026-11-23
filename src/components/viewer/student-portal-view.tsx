"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Award,
  Calendar,
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import type {
  AdminStudentRecord,
  StudentPortalSessionEntry,
  StudentScheduleOccurrence,
  WeeklyClassSession,
} from "@/services/classroom-data";
import type { SanitizedStudentClassroomRoadmap } from "@/services/classroom-helpers";
import { formatDisplayDateVi } from "@/services/schedule-calendar-helpers";
import { STUDENT_STATUS_META } from "@/services/student-helpers";
import type { SessionUser } from "@/types";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { StudentAttendanceTab } from "@/components/viewer/student-portal/student-attendance-tab";
import { StudentGradesTab } from "@/components/viewer/student-portal/student-grades-tab";
import { StudentOverviewTab } from "@/components/viewer/student-portal/student-overview-tab";
import { StudentProfileTab } from "@/components/viewer/student-portal/student-profile-tab";
import { StudentScheduleTab } from "@/components/viewer/student-portal/student-schedule-tab";

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

const SECTION_META: Record<
  StudentPortalSection,
  {
    label: string;
    href: string;
    subtitle: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  overview: {
    label: "Tổng quan",
    href: "/student",
    subtitle:
      "Bức tranh tổng thể về hiệu suất học tập, biểu đồ 4 kỹ năng, nhận xét mới nhất của giáo viên và trọng tâm tuần đang học.",
    Icon: LayoutDashboard,
  },
  profile: {
    label: "Hồ sơ cá nhân",
    href: "/student/profile",
    subtitle:
      "Thông tin định danh học vụ, lộ trình mục tiêu cá nhân, liên hệ gia đình đã bảo mật và sổ theo dõi biên nhận học phí.",
    Icon: UserCheck,
  },
  grades: {
    label: "Bảng điểm",
    href: "/student/grades",
    subtitle:
      "Phân tích chuyên sâu năng lực Listening · Reading · Writing · Speaking và lịch sử điểm các kỳ kiểm tra định kỳ.",
    Icon: Award,
  },
  attendance: {
    label: "Điểm danh",
    href: "/student/attendance",
    subtitle:
      "Thống kê tỷ lệ chuyên cần, lịch sử điểm danh từng buổi học và nhật ký đánh giá, nhận xét & BTVN trên lớp.",
    Icon: CalendarCheck,
  },
  schedule: {
    label: "Lịch học lớp",
    href: "/student/schedule",
    subtitle:
      "Thời khóa biểu 14 ngày tới (cập nhật nghỉ lễ / học bù / đổi lịch), lịch cố định hàng tuần và lộ trình học liệu 12 tuần.",
    Icon: Calendar,
  },
};

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
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const effectiveStudentCode =
    initialStudentCode || searchParams.get("studentId")?.trim() || "";

  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [authenticatedStudent, setAuthenticatedStudent] =
    React.useState<AdminStudentRecord | null>(null);
  const [classSchedule, setClassSchedule] = React.useState<WeeklyClassSession[]>(
    [],
  );
  const [upcomingOccurrences, setUpcomingOccurrences] = React.useState<
    StudentScheduleOccurrence[]
  >([]);
  const [roadmap, setRoadmap] =
    React.useState<SanitizedStudentClassroomRoadmap | null>(null);
  const [sessionTimeline, setSessionTimeline] = React.useState<
    StudentPortalSessionEntry[]
  >([]);
  const [downloadingFileId, setDownloadingFileId] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    let active = true;
    async function loadMyPortal() {
      setIsLoading(true);
      setErrorMessage(null);
      setErrorStatus(null);
      try {
        const query = effectiveStudentCode
          ? `?studentId=${encodeURIComponent(effectiveStudentCode)}`
          : "";
        const payload = await apiRequest<StudentMeResponse>(
          `/api/student/me${query}`,
        );
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
  }, [effectiveStudentCode]);

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
      const query = effectiveStudentCode
        ? `?studentId=${encodeURIComponent(effectiveStudentCode)}`
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

  const buildSectionHref = React.useCallback(
    (targetSection: StudentPortalSection): Route => {
      const baseHref = SECTION_META[targetSection].href;
      if (!effectiveStudentCode) return baseHref as Route;
      return `${baseHref}?studentId=${encodeURIComponent(effectiveStudentCode)}` as Route;
    },
    [effectiveStudentCode],
  );

  const currentMeta = SECTION_META[initialSection];
  const publishedGradeCount = React.useMemo(
    () =>
      authenticatedStudent
        ? authenticatedStudent.grades.filter(
          (g) => (g.status ?? "published") !== "draft",
        ).length
        : 0,
    [authenticatedStudent],
  );

  const navItems: Array<{
    key: StudentPortalSection;
    label: string;
    href: Route;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }> = [
      {
        key: "overview",
        label: SECTION_META.overview.label,
        href: buildSectionHref("overview"),
        Icon: SECTION_META.overview.Icon,
      },
      {
        key: "profile",
        label: SECTION_META.profile.label,
        href: buildSectionHref("profile"),
        Icon: SECTION_META.profile.Icon,
      },
      {
        key: "grades",
        label: SECTION_META.grades.label,
        href: buildSectionHref("grades"),
        Icon: SECTION_META.grades.Icon,
        badge: authenticatedStudent ? String(publishedGradeCount) : undefined,
      },
      {
        key: "attendance",
        label: SECTION_META.attendance.label,
        href: buildSectionHref("attendance"),
        Icon: SECTION_META.attendance.Icon,
        badge: authenticatedStudent
          ? `${authenticatedStudent.attendanceRate}%`
          : undefined,
      },
      {
        key: "schedule",
        label: SECTION_META.schedule.label,
        href: buildSectionHref("schedule"),
        Icon: SECTION_META.schedule.Icon,
        badge: roadmap
          ? `T${roadmap.currentWeek}/${roadmap.totalWeeks}`
          : undefined,
      },
    ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* Header & Compact Identity Bar */}
      <div className="space-y-4">
        <Breadcrumb
          items={
            initialSection === "overview"
              ? [
                { label: "Trang chủ", href: "/" },
                { label: "Cổng Học sinh" },
              ]
              : [
                { label: "Trang chủ", href: "/" },
                { label: "Cổng Học sinh", href: buildSectionHref("overview") },
                { label: currentMeta.label },
              ]
          }
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
              {currentMeta.subtitle}
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

        {/* Compact Student Identity Strip across all tabs */}
        {authenticatedStudent && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary font-heading text-sm font-bold text-primary-foreground">
                {authenticatedStudent.fullName
                  .split(" ")
                  .slice(-2)
                  .map((w) => w[0])
                  .join("")}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-sm font-bold text-foreground">
                    {authenticatedStudent.fullName}
                  </span>
                  <Badge variant="default" className="font-mono text-[11px]">
                    {authenticatedStudent.code}
                  </Badge>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STUDENT_STATUS_META[authenticatedStudent.status].badgeClass}`}
                  >
                    {STUDENT_STATUS_META[authenticatedStudent.status].label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {authenticatedStudent.className} · CEFR{" "}
                  {authenticatedStudent.level} · Mục tiêu:{" "}
                  <strong className="text-foreground">
                    {authenticatedStudent.targetGoal}
                  </strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="warm" className="font-mono">
                Overall TB: {authenticatedStudent.averageScore.toFixed(1)}
              </Badge>
              <Badge variant="outline" className="font-mono">
                Chuyên cần: {authenticatedStudent.attendanceRate}%
              </Badge>
            </div>
          </div>
        )}

        {/* Sub-navigation for /student/* modular routes */}
        <nav
          aria-label="Điều hướng cổng học sinh"
          className="flex flex-wrap gap-2 border-b border-border pb-3"
        >
          {navItems.map((item) => {
            const isActive = initialSection === item.key;
            const Icon = item.Icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-foreground/80"
                      }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
          <Skeleton className="h-72 rounded-2xl" />
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
                {errorMessage ??
                  "Phiên đăng nhập không hợp lệ hoặc chưa được liên kết hồ sơ."}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" onClick={() => router.push("/student")}>
                  Về hồ sơ của tôi
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCloseSession}
                >
                  Đăng nhập tài khoản khác
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming Schedule Exception Alert Banner (shown on Overview & Schedule tabs) */}
          {(initialSection === "overview" || initialSection === "schedule") &&
            upcomingOccurrences.some(
              (o) => o.source !== "recurring" || o.status === "canceled",
            ) && (
              <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-950">
                <p className="font-heading font-bold">
                  Thông báo điều chỉnh lịch học sắp tới (
                  {authenticatedStudent.className}):
                </p>
                <ul className="mt-1.5 space-y-1">
                  {upcomingOccurrences
                    .filter(
                      (o) => o.source !== "recurring" || o.status === "canceled",
                    )
                    .map((o) => (
                      <li
                        key={o.occurrenceKey}
                        className="flex flex-wrap items-center gap-1.5"
                      >
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
                          {o.dayLabel}, {formatDisplayDateVi(o.date)} (
                          {o.startTime}–{o.endTime})
                        </span>
                        <span>· {o.room.split("·")[0].trim()}</span>
                        {o.exceptionReason && <span>— {o.exceptionReason}</span>}
                      </li>
                    ))}
                </ul>
              </div>
            )}

          {/* Render ONLY the selected modular tab */}
          {initialSection === "overview" && (
            <StudentOverviewTab
              student={authenticatedStudent}
              upcomingOccurrences={upcomingOccurrences}
              roadmap={roadmap}
              sessionTimeline={sessionTimeline}
              downloadingFileId={downloadingFileId}
              onDownloadMaterial={(fileId, fileName) =>
                void handleDownloadMaterial(fileId, fileName)
              }
              buildSectionHref={buildSectionHref}
            />
          )}

          {initialSection === "profile" && (
            <StudentProfileTab student={authenticatedStudent} />
          )}

          {initialSection === "grades" && (
            <StudentGradesTab student={authenticatedStudent} />
          )}

          {initialSection === "attendance" && (
            <StudentAttendanceTab
              student={authenticatedStudent}
              sessionTimeline={sessionTimeline}
            />
          )}

          {initialSection === "schedule" && (
            <StudentScheduleTab
              student={authenticatedStudent}
              classSchedule={classSchedule}
              upcomingOccurrences={upcomingOccurrences}
              roadmap={roadmap}
              downloadingFileId={downloadingFileId}
              onDownloadMaterial={(fileId, fileName) =>
                void handleDownloadMaterial(fileId, fileName)
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
