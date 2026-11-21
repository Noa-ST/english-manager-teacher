"use client";

import * as React from "react";
import { Check, Copy, FileText, Printer } from "lucide-react";

import { useTodayIso } from "@/lib/use-today-iso";
import type { AdminStudentRecord } from "@/services/classroom-data";
import {
  buildStudentProgressReportText,
  computeStudentSkillProfile,
  formatDisplayDate,
} from "@/services/student-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface StudentReportModalProps {
  open: boolean;
  onClose: () => void;
  students: AdminStudentRecord[];
}

function StudentReportModalInner({
  onClose,
  students,
}: Omit<StudentReportModalProps, "open">) {
  const { toast } = useToast();
  const todayIso = useTodayIso();
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [copiedMode, setCopiedMode] = React.useState<"single" | "all" | null>(null);

  React.useEffect(() => {
    const cleanPrint = () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove("printing-student-report");
      }
    };
    window.addEventListener("afterprint", cleanPrint);
    return () => {
      window.removeEventListener("afterprint", cleanPrint);
      cleanPrint();
    };
  }, []);

  const currentStudent = students[Math.min(activeIndex, students.length - 1)];
  const profile = computeStudentSkillProfile(currentStudent);

  const handleCopySingle = () => {
    const text = buildStudentProgressReportText(currentStudent, profile);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedMode("single");
      setTimeout(() => setCopiedMode(null), 2000);
      toast({
        title: "Đã sao chép phiếu báo cáo",
        description: `Mẫu báo cáo của ${currentStudent.fullName} đã sẵn sàng dán gửi Zalo/Email.`,
        variant: "success",
      });
    }
  };

  const handleCopyAll = () => {
    const combined = students
      .map((s) => buildStudentProgressReportText(s))
      .join("\n\n==================================================\n\n");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(combined);
      setCopiedMode("all");
      setTimeout(() => setCopiedMode(null), 2000);
      toast({
        title: `Đã sao chép ${students.length} phiếu báo cáo`,
        description: "Toàn bộ phiếu báo cáo học tập đã lưu vào bộ nhớ tạm.",
        variant: "success",
      });
    }
  };

  const handlePrintPdf = () => {
    if (typeof document === "undefined") return;
    document.body.classList.add("printing-student-report");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("printing-student-report");
    }, 600);
  };

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={
        students.length > 1
          ? `Xuất Phiếu Báo cáo Học tập (${students.length} học sinh)`
          : `Phiếu Báo cáo Học tập — ${currentStudent.fullName}`
      }
      description="Phiếu báo cáo chỉ chứa kết quả học tập, chuyên cần, học phí và nhận xét công khai (tự động ẩn mọi ghi chú nội bộ)."
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCopySingle}>
              {copiedMode === "single" ? (
                <Check className="size-3.5 text-emerald-600" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copiedMode === "single" ? "Đã chép mẫu tin" : "Chép gửi Zalo/Email"}
            </Button>
            {students.length > 1 && (
              <Button type="button" variant="outline" size="sm" onClick={handleCopyAll}>
                {copiedMode === "all" ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <FileText className="size-3.5" />
                )}
                Chép tất cả ({students.length})
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
            <Button type="button" size="sm" onClick={handlePrintPdf}>
              <Printer className="size-3.5" />
              In / Lưu PDF
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Student switcher when exporting batch */}
        {students.length > 1 && (
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/30 p-2">
            {students.map((stu, idx) => (
              <button
                key={stu.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  idx === activeIndex
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "bg-card text-foreground hover:bg-muted"
                }`}
              >
                {stu.code} · {stu.fullName}
              </button>
            ))}
          </div>
        )}

        {/* Printable Report Sheet (React JSX, no dangerouslySetInnerHTML) */}
        <div className="print-report-sheet space-y-5 rounded-2xl border border-border bg-white p-6 text-slate-900 shadow-2xs">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#496B9A]">
                Academic English &amp; Mentorship · ThS. Nguyễn Minh Anh
              </p>
              <h3 className="mt-1 font-heading text-lg font-bold text-[#243B64]">
                PHIẾU BÁO CÁO TIẾN ĐỘ HỌC TẬP
              </h3>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-mono text-xs font-semibold text-slate-700">
                Mã HS: {currentStudent.code}
              </p>
              <p className="text-[11px] text-slate-500">
                Ngày xuất: {formatDisplayDate(todayIso)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] text-slate-500">Học viên &amp; Gia đình</p>
              <p className="mt-0.5 font-heading text-sm font-bold text-slate-900">
                {currentStudent.fullName}
              </p>
              {currentStudent.parentRelation && (
                <p className="text-[11px] text-slate-600">{currentStudent.parentRelation}</p>
              )}
            </div>
            <div>
              <p className="text-[11px] text-slate-500">Lớp học &amp; Mục tiêu</p>
              <p className="mt-0.5 font-semibold text-slate-900">
                {currentStudent.className} ({currentStudent.level})
              </p>
              <p className="text-[11px] text-slate-600">
                Mục tiêu: {currentStudent.targetGoal}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-3">
              <span className="text-[11px] text-slate-500">Band hiện tại</span>
              <p className="mt-1 font-mono text-lg font-bold text-[#243B64]">
                {profile.currentBand !== null ? profile.currentBand.toFixed(1) : "—"}
              </p>
              {profile.bandDelta !== null && (
                <span className="text-[10px] font-semibold text-emerald-700">
                  {profile.bandDelta >= 0 ? "+" : ""}
                  {profile.bandDelta.toFixed(1)} so với đầu vào
                </span>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <span className="text-[11px] text-slate-500">Chuyên cần</span>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-700">
                {currentStudent.attendanceHistory.length > 0
                  ? `${currentStudent.attendanceRate}%`
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <span className="text-[11px] text-slate-500">Học phí kỳ hiện tại</span>
              <p className="mt-1 font-mono text-sm font-bold text-slate-900">
                {currentStudent.tuitionAmount}
              </p>
              <span className="text-[10px] text-slate-600">
                Hạn: {formatDisplayDate(currentStudent.tuitionDueDate)}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <span className="text-[11px] text-slate-500">Trạng thái học phí</span>
              <div className="mt-1.5">
                <Badge
                  variant={
                    currentStudent.tuitionStatus === "paid"
                      ? "success"
                      : currentStudent.tuitionStatus === "due-soon"
                        ? "warning"
                        : "destructive"
                  }
                >
                  {currentStudent.tuitionStatus === "paid"
                    ? "Đã hoàn thành"
                    : currentStudent.tuitionStatus === "due-soon"
                      ? "Sắp đến hạn"
                      : "Quá hạn"}
                </Badge>
              </div>
            </div>
          </div>

          {profile.hasGrades && (
            <div className="space-y-2.5">
              <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-[#243B64]">
                Phân tích trung bình 4 kỹ năng
              </h4>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {profile.skills.map((skill) => (
                  <div
                    key={skill.key}
                    className="rounded-lg border border-slate-200 p-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{skill.label}</span>
                      <span className="font-mono font-bold text-[#243B64]">
                        {skill.score.toFixed(1)} / 9.0
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#243B64]"
                        style={{ width: `${Math.min(100, (skill.score / 9) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStudent.grades.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-[#243B64]">
                Kết quả các bài kiểm tra định kỳ ({currentStudent.grades.length})
              </h4>
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                {currentStudent.grades.slice(0, 4).map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-3 p-3">
                    <div>
                      <p className="font-semibold text-slate-900">{g.assessmentTitle}</p>
                      <p className="text-[11px] text-slate-500">
                        {g.date} · L:{g.listening} · R:{g.reading} · W:{g.writing} · S:{g.speaking}
                      </p>
                    </div>
                    <span className="rounded-md bg-[#243B64] px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {g.overall.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[#E4D8BA] bg-[#fcf9f3] p-4">
            <p className="font-semibold text-[#243B64]">Nhận xét &amp; Định hướng của Giáo viên:</p>
            <p className="mt-1 leading-relaxed text-slate-800">
              {currentStudent.recentComment || "Học viên đang theo sát tiến độ chương trình."}
            </p>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}

export function StudentReportModal({ open, onClose, students }: StudentReportModalProps) {
  if (!open || students.length === 0) return null;
  const keyStr = students.map((s) => s.id).join(",");
  return <StudentReportModalInner key={keyStr} onClose={onClose} students={students} />;
}
