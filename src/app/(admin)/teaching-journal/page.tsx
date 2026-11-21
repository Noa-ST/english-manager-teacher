"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Download, Plus, RefreshCw, Search } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { removeVietnameseTones } from "@/lib/utils";
import type {
  AdminStudentRecord,
  ClassSessionRecord,
  ClassroomGroup,
  JournalStatus,
  PendingScheduleJournalItem,
  WeeklyClassSession,
} from "@/services/classroom-data";
import { buildTeachingJournalCsv } from "@/services/teaching-journal-helpers";
import { JournalCreateModal } from "@/components/admin/teaching-journal/journal-create-modal";
import { JournalEditorModal } from "@/components/admin/teaching-journal/journal-editor-modal";
import { JournalKpiStrip } from "@/components/admin/teaching-journal/journal-kpi-strip";
import { JournalSessionTable } from "@/components/admin/teaching-journal/journal-session-table";
import { ParentDigestModal } from "@/components/admin/teaching-journal/parent-digest-modal";
import { PendingSessionsBanner } from "@/components/admin/teaching-journal/pending-sessions-banner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

function TeachingJournalWorkspace() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const urlClassId = searchParams.get("classId") ?? "";
  const urlDate = searchParams.get("date") ?? "";
  const urlCreate = searchParams.get("create") ?? "";
  const urlSessionId = searchParams.get("sessionId") ?? "";

  const [sessions, setSessions] = React.useState<ClassSessionRecord[]>([]);
  const [classrooms, setClassrooms] = React.useState<ClassroomGroup[]>([]);
  const [weeklySessions, setWeeklySessions] = React.useState<WeeklyClassSession[]>([]);
  const [pendingItems, setPendingItems] = React.useState<PendingScheduleJournalItem[]>([]);
  const [students, setStudents] = React.useState<AdminStudentRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Filters
  const [classFilter, setClassFilter] = React.useState(urlClassId || "all");
  const [statusFilter, setStatusFilter] = React.useState<JournalStatus | "all">("all");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [searchText, setSearchText] = React.useState("");

  // Modals & action states
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingSession, setEditingSession] = React.useState<ClassSessionRecord | null>(null);
  const [digestSession, setDigestSession] = React.useState<ClassSessionRecord | null>(null);
  const [deletingSession, setDeletingSession] = React.useState<ClassSessionRecord | null>(null);
  const [creatingPendingKey, setCreatingPendingKey] = React.useState<string | null>(null);

  const deepLinkHandledRef = React.useRef(false);

  const loadWorkspaceData = React.useCallback(async () => {
    const [sesList, clsList, schedList, pendingList, stuList] = await Promise.all([
      apiRequest<ClassSessionRecord[]>("/api/admin/teaching-journal"),
      apiRequest<ClassroomGroup[]>("/api/admin/classes"),
      apiRequest<WeeklyClassSession[]>("/api/admin/schedule"),
      apiRequest<PendingScheduleJournalItem[]>("/api/admin/teaching-journal/pending?daysBack=14"),
      apiRequest<AdminStudentRecord[]>("/api/admin/students?pageSize=100"),
    ]);
    return { sesList, clsList, schedList, pendingList, stuList };
  }, []);

  React.useEffect(() => {
    let active = true;
    loadWorkspaceData()
      .then(({ sesList, clsList, schedList, pendingList, stuList }) => {
        if (!active) return;
        setSessions(sesList);
        setClassrooms(clsList);
        setWeeklySessions(schedList);
        setPendingItems(pendingList);
        setStudents(stuList);
        setLoading(false);

        if (!deepLinkHandledRef.current) {
          deepLinkHandledRef.current = true;
          if (urlSessionId) {
            const target = sesList.find((s) => s.id === urlSessionId);
            if (target) setEditingSession(target);
          } else if (urlCreate === "1" && urlClassId) {
            const existingForSlot = sesList.find(
              (s) =>
                s.classId === urlClassId &&
                (!urlDate || s.date === urlDate),
            );
            if (existingForSlot) {
              setEditingSession(existingForSlot);
            } else {
              setCreateOpen(true);
            }
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        toast({
          variant: "error",
          title: "Không thể tải dữ liệu Nhật ký Giảng dạy",
          description: err instanceof Error ? err.message : undefined,
        });
      });

    return () => {
      active = false;
    };
  }, [loadWorkspaceData, toast, urlClassId, urlCreate, urlDate, urlSessionId]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const { sesList, clsList, schedList, pendingList, stuList } =
        await loadWorkspaceData();
      setSessions(sesList);
      setClassrooms(clsList);
      setWeeklySessions(schedList);
      setPendingItems(pendingList);
      setStudents(stuList);
    } catch (err) {
      toast({
        variant: "error",
        title: "Làm mới dữ liệu thất bại",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshPendingOnly = async () => {
    try {
      const pendingList = await apiRequest<PendingScheduleJournalItem[]>(
        "/api/admin/teaching-journal/pending?daysBack=14",
      );
      setPendingItems(pendingList);
    } catch {
      // Non-critical background sync
    }
  };

  const handleQuickCreateFromPending = async (item: PendingScheduleJournalItem) => {
    setCreatingPendingKey(item.occurrenceKey);
    try {
      const created = await apiRequest<ClassSessionRecord>(
        "/api/admin/teaching-journal",
        {
          method: "POST",
          body: JSON.stringify({
            classId: item.classId,
            date: item.date,
            startTime: item.startTime,
            endTime: item.endTime,
            room: item.room,
            weekNumber: item.weekNumber,
            topic: item.topic,
            scheduleExceptionId: item.scheduleExceptionId,
          }),
        },
      );
      setSessions((prev) => [created, ...prev]);
      setPendingItems((prev) =>
        prev.filter((p) => p.occurrenceKey !== item.occurrenceKey),
      );
      setEditingSession(created);
      toast({
        variant: "success",
        title: "Đã tạo nhật ký từ TKB thực tế",
        description: `${created.classCode} · ${created.date}`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể tạo nhanh nhật ký",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreatingPendingKey(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deletingSession) return;
    const target = deletingSession;
    try {
      await apiRequest(`/api/admin/teaching-journal/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
      });
      setSessions((prev) => prev.filter((s) => s.id !== target.id));
      if (editingSession?.id === target.id) setEditingSession(null);
      toast({
        variant: "success",
        title: "Đã xóa nhật ký buổi học",
        description: `${target.classCode} (${target.date})`,
      });
      void refreshPendingOnly();
    } catch (err) {
      toast({
        variant: "error",
        title: "Xóa nhật ký thất bại",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeletingSession(null);
    }
  };

  const filteredSessions = React.useMemo(() => {
    const q = removeVietnameseTones(searchText.trim().toLowerCase());
    return sessions.filter((ses) => {
      if (classFilter !== "all" && ses.classId !== classFilter) return false;
      if (statusFilter !== "all" && ses.journalStatus !== statusFilter) return false;
      if (fromDate && ses.date < fromDate) return false;
      if (toDate && ses.date > toDate) return false;
      if (q) {
        const hay = removeVietnameseTones(
          `${ses.topic} ${ses.objectives} ${ses.generalNotes} ${ses.homework} ${ses.classCode} ${ses.className} ${ses.date}`.toLowerCase(),
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, classFilter, statusFilter, fromDate, toDate, searchText]);

  const handleExportCsv = () => {
    if (filteredSessions.length === 0) {
      toast({
        variant: "warning",
        title: "Không có dữ liệu phù hợp để xuất CSV",
      });
      return;
    }
    const csv = buildTeachingJournalCsv(filteredSessions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nhat-ky-giang-day-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({
      variant: "success",
      title: `Đã xuất ${filteredSessions.length} buổi học ra tệp CSV`,
    });
  };

  const classroomById = React.useMemo(
    () => new Map(classrooms.map((c) => [c.id, c])),
    [classrooms],
  );

  const studentStatusById = React.useMemo(() => {
    const map = new Map<string, AdminStudentRecord["status"]>();
    for (const s of students) {
      map.set(s.id, s.status);
    }
    return map;
  }, [students]);

  const onLeaveCountForEditingClass = React.useMemo(() => {
    if (!editingSession) return 0;
    return students.filter(
      (s) =>
        s.classId === editingSession.classId &&
        s.status === "on-leave" &&
        !s.deletedAt,
    ).length;
  }, [editingSession, students]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Nhật ký Giảng dạy & Lịch sử Buổi học
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ghi nhận tiến độ bài dạy, điểm danh & đánh giá từng học viên; đồng bộ buổi hoàn tất lên Cổng Học sinh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleExportCsv}
            disabled={loading}
            className="h-9 px-3.5 shrink-0"
          >
            <Download className="size-4" aria-hidden="true" />
            Xuất CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleRefresh()}
            disabled={loading}
            className="h-9 px-3.5 shrink-0"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Làm mới
          </Button>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-9 px-3.5 shrink-0"
          >
            <Plus className="size-4" aria-hidden="true" />
            Ghi nhật ký mới
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <JournalKpiStrip
        sessions={filteredSessions}
        pendingCount={pendingItems.length}
      />

      {/* Pending from Schedule Banner */}
      <PendingSessionsBanner
        pendingItems={pendingItems}
        creatingKey={creatingPendingKey}
        onQuickCreate={(item) => void handleQuickCreateFromPending(item)}
      />

      {/* Filter Bar */}
      <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-xs md:grid-cols-2 xl:flex xl:items-center">
        <div className="relative min-w-[200px] md:col-span-2 xl:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm chuyên đề, bài tập, lớp, ngày..."
            className="h-9 pl-9"
          />
        </div>

        <select
          aria-label="Lọc theo lớp học"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm xl:w-[190px]"
        >
          <option value="all">Tất cả các lớp</option>
          {classrooms.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.code} — {cls.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Lọc theo trạng thái nhật ký"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as JournalStatus | "all")
          }
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm xl:w-[155px]"
        >
          <option value="all">Mọi trạng thái</option>
          <option value="completed">Đã hoàn tất (Portal)</option>
          <option value="draft">Bản nháp</option>
          <option value="not-started">Chưa ghi</option>
        </select>

        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground md:col-span-2 xl:col-span-1">
          <span className="shrink-0">Từ</span>
          <Input
            type="date"
            aria-label="Từ ngày"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 flex-1 text-xs xl:w-[132px] xl:flex-none"
          />
          <span className="shrink-0">đến</span>
          <Input
            type="date"
            aria-label="Đến ngày"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 flex-1 text-xs xl:w-[132px] xl:flex-none"
          />
        </div>

        {(classFilter !== "all" ||
          statusFilter !== "all" ||
          fromDate ||
          toDate ||
          searchText) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 shrink-0"
            onClick={() => {
              setClassFilter("all");
              setStatusFilter("all");
              setFromDate("");
              setToDate("");
              setSearchText("");
            }}
          >
            Xóa bộ lọc
          </Button>
        )}
      </div>

      {/* Main Session Table */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <JournalSessionTable
          sessions={filteredSessions}
          onEdit={(ses) => setEditingSession(ses)}
          onOpenDigest={(ses) => setDigestSession(ses)}
          onDelete={(ses) => setDeletingSession(ses)}
          onCreateNew={() => setCreateOpen(true)}
        />
      )}

      {/* Modals */}
      <JournalCreateModal
        open={createOpen}
        classrooms={classrooms}
        weeklySessions={weeklySessions}
        initialClassId={urlClassId || (classFilter !== "all" ? classFilter : undefined)}
        initialDate={urlDate || undefined}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setSessions((prev) => [created, ...prev]);
          setCreateOpen(false);
          setEditingSession(created);
          void refreshPendingOnly();
        }}
      />

      <JournalEditorModal
        session={editingSession}
        classroom={
          editingSession
            ? (classroomById.get(editingSession.classId) ?? null)
            : null
        }
        studentStatusById={studentStatusById}
        onLeaveCountInClass={onLeaveCountForEditingClass}
        onClose={() => setEditingSession(null)}
        onSaved={(updated) => {
          setSessions((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s)),
          );
          setEditingSession(updated);
        }}
        onOpenDigest={(ses) => setDigestSession(ses)}
      />

      <ParentDigestModal
        session={digestSession}
        onClose={() => setDigestSession(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingSession)}
        onClose={() => setDeletingSession(null)}
        onConfirm={() => void handleDeleteConfirmed()}
        variant="destructive"
        title="Xác nhận xóa nhật ký buổi học"
        description={
          deletingSession
            ? `Xóa nhật ký "${deletingSession.topic}" (${deletingSession.classCode} · ${deletingSession.date})? Điểm danh gắn với buổi này cũng sẽ được đồng bộ gỡ khỏi hồ sơ học viên.`
            : ""
        }
        confirmLabel="Xóa nhật ký"
      />
    </div>
  );
}

export default function TeachingJournalPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <TeachingJournalWorkspace />
    </React.Suspense>
  );
}
