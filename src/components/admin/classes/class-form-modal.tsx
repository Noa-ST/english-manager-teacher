"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import {
  DAYS_OF_WEEK,
  STANDARD_ROOMS,
  STANDARD_TIME_SLOTS,
  type ClassroomGroup,
  type CurriculumSkillFocus,
  type CurriculumTemplate,
  type CurriculumWeek,
  type TimeSlotDef,
} from "@/services/classroom-data";
import {
  addDaysToIsoDate,
  generateWeeklyScheduledDates,
  parseModuleWeekRange,
} from "@/services/classroom-helpers";
import {
  checkCanDeleteTimeSlot,
  formatSlotsToScheduleString,
  getOccupiedSlotsMap,
  loadCustomSlots,
  parseScheduleStringToSlots,
  saveCustomSlots,
  validateNewTimeSlot,
  type SelectedSlot,
} from "@/services/schedule-helper";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface ClassFormModalProps {
  open: boolean;
  editingClass: ClassroomGroup | null;
  cloningFromClass: ClassroomGroup | null;
  classes: ClassroomGroup[];
  templates: CurriculumTemplate[];
  onClose: () => void;
  onSaved: (cls: ClassroomGroup, mode: "create" | "edit" | "clone") => void;
}

function buildInitialState(
  editingClass: ClassroomGroup | null,
  cloningFromClass: ClassroomGroup | null,
  classes: ClassroomGroup[],
  activeSlots: TimeSlotDef[],
  templates: CurriculumTemplate[],
) {
  const source = editingClass ?? cloningFromClass;
  if (editingClass) {
    const total =
      editingClass.totalWeeks ??
      parseModuleWeekRange(editingClass.currentModule)?.total ??
      12;
    const current =
      editingClass.currentWeekIndex ??
      parseModuleWeekRange(editingClass.currentModule)?.current ??
      1;
    const curriculum: CurriculumWeek[] =
      editingClass.curriculum && editingClass.curriculum.length > 0
        ? structuredClone(editingClass.curriculum)
        : Array.from({ length: total }, (_, i) => ({
            weekNumber: i + 1,
            title: i + 1 === current ? editingClass.currentModule : `Học phần tuần ${i + 1}`,
          }));
    return {
      code: editingClass.code,
      name: editingClass.name,
      status: editingClass.status === "archived" ? ("active" as const) : editingClass.status,
      level: editingClass.level,
      targetBand: editingClass.targetBand,
      scheduleSummary: editingClass.scheduleSummary,
      room: editingClass.room,
      capacity: editingClass.capacity,
      tuitionDueDate: editingClass.tuitionDueDate || "2026-11-20",
      startDate: editingClass.startDate || "2026-11-20",
      expectedEndDate: editingClass.expectedEndDate || "",
      selectedSlots: parseScheduleStringToSlots(editingClass.scheduleSummary, activeSlots),
      totalWeeks: total,
      currentWeekIndex: current,
      presetId: "custom",
      curriculum,
      copyMaterials: true,
    };
  }

  if (cloningFromClass) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const total = cloningFromClass.totalWeeks ?? cloningFromClass.curriculum?.length ?? 12;
    return {
      code: `${cloningFromClass.code}-K2`,
      name: `${cloningFromClass.name} (Khóa mới)`,
      status: "upcoming" as ClassroomGroup["status"],
      level: cloningFromClass.level,
      targetBand: cloningFromClass.targetBand,
      scheduleSummary: "",
      room: cloningFromClass.room,
      capacity: cloningFromClass.capacity,
      tuitionDueDate: addDaysToIsoDate(todayIso, 14),
      startDate: todayIso,
      expectedEndDate: addDaysToIsoDate(todayIso, Math.max(0, (total - 1) * 7)),
      selectedSlots: [] as SelectedSlot[],
      totalWeeks: total,
      currentWeekIndex: 1,
      presetId: "custom",
      curriculum: structuredClone(cloningFromClass.curriculum ?? []),
      copyMaterials: true,
    };
  }

  const preset = templates[0];
  const defaultTotalWeeks = preset?.totalWeeks ?? 12;
  const defaultCurriculum: CurriculumWeek[] = preset
    ? structuredClone(preset.curriculum)
    : Array.from({ length: defaultTotalWeeks }, (_, i) => ({
        weekNumber: i + 1,
        title: `Học phần tuần ${i + 1}`,
      }));
  const todayIso = new Date().toISOString().slice(0, 10);
  let nextNum = classes.length + 1;
  let candidateCode = `CL-${String(nextNum).padStart(2, "0")}`;
  while (classes.some((c) => c.code.toUpperCase() === candidateCode)) {
    nextNum += 1;
    candidateCode = `CL-${String(nextNum).padStart(2, "0")}`;
  }

  return {
    code: candidateCode,
    name: "",
    status: "active" as ClassroomGroup["status"],
    level: source?.level ?? preset?.level ?? "CEFR B2",
    targetBand: preset?.targetBand ?? "IELTS 6.5–7.5+",
    scheduleSummary: "",
    room: STANDARD_ROOMS[0],
    capacity: 15,
    tuitionDueDate: "2026-11-25",
    startDate: todayIso,
    expectedEndDate: addDaysToIsoDate(todayIso, Math.max(0, (defaultTotalWeeks - 1) * 7)),
    selectedSlots: [] as SelectedSlot[],
    totalWeeks: defaultTotalWeeks,
    currentWeekIndex: 1,
    presetId: preset?.id ?? "custom",
    curriculum: defaultCurriculum,
    copyMaterials: true,
  };
}

