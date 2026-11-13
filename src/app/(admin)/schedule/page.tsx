"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  LayoutGrid,
  List,
  Plus,
  ShieldCheck,
} from "lucide-react";
import {
  CLASSROOMS_DATA,
  WEEKLY_SCHEDULE_DATA,
  type WeeklyClassSession,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const DAYS_OF_WEEK = [
  { day: 1, label: "Thứ Hai", date: "09/11" },
  { day: 2, label: "Thứ Ba", date: "10/11" },
  { day: 3, label: "Thứ Tư", date: "11/11" },
  { day: 4, label: "Thứ Năm", date: "12/11" },
  { day: 5, label: "Thứ Sáu", date: "13/11" },
  { day: 6, label: "Thứ Bảy", date: "14/11" },
  { day: 7, label: "Chủ Nhật", date: "15/11" },
];

export default function AdminSchedulePage() {
  const { toast } = useToast();
  const [sessions, setSessions] = React.useState<WeeklyClassSession[]>(
    WEEKLY_SCHEDULE_DATA,
  );
  const [calendarMode, setCalendarMode] = React.useState<"week" | "month">(
    "week",
  );
  const [isAddSessionOpen, setIsAddSessionOpen] = React.useState(false);

  // Add session form state
  const [formClassCode, setFormClassCode] = React.useState(
    CLASSROOMS_DATA[0]?.code ?? "II-01",
  );
  const [formDayOfWeek, setFormDayOfWeek] = React.useState(6);
  const [formStartTime, setFormStartTime] = React.useState("14:00");
  const [formEndTime, setFormEndTime] = React.useState("16:00");
  const [formRoom, setFormRoom] = React.useState(
    "Phòng 302 · Cơ sở Nguyễn Du",
  );
  const [formTopic, setFormTopic] = React.useState(
    "Chuyên đề bổ trợ Speaking Part 2 & 3",
  );

  React.useEffect(() => {
    apiRequest<WeeklyClassSession[]>("/api/admin/schedule")
      .then(setSessions)
      .catch(() => {});
  }, []);

  // Check if any two sessions overlap on the same day and start time
  const conflictCount = React.useMemo(() => {
    let count = 0;
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        if (
          sessions[i].dayOfWeek === sessions[j].dayOfWeek &&
          sessions[i].startTime === sessions[j].startTime
        ) {
          count++;
        }
      }
    }
    return count;
  }, [sessions]);

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiRequest<WeeklyClassSession>(
        "/api/admin/schedule",
        {
          method: "POST",
          body: JSON.stringify({
            classCode: formClassCode,
            dayOfWeek: Number(formDayOfWeek),
            startTime: formStartTime,
            endTime: formEndTime,
            room: formRoom,
            topic: formTopic,
          }),
        },
      );
      setSessions((prev) => [...prev, created]);
      toast({
        title: created.hasConflict
          ? "Đã thêm ca học (Cảnh báo trùng giờ!)"
          : "Đã lên lịch ca học mới",
        description: `${created.dayLabel} (${created.startTime}–${created.endTime}) · ${created.className}`,
        variant: created.hasConflict ? "error" : "success",
      });
    } catch (err) {
      toast({
        title: "Không thể lưu ca học",
        description:
          err instanceof Error ? err.message : "Vui lòng kiểm tra giờ bắt đầu/kết thúc.",
        variant: "error",
      });
      return;
    }
    setIsAddSessionOpen(false);
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
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                calendarMode === "week"
                  ? "bg-primary text-primary-foreground"
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
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                calendarMode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="size-3.5" aria-hidden="true" />
              Tổng quan Tháng
            </button>
          </div>

          <Button size="sm" onClick={() => setIsAddSessionOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Thêm ca dạy
          </Button>
        </div>
      </div>

      {/* WEEKLY CALENDAR GRID VIEW */}
      {calendarMode === "week" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
          {DAYS_OF_WEEK.map((dayItem) => {
            const daySessions = sessions.filter(
              (s) => s.dayOfWeek === dayItem.day,
            );
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
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {daySessions.length} ca
                  </Badge>
                </div>

                <div className="mt-3 flex-1 space-y-2.5">
                  {daySessions.length === 0 ? (
                    <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border/70 p-2 text-center text-[11px] text-muted-foreground">
                      Không có ca dạy
                    </div>
                  ) : (
                    daySessions.map((ses) => (
                      <div
                        key={ses.id}
                        className={cn(
                          "rounded-xl border p-3 text-xs transition-all",
                          ses.hasConflict
                            ? "border-destructive bg-destructive/5"
                            : ses.status === "ongoing"
                              ? "border-primary/40 bg-warm/60"
                              : "border-border bg-background",
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
                            {ses.classCode}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-primary">
                            {ses.startTime}–{ses.endTime}
                          </span>
                        </div>

                        <p className="mt-2 font-heading text-xs font-bold text-foreground">
                          {ses.className}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {ses.topic}
                        </p>

                        <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2 text-[10px] text-muted-foreground">
                          <span>
                            {ses.enrolledCount}/{ses.capacity} HV
                          </span>
                          <Link
                            href="/attendance"
                            className="font-semibold text-primary hover:underline"
                          >
                            Điểm danh →
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
            {sessions.map((ses) => (
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
                  <p className="text-xs font-medium text-foreground">
                    {ses.className}
                  </p>
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

      {/* Add Session Modal */}
      <ModalDialog
        open={isAddSessionOpen}
        onClose={() => setIsAddSessionOpen(false)}
        title="Lên lịch ca học mới"
        description="Hệ thống tự động kiểm tra trùng giờ phòng học trước khi lưu."
        size="md"
      >
        <form onSubmit={handleAddSession} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="ses-class"
                className="block text-xs font-semibold text-foreground"
              >
                Chọn lớp học
              </label>
              <select
                id="ses-class"
                value={formClassCode}
                onChange={(e) => setFormClassCode(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {CLASSROOMS_DATA.map((cls) => (
                  <option key={cls.id} value={cls.code}>
                    {cls.code} — {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="ses-day"
                className="block text-xs font-semibold text-foreground"
              >
                Ngày trong tuần
              </label>
              <select
                id="ses-day"
                value={formDayOfWeek}
                onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.day} value={d.day}>
                    {d.label} ({d.date})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="ses-start"
                className="block text-xs font-semibold text-foreground"
              >
                Giờ bắt đầu
              </label>
              <Input
                id="ses-start"
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="ses-end"
                className="block text-xs font-semibold text-foreground"
              >
                Giờ kết thúc
              </label>
              <Input
                id="ses-end"
                type="time"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="ses-room"
              className="block text-xs font-semibold text-foreground"
            >
              Phòng học
            </label>
            <Input
              id="ses-room"
              value={formRoom}
              onChange={(e) => setFormRoom(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="ses-topic"
              className="block text-xs font-semibold text-foreground"
            >
              Chuyên đề buổi học
            </label>
            <Input
              id="ses-topic"
              value={formTopic}
              onChange={(e) => setFormTopic(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddSessionOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Lưu ca học
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
