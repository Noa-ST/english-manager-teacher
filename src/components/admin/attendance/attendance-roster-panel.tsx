"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  MessageSquareShare,
  NotebookPen,
  Search,
  Sparkles,
} from "lucide-react";

import { cn, removeVietnameseTones } from "@/lib/utils";
import {
  ATTENDANCE_QUICK_NOTE_CHIPS,
  formatAttendanceDateVi,
  type AttendanceStatusValue,
} from "@/services/attendance-helpers";
import type { AdminStudentRecord, ClassroomGroup } from "@/services/classroom-data";
import { computeClassroomProgress } from "@/services/classroom-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";

export interface StudentAttendanceRowItem {
  studentId: string;
  code: string;
  fullName: string;
  status: AttendanceStatusValue;
  note: string;
}

const STATUS_OPTIONS: {
  value: AttendanceStatusValue;
  label: string;
  activeClass: string;
}[] = [
  {
    value: "present",
    label: "Có mặt",
    activeClass: "bg-emerald-600 text-white border-emerald-600",
  },
  {
    value: "late",
    label: "Đi muộn",
    activeClass: "bg-amber-500 text-white border-amber-500",
  },
  {
    value: "absent",
    label: "Vắng mặt",
    activeClass: "bg-destructive text-white border-destructive",
  },
  {
    value: "excused",
    label: "Có phép",
    activeClass: "bg-primary text-primary-foreground border-primary",
  },
];

interface AttendanceRosterPanelProps {
  classroom: ClassroomGroup | null;
  sessionDate: string;
  roster: StudentAttendanceRowItem[];
  onLeaveStudents: Array<{
    id: string;
    code: string;
    fullName: string;
    leaveReason?: string;
  }>;
  consecutiveAbsencesByStudentId: Record<string, number>;
  studentStatusMap: Map<string, AdminStudentRecord["status"]>;
  isCanceledDate: boolean;
  canceledReason?: string;
  alreadyRecorded: boolean;
  isDirty: boolean;
  saving: boolean;
  classSessionId?: string;
  onSetStatus: (studentId: string, status: AttendanceStatusValue) => void;
  onSetNote: (studentId: string, note: string) => void;
  onMarkAllPresent: () => void;
  onOpenParentNotice: () => void;
  onSave: () => void;
}

