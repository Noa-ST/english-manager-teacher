"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Calendar,
  Check,
  ClipboardCheck,
  CopyPlus,
  CreditCard,
  Edit3,
  FastForward,
  FileWarning,
  Layers,
  ListChecks,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import type { ClassroomGroup } from "@/services/classroom-data";
import {
  CLASSROOM_STATUS_META,
  computeClassroomProgress,
  type ClassroomHealthSummary,
} from "@/services/classroom-helpers";
import { formatDisplayDate } from "@/services/student-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ClassDetailTab = "overview" | "curriculum" | "students" | "sessions" | "assessments";

interface ClassCardProps {
  cls: ClassroomGroup;
  health?: ClassroomHealthSummary;
  onOpenDetail: (cls: ClassroomGroup, initialTab?: ClassDetailTab) => void;
  onAdvanceNextWeek: (cls: ClassroomGroup) => void;
  onEdit: (cls: ClassroomGroup) => void;
  onClone: (cls: ClassroomGroup) => void;
  onArchive: (cls: ClassroomGroup) => void;
  onRestore: (cls: ClassroomGroup) => void;
}

export function ClassCard({
  cls,
  health,
  onOpenDetail,
  onAdvanceNextWeek,
  onEdit,
  onClone,
  onArchive,
  onRestore,
}: ClassCardProps) {
  const statusMeta = CLASSROOM_STATUS_META[cls.status];
  const progress = computeClassroomProgress(cls);
  const isArchived = cls.status === "archived";
  const isCompleted = cls.status === "completed";
  const isLastWeek = progress.currentWeek >= progress.totalWeeks;

  const capacityPct = Math.min(
    100,
    cls.capacity > 0 ? Math.round((cls.enrolled / cls.capacity) * 100) : 0,
  );

  const currentWeekItem = cls.curriculum?.find(
    (w) => w.weekNumber === progress.currentWeek,
  );
  const moduleTitle = cls.currentModule.includes("·")
    ? cls.currentModule.split("·").slice(1).join("·").trim()
    : cls.currentModule;

  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border bg-card p-6 shadow-2xs transition-all ${
        isArchived
          ? "border-border/50 opacity-75"
          : "border-border hover:border-primary/40"
      }`}
    >
      <div>
        {/* Top badges & Icon actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="default" className="font-mono">
              {cls.code}
            </Badge>
            <Badge variant="outline" className={`text-[11px] ${statusMeta.badgeClass}`}>
              {statusMeta.shortLabel}
            </Badge>
            <Badge variant="secondary">{cls.level}</Badge>
            <Badge variant="warm">{cls.targetBand}</Badge>
          </div>
          <div className="flex items-center gap-1">
            {!isArchived && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onClone(cls)}
                  aria-label={`Nhân bản khóa mới từ ${cls.name}`}
                  title="Nhân bản mở khóa mới (giữ nguyên giáo trình)"
                >
                  <CopyPlus className="size-3.5 text-primary" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onEdit(cls)}
                  aria-label={`Chỉnh sửa lớp ${cls.name}`}
                  title="Chỉnh sửa thông tin lớp & TKB"
                >
                  <Edit3 className="size-3.5" aria-hidden="true" />
                </Button>
              </>
            )}
            {isArchived ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRestore(cls)}
                aria-label={`Khôi phục lớp ${cls.name}`}
                title="Khôi phục lớp học"
              >
                <RotateCcw className="size-3.5 text-emerald-600" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onArchive(cls)}
                aria-label={`Lưu trữ lớp ${cls.name}`}
                title="Lưu trữ lớp học"
              >
                <Archive className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenDetail(cls, "overview")}
          className="mt-3 block text-left font-heading text-xl font-bold text-foreground transition-colors hover:text-primary"
        >
          {cls.name}
        </button>

        {/* Curriculum Progress & Readiness */}
        <div className="mt-3 rounded-xl border border-warm/70 bg-warm/35 p-3.5 text-xs text-foreground/90">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                  <Layers className="size-3" aria-hidden="true" />
                  Đang dạy Tuần {progress.currentWeek}/{progress.totalWeeks}
                </span>
                {currentWeekItem?.isAssessmentMilestone && (
                  <Badge variant="gold" className="px-1.5 py-0 text-[10px]">
                    Cột mốc kiểm tra
                  </Badge>
                )}
                {progress.isBehindSchedule && (
                  <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                    Chậm tiến độ
                  </Badge>
                )}
              </div>
              <p className="truncate font-medium text-foreground" title={moduleTitle}>
                {moduleTitle}
              </p>
            </div>

            {!isArchived && !isCompleted && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onOpenDetail(cls, "curriculum")}
                  title="Xem & quản lý toàn bộ lộ trình học phần"
                  className="h-7 whitespace-nowrap text-[11px]"
                >
                  <ListChecks className="size-3" aria-hidden="true" />
                  Lộ trình
                </Button>

                {!isLastWeek ? (
                  <Button
                    size="xs"
                    onClick={() => onAdvanceNextWeek(cls)}
                    title={`Đánh dấu hoàn thành Tuần ${progress.currentWeek} & chuyển sang Tuần ${progress.currentWeek + 1}`}
                    className="h-7 whitespace-nowrap text-[11px]"
                  >
                    <FastForward className="size-3" aria-hidden="true" />
                    Tuần {progress.currentWeek + 1}
                  </Button>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-7 whitespace-nowrap border-emerald-500/40 text-emerald-700"
                  >
                    <Check className="mr-1 size-3" aria-hidden="true" />
                    Tuần cuối
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Dual consistent progress bar: actual completed weeks */}
          <div className="mt-2.5 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Thực hoàn thành:{" "}
                <strong className="text-foreground">
                  {progress.completedWeeks}/{progress.totalWeeks} tuần
                </strong>
              </span>
              <span className="font-mono font-semibold text-primary">
                {progress.completionPct}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress.completionPct}%` }}
              />
            </div>
          </div>

          {!isArchived &&
            !isCompleted &&
            health &&
            (health.missingCurrentMaterials || health.missingNextMaterials) && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
                <FileWarning className="size-3.5 shrink-0 text-amber-600" />
                {health.missingCurrentMaterials
                  ? `Tuần ${progress.currentWeek} chưa có tài liệu/BTVN đính kèm.`
                  : `Tuần ${progress.currentWeek + 1} chưa chuẩn bị trước học liệu.`}
              </p>
            )}
        </div>

        {/* Schedule, Room, Start/End dates & Tuition due date */}
        <div className="mt-4 grid gap-1.5 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-2 text-foreground/85 sm:col-span-2">
            <Calendar className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="font-medium">{cls.scheduleSummary}</span>
          </div>
          <div className="flex items-center gap-2 text-foreground/85">
            <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate font-medium">{cls.room}</span>
          </div>
          {cls.tuitionDueDate && (
            <div className="flex items-center gap-2 text-foreground/85">
              <CreditCard className="size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              <span className="font-medium">
                Hạn HP: {formatDisplayDate(cls.tuitionDueDate)}
              </span>
            </div>
          )}
          {cls.startDate && (
            <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
              <span className="text-[11px]">
                Khai giảng: <strong className="text-foreground">{formatDisplayDate(cls.startDate)}</strong>
                {cls.expectedEndDate
                  ? ` → Dự kiến kết thúc: ${formatDisplayDate(cls.expectedEndDate)}`
                  : ""}
              </span>
            </div>
          )}
        </div>

        {/* Capacity Bar */}
        <div className="mt-4 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-foreground">
              Sĩ số ({cls.enrolled}/{cls.capacity} HV)
              {health && (health.trialCount > 0 || health.onLeaveCount > 0) && (
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  ({health.trialCount > 0 ? `${health.trialCount} thử` : ""}
                  {health.trialCount > 0 && health.onLeaveCount > 0 ? ", " : ""}
                  {health.onLeaveCount > 0 ? `${health.onLeaveCount} bảo lưu` : ""})
                </span>
              )}
            </span>
            <span className="font-mono font-semibold text-primary">
              {capacityPct}% công suất
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                capacityPct >= 100
                  ? "bg-destructive"
                  : capacityPct >= 85
                    ? "bg-amber-500"
                    : "bg-primary"
              }`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer Metrics & Actions */}
      <div className="mt-5 space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-4">
            <span>
              Điểm TB:{" "}
              <strong className="font-mono font-bold text-primary">
                {cls.averageScore > 0 ? cls.averageScore.toFixed(1) : "—"}
              </strong>
            </span>
            <span>
              Chuyên cần:{" "}
              <strong className="font-mono font-bold text-emerald-700">
                {cls.attendanceRate}%
              </strong>
            </span>
            {health && health.overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle className="size-3" />
                {health.overdueCount} quá hạn HP
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="default"
            size="xs"
            onClick={() => onOpenDetail(cls, "overview")}
            className="whitespace-nowrap"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Điều hành 360°
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onOpenDetail(cls, "students")}
            className="whitespace-nowrap"
          >
            <Users className="size-3.5" aria-hidden="true" />
            Học viên ({cls.enrolled})
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onOpenDetail(cls, "sessions")}
            className="whitespace-nowrap"
          >
            <ListChecks className="size-3.5" aria-hidden="true" />
            Buổi học
          </Button>
          {!isArchived && (
            <>
              <Button
                size="xs"
                variant="outline"
                render={<Link href={`/grades?classId=${encodeURIComponent(cls.id)}`} />}
                nativeButton={false}
                className="whitespace-nowrap"
              >
                <BarChart3 className="size-3.5" aria-hidden="true" />
                Bảng điểm
              </Button>
              <Button
                size="xs"
                variant="outline"
                render={<Link href={`/attendance?classId=${encodeURIComponent(cls.id)}`} />}
                nativeButton={false}
                className="whitespace-nowrap"
              >
                <ClipboardCheck className="size-3.5 text-primary" aria-hidden="true" />
                Điểm danh
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
