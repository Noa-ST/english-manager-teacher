"use client";

import * as React from "react";
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  Users,
} from "lucide-react";
import type { ClassroomGroup } from "@/services/classroom-data";
import type { ScheduleRangeKpis } from "@/services/schedule-calendar-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ScheduleStatusFilter =
  | "all"
  | "upcoming"
  | "ongoing"
  | "completed"
  | "exceptions"
  | "conflicts";

interface ScheduleKpiStripProps {
  kpis: ScheduleRangeKpis;
  classes: ClassroomGroup[];
  rooms: string[];
  selectedClassCode: string;
  selectedRoom: string;
  statusFilter: ScheduleStatusFilter;
  onClassCodeChange: (val: string) => void;
  onRoomChange: (val: string) => void;
  onStatusFilterChange: (val: ScheduleStatusFilter) => void;
  onResetFilters: () => void;
  onExportIcs: () => void;
  onExportCsv: () => void;
}

export function ScheduleKpiStrip({
  kpis,
  classes,
  rooms,
  selectedClassCode,
  selectedRoom,
  statusFilter,
  onClassCodeChange,
  onRoomChange,
  onStatusFilterChange,
  onResetFilters,
  onExportIcs,
  onExportCsv,
}: ScheduleKpiStripProps) {
  const attendancePct =
    kpis.totalActiveSessions > 0
      ? Math.round((kpis.attendanceRecordedCount / kpis.totalActiveSessions) * 100)
      : 100;
  const journalPct =
    kpis.totalActiveSessions > 0
      ? Math.round((kpis.journalCompletedCount / kpis.totalActiveSessions) * 100)
      : 100;

  const hasActiveFilters =
    selectedClassCode !== "all" ||
    selectedRoom !== "all" ||
    statusFilter !== "all";

  return (
    <div className="space-y-3">
      {/* 5 Equal-height KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Ca dạy thực tế</span>
            <Calendar className="size-4 shrink-0 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {kpis.totalActiveSessions}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {kpis.makeupCount} dạy bù · {kpis.rescheduledCount} đổi lịch ·{" "}
              {kpis.canceledCount} tạm nghỉ
            </p>
          </div>
        </div>

        <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Tổng tải giảng dạy</span>
            <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <p className="font-mono text-2xl font-bold tabular-nums text-primary">
              {kpis.totalTeachingHours} giờ
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Trên {kpis.roomUtilization.length} phòng học hoạt động
            </p>
          </div>
        </div>

        <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Lượt HV dự kiến</span>
            <Users className="size-4 shrink-0 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {kpis.totalExpectedStudentVisits}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Đồng bộ sĩ số thực tế các lớp
            </p>
          </div>
        </div>

        <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Đã điểm danh</span>
            <ClipboardCheck className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <p className="font-mono text-2xl font-bold tabular-nums text-emerald-700">
              {kpis.attendanceRecordedCount}/{kpis.totalActiveSessions}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Phủ {attendancePct}% ca học trong kỳ
            </p>
          </div>
        </div>

        <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Nhật ký giảng dạy</span>
            <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {kpis.journalCompletedCount}/{kpis.totalActiveSessions}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Hoàn tất {journalPct}% nhật ký chuyên môn
            </p>
          </div>
        </div>
      </div>

      {/* Balanced Single-Row Filter & Export Bar on Desktop */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-foreground">
            <Filter className="size-3.5 text-primary" aria-hidden="true" />
            Bộ lọc:
          </span>

          <select
            aria-label="Lọc theo lớp học"
            value={selectedClassCode}
            onChange={(e) => onClassCodeChange(e.target.value)}
            className="h-9 w-full truncate rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground sm:w-44"
          >
            <option value="all">Tất cả lớp học</option>
            {classes
              .filter((c) => c.status !== "archived" && c.status !== "completed")
              .map((cls) => (
                <option key={cls.id} value={cls.code}>
                  {cls.code} — {cls.name}
                </option>
              ))}
          </select>

          <select
            aria-label="Lọc theo phòng học"
            value={selectedRoom}
            onChange={(e) => onRoomChange(e.target.value)}
            className="h-9 w-full truncate rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground sm:w-44"
          >
            <option value="all">Tất cả phòng học</option>
            {rooms.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo trạng thái ca học"
            value={statusFilter}
            onChange={(e) =>
              onStatusFilterChange(e.target.value as ScheduleStatusFilter)
            }
            className="h-9 w-full truncate rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground sm:w-44"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="ongoing">Hôm nay</option>
            <option value="upcoming">Sắp diễn ra</option>
            <option value="completed">Đã qua / Hoàn thành</option>
            <option value="exceptions">Thay đổi lịch (Dạy bù / Dời / Nghỉ)</option>
            <option value="conflicts">Chỉ xem ca xung đột</option>
          </select>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onResetFilters}
              className="h-9 gap-1 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              Đặt lại
            </Button>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 whitespace-nowrap">
          {kpis.conflictCount > 0 && (
            <Badge variant="destructive" className="h-9 whitespace-nowrap rounded-lg px-2.5 text-xs">
              {kpis.conflictCount} xung đột trong kỳ
            </Badge>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExportIcs}
            title="Xuất tệp lịch .ICS cho Google / Apple Calendar"
            className="h-9 gap-1.5 whitespace-nowrap text-xs"
          >
            <Download className="size-3.5 text-primary" aria-hidden="true" />
            Xuất .ICS
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExportCsv}
            className="h-9 gap-1.5 whitespace-nowrap text-xs"
          >
            <FileSpreadsheet className="size-3.5 text-primary" aria-hidden="true" />
            Xuất CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
