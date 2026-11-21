"use client";

import { Clock, UserCheck, UserMinus, UserX } from "lucide-react";

import type { AttendanceSummaryStats } from "@/services/attendance-helpers";
import { Badge } from "@/components/ui/badge";

interface AttendanceKpiStripProps {
  stats: AttendanceSummaryStats;
  alreadyRecorded: boolean;
  isDirty: boolean;
  isCanceledDate: boolean;
}

export function AttendanceKpiStrip({
  stats,
  alreadyRecorded,
  isDirty,
  isCanceledDate,
}: AttendanceKpiStripProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div className="flex min-h-[100px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Tỷ lệ chuyên cần
          </span>
          {isCanceledDate ? (
            <Badge variant="destructive" className="text-[10px]">
              Tạm nghỉ
            </Badge>
          ) : isDirty ? (
            <Badge variant="warning" className="text-[10px]">
              Chưa lưu
            </Badge>
          ) : alreadyRecorded ? (
            <Badge variant="success" className="text-[10px]">
              Đã lưu sổ
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Chưa ĐD
            </Badge>
          )}
        </div>
        <p className="font-mono text-2xl font-bold tabular-nums text-primary">
          {stats.rate}%
        </p>
      </div>

      <div className="flex min-h-[100px] flex-col justify-between rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
          <UserCheck className="size-3.5 shrink-0" aria-hidden="true" />
          Có mặt đúng giờ
        </span>
        <p className="font-mono text-2xl font-bold tabular-nums text-emerald-700">
          {stats.present}
        </p>
      </div>

      <div className="flex min-h-[100px] flex-col justify-between rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          Đi muộn
        </span>
        <p className="font-mono text-2xl font-bold tabular-nums text-amber-700">
          {stats.late}
        </p>
      </div>

      <div className="flex min-h-[100px] flex-col justify-between rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
          <UserX className="size-3.5 shrink-0" aria-hidden="true" />
          Vắng mặt
        </span>
        <p className="font-mono text-2xl font-bold tabular-nums text-destructive">
          {stats.absent}
        </p>
      </div>

      <div className="col-span-2 flex min-h-[100px] flex-col justify-between rounded-2xl border border-border bg-warm/50 p-4 sm:col-span-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
          <UserMinus className="size-3.5 shrink-0" aria-hidden="true" />
          Nghỉ có phép
        </span>
        <p className="font-mono text-2xl font-bold tabular-nums text-primary">
          {stats.excused}
        </p>
      </div>
    </div>
  );
}
