"use client";

import * as React from "react";
import { Download, RefreshCw } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { useTodayIso } from "@/lib/use-today-iso";
import {
  buildAttendanceMatrixCsv,
  type AttendanceStatusValue,
  type ClassAttendanceMatrixReport,
} from "@/services/attendance-helpers";
import type { ClassroomGroup } from "@/services/classroom-data";
import { addDaysIso } from "@/services/schedule-calendar-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface AttendanceMatrixTabProps {
  classrooms: ClassroomGroup[];
  selectedClassId: string;
  onChangeClassId: (classId: string) => void;
}

const CELL_BADGE: Record<
  AttendanceStatusValue,
  { code: string; className: string; title: string }
> = {
  present: {
    code: "CM",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    title: "Có mặt",
  },
  late: {
    code: "M",
    className: "bg-amber-50 text-amber-800 border-amber-200",
    title: "Đi muộn",
  },
  absent: {
    code: "V",
    className: "bg-red-50 text-red-700 border-red-200",
    title: "Vắng không phép",
  },
  excused: {
    code: "P",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    title: "Nghỉ có phép",
  },
};

export function AttendanceMatrixTab({
  classrooms,
  selectedClassId,
  onChangeClassId,
}: AttendanceMatrixTabProps) {
  const { toast } = useToast();
  const todayIso = useTodayIso();
  const [toDateOverride, setToDate] = React.useState<string | null>(null);
  const [fromDateOverride, setFromDate] = React.useState<string | null>(null);
  const toDate = toDateOverride ?? todayIso;
  const fromDate = fromDateOverride ?? addDaysIso(todayIso, -29);
  const [onlyAtRisk, setOnlyAtRisk] = React.useState(false);
  const [reloadNonce, setReloadNonce] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState<ClassAttendanceMatrixReport | null>(
    null,
  );

  React.useEffect(() => {
    if (!selectedClassId) return;
    let active = true;
    const params = new URLSearchParams({
      classId: selectedClassId,
      fromDate,
      toDate,
    });

    apiRequest<ClassAttendanceMatrixReport>(
      `/api/admin/attendance/matrix?${params.toString()}`,
    )
      .then((data) => {
        if (!active) return;
        setReport(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        toast({
          variant: "error",
          title: "Không thể tải ma trận điểm danh",
          description: err instanceof Error ? err.message : undefined,
        });
      });

    return () => {
      active = false;
    };
  }, [selectedClassId, fromDate, toDate, reloadNonce, toast]);

  const displayedRows = React.useMemo(() => {
    if (!report) return [];
    if (!onlyAtRisk) return report.rows;
    return report.rows.filter(
      (r) => r.attendanceRate < 80 || r.consecutiveAbsences >= 2,
    );
  }, [report, onlyAtRisk]);

  const handleExportCsv = () => {
    if (!report) return;
    const csv = buildAttendanceMatrixCsv(report);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `so-diem-danh-${report.classCode}-${report.fromDate}-${report.toDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({
      variant: "success",
      title: `Đã xuất sổ điểm danh lớp ${report.classCode}`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Chọn lớp xem ma trận điểm danh"
            value={selectedClassId}
            onChange={(e) => {
              setLoading(true);
              onChangeClassId(e.target.value);
            }}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium xl:w-[220px]"
          >
            {classrooms.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.code} — {cls.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Từ</span>
            <Input
              type="date"
              aria-label="Ma trận từ ngày"
              value={fromDate}
              onChange={(e) => {
                setLoading(true);
                setFromDate(e.target.value);
              }}
              className="h-9 w-[136px] text-xs"
            />
            <span>đến</span>
            <Input
              type="date"
              aria-label="Ma trận đến ngày"
              value={toDate}
              onChange={(e) => {
                setLoading(true);
                setToDate(e.target.value);
              }}
              className="h-9 w-[136px] text-xs"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={onlyAtRisk}
              onChange={(e) => setOnlyAtRisk(e.target.checked)}
              className="size-3.5 rounded border-input accent-primary"
            />
            Chỉ hiện HS cần chú ý (&lt; 80% / vắng ≥ 2 buổi)
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoading(true);
              setReloadNonce((n) => n + 1);
            }}
            className="h-9 px-3 whitespace-nowrap"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Làm mới
          </Button>
          <Button
            type="button"
            disabled={!report || report.columns.length === 0}
            onClick={handleExportCsv}
            className="h-9 px-3.5 whitespace-nowrap"
          >
            <Download className="size-4" aria-hidden="true" />
            Xuất CSV Sổ điểm danh
          </Button>
        </div>
      </div>

      {/* Summary & Legend */}
      {report && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/25 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3 tabular-nums">
            <span>
              Tổng số buổi ghi nhận: <strong>{report.columns.length} buổi</strong>
            </span>
            <span>·</span>
            <span>
              Chuyên cần TB lớp:{" "}
              <strong className="text-primary">{report.averageAttendanceRate}%</strong>
            </span>
            <span>·</span>
            <span>
              HS cần chú ý:{" "}
              <strong
                className={
                  report.highRiskStudentsCount > 0
                    ? "text-destructive"
                    : "text-emerald-700"
                }
              >
                {report.highRiskStudentsCount}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium">Ký hiệu:</span>
            <span>
              <strong className="text-emerald-700">CM</strong> Có mặt
            </span>
            <span>
              <strong className="text-amber-700">M</strong> Đi muộn
            </span>
            <span>
              <strong className="text-red-700">V</strong> Vắng
            </span>
            <span>
              <strong className="text-blue-700">P</strong> Có phép
            </span>
          </div>
        </div>
      )}

      {/* Matrix Table */}
      {loading && !report ? (
        <Skeleton className="h-56 w-full rounded-2xl" />
      ) : !report || report.columns.length === 0 ? (
        <EmptyState
          title="Chưa có dữ liệu điểm danh trong khoảng thời gian này"
          description="Hãy mở rộng khoảng ngày hoặc thực hiện điểm danh ca học để dữ liệu ma trận xuất hiện tại đây."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <th className="sticky left-0 z-10 min-w-[200px] bg-muted/95 px-4 py-3 backdrop-blur-xs">
                    Học viên
                  </th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">
                    Chuyên cần
                  </th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">
                    Vắng liên tiếp
                  </th>
                  {report.columns.map((col) => (
                    <th
                      key={col.columnId}
                      title={`${col.displayDate} · ${col.topic}`}
                      className="min-w-[68px] px-2 py-2.5 text-center whitespace-nowrap"
                    >
                      <div className="font-semibold text-foreground tabular-nums">
                        {col.displayDate.slice(0, 5)}
                      </div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {col.attendanceRate}%
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {displayedRows.map((row) => (
                  <tr key={row.studentId} className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">
                          {row.studentName}
                        </span>
                        {row.studentStatus === "trial" && (
                          <Badge variant="info" className="text-[10px]">
                            Học thử
                          </Badge>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {row.studentCode} · CM {row.presentCount} · M {row.lateCount} · V{" "}
                        {row.absentCount}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-mono font-bold tabular-nums">
                      <span
                        className={
                          row.attendanceRate < 80
                            ? "text-destructive"
                            : "text-emerald-700"
                        }
                      >
                        {row.attendanceRate}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums">
                      {row.consecutiveAbsences >= 2 ? (
                        <Badge variant="destructive" className="text-[10px]">
                          {row.consecutiveAbsences} buổi
                        </Badge>
                      ) : row.consecutiveAbsences === 1 ? (
                        <span className="text-amber-700 font-medium">1 buổi</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    {report.columns.map((col) => {
                      const cell = row.cells[col.columnId];
                      if (!cell || !cell.status) {
                        return (
                          <td
                            key={col.columnId}
                            className="px-2 py-3 text-center text-muted-foreground/50"
                          >
                            -
                          </td>
                        );
                      }
                      const meta = CELL_BADGE[cell.status];
                      return (
                        <td
                          key={col.columnId}
                          title={`${col.displayDate}: ${meta.title}${cell.note ? ` — ${cell.note}` : ""}`}
                          className="px-2 py-3 text-center"
                        >
                          <span
                            className={`inline-flex h-6 min-w-7 items-center justify-center rounded-md border px-1.5 text-[11px] font-semibold ${meta.className}`}
                          >
                            {meta.code}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
