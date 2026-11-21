"use client";

import * as React from "react";
import {
  AlertTriangle,
  Archive,
  CreditCard,
  Edit3,
  Eye,
  KeyRound,
  RotateCcw,
} from "lucide-react";

import {
  getStudentAcademicAlerts,
  type AcademicAlertSettings,
} from "@/services/academic-alert.service";
import type { AdminStudentRecord, ClassroomGroup } from "@/services/classroom-data";
import {
  formatDisplayDate,
  STUDENT_STATUS_META,
  type StudentPortalAccountItem,
} from "@/services/student-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DetailModalTab = "overview" | "grades" | "timeline" | "tuition" | "crm";

interface StudentTableProps {
  students: AdminStudentRecord[];
  classes: ClassroomGroup[];
  alertSettings: AcademicAlertSettings;
  accountsByStudentId: Record<string, StudentPortalAccountItem>;
  selectedIds: string[];
  page: number;
  totalPages: number;
  onToggleSelectAll: () => void;
  onToggleSelectOne: (id: string) => void;
  onViewStudent: (student: AdminStudentRecord, initialTab?: DetailModalTab) => void;
  onEditStudent: (student: AdminStudentRecord) => void;
  onArchiveStudent: (student: AdminStudentRecord) => void;
  onRestoreStudent: (student: AdminStudentRecord) => void;
}

