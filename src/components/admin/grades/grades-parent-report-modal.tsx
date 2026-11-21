"use client";

import * as React from "react";
import { Check, Copy, Lock } from "lucide-react";

import { buildGradeParentReport } from "@/services/grade-helpers";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface GradesParentReportModalProps {
  open: boolean;
  assessmentTitle: string;
  date?: string;
  classLabel?: string;
  entries: Array<{
    code: string;
    fullName: string;
    className: string;
    listening: number;
    reading: number;
    writing: number;
    speaking: number;
    overall: number;
    comment: string;
    delta?: number | null;
  }>;
  onClose: () => void;
}

function GradesParentReportInner({
  assessmentTitle,
  date,
  classLabel,
  entries,
  onClose,
}: Omit<GradesParentReportModalProps, "open">) {
  const { toast } = useToast();
  const [content, setContent] = React.useState(() =>
    buildGradeParentReport({
      assessmentTitle,
      date,
      classLabel,
      entries,
    }),
  );
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({
        variant: "success",
        title: "Đã sao chép phiếu báo điểm",
        description: "Bạn có thể dán trực tiếp vào Zalo hoặc Email Phụ huynh.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: "error",
        title: "Không thể sao chép tự động",
        description: "Vui lòng chọn nội dung văn bản và nhấn Ctrl+C.",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
        <span>
          Báo cáo tổng hợp điểm 4 kỹ năng, Overall và nhận xét công khai;{" "}
          <strong>đã ẩn hoàn toàn</strong> Ghi chú nội bộ của giáo viên.
        </span>
      </div>

      <textarea
        rows={14}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full rounded-xl border border-input bg-background p-3 font-mono text-xs leading-relaxed text-foreground"
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Đóng
        </Button>
        <Button type="button" onClick={() => void handleCopy()}>
          {copied ? (
            <>
              <Check className="size-4" aria-hidden="true" />
              Đã sao chép
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" />
              Sao chép gửi Zalo / Email
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function GradesParentReportModal({
  open,
  assessmentTitle,
  date,
  classLabel,
  entries,
  onClose,
}: GradesParentReportModalProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={
        entries.length === 1
          ? `Phiếu báo điểm: ${entries[0].fullName}`
          : `Báo cáo điểm kỳ: ${assessmentTitle}`
      }
      description="Kiểm tra hoặc tinh chỉnh câu chữ trước khi gửi tới Phụ huynh."
      size="lg"
    >
      {open && (
        <GradesParentReportInner
          key={`${assessmentTitle}-${entries.map((e) => e.code).join(",")}`}
          assessmentTitle={assessmentTitle}
          date={date}
          classLabel={classLabel}
          entries={entries}
          onClose={onClose}
        />
      )}
    </ModalDialog>
  );
}
