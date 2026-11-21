"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Grid3X3, Save, UserCheck } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { useTodayIso } from "@/lib/use-today-iso";
import {
  computeAttendanceStats,
  formatAttendanceDateVi,
  type AttendanceSnapshotResult,
  type AttendanceStatusValue,
  type PendingAttendanceItem,
} from "@/services/attendance-helpers";
import type {
  AdminStudentRecord,
  ClassroomGroup,
  WeeklyClassSession,
} from "@/services/classroom-data";
import { AttendanceKpiStrip } from "@/components/admin/attendance/attendance-kpi-strip";
import { AttendanceMatrixTab } from "@/components/admin/attendance/attendance-matrix-tab";
import { AttendanceParentNoticeModal } from "@/components/admin/attendance/attendance-parent-notice-modal";
import { AttendancePendingQueue } from "@/components/admin/attendance/attendance-pending-queue";
import {
  AttendanceRosterPanel,
  type StudentAttendanceRowItem,
} from "@/components/admin/attendance/attendance-roster-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface AttendanceGetResponse {
  classes: ClassroomGroup[];
  sessions: WeeklyClassSession[];
  students: AdminStudentRecord[];
  snapshot: AttendanceSnapshotResult | null;
  pendingQueue: PendingAttendanceItem[];
}

