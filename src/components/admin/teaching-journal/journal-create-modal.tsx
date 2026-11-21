"use client";

import * as React from "react";
import { AlertCircle, BookOpen, Clock, CopyCheck } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { useTodayIso } from "@/lib/use-today-iso";
import type {
  ClassSessionRecord,
  ClassroomGroup,
  WeeklyClassSession,
} from "@/services/classroom-data";
import {
  buildClassWeekOptions,
  getClassAvailableSlots,
  getTargetDateForDayOfWeek,
} from "@/services/teaching-journal-helpers";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

interface JournalCreateModalProps {
  open: boolean;
  classrooms: ClassroomGroup[];
  weeklySessions: WeeklyClassSession[];
  initialClassId?: string;
  initialDate?: string;
  initialTopic?: string;
  onClose: () => void;
  onCreated: (created: ClassSessionRecord) => void;
}

function JournalCreateModalInner({
  classrooms,
  weeklySessions,
  initialClassId,
  initialDate,
  initialTopic,
  onClose,
  onCreated,
}: Omit<JournalCreateModalProps, "open">) {
  const { toast } = useToast();
  const activeClassrooms = React.useMemo(
    () =>
      classrooms.filter(
        (c) => c.status !== "archived" && c.status !== "completed",
      ),
    [classrooms],
  );

  const defaultClass = React.useMemo(
    () =>
      activeClassrooms.find((c) => c.id === initialClassId) ??
      activeClassrooms[0] ??
      null,
    [activeClassrooms, initialClassId],
  );

  const defaultSlots = React.useMemo(
    () => getClassAvailableSlots(defaultClass, weeklySessions),
    [defaultClass, weeklySessions],
  );

  const defaultWeeks = React.useMemo(
    () => buildClassWeekOptions(defaultClass),
    [defaultClass],
  );
  const initialWeekNum = defaultClass?.currentWeekIndex ?? 1;
  const matchedInitialWeek = defaultWeeks.find(
    (w) => w.weekNumber === initialWeekNum,
  );

  const todayIso = useTodayIso();
  const [classId, setClassId] = React.useState(defaultClass?.id ?? "");
  const [dateOverride, setDate] = React.useState<string | null>(initialDate || null);
  const date = dateOverride ?? todayIso;
  const [startTime, setStartTime] = React.useState(
    defaultSlots[0]?.startTime ?? "18:00",
  );
  const [endTime, setEndTime] = React.useState(
    defaultSlots[0]?.endTime ?? "20:00",
  );
  const [room, setRoom] = React.useState(
    defaultSlots[0]?.room ?? defaultClass?.room ?? "",
  );
  const [weekNumber, setWeekNumber] = React.useState<number>(initialWeekNum);
  const [topic, setTopic] = React.useState(
    initialTopic || matchedInitialWeek?.title || "",
  );
  const [objectives, setObjectives] = React.useState(
    matchedInitialWeek?.objectives ?? "",
  );
  const [copyFromPrevious, setCopyFromPrevious] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const selectedClassroom = React.useMemo(
    () => activeClassrooms.find((c) => c.id === classId) ?? null,
    [activeClassrooms, classId],
  );

  const classSlots = React.useMemo(
    () => getClassAvailableSlots(selectedClassroom, weeklySessions),
    [selectedClassroom, weeklySessions],
  );

  const classWeeks = React.useMemo(
    () => buildClassWeekOptions(selectedClassroom),
    [selectedClassroom],
  );

  const handleSelectClass = (nextClassId: string) => {
    setClassId(nextClassId);
    setErrorMsg(null);
    const cls = activeClassrooms.find((c) => c.id === nextClassId) ?? null;
    const slots = getClassAvailableSlots(cls, weeklySessions);
    const weeks = buildClassWeekOptions(cls);
    const nextWeekNum = cls?.currentWeekIndex ?? 1;
    const wk = weeks.find((w) => w.weekNumber === nextWeekNum);

    if (slots[0]) {
      setStartTime(slots[0].startTime);
      setEndTime(slots[0].endTime);
      setRoom(slots[0].room);
    } else if (cls) {
      setRoom(cls.room);
    }
    setWeekNumber(nextWeekNum);
    setTopic(wk?.title ?? cls?.currentModule ?? "");
    setObjectives(wk?.objectives ?? "");
  };

  const handleSelectWeek = (nextWeekNum: number) => {
    setWeekNumber(nextWeekNum);
    const wk = classWeeks.find((w) => w.weekNumber === nextWeekNum);
    if (wk) {
      setTopic(wk.title);
      if (wk.objectives) setObjectives(wk.objectives);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) {
      setErrorMsg("Vui lòng chọn một lớp học đang hoạt động.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const created = await apiRequest<ClassSessionRecord>(
        "/api/admin/teaching-journal",
        {
          method: "POST",
          body: JSON.stringify({
            classId,
            date,
            startTime,
            endTime,
            room,
            weekNumber,
            topic: topic.trim() || undefined,
            objectives: objectives.trim() || undefined,
            copyFromPreviousSession: copyFromPrevious,
          }),
        },
      );
      toast({
        variant: "success",
        title: "Đã khởi tạo nhật ký buổi học",
        description: `${created.classCode} · ${created.topic}`,
      });
      onCreated(created);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể tạo nhật ký buổi học.";
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {activeClassrooms.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Hiện chưa có lớp học nào ở trạng thái Đang học hoặc Sắp khai giảng để
          lập nhật ký mới.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="journal-create-class">Lớp học *</Label>
              <select
                id="journal-create-class"
                value={classId}
                onChange={(e) => handleSelectClass(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {activeClassrooms.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.code} — {cls.name} ({cls.enrolled} HV)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="journal-create-week">Tuần khung chương trình</Label>
              <select
                id="journal-create-week"
                value={weekNumber}
                onChange={(e) => handleSelectWeek(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {classWeeks.map((wk) => (
                  <option key={wk.weekNumber} value={wk.weekNumber}>
                    {wk.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {classSlots.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="size-3.5" aria-hidden="true" />
                <span>Chọn nhanh khung giờ cố định trong tuần của lớp:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {classSlots.map((slot) => {
                  const isActive =
                    startTime === slot.startTime && endTime === slot.endTime;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => {
                        setStartTime(slot.startTime);
                        setEndTime(slot.endTime);
                        setRoom(slot.room);
                        setDate(getTargetDateForDayOfWeek(slot.dayNumber));
                      }}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {slot.dayLabel} · {slot.startTime}–{slot.endTime}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="journal-create-date">Ngày học *</Label>
              <Input
                id="journal-create-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="journal-create-start">Giờ bắt đầu</Label>
              <Input
                id="journal-create-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="journal-create-end">Giờ kết thúc</Label>
              <Input
                id="journal-create-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="journal-create-room">Phòng học</Label>
            <Input
              id="journal-create-room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Ví dụ: Phòng 302 · Cơ sở Nguyễn Du"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="journal-create-topic" className="flex items-center gap-1.5">
              <BookOpen className="size-3.5 text-primary" aria-hidden="true" />
              Chuyên đề buổi học
            </Label>
            <Input
              id="journal-create-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Tự động điền theo tuần chương trình hoặc nhập chuyên đề riêng..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="journal-create-objectives">Mục tiêu buổi học</Label>
            <textarea
              id="journal-create-objectives"
              rows={2}
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder="Kỹ năng trọng tâm, chuẩn đầu ra học viên cần đạt sau buổi học..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/25 p-3 text-sm">
            <input
              type="checkbox"
              checked={copyFromPrevious}
              onChange={(e) => setCopyFromPrevious(e.target.checked)}
              className="mt-0.5 size-4 rounded border-input accent-primary"
            />
            <div>
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <CopyCheck className="size-4 text-primary" aria-hidden="true" />
                Kế thừa kế hoạch từ buổi học trước đó của lớp
              </div>
              <p className="text-xs text-muted-foreground">
                Tự động chép Kế hoạch buổi sau, mục tiêu và BTVN liên quan để giáo viên không phải gõ lại.
              </p>
            </div>
          </label>
        </>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy bỏ
        </Button>
        <Button
          type="submit"
          disabled={submitting || activeClassrooms.length === 0}
        >
          {submitting ? "Đang tạo nhật ký..." : "Khởi tạo & Mở chi tiết"}
        </Button>
      </div>
    </form>
  );
}

export function JournalCreateModal({
  open,
  classrooms,
  weeklySessions,
  initialClassId,
  initialDate,
  initialTopic,
  onClose,
  onCreated,
}: JournalCreateModalProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Tạo nhật ký buổi học mới"
      description="Tự động đồng bộ danh sách học viên đang theo học (bỏ qua HS đang bảo lưu/nghỉ hẳn) và chuyên đề khung chương trình."
      size="lg"
    >
      {open && (
        <JournalCreateModalInner
          key={`${initialClassId ?? "default"}-${initialDate ?? "today"}-${initialTopic ?? ""}`}
          classrooms={classrooms}
          weeklySessions={weeklySessions}
          initialClassId={initialClassId}
          initialDate={initialDate}
          initialTopic={initialTopic}
          onClose={onClose}
          onCreated={onCreated}
        />
      )}
    </ModalDialog>
  );
}
