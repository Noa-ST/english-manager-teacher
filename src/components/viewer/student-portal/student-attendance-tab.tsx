"use client";

import * as React from "react";
import { CalendarCheck, ClipboardList, Download } from "lucide-react";
import type {
  AdminStudentRecord,
  StudentPortalSessionEntry,
} from "@/services/classroom-data";
import {
  buildStudentAttendanceSummary,
  formatAttendanceDateVi,
  type AttendanceStatusValue,
} from "@/services/attendance-helpers";
import { formatDisplayDateVi } from "@/services/schedule-calendar-helpers";
import { Badge } from "@/components/ui/badge";

interface StudentAttendanceTabProps {
  student: AdminStudentRecord;
  sessionTimeline: StudentPortalSessionEntry[];
}

export function StudentAttendanceTab({
  student,
  sessionTimeline,
}: StudentAttendanceTabProps) {
  const [attendanceStatusFilter, setAttendanceStatusFilter] = React.useState<
    AttendanceStatusValue | "all"
  >("all");

  const summary = React.useMemo(
    () => buildStudentAttendanceSummary(student.attendanceHistory),
    [student.attendanceHistory],
  );

  const filteredHistory = React.useMemo(
    () =>
      attendanceStatusFilter === "all"
        ? student.attendanceHistory
        : student.attendanceHistory.filter(
            (a) => a.status === attendanceStatusFilter,
          ),
    [student.attendanceHistory, attendanceStatusFilter],
  );

  return (
    <div className="space-y-6">
      {/* 1. Attendance Summary KPI Cards & Filter History */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <CalendarCheck className="size-5 text-primary" aria-hidden="true" />
              Thống kê & Lịch sử Điểm danh Chuyên cần
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tổng hợp toàn bộ {student.attendanceHistory.length} buổi học đã ghi nhận của lớp{" "}
              <strong className="text-foreground">{student.className}</strong>.
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {student.attendanceHistory.length} buổi đã ghi nhận
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-border bg-muted/20 p-3.5">
            <span className="text-[11px] text-muted-foreground">
              Tỷ lệ chuyên cần
            </span>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-primary">
              {summary.rate}%
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
            <span className="text-[11px] text-emerald-800">
              Có mặt đúng giờ
            </span>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-700">
              {summary.present}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
            <span className="text-[11px] text-amber-800">Đi muộn</span>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-700">
              {summary.late}
            </p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3.5">
            <span className="text-[11px] text-red-700">Vắng mặt</span>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-red-700">
              {summary.absent}
            </p>
          </div>
          <div className="col-span-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 sm:col-span-1">
            <span className="text-[11px] text-blue-800">Nghỉ có phép</span>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-blue-700">
              {summary.excused}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["all", `Tất cả (${student.attendanceHistory.length})`],
              ["present", `Có mặt (${summary.present})`],
              ["late", `Đi muộn (${summary.late})`],
              ["absent", `Vắng mặt (${summary.absent})`],
              ["excused", `Có phép (${summary.excused})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAttendanceStatusFilter(key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                attendanceStatusFilter === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
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
                  className="flex flex-col justify-between rounded-2xl border border-border bg-background p-4"
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
      </section>

      {/* 2. Completed Session Teaching Journal & Homework Status */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <ClipboardList className="size-5 text-primary" aria-hidden="true" />
              Nhật ký từng buổi học, Nhận xét & Tình trạng nộp BTVN
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Chi tiết nội dung bài giảng, đánh giá cá nhân trên lớp và trạng thái bài tập về nhà từng buổi.
            </p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {sessionTimeline.length} buổi đã ghi nhật ký
          </span>
        </div>

        {sessionTimeline.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            Chưa có nhật ký buổi học nào được cập nhật cho lớp của bạn.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sessionTimeline.map((entry) => {
              const attBadge =
                entry.studentAttendance === "present"
                  ? {
                      label: "Có mặt",
                      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    }
                  : entry.studentAttendance === "late"
                    ? {
                        label: "Đi muộn",
                        cls: "bg-amber-50 text-amber-800 border-amber-200",
                      }
                    : entry.studentAttendance === "excused"
                      ? {
                          label: "Có phép",
                          cls: "bg-blue-50 text-blue-700 border-blue-200",
                        }
                      : {
                          label: "Vắng",
                          cls: "bg-red-50 text-red-700 border-red-200",
                        };

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
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-background p-4 shadow-2xs"
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

                    <h3 className="font-heading text-sm font-semibold text-foreground">
                      {entry.topic}
                    </h3>

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
        )}
      </section>
    </div>
  );
}
