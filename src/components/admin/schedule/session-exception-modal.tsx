"use client";

import * as React from "react";
import {
  AlertTriangle,
  Ban,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
} from "lucide-react";
import {
  type ClassroomGroup,
  type ResolvedScheduleOccurrence,
  type ScheduleException,
  type TimeSlotDef,
  type WeeklyClassSession,
} from "@/services/classroom-data";
import {
  addDaysIso,
  formatDisplayDateVi,
  getWeekDates,
  resolveScheduleOccurrences,
} from "@/services/schedule-calendar-helpers";
import {
  isTimeOverlapping,
  loadCustomSlots,
  matchStandardRoom,
  normalizeRoomKey,
  toMinutes,
} from "@/services/schedule-helper";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface SessionExceptionModalProps {
  open: boolean;
  onClose: () => void;
  occurrence: ResolvedScheduleOccurrence | null;
  initialMode?: "rescheduled" | "canceled";
  classes: ClassroomGroup[];
  sessions: WeeklyClassSession[];
  exceptions: ScheduleException[];
  facilityRooms: string[];
  onSaved: () => Promise<void> | void;
}

function SessionExceptionModalInner({
  onClose,
  occurrence,
  initialMode = "rescheduled",
  classes,
  sessions,
  exceptions,
  facilityRooms,
  onSaved,
}: Omit<SessionExceptionModalProps, "open"> & {
  occurrence: ResolvedScheduleOccurrence;
}) {
  const { toast } = useToast();
  const [actionType, setActionType] = React.useState<"rescheduled" | "canceled">(
    initialMode,
  );
  const [newDate, setNewDate] = React.useState<string>(occurrence.date);
  const [startTime, setStartTime] = React.useState<string>(occurrence.startTime);
  const [endTime, setEndTime] = React.useState<string>(occurrence.endTime);
  const [room, setRoom] = React.useState<string>(
    () => matchStandardRoom(occurrence.room, facilityRooms) || occurrence.room,
  );
  const [reason, setReason] = React.useState<string>("");
  const [notifyStudents, setNotifyStudents] = React.useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [timeSlots] = React.useState<TimeSlotDef[]>(() => loadCustomSlots());

  const effectiveNewDate = React.useMemo(
    () => (/^\d{4}-\d{2}-\d{2}$/.test(newDate) ? newDate : occurrence.date),
    [newDate, occurrence.date],
  );

  const rescheduleWeekDates = React.useMemo(
    () => getWeekDates(effectiveNewDate),
    [effectiveNewDate],
  );

  const rescheduleWeekOccurrences = React.useMemo(() => {
    if (actionType !== "rescheduled") return [];
    return resolveScheduleOccurrences({
      fromDate: rescheduleWeekDates[0].date,
      toDate: rescheduleWeekDates[6].date,
      sessions,
      exceptions,
      classes,
    }).filter((o) => {
      if (o.status === "canceled") return false;
      if (
        o.date === occurrence.date &&
        occurrence.recurringSessionId &&
        o.recurringSessionId === occurrence.recurringSessionId
      ) {
        return false;
      }
      return true;
    });
  }, [
    actionType,
    rescheduleWeekDates,
    sessions,
    exceptions,
    classes,
    occurrence.date,
    occurrence.recurringSessionId,
  ]);

  const liveConflict = React.useMemo(() => {
    if (actionType !== "rescheduled" || !newDate) return null;
    if (toMinutes(startTime) >= toMinutes(endTime)) return null;

    const existing = resolveScheduleOccurrences({
      fromDate: newDate,
      toDate: newDate,
      sessions,
      exceptions,
      classes,
    }).filter((o) => {
      if (o.status === "canceled") return false;
      if (
        newDate === occurrence.date &&
        occurrence.recurringSessionId &&
        o.recurringSessionId === occurrence.recurringSessionId
      ) {
        return false;
      }
      return true;
    });

    const overlap = existing.find((o) =>
      isTimeOverlapping(o.startTime, o.endTime, startTime, endTime),
    );
    if (!overlap) return null;

    const sameRoom =
      normalizeRoomKey(room) !== "" &&
      normalizeRoomKey(overlap.room) === normalizeRoomKey(room);
    return sameRoom
      ? `Trùng phòng học ngày ${formatDisplayDateVi(newDate)}: "${room.split("·")[0].trim()}" đã có lớp ${overlap.classCode} (${overlap.startTime}–${overlap.endTime}).`
      : `Trùng giờ dạy giáo viên ngày ${formatDisplayDateVi(newDate)}: Đã có lớp ${overlap.classCode} (${overlap.startTime}–${overlap.endTime}) tại ${overlap.room.split("·")[0].trim()}.`;
  }, [
    actionType,
    newDate,
    startTime,
    endTime,
    room,
    sessions,
    exceptions,
    classes,
    occurrence.date,
    occurrence.recurringSessionId,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast({
        title: "Vui lòng nhập lý do thay đổi lịch",
        variant: "error",
      });
      return;
    }
    if (actionType === "rescheduled" && liveConflict) {
      toast({
        title: "Không thể dời lịch do trùng lịch",
        description: liveConflict,
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("/api/admin/schedule/exceptions", {
        method: "POST",
        body: JSON.stringify({
          type: actionType,
          originalSessionId: occurrence.recurringSessionId,
          classId: occurrence.classId,
          classCode: occurrence.classCode,
          originalDate: occurrence.date,
          ...(actionType === "rescheduled"
            ? { newDate, startTime, endTime, room, topic: occurrence.topic }
            : {}),
          reason: reason.trim(),
          notifyStudents,
        }),
      });
      toast({
        title:
          actionType === "canceled"
            ? "Đã báo nghỉ buổi học"
            : "Đã dời lịch riêng cho buổi học",
        description: notifyStudents
          ? "Lịch lớp & thông báo trên Cổng Học sinh đã được cập nhật."
          : "Không ảnh hưởng lịch cố định các tuần khác.",
        variant: "success",
      });
      await onSaved();
      onClose();
    } catch (err) {
      toast({
        title: "Không thể lưu thay đổi",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/25 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="font-mono">
            {occurrence.classCode}
          </Badge>
          <span className="font-heading font-bold text-foreground">
            {occurrence.className}
          </span>
        </div>
        <p className="mt-1 text-muted-foreground">
          Buổi gốc: <strong>{occurrence.dayLabel}</strong>,{" "}
          <strong>{formatDisplayDateVi(occurrence.date)}</strong> ({occurrence.startTime}–
          {occurrence.endTime}) · {occurrence.room}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => setActionType("rescheduled")}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer",
            actionType === "rescheduled"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarClock className="size-3.5" aria-hidden="true" />
          Dời sang ngày / giờ khác
        </button>
        <button
          type="button"
          onClick={() => setActionType("canceled")}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer",
            actionType === "canceled"
              ? "bg-destructive text-destructive-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Ban className="size-3.5" aria-hidden="true" />
          Báo nghỉ buổi này
        </button>
      </div>

      {actionType === "rescheduled" && (
        <div className="space-y-3 rounded-2xl border border-primary/20 bg-card p-3.5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="exc-date" className="text-xs font-semibold">
                Ngày học mới
              </label>
              <Input
                id="exc-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="exc-start" className="text-xs font-semibold">
                Giờ bắt đầu
              </label>
              <Input
                id="exc-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="exc-end" className="text-xs font-semibold">
                Giờ kết thúc
              </label>
              <Input
                id="exc-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Interactive 7-Day Visual Timetable Matrix for Destination Slot */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                <span className="font-heading text-xs font-bold text-foreground">
                  Lưới lịch tuần đích ({formatDisplayDateVi(rescheduleWeekDates[0].date)} –{" "}
                  {formatDisplayDateVi(rescheduleWeekDates[6].date)})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => setNewDate(addDaysIso(effectiveNewDate, -7))}
                >
                  <ChevronLeft className="size-3" aria-hidden="true" />
                  Tuần trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => setNewDate(addDaysIso(effectiveNewDate, 7))}
                >
                  Tuần sau
                  <ChevronRight className="size-3" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="max-h-[210px] overflow-x-auto overflow-y-auto rounded-xl border border-border">
              <table className="w-full min-w-[500px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="w-24 p-1.5 text-center text-[10px] font-semibold text-muted-foreground">
                      Khung giờ
                    </th>
                    {rescheduleWeekDates.map((day) => {
                      const isTargetDay = day.date === effectiveNewDate;
                      return (
                        <th
                          key={day.date}
                          className={cn(
                            "p-1.5 text-center text-[10px] font-bold",
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
                        {slot.startTime}–{slot.endTime}
                      </td>
                      {rescheduleWeekDates.map((day) => {
                        const occMatch = rescheduleWeekOccurrences.find(
                          (o) =>
                            o.date === day.date &&
                            isTimeOverlapping(o.startTime, o.endTime, slot.startTime, slot.endTime),
                        );
                        const isSelected =
                          effectiveNewDate === day.date &&
                          startTime === slot.startTime &&
                          endTime === slot.endTime;

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
                                  setNewDate(day.date);
                                  setStartTime(slot.startTime);
                                  setEndTime(slot.endTime);
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
            <label htmlFor="exc-room" className="text-xs font-semibold">
              Phòng học mới
            </label>
            <select
              id="exc-room"
              value={matchStandardRoom(room, facilityRooms) || room}
              onChange={(e) => setRoom(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium"
            >
              {facilityRooms.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="exc-reason" className="block text-xs font-semibold">
          Lý do điều chỉnh <span className="text-destructive">*</span>
        </label>
        <Input
          id="exc-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            actionType === "canceled"
              ? "VD: Nghỉ lễ 20/11 / Giáo viên đi chấm thi..."
              : "VD: Học sinh vướng lịch thi giữa kỳ ở trường, dời sang cuối tuần..."
          }
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
        <span>Tự động đăng Thông báo lên Cổng Học sinh & Bản tin lớp</span>
      </label>

      {actionType === "rescheduled" &&
        (liveConflict ? (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{liveConflict}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>Lịch mới khả dụng (không trùng phòng & không trùng giờ giáo viên).</span>
          </div>
        ))}

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || Boolean(actionType === "rescheduled" && liveConflict)}
        >
          {isSubmitting ? "Đang lưu..." : "Xác nhận điều chỉnh"}
        </Button>
      </div>
    </form>
  );
}

export function SessionExceptionModal({
  open,
  onClose,
  occurrence,
  initialMode = "rescheduled",
  ...rest
}: SessionExceptionModalProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Điều chỉnh ngoại lệ 1 buổi học"
      description="Chỉ áp dụng cho buổi học được chọn, không làm thay đổi lịch lặp các tuần khác."
      size="md"
    >
      {open && occurrence && (
        <SessionExceptionModalInner
          key={`${occurrence.occurrenceKey}-${initialMode}`}
          occurrence={occurrence}
          initialMode={initialMode}
          onClose={onClose}
          {...rest}
        />
      )}
    </ModalDialog>
  );
}
