"use client";

import * as React from "react";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  STANDARD_ROOMS,
  STANDARD_TIME_SLOTS,
  type ClassroomGroup,
  type ScheduleException,
  type TimeSlotDef,
  type WeeklyClassSession,
} from "@/services/classroom-data";
import {
  addDaysIso,
  formatDisplayDateVi,
  getDayLabelVi,
  getDayOfWeekIso,
  getWeekDates,
  resolveScheduleOccurrences,
  type WeekDateSlot,
} from "@/services/schedule-calendar-helpers";
import {
  evaluateWeeklySessionConflict,
  isTimeOverlapping,
  loadCustomSlots,
  matchStandardRoom,
  normalizeRoomKey,
  parseScheduleStringToSlots,
  saveCustomSlots,
  toMinutes,
  validateNewTimeSlot,
  type SlotValidationResult,
} from "@/services/schedule-helper";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type SessionModalMode =
  | "create-recurring"
  | "edit-recurring"
  | "create-makeup";

interface SessionFormModalProps {
  open: boolean;
  onClose: () => void;
  mode: SessionModalMode;
  classes: ClassroomGroup[];
  sessions: WeeklyClassSession[];
  exceptions: ScheduleException[];
  facilityRooms: string[];
  weekDates: WeekDateSlot[];
  editingSession?: WeeklyClassSession | null;
  defaultDayOfWeek?: number;
  defaultDate?: string;
  defaultRoom?: string;
  onSaved: () => Promise<void> | void;
}

