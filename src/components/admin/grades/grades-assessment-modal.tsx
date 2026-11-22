"use client";

import * as React from "react";
import { Building2, CheckCircle2, Globe2, Sparkles } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { useTodayIso } from "@/lib/use-today-iso";
import type { ClassroomGroup } from "@/services/classroom-data";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

interface GradesAssessmentModalProps {
  open: boolean;
  classes: ClassroomGroup[];
  defaultClassId?: string;
  onClose: () => void;
  onCreated: (
    title: string,
    assessments: string[],
    examDate: string,
    scopeClassId: string,
  ) => void;
}

const TITLE_PRESETS = [
  "Mock Test #4 — Toàn diện 4 kỹ năng",
  "Mid-term Academic Check",
  "Writing Task 2 & Speaking Review",
  "Final Term Assessment",
];

function GradesAssessmentModalInner({
  classes,
  defaultClassId = "all",
  onClose,
  onCreated,
}: Omit<GradesAssessmentModalProps, "open">) {
  const { toast } = useToast();
  const todayIso = useTodayIso();
  const [title, setTitle] = React.useState("");
  const [scopeClassId, setScopeClassId] = React.useState<string>(defaultClassId);
  const [examDateOverride, setExamDate] = React.useState<string | null>(null);
  const examDate = examDateOverride ?? todayIso;
  const [submitting, setSubmitting] = React.useState(false);

  const activeClasses = React.useMemo(
    () => classes.filter((c) => c.status !== "archived"),
    [classes],
  );

  const selectedClass = activeClasses.find((c) => c.id === scopeClassId);

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
          classId: scopeClassId === "all" ? null : scopeClassId,
          date: examDate,
        }),
      });
      toast({
        variant: "success",
        title: "Đã tạo kỳ kiểm tra mới",
        description: selectedClass
          ? `Bảng điểm "${cleaned}" áp dụng riêng cho lớp ${selectedClass.code} — ${selectedClass.name}.`
          : `Bảng điểm "${cleaned}" áp dụng chung cho tất cả các lớp.`,
      });
      onCreated(cleaned, res.assessments, examDate, scopeClassId);
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
      {/* Scope selector */}
      <div className="space-y-1.5">
        <Label htmlFor="new-grade-assessment-scope">
          Phạm vi áp dụng (Lớp học) *
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setScopeClassId("all")}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
              scopeClassId === "all"
                ? "border-primary bg-primary/8 font-semibold text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <Globe2 className="size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="leading-tight">Tất cả các lớp</p>
              <p className="text-[10px] font-normal opacity-80">Kỳ thi chung trung tâm</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              if (scopeClassId === "all") {
                setScopeClassId(activeClasses[0]?.id ?? "all");
              }
            }}
            disabled={activeClasses.length === 0}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
              scopeClassId !== "all"
                ? "border-primary bg-primary/8 font-semibold text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <Building2 className="size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="leading-tight">Riêng 1 lớp cụ thể</p>
              <p className="text-[10px] font-normal opacity-80">Chỉ hiện ở lớp đã chọn</p>
            </div>
          </button>
        </div>

        {scopeClassId !== "all" && (
          <select
            id="new-grade-assessment-scope"
            value={scopeClassId}
            onChange={(e) => setScopeClassId(e.target.value)}
            className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            {activeClasses.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.code} — {cls.name} ({cls.enrolled} HV)
              </option>
            ))}
          </select>
        )}
      </div>

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
  classes,
  defaultClassId,
  onClose,
  onCreated,
}: GradesAssessmentModalProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Tạo kỳ kiểm tra / đánh giá mới"
      description="Chọn phạm vi áp dụng (toàn trung tâm hoặc riêng 1 lớp). Các học viên chưa có điểm sẽ để trống (Chưa chấm)."
      size="md"
    >
      {open && (
        <GradesAssessmentModalInner
          key={`create-assessment-${defaultClassId ?? "all"}`}
          classes={classes}
          defaultClassId={defaultClassId}
          onClose={onClose}
          onCreated={onCreated}
        />
      )}
    </ModalDialog>
  );
}
