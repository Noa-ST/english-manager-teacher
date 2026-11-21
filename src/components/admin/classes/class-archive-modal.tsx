"use client";

import * as React from "react";
import { AlertTriangle, ArrowRightLeft, Trash2, Users } from "lucide-react";

import type { AdminStudentRecord, ClassroomGroup } from "@/services/classroom-data";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";

interface ClassArchiveModalProps {
  targetClass: ClassroomGroup | null;
  activeStudentsInClass: AdminStudentRecord[];
  onClose: () => void;
  onConfirmArchive: (cls: ClassroomGroup) => Promise<void>;
  onOpenBulkTransfer: (cls: ClassroomGroup, students: AdminStudentRecord[]) => void;
}

export function ClassArchiveModal({
  targetClass,
  activeStudentsInClass,
  onClose,
  onConfirmArchive,
  onOpenBulkTransfer,
}: ClassArchiveModalProps) {
  const [submitting, setSubmitting] = React.useState(false);

  if (!targetClass) return null;

  const hasStudents = activeStudentsInClass.length > 0;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirmArchive(targetClass);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open
      onClose={onClose}
      title="Xác nhận lưu trữ lớp học"
      description={`Lớp ${targetClass.code} — ${targetClass.name}`}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          {hasStudents ? (
            <Button
              onClick={() => {
                onClose();
                onOpenBulkTransfer(targetClass, activeStudentsInClass);
              }}
            >
              <ArrowRightLeft className="size-3.5" aria-hidden="true" />
              Chuyển {activeStudentsInClass.length} học viên ngay
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={submitting}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {submitting ? "Đang lưu trữ..." : "Lưu trữ lớp"}
            </Button>
          )}
        </div>
      }
    >
      {hasStudents ? (
        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-500/10 p-3.5 text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div className="space-y-1">
              <p className="font-semibold">
                Lớp đang có {activeStudentsInClass.length} học viên hoạt động
              </p>
              <p className="opacity-90">
                Hệ thống yêu cầu điều chuyển hoặc lưu trữ toàn bộ học viên trước khi lưu trữ lớp để không làm mất liên kết hồ sơ.
              </p>
            </div>
          </div>

          <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Users className="size-3" />
              Học viên cần chuyển lớp ({activeStudentsInClass.length}):
            </p>
            {activeStudentsInClass.map((s) => (
              <p key={s.id} className="text-[11px] text-foreground">
                • <span className="font-mono text-muted-foreground">{s.code}</span> ·{" "}
                {s.fullName}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Lớp <strong>{targetClass.code}</strong> sẽ được chuyển sang trạng thái lưu trữ và giải phóng lịch dạy trên Thời khóa biểu. Bạn có thể khôi phục lại bất cứ lúc nào.
        </p>
      )}
    </ModalDialog>
  );
}