function ClassFormModalInner({
  editingClass,
  cloningFromClass,
  classes,
  templates,
  onClose,
  onSaved,
}: Omit<ClassFormModalProps, "open">) {
  const { toast } = useToast();
  const [timeSlots, setTimeSlots] = React.useState<TimeSlotDef[]>(() => loadCustomSlots());

  const initial = React.useMemo(
    () =>
      buildInitialState(
        editingClass,
        cloningFromClass,
        classes,
        loadCustomSlots(),
        templates,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [formCode, setFormCode] = React.useState(initial.code);
  const [formName, setFormName] = React.useState(initial.name);
  const [formStatus, setFormStatus] = React.useState<ClassroomGroup["status"]>(initial.status);
  const [formLevel, setFormLevel] = React.useState(initial.level);
  const [formTargetBand, setFormTargetBand] = React.useState(initial.targetBand);
  const [formSchedule, setFormSchedule] = React.useState(initial.scheduleSummary);
  const [formRoom, setFormRoom] = React.useState(initial.room);
  const [formCapacity, setFormCapacity] = React.useState(initial.capacity);
  const [formTuitionDueDate, setFormTuitionDueDate] = React.useState(initial.tuitionDueDate);
  const [formStartDate, setFormStartDate] = React.useState(initial.startDate);
  const [formExpectedEndDate, setFormExpectedEndDate] = React.useState(initial.expectedEndDate);
  const [copyMaterials, setCopyMaterials] = React.useState(initial.copyMaterials);

  const [formSelectedSlots, setFormSelectedSlots] = React.useState<SelectedSlot[]>(
    initial.selectedSlots,
  );
  const [isAddingCustomSlot, setIsAddingCustomSlot] = React.useState(false);
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");

  const [formTotalWeeks, setFormTotalWeeks] = React.useState(initial.totalWeeks);
  const [formCurrentWeekIndex, setFormCurrentWeekIndex] = React.useState(
    initial.currentWeekIndex,
  );
  const [formPresetId, setFormPresetId] = React.useState(initial.presetId);
  const [formCurriculum, setFormCurriculum] = React.useState<CurriculumWeek[]>(
    initial.curriculum,
  );
  const [isRoadmapExpanded, setIsRoadmapExpanded] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const normalizedCode = formCode.trim().toUpperCase();
  const isDuplicateCode = React.useMemo(() => {
    if (!normalizedCode) return false;
    return classes.some(
      (c) =>
        c.id !== editingClass?.id &&
        c.status !== "archived" &&
        c.code.trim().toUpperCase() === normalizedCode,
    );
  }, [classes, editingClass, normalizedCode]);

  const occupiedSlotsMap = React.useMemo(
    () => getOccupiedSlotsMap(classes, editingClass?.id, timeSlots),
    [classes, editingClass, timeSlots],
  );

  const slotValidation = React.useMemo(() => {
    if (!customStart.trim() && !customEnd.trim()) return null;
    return validateNewTimeSlot(customStart, customEnd, timeSlots);
  }, [customStart, customEnd, timeSlots]);

  const slotInUseMap = React.useMemo(() => {
    const map = new Map<string, { canDelete: boolean; reason?: string }>();
    for (const s of timeSlots) {
      const res = checkCanDeleteTimeSlot(s.id, classes, timeSlots);
      map.set(s.id, { canDelete: res.canDelete, reason: res.reason });
    }
    return map;
  }, [timeSlots, classes]);

  const handleToggleSlot = (dayNumber: number, slotId: string) => {
    const key = `${dayNumber}-${slotId}`;
    if (occupiedSlotsMap.has(key)) {
      const occ = occupiedSlotsMap.get(key)!;
      toast({
        title: "Khung giờ này đã có lớp học!",
        description: `Lớp ${occ.classCode} (${occ.className}) đã học vào giờ này tại ${occ.room}.`,
        variant: "warning",
      });
      return;
    }

    setFormSelectedSlots((prev) => {
      const exists = prev.some((s) => s.dayNumber === dayNumber && s.slotId === slotId);
      const updated = exists
        ? prev.filter((s) => !(s.dayNumber === dayNumber && s.slotId === slotId))
        : [...prev, { dayNumber, slotId }];
      setFormSchedule(formatSlotsToScheduleString(updated, timeSlots));
      return updated;
    });
  };

  const handleAddCustomSlot = () => {
    const val = validateNewTimeSlot(customStart, customEnd, timeSlots);
    if (!val.isValid) {
      toast({
        title: "Không thể tạo khung giờ này",
        description: val.errorMessage,
        variant: "error",
      });
      return;
    }
    const newSlot: TimeSlotDef = {
      id: `slot-${Date.now()}`,
      label: `${val.normalizedStart!} – ${val.normalizedEnd!}`,
      startTime: val.normalizedStart!,
      endTime: val.normalizedEnd!,
      period: "morning",
    };
    const saved = saveCustomSlots([...timeSlots, newSlot]);
    setTimeSlots(saved);
    setCustomStart("");
    setCustomEnd("");
    setIsAddingCustomSlot(false);
  };

  const handleDeleteSlot = (slotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const check = checkCanDeleteTimeSlot(slotId, classes, timeSlots);
    if (!check.canDelete) {
      toast({ title: "Không thể xóa khung giờ này", description: check.reason, variant: "warning" });
      return;
    }
    const updated = saveCustomSlots(timeSlots.filter((s) => s.id !== slotId));
    setTimeSlots(updated);
    setFormSelectedSlots((prev) => {
      const next = prev.filter((s) => s.slotId !== slotId);
      setFormSchedule(formatSlotsToScheduleString(next, updated));
      return next;
    });
  };

  const handleSelectTemplate = (tplId: string) => {
    setFormPresetId(tplId);
    if (tplId === "custom") return;
    const tpl = templates.find((p) => p.id === tplId);
    if (tpl) {
      setFormTotalWeeks(tpl.totalWeeks);
      setFormCurriculum(structuredClone(tpl.curriculum));
      if (!editingClass && !cloningFromClass) {
        if (!formName) setFormName(tpl.name.replace(/\s*\(\d+\s*tuần\)/, ""));
        setFormLevel(tpl.level);
        setFormTargetBand(tpl.targetBand);
      }
      if (formStartDate) {
        setFormExpectedEndDate(
          addDaysToIsoDate(formStartDate, Math.max(0, (tpl.totalWeeks - 1) * 7)),
        );
      }
      setFormCurrentWeekIndex(1);
    }
  };

  const handleTotalWeeksChange = (newTotal: number) => {
    const valid = Math.max(1, Math.min(52, newTotal));
    setFormTotalWeeks(valid);
    setFormCurriculum((prev) => {
      if (prev.length < valid) {
        const added = Array.from({ length: valid - prev.length }, (_, i) => ({
          weekNumber: prev.length + i + 1,
          title: `Học phần tuần ${prev.length + i + 1}`,
        }));
        return [...prev, ...added];
      }
      return prev.slice(0, valid);
    });
    if (formCurrentWeekIndex > valid) setFormCurrentWeekIndex(valid);
    if (formStartDate) {
      setFormExpectedEndDate(addDaysToIsoDate(formStartDate, Math.max(0, (valid - 1) * 7)));
    }
  };

  const handleAutoFillScheduledDates = () => {
    if (!formStartDate) return;
    const dates = generateWeeklyScheduledDates(formStartDate, formTotalWeeks);
    setFormCurriculum((prev) =>
      prev.map((w, i) => ({ ...w, scheduledDate: dates[i] ?? w.scheduledDate })),
    );
    setFormExpectedEndDate(
      dates[dates.length - 1] ?? addDaysToIsoDate(formStartDate, Math.max(0, (formTotalWeeks - 1) * 7)),
    );
    toast({ title: `Đã tính ngày học dự kiến cho ${formTotalWeeks} tuần`, variant: "success" });
  };

  const handleInsertWeekAfter = (index: number) => {
    const next = [...formCurriculum];
    next.splice(index + 1, 0, {
      weekNumber: index + 2,
      title: "Chuyên đề bổ sung / Ôn tập",
      plannedSessions: 2,
    });
    const renumbered = next.map((w, i) => ({ ...w, weekNumber: i + 1 }));
    setFormCurriculum(renumbered);
    setFormTotalWeeks(renumbered.length);
  };

  const handleRemoveWeekAt = (index: number) => {
    if (formCurriculum.length <= 1) return;
    const next = formCurriculum
      .filter((_, i) => i !== index)
      .map((w, i) => ({ ...w, weekNumber: i + 1 }));
    setFormCurriculum(next);
    setFormTotalWeeks(next.length);
    if (formCurrentWeekIndex > next.length) setFormCurrentWeekIndex(next.length);
  };

  const handleMoveWeek = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= formCurriculum.length) return;
    const next = [...formCurriculum];
    const tmp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = tmp;
    setFormCurriculum(next.map((w, i) => ({ ...w, weekNumber: i + 1 })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !normalizedCode) return;
    if (!formSchedule.trim() && formSelectedSlots.length === 0) {
      toast({
        title: "Chưa chọn lịch học",
        description: "Vui lòng chọn ít nhất 1 khung giờ học trên thời khóa biểu.",
        variant: "warning",
      });
      return;
    }

    setSubmitting(true);
    try {
      if (cloningFromClass) {
        const cloned = await apiRequest<ClassroomGroup>(
          `/api/admin/classes/${encodeURIComponent(cloningFromClass.id)}/lifecycle`,
          {
            method: "POST",
            body: JSON.stringify({
              action: "clone",
              code: normalizedCode,
              name: formName.trim(),
              startDate: formStartDate || undefined,
              scheduleSummary: formSchedule.trim(),
              room: formRoom.trim(),
              status: formStatus === "upcoming" ? "upcoming" : "active",
              copyMaterials,
              validateScheduleConflict: true,
            }),
          },
        );
        toast({
          title: "Đã nhân bản mở khóa mới",
          description: `Lớp ${cloned.code} đã sao chép toàn bộ giáo trình ${cloned.totalWeeks} tuần.`,
          variant: "success",
        });
        onSaved(cloned, "clone");
        onClose();
        return;
      }

      const currentItem = formCurriculum.find((w) => w.weekNumber === formCurrentWeekIndex);
      const currentTitle = currentItem?.title.trim() || `Học phần tuần ${formCurrentWeekIndex}`;
      const payload = {
        code: normalizedCode,
        name: formName.trim(),
        status: formStatus,
        level: formLevel.trim(),
        targetBand: formTargetBand.trim(),
        scheduleSummary: formSchedule.trim(),
        room: formRoom.trim(),
        capacity: Number(formCapacity) || 15,
        startDate: formStartDate || undefined,
        expectedEndDate: formExpectedEndDate || undefined,
        totalWeeks: Number(formTotalWeeks) || 12,
        currentWeekIndex: Number(formCurrentWeekIndex) || 1,
        currentModule: `Tuần ${formCurrentWeekIndex}/${formTotalWeeks} · ${currentTitle}`,
        curriculum: formCurriculum,
        tuitionDueDate: formTuitionDueDate,
        validateScheduleConflict: true,
      };

      if (editingClass) {
        const updated = await apiRequest<ClassroomGroup>(
          `/api/admin/classes/${encodeURIComponent(editingClass.id)}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        toast({
          title: "Đã cập nhật lớp học",
          description: `${updated.code} — ${updated.name} đã đồng bộ sang Thời khóa biểu.`,
          variant: "success",
        });
        onSaved(updated, "edit");
      } else {
        const created = await apiRequest<ClassroomGroup>("/api/admin/classes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({
          title: "Đã khởi tạo lớp học mới",
          description: `${created.code} đã đồng bộ lịch dạy và lộ trình ${created.totalWeeks} tuần.`,
          variant: "success",
        });
        onSaved(created, "create");
      }
      onClose();
    } catch (err) {
      toast({
        title: "Không thể lưu lớp học",
        description: err instanceof Error ? err.message : "Vui lòng kiểm tra lại dữ liệu.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={
        cloningFromClass
          ? `Nhân bản khóa mới từ ${cloningFromClass.code}`
          : editingClass
            ? `Chỉnh sửa lớp: ${editingClass.code}`
            : "Khởi tạo lớp học mới & Thời khóa biểu"
      }
      description="Tự động kiểm tra trùng lịch dạy ở server, đồng bộ sang Thời khóa biểu và sinh lịch tuần theo ngày khai giảng."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid gap-3.5 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="cls-code" className="block font-semibold">
              Mã lớp <span className="text-destructive">*</span>
            </label>
            <Input
              id="cls-code"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value.toUpperCase())}
              required
              className={cn("font-mono uppercase", isDuplicateCode && "border-destructive text-destructive")}
            />
            {isDuplicateCode && (
              <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                <AlertTriangle className="size-3" /> Mã lớp đã tồn tại
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="cls-status" className="block font-semibold">
              Trạng thái vận hành
            </label>
            <select
              id="cls-status"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value as ClassroomGroup["status"])}
              className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium"
            >
              <option value="upcoming">Sắp khai giảng</option>
              <option value="active">Đang vận hành</option>
              {!cloningFromClass && <option value="completed">Đã kết khóa</option>}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="cls-cap" className="block font-semibold">
              Sĩ số tối đa
            </label>
            <Input
              id="cls-cap"
              type="number"
              min={5}
              max={50}
              value={formCapacity}
              onChange={(e) => setFormCapacity(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="cls-name" className="block font-semibold">
            Tên lớp học <span className="text-destructive">*</span>
          </label>
          <Input
            id="cls-name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Ví dụ: IELTS Intensive K2 (Band 6.5–7.5+)"
            required
          />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor="cls-level" className="block font-semibold">
              Trình độ (CEFR)
            </label>
            <Input id="cls-level" value={formLevel} onChange={(e) => setFormLevel(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label htmlFor="cls-band" className="block font-semibold">
              Cam kết đầu ra
            </label>
            <Input id="cls-band" value={formTargetBand} onChange={(e) => setFormTargetBand(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label htmlFor="cls-start-date" className="block font-semibold">
              Ngày khai giảng
            </label>
            <Input
              id="cls-start-date"
              type="date"
              value={formStartDate}
              onChange={(e) => setFormStartDate(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="cls-tuition-due" className="block font-semibold">
              Hạn nộp học phí
            </label>
            <Input
              id="cls-tuition-due"
              type="date"
              value={formTuitionDueDate}
              onChange={(e) => setFormTuitionDueDate(e.target.value)}
              required
              className="font-mono text-xs"
            />
          </div>
        </div>

        {/* Phòng học */}
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={STANDARD_ROOMS.includes(formRoom) ? formRoom : "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") setFormRoom(e.target.value);
            }}
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium"
          >
            {STANDARD_ROOMS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="custom">-- Nhập phòng tùy chỉnh --</option>
          </select>
          <Input
            value={formRoom}
            onChange={(e) => setFormRoom(e.target.value)}
            placeholder="Phòng học cố định"
            required
          />
        </div>

        {/* Ma trận Thời khóa biểu */}
        <div className="space-y-3 rounded-2xl border border-primary/20 bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <span className="font-heading text-sm font-bold">
                Lịch học cố định (Chống trùng lịch dạy)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setIsAddingCustomSlot((p) => !p)}
              >
                <Plus className="size-3" />
                {isAddingCustomSlot ? "Đóng" : "Thêm ca mới"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setTimeSlots(saveCustomSlots(STANDARD_TIME_SLOTS))}
              >
                <RotateCcw className="size-3" /> Mặc định
              </Button>
              <Badge variant="outline">{formSelectedSlots.length} buổi/tuần</Badge>
            </div>
          </div>

          {isAddingCustomSlot && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Bắt đầu (VD: 07:00 hoặc 7h)"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
                <Input
                  placeholder="Kết thúc (VD: 09:00 hoặc 9h)"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </div>
              {slotValidation && !slotValidation.isValid && (
                <p className="text-[11px] font-medium text-destructive">
                  {slotValidation.errorMessage}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="xs"
                  disabled={!slotValidation?.isValid}
                  onClick={handleAddCustomSlot}
                >
                  Thêm khung giờ
                </Button>
              </div>
            </div>
          )}

          <div className="max-h-56 overflow-x-auto overflow-y-auto rounded-xl border border-border">
            <table className="w-full min-w-[600px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="w-28 p-2 text-center font-semibold text-muted-foreground">
                    Khung giờ
                  </th>
                  {DAYS_OF_WEEK.map((d) => (
                    <th key={d.dayNumber} className="p-1.5 text-center font-bold">
                      {d.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((slot) => (
                  <tr key={slot.id} className="border-b border-border/60 last:border-0">
                    <td className="border-r border-border/60 bg-muted/20 p-1.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-mono text-[11px] font-semibold">
                          {slot.startTime}–{slot.endTime}
                        </span>
                        {slotInUseMap.get(slot.id)?.canDelete && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSlot(slot.id, e)}
                            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    {DAYS_OF_WEEK.map((day) => {
                      const key = `${day.dayNumber}-${slot.id}`;
                      const occ = occupiedSlotsMap.get(key);
                      const selected = formSelectedSlots.some(
                        (s) => s.dayNumber === day.dayNumber && s.slotId === slot.id,
                      );
                      return (
                        <td key={day.dayNumber} className="border-r border-border/40 p-1 last:border-0">
                          {occ ? (
                            <div
                              title={`Đã có lớp ${occ.classCode}`}
                              className="flex cursor-not-allowed items-center justify-center gap-1 rounded-md border border-destructive/25 bg-destructive/10 py-1 font-mono text-[10px] font-bold text-destructive"
                            >
                              <Lock className="size-2.5" />
                              {occ.classCode}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleSlot(day.dayNumber, slot.id)}
                              className={`flex w-full items-center justify-center gap-1 rounded-md border py-1 text-[11px] font-medium transition-colors ${
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary"
                              }`}
                            >
                              {selected ? (
                                <>
                                  <Check className="size-3" /> Chọn
                                </>
                              ) : (
                                "+"
                              )}
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

          <p className="text-[11px] text-primary font-medium">
            Lịch học: {formSchedule || "Chưa chọn ca học nào trên bảng trên"}
          </p>
        </div>

        {/* Clone options OR Curriculum Setup */}
        {cloningFromClass ? (
          <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3.5">
            <p className="font-semibold text-primary">
              Giáo trình kế thừa: {cloningFromClass.totalWeeks ?? formCurriculum.length} tuần từ lớp {cloningFromClass.code}
            </p>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={copyMaterials}
                onChange={(e) => setCopyMaterials(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              <span>Sao chép toàn bộ tài liệu đính kèm &amp; BTVN từng tuần sang khóa mới</span>
            </label>
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <span className="font-heading text-sm font-bold">
                  Khung chương trình &amp; Giáo trình mẫu
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleAutoFillScheduledDates}
                disabled={!formStartDate}
              >
                Tính ngày học dự kiến theo Khai giảng
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="block font-semibold">Giáo trình mẫu</label>
                <select
                  value={formPresetId}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium"
                >
                  <option value="custom">-- Tùy chỉnh hiện tại --</option>
                  {templates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {"isCustom" in p && p.isCustom ? `★ ${p.name}` : p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block font-semibold">Tổng số tuần</label>
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={formTotalWeeks}
                  onChange={(e) => handleTotalWeeksChange(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="block font-semibold">Tuần hiện tại</label>
                <select
                  value={formCurrentWeekIndex}
                  onChange={(e) => setFormCurrentWeekIndex(Number(e.target.value))}
                  className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium"
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

            <div>
              <button
                type="button"
                onClick={() => setIsRoadmapExpanded((p) => !p)}
                className="flex items-center gap-1.5 font-semibold text-primary hover:underline"
              >
                {isRoadmapExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {isRoadmapExpanded
                  ? "Thu gọn danh sách tuần"
                  : `Biên tập chi tiết ${formCurriculum.length} tuần (Chèn/Xóa/Đổi thứ tự/Cột mốc thi)`}
              </button>

              {isRoadmapExpanded && (
                <div className="mt-2.5 max-h-60 space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-2.5">
                  {formCurriculum.map((week, idx) => (
                    <div
                      key={`${week.weekNumber}-${idx}`}
                      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-card p-1.5"
                    >
                      <span className="w-12 shrink-0 font-mono text-[11px] font-bold text-muted-foreground">
                        T{week.weekNumber}
                      </span>
                      <Input
                        value={week.title}
                        onChange={(e) =>
                          setFormCurriculum((prev) =>
                            prev.map((w, i) => (i === idx ? { ...w, title: e.target.value } : w)),
                          )
                        }
                        className="h-7 min-w-44 flex-1 text-xs"
                      />
                      <select
                        value={week.focusSkill ?? ""}
                        onChange={(e) =>
                          setFormCurriculum((prev) =>
                            prev.map((w, i) =>
                              i === idx
                                ? {
                                    ...w,
                                    focusSkill: (e.target.value || undefined) as
                                      | CurriculumSkillFocus
                                      | undefined,
                                  }
                                : w,
                            ),
                          )
                        }
                        className="h-7 rounded border border-input bg-background px-1.5 text-[11px]"
                      >
                        <option value="">KN chung</option>
                        <option value="Listening">Listening</option>
                        <option value="Reading">Reading</option>
                        <option value="Writing">Writing</option>
                        <option value="Speaking">Speaking</option>
                        <option value="Grammar-Vocab">Grammar/Vocab</option>
                        <option value="Mixed">4 Kỹ năng</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setFormCurriculum((prev) =>
                            prev.map((w, i) =>
                              i === idx
                                ? {
                                    ...w,
                                    isAssessmentMilestone: !w.isAssessmentMilestone,
                                    assessmentTitle:
                                      !w.isAssessmentMilestone && !w.assessmentTitle
                                        ? `Kiểm tra Tuần ${w.weekNumber}: ${w.title}`
                                        : w.assessmentTitle,
                                  }
                                : w,
                            ),
                          )
                        }
                        title="Đánh dấu tuần kiểm tra định kỳ"
                        className={`rounded border px-1.5 py-1 text-[10px] font-semibold ${
                          week.isAssessmentMilestone
                            ? "border-amber-400 bg-amber-500/15 text-amber-900"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        <Award className="inline size-3" /> Thi
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveWeek(idx, -1)}
                        disabled={idx === 0}
                        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                        title="Đưa lên"
                      >
                        <ArrowUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveWeek(idx, 1)}
                        disabled={idx === formCurriculum.length - 1}
                        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                        title="Đưa xuống"
                      >
                        <ArrowDown className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertWeekAfter(idx)}
                        className="rounded p-1 text-primary hover:bg-primary/10"
                        title="Chèn tuần mới ngay sau"
                      >
                        <Plus className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveWeekAt(idx)}
                        disabled={formCurriculum.length <= 1}
                        className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                        title="Xóa tuần"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" disabled={isDuplicateCode || submitting}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {submitting
              ? "Đang lưu..."
              : cloningFromClass
                ? "Tạo khóa mới"
                : editingClass
                  ? "Cập nhật lớp"
                  : "Tạo lớp học"}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}

export function ClassFormModal({ open, ...props }: ClassFormModalProps) {
  if (!open) return null;
  const key = props.cloningFromClass
    ? `clone-${props.cloningFromClass.id}`
    : props.editingClass
      ? `edit-${props.editingClass.id}`
      : "new-class";
  return <ClassFormModalInner key={key} {...props} />;
}
