"use client";

import * as React from "react";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import type { AdminStudentRecord, ClassroomGroup } from "@/services/classroom-data";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface StudentBulkTransferModalProps {
  open: boolean;
  onClose: () => void;
  selectedStudents: AdminStudentRecord[];
  classes: ClassroomGroup[];
  onTransferred: () => void;
}

export function StudentBulkTransferModal({
  open,
  onClose,
  selectedStudents,
  classes,
  onTransferred,
}: StudentBulkTransferModalProps) {
  const { toast } = useToast();
  const [targetClassId, setTargetClassId] = React.useState("");
  const [reason, setReason] = React.useState("Chuyển lớp / Lên khóa cuối kỳ");
  const [submitting, setSubmitting] = React.useState(false);

  const activeClasses = React.useMemo(
    () => classes.filter((c) => c.status !== "archived"),
    [classes],
  );

  const selectedTargetClassId = targetClassId || activeClasses[0]?.id || "";
  const targetClass = activeClasses.find((c) => c.id === selectedTargetClassId);
  const incomingCount = selectedStudents.filter(
    (s) => s.classId !== selectedTargetClassId && s.status !== "archived",
  ).length;
  const currentEnrolled = targetClass?.enrolled ?? 0;
  const capacity = targetClass?.capacity ?? 0;
  const availableSlots = Math.max(0, capacity - currentEnrolled);
  const exceedsCapacity = Boolean(targetClass && incomingCount > availableSlots);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClass || selectedStudents.length === 0 || exceedsCapacity) return;

    setSubmitting(true);
    try {
      const res = await apiRequest<{
        transferredCount: number;
        transferredIds: string[];
      }>("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          action: "batch-transfer",
          studentIds: selectedStudents.map((s) => s.id),
          targetClassId: targetClass.id,
          reason: reason.trim() || "Chuyển lớp hàng loạt",
        }),
      });

      toast({
        title: "Đã chuyển lớp hàng loạt",
        description: `Đã chuyển ${res.transferredCount} học sinh sang lớp ${targetClass.code} — ${targetClass.name}.`,
        variant: "success",
      });
      onTransferred();
      onClose();
    } catch (err) {
      toast({
        title: "Không thể chuyển lớp hàng loạt",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={`Chuyển lớp hàng loạt (${selectedStudents.length} học sinh)`}
      description="Điều chuyển học sinh sang lớp mới / khóa tiếp theo. Hệ thống tự động kiểm tra sức chứa và ghi lịch sử chuyển lớp."
      size="md"
    >
      <form onSubmit={handleConfirm} className="space-y-4 text-xs">
        <div className="space-y-1.5">
          <label htmlFor="bulk-target-class" className="block font-semibold text-foreground">
            Chọn lớp học đích
          </label>
          <select
            id="bulk-target-class"
            value={selectedTargetClassId}
            onChange={(e) => setTargetClassId(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            {activeClasses.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.code} — {cls.name} (Sĩ số: {cls.enrolled}/{cls.capacity} · Còn trống{" "}
                {Math.max(0, cls.capacity - cls.enrolled)})
              </option>
            ))}
          </select>
        </div>

        {targetClass && (
          <div
            className={`rounded-xl border p-3 ${
              exceedsCapacity
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted/30 text-foreground"
            }`}
          >
            <p className="font-semibold">
              Cần tiếp nhận mới: {incomingCount} học sinh · Chỗ trống còn lại:{" "}
              {availableSlots} chỗ
            </p>
            {exceedsCapacity && (
              <p className="mt-1 flex items-center gap-1.5 text-[11px]">
                <AlertTriangle className="size-3.5 shrink-0" />
                Lớp đích không đủ chỗ trống. Hãy tăng sĩ số tối đa của lớp hoặc bỏ chọn bớt học sinh.
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="bulk-transfer-reason" className="block font-semibold text-foreground">
            Lý do / Ghi chú chuyển lớp
          </label>
          <Input
            id="bulk-transfer-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Lên khóa IELTS Intensive kỳ mới"
          />
        </div>

        <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-background p-2.5">
          <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
            Danh sách học sinh được chọn ({selectedStudents.length}):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selectedStudents.map((stu) => (
              <span
                key={stu.id}
                className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px]"
              >
                {stu.code} · {stu.fullName}
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button
            type="submit"
            disabled={submitting || !targetClass || exceedsCapacity || incomingCount === 0}
          >
            <ArrowRightLeft className="size-3.5" />
            {submitting ? "Đang chuyển..." : "Xác nhận chuyển lớp"}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
