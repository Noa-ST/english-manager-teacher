"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Lock, ShieldCheck, UserCheck } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import type { AdminStudentRecord, ClassroomGroup } from "@/services/classroom-data";
import { toInputDateFormat } from "@/services/student-helpers";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface StudentFormModalProps {
  open: boolean;
  onClose: () => void;
  editingStudent: AdminStudentRecord | null;
  classes: ClassroomGroup[];
  students: AdminStudentRecord[];
  defaultClassFilter: string;
  onSaved: (student: AdminStudentRecord, isEdit: boolean) => void;
  onAccountProvisioned?: () => void;
}

function computeInitialFormValues(
  editingStudent: AdminStudentRecord | null,
  classes: ClassroomGroup[],
  students: AdminStudentRecord[],
  defaultClassFilter: string,
) {
  if (editingStudent) {
    const targetClass = classes.find((c) => c.id === editingStudent.classId);
    return {
      code: editingStudent.code,
      fullName: editingStudent.fullName,
      classId: editingStudent.classId,
      joinedAt: toInputDateFormat(editingStudent.joinedAt),
      status: editingStudent.status,
      leaveStartDate: editingStudent.leaveStartDate || toInputDateFormat(),
      leaveReturnDate: editingStudent.leaveReturnDate || "",
      leaveReason: editingStudent.leaveReason || "",
      tuitionStatus: editingStudent.tuitionStatus,
      tuitionDueDate:
        editingStudent.tuitionDueDate || targetClass?.tuitionDueDate || "2026-11-20",
      tuitionAmount: editingStudent.tuitionAmount || "5.800.000 ₫",
      goal: editingStudent.targetGoal || "",
      entryBand:
        editingStudent.entryBand !== undefined ? String(editingStudent.entryBand) : "",
      parentName: editingStudent.parentName || "",
      parentRelation: editingStudent.parentRelation || "",
      parentPhone: editingStudent.parentPhone || "",
      parentEmail: editingStudent.parentEmail || "",
      parentNote: editingStudent.parentNote || "",
      comment: editingStudent.recentComment || "",
      privateNote: editingStudent.privateNote || "",
    };
  }

  let nextNum = students.length + 1;
  let candidateCode = `HS-2026-${String(nextNum).padStart(2, "0")}`;
  while (students.some((s) => s.code.toUpperCase() === candidateCode)) {
    nextNum += 1;
    candidateCode = `HS-2026-${String(nextNum).padStart(2, "0")}`;
  }

  const todayStr = toInputDateFormat();
  const defaultClassId =
    defaultClassFilter !== "all" && classes.some((c) => c.id === defaultClassFilter)
      ? defaultClassFilter
      : (classes[0]?.id ?? "cls-ii-01");
  const targetClass = classes.find((c) => c.id === defaultClassId);

  return {
    code: candidateCode,
    fullName: "",
    classId: defaultClassId,
    joinedAt: todayStr,
    status: "active" as AdminStudentRecord["status"],
    leaveStartDate: todayStr,
    leaveReturnDate: "",
    leaveReason: "",
    tuitionStatus: "due-soon" as AdminStudentRecord["tuitionStatus"],
    tuitionDueDate: targetClass?.tuitionDueDate || "2026-11-20",
    tuitionAmount: "5.800.000 ₫",
    goal: "Đạt mục tiêu khóa học",
    entryBand: "",
    parentName: "",
    parentRelation: "",
    parentPhone: "",
    parentEmail: "",
    parentNote: "",
    comment: "",
    privateNote: "",
  };
}