export function AttendanceRosterPanel({
  classroom,
  sessionDate,
  roster,
  onLeaveStudents,
  consecutiveAbsencesByStudentId,
  studentStatusMap,
  isCanceledDate,
  canceledReason,
  alreadyRecorded,
  isDirty,
  saving,
  classSessionId,
  onSetStatus,
  onSetNote,
  onMarkAllPresent,
  onOpenParentNotice,
  onSave,
}: AttendanceRosterPanelProps) {
  const [searchText, setSearchText] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    AttendanceStatusValue | "all"
  >("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const filteredRoster = React.useMemo(() => {
    const q = removeVietnameseTones(searchText.trim().toLowerCase());
    return roster.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) {
        return false;
      }
      if (q) {
        const hay = removeVietnameseTones(
          `${entry.fullName} ${entry.code} ${entry.note}`.toLowerCase(),
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [roster, searchText, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRoster.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRoster = filteredRoster.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const appendChipNote = (entry: StudentAttendanceRowItem, chipText: string) => {
    const existing = entry.note.trim();
    if (existing.includes(chipText)) return;
    onSetNote(entry.studentId, existing ? `${existing} ${chipText}` : chipText);
  };

  return (
    <div className="space-y-4">
      {/* Context Alerts */}
      {(classroom || onLeaveStudents.length > 0 || isCanceledDate) && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {classroom && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs text-foreground">
                <BookOpen className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Lớp <strong>{classroom.code}</strong> · Tuần{" "}
                  <strong className="font-semibold text-primary">
                    {computeClassroomProgress(classroom).currentWeek}/
                    {computeClassroomProgress(classroom).totalWeeks}
                  </strong>{" "}
                  — {classroom.currentModule}
                </span>
              </div>
            )}

            {onLeaveStudents.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-900">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <span>
                  <strong>{onLeaveStudents.length} HV đang bảo lưu</strong> (miễn điểm danh):{" "}
                  {onLeaveStudents.map((s) => s.fullName).join(", ")}
                </span>
              </div>
            )}
          </div>

          {isCanceledDate && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive"
            >
              <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  Ngày {formatAttendanceDateVi(sessionDate)} đã đánh dấu Tạm nghỉ trên Thời khóa biểu
                </p>
                <p className="mt-0.5 text-destructive/90">
                  {canceledReason ? `Lý do: ${canceledReason}. ` : ""}
                  Hệ thống chặn lưu điểm danh vào ngày nghỉ. Nếu lớp học vẫn diễn ra hoặc học bù, hãy chọn ca học khác hoặc gỡ trạng thái Tạm nghỉ bên trang Lịch dạy.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Roster Container */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-sm font-bold text-foreground">
                Danh sách điểm danh ({roster.length} học viên)
              </h2>
              {alreadyRecorded && !isDirty && (
                <Badge variant="success" className="text-[11px]">
                  Đã đồng bộ hồ sơ & Nhật ký
                </Badge>
              )}
              {isDirty && (
                <Badge variant="warning" className="text-[11px]">
                  Có thay đổi chưa lưu
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onMarkAllPresent}
                disabled={roster.length === 0 || isCanceledDate}
                className="h-8 whitespace-nowrap text-xs"
              >
                <CheckCheck className="size-3.5 text-primary" aria-hidden="true" />
                Có mặt tất cả
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onOpenParentNotice}
                disabled={roster.length === 0}
                className="h-8 whitespace-nowrap text-xs"
              >
                <MessageSquareShare className="size-3.5 text-primary" aria-hidden="true" />
                Báo PH vắng / muộn
              </Button>
              {classSessionId && (
                <Link
                  href={{
                    pathname: "/teaching-journal",
                    query: { sessionId: classSessionId },
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted"
                >
                  <NotebookPen className="size-3.5 text-primary" aria-hidden="true" />
                  Mở Nhật ký buổi này
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["all", "Tất cả"],
                  ["present", "Có mặt"],
                  ["late", "Đi muộn"],
                  ["absent", "Vắng mặt"],
                  ["excused", "Có phép"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(key);
                    setPage(1);
                  }}
                  className={cn(
                    "h-7 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                    statusFilter === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm tên, mã HS, ghi chú..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Rows */}
        {roster.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Lớp học chưa có học viên cần điểm danh"
              description="Các học viên đang bảo lưu hoặc lưu trữ đã được tự động ẩn khỏi danh sách."
            />
          </div>
        ) : filteredRoster.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Không có học viên nào khớp bộ lọc hiện tại.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {paginatedRoster.map((entry, idx) => {
              const actualIndex = (currentPage - 1) * pageSize + idx + 1;
              const absenceStreak =
                consecutiveAbsencesByStudentId[entry.studentId] ?? 0;
              const matchingChips = ATTENDANCE_QUICK_NOTE_CHIPS.filter((c) =>
                c.targetStatuses.includes(entry.status),
              );

              return (
                <div
                  key={entry.studentId}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/20"
                >
                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    {/* Student Identity */}
                    <div className="flex min-w-60 items-center gap-3">
                      <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">
                        {String(actualIndex).padStart(2, "0")}
                      </span>
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm font-heading text-xs font-bold text-primary">
                        {entry.fullName
                          .split(" ")
                          .slice(-2)
                          .map((w) => w[0])
                          .join("")}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-heading text-sm font-bold text-foreground">
                            {entry.fullName}
                          </p>
                          {studentStatusMap.get(entry.studentId) === "trial" && (
                            <Badge variant="info" className="text-[10px]">
                              Học thử
                            </Badge>
                          )}
                          {absenceStreak >= 2 && (
                            <Badge variant="destructive" className="text-[10px]">
                              Vắng {absenceStreak} buổi liên tiếp
                            </Badge>
                          )}
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">
                          {entry.code}
                        </p>
                      </div>
                    </div>

                    {/* 1-Click Segmented Status Buttons */}
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      role="radiogroup"
                      aria-label={`Trạng thái điểm danh của ${entry.fullName}`}
                    >
                      {STATUS_OPTIONS.map((opt) => {
                        const active = entry.status === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={isCanceledDate}
                            onClick={() => onSetStatus(entry.studentId, opt.value)}
                            className={cn(
                              "h-8 rounded-xl border px-3 text-xs font-semibold whitespace-nowrap transition-all disabled:cursor-not-allowed disabled:opacity-50",
                              active
                                ? opt.activeClass
                                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Inline Note */}
                    <div className="w-full lg:w-72">
                      <Input
                        type="text"
                        disabled={isCanceledDate}
                        value={entry.note}
                        onChange={(e) =>
                          onSetNote(entry.studentId, e.target.value)
                        }
                        placeholder="Ghi chú lý do vắng / muộn / bài bù..."
                        aria-label={`Ghi chú điểm danh cho ${entry.fullName}`}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* Quick Note Chips for Late/Absent/Excused */}
                  {matchingChips.length > 0 && !isCanceledDate && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-0 lg:pl-9">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Sparkles className="size-3 text-primary" aria-hidden="true" />
                        Lý do nhanh:
                      </span>
                      {matchingChips.map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => appendChipNote(entry, chip.text)}
                          className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          + {chip.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filteredRoster.length > 0 && (
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            totalItems={filteredRoster.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-5 py-3.5">
          <span className="text-xs text-muted-foreground">
            Tổng sĩ số điểm danh: <strong>{roster.length}</strong> học viên
            {alreadyRecorded ? " · Sổ buổi học đã có dữ liệu trên hệ thống" : ""}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={saving || isCanceledDate || roster.length === 0}
            onClick={onSave}
            className="h-8 px-3.5 whitespace-nowrap"
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {saving ? "Đang lưu sổ..." : "Hoàn tất & Lưu điểm danh"}
          </Button>
        </div>
      </div>
    </div>
  );
}
