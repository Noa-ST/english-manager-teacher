"use client";

import * as React from "react";
import {
  AlertTriangle,
  Award,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit3,
  FileText,
  History,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import {
  getStudentAcademicAlerts,
  type AcademicAlertSettings,
} from "@/services/academic-alert.service";
import type {
  AdminStudentRecord,
  ClassroomGroup,
  ClassSessionRecord,
  CommunicationLogEntry,
  TuitionPaymentRecord,
} from "@/services/classroom-data";
import {
  buildTuitionReceiptMessage,
  computeStudentSkillProfile,
  computeTuitionLedgerSummary,
  formatDisplayDate,
  formatVnd,
  parseVndAmount,
  STUDENT_STATUS_META,
  toInputDateFormat,
  type StudentPortalAccountItem,
} from "@/services/student-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { DetailModalTab } from "./student-table";

interface StudentDetailModalProps {
  student: AdminStudentRecord | null;
  initialTab?: DetailModalTab;
  onClose: () => void;
  classes: ClassroomGroup[];
  classSessions: ClassSessionRecord[];
  alertSettings: AcademicAlertSettings;
  account?: StudentPortalAccountItem | null;
  onStudentUpdated: (updated: AdminStudentRecord) => void;
  onOpenEdit: (student: AdminStudentRecord) => void;
  onOpenReport: (student: AdminStudentRecord) => void;
  onAccountUpdated?: () => void;
}

const CHANNEL_LABEL: Record<CommunicationLogEntry["channel"], string> = {
  zalo: "Zalo",
  phone: "Gọi điện",
  email: "Email",
  "in-person": "Gặp trực tiếp",
};

const CATEGORY_LABEL: Record<CommunicationLogEntry["category"], string> = {
  academic: "Học tập",
  tuition: "Học phí",
  attendance: "Chuyên cần",
  general: "Trao đổi chung",
};

const PAYMENT_METHOD_LABEL: Record<"transfer" | "cash" | "other", string> = {
  transfer: "Chuyển khoản",
  cash: "Tiền mặt",
  other: "Khác",
};

function StudentDetailModalInner({
  student,
  initialTab = "overview",
  onClose,
  classes,
  classSessions,
  alertSettings,
  account,
  onStudentUpdated,
  onOpenEdit,
  onOpenReport,
  onAccountUpdated,
}: Omit<StudentDetailModalProps, "student"> & { student: AdminStudentRecord }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<DetailModalTab>(initialTab);
  const [busyAction, setBusyAction] = React.useState(false);

  // Inline note editing (Tab 1)
  const [editingNotes, setEditingNotes] = React.useState(false);
  const [draftComment, setDraftComment] = React.useState(student.recentComment || "");
  const [draftPrivateNote, setDraftPrivateNote] = React.useState(student.privateNote || "");

  // Quick grade entry (Tab 2)
  const [showGradeForm, setShowGradeForm] = React.useState(false);
  const [gradeTitle, setGradeTitle] = React.useState("");
  const [gradeL, setGradeL] = React.useState("7.0");
  const [gradeR, setGradeR] = React.useState("7.0");
  const [gradeW, setGradeW] = React.useState("6.5");
  const [gradeS, setGradeS] = React.useState("6.5");
  const [gradeComment, setGradeComment] = React.useState("");

  // Tuition payment entry (Tab 4)
  const [showTuitionForm, setShowTuitionForm] = React.useState(false);
  const [editingPaymentId, setEditingPaymentId] = React.useState<string>("");
  const [payPeriod, setPayPeriod] = React.useState("");
  const [payBaseAmount, setPayBaseAmount] = React.useState("5800000");
  const [payDiscountAmount, setPayDiscountAmount] = React.useState("0");
  const [payPaidAmount, setPayPaidAmount] = React.useState("5800000");
  const [payDueDate, setPayDueDate] = React.useState("2026-11-20");
  const [payPaidAt, setPayPaidAt] = React.useState(toInputDateFormat());
  const [payMethod, setPayMethod] = React.useState<"transfer" | "cash" | "other">("transfer");
  const [payNote, setPayNote] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // CRM & Account (Tab 5)
  const [showCommForm, setShowCommForm] = React.useState(false);
  const [commChannel, setCommChannel] = React.useState<CommunicationLogEntry["channel"]>("zalo");
  const [commCategory, setCommCategory] =
    React.useState<CommunicationLogEntry["category"]>("academic");
  const [commSummary, setCommSummary] = React.useState("");
  const [commResponse, setCommResponse] = React.useState("");
  const [commFollowUp, setCommFollowUp] = React.useState("");

  const [accEmail, setAccEmail] = React.useState("");
  const [accPassword, setAccPassword] = React.useState("");
  const [resetPassValue, setResetPassValue] = React.useState("");
  const [showResetBox, setShowResetBox] = React.useState(false);

  const matchedClass = classes.find(
    (c) => c.id === student.classId || c.name === student.className,
  );
  const resolvedDueDate =
    student.tuitionDueDate || matchedClass?.tuitionDueDate || "2026-11-20";
  const statusMeta = STUDENT_STATUS_META[student.status];
  const skillProfile = computeStudentSkillProfile(student);
  const ledgerSummary = computeTuitionLedgerSummary(student);
  const viewingAlerts = getStudentAcademicAlerts(student, alertSettings);

  const stuSessions = classSessions
    .filter((ses) => ses.studentRecords.some((r) => r.studentId === student.id))
    .sort((a, b) => b.date.localeCompare(a.date));

  const copyText = (key: string, text: string, title: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title, variant: "success" });
    }
  };

  const handleTransitionToActive = async (message: string) => {
    setBusyAction(true);
    try {
      const updated = await apiRequest<AdminStudentRecord>(
        `/api/admin/students/${encodeURIComponent(student.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "active" }),
        },
      );
      onStudentUpdated(updated);
      toast({ title: message, variant: "success" });
    } catch (err) {
      toast({
        title: "Không thể cập nhật trạng thái",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveInlineNotes = async () => {
    setBusyAction(true);
    try {
      const updated = await apiRequest<AdminStudentRecord>(
        `/api/admin/students/${encodeURIComponent(student.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            recentComment: draftComment.trim(),
            privateNote: draftPrivateNote.trim(),
          }),
        },
      );
      onStudentUpdated(updated);
      setEditingNotes(false);
      toast({ title: "Đã lưu nhận xét & ghi chú nội bộ", variant: "success" });
    } catch (err) {
      toast({
        title: "Lưu ghi chú thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleRecordGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradeTitle.trim()) return;
    setBusyAction(true);
    try {
      const updated = await apiRequest<AdminStudentRecord>(
        `/api/admin/students/${encodeURIComponent(student.id)}/grades`,
        {
          method: "POST",
          body: JSON.stringify({
            assessmentTitle: gradeTitle.trim(),
            listening: Number(gradeL),
            reading: Number(gradeR),
            writing: Number(gradeW),
            speaking: Number(gradeS),
            comment: gradeComment.trim(),
          }),
        },
      );
      onStudentUpdated(updated);
      setShowGradeForm(false);
      setGradeTitle("");
      setGradeComment("");
      toast({
        title: "Đã ghi nhận điểm bài kiểm tra",
        description: `Overall mới: ${updated.averageScore.toFixed(1)}`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể lưu điểm",
        description: err instanceof Error ? err.message : "Vui lòng kiểm tra giá trị điểm (0–9).",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const openTuitionFormWithPreset = (existing?: TuitionPaymentRecord) => {
    if (existing) {
      const payable = Math.max(0, existing.baseAmount - (existing.discountAmount || 0));
      setEditingPaymentId(existing.id);
      setPayPeriod(existing.period);
      setPayBaseAmount(String(existing.baseAmount));
      setPayDiscountAmount(String(existing.discountAmount || 0));
      setPayPaidAmount(String(payable));
      setPayDueDate(toInputDateFormat(existing.dueDate));
      setPayPaidAt(toInputDateFormat());
      setPayMethod(existing.method || "transfer");
      setPayNote(existing.note || "");
    } else {
      const defaultAmt = parseVndAmount(student.tuitionAmount) || 5800000;
      setEditingPaymentId("");
      setPayPeriod(student.tuitionPeriod || "Học kỳ mới");
      setPayBaseAmount(String(defaultAmt));
      setPayDiscountAmount("0");
      setPayPaidAmount(String(defaultAmt));
      setPayDueDate(toInputDateFormat(resolvedDueDate));
      setPayPaidAt(toInputDateFormat());
      setPayMethod("transfer");
      setPayNote("");
    }
    setShowTuitionForm(true);
  };

  const handleQuickPayFullCurrent = async () => {
    const history = student.tuitionHistory ?? [];
    const targetEntry = history.find((p) => p.status !== "paid") ?? history[0];
    const baseAmt = targetEntry?.baseAmount ?? (parseVndAmount(student.tuitionAmount) || 5800000);
    const discountAmt = targetEntry?.discountAmount ?? 0;
    const payable = Math.max(0, baseAmt - discountAmt);

    setBusyAction(true);
    try {
      const res = await apiRequest<{
        student: AdminStudentRecord;
        payment: TuitionPaymentRecord;
      }>(`/api/admin/students/${encodeURIComponent(student.id)}/tuition`, {
        method: "POST",
        body: JSON.stringify({
          ...(targetEntry ? { paymentId: targetEntry.id } : {}),
          period: targetEntry?.period || student.tuitionPeriod || "Học kỳ hiện tại",
          baseAmount: baseAmt,
          discountAmount: discountAmt,
          paidAmount: payable,
          dueDate: targetEntry?.dueDate || resolvedDueDate,
          paidAt: toInputDateFormat(),
          method: "transfer",
          note: "Xác nhận thu đủ 1 chạm từ Hồ sơ học sinh",
        }),
      });
      onStudentUpdated(res.student);
      toast({
        title: "Đã xác nhận thu đủ học phí",
        description: `Phiếu ${res.payment.receiptCode || ""} đã được ghi nhận (${formatVnd(payable)}).`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể ghi nhận học phí",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleSubmitTuitionForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      const res = await apiRequest<{
        student: AdminStudentRecord;
        payment: TuitionPaymentRecord;
      }>(`/api/admin/students/${encodeURIComponent(student.id)}/tuition`, {
        method: "POST",
        body: JSON.stringify({
          ...(editingPaymentId ? { paymentId: editingPaymentId } : {}),
          period: payPeriod.trim(),
          baseAmount: Number(payBaseAmount),
          discountAmount: Number(payDiscountAmount || 0),
          paidAmount: Number(payPaidAmount || 0),
          dueDate: payDueDate,
          paidAt: Number(payPaidAmount) > 0 ? payPaidAt : undefined,
          method: payMethod,
          note: payNote.trim(),
        }),
      });
      onStudentUpdated(res.student);
      setShowTuitionForm(false);
      toast({
        title: "Đã cập nhật Sổ học phí",
        description: `Kỳ "${res.payment.period}" đã được lưu.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Lưu phiếu thu thất bại",
        description: err instanceof Error ? err.message : "Vui lòng kiểm tra lại số tiền.",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commSummary.trim()) return;
    setBusyAction(true);
    try {
      const res = await apiRequest<{
        student: AdminStudentRecord;
        entry: CommunicationLogEntry;
      }>(`/api/admin/students/${encodeURIComponent(student.id)}/communications`, {
        method: "POST",
        body: JSON.stringify({
          channel: commChannel,
          category: commCategory,
          summary: commSummary.trim(),
          parentResponse: commResponse.trim() || undefined,
          nextFollowUpDate: commFollowUp || undefined,
        }),
      });
      onStudentUpdated(res.student);
      setShowCommForm(false);
      setCommSummary("");
      setCommResponse("");
      setCommFollowUp("");
      toast({ title: "Đã lưu nhật ký trao đổi phụ huynh", variant: "success" });
    } catch (err) {
      toast({
        title: "Không thể lưu nhật ký",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteComm = async (logId: string) => {
    setBusyAction(true);
    try {
      const res = await apiRequest<{ student: AdminStudentRecord }>(
        `/api/admin/students/${encodeURIComponent(student.id)}/communications?logId=${encodeURIComponent(logId)}`,
        { method: "DELETE" },
      );
      onStudentUpdated(res.student);
      toast({ title: "Đã xóa mục nhật ký trao đổi", variant: "info" });
    } catch (err) {
      toast({
        title: "Không thể xóa mục nhật ký",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreatePortalAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accEmail.trim() || accPassword.length < 8) {
      toast({
        title: "Thông tin chưa hợp lệ",
        description: "Email phải đúng định dạng và mật khẩu tối thiểu 8 ký tự.",
        variant: "error",
      });
      return;
    }
    setBusyAction(true);
    try {
      await apiRequest("/api/admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          studentId: student.id,
          email: accEmail.trim().toLowerCase(),
          password: accPassword,
        }),
      });
      toast({
        title: "Đã cấp tài khoản Portal",
        description: `Học sinh ${student.fullName} có thể đăng nhập bằng ${accEmail.trim()}.`,
        variant: "success",
      });
      setAccEmail("");
      setAccPassword("");
      onAccountUpdated?.();
    } catch (err) {
      toast({
        title: "Không thể cấp tài khoản",
        description: err instanceof Error ? err.message : "Vui lòng kiểm tra cấu hình Auth.",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleAccountActive = async () => {
    if (!account?.profileId) return;
    setBusyAction(true);
    try {
      await apiRequest("/api/admin/accounts", {
        method: "PATCH",
        body: JSON.stringify({
          profileId: account.profileId,
          isActive: !account.isActive,
        }),
      });
      toast({
        title: account.isActive ? "Đã khóa tài khoản Portal" : "Đã mở khóa tài khoản Portal",
        variant: "success",
      });
      onAccountUpdated?.();
    } catch (err) {
      toast({
        title: "Thao tác thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleResetAccountPassword = async () => {
    if (!account?.profileId || resetPassValue.length < 8) {
      toast({
        title: "Mật khẩu mới phải từ 8 ký tự",
        variant: "error",
      });
      return;
    }
    setBusyAction(true);
    try {
      await apiRequest("/api/admin/accounts", {
        method: "PATCH",
        body: JSON.stringify({
          profileId: account.profileId,
          newPassword: resetPassValue,
        }),
      });
      toast({ title: "Đã đặt lại mật khẩu cho học sinh", variant: "success" });
      setResetPassValue("");
      setShowResetBox(false);
      onAccountUpdated?.();
    } catch (err) {
      toast({
        title: "Đặt lại mật khẩu thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusyAction(false);
    }
  };

  const previewGradeOverall = (
    Math.round(
      ((Number(gradeL || 0) + Number(gradeR || 0) + Number(gradeW || 0) + Number(gradeS || 0)) / 4) *
        2,
    ) / 2
  ).toFixed(1);

  const tabs: { id: DetailModalTab; label: string; count?: number }[] = [
    { id: "overview", label: "Tổng quan & 4 Kỹ năng" },
    { id: "grades", label: "Điểm số", count: student.grades.length },
    { id: "timeline", label: "Buổi học & BTVN", count: stuSessions.length },
    { id: "tuition", label: "Sổ học phí", count: (student.tuitionHistory ?? []).length },
    { id: "crm", label: "Phụ huynh & Tài khoản", count: (student.communicationLogs ?? []).length },
  ];

  const cleanPhone = (student.parentPhone || "").replace(/[^\d+]/g, "");

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={`Hồ sơ Học vụ 360°: ${student.fullName} (${student.code})`}
      description={`${student.className} · ${statusMeta.label} · Ngày nhập học: ${student.joinedAt || "—"}`}
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenReport(student)}>
            <FileText className="size-3.5 text-primary" aria-hidden="true" />
            Xuất / In Phiếu báo cáo
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onClose();
                onOpenEdit(student);
              }}
            >
              <Edit3 className="size-3.5" aria-hidden="true" />
              Chỉnh sửa hồ sơ
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* 5-Tab Bar */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 sm:grid-cols-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium transition-all sm:text-xs ${
                activeTab === tab.id
                  ? "bg-card font-semibold text-primary shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="truncate">{tab.label}</span>
              {tab.count !== undefined && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0 font-mono text-[10px] text-foreground">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Fixed-height container so all 5 tabs keep uniform modal height without jumping */}
        <div className="h-[min(470px,58vh)] overflow-y-auto pr-1">
        {/* ================= TAB 1: OVERVIEW & 4 SKILLS ================= */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Lifecycle quick banner for trial / on-leave */}
            {student.status === "trial" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-300/70 bg-sky-500/10 p-3.5 text-sky-900">
                <div>
                  <p className="font-semibold">Học viên đang trong giai đoạn Học thử (Trial)</p>
                  <p className="text-[11px] opacity-90">
                    Hệ thống tạm miễn cảnh báo học phí chính thức và điểm định kỳ cho học viên học thử.
                  </p>
                </div>
                <Button
                  type="button"
                  size="xs"
                  disabled={busyAction}
                  onClick={() => handleTransitionToActive("Đã chuyển học viên sang học chính thức")}
                >
                  <CheckCircle2 className="size-3.5" />
                  Chuyển chính thức
                </Button>
              </div>
            )}

            {student.status === "on-leave" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/80 bg-amber-500/10 p-3.5 text-amber-900">
                <div>
                  <p className="font-semibold">
                    Học viên đang Bảo lưu (On-leave)
                    {student.leaveStartDate ? ` · Từ ${formatDisplayDate(student.leaveStartDate)}` : ""}
                    {student.leaveReturnDate
                      ? ` → Dự kiến quay lại ${formatDisplayDate(student.leaveReturnDate)}`
                      : ""}
                  </p>
                  {student.leaveReason && (
                    <p className="mt-0.5 text-[11px]">Lý do: {student.leaveReason}</p>
                  )}
                </div>
                <Button
                  type="button"
                  size="xs"
                  disabled={busyAction}
                  onClick={() => handleTransitionToActive("Học viên đã quay lại lớp chính thức")}
                >
                  <CheckCircle2 className="size-3.5" />
                  Kết thúc bảo lưu
                </Button>
              </div>
            )}

            {/* 5 KPI Cards */}
            <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-5">
              <div className="flex min-h-[96px] flex-col justify-between rounded-xl border border-border/60 bg-background p-3.5">
                <div className="flex min-h-[20px] items-center justify-between gap-1">
                  <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                    Điểm trung bình
                  </span>
                </div>
                <p className="font-mono text-base font-bold leading-tight whitespace-nowrap text-primary">
                  {student.grades.length > 0 && student.averageScore > 0
                    ? student.averageScore.toFixed(1)
                    : "—"}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {student.grades.length > 0
                    ? `${student.grades.length} bài kiểm tra`
                    : "Chưa có bài kiểm tra"}
                </p>
              </div>
              <div className="flex min-h-[96px] flex-col justify-between rounded-xl border border-border/60 bg-background p-3.5">
                <div className="flex min-h-[20px] items-center justify-between gap-1">
                  <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                    Chuyên cần
                  </span>
                </div>
                <p className="font-mono text-base font-bold leading-tight whitespace-nowrap text-emerald-700">
                  {student.attendanceHistory.length > 0 ? `${student.attendanceRate}%` : "—"}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {student.attendanceHistory.length > 0
                    ? `${student.attendanceHistory.length} buổi ghi nhận`
                    : "Chưa điểm danh"}
                </p>
              </div>
              <div className="flex min-h-[96px] flex-col justify-between rounded-xl border border-border/60 bg-warm/60 p-3.5">
                <div className="flex min-h-[20px] items-center justify-between gap-1">
                  <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                    Học phí
                  </span>
                  <Badge
                    variant={
                      student.tuitionStatus === "paid"
                        ? "success"
                        : student.tuitionStatus === "overdue"
                          ? "destructive"
                          : "warning"
                    }
                    className="h-4.5 shrink-0 px-1.5 py-0 text-[10px]"
                  >
                    {student.tuitionStatus === "paid"
                      ? "Đã đóng"
                      : student.tuitionStatus === "overdue"
                        ? "Quá hạn"
                        : "Sắp hạn"}
                  </Badge>
                </div>
                <p className="font-mono text-base font-bold leading-tight whitespace-nowrap text-foreground">
                  {student.tuitionAmount}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {student.tuitionPeriod || "Kỳ hiện tại"}
                </p>
              </div>
              <div className="flex min-h-[96px] flex-col justify-between rounded-xl border border-primary/20 bg-background p-3.5">
                <div className="flex min-h-[20px] items-center justify-between gap-1">
                  <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                    Ngày nộp học phí
                  </span>
                </div>
                <p className="font-mono text-base font-bold leading-tight whitespace-nowrap text-primary">
                  {formatDisplayDate(resolvedDueDate)}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  Theo hạn nộp của lớp
                </p>
              </div>
              <div className="col-span-2 flex min-h-[96px] flex-col justify-between rounded-xl border border-border/60 bg-background p-3.5 sm:col-span-1">
                <div className="flex min-h-[20px] items-center justify-between gap-1">
                  <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                    Ngày nhập học
                  </span>
                </div>
                <p className="font-mono text-base font-bold leading-tight whitespace-nowrap text-foreground">
                  {student.joinedAt || "—"}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {statusMeta.label}
                </p>
              </div>
            </div>

            {/* Lộ trình Band & Phân rã 4 kỹ năng */}
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />
                  <h4 className="font-heading text-sm font-bold text-foreground">
                    Lộ trình Band &amp; Chẩn đoán 4 Kỹ năng
                  </h4>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                    Đầu vào:{" "}
                    <strong className="text-foreground">
                      {skillProfile.entryBand !== null ? skillProfile.entryBand.toFixed(1) : "—"}
                    </strong>
                  </span>
                  <span>→</span>
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary">
                    Hiện tại:{" "}
                    <strong>
                      {skillProfile.currentBand !== null
                        ? skillProfile.currentBand.toFixed(1)
                        : "—"}
                    </strong>
                    {skillProfile.bandDelta !== null && (
                      <span className="ml-1 text-emerald-700">
                        ({skillProfile.bandDelta >= 0 ? "+" : ""}
                        {skillProfile.bandDelta.toFixed(1)})
                      </span>
                    )}
                  </span>
                  <span>→</span>
                  <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-amber-900">
                    Mục tiêu:{" "}
                    <strong>
                      {skillProfile.targetBand !== null
                        ? skillProfile.targetBand.toFixed(1)
                        : student.targetGoal}
                    </strong>
                  </span>
                </div>
              </div>

              {skillProfile.hasGrades ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {skillProfile.skills.map((skill) => {
                      const isStrongest = skillProfile.strongestSkill?.label === skill.label;
                      const isWeakest =
                        skillProfile.weakestSkill?.label === skill.label &&
                        skillProfile.strongestSkill?.label !== skill.label;
                      return (
                        <div key={skill.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground">{skill.label}</span>
                              {isStrongest && (
                                <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                                  Điểm mạnh
                                </Badge>
                              )}
                              {isWeakest && (
                                <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                                  Cần kèm thêm
                                </Badge>
                              )}
                            </div>
                            <span className="font-mono font-bold text-primary">
                              {skill.score.toFixed(1)}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                isWeakest
                                  ? "bg-amber-500"
                                  : isStrongest
                                    ? "bg-emerald-600"
                                    : "bg-primary"
                              }`}
                              style={{ width: `${Math.min(100, (skill.score / 9) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-muted-foreground">
                  Chưa có bài kiểm tra để phân tích 4 kỹ năng. Bấm sang tab{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("grades");
                      setShowGradeForm(true);
                    }}
                    className="font-semibold text-primary hover:underline"
                  >
                    Điểm số
                  </button>{" "}
                  để nhập điểm đầu tiên.
                </p>
              )}
            </div>

            {/* Academic Alerts */}
            {viewingAlerts.length > 0 && (
              <div className="rounded-xl border border-amber-300/80 bg-amber-500/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-amber-900">
                    <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
                    <span>Cảnh báo học vụ cần quan tâm ({viewingAlerts.length})</span>
                  </div>
                  <span className="text-[11px] font-medium text-amber-700">
                    Tự động nhận diện
                  </span>
                </div>
                <div className="mt-2 divide-y divide-amber-200/50">
                  {viewingAlerts.map((alt, idx) => (
                    <div key={idx} className="flex items-start gap-2 py-2 first:pt-1 last:pb-0">
                      <span
                        className={`mt-1 size-2 shrink-0 rounded-full ${
                          alt.level === "destructive" ? "bg-destructive" : "bg-amber-500"
                        }`}
                      />
                      <div>
                        <p className="font-semibold text-foreground">{alt.title}</p>
                        <p className="text-muted-foreground">{alt.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Two separated comments: Public vs Private Note */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2 pb-2">
                <span className="font-heading text-xs font-bold text-foreground">
                  Nhận xét công khai &amp; Ghi chú nội bộ giáo viên
                </span>
                {!editingNotes ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setEditingNotes(true)}
                  >
                    <Edit3 className="size-3" />
                    Sửa nhanh ghi chú
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setEditingNotes(false);
                        setDraftComment(student.recentComment || "");
                        setDraftPrivateNote(student.privateNote || "");
                      }}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      disabled={busyAction}
                      onClick={handleSaveInlineNotes}
                    >
                      <CheckCircle2 className="size-3" />
                      Lưu ghi chú
                    </Button>
                  </div>
                )}
              </div>

              {editingNotes ? (
                <div className="grid gap-3 pt-1 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-primary">
                      Nhận xét gửi Cổng học sinh
                    </label>
                    <textarea
                      rows={3}
                      value={draftComment}
                      onChange={(e) => setDraftComment(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background p-2.5 text-xs outline-none focus-visible:border-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-[11px] font-semibold text-amber-900">
                      <Lock className="size-3" />
                      Ghi chú nội bộ (HS không thấy)
                    </label>
                    <textarea
                      rows={3}
                      value={draftPrivateNote}
                      onChange={(e) => setDraftPrivateNote(e.target.value)}
                      className="w-full rounded-lg border border-amber-300 bg-amber-500/5 p-2.5 text-xs outline-none focus-visible:border-ring"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid items-stretch gap-3 pt-1 sm:grid-cols-2">
                  <div className="flex min-h-[104px] flex-col rounded-xl border border-border bg-warm/40 p-3.5">
                    <p className="font-semibold text-primary">
                      Nhận xét gần nhất (Cổng học sinh):
                    </p>
                    <p className="mt-1.5 leading-relaxed text-foreground">
                      {student.recentComment ? `“${student.recentComment}”` : "Chưa có nhận xét."}
                    </p>
                  </div>
                  <div className="flex min-h-[104px] flex-col rounded-xl border border-amber-300/70 bg-amber-500/5 p-3.5">
                    <p className="flex items-center gap-1.5 font-semibold text-amber-900">
                      <Lock className="size-3.5 text-amber-700" />
                      Ghi chú nội bộ (chỉ giáo viên thấy):
                    </p>
                    <p className="mt-1.5 leading-relaxed text-foreground">
                      {student.privateNote
                        ? student.privateNote
                        : "Chưa có ghi chú riêng tư nào."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Class Transfer History */}
            {(student.classTransferHistory ?? []).length > 0 && (
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="mb-2 flex items-center gap-2 font-heading text-xs font-bold text-foreground">
                  <History className="size-3.5 text-primary" />
                  <span>
                    Lịch sử chuyển lớp ({(student.classTransferHistory ?? []).length})
                  </span>
                </div>
                <div className="space-y-2">
                  {(student.classTransferHistory ?? []).map((tr) => (
                    <div
                      key={tr.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3 py-2"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {tr.oldClassName} → <span className="text-primary">{tr.newClassName}</span>
                        </p>
                        {tr.reason && (
                          <p className="text-[11px] text-muted-foreground">Lý do: {tr.reason}</p>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatDisplayDate(tr.changedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: GRADES & AUDIT ================= */}
        {activeTab === "grades" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="size-4 text-primary" />
                <h4 className="font-heading text-sm font-bold text-foreground">
                  Bảng điểm bài kiểm tra ({student.grades.length})
                </h4>
              </div>
              <Button
                type="button"
                size="xs"
                onClick={() => setShowGradeForm((prev) => !prev)}
              >
                <Plus className="size-3.5" />
                {showGradeForm ? "Đóng form nhập điểm" : "Nhập điểm nhanh"}
              </Button>
            </div>

            {showGradeForm && (
              <form
                onSubmit={handleRecordGrade}
                className="space-y-3 rounded-xl border border-primary/30 bg-warm/30 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary">
                    Ghi nhận / Cập nhật bài kiểm tra mới
                  </span>
                  <Badge variant="default" className="font-mono">
                    Overall dự kiến: {previewGradeOverall}
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-semibold">Tên bài kiểm tra</label>
                    <Input
                      value={gradeTitle}
                      onChange={(e) => setGradeTitle(e.target.value)}
                      placeholder="VD: Mock Test #4 — Toàn diện 4 kỹ năng"
                      required
                    />
                  </div>
                  {[
                    { label: "Listening", val: gradeL, set: setGradeL },
                    { label: "Reading", val: gradeR, set: setGradeR },
                    { label: "Writing", val: gradeW, set: setGradeW },
                    { label: "Speaking", val: gradeS, set: setGradeS },
                  ].map((s) => (
                    <div key={s.label} className="space-y-1">
                      <label className="text-[11px] font-semibold">{s.label} (0–9)</label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="9"
                        value={s.val}
                        onChange={(e) => s.set(e.target.value)}
                        required
                      />
                    </div>
                  ))}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-semibold">Nhận xét bài làm</label>
                    <Input
                      value={gradeComment}
                      onChange={(e) => setGradeComment(e.target.value)}
                      placeholder="Nhận xét chi tiết gửi học sinh..."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setShowGradeForm(false)}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" size="xs" disabled={busyAction}>
                    <CheckCircle2 className="size-3.5" />
                    Lưu bảng điểm
                  </Button>
                </div>
              </form>
            )}

            {student.grades.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-muted-foreground">
                Học sinh chưa có bài kiểm tra nào được ghi nhận.
              </div>
            ) : (
              <div className="space-y-2.5">
                {student.grades.map((g) => (
                  <div
                    key={g.id}
                    className="space-y-1.5 rounded-xl border border-border bg-background p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">{g.assessmentTitle}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          Ngày: {g.date} · L:{g.listening} · R:{g.reading} · W:{g.writing} · S:
                          {g.speaking}
                        </p>
                      </div>
                      <Badge variant="default" className="font-mono">
                        Overall {g.overall.toFixed(1)}
                      </Badge>
                    </div>
                    {g.comment && (
                      <p className="text-[11px] text-muted-foreground">{g.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(student.gradeChangeHistory ?? []).length > 0 && (
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
                  <History className="size-3.5 text-primary" />
                  Lịch sử chỉnh sửa điểm ({(student.gradeChangeHistory ?? []).length})
                </p>
                <div className="space-y-1.5">
                  {(student.gradeChangeHistory ?? []).map((gc) => (
                    <div
                      key={gc.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
                    >
                      <span>
                        <strong>{gc.assessmentTitle}</strong>: {gc.oldScore.toFixed(1)} →{" "}
                        <strong className="text-primary">{gc.newScore.toFixed(1)}</strong>
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {formatDisplayDate(gc.changedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: SESSIONS & TIMELINE ================= */}
        {activeTab === "timeline" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4">
              <div className="flex min-h-[82px] flex-col justify-between rounded-xl border border-border bg-background p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Số buổi ghi nhận
                </span>
                <p className="font-mono text-lg font-bold text-foreground">
                  {stuSessions.length}
                </p>
              </div>
              <div className="flex min-h-[82px] flex-col justify-between rounded-xl border border-border bg-background p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">Có mặt</span>
                <p className="font-mono text-lg font-bold text-emerald-700">
                  {
                    stuSessions.filter(
                      (s) =>
                        s.studentRecords.find((r) => r.studentId === student.id)?.attendance ===
                        "present",
                    ).length
                  }
                </p>
              </div>
              <div className="flex min-h-[82px] flex-col justify-between rounded-xl border border-border bg-background p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">Vắng mặt</span>
                <p className="font-mono text-lg font-bold text-destructive">
                  {
                    stuSessions.filter((s) => {
                      const att = s.studentRecords.find(
                        (r) => r.studentId === student.id,
                      )?.attendance;
                      return att === "absent" || att === "excused";
                    }).length
                  }
                </p>
              </div>
              <div className="flex min-h-[82px] flex-col justify-between rounded-xl border border-border bg-background p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">Đã nộp BTVN</span>
                <p className="font-mono text-lg font-bold text-primary">
                  {
                    stuSessions.filter(
                      (s) =>
                        s.studentRecords.find((r) => r.studentId === student.id)
                          ?.homeworkStatus === "submitted",
                    ).length
                  }
                </p>
              </div>
            </div>

            {stuSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-muted-foreground">
                Chưa có nhật ký buổi học nào được ghi nhận cho học sinh này.
              </div>
            ) : (
              <div className="space-y-2.5">
                {stuSessions.map((ses) => {
                  const rec = ses.studentRecords.find((r) => r.studentId === student.id)!;
                  return (
                    <div
                      key={ses.id}
                      className="space-y-1.5 rounded-xl border border-border bg-background p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-foreground">
                          {formatDisplayDate(ses.date)} – {ses.topic}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={
                              rec.attendance === "present"
                                ? "secondary"
                                : rec.attendance === "absent"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="text-[10px]"
                          >
                            Điểm danh:{" "}
                            {rec.attendance === "present"
                              ? "Có mặt"
                              : rec.attendance === "late"
                                ? "Đi muộn"
                                : rec.attendance === "excused"
                                  ? "Vắng có phép"
                                  : "Vắng không phép"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Bài tập:{" "}
                            {rec.homeworkStatus === "submitted"
                              ? "Đã nộp"
                              : rec.homeworkStatus === "not-submitted"
                                ? "Chưa nộp"
                                : rec.homeworkStatus === "exempt"
                                  ? "Miễn"
                                  : "Chưa ghi nhận"}
                          </Badge>
                          {rec.learningStatus !== "unrecorded" && (
                            <Badge variant="default" className="text-[10px]">
                              Kết quả:{" "}
                              {rec.learningStatus === "good"
                                ? "Tốt"
                                : rec.learningStatus === "satisfactory"
                                  ? "Đạt"
                                  : "Cần hỗ trợ"}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {rec.teacherFeedback && (
                        <p className="text-muted-foreground">
                          <strong>Nhận xét:</strong> {rec.teacherFeedback}
                        </p>
                      )}
                      {rec.followUp && (
                        <p className="font-medium text-primary">
                          <strong>Cần hỗ trợ tiếp:</strong> {rec.followUp}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: TUITION LEDGER ================= */}
        {activeTab === "tuition" && (
          <div className="space-y-4">
            {/* Summary Strip */}
            <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-3">
              <div className="flex min-h-[90px] flex-col justify-between rounded-xl border border-border bg-background p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Tổng phải thu
                </span>
                <p className="font-mono text-base font-bold text-foreground">
                  {formatVnd(ledgerSummary.totalPayable)}
                </p>
                <span className="truncate text-[10px] text-muted-foreground">
                  {ledgerSummary.totalDiscount > 0
                    ? `Đã trừ ưu đãi ${formatVnd(ledgerSummary.totalDiscount)}`
                    : `${(student.tuitionHistory ?? []).length || 1} kỳ học phí`}
                </span>
              </div>
              <div className="flex min-h-[90px] flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-500/5 p-3.5">
                <span className="text-[11px] font-medium text-emerald-800">Đã thanh toán</span>
                <p className="font-mono text-base font-bold text-emerald-700">
                  {formatVnd(ledgerSummary.totalPaid)}
                </p>
                <span className="truncate text-[10px] text-emerald-700/80">
                  {(student.tuitionHistory ?? []).filter((p) => p.paidAmount > 0).length} lượt ghi nhận
                </span>
              </div>
              <div
                className={`flex min-h-[90px] flex-col justify-between rounded-xl border p-3.5 ${
                  ledgerSummary.remainingDebt > 0
                    ? "border-amber-300 bg-amber-500/10"
                    : "border-border bg-background"
                }`}
              >
                <span className="text-[11px] font-medium text-muted-foreground">Còn nợ</span>
                <p
                  className={`font-mono text-base font-bold ${
                    ledgerSummary.remainingDebt > 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {formatVnd(ledgerSummary.remainingDebt)}
                </p>
                <span className="truncate text-[10px] text-muted-foreground">
                  {ledgerSummary.remainingDebt > 0
                    ? "Cần theo dõi thu tiếp"
                    : "Đã hoàn tất nghĩa vụ"}
                </span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-heading text-sm font-bold text-foreground">
                Sổ thu học phí theo kỳ ({(student.tuitionHistory ?? []).length})
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                {student.tuitionStatus !== "paid" && (
                  <Button
                    type="button"
                    size="xs"
                    disabled={busyAction}
                    onClick={handleQuickPayFullCurrent}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Xác nhận đã thu đủ 1 chạm
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => openTuitionFormWithPreset()}
                >
                  <Plus className="size-3.5" />
                  Ghi nhận thu tiền / Tạo kỳ mới
                </Button>
              </div>
            </div>

            {showTuitionForm && (
              <form
                onSubmit={handleSubmitTuitionForm}
                className="space-y-3 rounded-xl border border-primary/30 bg-warm/30 p-4"
              >
                <p className="font-semibold text-primary">
                  {editingPaymentId ? "Cập nhật phiếu thu học phí" : "Tạo phiếu thu học phí mới"}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-semibold">Kỳ học phí</label>
                    <Input
                      value={payPeriod}
                      onChange={(e) => setPayPeriod(e.target.value)}
                      placeholder="VD: Học kỳ II (Tháng 11 – 01)"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Hình thức</label>
                    <select
                      value={payMethod}
                      onChange={(e) =>
                        setPayMethod(e.target.value as "transfer" | "cash" | "other")
                      }
                      className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs"
                    >
                      <option value="transfer">Chuyển khoản</option>
                      <option value="cash">Tiền mặt</option>
                      <option value="other">Khác</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Học phí gốc (VNĐ)</label>
                    <Input
                      type="number"
                      min="0"
                      step="50000"
                      value={payBaseAmount}
                      onChange={(e) => setPayBaseAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Giảm trừ / Học bổng</label>
                    <Input
                      type="number"
                      min="0"
                      step="50000"
                      value={payDiscountAmount}
                      onChange={(e) => setPayDiscountAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Số tiền thực thu (VNĐ)</label>
                    <Input
                      type="number"
                      min="0"
                      step="50000"
                      value={payPaidAmount}
                      onChange={(e) => setPayPaidAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Hạn nộp</label>
                    <Input
                      type="date"
                      value={payDueDate}
                      onChange={(e) => setPayDueDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Ngày thực thu</label>
                    <Input
                      type="date"
                      value={payPaidAt}
                      onChange={(e) => setPayPaidAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Ghi chú phiếu thu</label>
                    <Input
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="VD: Cọc đợt 1 / Miễn giảm 10%"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setShowTuitionForm(false)}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" size="xs" disabled={busyAction}>
                    <CheckCircle2 className="size-3.5" />
                    Lưu phiếu thu
                  </Button>
                </div>
              </form>
            )}

            {(student.tuitionHistory ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-muted-foreground">
                Chưa có bản ghi chi tiết theo kỳ. Bấm &ldquo;Ghi nhận thu tiền&rdquo; để khởi tạo Sổ học phí.
              </div>
            ) : (
              <div className="space-y-2.5">
                {(student.tuitionHistory ?? []).map((pay) => {
                  const payable = Math.max(0, pay.baseAmount - (pay.discountAmount || 0));
                  const debt = Math.max(0, payable - pay.paidAmount);
                  return (
                    <div
                      key={pay.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-3.5 sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">{pay.period}</span>
                          <Badge
                            variant={
                              pay.status === "paid"
                                ? "success"
                                : pay.status === "partial"
                                  ? "info"
                                  : pay.status === "due-soon"
                                    ? "warning"
                                    : "destructive"
                            }
                          >
                            {pay.status === "paid"
                              ? "Đã thu đủ"
                              : pay.status === "partial"
                                ? "Thu một phần"
                                : pay.status === "due-soon"
                                  ? "Sắp đến hạn"
                                  : "Quá hạn"}
                          </Badge>
                          {pay.receiptCode && (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              #{pay.receiptCode}
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          Phải thu: {formatVnd(payable)} · Đã thu:{" "}
                          <strong className="text-emerald-700">{formatVnd(pay.paidAmount)}</strong>
                          {debt > 0 && (
                            <>
                              {" "}
                              · Còn nợ: <strong className="text-destructive">{formatVnd(debt)}</strong>
                            </>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Hạn: {formatDisplayDate(pay.dueDate)}
                          {pay.paidAt ? ` · Thực thu: ${formatDisplayDate(pay.paidAt)}` : ""}
                          {pay.method ? ` (${PAYMENT_METHOD_LABEL[pay.method]})` : ""}
                          {pay.note ? ` · ${pay.note}` : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {debt > 0 && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => openTuitionFormWithPreset(pay)}
                          >
                            <CreditCard className="size-3" />
                            Thu tiếp
                          </Button>
                        )}
                        {pay.paidAmount > 0 && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              copyText(
                                pay.id,
                                buildTuitionReceiptMessage(student, pay),
                                "Đã sao chép biên nhận Zalo gửi phụ huynh",
                              )
                            }
                          >
                            {copiedId === pay.id ? (
                              <Check className="size-3 text-emerald-600" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                            Chép biên nhận
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: PARENT CRM, PORTAL ACCOUNT & COMM LOG ================= */}
        {activeTab === "crm" && (
          <div className="space-y-4">
            {/* Parent Info & Portal Account Side-by-Side */}
            <div className="grid items-stretch gap-4 sm:grid-cols-2">
              {/* Parent Card */}
              <div className="flex min-h-[176px] flex-col space-y-2.5 rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-heading text-xs font-bold uppercase tracking-wider text-primary">
                    Liên hệ Phụ huynh
                  </p>
                  {cleanPhone ? (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${cleanPhone}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted"
                      >
                        <Phone className="size-3 text-emerald-600" />
                        Gọi
                      </a>
                      <a
                        href={`https://zalo.me/${cleanPhone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-500/20"
                      >
                        <MessageSquare className="size-3" />
                        Mở Zalo
                      </a>
                    </div>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Không bắt buộc
                    </span>
                  )}
                </div>

                {!student.parentName &&
                !student.parentRelation &&
                !student.parentPhone &&
                !student.parentEmail &&
                !student.parentNote ? (
                  <div className="flex-1 space-y-1.5 text-xs">
                    <p className="text-muted-foreground">
                      Chưa cập nhật thông tin phụ huynh (không bắt buộc).
                    </p>
                    <p className="text-[11px] text-muted-foreground/80">
                      Bạn có thể bổ sung bất kỳ lúc nào qua nút Chỉnh sửa hồ sơ.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 space-y-1 text-xs">
                    {(student.parentName || student.parentRelation) && (
                      <p className="font-semibold text-foreground">
                        {student.parentName || student.parentRelation}
                      </p>
                    )}
                    {student.parentName && student.parentRelation && (
                      <p className="text-[11px] text-muted-foreground">{student.parentRelation}</p>
                    )}
                    {(student.parentPhone || student.parentContactMasked) && (
                      <div className="flex items-center gap-2 pt-1 font-mono">
                        <span>{student.parentPhone || student.parentContactMasked}</span>
                        {student.parentPhone && (
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                "phone",
                                student.parentPhone || "",
                                "Đã sao chép số điện thoại phụ huynh",
                              )
                            }
                            className="rounded border border-border p-1 hover:bg-muted"
                            title="Sao chép SĐT"
                          >
                            {copiedId === "phone" ? (
                              <Check className="size-3 text-emerald-600" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                    {student.parentEmail && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Mail className="size-3" />
                        <a href={`mailto:${student.parentEmail}`} className="hover:underline">
                          {student.parentEmail}
                        </a>
                      </p>
                    )}
                    {student.parentNote && (
                      <p className="mt-1 rounded-lg bg-warm/40 p-2 text-[11px] text-foreground">
                        <strong>Lưu ý:</strong> {student.parentNote}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Portal Account Card */}
              <div className="flex min-h-[176px] flex-col space-y-2.5 rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <p className="font-heading text-xs font-bold uppercase tracking-wider text-primary">
                    Tài khoản Cổng học sinh
                  </p>
                  {account?.hasAuthAccount ? (
                    <Badge variant={account.isActive ? "success" : "outline"}>
                      {account.isActive ? "Đang hoạt động" : "Đã khóa"}
                    </Badge>
                  ) : (
                    <Badge variant="warning">Chưa cấp TK</Badge>
                  )}
                </div>

                {account?.hasAuthAccount ? (
                  <div className="space-y-2.5">
                    <div className="space-y-0.5">
                      <p className="font-mono text-xs font-semibold text-foreground">
                        {account.email}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Đăng nhập gần nhất:{" "}
                        {account.lastSignInAt
                          ? new Date(account.lastSignInAt).toLocaleString("vi-VN")
                          : "Chưa đăng nhập lần nào"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={busyAction}
                        onClick={() => setShowResetBox((prev) => !prev)}
                      >
                        <KeyRound className="size-3" />
                        Đặt lại mật khẩu
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={busyAction}
                        onClick={handleToggleAccountActive}
                      >
                        {account.isActive ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                      </Button>
                    </div>
                    {showResetBox && (
                      <div className="flex items-center gap-2 pt-1">
                        <Input
                          type="text"
                          value={resetPassValue}
                          onChange={(e) => setResetPassValue(e.target.value)}
                          placeholder="Mật khẩu mới (≥ 8 ký tự)"
                          className="h-7 text-xs"
                        />
                        <Button
                          type="button"
                          size="xs"
                          disabled={busyAction}
                          onClick={handleResetAccountPassword}
                        >
                          Lưu
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleCreatePortalAccount} className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      Cấp email &amp; mật khẩu để {student.fullName} đăng nhập xem điểm và tải học liệu nội bộ.
                    </p>
                    <Input
                      type="email"
                      value={accEmail}
                      onChange={(e) => setAccEmail(e.target.value)}
                      placeholder="Email đăng nhập học sinh..."
                      className="h-8 text-xs"
                      required
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={accPassword}
                        onChange={(e) => setAccPassword(e.target.value)}
                        placeholder="Mật khẩu ≥ 8 ký tự..."
                        className="h-8 text-xs"
                        minLength={8}
                        required
                      />
                      <Button type="submit" size="xs" disabled={busyAction}>
                        <ShieldCheck className="size-3" />
                        Cấp TK
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Communication Log Section */}
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary" />
                  <h4 className="font-heading text-sm font-bold text-foreground">
                    Nhật ký Tương tác Phụ huynh ({(student.communicationLogs ?? []).length})
                  </h4>
                </div>
                <Button
                  type="button"
                  size="xs"
                  onClick={() => setShowCommForm((prev) => !prev)}
                >
                  <Plus className="size-3.5" />
                  {showCommForm ? "Đóng form" : "Ghi nhận trao đổi"}
                </Button>
              </div>

              {showCommForm && (
                <form
                  onSubmit={handleAddCommunication}
                  className="space-y-3 rounded-xl border border-primary/30 bg-warm/30 p-3.5"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold">Kênh liên hệ</label>
                      <select
                        value={commChannel}
                        onChange={(e) =>
                          setCommChannel(e.target.value as CommunicationLogEntry["channel"])
                        }
                        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs"
                      >
                        <option value="zalo">Zalo</option>
                        <option value="phone">Gọi điện</option>
                        <option value="email">Email</option>
                        <option value="in-person">Gặp trực tiếp</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold">Phân loại</label>
                      <select
                        value={commCategory}
                        onChange={(e) =>
                          setCommCategory(e.target.value as CommunicationLogEntry["category"])
                        }
                        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs"
                      >
                        <option value="academic">Học tập</option>
                        <option value="tuition">Học phí</option>
                        <option value="attendance">Chuyên cần</option>
                        <option value="general">Trao đổi chung</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold">Hẹn xử lý tiếp (tuỳ chọn)</label>
                      <Input
                        type="date"
                        value={commFollowUp}
                        onChange={(e) => setCommFollowUp(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Nội dung đã trao đổi</label>
                    <textarea
                      rows={2}
                      value={commSummary}
                      onChange={(e) => setCommSummary(e.target.value)}
                      placeholder="VD: Nhắc phụ huynh cho con hoàn thành bài Speaking ghi âm trước thứ 6..."
                      required
                      className="w-full rounded-lg border border-input bg-background p-2.5 text-xs outline-none focus-visible:border-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Phản hồi của gia đình</label>
                    <Input
                      value={commResponse}
                      onChange={(e) => setCommResponse(e.target.value)}
                      placeholder="VD: Phụ huynh đã xác nhận và cảm ơn..."
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setShowCommForm(false)}
                    >
                      Hủy
                    </Button>
                    <Button type="submit" size="xs" disabled={busyAction}>
                      <Send className="size-3" />
                      Lưu nhật ký
                    </Button>
                  </div>
                </form>
              )}

              {(student.communicationLogs ?? []).length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  Chưa có lịch sử trao đổi nào với phụ huynh.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {(student.communicationLogs ?? []).map((log) => (
                    <div
                      key={log.id}
                      className="rounded-xl border border-border bg-background p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {CHANNEL_LABEL[log.channel]}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {CATEGORY_LABEL[log.category]}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatDisplayDate(log.date)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteComm(log.id)}
                          disabled={busyAction}
                          title="Xóa nhật ký này"
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <p className="mt-1.5 text-foreground">{log.summary}</p>
                      {log.parentResponse && (
                        <p className="mt-1 text-[11px] text-emerald-800">
                          <strong>Phản hồi gia đình:</strong> {log.parentResponse}
                        </p>
                      )}
                      {log.nextFollowUpDate && (
                        <p className="mt-1 font-mono text-[11px] text-amber-800">
                          📅 Hẹn kiểm tra lại: {formatDisplayDate(log.nextFollowUpDate)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </ModalDialog>
  );
}

export function StudentDetailModal({ student, ...props }: StudentDetailModalProps) {
  if (!student) return null;
  return (
    <StudentDetailModalInner
      key={`${student.id}-${props.initialTab ?? "overview"}`}
      student={student}
      {...props}
    />
  );
}
