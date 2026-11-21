"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CalendarClock,
  ClipboardCheck,
  Clock,
  Download,
  Edit3,
  MapPin,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import type { ResolvedScheduleOccurrence } from "@/services/classroom-data";
import {
  buildScheduleIcsContent,
  downloadTextFile,
  formatDisplayDateVi,
} from "@/services/schedule-calendar-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";

interface SessionDetailModalProps {
  open: boolean;
  onClose: () => void;
  occurrence: ResolvedScheduleOccurrence | null;
  onEditRecurring: (sessionId: string) => void;
  onOpenException: (
    occ: ResolvedScheduleOccurrence,
    mode: "rescheduled" | "canceled",
  ) => void;
  onRevertException: (exceptionId: string) => void;
  onDeleteRecurring: (
    sessionId: string,
    className: string,
    dayLabel: string,
  ) => void;
}

export function SessionDetailModal({
  open,
  onClose,
  occurrence,
  onEditRecurring,
  onOpenException,
  onRevertException,
  onDeleteRecurring,
}: SessionDetailModalProps) {
  if (!occurrence) return null;

  const isCanceled = occurrence.status === "canceled";
  const sessionParam =
    occurrence.recurringSessionId ||
    occurrence.classSessionId ||
    occurrence.occurrenceKey;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={`${occurrence.classCode} — ${occurrence.className}`}
      description={`${occurrence.dayLabel}, ngày ${formatDisplayDateVi(occurrence.date)} · Tuần ${occurrence.weekNumber}/${occurrence.totalWeeks}`}
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="font-mono">
            {occurrence.level}
          </Badge>
          {isCanceled ? (
            <Badge variant="destructive">Đã nghỉ / Tạm hủy</Badge>
          ) : occurrence.source === "makeup" ? (
            <Badge variant="info">Buổi dạy bù</Badge>
          ) : occurrence.source === "rescheduled" ? (
            <Badge variant="warning">Buổi đổi lịch</Badge>
          ) : (
            <Badge variant="outline">Lịch cố định hàng tuần</Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3.5 text-primary" aria-hidden="true" />
              Thời gian học
            </span>
            <p className="mt-1 font-mono text-sm font-bold text-foreground">
              {occurrence.startTime} – {occurrence.endTime}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {occurrence.dayLabel} ({formatDisplayDateVi(occurrence.date)})
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="size-3.5 text-primary" aria-hidden="true" />
              Phòng học
            </span>
            <p className="mt-1 font-semibold text-foreground">{occurrence.room}</p>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Users className="size-3.5 text-primary" aria-hidden="true" />
              Sĩ số thực tế
            </span>
            <p className="mt-1 font-mono text-sm font-bold text-foreground">
              {occurrence.enrolledCount}/{occurrence.capacity} học viên
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 text-xs space-y-1.5">
          <p className="font-semibold text-muted-foreground">Chuyên đề / Nội dung dự kiến</p>
          <p className="font-heading text-sm font-bold text-foreground">
            {occurrence.topic}
          </p>
          {occurrence.exceptionReason && (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-900">
              <strong>Ghi chú ngoại lệ:</strong> {occurrence.exceptionReason}
              {occurrence.originalDate &&
                occurrence.originalDate !== occurrence.date &&
                ` (Ngày gốc: ${formatDisplayDateVi(occurrence.originalDate)})`}
            </p>
          )}
          {occurrence.hasConflict && occurrence.conflictMessage && (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {occurrence.conflictMessage}
            </p>
          )}
        </div>

        {!isCanceled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-xs">
              <div>
                <p className="text-muted-foreground">Trạng thái Điểm danh</p>
                <p className="mt-0.5 font-semibold text-foreground">
                  {occurrence.attendanceRecorded
                    ? `Đã điểm danh (${occurrence.attendanceRate ?? 100}%)`
                    : "Chưa điểm danh buổi này"}
                </p>
              </div>
              <Button
                size="xs"
                render={
                  <Link
                    href={{
                      pathname: "/attendance",
                      query: {
                        classId: occurrence.classId,
                        sessionId: sessionParam,
                        date: occurrence.date,
                      },
                    }}
                  />
                }
                nativeButton={false}
              >
                <ClipboardCheck className="size-3.5" aria-hidden="true" />
                Điểm danh
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-xs">
              <div>
                <p className="text-muted-foreground">Nhật ký giảng dạy</p>
                <p className="mt-0.5 font-semibold text-foreground">
                  {occurrence.journalStatus === "completed"
                    ? "Đã hoàn tất nhật ký"
                    : occurrence.journalStatus === "draft"
                      ? "Đang lưu bản nháp"
                      : "Chưa ghi nhật ký"}
                </p>
              </div>
              <Button
                variant="outline"
                size="xs"
                render={
                  <Link
                    href={{
                      pathname: "/teaching-journal",
                      query: {
                        classId: occurrence.classId,
                        date: occurrence.date,
                        create: "1",
                      },
                    }}
                  />
                }
                nativeButton={false}
              >
                <BookOpen className="size-3.5" aria-hidden="true" />
                Mở nhật ký
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {!isCanceled && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  const ics = buildScheduleIcsContent(
                    [occurrence],
                    `${occurrence.classCode} — ${occurrence.date}`,
                  );
                  downloadTextFile(
                    `lich-hoc-${occurrence.classCode}-${occurrence.date}.ics`,
                    ics,
                    "text/calendar;charset=utf-8",
                  );
                }}
              >
                <Download className="size-3.5 text-primary" aria-hidden="true" />
                Tải .ICS ca này
              </Button>
            )}

            {occurrence.source === "recurring" &&
              occurrence.recurringSessionId &&
              !isCanceled && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      onClose();
                      onEditRecurring(occurrence.recurringSessionId!);
                    }}
                  >
                    <Edit3 className="size-3.5 text-primary" aria-hidden="true" />
                    Sửa ca cố định
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      onClose();
                      onOpenException(occurrence, "rescheduled");
                    }}
                  >
                    <CalendarClock className="size-3.5 text-amber-600" aria-hidden="true" />
                    Dời / Báo nghỉ buổi này
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      onClose();
                      onDeleteRecurring(
                        occurrence.recurringSessionId!,
                        occurrence.className,
                        occurrence.dayLabel,
                      );
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Xóa ca cố định
                  </Button>
                </>
              )}

            {occurrence.exceptionId && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  onRevertException(occurrence.exceptionId!);
                  onClose();
                }}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Hoàn tác ngoại lệ
              </Button>
            )}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            <Calendar className="size-3.5" aria-hidden="true" />
            Đóng
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
