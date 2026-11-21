"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Edit3,
  MapPin,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import type { ResolvedScheduleOccurrence } from "@/services/classroom-data";
import type { WeekDateSlot } from "@/services/schedule-calendar-helpers";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ScheduleWeekGridProps {
  weekDates: WeekDateSlot[];
  todayIso: string;
  occurrences: ResolvedScheduleOccurrence[];
  onAddSessionForDay: (dayOfWeek: number, date: string) => void;
  onViewDetail: (occ: ResolvedScheduleOccurrence) => void;
  onEditRecurring: (sessionId: string) => void;
  onOpenException: (
    occ: ResolvedScheduleOccurrence,
    mode: "rescheduled" | "canceled",
  ) => void;
  onDeleteRecurring: (
    sessionId: string,
    className: string,
    dayLabel: string,
  ) => void;
  onRevertException: (exceptionId: string) => void;
}

export function ScheduleWeekGrid({
  weekDates,
  todayIso,
  occurrences,
  onAddSessionForDay,
  onViewDetail,
  onEditRecurring,
  onOpenException,
  onDeleteRecurring,
  onRevertException,
}: ScheduleWeekGridProps) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
      {weekDates.map((dayItem) => {
        const dayOccurrences = occurrences
          .filter((o) => o.date === dayItem.date)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const activeCount = dayOccurrences.filter(
          (o) => o.status !== "canceled",
        ).length;
        const isToday = dayItem.date === todayIso;

        return (
          <div
            key={dayItem.date}
            className={cn(
              "flex flex-col rounded-2xl border bg-card p-2.5 shadow-2xs transition-colors",
              isToday
                ? "border-primary/60 ring-1 ring-primary/20 bg-primary/[0.015]"
                : "border-border",
            )}
          >
            {/* Uniform 2-Row Column Day Header */}
            <div className="border-b border-border pb-2.5">
              <div className="flex items-center justify-between gap-1">
                <p className="font-heading text-xs font-bold whitespace-nowrap text-foreground">
                  {dayItem.dayLabel}
                </p>

                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] whitespace-nowrap">
                    {activeCount} ca
                  </Badge>
                  <button
                    type="button"
                    onClick={() => onAddSessionForDay(dayItem.dayOfWeek, dayItem.date)}
                    title={`Thêm ca dạy ngày ${dayItem.displayDate}`}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer"
                    aria-label={`Thêm ca dạy ngày ${dayItem.displayDate}`}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <p
                className={cn(
                  "mt-0.5 font-mono text-[11px] whitespace-nowrap",
                  isToday ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                {isToday ? `${dayItem.shortDate} · Hôm nay` : dayItem.displayDate}
              </p>
            </div>

            {/* Cards Stack */}
            <div className="mt-3 flex-1 space-y-2.5">
              {dayOccurrences.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onAddSessionForDay(dayItem.dayOfWeek, dayItem.date)}
                  className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground transition-all hover:border-primary/60 hover:bg-primary/5 hover:text-primary cursor-pointer"
                >
                  <Plus className="size-4 text-primary" aria-hidden="true" />
                  <span>Trống lịch · Thêm ca</span>
                </button>
              ) : (
                dayOccurrences.map((occ) => {
                  const isCanceled = occ.status === "canceled";
                  const sessionParam =
                    occ.recurringSessionId || occ.classSessionId || occ.occurrenceKey;

                  return (
                    <div
                      key={occ.occurrenceKey}
                      onClick={() => onViewDetail(occ)}
                      className={cn(
                        "flex min-h-[252px] flex-col justify-between overflow-hidden rounded-xl border p-2.5 text-xs transition-all shadow-2xs cursor-pointer",
                        isCanceled
                          ? "border-dashed border-destructive/40 bg-destructive/[0.03] opacity-85"
                          : occ.hasConflict
                            ? "border-destructive/60 bg-destructive/5"
                            : occ.source === "makeup"
                              ? "border-sky-500/40 bg-sky-500/[0.04]"
                              : occ.source === "rescheduled"
                                ? "border-amber-500/40 bg-amber-500/[0.04]"
                                : isToday
                                  ? "border-primary/40 bg-warm/40"
                                  : "border-border bg-background hover:border-primary/40 hover:shadow-xs",
                      )}
                    >
                      {/* 1. Top Row: Unwrapped Class Code + Compact Action Icons */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="shrink-0 whitespace-nowrap rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                            {occ.classCode}
                          </span>
                          {isCanceled && (
                            <Badge variant="destructive" className="shrink-0 whitespace-nowrap px-1 py-0 text-[9px]">
                              Nghỉ
                            </Badge>
                          )}
                          {occ.source === "makeup" && !isCanceled && (
                            <Badge variant="info" className="shrink-0 whitespace-nowrap px-1 py-0 text-[9px]">
                              Bù
                            </Badge>
                          )}
                          {occ.source === "rescheduled" && !isCanceled && (
                            <Badge variant="warning" className="shrink-0 whitespace-nowrap px-1 py-0 text-[9px]">
                              Đổi
                            </Badge>
                          )}
                        </div>

                        <div
                          className="flex shrink-0 items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {occ.source === "recurring" && occ.recurringSessionId && !isCanceled && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditRecurring(occ.recurringSessionId!)}
                                title="Sửa lịch cố định"
                                aria-label={`Sửa lịch cố định ${occ.classCode}`}
                                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer"
                              >
                                <Edit3 className="size-3" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenException(occ, "rescheduled")}
                                title="Dời hoặc báo nghỉ riêng buổi này"
                                aria-label={`Dời hoặc báo nghỉ buổi ${occ.classCode}`}
                                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-700 cursor-pointer"
                              >
                                <CalendarClock className="size-3" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onDeleteRecurring(
                                    occ.recurringSessionId!,
                                    occ.className,
                                    occ.dayLabel,
                                  )
                                }
                                title="Xóa ca dạy cố định khỏi tuần"
                                aria-label={`Xóa ca ${occ.classCode}`}
                                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                              >
                                <Trash2 className="size-3" aria-hidden="true" />
                              </button>
                            </>
                          )}

                          {occ.exceptionId && (
                            <button
                              type="button"
                              onClick={() => onRevertException(occ.exceptionId!)}
                              title="Hoàn tác / Hủy ngoại lệ lịch này"
                              aria-label={`Hoàn tác ngoại lệ ca ${occ.classCode}`}
                              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                            >
                              <RotateCcw className="size-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 2. Time Range on dedicated unobstructed line */}
                      <div className="mt-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] font-bold text-primary",
                            isCanceled && "line-through text-muted-foreground",
                          )}
                        >
                          <Clock className="size-3 shrink-0" aria-hidden="true" />
                          {occ.startTime} – {occ.endTime}
                        </span>
                      </div>

                      {/* 3. Uniform-Height Class Name & Topic */}
                      <div className="mt-1.5 space-y-1">
                        <p
                          title={occ.className}
                          className="h-[32px] font-heading text-xs font-bold leading-[16px] text-foreground line-clamp-2"
                        >
                          {occ.className}
                        </p>
                        <p
                          title={occ.topic}
                          className="h-[28px] text-[11px] leading-[14px] text-muted-foreground line-clamp-2"
                        >
                          {occ.topic}
                        </p>
                        {occ.exceptionReason && (
                          <p
                            title={occ.exceptionReason}
                            className="line-clamp-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-foreground/80"
                          >
                            Lý do: {occ.exceptionReason}
                          </p>
                        )}
                        {occ.hasConflict && occ.conflictMessage && (
                          <p
                            title={occ.conflictMessage}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive line-clamp-1"
                          >
                            <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                            <span>{occ.conflictMessage}</span>
                          </p>
                        )}
                      </div>

                      {/* 4. Dedicated Room Line + Clean Week & Enrollment Row */}
                      <div className="mt-2 space-y-1 text-[10.5px] text-muted-foreground">
                        <div className="flex items-center gap-1 font-medium text-foreground/85">
                          <MapPin className="size-3 shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate" title={occ.room}>
                            {occ.room.split("·")[0].trim()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 font-mono text-[10px]">
                          <span className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-semibold text-foreground/80">
                            Tuần {occ.weekNumber}/{occ.totalWeeks}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap">
                            <Users className="size-3" aria-hidden="true" />
                            {occ.enrolledCount}/{occ.capacity}
                          </span>
                        </div>
                      </div>

                      {/* 5. Execution Status Pills + Stacked Full-Width Footer Buttons */}
                      <div
                        className="mt-2 space-y-1.5 border-t border-border/70 pt-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isCanceled && (
                          <div className="flex items-center justify-between gap-1 text-[9.5px]">
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-0.5 font-medium",
                                occ.attendanceRecorded
                                  ? "bg-emerald-500/10 text-emerald-700"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {occ.attendanceRecorded && (
                                <CheckCircle2 className="size-2.5 shrink-0" aria-hidden="true" />
                              )}
                              {occ.attendanceRecorded
                                ? `ĐD ${occ.attendanceRate ?? 100}%`
                                : "Chưa ĐD"}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-0.5 font-medium",
                                occ.journalStatus === "completed"
                                  ? "bg-primary/10 text-primary"
                                  : occ.journalStatus === "draft"
                                    ? "bg-amber-500/15 text-amber-800"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {occ.journalStatus === "completed"
                                ? "NK ✓"
                                : occ.journalStatus === "draft"
                                  ? "Nháp NK"
                                  : "Chưa NK"}
                            </span>
                          </div>
                        )}

                        {isCanceled ? (
                          <button
                            type="button"
                            onClick={() => onRevertException(occ.exceptionId!)}
                            className="flex h-7 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-background text-[11px] font-semibold text-foreground transition-colors hover:bg-muted cursor-pointer"
                          >
                            <RotateCcw className="size-3" aria-hidden="true" />
                            <span>Khôi phục buổi</span>
                          </button>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <Link
                              href={{
                                pathname: "/attendance",
                                query: {
                                  classId: occ.classId,
                                  sessionId: sessionParam,
                                  date: occ.date,
                                },
                              }}
                              className="flex h-7 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary/10 px-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                            >
                              <ClipboardCheck className="size-3 shrink-0" aria-hidden="true" />
                              <span>Điểm danh</span>
                            </Link>
                            <Link
                              href={{
                                pathname: "/teaching-journal",
                                query: {
                                  classId: occ.classId,
                                  date: occ.date,
                                  create: "1",
                                },
                              }}
                              className="flex h-7 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-background px-2 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                            >
                              <BookOpen className="size-3 shrink-0" aria-hidden="true" />
                              <span>Nhật ký buổi học</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