function AttendanceWorkspace() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const urlClassId = searchParams.get("classId") ?? "";
  const urlDate = searchParams.get("date") ?? "";
  const urlSessionId = searchParams.get("sessionId") ?? "";

  const [activeTab, setActiveTab] = React.useState<"quick" | "matrix">("quick");
  const [classes, setClasses] = React.useState<ClassroomGroup[]>([]);
  const [weeklySessions, setWeeklySessions] = React.useState<WeeklyClassSession[]>([]);
  const [pendingQueue, setPendingQueue] = React.useState<PendingAttendanceItem[]>([]);
  const [students, setStudents] = React.useState<AdminStudentRecord[]>([]);
  const [snapshot, setSnapshot] = React.useState<AttendanceSnapshotResult | null>(null);
  const [loading, setLoading] = React.useState(true);

  const todayIso = useTodayIso();
  const [selectedClassId, setSelectedClassId] = React.useState<string>(urlClassId);
  const [selectedSessionId, setSelectedSessionId] = React.useState<string>(urlSessionId);
  const [selectedExceptionId, setSelectedExceptionId] = React.useState<string>("");
  const [sessionDateOverride, setSessionDate] = React.useState<string | null>(() =>
    urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) ? urlDate : null,
  );
  const sessionDate = sessionDateOverride ?? todayIso;

  const [roster, setRoster] = React.useState<StudentAttendanceRowItem[]>([]);
  const [savedEntries, setSavedEntries] = React.useState<
    Record<string, { status: AttendanceStatusValue; note: string }>
  >({});
  const [saving, setSaving] = React.useState(false);
  const [parentNoticeOpen, setParentNoticeOpen] = React.useState(false);
  const [reloadNonce, setReloadNonce] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (selectedClassId) params.set("classId", selectedClassId);
    if (selectedSessionId) params.set("sessionId", selectedSessionId);
    if (sessionDate) params.set("date", sessionDate);
    params.set("daysBack", "7");

    apiRequest<AttendanceGetResponse>(`/api/admin/attendance?${params.toString()}`)
      .then((payload) => {
        if (!active) return;

        const activeClasses = (payload.classes ?? []).filter(
          (c) => c.status !== "archived" && c.status !== "completed",
        );
        setClasses(activeClasses);
        setWeeklySessions(payload.sessions ?? []);
        setPendingQueue(payload.pendingQueue ?? []);

        const resolvedClassId =
          selectedClassId && activeClasses.some((c) => c.id === selectedClassId)
            ? selectedClassId
            : activeClasses[0]?.id ?? "";

        if (resolvedClassId && resolvedClassId !== selectedClassId) {
          setSelectedClassId(resolvedClassId);
          return;
        }

        const classStudents = (payload.students ?? []).filter(
          (stu) =>
            stu.status !== "archived" &&
            stu.status !== "on-leave" &&
            (!resolvedClassId || stu.classId === resolvedClassId),
        );
        setStudents(classStudents);
        setSnapshot(payload.snapshot ?? null);

        const snapEntries = payload.snapshot?.entries ?? {};
        setSavedEntries(snapEntries);
        setRoster(
          classStudents.map((stu) => {
            const hit = snapEntries[stu.id];
            return {
              studentId: stu.id,
              code: stu.code,
              fullName: stu.fullName,
              status: hit?.status ?? "present",
              note: hit?.note ?? "",
            };
          }),
        );
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        toast({
          variant: "error",
          title: "Không thể tải dữ liệu điểm danh",
          description: err instanceof Error ? err.message : undefined,
        });
      });

    return () => {
      active = false;
    };
  }, [selectedClassId, selectedSessionId, sessionDate, reloadNonce, toast]);

  const selectedClassroom = React.useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  const sessionOptions = React.useMemo(() => {
    const options: Array<{
      value: string;
      label: string;
      exceptionId?: string;
    }> = [];

    const dayOccs = snapshot?.dayOccurrences ?? [];
    for (const occ of dayOccs) {
      const sesVal = occ.sessionId ?? occ.occurrenceKey;
      const prefix =
        occ.status === "canceled"
          ? "[Tạm nghỉ] "
          : occ.source === "makeup"
            ? "[Dạy bù] "
            : occ.source === "rescheduled"
              ? "[Đổi lịch] "
              : "";
      options.push({
        value: sesVal,
        label: `${prefix}${occ.dayLabel} (${occ.startTime}–${occ.endTime}) · ${occ.topic}`,
        exceptionId: occ.scheduleExceptionId,
      });
    }

    if (selectedClassroom) {
      for (const ws of weeklySessions) {
        if (ws.classCode.toUpperCase() !== selectedClassroom.code.toUpperCase()) {
          continue;
        }
        if (options.some((o) => o.value === ws.id)) continue;
        options.push({
          value: ws.id,
          label: `Lịch cố định: ${ws.dayLabel} (${ws.startTime}–${ws.endTime}) · ${ws.topic}`,
        });
      }
    }

    if (options.length === 0 && selectedClassId) {
      options.push({
        value: `manual-${selectedClassId}`,
        label: "Buổi học bổ sung / Ngoài lịch cố định",
      });
    }

    return options;
  }, [snapshot, selectedClassroom, weeklySessions, selectedClassId]);

  const effectiveSessionId = React.useMemo(() => {
    if (sessionOptions.some((o) => o.value === selectedSessionId)) {
      return selectedSessionId;
    }
    return sessionOptions[0]?.value ?? "";
  }, [sessionOptions, selectedSessionId]);

  const effectiveExceptionId = React.useMemo(() => {
    const matchedOption = sessionOptions.find(
      (o) => o.value === effectiveSessionId,
    );
    return selectedExceptionId || matchedOption?.exceptionId || "";
  }, [sessionOptions, effectiveSessionId, selectedExceptionId]);

  const studentStatusMap = React.useMemo(
    () => new Map(students.map((s) => [s.id, s.status])),
    [students],
  );

  const stats = React.useMemo(() => computeAttendanceStats(roster), [roster]);

  const isDirty = React.useMemo(() => {
    if (!snapshot?.alreadyRecorded) {
      return roster.some((r) => r.status !== "present" || r.note.trim() !== "");
    }
    return roster.some((r) => {
      const prev = savedEntries[r.studentId];
      if (!prev) return r.status !== "present" || r.note.trim() !== "";
      return prev.status !== r.status || (prev.note ?? "") !== r.note;
    });
  }, [snapshot, roster, savedEntries]);

  const isCanceledDate = Boolean(snapshot?.isCanceledDate);

  const handleSetStatus = (studentId: string, status: AttendanceStatusValue) => {
    setRoster((prev) =>
      prev.map((item) =>
        item.studentId === studentId ? { ...item, status } : item,
      ),
    );
  };

  const handleSetNote = (studentId: string, note: string) => {
    setRoster((prev) =>
      prev.map((item) =>
        item.studentId === studentId ? { ...item, note } : item,
      ),
    );
  };

  const handleMarkAllPresent = () => {
    setRoster((prev) =>
      prev.map((item) => ({ ...item, status: "present", note: "" })),
    );
    toast({
      variant: "info",
      title: "Đã đánh dấu tất cả Có mặt",
      description: `Toàn bộ ${roster.length} học viên lớp ${selectedClassroom?.code ?? ""} đã được chọn Có mặt.`,
    });
  };

  const handleSelectPendingItem = (item: PendingAttendanceItem) => {
    setLoading(true);
    setSelectedClassId(item.classId);
    setSessionDate(item.date);
    setSelectedSessionId(item.sessionId);
    setSelectedExceptionId(item.scheduleExceptionId ?? "");
    setActiveTab("quick");
  };

  const handleSaveAttendance = async () => {
    if (!selectedClassId || roster.length === 0) return;

    setSaving(true);
    try {
      const res = await apiRequest<{
        attendanceRate: number;
        recordedCount: number;
        classSessionId?: string;
      }>("/api/admin/attendance", {
        method: "POST",
        body: JSON.stringify({
          classId: selectedClassId,
          sessionId: effectiveSessionId || `manual-${selectedClassId}`,
          scheduleExceptionId: effectiveExceptionId || undefined,
          date: sessionDate,
          entries: roster.map((r) => ({
            studentId: r.studentId,
            status: r.status,
            note: r.note,
          })),
        }),
      });

      toast({
        variant: "success",
        title: "Đã lưu sổ điểm danh thành công",
        description: res.classSessionId
          ? `Tỷ lệ chuyên cần ${res.attendanceRate}% (${res.recordedCount} HV) · Đã đồng bộ sang Nhật ký Giảng dạy.`
          : `Tỷ lệ chuyên cần ca học đạt ${res.attendanceRate}% (${res.recordedCount} HV).`,
      });
      setReloadNonce((n) => n + 1);
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể lưu điểm danh",
        description:
          err instanceof Error
            ? err.message
            : "Vui lòng kiểm tra dữ liệu hoặc ngày nghỉ trên Thời khóa biểu.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Điểm danh Ca học nhanh
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn lớp cụ thể → Chọn ca học thực tế (kể cả dạy bù/đổi lịch) → Điểm danh 1 chạm và đồng bộ hai chiều với Nhật ký Giảng dạy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <div className="inline-flex shrink-0 rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("quick")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === "quick"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserCheck className="size-3.5" aria-hidden="true" />
              Điểm danh nhanh
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === "matrix"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid3X3 className="size-3.5" aria-hidden="true" />
              Sổ điểm danh (Ma trận)
            </button>
          </div>

          {activeTab === "quick" && (
            <Button
              type="button"
              disabled={saving || isCanceledDate || roster.length === 0}
              onClick={() => void handleSaveAttendance()}
              className="h-9 shrink-0 px-3.5 whitespace-nowrap"
            >
              <Save className="size-4" aria-hidden="true" />
              {saving ? "Đang lưu..." : "Lưu điểm danh"}
            </Button>
          )}
        </div>
      </div>

      {activeTab === "quick" ? (
        <>
          <AttendancePendingQueue
            items={pendingQueue}
            activeClassId={selectedClassId}
            activeDate={sessionDate}
            onSelect={handleSelectPendingItem}
          />

          {/* Session & Class Selector Bar */}
          <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="att-class-select"
                className="block text-xs font-semibold text-foreground"
              >
                1. Chọn lớp học (Bắt buộc)
              </label>
              <select
                id="att-class-select"
                value={selectedClassId}
                onChange={(e) => {
                  setLoading(true);
                  setSelectedClassId(e.target.value);
                  setSelectedSessionId("");
                  setSelectedExceptionId("");
                }}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
              >
                {classes.length === 0 && (
                  <option value="">Không có lớp đang hoạt động</option>
                )}
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.code} — {cls.name} ({cls.enrolled} HV)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="att-session-select"
                className="block text-xs font-semibold text-foreground"
              >
                2. Chọn ca học ({formatAttendanceDateVi(sessionDate)})
              </label>
              <select
                id="att-session-select"
                value={effectiveSessionId}
                onChange={(e) => {
                  const chosen = sessionOptions.find(
                    (o) => o.value === e.target.value,
                  );
                  setSelectedSessionId(e.target.value);
                  setSelectedExceptionId(chosen?.exceptionId ?? "");
                }}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
              >
                {sessionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="att-date-input"
                className="block text-xs font-semibold text-foreground"
              >
                3. Ngày điểm danh
              </label>
              <Input
                id="att-date-input"
                type="date"
                value={sessionDate}
                onChange={(e) => {
                  setLoading(true);
                  setSessionDate(e.target.value);
                  setSelectedExceptionId("");
                }}
                className="h-9"
              />
            </div>
          </div>

          <AttendanceKpiStrip
            stats={stats}
            alreadyRecorded={Boolean(snapshot?.alreadyRecorded)}
            isDirty={isDirty}
            isCanceledDate={isCanceledDate}
          />

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          ) : (
            <AttendanceRosterPanel
              classroom={selectedClassroom}
              sessionDate={sessionDate}
              roster={roster}
              onLeaveStudents={snapshot?.onLeaveStudents ?? []}
              consecutiveAbsencesByStudentId={
                snapshot?.consecutiveAbsencesByStudentId ?? {}
              }
              studentStatusMap={studentStatusMap}
              isCanceledDate={isCanceledDate}
              canceledReason={snapshot?.canceledReason}
              alreadyRecorded={Boolean(snapshot?.alreadyRecorded)}
              isDirty={isDirty}
              saving={saving}
              classSessionId={snapshot?.classSessionId}
              onSetStatus={handleSetStatus}
              onSetNote={handleSetNote}
              onMarkAllPresent={handleMarkAllPresent}
              onOpenParentNotice={() => setParentNoticeOpen(true)}
              onSave={() => void handleSaveAttendance()}
            />
          )}

          <AttendanceParentNoticeModal
            open={parentNoticeOpen}
            classCode={selectedClassroom?.code ?? "LỚP"}
            className={selectedClassroom?.name ?? "Lớp học"}
            date={sessionDate}
            sessionLabel={
              sessionOptions.find((o) => o.value === effectiveSessionId)?.label
            }
            entries={roster.map((r) => ({
              studentCode: r.code,
              fullName: r.fullName,
              status: r.status,
              note: r.note,
            }))}
            onClose={() => setParentNoticeOpen(false)}
          />
        </>
      ) : (
        <AttendanceMatrixTab
          classrooms={classes}
          selectedClassId={selectedClassId}
          onChangeClassId={(nextId) => {
            setSelectedClassId(nextId);
            setSelectedSessionId("");
            setSelectedExceptionId("");
          }}
        />
      )}
    </div>
  );
}

export default function AdminAttendancePage() {
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
      <AttendanceWorkspace />
    </React.Suspense>
  );
}
