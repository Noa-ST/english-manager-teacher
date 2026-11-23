"use client";

import * as React from "react";
import {
  Award,
  Check,
  Download,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Lock,
  Plus,
  Presentation,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { uploadCurriculumFileDirect } from "@/lib/direct-upload";
import { removeVietnameseTones } from "@/lib/utils";
import { readStoredTeacherBrand } from "@/services/settings-helpers";
import {
  resolveWeekStatus,
  type ClassroomGroup,
  type CurriculumAttachment,
  type CurriculumSkillFocus,
  type CurriculumWeek,
  type MasterCurriculumMaterial,
  type WeekProgressStatus,
} from "@/services/classroom-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const MATERIAL_FORMAT_LABELS: Record<string, string> = {
  PDF: "Tài liệu PDF",
  DOCX: "Văn bản Word (.docx)",
  SLIDE: "Slide bài giảng (.pptx)",
  WORKSHEET: "Phiếu bài tập (.xlsx)",
  IMAGE: "Hình ảnh",
  AUDIO: "Âm thanh Audio",
};

interface WeekProgressModalProps {
  classroom: ClassroomGroup | null;
  week: CurriculumWeek | null;
  onClose: () => void;
  onSaved: (updatedClass: ClassroomGroup) => void;
}

export async function openAttachmentSafely(att: CurriculumAttachment): Promise<void> {
  if (typeof window === "undefined") return;
  if (att.storedFileId && (!att.url || att.url.includes("/api/admin/storage/download-url"))) {
    try {
      const res = await apiRequest<{ url: string }>("/api/admin/storage/download-url", {
        method: "POST",
        body: JSON.stringify({
          fileId: att.storedFileId,
          downloadName: att.name,
        }),
      });
      if (res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
        return;
      }
    } catch {
      // Fallback below
    }
  }
  window.open(att.url, "_blank", "noopener,noreferrer");
}

