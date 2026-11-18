"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Copy,
  Edit3,
  FileText,
  Filter,
  History,
  MapPin,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import {
  CLASSROOMS_DATA,
  CLASS_SESSIONS_DATA,
  DAYS_OF_WEEK,
  RESOURCE_FILES_DATA,
  STANDARD_TIME_SLOTS,
  WEEKLY_SCHEDULE_DATA,
  resolveWeekStatus,
  type ClassroomGroup,
  type ClassSessionRecord,
  type CurriculumWeek,
  type JournalStatus,
  type SessionAttachment,
  type SessionCompletionResult,
  type SessionHomeworkStatus,
  type SessionLearningStatus,
  type SessionSkillType,
  type SessionStudentRecord,
  type WeeklyClassSession,
} from "@/services/classroom-data";
import { parseScheduleStringToSlots } from "@/services/schedule-helper";
import { apiRequest } from "@/lib/api-client";
import { removeVietnameseTones } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

function formatDisplayDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function buildClassWeekOptions(
  cls: ClassroomGroup | null | undefined,
): CurriculumWeek[] {
  if (!cls) return [];
  const existingMap = new Map<number, CurriculumWeek>();
  for (const w of cls.curriculum ?? []) {
    existingMap.set(w.weekNumber, w);
  }
  const maxWeek = Math.max(
    cls.totalWeeks ?? 12,
    ...(cls.curriculum?.map((w) => w.weekNumber) ?? [0]),
  );
  const result: CurriculumWeek[] = [];
  for (let i = 1; i <= maxWeek; i++) {
    const found = existingMap.get(i);
    if (found) {
      result.push(found);
    } else {
      result.push({
        weekNumber: i,
        title: `Bài học tuần ${i}`,
      });
    }
  }
  return result;
}

function getTargetDateForDayOfWeek(
  targetDayOfWeek: number,
  referenceDateStr?: string,
): string {
  let baseDate = new Date();
  if (referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr)) {
    const parts = referenceDateStr.split("-").map(Number);
    if (
      parts.length === 3 &&
      !isNaN(parts[0]) &&
      !isNaN(parts[1]) &&
      !isNaN(parts[2])
    ) {
      baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }
  const currentJsDay = baseDate.getDay();
  const currentDayOfWeek = currentJsDay === 0 ? 7 : currentJsDay;
  const diff = targetDayOfWeek - currentDayOfWeek;
  const target = new Date(baseDate);
  target.setDate(baseDate.getDate() + diff);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface ClassAvailableSessionSlot {
  id: string;
  dayOfWeek: number;
  dayLabel: string;
  fullDayLabel: string;
  startTime: string;
  endTime: string;
  room: string;
  topic?: string;
}

function getClassSlots(
  cls: ClassroomGroup | null | undefined,
  scheduleSessions: WeeklyClassSession[],
): ClassAvailableSessionSlot[] {
  if (!cls) return [];
  const classCode = cls.code.toUpperCase();
  const list: ClassAvailableSessionSlot[] = [];

  const matchedSchedule = scheduleSessions.filter(
    (s) => s.classCode.toUpperCase() === classCode,
  );

  for (const s of matchedSchedule) {
    const dayDef = DAYS_OF_WEEK.find((d) => d.dayNumber === s.dayOfWeek);
    list.push({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      dayLabel: dayDef?.label ?? s.dayLabel,
      fullDayLabel: dayDef?.fullLabel ?? s.dayLabel,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room || cls.room,
      topic: s.topic,
    });
  }

  if (cls.scheduleSummary) {
    const parsedSlots = parseScheduleStringToSlots(
      cls.scheduleSummary,
      STANDARD_TIME_SLOTS,
    );
    for (const ps of parsedSlots) {
      const slotDef = STANDARD_TIME_SLOTS.find((ts) => ts.id === ps.slotId);
      if (slotDef) {
        const alreadyExists = list.some(
          (item) =>
            item.dayOfWeek === ps.dayNumber &&
            item.startTime === slotDef.startTime,
        );
        if (!alreadyExists) {
          const dayDef = DAYS_OF_WEEK.find((d) => d.dayNumber === ps.dayNumber);
          list.push({
            id: `parsed-${ps.dayNumber}-${slotDef.id}`,
            dayOfWeek: ps.dayNumber,
            dayLabel: dayDef?.label ?? `Thứ ${ps.dayNumber + 1}`,
            fullDayLabel: dayDef?.fullLabel ?? `Thứ ${ps.dayNumber + 1}`,
            startTime: slotDef.startTime,
            endTime: slotDef.endTime,
            room: cls.room,
            topic: cls.currentModule,
          });
        }
      }
    }
  }

  if (list.length === 0) {
    list.push({
      id: "default-slot",
      dayOfWeek: 2,
      dayLabel: "Thứ 3",
      fullDayLabel: "Thứ Ba",
      startTime: "18:00",
      endTime: "20:00",
      room: cls.room || "Phòng 302",
      topic: cls.currentModule,
    });
  }

  return list.sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });
}