export function StudentTable({
  students,
  classes,
  alertSettings,
  accountsByStudentId,
  selectedIds,
  page,
  totalPages,
  onToggleSelectAll,
  onToggleSelectOne,
  onViewStudent,
  onEditStudent,
  onArchiveStudent,
  onRestoreStudent,
}: StudentTableProps) {
  const allSelectedOnPage =
    students.length > 0 && students.every((s) => selectedIds.includes(s.id));

  const renderStatusAndPortalBadges = (stu: AdminStudentRecord) => {
    const statusMeta = STUDENT_STATUS_META[stu.status];
    const acc = accountsByStudentId[stu.id];
    const stuAlerts = getStudentAcademicAlerts(stu, alertSettings);
    const isDestructive = stuAlerts.some((a) => a.level === "destructive");

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {stu.status !== "active" && (
          <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${statusMeta.badgeClass}`}>
            {statusMeta.shortLabel}
          </Badge>
        )}
        {acc?.hasAuthAccount ? (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
              acc.isActive
                ? "border-emerald-200 bg-emerald-500/10 text-emerald-700"
                : "border-slate-300 bg-slate-100 text-slate-600"
            }`}
            title={`Tài khoản Portal: ${acc.email || "Đã cấp"} (${acc.isActive ? "Hoạt động" : "Đã khóa"})`}
          >
            <KeyRound className="size-2.5" aria-hidden="true" />
            {acc.isActive ? "Portal" : "Khóa"}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onViewStudent(stu, "crm")}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary"
            title="Chưa cấp tài khoản đăng nhập Cổng học sinh — Bấm để cấp nhanh"
          >
            <KeyRound className="size-2.5" aria-hidden="true" />
            Chưa cấp TK
          </button>
        )}
        {stuAlerts.length > 0 && (
          <span
            className={`inline-flex cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              isDestructive
                ? "border border-destructive/30 bg-destructive/10 text-destructive"
                : "border border-amber-300/80 bg-amber-500/10 text-amber-800"
            }`}
            title={stuAlerts.map((a) => `• ${a.title}: ${a.description}`).join("\n")}
          >
            <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
            <span>{stuAlerts.length} lưu ý</span>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
      {/* Desktop Table View (>= md) */}
      <div className="hidden md:block">
        <Table className="rounded-none border-0">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả học sinh trên trang"
                  checked={allSelectedOnPage}
                  onChange={onToggleSelectAll}
                  className="size-4 rounded border-input accent-primary"
                />
              </TableHead>
              <TableHead>Mã HS &amp; Họ tên</TableHead>
              <TableHead>Lớp theo học</TableHead>
              <TableHead className="text-center">Điểm TB</TableHead>
              <TableHead className="text-center">Chuyên cần</TableHead>
              <TableHead className="w-[188px] whitespace-nowrap">Học phí &amp; Hạn nộp</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((stu) => {
              const targetCls = classes.find((c) => c.id === stu.classId);
              const dueDate = stu.tuitionDueDate || targetCls?.tuitionDueDate || "2026-11-20";
              return (
                <TableRow key={stu.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Chọn học sinh ${stu.fullName}`}
                      checked={selectedIds.includes(stu.id)}
                      onChange={() => onToggleSelectOne(stu.id)}
                      className="size-4 rounded border-input accent-primary"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm font-heading text-xs font-bold text-primary">
                        {stu.fullName
                          .split(" ")
                          .slice(-2)
                          .map((w) => w[0])
                          .join("")}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onViewStudent(stu, "overview")}
                            className="text-left font-heading text-sm font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {stu.fullName}
                          </button>
                          {renderStatusAndPortalBadges(stu)}
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">
                          {stu.code} · <span className="text-foreground/80">Mục tiêu: {stu.targetGoal}</span>
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-medium text-foreground">{stu.className}</p>
                    <p className="text-[11px] text-muted-foreground">Trình độ {stu.level}</p>
                  </TableCell>
                  <TableCell className="text-center">
                    {stu.grades.length > 0 && stu.averageScore > 0 ? (
                      <Badge variant="default" className="font-mono">
                        {stu.averageScore.toFixed(1)}
                      </Badge>
                    ) : (
                      <span
                        className="font-mono text-xs text-muted-foreground"
                        title="Chưa có bài kiểm tra"
                      >
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {stu.attendanceHistory.length > 0 ? (
                      <span className="font-mono text-xs font-semibold text-emerald-700">
                        {stu.attendanceRate}%
                      </span>
                    ) : (
                      <span
                        className="font-mono text-xs text-muted-foreground"
                        title="Chưa có dữ liệu điểm danh"
                      >
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="w-[188px] whitespace-nowrap">
                    <div className="space-y-1">
                      <div className="flex flex-nowrap items-center gap-1.5">
                        <Badge
                          variant={
                            stu.tuitionStatus === "paid"
                              ? "success"
                              : stu.tuitionStatus === "due-soon"
                                ? "warning"
                                : "destructive"
                          }
                          className="h-6 w-[92px] shrink-0 justify-center whitespace-nowrap px-2 text-[11px]"
                        >
                          {stu.tuitionStatus === "paid"
                            ? "Đã đóng"
                            : stu.tuitionStatus === "due-soon"
                              ? "Sắp đến hạn"
                              : "Quá hạn"}
                        </Badge>
                        {stu.status !== "archived" && (
                          <button
                            type="button"
                            onClick={() => onViewStudent(stu, "tuition")}
                            className={`inline-flex h-6 w-[74px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-semibold transition-colors ${
                              stu.tuitionStatus !== "paid"
                                ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15"
                                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"
                            }`}
                            title={
                              stu.tuitionStatus !== "paid"
                                ? "Mở Sổ học phí để thu tiền nhanh"
                                : "Xem Sổ học phí & biên nhận"
                            }
                          >
                            <CreditCard className="size-3 shrink-0" aria-hidden="true" />
                            <span>{stu.tuitionStatus !== "paid" ? "Thu HP" : "Sổ HP"}</span>
                          </button>
                        )}
                      </div>
                      {dueDate && (
                        <p className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                          Hạn: {formatDisplayDate(dueDate)}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onViewStudent(stu, "overview")}
                        aria-label={`Xem chi tiết ${stu.fullName}`}
                        title="Xem hồ sơ 360°"
                      >
                        <Eye className="size-3.5 text-primary" aria-hidden="true" />
                      </Button>
                      {stu.status === "archived" ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onRestoreStudent(stu)}
                          aria-label={`Khôi phục ${stu.fullName}`}
                          title="Khôi phục về danh sách đang học"
                        >
                          <RotateCcw className="size-3.5 text-emerald-600" aria-hidden="true" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onEditStudent(stu)}
                            aria-label={`Chỉnh sửa ${stu.fullName}`}
                            title="Chỉnh sửa hồ sơ"
                          >
                            <Edit3 className="size-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onArchiveStudent(stu)}
                            aria-label={`Lưu trữ ${stu.fullName}`}
                            title="Lưu trữ hồ sơ"
                          >
                            <Archive className="size-3.5 text-amber-600" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View (< md) */}
      <div className="block divide-y divide-border md:hidden">
        <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5 text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <input
              type="checkbox"
              aria-label="Chọn tất cả học sinh trên trang"
              checked={allSelectedOnPage}
              onChange={onToggleSelectAll}
              className="size-4 rounded border-input accent-primary"
            />
            <span>Chọn tất cả trang ({students.length})</span>
          </label>
          <span className="font-mono text-[11px] text-muted-foreground">
            Trang {page}/{totalPages}
          </span>
        </div>

        {students.map((stu) => {
          const targetCls = classes.find((c) => c.id === stu.classId);
          const dueDate = stu.tuitionDueDate || targetCls?.tuitionDueDate || "2026-11-20";
          return (
            <div
              key={stu.id}
              className={`p-4 transition-colors ${
                selectedIds.includes(stu.id) ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex min-w-0 items-start gap-2.5">
                  <input
                    type="checkbox"
                    aria-label={`Chọn học sinh ${stu.fullName}`}
                    checked={selectedIds.includes(stu.id)}
                    onChange={() => onToggleSelectOne(stu.id)}
                    className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
                  />
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm font-heading text-xs font-bold text-primary">
                    {stu.fullName
                      .split(" ")
                      .slice(-2)
                      .map((w) => w[0])
                      .join("")}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <span className="block truncate font-heading text-sm font-semibold text-foreground">
                      {stu.fullName}
                    </span>
                    <p className="font-mono text-xs text-muted-foreground">{stu.code}</p>
                    {renderStatusAndPortalBadges(stu)}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <Badge
                    variant={
                      stu.tuitionStatus === "paid"
                        ? "success"
                        : stu.tuitionStatus === "due-soon"
                          ? "warning"
                          : "destructive"
                    }
                    className="text-[11px]"
                  >
                    {stu.tuitionStatus === "paid"
                      ? "Đã đóng"
                      : stu.tuitionStatus === "due-soon"
                        ? "Sắp đến hạn"
                        : "Quá hạn"}
                  </Badge>
                  {dueDate && (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      Hạn: {formatDisplayDate(dueDate)}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-2.5 space-y-1.5 rounded-xl bg-muted/30 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">Lớp học:</span>
                  <span className="truncate text-right font-medium text-foreground">
                    {stu.className} ({stu.level})
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border/50 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Điểm TB:</span>
                    {stu.grades.length > 0 && stu.averageScore > 0 ? (
                      <Badge variant="default" className="px-1.5 py-0 font-mono text-[11px]">
                        {stu.averageScore.toFixed(1)}
                      </Badge>
                    ) : (
                      <span className="font-mono text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Chuyên cần:</span>
                    {stu.attendanceHistory.length > 0 ? (
                      <span className="font-mono font-semibold text-emerald-700">
                        {stu.attendanceRate}%
                      </span>
                    ) : (
                      <span className="font-mono text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {stu.status !== "archived" && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onViewStudent(stu, "tuition")}
                    className={`gap-1 whitespace-nowrap text-xs ${
                      stu.tuitionStatus !== "paid"
                        ? "border-primary/30 text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    <CreditCard className="size-3.5 shrink-0" aria-hidden="true" />
                    {stu.tuitionStatus !== "paid" ? "Thu HP" : "Sổ HP"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onViewStudent(stu, "overview")}
                  className="gap-1 text-xs"
                >
                  <Eye className="size-3.5 text-primary" aria-hidden="true" />
                  Hồ sơ 360°
                </Button>
                {stu.status === "archived" ? (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onRestoreStudent(stu)}
                    className="gap-1 border-emerald-300 text-xs text-emerald-700 hover:bg-emerald-50"
                  >
                    <RotateCcw className="size-3.5 text-emerald-600" aria-hidden="true" />
                    Khôi phục
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onEditStudent(stu)}
                      className="gap-1 text-xs"
                    >
                      <Edit3 className="size-3.5" aria-hidden="true" />
                      Sửa
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onArchiveStudent(stu)}
                      className="gap-1 border-amber-300 text-xs text-amber-700 hover:bg-amber-50"
                    >
                      <Archive className="size-3.5 text-amber-600" aria-hidden="true" />
                      Lưu trữ
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
