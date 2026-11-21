"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CopyPlus,
  Download,
  Edit3,
  FastForward,
  FileSpreadsheet,
  Lock,
  Paperclip,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { removeVietnameseTones } from "@/lib/utils";
import {
  resolveWeekStatus,
  type AdminStudentRecord,
  type ClassroomGroup,
  type ClassSessionRecord,
  type CurriculumWeek,
} from "@/services/classroom-data";
import {
  CLASSROOM_STATUS_META,
  SKILL_FOCUS_META,
  computeClassroomHealthSummary,
  computeClassroomProgress,
  exportClassRosterCsv,
} from "@/services/classroom-helpers";
import { formatDisplayDate } from "@/services/student-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { ClassDetailTab } from "./class-card";
import { openAttachmentSafely } from "./week-progress-modal";

interface ClassDetailModalProps {
  classroom: ClassroomGroup | null;
  initialTab?: ClassDetailTab;
  allClasses: ClassroomGroup[];
  classStudents: AdminStudentRecord[];
  allStudents: AdminStudentRecord[];
  classSessions: ClassSessionRecord[];
  onClose: () => void;
  onClassUpdated: (updated: ClassroomGroup) => void;
  onSessionCreated: (created: ClassSessionRecord) => void;
  onOpenEditClass: (cls: ClassroomGroup) => void;
  onOpenCloneClass: (cls: ClassroomGroup) => void;
  onOpenWeekModal: (cls: ClassroomGroup, week: CurriculumWeek) => void;
  onAdvanceWeek: (cls: ClassroomGroup, targetWeek?: number) => Promise<void>;
  onOpenAddStudent: (cls: ClassroomGroup) => void;
  onOpenStudentDetail: (stu: AdminStudentRecord) => void;
  onOpenBulkTransfer: (students: AdminStudentRecord[]) => void;
  onAssignExistingStudent: (studentId: string, cls: ClassroomGroup, reason: string) => Promise<void>;
  onTemplateSaved?: () => void;
}