export default function TeachingJournalPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialClassId = searchParams.get("classId") ?? "all";

  const [classes, setClasses] = React.useState<ClassroomGroup[]>(CLASSROOMS_DATA);
  const [sessions, setSessions] = React.useState<ClassSessionRecord[]>(CLASS_SESSIONS_DATA);

  // Filters
  const [classFilter, setClassFilter] = React.useState<string>(initialClassId);
  const [statusFilter, setStatusFilter] = React.useState<"all" | JournalStatus>("all");
  const [fromDate, setFromDate] = React.useState<string>("");
  const [toDate, setToDate] = React.useState<string>("");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  // Create Session Modal state
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [createClassId, setCreateClassId] = React.useState<string>(
    initialClassId !== "all" ? initialClassId : CLASSROOMS_DATA[0]?.id ?? "cls-if-01",
  );
  const [createSessionSlotId, setCreateSessionSlotId] = React.useState<string>("");
  const [createDate, setCreateDate] = React.useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [createWeekNumber, setCreateWeekNumber] = React.useState<number>(1);
  const [createCopyPrev, setCreateCopyPrev] = React.useState<boolean>(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [scheduleSessions, setScheduleSessions] = React.useState<WeeklyClassSession[]>(WEEKLY_SCHEDULE_DATA);

  // Active Session Detail / Edit Modal state
  const [activeSession, setActiveSession] = React.useState<ClassSessionRecord | null>(null);
  const [activeModalTab, setActiveModalTab] = React.useState<
    "journal" | "students" | "revisions"
  >("journal");

  // Form fields inside Active Session Modal
  const [formDate, setFormDate] = React.useState("");
  const [formStartTime, setFormStartTime] = React.useState("");
  const [formEndTime, setFormEndTime] = React.useState("");
  const [formRoom, setFormRoom] = React.useState("");
  const [formWeekNumber, setFormWeekNumber] = React.useState(1);
  const [formTopic, setFormTopic] = React.useState("");
  const [formObjectives, setFormObjectives] = React.useState("");
  const [formCompletionResult, setFormCompletionResult] =
    React.useState<SessionCompletionResult>("completed");
  const [formGeneralNotes, setFormGeneralNotes] = React.useState("");
  const [formHomework, setFormHomework] = React.useState("");
  const [formNextPlan, setFormNextPlan] = React.useState("");
  const [formAttachments, setFormAttachments] = React.useState<SessionAttachment[]>([]);
  const [formStudentRecords, setFormStudentRecords] = React.useState<SessionStudentRecord[]>([]);
  const [formSyncCurriculum, setFormSyncCurriculum] = React.useState(true);
  const [newAttachmentName, setNewAttachmentName] = React.useState("");
  const [newAttachmentType, setNewAttachmentType] =
    React.useState<SessionAttachment["type"]>("PDF");
  const [isSaving, setIsSaving] = React.useState(false);

  const loadData = React.useCallback(() => {
    apiRequest<ClassroomGroup[]>("/api/admin/classes?includeArchived=false")
      .then((clsList) => {
        if (clsList && clsList.length > 0) {
          setClasses(clsList);
        }
      })
      .catch(() => {});

    apiRequest<ClassSessionRecord[]>("/api/admin/teaching-journal")
      .then((sesList) => {
        if (sesList) {
          setSessions(sesList);
        }
      })
      .catch(() => {});

    apiRequest<WeeklyClassSession[]>("/api/admin/schedule")
      .then((schList) => {
        if (schList && schList.length > 0) {
          setScheduleSessions(schList);
        }
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSessions = React.useMemo(() => {
    return sessions.filter((s) => {
      if (classFilter !== "all" && s.classId !== classFilter) return false;
      if (statusFilter !== "all" && s.journalStatus !== statusFilter) return false;
      if (fromDate && s.date < fromDate) return false;
      if (toDate && s.date > toDate) return false;
      if (searchQuery.trim().length > 0) {
        const q = removeVietnameseTones(searchQuery.trim().toLowerCase());
        const hay = removeVietnameseTones(
          `${s.topic} ${s.objectives} ${s.generalNotes} ${s.homework} ${s.className} ${s.classCode} ${s.date}`.toLowerCase(),
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, classFilter, statusFilter, fromDate, toDate, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedSessions = filteredSessions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // KPI metrics
  const kpi = React.useMemo(() => {
    const total = filteredSessions.length;
    const completed = filteredSessions.filter(
      (s) => s.journalStatus === "completed",
    ).length;
    const pending = total - completed;

    let totalPresent = 0;
    let totalRequired = 0;
    for (const s of filteredSessions) {
      for (const r of s.studentRecords) {
        if (r.attendance !== "excused") {
          totalRequired += 1;
          if (r.attendance === "present" || r.attendance === "late") {
            totalPresent += 1;
          }
        }
      }
    }
    const avgAttendance =
      totalRequired > 0 ? Math.round((totalPresent / totalRequired) * 100) : 100;

    return { total, completed, pending, avgAttendance };
  }, [filteredSessions]);

  const openSessionModal = (session: ClassSessionRecord) => {
    setActiveSession(session);
    setActiveModalTab("journal");
    setFormDate(session.date);
    setFormStartTime(session.startTime);
    setFormEndTime(session.endTime);
    setFormRoom(session.room);
    setFormWeekNumber(session.weekNumber);
    setFormTopic(session.topic);
    setFormObjectives(session.objectives);
    setFormCompletionResult(
      session.completionResult === "not-completed" && session.journalStatus === "not-started"
        ? "completed"
        : session.completionResult,
    );
    setFormGeneralNotes(session.generalNotes);
    setFormHomework(session.homework);
    setFormNextPlan(session.nextSessionPlan);
    setFormAttachments(session.attachments ?? []);
    setFormStudentRecords(
      session.studentRecords.map((r) => ({ ...r })),
    );
    setFormSyncCurriculum(true);
  };

  const handleSuggestFromCurriculumWeek = (weekNum: number) => {
    setFormWeekNumber(weekNum);
    if (!activeSession) return;
    const cls = classes.find((c) => c.id === activeSession.classId);
    const weekObj = cls?.curriculum?.find((w) => w.weekNumber === weekNum);
    if (weekObj) {
      setFormTopic(weekObj.title);
      if (weekObj.focus) {
        setFormObjectives(weekObj.focus);
      }
      if (weekObj.homework && !formHomework) {
        setFormHomework(weekObj.homework);
      }
      toast({
        title: `Đã gợi ý nội dung từ Tuần ${weekNum}`,
        description: `Chủ đề: ${weekObj.title}`,
        variant: "info",
      });
    }
  };

  const handleCopyFromPreviousSession = () => {
    if (!activeSession) return;
    const prevSessions = sessions
      .filter(
        (s) => s.classId === activeSession.classId && s.id !== activeSession.id,
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    const latestPrev = prevSessions[0];
    if (!latestPrev) {
      toast({
        title: "Chưa có buổi học trước",
        description: "Lớp này chưa có buổi học nào trước đó để sao chép.",
        variant: "info",
      });
      return;
    }

    if (latestPrev.nextSessionPlan) {
      setFormTopic(latestPrev.nextSessionPlan);
    }
    if (latestPrev.objectives) {
      setFormObjectives(latestPrev.objectives);
    }
    if (latestPrev.homework) {
      setFormHomework(latestPrev.homework);
    }
    setFormGeneralNotes(
      `Tiếp nối buổi ${formatDisplayDate(latestPrev.date)} (${latestPrev.topic}). `,
    );
    toast({
      title: "Đã sao chép từ buổi học liền trước",
      description: `Lấy kế hoạch tiếp theo từ buổi ngày ${formatDisplayDate(latestPrev.date)}.`,
      variant: "success",
    });
  };

  const handleAddAttachment = () => {
    if (!newAttachmentName.trim()) return;
    const item: SessionAttachment = {
      id: `att-${Date.now()}`,
      name: newAttachmentName.trim(),
      type: newAttachmentType,
      size: "1.5 MB",
    };
    setFormAttachments((prev) => [...prev, item]);
    setNewAttachmentName("");
  };

  const handleUploadFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newItems: SessionAttachment[] = Array.from(files).map((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      let type: SessionAttachment["type"] = "PDF";
      if (["ppt", "pptx"].includes(ext)) type = "SLIDE";
      else if (["doc", "docx"].includes(ext)) type = "DOCX";
      else if (["jpg", "jpeg", "png", "webp"].includes(ext)) type = "IMAGE";
      else if (["pdf"].includes(ext)) type = "PDF";
      else type = "WORKSHEET";

      const sizeInMB = (f.size / (1024 * 1024)).toFixed(1);
      return {
        id: `att-up-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: f.name,
        type,
        size: `${parseFloat(sizeInMB) > 0 ? sizeInMB : "0.1"} MB`,
      };
    });
    setFormAttachments((prev) => [...prev, ...newItems]);
    e.target.value = "";
  };

  const handleQuickAttachFromLibrary = (fileTitle: string, fileType: SessionAttachment["type"], size: string) => {
    if (formAttachments.some((a) => a.name === fileTitle)) return;
    setFormAttachments((prev) => [
      ...prev,
      {
        id: `att-lib-${Date.now()}`,
        name: fileTitle,
        type: fileType,
        size,
      },
    ]);
  };

  const handleRemoveAttachment = (attId: string) => {
    setFormAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const updateStudentField = <K extends keyof SessionStudentRecord>(
    studentId: string,
    field: K,
    value: SessionStudentRecord[K],
  ) => {
    setFormStudentRecords((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, [field]: value } : r)),
    );
  };

  const handleSaveSession = async (targetStatus: JournalStatus) => {
    if (!activeSession) return;
    if (!formTopic.trim()) {
      toast({
        title: "Thiếu nội dung đã dạy",
        description: "Vui lòng nhập nội dung bài học của buổi dạy.",
        variant: "error",
      });
      return;
    }

    setIsSaving(true);
    try {
      const updated = await apiRequest<ClassSessionRecord>(
        `/api/admin/teaching-journal/${encodeURIComponent(activeSession.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            date: formDate,
            startTime: formStartTime,
            endTime: formEndTime,
            room: formRoom,
            weekNumber: formWeekNumber,
            topic: formTopic.trim(),
            objectives: formObjectives.trim(),
            completionResult: formCompletionResult,
            generalNotes: formGeneralNotes.trim(),
            homework: formHomework.trim(),
            nextSessionPlan: formNextPlan.trim(),
            journalStatus: targetStatus,
            attachments: formAttachments,
            studentRecords: formStudentRecords.map((r) => ({
              studentId: r.studentId,
              attendance: r.attendance,
              homeworkStatus: r.homeworkStatus,
              learningStatus: r.learningStatus,
              skill: r.skill,
              score: r.score,
              teacherFeedback: r.teacherFeedback,
              followUp: r.followUp,
            })),
            syncCurriculumWeek: formSyncCurriculum,
          }),
        },
      );

      setSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      setActiveSession(null);
      loadData();

      toast({
        title:
          targetStatus === "completed"
            ? "Đã hoàn thành Nhật ký giảng dạy & Lịch sử buổi học"
            : "Đã lưu bản nháp Nhật ký giảng dạy",
        description: `Buổi học ngày ${formatDisplayDate(updated.date)} (${updated.classCode}) đã được đồng bộ với Điểm danh, Hồ sơ học sinh và Báo cáo phân tích.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Lỗi lưu nhật ký",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const activeClassroom = React.useMemo(() => {
    if (!activeSession) return null;
    return classes.find((c) => c.id === activeSession.classId) ?? null;
  }, [activeSession, classes]);

  const activeWeekOptions = React.useMemo(
    () => buildClassWeekOptions(activeClassroom),
    [activeClassroom],
  );

  const createSelectedClassroom = React.useMemo(
    () => classes.find((c) => c.id === createClassId) ?? classes[0] ?? null,
    [classes, createClassId],
  );

  const availableClassSlots = React.useMemo(
    () => getClassSlots(createSelectedClassroom, scheduleSessions),
    [createSelectedClassroom, scheduleSessions],
  );

  const activeCreateSlot = React.useMemo(() => {
    return (
      availableClassSlots.find((s) => s.id === createSessionSlotId) ??
      availableClassSlots[0] ??
      null
    );
  }, [availableClassSlots, createSessionSlotId]);

  const handleSelectSlot = (slot: ClassAvailableSessionSlot) => {
    setCreateSessionSlotId(slot.id);
    setCreateDate((prev) => getTargetDateForDayOfWeek(slot.dayOfWeek, prev));
  };

  const createWeekOptions = React.useMemo(
    () => buildClassWeekOptions(createSelectedClassroom),
    [createSelectedClassroom],
  );

  const selectedCreateWeekObj = React.useMemo(
    () =>
      createWeekOptions.find((w) => w.weekNumber === createWeekNumber) ??
      createWeekOptions[0] ??
      null,
    [createWeekOptions, createWeekNumber],
  );

  const handleOpenCreateModal = () => {
    const preferredClassId =
      classFilter !== "all"
        ? classFilter
        : classes.some((c) => c.id === createClassId)
          ? createClassId
          : (classes[0]?.id ?? "");
    const targetCls =
      classes.find((c) => c.id === preferredClassId) ?? classes[0];
    if (targetCls) {
      setCreateClassId(targetCls.id);
      setCreateWeekNumber(targetCls.currentWeekIndex ?? 1);
      const slots = getClassSlots(targetCls, scheduleSessions);
      if (slots.length > 0) {
        setCreateSessionSlotId(slots[0].id);
        setCreateDate((prev) => getTargetDateForDayOfWeek(slots[0].dayOfWeek, prev));
      }
    }
    setIsCreateOpen(true);
  };

  const handleAutoCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createClassId) return;
    setIsCreating(true);
    try {
      const created = await apiRequest<ClassSessionRecord>(
        "/api/admin/teaching-journal",
        {
          method: "POST",
          body: JSON.stringify({
            classId: createClassId,
            date: createDate,
            startTime: activeCreateSlot?.startTime,
            endTime: activeCreateSlot?.endTime,
            room: activeCreateSlot?.room,
            weekNumber: createWeekNumber,
            copyFromPreviousSession: createCopyPrev,
          }),
        },
      );
      setSessions((prev) => [created, ...prev]);
      setIsCreateOpen(false);
      openSessionModal(created);
      toast({
        title: "Đã khởi tạo buổi học từ lịch cố định",
        description: `Hệ thống đã tự động điền ca học ${activeCreateSlot?.startTime ?? ""} – ${activeCreateSlot?.endTime ?? ""}, phòng ${activeCreateSlot?.room ?? ""}, danh sách học viên và gợi ý nội dung Tuần ${created.weekNumber}.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể tạo buổi học",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        variant: "error",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ================ HEADER ================ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="default">P0 · Core Academic Flow</Badge>
            <span className="text-xs font-medium text-muted-foreground">
              Đồng bộ tự động với Lịch dạy, Điểm danh & Hồ sơ Học sinh
            </span>
          </div>
          <h1 className="mt-1 font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Nhật ký Giảng dạy & Lịch sử Buổi học
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
            Ghi nhận nội dung thực tế đã dạy, mức độ hoàn thành chương trình, bài tập về nhà và đánh giá sự tham gia của từng học sinh ngay sau mỗi ca học.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/class-analytics" />}
            nativeButton={false}
          >
            <BarChart3 className="mr-1.5 size-4" aria-hidden="true" />
            Phân tích hiệu quả lớp
          </Button>
          <Button size="sm" onClick={handleOpenCreateModal}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            Tạo buổi học từ lịch cố định
          </Button>
        </div>
      </div>

      {/* ================ KPI SUMMARY CARDS ================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tổng số buổi học
            </span>
            <ClipboardList className="size-4 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">
            {kpi.total}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Liên kết trực tiếp qua mã định danh sessionId
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Đã hoàn thành nhật ký
            </span>
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700">
            {kpi.completed}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Đã chốt nội dung & đánh giá học viên
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Bản nháp / Chưa ghi nhận
            </span>
            <Clock className="size-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-700">
            {kpi.pending}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Cần cập nhật sau buổi dạy
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Chuyên cần các buổi lọc
            </span>
            <Users className="size-4 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">
            {kpi.avgAttendance}%
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Tính trên tổng lượt học sinh phải tham gia
          </p>
        </div>
      </div>

      {/* ================ A. FILTER BAR ================ */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="grid gap-3 md:grid-cols-12">
          {/* Search */}
          <div className="relative md:col-span-4">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo nội dung buổi học, bài tập, nhận xét..."
              className="pl-9 text-xs"
            />
          </div>

          {/* Class selector */}
          <div className="md:col-span-3">
            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo lớp học"
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              <option value="all">Tất cả lớp học ({classes.length})</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.code} — {cls.name}
                </option>
              ))}
            </select>
          </div>

          {/* Journal status filter */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "all" | JournalStatus);
                setPage(1);
              }}
              aria-label="Lọc theo trạng thái nhật ký"
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              <option value="all">Mọi trạng thái</option>
              <option value="completed">✓ Đã hoàn thành</option>
              <option value="draft">✎ Bản nháp</option>
              <option value="not-started">○ Chưa ghi nhận</option>
            </select>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5 md:col-span-3">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              aria-label="Từ ngày"
              className="h-9 text-xs"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              aria-label="Đến ngày"
              className="h-9 text-xs"
            />
          </div>
        </div>
      </div>

      {/* ================ B. SESSION TABLE ================ */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warm/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-heading text-sm font-bold text-foreground">
              Danh sách Buổi học thực tế ({filteredSessions.length})
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Nhấp vào một buổi học để cập nhật Nhật ký giảng dạy & Đánh giá từng học sinh
          </span>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <ClipboardList
              className="size-10 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-semibold text-foreground">
              Không tìm thấy buổi học nào phù hợp với bộ lọc
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Thầy cô có thể bấm nút &ldquo;Tạo buổi học từ lịch cố định&rdquo; để hệ thống tự động sinh buổi học tiếp theo từ lịch dạy của lớp.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Ngày & Ca học</th>
                  <th className="px-4 py-3">Lớp học</th>
                  <th className="px-4 py-3">Nội dung đã dạy & Bài tập</th>
                  <th className="px-4 py-3 text-center">Chuyên cần</th>
                  <th className="px-4 py-3 text-center">Bài tập nộp</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedSessions.map((ses) => {
                  const totalStu = ses.studentRecords.length;
                  const presentOrLate = ses.studentRecords.filter(
                    (r) => r.attendance === "present" || r.attendance === "late",
                  ).length;
                  const hwSubmitted = ses.studentRecords.filter(
                    (r) => r.homeworkStatus === "submitted",
                  ).length;
                  const hwRequired = ses.studentRecords.filter(
                    (r) =>
                      r.homeworkStatus === "submitted" ||
                      r.homeworkStatus === "not-submitted",
                  ).length;

                  return (
                    <tr
                      key={ses.id}
                      onClick={() => openSessionModal(ses)}
                      className="cursor-pointer transition-colors hover:bg-primary/5"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 align-top">
                        <div className="font-mono font-bold text-foreground">
                          {formatDisplayDate(ses.date)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {ses.dayLabel} · {ses.startTime} – {ses.endTime}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="default" className="font-mono text-[10px]">
                            {ses.classCode}
                          </Badge>
                          <span className="font-semibold text-foreground">
                            {ses.className}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Tuần {ses.weekNumber} · {ses.room}
                        </div>
                      </td>

                      <td className="max-w-md px-4 py-3.5 align-top">
                        <p className="font-semibold text-foreground">{ses.topic}</p>
                        {ses.homework ? (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-primary">
                            <strong>BTVN:</strong> {ses.homework}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                            Chưa ghi nhận bài tập về nhà
                          </p>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-center align-top">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 font-mono font-bold text-emerald-700">
                          {presentOrLate}/{totalStu}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-center align-top">
                        {hwRequired > 0 ? (
                          <span className="font-mono font-semibold text-foreground">
                            {hwSubmitted}/{hwRequired} đã nộp
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            Chưa chấm
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-center align-top">
                        {ses.journalStatus === "completed" && (
                          <Badge
                            variant="secondary"
                            className="border border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-700"
                          >
                            ✓ Đã hoàn thành
                          </Badge>
                        )}
                        {ses.journalStatus === "draft" && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700"
                          >
                            ✎ Bản nháp
                          </Badge>
                        )}
                        {ses.journalStatus === "not-started" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground"
                          >
                            Chưa ghi nhận
                          </Badge>
                        )}
                      </td>

                      <td
                        className="whitespace-nowrap px-4 py-3.5 text-right align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => openSessionModal(ses)}
                        >
                          <Edit3 className="mr-1 size-3" aria-hidden="true" />
                          {ses.journalStatus === "not-started"
                            ? "Ghi nhật ký"
                            : "Mở nhật ký"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredSessions.length > 0 && (
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            totalItems={filteredSessions.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
          />
        )}
      </div>

      {/* ================ MODAL 1: AUTO-GENERATE SESSION FROM FIXED SCHEDULE ================ */}
      <ModalDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Tạo buổi học từ lịch cố định"
        description="Hệ thống tự động lấy khung giờ, phòng học từ lịch cố định của lớp và gợi ý nội dung theo tuần chương trình."
        size="lg"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setIsCreateOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={isCreating}
              onClick={handleAutoCreateSession}
            >
              <Sparkles className="mr-1 size-3.5" aria-hidden="true" />
              {isCreating ? "Đang khởi tạo..." : "Khởi tạo & Mở nhật ký"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleAutoCreateSession} className="space-y-4 text-xs">
          {/* 1. CHỌN LỚP HỌC */}
          <div className="space-y-1.5">
            <label
              htmlFor="create-ses-class"
              className="block font-semibold text-foreground"
            >
              1. Chọn lớp học <span className="text-destructive">*</span>
            </label>
            <select
              id="create-ses-class"
              value={createClassId}
              onChange={(e) => {
                const nextId = e.target.value;
                setCreateClassId(nextId);
                const selectedCls = classes.find((c) => c.id === nextId);
                if (selectedCls) {
                  setCreateWeekNumber(selectedCls.currentWeekIndex ?? 1);
                  const slots = getClassSlots(selectedCls, scheduleSessions);
                  if (slots.length > 0) {
                    setCreateSessionSlotId(slots[0].id);
                    setCreateDate((prev) =>
                      getTargetDateForDayOfWeek(slots[0].dayOfWeek, prev),
                    );
                  }
                }
              }}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground shadow-xs transition-colors focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.code} — {cls.name} ({cls.level || cls.targetBand || "Lớp học"})
                </option>
              ))}
            </select>
          </div>

          {/* 2. CHỌN CA HỌC CỦA LỚP */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-foreground">
                2. Chọn ca học của lớp <span className="text-destructive">*</span>
              </label>
              <span className="text-[11px] font-medium text-muted-foreground">
                {availableClassSlots.length} ca học trong tuần
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {availableClassSlots.map((slot) => {
                const isSelected = slot.id === activeCreateSlot?.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => handleSelectSlot(slot)}
                    className={`group relative flex flex-col gap-2 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary shadow-xs ring-1 ring-primary"
                        : "border-border/80 bg-background hover:border-primary/50 hover:bg-muted/30 text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={isSelected ? "default" : "outline"}
                        className={
                          isSelected
                            ? "bg-primary text-primary-foreground font-bold"
                            : "text-foreground font-semibold"
                        }
                      >
                        {slot.dayLabel}
                      </Badge>
                      {isSelected ? (
                        <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                          <Check className="size-3 stroke-[3]" />
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                          Chọn ca này
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                      <span>
                        {slot.startTime} – {slot.endTime}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                      <MapPin className="size-3 shrink-0" />
                      <span className="truncate">{slot.room}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* LIVE PREVIEW BANNER */}
          {activeCreateSlot && (
            <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              <CheckCircle2 className="size-4 shrink-0 text-primary" />
              <span className="leading-snug">
                <strong>Ca học đã chọn:</strong> {activeCreateSlot.fullDayLabel} ·{" "}
                {activeCreateSlot.startTime} – {activeCreateSlot.endTime} ·{" "}
                {activeCreateSlot.room}
              </span>
            </div>
          )}

          {/* 3. NGÀY & TUẦN CHƯƠNG TRÌNH */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="create-ses-date"
                className="block font-semibold text-foreground"
              >
                Ngày diễn ra buổi học
              </label>
              <Input
                id="create-ses-date"
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                required
              />
              <p className="text-[10px] text-muted-foreground">
                Tự động đề xuất theo thứ của ca học đã chọn (bạn vẫn có thể đổi ngày tùy ý).
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-ses-week"
                className="block font-semibold text-foreground"
              >
                Tuần chương trình liên kết
              </label>
              <select
                id="create-ses-week"
                value={createWeekNumber}
                onChange={(e) => setCreateWeekNumber(Number(e.target.value))}
                className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
              >
                {createWeekOptions.map((w) => {
                  const status = resolveWeekStatus(
                    w,
                    createSelectedClassroom?.currentWeekIndex,
                  );
                  const isCurrent =
                    w.weekNumber ===
                    (createSelectedClassroom?.currentWeekIndex ?? 1);
                  const statusLabel = isCurrent
                    ? " (Tuần hiện tại)"
                    : status === "completed"
                      ? " (Đã hoàn thành)"
                      : status === "postponed"
                        ? " (Tạm hoãn)"
                        : "";
                  return (
                    <option key={w.weekNumber} value={w.weekNumber}>
                      Tuần {w.weekNumber}: {w.title}
                      {statusLabel}
                    </option>
                  );
                })}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Hệ thống tự động liên kết bài học, mục tiêu & bài tập theo tuần này.
              </p>
            </div>
          </div>

          {selectedCreateWeekObj && (
            <div className="rounded-xl border border-border/80 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                Nội dung khung chương trình Tuần {selectedCreateWeekObj.weekNumber}:
              </span>{" "}
              <span>{selectedCreateWeekObj.title}</span>
              {selectedCreateWeekObj.focus
                ? ` — Trọng tâm: ${selectedCreateWeekObj.focus}`
                : ""}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-border bg-warm/30 p-3">
            <input
              id="create-copy-prev"
              type="checkbox"
              checked={createCopyPrev}
              onChange={(e) => setCreateCopyPrev(e.target.checked)}
              className="size-4 rounded border-input text-primary"
            />
            <label
              htmlFor="create-copy-prev"
              className="cursor-pointer font-medium text-foreground select-none"
            >
              Sao chép kế hoạch buổi tiếp theo & cấu trúc từ buổi học liền trước của lớp
            </label>
          </div>
        </form>
      </ModalDialog>

      {/* ================ MODAL 2: SESSION JOURNAL & LEARNING HISTORY DETAIL ================ */}
      <ModalDialog
        open={Boolean(activeSession)}
        onClose={() => setActiveSession(null)}
        title={
          activeSession
            ? `Nhật ký Buổi học: ${activeSession.classCode} — ${activeSession.className}`
            : "Chi tiết buổi học"
        }
        description={
          activeSession
            ? `Ngày ${formatDisplayDate(activeSession.date)} (${activeSession.dayLabel}) · Ca ${activeSession.startTime} – ${activeSession.endTime} · ${activeSession.room} · Mã buổi: ${activeSession.id}`
            : undefined
        }
        size="xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                id="sync-curriculum-check"
                type="checkbox"
                checked={formSyncCurriculum}
                onChange={(e) => setFormSyncCurriculum(e.target.checked)}
                className="size-4 rounded border-input text-primary"
              />
              <label
                htmlFor="sync-curriculum-check"
                className="cursor-pointer text-xs text-muted-foreground select-none"
              >
                Đồng bộ kết quả & bài tập vào Tuần {formWeekNumber} trong Khung chương trình
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setActiveSession(null)}
              >
                Đóng
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                disabled={isSaving}
                onClick={() => handleSaveSession("draft")}
              >
                Lưu bản nháp
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={isSaving}
                onClick={() => handleSaveSession("completed")}
              >
                <Check className="mr-1 size-3.5" aria-hidden="true" />
                {isSaving ? "Đang lưu..." : "Hoàn thành nhật ký"}
              </Button>
            </div>
          </div>
        }
      >
        {activeSession && (
          <div className="space-y-4 text-xs">
            {/* Navigation Tabs inside Session Modal */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant={activeModalTab === "journal" ? "default" : "outline"}
                  onClick={() => setActiveModalTab("journal")}
                >
                  <BookOpen className="mr-1 size-3.5" aria-hidden="true" />
                  1. Nhật ký giảng dạy chung
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={activeModalTab === "students" ? "default" : "outline"}
                  onClick={() => setActiveModalTab("students")}
                >
                  <Users className="mr-1 size-3.5" aria-hidden="true" />
                  2. Lịch sử học tập từng học sinh ({formStudentRecords.length})
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={activeModalTab === "revisions" ? "default" : "outline"}
                  onClick={() => setActiveModalTab("revisions")}
                >
                  <History className="mr-1 size-3.5" aria-hidden="true" />
                  3. Lịch sử chỉnh sửa ({activeSession.revisions?.length ?? 0})
                </Button>
              </div>

              {activeModalTab === "journal" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleCopyFromPreviousSession}
                  className="text-primary hover:bg-primary/10"
                >
                  <Copy className="mr-1 size-3.5" aria-hidden="true" />
                  Sao chép từ buổi học trước
                </Button>
              )}
            </div>

            {/* ==================== TAB 1: TEACHING JOURNAL ==================== */}
            {activeModalTab === "journal" && (
              <div className="space-y-4 pb-12 pr-1">
                {/* Schedule & Week Row */}
                <div className="grid gap-3 rounded-xl bg-warm/30 p-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <label className="block font-semibold text-foreground">
                      Ngày dạy
                    </label>
                    <Input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-semibold text-foreground">
                      Ca học (Bắt đầu – Kết thúc)
                    </label>
                    <div className="flex items-center gap-1">
                      <Input
                        value={formStartTime}
                        onChange={(e) => setFormStartTime(e.target.value)}
                        className="h-8 font-mono text-xs"
                      />
                      <span>–</span>
                      <Input
                        value={formEndTime}
                        onChange={(e) => setFormEndTime(e.target.value)}
                        className="h-8 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block font-semibold text-foreground">
                      Tuần chương trình
                    </label>
                    <select
                      value={formWeekNumber}
                      onChange={(e) =>
                        handleSuggestFromCurriculumWeek(Number(e.target.value))
                      }
                      className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs font-medium text-foreground"
                    >
                      {activeWeekOptions.map((w) => (
                        <option key={w.weekNumber} value={w.weekNumber}>
                          Tuần {w.weekNumber}: {w.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block font-semibold text-foreground">
                      Kết quả thực hiện
                    </label>
                    <select
                      value={formCompletionResult}
                      onChange={(e) =>
                        setFormCompletionResult(
                          e.target.value as SessionCompletionResult,
                        )
                      }
                      className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs font-semibold text-foreground"
                    >
                      <option value="completed">✓ Đã hoàn thành toàn bộ</option>
                      <option value="partial">◑ Hoàn thành một phần</option>
                      <option value="not-completed">○ Chưa hoàn thành</option>
                    </select>
                  </div>
                </div>

                {/* Topic & Objectives */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block font-semibold text-foreground">
                      Nội dung đã dạy <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={formTopic}
                      onChange={(e) => setFormTopic(e.target.value)}
                      placeholder="VD: Reading – Matching Headings & Paraphrasing"
                      className="h-8 text-xs font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-semibold text-foreground">
                      Phòng học
                    </label>
                    <Input
                      value={formRoom}
                      onChange={(e) => setFormRoom(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-foreground">
                    Mục tiêu buổi học (Kiến thức, kỹ năng cần đạt)
                  </label>
                  <textarea
                    rows={2}
                    value={formObjectives}
                    onChange={(e) => setFormObjectives(e.target.value)}
                    placeholder="Ghi rõ mục tiêu kỹ năng hoặc tiêu chí đầu ra của buổi học..."
                    className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-foreground">
                    Nhận xét chung (Đánh giá tình hình tiếp thu của cả lớp)
                  </label>
                  <textarea
                    rows={3}
                    value={formGeneralNotes}
                    onChange={(e) => setFormGeneralNotes(e.target.value)}
                    placeholder="Học sinh học tốt hay chưa tốt ở nội dung nào? Phần nào đã hoàn thành hoặc cần giảng kỹ hơn?"
                    className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block font-semibold text-foreground">
                      Bài tập về nhà đã giao
                    </label>
                    <textarea
                      rows={2}
                      value={formHomework}
                      onChange={(e) => setFormHomework(e.target.value)}
                      placeholder="VD: Cambridge IELTS 17 Test 2 Passage 2 + Bảng từ vựng..."
                      className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block font-semibold text-foreground">
                      Kế hoạch buổi sau (Nội dung dự kiến tiếp theo)
                    </label>
                    <textarea
                      rows={2}
                      value={formNextPlan}
                      onChange={(e) => setFormNextPlan(e.target.value)}
                      placeholder="Buổi sau cần chữa bài gì hoặc tiếp tục phần nào?"
                      className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  </div>
                </div>

                {/* Attachments Section */}
                <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold text-foreground">
                      <Paperclip className="size-3.5 text-primary" aria-hidden="true" />
                      Tài liệu giảng dạy đính kèm ({formAttachments.length})
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        Gắn nhanh từ Kho tài liệu:
                      </span>
                      {RESOURCE_FILES_DATA.slice(0, 2).map((rf) => (
                        <Button
                          key={rf.id}
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            handleQuickAttachFromLibrary(
                              rf.title,
                              rf.fileType === "AUDIO" ? "PDF" : rf.fileType,
                              rf.size,
                            )
                          }
                          className="h-6 text-[10px] text-primary"
                        >
                          + {rf.title.slice(0, 28)}...
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={newAttachmentName}
                      onChange={(e) => setNewAttachmentName(e.target.value)}
                      placeholder="Tên file đính kèm (VD: Handout_Reading_Week7.pdf)"
                      className="h-8 flex-1 text-xs"
                    />
                    <select
                      value={newAttachmentType}
                      onChange={(e) =>
                        setNewAttachmentType(
                          e.target.value as SessionAttachment["type"],
                        )
                      }
                      className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                    >
                      <option value="PDF">PDF</option>
                      <option value="SLIDE">SLIDE</option>
                      <option value="WORKSHEET">WORKSHEET</option>
                      <option value="DOCX">DOCX</option>
                      <option value="IMAGE">IMAGE</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={handleAddAttachment}
                    >
                      <Plus className="mr-1 size-3" aria-hidden="true" />
                      Thêm tài liệu
                    </Button>
                    <label className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
                      <Upload className="size-3" aria-hidden="true" />
                      <span>Tải từ máy tính</span>
                      <input
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={handleUploadFiles}
                      />
                    </label>
                  </div>

                  {formAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {formAttachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-2 rounded-lg border border-border bg-warm/20 px-2.5 py-1 text-[11px]"
                        >
                          <FileText
                            className="size-3.5 text-primary"
                            aria-hidden="true"
                          />
                          <span className="font-medium text-foreground">
                            {att.name}
                          </span>
                          <Badge variant="outline" className="text-[9px]">
                            {att.type.toUpperCase()}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(att.id)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Xóa tài liệu ${att.name}`}
                          >
                            <Trash2 className="size-3" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== TAB 2: STUDENT LEARNING HISTORY ==================== */}
            {activeModalTab === "students" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warm/30 p-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      Ghi nhận sự tham gia & kết quả học tập của từng học sinh trong buổi
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Điểm danh tại đây được đồng bộ trực tiếp với module Điểm danh (/attendance) và Hồ sơ Học sinh (/students).
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        setFormStudentRecords((prev) =>
                          prev.map((r) => ({ ...r, attendance: "present" })),
                        )
                      }
                    >
                      <ClipboardCheck className="mr-1 size-3" aria-hidden="true" />
                      Tất cả Có mặt
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        setFormStudentRecords((prev) =>
                          prev.map((r) => ({
                            ...r,
                            homeworkStatus: "submitted",
                          })),
                        )
                      }
                    >
                      Tất cả Đã nộp BTVN
                    </Button>
                  </div>
                </div>

                {formStudentRecords.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                    Lớp học hiện chưa có học sinh hoạt động nào được phân bổ.
                  </div>
                ) : (
                  <div className="space-y-2.5 pb-12 pr-1">
                    {formStudentRecords.map((rec) => (
                      <div
                        key={rec.studentId}
                        className="space-y-2.5 rounded-xl border border-border bg-card p-3.5 shadow-2xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-heading text-sm font-bold text-foreground">
                              {rec.studentName}
                            </span>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {rec.studentCode}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Attendance */}
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-muted-foreground">
                                Điểm danh:
                              </span>
                              <select
                                value={rec.attendance}
                                onChange={(e) =>
                                  updateStudentField(
                                    rec.studentId,
                                    "attendance",
                                    e.target.value as SessionStudentRecord["attendance"],
                                  )
                                }
                                className="h-7 rounded-lg border border-input bg-background px-2 text-xs font-semibold"
                              >
                                <option value="present">✓ Có mặt</option>
                                <option value="late">⏰ Đi muộn</option>
                                <option value="excused">✉ Vắng có phép</option>
                                <option value="absent">✕ Vắng không phép</option>
                              </select>
                            </div>

                            {/* Homework Status */}
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-muted-foreground">
                                Bài tập:
                              </span>
                              <select
                                value={rec.homeworkStatus}
                                onChange={(e) =>
                                  updateStudentField(
                                    rec.studentId,
                                    "homeworkStatus",
                                    e.target.value as SessionHomeworkStatus,
                                  )
                                }
                                className="h-7 rounded-lg border border-input bg-background px-2 text-xs font-medium"
                              >
                                <option value="submitted">Đã nộp</option>
                                <option value="not-submitted">Chưa nộp</option>
                                <option value="exempt">Miễn</option>
                                <option value="unrecorded">Chưa ghi nhận</option>
                              </select>
                            </div>

                            {/* Learning Status */}
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-muted-foreground">
                                Kết quả:
                              </span>
                              <select
                                value={rec.learningStatus}
                                onChange={(e) =>
                                  updateStudentField(
                                    rec.studentId,
                                    "learningStatus",
                                    e.target.value as SessionLearningStatus,
                                  )
                                }
                                className="h-7 rounded-lg border border-input bg-background px-2 text-xs font-medium"
                              >
                                <option value="good">★ Tốt</option>
                                <option value="satisfactory">✓ Đạt</option>
                                <option value="needs-support">⚠ Cần hỗ trợ</option>
                                <option value="unrecorded">— Chưa đánh giá</option>
                              </select>
                            </div>

                            {/* Skill */}
                            <select
                              value={rec.skill}
                              onChange={(e) =>
                                updateStudentField(
                                  rec.studentId,
                                  "skill",
                                  e.target.value as SessionSkillType,
                                )
                              }
                              aria-label="Kỹ năng đánh giá"
                              className="h-7 rounded-lg border border-input bg-background px-2 text-xs"
                            >
                              <option value="General">Tổng hợp (General)</option>
                              <option value="Listening">Kỹ năng Nghe (Listening)</option>
                              <option value="Reading">Kỹ năng Đọc (Reading)</option>
                              <option value="Writing">Kỹ năng Viết (Writing)</option>
                              <option value="Speaking">Kỹ năng Nói (Speaking)</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <div>
                            <Input
                              value={rec.teacherFeedback}
                              onChange={(e) =>
                                updateStudentField(
                                  rec.studentId,
                                  "teacherFeedback",
                                  e.target.value,
                                )
                              }
                              placeholder="Nhận xét cá nhân trong buổi học (VD: Lập luận tốt, hoàn thành bài viết)..."
                              className="h-8 text-xs"
                            />
                          </div>
                          <div>
                            <Input
                              value={rec.followUp}
                              onChange={(e) =>
                                updateStudentField(
                                  rec.studentId,
                                  "followUp",
                                  e.target.value,
                                )
                              }
                              placeholder="Nội dung cần hỗ trợ tiếp (Follow-up)..."
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB 3: REVISION HISTORY ==================== */}
            {activeModalTab === "revisions" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Hệ thống tự động ghi lại lịch sử mỗi khi nhật ký đã lưu được chỉnh sửa nội dung, nhận xét hoặc kết quả thực hiện.
                </p>
                {!activeSession.revisions ||
                activeSession.revisions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                    Chưa có lịch sử chỉnh sửa nào cho buổi học này.
                  </div>
                ) : (
                  <div className="space-y-2.5 pb-12 pr-1">
                    {activeSession.revisions.map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-xl border border-border bg-background p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {rev.summary}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            <Calendar className="mr-1 inline size-3" />
                            {rev.updatedAt}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          <strong>Chủ đề trước đó:</strong> {rev.previousTopic}
                        </p>
                        {rev.previousNotes && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            <strong>Nhận xét trước đó:</strong> {rev.previousNotes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
