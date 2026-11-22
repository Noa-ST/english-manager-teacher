"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CalendarCheck,
  CreditCard,
  Download,
  FileText,
  MessageSquareQuote,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type {
  AdminStudentRecord,
  StudentPortalSessionEntry,
  StudentScheduleOccurrence,
} from "@/services/classroom-data";
import { buildStudentAttendanceSummary } from "@/services/attendance-helpers";
import {
  SKILL_FOCUS_META,
  type SanitizedStudentClassroomRoadmap,
} from "@/services/classroom-helpers";
import { formatDisplayDateVi } from "@/services/schedule-calendar-helpers";
import {
  computeStudentSkillProfile,
  formatDisplayDate,
  STUDENT_STATUS_META,
} from "@/services/student-helpers";
import { useTeacherPublicProfile } from "@/components/viewer/legal-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface StudentOverviewTabProps {
  student: AdminStudentRecord;
  upcomingOccurrences: StudentScheduleOccurrence[];
  roadmap: SanitizedStudentClassroomRoadmap | null;
  sessionTimeline: StudentPortalSessionEntry[];
  downloadingFileId: string | null;
  onDownloadMaterial: (fileId: string, fileName: string) => void;
  buildSectionHref: (
    section: "overview" | "profile" | "grades" | "attendance" | "schedule",
  ) => Route;
}