function StudentFormModalInner({
  onClose,
  editingStudent,
  classes,
  students,
  defaultClassFilter,
  onSaved,
  onAccountProvisioned,
}: Omit<StudentFormModalProps, "open">) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);

  const initial = React.useMemo(
    () => computeInitialFormValues(editingStudent, classes, students, defaultClassFilter),
    // Computed once per modal mount via key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Core & lifecycle
  const [formCode, setFormCode] = React.useState(initial.code);
  const [formName, setFormName] = React.useState(initial.fullName);
  const [formClassId, setFormClassId] = React.useState(initial.classId);
  const [formJoinedAt, setFormJoinedAt] = React.useState(initial.joinedAt);
  const [formStatus, setFormStatus] = React.useState<AdminStudentRecord["status"]>(
    initial.status,
  );
  const [formLeaveStartDate, setFormLeaveStartDate] = React.useState(initial.leaveStartDate);
  const [formLeaveReturnDate, setFormLeaveReturnDate] = React.useState(
    initial.leaveReturnDate,
  );
  const [formLeaveReason, setFormLeaveReason] = React.useState(initial.leaveReason);
  const [formTransferReason, setFormTransferReason] = React.useState("");

  // Tuition & Academic
  const [formTuitionStatus, setFormTuitionStatus] = React.useState<
    AdminStudentRecord["tuitionStatus"]
  >(initial.tuitionStatus);
  const [formTuitionDueDate, setFormTuitionDueDate] = React.useState(
    initial.tuitionDueDate,
  );
  const [formTuitionAmount, setFormTuitionAmount] = React.useState(initial.tuitionAmount);
  const [formGoal, setFormGoal] = React.useState(initial.goal);
  const [formEntryBand, setFormEntryBand] = React.useState(initial.entryBand);

  // Parent CRM
  const [formParentName, setFormParentName] = React.useState(initial.parentName);
  const [formParentRelation, setFormParentRelation] = React.useState(
    initial.parentRelation,
  );
  const [formParentPhone, setFormParentPhone] = React.useState(initial.parentPhone);
  const [formParentEmail, setFormParentEmail] = React.useState(initial.parentEmail);
  const [formParentNote, setFormParentNote] = React.useState(initial.parentNote);

  // Comments
  const [formComment, setFormComment] = React.useState(initial.comment);
  const [formPrivateNote, setFormPrivateNote] = React.useState(initial.privateNote);

  // Optional Portal account provisioning on create
  const [provisionAccount, setProvisionAccount] = React.useState(false);
  const [portalEmail, setPortalEmail] = React.useState("");
  const [portalPassword, setPortalPassword] = React.useState("");

  const currentSelectedClass = classes.find((c) => c.id === formClassId);
  const isClassChanged = Boolean(editingStudent && editingStudent.classId !== formClassId);
  const isSelectedClassFull = Boolean(
    currentSelectedClass &&
      currentSelectedClass.enrolled >= currentSelectedClass.capacity &&
      !(editingStudent && editingStudent.classId === formClassId),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập họ và tên học sinh.",
        variant: "error",
      });
      return;
    }

    const normalizedCode = formCode.trim().toUpperCase();
    if (!normalizedCode) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập mã định danh học sinh.",
        variant: "error",
      });
      return;
    }

    if (!editingStudent && provisionAccount) {
      if (!portalEmail.trim() || portalPassword.length < 8) {
        toast({
          title: "Thông tin tài khoản Portal chưa hợp lệ",
          description: "Vui lòng nhập email hợp lệ và mật khẩu tối thiểu 8 ký tự.",
          variant: "error",
        });
        return;
      }
    }

    if (isSelectedClassFull && currentSelectedClass && formStatus !== "archived") {
      toast({
        title: "Lớp học đã đủ sĩ số",
        description: `Lớp "${currentSelectedClass.code} — ${currentSelectedClass.name}" đã đủ sĩ số tối đa (${currentSelectedClass.enrolled}/${currentSelectedClass.capacity} học viên).`,
        variant: "error",
      });
      return;
    }

    const payload = {
      code: normalizedCode,
      fullName: formName.trim(),
      classId: currentSelectedClass?.id ?? formClassId,
      status: formStatus,
      joinedAt: formJoinedAt,
      targetGoal: formGoal.trim() || "Đạt mục tiêu khóa học",
      entryBand: formEntryBand.trim() ? Number(formEntryBand) : undefined,
      tuitionStatus: formTuitionStatus,
      tuitionDueDate: formTuitionDueDate,
      tuitionAmount: formTuitionAmount.trim() || "5.800.000 ₫",
      parentName: formParentName.trim(),
      parentRelation: formParentRelation.trim(),
      parentPhone: formParentPhone.trim(),
      parentEmail: formParentEmail.trim(),
      parentNote: formParentNote.trim(),
      recentComment: formComment.trim(),
      privateNote: formPrivateNote.trim(),
      ...(formStatus === "on-leave"
        ? {
            leaveStartDate: formLeaveStartDate || undefined,
            leaveReturnDate: formLeaveReturnDate || undefined,
            leaveReason: formLeaveReason.trim() || undefined,
          }
        : {}),
      ...(isClassChanged && formTransferReason.trim()
        ? { transferReason: formTransferReason.trim() }
        : {}),
    };

    setSubmitting(true);
    try {
      if (editingStudent) {
        const updated = await apiRequest<AdminStudentRecord>(
          `/api/admin/students/${encodeURIComponent(editingStudent.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
        toast({
          title: "Đã cập nhật hồ sơ học sinh",
          description: `Thông tin của ${updated.fullName} (${updated.code}) đã được lưu.`,
          variant: "success",
        });
        onSaved(updated, true);
        onClose();
      } else {
        const created = await apiRequest<AdminStudentRecord>("/api/admin/students", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        let accountNote = "";
        if (provisionAccount) {
          try {
            await apiRequest("/api/admin/accounts", {
              method: "POST",
              body: JSON.stringify({
                studentId: created.id,
                email: portalEmail.trim().toLowerCase(),
                password: portalPassword,
              }),
            });
            accountNote = ` Tài khoản ${portalEmail.trim()} đã được kích hoạt.`;
            onAccountProvisioned?.();
          } catch (accErr) {
            toast({
              title: "Đã tạo hồ sơ, nhưng cấp tài khoản thất bại",
              description:
                accErr instanceof Error
                  ? accErr.message
                  : "Bạn có thể cấp lại tài khoản trong Tab Tài khoản của hồ sơ.",
              variant: "error",
            });
          }
        }

        toast({
          title: "Đã thêm học sinh mới",
          description: `Học sinh ${created.fullName} (${created.code}) đã được lưu.${accountNote}`,
          variant: "success",
        });
        onSaved(created, false);
        onClose();
      }
    } catch (err) {
      toast({
        title: editingStudent ? "Không thể cập nhật hồ sơ" : "Không thể tạo hồ sơ học sinh",
        description:
          err instanceof Error ? err.message : "Đã có lỗi xảy ra khi lưu dữ liệu.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={editingStudent ? "Cập nhật hồ sơ học sinh" : "Thêm hồ sơ học sinh mới"}
      description="Thông tin học sinh, phụ huynh và ghi chú nội bộ được quản lý tập trung; dữ liệu riêng tư được ẩn khỏi Cổng học sinh."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Nhóm 1: Định danh, Lớp học & Vòng đời */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <p className="font-heading text-xs font-bold uppercase tracking-wider text-primary">
            1. Định danh, Lớp học &amp; Vòng đời
          </p>

          <div className="grid gap-3.5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="stu-form-code" className="block text-xs font-semibold text-foreground">
                Mã định danh HS
              </label>
              <Input
                id="stu-form-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                required
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="stu-form-name" className="block text-xs font-semibold text-foreground">
                Họ và tên học sinh
              </label>
              <Input
                id="stu-form-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nhập họ và tên đầy đủ"
                required
              />
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="stu-form-class" className="block text-xs font-semibold text-foreground">
                Phân lớp học
              </label>
              <select
                id="stu-form-class"
                value={formClassId}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  setFormClassId(selectedId);
                  const targetCls = classes.find((c) => c.id === selectedId);
                  if (targetCls?.tuitionDueDate) {
                    setFormTuitionDueDate(targetCls.tuitionDueDate);
                  }
                }}
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {classes.map((cls) => {
                  const isFull = cls.enrolled >= cls.capacity;
                  const isCurrent = editingStudent && editingStudent.classId === cls.id;
                  return (
                    <option key={cls.id} value={cls.id} disabled={isFull && !isCurrent}>
                      {cls.code} — {cls.name} ({cls.enrolled}/{cls.capacity} HV
                      {isFull ? " · Đã đầy" : ""})
                    </option>
                  );
                })}
              </select>
              {isSelectedClassFull && currentSelectedClass && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-destructive">
                  <AlertTriangle className="size-3 shrink-0" />
                  Lớp học đã đạt sĩ số tối đa ({currentSelectedClass.capacity}/
                  {currentSelectedClass.capacity}).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="stu-form-joined" className="block text-xs font-semibold text-foreground">
                Ngày nhập học
              </label>
              <Input
                type="date"
                id="stu-form-joined"
                value={formJoinedAt}
                onChange={(e) => setFormJoinedAt(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="stu-form-status" className="block text-xs font-semibold text-foreground">
                Tình trạng học vụ
              </label>
              <select
                id="stu-form-status"
                value={formStatus}
                onChange={(e) =>
                  setFormStatus(e.target.value as AdminStudentRecord["status"])
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="active">Đang theo học chính thức</option>
                <option value="trial">Học thử (Trial)</option>
                <option value="on-leave">Đang bảo lưu (On-leave)</option>
                {editingStudent?.status === "archived" && (
                  <option value="archived">Đã lưu trữ</option>
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="stu-form-entry-band" className="block text-xs font-semibold text-foreground">
                Điểm đầu vào (tuỳ chọn)
              </label>
              <Input
                id="stu-form-entry-band"
                type="number"
                step="0.5"
                min="0"
                max="9"
                value={formEntryBand}
                onChange={(e) => setFormEntryBand(e.target.value)}
                placeholder="VD: 5.5"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="stu-form-goal" className="block text-xs font-semibold text-foreground">
                Mục tiêu đầu ra
              </label>
              <Input
                id="stu-form-goal"
                value={formGoal}
                onChange={(e) => setFormGoal(e.target.value)}
                required
              />
            </div>
          </div>

          {formStatus === "on-leave" && (
            <div className="grid gap-3 rounded-lg border border-amber-300/70 bg-amber-500/5 p-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="stu-leave-start" className="block text-[11px] font-semibold text-amber-900">
                  Bảo lưu từ ngày
                </label>
                <Input
                  id="stu-leave-start"
                  type="date"
                  value={formLeaveStartDate}
                  onChange={(e) => setFormLeaveStartDate(e.target.value)}
                  className="h-8 bg-background text-xs"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="stu-leave-return" className="block text-[11px] font-semibold text-amber-900">
                  Dự kiến quay lại
                </label>
                <Input
                  id="stu-leave-return"
                  type="date"
                  value={formLeaveReturnDate}
                  onChange={(e) => setFormLeaveReturnDate(e.target.value)}
                  className="h-8 bg-background text-xs"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="stu-leave-reason" className="block text-[11px] font-semibold text-amber-900">
                  Lý do bảo lưu
                </label>
                <Input
                  id="stu-leave-reason"
                  value={formLeaveReason}
                  onChange={(e) => setFormLeaveReason(e.target.value)}
                  placeholder="VD: Ôn thi HK trường"
                  className="h-8 bg-background text-xs"
                />
              </div>
            </div>
          )}

          {isClassChanged && (
            <div className="space-y-1 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <label htmlFor="stu-transfer-reason" className="block text-[11px] font-semibold text-primary">
                Lý do chuyển lớp (lưu vào Lịch sử chuyển lớp)
              </label>
              <Input
                id="stu-transfer-reason"
                value={formTransferReason}
                onChange={(e) => setFormTransferReason(e.target.value)}
                placeholder="VD: Lên band sau kiểm tra định kỳ / Đổi ca học phù hợp lịch trường"
                className="h-8 bg-background text-xs"
              />
            </div>
          )}
        </div>

        {/* Nhóm 2: Học phí */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="font-heading text-xs font-bold uppercase tracking-wider text-primary">
            2. Học phí &amp; Hạn nộp
          </p>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="stu-form-tuition" className="block text-xs font-semibold text-foreground">
                Trạng thái học phí
              </label>
              <select
                id="stu-form-tuition"
                value={formTuitionStatus}
                onChange={(e) =>
                  setFormTuitionStatus(e.target.value as AdminStudentRecord["tuitionStatus"])
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="paid">Đã hoàn thành</option>
                <option value="due-soon">Sắp đến hạn</option>
                <option value="overdue">Quá hạn thanh toán</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="stu-form-tuition-date" className="block text-xs font-semibold text-foreground">
                Ngày nộp học phí (Hạn lớp)
              </label>
              <Input
                type="date"
                id="stu-form-tuition-date"
                value={toInputDateFormat(formTuitionDueDate)}
                onChange={(e) => setFormTuitionDueDate(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="stu-form-tuition-amount" className="block text-xs font-semibold text-foreground">
                Mức học phí kỳ
              </label>
              <Input
                id="stu-form-tuition-amount"
                value={formTuitionAmount}
                onChange={(e) => setFormTuitionAmount(e.target.value)}
                placeholder="5.800.000 ₫"
              />
            </div>
          </div>
        </div>

        {/* Nhóm 3: Thông tin Phụ huynh (CRM) */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="font-heading text-xs font-bold uppercase tracking-wider text-primary">
                3. Thông tin Liên hệ Phụ huynh
              </p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Không bắt buộc
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <UserCheck className="size-3.5 text-emerald-600" />
              SĐT đầy đủ chỉ hiển thị cho Giáo viên
            </span>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="stu-parent-name" className="block text-xs font-semibold text-foreground">
                Họ tên phụ huynh
              </label>
              <Input
                id="stu-parent-name"
                value={formParentName}
                onChange={(e) => setFormParentName(e.target.value)}
                placeholder="VD: Cô Thu Hà"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="stu-parent-rel" className="block text-xs font-semibold text-foreground">
                Xưng hô / Quan hệ
              </label>
              <Input
                id="stu-parent-rel"
                value={formParentRelation}
                onChange={(e) => setFormParentRelation(e.target.value)}
                placeholder="VD: Phụ huynh: Cô Thu Hà (Mẹ)"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="stu-parent-phone" className="block text-xs font-semibold text-foreground">
                Số điện thoại / Zalo
              </label>
              <Input
                id="stu-parent-phone"
                value={formParentPhone}
                onChange={(e) => setFormParentPhone(e.target.value)}
                placeholder="0903 555 812"
              />
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="stu-parent-email" className="block text-xs font-semibold text-foreground">
                Email phụ huynh
              </label>
              <Input
                id="stu-parent-email"
                type="email"
                value={formParentEmail}
                onChange={(e) => setFormParentEmail(e.target.value)}
                placeholder="phuhuynh@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="stu-parent-note" className="block text-xs font-semibold text-foreground">
                Lưu ý liên hệ gia đình
              </label>
              <Input
                id="stu-parent-note"
                value={formParentNote}
                onChange={(e) => setFormParentNote(e.target.value)}
                placeholder="VD: Gọi sau 19h / Nhắn Zalo trước"
              />
            </div>
          </div>
        </div>

        {/* Nhóm 4: Nhận xét công khai & Ghi chú nội bộ */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="stu-form-comment" className="block text-xs font-semibold text-foreground">
              Nhận xét học tập (hiển thị Cổng học sinh)
            </label>
            <textarea
              id="stu-form-comment"
              rows={3}
              value={formComment}
              onChange={(e) => setFormComment(e.target.value)}
              placeholder="Nhận xét định kỳ gửi tới học sinh & phụ huynh..."
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="stu-form-private-note"
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
            >
              <Lock className="size-3.5 text-amber-600" />
              Ghi chú nội bộ (chỉ giáo viên thấy)
            </label>
            <textarea
              id="stu-form-private-note"
              rows={3}
              value={formPrivateNote}
              onChange={(e) => setFormPrivateNote(e.target.value)}
              placeholder="Ghi chú riêng về tâm lý học tập, điểm cần lưu ý khi kèm trên lớp..."
              className="w-full rounded-xl border border-amber-300/70 bg-amber-500/5 p-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        {/* Tùy chọn cấp tài khoản Portal ngay khi tạo mới */}
        {!editingStudent && (
          <div className="rounded-xl border border-border bg-warm/30 p-3.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
              <input
                type="checkbox"
                checked={provisionAccount}
                onChange={(e) => setProvisionAccount(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              <KeyRound className="size-3.5 text-primary" />
              Đồng thời cấp tài khoản đăng nhập Cổng học sinh (Email &amp; Mật khẩu)
            </label>

            {provisionAccount && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="stu-portal-email" className="block text-[11px] font-semibold">
                    Email đăng nhập học sinh
                  </label>
                  <Input
                    id="stu-portal-email"
                    type="email"
                    value={portalEmail}
                    onChange={(e) => setPortalEmail(e.target.value)}
                    placeholder="hocsinh@englishmanager.edu.vn"
                    required={provisionAccount}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="stu-portal-pass" className="block text-[11px] font-semibold">
                    Mật khẩu khởi tạo (≥ 8 ký tự)
                  </label>
                  <Input
                    id="stu-portal-pass"
                    type="text"
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder="Nhập mật khẩu ban đầu..."
                    required={provisionAccount}
                    minLength={8}
                  />
                </div>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground sm:col-span-2">
                  <ShieldCheck className="size-3.5 text-emerald-600" />
                  Tài khoản được liên kết 1:1 với hồ sơ {formCode}, chỉ xem được điểm và lịch học của chính em.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitting}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {submitting
              ? "Đang lưu..."
              : editingStudent
                ? "Lưu thay đổi"
                : "Tạo hồ sơ"}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}

export function StudentFormModal({ open, ...props }: StudentFormModalProps) {
  if (!open) return null;
  return (
    <StudentFormModalInner
      key={props.editingStudent?.id ?? `new-${props.defaultClassFilter}`}
      {...props}
    />
  );
}