function SessionFormModalInner({
  onClose,
  mode: initialMode,
  classes,
  sessions,
  exceptions,
  facilityRooms,
  weekDates,
  editingSession,
  defaultDayOfWeek,
  defaultDate,
  defaultRoom,
  onSaved,
}: Omit<SessionFormModalProps, "open">) {
  const { toast } = useToast();

  const activeClasses = React.useMemo(
    () =>
      classes.filter((c) => c.status !== "archived" && c.status !== "completed"),
    [classes],
  );

  const [activeMode, setActiveMode] = React.useState<SessionModalMode>(initialMode);
  const [timeSlots, setTimeSlots] = React.useState<TimeSlotDef[]>(() =>
    loadCustomSlots(),
  );

  const initialClass = React.useMemo(() => {
    if (editingSession) {
      return (
        activeClasses.find((c) => c.code === editingSession.classCode) ??
        activeClasses[0]
      );
    }
    return activeClasses[0];
  }, [activeClasses, editingSession]);

  const [formClassCode, setFormClassCode] = React.useState<string>(
    () => editingSession?.classCode ?? initialClass?.code ?? "",
  );
  const [formDayOfWeek, setFormDayOfWeek] = React.useState<number>(
    () => editingSession?.dayOfWeek ?? defaultDayOfWeek ?? 6,
  );
  const [makeupDate, setMakeupDate] = React.useState<string>(
    () => defaultDate || weekDates[0]?.date || "",
  );
  const [formStartTime, setFormStartTime] = React.useState<string>(
    () => editingSession?.startTime ?? timeSlots[2]?.startTime ?? "14:30",
  );
  const [formEndTime, setFormEndTime] = React.useState<string>(
    () => editingSession?.endTime ?? timeSlots[2]?.endTime ?? "16:30",
  );
  const [formRoom, setFormRoom] = React.useState<string>(() => {
    if (editingSession?.room) {
      return matchStandardRoom(editingSession.room, facilityRooms) || editingSession.room;
    }
    if (defaultRoom) return defaultRoom;
    if (initialClass?.room) {
      return matchStandardRoom(initialClass.room, facilityRooms) || initialClass.room;
    }
    return STANDARD_ROOMS[0];
  });
  const [formTopic, setFormTopic] = React.useState<string>(
    () =>
      editingSession?.topic ??
      initialClass?.currentModule ??
      "Chuyên đề bổ trợ phát triển kỹ năng",
  );
  const [makeupReason, setMakeupReason] = React.useState<string>(
    "Buổi dạy bù bổ sung kiến thức / ôn tập kiểm tra",
  );
  const [notifyStudents, setNotifyStudents] = React.useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Custom slot creator state
  const [isAddingCustomSlot, setIsAddingCustomSlot] = React.useState(false);
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");

  const selectedClass = React.useMemo(
    () =>
      activeClasses.find((c) => c.code === formClassCode) ??
      classes.find((c) => c.code === formClassCode) ??
      activeClasses[0],
    [activeClasses, classes, formClassCode],
  );

  const matchedRoom = React.useMemo(
    () => matchStandardRoom(formRoom, facilityRooms),
    [formRoom, facilityRooms],
  );

  const classScheduleChips = React.useMemo(() => {
    if (!selectedClass?.scheduleSummary) return [];
    const parsed = parseScheduleStringToSlots(
      selectedClass.scheduleSummary,
      timeSlots,
    );
    return parsed
      .map((item) => {
        const slotObj = timeSlots.find((s) => s.id === item.slotId);
        return {
          dayNumber: item.dayNumber,
          slotId: item.slotId,
          startTime: slotObj?.startTime ?? "",
          endTime: slotObj?.endTime ?? "",
          label: `${getDayLabelVi(item.dayNumber)} (${slotObj?.startTime} – ${slotObj?.endTime})`,
        };
      })
      .filter((c) => c.startTime && c.endTime);
  }, [selectedClass, timeSlots]);

  const slotValidation = React.useMemo<SlotValidationResult | null>(() => {
    if (!customStart.trim() && !customEnd.trim()) return null;
    return validateNewTimeSlot(customStart, customEnd, timeSlots);
  }, [customStart, customEnd, timeSlots]);

  const durationText = React.useMemo(() => {
    if (!formStartTime || !formEndTime) return "";
    const diff = toMinutes(formEndTime) - toMinutes(formStartTime);
    if (diff <= 0) return "Giờ kết thúc phải sau giờ bắt đầu";
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `${h > 0 ? `${h} giờ ` : ""}${m > 0 ? `${m} phút` : ""}`.trim();
  }, [formStartTime, formEndTime]);

  // Strict conflict detector (blocks BOTH room conflicts AND teacher time overlaps)
  const liveConflict = React.useMemo(() => {
    if (!formStartTime || !formEndTime) return null;
    if (toMinutes(formStartTime) >= toMinutes(formEndTime)) return null;

    if (activeMode === "create-makeup") {
      if (!makeupDate) return null;
      const dayOccs = resolveScheduleOccurrences({
        fromDate: makeupDate,
        toDate: makeupDate,
        sessions,
        exceptions,
        classes,
      }).filter((o) => o.status !== "canceled");

      const overlap = dayOccs.find((o) =>
        isTimeOverlapping(o.startTime, o.endTime, formStartTime, formEndTime),
      );
      if (!overlap) return null;

      const sameRoom =
        normalizeRoomKey(formRoom) !== "" &&
        normalizeRoomKey(overlap.room) === normalizeRoomKey(formRoom);
      return {
        type: sameRoom ? ("room" as const) : ("teacher" as const),
        message: sameRoom
          ? `Trùng phòng học ngày ${formatDisplayDateVi(makeupDate)}: "${formRoom.split("·")[0].trim()}" đã có lớp ${overlap.classCode} (${overlap.startTime}–${overlap.endTime}).`
          : `Trùng giờ dạy giáo viên ngày ${formatDisplayDateVi(makeupDate)}: Đã có lớp ${overlap.classCode} (${overlap.startTime}–${overlap.endTime}) tại ${overlap.room.split("·")[0].trim()}.`,
      };
    }

    const evalRes = evaluateWeeklySessionConflict(
      {
        dayOfWeek: formDayOfWeek,
        startTime: formStartTime,
        endTime: formEndTime,
        room: formRoom,
        classCode: formClassCode,
      },
      sessions,
      activeMode === "edit-recurring" ? editingSession?.id : undefined,
    );
    return evalRes.hasConflict
      ? { type: evalRes.type, message: evalRes.message || "Khung giờ bị trùng lịch." }
      : null;
  }, [
    activeMode,
    makeupDate,
    formDayOfWeek,
    formStartTime,
    formEndTime,
    formRoom,
    formClassCode,
    sessions,
    exceptions,
    classes,
    editingSession?.id,
  ]);

  const effectiveMakeupDate = React.useMemo(
    () =>
      /^\d{4}-\d{2}-\d{2}$/.test(makeupDate)
        ? makeupDate
        : (weekDates[0]?.date ?? "2026-11-16"),
    [makeupDate, weekDates],
  );

  const makeupWeekDates = React.useMemo(
    () => getWeekDates(effectiveMakeupDate),
    [effectiveMakeupDate],
  );

  const makeupWeekOccurrences = React.useMemo(() => {
    if (activeMode !== "create-makeup") return [];
    return resolveScheduleOccurrences({
      fromDate: makeupWeekDates[0].date,
      toDate: makeupWeekDates[6].date,
      sessions,
      exceptions,
      classes,
    }).filter((o) => o.status !== "canceled");
  }, [activeMode, makeupWeekDates, sessions, exceptions, classes]);

  const handleClassChange = (newCode: string) => {
    setFormClassCode(newCode);
    const cls = activeClasses.find((c) => c.code === newCode);
    if (!cls) return;
    if (cls.room && !defaultRoom) {
      setFormRoom(matchStandardRoom(cls.room, facilityRooms) || cls.room);
    }
    if (cls.currentModule && activeMode !== "edit-recurring") {
      setFormTopic(cls.currentModule);
    }
  };

  const handleAddCustomSlot = () => {
    if (!slotValidation?.isValid || !slotValidation.normalizedStart || !slotValidation.normalizedEnd) {
      return;
    }
    const start = slotValidation.normalizedStart;
    const end = slotValidation.normalizedEnd;
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
    setIsAddingCustomSlot(false);
    setCustomStart("");
    setCustomEnd("");
    toast({
      title: "Đã thêm khung giờ mới",
      description: `Khung giờ ${start} – ${end} đã sẵn sàng sử dụng.`,
      variant: "success",
    });
  };

  const handleResetSlotsToDefault = () => {
    setTimeSlots(saveCustomSlots(STANDARD_TIME_SLOTS));
    toast({
      title: "Đã khôi phục khung giờ chuẩn",
      variant: "info",
    });
  };

  const handleDeleteSlot = (slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const slotDef = timeSlots.find((s) => s.id === slotId);
    if (!slotDef) return;
    const inUse = sessions.some(
      (s) => s.startTime === slotDef.startTime && s.endTime === slotDef.endTime,
    );
    if (inUse) {
      toast({
        title: "Không thể xóa khung giờ đang sử dụng",
        variant: "warning",
      });
      return;
    }
    setTimeSlots(saveCustomSlots(timeSlots.filter((s) => s.id !== slotId)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClassCode) {
      toast({ title: "Chưa chọn lớp học", variant: "error" });
      return;
    }
    if (!formTopic.trim()) {
      toast({ title: "Vui lòng nhập chuyên đề buổi học", variant: "error" });
      return;
    }
    if (toMinutes(formStartTime) >= toMinutes(formEndTime)) {
      toast({
        title: "Khung giờ không hợp lệ",
        description: "Giờ kết thúc phải sau giờ bắt đầu.",
        variant: "error",
      });
      return;
    }
    if (liveConflict) {
      toast({
        title: "Không thể lưu do trùng lịch",
        description: liveConflict.message,
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (activeMode === "create-makeup") {
        await apiRequest("/api/admin/schedule/exceptions", {
          method: "POST",
          body: JSON.stringify({
            type: "makeup",
            classId: selectedClass?.id,
            classCode: formClassCode,
            originalDate: makeupDate,
            newDate: makeupDate,
            startTime: formStartTime,
            endTime: formEndTime,
            room: formRoom.trim(),
            topic: formTopic.trim(),
            reason: makeupReason.trim() || "Buổi dạy bù bổ sung kiến thức",
            notifyStudents,
          }),
        });
        toast({
          title: "Đã lên lịch buổi dạy bù",
          description: `${getDayLabelVi(getDayOfWeekIso(makeupDate))}, ${formatDisplayDateVi(makeupDate)} (${formStartTime}–${formEndTime}) · ${formClassCode}`,
          variant: "success",
        });
      } else if (activeMode === "edit-recurring" && editingSession) {
        await apiRequest(`/api/admin/schedule/${encodeURIComponent(editingSession.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            classCode: formClassCode,
            dayOfWeek: Number(formDayOfWeek),
            startTime: formStartTime,
            endTime: formEndTime,
            room: formRoom.trim(),
            topic: formTopic.trim(),
          }),
        });
        toast({
          title: "Đã cập nhật ca học cố định",
          description: "Thời khóa biểu & lịch của lớp học đã được đồng bộ 2 chiều.",
          variant: "success",
        });
      } else {
        await apiRequest("/api/admin/schedule", {
          method: "POST",
          body: JSON.stringify({
            classCode: formClassCode,
            dayOfWeek: Number(formDayOfWeek),
            startTime: formStartTime,
            endTime: formEndTime,
            room: formRoom.trim(),
            topic: formTopic.trim(),
          }),
        });
        toast({
          title: "Đã thêm ca học cố định mới",
          description: `${getDayLabelVi(formDayOfWeek)} (${formStartTime}–${formEndTime}) · ${formClassCode}`,
          variant: "success",
        });
      }

      await onSaved();
      onClose();
    } catch (err) {
      toast({
        title: "Không thể lưu lịch học",
        description:
          err instanceof Error
            ? err.message
            : "Vui lòng kiểm tra khung giờ và phòng học.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-2">
      {/* Mode Switcher when creating new */}
      {initialMode !== "edit-recurring" && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setActiveMode("create-recurring")}
            className={cn(
              "rounded-lg py-1.5 text-xs font-semibold transition-colors cursor-pointer",
              activeMode === "create-recurring"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Ca lặp cố định hàng tuần
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("create-makeup")}
            className={cn(
              "rounded-lg py-1.5 text-xs font-semibold transition-colors cursor-pointer",
              activeMode === "create-makeup"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Buổi dạy bù / Ôn thi 1 ngày
          </button>
        </div>
      )}

      {/* Class Selector */}
      <div className="space-y-2 rounded-2xl border border-border bg-warm/25 p-3.5">
        <div className="space-y-1.5">
          <label htmlFor="ses-class" className="block text-xs font-semibold text-foreground">
            Chọn lớp học đang vận hành <span className="text-destructive">*</span>
          </label>
          <select
            id="ses-class"
            value={formClassCode}
            onChange={(e) => handleClassChange(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            {activeClasses.map((cls) => (
              <option key={cls.id} value={cls.code}>
                {cls.code} — {cls.name} ({cls.level})
              </option>
            ))}
          </select>
        </div>

        {selectedClass && (
          <div className="space-y-1.5 pt-1 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{selectedClass.name}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3 text-primary" aria-hidden="true" />
                Sĩ số: {selectedClass.enrolled}/{selectedClass.capacity} HV
              </span>
              <span>·</span>
              <span>Tuần {selectedClass.currentWeekIndex ?? 1}/{selectedClass.totalWeeks ?? 12}</span>
            </div>

            {activeMode !== "create-makeup" && classScheduleChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">Lịch hiện tại:</span>
                {classScheduleChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setFormDayOfWeek(chip.dayNumber);
                      setFormStartTime(chip.startTime);
                      setFormEndTime(chip.endTime);
                    }}
                    className="rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 cursor-pointer"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Topic & Curriculum Quick Picker */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="ses-topic" className="text-xs font-semibold text-foreground">
            Chuyên đề buổi học <span className="text-destructive">*</span>
          </label>
          {selectedClass?.curriculum && selectedClass.curriculum.length > 0 && (
            <div className="flex items-center gap-1.5">
              <BookOpen className="size-3 text-primary" aria-hidden="true" />
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) setFormTopic(e.target.value);
                }}
                className="h-6 max-w-[240px] truncate rounded border border-border bg-background px-2 text-[10px]"
              >
                <option value="">-- Chọn theo Khung chương trình --</option>
                {selectedClass.currentModule && (
                  <option value={selectedClass.currentModule}>
                    {selectedClass.currentModule}
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
          placeholder="VD: Reading – Matching Headings & Academic Vocabulary"
          required
        />
      </div>

      {/* Room Picker */}
      <div className="space-y-1.5">
        <label htmlFor="ses-room" className="block text-xs font-semibold text-foreground">
          Phòng học <span className="text-destructive">*</span>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={matchedRoom || "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") setFormRoom(e.target.value);
            }}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            {facilityRooms.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="custom">-- Nhập phòng tùy chỉnh --</option>
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

      {/* Date / Time Picker */}
      {activeMode === "create-makeup" ? (
        <div className="space-y-3 rounded-2xl border border-primary/20 bg-card p-3.5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="makeup-date" className="text-xs font-semibold text-foreground">
                Ngày dạy bù <span className="text-destructive">*</span>
              </label>
              <Input
                id="makeup-date"
                type="date"
                value={makeupDate}
                onChange={(e) => setMakeupDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="makeup-start" className="text-xs font-semibold text-foreground">
                Giờ bắt đầu
              </label>
              <Input
                id="makeup-start"
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="makeup-end" className="text-xs font-semibold text-foreground">
                Giờ kết thúc ({durationText})
              </label>
              <Input
                id="makeup-end"
                type="time"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Interactive 7-Day Visual Timetable Matrix for Makeup Date Selection */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                <span className="font-heading text-xs font-bold text-foreground">
                  Lưới khung giờ tuần ({formatDisplayDateVi(makeupWeekDates[0].date)} –{" "}
                  {formatDisplayDateVi(makeupWeekDates[6].date)})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => setMakeupDate(addDaysIso(effectiveMakeupDate, -7))}
                  title="Xem tuần trước"
                >
                  <ChevronLeft className="size-3" aria-hidden="true" />
                  Tuần trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => setMakeupDate(addDaysIso(effectiveMakeupDate, 7))}
                  title="Xem tuần sau"
                >
                  Tuần sau
                  <ChevronRight className="size-3" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setIsAddingCustomSlot((prev) => !prev)}
                  className="h-6 px-2 text-[10px]"
                >
                  <Plus className="mr-0.5 size-3" aria-hidden="true" />
                  {isAddingCustomSlot ? "Đóng" : "Khung giờ"}
                </Button>
              </div>
            </div>

            {isAddingCustomSlot && (
              <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 font-heading font-bold">
                    <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                    Tạo khung giờ mới
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setIsAddingCustomSlot(false)}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Bắt đầu (VD: 07:00 hoặc 7h30)"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Input
                    placeholder="Kết thúc (VD: 09:00 hoặc 9h30)"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                {slotValidation && !slotValidation.isValid && (
                  <p className="text-[11px] font-medium text-destructive">
                    {slotValidation.errorMessage}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="xs"
                    disabled={!slotValidation?.isValid}
                    onClick={handleAddCustomSlot}
                  >
                    Thêm khung giờ này
                  </Button>
                </div>
              </div>
            )}

            <div className="max-h-[225px] overflow-x-auto overflow-y-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="w-28 p-1.5 text-center text-[11px] font-semibold text-muted-foreground">
                      Khung giờ
                    </th>
                    {makeupWeekDates.map((day) => {
                      const isTargetDay = day.date === effectiveMakeupDate;
                      return (
                        <th
                          key={day.date}
                          className={cn(
                            "p-1.5 text-center text-[11px] font-bold",
                            isTargetDay && "bg-primary/10 text-primary",
                          )}
                        >
                          <div>{day.shortLabel}</div>
                          <div className="font-mono text-[9px] font-normal opacity-80">
                            {day.shortDate}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map((slot) => (
                    <tr key={slot.id} className="border-b border-border/60 last:border-0">
                      <td className="border-r border-border/60 bg-muted/20 p-1.5 text-center whitespace-nowrap font-mono text-[10px] font-semibold">
                        <div className="flex items-center justify-center gap-1">
                          <span>
                            {slot.startTime}–{slot.endTime}
                          </span>
                          {slot.isCustom && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSlot(slot.id, e)}
                              className="text-muted-foreground hover:text-destructive cursor-pointer"
                            >
                              <Trash2 className="size-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                      {makeupWeekDates.map((day) => {
                        const occMatch = makeupWeekOccurrences.find(
                          (o) =>
                            o.date === day.date &&
                            isTimeOverlapping(o.startTime, o.endTime, slot.startTime, slot.endTime),
                        );
                        const isSelected =
                          effectiveMakeupDate === day.date &&
                          formStartTime === slot.startTime &&
                          formEndTime === slot.endTime;

                        return (
                          <td
                            key={day.date}
                            className="border-r border-border/40 p-1 text-center last:border-0"
                          >
                            {occMatch ? (
                              <div
                                title={`Đã có ca lớp ${occMatch.classCode} (${occMatch.startTime}–${occMatch.endTime}) tại ${occMatch.room}`}
                                className="flex flex-col items-center justify-center rounded border border-destructive/25 bg-destructive/10 p-1"
                              >
                                <div className="flex items-center gap-0.5 font-mono text-[9px] font-bold text-destructive">
                                  <Lock className="size-2" aria-hidden="true" />
                                  <span>{occMatch.classCode}</span>
                                </div>
                              </div>
                            ) : isSelected ? (
                              <div className="rounded border border-primary bg-primary p-1 font-bold text-primary-foreground text-[10px]">
                                ✓ Chọn
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setMakeupDate(day.date);
                                  setFormStartTime(slot.startTime);
                                  setFormEndTime(slot.endTime);
                                }}
                                className="w-full rounded border border-border/70 bg-background p-1 text-[10px] text-muted-foreground hover:border-primary/60 hover:bg-primary/5 hover:text-primary cursor-pointer"
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

          <div className="space-y-1">
            <label htmlFor="makeup-reason" className="text-xs font-semibold text-foreground">
              Lý do / Ghi chú buổi dạy bù <span className="text-destructive">*</span>
            </label>
            <Input
              id="makeup-reason"
              value={makeupReason}
              onChange={(e) => setMakeupReason(e.target.value)}
              placeholder="VD: Bù buổi nghỉ lễ Quốc khánh / Luyện đề bổ sung"
              required
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={notifyStudents}
              onChange={(e) => setNotifyStudents(e.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            <span>Tự động đăng Thông báo lịch dạy bù lên Cổng Học sinh & Bản tin</span>
          </label>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-primary/20 bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" aria-hidden="true" />
              <h3 className="font-heading text-xs font-bold text-foreground">
                Ma trận Lịch tuần (Chặn trùng phòng & trùng giờ giáo viên)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setIsAddingCustomSlot((prev) => !prev)}
                className="h-7 text-xs"
              >
                <Plus className="mr-1 size-3" aria-hidden="true" />
                {isAddingCustomSlot ? "Đóng" : "Thêm khung giờ"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleResetSlotsToDefault}
                className="h-7 text-[11px]"
              >
                <RotateCcw className="mr-1 size-3" aria-hidden="true" />
                Mặc định
              </Button>
            </div>
          </div>

          {isAddingCustomSlot && (
            <div className="space-y-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-heading font-bold">
                  <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                  Tạo khung giờ dạy mới
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setIsAddingCustomSlot(false)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Bắt đầu (VD: 07:00 hoặc 7h30)"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
                <Input
                  placeholder="Kết thúc (VD: 09:00 hoặc 9h30)"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              {slotValidation && !slotValidation.isValid && (
                <p className="text-[11px] font-medium text-destructive">
                  {slotValidation.errorMessage}
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="xs"
                  disabled={!slotValidation?.isValid}
                  onClick={handleAddCustomSlot}
                >
                  Thêm khung giờ này
                </Button>
              </div>
            </div>
          )}

          {/* Selected Day/Time Preview & Manual Time Override */}
          <div className="grid gap-2 sm:grid-cols-3 rounded-xl border border-primary/25 bg-primary/5 p-2.5 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold">Thứ trong tuần</label>
              <select
                value={formDayOfWeek}
                onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs font-semibold"
              >
                {weekDates.map((d) => (
                  <option key={d.dayOfWeek} value={d.dayOfWeek}>
                    {d.dayLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold">Giờ bắt đầu</label>
              <Input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold">
                Giờ kết thúc ({durationText})
              </label>
              <Input
                type="time"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          <div className="max-h-[230px] overflow-x-auto overflow-y-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="w-28 p-1.5 text-center text-[11px] font-semibold text-muted-foreground">
                    Khung giờ
                  </th>
                  {weekDates.map((day) => (
                    <th key={day.dayOfWeek} className="p-1.5 text-center text-[11px] font-bold">
                      {day.shortLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((slot) => (
                  <tr key={slot.id} className="border-b border-border/60 last:border-0">
                    <td className="border-r border-border/60 bg-muted/20 p-1.5 text-center whitespace-nowrap font-mono text-[10px] font-semibold">
                      <div className="flex items-center justify-center gap-1">
                        <span>
                          {slot.startTime}–{slot.endTime}
                        </span>
                        {slot.isCustom && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSlot(slot.id, e)}
                            className="text-muted-foreground hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="size-3" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                    {weekDates.map((day) => {
                      const occSession = sessions.find(
                        (s) =>
                          s.id !== (activeMode === "edit-recurring" ? editingSession?.id : undefined) &&
                          s.dayOfWeek === day.dayOfWeek &&
                          isTimeOverlapping(s.startTime, s.endTime, slot.startTime, slot.endTime),
                      );
                      const isSelected =
                        formDayOfWeek === day.dayOfWeek &&
                        formStartTime === slot.startTime &&
                        formEndTime === slot.endTime;

                      return (
                        <td
                          key={day.dayOfWeek}
                          className="border-r border-border/40 p-1 text-center last:border-0"
                        >
                          {occSession ? (
                            <div
                              title={`Đã có ca lớp ${occSession.classCode} (${occSession.startTime}–${occSession.endTime}) tại ${occSession.room}`}
                              className="flex flex-col items-center justify-center rounded border border-destructive/25 bg-destructive/10 p-1"
                            >
                              <div className="flex items-center gap-0.5 font-mono text-[9px] font-bold text-destructive">
                                <Lock className="size-2" aria-hidden="true" />
                                <span>{occSession.classCode}</span>
                              </div>
                            </div>
                          ) : isSelected ? (
                            <div className="rounded border border-primary bg-primary p-1 font-bold text-primary-foreground text-[10px]">
                              ✓ Chọn
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setFormDayOfWeek(day.dayOfWeek);
                                setFormStartTime(slot.startTime);
                                setFormEndTime(slot.endTime);
                              }}
                              className="w-full rounded border border-border/70 bg-background p-1 text-[10px] text-muted-foreground hover:border-primary/60 hover:bg-primary/5 hover:text-primary cursor-pointer"
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
      )}

      {/* Strict Conflict Banner */}
      {liveConflict ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              {liveConflict.type === "room"
                ? "Bị chặn: Trùng phòng học!"
                : liveConflict.type === "class"
                  ? "Bị chặn: Trùng lịch lớp học!"
                  : "Bị chặn: Trùng giờ dạy của giáo viên!"}
            </p>
            <p className="mt-0.5 text-[11px]">{liveConflict.message}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            Khung giờ <strong>{formStartTime} – {formEndTime}</strong> tại{" "}
            <strong>{formRoom.split("·")[0].trim()}</strong> hoàn toàn khả dụng.
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || Boolean(liveConflict)}
          className="gap-1.5"
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {isSubmitting
            ? "Đang lưu..."
            : activeMode === "create-makeup"
              ? "Lưu buổi dạy bù"
              : activeMode === "edit-recurring"
                ? "Lưu thay đổi ca cố định"
                : "Lưu ca dạy cố định"}
        </Button>
      </div>
    </form>
  );
}

export function SessionFormModal({
  open,
  onClose,
  mode,
  editingSession,
  defaultDayOfWeek,
  defaultDate,
  defaultRoom,
  ...rest
}: SessionFormModalProps) {
  const modalTitle =
    mode === "edit-recurring"
      ? `Chỉnh sửa ca cố định (${editingSession?.classCode ?? ""})`
      : mode === "create-makeup"
        ? "Thêm buổi dạy bù / Ôn thi 1 ngày"
        : "Lên lịch ca dạy mới";

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={modalTitle}
      description="Hệ thống kiểm tra tự động và chặn trùng phòng học lẫn trùng giờ dạy của giáo viên."
      size="lg"
    >
      {open && (
        <SessionFormModalInner
          key={`${mode}-${editingSession?.id ?? "new"}-${defaultDate ?? ""}-${defaultDayOfWeek ?? ""}-${defaultRoom ?? ""}`}
          mode={mode}
          onClose={onClose}
          editingSession={editingSession}
          defaultDayOfWeek={defaultDayOfWeek}
          defaultDate={defaultDate}
          defaultRoom={defaultRoom}
          {...rest}
        />
      )}
    </ModalDialog>
  );
}
