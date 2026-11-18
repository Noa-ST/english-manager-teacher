"use client";

import * as React from "react";
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  Award,
  CalendarCheck,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileUp,
  Filter,
  MailCheck,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  ALERT_SETTINGS_STORAGE_KEY,
  DEFAULT_ALERT_SETTINGS,
  getStudentAcademicAlerts,
  matchesAcademicFilter,
  type AcademicAlertSettings,
  type AcademicFilterOption,
} from "@/services/academic-alert.service";
import {
  ADMIN_STUDENTS_DATA,
  CLASSROOMS_DATA,
  CLASS_SESSIONS_DATA,
  type AdminStudentRecord,
  type ClassroomGroup,
  type ClassSessionRecord,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { removeVietnameseTones } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

const DEFAULT_PAGE_SIZE = 10;

interface ParsedImportStudent {
  code: string;
  fullName: string;
  classId: string;
  className: string;
  targetGoal: string;
  tuitionStatus: "paid" | "due-soon" | "overdue";
  recentComment: string;
  isValid: boolean;
  errorReason?: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "," || char === ";") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function toInputDateFormat(val?: string): string {
  if (!val) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const parts = val.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return val;
}

function mergeClassesWithDefaults(cached: ClassroomGroup[]): ClassroomGroup[] {
  const map = new Map<string, ClassroomGroup>();
  for (const c of CLASSROOMS_DATA) {
    map.set(c.id, c);
  }
  for (const c of cached) {
    map.set(c.id, c);
  }
  return Array.from(map.values());
}

export default function AdminStudentsPage() {
  const { toast } = useToast();
  const [classes, setClasses] = React.useState<ClassroomGroup[]>(CLASSROOMS_DATA);

  const saveClassesState = React.useCallback(
    (updater: ClassroomGroup[] | ((prev: ClassroomGroup[]) => ClassroomGroup[])) => {
      setClasses((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("teacher_studio_classrooms_v1", JSON.stringify(next));
          } catch {
            // ignore storage errors
          }
        }
        return next;
      });
    },
    [],
  );

  const [students, setStudents] = React.useState<AdminStudentRecord[]>(
    ADMIN_STUDENTS_DATA,
  );
  const [classSessions, setClassSessions] = React.useState<ClassSessionRecord[]>(
    CLASS_SESSIONS_DATA,
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [classFilter, setClassFilter] = React.useState<string>("all");
  const [tuitionFilter, setTuitionFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<"active" | "archived" | "all">("active");
  const [academicFilter, setAcademicFilter] = React.useState<AcademicFilterOption>("all");
  const [alertSettings, setAlertSettings] = React.useState<AcademicAlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [isAlertSettingsOpen, setIsAlertSettingsOpen] = React.useState(false);
  const [tempAlertSettings, setTempAlertSettings] = React.useState<AcademicAlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [sortBy, setSortBy] = React.useState<"name" | "score" | "attendance">(
    "score",
  );
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  // Bulk selection
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] =
    React.useState(false);

  // Import CSV Modal state
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [parsedImportRows, setParsedImportRows] = React.useState<
    ParsedImportStudent[]
  >([]);
  const [isImporting, setIsImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Detail & Form Modals
  const [viewingStudent, setViewingStudent] =
    React.useState<AdminStudentRecord | null>(null);
  const [editingStudent, setEditingStudent] =
    React.useState<AdminStudentRecord | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [archivingStudent, setArchivingStudent] =
    React.useState<AdminStudentRecord | null>(null);

  // Form state for Create/Edit
  const [formName, setFormName] = React.useState("");
  const [formCode, setFormCode] = React.useState("");
  const [formClassId, setFormClassId] = React.useState<string>("cls-ii-01");
  const [formJoinedAt, setFormJoinedAt] = React.useState("");
  const [formGoal, setFormGoal] = React.useState("IELTS 7.0 Overall");
  const [formTuitionStatus, setFormTuitionStatus] =
    React.useState<AdminStudentRecord["tuitionStatus"]>("paid");
  const [formComment, setFormComment] = React.useState("");

  React.useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const savedClasses = localStorage.getItem("teacher_studio_classrooms_v1");
        if (savedClasses) {
          const parsed = JSON.parse(savedClasses);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setClasses(mergeClassesWithDefaults(parsed));
          }
        }
      } catch { }

      const params = new URLSearchParams(window.location.search);
      const q = params.get("classId");
      if (q) {
        setClassFilter(q);
        setFormClassId(q);
      }
    });
    apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true")
      .then((items) => {
        if (items && items.length > 0) {
          saveClassesState((prev) => {
            const map = new Map<string, ClassroomGroup>();
            for (const c of CLASSROOMS_DATA) {
              map.set(c.id, c);
            }
            for (const c of prev) {
              map.set(c.id, c);
            }
            for (const c of items) {
              map.set(c.id, c);
            }
            return Array.from(map.values());
          });
        }
      })
      .catch(() => { });

    apiRequest<AdminStudentRecord[]>("/api/admin/students?page=1&pageSize=100")
      .then((items) => {
        if (items.length > 0) setStudents(items);
      })
      .catch(() => { });

    apiRequest<ClassSessionRecord[]>("/api/admin/teaching-journal")
      .then((sesList) => {
        if (sesList) setClassSessions(sesList);
      })
      .catch(() => { });

    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem(ALERT_SETTINGS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
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
      } catch {
        // Ignore localStorage read errors
      }
    });
  }, [saveClassesState]);

  const refreshClasses = React.useCallback(() => {
    apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true")
      .then((items) => {
        if (items && items.length > 0) {
          saveClassesState(items);
        }
      })
      .catch(() => { });
  }, [saveClassesState]);

  const openCreateModal = () => {
    let nextNum = students.length + 1;
    let candidateCode = `HS-2026-${String(nextNum).padStart(2, "0")}`;
    while (students.some((s) => s.code.toUpperCase() === candidateCode)) {
      nextNum += 1;
      candidateCode = `HS-2026-${String(nextNum).padStart(2, "0")}`;
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const defaultClassId =
      classFilter !== "all" && classes.some((c) => c.id === classFilter)
        ? classFilter
        : (classes[0]?.id ?? "cls-ii-01");

    setEditingStudent(null);
    setFormName("");
    setFormCode(candidateCode);
    setFormClassId(defaultClassId);
    setFormJoinedAt(todayStr);
    setFormGoal("Đạt mục tiêu khóa học");
    setFormTuitionStatus("due-soon");
    setFormComment("");
    setIsCreateModalOpen(true);
  };

  const openEditModal = (stu: AdminStudentRecord) => {
    setEditingStudent(stu);
    setFormName(stu.fullName);
    setFormCode(stu.code);
    setFormClassId(stu.classId);
    setFormJoinedAt(toInputDateFormat(stu.joinedAt));
    setFormGoal(stu.targetGoal);
    setFormTuitionStatus(stu.tuitionStatus);
    setFormComment(stu.recentComment);
    setIsCreateModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập họ và tên học sinh.",
        variant: "error",
      });
      return;
    }

    const normalizedCode = formCode.trim().toUpperCase();
    if (!normalizedCode) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập mã định danh học sinh.",
        variant: "error",
      });
      return;
    }

    // Kiểm tra trùng mã học sinh trước khi gửi request
    const isDuplicate = students.some(
      (s) =>
        s.code.toUpperCase() === normalizedCode &&
        s.id !== editingStudent?.id,
    );
    if (isDuplicate) {
      toast({
        title: "Mã học sinh đã tồn tại",
        description: `Mã "${normalizedCode}" đã được sử dụng cho một học sinh khác. Vui lòng nhập mã khác.`,
        variant: "error",
      });
      return;
    }

    const targetClass =
      classes.find((c) => c.id === formClassId) ?? classes[0];

    // Capacity verification
    if (targetClass) {
      const isTransferOrNew = !editingStudent || editingStudent.classId !== targetClass.id;
      if (isTransferOrNew && targetClass.enrolled >= targetClass.capacity) {
        toast({
          title: "Lớp học đã đủ sĩ số",
          description: `Lớp "${targetClass.code} — ${targetClass.name}" đã đủ sĩ số tối đa (${targetClass.enrolled}/${targetClass.capacity} học viên). Không thể tiếp nhận thêm học sinh mới.`,
          variant: "error",
        });
        return;
      }
    }

    if (editingStudent) {
      try {
        const updated = await apiRequest<AdminStudentRecord>(
          `/api/admin/students/${encodeURIComponent(editingStudent.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              code: normalizedCode,
              fullName: formName.trim(),
              classId: targetClass?.id ?? editingStudent.classId,
              targetGoal: formGoal.trim(),
              tuitionStatus: formTuitionStatus,
              recentComment: formComment.trim(),
              joinedAt: formJoinedAt,
            }),
          },
        );
        refreshClasses();
        setStudents((prev) =>
          prev.map((item) => (item.id === editingStudent.id ? updated : item)),
        );
        toast({
          title: "Đã cập nhật hồ sơ học sinh",
          description: `Thông tin của ${formName} (${normalizedCode}) đã được lưu.`,
          variant: "success",
        });
        setIsCreateModalOpen(false);
      } catch (err) {
        toast({
          title: "Không thể cập nhật hồ sơ",
          description:
            err instanceof Error ? err.message : "Đã có lỗi xảy ra khi lưu thay đổi.",
          variant: "error",
        });
      }
    } else {
      try {
        const created = await apiRequest<AdminStudentRecord>(
          "/api/admin/students",
          {
            method: "POST",
            body: JSON.stringify({
              code: normalizedCode,
              fullName: formName.trim(),
              classId: targetClass?.id ?? classes[0]?.id ?? "cls-ii-01",
              targetGoal: formGoal.trim(),
              tuitionStatus: formTuitionStatus,
              recentComment: formComment.trim(),
              joinedAt: formJoinedAt,
            }),
          },
        );
        refreshClasses();
        setStudents((prev) => [created, ...prev]);
        toast({
          title: "Đã thêm học sinh mới",
          description: `Học sinh ${formName} (${normalizedCode}) đã được thêm vào danh sách.`,
          variant: "success",
        });
        setIsCreateModalOpen(false);
      } catch (err) {
        toast({
          title: "Không thể tạo hồ sơ học sinh",
          description:
            err instanceof Error ? err.message : "Đã có lỗi xảy ra khi thêm học sinh.",
          variant: "error",
        });
      }
    }
  };

  const handleArchiveConfirmed = async () => {
    if (!archivingStudent) return;
    try {
      await apiRequest(
        `/api/admin/students/${encodeURIComponent(archivingStudent.id)}`,
        { method: "DELETE" },
      );
    } catch {
      // Fallback if offline
    }
    refreshClasses();
    setStudents((prev) =>
      prev.map((s) =>
        s.id === archivingStudent.id
          ? { ...s, status: "archived", deletedAt: new Date().toISOString() }
          : s,
      ),
    );
    setSelectedIds((prev) => prev.filter((id) => id !== archivingStudent.id));
    toast({
      title: "Đã lưu trữ hồ sơ học sinh",
      description: `Hồ sơ ${archivingStudent.fullName} (${archivingStudent.code}) đã được chuyển vào mục Lưu trữ. Toàn bộ điểm số và học phí vẫn được bảo toàn.`,
      variant: "info",
    });
    setArchivingStudent(null);
  };

  const handleRestoreStudent = async (stu: AdminStudentRecord) => {
    try {
      await apiRequest(
        `/api/admin/students/${encodeURIComponent(stu.id)}/restore`,
        { method: "POST" },
      );
    } catch (err) {
      toast({
        title: "Không thể khôi phục",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        variant: "error",
      });
      return;
    }
    refreshClasses();
    setStudents((prev) =>
      prev.map((item) =>
        item.id === stu.id
          ? { ...item, status: "active", deletedAt: null }
          : item,
      ),
    );
    toast({
      title: "Đã khôi phục hồ sơ",
      description: `Học sinh ${stu.fullName} (${stu.code}) đã quay lại danh sách đang theo học.`,
      variant: "success",
    });
  };

  const activeSelectedStudents = React.useMemo(
    () => students.filter((s) => selectedIds.includes(s.id) && s.status !== "archived"),
    [students, selectedIds],
  );

  const archivedSelectedStudents = React.useMemo(
    () => students.filter((s) => selectedIds.includes(s.id) && s.status === "archived"),
    [students, selectedIds],
  );

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
    } catch {
      // offline fallback
    }

    const idSet = new Set(idsToArchive);
    setStudents((prev) =>
      prev.map((s) =>
        idSet.has(s.id)
          ? { ...s, status: "archived", deletedAt: new Date().toISOString() }
          : s,
      ),
    );
    setSelectedIds([]);
    setIsBulkArchiveDialogOpen(false);
    toast({
      title: "Đã lưu trữ hàng loạt",
      description: `Đã chuyển ${idsToArchive.length} hồ sơ học sinh vào mục Lưu trữ. Sĩ số các lớp liên quan đã giảm tương ứng.`,
      variant: "info",
    });
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
    } catch {
      // offline fallback
    }

    const idSet = new Set(idsToRestore);
    setStudents((prev) =>
      prev.map((s) =>
        idSet.has(s.id)
          ? { ...s, status: "active", deletedAt: null }
          : s,
      ),
    );
    setSelectedIds([]);
    toast({
      title: "Đã khôi phục hàng loạt",
      description: `Đã khôi phục thành công ${idsToRestore.length} hồ sơ học sinh về trạng thái đang theo học.`,
      variant: "success",
    });
  };

  const handleExportExcel = () => {
    const targetList = filteredAndSorted.length > 0 ? filteredAndSorted : students;
    const headers = [
      "Mã học sinh",
      "Họ và tên",
      "Lớp theo học",
      "Trình độ",
      "Điểm TB",
      "Chuyên cần (%)",
      "Trạng thái học phí",
      "Mức học phí",
      "Kỳ học phí",
      "Tình trạng học vụ",
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
      s.averageScore > 0 ? s.averageScore.toFixed(1) : "—",
      s.attendanceHistory.length > 0 ? `${s.attendanceRate}%` : "—",
      s.tuitionStatus === "paid"
        ? "Đã đóng"
        : s.tuitionStatus === "due-soon"
          ? "Sắp đến hạn"
          : "Quá hạn",
      s.tuitionAmount,
      s.tuitionPeriod,
      s.status === "archived" ? "Đã lưu trữ" : "Đang học",
      s.targetGoal,
      s.recentComment,
      s.joinedAt,
    ]);

    const csvContent =
      "\uFEFF" +
      [
        headers.map(escapeCsv).join(","),
        ...rows.map((r) => r.map(escapeCsv).join(",")),
      ].join("\r\n");

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
      description: `Đã tải xuống file CSV chuẩn Excel (${targetList.length} học sinh, hỗ trợ tiếng Việt đầy đủ).`,
      variant: "success",
    });
  };

  const handleDownloadTemplate = () => {
    const templateHeaders = [
      "Mã học sinh",
      "Họ và tên",
      "Mã lớp hoặc Tên lớp",
      "Mục tiêu đầu ra",
      "Trạng thái học phí (paid/due-soon/overdue)",
      "Nhận xét giáo viên",
    ];
    const sampleRows = [
      [
        "HS-2026-90",
        "Trần Văn Bình",
        "cls-ii-01",
        "IELTS 7.0 Overall",
        "due-soon",
        "Học viên mới nhập học",
      ],
      [
        "HS-2026-91",
        "Lê Thị Mai",
        "cls-aw-02",
        "Writing 7.5+ & Học bổng",
        "paid",
        "Nền tảng ngữ pháp chắc",
      ],
      [
        "HS-2026-92",
        "Hoàng Tuấn Anh",
        "cls-if-01",
        "IELTS 6.0",
        "due-soon",
        "Cần luyện thêm phát âm",
      ],
    ];

    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const csvContent =
      "\uFEFF" +
      [
        templateHeaders.map(escapeCsv).join(","),
        ...sampleRows.map((r) => r.map(escapeCsv).join(",")),
      ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Mau_nhap_hoc_sinh.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        toast({
          title: "File CSV trống",
          description: "File không chứa dữ liệu học sinh.",
          variant: "error",
        });
        return;
      }

      const startIndex =
        lines[0].toLowerCase().includes("mã") ||
          lines[0].toLowerCase().includes("code")
          ? 1
          : 0;

      const seenCodes = new Set<string>();
      const results: ParsedImportStudent[] = [];

      for (let i = startIndex; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 2 || !cols.some((c) => c.length > 0)) continue;

        const rawCode = (cols[0] || "").trim().toUpperCase();
        const fullName = (cols[1] || "").trim();
        const rawClass = (cols[2] || "").trim();
        const targetGoal = (cols[3] || "").trim() || "Đạt mục tiêu khóa học";
        const rawTuition = (cols[4] || "").trim().toLowerCase();
        const recentComment = (cols[5] || "").trim() || "Nhập từ file CSV.";

        let tuitionStatus: "paid" | "due-soon" | "overdue" = "due-soon";
        if (
          rawTuition === "paid" ||
          rawTuition.includes("đã đóng") ||
          rawTuition.includes("hoàn thành")
        ) {
          tuitionStatus = "paid";
        } else if (rawTuition === "overdue" || rawTuition.includes("quá hạn")) {
          tuitionStatus = "overdue";
        }

        const matchedClass =
          classes.find(
            (c) =>
              c.id === rawClass ||
              c.code.toUpperCase() === rawClass.toUpperCase() ||
              c.name.toLowerCase().includes(rawClass.toLowerCase()),
          ) ?? classes[0];

        let isValid = true;
        let errorReason = "";

        if (!rawCode) {
          isValid = false;
          errorReason = "Thiếu mã học sinh";
        } else if (!fullName) {
          isValid = false;
          errorReason = "Thiếu họ và tên";
        } else if (students.some((s) => s.code.toUpperCase() === rawCode)) {
          isValid = false;
          errorReason = `Mã "${rawCode}" đã tồn tại trong hệ thống`;
        } else if (seenCodes.has(rawCode)) {
          isValid = false;
          errorReason = `Mã "${rawCode}" bị trùng lặp trong file CSV`;
        }

        if (isValid) {
          seenCodes.add(rawCode);
        }

        results.push({
          code: rawCode,
          fullName,
          classId: matchedClass?.id ?? "cls-ii-01",
          className: matchedClass?.name ?? "IELTS Intensive",
          targetGoal,
          tuitionStatus,
          recentComment,
          isValid,
          errorReason,
        });
      }

      setParsedImportRows(results);
    };

    reader.readAsText(file, "utf-8");
  };

  const handleConfirmImport = async () => {
    const validRows = parsedImportRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsImporting(true);
    try {
      const response = await apiRequest<{
        created: AdminStudentRecord[];
        failed: { code: string; reason: string }[];
      }>("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          action: "batch-create",
          students: validRows.map((r) => ({
            code: r.code,
            fullName: r.fullName,
            classId: r.classId,
            targetGoal: r.targetGoal,
            tuitionStatus: r.tuitionStatus,
            recentComment: r.recentComment,
          })),
        }),
      });

      if (response.created && response.created.length > 0) {
        setStudents((prev) => [...response.created, ...prev]);
        toast({
          title: "Nhập danh sách thành công",
          description: `Đã thêm thành công ${response.created.length} học sinh mới vào hệ thống.`,
          variant: "success",
        });
        setIsImportModalOpen(false);
        setImportFile(null);
        setParsedImportRows([]);
      } else {
        toast({
          title: "Không thể thêm học sinh",
          description: "Các dòng đều bị lỗi hoặc trùng mã.",
          variant: "error",
        });
      }
    } catch (err) {
      toast({
        title: "Lỗi nhập CSV",
        description:
          err instanceof Error ? err.message : "Đã có lỗi xảy ra khi nhập dữ liệu.",
        variant: "error",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const filteredAndSorted = students
    .filter((s) => {
      const matchesClass = classFilter === "all" || s.classId === classFilter;
      const matchesTuition =
        tuitionFilter === "all" || s.tuitionStatus === tuitionFilter;
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "archived"
            ? s.status === "archived"
            : s.status !== "archived";
      const matchesAcademic = matchesAcademicFilter(
        s,
        academicFilter,
        alertSettings,
      );
      const q = searchQuery.trim();
      if (!q)
        return (
          matchesClass && matchesTuition && matchesStatus && matchesAcademic
        );

      const normQ = removeVietnameseTones(q);
      const matchesSearch =
        removeVietnameseTones(s.fullName).includes(normQ) ||
        removeVietnameseTones(s.code).includes(normQ) ||
        removeVietnameseTones(s.className).includes(normQ);
      return (
        matchesClass &&
        matchesTuition &&
        matchesStatus &&
        matchesAcademic &&
        matchesSearch
      );
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.fullName.localeCompare(b.fullName, "vi");
      if (sortBy === "attendance") return b.attendanceRate - a.attendanceRate;
      return b.averageScore - a.averageScore;
    });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSorted.length / pageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedStudents = filteredAndSorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const toggleSelectAll = () => {
    const pageIds = paginatedStudents.map((s) => s.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
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

  // Computed KPI Metrics for Top Stat Cards
  const activeStudentsList = students.filter((s) => s.status !== "archived");
  const totalActiveStudents = activeStudentsList.length;

  const studentsWithScore = activeStudentsList.filter(
    (s) => s.grades.length > 0 && s.averageScore > 0,
  );
  const avgIeltsScore =
    studentsWithScore.length > 0
      ? (
        studentsWithScore.reduce((sum, s) => sum + s.averageScore, 0) /
        studentsWithScore.length
      ).toFixed(1)
      : "—";

  const highAchieversCount = activeStudentsList.filter(
    (s) => s.averageScore >= 8.0,
  ).length;

  const studentsWithAttendance = activeStudentsList.filter(
    (s) => s.attendanceHistory.length > 0,
  );
  const avgAttendanceRate =
    studentsWithAttendance.length > 0
      ? (
        studentsWithAttendance.reduce((sum, s) => sum + s.attendanceRate, 0) /
        studentsWithAttendance.length
      ).toFixed(1)
      : "100.0";

  const dueSoonCount = activeStudentsList.filter(
    (s) => s.tuitionStatus === "due-soon",
  ).length;
  const overdueCount = activeStudentsList.filter(
    (s) => s.tuitionStatus === "overdue",
  ).length;
  const totalTuitionAlerts = dueSoonCount + overdueCount;

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    classFilter !== "all" ||
    tuitionFilter !== "all" ||
    statusFilter !== "active" ||
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
            Quản lý mã định danh, theo dõi tiến độ 4 kỹ năng, chuyên cần và học phí của từng học
            viên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportModalOpen(true)}
          >
            <FileUp className="size-3.5" aria-hidden="true" />
            Nhập CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
          >
            <Download className="size-3.5" aria-hidden="true" />
            Xuất Excel
          </Button>
          <Button size="sm" onClick={openCreateModal}>
            <UserPlus className="size-3.5" aria-hidden="true" />
            Thêm học sinh mới
          </Button>
        </div>
      </div>

      {/* 4 Top Academic Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Học viên đang học */}
        <div
          onClick={() => {
            setStatusFilter("active");
            setPage(1);
          }}
          className="group cursor-pointer rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs"
          title="Xem danh sách học sinh đang học"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Đang theo học</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-warm text-primary group-hover:scale-105 transition-transform">
              <Users className="size-3.5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-foreground">
            {totalActiveStudents}{" "}
            <span className="text-xs font-normal text-muted-foreground">học viên</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Phân bổ trên {classes.length} lớp học
          </p>
        </div>

        {/* Card 2: Điểm TB IELTS */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Điểm TB IELTS</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Award className="size-3.5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-foreground">
            {avgIeltsScore}{" "}
            <span className="text-xs font-normal text-muted-foreground">Overall</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {highAchieversCount} học viên đạt Band ≥ 8.0
          </p>
        </div>

        {/* Card 3: Tỷ lệ Chuyên cần */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Tỷ lệ Chuyên cần</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <CalendarCheck className="size-3.5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-700">
            {avgAttendanceRate}%
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Mục tiêu học kỳ: ≥ 92.0%
          </p>
        </div>

        {/* Card 4: Cảnh báo học phí */}
        <div
          onClick={() => {
            setTuitionFilter(overdueCount > 0 ? "overdue" : "due-soon");
            setPage(1);
          }}
          className="group cursor-pointer rounded-2xl border border-border bg-card p-4 transition-all hover:border-amber-400 hover:shadow-xs"
          title="Bấm để lọc nhanh học sinh cần nhắc học phí"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Cần lưu ý Học phí</span>
            <div
              className={`flex size-7 items-center justify-center rounded-lg ${overdueCount > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-amber-500/10 text-amber-600"
                } group-hover:scale-105 transition-transform`}
            >
              <AlertTriangle className="size-3.5" aria-hidden="true" />
            </div>
          </div>
          <p
            className={`mt-2 font-mono text-2xl font-bold ${overdueCount > 0 ? "text-destructive" : "text-amber-700"
              }`}
          >
            {totalTuitionAlerts}{" "}
            <span className="text-xs font-normal text-muted-foreground">học viên</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {dueSoonCount} sắp hạn · {overdueCount} quá hạn thanh toán
          </p>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        {/* Row 1 — Search */}
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
            placeholder="Tìm theo họ tên, mã học sinh (VD: HS-2026-01), tên lớp..."
            aria-label="Tìm kiếm học sinh"
            className="pl-9"
          />
        </div>

        {/* Row 2 — Filters (single row, scrollable on small screens) */}
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
              setStatusFilter(e.target.value as "active" | "archived" | "all");
              setPage(1);
            }}
            aria-label="Lọc theo tình trạng học vụ"
            className="h-8 shrink-0 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="active">
              Đang học ({students.filter((s) => s.status !== "archived").length})
            </option>
            <option value="archived">
              Đã lưu trữ ({students.filter((s) => s.status === "archived").length})
            </option>
            <option value="all">Tất cả hồ sơ ({students.length})</option>
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
            <option value="has-alerts">
              ⚠️ Cần quan tâm ({students.filter((s) => getStudentAcademicAlerts(s, alertSettings).length > 0).length})
            </option>
            <option value="low-attendance">
              Chuyên cần thấp (&lt; {alertSettings.attendanceThreshold}%)
            </option>
            <option value="below-target">Điểm dưới mục tiêu</option>
            <option value="no-grades">Chưa có điểm đánh giá</option>
            <option value="no-recent-comment">Chưa có nhận xét gần đây</option>
          </select>

          {/* spacer pushes buttons to the right on wide screens */}
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
                : "Họ tên"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setTempAlertSettings({ ...alertSettings });
              setIsAlertSettingsOpen(true);
            }}
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
                  setPage(1);
                }}
                className="hover:opacity-75 focus:outline-hidden"
                aria-label="Xóa bộ lọc tìm kiếm"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          )}
          {classFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>
                Lớp: {classes.find((c) => c.id === classFilter)?.name || classFilter}
              </span>
              <button
                type="button"
                onClick={() => {
                  setClassFilter("all");
                  setPage(1);
                }}
                className="hover:opacity-75 focus:outline-hidden"
                aria-label="Xóa bộ lọc lớp"
              >
                <X className="size-3" aria-hidden="true" />
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
                className="hover:opacity-75 focus:outline-hidden"
                aria-label="Xóa bộ lọc học phí"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          )}
          {statusFilter !== "active" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span>
                Hồ sơ: {statusFilter === "archived" ? "Đã lưu trữ" : "Tất cả hồ sơ"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("active");
                  setPage(1);
                }}
                className="hover:opacity-75 focus:outline-hidden"
                aria-label="Xóa bộ lọc trạng thái học vụ"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          )}
          {academicFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/80 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800">
              <span>
                Học tập:{" "}
                {academicFilter === "has-alerts"
                  ? "Cần quan tâm"
                  : academicFilter === "low-attendance"
                    ? `Chuyên cần < ${alertSettings.attendanceThreshold}%`
                    : academicFilter === "below-target"
                      ? "Điểm dưới mục tiêu"
                      : academicFilter === "no-grades"
                        ? "Chưa có điểm"
                        : "Chưa có nhận xét"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAcademicFilter("all");
                  setPage(1);
                }}
                className="hover:opacity-75 focus:outline-hidden"
                aria-label="Xóa bộ lọc tình trạng học tập"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearchQuery("");
              setClassFilter("all");
              setTuitionFilter("all");
              setStatusFilter("active");
              setAcademicFilter("all");
              setPage(1);
            }}
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
                toast({
                  title: "Đã gửi phiếu báo học tập",
                  description: `Đã gửi báo cáo định kỳ cho ${selectedIds.length} học sinh đã chọn.`,
                  variant: "success",
                });
                setSelectedIds([]);
              }}
            >
              <MailCheck className="size-3.5" aria-hidden="true" />
              Gửi phiếu điểm hàng loạt
            </Button>
            {activeSelectedStudents.length > 0 && (
              <Button
                variant="outline"
                size="xs"
                className="bg-card border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => setIsBulkArchiveDialogOpen(true)}
              >
                <Archive className="size-3.5" aria-hidden="true" />
                Lưu trữ ({activeSelectedStudents.length})
              </Button>
            )}
            {archivedSelectedStudents.length > 0 && (
              <Button
                variant="outline"
                size="xs"
                className="bg-card border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={handleBulkRestore}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Khôi phục ({archivedSelectedStudents.length})
              </Button>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelectedIds([])}
            >
              Bỏ chọn
            </Button>
          </div>
        </div>
      )}

      {/* Data Table */}
      {paginatedStudents.length === 0 ? (
        <EmptyState
          title="Không tìm thấy hồ sơ học sinh"
          description="Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc lớp học."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setClassFilter("all");
                setTuitionFilter("all");
                setStatusFilter("active");
                setAcademicFilter("all");
              }}
            >
              Đặt lại bộ lọc
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block">
            <Table className="border-0 rounded-none">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả học sinh trên trang"
                      checked={
                        paginatedStudents.length > 0 &&
                        paginatedStudents.every((s) => selectedIds.includes(s.id))
                      }
                      onChange={toggleSelectAll}
                      className="size-4 rounded border-input accent-primary"
                    />
                  </TableHead>
                  <TableHead>Mã HS & Họ tên</TableHead>
                  <TableHead>Lớp theo học</TableHead>
                  <TableHead className="text-center">Điểm TB</TableHead>
                  <TableHead className="text-center">Chuyên cần</TableHead>
                  <TableHead>Học phí</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedStudents.map((stu) => (
                  <TableRow key={stu.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Chọn học sinh ${stu.fullName}`}
                        checked={selectedIds.includes(stu.id)}
                        onChange={() => toggleSelectOne(stu.id)}
                        className="size-4 rounded border-input accent-primary"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm font-heading text-xs font-bold text-primary">
                          {stu.fullName
                            .split(" ")
                            .slice(-2)
                            .map((w) => w[0])
                            .join("")}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-heading text-sm font-semibold text-foreground">
                              {stu.fullName}
                            </p>
                            {stu.status === "archived" && (
                              <Badge
                                variant="outline"
                                className="border-amber-400/60 bg-amber-500/10 text-[10px] font-medium text-amber-700"
                              >
                                Đã lưu trữ
                              </Badge>
                            )}
                            {(() => {
                              const stuAlerts = getStudentAcademicAlerts(
                                stu,
                                alertSettings,
                              );
                              if (stuAlerts.length === 0) return null;
                              const isDestructive = stuAlerts.some(
                                (a) => a.level === "destructive",
                              );
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium cursor-help transition-colors ${isDestructive
                                    ? "border border-destructive/30 bg-destructive/10 text-destructive"
                                    : "border border-amber-300/80 bg-amber-500/10 text-amber-800"
                                    }`}
                                  title={stuAlerts
                                    .map((a) => `• ${a.title}: ${a.description}`)
                                    .join("\n")}
                                >
                                  <AlertTriangle
                                    className="size-3 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>{stuAlerts.length} lưu ý</span>
                                </span>
                              );
                            })()}
                          </div>
                          <p className="font-mono text-xs text-muted-foreground">
                            {stu.code} · Mục tiêu: {stu.targetGoal}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">
                        {stu.className}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Trình độ {stu.level}
                      </p>
                    </TableCell>
                    <TableCell className="text-center">
                      {stu.grades.length > 0 && stu.averageScore > 0 ? (
                        <Badge variant="default" className="font-mono">
                          {stu.averageScore.toFixed(1)}
                        </Badge>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground" title="Chưa có bài kiểm tra">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {stu.attendanceHistory.length > 0 ? (
                        <span className="font-mono text-xs font-semibold text-emerald-700">
                          {stu.attendanceRate}%
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground" title="Chưa có dữ liệu điểm danh">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          stu.tuitionStatus === "paid"
                            ? "success"
                            : stu.tuitionStatus === "due-soon"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {stu.tuitionStatus === "paid"
                          ? "Đã đóng"
                          : stu.tuitionStatus === "due-soon"
                            ? "Sắp đến hạn"
                            : "Quá hạn"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setViewingStudent(stu)}
                          aria-label={`Xem chi tiết ${stu.fullName}`}
                          title="Xem chi tiết hồ sơ"
                        >
                          <Eye className="size-3.5 text-primary" aria-hidden="true" />
                        </Button>
                        {stu.status === "archived" ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleRestoreStudent(stu)}
                            aria-label={`Khôi phục ${stu.fullName}`}
                            title="Khôi phục về danh sách đang học"
                          >
                            <RotateCcw className="size-3.5 text-emerald-600" aria-hidden="true" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => openEditModal(stu)}
                              aria-label={`Chỉnh sửa ${stu.fullName}`}
                              title="Chỉnh sửa hồ sơ"
                            >
                              <Edit3 className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setArchivingStudent(stu)}
                              aria-label={`Lưu trữ ${stu.fullName}`}
                              title="Lưu trữ hồ sơ"
                            >
                              <Archive className="size-3.5 text-amber-600" aria-hidden="true" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View (screens < md) */}
          <div className="block md:hidden divide-y divide-border">
            <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5 text-xs">
              <label className="flex cursor-pointer items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả học sinh trên trang"
                  checked={
                    paginatedStudents.length > 0 &&
                    paginatedStudents.every((s) => selectedIds.includes(s.id))
                  }
                  onChange={toggleSelectAll}
                  className="size-4 rounded border-input accent-primary"
                />
                <span>Chọn tất cả trang ({paginatedStudents.length})</span>
              </label>
              <span className="font-mono text-[11px] text-muted-foreground">
                Trang {currentPage}/{totalPages}
              </span>
            </div>

            {paginatedStudents.map((stu) => (
              <div
                key={stu.id}
                className={`p-4 transition-colors ${selectedIds.includes(stu.id) ? "bg-primary/5" : ""
                  }`}
              >
                {/* Header Row: Checkbox + Avatar + Name/Code + Tuition Badge */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      aria-label={`Chọn học sinh ${stu.fullName}`}
                      checked={selectedIds.includes(stu.id)}
                      onChange={() => toggleSelectOne(stu.id)}
                      className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
                    />
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm font-heading text-xs font-bold text-primary">
                      {stu.fullName
                        .split(" ")
                        .slice(-2)
                        .map((w) => w[0])
                        .join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-heading text-sm font-semibold text-foreground truncate">
                          {stu.fullName}
                        </span>
                        {stu.status === "archived" && (
                          <Badge
                            variant="outline"
                            className="border-amber-400/60 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-700"
                          >
                            Đã lưu trữ
                          </Badge>
                        )}
                        {(() => {
                          const stuAlerts = getStudentAcademicAlerts(
                            stu,
                            alertSettings,
                          );
                          if (stuAlerts.length === 0) return null;
                          const isDestructive = stuAlerts.some(
                            (a) => a.level === "destructive",
                          );
                          return (
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${isDestructive
                                ? "border border-destructive/30 bg-destructive/10 text-destructive"
                                : "border border-amber-300/80 bg-amber-500/10 text-amber-800"
                                }`}
                              title={stuAlerts
                                .map((a) => `• ${a.title}: ${a.description}`)
                                .join("\n")}
                            >
                              <AlertTriangle
                                className="size-3 shrink-0"
                                aria-hidden="true"
                              />
                              <span>{stuAlerts.length} lưu ý</span>
                            </span>
                          );
                        })()}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {stu.code}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={
                      stu.tuitionStatus === "paid"
                        ? "success"
                        : stu.tuitionStatus === "due-soon"
                          ? "warning"
                          : "destructive"
                    }
                    className="shrink-0 text-[11px]"
                  >
                    {stu.tuitionStatus === "paid"
                      ? "Đã đóng"
                      : stu.tuitionStatus === "due-soon"
                        ? "Sắp đến hạn"
                        : "Quá hạn"}
                  </Badge>
                </div>

                {/* Class & Academic Info Box */}
                <div className="mt-2.5 space-y-1.5 rounded-xl bg-muted/30 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Lớp học:</span>
                    <span className="font-medium text-foreground text-right truncate">
                      {stu.className} ({stu.level})
                    </span>
                  </div>
                  {stu.targetGoal && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">Mục tiêu:</span>
                      <span className="text-foreground text-right truncate">
                        {stu.targetGoal}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Điểm TB:</span>
                      {stu.grades.length > 0 && stu.averageScore > 0 ? (
                        <Badge variant="default" className="font-mono text-[11px] py-0 px-1.5">
                          {stu.averageScore.toFixed(1)}
                        </Badge>
                      ) : (
                        <span className="font-mono text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Chuyên cần:</span>
                      {stu.attendanceHistory.length > 0 ? (
                        <span className="font-mono font-semibold text-emerald-700">
                          {stu.attendanceRate}%
                        </span>
                      ) : (
                        <span className="font-mono text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setViewingStudent(stu)}
                    className="gap-1 text-xs"
                    aria-label={`Xem chi tiết ${stu.fullName}`}
                  >
                    <Eye className="size-3.5 text-primary" aria-hidden="true" />
                    Chi tiết
                  </Button>
                  {stu.status === "archived" ? (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleRestoreStudent(stu)}
                      className="gap-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      aria-label={`Khôi phục ${stu.fullName}`}
                    >
                      <RotateCcw className="size-3.5 text-emerald-600" aria-hidden="true" />
                      Khôi phục
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => openEditModal(stu)}
                        className="gap-1 text-xs"
                        aria-label={`Chỉnh sửa ${stu.fullName}`}
                      >
                        <Edit3 className="size-3.5" aria-hidden="true" />
                        Sửa
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setArchivingStudent(stu)}
                        className="gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                        aria-label={`Lưu trữ ${stu.fullName}`}
                      >
                        <Archive className="size-3.5 text-amber-600" aria-hidden="true" />
                        Lưu trữ
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            totalItems={filteredAndSorted.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>
      )}

      {/* Student Detail Modal */}
      <ModalDialog
        open={Boolean(viewingStudent)}
        onClose={() => setViewingStudent(null)}
        title={
          viewingStudent
            ? `Hồ sơ Học vụ: ${viewingStudent.fullName} (${viewingStudent.code})`
            : "Chi tiết học sinh"
        }
        description={
          viewingStudent
            ? `${viewingStudent.className} · Ngày nhập học: ${viewingStudent.joinedAt || "—"}`
            : undefined
        }
        size="lg"
        footer={
          viewingStudent ? (
            <>
              <Button variant="outline" onClick={() => setViewingStudent(null)}>
                Đóng
              </Button>
              <Button
                onClick={() => {
                  const target = viewingStudent;
                  setViewingStudent(null);
                  openEditModal(target);
                }}
              >
                <Edit3 className="size-4" aria-hidden="true" />
                Chỉnh sửa hồ sơ
              </Button>
            </>
          ) : undefined
        }
      >
        {viewingStudent && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-background p-3.5">
                <span className="text-muted-foreground">Điểm trung bình</span>
                <p className="mt-1 font-mono text-xl font-bold text-primary">
                  {viewingStudent.grades.length > 0 && viewingStudent.averageScore > 0
                    ? viewingStudent.averageScore.toFixed(1)
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-background p-3.5">
                <span className="text-muted-foreground">Chuyên cần</span>
                <p className="mt-1 font-mono text-xl font-bold text-emerald-700">
                  {viewingStudent.attendanceHistory.length > 0
                    ? `${viewingStudent.attendanceRate}%`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-warm/60 p-3.5">
                <span className="text-muted-foreground">Học phí</span>
                <p className="mt-1 font-mono text-sm font-bold text-foreground">
                  {viewingStudent.tuitionAmount}
                </p>
              </div>
              <div className="rounded-xl bg-background p-3.5">
                <span className="text-muted-foreground">Ngày nhập học</span>
                <p className="mt-1 font-mono text-sm font-bold text-primary">
                  {viewingStudent.joinedAt || "—"}
                </p>
              </div>
            </div>

            {/* Cảnh báo học vụ tự động nhận diện */}
            {(() => {
              const viewingAlerts = getStudentAcademicAlerts(
                viewingStudent,
                alertSettings,
              );
              if (viewingAlerts.length === 0) return null;
              return (
                <div className="rounded-xl border border-amber-300/80 bg-amber-500/10 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-amber-900">
                      <AlertTriangle
                        className="size-4 text-amber-600"
                        aria-hidden="true"
                      />
                      <span>
                        Cảnh báo học vụ cần quan tâm ({viewingAlerts.length})
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-amber-700">
                      Tự động nhận diện
                    </span>
                  </div>
                  <div className="mt-2.5 divide-y divide-amber-200/50">
                    {viewingAlerts.map((alt, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 py-2 text-xs first:pt-1 last:pb-0"
                      >
                        <span
                          className={`mt-1 size-2 shrink-0 rounded-full ${alt.level === "destructive"
                            ? "bg-destructive"
                            : "bg-amber-500"
                            }`}
                        />
                        <div>
                          <p className="font-semibold text-foreground">
                            {alt.title}
                          </p>
                          <p className="mt-0.5 text-muted-foreground">
                            {alt.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="rounded-xl border border-border bg-warm/40 p-4">
              <p className="font-semibold text-primary">Nhận xét gần nhất của giáo viên:</p>
              <p className="mt-1 leading-relaxed text-foreground">
                {viewingStudent.recentComment
                  ? `“${viewingStudent.recentComment}”`
                  : "Chưa có nhận xét."}
              </p>
            </div>

            <div>
              <h4 className="mb-2 font-heading text-sm font-bold text-foreground">
                Bảng điểm các bài kiểm tra ({viewingStudent.grades.length})
              </h4>
              {viewingStudent.grades.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
                  Học sinh mới nhập học, chưa có bài kiểm tra nào được ghi nhận.
                </div>
              ) : (
                <div className="space-y-2">
                  {viewingStudent.grades.map((g) => (
                    <div
                      key={g.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3"
                    >
                      <div>
                        <p className="font-semibold text-foreground">{g.assessmentTitle}</p>
                        <p className="text-muted-foreground">
                          Ngày: {g.date} · L:{g.listening} R:{g.reading} W:{g.writing} S:
                          {g.speaking}
                        </p>
                      </div>
                      <Badge variant="default" className="font-mono">
                        Overall {g.overall.toFixed(1)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quá trình học tập theo từng buổi (Session Learning Timeline) */}
            <div>
              <h4 className="mb-2 font-heading text-sm font-bold text-foreground">
                Quá trình Học tập theo từng Buổi (Timeline)
              </h4>
              {(() => {
                const stuSessions = classSessions
                  .filter((ses) =>
                    ses.studentRecords.some(
                      (r) => r.studentId === viewingStudent.id,
                    ),
                  )
                  .sort((a, b) => b.date.localeCompare(a.date));

                if (stuSessions.length === 0) {
                  return (
                    <div className="rounded-xl border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
                      Chưa có nhật ký buổi học nào được ghi nhận cho học sinh này.
                    </div>
                  );
                }

                return (
                  <div className="max-h-[260px] space-y-2.5 overflow-y-auto pr-1">
                    {stuSessions.map((ses) => {
                      const rec = ses.studentRecords.find(
                        (r) => r.studentId === viewingStudent.id,
                      )!;
                      const dp = ses.date.split("-");
                      const dispDate =
                        dp.length === 3
                          ? `${dp[2]}/${dp[1]}/${dp[0]}`
                          : ses.date;

                      return (
                        <div
                          key={ses.id}
                          className="space-y-1.5 rounded-xl border border-border bg-background p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-foreground">
                              {dispDate} – {ses.topic}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant={
                                  rec.attendance === "present"
                                    ? "secondary"
                                    : rec.attendance === "absent"
                                      ? "destructive"
                                      : "outline"
                                }
                                className="text-[10px]"
                              >
                                Điểm danh:{" "}
                                {rec.attendance === "present"
                                  ? "Có mặt"
                                  : rec.attendance === "late"
                                    ? "Đi muộn"
                                    : rec.attendance === "excused"
                                      ? "Vắng có phép"
                                      : "Vắng không phép"}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                Bài tập:{" "}
                                {rec.homeworkStatus === "submitted"
                                  ? "Đã nộp"
                                  : rec.homeworkStatus === "not-submitted"
                                    ? "Chưa nộp"
                                    : rec.homeworkStatus === "exempt"
                                      ? "Miễn"
                                      : "Chưa ghi nhận"}
                              </Badge>
                              {rec.learningStatus !== "unrecorded" && (
                                <Badge variant="default" className="text-[10px]">
                                  Kết quả:{" "}
                                  {rec.learningStatus === "good"
                                    ? "Tốt"
                                    : rec.learningStatus === "satisfactory"
                                      ? "Đạt"
                                      : "Cần hỗ trợ"}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {rec.teacherFeedback && (
                            <p className="text-muted-foreground">
                              <strong>Nhận xét:</strong> {rec.teacherFeedback}
                            </p>
                          )}
                          {rec.followUp && (
                            <p className="font-medium text-primary">
                              <strong>Cần hỗ trợ tiếp:</strong> {rec.followUp}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Create / Edit Student Modal */}
      <ModalDialog
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={
          editingStudent
            ? `Cập nhật học sinh: ${editingStudent.fullName}`
            : "Thêm hồ sơ học sinh mới"
        }
        description="Thông tin học sinh được bảo mật và đồng bộ với Cổng tra cứu cá nhân."
        size="md"
      >
        <form onSubmit={handleSaveStudent} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-code"
                className="block text-xs font-semibold text-foreground"
              >
                Mã định danh học sinh
              </label>
              <Input
                id="stu-form-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                required
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-name"
                className="block text-xs font-semibold text-foreground"
              >
                Họ và tên học sinh
              </label>
              <Input
                id="stu-form-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nhập họ và tên đầy đủ"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-class"
                className="block text-xs font-semibold text-foreground"
              >
                Phân lớp học
              </label>
              <select
                id="stu-form-class"
                value={formClassId}
                onChange={(e) => setFormClassId(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {classes.map((cls) => {
                  const isFull = cls.enrolled >= cls.capacity;
                  const isCurrent = editingStudent && editingStudent.classId === cls.id;
                  return (
                    <option
                      key={cls.id}
                      value={cls.id}
                      disabled={isFull && !isCurrent}
                    >
                      {cls.code} — {cls.name} ({cls.enrolled}/{cls.capacity} học viên{isFull ? " · Đã đầy" : ""})
                    </option>
                  );
                })}
              </select>
              {(() => {
                const currentSelectedClass = classes.find((c) => c.id === formClassId);
                const isFull =
                  currentSelectedClass &&
                  currentSelectedClass.enrolled >= currentSelectedClass.capacity;
                const isCurrent =
                  editingStudent && editingStudent.classId === formClassId;
                if (isFull && !isCurrent) {
                  return (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-destructive">
                      <AlertTriangle className="size-3 shrink-0" />
                      Lớp học này đã đạt sĩ số tối đa ({currentSelectedClass.capacity}/{currentSelectedClass.capacity} học viên). Vui lòng chọn lớp khác.
                    </p>
                  );
                }
                return null;
              })()}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-joined"
                className="block text-xs font-semibold text-foreground"
              >
                Ngày nhập học
              </label>
              <Input
                type="date"
                id="stu-form-joined"
                value={formJoinedAt}
                onChange={(e) => setFormJoinedAt(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-tuition"
                className="block text-xs font-semibold text-foreground"
              >
                Trạng thái học phí
              </label>
              <select
                id="stu-form-tuition"
                value={formTuitionStatus}
                onChange={(e) =>
                  setFormTuitionStatus(
                    e.target.value as AdminStudentRecord["tuitionStatus"],
                  )
                }
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="paid">Đã hoàn thành</option>
                <option value="due-soon">Sắp đến hạn</option>
                <option value="overdue">Quá hạn thanh toán</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-goal"
                className="block text-xs font-semibold text-foreground"
              >
                Mục tiêu đầu ra
              </label>
              <Input
                id="stu-form-goal"
                value={formGoal}
                onChange={(e) => setFormGoal(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="stu-form-comment"
              className="block text-xs font-semibold text-foreground"
            >
              Nhận xét chuyên môn của giáo viên
            </label>
            <textarea
              id="stu-form-comment"
              rows={3}
              value={formComment}
              onChange={(e) => setFormComment(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {editingStudent ? "Lưu thay đổi" : "Tạo hồ sơ"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Archive Confirmation Dialog */}
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

      {/* Bulk Archive Confirmation Dialog */}
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
      <ModalDialog
        open={isImportModalOpen}
        onClose={() => {
          if (!isImporting) {
            setIsImportModalOpen(false);
            setImportFile(null);
            setParsedImportRows([]);
          }
        }}
        title="Nhập danh sách học sinh từ file CSV / Excel"
        description="Nhập nhanh danh sách học sinh mới từ bảng tính CSV (chuẩn UTF-8)."
        size="lg"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
            >
              <Download className="size-3.5" aria-hidden="true" />
              Tải file mẫu CSV
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setParsedImportRows([]);
                }}
                disabled={isImporting}
              >
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmImport}
                disabled={
                  isImporting ||
                  parsedImportRows.filter((r) => r.isValid).length === 0
                }
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {isImporting
                  ? "Đang nhập dữ liệu..."
                  : `Xác nhận nhập (${parsedImportRows.filter((r) => r.isValid).length} học sinh)`}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {/* File Picker & Instructions */}
          <div className="rounded-xl border border-dashed border-border bg-warm/30 p-4 text-center">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <FileUp className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 font-medium text-foreground">
              {importFile ? importFile.name : "Kéo thả hoặc chọn file CSV từ máy tính của bạn"}
            </p>
            <p className="mt-1 text-muted-foreground text-[11px]">
              Định dạng các cột: Mã học sinh, Họ và tên, Mã lớp/Tên lớp, Mục tiêu, Trạng thái học phí, Nhận xét
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" aria-hidden="true" />
              {importFile ? "Chọn file khác" : "Chọn file CSV"}
            </Button>
          </div>

          {/* Preview list */}
          {parsedImportRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">
                  Xem trước dữ liệu ({parsedImportRows.length} dòng):
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="success">
                    Hợp lệ: {parsedImportRows.filter((r) => r.isValid).length}
                  </Badge>
                  {parsedImportRows.filter((r) => !r.isValid).length > 0 && (
                    <Badge variant="destructive">
                      Bị từ chối: {parsedImportRows.filter((r) => !r.isValid).length}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã HS</TableHead>
                      <TableHead>Họ và tên</TableHead>
                      <TableHead>Lớp</TableHead>
                      <TableHead>Học phí</TableHead>
                      <TableHead>Trạng thái kiểm tra</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedImportRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono font-medium">
                          {row.code || "—"}
                        </TableCell>
                        <TableCell>{row.fullName || "—"}</TableCell>
                        <TableCell>{row.className}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.tuitionStatus === "paid"
                                ? "success"
                                : row.tuitionStatus === "due-soon"
                                  ? "warning"
                                  : "destructive"
                            }
                          >
                            {row.tuitionStatus === "paid"
                              ? "Đã đóng"
                              : row.tuitionStatus === "due-soon"
                                ? "Sắp đến hạn"
                                : "Quá hạn"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.isValid ? (
                            <span className="text-emerald-700 font-medium">✓ Sẵn sàng nhập</span>
                          ) : (
                            <span className="text-destructive font-medium">✕ {row.errorReason}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </ModalDialog>

      {/* Academic Alert Settings Modal */}
      <ModalDialog
        open={isAlertSettingsOpen}
        onClose={() => setIsAlertSettingsOpen(false)}
        title="Cấu hình Ngưỡng Cảnh báo Học vụ"
        description="Tùy chỉnh các tiêu chí nhận diện học sinh cần quan tâm để phù hợp với quy định cụ thể của trung tâm."
        size="md"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTempAlertSettings(DEFAULT_ALERT_SETTINGS)}
            >
              Khôi phục mặc định
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAlertSettingsOpen(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setAlertSettings(tempAlertSettings);
                  try {
                    localStorage.setItem(
                      ALERT_SETTINGS_STORAGE_KEY,
                      JSON.stringify(tempAlertSettings),
                    );
                  } catch {
                    // Ignore storage errors
                  }
                  setIsAlertSettingsOpen(false);
                  toast({
                    title: "Đã lưu cấu hình cảnh báo",
                    description: `Ngưỡng chuyên cần: ${tempAlertSettings.attendanceThreshold}%. Quy tắc cảnh báo học vụ đã được cập nhật.`,
                    variant: "success",
                  });
                }}
              >
                Lưu cấu hình
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 py-1 text-xs">
          <div>
            <label className="block font-semibold text-foreground">
              Ngưỡng chuyên cần tối thiểu (%)
            </label>
            <p className="mb-2.5 text-[11px] text-muted-foreground">
              Học sinh có tỷ lệ đi học dưới ngưỡng này sẽ tự động nhận cảnh báo &ldquo;Cần theo dõi chuyên cần&rdquo;.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={tempAlertSettings.attendanceThreshold}
                onChange={(e) =>
                  setTempAlertSettings((prev) => ({
                    ...prev,
                    attendanceThreshold: Number(e.target.value),
                  }))
                }
                className="flex-1 accent-primary"
              />
              <span className="w-12 text-right font-mono text-sm font-bold text-primary">
                {tempAlertSettings.attendanceThreshold}%
              </span>
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-3">
            <label className="block font-semibold text-foreground">
              Các quy tắc cảnh báo tự động:
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/30">
              <input
                type="checkbox"
                checked={tempAlertSettings.alertOnScoreDrop}
                onChange={(e) =>
                  setTempAlertSettings((prev) => ({
                    ...prev,
                    alertOnScoreDrop: e.target.checked,
                  }))
                }
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <div>
                <p className="font-medium text-foreground">
                  Điểm TB giảm liên tiếp
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Cảnh báo &ldquo;Tiến độ học tập giảm&rdquo; khi bài kiểm tra gần nhất thấp hơn bài trước đó.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/30">
              <input
                type="checkbox"
                checked={tempAlertSettings.alertOnOverdueTuition}
                onChange={(e) =>
                  setTempAlertSettings((prev) => ({
                    ...prev,
                    alertOnOverdueTuition: e.target.checked,
                  }))
                }
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <div>
                <p className="font-medium text-foreground">Học phí quá hạn</p>
                <p className="text-[11px] text-muted-foreground">
                  Cảnh báo &ldquo;Chưa hoàn thành học phí&rdquo; khi học sinh đã quá hạn đóng học phí.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/30">
              <input
                type="checkbox"
                checked={tempAlertSettings.alertOnNoGrades}
                onChange={(e) =>
                  setTempAlertSettings((prev) => ({
                    ...prev,
                    alertOnNoGrades: e.target.checked,
                  }))
                }
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <div>
                <p className="font-medium text-foreground">
                  Chưa có bài kiểm tra gần đây
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Cảnh báo &ldquo;Chưa có đánh giá gần đây&rdquo; khi học sinh chưa có điểm kiểm tra định kỳ.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/30">
              <input
                type="checkbox"
                checked={tempAlertSettings.alertBelowTarget}
                onChange={(e) =>
                  setTempAlertSettings((prev) => ({
                    ...prev,
                    alertBelowTarget: e.target.checked,
                  }))
                }
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <div>
                <p className="font-medium text-foreground">
                  Điểm dưới mục tiêu cá nhân
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Cảnh báo khi điểm trung bình hiện tại thấp hơn mục tiêu band điểm đề ra.
                </p>
              </div>
            </label>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
