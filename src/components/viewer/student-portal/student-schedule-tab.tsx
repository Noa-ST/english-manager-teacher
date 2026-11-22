"use client";

import * as React from "react";
import {
  BookOpen,
  Calendar,
  Download,
  FileText,
  Lock,
} from "lucide-react";
import type {
  AdminStudentRecord,
  StudentScheduleOccurrence,
  WeeklyClassSession,
} from "@/services/classroom-data";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface StudentScheduleTabProps {
  student: AdminStudentRecord;
  classSchedule: WeeklyClassSession[];
  upcomingOccurrences: StudentScheduleOccurrence[];
  roadmap: SanitizedStudentClassroomRoadmap | null;
  downloadingFileId: string | null;
  onDownloadMaterial: (fileId: string, fileName: string) => void;
}

export function StudentScheduleTab({
  student,
  classSchedule,
  upcomingOccurrences,
  roadmap,
  downloadingFileId,
  onDownloadMaterial,
}: StudentScheduleTabProps) {
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      {/* 1. 14-Day Schedule & Weekly Fixed Slots */}
      <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <Calendar className="size-5 text-primary" aria-hidden="true" />
              Lịch học lớp {student.className}
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
                  `Lịch học ${student.className}`,
                );
                downloadTextFile(
                  `lich-hoc-${student.code}.ics`,
                  ics,
                  "text/calendar;charset=utf-8",
                );
                toast({
                  title: "Đã tải tệp lịch .ICS",
                  description:
                    "Mở tệp để thêm lịch học vào Google Calendar hoặc Apple Calendar.",
                  variant: "success",
                });
              }}
            >
              <Download className="size-3.5 text-primary" aria-hidden="true" />
              Tải lịch 14 ngày (.ICS)
            </Button>
          )}
        </div>

        {upcomingOccurrences.length > 0 ? (
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
        ) : (
          <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            Chưa có ca học nào được lên lịch trong 14 ngày tới.
          </p>
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
      </section>

      {/* 2. Classroom Syllabus Roadmap & Unlocked Materials */}
      {roadmap && roadmap.weeks.length > 0 && (
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
                        {week.scheduledDate
                          ? ` · ${formatDisplayDate(week.scheduledDate)}`
                          : ""}
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
                        <Badge variant={statusBadge.variant}>
                          {statusBadge.label}
                        </Badge>
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
                                    onDownloadMaterial(fileKey, att.name)
                                  }
                                  className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
                                >
                                  <FileText
                                    className="size-3 text-primary"
                                    aria-hidden="true"
                                  />
                                  <span className="max-w-44 truncate">
                                    {att.name}
                                  </span>
                                  <Download
                                    className="size-3 text-muted-foreground"
                                    aria-hidden="true"
                                  />
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
    </div>
  );
}
