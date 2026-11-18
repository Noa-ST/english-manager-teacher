"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  CreditCard,
  Download,
  Edit3,
  FastForward,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderOpen,
  Layers,
  ListChecks,
  Lock,
  MapPin,
  Paperclip,
  Plus,
  Presentation,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  CLASSROOMS_DATA,
  CLASS_SESSIONS_DATA,
  CURRICULUM_PRESETS,
  DAYS_OF_WEEK,
  STANDARD_ROOMS,
  STANDARD_TIME_SLOTS,
  resolveWeekStatus,
  type AdminStudentRecord,
  type ClassroomGroup,
  type ClassSessionRecord,
  type CurriculumAttachment,
  type CurriculumWeek,
  type MasterCurriculumMaterial,
  type TimeSlotDef,
  type WeekProgressStatus,
} from "@/services/classroom-data";
import {
  checkCanDeleteTimeSlot,
  formatSlotsToScheduleString,
  getOccupiedSlotsMap,
  parseScheduleStringToSlots,
  sortTimeSlots,
  validateNewTimeSlot,
  type SelectedSlot,
} from "@/services/schedule-helper";
import { apiRequest } from "@/lib/api-client";
import { cn, removeVietnameseTones } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = "active" | "archived" | "all";
type SortOption = "name" | "enrolled" | "score" | "attendance";

const MATERIAL_FORMAT_LABELS: Record<string, string> = {
  PDF: "Tài liệu PDF",
  DOCX: "Văn bản Word (.docx)",
  SLIDE: "Slide bài giảng (.pptx)",
  WORKSHEET: "Phiếu bài tập (.xlsx)",
  IMAGE: "Hình ảnh",
  AUDIO: "Âm thanh Audio",
};

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

// ---------------------------------------------------------------------------
// Module progress helper — parse "Tuần 9/16" → { current: 9, total: 16 }
// ---------------------------------------------------------------------------

