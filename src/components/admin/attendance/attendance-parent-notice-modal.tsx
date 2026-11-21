"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import {
  buildAbsentParentNotice,
  type AttendanceStatusValue,
} from "@/services/attendance-helpers";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface AttendanceParentNoticeModalProps {
  open: boolean;
  classCode: string;
  className: string;
  date: string;
  sessionLabel?: string;
  entries: Array<{
    studentCode: string;
    fullName: string;
    status: AttendanceStatusValue;
    note?: string;
  }>;
  onClose: () => void;
}

function AttendanceParentNoticeInner({
  classCode,
  className,
  date,
  sessionLabel,
  entries,
  onClose,
}: Omit<AttendanceParentNoticeModalProps, "open">) {
  const { toast } = useToast();
  const [text, setText] = React.useState(() =>
    buildAbsentParentNotice({
      classCode,
      className,
      date,
      sessionLabel,
      entries,
    }),
  );
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        variant: "success",
        title: "Đã sao chép thông báo chuyên cần",
        description: "Bạn có thể dán trực tiếp vào Zalo hoặc tin nhắn phụ huynh.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: "error",
        title: "Không thể sao chép tự động",
        description: "Vui lòng chọn nội dung và nhấn Ctrl+C.",
      });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Nội dung tổng hợp tự động danh sách học viên vắng / đi muộn của ca học để báo nhanh cho Phụ huynh.
      </p>
      <textarea
        rows={12}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-xl border border-input bg-background p-3 font-mono text-xs leading-relaxed text-foreground"
      />
      <div className="flex items-center justify-end gap-2 pt-2">
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
              Sao chép gửi Zalo / SMS
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function AttendanceParentNoticeModal({
  open,
  classCode,
  className,
  date,
  sessionLabel,
  entries,
  onClose,
}: AttendanceParentNoticeModalProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Thông báo Chuyên cần gửi Phụ huynh"
      description={`${classCode} · ${className}`}
      size="lg"
    >
      {open && (
        <AttendanceParentNoticeInner
          key={`${classCode}-${date}-${entries.length}`}
          classCode={classCode}
          className={className}
          date={date}
          sessionLabel={sessionLabel}
          entries={entries}
          onClose={onClose}
        />
      )}
    </ModalDialog>
  );
}
