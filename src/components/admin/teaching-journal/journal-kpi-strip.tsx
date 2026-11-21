"use client";

import * as React from "react";
import { BookCheck, BookOpenCheck, CheckCircle2, HelpCircle, Users } from "lucide-react";

import type { ClassSessionRecord } from "@/services/classroom-data";
import { computeSessionMetrics } from "@/services/teaching-journal-helpers";

interface JournalKpiStripProps {
  sessions: ClassSessionRecord[];
  pendingCount: number;
}

export function JournalKpiStrip({ sessions, pendingCount }: JournalKpiStripProps) {
  const stats = React.useMemo(() => {
    const total = sessions.length;
    let completedCount = 0;
    let draftCount = 0;
    let notStartedCount = 0;
    let sumAttendanceRate = 0;
    let sumHomeworkRate = 0;
    let countWithRoster = 0;
    let needsSupportTotal = 0;

    for (const ses of sessions) {
      if (ses.journalStatus === "completed") completedCount += 1;
      else if (ses.journalStatus === "draft") draftCount += 1;
      else notStartedCount += 1;

      const m = computeSessionMetrics(ses);
      needsSupportTotal += m.needsSupportCount;
      if (m.total > 0) {
        sumAttendanceRate += m.attendanceRate;
        sumHomeworkRate += m.homeworkRate;
        countWithRoster += 1;
      }
    }

    const completedRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    const avgAttendance =
      countWithRoster > 0 ? Math.round(sumAttendanceRate / countWithRoster) : 0;
    const avgHomework =
      countWithRoster > 0 ? Math.round(sumHomeworkRate / countWithRoster) : 0;

    return {
      total,
      completedCount,
      draftCount,
      notStartedCount,
      completedRate,
      avgAttendance,
      avgHomework,
      needsSupportTotal,
    };
  }, [sessions]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Tổng buổi đã lập nhật ký
          </span>
          <BookOpenCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="font-heading text-2xl font-bold tabular-nums text-foreground">
            {stats.total} buổi
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.draftCount} bản nháp · {stats.notStartedCount} chưa ghi
            {pendingCount > 0 ? ` · ${pendingCount} chờ tạo từ TKB` : ""}
          </p>
        </div>
      </div>

      <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Đã hoàn tất & hiển thị Portal
          </span>
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
        </div>
        <div>
          <p className="font-heading text-2xl font-bold tabular-nums text-emerald-700">
            {stats.completedCount}/{stats.total}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Phủ {stats.completedRate}% tổng nhật ký lên Cổng Học sinh
          </p>
        </div>
      </div>

      <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Chuyên cần trung bình
          </span>
          <Users className="size-4 shrink-0 text-[#2E5D9F]" aria-hidden="true" />
        </div>
        <div>
          <p className="font-heading text-2xl font-bold tabular-nums text-foreground">
            {stats.avgAttendance}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Đồng bộ tự động về hồ sơ từng học viên
          </p>
        </div>
      </div>

      <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Nộp BTVN & Cần kèm thêm
          </span>
          {stats.needsSupportTotal > 0 ? (
            <HelpCircle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
          ) : (
            <BookCheck className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          )}
        </div>
        <div>
          <p className="font-heading text-2xl font-bold tabular-nums text-foreground">
            {stats.avgHomework}% BTVN
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.needsSupportTotal > 0 ? (
              <span className="font-medium text-amber-700">
                {stats.needsSupportTotal} lượt học viên cần hỗ trợ thêm
              </span>
            ) : (
              "Các lớp nắm vững kiến thức trọng tâm"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
