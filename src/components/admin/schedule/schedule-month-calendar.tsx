"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  Clock,
  MapPin,
  Plus,
} from "lucide-react";
import type { ResolvedScheduleOccurrence } from "@/services/classroom-data";
import {
  formatDisplayDateVi,
  getDayLabelVi,
  getDayOfWeekIso,
  getMonthCalendarGrid,
} from "@/services/schedule-calendar-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ScheduleMonthCalendarProps {
  year: number;
  monthIndex0: number;
  todayIso: string;
  occurrences: ResolvedScheduleOccurrence[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onAddMakeup: (date: string) => void;
  onViewDetail: (occ: ResolvedScheduleOccurrence) => void;
}

const WEEKDAY_HEADERS = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
];

export function ScheduleMonthCalendar({
  year,
  monthIndex0,
  todayIso,
  occurrences,
  selectedDate,
  onSelectDate,
  onAddMakeup,
  onViewDetail,
}: ScheduleMonthCalendarProps) {
  const cells = React.useMemo(
    () => getMonthCalendarGrid(year, monthIndex0),
    [year, monthIndex0],
  );

  const occByDate = React.useMemo(() => {
    const map = new Map<string, ResolvedScheduleOccurrence[]>();
    for (const occ of occurrences) {
      const bucket = map.get(occ.date) ?? [];
      bucket.push(occ);
      map.set(occ.date, bucket);
    }
    return map;
  }, [occurrences]);

  const selectedDayList = React.useMemo(
    () =>
      (occByDate.get(selectedDate) ?? []).sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      ),
    [occByDate, selectedDate],
  );

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {WEEKDAY_HEADERS.map((h) => (
            <div
              key={h}
              className="border-r border-border/50 px-2 py-2.5 text-center font-heading text-xs font-bold text-foreground last:border-r-0"
            >
              {h}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const list = occByDate.get(cell.date) ?? [];
            const isToday = cell.date === todayIso;
            const isSelected = cell.date === selectedDate;

            return (
              <div
                key={cell.date}
                onClick={() => onSelectDate(cell.date)}
                className={cn(
                  "group relative flex min-h-[120px] flex-col justify-between border-b border-r border-border/60 p-2 text-left transition-colors cursor-pointer",
                  !cell.inMonth && "bg-muted/20 text-muted-foreground/60",
                  isSelected && "bg-primary/[0.04] ring-1 ring-inset ring-primary/40",
                  isToday && !isSelected && "bg-warm/40",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full font-mono text-xs font-bold",
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : cell.inMonth
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                  >
                    {cell.dayNumber}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddMakeup(cell.date);
                    }}
                    title={`Thêm buổi dạy bù ngày ${formatDisplayDateVi(cell.date)}`}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
                    aria-label={`Thêm buổi dạy bù ngày ${formatDisplayDateVi(cell.date)}`}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-1.5 flex-1 space-y-1">
                  {list.slice(0, 3).map((occ) => (
                    <button
                      key={occ.occurrenceKey}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetail(occ);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-85 cursor-pointer",
                        occ.status === "canceled"
                          ? "border-destructive/30 bg-destructive/10 text-destructive line-through"
                          : occ.hasConflict
                            ? "border-destructive/60 bg-destructive/15 text-destructive"
                            : occ.source === "makeup"
                              ? "border-sky-500/30 bg-sky-500/10 text-sky-800"
                              : occ.source === "rescheduled"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-800"
                                : "border-primary/20 bg-primary/10 text-primary",
                      )}
                    >
                      <span className="truncate font-bold">{occ.classCode}</span>
                      <span className="font-mono shrink-0">{occ.startTime}</span>
                    </button>
                  ))}
                  {list.length > 3 && (
                    <span className="block px-1 text-[10px] font-semibold text-primary">
                      +{list.length - 3} ca khác
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Agenda Drawer */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-heading text-sm font-bold text-foreground">
              Lịch trình ngày {getDayLabelVi(getDayOfWeekIso(selectedDate))},{" "}
              {formatDisplayDateVi(selectedDate)}
            </h3>
            <Badge variant="outline">{selectedDayList.length} ca</Badge>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onAddMakeup(selectedDate)}
            className="gap-1.5"
          >
            <Plus className="size-3.5 text-primary" aria-hidden="true" />
            Thêm buổi dạy bù ngày này
          </Button>
        </div>

        {selectedDayList.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Không có ca học nào được lên lịch vào ngày{" "}
            {formatDisplayDateVi(selectedDate)}.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {selectedDayList.map((occ) => {
              const sessionParam =
                occ.recurringSessionId || occ.classSessionId || occ.occurrenceKey;

              return (
                <div
                  key={occ.occurrenceKey}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default" className="font-mono">
                        {occ.classCode}
                      </Badge>
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-primary">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {occ.startTime} – {occ.endTime}
                      </span>
                      {occ.status === "canceled" && (
                        <Badge variant="destructive">Đã nghỉ</Badge>
                      )}
                      {occ.source === "makeup" && (
                        <Badge variant="info">Dạy bù</Badge>
                      )}
                      {occ.source === "rescheduled" && (
                        <Badge variant="warning">Đổi lịch</Badge>
                      )}
                    </div>
                    <p className="font-heading text-sm font-bold text-foreground">
                      {occ.className}
                    </p>
                    <p className="text-xs text-muted-foreground">{occ.topic}</p>
                    <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                      {occ.room} · Sĩ số {occ.enrolledCount}/{occ.capacity} HV
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => onViewDetail(occ)}
                    >
                      Chi tiết
                    </Button>
                    {occ.status !== "canceled" && (
                      <>
                        <Button
                          variant="outline"
                          size="xs"
                          render={
                            <Link
                              href={{
                                pathname: "/attendance",
                                query: {
                                  classId: occ.classId,
                                  sessionId: sessionParam,
                                  date: occ.date,
                                },
                              }}
                            />
                          }
                          nativeButton={false}
                        >
                          <ClipboardCheck className="size-3.5" aria-hidden="true" />
                          Điểm danh
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          render={
                            <Link
                              href={{
                                pathname: "/teaching-journal",
                                query: {
                                  classId: occ.classId,
                                  date: occ.date,
                                  create: "1",
                                },
                              }}
                            />
                          }
                          nativeButton={false}
                        >
                          <BookOpen className="size-3.5" aria-hidden="true" />
                          Nhật ký
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
