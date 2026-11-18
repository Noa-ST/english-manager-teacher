"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  LayoutGrid,
  List,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  CLASSROOMS_DATA,
  WEEKLY_SCHEDULE_DATA,
  STANDARD_ROOMS,
  STANDARD_TIME_SLOTS,
  type ClassroomGroup,
  type WeeklyClassSession,
  type TimeSlotDef,
} from "@/services/classroom-data";
import {
  isTimeOverlapping,
  loadCustomSlots,
  saveCustomSlots,
  validateNewTimeSlot,
  toMinutes,
  parseScheduleStringToSlots,
  matchStandardRoom,
  type SlotValidationResult,
} from "@/services/schedule-helper";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const DAYS_OF_WEEK = [
  { day: 1, label: "Thứ Hai", short: "T2", date: "09/11" },
  { day: 2, label: "Thứ Ba", short: "T3", date: "10/11" },
  { day: 3, label: "Thứ Tư", short: "T4", date: "11/11" },
  { day: 4, label: "Thứ Năm", short: "T5", date: "12/11" },
  { day: 5, label: "Thứ Sáu", short: "T6", date: "13/11" },
  { day: 6, label: "Thứ Bảy", short: "T7", date: "14/11" },
  { day: 7, label: "Chủ Nhật", short: "CN", date: "15/11" },
];

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

