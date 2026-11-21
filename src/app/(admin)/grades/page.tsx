"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, Download, History, Plus } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { useTodayIso } from "@/lib/use-today-iso";
import type {
  AdminStudentRecord,
  ClassroomGroup,
} from "@/services/classroom-data";
import {
  buildGradesCsv,
  computeAssessmentSkillAverages,
  computeStudentGradeDelta,
  type AssessmentSummaryItem,
  type GradeAuditEntry,
  type GradePublishStatus,
} from "@/services/grade-helpers";
import { GradesAssessmentModal } from "@/components/admin/grades/grades-assessment-modal";
import { GradesAuditTab } from "@/components/admin/grades/grades-audit-tab";
import {
  GradesEntryTable,
  parseRowNumericScores,
  type DraftGradeRow,
} from "@/components/admin/grades/grades-entry-table";
import { GradesKpiStrip } from "@/components/admin/grades/grades-kpi-strip";
import { GradesParentReportModal } from "@/components/admin/grades/grades-parent-report-modal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface GradesApiResponse {
  assessments: string[];
  classes: ClassroomGroup[];
  students: AdminStudentRecord[];
  assessmentStats: AssessmentSummaryItem[];
  changeHistory: GradeAuditEntry[];
}

function buildRowsForAssessment(
  students: AdminStudentRecord[],
  assessmentTitle: string,
): DraftGradeRow[] {
  return students
    .filter((stu) => stu.status !== "archived" && stu.status !== "on-leave")
    .map((stu) => {
      const matched = stu.grades.find(
        (g) => g.assessmentTitle === assessmentTitle,
      );
      return {
        studentId: stu.id,
        code: stu.code,
        fullName: stu.fullName,
        classId: stu.classId,
        className: stu.className,
        studentStatus: stu.status,
        grades: stu.grades,
        gradeId: matched?.id,
        date: matched?.date,
        listening: matched ? String(matched.listening) : "",
        reading: matched ? String(matched.reading) : "",
        writing: matched ? String(matched.writing) : "",
        speaking: matched ? String(matched.speaking) : "",
        comment: matched?.comment ?? "",
        privateNote: matched?.privateNote ?? "",
        status: matched ? (matched.status ?? "published") : "ungraded",
      };
    });
}