function ClassDetailModalInner({
  classroom,
  initialTab = "overview",
  allClasses,
  classStudents,
  allStudents,
  classSessions,
  onClose,
  onClassUpdated,
  onSessionCreated,
  onOpenEditClass,
  onOpenCloneClass,
  onOpenWeekModal,
  onAdvanceWeek,
  onOpenAddStudent,
  onOpenStudentDetail,
  onOpenBulkTransfer,
  onAssignExistingStudent,
  onTemplateSaved,
}: Omit<ClassDetailModalProps, "classroom"> & { classroom: ClassroomGroup }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<ClassDetailTab>(initialTab);
  const [busy, setBusy] = React.useState(false);

  // Tab 2 tools
  const [showShiftBox, setShowShiftBox] = React.useState(false);
  const [shiftFromWeek, setShiftFromWeek] = React.useState(
    String(classroom.currentWeekIndex ?? 1),
  );
  const [shiftDays, setShiftDays] = React.useState("7");
  const [showTemplateBox, setShowTemplateBox] = React.useState(false);
  const [templateName, setTemplateName] = React.useState(
    `${classroom.name} (Mẫu chuẩn)`,
  );

  // Tab 3 roster filter & assign
  const [rosterSearch, setRosterSearch] = React.useState("");
  const [rosterStatusFilter, setRosterStatusFilter] = React.useState("all");
  const [showAssignForm, setShowAssignForm] = React.useState(false);
  const [assignStudentId, setAssignStudentId] = React.useState("");
  const [assignReason, setAssignReason] = React.useState("Chuyển lớp theo lộ trình");

  // Tab 4 sessions
  const [selectedSessionId, setSelectedSessionId] = React.useState("");

  const statusMeta = CLASSROOM_STATUS_META[classroom.status];
  const progress = computeClassroomProgress(classroom);
  const health = React.useMemo(
    () => computeClassroomHealthSummary(classroom, classStudents, classSessions),
    [classroom, classStudents, classSessions],
  );

  const curriculumList: CurriculumWeek[] = React.useMemo(() => {
    if (classroom.curriculum && classroom.curriculum.length > 0) {
      return [...classroom.curriculum].sort((a, b) => a.weekNumber - b.weekNumber);
    }
    return Array.from({ length: progress.totalWeeks }, (_, i) => ({
      weekNumber: i + 1,
      title:
        i + 1 === progress.currentWeek
          ? classroom.currentModule
          : `Nội dung học phần tuần ${i + 1}`,
      status: "not-started" as const,
    }));
  }, [classroom, progress.currentWeek, progress.totalWeeks]);

  const sortedClassSessions = React.useMemo(
    () =>
      classSessions
        .filter((s) => s.classId === classroom.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [classSessions, classroom.id],
  );

  const currentSession =
    sortedClassSessions.find((s) => s.id === selectedSessionId) ??
    sortedClassSessions[0] ??
    null;

  const availableStudentsToAssign = React.useMemo(
    () =>
      allStudents.filter(
        (s) => s.classId !== classroom.id && s.status !== "archived" && !s.deletedAt,
      ),
    [allStudents, classroom.id],
  );

  const filteredRosterStudents = React.useMemo(() => {
    return classStudents.filter((s) => {
      if (rosterStatusFilter === "overdue" && s.tuitionStatus !== "overdue") return false;
      if (
        (rosterStatusFilter === "active" ||
          rosterStatusFilter === "trial" ||
          rosterStatusFilter === "on-leave") &&
        s.status !== rosterStatusFilter
      ) {
        return false;
      }
      const q = rosterSearch.trim();
      if (!q) return true;
      const norm = removeVietnameseTones(q);
      return (
        removeVietnameseTones(s.fullName).includes(norm) ||
        removeVietnameseTones(s.code).includes(norm)
      );
    });
  }, [classStudents, rosterSearch, rosterStatusFilter]);

  // Tab 5 Assessment Milestones aggregation
  const assessmentSummaryList = React.useMemo(() => {
    const map = new Map<
      string,
      {
        title: string;
        weekNumber?: number;
        scheduledDate?: string;
        gradedCount: number;
        avgScore: number | null;
      }
    >();

    for (const w of curriculumList) {
      if (w.isAssessmentMilestone) {
        const title = w.assessmentTitle?.trim() || `Kiểm tra Tuần ${w.weekNumber}: ${w.title}`;
        map.set(title.toLowerCase(), {
          title,
          weekNumber: w.weekNumber,
          scheduledDate: w.scheduledDate,
          gradedCount: 0,
          avgScore: null,
        });
      }
    }

    const gradeBuckets = new Map<string, number[]>();
    for (const stu of classStudents) {
      for (const g of stu.grades ?? []) {
        const key = g.assessmentTitle.trim().toLowerCase();
        const arr = gradeBuckets.get(key) ?? [];
        arr.push(g.overall);
        gradeBuckets.set(key, arr);
        if (!map.has(key)) {
          map.set(key, {
            title: g.assessmentTitle,
            gradedCount: 0,
            avgScore: null,
          });
        }
      }
    }

    for (const [key, item] of map.entries()) {
      const scores = gradeBuckets.get(key) ?? [];
      if (scores.length > 0) {
        item.gradedCount = scores.length;
        item.avgScore = Number(
          (scores.reduce((sum, v) => sum + v, 0) / scores.length).toFixed(1),
        );
      }
    }

    return Array.from(map.values());
  }, [curriculumList, classStudents]);

  const handleLifecycleAction = async (action: "complete" | "activate") => {
    setBusy(true);
    try {
      const updated = await apiRequest<ClassroomGroup>(
        `/api/admin/classes/${encodeURIComponent(classroom.id)}/lifecycle`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        },
      );
      onClassUpdated(updated);
      toast({
        title: action === "complete" ? "Đã kết khóa lớp học" : "Đã kích hoạt lớp vận hành",
        description:
          action === "complete"
            ? `Lớp ${classroom.code} đã kết thúc khóa và giải phóng khung giờ trên Thời khóa biểu.`
            : `Lớp ${classroom.code} đã mở hoạt động và đồng bộ lên Thời khóa biểu.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể chuyển trạng thái lớp",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleShiftSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await apiRequest<ClassroomGroup>(
        `/api/admin/classes/${encodeURIComponent(classroom.id)}/lifecycle`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "shift-schedule",
            fromWeekNumber: Number(shiftFromWeek) || 1,
            shiftDays: Number(shiftDays) || 7,
          }),
        },
      );
      onClassUpdated(updated);
      setShowShiftBox(false);
      toast({
        title: "Đã tịnh tiến lịch trình học phần",
        description: `Từ Tuần ${shiftFromWeek} trở đi đã dời ${shiftDays} ngày.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Dời lịch thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;
    setBusy(true);
    try {
      await apiRequest("/api/admin/classes/templates", {
        method: "POST",
        body: JSON.stringify({
          classId: classroom.id,
          name: templateName.trim(),
        }),
      });
      setShowTemplateBox(false);
      onTemplateSaved?.();
      toast({
        title: "Đã lưu làm Giáo trình mẫu",
        description: `Mẫu "${templateName.trim()}" sẵn sàng dùng khi tạo lớp mới.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Lưu giáo trình mẫu thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleQuickCreateSession = async () => {
    setBusy(true);
    try {
      const created = await apiRequest<ClassSessionRecord>("/api/admin/teaching-journal", {
        method: "POST",
        body: JSON.stringify({
          classId: classroom.id,
          weekNumber: progress.currentWeek,
        }),
      });
      onSessionCreated(created);
      setSelectedSessionId(created.id);
      toast({
        title: "Đã tạo buổi học mới",
        description: `Buổi học ngày ${formatDisplayDate(created.date)} gắn Tuần ${created.weekNumber} đã sẵn sàng.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể tạo buổi học",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportClassRosterCsv(classroom, classStudents);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `danh-sach-${classroom.code.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Đã xuất danh sách lớp ${classroom.code}`, variant: "success" });
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignStudentId) return;
    setBusy(true);
    try {
      await onAssignExistingStudent(assignStudentId, classroom, assignReason.trim());
      setAssignStudentId("");
      setShowAssignForm(false);
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ id: ClassDetailTab; label: string; count?: number }> = [
    { id: "overview", label: "Tổng quan lớp" },
    { id: "curriculum", label: "Khung chương trình", count: progress.totalWeeks },
    { id: "students", label: "Học viên & HP", count: classStudents.length },
    { id: "sessions", label: "Buổi học & BTVN", count: sortedClassSessions.length },
    { id: "assessments", label: "Cột mốc & Điểm", count: assessmentSummaryList.length },
  ];

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={`Điều hành Lớp 360°: ${classroom.code} — ${classroom.name}`}
      description={`${statusMeta.label} · ${classroom.scheduleSummary} · ${classroom.room}`}
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {classroom.status !== "archived" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenCloneClass(classroom);
                }}
              >
                <CopyPlus className="size-3.5 text-primary" />
                Nhân bản khóa mới
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              render={<Link href={`/attendance?classId=${encodeURIComponent(classroom.id)}`} />}
              nativeButton={false}
            >
              <ClipboardCheck className="size-3.5 text-primary" />
              Điểm danh nhanh
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
            {classroom.status !== "archived" && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenEditClass(classroom);
                }}
              >
                <Edit3 className="size-3.5" />
                Chỉnh sửa lớp &amp; TKB
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* 5-Tab Bar uniform full-width */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 sm:grid-cols-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium transition-all sm:text-xs ${
                activeTab === tab.id
                  ? "bg-card font-semibold text-primary shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="truncate">{tab.label}</span>
              {tab.count !== undefined && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0 font-mono text-[10px] text-foreground">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Uniform fixed height container across all 5 tabs */}
        <div className="h-[min(500px,62vh)] overflow-y-auto pr-1">
          {/* ================= TAB 1: OVERVIEW ================= */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Lifecycle banner */}
              {classroom.status === "upcoming" && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-300/70 bg-sky-500/10 p-3.5 text-sky-900">
                  <div>
                    <p className="font-semibold">Lớp đang ở trạng thái Sắp khai giảng</p>
                    <p className="text-[11px] opacity-90">
                      Ngày dự kiến khai giảng: {formatDisplayDate(classroom.startDate)}. Bấm Khai giảng khi bắt đầu khóa chính thức.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    disabled={busy}
                    onClick={() => handleLifecycleAction("activate")}
                  >
                    <Play className="size-3.5" />
                    Khai giảng chính thức
                  </Button>
                </div>
              )}

              {classroom.status === "completed" && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/70 bg-amber-500/10 p-3.5 text-amber-900">
                  <div>
                    <p className="font-semibold">
                      Khóa học đã kết thúc ({formatDisplayDate(classroom.completedAt)})
                    </p>
                    <p className="text-[11px] opacity-90">
                      Lịch dạy trên thời khóa biểu đã được giải phóng. Bạn có thể nhân bản sang khóa kế tiếp hoặc mở lại lớp.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleLifecycleAction("activate")}
                    >
                      Mở lại lớp
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      onClick={() => {
                        onClose();
                        onOpenCloneClass(classroom);
                      }}
                    >
                      <CopyPlus className="size-3.5" />
                      Nhân bản khóa mới
                    </Button>
                  </div>
                </div>
              )}

              {/* Top 5 KPI Cards (uniform height) */}
              <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-5">
                <div className="flex min-h-[96px] flex-col justify-between rounded-xl border border-border/60 bg-background p-3.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Sĩ số lớp</span>
                  <p className="font-mono text-base font-bold text-foreground">
                    {classroom.enrolled}/{classroom.capacity} HV
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {health.activeCount} chính · {health.trialCount} thử · {health.onLeaveCount} bảo lưu
                  </p>
                </div>

                <div className="flex min-h-[96px] flex-col justify-between rounded-xl border border-border/60 bg-background p-3.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Hoàn thành lộ trình</span>
                  <p className="font-mono text-base font-bold text-primary">
                    {progress.completionPct}%
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    Xong {progress.completedWeeks}/{progress.totalWeeks} tuần (Đang T{progress.currentWeek})
                  </p>
                </div>

                <div className="flex min-h-[96px] flex-col justify-between rounded-xl border border-border/60 bg-background p-3.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Chuyên cần lớp</span>
                  <p className="font-mono text-base font-bold text-emerald-700">
                    {classroom.attendanceRate}%
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {sortedClassSessions.length} buổi đã ghi nhận
                  </p>
                </div>

                <div className="flex min-h-[96px] flex-col justify-between rounded-xl border border-border/60 bg-background p-3.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Điểm TB lớp</span>
                  <p className="font-mono text-base font-bold text-primary">
                    {classroom.averageScore > 0 ? classroom.averageScore.toFixed(1) : "—"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    Mục tiêu: {classroom.targetBand}
                  </p>
                </div>

                <div className="col-span-2 flex min-h-[96px] flex-col justify-between rounded-xl border border-border/60 bg-warm/50 p-3.5 sm:col-span-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Thu học phí lớp</span>
                  <p className="font-mono text-base font-bold text-foreground">
                    {health.tuitionCollectionPct}%
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {health.overdueCount > 0
                      ? `${health.overdueCount} em quá hạn HP`
                      : `Hạn: ${formatDisplayDate(classroom.tuitionDueDate)}`}
                  </p>
                </div>
              </div>

              {/* Class 4-skill diagnostic */}
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-primary" />
                    <h4 className="font-heading text-sm font-bold text-foreground">
                      Chẩn đoán năng lực 4 Kỹ năng toàn lớp
                    </h4>
                  </div>
                  {health.skillAverages.weakestSkill && (
                    <Badge variant="warning" className="text-[10px]">
                      Lớp cần bồi dưỡng thêm: {health.skillAverages.weakestSkill}
                    </Badge>
                  )}
                </div>

                {health.skillAverages.hasData ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      { label: "Listening", score: health.skillAverages.listening },
                      { label: "Reading", score: health.skillAverages.reading },
                      { label: "Writing", score: health.skillAverages.writing },
                      { label: "Speaking", score: health.skillAverages.speaking },
                    ].map((s) => {
                      const isWeakest = health.skillAverages.weakestSkill === s.label;
                      return (
                        <div key={s.label} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{s.label}</span>
                            <span className="font-mono font-bold text-primary">
                              {s.score.toFixed(1)}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${isWeakest ? "bg-amber-500" : "bg-primary"}`}
                              style={{ width: `${Math.min(100, (s.score / 9) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-muted-foreground">
                    Chưa có bài kiểm tra của học viên trong lớp để thống kê 4 kỹ năng.
                  </p>
                )}
              </div>

              {/* Alerts & Quick Complete Class */}
              <div className="grid items-stretch gap-3 sm:grid-cols-2">
                <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4">
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 font-heading text-xs font-bold">
                      <AlertTriangle className="size-3.5 text-amber-600" />
                      Tình trạng vận hành &amp; Sẵn sàng học liệu ({health.alerts.length})
                    </p>
                    {health.alerts.length === 0 ? (
                      <p className="text-emerald-700">
                        Lớp đang vận hành ổn định, đã sẵn sàng học liệu tuần học.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {health.alerts.map((al) => (
                          <div
                            key={al.id}
                            className="rounded-lg border border-border/60 bg-background p-2.5"
                          >
                            <p className="font-semibold text-foreground">{al.title}</p>
                            <p className="text-[11px] text-muted-foreground">{al.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4">
                  <div className="space-y-1.5">
                    <p className="font-heading text-xs font-bold text-foreground">
                      Thông tin khóa học &amp; Thao tác vòng đời
                    </p>
                    <p className="text-muted-foreground">
                      Khai giảng: <strong>{formatDisplayDate(classroom.startDate)}</strong> · Dự kiến kết thúc:{" "}
                      <strong>{formatDisplayDate(classroom.expectedEndDate)}</strong>
                    </p>
                    <p className="text-muted-foreground">
                      Học phần hiện tại: <strong className="text-primary">{classroom.currentModule}</strong>
                    </p>
                  </div>

                  {classroom.status === "active" && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busy}
                        onClick={() => handleLifecycleAction("complete")}
                      >
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        Đánh dấu Kết khóa lớp
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        disabled={busy || progress.currentWeek >= progress.totalWeeks}
                        onClick={() => onAdvanceWeek(classroom)}
                      >
                        <FastForward className="size-3.5" />
                        Hoàn thành Tuần {progress.currentWeek} &amp; Sang Tuần{" "}
                        {Math.min(progress.totalWeeks, progress.currentWeek + 1)}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: CURRICULUM & MATERIALS ================= */}
          {activeTab === "curriculum" && (
            <div className="space-y-3">
              {/* Action bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warm/40 p-3.5">
                <div>
                  <p className="font-semibold text-primary">
                    Tiến độ hoàn thành thực tế: {progress.completedWeeks}/{progress.totalWeeks} tuần ({progress.completionPct}%)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Hiện đang dạy: {classroom.currentModule}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setShowShiftBox((p) => !p);
                      setShowTemplateBox(false);
                    }}
                  >
                    <Calendar className="size-3.5" />
                    Dời lịch lễ (+1 tuần)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setShowTemplateBox((p) => !p);
                      setShowShiftBox(false);
                    }}
                  >
                    <Save className="size-3.5" />
                    Lưu giáo trình mẫu
                  </Button>
                </div>
              </div>

              {showShiftBox && (
                <form
                  onSubmit={handleShiftSchedule}
                  className="flex flex-wrap items-end gap-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3"
                >
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Bắt đầu dời từ Tuần</label>
                    <Input
                      type="number"
                      min={1}
                      max={progress.totalWeeks}
                      value={shiftFromWeek}
                      onChange={(e) => setShiftFromWeek(e.target.value)}
                      className="h-8 w-24 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold">Số ngày cộng thêm</label>
                    <Input
                      type="number"
                      min={-90}
                      max={90}
                      value={shiftDays}
                      onChange={(e) => setShiftDays(e.target.value)}
                      className="h-8 w-24 text-xs"
                    />
                  </div>
                  <Button type="submit" size="xs" disabled={busy}>
                    Xác nhận dời lịch
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowShiftBox(false)}
                  >
                    Hủy
                  </Button>
                </form>
              )}

              {showTemplateBox && (
                <form
                  onSubmit={handleSaveTemplate}
                  className="flex flex-wrap items-end gap-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3"
                >
                  <div className="min-w-56 flex-1 space-y-1">
                    <label className="text-[11px] font-semibold">
                      Tên giáo trình mẫu (dùng cho các khóa mở sau)
                    </label>
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      required
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button type="submit" size="xs" disabled={busy}>
                    <Sparkles className="size-3.5" />
                    Lưu mẫu
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowTemplateBox(false)}
                  >
                    Hủy
                  </Button>
                </form>
              )}

              {/* Weekly Syllabus Cards */}
              <div className="space-y-2.5">
                {curriculumList.map((item) => {
                  const effStatus = resolveWeekStatus(item, classroom.currentWeekIndex);
                  const isCurrent = item.weekNumber === progress.currentWeek;
                  const isBeingTaught = isCurrent || effStatus === "in-progress";
                  const exec = health.weekExecutionMap[item.weekNumber];
                  const skillMeta = item.focusSkill ? SKILL_FOCUS_META[item.focusSkill] : null;

                  return (
                    <div
                      key={item.weekNumber}
                      className={`space-y-2 rounded-xl border p-3.5 ${
                        isBeingTaught
                          ? "border-primary bg-primary/5"
                          : effStatus === "completed"
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : effStatus === "postponed"
                              ? "border-amber-500/30 bg-amber-500/5"
                              : "border-border bg-card"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                              isBeingTaught
                                ? "bg-primary text-primary-foreground"
                                : effStatus === "completed"
                                  ? "bg-emerald-500/20 text-emerald-700"
                                  : effStatus === "postponed"
                                    ? "bg-amber-500/20 text-amber-700"
                                    : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {effStatus === "completed" ? (
                              <Check className="size-4" />
                            ) : (
                              item.weekNumber
                            )}
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold">Tuần {item.weekNumber}:</span>
                              <span className={isBeingTaught ? "font-semibold text-primary" : ""}>
                                {item.title}
                              </span>
                              {skillMeta && (
                                <Badge
                                  variant="outline"
                                  className={`px-1.5 py-0 text-[10px] ${skillMeta.badgeClass}`}
                                >
                                  {skillMeta.label}
                                </Badge>
                              )}
                              {item.isAssessmentMilestone && (
                                <Badge variant="gold" className="px-1.5 py-0 text-[10px]">
                                  <Award className="mr-0.5 size-2.5" />
                                  {item.assessmentTitle || "Bài kiểm tra"}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              {item.scheduledDate && (
                                <span>Dự kiến: {formatDisplayDate(item.scheduledDate)}</span>
                              )}
                              {item.completedDate && (
                                <span className="text-emerald-700">
                                  Hoàn thành: {formatDisplayDate(item.completedDate)}
                                </span>
                              )}
                              {item.focus && <span>Trọng tâm: {item.focus}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge
                            variant={
                              isBeingTaught
                                ? "default"
                                : effStatus === "completed"
                                  ? "success"
                                  : effStatus === "postponed"
                                    ? "warning"
                                    : "outline"
                            }
                            className="text-[10px]"
                          >
                            {isBeingTaught
                              ? "Đang dạy"
                              : effStatus === "completed"
                                ? "Hoàn thành"
                                : effStatus === "postponed"
                                  ? "Tạm hoãn"
                                  : "Chưa học"}
                          </Badge>
                          {!isBeingTaught && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => onAdvanceWeek(classroom, item.weekNumber)}
                              className="h-6 text-[11px] text-primary"
                            >
                              Dạy bài này
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => onOpenWeekModal(classroom, item)}
                            className="h-6 gap-1 px-2 text-[11px]"
                          >
                            <Edit3 className="size-3" />
                            Chi tiết &amp; TL
                          </Button>
                        </div>
                      </div>

                      {/* Real execution stats from teaching sessions */}
                      {exec && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/80 px-2.5 py-1.5 text-[11px]">
                          <div className="flex flex-wrap items-center gap-3">
                            <span>
                              Thực tế:{" "}
                              <strong>
                                {exec.sessionsCount}/{item.plannedSessions ?? 2} buổi
                              </strong>
                            </span>
                            {exec.attendanceRate !== null && (
                              <span>
                                Chuyên cần:{" "}
                                <strong className="text-emerald-700">{exec.attendanceRate}%</strong>
                              </span>
                            )}
                            {exec.homeworkRate !== null && (
                              <span>
                                Nộp BTVN: <strong className="text-primary">{exec.homeworkRate}%</strong>
                              </span>
                            )}
                          </div>
                          {exec.absentStudents.length > 0 && (
                            <span className="text-destructive">
                              Vắng học ({exec.absentStudents.length}):{" "}
                              {exec.absentStudents.map((a) => `${a.studentName} (${a.date})`).join(", ")}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Homework, Notes, Attachments (clean without duplicates) */}
                      {(item.homework ||
                        item.notes ||
                        (item.attachments && item.attachments.length > 0)) && (
                        <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/70 p-2.5 text-[11px]">
                          {item.homework && (
                            <p className="font-medium text-primary">
                              <strong>Bài tập về nhà:</strong> {item.homework}
                              {item.homeworkDueDate
                                ? ` (Hạn nộp: ${formatDisplayDate(item.homeworkDueDate)})`
                                : ""}
                            </p>
                          )}
                          {item.notes && (
                            <p className="flex items-start gap-1 text-amber-900">
                              <Lock className="mt-0.5 size-3 shrink-0" />
                              <span>
                                <strong>Ghi chú GV:</strong> {item.notes}
                              </span>
                            </p>
                          )}
                          {item.attachments && item.attachments.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <Paperclip className="size-3 text-primary" />
                                Tài liệu ({item.attachments.length}):
                              </span>
                              {item.attachments.map((att) => (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() => openAttachmentSafely(att)}
                                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[11px] hover:border-primary hover:text-primary"
                                >
                                  <span className="max-w-44 truncate">{att.name}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    ({att.size})
                                  </span>
                                  <Download className="size-2.5 shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= TAB 3: STUDENTS ROSTER ================= */}
          {activeTab === "students" && (
            <div className="space-y-3">
              {/* Actions & Filters */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <div className="relative min-w-44 flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      placeholder="Tìm học viên trong lớp..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <select
                    value={rosterStatusFilter}
                    onChange={(e) => setRosterStatusFilter(e.target.value)}
                    className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs"
                  >
                    <option value="all">Tất cả ({classStudents.length})</option>
                    <option value="active">Đang học ({health.activeCount})</option>
                    <option value="trial">Học thử ({health.trialCount})</option>
                    <option value="on-leave">Bảo lưu ({health.onLeaveCount})</option>
                    <option value="overdue">Quá hạn HP ({health.overdueCount})</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Button type="button" variant="outline" size="xs" onClick={handleExportCsv}>
                    <FileSpreadsheet className="size-3.5" />
                    Xuất CSV
                  </Button>
                  {classStudents.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => onOpenBulkTransfer(classStudents)}
                    >
                      <ArrowRightLeft className="size-3.5" />
                      Chuyển lớp hàng loạt
                    </Button>
                  )}
                  {availableStudentsToAssign.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={classStudents.length >= classroom.capacity}
                      onClick={() => setShowAssignForm((p) => !p)}
                    >
                      <Users className="size-3.5" />
                      Gán từ lớp khác
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    disabled={classStudents.length >= classroom.capacity}
                    onClick={() => onOpenAddStudent(classroom)}
                  >
                    <UserPlus className="size-3.5" />
                    Thêm học sinh mới
                  </Button>
                </div>
              </div>

              {showAssignForm && (
                <form
                  onSubmit={handleAssignSubmit}
                  className="grid gap-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:grid-cols-3"
                >
                  <select
                    value={assignStudentId}
                    onChange={(e) => setAssignStudentId(e.target.value)}
                    required
                    className="h-8 rounded-lg border border-input bg-background px-2 text-xs sm:col-span-2"
                  >
                    <option value="">-- Chọn học viên cần chuyển vào lớp {classroom.code} --</option>
                    {availableStudentsToAssign.map((s) => {
                      const curCls = allClasses.find((c) => c.id === s.classId);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.fullName} ({s.code}) — {curCls ? `Hiện ở ${curCls.code}` : "Chưa có lớp"}
                        </option>
                      );
                    })}
                  </select>
                  <div className="flex gap-1.5">
                    <Input
                      value={assignReason}
                      onChange={(e) => setAssignReason(e.target.value)}
                      placeholder="Lý do chuyển..."
                      className="h-8 text-xs"
                    />
                    <Button type="submit" size="xs" disabled={busy || !assignStudentId}>
                      Chuyển
                    </Button>
                  </div>
                </form>
              )}

              {filteredRosterStudents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
                  Không có học viên nào khớp điều kiện lọc trong lớp {classroom.code}.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRosterStudents.map((stu) => (
                    <button
                      key={stu.id}
                      type="button"
                      onClick={() => onOpenStudentDetail(stu)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-heading text-sm font-bold text-foreground">
                            {stu.fullName}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            ({stu.code})
                          </span>
                          {stu.status === "trial" && (
                            <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                              Học thử
                            </Badge>
                          )}
                          {stu.status === "on-leave" && (
                            <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                              Bảo lưu
                            </Badge>
                          )}
                          <Badge
                            variant={
                              stu.tuitionStatus === "paid"
                                ? "success"
                                : stu.tuitionStatus === "due-soon"
                                  ? "warning"
                                  : "destructive"
                            }
                            className="px-1.5 py-0 text-[10px]"
                          >
                            {stu.tuitionStatus === "paid"
                              ? "Đã đóng HP"
                              : stu.tuitionStatus === "due-soon"
                                ? "Sắp hạn HP"
                                : "Quá hạn HP"}
                          </Badge>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          Mục tiêu: {stu.targetGoal} · Chuyên cần: {stu.attendanceRate}%
                        </p>
                      </div>
                      <Badge variant="default" className="shrink-0 font-mono">
                        {stu.grades.length > 0 ? `TB ${stu.averageScore.toFixed(1)}` : "Chưa thi"}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 4: SESSIONS & ATTENDANCE ================= */}
          {activeTab === "sessions" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warm/35 p-3">
                <span className="font-semibold">
                  Nhật ký buổi học &amp; Điểm danh thực tế ({sortedClassSessions.length} buổi)
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    disabled={busy}
                    onClick={handleQuickCreateSession}
                  >
                    <CalendarPlus className="size-3.5" />
                    Tạo buổi học Tuần {progress.currentWeek}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    render={
                      <Link href={`/teaching-journal?classId=${encodeURIComponent(classroom.id)}`} />
                    }
                    nativeButton={false}
                  >
                    <BookOpen className="size-3.5" />
                    Mở Nhật ký giảng dạy
                  </Button>
                </div>
              </div>

              {sortedClassSessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
                  Chưa có buổi học nào được ghi nhận. Bấm &ldquo;Tạo buổi học Tuần {progress.currentWeek}&rdquo; hoặc thực hiện Điểm danh nhanh để khởi tạo.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <select
                      value={currentSession?.id ?? ""}
                      onChange={(e) => setSelectedSessionId(e.target.value)}
                      className="h-8 flex-1 rounded-lg border border-input bg-background px-2.5 text-xs font-semibold"
                    >
                      {sortedClassSessions.map((ses) => (
                        <option key={ses.id} value={ses.id}>
                          {formatDisplayDate(ses.date)} ({ses.dayLabel}) — Tuần {ses.weekNumber}: {ses.topic}
                        </option>
                      ))}
                    </select>
                    {currentSession && (
                      <Badge
                        variant={currentSession.journalStatus === "completed" ? "success" : "outline"}
                        className="text-[10px]"
                      >
                        {currentSession.journalStatus === "completed"
                          ? "Nhật ký hoàn thành"
                          : "Bản nháp"}
                      </Badge>
                    )}
                  </div>

                  {currentSession && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-border bg-background p-3">
                        <p className="font-heading text-sm font-bold">
                          Tuần {currentSession.weekNumber}: {currentSession.topic}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {currentSession.startTime}–{currentSession.endTime} · {currentSession.room}
                        </p>
                        {currentSession.homework && (
                          <p className="mt-1.5 text-[11px] font-medium text-primary">
                            BTVN: {currentSession.homework}
                          </p>
                        )}
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-border bg-background">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase text-muted-foreground">
                              <th className="px-3 py-2">Học viên</th>
                              <th className="px-3 py-2 text-center">Điểm danh</th>
                              <th className="px-3 py-2 text-center">BTVN</th>
                              <th className="px-3 py-2">Nhận xét buổi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {currentSession.studentRecords.map((rec) => (
                              <tr key={rec.studentId}>
                                <td className="px-3 py-2 font-semibold">
                                  {rec.studentName}{" "}
                                  <span className="font-mono text-[10px] font-normal text-muted-foreground">
                                    ({rec.studentCode})
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <Badge
                                    variant={
                                      rec.attendance === "present"
                                        ? "success"
                                        : rec.attendance === "absent"
                                          ? "destructive"
                                          : "outline"
                                    }
                                    className="text-[10px]"
                                  >
                                    {rec.attendance === "present"
                                      ? "Có mặt"
                                      : rec.attendance === "late"
                                        ? "Đi muộn"
                                        : rec.attendance === "excused"
                                          ? "Có phép"
                                          : "Vắng"}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-center text-[11px]">
                                  {rec.homeworkStatus === "submitted"
                                    ? "Đã nộp"
                                    : rec.homeworkStatus === "not-submitted"
                                      ? "Chưa nộp"
                                      : rec.homeworkStatus === "exempt"
                                        ? "Miễn"
                                        : "—"}
                                </td>
                                <td className="px-3 py-2 text-[11px] text-muted-foreground">
                                  {rec.teacherFeedback || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ================= TAB 5: ASSESSMENTS & MILESTONES ================= */}
          {activeTab === "assessments" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warm/35 p-3">
                <div>
                  <p className="font-semibold text-foreground">
                    Cột mốc Kiểm tra trong Khung chương trình &amp; Kết quả lớp
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Bấm &ldquo;Nhập điểm lớp&rdquo; để đi thẳng tới Bảng điểm gắn sẵn tên bài kiểm tra của cột mốc.
                  </p>
                </div>
                <Button
                  type="button"
                  size="xs"
                  render={<Link href={`/grades?classId=${encodeURIComponent(classroom.id)}`} />}
                  nativeButton={false}
                >
                  <BarChart3 className="size-3.5" />
                  Mở Bảng điểm lớp
                </Button>
              </div>

              {assessmentSummaryList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
                  Chưa có cột mốc kiểm tra nào được gắn trên khung chương trình lớp {classroom.code}.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {assessmentSummaryList.map((item) => (
                    <div
                      key={item.title}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Award className="size-4 text-amber-600" />
                          <span className="font-heading text-sm font-bold text-foreground">
                            {item.title}
                          </span>
                          {item.weekNumber && (
                            <Badge variant="outline" className="text-[10px]">
                              Tuần {item.weekNumber}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Đã chấm:{" "}
                          <strong className="text-foreground">
                            {item.gradedCount}/{classStudents.length} học viên
                          </strong>
                          {item.avgScore !== null && (
                            <>
                              {" "}
                              · Điểm TB: <strong className="text-primary">{item.avgScore.toFixed(1)}</strong>
                            </>
                          )}
                          {item.scheduledDate && ` · Dự kiến: ${formatDisplayDate(item.scheduledDate)}`}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        render={
                          <Link
                            href={`/grades?classId=${encodeURIComponent(classroom.id)}&assessment=${encodeURIComponent(item.title)}`}
                          />
                        }
                        nativeButton={false}
                      >
                        <Plus className="size-3.5" />
                        Nhập điểm cột mốc này
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}

export function ClassDetailModal({ classroom, ...props }: ClassDetailModalProps) {
  if (!classroom) return null;
  return (
    <ClassDetailModalInner
      key={`${classroom.id}-${props.initialTab ?? "overview"}`}
      classroom={classroom}
      {...props}
    />
  );
}
