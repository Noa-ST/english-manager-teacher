"use client";

import * as React from "react";
import { CalendarClock, ChevronDown, ChevronUp, PlusCircle } from "lucide-react";

import type { PendingScheduleJournalItem } from "@/services/classroom-data";
import { formatDisplayDateVi } from "@/services/schedule-calendar-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PendingSessionsBannerProps {
  pendingItems: PendingScheduleJournalItem[];
  creatingKey: string | null;
  onQuickCreate: (item: PendingScheduleJournalItem) => void;
}

export function PendingSessionsBanner({
  pendingItems,
  creatingKey,
  onQuickCreate,
}: PendingSessionsBannerProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (pendingItems.length === 0) return null;

  const visibleItems = expanded ? pendingItems : pendingItems.slice(0, 3);

  return (
    <section
      aria-label="Buổi học theo thời khóa biểu chưa lập nhật ký"
      className="rounded-2xl border border-amber-300/70 bg-amber-50/70 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <CalendarClock className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-heading text-sm font-semibold text-amber-950">
              {pendingItems.length} buổi học gần đây theo Thời khóa biểu chưa có nhật ký
            </h2>
            <p className="text-xs text-amber-900/80">
              Tạo nhanh nhật ký từ ca dạy thực tế (bao gồm lịch tuần, đổi lịch & dạy bù trong 14 ngày gần nhất).
            </p>
          </div>
        </div>

        {pendingItems.length > 3 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-amber-950 hover:bg-amber-200/50"
          >
            {expanded ? (
              <>
                Thu gọn <ChevronUp className="size-3.5" aria-hidden="true" />
              </>
            ) : (
              <>
                Xem tất cả ({pendingItems.length}){" "}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </>
            )}
          </Button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
        {visibleItems.map((item) => {
          const isCreating = creatingKey === item.occurrenceKey;
          return (
            <div
              key={item.occurrenceKey}
              className="flex flex-col justify-between gap-2 rounded-xl border border-amber-200 bg-card p-3 shadow-2xs"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[11px] font-semibold">
                      {item.classCode}
                    </Badge>
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
                  <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                    Tuần {item.weekNumber}
                  </span>
                </div>

                <p className="line-clamp-1 text-sm font-medium text-foreground">
                  {item.topic || item.className}
                </p>
                <p
                  className="truncate text-xs text-muted-foreground tabular-nums"
                  title={`${item.dayLabel}, ${formatDisplayDateVi(item.date)} · ${item.startTime}–${item.endTime} · ${item.room}`}
                >
                  {item.dayLabel}, {formatDisplayDateVi(item.date)} · {item.startTime}–
                  {item.endTime} · {item.room}
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={Boolean(creatingKey)}
                onClick={() => onQuickCreate(item)}
                className="h-8 w-full justify-center text-xs"
              >
                <PlusCircle className="size-3.5" aria-hidden="true" />
                {isCreating ? "Đang khởi tạo..." : "Tạo nhật ký buổi này"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
