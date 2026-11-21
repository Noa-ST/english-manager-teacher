"use client";

import {
  FileSpreadsheet,
  Lock,
  MessageSquareShare,
  Paperclip,
  PencilLine,
  Trash2,
} from "lucide-react";

import type { ClassSessionRecord } from "@/services/classroom-data";
import { formatDisplayDateVi } from "@/services/schedule-calendar-helpers";
import { computeSessionMetrics } from "@/services/teaching-journal-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

interface JournalSessionTableProps {
  sessions: ClassSessionRecord[];
  onEdit: (session: ClassSessionRecord) => void;
  onOpenDigest: (session: ClassSessionRecord) => void;
  onDelete: (session: ClassSessionRecord) => void;
  onCreateNew: () => void;
}

const JOURNAL_STATUS_BADGE: Record<
  ClassSessionRecord["journalStatus"],
  { label: string; className: string; hint: string }
> = {
  completed: {
    label: "Đã hoàn tất",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    hint: "Hiển thị Cổng HS",
  },
  draft: {
    label: "Bản nháp",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    hint: "Ẩn với học sinh",
  },
  "not-started": {
    label: "Chưa ghi",
    className: "border-slate-200 bg-slate-100 text-slate-700",
    hint: "Ẩn với học sinh",
  },
};

const COMPLETION_BADGE: Record<
  ClassSessionRecord["completionResult"],
  { label: string; className: string }
> = {
  completed: {
    label: "Đạt mục tiêu",
    className: "bg-emerald-100/80 text-emerald-800",
  },
  partial: {
    label: "Hoàn thành 1 phần",
    className: "bg-amber-100/80 text-amber-800",
  },
  "not-completed": {
    label: "Chưa xong / Cần bù",
    className: "bg-slate-100 text-slate-700",
  },
};

export function JournalSessionTable({
  sessions,
  onEdit,
  onOpenDigest,
  onDelete,
  onCreateNew,
}: JournalSessionTableProps) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="size-5" aria-hidden="true" />}
        title="Chưa có nhật ký buổi học phù hợp"
        description="Hãy thay đổi bộ lọc tìm kiếm hoặc khởi tạo một nhật ký buổi học mới từ lớp và khung chương trình."
        action={
          <Button type="button" onClick={onCreateNew}>
            Ghi nhật ký buổi mới
          </Button>
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-muted-foreground">
              <th className="px-3.5 py-3">Buổi học</th>
              <th className="px-3.5 py-3">Lớp & Tuần</th>
              <th className="px-3.5 py-3">Chuyên đề & Kết quả</th>
              <th className="px-3.5 py-3">Chuyên cần & BTVN</th>
              <th className="px-3.5 py-3">Trạng thái</th>
              <th className="px-3.5 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {sessions.map((ses) => {
              const metrics = computeSessionMetrics(ses);
              const journalBadge = JOURNAL_STATUS_BADGE[ses.journalStatus];
              const completionBadge = COMPLETION_BADGE[ses.completionResult];
              const hasPrivateNotes = Boolean(ses.privateNotes?.trim());

              return (
                <tr
                  key={ses.id}
                  className="transition-colors hover:bg-muted/25"
                >
                  <td className="px-3.5 py-3.5 align-top">
                    <div className="font-medium tabular-nums text-foreground">
                      {formatDisplayDateVi(ses.date)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {ses.dayLabel} · {ses.startTime}–{ses.endTime}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {ses.room}
                    </div>
                  </td>

                  <td className="px-3.5 py-3.5 align-top">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="font-semibold">
                        {ses.classCode}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px] tabular-nums">
                        Tuần {ses.weekNumber}
                      </Badge>
                    </div>
                    <p className="mt-1 max-w-[190px] text-xs font-medium text-foreground">
                      {ses.className}
                    </p>
                  </td>

                  <td className="max-w-[260px] px-3.5 py-3.5 align-top">
                    <p className="line-clamp-2 font-medium text-foreground">
                      {ses.topic || "Chưa đặt tên chuyên đề"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${completionBadge.className}`}
                      >
                        {completionBadge.label}
                      </span>
                      {ses.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                          <Paperclip className="size-3" aria-hidden="true" />
                          {ses.attachments.length} tài liệu
                        </span>
                      )}
                      {hasPrivateNotes && (
                        <span
                          title="Có ghi chú nội bộ giáo viên"
                          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800"
                        >
                          <Lock className="size-3" aria-hidden="true" />
                          Nội bộ
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3.5 py-3.5 align-top">
                    <div className="flex flex-col gap-1 text-xs tabular-nums">
                      <span className="font-medium text-foreground">
                        Chuyên cần: {metrics.presentAndLateCount}/{metrics.total} (
                        {metrics.attendanceRate}%)
                      </span>
                      <span className="text-muted-foreground">
                        BTVN: {metrics.homeworkRate}%
                        {metrics.avgScore !== null
                          ? ` · Điểm TB: ${metrics.avgScore}/10`
                          : ""}
                      </span>
                      {metrics.needsSupportCount > 0 && (
                        <span className="inline-flex w-fit items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
                          {metrics.needsSupportCount} HS cần hỗ trợ
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3.5 py-3.5 align-top">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${journalBadge.className}`}
                    >
                      {journalBadge.label}
                    </span>
                    <div className="mt-1 text-[11px] text-muted-foreground whitespace-nowrap">
                      {journalBadge.hint}
                    </div>
                  </td>

                  <td className="px-3.5 py-3.5 align-middle text-right whitespace-nowrap">
                    <div className="flex flex-nowrap items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={() => onEdit(ses)}
                        className="h-8 px-2.5 text-xs whitespace-nowrap"
                      >
                        <PencilLine className="size-3.5" aria-hidden="true" />
                        Mở nhật ký
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenDigest(ses)}
                        title="Tạo bản tin tổng kết gửi Phụ huynh"
                        className="h-8 px-2.5 text-xs whitespace-nowrap"
                      >
                        <MessageSquareShare className="size-3.5" aria-hidden="true" />
                        Bản tin PH
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => onDelete(ses)}
                        aria-label={`Xóa nhật ký buổi ${ses.classCode} ngày ${ses.date}`}
                        title="Xóa nhật ký buổi học"
                        className="size-8 shrink-0 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
