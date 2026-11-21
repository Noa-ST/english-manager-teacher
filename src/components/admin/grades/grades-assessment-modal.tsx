"use client";

import * as React from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { useTodayIso } from "@/lib/use-today-iso";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

interface GradesAssessmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (title: string, assessments: string[], examDate: string) => void;
}

const TITLE_PRESETS = [
  "Mock Test #4 — Toàn diện 4 kỹ năng",
  "Mid-term Academic Check",
  "Writing Task 2 & Speaking Review",
  "Final Term Assessment",
];

function GradesAssessmentModalInner({
  onClose,
  onCreated,
}: Omit<GradesAssessmentModalProps, "open">) {
  const { toast } = useToast();
  const todayIso = useTodayIso();
  const [title, setTitle] = React.useState("");
  const [examDateOverride, setExamDate] = React.useState<string | null>(null);
  const examDate = examDateOverride ?? todayIso;
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = title.trim();
    if (cleaned.length < 3) {
      toast({
        variant: "warning",
        title: "Tên kỳ kiểm tra phải có ít nhất 3 ký tự",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ assessments: string[] }>("/api/admin/grades", {
        method: "POST",
        body: JSON.stringify({
          action: "create-assessment",
          title: cleaned,
        }),
      });
      toast({
        variant: "success",
        title: "Đã tạo kỳ kiểm tra mới",
        description: `Bảng điểm "${cleaned}" sẵn sàng nhập điểm.`,
      });
      onCreated(cleaned, res.assessments, examDate);
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể tạo kỳ kiểm tra",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
          <span>Mẫu tên nhanh:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TITLE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTitle(preset)}
              className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-grade-assessment-title">
          Tên kỳ kiểm tra / Bài đánh giá *
        </Label>
        <Input
          id="new-grade-assessment-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ví dụ: Mock Test #4 — Quý IV/2026"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-grade-assessment-date">Ngày kiểm tra mặc định</Label>
        <Input
          id="new-grade-assessment-date"
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy bỏ
        </Button>
        <Button type="submit" disabled={submitting}>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {submitting ? "Đang tạo..." : "Tạo bảng điểm"}
        </Button>
      </div>
    </form>
  );
}

export function GradesAssessmentModal({
  open,
  onClose,
  onCreated,
}: GradesAssessmentModalProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Tạo kỳ kiểm tra / đánh giá mới"
      description="Các học viên chưa có điểm ở kỳ mới sẽ để trống (Chưa chấm), tuyệt đối không tự điền điểm giả."
      size="md"
    >
      {open && (
        <GradesAssessmentModalInner
          key="create-assessment"
          onClose={onClose}
          onCreated={onCreated}
        />
      )}
    </ModalDialog>
  );
}
