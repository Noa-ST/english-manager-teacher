"use client";

import * as React from "react";
import {
  CheckCircle2,
  Eye,
  FileText,
  FolderOpen,
  History,
  Lock,
  MessageSquareShare,
  Paperclip,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { removeVietnameseTones } from "@/lib/utils";
import type {
  ClassSessionRecord,
  ClassroomGroup,
  JournalStatus,
  ResourceFileItem,
  SessionAttachment,
  SessionCompletionResult,
  SessionHomeworkStatus,
  SessionLearningStatus,
  SessionSkillType,
  SessionStudentRecord,
} from "@/services/classroom-data";
import { formatDisplayDateVi } from "@/services/schedule-calendar-helpers";
import {
  QUICK_FEEDBACK_CHIPS,
  buildClassWeekOptions,
  computeSessionMetrics,
} from "@/services/teaching-journal-helpers";
import { openAttachmentSafely } from "@/components/admin/classes/week-progress-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

interface JournalEditorModalProps {
  session: ClassSessionRecord | null;
  classroom: ClassroomGroup | null;
  studentStatusById: Map<string, "active" | "trial" | "on-leave" | "archived">;
  onLeaveCountInClass: number;
  onClose: () => void;
  onSaved: (updated: ClassSessionRecord) => void;
  onOpenDigest: (session: ClassSessionRecord) => void;
}

type EditorTab = "journal" | "students" | "history";
type StudentRosterFilter = "all" | "needs-support" | "missing-hw" | "absent";

function mapResourceTypeToAttachmentType(
  ft: ResourceFileItem["fileType"],
): SessionAttachment["type"] {
  if (ft === "SLIDE" || ft === "IMAGE" || ft === "WORKSHEET" || ft === "PDF") {
    return ft;
  }
  return "PDF";
}

function JournalEditorModalInner({
  session,
  classroom,
  studentStatusById,
  onLeaveCountInClass,
  onClose,
  onSaved,
  onOpenDigest,
}: {
  session: ClassSessionRecord;
  classroom: ClassroomGroup | null;
  studentStatusById: Map<string, "active" | "trial" | "on-leave" | "archived">;
  onLeaveCountInClass: number;
  onClose: () => void;
  onSaved: (updated: ClassSessionRecord) => void;
  onOpenDigest: (session: ClassSessionRecord) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = React.useState<EditorTab>("journal");
  const [weekNumber, setWeekNumber] = React.useState(session.weekNumber);
  const [topic, setTopic] = React.useState(session.topic);
  const [objectives, setObjectives] = React.useState(session.objectives);
  const [completionResult, setCompletionResult] =
    React.useState<SessionCompletionResult>(session.completionResult);
  const [journalStatus, setJournalStatus] = React.useState<JournalStatus>(
    session.journalStatus,
  );
  const [generalNotes, setGeneralNotes] = React.useState(session.generalNotes);
  const [privateNotes, setPrivateNotes] = React.useState(
    session.privateNotes ?? "",
  );
  const [homework, setHomework] = React.useState(session.homework);
  const [nextSessionPlan, setNextSessionPlan] = React.useState(
    session.nextSessionPlan,
  );
  const [attachments, setAttachments] = React.useState<SessionAttachment[]>(
    session.attachments ?? [],
  );
  const [revisions, setRevisions] = React.useState(session.revisions ?? []);
  const [studentRecords, setStudentRecords] = React.useState<
    SessionStudentRecord[]
  >(session.studentRecords ?? []);
  const [syncCurriculumWeek, setSyncCurriculumWeek] = React.useState(true);

  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [restoringRevId, setRestoringRevId] = React.useState<string | null>(
    null,
  );
  const [showStoragePicker, setShowStoragePicker] = React.useState(false);
  const [storageFiles, setStorageFiles] = React.useState<ResourceFileItem[]>(
    [],
  );
  const [storageSearch, setStorageSearch] = React.useState("");
  const [loadingStorage, setLoadingStorage] = React.useState(false);

  const [studentFilter, setStudentFilter] =
    React.useState<StudentRosterFilter>("all");
  const [studentSearch, setStudentSearch] = React.useState("");

  const weekOptions = React.useMemo(
    () => buildClassWeekOptions(classroom),
    [classroom],
  );

  const liveSessionSnapshot = React.useMemo<ClassSessionRecord>(
    () => ({
      ...session,
      weekNumber,
      topic,
      objectives,
      completionResult,
      journalStatus,
      generalNotes,
      privateNotes,
      homework,
      nextSessionPlan,
      attachments,
      revisions,
      studentRecords,
    }),
    [
      session,
      weekNumber,
      topic,
      objectives,
      completionResult,
      journalStatus,
      generalNotes,
      privateNotes,
      homework,
      nextSessionPlan,
      attachments,
      revisions,
      studentRecords,
    ],
  );

  const liveMetrics = React.useMemo(
    () => computeSessionMetrics(liveSessionSnapshot),
    [liveSessionSnapshot],
  );

  const filteredStudents = React.useMemo(() => {
    const q = removeVietnameseTones(studentSearch.trim().toLowerCase());
    return studentRecords.filter((r) => {
      if (studentFilter === "needs-support" && r.learningStatus !== "needs-support") {
        return false;
      }
      if (studentFilter === "missing-hw" && r.homeworkStatus !== "not-submitted") {
        return false;
      }
      if (
        studentFilter === "absent" &&
        r.attendance !== "absent" &&
        r.attendance !== "excused"
      ) {
        return false;
      }
      if (q) {
        const hay = removeVietnameseTones(
          `${r.studentName} ${r.studentCode} ${r.teacherFeedback}`.toLowerCase(),
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [studentRecords, studentFilter, studentSearch]);

  const updateStudentRecord = (
    studentId: string,
    patch: Partial<SessionStudentRecord>,
  ) => {
    setStudentRecords((prev) =>
      prev.map((rec) =>
        rec.studentId === studentId ? { ...rec, ...patch } : rec,
      ),
    );
  };

  const appendChipToFeedback = (studentId: string, chipText: string) => {
    setStudentRecords((prev) =>
      prev.map((rec) => {
        if (rec.studentId !== studentId) return rec;
        const existing = rec.teacherFeedback.trim();
        if (existing.includes(chipText)) return rec;
        return {
          ...rec,
          teacherFeedback: existing ? `${existing} ${chipText}` : chipText,
        };
      }),
    );
  };

  const applyBatchAllPresent = () => {
    setStudentRecords((prev) =>
      prev.map((rec) => ({ ...rec, attendance: "present" })),
    );
    toast({
      variant: "info",
      title: "Đã đánh dấu Có mặt toàn bộ lớp",
    });
  };

  const applyBatchAllHwSubmitted = () => {
    setStudentRecords((prev) =>
      prev.map((rec) => ({ ...rec, homeworkStatus: "submitted" })),
    );
    toast({
      variant: "info",
      title: "Đã cập nhật Đã nộp BTVN toàn bộ lớp",
    });
  };

  const applyBatchAllGoodLearning = () => {
    setStudentRecords((prev) =>
      prev.map((rec) => ({ ...rec, learningStatus: "good" })),
    );
    toast({
      variant: "info",
      title: "Đã đánh dấu Tiếp thu tốt toàn bộ lớp",
    });
  };

  const handleToggleStoragePicker = async () => {
    const nextOpen = !showStoragePicker;
    setShowStoragePicker(nextOpen);
    if (nextOpen && storageFiles.length === 0) {
      setLoadingStorage(true);
      try {
        const res = await apiRequest<{ files: ResourceFileItem[] }>(
          "/api/admin/storage?publicOnly=false",
        );
        setStorageFiles(res.files ?? []);
      } catch {
        toast({
          variant: "error",
          title: "Không thể tải danh sách Kho tài liệu",
        });
      } finally {
        setLoadingStorage(false);
      }
    }
  };

  const handleUploadRealFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("visibility", "public");

      const response = await fetch(
        `/api/admin/teaching-journal/${encodeURIComponent(session.id)}/attachments`,
        {
          method: "POST",
          body: formData,
        },
      );
      const payload = (await response.json()) as
        | { ok: true; data: { session: ClassSessionRecord; attachment: SessionAttachment } }
        | { ok: false; error: { message: string } };

      if (!payload.ok) {
        throw new Error(payload.error.message || "Tải tệp thất bại.");
      }

      setAttachments(payload.data.session.attachments);
      onSaved(payload.data.session);
      toast({
        variant: "success",
        title: "Đã tải tài liệu lên buổi học",
        description: `${payload.data.attachment.name} (${payload.data.attachment.size})`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Lỗi tải tệp đính kèm",
        description: err instanceof Error ? err.message : "Vui lòng kiểm tra định dạng tệp.",
      });
    } finally {
      setUploading(false);
    }
  };

  const attachFromLibrary = (item: ResourceFileItem) => {
    const alreadyExists = attachments.some(
      (a) => a.name === item.title || a.id === `lib-${item.id}`,
    );
    if (alreadyExists) {
      toast({
        variant: "info",
        title: "Tài liệu đã được đính kèm trong buổi này",
      });
      return;
    }

    const mapped: SessionAttachment = {
      id: `lib-${item.id}`,
      name: item.originalName || item.title,
      type: mapResourceTypeToAttachmentType(item.fileType),
      size: item.size,
      url: item.publicUrl || undefined,
      uploadedAt: new Date().toISOString(),
    };
    setAttachments((prev) => [mapped, ...prev]);
    toast({
      variant: "success",
      title: "Đã gắn tài liệu từ Kho",
      description: mapped.name,
    });
  };

  const handleRestoreRevision = async (revisionId: string) => {
    setRestoringRevId(revisionId);
    try {
      const restored = await apiRequest<ClassSessionRecord>(
        `/api/admin/teaching-journal/${encodeURIComponent(session.id)}/restore-revision`,
        {
          method: "POST",
          body: JSON.stringify({ revisionId }),
        },
      );
      setTopic(restored.topic);
      setObjectives(restored.objectives);
      setGeneralNotes(restored.generalNotes);
      setHomework(restored.homework);
      setNextSessionPlan(restored.nextSessionPlan);
      setCompletionResult(restored.completionResult);
      setRevisions(restored.revisions);
      onSaved(restored);
      setActiveTab("journal");
      toast({
        variant: "success",
        title: "Đã khôi phục phiên bản nhật ký",
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể khôi phục phiên bản",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRestoringRevId(null);
    }
  };

  const handleSave = async (overrideStatus?: JournalStatus) => {
    const effectiveStatus = overrideStatus ?? journalStatus;
    if (!topic.trim()) {
      toast({
        variant: "warning",
        title: "Thiếu tên chuyên đề buổi học",
      });
      setActiveTab("journal");
      return;
    }

    setSaving(true);
    try {
      const updated = await apiRequest<ClassSessionRecord>(
        `/api/admin/teaching-journal/${encodeURIComponent(session.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            weekNumber,
            topic: topic.trim(),
            objectives: objectives.trim(),
            completionResult,
            journalStatus: effectiveStatus,
            generalNotes: generalNotes.trim(),
            privateNotes: privateNotes.trim(),
            homework: homework.trim(),
            nextSessionPlan: nextSessionPlan.trim(),
            attachments,
            syncCurriculumWeek,
            studentRecords: studentRecords.map((r) => ({
              studentId: r.studentId,
              attendance: r.attendance,
              homeworkStatus: r.homeworkStatus,
              learningStatus: r.learningStatus,
              skill: r.skill,
              score:
                typeof r.score === "number" && !Number.isNaN(r.score)
                  ? Math.min(10, Math.max(0, r.score))
                  : null,
              teacherFeedback: r.teacherFeedback,
              followUp: r.followUp,
            })),
          }),
        },
      );

      setJournalStatus(updated.journalStatus);
      setRevisions(updated.revisions);
      onSaved(updated);
      toast({
        variant: "success",
        title:
          effectiveStatus === "completed"
            ? "Đã hoàn tất & công bố lên Cổng Học sinh"
            : "Đã lưu bản nháp nhật ký",
        description: `${updated.classCode} · ${updated.topic}`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Lưu nhật ký thất bại",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredStorageFiles = React.useMemo(() => {
    const q = removeVietnameseTones(storageSearch.trim().toLowerCase());
    if (!q) return storageFiles.slice(0, 12);
    return storageFiles
      .filter((f) =>
        removeVietnameseTones(`${f.title} ${f.folderName}`.toLowerCase()).includes(q),
      )
      .slice(0, 12);
  }, [storageFiles, storageSearch]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <Badge variant="outline" className="font-semibold">
            {session.classCode}
          </Badge>
          <span className="font-medium text-foreground">{session.className}</span>
          <span>·</span>
          <span>
            {session.dayLabel}, {formatDisplayDateVi(session.date)} ({session.startTime}–
            {session.endTime})
          </span>
          <span>·</span>
          <span>{session.room}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenDigest(liveSessionSnapshot)}
          >
            <MessageSquareShare className="size-3.5" aria-hidden="true" />
            Bản tin Phụ huynh
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("journal")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "journal"
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="size-4" aria-hidden="true" />
          Nội dung & Tài liệu ({attachments.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("students")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "students"
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="size-4" aria-hidden="true" />
          Điểm danh & Học viên ({studentRecords.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="size-4" aria-hidden="true" />
          Lịch sử sửa đổi ({revisions.length})
        </button>
      </div>

      {activeTab === "journal" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-journal-week">Tuần chương trình</Label>
              <select
                id="edit-journal-week"
                value={weekNumber}
                onChange={(e) => setWeekNumber(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {weekOptions.map((w) => (
                  <option key={w.weekNumber} value={w.weekNumber}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-journal-result">Kết quả hoàn thành buổi học</Label>
              <select
                id="edit-journal-result"
                value={completionResult}
                onChange={(e) =>
                  setCompletionResult(e.target.value as SessionCompletionResult)
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="completed">Đạt 100% mục tiêu</option>
                <option value="partial">Hoàn thành một phần</option>
                <option value="not-completed">Chưa hoàn tất / Cần dạy bù</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-journal-status">Hiển thị Cổng Học sinh</Label>
              <select
                id="edit-journal-status"
                value={journalStatus}
                onChange={(e) => setJournalStatus(e.target.value as JournalStatus)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="completed">Đã hoàn tất (Công bố Cổng HS)</option>
                <option value="draft">Bản nháp (Ẩn khỏi Cổng HS)</option>
                <option value="not-started">Chưa ghi (Ẩn khỏi Cổng HS)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-journal-topic">Chuyên đề buổi học *</Label>
            <Input
              id="edit-journal-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-journal-objectives">Mục tiêu đạt được</Label>
            <textarea
              id="edit-journal-objectives"
              rows={2}
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-journal-general-notes">
                Nhận xét chung lớp học (Công khai Cổng HS khi Hoàn tất)
              </Label>
              <textarea
                id="edit-journal-general-notes"
                rows={4}
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                placeholder="Ghi nhận tinh thần học tập, lỗi sai phổ biến của cả lớp..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="edit-journal-private-notes"
                className="flex items-center gap-1.5 text-amber-900"
              >
                <Lock className="size-3.5 text-amber-700" aria-hidden="true" />
                Ghi chú nội bộ giáo viên (TUYỆT ĐỐI ẨN với Học sinh & PH)
              </Label>
              <textarea
                id="edit-journal-private-notes"
                rows={4}
                value={privateNotes}
                onChange={(e) => setPrivateNotes(e.target.value)}
                placeholder="Ghi chú riêng cho giáo viên: lưu ý kỷ luật, tâm lý lớp, điểm yếu cần kèm riêng..."
                className="w-full rounded-lg border border-amber-300 bg-amber-50/50 px-3 py-2 text-sm text-amber-950 placeholder:text-amber-700/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-journal-homework">Bài tập về nhà (BTVN)</Label>
              <textarea
                id="edit-journal-homework"
                rows={3}
                value={homework}
                onChange={(e) => setHomework(e.target.value)}
                placeholder="Nội dung bài tập, trang sách, hạn nộp..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-journal-next-plan">Kế hoạch buổi kế tiếp</Label>
              <textarea
                id="edit-journal-next-plan"
                rows={3}
                value={nextSessionPlan}
                onChange={(e) => setNextSessionPlan(e.target.value)}
                placeholder="Chủ đề tiếp theo, phần cần kiểm tra đầu giờ..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={syncCurriculumWeek}
              onChange={(e) => setSyncCurriculumWeek(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            <span>
              Tự động đồng bộ trạng thái Tuần {weekNumber} và BTVN sang Khung chương trình lớp học
            </span>
          </label>

          {/* Attachments Section */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Paperclip className="size-4 text-primary" aria-hidden="true" />
                  Tài liệu đính kèm buổi học ({attachments.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Tải lên tệp thật (PDF, DOCX, PPTX, XLSX, Hình ảnh) hoặc chọn trực tiếp từ Kho tài liệu.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                  onChange={handleUploadRealFile}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" aria-hidden="true" />
                  {uploading ? "Đang tải lên..." : "Tải tệp thật lên"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleToggleStoragePicker}
                >
                  <FolderOpen className="size-3.5" aria-hidden="true" />
                  Chọn từ Kho tài liệu
                </Button>
              </div>
            </div>

            {showStoragePicker && (
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <Search className="size-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={storageSearch}
                    onChange={(e) => setStorageSearch(e.target.value)}
                    placeholder="Tìm tài liệu theo tên hoặc thư mục trong Kho..."
                    className="h-8 text-xs"
                  />
                </div>
                {loadingStorage ? (
                  <p className="text-xs text-muted-foreground">
                    Đang tải danh sách tài liệu từ Kho...
                  </p>
                ) : filteredStorageFiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Không tìm thấy tệp phù hợp.
                  </p>
                ) : (
                  <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {filteredStorageFiles.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => attachFromLibrary(item)}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.fileType} · {item.size}
                          </p>
                        </div>
                        <span className="shrink-0 font-medium text-primary">+ Gắn</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Chưa có tài liệu nào gắn với buổi học này.
              </p>
            ) : (
              <ul className="divide-y divide-border/70 rounded-xl border border-border bg-card">
                {attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {att.type}
                      </Badge>
                      <span className="truncate font-medium text-foreground">
                        {att.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        ({att.size})
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {(att.url || att.storedFileId) && (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            void openAttachmentSafely({
                              id: att.id,
                              storedFileId: att.storedFileId,
                              name: att.name,
                              type: att.type,
                              size: att.size,
                              url: att.url ?? "",
                              uploadedAt: att.uploadedAt ?? "",
                            })
                          }
                        >
                          <Eye className="size-3.5" aria-hidden="true" />
                          Xem
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Gỡ tài liệu ${att.name}`}
                        onClick={() =>
                          setAttachments((prev) =>
                            prev.filter((item) => item.id !== att.id),
                          )
                        }
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === "students" && (
        <div className="space-y-4">
          {onLeaveCountInClass > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2 text-xs text-blue-900">
              Lớp hiện có <strong>{onLeaveCountInClass}</strong> học viên đang ở trạng thái Bảo lưu/Tạm nghỉ nên được tự động ẩn khỏi danh sách điểm danh buổi này.
            </div>
          )}

          {/* Roster Toolbar */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground tabular-nums">
                Có mặt:{" "}
                <strong className="text-foreground">
                  {liveMetrics.presentAndLateCount}/{liveMetrics.total} (
                  {liveMetrics.attendanceRate}%)
                </strong>{" "}
                · BTVN:{" "}
                <strong className="text-foreground">
                  {liveMetrics.homeworkRate}%
                </strong>{" "}
                · Cần hỗ trợ:{" "}
                <strong className="text-amber-700">
                  {liveMetrics.needsSupportCount}
                </strong>
                {liveMetrics.avgScore !== null && (
                  <>
                    {" "}
                    · Điểm TB:{" "}
                    <strong className="text-primary">
                      {liveMetrics.avgScore}/10
                    </strong>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={applyBatchAllPresent}
                >
                  Có mặt tất cả
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={applyBatchAllHwSubmitted}
                >
                  Đã nộp BTVN tất cả
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={applyBatchAllGoodLearning}
                >
                  Tiếp thu tốt tất cả
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["all", "Tất cả"],
                    ["needs-support", "Cần hỗ trợ"],
                    ["missing-hw", "Chưa nộp BTVN"],
                    ["absent", "Vắng / Có phép"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStudentFilter(key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      studentFilter === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <Input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Tìm tên hoặc mã học viên..."
                className="h-8 w-full text-xs sm:w-56"
              />
            </div>
          </div>

          {/* Student List */}
          {filteredStudents.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Không có học viên nào khớp bộ lọc hiện tại.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredStudents.map((rec) => {
                const stuStatus = studentStatusById.get(rec.studentId);
                return (
                  <div
                    key={rec.studentId}
                    className="space-y-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {rec.studentName}
                        </span>
                        <Badge variant="outline" className="text-[11px]">
                          {rec.studentCode}
                        </Badge>
                        {stuStatus === "trial" && (
                          <Badge className="bg-sky-100 text-sky-800 text-[10px]">
                            Học thử
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`score-${rec.studentId}`}
                          className="text-xs text-muted-foreground"
                        >
                          Điểm kiểm tra ngắn (0–10):
                        </Label>
                        <Input
                          id={`score-${rec.studentId}`}
                          type="number"
                          min={0}
                          max={10}
                          step={0.5}
                          placeholder="-"
                          value={rec.score ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateStudentRecord(rec.studentId, {
                              score:
                                raw === ""
                                  ? null
                                  : Math.min(10, Math.max(0, Number(raw))),
                            });
                          }}
                          className="h-7 w-20 text-center text-xs tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div>
                        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          Điểm danh
                        </span>
                        <select
                          value={rec.attendance}
                          onChange={(e) =>
                            updateStudentRecord(rec.studentId, {
                              attendance: e.target
                                .value as SessionStudentRecord["attendance"],
                            })
                          }
                          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
                        >
                          <option value="present">Có mặt</option>
                          <option value="late">Đi muộn</option>
                          <option value="excused">Vắng có phép</option>
                          <option value="absent">Vắng không phép</option>
                        </select>
                      </div>

                      <div>
                        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          Bài tập về nhà
                        </span>
                        <select
                          value={rec.homeworkStatus}
                          onChange={(e) =>
                            updateStudentRecord(rec.studentId, {
                              homeworkStatus: e.target
                                .value as SessionHomeworkStatus,
                            })
                          }
                          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
                        >
                          <option value="submitted">Đã nộp</option>
                          <option value="not-submitted">Chưa nộp</option>
                          <option value="exempt">Được miễn</option>
                          <option value="unrecorded">Chưa ghi</option>
                        </select>
                      </div>

                      <div>
                        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          Mức độ tiếp thu
                        </span>
                        <select
                          value={rec.learningStatus}
                          onChange={(e) =>
                            updateStudentRecord(rec.studentId, {
                              learningStatus: e.target
                                .value as SessionLearningStatus,
                            })
                          }
                          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
                        >
                          <option value="good">Tiếp thu tốt</option>
                          <option value="satisfactory">Đạt yêu cầu</option>
                          <option value="needs-support">Cần hỗ trợ thêm</option>
                          <option value="unrecorded">Chưa đánh giá</option>
                        </select>
                      </div>

                      <div>
                        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          Kỹ năng nổi bật
                        </span>
                        <select
                          value={rec.skill}
                          onChange={(e) =>
                            updateStudentRecord(rec.studentId, {
                              skill: e.target.value as SessionSkillType,
                            })
                          }
                          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
                        >
                          <option value="General">Tổng hợp</option>
                          <option value="Listening">Listening</option>
                          <option value="Reading">Reading</option>
                          <option value="Writing">Writing</option>
                          <option value="Speaking">Speaking</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <Sparkles className="size-3 text-primary" aria-hidden="true" />
                          Gợi ý nhận xét nhanh:
                        </span>
                        {QUICK_FEEDBACK_CHIPS.map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() =>
                              appendChipToFeedback(rec.studentId, chip.text)
                            }
                            className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          >
                            + {chip.label}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input
                          value={rec.teacherFeedback}
                          onChange={(e) =>
                            updateStudentRecord(rec.studentId, {
                              teacherFeedback: e.target.value,
                            })
                          }
                          placeholder="Nhận xét gửi học viên & phụ huynh (hiện trên Portal khi Hoàn tất)..."
                          className="h-8 text-xs"
                        />
                        <Input
                          value={rec.followUp}
                          onChange={(e) =>
                            updateStudentRecord(rec.studentId, {
                              followUp: e.target.value,
                            })
                          }
                          placeholder="Theo dõi nội bộ giáo viên (ẩn khỏi Cổng Học sinh)..."
                          className="h-8 border-amber-200/80 bg-amber-50/40 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-3">
          {revisions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Chưa có lịch sử chỉnh sửa nào. Khi bạn cập nhật một nhật ký đã ghi, phiên bản cũ sẽ tự động được lưu tại đây để khôi phục khi cần.
            </p>
          ) : (
            <div className="space-y-2.5">
              {revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-card p-3.5 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="tabular-nums">
                        {rev.updatedAt}
                      </Badge>
                      <span className="font-semibold text-foreground">
                        {rev.summary}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      <strong>Chuyên đề trước:</strong> {rev.previousTopic}
                    </p>
                    {rev.previousNotes && (
                      <p className="line-clamp-2 text-muted-foreground">
                        <strong>Nhận xét trước:</strong> {rev.previousNotes}
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={restoringRevId === rev.id}
                    onClick={() => void handleRestoreRevision(rev.id)}
                    className="shrink-0"
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    {restoringRevId === rev.id
                      ? "Đang khôi phục..."
                      : "Khôi phục bản này"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">
          {journalStatus === "completed"
            ? "Trạng thái: Đã hoàn tất (đang hiển thị công khai trên Cổng Học sinh, trừ ghi chú nội bộ)."
            : "Trạng thái hiện tại: Ẩn với học sinh cho đến khi bạn chọn Hoàn tất."}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => void handleSave("draft")}
          >
            <Save className="size-3.5" aria-hidden="true" />
            Lưu bản nháp
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleSave("completed")}
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {saving ? "Đang lưu..." : "Lưu & Hoàn tất (Cổng HS)"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function JournalEditorModal({
  session,
  classroom,
  studentStatusById,
  onLeaveCountInClass,
  onClose,
  onSaved,
  onOpenDigest,
}: JournalEditorModalProps) {
  return (
    <ModalDialog
      open={Boolean(session)}
      onClose={onClose}
      title={
        session
          ? `Nhật ký Giảng dạy: ${session.classCode} — Tuần ${session.weekNumber}`
          : "Chi tiết Nhật ký"
      }
      description={
        session
          ? `${session.topic} · Cập nhật điểm danh, đánh giá từng học viên và tài liệu đính kèm.`
          : undefined
      }
      size="xl"
    >
      {session && (
        <JournalEditorModalInner
          key={session.id}
          session={session}
          classroom={classroom}
          studentStatusById={studentStatusById}
          onLeaveCountInClass={onLeaveCountInClass}
          onClose={onClose}
          onSaved={onSaved}
          onOpenDigest={onOpenDigest}
        />
      )}
    </ModalDialog>
  );
}
