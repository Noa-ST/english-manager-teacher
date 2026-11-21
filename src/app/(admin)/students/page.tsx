"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  ArrowUpDown,
  Award,
  CalendarCheck,
  Download,
  FileText,
  FileUp,
  Filter,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { apiRequest, apiRequestWithMeta } from "@/lib/api-client";
import {
  ALERT_SETTINGS_STORAGE_KEY,
  DEFAULT_ALERT_SETTINGS,
  type AcademicAlertSettings,
  type AcademicFilterOption,
} from "@/services/academic-alert.service";
import type {
  AdminStudentRecord,
  ClassroomGroup,
  ClassSessionRecord,
} from "@/services/classroom-data";
import {
  formatDisplayDate,
  STUDENT_STATUS_META,
  type StudentPortalAccountItem,
  type StudentsSummaryStats,
} from "@/services/student-helpers";
import { StudentAlertSettingsModal } from "@/components/admin/students/student-alert-settings-modal";
import { StudentBulkTransferModal } from "@/components/admin/students/student-bulk-transfer-modal";
import { StudentDetailModal } from "@/components/admin/students/student-detail-modal";
import { StudentFormModal } from "@/components/admin/students/student-form-modal";
import { StudentImportModal } from "@/components/admin/students/student-import-modal";
import { StudentReportModal } from "@/components/admin/students/student-report-modal";
import {
  StudentTable,
  type DetailModalTab,
} from "@/components/admin/students/student-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const DEFAULT_PAGE_SIZE = 10;

type StatusFilterValue = "all" | "non-archived" | "active" | "trial" | "on-leave" | "archived";
type SortByValue = "name" | "score" | "attendance" | "tuitionDueDate";

function computeLocalSummary(
  students: AdminStudentRecord[],
): StudentsSummaryStats {
  const nonArchived = students.filter((s) => s.status !== "archived");
  const withScore = nonArchived.filter((s) => s.grades.length > 0 && s.averageScore > 0);
  const avgIeltsScore =
    withScore.length > 0
      ? (
          withScore.reduce((sum, s) => sum + s.averageScore, 0) / withScore.length
        ).toFixed(1)
      : "—";
  const withAtt = nonArchived.filter((s) => s.attendanceHistory.length > 0);
  const avgAttendanceRate =
    withAtt.length > 0
      ? (withAtt.reduce((sum, s) => sum + s.attendanceRate, 0) / withAtt.length).toFixed(1)
      : "100.0";
  const dueSoonCount = nonArchived.filter(
    (s) => s.tuitionStatus === "due-soon" && s.status !== "trial",
  ).length;
  const overdueCount = nonArchived.filter(
    (s) => s.tuitionStatus === "overdue" && s.status !== "trial" && s.status !== "on-leave",
  ).length;

  return {
    totalAll: students.length,
    totalNonArchived: nonArchived.length,
    totalActive: students.filter((s) => s.status === "active").length,
    totalTrial: students.filter((s) => s.status === "trial").length,
    totalOnLeave: students.filter((s) => s.status === "on-leave").length,
    totalArchived: students.filter((s) => s.status === "archived").length,
    avgIeltsScore,
    highAchieversCount: nonArchived.filter((s) => s.averageScore >= 8.0).length,
    avgAttendanceRate,
    dueSoonCount,
    overdueCount,
    totalTuitionAlerts: dueSoonCount + overdueCount,
    alertsCount: 0,
  };
}

function AdminStudentsContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const deepLinkDoneRef = React.useRef(false);
  const autoStudentOpenedRef = React.useRef(false);

  const [classes, setClasses] = React.useState<ClassroomGroup[]>([]);
  const [students, setStudents] = React.useState<AdminStudentRecord[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [summary, setSummary] = React.useState<StudentsSummaryStats>(() =>
    computeLocalSummary([]),
  );
  const [classSessions, setClassSessions] = React.useState<ClassSessionRecord[]>([]);
  const [accountsByStudentId, setAccountsByStudentId] = React.useState<
    Record<string, StudentPortalAccountItem>
  >({});

  // Query & Filter states (initialized with URL searchParams for instant deep-links)
  const [searchQuery, setSearchQuery] = React.useState(
    () => searchParams.get("search") ?? "",
  );
  const [debouncedSearch, setDebouncedSearch] = React.useState(
    () => searchParams.get("search") ?? "",
  );
  const [classFilter, setClassFilter] = React.useState<string>(
    () => searchParams.get("classId") ?? "all",
  );
  const [tuitionFilter, setTuitionFilter] = React.useState<string>(
    () => searchParams.get("tuition") ?? "all",
  );
  const [statusFilter, setStatusFilter] = React.useState<StatusFilterValue>(() => {
    const raw = searchParams.get("status");
    if (
      raw === "all" ||
      raw === "non-archived" ||
      raw === "active" ||
      raw === "trial" ||
      raw === "on-leave" ||
      raw === "archived"
    ) {
      return raw;
    }
    return "non-archived";
  });
  const [academicFilter, setAcademicFilter] = React.useState<AcademicFilterOption>(() => {
    const raw = searchParams.get("academic") as AcademicFilterOption | null;
    return raw || "all";
  });
  const [sortBy, setSortBy] = React.useState<SortByValue>("score");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [refreshTick, setRefreshTick] = React.useState(0);

  // Alert settings
  const [alertSettings, setAlertSettings] =
    React.useState<AcademicAlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [isAlertSettingsOpen, setIsAlertSettingsOpen] = React.useState(false);

  // Selection & Modals
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] = React.useState(false);
  const [isBulkTransferOpen, setIsBulkTransferOpen] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [reportStudents, setReportStudents] = React.useState<AdminStudentRecord[]>([]);

  const [viewingStudent, setViewingStudent] = React.useState<AdminStudentRecord | null>(null);
  const [viewingInitialTab, setViewingInitialTab] =
    React.useState<DetailModalTab>("overview");
  const [editingStudent, setEditingStudent] = React.useState<AdminStudentRecord | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = React.useState(false);
  const [archivingStudent, setArchivingStudent] =
    React.useState<AdminStudentRecord | null>(null);

  const refreshClasses = React.useCallback(() => {
    apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true")
      .then((items) => {
        if (Array.isArray(items)) setClasses(items);
      })
      .catch(() => {});
  }, []);

  const loadAccounts = React.useCallback(() => {
    apiRequest<StudentPortalAccountItem[]>("/api/admin/accounts")
      .then((items) => {
        const map: Record<string, StudentPortalAccountItem> = {};
        for (const acc of items) map[acc.studentId] = acc;
        setAccountsByStudentId(map);
      })
      .catch(() => {
        // Supabase Auth might be unconfigured in local preview; degrade gracefully
      });
  }, []);

  const triggerReload = React.useCallback(() => {
    setRefreshTick((t) => t + 1);
    refreshClasses();
  }, [refreshClasses]);

  // Debounce search input for smooth server-side querying
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Initial metadata loads (classes, teaching journal sessions, alert settings, accounts)
  React.useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const savedAlerts = localStorage.getItem(ALERT_SETTINGS_STORAGE_KEY);
        if (savedAlerts) {
          const parsed = JSON.parse(savedAlerts);
          if (typeof parsed.attendanceThreshold === "number") {
            setAlertSettings({
              attendanceThreshold: parsed.attendanceThreshold,
              alertOnScoreDrop: parsed.alertOnScoreDrop ?? true,
              alertOnOverdueTuition: parsed.alertOnOverdueTuition ?? true,
              alertOnNoGrades: parsed.alertOnNoGrades ?? true,
              alertBelowTarget: parsed.alertBelowTarget ?? true,
            });
          }
        }
      } catch {}
    });

    refreshClasses();
    loadAccounts();

    apiRequest<ClassSessionRecord[]>("/api/admin/teaching-journal")
      .then((sesList) => {
        if (sesList) setClassSessions(sesList);
      })
      .catch(() => {});
  }, [refreshClasses, loadAccounts]);

  // Handle ?create=1 / ?action=create and ?studentId=... deep-links
  React.useEffect(() => {
    const shouldCreate =
      searchParams.get("create") === "1" ||
      searchParams.get("create") === "true" ||
      searchParams.get("action") === "create";

    if (shouldCreate && !deepLinkDoneRef.current) {
      deepLinkDoneRef.current = true;
      setEditingStudent(null);
      setIsFormModalOpen(true);
      if (typeof window !== "undefined") {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("create");
          url.searchParams.delete("action");
          window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
        } catch {}
      }
    }

    const targetStudentId = searchParams.get("studentId");
    if (targetStudentId && !autoStudentOpenedRef.current) {
      autoStudentOpenedRef.current = true;
      apiRequest<AdminStudentRecord>(
        `/api/admin/students/${encodeURIComponent(targetStudentId)}`,
      )
        .then((stu) => {
          setViewingInitialTab("overview");
          setViewingStudent(stu);
        })
        .catch(() => {});
    }
  }, [searchParams]);

  // Server-side Student List & Summary Fetch
  React.useEffect(() => {
    let active = true;
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      status: statusFilter,
      sortBy,
      attendanceThreshold: String(alertSettings.attendanceThreshold),
    });
    if (debouncedSearch.trim()) qs.set("search", debouncedSearch.trim());
    if (classFilter !== "all") qs.set("classId", classFilter);
    if (tuitionFilter !== "all") qs.set("tuitionStatus", tuitionFilter);
    if (academicFilter !== "all") qs.set("academicStatus", academicFilter);

    apiRequestWithMeta<AdminStudentRecord[]>(`/api/admin/students?${qs.toString()}`)
      .then(({ data, meta }) => {
        if (!active) return;
        setStudents(data);
        setTotalItems(meta?.total ?? data.length);
      })
      .catch(() => {});

    apiRequest<StudentsSummaryStats>(
      `/api/admin/students/summary?attendanceThreshold=${alertSettings.attendanceThreshold}`,
    )
      .then((res) => {
        if (active) setSummary(res);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [
    page,
    pageSize,
    debouncedSearch,
    classFilter,
    tuitionFilter,
    statusFilter,
    academicFilter,
    sortBy,
    alertSettings.attendanceThreshold,
    refreshTick,
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const selectedStudents = React.useMemo(
    () => students.filter((s) => selectedIds.includes(s.id)),
    [students, selectedIds],
  );
  const activeSelectedStudents = React.useMemo(
    () => selectedStudents.filter((s) => s.status !== "archived"),
    [selectedStudents],
  );
  const archivedSelectedStudents = React.useMemo(
    () => selectedStudents.filter((s) => s.status === "archived"),
    [selectedStudents],
  );

  const toggleSelectAll = () => {
    const pageIds = students.map((s) => s.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleStudentUpdatedInModal = (updated: AdminStudentRecord) => {
    setViewingStudent(updated);
    setStudents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    triggerReload();
  };

  const handleFormSaved = (saved: AdminStudentRecord, isEdit: boolean) => {
    if (viewingStudent?.id === saved.id) setViewingStudent(saved);
    if (!isEdit) setPage(1);
    triggerReload();
  };

  const handleArchiveConfirmed = async () => {
    if (!archivingStudent) return;
    try {
      await apiRequest(`/api/admin/students/${encodeURIComponent(archivingStudent.id)}`, {
        method: "DELETE",
      });
    } catch {
      // Fallback handled on refresh
    }
    setSelectedIds((prev) => prev.filter((id) => id !== archivingStudent.id));
    toast({
      title: "Đã lưu trữ hồ sơ học sinh",
      description: `Hồ sơ ${archivingStudent.fullName} (${archivingStudent.code}) đã chuyển vào Lưu trữ.`,
      variant: "info",
    });
    setArchivingStudent(null);
    triggerReload();
  };

  const handleRestoreStudent = async (stu: AdminStudentRecord) => {
    try {
      await apiRequest(`/api/admin/students/${encodeURIComponent(stu.id)}/restore`, {
        method: "POST",
      });
      toast({
        title: "Đã khôi phục hồ sơ",
        description: `Học sinh ${stu.fullName} (${stu.code}) đã quay lại danh sách đang học.`,
        variant: "success",
      });
      triggerReload();
    } catch (err) {
      toast({
        title: "Không thể khôi phục",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        variant: "error",
      });
    }
  };

  const handleBulkArchiveConfirmed = async () => {
    const idsToArchive = activeSelectedStudents.map((s) => s.id);
    if (idsToArchive.length === 0) return;

    try {
      await apiRequest("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          action: "batch-archive",
          studentIds: idsToArchive,
        }),
      });
    } catch {}

    setSelectedIds([]);
    setIsBulkArchiveDialogOpen(false);
    toast({
      title: "Đã lưu trữ hàng loạt",
      description: `Đã chuyển ${idsToArchive.length} hồ sơ học sinh vào Lưu trữ.`,
      variant: "info",
    });
    triggerReload();
  };

  const handleBulkRestore = async () => {
    const idsToRestore = archivedSelectedStudents.map((s) => s.id);
    if (idsToRestore.length === 0) return;

    try {
      await apiRequest("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          action: "batch-restore",
          studentIds: idsToRestore,
        }),
      });
    } catch {}

    setSelectedIds([]);
    toast({
      title: "Đã khôi phục hàng loạt",
      description: `Đã khôi phục ${idsToRestore.length} hồ sơ về trạng thái đang học.`,
      variant: "success",
    });
    triggerReload();
  };

  const handleExportExcel = async () => {
    let targetList = students;
    try {
      const qs = new URLSearchParams({
        page: "1",
        pageSize: "100",
        status: statusFilter,
        sortBy,
        attendanceThreshold: String(alertSettings.attendanceThreshold),
      });
      if (debouncedSearch.trim()) qs.set("search", debouncedSearch.trim());
      if (classFilter !== "all") qs.set("classId", classFilter);
      if (tuitionFilter !== "all") qs.set("tuitionStatus", tuitionFilter);
      if (academicFilter !== "all") qs.set("academicStatus", academicFilter);
      targetList = await apiRequest<AdminStudentRecord[]>(`/api/admin/students?${qs.toString()}`);
    } catch {
      targetList = students;
    }

    const headers = [
      "Mã học sinh",
      "Họ và tên",
      "Lớp theo học",
      "Trình độ",
      "Tình trạng học vụ",
      "Điểm TB",
      "Chuyên cần (%)",
      "Trạng thái học phí",
      "Ngày nộp học phí",
      "Mức học phí",
      "Kỳ học phí",
      "Phụ huynh",
      "SĐT phụ huynh",
      "Mục tiêu đầu ra",
      "Nhận xét của giáo viên",
      "Ngày nhập học",
    ];

    const escapeCsv = (val: unknown) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = targetList.map((s) => [
      s.code,
      s.fullName,
      s.className,
      s.level,
      STUDENT_STATUS_META[s.status]?.shortLabel ?? s.status,
      s.averageScore > 0 ? s.averageScore.toFixed(1) : "—",
      s.attendanceHistory.length > 0 ? `${s.attendanceRate}%` : "—",
      s.tuitionStatus === "paid"
        ? "Đã đóng"
        : s.tuitionStatus === "due-soon"
          ? "Sắp đến hạn"
          : "Quá hạn",
      formatDisplayDate(s.tuitionDueDate),
      s.tuitionAmount,
      s.tuitionPeriod,
      s.parentName || s.parentRelation,
      s.parentPhone || s.parentContactMasked,
      s.targetGoal,
      s.recentComment,
      s.joinedAt,
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.map(escapeCsv).join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join(
        "\r\n",
      );

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    link.href = url;
    link.download = `Danh_sach_hoc_sinh_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Đã xuất báo cáo học vụ",
      description: `Đã tải xuống file CSV chuẩn Excel (${targetList.length} học sinh).`,
      variant: "success",
    });
  };

  const resetAllFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setClassFilter("all");
    setTuitionFilter("all");
    setStatusFilter("non-archived");
    setAcademicFilter("all");
    setPage(1);
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    classFilter !== "all" ||
    tuitionFilter !== "all" ||
    statusFilter !== "non-archived" ||
    academicFilter !== "all";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản lý Hồ sơ Học sinh
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            CRM Học vụ 360°: theo dõi 4 kỹ năng, sổ thu học phí, phụ huynh, tài khoản Portal &amp; vòng đời học viên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsImportModalOpen(true)}>
            <FileUp className="size-3.5" aria-hidden="true" />
            Nhập CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="size-3.5" aria-hidden="true" />
            Xuất Excel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingStudent(null);
              setIsFormModalOpen(true);
            }}
          >
            <UserPlus className="size-3.5" aria-hidden="true" />
            Thêm học sinh mới
          </Button>
        </div>
      </div>

      {/* 4 Top Academic Stat Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          onClick={() => {
            setStatusFilter("non-archived");
            setPage(1);
          }}
          className="group cursor-pointer rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs"
          title="Xem danh sách học sinh đang theo học"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Đang theo học</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-warm text-primary transition-transform group-hover:scale-105">
              <Users className="size-3.5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-foreground">
            {summary.totalNonArchived}{" "}
            <span className="text-xs font-normal text-muted-foreground">học viên</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {summary.totalActive} chính thức · {summary.totalTrial} học thử ·{" "}
            {summary.totalOnLeave} bảo lưu
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Điểm TB IELTS</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Award className="size-3.5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-foreground">
            {summary.avgIeltsScore}{" "}
            <span className="text-xs font-normal text-muted-foreground">Overall</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {summary.highAchieversCount} học viên đạt Band ≥ 8.0
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Tỷ lệ Chuyên cần</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <CalendarCheck className="size-3.5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-700">
            {summary.avgAttendanceRate}%
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Mục tiêu học kỳ: ≥ 92.0%
          </p>
        </div>

        <div
          onClick={() => {
            setTuitionFilter(summary.overdueCount > 0 ? "overdue" : "due-soon");
            setPage(1);
          }}
          className="group cursor-pointer rounded-2xl border border-border bg-card p-4 transition-all hover:border-amber-400 hover:shadow-xs"
          title="Bấm để lọc nhanh học sinh cần nhắc học phí"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Cần lưu ý Học phí</span>
            <div
              className={`flex size-7 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${
                summary.overdueCount > 0
                  ? "bg-destructive/10 text-destructive"
                  : "bg-amber-500/10 text-amber-600"
              }`}
            >
              <AlertTriangle className="size-3.5" aria-hidden="true" />
            </div>
          </div>
          <p
            className={`mt-2 font-mono text-2xl font-bold ${
              summary.overdueCount > 0 ? "text-destructive" : "text-amber-700"
            }`}
          >
            {summary.totalTuitionAlerts}{" "}
            <span className="text-xs font-normal text-muted-foreground">học viên</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {summary.dueSoonCount} sắp hạn · {summary.overdueCount} quá hạn thanh toán
          </p>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo họ tên, mã HS (HS-2026-01), tên lớp, tên/SĐT phụ huynh..."
            aria-label="Tìm kiếm học sinh"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo lớp học"
            className="h-8 shrink-0 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả các lớp ({classes.length})</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.code} — {cls.name}
              </option>
            ))}
          </select>

          <select
            value={tuitionFilter}
            onChange={(e) => {
              setTuitionFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo trạng thái học phí"
            className="h-8 shrink-0 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả trạng thái học phí</option>
            <option value="paid">Đã hoàn thành</option>
            <option value="due-soon">Sắp đến hạn</option>
            <option value="overdue">Quá hạn thanh toán</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilterValue);
              setPage(1);
            }}
            aria-label="Lọc theo tình trạng học vụ"
            className="h-8 shrink-0 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="non-archived">Đang quản lý ({summary.totalNonArchived})</option>
            <option value="active">Chính thức ({summary.totalActive})</option>
            <option value="trial">Học thử ({summary.totalTrial})</option>
            <option value="on-leave">Bảo lưu ({summary.totalOnLeave})</option>
            <option value="archived">Đã lưu trữ ({summary.totalArchived})</option>
            <option value="all">Tất cả hồ sơ ({summary.totalAll})</option>
          </select>

          <select
            value={academicFilter}
            onChange={(e) => {
              setAcademicFilter(e.target.value as AcademicFilterOption);
              setPage(1);
            }}
            aria-label="Lọc nhanh theo tình trạng học tập"
            className="h-8 shrink-0 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả tình trạng học tập</option>
            <option value="has-alerts">⚠️ Cần quan tâm ({summary.alertsCount})</option>
            <option value="low-attendance">
              Chuyên cần thấp (&lt; {alertSettings.attendanceThreshold}%)
            </option>
            <option value="below-target">Điểm dưới mục tiêu</option>
            <option value="no-grades">Chưa có điểm đánh giá</option>
            <option value="no-recent-comment">Chưa có nhận xét gần đây</option>
          </select>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() =>
              setSortBy((prev) =>
                prev === "score"
                  ? "attendance"
                  : prev === "attendance"
                    ? "tuitionDueDate"
                    : prev === "tuitionDueDate"
                      ? "name"
                      : "score",
              )
            }
          >
            <ArrowUpDown className="size-3.5" aria-hidden="true" />
            Sắp xếp:{" "}
            {sortBy === "score"
              ? "Điểm TB"
              : sortBy === "attendance"
                ? "Chuyên cần"
                : sortBy === "tuitionDueDate"
                  ? "Hạn học phí"
                  : "Họ tên"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setIsAlertSettingsOpen(true)}
            title="Tùy chỉnh ngưỡng cảnh báo học vụ và chuyên cần"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Cấu hình cảnh báo
          </Button>
        </div>
      </div>

      {/* Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Filter className="size-3 text-muted-foreground" aria-hidden="true" />
            Đang lọc:
          </span>
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>Tìm: &ldquo;{searchQuery}&rdquo;</span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedSearch("");
                  setPage(1);
                }}
                aria-label="Xóa bộ lọc tìm kiếm"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {classFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>Lớp: {classes.find((c) => c.id === classFilter)?.name || classFilter}</span>
              <button
                type="button"
                onClick={() => {
                  setClassFilter("all");
                  setPage(1);
                }}
                aria-label="Xóa bộ lọc lớp"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {tuitionFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>
                Học phí:{" "}
                {tuitionFilter === "paid"
                  ? "Đã đóng"
                  : tuitionFilter === "due-soon"
                    ? "Sắp đến hạn"
                    : "Quá hạn"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setTuitionFilter("all");
                  setPage(1);
                }}
                aria-label="Xóa bộ lọc học phí"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {statusFilter !== "non-archived" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>
                Trạng thái:{" "}
                {statusFilter === "all"
                  ? "Tất cả"
                  : STUDENT_STATUS_META[statusFilter]?.shortLabel || statusFilter}
              </span>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("non-archived");
                  setPage(1);
                }}
                aria-label="Xóa bộ lọc trạng thái"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={resetAllFilters}
          >
            Xóa tất cả
          </Button>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-warm/70 px-4 py-3 text-xs">
          <span className="font-semibold text-primary">
            Đã chọn {selectedIds.length} học sinh
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              className="bg-card"
              onClick={() => {
                if (selectedStudents.length > 0) setReportStudents(selectedStudents);
              }}
            >
              <FileText className="size-3.5" aria-hidden="true" />
              Xuất / In phiếu điểm ({selectedStudents.length})
            </Button>
            {activeSelectedStudents.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="xs"
                  className="bg-card"
                  onClick={() => setIsBulkTransferOpen(true)}
                >
                  <ArrowRightLeft className="size-3.5 text-primary" aria-hidden="true" />
                  Chuyển lớp ({activeSelectedStudents.length})
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  className="border-amber-300 bg-card text-amber-700 hover:bg-amber-50"
                  onClick={() => setIsBulkArchiveDialogOpen(true)}
                >
                  <Archive className="size-3.5" aria-hidden="true" />
                  Lưu trữ ({activeSelectedStudents.length})
                </Button>
              </>
            )}
            {archivedSelectedStudents.length > 0 && (
              <Button
                variant="outline"
                size="xs"
                className="border-emerald-300 bg-card text-emerald-700 hover:bg-emerald-50"
                onClick={handleBulkRestore}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Khôi phục ({archivedSelectedStudents.length})
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={() => setSelectedIds([])}>
              Bỏ chọn
            </Button>
          </div>
        </div>
      )}

      {/* Student Data Table / Empty State */}
      {students.length === 0 ? (
        <EmptyState
          title="Không tìm thấy hồ sơ học sinh"
          description="Thử thay đổi từ khóa tìm kiếm hoặc đặt lại các bộ lọc lớp học, học phí."
          action={
            <Button variant="outline" size="sm" onClick={resetAllFilters}>
              Đặt lại bộ lọc
            </Button>
          }
        />
      ) : (
        <>
          <StudentTable
            students={students}
            classes={classes}
            alertSettings={alertSettings}
            accountsByStudentId={accountsByStudentId}
            selectedIds={selectedIds}
            page={currentPage}
            totalPages={totalPages}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelectOne={toggleSelectOne}
            onViewStudent={(stu, tab = "overview") => {
              setViewingInitialTab(tab);
              setViewingStudent(stu);
            }}
            onEditStudent={(stu) => {
              setEditingStudent(stu);
              setIsFormModalOpen(true);
            }}
            onArchiveStudent={(stu) => setArchivingStudent(stu)}
            onRestoreStudent={handleRestoreStudent}
          />
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
          />
        </>
      )}

      {/* Student 360° Detail Modal (5 Tabs) */}
      <StudentDetailModal
        student={viewingStudent}
        initialTab={viewingInitialTab}
        onClose={() => setViewingStudent(null)}
        classes={classes}
        classSessions={classSessions}
        alertSettings={alertSettings}
        account={viewingStudent ? accountsByStudentId[viewingStudent.id] : undefined}
        onStudentUpdated={handleStudentUpdatedInModal}
        onOpenEdit={(stu) => {
          setEditingStudent(stu);
          setIsFormModalOpen(true);
        }}
        onOpenReport={(stu) => setReportStudents([stu])}
        onAccountUpdated={loadAccounts}
      />

      {/* Create / Edit Form Modal */}
      <StudentFormModal
        open={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        editingStudent={editingStudent}
        classes={classes}
        students={students}
        defaultClassFilter={classFilter}
        onSaved={handleFormSaved}
        onAccountProvisioned={loadAccounts}
      />

      {/* Bulk Transfer Modal */}
      <StudentBulkTransferModal
        open={isBulkTransferOpen}
        onClose={() => setIsBulkTransferOpen(false)}
        selectedStudents={activeSelectedStudents}
        classes={classes}
        onTransferred={() => {
          setSelectedIds([]);
          triggerReload();
        }}
      />

      {/* Printable / Copyable Progress Report Modal */}
      <StudentReportModal
        open={reportStudents.length > 0}
        onClose={() => setReportStudents([])}
        students={reportStudents}
      />

      {/* Archive Single Confirmation */}
      <ConfirmDialog
        open={Boolean(archivingStudent)}
        onClose={() => setArchivingStudent(null)}
        onConfirm={handleArchiveConfirmed}
        title="Xác nhận lưu trữ hồ sơ học sinh?"
        description={
          archivingStudent
            ? `Hồ sơ "${archivingStudent.fullName}" (${archivingStudent.code}) sẽ được chuyển vào mục Lưu trữ. Sĩ số lớp sẽ tự động giảm 1, toàn bộ điểm số và lịch sử học tập vẫn được bảo lưu an toàn.`
            : ""
        }
        confirmLabel="Lưu trữ hồ sơ"
        variant="default"
      />

      {/* Bulk Archive Confirmation */}
      <ConfirmDialog
        open={isBulkArchiveDialogOpen}
        onClose={() => setIsBulkArchiveDialogOpen(false)}
        onConfirm={handleBulkArchiveConfirmed}
        title={`Xác nhận lưu trữ ${activeSelectedStudents.length} học sinh đã chọn?`}
        description="Các hồ sơ được chọn sẽ được chuyển vào mục Lưu trữ. Sĩ số các lớp liên quan sẽ tự động giảm tương ứng, toàn bộ lịch sử điểm số và học phí vẫn được bảo lưu an toàn."
        confirmLabel={`Lưu trữ ${activeSelectedStudents.length} hồ sơ`}
        variant="default"
      />

      {/* Import CSV Modal */}
      <StudentImportModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        classes={classes}
        existingCodes={students.map((s) => s.code)}
        onImported={() => {
          setPage(1);
          triggerReload();
        }}
      />

      {/* Academic Alert Settings Modal */}
      <StudentAlertSettingsModal
        open={isAlertSettingsOpen}
        onClose={() => setIsAlertSettingsOpen(false)}
        alertSettings={alertSettings}
        onSave={(next) => {
          setAlertSettings(next);
          setPage(1);
        }}
      />
    </div>
  );
}

export default function AdminStudentsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
          Đang tải hồ sơ học sinh...
        </div>
      }
    >
      <AdminStudentsContent />
    </React.Suspense>
  );
}
