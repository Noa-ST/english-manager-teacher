"use client";

import * as React from "react";
import {
  Calendar,
  Check,
  Copy,
  CreditCard,
  FileText,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { AdminStudentRecord } from "@/services/classroom-data";
import {
  buildStudentProgressReportText,
  computeStudentSkillProfile,
  computeTuitionLedgerSummary,
  formatDisplayDate,
  formatVnd,
  STUDENT_STATUS_META,
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
import { useToast } from "@/components/ui/toast";

interface StudentProfileTabProps {
  student: AdminStudentRecord;
}

const PAYMENT_METHOD_LABELS: Record<"transfer" | "cash" | "other", string> = {
  transfer: "Chuyển khoản",
  cash: "Tiền mặt",
  other: "Trực tiếp",
};

export function StudentProfileTab({ student }: StudentProfileTabProps) {
  const { toast } = useToast();
  const [copiedReport, setCopiedReport] = React.useState(false);

  const statusMeta = STUDENT_STATUS_META[student.status];
  const skillProfile = React.useMemo(
    () => computeStudentSkillProfile(student),
    [student],
  );
  const ledgerSummary = React.useMemo(
    () => computeTuitionLedgerSummary(student),
    [student],
  );
  const reportText = React.useMemo(
    () => buildStudentProgressReportText(student, skillProfile),
    [student, skillProfile],
  );

  const handleCopyReport = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(reportText);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
      toast({
        title: "Đã sao chép phiếu báo cáo tiến độ",
        description: "Bạn có thể dán để lưu trữ hoặc chia sẻ cùng phụ huynh.",
        variant: "success",
      });
    }
  };

  const initials = student.fullName
    .split(" ")
    .slice(-2)
    .map((w) => w[0])
    .join("");

  return (
    <div className="space-y-6">
      {/* 1. Identity & Academic Enrollment Details */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Student Identity Card (7 cols) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="size-5 text-primary" aria-hidden="true" />
              <h2 className="font-heading text-lg font-bold text-foreground">
                Hồ sơ Học viên & Định danh Học vụ
              </h2>
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusMeta.badgeClass}`}
            >
              {statusMeta.label}
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary font-heading text-2xl font-bold text-primary-foreground shadow-xs">
              {initials}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-xl font-bold text-foreground">
                  {student.fullName}
                </h3>
                <Badge variant="default" className="font-mono">
                  {student.code}
                </Badge>
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                Lớp theo học: <strong className="text-foreground">{student.className}</strong>
              </p>
              <p className="text-xs text-primary">
                Mục tiêu đăng ký:{" "}
                <strong className="font-semibold">{student.targetGoal}</strong>
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 border-t border-border pt-5 text-xs sm:grid-cols-3">
            <div className="rounded-xl bg-muted/30 p-3.5">
              <span className="text-muted-foreground">Khung năng lực hiện tại</span>
              <p className="mt-1 font-heading text-sm font-bold text-foreground">
                CEFR {student.level}
              </p>
            </div>
            <div className="rounded-xl bg-muted/30 p-3.5">
              <span className="text-muted-foreground">Ngày nhập học chính thức</span>
              <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm font-bold text-foreground">
                <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                {formatDisplayDate(student.joinedAt)}
              </p>
            </div>
            <div className="rounded-xl bg-muted/30 p-3.5">
              <span className="text-muted-foreground">Điểm đánh giá đầu vào</span>
              <p className="mt-1 font-mono text-sm font-bold text-primary">
                {skillProfile.entryBand !== null
                  ? `Band ${skillProfile.entryBand.toFixed(1)}`
                  : "Đang cập nhật"}
              </p>
            </div>
          </div>

          {/* Target Goal & Skill Positioning */}
          <div className="mt-4 grid gap-4 text-xs sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-background p-3.5">
              <span className="text-muted-foreground">Điểm trung bình hiện tại</span>
              <p className="mt-1 font-mono text-base font-bold text-primary">
                Band {student.averageScore.toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3.5">
              <span className="text-muted-foreground">Đích Band mục tiêu</span>
              <p className="mt-1 font-mono text-base font-bold text-foreground">
                {skillProfile.targetBand !== null
                  ? `Band ${skillProfile.targetBand.toFixed(1)}`
                  : student.targetGoal}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3.5">
              <span className="text-muted-foreground">Tiến triển tích lũy</span>
              <p className="mt-1 font-mono text-base font-bold text-emerald-700">
                {skillProfile.bandDelta !== null
                  ? `${skillProfile.bandDelta >= 0 ? "+" : ""}${skillProfile.bandDelta.toFixed(1)} Band`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Family Contact & Privacy Protection Card (5 cols) */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Users className="size-5 text-primary" aria-hidden="true" />
                <h2 className="font-heading text-lg font-bold text-foreground">
                  Thông tin Liên hệ Gia đình
                </h2>
              </div>
              <Badge variant="outline" className="text-[10px]">
                Privacy Protected
              </Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-border bg-muted/20 p-3.5">
                <span className="text-muted-foreground">Phụ huynh / Người giám hộ</span>
                <p className="mt-1 font-heading text-sm font-bold text-foreground">
                  {student.parentName || student.parentRelation || "Phụ huynh học viên"}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-3.5">
                <span className="text-muted-foreground">Mối quan hệ & Liên hệ đã mã hóa</span>
                <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                  {student.parentRelation || "Gia đình"}
                  {student.parentContactMasked
                    ? ` · ${student.parentContactMasked}`
                    : ""}
                </p>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs leading-relaxed text-foreground">
                <div className="flex items-center gap-1.5 font-semibold text-primary">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  <span>Bảo mật dữ liệu học viên</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Số điện thoại phụ huynh và ghi chú sư phạm nội bộ được ẩn tự động trên cổng tra cứu để bảo vệ quyền riêng tư.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Nếu cần thay đổi số điện thoại hoặc email liên lạc, vui lòng báo trực tiếp cho giáo viên phụ trách lớp.
          </div>
        </div>
      </div>

      {/* 2. Tuition Ledger & Payment Receipts */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <CreditCard className="size-5 text-primary" aria-hidden="true" />
              Sổ theo dõi Học phí & Lịch sử Biên nhận
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Kỳ học hiện tại: <strong className="text-foreground">{student.tuitionPeriod}</strong>
              {student.tuitionDueDate
                ? ` · Hạn thanh toán: ${formatDisplayDate(student.tuitionDueDate)}`
                : ""}
            </p>
          </div>
          <Badge
            variant={
              student.tuitionStatus === "paid"
                ? "success"
                : student.tuitionStatus === "due-soon"
                  ? "warning"
                  : "destructive"
            }
          >
            {student.tuitionStatus === "paid"
              ? "Đã hoàn thành"
              : student.tuitionStatus === "due-soon"
                ? "Sắp đến hạn"
                : "Quá hạn thanh toán"}
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <span className="text-xs text-muted-foreground">
              Tổng học phí sau ưu đãi
            </span>
            <p className="mt-1 font-mono text-xl font-bold text-foreground">
              {formatVnd(ledgerSummary.totalPayable)}
            </p>
            {ledgerSummary.totalDiscount > 0 && (
              <p className="mt-0.5 text-[11px] text-emerald-700">
                Đã giảm trừ học bổng/ưu đãi: {formatVnd(ledgerSummary.totalDiscount)}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <span className="text-xs text-emerald-800">Đã thanh toán</span>
            <p className="mt-1 font-mono text-xl font-bold text-emerald-700">
              {formatVnd(ledgerSummary.totalPaid)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <span className="text-xs text-muted-foreground">Còn lại cần hoàn tất</span>
            <p
              className={`mt-1 font-mono text-xl font-bold ${
                ledgerSummary.remainingDebt > 0 ? "text-destructive" : "text-primary"
              }`}
            >
              {formatVnd(ledgerSummary.remainingDebt)}
            </p>
          </div>
        </div>

        {student.tuitionHistory && student.tuitionHistory.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kỳ học phí</TableHead>
                <TableHead>Mã biên nhận</TableHead>
                <TableHead>Hạn thanh toán</TableHead>
                <TableHead>Ngày nộp</TableHead>
                <TableHead>Hình thức</TableHead>
                <TableHead className="text-right">Đã thu</TableHead>
                <TableHead className="text-center">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {student.tuitionHistory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-heading font-semibold text-foreground">
                    {item.period}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.receiptCode || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDisplayDate(item.dueDate)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.paidAt ? formatDisplayDate(item.paidAt) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.method ? PAYMENT_METHOD_LABELS[item.method] : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-primary">
                    {formatVnd(item.paidAmount)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={
                        item.status === "paid"
                          ? "success"
                          : item.status === "partial"
                            ? "warning"
                            : "destructive"
                      }
                    >
                      {item.status === "paid"
                        ? "Đã hoàn thành"
                        : item.status === "partial"
                          ? "Thu một phần"
                          : "Chưa hoàn tất"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="rounded-xl border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
            Kỳ học phí hiện tại ({student.tuitionPeriod}): {student.tuitionAmount}.
          </p>
        )}
      </section>

      {/* 3. Printable / Copyable Academic Progress Report */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <FileText className="size-5 text-primary" aria-hidden="true" />
              Phiếu Báo cáo Tiến độ Học tập Cá nhân
            </h2>
            <p className="text-xs text-muted-foreground">
              Bản tổng hợp hồ sơ học tập chuẩn hóa dành cho Học viên & Quý Phụ huynh.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyReport}
          >
            {copiedReport ? (
              <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5 text-primary" aria-hidden="true" />
            )}
            {copiedReport ? "Đã sao chép báo cáo" : "Sao chép phiếu báo cáo"}
          </Button>
        </div>

        <pre className="overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
          {reportText}
        </pre>
      </section>
    </div>
  );
}
