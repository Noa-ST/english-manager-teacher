"use client";

import * as React from "react";
import { AlertTriangle, MapPin, Plus } from "lucide-react";
import type { ResolvedScheduleOccurrence } from "@/services/classroom-data";
import {
  getDurationMinutes,
  type WeekDateSlot,
} from "@/services/schedule-calendar-helpers";
import { normalizeRoomKey } from "@/services/schedule-helper";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ScheduleRoomMatrixProps {
  rooms: string[];
  weekDates: WeekDateSlot[];
  todayIso: string;
  occurrences: ResolvedScheduleOccurrence[];
  onAddSessionForCell: (room: string, dayOfWeek: number, date: string) => void;
  onViewDetail: (occ: ResolvedScheduleOccurrence) => void;
}

export function ScheduleRoomMatrix({
  rooms,
  weekDates,
  todayIso,
  occurrences,
  onAddSessionForCell,
  onViewDetail,
}: ScheduleRoomMatrixProps) {
  const uniqueRooms = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rooms) {
      const k = normalizeRoomKey(r);
      if (k && !map.has(k)) {
        map.set(k, r);
      }
    }
    for (const o of occurrences) {
      const k = normalizeRoomKey(o.room);
      if (k && !map.has(k)) {
        map.set(k, o.room);
      }
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [rooms, occurrences]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-2xs">
      <table className="w-full min-w-[920px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="w-52 border-r border-border p-3 text-left font-heading font-bold text-foreground">
              Phòng học & Công suất tuần
            </th>
            {weekDates.map((d) => {
              const isToday = d.date === todayIso;
              return (
                <th
                  key={d.date}
                  className={cn(
                    "border-r border-border/60 p-2.5 text-center last:border-r-0",
                    isToday && "bg-primary/5",
                  )}
                >
                  <p className="font-heading font-bold text-foreground">
                    {d.dayLabel}
                  </p>
                  <p className="font-mono text-[10px] font-normal text-muted-foreground">
                    {d.shortDate}
                    {isToday ? " · Hôm nay" : ""}
                  </p>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {uniqueRooms.map((roomObj) => {
            const roomOccurrences = occurrences.filter(
              (o) =>
                o.status !== "canceled" &&
                normalizeRoomKey(o.room) === roomObj.key,
            );
            const totalHours =
              Math.round(
                (roomOccurrences.reduce(
                  (sum, o) => sum + getDurationMinutes(o.startTime, o.endTime),
                  0,
                ) /
                  60) *
                  10,
              ) / 10;

            return (
              <tr key={roomObj.key} className="align-top hover:bg-muted/10">
                <td className="border-r border-border bg-muted/15 p-3">
                  <div className="flex items-start gap-2">
                    <MapPin
                      className="mt-0.5 size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div className="space-y-1">
                      <p className="font-heading font-bold text-foreground">
                        {roomObj.label.split("·")[0].trim()}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {roomOccurrences.length} ca · {totalHours} giờ
                      </p>
                    </div>
                  </div>
                </td>

                {weekDates.map((d) => {
                  const cellList = occurrences
                    .filter(
                      (o) =>
                        o.date === d.date &&
                        normalizeRoomKey(o.room) === roomObj.key,
                    )
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                  const isToday = d.date === todayIso;

                  return (
                    <td
                      key={d.date}
                      className={cn(
                        "border-r border-border/50 p-2 last:border-r-0",
                        isToday && "bg-primary/[0.02]",
                      )}
                    >
                      <div className="flex min-h-[76px] flex-col justify-between gap-1.5">
                        {cellList.length === 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              onAddSessionForCell(roomObj.label, d.dayOfWeek, d.date)
                            }
                            className="flex h-full min-h-[72px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary cursor-pointer"
                          >
                            <Plus className="size-3" aria-hidden="true" />
                            <span>Trống</span>
                          </button>
                        ) : (
                          cellList.map((occ) => (
                            <button
                              key={occ.occurrenceKey}
                              type="button"
                              onClick={() => onViewDetail(occ)}
                              className={cn(
                                "w-full rounded-lg border p-1.5 text-left transition-all hover:shadow-xs cursor-pointer",
                                occ.status === "canceled"
                                  ? "border-destructive/30 bg-destructive/5 opacity-75 line-through"
                                  : occ.hasConflict
                                    ? "border-destructive bg-destructive/10"
                                    : occ.source === "makeup"
                                      ? "border-sky-500/40 bg-sky-500/10"
                                      : occ.source === "rescheduled"
                                        ? "border-amber-500/40 bg-amber-500/10"
                                        : "border-primary/25 bg-primary/5 hover:border-primary",
                              )}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <Badge
                                  variant="default"
                                  className="px-1 py-0 font-mono text-[9px]"
                                >
                                  {occ.classCode}
                                </Badge>
                                {occ.hasConflict && (
                                  <AlertTriangle
                                    className="size-3 text-destructive"
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                              <p className="mt-1 font-mono text-[10px] font-bold text-foreground">
                                {occ.startTime}–{occ.endTime}
                              </p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {occ.enrolledCount}/{occ.capacity} HV
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