export default function AdminSchedulePage() {
  const { toast } = useToast();

  const [classes, setClasses] = React.useState<ClassroomGroup[]>(CLASSROOMS_DATA);
  const [sessions, setSessions] = React.useState<WeeklyClassSession[]>(WEEKLY_SCHEDULE_DATA);
  const [timeSlots, setTimeSlots] = React.useState<TimeSlotDef[]>(() => loadCustomSlots());

  const [calendarMode, setCalendarMode] = React.useState<"week" | "month">("week");
  const [isAddSessionOpen, setIsAddSessionOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form states for creating session
  const [formClassCode, setFormClassCode] = React.useState<string>(() => classes[0]?.code ?? "II-01");
  const [formDayOfWeek, setFormDayOfWeek] = React.useState<number>(6);
  const [formStartTime, setFormStartTime] = React.useState<string>("14:30");
  const [formEndTime, setFormEndTime] = React.useState<string>("16:30");
  const [formSelectedSlotId, setFormSelectedSlotId] = React.useState<string>("");
  const [formRoom, setFormRoom] = React.useState<string>(STANDARD_ROOMS[0]);
  const [formTopic, setFormTopic] = React.useState<string>("Chuyên đề bổ trợ phát triển kỹ năng");

  // Custom Slot Creator Panel states (identical to classes modal)
  const [isAddingCustomSlot, setIsAddingCustomSlot] = React.useState(false);
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");

  // Load classes, schedule & custom time slots
  React.useEffect(() => {
    apiRequest<ClassroomGroup[]>("/api/admin/classes")
      .then((items) => {
        if (items && items.length > 0) {
          const merged = mergeClassesWithDefaults(items);
          setClasses(merged);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("teacher_studio_classrooms_v1", JSON.stringify(merged));
            } catch {}
          }
        }
      })
      .catch(() => {});

    apiRequest<WeeklyClassSession[]>("/api/admin/schedule")
      .then((items) => {
        if (items && items.length > 0) {
          const sorted = [...items].sort((a, b) =>
            a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.startTime.localeCompare(b.startTime),
          );
          setSessions(sorted);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("teacher_studio_schedule_v1", JSON.stringify(sorted));
            } catch {}
          }
        }
      })
      .catch(() => {});
  }, []);

  // Selected Class details
  const selectedClass = React.useMemo(() => {
    return classes.find((c) => c.code === formClassCode) || classes[0];
  }, [classes, formClassCode]);

  // Dynamic Real Facility Rooms list extracted from active classes, sessions & standard directory
  const facilityRooms = React.useMemo(() => {
    const set = new Set<string>(STANDARD_ROOMS);
    for (const c of classes) {
      if (c.room) {
        const matched = matchStandardRoom(c.room, STANDARD_ROOMS);
        set.add(matched || c.room);
      }
    }
    for (const s of sessions) {
      if (s.room) {
        const matched = matchStandardRoom(s.room, STANDARD_ROOMS);
        set.add(matched || s.room);
      }
    }
    return Array.from(set);
  }, [classes, sessions]);

  const matchedRoom = React.useMemo(() => {
    return matchStandardRoom(formRoom, facilityRooms);
  }, [formRoom, facilityRooms]);

  // Extract template schedule chips from selected class's fixed scheduleSummary
  const classScheduleChips = React.useMemo(() => {
    if (!selectedClass?.scheduleSummary) return [];
    const parsed = parseScheduleStringToSlots(selectedClass.scheduleSummary, timeSlots);
    return parsed
      .map((item) => {
        const dayObj = DAYS_OF_WEEK.find((d) => d.day === item.dayNumber);
        const slotObj = timeSlots.find((s) => s.id === item.slotId);
        return {
          dayNumber: item.dayNumber,
          slotId: item.slotId,
          dayLabel: dayObj?.label ?? `Thứ ${item.dayNumber}`,
          startTime: slotObj?.startTime ?? "",
          endTime: slotObj?.endTime ?? "",
          label: `${dayObj?.short ?? `T${item.dayNumber}`} (${slotObj?.startTime} – ${slotObj?.endTime})`,
        };
      })
      .filter((c) => c.startTime && c.endTime);
  }, [selectedClass, timeSlots]);

  // Custom slot validation rule
  const slotValidation = React.useMemo<SlotValidationResult | null>(() => {
    if (!customStart.trim() && !customEnd.trim()) return null;
    return validateNewTimeSlot(customStart, customEnd, timeSlots);
  }, [customStart, customEnd, timeSlots]);

  // Duration calculation
  const durationText = React.useMemo(() => {
    if (!formStartTime || !formEndTime) return "";
    const startM = toMinutes(formStartTime);
    const endM = toMinutes(formEndTime);
    if (endM <= startM) return "Giờ kết thúc phải sau giờ bắt đầu";
    const diff = endM - startM;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `Thời lượng: ${h > 0 ? `${h} tiếng ` : ""}${m > 0 ? `${m} phút` : ""}`.trim();
  }, [formStartTime, formEndTime]);

  // Real-time live conflict detector in the modal
  const liveConflict = React.useMemo(() => {
    if (!formStartTime || !formEndTime) return null;
    const matchingSessions = sessions.filter(
      (s) =>
        s.dayOfWeek === formDayOfWeek &&
        isTimeOverlapping(s.startTime, s.endTime, formStartTime, formEndTime),
    );
    if (matchingSessions.length === 0) return null;

    // Check room conflict first
    const roomConflict = matchingSessions.find(
      (s) => s.room.trim().toLowerCase() === formRoom.trim().toLowerCase(),
    );
    if (roomConflict) {
      return {
        type: "room" as const,
        message: `Xung đột phòng học: "${formRoom}" đã có ca học của lớp ${roomConflict.classCode} (${roomConflict.className}) từ ${roomConflict.startTime} đến ${roomConflict.endTime}.`,
        session: roomConflict,
      };
    }

    // Check class conflict
    const classConflict = matchingSessions.find(
      (s) => s.classCode.trim().toUpperCase() === formClassCode.trim().toUpperCase(),
    );
    if (classConflict) {
      return {
        type: "class" as const,
        message: `Xung đột lớp học: Lớp ${formClassCode} đã có một ca học khác từ ${classConflict.startTime} đến ${classConflict.endTime}.`,
        session: classConflict,
      };
    }

    // General time slot overlap notice
    return {
      type: "time" as const,
      message: `Khung giờ này đang có ca học của lớp ${matchingSessions[0].classCode} (${matchingSessions[0].startTime} – ${matchingSessions[0].endTime}) tại ${matchingSessions[0].room}.`,
      session: matchingSessions[0],
    };
  }, [sessions, formDayOfWeek, formStartTime, formEndTime, formRoom, formClassCode]);

  // Global conflict count
  const conflictCount = React.useMemo(() => {
    let count = 0;
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        if (
          sessions[i].dayOfWeek === sessions[j].dayOfWeek &&
          (sessions[i].startTime === sessions[j].startTime ||
            isTimeOverlapping(
              sessions[i].startTime,
              sessions[i].endTime,
              sessions[j].startTime,
              sessions[j].endTime,
            ))
        ) {
          count++;
        }
      }
    }
    return count;
  }, [sessions]);

  // Open modal with smart auto-fill
  const openAddSessionModal = (preselectedDay?: number) => {
    const activeClass = classes.find((c) => c.status !== "archived") || classes[0];
    const initialCode = activeClass?.code ?? "II-01";
    setFormClassCode(initialCode);
    const initialRoom = matchStandardRoom(activeClass?.room, facilityRooms) || activeClass?.room || STANDARD_ROOMS[0];
    setFormRoom(initialRoom);
    setFormTopic(activeClass?.currentModule || "Chuyên đề bổ trợ phát triển kỹ năng");

    const loadedSlots = loadCustomSlots();
    setTimeSlots(loadedSlots);

    if (preselectedDay !== undefined) {
      setFormDayOfWeek(preselectedDay);
    }

    // Auto-select slot from class scheduleSummary if available
    if (activeClass?.scheduleSummary) {
      const parsed = parseScheduleStringToSlots(activeClass.scheduleSummary, loadedSlots);
      if (parsed.length > 0) {
        const targetSlot = preselectedDay
          ? parsed.find((p) => p.dayNumber === preselectedDay) || parsed[0]
          : parsed[0];
        if (preselectedDay === undefined) {
          setFormDayOfWeek(targetSlot.dayNumber);
        }
        const slot = loadedSlots.find((s) => s.id === targetSlot.slotId);
        if (slot) {
          setFormStartTime(slot.startTime);
          setFormEndTime(slot.endTime);
          setFormSelectedSlotId(slot.id);
        }
      } else {
        if (preselectedDay === undefined) setFormDayOfWeek(6);
        setFormStartTime(loadedSlots[0]?.startTime || "17:45");
        setFormEndTime(loadedSlots[0]?.endTime || "19:45");
        setFormSelectedSlotId(loadedSlots[0]?.id || "");
      }
    } else {
      if (preselectedDay === undefined) setFormDayOfWeek(6);
      setFormStartTime(loadedSlots[0]?.startTime || "17:45");
      setFormEndTime(loadedSlots[0]?.endTime || "19:45");
      setFormSelectedSlotId(loadedSlots[0]?.id || "");
    }

    setIsAddingCustomSlot(false);
    setCustomStart("");
    setCustomEnd("");
    setIsAddSessionOpen(true);
  };

  // When teacher switches class dropdown
  const handleClassChange = (newCode: string) => {
    setFormClassCode(newCode);
    const cls = classes.find((c) => c.code === newCode);
    if (cls) {
      if (cls.room) {
        const matched = matchStandardRoom(cls.room, facilityRooms) || cls.room;
        setFormRoom(matched);
      }
      if (cls.currentModule) setFormTopic(cls.currentModule);
      if (cls.scheduleSummary) {
        const parsed = parseScheduleStringToSlots(cls.scheduleSummary, timeSlots);
        if (parsed.length > 0) {
          const first = parsed[0];
          setFormDayOfWeek(first.dayNumber);
          const slot = timeSlots.find((s) => s.id === first.slotId);
          if (slot) {
            setFormStartTime(slot.startTime);
            setFormEndTime(slot.endTime);
            setFormSelectedSlotId(slot.id);
          }
        }
      }
    }
  };

  // Add custom time slot
  const handleAddCustomSlot = () => {
    if (!slotValidation || !slotValidation.isValid) return;
    const start = slotValidation.normalizedStart!;
    const end = slotValidation.normalizedEnd!;
    const startMin = toMinutes(start);
    const period: TimeSlotDef["period"] =
      startMin < 720 ? "morning" : startMin < 1020 ? "afternoon" : "evening";
    const newSlot: TimeSlotDef = {
      id: `slot-${Date.now()}`,
      startTime: start,
      endTime: end,
      label: `Ca ${start} – ${end}`,
      period,
      isCustom: true,
    };
    const updated = saveCustomSlots([...timeSlots, newSlot]);
    setTimeSlots(updated);
    setFormStartTime(start);
    setFormEndTime(end);
    setFormSelectedSlotId(newSlot.id);
    setIsAddingCustomSlot(false);
    setCustomStart("");
    setCustomEnd("");
    toast({
      title: "Đã thêm khung giờ mới",
      description: `Khung giờ ${start} – ${end} đã sẵn sàng sử dụng trên toàn hệ thống.`,
      variant: "success",
    });
  };

  // Reset custom slots to standard
  const handleResetSlotsToDefault = () => {
    const updated = saveCustomSlots(STANDARD_TIME_SLOTS);
    setTimeSlots(updated);
    toast({
      title: "Đã đặt lại khung giờ",
      description: "Đã khôi phục danh sách khung giờ tiêu chuẩn mặc định.",
      variant: "info",
    });
  };

  // Delete custom slot
  const handleDeleteSlot = (slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const slotDef = timeSlots.find((s) => s.id === slotId);
    if (!slotDef) return;
    const isSlotInUse = sessions.some(
      (s) => s.startTime === slotDef.startTime && s.endTime === slotDef.endTime,
    );
    if (isSlotInUse) {
      toast({
        title: "Không thể xóa khung giờ!",
        description: `Khung giờ ${slotDef.startTime} – ${slotDef.endTime} đang có ca học trong tuần. Không thể xóa.`,
        variant: "warning",
      });
      return;
    }
    const updated = saveCustomSlots(timeSlots.filter((s) => s.id !== slotId));
    setTimeSlots(updated);
    if (formSelectedSlotId === slotId) {
      setFormSelectedSlotId("");
    }
    toast({
      title: "Đã xóa khung giờ",
      description: `Đã gỡ khung giờ ${slotDef.startTime} – ${slotDef.endTime}.`,
      variant: "info",
    });
  };

  // Submit new session
  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTopic.trim()) {
      toast({
        title: "Thiếu chuyên đề",
        description: "Vui lòng nhập chuyên đề hoặc nội dung trọng tâm của buổi học.",
        variant: "error",
      });
      return;
    }

    if (toMinutes(formStartTime) >= toMinutes(formEndTime)) {
      toast({
        title: "Khung giờ không hợp lệ",
        description: "Giờ bắt đầu phải sớm hơn giờ kết thúc ca học.",
        variant: "error",
      });
      return;
    }

    if (liveConflict?.type === "room") {
      toast({
        title: "Xung đột phòng học",
        description: liveConflict.message,
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await apiRequest<WeeklyClassSession>("/api/admin/schedule", {
        method: "POST",
        body: JSON.stringify({
          classCode: formClassCode,
          dayOfWeek: Number(formDayOfWeek),
          startTime: formStartTime,
          endTime: formEndTime,
          room: formRoom,
          topic: formTopic.trim(),
        }),
      });
      setSessions((prev) => {
        const next = [...prev, created].sort((a, b) =>
          a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.startTime.localeCompare(b.startTime),
        );
        return next;
      });
      toast({
        title: created.hasConflict
          ? "Đã thêm ca học (Cảnh báo trùng giờ!)"
          : "Đã lên lịch ca học mới thành công",
        description: `${created.dayLabel} (${created.startTime}–${created.endTime}) · ${created.className}`,
        variant: created.hasConflict ? "warning" : "success",
      });
      setIsAddSessionOpen(false);
    } catch (err) {
      toast({
        title: "Không thể lưu ca học",
        description:
          err instanceof Error ? err.message : "Vui lòng kiểm tra lại khung giờ và phòng học.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSession = async (
    sessionId: string,
    className: string,
    dayLabel: string,
  ) => {
    if (!confirm(`Bạn có chắc muốn xóa ca dạy này của lớp "${className}" (${dayLabel})?`)) {
      return;
    }
    try {
      await apiRequest<{ success: boolean }>(`/api/admin/schedule?id=${sessionId}`, {
        method: "DELETE",
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast({
        title: "Đã xóa ca học thành công",
        description: "Đã loại bỏ ca học khỏi thời khóa biểu và tự động cập nhật lại lịch của lớp.",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Lỗi xóa ca học",
        description: err instanceof Error ? err.message : "Không thể xóa ca học.",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản lý Lịch dạy & Ca học
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Điều phối thời khóa biểu tuần/tháng, kiểm soát xung đột phòng học và sĩ số từng ca.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Conflict Detector Pill */}
          {conflictCount === 0 ? (
            <Badge variant="success" className="h-8 px-3">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              0 xung đột lịch dạy
            </Badge>
          ) : (
            <Badge variant="destructive" className="h-8 px-3">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Phát hiện {conflictCount} ca trùng khung giờ
            </Badge>
          )}

          {/* Week / Month Switcher */}
          <div
            className="inline-flex items-center rounded-xl border border-border bg-card p-1"
            role="group"
            aria-label="Chế độ xem lịch"
          >
            <button
              type="button"
              onClick={() => setCalendarMode("week")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                calendarMode === "week"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-3.5" aria-hidden="true" />
              Lịch Tuần
            </button>
            <button
              type="button"
              onClick={() => setCalendarMode("month")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                calendarMode === "month"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="size-3.5" aria-hidden="true" />
              Tổng quan Tháng
            </button>
          </div>

          <Button size="sm" onClick={() => openAddSessionModal()}>
            <Plus className="size-4" aria-hidden="true" />
            Thêm ca dạy
          </Button>
        </div>
      </div>

      {/* WEEKLY CALENDAR GRID VIEW */}
      {calendarMode === "week" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
          {DAYS_OF_WEEK.map((dayItem) => {
            const daySessions = sessions
              .filter((s) => s.dayOfWeek === dayItem.day)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));
            return (
              <div
                key={dayItem.day}
                className="flex flex-col rounded-2xl border border-border bg-card p-3.5 shadow-2xs"
              >
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <div>
                    <p className="font-heading text-xs font-bold text-foreground">
                      {dayItem.label}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {dayItem.date}/2026
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {daySessions.length} ca
                    </Badge>
                    <button
                      type="button"
                      onClick={() => openAddSessionModal(dayItem.day)}
                      title={`Thêm ca dạy cho ${dayItem.label}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      aria-label={`Thêm ca dạy cho ${dayItem.label}`}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex-1 space-y-2.5">
                  {daySessions.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => openAddSessionModal(dayItem.day)}
                      className="flex h-[200px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground transition-all hover:border-primary/60 hover:bg-primary/5 hover:text-primary cursor-pointer"
                    >
                      <Plus className="size-4 text-primary" aria-hidden="true" />
                      <span>+ Thêm ca dạy</span>
                    </button>
                  ) : (
                    daySessions.map((ses) => (
                      <div
                        key={ses.id}
                        className={cn(
                          "flex flex-col justify-between h-[200px] rounded-xl border p-3 text-xs transition-all shadow-2xs",
                          ses.hasConflict
                            ? "border-destructive/60 bg-destructive/5"
                            : ses.status === "ongoing"
                              ? "border-primary/40 bg-warm/60"
                              : "border-border bg-background hover:border-primary/40 hover:shadow-xs",
                        )}
                      >
                        {/* 1. Header: Mã lớp bên trái & Thùng rác bên phải -> Cực kỳ cân đối */}
                        <div className="flex items-center justify-between">
                          <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary shrink-0">
                            {ses.classCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(ses.id, ses.className, ses.dayLabel)}
                            title="Xóa ca dạy này"
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer shrink-0"
                            aria-label={`Xóa ca dạy ${ses.startTime} - ${ses.endTime} của lớp ${ses.classCode}`}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        {/* 2. Dòng thời gian riêng biệt: Đồng hồ + Khung giờ rõ ràng, cân đối */}
                        <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-primary">
                          <Clock className="size-3 text-primary shrink-0" aria-hidden="true" />
                          <span>
                            {ses.startTime} – {ses.endTime}
                          </span>
                        </div>

                        {/* 3. Tên lớp học (2 dòng) & Chuyên đề (2 dòng) chuẩn hóa độ cao */}
                        <div className="space-y-1">
                          <p
                            title={ses.className}
                            className="font-heading text-xs font-bold text-foreground line-clamp-2 h-[34px] leading-[17px]"
                          >
                            {ses.className}
                          </p>
                          <p
                            title={ses.topic}
                            className="text-[11px] text-muted-foreground line-clamp-2 h-[30px] leading-[15px]"
                          >
                            {ses.topic}
                          </p>
                        </div>

                        {/* 4. Dòng phòng học trọn vẹn, không bao giờ bị cắt thành P... */}
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/85">
                          <MapPin className="size-3 text-accent shrink-0" aria-hidden="true" />
                          <span className="truncate" title={ses.room}>
                            {ses.room.split("·")[0].trim()}
                          </span>
                        </div>

                        {/* 5. Nút Điểm danh ở đáy card: Rõ ràng, dễ bấm */}
                        <div className="border-t border-border/70 pt-2">
                          <Link
                            href="/attendance"
                            className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 text-[11px] font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground"
                          >
                            <ClipboardCheck className="size-3.5" aria-hidden="true" />
                            <span>Điểm danh</span>
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MONTHLY / AGENDA SUMMARY VIEW */
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">
                Lịch trình giảng dạy Tháng 11/2026 (4 tuần học)
              </h2>
              <p className="text-xs text-muted-foreground">
                Tổng cộng {sessions.length * 4} ca học tiêu chuẩn trong tháng.
              </p>
            </div>
            <Badge variant="warm">Tháng 11/2026</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[...sessions]
              .sort((a, b) =>
                a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.startTime.localeCompare(b.startTime),
              )
              .map((ses) => (
              <div
                key={ses.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="font-mono">
                      {ses.classCode}
                    </Badge>
                    <span className="font-heading text-sm font-bold text-foreground">
                      {ses.dayLabel} ({ses.startTime} – {ses.endTime})
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground">{ses.className}</p>
                  <p className="text-xs text-muted-foreground">
                    {ses.room} · Sĩ số: {ses.enrolledCount}/{ses.capacity} HV
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="xs"
                  render={<Link href="/attendance" />}
                  nativeButton={false}
                >
                  <ClipboardCheck className="size-3.5" aria-hidden="true" />
                  Điểm danh
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* UPGRADED ADD SESSION MODAL (CONSISTENT WITH CLASSROOM CREATION MODAL) */}
      {/* ========================================================================= */}
      <ModalDialog
        open={isAddSessionOpen}
        onClose={() => setIsAddSessionOpen(false)}
        title="Lên lịch ca học mới"
        description="Chọn lớp học, phòng học chuẩn và khung giờ theo thời khóa biểu chống trùng lịch."
        size="lg"
      >
        <form onSubmit={handleAddSession} className="space-y-4 pb-2">
          {/* SECTION 1: CHỌN LỚP HỌC & TỰ ĐỘNG ĐỒNG BỘ */}
          <div className="space-y-2 rounded-2xl border border-border bg-warm/25 p-3.5">
            <div className="space-y-1.5">
              <label
                htmlFor="ses-class"
                className="block text-xs font-semibold text-foreground"
              >
                Chọn lớp học <span className="text-destructive">*</span>
              </label>
              <select
                id="ses-class"
                value={formClassCode}
                onChange={(e) => handleClassChange(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.code}>
                    {cls.code} — {cls.name} ({cls.level})
                  </option>
                ))}
              </select>
            </div>

            {/* Class Metadata Preview & Template Schedule Chips */}
            {selectedClass && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{selectedClass.name}</span>
                  <span>·</span>
                  <Badge variant="outline" className="text-[10px]">
                    {selectedClass.level}
                  </Badge>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3 text-primary" aria-hidden="true" />
                    Sĩ số: {selectedClass.enrolled}/{selectedClass.capacity} học viên
                  </span>
                </div>

                {classScheduleChips.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-medium text-muted-foreground">
                      Lịch cố định mẫu của lớp:
                    </span>
                    {classScheduleChips.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setFormDayOfWeek(chip.dayNumber);
                          setFormStartTime(chip.startTime);
                          setFormEndTime(chip.endTime);
                          setFormSelectedSlotId(chip.slotId);
                        }}
                        className={cn(
                          "rounded-md border px-2 py-0.5 font-medium transition-colors text-[10px]",
                          formDayOfWeek === chip.dayNumber && formStartTime === chip.startTime
                            ? "border-primary bg-primary text-primary-foreground font-bold shadow-2xs"
                            : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10",
                        )}
                        title="Bấm để áp dụng nhanh ngày và khung giờ này"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 2: CHUYÊN ĐỀ BUỔI HỌC & GỢI Ý TỪ KHUNG CHƯƠNG TRÌNH */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <label
                htmlFor="ses-topic"
                className="block text-xs font-semibold text-foreground"
              >
                Chuyên đề buổi học <span className="text-destructive">*</span>
              </label>

              {/* Suggestions from curriculum weeks */}
              {selectedClass?.curriculum && selectedClass.curriculum.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <BookOpen className="size-3 text-primary" aria-hidden="true" />
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setFormTopic(e.target.value);
                    }}
                    className="h-6 max-w-[240px] truncate rounded border border-border bg-background px-2 text-[10px] text-foreground"
                    title="Chọn nhanh từ Khung chương trình của lớp"
                  >
                    <option value="">-- Gợi ý theo Lộ trình --</option>
                    {selectedClass.currentModule && (
                      <option value={selectedClass.currentModule}>
                        🎯 {selectedClass.currentModule}
                      </option>
                    )}
                    {selectedClass.curriculum.map((w) => (
                      <option key={w.weekNumber} value={`Tuần ${w.weekNumber}: ${w.title}`}>
                        Tuần {w.weekNumber}: {w.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <Input
              id="ses-topic"
              value={formTopic}
              onChange={(e) => setFormTopic(e.target.value)}
              placeholder="VD: Reading – Matching Headings & Bảng từ vựng..."
              required
            />
          </div>

          {/* SECTION 3: PHÒNG HỌC (DATA THẬT CƠ SỞ VẬT CHẤT) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="ses-room"
                className="block text-xs font-semibold text-foreground"
              >
                Phòng học <span className="text-destructive">*</span>
              </label>
              <span className="text-[11px] text-muted-foreground">
                Dữ liệu phòng học thực tế của trung tâm
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={matchedRoom || "custom"}
                onChange={(e) => {
                  if (e.target.value !== "custom") {
                    setFormRoom(e.target.value);
                  }
                }}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
              >
                {facilityRooms.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="custom">-- Nhập phòng khác tùy chỉnh --</option>
              </select>
              <Input
                id="ses-room"
                value={formRoom}
                onChange={(e) => setFormRoom(e.target.value)}
                placeholder="Ví dụ: Phòng 302 · Cơ sở Nguyễn Du"
                required
              />
            </div>
          </div>

          {/* SECTION 4: THỜI KHÓA BIỂU & BỘ CHỌN KHUNG GIỜ THÔNG MINH */}
          <div className="space-y-3 rounded-2xl border border-primary/20 bg-card p-3.5 shadow-2xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" aria-hidden="true" />
                <h3 className="font-heading text-xs font-bold text-foreground">
                  Chọn Ngày & Khung giờ dạy (Chống trùng lịch)
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
              </div>
            </div>

            {/* Custom Slot Creator Panel (Same rule as classes page) */}
            {isAddingCustomSlot && (
              <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3 animate-in fade-in-50 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                    <h4 className="font-heading font-bold text-foreground">
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
                      className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10px] transition-colors hover:border-primary hover:text-primary cursor-pointer"
                    >
                      {chip.s} – {chip.e}
                    </button>
                  ))}
                </div>

                {/* Live validation feedback */}
                {slotValidation && (
                  <div
                    className={cn(
                      "flex items-start gap-2 rounded-lg p-2 text-xs",
                      slotValidation.isValid
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                        : "border border-destructive/30 bg-destructive/10 text-destructive",
                    )}
                  >
                    {slotValidation.isValid ? (
                      <>
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                        <div>
                          <p className="font-semibold">
                            Hợp lệ: Khung giờ {slotValidation.normalizedStart} – {slotValidation.normalizedEnd} (
                            {Math.floor((slotValidation.durationMinutes || 0) / 60)}h{" "}
                            {(slotValidation.durationMinutes || 0) % 60}p)
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

            {/* ACTIVE SELECTION PREVIEW BANNER */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
                  ✓
                </div>
                <div>
                  <span className="font-semibold text-foreground">Ca học đang chọn: </span>
                  <span className="font-bold text-primary">
                    {DAYS_OF_WEEK.find((d) => d.day === formDayOfWeek)?.label} ({DAYS_OF_WEEK.find((d) => d.day === formDayOfWeek)?.date}/2026) · {formStartTime || "--:--"} – {formEndTime || "--:--"}
                  </span>
                </div>
              </div>
              <span className="font-mono text-[11px] font-semibold text-primary">
                Thời lượng: {durationText}
              </span>
            </div>

            {/* TIMETABLE MINI MATRIX: 7 DAYS x TIME SLOTS */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-foreground">
                  Thời khóa biểu tuần trực quan (Bấm 1 chạm vào ô để chọn ngày & ca dạy)
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Bấm ô trống để chọn ngay
                </span>
              </div>
              <div className="max-h-[260px] overflow-x-auto overflow-y-auto rounded-xl border border-border">
                <table className="w-full min-w-[580px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="w-28 p-1.5 text-center font-semibold text-muted-foreground text-[11px]">
                        Khung giờ
                      </th>
                      {DAYS_OF_WEEK.map((day) => (
                        <th
                          key={day.day}
                          className="p-1.5 text-center font-bold text-foreground text-[11px]"
                        >
                          <div>{day.short}</div>
                          <div className="text-[9px] font-normal text-muted-foreground">
                            {day.date}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timeSlots.map((slot) => (
                      <tr
                        key={slot.id}
                        className="border-b border-border/60 last:border-0 hover:bg-muted/10"
                      >
                        <td className="border-r border-border/60 bg-muted/20 p-1.5 text-center whitespace-nowrap font-mono text-[10px] font-semibold text-foreground">
                          <div className="flex items-center justify-center gap-1">
                            <span>
                              {slot.startTime}–{slot.endTime}
                            </span>
                            {slot.isCustom && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteSlot(slot.id, e)}
                                title="Xóa khung giờ tùy chỉnh này"
                                className="text-muted-foreground hover:text-destructive cursor-pointer"
                              >
                                <Trash2 className="size-3" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                        {DAYS_OF_WEEK.map((day) => {
                          const occSession = sessions.find(
                            (s) =>
                              s.dayOfWeek === day.day &&
                              isTimeOverlapping(s.startTime, s.endTime, slot.startTime, slot.endTime),
                          );
                          const isSelected =
                            formDayOfWeek === day.day &&
                            formStartTime === slot.startTime &&
                            formEndTime === slot.endTime;

                          return (
                            <td
                              key={day.day}
                              className="border-r border-border/40 p-1 text-center last:border-0"
                            >
                              {occSession ? (
                                <div
                                  title={`Đã có ca của lớp ${occSession.classCode} (${occSession.className}) tại ${occSession.room}`}
                                  className="flex flex-col items-center justify-center rounded border border-destructive/25 bg-destructive/10 p-1 text-center"
                                >
                                  <div className="flex items-center gap-0.5 font-mono text-[9px] font-bold text-destructive">
                                    <Lock className="size-2" aria-hidden="true" />
                                    <span>{occSession.classCode}</span>
                                  </div>
                                  <span className="max-w-[55px] truncate text-[8px] text-destructive/80">
                                    {occSession.room.split("·")[0].trim()}
                                  </span>
                                </div>
                              ) : isSelected ? (
                                <div className="flex w-full items-center justify-center rounded border border-primary bg-primary p-1 text-center font-bold text-primary-foreground shadow-2xs text-[10px]">
                                  <span>✓ Đang chọn</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormDayOfWeek(day.day);
                                    setFormStartTime(slot.startTime);
                                    setFormEndTime(slot.endTime);
                                    setFormSelectedSlotId(slot.id);
                                  }}
                                  className="w-full rounded border border-border/70 bg-background p-1 text-center text-[10px] text-muted-foreground hover:border-primary/60 hover:bg-primary/5 hover:text-primary transition-colors cursor-pointer"
                                >
                                  + Chọn
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
            </div>
          </div>

          {/* SECTION 5: REAL-TIME CONFLICT ALERT BANNER */}
          {liveConflict ? (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3 text-xs animate-in fade-in-50",
                liveConflict.type === "room"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : liveConflict.type === "class"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    : "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="font-semibold">
                  {liveConflict.type === "room"
                    ? "Cảnh báo trùng phòng học!"
                    : liveConflict.type === "class"
                      ? "Cảnh báo trùng lịch lớp!"
                      : "Lưu ý khung giờ!"}
                </p>
                <p className="text-[11px] leading-relaxed">{liveConflict.message}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in-50">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>
                Khung giờ <strong>{formStartTime} – {formEndTime}</strong> ({DAYS_OF_WEEK.find((d) => d.day === formDayOfWeek)?.label}) tại{" "}
                <strong>{formRoom.split("·")[0].trim()}</strong> hoàn toàn khả dụng (0 xung đột).
              </span>
            </div>
          )}

          {/* SECTION 6: FOOTER CONTROLS */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddSessionOpen(false)}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || liveConflict?.type === "room"}
              className="gap-1.5"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {isSubmitting ? "Đang lưu..." : "Lưu ca học"}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