function GradesWorkspace() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialClassId = searchParams.get("classId") ?? "all";
  const initialAssessment = searchParams.get("assessment") ?? "";

  const [activeTab, setActiveTab] = React.useState<"entry" | "audit">("entry");
  const [classes, setClasses] = React.useState<ClassroomGroup[]>([]);
  const [students, setStudents] = React.useState<AdminStudentRecord[]>([]);
  const [assessments, setAssessments] = React.useState<string[]>([]);
  const [assessmentStats, setAssessmentStats] = React.useState<
    AssessmentSummaryItem[]
  >([]);
  const [changeHistory, setChangeHistory] = React.useState<GradeAuditEntry[]>(
    [],
  );
  const [selectedAssessment, setSelectedAssessment] =
    React.useState<string>(initialAssessment);
  const todayIso = useTodayIso();
  const [selectedClassId, setSelectedClassId] =
    React.useState<string>(initialClassId);
  const [examDateOverride, setExamDate] = React.useState<string | null>(null);
  const examDate = examDateOverride ?? todayIso;
  const [changeReason, setChangeReason] = React.useState("");
  const [rows, setRows] = React.useState<DraftGradeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [isNewTestModalOpen, setIsNewTestModalOpen] = React.useState(false);
  const [reportTargetIds, setReportTargetIds] = React.useState<
    string[] | null
  >(null);
  const [deletingGradeRow, setDeletingGradeRow] =
    React.useState<DraftGradeRow | null>(null);

  const fetchGradesWorkspace = React.useCallback(async () => {
    return apiRequest<GradesApiResponse>("/api/admin/grades");
  }, []);

  React.useEffect(() => {
    let active = true;
    fetchGradesWorkspace()
      .then((data) => {
        if (!active) return;
        const nextAssessments =
          initialAssessment && !data.assessments.includes(initialAssessment)
            ? [initialAssessment, ...data.assessments]
            : data.assessments;
        const resolvedAssessment =
          initialAssessment || nextAssessments[0] || "";

        setClasses(data.classes ?? []);
        setStudents(data.students ?? []);
        setAssessments(nextAssessments);
        setAssessmentStats(data.assessmentStats ?? []);
        setChangeHistory(data.changeHistory ?? []);
        setSelectedAssessment(resolvedAssessment);
        setRows(buildRowsForAssessment(data.students ?? [], resolvedAssessment));
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        toast({
          variant: "error",
          title: "Không thể tải dữ liệu Bảng điểm",
          description: err instanceof Error ? err.message : undefined,
        });
      });

    return () => {
      active = false;
    };
  }, [fetchGradesWorkspace, initialAssessment, toast]);

  const reloadWorkspace = async (overrideAssessment?: string) => {
    const data = await fetchGradesWorkspace();
    const targetTitle =
      overrideAssessment ??
      (data.assessments.includes(selectedAssessment)
        ? selectedAssessment
        : data.assessments[0] ?? "");
    setClasses(data.classes ?? []);
    setStudents(data.students ?? []);
    setAssessments(data.assessments ?? []);
    setAssessmentStats(data.assessmentStats ?? []);
    setChangeHistory(data.changeHistory ?? []);
    setSelectedAssessment(targetTitle);
    setRows(buildRowsForAssessment(data.students ?? [], targetTitle));
  };

  // Declare all useMemo BEFORE handlers (React Compiler rule)
  const scopedRows = React.useMemo(() => {
    if (selectedClassId === "all") return rows;
    return rows.filter((r) => r.classId === selectedClassId);
  }, [rows, selectedClassId]);

  const onLeaveCountInScope = React.useMemo(() => {
    return students.filter(
      (s) =>
        s.status === "on-leave" &&
        (selectedClassId === "all" || s.classId === selectedClassId),
    ).length;
  }, [students, selectedClassId]);

  const averages = React.useMemo(
    () =>
      computeAssessmentSkillAverages(
        scopedRows.map((r) => {
          const parsed = parseRowNumericScores(r);
          return {
            listening: parsed.listening,
            reading: parsed.reading,
            writing: parsed.writing,
            speaking: parsed.speaking,
            overall: parsed.overall,
            status: r.status,
          };
        }),
      ),
    [scopedRows],
  );

  const reportModalEntries = React.useMemo(() => {
    if (!reportTargetIds) return [];
    const targetSet =
      reportTargetIds.length > 0 ? new Set(reportTargetIds) : null;

    return scopedRows
      .filter((r) => !targetSet || targetSet.has(r.studentId))
      .map((r) => {
        const parsed = parseRowNumericScores(r);
        if (
          !parsed.isGraded ||
          parsed.listening === null ||
          parsed.reading === null ||
          parsed.writing === null ||
          parsed.speaking === null ||
          parsed.overall === null
        ) {
          return null;
        }
        const { delta } = computeStudentGradeDelta(
          { grades: r.grades },
          selectedAssessment,
          parsed.overall,
        );
        return {
          code: r.code,
          fullName: r.fullName,
          className: r.className,
          listening: parsed.listening,
          reading: parsed.reading,
          writing: parsed.writing,
          speaking: parsed.speaking,
          overall: parsed.overall,
          comment: r.comment,
          delta,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [reportTargetIds, scopedRows, selectedAssessment]);

  const handleAssessmentSwitch = (nextTitle: string) => {
    setSelectedAssessment(nextTitle);
    setRows(buildRowsForAssessment(students, nextTitle));
    setChangeReason("");
    setActiveTab("entry");
  };

  const handleScoreChange = (
    studentId: string,
    skill: "listening" | "reading" | "writing" | "speaking",
    value: string,
  ) => {
    if (value !== "" && (Number(value) < 0 || Number(value) > 9)) return;
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, [skill]: value } : r)),
    );
  };

  const handleCommentChange = (studentId: string, comment: string) => {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, comment } : r)),
    );
  };

  const handlePrivateNoteChange = (studentId: string, privateNote: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.studentId === studentId ? { ...r, privateNote } : r,
      ),
    );
  };

  const handleSaveBatch = async (targetStatus: GradePublishStatus) => {
    if (!selectedAssessment) return;

    const validEntries = scopedRows
      .map((row) => {
        const parsed = parseRowNumericScores(row);
        if (!parsed.isGraded) return null;
        return {
          studentId: row.studentId,
          listening: parsed.listening!,
          reading: parsed.reading!,
          writing: parsed.writing!,
          speaking: parsed.speaking!,
          comment: row.comment.trim(),
          privateNote: row.privateNote.trim() || undefined,
          status: targetStatus,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (validEntries.length === 0) {
      toast({
        variant: "warning",
        title: "Chưa có học viên nào được nhập đủ 4 điểm kỹ năng",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest<{
        updatedCount: number;
        students: AdminStudentRecord[];
      }>("/api/admin/grades", {
        method: "POST",
        body: JSON.stringify({
          action: "batch-grades",
          assessmentTitle: selectedAssessment,
          date: examDate,
          status: targetStatus,
          reason: changeReason.trim() || undefined,
          entries: validEntries,
        }),
      });
      setStudents(res.students);
      setRows(buildRowsForAssessment(res.students, selectedAssessment));
      setChangeReason("");
      await reloadWorkspace(selectedAssessment);
      toast({
        variant: "success",
        title:
          targetStatus === "published"
            ? "Đã lưu & công bố điểm lên Cổng Học sinh"
            : "Đã lưu bảng điểm ở trạng thái Bản nháp",
        description: `Cập nhật ${res.updatedCount} học viên cho kỳ "${selectedAssessment}".`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Lưu bảng điểm thất bại",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGradeConfirmed = async () => {
    if (!deletingGradeRow?.gradeId) return;
    const row = deletingGradeRow;
    try {
      const params = new URLSearchParams({
        action: "delete-grade",
        studentId: row.studentId,
        gradeId: row.gradeId!,
        reason: changeReason.trim() || "Xóa điểm từ Bảng nhập điểm",
      });
      await apiRequest(`/api/admin/grades?${params.toString()}`, {
        method: "DELETE",
      });
      await reloadWorkspace(selectedAssessment);
      toast({
        variant: "success",
        title: `Đã xóa điểm kỳ "${selectedAssessment}" của ${row.fullName}`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể xóa bản ghi điểm",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeletingGradeRow(null);
    }
  };

  const handleExportCsv = () => {
    if (scopedRows.length === 0) return;
    const csv = buildGradesCsv({
      assessmentTitle: selectedAssessment,
      rows: scopedRows.map((r) => {
        const parsed = parseRowNumericScores(r);
        return {
          code: r.code,
          fullName: r.fullName,
          className: r.className,
          date: r.date ?? examDate,
          status: r.status,
          listening: parsed.listening,
          reading: parsed.reading,
          writing: parsed.writing,
          speaking: parsed.speaking,
          overall: parsed.overall,
          comment: r.comment,
        };
      }),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bang-diem-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({
      variant: "success",
      title: `Đã xuất CSV bảng điểm (${scopedRows.length} học viên)`,
    });
  };

  const selectedClassLabel =
    selectedClassId === "all"
      ? undefined
      : classes.find((c) => c.id === selectedClassId)?.name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản lý Điểm số & Nhận xét chuyên môn
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập điểm 4 kỹ năng chuẩn IELTS (0–9), quản lý Bản nháp / Công bố Cổng HS và theo dõi lịch sử điều chỉnh điểm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <div className="inline-flex shrink-0 rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("entry")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === "entry"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardCheck className="size-3.5" aria-hidden="true" />
              Bảng nhập điểm
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === "audit"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="size-3.5" aria-hidden="true" />
              Kỳ thi & Lịch sử ({changeHistory.length})
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportCsv}
            disabled={loading || scopedRows.length === 0}
            className="h-9 shrink-0 px-3.5 whitespace-nowrap"
          >
            <Download className="size-4" aria-hidden="true" />
            Xuất CSV
          </Button>
          <Button
            type="button"
            onClick={() => setIsNewTestModalOpen(true)}
            className="h-9 shrink-0 px-3.5 whitespace-nowrap"
          >
            <Plus className="size-4" aria-hidden="true" />
            Tạo kỳ thi mới
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : activeTab === "entry" ? (
        <>
          {/* Assessment, Class & Date Selector */}
          <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 lg:grid-cols-12">
            <div className="space-y-1.5 lg:col-span-5">
              <label
                htmlFor="grade-assessment-select"
                className="block text-xs font-semibold text-foreground"
              >
                Kỳ kiểm tra / Bài đánh giá
              </label>
              <select
                id="grade-assessment-select"
                value={selectedAssessment}
                onChange={(e) => handleAssessmentSwitch(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
              >
                {assessments.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 lg:col-span-4">
              <label
                htmlFor="grade-class-select"
                className="block text-xs font-semibold text-foreground"
              >
                Lọc theo lớp học
              </label>
              <select
                id="grade-class-select"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
              >
                <option value="all">Tất cả các lớp ({rows.length} HV)</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.code} — {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 lg:col-span-3">
              <label
                htmlFor="grade-exam-date"
                className="block text-xs font-semibold text-foreground"
              >
                Ngày thi / Chấm điểm
              </label>
              <Input
                id="grade-exam-date"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <GradesKpiStrip averages={averages} />

          <GradesEntryTable
            assessmentTitle={selectedAssessment}
            rows={scopedRows}
            onLeaveCountInScope={onLeaveCountInScope}
            saving={saving}
            changeReason={changeReason}
            onChangeReason={setChangeReason}
            onScoreChange={handleScoreChange}
            onCommentChange={handleCommentChange}
            onPrivateNoteChange={handlePrivateNoteChange}
            onSaveBatch={(st) => void handleSaveBatch(st)}
            onOpenReport={(ids) => setReportTargetIds(ids ?? [])}
            onRequestDeleteGrade={(row) => setDeletingGradeRow(row)}
          />
        </>
      ) : (
        <GradesAuditTab
          assessmentStats={assessmentStats}
          changeHistory={changeHistory}
          onOpenAssessment={handleAssessmentSwitch}
          onRefresh={() => reloadWorkspace()}
        />
      )}

      <GradesAssessmentModal
        open={isNewTestModalOpen}
        onClose={() => setIsNewTestModalOpen(false)}
        onCreated={(title, nextAssessments, defaultDate) => {
          setAssessments(nextAssessments);
          setSelectedAssessment(title);
          setExamDate(defaultDate);
          setRows(buildRowsForAssessment(students, title));
          setIsNewTestModalOpen(false);
          setActiveTab("entry");
          void reloadWorkspace(title);
        }}
      />

      <GradesParentReportModal
        open={reportTargetIds !== null}
        assessmentTitle={selectedAssessment}
        date={examDate}
        classLabel={selectedClassLabel}
        entries={reportModalEntries}
        onClose={() => setReportTargetIds(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingGradeRow)}
        onClose={() => setDeletingGradeRow(null)}
        onConfirm={() => void handleDeleteGradeConfirmed()}
        variant="destructive"
        title="Xác nhận xóa bản ghi điểm"
        description={
          deletingGradeRow
            ? `Xóa điểm kỳ "${selectedAssessment}" của học viên ${deletingGradeRow.fullName} (${deletingGradeRow.code})? Điểm trung bình của học viên sẽ được tính lại tự động.`
            : ""
        }
        confirmLabel="Xóa điểm"
      />
    </div>
  );
}

export default function AdminGradesPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      }
    >
      <GradesWorkspace />
    </React.Suspense>
  );
}
