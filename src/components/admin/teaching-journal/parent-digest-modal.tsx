"use client";

import * as React from "react";
import { Check, Copy, Lock } from "lucide-react";

import type { ClassSessionRecord } from "@/services/classroom-data";
import { buildParentSessionDigest } from "@/services/teaching-journal-helpers";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface ParentDigestModalProps {
  session: ClassSessionRecord | null;
  onClose: () => void;
}

function ParentDigestModalInner({
  session,
  onClose,
}: {
  session: ClassSessionRecord;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [content, setContent] = React.useState(() =>
    buildParentSessionDigest(session),
  );
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({
        variant: "success",
        title: "Đã sao chép bản tin gửi Phụ huynh",
        description: "Bạn có thể dán trực tiếp vào Zalo hoặc Email nhóm lớp.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: "error",
        title: "Không thể tự động sao chép",
        description: "Vui lòng chọn nội dung trong ô văn bản và nhấn Ctrl+C.",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
        <span>
          Bản tin tự động tổng hợp chuyên đề, chuyên cần, BTVN và nhận xét công khai;{" "}
          <strong>đã ẩn hoàn toàn</strong> Ghi chú nội bộ giáo viên và Theo dõi nội bộ.
        </span>
      </div>

      <textarea
        rows={14}
        value={content}
        onChange={(e) => setContent(e.target.value)}
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
              Sao chép gửi Zalo / Email
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function ParentDigestModal({ session, onClose }: ParentDigestModalProps) {
  return (
    <ModalDialog
      open={Boolean(session)}
      onClose={onClose}
      title="Bản tin Tổng kết Buổi học (Gửi Phụ huynh)"
      description={
        session
          ? `${session.classCode} — ${session.topic}`
          : undefined
      }
      size="lg"
    >
      {session && (
        <ParentDigestModalInner
          key={session.id}
          session={session}
          onClose={onClose}
        />
      )}
    </ModalDialog>
  );
}