export function StudentOverviewTab({
  student,
  upcomingOccurrences,
  roadmap,
  sessionTimeline,
  downloadingFileId,
  onDownloadMaterial,
  buildSectionHref,
}: StudentOverviewTabProps) {
  const teacherProfile = useTeacherPublicProfile();
  const publishedGrades = React.useMemo(
    () =>
      student.grades.filter((g) => (g.status ?? "published") !== "draft"),
    [student.grades],
  );
  const latestGrade = publishedGrades[0];
  const skillProfile = React.useMemo(
    () => computeStudentSkillProfile(student),
    [student],
  );
  const attendanceSummary = React.useMemo(
    () => buildStudentAttendanceSummary(student.attendanceHistory),
    [student.attendanceHistory],
  );
  const statusMeta = STUDENT_STATUS_META[student.status];

  const nextActiveOccurrence = React.useMemo(
    () =>
      upcomingOccurrences.find((o) => o.status !== "canceled") ??
      upcomingOccurrences[0] ??
      null,
    [upcomingOccurrences],
  );

  const currentRoadmapWeek = React.useMemo(() => {
    if (!roadmap || roadmap.weeks.length === 0) return null;
    return (
      roadmap.weeks.find((w) => w.status === "in-progress") ??
      roadmap.weeks.find((w) => w.weekNumber === roadmap.currentWeek) ??
      roadmap.weeks[0]
    );
  }, [roadmap]);

  const recentSessions = React.useMemo(
    () => sessionTimeline.slice(0, 2),
    [sessionTimeline],
  );

  return (
    <div className="space-y-6">
      {/* 1. 4 Executive KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Overall Band Trung bình
            </span>
            <TrendingUp className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-primary">
              {student.averageScore.toFixed(1)}
            </span>
            {skillProfile.bandDelta !== null && (
              <Badge
                variant={skillProfile.bandDelta >= 0 ? "success" : "warning"}
                className="font-mono text-[11px]"
              >
                {skillProfile.bandDelta >= 0 ? "+" : ""}
                {skillProfile.bandDelta.toFixed(1)} so với đầu vào
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Mục tiêu: <strong className="text-foreground">{student.targetGoal}</strong>
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tỷ lệ chuyên cần
            </span>
            <CalendarCheck className="size-4 text-emerald-700" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-emerald-700">
              {attendanceSummary.rate}%
            </span>
            <span className="text-xs text-muted-foreground">
              ({attendanceSummary.present + attendanceSummary.late}/
              {student.attendanceHistory.length} buổi)
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Có mặt đúng giờ: <strong className="text-foreground">{attendanceSummary.present} buổi</strong>
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tiến độ khóa học
            </span>
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-foreground">
              {roadmap ? `Tuần ${roadmap.currentWeek}/${roadmap.totalWeeks}` : student.level}
            </span>
            {roadmap && (
              <Badge variant="warm" className="font-mono text-[11px]">
                {roadmap.completionPct}%
              </Badge>
            )}
          </div>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            {roadmap ? roadmap.currentModule : student.className}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Trạng thái học vụ & Học phí
            </span>
            <CreditCard className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              variant={
                student.tuitionStatus === "paid"
                  ? "success"
                  : student.tuitionStatus === "due-soon"
                    ? "warning"
                    : "destructive"
              }
            >
              {student.tuitionStatus === "paid"
                ? "Đã hoàn thành học phí"
                : student.tuitionStatus === "due-soon"
                  ? "Sắp đến hạn học phí"
                  : "Quá hạn học phí"}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {student.tuitionPeriod} ·{" "}
            <strong className="font-mono text-foreground">{student.tuitionAmount}</strong>
          </p>
        </div>
      </div>

      {/* 2. Main Two-Column Summary: 4-Skill Snapshot + Teacher Comment & Next Class */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left (7 cols): 4-Skill Breakdown & Quick Link to Grades */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Biểu đồ Năng lực 4 Kỹ năng
                </h2>
                <p className="text-xs text-muted-foreground">
                  Kỳ đánh giá gần nhất:{" "}
                  <strong className="text-foreground">
                    {latestGrade?.assessmentTitle ?? "Chưa có kỳ kiểm tra công bố"}
                  </strong>
                </p>
              </div>
              <Link
                href={buildSectionHref("grades")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>Chi tiết {publishedGrades.length} bài thi</span>
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>

            {latestGrade ? (
              <div className="mt-5 space-y-3">
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
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                Chưa có dữ liệu điểm 4 kỹ năng.
              </p>
            )}
          </div>

          {skillProfile.strongestSkill && skillProfile.weakestSkill && (
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <span className="font-medium text-emerald-800">Kỹ năng thế mạnh</span>
                <p className="mt-0.5 font-heading text-sm font-bold text-emerald-950">
                  {skillProfile.strongestSkill.label} (TB {skillProfile.strongestSkill.score.toFixed(1)})
                </p>
              </div>
              <div className="rounded-xl bg-amber-500/10 p-3">
                <span className="font-medium text-amber-800">Trọng tâm cần bứt phá</span>
                <p className="mt-0.5 font-heading text-sm font-bold text-amber-950">
                  {skillProfile.weakestSkill.label} (TB {skillProfile.weakestSkill.score.toFixed(1)})
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right (5 cols): Teacher Feedback & Next Class Session */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          {/* Teacher Comment Card */}
          <div className="rounded-2xl border border-primary/20 bg-warm/50 p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase">
                <MessageSquareQuote className="size-4 text-primary" aria-hidden="true" />
                <span>Nhận xét chuyên môn mới nhất</span>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClass}`}>
                {statusMeta.label}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground">
              “{student.recentComment || "Học viên duy trì tiến độ học tập ổn định trên lớp."}”
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-primary/15 pt-3 text-xs text-muted-foreground">
              <span>Giảng viên: {teacherProfile.name || "Giáo viên phụ trách"}</span>
              <Link
                href={buildSectionHref("profile")}
                className="font-semibold text-primary hover:underline"
              >
                Xem hồ sơ cá nhân →
              </Link>
            </div>
          </div>

          {/* Next Upcoming Class Session */}
          <div className="flex-1 rounded-2xl border border-border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
                <Calendar className="size-4 text-primary" aria-hidden="true" />
                <span>Buổi học sắp tới gần nhất</span>
              </div>
              <Link
                href={buildSectionHref("schedule")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>Lịch 14 ngày</span>
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>

            {nextActiveOccurrence ? (
              <div className="mt-3 rounded-xl border border-border bg-muted/20 p-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading text-sm font-bold text-foreground">
                    {nextActiveOccurrence.dayLabel},{" "}
                    {formatDisplayDateVi(nextActiveOccurrence.date)}
                  </span>
                  <Badge variant="default" className="font-mono">
                    {nextActiveOccurrence.startTime} – {nextActiveOccurrence.endTime}
                  </Badge>
                </div>
                <p className="mt-1.5 font-medium text-foreground">
                  {nextActiveOccurrence.topic}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Phòng học: <strong className="text-foreground">{nextActiveOccurrence.room}</strong>
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Chưa có lịch học sắp tới trong 14 ngày tới.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 3. Current Week Focus & Latest Session Takeaway */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Current Curriculum Week Spotlight (6 cols) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 font-heading text-base font-bold text-foreground">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              Trọng tâm Tuần học hiện tại
            </h3>
            <Link
              href={buildSectionHref("schedule")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <span>Toàn bộ giáo trình</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          {currentRoadmapWeek ? (
            <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-primary">
                  Tuần {currentRoadmapWeek.weekNumber}
                  {currentRoadmapWeek.scheduledDate
                    ? ` · ${formatDisplayDate(currentRoadmapWeek.scheduledDate)}`
                    : ""}
                </span>
                <div className="flex items-center gap-1.5">
                  {currentRoadmapWeek.focusSkill && (
                    <Badge variant="outline" className="text-[10px]">
                      {SKILL_FOCUS_META[currentRoadmapWeek.focusSkill]?.label ??
                        currentRoadmapWeek.focusSkill}
                    </Badge>
                  )}
                  <Badge variant="default">Đang học</Badge>
                </div>
              </div>
              <p className="font-heading text-sm font-bold text-foreground">
                {currentRoadmapWeek.title}
              </p>
              {currentRoadmapWeek.focus && (
                <p className="text-xs text-muted-foreground">{currentRoadmapWeek.focus}</p>
              )}

              {!currentRoadmapWeek.isLocked && currentRoadmapWeek.homework && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
                  <p className="font-semibold text-foreground">
                    BTVN: {currentRoadmapWeek.homework}
                  </p>
                  {currentRoadmapWeek.homeworkDueDate && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Hạn nộp: {formatDisplayDate(currentRoadmapWeek.homeworkDueDate)}
                    </p>
                  )}
                </div>
              )}

              {!currentRoadmapWeek.isLocked &&
                currentRoadmapWeek.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {currentRoadmapWeek.attachments.map((att) => {
                      const fileKey = att.storedFileId || att.id;
                      const isBusy = downloadingFileId === fileKey;
                      return (
                        <Button
                          key={att.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => onDownloadMaterial(fileKey, att.name)}
                          className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
                        >
                          <FileText className="size-3 text-primary" aria-hidden="true" />
                          <span className="max-w-44 truncate">{att.name}</span>
                          <Download
                            className="size-3 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </Button>
                      );
                    })}
                  </div>
                )}
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              Chưa có thông tin tuần học hiện tại.
            </p>
          )}
        </div>

        {/* Recent Teaching Journal Highlights (6 cols) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 font-heading text-base font-bold text-foreground">
              <Target className="size-4 text-primary" aria-hidden="true" />
              Nhật ký buổi học & BTVN mới nhất
            </h3>
            <Link
              href={buildSectionHref("attendance")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <span>Xem điểm danh & nhật ký</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          {recentSessions.length > 0 ? (
            <div className="mt-4 space-y-3">
              {recentSessions.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-border bg-muted/20 p-3.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-primary">
                      Tuần {entry.weekNumber} · {formatDisplayDateVi(entry.date)}
                    </span>
                    <Badge
                      variant={
                        entry.studentAttendance === "present"
                          ? "success"
                          : entry.studentAttendance === "late"
                            ? "warning"
                            : entry.studentAttendance === "excused"
                              ? "info"
                              : "destructive"
                      }
                    >
                      {entry.studentAttendance === "present"
                        ? "Có mặt"
                        : entry.studentAttendance === "late"
                          ? "Đi muộn"
                          : entry.studentAttendance === "excused"
                            ? "Có phép"
                            : "Vắng"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-heading text-sm font-bold text-foreground">
                    {entry.topic}
                  </p>
                  {entry.studentFeedback && (
                    <p className="mt-1 text-muted-foreground">
                      <strong className="text-foreground">Nhận xét:</strong>{" "}
                      {entry.studentFeedback}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-xs text-muted-foreground">
              <Award className="size-4 text-primary" aria-hidden="true" />
              <span>Chưa có nhật ký buổi học nào được ghi nhận.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
