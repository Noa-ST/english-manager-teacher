"use client";

import * as React from "react";
import {
  ArrowUpDown,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Filter,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { removeVietnameseTones } from "@/lib/utils";
import { DEFAULT_ALERT_SETTINGS } from "@/services/academic-alert.service";
import type {
  AdminStudentRecord,
  ClassroomGroup,
  ClassSessionRecord,
  CurriculumTemplate,
  CurriculumWeek,
} from "@/services/classroom-data";
import { computeClassroomHealthSummary } from "@/services/classroom-helpers";
import { StudentBulkTransferModal } from "@/components/admin/students/student-bulk-transfer-modal";
import { StudentDetailModal } from "@/components/admin/students/student-detail-modal";
import { StudentFormModal } from "@/components/admin/students/student-form-modal";
import { StudentReportModal } from "@/components/admin/students/student-report-modal";
import { ClassArchiveModal } from "@/components/admin/classes/class-archive-modal";
import { ClassCard, type ClassDetailTab } from "@/components/admin/classes/class-card";
import { ClassDetailModal } from "@/components/admin/classes/class-detail-modal";
import { ClassFormModal } from "@/components/admin/classes/class-form-modal";
import { WeekProgressModal } from "@/components/admin/classes/week-progress-modal";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type StatusFilter = "active" | "upcoming" | "completed" | "archived" | "all";
type SortOption = "name" | "enrolled" | "score" | "attendance";

export default function AdminClassesPage() {
  const { toast } = useToast();

  const [classes, setClasses] = React.useState<ClassroomGroup[]>([]);
  const [allStudents, setAllStudents] = React.useState<AdminStudentRecord[]>([]);
  const [allClassSessions, setAllClassSessions] =
    React.useState<ClassSessionRecord[]>([]);
  const [templates, setTemplates] = React.useState<CurriculumTemplate[]>([]);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("active");
  const [sortBy, setSortBy] = React.useState<SortOption>("name");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  // Modals State
  const [detailState, setDetailState] = React.useState<{
    classId: string;
    initialTab: ClassDetailTab;
  } | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingClass, setEditingClass] = React.useState<ClassroomGroup | null>(null);
  const [cloningFromClass, setCloningFromClass] = React.useState<ClassroomGroup | null>(null);
  const [weekEditState, setWeekEditState] = React.useState<{
    classroom: ClassroomGroup;
    week: CurriculumWeek;
  } | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<ClassroomGroup | null>(null);

  // Reused 360° Student Modals
  const [viewingStudent, setViewingStudent] = React.useState<AdminStudentRecord | null>(null);
  const [studentFormOpen, setStudentFormOpen] = React.useState(false);
  const [editingStudent, setEditingStudent] = React.useState<AdminStudentRecord | null>(null);
  const [studentDefaultClassId, setStudentDefaultClassId] = React.useState("all");
  const [reportStudents, setReportStudents] = React.useState<AdminStudentRecord[]>([]);
  const [bulkTransferStudents, setBulkTransferStudents] = React.useState<AdminStudentRecord[]>([]);

  const loadAllData = React.useCallback(async () => {
    const [clsRes, stuRes, sesRes, tplRes] = await Promise.allSettled([
      apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true"),
      apiRequest<AdminStudentRecord[]>("/api/admin/students?status=non-archived&page=1&pageSize=100"),
      apiRequest<ClassSessionRecord[]>("/api/admin/teaching-journal"),
      apiRequest<CurriculumTemplate[]>("/api/admin/classes/templates"),
    ]);

    if (clsRes.status === "fulfilled" && Array.isArray(clsRes.value)) {
      setClasses(clsRes.value);
    }
    if (stuRes.status === "fulfilled" && Array.isArray(stuRes.value)) {
      setAllStudents(stuRes.value);
    }
    if (sesRes.status === "fulfilled" && Array.isArray(sesRes.value)) {
      setAllClassSessions(sesRes.value);
    }
    if (tplRes.status === "fulfilled" && Array.isArray(tplRes.value)) {
      setTemplates(tplRes.value);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    Promise.allSettled([
      apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true"),
      apiRequest<AdminStudentRecord[]>("/api/admin/students?status=non-archived&page=1&pageSize=100"),
      apiRequest<ClassSessionRecord[]>("/api/admin/teaching-journal"),
      apiRequest<CurriculumTemplate[]>("/api/admin/classes/templates"),
    ]).then(([clsRes, stuRes, sesRes, tplRes]) => {
      if (!active) return;
      if (clsRes.status === "fulfilled" && Array.isArray(clsRes.value)) {
        setClasses(clsRes.value);
      }
      if (stuRes.status === "fulfilled" && Array.isArray(stuRes.value)) {
        setAllStudents(stuRes.value);
      }
      if (sesRes.status === "fulfilled" && Array.isArray(sesRes.value)) {
        setAllClassSessions(sesRes.value);
      }
      if (tplRes.status === "fulfilled" && Array.isArray(tplRes.value)) {
        setTemplates(tplRes.value);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const activeDetailClass = React.useMemo(() => {
    if (!detailState) return null;
    return classes.find((c) => c.id === detailState.classId) ?? null;
  }, [detailState, classes]);

  const healthByClassId = React.useMemo(() => {
    const map: Record<string, ReturnType<typeof computeClassroomHealthSummary>> = {};
    for (const cls of classes) {
      map[cls.id] = computeClassroomHealthSummary(cls, allStudents, allClassSessions);
    }
    return map;
  }, [classes, allStudents, allClassSessions]);

  const filteredClasses = React.useMemo(() => {
    let result = classes;
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }
    const q = searchQuery.trim();
    if (q) {
      const norm = removeVietnameseTones(q);
      result = result.filter(
        (c) =>
          removeVietnameseTones(c.name).includes(norm) ||
          removeVietnameseTones(c.code).includes(norm) ||
          removeVietnameseTones(c.room).includes(norm) ||
          removeVietnameseTones(c.level).includes(norm),
      );
    }
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "enrolled":
          return b.enrolled - a.enrolled;
        case "score":
          return b.averageScore - a.averageScore;
        case "attendance":
          return b.attendanceRate - a.attendanceRate;
        default:
          return a.name.localeCompare(b.name, "vi");
      }
    });
  }, [classes, statusFilter, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredClasses.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedClasses = filteredClasses.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const kpi = React.useMemo(() => {
    const operating = classes.filter((c) => c.status === "active" || c.status === "upcoming");
    const activeOnly = classes.filter((c) => c.status === "active");
    const totalEnrolled = activeOnly.reduce((s, c) => s + c.enrolled, 0);
    const totalCapacity = activeOnly.reduce((s, c) => s + c.capacity, 0);
    const fillRate = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
    const avgAttendance =
      activeOnly.length > 0
        ? Math.round(
            activeOnly.reduce((s, c) => s + c.attendanceRate, 0) / activeOnly.length,
          )
        : 0;
    return {
      operatingCount: operating.length,
      upcomingCount: classes.filter((c) => c.status === "upcoming").length,
      completedCount: classes.filter((c) => c.status === "completed").length,
      archivedCount: classes.filter((c) => c.status === "archived").length,
      totalEnrolled,
      fillRate,
      avgAttendance,
    };
  }, [classes]);

  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "active";

  const handleClassUpdated = (updated: ClassroomGroup) => {
    setClasses((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      return exists ? prev.map((c) => (c.id === updated.id ? updated : c)) : [updated, ...prev];
    });
  };

  const handleAdvanceWeek = async (cls: ClassroomGroup, targetWeek?: number) => {
    try {
      const payload =
        targetWeek !== undefined
          ? { targetWeek, status: "in-progress" as const, setAsActiveWeek: true }
          : { status: "in-progress" as const, setAsActiveWeek: true, markPreviousCompleted: true };
      const updated = await apiRequest<ClassroomGroup>(
        `/api/admin/classes/${encodeURIComponent(cls.id)}/advance-week`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      handleClassUpdated(updated);
      toast({
        title: "Đã cập nhật tiến độ học phần",
        description: `Lớp ${cls.code} hiện chuyển sang: ${updated.currentModule}`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Lỗi chuyển tuần",
        description: "Không thể cập nhật tuần học phần, vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const handleConfirmArchive = async (cls: ClassroomGroup) => {
    try {
      await apiRequest(`/api/admin/classes/${encodeURIComponent(cls.id)}`, {
        method: "DELETE",
      });
      setClasses((prev) =>
        prev.map((c) => (c.id === cls.id ? { ...c, status: "archived" } : c)),
      );
      setArchiveTarget(null);
      toast({
        title: "Đã lưu trữ lớp học",
        description: `Lớp ${cls.code} đã được chuyển vào kho lưu trữ và giải phóng TKB.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể lưu trữ lớp học",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const handleRestoreClass = async (cls: ClassroomGroup) => {
    try {
      const restored = await apiRequest<ClassroomGroup>(
        `/api/admin/classes/${encodeURIComponent(cls.id)}/restore`,
        { method: "POST" },
      );
      handleClassUpdated(restored);
      toast({
        title: "Đã khôi phục lớp học",
        description: `Lớp ${restored.code} đã hoạt động trở lại trên TKB.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể khôi phục lớp học",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const handleAssignExistingStudent = async (
    studentId: string,
    targetClass: ClassroomGroup,
    reason: string,
  ) => {
    try {
      await apiRequest<AdminStudentRecord>(
        `/api/admin/students/${encodeURIComponent(studentId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            classId: targetClass.id,
            transferReason: reason || "Điều chuyển vào lớp",
          }),
        },
      );
      await loadAllData();
      toast({
        title: "Đã chuyển học viên vào lớp",
        description: `Danh sách và sĩ số lớp ${targetClass.code} đã đồng bộ.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể chuyển học viên",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const archiveActiveStudents = React.useMemo(() => {
    if (!archiveTarget) return [];
    return allStudents.filter(
      (s) => s.classId === archiveTarget.id && s.status !== "archived" && !s.deletedAt,
    );
  }, [archiveTarget, allStudents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản lý Lớp học &amp; Khung chương trình
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Điều hành tập trung vòng đời lớp học, thời khóa biểu chống trùng lịch, lộ trình học liệu và điểm danh/bảng điểm từng tuần.
          </p>
        </div>

        <Button
          onClick={() => {
            setEditingClass(null);
            setCloningFromClass(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Tạo lớp học mới
        </Button>
      </div>

      {/* Top 4 KPI Cards (uniform layout) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-h-[108px] flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <BookOpen className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Lớp đang mở &amp; sắp khai giảng</p>
              <p className="mt-0.5 font-mono text-2xl font-bold text-foreground" suppressHydrationWarning>
                {kpi.operatingCount}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground" suppressHydrationWarning>
            {kpi.upcomingCount} sắp khai giảng · {kpi.completedCount} kết khóa · {kpi.archivedCount} lưu trữ
          </p>
        </div>

        <div className="flex min-h-[108px] flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Users className="size-5 text-emerald-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Tổng học viên đang học</p>
              <p className="mt-0.5 font-mono text-2xl font-bold text-foreground" suppressHydrationWarning>
                {kpi.totalEnrolled}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground" suppressHydrationWarning>
            Đồng bộ thời gian thực từ Hồ sơ Học sinh
          </p>
        </div>

        <div className="flex min-h-[108px] flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
              <BarChart3 className="size-5 text-amber-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Hiệu suất lấp đầy</p>
              <p className="mt-0.5 font-mono text-2xl font-bold text-foreground" suppressHydrationWarning>
                {kpi.fillRate}%
              </p>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${kpi.fillRate}%` }} />
          </div>
        </div>

        <div className="flex min-h-[108px] flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10">
              <ClipboardCheck className="size-5 text-sky-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Chuyên cần trung bình</p>
              <p className="mt-0.5 font-mono text-2xl font-bold text-foreground" suppressHydrationWarning>
                {kpi.avgAttendance}%
              </p>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${kpi.avgAttendance}%` }} />
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên lớp, mã lớp, phòng học, trình độ..."
            aria-label="Tìm kiếm lớp học"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
            aria-label="Lọc theo trạng thái vòng đời lớp"
            className="h-8 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="active">
              Đang vận hành ({classes.filter((c) => c.status === "active").length})
            </option>
            <option value="upcoming">
              Sắp khai giảng ({classes.filter((c) => c.status === "upcoming").length})
            </option>
            <option value="completed">
              Đã kết khóa ({classes.filter((c) => c.status === "completed").length})
            </option>
            <option value="archived">
              Đã lưu trữ ({classes.filter((c) => c.status === "archived").length})
            </option>
            <option value="all">Tất cả ({classes.length})</option>
          </select>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSortBy((prev) =>
                prev === "name"
                  ? "enrolled"
                  : prev === "enrolled"
                    ? "score"
                    : prev === "score"
                      ? "attendance"
                      : "name",
              );
              setPage(1);
            }}
          >
            <ArrowUpDown className="size-3.5" aria-hidden="true" />
            Sắp xếp:{" "}
            {sortBy === "name"
              ? "Tên lớp"
              : sortBy === "enrolled"
                ? "Sĩ số"
                : sortBy === "score"
                  ? "Điểm TB"
                  : "Chuyên cần"}
          </Button>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Filter className="size-3" />
            Đang lọc:
          </span>
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              Tìm: &ldquo;{searchQuery}&rdquo;
              <button type="button" onClick={() => setSearchQuery("")}>
                <X className="size-3" />
              </button>
            </span>
          )}
          {statusFilter !== "active" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              Trạng thái: {statusFilter}
              <button type="button" onClick={() => setStatusFilter("active")}>
                <X className="size-3" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("active");
              setPage(1);
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Đặt lại tất cả
          </button>
        </div>
      )}

      {/* Class Cards Grid */}
      {filteredClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <BookOpen className="size-10 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {hasActiveFilters
              ? "Không tìm thấy lớp học phù hợp với bộ lọc."
              : "Chưa có lớp học nào ở trạng thái này."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {paginatedClasses.map((cls) => (
              <ClassCard
                key={cls.id}
                cls={cls}
                health={healthByClassId[cls.id]}
                onOpenDetail={(c, tab = "overview") =>
                  setDetailState({ classId: c.id, initialTab: tab })
                }
                onAdvanceNextWeek={(c) => handleAdvanceWeek(c)}
                onEdit={(c) => {
                  setEditingClass(c);
                  setCloningFromClass(null);
                  setFormOpen(true);
                }}
                onClone={(c) => {
                  setEditingClass(null);
                  setCloningFromClass(c);
                  setFormOpen(true);
                }}
                onArchive={(c) => setArchiveTarget(c)}
                onRestore={handleRestoreClass}
              />
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
            <PaginationBar
              page={currentPage}
              totalPages={totalPages}
              totalItems={filteredClasses.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setPage(1);
              }}
              pageSizeOptions={[6, 12, 24]}
            />
          </div>
        </div>
      )}

      {/* 360° Class Control Center Modal */}
      <ClassDetailModal
        classroom={activeDetailClass}
        initialTab={detailState?.initialTab ?? "overview"}
        allClasses={classes}
        classStudents={
          activeDetailClass
            ? allStudents.filter(
                (s) =>
                  s.classId === activeDetailClass.id &&
                  s.status !== "archived" &&
                  !s.deletedAt,
              )
            : []
        }
        allStudents={allStudents}
        classSessions={allClassSessions}
        onClose={() => setDetailState(null)}
        onClassUpdated={handleClassUpdated}
        onSessionCreated={(created) =>
          setAllClassSessions((prev) => [created, ...prev])
        }
        onOpenEditClass={(c) => {
          setEditingClass(c);
          setCloningFromClass(null);
          setFormOpen(true);
        }}
        onOpenCloneClass={(c) => {
          setEditingClass(null);
          setCloningFromClass(c);
          setFormOpen(true);
        }}
        onOpenWeekModal={(c, w) => setWeekEditState({ classroom: c, week: w })}
        onAdvanceWeek={handleAdvanceWeek}
        onOpenAddStudent={(c) => {
          setEditingStudent(null);
          setStudentDefaultClassId(c.id);
          setStudentFormOpen(true);
        }}
        onOpenStudentDetail={(stu) => setViewingStudent(stu)}
        onOpenBulkTransfer={(stus) => setBulkTransferStudents(stus)}
        onAssignExistingStudent={handleAssignExistingStudent}
        onTemplateSaved={loadAllData}
      />

      {/* Create / Edit / Clone Class Modal */}
      <ClassFormModal
        open={formOpen}
        editingClass={editingClass}
        cloningFromClass={cloningFromClass}
        classes={classes}
        templates={templates}
        onClose={() => {
          setFormOpen(false);
          setEditingClass(null);
          setCloningFromClass(null);
        }}
        onSaved={(saved, mode) => {
          handleClassUpdated(saved);
          void loadAllData();
          if (mode === "clone") {
            setStatusFilter(saved.status === "upcoming" ? "upcoming" : "active");
          }
        }}
      />

      {/* Week Detail & Storage Upload Modal */}
      <WeekProgressModal
        classroom={weekEditState?.classroom ?? null}
        week={weekEditState?.week ?? null}
        onClose={() => setWeekEditState(null)}
        onSaved={(updated) => handleClassUpdated(updated)}
      />

      {/* Smart Archive Class Modal (offers bulk transfer if students remain) */}
      <ClassArchiveModal
        targetClass={archiveTarget}
        activeStudentsInClass={archiveActiveStudents}
        onClose={() => setArchiveTarget(null)}
        onConfirmArchive={handleConfirmArchive}
        onOpenBulkTransfer={(_cls, stus) => setBulkTransferStudents(stus)}
      />

      {/* Shared Student 360° Detail Modal */}
      <StudentDetailModal
        student={viewingStudent}
        onClose={() => setViewingStudent(null)}
        classes={classes}
        classSessions={allClassSessions}
        alertSettings={DEFAULT_ALERT_SETTINGS}
        onStudentUpdated={(updated) => {
          setViewingStudent(updated);
          setAllStudents((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s)),
          );
          void loadAllData();
        }}
        onOpenEdit={(stu) => {
          setEditingStudent(stu);
          setStudentDefaultClassId(stu.classId);
          setStudentFormOpen(true);
        }}
        onOpenReport={(stu) => setReportStudents([stu])}
      />

      {/* Shared Student Form Modal */}
      <StudentFormModal
        open={studentFormOpen}
        onClose={() => {
          setStudentFormOpen(false);
          setEditingStudent(null);
        }}
        editingStudent={editingStudent}
        classes={classes.filter((c) => c.status !== "archived")}
        students={allStudents}
        defaultClassFilter={studentDefaultClassId}
        onSaved={() => {
          void loadAllData();
        }}
      />

      {/* Shared Student Report Modal */}
      <StudentReportModal
        open={reportStudents.length > 0}
        onClose={() => setReportStudents([])}
        students={reportStudents}
      />

      {/* Shared Bulk Transfer Modal */}
      <StudentBulkTransferModal
        open={bulkTransferStudents.length > 0}
        onClose={() => setBulkTransferStudents([])}
        selectedStudents={bulkTransferStudents}
        classes={classes}
        onTransferred={() => {
          void loadAllData();
        }}
      />
    </div>
  );
}