function WeekProgressModalInner({
  classroom,
  week,
  onClose,
  onSaved,
}: {
  classroom: ClassroomGroup;
  week: CurriculumWeek;
  onClose: () => void;
  onSaved: (updatedClass: ClassroomGroup) => void;
}) {
  const { toast } = useToast();
  const effectiveStatus = resolveWeekStatus(week, classroom.currentWeekIndex);

  const [title, setTitle] = React.useState(week.title || `Bài học tuần ${week.weekNumber}`);
  const [focus, setFocus] = React.useState(week.focus ?? "");
  const [focusSkill, setFocusSkill] = React.useState<CurriculumSkillFocus | "">(
    week.focusSkill ?? "",
  );
  const [status, setStatus] = React.useState<WeekProgressStatus>(week.status ?? effectiveStatus);
  const [scheduledDate, setScheduledDate] = React.useState(week.scheduledDate ?? "");
  const [completedDate, setCompletedDate] = React.useState(week.completedDate ?? "");
  const [plannedSessions, setPlannedSessions] = React.useState(
    String(week.plannedSessions ?? 2),
  );
  const [teacherName, setTeacherName] = React.useState(
    () => week.teacherName ?? readStoredTeacherBrand()?.name ?? "",
  );
  const [notes, setNotes] = React.useState(week.notes ?? "");
  const [homework, setHomework] = React.useState(week.homework ?? "");
  const [homeworkDueDate, setHomeworkDueDate] = React.useState(week.homeworkDueDate ?? "");
  const [isMilestone, setIsMilestone] = React.useState(Boolean(week.isAssessmentMilestone));
  const [assessmentTitle, setAssessmentTitle] = React.useState(week.assessmentTitle ?? "");
  const [attachments, setAttachments] = React.useState<CurriculumAttachment[]>(
    week.attachments ? [...week.attachments] : [],
  );
  const [setAsActive, setSetAsActive] = React.useState(
    week.weekNumber === (classroom.currentWeekIndex ?? 1),
  );
  const [isSaving, setIsSaving] = React.useState(false);

  // Upload & Library Picker
  const [isUploading, setIsUploading] = React.useState(false);
  const [visibilityMode, setVisibilityMode] = React.useState<"private" | "public">("private");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = React.useState(false);
  const [libraryMaterials, setLibraryMaterials] = React.useState<MasterCurriculumMaterial[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = React.useState(false);
  const [librarySearch, setLibrarySearch] = React.useState("");
  const [libraryTypeFilter, setLibraryTypeFilter] = React.useState("all");

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const addedList: CurriculumAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const directUpload = await uploadCurriculumFileDirect(file, visibilityMode);
        const data = await apiRequest<{ attachment: CurriculumAttachment }>(
          "/api/admin/classes/materials",
          {
            method: "POST",
            body: JSON.stringify({
              action: "register-direct",
              classId: classroom.id,
              weekNumber: week.weekNumber,
              directUpload,
            }),
          },
        );
        if (!data?.attachment) {
          throw new Error(`Không thể tải lên tệp "${file.name}".`);
        }
        addedList.push(data.attachment);
      }
      setAttachments((prev) => [...prev, ...addedList]);
      toast({
        title: "Đã tải lên tài liệu chuẩn Storage",
        description: `Đã xác thực chữ ký tệp và lưu ${addedList.length} tài liệu vào Tuần ${week.weekNumber}.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Tải tệp thất bại",
        description: err instanceof Error ? err.message : "Lỗi kiểm tra định dạng tệp.",
        variant: "error",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenLibraryPicker = async () => {
    setIsLibraryOpen(true);
    setIsLoadingLibrary(true);
    try {
      const res = await apiRequest<MasterCurriculumMaterial[]>("/api/admin/classes/materials");
      if (Array.isArray(res)) setLibraryMaterials(res);
    } catch {
      // ignore offline
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleAttachFromLibrary = (item: MasterCurriculumMaterial) => {
    if (
      attachments.some(
        (a) => a.id === item.id || a.name.toLowerCase() === item.name.toLowerCase(),
      )
    ) {
      toast({
        title: "Tài liệu đã có trong tuần",
        description: `"${item.name}" đã được đính kèm vào Tuần ${week.weekNumber}.`,
        variant: "warning",
      });
      return;
    }

    const attachment: CurriculumAttachment = {
      id: item.id,
      name: item.name,
      url: item.url,
      size: item.size,
      sizeBytes: item.sizeBytes,
      type: item.type,
      uploadedAt: item.uploadedAt || "20/11/2026",
      storedFileId: item.storedFileId,
      visibility: item.visibility,
      classId: classroom.id,
      classCode: classroom.code,
      weekNumber: week.weekNumber,
    };
    setAttachments((prev) => [...prev, attachment]);
    toast({
      title: "Đã gán từ Kho học liệu",
      description: `Đã thêm "${item.name}" vào Tuần ${week.weekNumber}.`,
      variant: "success",
    });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await apiRequest<ClassroomGroup>(
        `/api/admin/classes/${encodeURIComponent(classroom.id)}/advance-week`,
        {
          method: "POST",
          body: JSON.stringify({
            targetWeek: week.weekNumber,
            title: title.trim() || week.title,
            focus: focus.trim(),
            ...(focusSkill ? { focusSkill } : {}),
            plannedSessions: Number(plannedSessions) || 2,
            status,
            scheduledDate: scheduledDate.trim() || undefined,
            completedDate: completedDate.trim() || undefined,
            teacherName: teacherName.trim() || undefined,
            notes: notes.trim(),
            homework: homework.trim(),
            homeworkDueDate: homeworkDueDate.trim() || undefined,
            isAssessmentMilestone: isMilestone,
            assessmentTitle: isMilestone ? assessmentTitle.trim() : "",
            attachments,
            setAsActiveWeek: setAsActive,
          }),
        },
      );
      onSaved(updated);
      toast({
        title: "Đã lưu chi tiết học phần tuần",
        description: `Lớp ${classroom.code} — Tuần ${week.weekNumber} đã được cập nhật.`,
        variant: "success",
      });
      onClose();
    } catch (err) {
      toast({
        title: "Lỗi lưu tiến độ tuần",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <ModalDialog
        open
        onClose={onClose}
        title={`Cập nhật Tuần ${week.weekNumber}: ${week.title}`}
        description={`Lớp ${classroom.code} — ${classroom.name}`}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="outline" size="xs" onClick={onClose}>
              Hủy
            </Button>
            <Button type="button" size="xs" disabled={isSaving} onClick={handleSave}>
              <Check className="mr-1 size-3.5" aria-hidden="true" />
              {isSaving ? "Đang lưu..." : "Lưu tiến độ tuần"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="wk-title" className="block font-semibold">
                Tên bài học / Học phần
              </label>
              <Input
                id="wk-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="wk-skill" className="block font-semibold">
                Kỹ năng trọng tâm
              </label>
              <select
                id="wk-skill"
                value={focusSkill}
                onChange={(e) => setFocusSkill(e.target.value as CurriculumSkillFocus | "")}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium"
              >
                <option value="">-- Chung --</option>
                <option value="Listening">Listening</option>
                <option value="Reading">Reading</option>
                <option value="Writing">Writing</option>
                <option value="Speaking">Speaking</option>
                <option value="Grammar-Vocab">Grammar &amp; Vocab</option>
                <option value="Mixed">Tổng hợp 4 KN</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label htmlFor="wk-status" className="block font-semibold">
                Trạng thái tuần
              </label>
              <select
                id="wk-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as WeekProgressStatus)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium"
              >
                <option value="not-started">Chưa học</option>
                <option value="in-progress">Đang học</option>
                <option value="completed">Đã hoàn thành</option>
                <option value="postponed">Tạm hoãn</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="wk-sched" className="block font-semibold">
                Ngày dự kiến
              </label>
              <Input
                id="wk-sched"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="wk-comp" className="block font-semibold">
                Ngày hoàn thành
              </label>
              <Input
                id="wk-comp"
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="wk-sessions" className="block font-semibold">
                Số buổi dự kiến
              </label>
              <Input
                id="wk-sessions"
                type="number"
                min={1}
                max={14}
                value={plannedSessions}
                onChange={(e) => setPlannedSessions(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="wk-focus" className="block font-semibold">
                Mục tiêu trọng tâm (hiển thị cho học sinh)
              </label>
              <Input
                id="wk-focus"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="VD: Cấu trúc Counter-argument & Hedging..."
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="wk-teacher" className="block font-semibold">
                Giáo viên phụ trách
              </label>
              <Input
                id="wk-teacher"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Cột mốc bài kiểm tra */}
          <div className="space-y-2 rounded-xl border border-amber-300/70 bg-amber-500/5 p-3">
            <label className="flex cursor-pointer items-center gap-2 font-semibold text-amber-950">
              <input
                type="checkbox"
                checked={isMilestone}
                onChange={(e) => setIsMilestone(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              <Award className="size-4 text-amber-600" />
              Đánh dấu là Tuần có Cột mốc Kiểm tra / Đánh giá định kỳ
            </label>
            {isMilestone && (
              <Input
                value={assessmentTitle}
                onChange={(e) => setAssessmentTitle(e.target.value)}
                placeholder="VD: Mock Test #3 — Toàn diện 4 kỹ năng"
                className="h-8 bg-background text-xs"
              />
            )}
          </div>

          {/* Homework & Internal Notes */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="wk-hw" className="block font-semibold">
                Bài tập về nhà (gửi Cổng học sinh)
              </label>
              <textarea
                id="wk-hw"
                rows={3}
                value={homework}
                onChange={(e) => setHomework(e.target.value)}
                placeholder="VD: Làm Cambridge 18 Test 2 Task 1..."
                className="w-full rounded-xl border border-input bg-background p-2.5 text-xs outline-none focus-visible:border-ring"
              />
              <div className="flex items-center gap-2">
                <label htmlFor="wk-hw-due" className="shrink-0 text-[11px] text-muted-foreground">
                  Hạn nộp BTVN:
                </label>
                <Input
                  id="wk-hw-due"
                  type="date"
                  value={homeworkDueDate}
                  onChange={(e) => setHomeworkDueDate(e.target.value)}
                  className="h-7 font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="wk-notes" className="flex items-center gap-1.5 font-semibold">
                <Lock className="size-3.5 text-amber-600" />
                Ghi chú giảng dạy nội bộ (chỉ giáo viên thấy)
              </label>
              <textarea
                id="wk-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Lưu ý học vụ riêng về tiến độ, em nào cần phụ đạo thêm..."
                className="w-full rounded-xl border border-amber-300/70 bg-amber-500/5 p-2.5 text-xs outline-none focus-visible:border-ring"
              />
            </div>
          </div>

          {/* Attachments via Storage Service */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-foreground">
                Tài liệu &amp; Bài tập đính kèm ({attachments.length})
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Quyền truy cập:</span>
                <select
                  value={visibilityMode}
                  onChange={(e) =>
                    setVisibilityMode(e.target.value as "private" | "public")
                  }
                  className="h-7 rounded-md border border-input bg-background px-2 text-[11px]"
                >
                  <option value="private">Nội bộ lớp (Signed URL)</option>
                  <option value="public">Công khai</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full gap-1.5 bg-background text-xs"
              >
                <Upload className="size-3.5 text-primary" />
                {isUploading ? "Đang xác thực & tải..." : "Tải tệp chuẩn Storage"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenLibraryPicker}
                className="w-full gap-1.5 border-primary/40 bg-primary/5 text-xs text-primary hover:bg-primary/10"
              >
                <FolderOpen className="size-3.5" />
                Chọn từ Kho học liệu
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.mp3,.m4a"
              onChange={handleUploadAttachment}
              className="hidden"
            />

            {attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {att.type === "SLIDE" ? (
                        <Presentation className="size-4 shrink-0 text-amber-600" />
                      ) : att.type === "WORKSHEET" ? (
                        <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" />
                      ) : att.type === "AUDIO" ? (
                        <FileAudio className="size-4 shrink-0 text-purple-600" />
                      ) : (
                        <FileText className="size-4 shrink-0 text-primary" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium">{att.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {MATERIAL_FORMAT_LABELS[att.type] || att.type} · {att.size}
                          {att.storedFileId ? " · Đã lưu Storage" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openAttachmentSafely(att)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Mở / Tải xuống"
                      >
                        <Download className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                        }
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Gỡ tệp"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-warm/30 p-2.5 font-medium">
            <input
              type="checkbox"
              checked={setAsActive}
              onChange={(e) => setSetAsActive(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            <span>Đặt Tuần {week.weekNumber} làm tuần học hiện tại của lớp</span>
          </label>
        </form>
      </ModalDialog>

      {/* Library Picker Modal */}
      <ModalDialog
        open={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        title="Kho học liệu trung tâm"
        description="Gán tài liệu có sẵn vào Tuần học mà không cần tải lên lại."
        size="lg"
      >
        <div className="space-y-3 text-xs">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Tìm theo tên tài liệu hoặc mã lớp..."
                className="h-9 pl-9"
              />
            </div>
            <select
              value={libraryTypeFilter}
              onChange={(e) => setLibraryTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
            >
              <option value="all">Tất cả định dạng</option>
              <option value="PDF">PDF</option>
              <option value="DOCX">Word</option>
              <option value="SLIDE">Slide</option>
              <option value="WORKSHEET">Worksheet</option>
              <option value="AUDIO">Audio</option>
            </select>
          </div>

          <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {isLoadingLibrary ? (
              <div className="py-8 text-center text-muted-foreground">Đang tải...</div>
            ) : (
              libraryMaterials
                .filter((m) => {
                  if (libraryTypeFilter !== "all" && m.type !== libraryTypeFilter) return false;
                  if (librarySearch.trim()) {
                    const q = removeVietnameseTones(librarySearch.trim().toLowerCase());
                    return (
                      removeVietnameseTones(m.name.toLowerCase()).includes(q) ||
                      m.assignments.some((a) =>
                        removeVietnameseTones(a.classCode.toLowerCase()).includes(q),
                      )
                    );
                  }
                  return true;
                })
                .map((item) => {
                  const attached = attachments.some(
                    (a) => a.id === item.id || a.name.toLowerCase() === item.name.toLowerCase(),
                  );
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {MATERIAL_FORMAT_LABELS[item.type] || item.type} · {item.size}
                          {item.assignments.length > 0
                            ? ` · Đang dùng: ${item.assignments.map((a) => a.classCode).join(", ")}`
                            : ""}
                        </p>
                      </div>
                      {attached ? (
                        <Badge variant="success" className="shrink-0 text-[10px]">
                          Đã gán
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="xs"
                          onClick={() => handleAttachFromLibrary(item)}
                        >
                          <Plus className="size-3" />
                          Gán tuần
                        </Button>
                      )}
                    </div>
                  );
                })
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setIsLibraryOpen(false)}
            >
              Xong
            </Button>
          </div>
        </div>
      </ModalDialog>
    </>
  );
}

export function WeekProgressModal(props: WeekProgressModalProps) {
  if (!props.classroom || !props.week) return null;
  return (
    <WeekProgressModalInner
      key={`${props.classroom.id}-w${props.week.weekNumber}`}
      classroom={props.classroom}
      week={props.week}
      onClose={props.onClose}
      onSaved={props.onSaved}
    />
  );
}
