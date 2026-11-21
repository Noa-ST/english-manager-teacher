"use client";

import * as React from "react";
import { CalendarCheck2, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

import {
  formatAttendanceDateVi,
  type PendingAttendanceItem,
} from "@/services/attendance-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AttendancePendingQueueProps {
  items: PendingAttendanceItem[];
  activeClassId: string;
  activeDate: string;
  onSelect: (item: PendingAttendanceItem) => void;
}

export function AttendancePendingQueue({
  items,
  activeClassId,
  activeDate,
  onSelect,
}: AttendancePendingQueueProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (items.length === 0) return null;

  const visibleItems = expanded ? items : items.slice(0, 3);

  return (
    <section
      aria-label="Ca học chờ điểm danh trong 7 ngày gần đây"
      className="rounded-2xl border border-amber-300/70 bg-amber-50/60 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <CalendarCheck2 className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-heading text-sm font-semibold text-amber-950">
              {items.length} ca học trong 7 ngày gần đây chưa điểm danh
            </h2>
            <p className="text-xs text-amber-900/80">
              Chọn nhanh 1 chạm để mở đúng lớp, ca dạy (bao gồm dạy bù / đổi lịch) và ngày học.
            </p>
          </div>
        </div>

        {items.length > 3 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            className="h-8 text-amber-950 hover:bg-amber-200/50"
          >
            {expanded ? (
              <>
                Thu gọn <ChevronUp className="size-3.5" aria-hidden="true" />
              </>
            ) : (
              <>
                Xem tất cả ({items.length}){" "}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </>
            )}
          </Button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
        {visibleItems.map((item) => {
          const isCurrent =
            item.classId === activeClassId && item.date === activeDate;
          const timeRoomText = `${item.dayLabel}, ${formatAttendanceDateVi(item.date)} · ${item.startTime}–${item.endTime} · ${item.room}`;

          return (
            <div
              key={item.occurrenceKey}
              className="flex flex-col justify-between gap-2.5 rounded-xl border border-amber-200 bg-card p-3 shadow-2xs"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[11px] font-semibold">
                      {item.classCode}
                    </Badge>
                    {item.isToday && (
                      <Badge variant="gold" className="text-[10px]">
                        <Sparkles className="size-2.5" aria-hidden="true" />
                        Hôm nay
                      </Badge>
                    )}
                    {item.source === "makeup" && (
                      <Badge className="bg-purple-100 text-purple-800 text-[10px]">
                        Dạy bù
                      </Badge>
                    )}
                    {item.source === "rescheduled" && (
                      <Badge className="bg-blue-100 text-blue-800 text-[10px]">
                        Đổi lịch
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {item.enrolledCount} HV
                  </span>
                </div>

                <p className="line-clamp-1 text-sm font-medium text-foreground">
                  {item.topic || item.className}
                </p>
                <p
                  title={timeRoomText}
                  className="truncate text-xs text-muted-foreground tabular-nums"
                >
                  {timeRoomText}
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                variant={isCurrent ? "default" : "secondary"}
                onClick={() => onSelect(item)}
                className="h-8 w-full justify-center text-xs"
              >
                {isCurrent ? "Đang mở ca này" : "Điểm danh ngay"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