function parseModuleProgress(module: string): {
  current: number;
  total: number;
  pct: number;
  label: string;
} | null {
  const m = module.match(/[Tt]uần\s+(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const current = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (total === 0) return null;
  const pct = Math.min(100, Math.round((current / total) * 100));
  return { current, total, pct, label: `Tuần ${current}/${total}` };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function sanitizeClassrooms(list: ClassroomGroup[]): ClassroomGroup[] {
  const seenActiveCodes = new Set<string>();
  const result: ClassroomGroup[] = [];
  for (const c of list) {
    if (c.status === "archived") {
      result.push(c);
      continue;
    }
    const upper = c.code.trim().toUpperCase();
    if (seenActiveCodes.has(upper)) {
      continue;
    }
    seenActiveCodes.add(upper);
    result.push(c);
  }
  return result;
}

function mergeClassesWithDefaults(cached: ClassroomGroup[]): ClassroomGroup[] {
  const map = new Map<string, ClassroomGroup>();
  for (const c of CLASSROOMS_DATA) {
    map.set(c.id, c);
  }
  for (const c of cached) {
    map.set(c.id, c);
  }
  return sanitizeClassrooms(Array.from(map.values()));
}

export default function AdminClassesPage() {
  const { toast } = useToast();
  const [classes, setClasses] = React.useState<ClassroomGroup[]>(() => sanitizeClassrooms(CLASSROOMS_DATA));

  const saveClassesState = React.useCallback(
    (updater: ClassroomGroup[] | ((prev: ClassroomGroup[]) => ClassroomGroup[])) => {
      setClasses((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const sanitized = sanitizeClassrooms(next);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("teacher_studio_classrooms_v1", JSON.stringify(sanitized));
          } catch {
            // ignore storage errors
          }
        }
        return sanitized;
      });
    },
    [],
  );

  const [allStudents, setAllStudents] = React.useState<AdminStudentRecord[]>([]);
  const [allClassSessions, setAllClassSessions] =
    React.useState<ClassSessionRecord[]>(CLASS_SESSIONS_DATA);
  const [sessionHistoryClass, setSessionHistoryClass] =
    React.useState<ClassroomGroup | null>(null);
  const [selectedHistorySessionId, setSelectedHistorySessionId] =
    React.useState<string>("");
  const [rosterClass, setRosterClass] = React.useState<ClassroomGroup | null>(null);
  const [viewingStudent, setViewingStudent] = React.useState<AdminStudentRecord | null>(null);
  const [roadmapClass, setRoadmapClass] = React.useState<ClassroomGroup | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingClass, setEditingClass] = React.useState<ClassroomGroup | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<ClassroomGroup | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("active");
  const [sortBy, setSortBy] = React.useState<SortOption>("name");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  // Form states
  const [formCode, setFormCode] = React.useState("");
  const [formName, setFormName] = React.useState("");
  const [formLevel, setFormLevel] = React.useState("CEFR B2");
  const [formTargetBand, setFormTargetBand] = React.useState("IELTS 6.5–7.5+");
  const [formSchedule, setFormSchedule] = React.useState("Thứ 3 & Thứ 6 · 18:00 – 20:00");
  const [formRoom, setFormRoom] = React.useState(STANDARD_ROOMS[0]);
  const [formCapacity, setFormCapacity] = React.useState(15);
  const [formTuitionDueDate, setFormTuitionDueDate] = React.useState("2026-11-20");

  // Timetable Schedule Slots state
  const [formSelectedSlots, setFormSelectedSlots] = React.useState<SelectedSlot[]>([]);
  const [timeSlots, setTimeSlots] = React.useState<TimeSlotDef[]>(STANDARD_TIME_SLOTS);
  const [isAddingCustomSlot, setIsAddingCustomSlot] = React.useState(false);
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");

  // Curriculum Form states
  const [formTotalWeeks, setFormTotalWeeks] = React.useState(12);
  const [formCurrentWeekIndex, setFormCurrentWeekIndex] = React.useState(1);
  const [formSelectedPresetId, setFormSelectedPresetId] = React.useState("custom");
  const [formCurriculum, setFormCurriculum] = React.useState<CurriculumWeek[]>([]);
  const [isRoadmapExpanded, setIsRoadmapExpanded] = React.useState(false);

  // Form code uniqueness check
  const normalizedFormCode = formCode.trim().toUpperCase();
  const isFormCodeDuplicate = React.useMemo(() => {
    if (!normalizedFormCode) return false;
    return classes.some(
      (c) =>
        c.id !== editingClass?.id &&
        c.status !== "archived" &&
        c.code.trim().toUpperCase() === normalizedFormCode,
    );
  }, [classes, editingClass, normalizedFormCode]);

  // Roadmap Week Progress states
  const [editingWeek, setEditingWeek] = React.useState<CurriculumWeek | null>(null);
  const [weekStatusForm, setWeekStatusForm] = React.useState<WeekProgressStatus>("not-started");
  const [weekScheduledDate, setWeekScheduledDate] = React.useState("");
  const [weekCompletedDate, setWeekCompletedDate] = React.useState("");
  const [weekTeacherName, setWeekTeacherName] = React.useState("");
  const [weekNotes, setWeekNotes] = React.useState("");
  const [weekHomework, setWeekHomework] = React.useState("");
  const [weekAttachments, setWeekAttachments] = React.useState<CurriculumAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [weekSetAsActive, setWeekSetAsActive] = React.useState(false);
  const [isSavingWeekProgress, setIsSavingWeekProgress] = React.useState(false);

  // Central Library Picker states in Week Modal
  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = React.useState(false);
  const [libraryMaterials, setLibraryMaterials] = React.useState<MasterCurriculumMaterial[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = React.useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = React.useState("");
  const [libraryTypeFilter, setLibraryTypeFilter] = React.useState<string>("all");

  // Roster Student Management states
  const [isAddingStudentToClass, setIsAddingStudentToClass] = React.useState(false);
  const [isAssigningStudentToClass, setIsAssigningStudentToClass] = React.useState(false);
  const [newStudentName, setNewStudentName] = React.useState("");
  const [newStudentCode, setNewStudentCode] = React.useState("");
  const [newStudentClassId, setNewStudentClassId] = React.useState("");
  const [newStudentJoinedAt, setNewStudentJoinedAt] = React.useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [newStudentTuitionStatus, setNewStudentTuitionStatus] =
    React.useState<AdminStudentRecord["tuitionStatus"]>("due-soon");
  const [newStudentGoal, setNewStudentGoal] = React.useState("");
  const [newStudentComment, setNewStudentComment] = React.useState("");
  const [selectedStudentToAssign, setSelectedStudentToAssign] = React.useState("");
  const [isSubmittingStudent, setIsSubmittingStudent] = React.useState(false);

  // ---------- Load Saved Custom Time Slots from Storage ----------
  const loadCustomSlots = React.useCallback((): TimeSlotDef[] => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("teacher_studio_custom_slots_v1");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // ignore storage errors
      }
    }
    return STANDARD_TIME_SLOTS;
  }, []);

  const saveTimeSlots = (newSlots: TimeSlotDef[]) => {
    const sorted = sortTimeSlots(newSlots);
    setTimeSlots(sorted);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("teacher_studio_custom_slots_v1", JSON.stringify(sorted));
      } catch {
        // ignore storage errors
      }
    }
  };

  // ---------- Data Fetch ----------
  React.useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem("teacher_studio_classrooms_v1");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setClasses(mergeClassesWithDefaults(parsed));
          }
        }
      } catch {
        // ignore storage errors
      }
    });

    apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true")
      .then((data) => {
        if (data && data.length > 0) {
          saveClassesState(data);
        }
      })
      .catch(() => { });
    apiRequest<AdminStudentRecord[]>("/api/admin/students?page=1&pageSize=100")
      .then(setAllStudents)
      .catch(() => { });
    apiRequest<ClassSessionRecord[]>("/api/admin/teaching-journal")
      .then((sesList) => {
        if (sesList) setAllClassSessions(sesList);
      })
      .catch(() => { });
  }, [saveClassesState]);

  const openClassSessionHistory = (cls: ClassroomGroup) => {
    setSessionHistoryClass(cls);
    const matching = allClassSessions
      .filter((s) => s.classId === cls.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    setSelectedHistorySessionId(matching[0]?.id ?? "");
  };

  // ---------- Occupied Slots Map (Conflict Prevention) ----------
  const occupiedSlotsMap = React.useMemo(() => {
    return getOccupiedSlotsMap(classes, editingClass?.id, timeSlots);
  }, [classes, editingClass, timeSlots]);

  // ---------- Filtering & Sorting ----------
  const filteredClasses = React.useMemo(() => {
    let result = classes;

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((c) =>
        statusFilter === "active"
          ? c.status !== "archived"
          : c.status === "archived",
      );
    }

    // Search
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

    // Sort
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

  // ---------- KPI Metrics ----------
  const kpi = React.useMemo(() => {
    const active = classes.filter((c) => c.status !== "archived");
    const totalEnrolled = active.reduce((s, c) => s + c.enrolled, 0);
    const totalCapacity = active.reduce((s, c) => s + c.capacity, 0);
    const fillRate =
      totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
    const avgAttendance =
      active.length > 0
        ? Math.round(
          active.reduce((s, c) => s + c.attendanceRate, 0) / active.length,
        )
        : 0;
    return {
      totalClasses: active.length,
      totalEnrolled,
      fillRate,
      avgAttendance,
      archivedCount: classes.filter((c) => c.status === "archived").length,
    };
  }, [classes]);

  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "active";

  // ---------- Roster (students in a class) ----------
  const studentsInRosterClass = React.useMemo(() => {
    if (!rosterClass) return [];
    return allStudents.filter(
      (s) => s.classId === rosterClass.id && s.status !== "archived" && !s.deletedAt,
    );
  }, [rosterClass, allStudents]);

  // ---------- Students available to assign to this class ----------
  const availableStudentsToAssign = React.useMemo(() => {
    if (!rosterClass) return [];
    return allStudents.filter(
      (s) => s.classId !== rosterClass.id && s.status !== "archived" && !s.deletedAt,
    );
  }, [rosterClass, allStudents]);

  // ---------- Timetable Slot Toggling ----------
  const handleToggleSlot = (dayNumber: number, slotId: string) => {
    const key = `${dayNumber}-${slotId}`;
    if (occupiedSlotsMap.has(key)) {
      const occ = occupiedSlotsMap.get(key)!;
      toast({
        title: "Khung giờ này đã có lớp học!",
        description: `Lớp ${occ.classCode} (${occ.className}) đã học vào giờ này tại ${occ.room}. Không thể chọn!`,
        variant: "warning",
      });
      return;
    }

    setFormSelectedSlots((prev) => {
      const exists = prev.some((s) => s.dayNumber === dayNumber && s.slotId === slotId);
      let updated: SelectedSlot[];
      if (exists) {
        updated = prev.filter((s) => !(s.dayNumber === dayNumber && s.slotId === slotId));
      } else {
        updated = [...prev, { dayNumber, slotId }];
      }
      const formatted = formatSlotsToScheduleString(updated, timeSlots);
      setFormSchedule(formatted);
      return updated;
    });
  };

  // ---------- Custom Time Slot Handlers & Logic Rule ----------
  const slotValidation = React.useMemo(() => {
    if (!customStart.trim() && !customEnd.trim()) return null;
    return validateNewTimeSlot(customStart, customEnd, timeSlots);
  }, [customStart, customEnd, timeSlots]);

  const handleAddCustomSlot = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = validateNewTimeSlot(customStart, customEnd, timeSlots);
    if (!val.isValid) {
      toast({
        title: "Không thể tạo khung giờ này!",
        description: val.errorMessage,
        variant: "error",
      });
      return;
    }

    const startNorm = val.normalizedStart!;
    const endNorm = val.normalizedEnd!;
    const newSlot: TimeSlotDef = {
      id: `slot-${Date.now()}`,
      label: `${startNorm} – ${endNorm}`,
      startTime: startNorm,
      endTime: endNorm,
      period: "morning",
    };

    const updated = [...timeSlots, newSlot];
    saveTimeSlots(updated);
    setCustomStart("");
    setCustomEnd("");
    setIsAddingCustomSlot(false);

    toast({
      title: "Đã tạo khung giờ mới thành công!",
      description: `Khung giờ ${startNorm} – ${endNorm} đã được thêm vào thời khóa biểu.`,
      variant: "success",
    });
  };

  // Precompute in-use status for all time slots
  const slotInUseMap = React.useMemo(() => {
    const map = new Map<
      string,
      { canDelete: boolean; inUseCount: number; codes: string[]; reason?: string }
    >();
    for (const slot of timeSlots) {
      const res = checkCanDeleteTimeSlot(slot.id, classes, timeSlots);
      map.set(slot.id, {
        canDelete: res.canDelete,
        inUseCount: res.inUseCount,
        codes: res.conflictingClassCodes,
        reason: res.reason,
      });
    }
    return map;
  }, [timeSlots, classes]);

  const handleDeleteSlot = (slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const check = checkCanDeleteTimeSlot(slotId, classes, timeSlots);
    if (!check.canDelete) {
      toast({
        title: "Không thể xóa khung giờ này!",
        description: check.reason,
        variant: "warning",
      });
      return;
    }

    const targetSlot = timeSlots.find((s) => s.id === slotId);
    const updated = timeSlots.filter((s) => s.id !== slotId);
    saveTimeSlots(updated);

    // Unselect if this slot was selected in current form
    setFormSelectedSlots((prev) => {
      const filtered = prev.filter((s) => s.slotId !== slotId);
      setFormSchedule(formatSlotsToScheduleString(filtered, updated));
      return filtered;
    });

    toast({
      title: "Đã xóa khung giờ!",
      description: `Đã xóa khung giờ ${targetSlot?.startTime ?? ""} – ${targetSlot?.endTime ?? ""} khỏi thời khóa biểu.`,
      variant: "info",
    });
  };

  const handleResetSlotsToDefault = () => {
    // Preserve any custom slots that are currently in use by active classes
    const inUseCustomSlots = timeSlots.filter(
      (ts) =>
        !STANDARD_TIME_SLOTS.some((std) => std.id === ts.id) &&
        !checkCanDeleteTimeSlot(ts.id, classes, timeSlots).canDelete,
    );

    const merged = sortTimeSlots([...STANDARD_TIME_SLOTS, ...inUseCustomSlots]);
    saveTimeSlots(merged);

    if (inUseCustomSlots.length > 0) {
      toast({
        title: "Đã khôi phục khung giờ mặc định",
        description: `Đã giữ lại ${inUseCustomSlots.length} khung giờ vì đang có lớp học xếp lịch.`,
        variant: "info",
      });
    } else {
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("teacher_studio_custom_slots_v1");
        } catch {
          // ignore
        }
      }
      toast({
        title: "Đã khôi phục khung giờ mặc định",
        description: "Thời khóa biểu đã được đặt lại về các khung giờ tiêu chuẩn ban đầu.",
        variant: "info",
      });
    }
  };

  // ---------- Roster Handlers ----------
  const handleOpenRoster = (cls: ClassroomGroup) => {
    setRosterClass(cls);
    setIsAddingStudentToClass(false);
    setIsAssigningStudentToClass(false);
    setNewStudentName("");
    setNewStudentCode(`HS-2026-${String(allStudents.length + 1).padStart(2, "0")}`);
    setNewStudentClassId(cls.id);
    const d = new Date();
    setNewStudentJoinedAt(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
    setNewStudentTuitionStatus("due-soon");
    setNewStudentGoal(cls.targetBand || "Đạt mục tiêu khóa học");
    setNewStudentComment("");
    setSelectedStudentToAssign("");
  };

  const handleQuickCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rosterClass || !newStudentName.trim() || !newStudentCode.trim()) return;

    const studentCodeUpper = newStudentCode.trim().toUpperCase();
    if (allStudents.some((s) => s.code.toUpperCase() === studentCodeUpper)) {
      toast({
        title: "Mã học sinh đã tồn tại",
        description: `Mã "${studentCodeUpper}" đã được sử dụng bởi một học sinh khác. Vui lòng chọn mã khác.`,
        variant: "error",
      });
      return;
    }

    const assignedClassId = newStudentClassId || rosterClass.id;
    const targetClass = classes.find((c) => c.id === assignedClassId) || rosterClass;

    if (targetClass.enrolled >= targetClass.capacity) {
      toast({
        title: "Lớp học đã đủ sĩ số",
        description: `Lớp "${targetClass.code} — ${targetClass.name}" đã đủ sĩ số tối đa (${targetClass.enrolled}/${targetClass.capacity} học viên). Không thể tiếp nhận thêm học sinh mới.`,
        variant: "error",
      });
      return;
    }

    setIsSubmittingStudent(true);
    try {
      const created = await apiRequest<AdminStudentRecord>("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          code: newStudentCode.trim().toUpperCase(),
          fullName: newStudentName.trim(),
          classId: assignedClassId,
          targetGoal: newStudentGoal.trim() || targetClass.targetBand || "Đạt mục tiêu khóa học",
          tuitionStatus: newStudentTuitionStatus,
          recentComment: newStudentComment.trim(),
          joinedAt: newStudentJoinedAt,
        }),
      });

      setAllStudents((prev) => [created, ...prev]);

      saveClassesState((prev) =>
        prev.map((c) =>
          c.id === assignedClassId ? { ...c, enrolled: c.enrolled + 1 } : c,
        ),
      );

      // Re-sync with single source of truth from backend
      apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true")
        .then((items) => {
          if (items && items.length > 0) saveClassesState(items);
        })
        .catch(() => { });

      toast({
        title: "Đã thêm học sinh mới",
        description: `Học sinh ${created.fullName} (${created.code}) đã được thêm vào lớp ${targetClass.code}.`,
        variant: "success",
      });

      setNewStudentName("");
      setNewStudentCode(`HS-2026-${String(allStudents.length + 2).padStart(2, "0")}`);
      setNewStudentGoal(targetClass.targetBand || "Đạt mục tiêu khóa học");
      setNewStudentComment("");
      const d = new Date();
      setNewStudentJoinedAt(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
      setNewStudentTuitionStatus("due-soon");
      setIsAddingStudentToClass(false);
    } catch (err: unknown) {
      toast({
        title: "Không thể thêm học sinh",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra",
        variant: "error",
      });
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  const handleAssignExistingStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rosterClass || !selectedStudentToAssign) return;

    const liveRosterClass =
      classes.find((c) => c.id === rosterClass.id) ?? rosterClass;
    if (studentsInRosterClass.length >= liveRosterClass.capacity) {
      toast({
        title: "Lớp học đã đủ sĩ số",
        description: `Lớp "${liveRosterClass.code} — ${liveRosterClass.name}" đã đủ sĩ số tối đa (${studentsInRosterClass.length}/${liveRosterClass.capacity} học viên). Không thể chuyển thêm học sinh vào lớp này.`,
        variant: "error",
      });
      return;
    }

    setIsSubmittingStudent(true);
    try {
      const updated = await apiRequest<AdminStudentRecord>(
        `/api/admin/students/${encodeURIComponent(selectedStudentToAssign)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            classId: rosterClass.id,
          }),
        },
      );

      const targetStudent = allStudents.find((s) => s.id === selectedStudentToAssign);
      const previousClassId = targetStudent?.classId;

      setAllStudents((prev) =>
        prev.map((s) => (s.id === selectedStudentToAssign ? updated : s)),
      );

      saveClassesState((prev) =>
        prev.map((c) => {
          if (c.id === rosterClass.id) return { ...c, enrolled: c.enrolled + 1 };
          if (c.id === previousClassId && c.enrolled > 0) return { ...c, enrolled: c.enrolled - 1 };
          return c;
        }),
      );

      // Re-sync with single source of truth from backend
      apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=true")
        .then((items) => {
          if (items && items.length > 0) saveClassesState(items);
        })
        .catch(() => { });

      toast({
        title: "Phân bổ học sinh thành công!",
        description: `Đã gán học viên ${updated.fullName} vào lớp ${rosterClass.code}.`,
        variant: "success",
      });

      setSelectedStudentToAssign("");
      setIsAssigningStudentToClass(false);
    } catch (err: unknown) {
      toast({
        title: "Không thể phân bổ học sinh",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra",
        variant: "error",
      });
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  // ---------- Modal Handlers ----------
  const openCreateModal = () => {
    setEditingClass(null);
    setFormCode(`CL-0${classes.length + 1}`);
    setFormName("");
    setFormLevel("CEFR B2");
    setFormTargetBand("IELTS 6.5–7.5+");
    setFormRoom(STANDARD_ROOMS[0]);
    setFormCapacity(15);
    setFormTuitionDueDate("2026-11-20");
    setFormSelectedPresetId("preset-basic-8w");

    // Initialize with default basic preset
    const preset = CURRICULUM_PRESETS[0];
    setFormTotalWeeks(preset.totalWeeks);
    setFormCurrentWeekIndex(1);
    setFormCurriculum(structuredClone(preset.curriculum));
    setIsRoadmapExpanded(false);

    // Refresh time slots and clear selection
    const activeSlots = loadCustomSlots();
    setTimeSlots(activeSlots);
    setFormSelectedSlots([]);
    setFormSchedule("");
    setIsAddingCustomSlot(false);
    setIsModalOpen(true);
  };

  const openEditModal = (cls: ClassroomGroup) => {
    setEditingClass(cls);
    setFormCode(cls.code);
    setFormName(cls.name);
    setFormLevel(cls.level);
    setFormTargetBand(cls.targetBand);
    setFormSchedule(cls.scheduleSummary);
    setFormRoom(cls.room);
    setFormCapacity(cls.capacity);
    setFormTuitionDueDate(cls.tuitionDueDate || "2026-11-20");

    // Refresh time slots and parse existing schedule
    const activeSlots = loadCustomSlots();
    setTimeSlots(activeSlots);
    const initialSlots = parseScheduleStringToSlots(cls.scheduleSummary, activeSlots);
    setFormSelectedSlots(initialSlots);
    setIsAddingCustomSlot(false);

    const total = cls.totalWeeks ?? parseModuleProgress(cls.currentModule)?.total ?? 12;
    const current = cls.currentWeekIndex ?? parseModuleProgress(cls.currentModule)?.current ?? 1;
    setFormTotalWeeks(total);
    setFormCurrentWeekIndex(current);
    setFormSelectedPresetId("custom");

    if (cls.curriculum && cls.curriculum.length > 0) {
      setFormCurriculum(structuredClone(cls.curriculum));
    } else {
      const fallbackList: CurriculumWeek[] = Array.from({ length: total }, (_, i) => ({
        weekNumber: i + 1,
        title: i + 1 === current ? cls.currentModule : `Học phần tuần ${i + 1}`,
      }));
      setFormCurriculum(fallbackList);
    }
    setIsRoadmapExpanded(false);
    setIsModalOpen(true);
  };

  const handleSelectPreset = (presetId: string) => {
    setFormSelectedPresetId(presetId);
    if (presetId === "custom") return;

    const preset = CURRICULUM_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setFormTotalWeeks(preset.totalWeeks);
      setFormCurriculum(structuredClone(preset.curriculum));
      if (!editingClass) {
        if (!formName) setFormName(preset.name.replace(/\s*\(\d+\s*tuần\)/, ""));
        setFormLevel(preset.level);
        setFormTargetBand(preset.targetBand);
      }
      setFormCurrentWeekIndex(1);
    }
  };

  const handleTotalWeeksChange = (newTotal: number) => {
    const validTotal = Math.max(1, Math.min(52, newTotal));
    setFormTotalWeeks(validTotal);
    setFormCurriculum((prev) => {
      if (prev.length < validTotal) {
        const added: CurriculumWeek[] = Array.from(
          { length: validTotal - prev.length },
          (_, i) => ({
            weekNumber: prev.length + i + 1,
            title: `Học phần tuần ${prev.length + i + 1}`,
          }),
        );
        return [...prev, ...added];
      } else {
        return prev.slice(0, validTotal);
      }
    });
    if (formCurrentWeekIndex > validTotal) {
      setFormCurrentWeekIndex(validTotal);
    }
  };

  const handleWeekTitleChange = (weekNum: number, newTitle: string) => {
    setFormCurriculum((prev) =>
      prev.map((w) => (w.weekNumber === weekNum ? { ...w, title: newTitle } : w)),
    );
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const upperCode = formCode.trim().toUpperCase();
    if (!upperCode) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập mã lớp học.",
        variant: "error",
      });
      return;
    }

    if (isFormCodeDuplicate) {
      toast({
        title: "Mã lớp học đã tồn tại",
        description: `Mã lớp "${upperCode}" đã được sử dụng cho một lớp học khác. Vui lòng nhập mã lớp khác.`,
        variant: "error",
      });
      return;
    }

    if (!formSchedule.trim() && formSelectedSlots.length === 0) {
      toast({
        title: "Chưa chọn lịch học",
        description: "Vui lòng bấm chọn ít nhất 1 khung giờ học trong thời khóa biểu tuần.",
        variant: "warning",
      });
      return;
    }

    const currentItem = formCurriculum.find((w) => w.weekNumber === formCurrentWeekIndex);
    const currentTitle = currentItem?.title.trim() || `Học phần tuần ${formCurrentWeekIndex}`;
    const computedModule = `Tuần ${formCurrentWeekIndex}/${formTotalWeeks} · ${currentTitle}`;

    const payload = {
      code: formCode.trim().toUpperCase(),
      name: formName.trim(),
      level: formLevel.trim(),
      targetBand: formTargetBand.trim(),
      scheduleSummary: formSchedule.trim(),
      room: formRoom.trim(),
      capacity: Number(formCapacity) || 15,
      totalWeeks: Number(formTotalWeeks) || 12,
      currentWeekIndex: Number(formCurrentWeekIndex) || 1,
      currentModule: computedModule,
      curriculum: formCurriculum,
      tuitionDueDate: formTuitionDueDate,
    };

    if (editingClass) {
      try {
        const updated = await apiRequest<ClassroomGroup>(
          `/api/admin/classes/${encodeURIComponent(editingClass.id)}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        saveClassesState((prev) =>
          prev.map((item) => (item.id === editingClass.id ? updated : item)),
        );
        // Sync updated class metadata across local students & sessions lists
        setAllStudents((prev) =>
          prev.map((s) =>
            s.classId === updated.id
              ? { ...s, className: updated.name, level: updated.level }
              : s,
          ),
        );
        toast({
          title: "Đã cập nhật thông tin lớp học",
          description: `Lớp ${updated.code} — ${updated.name} đã được cập nhật lịch học & lộ trình.`,
          variant: "success",
        });
      } catch (err: unknown) {
        toast({
          title: "Không thể cập nhật lớp học",
          description:
            err instanceof Error
              ? err.message
              : "Có lỗi xảy ra khi cập nhật thông tin lớp học.",
          variant: "error",
        });
        return;
      }
    } else {
      try {
        const created = await apiRequest<ClassroomGroup>("/api/admin/classes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        saveClassesState((prev) => [...prev, created]);
        toast({
          title: "Đã khởi tạo lớp học mới",
          description: `Lớp ${created.code} đã thiết lập lịch học và khung chương trình ${created.totalWeeks} tuần.`,
          variant: "success",
        });
      } catch (err: unknown) {
        toast({
          title: "Không thể khởi tạo lớp học",
          description:
            err instanceof Error
              ? err.message
              : "Có lỗi xảy ra khi tạo lớp học mới.",
          variant: "error",
        });
        return;
      }
    }

    setIsModalOpen(false);
  };

  // Quick 1-click week advance
  const handleAdvanceWeek = async (cls: ClassroomGroup, targetWeek?: number) => {
    try {
      const payload =
        targetWeek !== undefined
          ? { targetWeek, status: "in-progress" as const, setAsActiveWeek: true }
          : { status: "in-progress" as const, setAsActiveWeek: true };
      const updated = await apiRequest<ClassroomGroup>(
        `/api/admin/classes/${encodeURIComponent(cls.id)}/advance-week`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      saveClassesState((prev) =>
        prev.map((item) => (item.id === cls.id ? updated : item)),
      );
      if (roadmapClass && roadmapClass.id === cls.id) {
        setRoadmapClass(updated);
      }
      toast({
        title: "Đã chuyển tiến độ học phần",
        description: `Lớp ${cls.code} hiện chuyển sang: ${updated.currentModule}`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Lỗi chuyển tuần",
        description: "Không thể chuyển tuần học phần, vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const openEditWeek = (week: CurriculumWeek) => {
    const effectiveStatus = resolveWeekStatus(
      week,
      roadmapClass?.currentWeekIndex,
    );
    setEditingWeek(week);
    setWeekStatusForm(week.status ?? effectiveStatus);
    setWeekScheduledDate(week.scheduledDate ?? "");
    setWeekCompletedDate(week.completedDate ?? "");
    setWeekTeacherName(week.teacherName ?? "ThS. Nguyễn Minh Anh");
    setWeekNotes(week.notes ?? "");
    setWeekHomework(week.homework ?? "");
    setWeekAttachments(week.attachments ? [...week.attachments] : []);
    setWeekSetAsActive(
      week.weekNumber === (roadmapClass?.currentWeekIndex ?? 1),
    );
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !roadmapClass || !editingWeek) return;
    setIsUploadingAttachment(true);
    try {
      const addedList: CurriculumAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("classId", roadmapClass.id);
        formData.append("weekNumber", String(editingWeek.weekNumber));

        const res = await fetch("/api/admin/classes/materials", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (json.ok && json.data?.attachment) {
          addedList.push(json.data.attachment);
        }
      }
      setWeekAttachments((prev) => [...prev, ...addedList]);
      toast({
        title: "Đã tải lên tệp đính kèm",
        description: `Đã tải ${files.length} tệp tài liệu thành công.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể tải tệp lên",
        description: err instanceof Error ? err.message : "Lỗi tải tệp",
        variant: "error",
      });
    } finally {
      setIsUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (attId: string) => {
    setWeekAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const handleOpenLibraryPicker = async () => {
    setIsLibraryPickerOpen(true);
    setIsLoadingLibrary(true);
    try {
      const res = await apiRequest<MasterCurriculumMaterial[]>("/api/admin/classes/materials");
      if (Array.isArray(res)) {
        setLibraryMaterials(res);
      }
    } catch {
      // Keep empty if offline
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleAttachFromLibrary = (item: MasterCurriculumMaterial) => {
    const already = weekAttachments.some(
      (a) => a.id === item.id || a.name.toLowerCase() === item.name.toLowerCase(),
    );
    if (already) {
      toast({
        title: "Tài liệu đã có trong danh sách",
        description: `Tài liệu "${item.name}" đã được đính kèm vào tuần này.`,
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
      uploadedAt: item.uploadedAt || "18/11/2026",
      classId: roadmapClass?.id,
      classCode: roadmapClass?.code,
      weekNumber: editingWeek?.weekNumber,
    };

    setWeekAttachments((prev) => [...prev, attachment]);
    toast({
      title: "Đã chọn tài liệu từ Kho học liệu",
      description: `Đã thêm "${item.name}" vào danh sách đính kèm tuần ${editingWeek?.weekNumber}.`,
      variant: "success",
    });
  };

  const handleSaveWeekModal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!roadmapClass || !editingWeek) return;
    setIsSavingWeekProgress(true);
    try {
      const updated = await apiRequest<ClassroomGroup>(
        `/api/admin/classes/${encodeURIComponent(roadmapClass.id)}/advance-week`,
        {
          method: "POST",
          body: JSON.stringify({
            targetWeek: editingWeek.weekNumber,
            status: weekStatusForm,
            scheduledDate: weekScheduledDate.trim() || undefined,
            completedDate: weekCompletedDate.trim() || undefined,
            teacherName: weekTeacherName.trim() || undefined,
            notes: weekNotes.trim() || undefined,
            homework: weekHomework.trim() || undefined,
            attachments: weekAttachments,
            setAsActiveWeek: weekSetAsActive,
          }),
        },
      );
      saveClassesState((prev) =>
        prev.map((item) => (item.id === roadmapClass.id ? updated : item)),
      );
      setRoadmapClass(updated);
      toast({
        title: "Đã cập nhật tiến độ tuần",
        description: `Lớp ${roadmapClass.code} — Tuần ${editingWeek.weekNumber} đã được lưu thành công.`,
        variant: "success",
      });
      setEditingWeek(null);
    } catch (err) {
      toast({
        title: "Lỗi cập nhật tiến độ",
        description:
          err instanceof Error
            ? err.message
            : "Có lỗi xảy ra khi lưu tiến độ tuần.",
        variant: "error",
      });
    } finally {
      setIsSavingWeekProgress(false);
    }
  };

  const handleArchiveClass = async () => {
    if (!archiveTarget) return;
    try {
      await apiRequest(
        `/api/admin/classes/${encodeURIComponent(archiveTarget.id)}`,
        { method: "DELETE" },
      );
      saveClassesState((prev) =>
        prev.map((c) =>
          c.id === archiveTarget.id ? { ...c, status: "archived" } : c,
        ),
      );
      toast({
        title: "Đã lưu trữ lớp học",
        description: `Lớp ${archiveTarget.code} — ${archiveTarget.name} đã được chuyển sang lưu trữ.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể lưu trữ lớp học",
        description:
          err instanceof Error
            ? err.message
            : "Có lỗi xảy ra. Vui lòng thử lại.",
        variant: "error",
      });
    }
    setArchiveTarget(null);
  };

  const handleRestoreClass = async (cls: ClassroomGroup) => {
    try {
      const restored = await apiRequest<ClassroomGroup>(
        `/api/admin/classes/${encodeURIComponent(cls.id)}/restore`,
        { method: "POST" },
      );
      saveClassesState((prev) =>
        prev.map((c) => (c.id === cls.id ? restored : c)),
      );
      toast({
        title: "Đã khôi phục lớp học",
        description: `Lớp ${cls.code} — ${cls.name} đã hoạt động trở lại.`,
        variant: "success",
      });
    } catch (err: unknown) {
      toast({
        title: "Không thể khôi phục lớp học",
        description:
          err instanceof Error
            ? err.message
            : "Có lỗi xảy ra. Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("active");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản lý Lớp học & Khung chương trình
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Thiết lập thời khóa biểu chống trùng lịch, quản lý lộ trình học phần từng tuần và chuyển bài 1 chạm.
          </p>
        </div>

        <Button onClick={openCreateModal}>
          <Plus className="size-4" aria-hidden="true" />
          Tạo lớp học mới
        </Button>
      </div>

      {/* ================ TOP STAT CARDS ================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Tổng số lớp */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <BookOpen className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Lớp đang mở</p>
              <p className="mt-0.5 font-mono text-2xl font-bold text-foreground" suppressHydrationWarning>
                {kpi.totalClasses}
              </p>
            </div>
          </div>
          {kpi.archivedCount > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground" suppressHydrationWarning>
              + {kpi.archivedCount} lớp đã lưu trữ
            </p>
          )}
        </div>

        {/* Card 2: Tổng học viên */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Users className="size-5 text-emerald-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Tổng học viên</p>
              <p className="mt-0.5 font-mono text-2xl font-bold text-foreground" suppressHydrationWarning>
                {kpi.totalEnrolled}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground" suppressHydrationWarning>
            Đang học tại {kpi.totalClasses} lớp hoạt động
          </p>
        </div>

        {/* Card 3: Tỷ lệ lấp đầy */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
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
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${kpi.fillRate}%` }}
            />
          </div>
        </div>

        {/* Card 4: Chuyên cần */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
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
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{ width: `${kpi.avgAttendance}%` }}
            />
          </div>
        </div>
      </div>

      {/* ================ SEARCH & FILTER TOOLBAR ================ */}
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
            placeholder="Tìm theo tên lớp, mã lớp, phòng học, trình độ..."
            aria-label="Tìm kiếm lớp học"
            className="pl-9"
          />
        </div>

        {/* Row 2 — Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
            aria-label="Lọc theo trạng thái lớp"
            className="h-8 shrink-0 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="active">
              Đang hoạt động ({classes.filter((c) => c.status !== "archived").length})
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
            className="shrink-0"
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

      {/* Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Filter className="size-3" aria-hidden="true" />
            Đang lọc:
          </span>
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              Tìm: &ldquo;{searchQuery}&rdquo;
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="hover:opacity-75 focus:outline-hidden"
                aria-label="Xóa tìm kiếm"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          )}
          {statusFilter !== "active" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {statusFilter === "archived" ? "Đã lưu trữ" : "Tất cả"}
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className="hover:opacity-75 focus:outline-hidden"
                aria-label="Xóa bộ lọc trạng thái"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline focus:outline-hidden"
          >
            Đặt lại tất cả
          </button>
        </div>
      )}

      {/* ================ CLASS CARDS GRID ================ */}
      {filteredClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <BookOpen className="size-10 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {hasActiveFilters
              ? "Không tìm thấy lớp học phù hợp với bộ lọc."
              : "Chưa có lớp học nào. Bấm \"Tạo lớp học mới\" để bắt đầu."}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
              Đặt lại bộ lọc
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {paginatedClasses.map((cls) => {
            const capacityPct = Math.min(
              100,
              cls.capacity > 0 ? Math.round((cls.enrolled / cls.capacity) * 100) : 0,
            );
            const isArchived = cls.status === "archived";

            // Parse progress
            const parsed = parseModuleProgress(cls.currentModule);
            const totalWeeks = cls.totalWeeks ?? parsed?.total ?? 12;
            const currentWeek = cls.currentWeekIndex ?? parsed?.current ?? 1;
            const progressPct = Math.min(100, Math.round((currentWeek / totalWeeks) * 100));
            const isLastWeek = currentWeek >= totalWeeks;

            return (
              <div
                key={cls.id}
                className={`flex flex-col justify-between rounded-2xl border bg-card p-6 shadow-2xs transition-all ${isArchived
                  ? "border-border/50 opacity-70"
                  : "border-border hover:border-accent/50"
                  }`}
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default" className="font-mono">
                        {cls.code}
                      </Badge>
                      <Badge variant="secondary">{cls.level}</Badge>
                      <Badge variant="warm">{cls.targetBand}</Badge>
                      {isArchived && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Đã lưu trữ
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!isArchived && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEditModal(cls)}
                          aria-label={`Chỉnh sửa lớp ${cls.name}`}
                        >
                          <Edit3 className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                      {isArchived ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRestoreClass(cls)}
                          aria-label={`Khôi phục lớp ${cls.name}`}
                          title="Khôi phục lớp học"
                        >
                          <RotateCcw className="size-3.5 text-emerald-600" aria-hidden="true" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setArchiveTarget(cls)}
                          aria-label={`Lưu trữ lớp ${cls.name}`}
                          title="Lưu trữ lớp học"
                        >
                          <Archive className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <h2 className="mt-3 font-heading text-xl font-bold text-foreground">
                    {cls.name}
                  </h2>

                  {/* ================ KHUNG CHƯƠNG TRÌNH & HỌC PHẦN ================ */}
                  <div className="mt-3 rounded-xl border border-warm/60 bg-warm/35 p-3.5 text-xs text-foreground/90">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                            <Layers className="size-3" aria-hidden="true" />
                            Tuần {currentWeek}/{totalWeeks}
                          </span>
                          <span className="font-semibold text-primary">
                            Học phần hiện tại:
                          </span>
                        </div>
                        <p className="font-medium text-foreground">
                          {cls.currentModule.includes("·")
                            ? cls.currentModule.split("·").slice(1).join("·").trim()
                            : cls.currentModule}
                        </p>
                      </div>

                      {/* Action buttons on module box */}
                      {!isArchived && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => setRoadmapClass(cls)}
                            title="Xem chi tiết lộ trình toàn khóa"
                            className="h-7 text-[11px]"
                          >
                            <ListChecks className="size-3" aria-hidden="true" />
                            Lộ trình
                          </Button>

                          {!isLastWeek ? (
                            <Button
                              size="xs"
                              onClick={() => handleAdvanceWeek(cls)}
                              title={`Chuyển sang Tuần ${currentWeek + 1}`}
                              className="h-7 text-[11px]"
                            >
                              <FastForward className="size-3" aria-hidden="true" />
                              Tuần {currentWeek + 1}
                            </Button>
                          ) : (
                            <Badge variant="outline" className="h-7 border-emerald-500/40 text-emerald-700">
                              <Check className="mr-1 size-3" aria-hidden="true" />
                              Hoàn thành
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">
                          Tiến độ hoàn thành lộ trình
                        </span>
                        <span className="font-mono font-semibold text-primary">
                          {progressPct}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Schedule & Room */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-foreground/80">
                      <Calendar className="size-3.5 text-accent" aria-hidden="true" />
                      <span className="font-medium">{cls.scheduleSummary}</span>
                    </div>
                    <div className="flex items-center gap-2 text-foreground/80">
                      <MapPin className="size-3.5 text-accent" aria-hidden="true" />
                      <span className="font-medium">{cls.room}</span>
                    </div>
                    {cls.tuitionDueDate && (
                      <div className="flex items-center gap-2 text-foreground/80">
                        <CreditCard className="size-3.5 text-amber-600" aria-hidden="true" />
                        <span className="font-medium">
                          Hạn học phí: {formatDisplayDate(cls.tuitionDueDate)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Capacity Bar */}
                  <div className="mt-5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">
                        Sĩ số lớp ({cls.enrolled}/{cls.capacity} học viên)
                      </span>
                      <span className="font-mono font-semibold text-primary">
                        {capacityPct}% công suất
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${capacityPct >= 100
                          ? "bg-destructive"
                          : capacityPct >= 85
                            ? "bg-amber-500"
                            : "bg-primary"
                          }`}
                        style={{ width: `${capacityPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Metrics & Actions */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <div className="flex items-center gap-4 text-xs">
                    <span>
                      Điểm TB:{" "}
                      <strong className="font-mono font-bold text-primary">
                        {cls.averageScore.toFixed(1)}
                      </strong>
                    </span>
                    <span>
                      Chuyên cần:{" "}
                      <strong className="font-mono font-bold text-emerald-700">
                        {cls.attendanceRate}%
                      </strong>
                    </span>
                  </div>

                  {/* ACTION BUTTONS with deep linking */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleOpenRoster(cls)}
                    >
                      <Users className="size-3.5" aria-hidden="true" />
                      Danh sách lớp
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => openClassSessionHistory(cls)}
                    >
                      <ListChecks className="size-3.5" aria-hidden="true" />
                      Lịch sử buổi học
                    </Button>
                    {!isArchived && (
                      <>
                        <Button
                          size="xs"
                          variant="outline"
                          render={
                            <Link
                              href={`/grades?classId=${encodeURIComponent(cls.id)}`}
                            />
                          }
                          nativeButton={false}
                        >
                          <BarChart3 className="size-3.5" aria-hidden="true" />
                          Bảng điểm
                        </Button>
                        <Button
                          size="xs"
                          render={
                            <Link
                              href={`/attendance?classId=${encodeURIComponent(cls.id)}`}
                            />
                          }
                          nativeButton={false}
                        >
                          <ClipboardCheck className="size-3.5" aria-hidden="true" />
                          Điểm danh
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredClasses.length > 0 && (
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
        )}
      </div>
    )}

      {/* ================ ROADMAP MODAL (Xem toàn bộ lộ trình khóa học) ================ */}
      <ModalDialog
        open={Boolean(roadmapClass)}
        onClose={() => setRoadmapClass(null)}
        title={
          roadmapClass
            ? `Khung chương trình: ${roadmapClass.code} — ${roadmapClass.name}`
            : "Lộ trình khóa học"
        }
        description={
          roadmapClass
            ? `Tổng thời lượng: ${roadmapClass.totalWeeks ?? 12} tuần · Hiện đang học: Tuần ${roadmapClass.currentWeekIndex ?? 1}`
            : undefined
        }
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Bấm &ldquo;Dạy bài này&rdquo; để chuyển tuần đang học, hoặc &ldquo;Chi tiết&rdquo; để cập nhật trạng thái, ghi chú & bài tập.
            </p>
            <Button variant="outline" onClick={() => setRoadmapClass(null)}>
              Đóng
            </Button>
          </div>
        }
      >
        {roadmapClass && (() => {
          const curriculumList: CurriculumWeek[] =
            roadmapClass.curriculum && roadmapClass.curriculum.length > 0
              ? roadmapClass.curriculum
              : Array.from(
                { length: roadmapClass.totalWeeks ?? 12 },
                (_, i): CurriculumWeek => ({
                  weekNumber: i + 1,
                  title:
                    i + 1 === (roadmapClass.currentWeekIndex ?? 1)
                      ? roadmapClass.currentModule
                      : `Nội dung học phần tuần ${i + 1}`,
                  status: "not-started",
                }),
              );
          const totalWeeks = roadmapClass.totalWeeks ?? 12;
          const completedCount = curriculumList.filter(
            (w) =>
              resolveWeekStatus(w, roadmapClass.currentWeekIndex) ===
              "completed",
          ).length;
          const completionRate =
            totalWeeks > 0 ? Math.round((completedCount / totalWeeks) * 100) : 0;

          return (
            <div className="space-y-4">
              {/* Progress Overview Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warm/40 p-4">
                <div>
                  <p className="text-xs font-semibold text-primary">
                    Học phần hiện tại
                  </p>
                  <p className="font-heading text-sm font-bold text-foreground">
                    {roadmapClass.currentModule}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-mono text-xl font-bold text-primary">
                      {completionRate}%
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      ({completedCount}/{totalWeeks} tuần hoàn thành)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-36 overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Weekly Checklist / Timeline */}
              <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
                {curriculumList.map((item) => {
                  const status = resolveWeekStatus(
                    item,
                    roadmapClass.currentWeekIndex,
                  );
                  const isCurrent =
                    item.weekNumber === (roadmapClass.currentWeekIndex ?? 1);
                  const isBeingTaught = isCurrent || status === "in-progress";

                  return (
                    <div
                      key={item.weekNumber}
                      className={`flex flex-col gap-2 rounded-xl border p-3.5 text-xs transition-colors ${
                        isBeingTaught
                          ? "border-primary bg-primary/5 shadow-2xs"
                          : status === "completed"
                            ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
                            : status === "postponed"
                              ? "border-amber-500/30 bg-amber-500/5 text-foreground"
                              : "border-border bg-card text-foreground"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                              isBeingTaught
                                ? "bg-primary text-primary-foreground"
                                : status === "completed"
                                  ? "bg-emerald-500/20 text-emerald-700"
                                  : status === "postponed"
                                    ? "bg-amber-500/20 text-amber-700"
                                    : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {status === "completed" ? (
                              <Check className="size-4" aria-hidden="true" />
                            ) : (
                              item.weekNumber
                            )}
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-foreground">
                                Tuần {item.weekNumber}:
                              </span>
                              <span
                                className={
                                  isBeingTaught
                                    ? "font-semibold text-primary"
                                    : status === "completed"
                                      ? "font-medium text-foreground"
                                      : "text-foreground"
                                }
                              >
                                {item.title}
                              </span>
                            </div>
                            {item.focus && (
                              <p className="text-[11px] text-muted-foreground">
                                Trọng tâm: {item.focus}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {isBeingTaught ? (
                            <Badge variant="default" className="text-[10px]">
                              🎯 Đang học
                            </Badge>
                          ) : status === "completed" ? (
                            <Badge
                              variant="secondary"
                              className="border border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-700"
                            >
                              ✓ Đã hoàn thành
                            </Badge>
                          ) : status === "postponed" ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700"
                            >
                              ⏸ Tạm hoãn
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              Chưa học
                            </Badge>
                          )}

                          {!isBeingTaught && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() =>
                                handleAdvanceWeek(roadmapClass, item.weekNumber)
                              }
                              className="h-6 text-[11px] font-semibold text-primary hover:bg-primary/10"
                              title="Đặt làm tuần học hiện tại & bắt đầu giảng dạy"
                            >
                              Dạy bài này
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => openEditWeek(item)}
                            className="h-6 gap-1 px-2 text-[11px]"
                            title="Cập nhật trạng thái, ngày học, ghi chú hoặc bài tập"
                          >
                            <Edit3 className="size-3" aria-hidden="true" />
                            <span>Chi tiết</span>
                          </Button>
                        </div>
                      </div>

                      {/* Lesson Metadata Display */}
                      {(item.scheduledDate ||
                        item.completedDate ||
                        item.teacherName ||
                        item.notes ||
                        item.homework ||
                        (item.attachments && item.attachments.length > 0)) && (
                          <div className="mt-1 space-y-1.5 rounded-lg border border-border/50 bg-background/60 p-2 text-[11px]">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                              {item.teacherName && (
                                <span>
                                  <strong>Giáo viên:</strong> {item.teacherName}
                                </span>
                              )}
                              {item.homework && (
                                <p className="font-medium text-primary">
                                  <strong>Tài liệu / Bài tập:</strong> {item.homework}
                                </p>
                              )}
                            </div>
                            {item.notes && (
                              <p className="text-foreground">
                                <strong>Ghi chú:</strong> {item.notes}
                              </p>
                            )}
                            {item.homework && (
                              <p className="font-medium text-primary">
                                <strong>Ghi chú bài tập:</strong> {item.homework}
                              </p>
                            )}
                            {item.attachments && item.attachments.length > 0 && (
                              <div className="space-y-1 border-t border-border/40 pt-1.5">
                                <p className="flex items-center gap-1 font-semibold text-foreground">
                                  <Paperclip className="size-3 text-primary" />
                                  Tài liệu & Bài tập ({item.attachments.length}):
                                </p>
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {item.attachments.map((att) => (
                                    <a
                                      key={att.id}
                                      href={att.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:text-primary"
                                      title={`Tải xuống: ${att.name}`}
                                    >
                                      <FileText className="size-3 text-primary shrink-0" />
                                      <span className="max-w-[180px] truncate">{att.name}</span>
                                      <span className="text-[10px] text-muted-foreground">({att.size})</span>
                                      <Download className="size-2.5 text-muted-foreground shrink-0" />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </ModalDialog>

      {/* ================ WEEK PROGRESS EDIT MODAL ================ */}
      <ModalDialog
        open={Boolean(editingWeek)}
        onClose={() => setEditingWeek(null)}
        title={
          editingWeek
            ? `Cập nhật tiến độ: Tuần ${editingWeek.weekNumber} — ${editingWeek.title}`
            : "Cập nhật bài học"
        }
        description={
          roadmapClass
            ? `Lớp: ${roadmapClass.code} — ${roadmapClass.name}`
            : undefined
        }
        size="md"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setEditingWeek(null)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={isSavingWeekProgress}
              onClick={handleSaveWeekModal}
            >
              <Check className="mr-1 size-3.5" aria-hidden="true" />
              {isSavingWeekProgress ? "Đang lưu..." : "Lưu tiến độ tuần"}
            </Button>
          </div>
        }
      >
        {editingWeek && (
          <form onSubmit={handleSaveWeekModal} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label
                htmlFor="week-status-select"
                className="block text-xs font-semibold text-foreground"
              >
                Trạng thái tuần học <span className="text-destructive">*</span>
              </label>
              <select
                id="week-status-select"
                value={weekStatusForm}
                onChange={(e) =>
                  setWeekStatusForm(e.target.value as WeekProgressStatus)
                }
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="not-started">Chưa học</option>
                <option value="in-progress">Đang học</option>
                <option value="completed">Đã hoàn thành</option>
                <option value="postponed">Tạm hoãn</option>
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="week-scheduled-date"
                  className="block text-xs font-semibold text-foreground"
                >
                  Ngày dự kiến học
                </label>
                <Input
                  type="date"
                  id="week-scheduled-date"
                  value={weekScheduledDate}
                  onChange={(e) => setWeekScheduledDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="week-completed-date"
                  className="block text-xs font-semibold text-foreground"
                >
                  Ngày thực tế hoàn thành
                </label>
                <Input
                  type="date"
                  id="week-completed-date"
                  value={weekCompletedDate}
                  onChange={(e) => setWeekCompletedDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="week-teacher-name"
                className="block text-xs font-semibold text-foreground"
              >
                Giáo viên phụ trách
              </label>
              <Input
                id="week-teacher-name"
                value={weekTeacherName}
                onChange={(e) => setWeekTeacherName(e.target.value)}
                placeholder="VD: ThS. Nguyễn Minh Anh"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="week-notes"
                className="block text-xs font-semibold text-foreground"
              >
                Ghi chú nội dung đã dạy / Lưu ý học vụ
              </label>
              <textarea
                id="week-notes"
                rows={3}
                value={weekNotes}
                onChange={(e) => setWeekNotes(e.target.value)}
                placeholder="VD: Đã giảng xong phần Overview và Body 1. Cần luyện thêm Body 2 vào buổi phụ đạo..."
                className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="week-homework"
                className="block text-xs font-semibold text-foreground"
              >
                Ghi chú bài tập & Hướng dẫn học sinh
              </label>
              <Input
                id="week-homework"
                value={weekHomework}
                onChange={(e) => setWeekHomework(e.target.value)}
                placeholder="VD: Làm Cambridge 18 Test 2 Task 1; Nộp bài trước thứ Sáu..."
                className="h-8 text-xs"
              />
            </div>

            {/* Local File Upload Dropzone & Central Library Picker */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-foreground">
                  Tài liệu & Bài tập đính kèm cho tuần này
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {weekAttachments.length} tệp đã đính kèm
                </span>
              </div>

              {/* Action buttons: Tải từ máy tính & Chọn từ Kho học liệu */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAttachment}
                  className="w-full gap-1.5 text-xs bg-background hover:bg-muted/60"
                >
                  <Upload className="size-3.5 text-primary" />
                  {isUploadingAttachment ? "Đang tải tệp..." : "Tải từ máy tính"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenLibraryPicker}
                  className="w-full gap-1.5 text-xs border-primary/40 text-primary bg-primary/5 hover:bg-primary/10"
                >
                  <FolderOpen className="size-3.5" />
                  Chọn từ Kho học liệu
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.mp3,.zip"
                onChange={handleUploadAttachment}
                className="hidden"
              />

              <p className="text-[10px] text-muted-foreground text-center">
                Hỗ trợ tải lên tệp mới hoặc chọn tài liệu dùng chung từ Kho học liệu học viện.
              </p>

              {weekAttachments.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {weekAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2 text-xs"
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
                          <p className="truncate text-[11px] font-medium text-foreground">
                            {att.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {MATERIAL_FORMAT_LABELS[att.type] || att.type} · {att.size} · Đã tải {att.uploadedAt}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Xem / Tải về"
                        >
                          <Download className="size-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="rounded-sm p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Gỡ tệp này"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-warm/30 p-2.5">
              <input
                type="checkbox"
                id="week-set-active"
                checked={weekSetAsActive}
                onChange={(e) => setWeekSetAsActive(e.target.checked)}
                className="size-4 rounded border-input text-primary focus:ring-primary"
              />
              <label
                htmlFor="week-set-active"
                className="cursor-pointer text-xs font-medium text-foreground select-none"
              >
                Đặt tuần này làm tuần học hiện tại của lớp (cập nhật tiến độ hiển thị)
              </label>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* ================ CENTRAL LIBRARY PICKER MODAL ================ */}
      <ModalDialog
        open={isLibraryPickerOpen}
        onClose={() => setIsLibraryPickerOpen(false)}
        title="Kho học liệu trung tâm & Lộ trình bài giảng"
        description="Chọn các giáo trình, slide bài giảng, phiếu bài tập đã có sẵn trong kho để gán vào lộ trình tuần này mà không cần tải lại."
        size="lg"
      >
        <div className="space-y-4">
          {/* Search & filter */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={librarySearchQuery}
                onChange={(e) => setLibrarySearchQuery(e.target.value)}
                placeholder="Tìm tài liệu theo tên, định dạng, lớp đang dùng..."
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <select
              value={libraryTypeFilter}
              onChange={(e) => setLibraryTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              <option value="all">Tất cả định dạng</option>
              <option value="PDF">Tài liệu PDF</option>
              <option value="DOCX">Văn bản Word (.docx)</option>
              <option value="SLIDE">Slide bài giảng (.pptx)</option>
              <option value="WORKSHEET">Phiếu bài tập (.xlsx)</option>
              <option value="AUDIO">Âm thanh Audio</option>
            </select>
          </div>

          {/* List of library materials */}
          <div className="max-h-80 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {isLoadingLibrary ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Đang tải danh sách học liệu từ máy chủ...
              </div>
            ) : (() => {
              const filtered = libraryMaterials.filter((m) => {
                if (libraryTypeFilter !== "all" && m.type !== libraryTypeFilter) return false;
                if (librarySearchQuery.trim()) {
                  const q = removeVietnameseTones(librarySearchQuery.trim().toLowerCase());
                  const matchName = removeVietnameseTones(m.name.toLowerCase()).includes(q);
                  const matchClass = m.assignments.some(
                    (a) =>
                      removeVietnameseTones(a.classCode.toLowerCase()).includes(q) ||
                      removeVietnameseTones(a.className.toLowerCase()).includes(q),
                  );
                  if (!matchName && !matchClass) return false;
                }
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Không tìm thấy tài liệu nào phù hợp với từ khóa tìm kiếm.
                  </div>
                );
              }

              return filtered.map((item) => {
                const isAttached = weekAttachments.some(
                  (a) => a.id === item.id || a.name.toLowerCase() === item.name.toLowerCase(),
                );

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
                        {item.type === "SLIDE" ? (
                          <Presentation className="size-4 text-amber-600" />
                        ) : item.type === "WORKSHEET" ? (
                          <FileSpreadsheet className="size-4 text-emerald-600" />
                        ) : item.type === "AUDIO" ? (
                          <FileAudio className="size-4 text-purple-600" />
                        ) : (
                          <FileText className="size-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground" title={item.name}>
                          {item.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {MATERIAL_FORMAT_LABELS[item.type] || item.type} · {item.size}
                          </span>
                          {item.assignments.length > 0 ? (
                            <span className="text-[10px] text-muted-foreground">
                              · Đang dùng trong {item.assignments.length} lớp ({item.assignments.map((a) => a.classCode).join(", ")})
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">
                              · Học liệu kho
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isAttached ? (
                        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-50 text-emerald-700 text-[10px] gap-1">
                          <Check className="size-3" />
                          Đã đính kèm
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="xs"
                          onClick={() => handleAttachFromLibrary(item)}
                          className="gap-1"
                        >
                          <Plus className="size-3" />
                          Gán vào tuần này
                        </Button>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Footer note & Close button */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-muted-foreground">
              {weekAttachments.length} tài liệu đã được chọn cho tuần này. Nhấn &quot;Lưu tiến độ tuần&quot; để hoàn tất.
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setIsLibraryPickerOpen(false)}
            >
              Xong
            </Button>
          </div>
        </div>
      </ModalDialog>

      {/* ================ ROSTER MODAL ================ */}
      <ModalDialog
        open={Boolean(rosterClass)}
        onClose={() => setRosterClass(null)}
        title={
          rosterClass
            ? `Danh sách học viên: ${rosterClass.code} — ${rosterClass.name}`
            : "Danh sách lớp"
        }
        description={
          rosterClass
            ? `${rosterClass.scheduleSummary} · ${rosterClass.room}`
            : undefined
        }
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 w-full">
            <div className="flex items-center gap-1.5">
              <Button
                variant={isAddingStudentToClass ? "secondary" : "default"}
                size="xs"
                disabled={Boolean(rosterClass && studentsInRosterClass.length >= rosterClass.capacity)}
                title={
                  rosterClass && studentsInRosterClass.length >= rosterClass.capacity
                    ? "Lớp học đã đạt sĩ số tối đa"
                    : undefined
                }
                onClick={() => {
                  setIsAddingStudentToClass((prev) => !prev);
                  setIsAssigningStudentToClass(false);
                }}
              >
                <UserPlus className="mr-1 size-3.5" aria-hidden="true" />
                {isAddingStudentToClass ? "Đóng form" : "Thêm học sinh mới"}
              </Button>
              {availableStudentsToAssign.length > 0 && (
                <Button
                  variant={isAssigningStudentToClass ? "secondary" : "outline"}
                  size="xs"
                  disabled={Boolean(rosterClass && studentsInRosterClass.length >= rosterClass.capacity)}
                  title={
                    rosterClass && studentsInRosterClass.length >= rosterClass.capacity
                      ? "Lớp học đã đạt sĩ số tối đa"
                      : undefined
                  }
                  onClick={() => {
                    setIsAssigningStudentToClass((prev) => !prev);
                    setIsAddingStudentToClass(false);
                  }}
                >
                  <Users className="mr-1 size-3.5" aria-hidden="true" />
                  {isAssigningStudentToClass ? "Đóng chọn" : `Gán từ danh sách (${availableStudentsToAssign.length})`}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                render={
                  rosterClass ? (
                    <Link
                      href={`/students?classId=${encodeURIComponent(rosterClass.id)}`}
                    />
                  ) : (
                    <span />
                  )
                }
                nativeButton={false}
              >
                <Users className="size-3.5" aria-hidden="true" />
                Xem trên trang Học sinh
              </Button>
              <Button variant="outline" size="xs" onClick={() => setRosterClass(null)}>
                Đóng
              </Button>
            </div>
          </div>
        }
      >
        {rosterClass && (
          <div className="space-y-4 text-xs">
            {/* Class Capacity Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warm/30 p-3">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">
                  {rosterClass.code}
                </Badge>
                <span className="font-semibold text-foreground">{rosterClass.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Sĩ số:</span>
                <span className="font-bold text-foreground">
                  {studentsInRosterClass.length} / {rosterClass.capacity} học viên
                </span>
                <Badge
                  variant={studentsInRosterClass.length >= rosterClass.capacity ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {studentsInRosterClass.length >= rosterClass.capacity ? "Đã đầy" : "Còn chỗ"}
                </Badge>
              </div>
            </div>

            {/* Warning if capacity reached */}
            {studentsInRosterClass.length >= rosterClass.capacity && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold">
                  Lớp học đã đạt sĩ số tối đa ({rosterClass.capacity}/{rosterClass.capacity} học viên). Không thể tiếp nhận thêm học sinh mới.
                </span>
              </div>
            )}

            {/* Quick Create Student Form */}
            {isAddingStudentToClass && (
              <form
                onSubmit={handleQuickCreateStudent}
                className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4 animate-in fade-in-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-heading font-bold text-foreground">
                    <UserPlus className="size-4 text-primary" aria-hidden="true" />
                    <span>Thêm hồ sơ học sinh mới</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setIsAddingStudentToClass(false)}
                    aria-label="Đóng form thêm học sinh"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="roster-stu-code"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Mã định danh học sinh <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="roster-stu-code"
                      value={newStudentCode}
                      onChange={(e) => setNewStudentCode(e.target.value)}
                      placeholder="VD: HS-2026-07"
                      required
                      className="h-8 font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="roster-stu-name"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Họ và tên học sinh <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="roster-stu-name"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      placeholder="Nhập họ và tên đầy đủ"
                      required
                      className="h-8"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="roster-stu-class"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Phân lớp học
                    </label>
                    <select
                      id="roster-stu-class"
                      value={newStudentClassId}
                      onChange={(e) => setNewStudentClassId(e.target.value)}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
                    >
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.code} — {cls.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="roster-stu-joined"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Ngày nhập học <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type="date"
                      id="roster-stu-joined"
                      value={newStudentJoinedAt}
                      onChange={(e) => setNewStudentJoinedAt(e.target.value)}
                      required
                      className="h-8"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="roster-stu-tuition"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Trạng thái học phí
                    </label>
                    <select
                      id="roster-stu-tuition"
                      value={newStudentTuitionStatus}
                      onChange={(e) =>
                        setNewStudentTuitionStatus(
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
                  <div className="space-y-1">
                    <label
                      htmlFor="roster-stu-goal"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Mục tiêu đầu ra <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="roster-stu-goal"
                      value={newStudentGoal}
                      onChange={(e) => setNewStudentGoal(e.target.value)}
                      placeholder="VD: IELTS 6.5+ / Đạt mục tiêu khóa học"
                      required
                      className="h-8"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="roster-stu-comment"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Nhận xét chuyên môn của giáo viên
                  </label>
                  <textarea
                    id="roster-stu-comment"
                    rows={2}
                    value={newStudentComment}
                    onChange={(e) => setNewStudentComment(e.target.value)}
                    placeholder="Ghi chú ban đầu về trình độ hoặc thái độ học tập..."
                    className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setIsAddingStudentToClass(false)}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" size="xs" disabled={isSubmittingStudent}>
                    <CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" />
                    {isSubmittingStudent ? "Đang lưu..." : "Tạo hồ sơ"}
                  </Button>
                </div>
              </form>
            )}

            {/* Quick Assign Existing Student Form */}
            {isAssigningStudentToClass && (
              <form
                onSubmit={handleAssignExistingStudent}
                className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4 animate-in fade-in-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-heading font-bold text-foreground">
                    <Users className="size-4 text-primary" aria-hidden="true" />
                    <span>Phân bổ học sinh từ danh sách vào lớp {rosterClass.code}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setIsAssigningStudentToClass(false)}
                    aria-label="Đóng form gán học sinh"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground">
                    Chọn học sinh cần chuyển / gán vào lớp này:
                  </label>
                  <select
                    value={selectedStudentToAssign}
                    onChange={(e) => setSelectedStudentToAssign(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground"
                    required
                  >
                    <option value="">-- Chọn một học sinh --</option>
                    {availableStudentsToAssign.map((s) => {
                      const currentCls = classes.find((c) => c.id === s.classId);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.fullName} ({s.code}) — {currentCls ? `Hiện ở lớp ${currentCls.code}` : "Chưa có lớp"}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setIsAssigningStudentToClass(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    size="xs"
                    disabled={!selectedStudentToAssign || isSubmittingStudent}
                  >
                    <Check className="mr-1 size-3" aria-hidden="true" />
                    {isSubmittingStudent ? "Đang xử lý..." : "Xác nhận chuyển vào lớp"}
                  </Button>
                </div>
              </form>
            )}

            {/* Student List or Empty State */}
            {studentsInRosterClass.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-10 text-center">
                <Users className="size-10 text-muted-foreground/40" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-foreground">
                  Lớp học chưa có học viên nào được phân bổ
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Thầy cô có thể sử dụng nút <strong>&ldquo;Thêm học sinh mới&rdquo;</strong> hoặc <strong>&ldquo;Gán từ danh sách&rdquo;</strong> ở thanh công cụ bên dưới để bổ sung học viên vào lớp này.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{studentsInRosterClass.length} học viên đang theo học:</span>
                  <span className="text-[11px] text-muted-foreground/80">Nhấp vào học sinh để xem chi tiết hồ sơ</span>
                </div>
                {studentsInRosterClass.map((stu) => (
                  <div
                    key={stu.id}
                    onClick={() => setViewingStudent(stu)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setViewingStudent(stu);
                      }
                    }}
                    className="group flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5 transition-all hover:border-primary/60 hover:bg-primary/5 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={`Xem chi tiết hồ sơ học sinh ${stu.fullName}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-heading text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                          {stu.fullName}
                        </p>
                        <span className="font-mono text-xs text-muted-foreground">
                          ({stu.code})
                        </span>
                        {stu.tuitionStatus === "overdue" && (
                          <Badge variant="destructive" className="text-[10px]">
                            Nợ học phí
                          </Badge>
                        )}
                        {stu.tuitionStatus === "due-soon" && (
                          <Badge variant="secondary" className="text-[10px]">
                            Sắp đến hạn
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-muted-foreground">
                        Mục tiêu: {stu.targetGoal} · Chuyên cần: {stu.attendanceRate}%
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Badge variant="default" className="font-mono">
                        TB {stu.averageScore.toFixed(1)}
                      </Badge>
                      <ChevronRight
                        className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ModalDialog>

      {/* ================ STUDENT DETAIL MODAL ================ */}
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
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                size="xs"
                render={
                  <Link
                    href={`/students?classId=${encodeURIComponent(viewingStudent.classId)}`}
                  />
                }
                nativeButton={false}
              >
                <Users className="mr-1 size-3.5" aria-hidden="true" />
                Quản lý học sinh đầy đủ
              </Button>
              <Button variant="default" size="xs" onClick={() => setViewingStudent(null)}>
                Đóng
              </Button>
            </div>
          ) : undefined
        }
      >
        {viewingStudent && (
          <div className="space-y-4 text-xs">
            {/* Top metrics grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-background p-3">
                <span className="text-muted-foreground">Điểm trung bình</span>
                <p className="mt-1 font-mono text-lg font-bold text-primary">
                  {viewingStudent.grades && viewingStudent.grades.length > 0 && viewingStudent.averageScore > 0
                    ? viewingStudent.averageScore.toFixed(1)
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <span className="text-muted-foreground">Chuyên cần</span>
                <p className="mt-1 font-mono text-lg font-bold text-emerald-700">
                  {viewingStudent.attendanceRate}%
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <span className="text-muted-foreground">Học phí</span>
                <div className="mt-1">
                  <Badge
                    variant={
                      viewingStudent.tuitionStatus === "paid"
                        ? "default"
                        : viewingStudent.tuitionStatus === "due-soon"
                          ? "secondary"
                          : "destructive"
                    }
                    className="text-[10px]"
                  >
                    {viewingStudent.tuitionStatus === "paid"
                      ? "Đã hoàn thành"
                      : viewingStudent.tuitionStatus === "due-soon"
                        ? "Sắp đến hạn"
                        : "Quá hạn"}
                  </Badge>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <span className="text-muted-foreground">Ngày nhập học</span>
                <p className="mt-1 font-mono text-xs font-bold text-foreground">
                  {viewingStudent.joinedAt || "—"}
                </p>
              </div>
            </div>

            {/* Target Goal & Parent Contact */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-warm/30 p-3">
                <p className="font-semibold text-primary">Mục tiêu đầu ra:</p>
                <p className="mt-0.5 text-foreground font-medium">
                  {viewingStudent.targetGoal || "Chưa thiết lập"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-warm/30 p-3">
                <p className="font-semibold text-primary">Thông tin liên hệ:</p>
                <p className="mt-0.5 text-muted-foreground">
                  {viewingStudent.parentRelation || "Phụ huynh / Học sinh"} · {viewingStudent.parentContactMasked || "Chưa có SĐT"}
                </p>
              </div>
            </div>

            {/* Teacher's recent comment */}
            <div className="rounded-xl border border-border bg-warm/40 p-3.5">
              <p className="font-semibold text-primary">Nhận xét gần nhất của giáo viên:</p>
              <p className="mt-1 italic leading-relaxed text-foreground">
                {viewingStudent.recentComment
                  ? `“${viewingStudent.recentComment}”`
                  : "Chưa có nhận xét học vụ."}
              </p>
            </div>

            {/* Grades history */}
            <div>
              <h4 className="mb-2 font-heading text-xs font-bold text-foreground">
                Bảng điểm các bài kiểm tra ({viewingStudent.grades ? viewingStudent.grades.length : 0})
              </h4>
              {!viewingStudent.grades || viewingStudent.grades.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
                  Học sinh mới nhập học, chưa có bài kiểm tra nào được ghi nhận.
                </div>
              ) : (
                <div className="space-y-2">
                  {viewingStudent.grades.map((g) => (
                    <div
                      key={g.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-2.5"
                    >
                      <div>
                        <p className="font-semibold text-foreground">{g.assessmentTitle}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Ngày: {g.date} · L:{g.listening} R:{g.reading} W:{g.writing} S:{g.speaking}
                        </p>
                      </div>
                      <Badge variant="default" className="font-mono text-xs">
                        Overall {g.overall.toFixed(1)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Session Learning History Timeline of this Student */}
            <div>
              <h4 className="mb-2 font-heading text-xs font-bold text-foreground">
                Quá trình Học tập theo từng Buổi (Session Timeline)
              </h4>
              {(() => {
                const stuSessions = allClassSessions
                  .filter((ses) =>
                    ses.studentRecords.some((r) => r.studentId === viewingStudent.id),
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
                  <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
                    {stuSessions.map((ses) => {
                      const rec = ses.studentRecords.find(
                        (r) => r.studentId === viewingStudent.id,
                      )!;
                      const dParts = ses.date.split("-");
                      const dispDate =
                        dParts.length === 3
                          ? `${dParts[2]}/${dParts[1]}/${dParts[0]}`
                          : ses.date;

                      return (
                        <div
                          key={ses.id}
                          className="rounded-xl border border-border bg-background p-3 space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-foreground">
                              {dispDate} – {ses.topic}
                            </span>
                            <div className="flex items-center gap-1.5">
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
                                {rec.attendance === "present"
                                  ? "Có mặt"
                                  : rec.attendance === "late"
                                    ? "Đi muộn"
                                    : rec.attendance === "excused"
                                      ? "Vắng có phép"
                                      : "Vắng không phép"}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                BTVN:{" "}
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
                            <p className="text-[11px] text-muted-foreground">
                              <strong>Nhận xét:</strong> {rec.teacherFeedback}
                            </p>
                          )}
                          {rec.followUp && (
                            <p className="text-[11px] font-medium text-primary">
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

      {/* ================ CLASS SESSION LEARNING HISTORY MODAL ================ */}
      <ModalDialog
        open={Boolean(sessionHistoryClass)}
        onClose={() => setSessionHistoryClass(null)}
        title={
          sessionHistoryClass
            ? `Lịch sử Buổi học & Nhật ký: ${sessionHistoryClass.code} — ${sessionHistoryClass.name}`
            : "Lịch sử buổi học"
        }
        description={
          sessionHistoryClass
            ? `${sessionHistoryClass.scheduleSummary} · ${sessionHistoryClass.room}`
            : undefined
        }
        size="xl"
        footer={
          sessionHistoryClass ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  render={
                    <Link
                      href={`/teaching-journal?classId=${encodeURIComponent(sessionHistoryClass.id)}`}
                    />
                  }
                  nativeButton={false}
                >
                  <BookOpen className="mr-1 size-3.5" aria-hidden="true" />
                  Mở Nhật ký giảng dạy của lớp
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  render={
                    <Link
                      href={`/class-analytics?classId=${encodeURIComponent(sessionHistoryClass.id)}`}
                    />
                  }
                  nativeButton={false}
                >
                  <BarChart3 className="mr-1 size-3.5" aria-hidden="true" />
                  Phân tích hiệu quả lớp
                </Button>
              </div>
              <Button
                variant="default"
                size="xs"
                onClick={() => setSessionHistoryClass(null)}
              >
                Đóng
              </Button>
            </div>
          ) : undefined
        }
      >
        {sessionHistoryClass && (() => {
          const classSessions = allClassSessions
            .filter((s) => s.classId === sessionHistoryClass.id)
            .sort((a, b) => b.date.localeCompare(a.date));

          const currentSession =
            classSessions.find((s) => s.id === selectedHistorySessionId) ??
            classSessions[0] ??
            null;

          return (
            <div className="space-y-4 text-xs">
              {classSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-10 text-center">
                  <BookOpen
                    className="size-10 text-muted-foreground/40"
                    aria-hidden="true"
                  />
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    Lớp học chưa có buổi học thực tế nào được ghi nhận
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Hãy mở trang Nhật ký giảng dạy để khởi tạo buổi học đầu tiên từ lịch cố định của lớp.
                  </p>
                </div>
              ) : (
                <>
                  {/* Session Selector Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warm/30 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        Chọn buổi học ({classSessions.length} buổi):
                      </span>
                      <select
                        value={currentSession?.id ?? ""}
                        onChange={(e) =>
                          setSelectedHistorySessionId(e.target.value)
                        }
                        className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-semibold text-foreground"
                      >
                        {classSessions.map((ses) => {
                          const dp = ses.date.split("-");
                          const disp =
                            dp.length === 3
                              ? `${dp[2]}/${dp[1]}/${dp[0]}`
                              : ses.date;
                          return (
                            <option key={ses.id} value={ses.id}>
                              {disp} ({ses.dayLabel}) — Tuần {ses.weekNumber}: {ses.topic}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {currentSession && (
                      <Badge
                        variant={
                          currentSession.journalStatus === "completed"
                            ? "default"
                            : "outline"
                        }
                        className="text-[10px]"
                      >
                        {currentSession.journalStatus === "completed"
                          ? "✓ Nhật ký đã hoàn thành"
                          : currentSession.journalStatus === "draft"
                            ? "✎ Bản nháp"
                            : "Chưa ghi nhận"}
                      </Badge>
                    )}
                  </div>

                  {currentSession && (
                    <>
                      {/* Teaching Journal Summary Box */}
                      <div className="space-y-1.5 rounded-xl border border-border bg-card p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-heading text-sm font-bold text-foreground">
                            Tuần {currentSession.weekNumber}: {currentSession.topic}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            Ca {currentSession.startTime} – {currentSession.endTime} · {currentSession.room}
                          </span>
                        </div>
                        {currentSession.generalNotes && (
                          <p className="text-muted-foreground">
                            <strong>Nhận xét chung của GV:</strong> {currentSession.generalNotes}
                          </p>
                        )}
                        {currentSession.homework && (
                          <p className="font-medium text-primary">
                            <strong>Bài tập về nhà:</strong> {currentSession.homework}
                          </p>
                        )}
                      </div>

                      {/* A. Bảng lịch sử học tập theo lớp */}
                      <div className="overflow-hidden rounded-xl border border-border bg-card">
                        <div className="border-b border-border bg-muted/40 px-3.5 py-2.5 font-heading text-xs font-bold text-foreground">
                          Bảng Lịch sử Học tập từng Học sinh trong Buổi ({currentSession.studentRecords.length} học viên)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-border bg-muted/20 text-[11px] font-bold uppercase text-muted-foreground">
                                <th className="px-3.5 py-2.5">Học sinh</th>
                                <th className="px-3.5 py-2.5 text-center">Điểm danh</th>
                                <th className="px-3.5 py-2.5 text-center">Bài tập</th>
                                <th className="px-3.5 py-2.5 text-center">Kết quả học tập</th>
                                <th className="px-3.5 py-2.5">Nhận xét & Hỗ trợ tiếp</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {currentSession.studentRecords.map((rec) => (
                                <tr key={rec.studentId} className="hover:bg-muted/15">
                                  <td className="px-3.5 py-2.5 font-semibold text-foreground">
                                    {rec.studentName}{" "}
                                    <span className="font-mono text-[11px] font-normal text-muted-foreground">
                                      ({rec.studentCode})
                                    </span>
                                  </td>
                                  <td className="px-3.5 py-2.5 text-center">
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
                                      {rec.attendance === "present"
                                        ? "Có mặt"
                                        : rec.attendance === "late"
                                          ? "Đi muộn"
                                          : rec.attendance === "excused"
                                            ? "Có phép"
                                            : "Vắng"}
                                    </Badge>
                                  </td>
                                  <td className="px-3.5 py-2.5 text-center">
                                    {rec.attendance === "absent" &&
                                      rec.homeworkStatus === "unrecorded" ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : rec.homeworkStatus === "submitted" ? (
                                      <span className="font-semibold text-emerald-700">
                                        Đã nộp
                                      </span>
                                    ) : rec.homeworkStatus === "not-submitted" ? (
                                      <span className="font-semibold text-destructive">
                                        Chưa nộp
                                      </span>
                                    ) : rec.homeworkStatus === "exempt" ? (
                                      <span className="text-muted-foreground">Miễn</span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        Chưa ghi nhận
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3.5 py-2.5 text-center">
                                    {rec.learningStatus === "good" ? (
                                      <Badge
                                        variant="secondary"
                                        className="bg-emerald-500/15 text-[10px] text-emerald-700"
                                      >
                                        Tốt
                                      </Badge>
                                    ) : rec.learningStatus === "satisfactory" ? (
                                      <Badge variant="outline" className="text-[10px]">
                                        Đạt
                                      </Badge>
                                    ) : rec.learningStatus === "needs-support" ? (
                                      <Badge variant="destructive" className="text-[10px]">
                                        Cần hỗ trợ
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="px-3.5 py-2.5">
                                    <p className="text-foreground">
                                      {rec.teacherFeedback || "—"}
                                    </p>
                                    {rec.followUp && (
                                      <p className="mt-0.5 text-[11px] font-medium text-primary">
                                        Hỗ trợ tiếp: {rec.followUp}
                                      </p>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })()}
      </ModalDialog>

      {/* ================ ARCHIVE CONFIRMATION ================ */}
      <ModalDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        title="Xác nhận lưu trữ lớp học"
        description={
          archiveTarget
            ? `Bạn có chắc muốn lưu trữ lớp ${archiveTarget.code} — ${archiveTarget.name}? Lớp phải không còn học sinh hoạt động để có thể lưu trữ.`
            : undefined
        }
        size="sm"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleArchiveClass}>
              <Trash2 className="size-4" aria-hidden="true" />
              Lưu trữ lớp
            </Button>
          </div>
        }
      >
        {archiveTarget && (
          <p className="text-sm text-muted-foreground">
            Lớp sẽ được chuyển sang trạng thái lưu trữ. Bạn có thể khôi phục lại bất cứ lúc nào.
          </p>
        )}
      </ModalDialog>

      {/* ================ CREATE / EDIT CLASS MODAL ================ */}
      <ModalDialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingClass
            ? `Chỉnh sửa lớp: ${editingClass.code}`
            : "Khởi tạo lớp học mới & Thời khóa biểu"
        }
        description="Chọn lịch học cố định theo thời khóa biểu chống trùng lịch và thiết lập khung chương trình trọn gói."
        size="lg"
      >
        <form onSubmit={handleSaveClass} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="cls-code"
                className="block text-xs font-semibold text-foreground"
              >
                Mã lớp <span className="text-destructive">*</span>
              </label>
              <Input
                id="cls-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                required
                placeholder="VD: IF-01, II-01"
                className={cn(
                  "font-mono uppercase",
                  isFormCodeDuplicate && "border-destructive text-destructive focus-visible:ring-destructive/40",
                )}
              />
              {isFormCodeDuplicate && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-destructive">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  Mã lớp &ldquo;{normalizedFormCode}&rdquo; đã tồn tại. Vui lòng nhập mã lớp khác.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="cls-cap"
                  className="block text-xs font-semibold text-foreground"
                >
                  Sĩ số tối đa
                </label>
                <Input
                  id="cls-cap"
                  type="number"
                  min={5}
                  max={40}
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(Number(e.target.value))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="cls-tuition-due"
                  className="block text-xs font-semibold text-foreground"
                >
                  Hạn nộp học phí <span className="text-destructive">*</span>
                </label>
                <Input
                  id="cls-tuition-due"
                  type="date"
                  value={formTuitionDueDate}
                  onChange={(e) => setFormTuitionDueDate(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="cls-name"
              className="block text-xs font-semibold text-foreground"
            >
              Tên lớp học
            </label>
            <Input
              id="cls-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Ví dụ: Basic Level (Mất gốc - Lấy lại gốc cấp tốc)"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="cls-level"
                className="block text-xs font-semibold text-foreground"
              >
                Khung trình độ (CEFR)
              </label>
              <Input
                id="cls-level"
                value={formLevel}
                onChange={(e) => setFormLevel(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cls-band"
                className="block text-xs font-semibold text-foreground"
              >
                Cam kết đầu ra
              </label>
              <Input
                id="cls-band"
                value={formTargetBand}
                onChange={(e) => setFormTargetBand(e.target.value)}
                required
              />
            </div>
          </div>

          {/* ================ PHÒNG HỌC SELECTOR ================ */}
          <div className="space-y-1.5">
            <label
              htmlFor="cls-room"
              className="block text-xs font-semibold text-foreground"
            >
              Phòng học cố định
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={STANDARD_ROOMS.includes(formRoom) ? formRoom : "custom"}
                onChange={(e) => {
                  if (e.target.value !== "custom") {
                    setFormRoom(e.target.value);
                  }
                }}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
              >
                {STANDARD_ROOMS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="custom">-- Nhập phòng tùy chỉnh --</option>
              </select>
              <Input
                id="cls-room"
                value={formRoom}
                onChange={(e) => setFormRoom(e.target.value)}
                placeholder="Ví dụ: Phòng 302 · Cơ sở Nguyễn Du"
                required
              />
            </div>
          </div>

          {/* ================ THỜI KHÓA BIỂU CỐ ĐỊNH (CHỐNG TRÙNG LỊCH) ================ */}
          <div className="space-y-3 rounded-2xl border border-primary/20 bg-card p-4 shadow-2xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" aria-hidden="true" />
                <h3 className="font-heading text-sm font-bold text-foreground">
                  Chọn Lịch học cố định (Thứ 2 – Chủ Nhật)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setIsAddingCustomSlot((prev) => !prev)}
                  className="h-7 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/5"
                >
                  <Plus className="mr-1 size-3" aria-hidden="true" />
                  {isAddingCustomSlot ? "Đóng tạo ca" : "Thêm khung giờ dạy"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleResetSlotsToDefault}
                  title="Đặt lại về danh sách khung giờ mặc định"
                  className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="mr-1 size-3" aria-hidden="true" />
                  Mặc định
                </Button>
                <Badge variant="outline" className="text-xs">
                  {formSelectedSlots.length > 0 ? `${formSelectedSlots.length} buổi/tuần` : "Chưa chọn ca"}
                </Badge>
                {formSelectedSlots.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setFormSelectedSlots([]);
                      setFormSchedule("");
                    }}
                    className="h-6 text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    Bỏ chọn
                  </Button>
                )}
              </div>
            </div>

            {/* Custom Slot Creator Panel with Overlap Logic Rule */}
            {isAddingCustomSlot && (
              <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 animate-in fade-in-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-4 text-primary" aria-hidden="true" />
                    <h4 className="font-heading text-xs font-bold text-foreground">
                      Tạo khung giờ dạy mới (Tự động chống trùng lịch)
                    </h4>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      setIsAddingCustomSlot(false);
                      setCustomStart("");
                      setCustomEnd("");
                    }}
                    aria-label="Đóng bảng tạo khung giờ"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">
                      Giờ bắt đầu
                    </label>
                    <Input
                      placeholder="VD: 07:00 hoặc 7h, 7h30"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">
                      Giờ kết thúc
                    </label>
                    <Input
                      placeholder="VD: 09:00 hoặc 9h, 9h30"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Quick suggestions chips */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-medium text-muted-foreground">Gợi ý nhanh:</span>
                  {[
                    { s: "07:00", e: "09:00" },
                    { s: "07:30", e: "09:30" },
                    { s: "14:00", e: "16:00" },
                    { s: "19:30", e: "21:30" },
                    { s: "20:00", e: "22:00" },
                  ].map((chip) => (
                    <button
                      key={`${chip.s}-${chip.e}`}
                      type="button"
                      onClick={() => {
                        setCustomStart(chip.s);
                        setCustomEnd(chip.e);
                      }}
                      className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10px] transition-colors hover:border-primary hover:text-primary"
                    >
                      {chip.s} – {chip.e}
                    </button>
                  ))}
                </div>

                {/* Live validation feedback */}
                {slotValidation && (
                  <div
                    className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${slotValidation.isValid
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                      : "border border-destructive/30 bg-destructive/10 text-destructive"
                      }`}
                  >
                    {slotValidation.isValid ? (
                      <>
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                        <div>
                          <p className="font-semibold">
                            Hợp lệ: Khung giờ {slotValidation.normalizedStart} – {slotValidation.normalizedEnd} ({Math.floor((slotValidation.durationMinutes || 0) / 60)}h {(slotValidation.durationMinutes || 0) % 60}p)
                          </p>
                          <p className="text-[11px] opacity-80">
                            Không bị trùng với bất kỳ khung giờ nào đã có trên thời khóa biểu.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                        <div>
                          <p className="font-semibold">Bị trùng / Không hợp lệ</p>
                          <p className="text-[11px]">{slotValidation.errorMessage}</p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setIsAddingCustomSlot(false);
                      setCustomStart("");
                      setCustomEnd("");
                    }}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    disabled={!slotValidation?.isValid}
                    onClick={handleAddCustomSlot}
                  >
                    <Plus className="mr-1 size-3" aria-hidden="true" />
                    Thêm khung giờ này
                  </Button>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-2 text-[11px]">
              <span className="font-medium text-muted-foreground">Chú thích:</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-xs border border-primary bg-primary" />
                <span className="text-foreground">Đang chọn cho lớp này</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-xs border border-border bg-background" />
                <span className="text-muted-foreground">Khung giờ trống (Có thể chọn)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-xs border border-destructive/30 bg-destructive/15" />
                <span className="font-medium text-destructive">Đã có lớp khác (Bị khóa)</span>
              </span>
            </div>

            {/* Timetable Table Grid */}
            <div className="max-h-[320px] overflow-x-auto overflow-y-auto rounded-xl border border-border">
              <table className="w-full min-w-[650px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="w-28 p-2 text-center font-semibold text-muted-foreground">
                      Khung giờ
                    </th>
                    {DAYS_OF_WEEK.map((day) => (
                      <th
                        key={day.dayNumber}
                        className="p-2 text-center font-bold text-foreground"
                      >
                        <div>{day.label}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {day.short}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map((slot) => (
                    <tr
                      key={slot.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/10 group"
                    >
                      {/* Slot time info + delete slot button */}
                      <td className="border-r border-border/60 bg-muted/20 p-2 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {slot.startTime} – {slot.endTime}
                          </span>
                          {slotInUseMap.get(slot.id)?.canDelete ? (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSlot(slot.id, e)}
                              title="Khung giờ trống (chưa có lớp nào). Bấm để xóa khỏi thời khóa biểu"
                              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus:opacity-100"
                              aria-label={`Xóa khung giờ ${slot.startTime} - ${slot.endTime}`}
                            >
                              <Trash2 className="size-3" aria-hidden="true" />
                            </button>
                          ) : (
                            <span
                              title={
                                slotInUseMap.get(slot.id)?.reason ??
                                "Khung giờ này đang có lớp học, không được phép xóa!"
                              }
                              className="inline-flex cursor-not-allowed items-center rounded p-0.5 text-destructive/70"
                              aria-label={slotInUseMap.get(slot.id)?.reason}
                            >
                              <Lock className="size-2.5" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 7 Days cells */}
                      {DAYS_OF_WEEK.map((day) => {
                        const key = `${day.dayNumber}-${slot.id}`;
                        const isOccupied = occupiedSlotsMap.has(key);
                        const occInfo = occupiedSlotsMap.get(key);
                        const isSelected = formSelectedSlots.some(
                          (s) => s.dayNumber === day.dayNumber && s.slotId === slot.id,
                        );

                        return (
                          <td
                            key={day.dayNumber}
                            className="border-r border-border/40 p-1 text-center last:border-0"
                          >
                            {isOccupied ? (
                              // Occupied by another class -> Disabled
                              <div
                                title={`Đã có lớp ${occInfo?.classCode} (${occInfo?.className}) học tại ${occInfo?.room}`}
                                className="flex cursor-not-allowed flex-col items-center justify-center rounded-lg border border-destructive/25 bg-destructive/10 p-1.5 text-center opacity-80"
                              >
                                <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-destructive">
                                  <Lock className="size-2.5" aria-hidden="true" />
                                  <span>{occInfo?.classCode}</span>
                                </div>
                                <span className="max-w-[70px] truncate text-[9px] text-destructive/80">
                                  {occInfo?.room.split("·")[0].trim()}
                                </span>
                              </div>
                            ) : isSelected ? (
                              // Selected for this class
                              <button
                                type="button"
                                onClick={() => handleToggleSlot(day.dayNumber, slot.id)}
                                className="flex w-full flex-col items-center justify-center rounded-lg border border-primary bg-primary p-1.5 text-center font-semibold text-primary-foreground shadow-2xs transition-all hover:opacity-90"
                              >
                                <div className="flex items-center gap-1 text-[11px]">
                                  <Check className="size-3" aria-hidden="true" />
                                  <span>Đã chọn</span>
                                </div>
                              </button>
                            ) : (
                              // Available -> Clickable
                              <button
                                type="button"
                                onClick={() => handleToggleSlot(day.dayNumber, slot.id)}
                                className="flex w-full flex-col items-center justify-center rounded-lg border border-border/80 bg-background p-1.5 text-center text-muted-foreground transition-all hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
                              >
                                <span className="text-[11px]">+ Chọn</span>
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Selected Schedule Summary Box */}
            <div className="flex flex-col justify-between gap-2 rounded-xl border border-warm/60 bg-warm/35 p-3 text-xs sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-accent" aria-hidden="true" />
                <span className="font-semibold text-foreground">Lịch học tổng hợp:</span>
                <span className="font-medium text-primary">
                  {formSchedule || "Chưa chọn ca học nào (vui lòng bấm chọn trên bảng trên)"}
                </span>
              </div>
              {formSchedule && (
                <Badge variant="warm" className="self-start text-[10px] sm:self-auto">
                  {formSelectedSlots.length} buổi / tuần
                </Badge>
              )}
            </div>
          </div>

          {/* ================ KHUNG CHƯƠNG TRÌNH SETUP ================ */}
          <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                <h3 className="font-heading text-sm font-bold text-foreground">
                  Thiết lập Khung chương trình (Lộ trình học phần)
                </h3>
              </div>
              <Badge variant="warm" className="text-[10px]">
                Setup từ đầu
              </Badge>
            </div>

            {/* Preset Selector */}
            <div className="space-y-1.5">
              <label
                htmlFor="cls-preset"
                className="block text-xs font-semibold text-foreground"
              >
                Chọn giáo trình mẫu (Tự động điền lộ trình)
              </label>
              <select
                id="cls-preset"
                value={formSelectedPresetId}
                onChange={(e) => handleSelectPreset(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
              >
                <option value="custom">-- Tự thiết lập lộ trình riêng --</option>
                {CURRICULUM_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="cls-total-weeks"
                  className="block text-xs font-semibold text-foreground"
                >
                  Tổng thời lượng (Số tuần / học phần)
                </label>
                <Input
                  id="cls-total-weeks"
                  type="number"
                  min={1}
                  max={52}
                  value={formTotalWeeks}
                  onChange={(e) => handleTotalWeeksChange(Number(e.target.value))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="cls-start-week"
                  className="block text-xs font-semibold text-foreground"
                >
                  Học phần hiện tại đang dạy
                </label>
                <select
                  id="cls-start-week"
                  value={formCurrentWeekIndex}
                  onChange={(e) => setFormCurrentWeekIndex(Number(e.target.value))}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
                >
                  {Array.from({ length: formTotalWeeks }, (_, i) => i + 1).map((w) => {
                    const item = formCurriculum.find((c) => c.weekNumber === w);
                    return (
                      <option key={w} value={w}>
                        Tuần {w}: {item?.title || `Bài học tuần ${w}`}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Toggle Roadmap weekly titles */}
            <div>
              <button
                type="button"
                onClick={() => setIsRoadmapExpanded(!isRoadmapExpanded)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline focus:outline-hidden"
              >
                {isRoadmapExpanded ? (
                  <>
                    <ChevronUp className="size-3.5" aria-hidden="true" />
                    Ẩn danh sách chi tiết các tuần
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                    Tùy chỉnh tên bài học từng tuần ({formCurriculum.length} tuần)
                  </>
                )}
              </button>

              {isRoadmapExpanded && (
                <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-3">
                  {formCurriculum.map((week) => (
                    <div
                      key={week.weekNumber}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="w-16 shrink-0 font-mono font-bold text-muted-foreground">
                        Tuần {week.weekNumber}:
                      </span>
                      <Input
                        value={week.title}
                        onChange={(e) =>
                          handleWeekTitleChange(week.weekNumber, e.target.value)
                        }
                        placeholder={`Tiêu đề bài học tuần ${week.weekNumber}`}
                        className="h-7 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isFormCodeDuplicate}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {editingClass ? "Cập nhật lớp" : "Tạo lớp học"}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
