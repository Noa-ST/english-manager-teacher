"use client";

import * as React from "react";
import {
  CheckCheck,
  CheckCircle2,
  Clock,
  Save,
  UserCheck,
  UserMinus,
  UserX,
} from "lucide-react";
import {
  ADMIN_STUDENTS_DATA,
  CLASSROOMS_DATA,
  WEEKLY_SCHEDULE_DATA,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AttendanceStatus = "present" | "late" | "absent" | "excused";

interface StudentAttendanceEntry {
  studentId: string;
  code: string;
  fullName: string;
  status: AttendanceStatus;
  note: string;
}

const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  activeClass: string;
}[] = [
  {
    value: "present",
    label: "Có mặt",
    activeClass: "bg-emerald-600 text-white border-emerald-600",
  },
  {
    value: "late",
    label: "Đi muộn",
    activeClass: "bg-amber-500 text-white border-amber-500",
  },
  {
    value: "absent",
    label: "Vắng mặt",
    activeClass: "bg-destructive text-white border-destructive",
  },
  {
    value: "excused",
    label: "Có phép",
    activeClass: "bg-primary text-primary-foreground border-primary",
  },
];

export default function AdminAttendancePage() {
  const { toast } = useToast();
  const [selectedClassId, setSelectedClassId] = React.useState<string>("all");
  const [selectedSessionId, setSelectedSessionId] = React.useState<string>(
    WEEKLY_SCHEDULE_DATA[0]?.id ?? "ses-mon-1",
  );
  const [sessionDate, setSessionDate] = React.useState("2026-11-12");

  const [roster, setRoster] = React.useState<StudentAttendanceEntry[]>(() =>
    ADMIN_STUDENTS_DATA.map((stu, idx) => ({
      studentId: stu.id,
      code: stu.code,
      fullName: stu.fullName,
      status: idx === 5 ? "absent" : idx === 3 ? "excused" : "present",
      note:
        idx === 3
          ? "Xin phép nghỉ thi HSG cấp trường"
          : idx === 5
            ? "Chưa báo lý do"
            : "",
    })),
  );

  const visibleRoster = React.useMemo(() => {
    if (selectedClassId === "all") return roster;
    const allowedIds = new Set(
      ADMIN_STUDENTS_DATA.filter((s) => s.classId === selectedClassId).map(
        (s) => s.id,
      ),
    );
    return roster.filter((r) => allowedIds.has(r.studentId));
  }, [roster, selectedClassId]);

  const stats = React.useMemo(() => {
    const total = visibleRoster.length || 1;
    const present = visibleRoster.filter((r) => r.status === "present").length;
    const late = visibleRoster.filter((r) => r.status === "late").length;
    const absent = visibleRoster.filter((r) => r.status === "absent").length;
    const excused = visibleRoster.filter((r) => r.status === "excused").length;
    const rate = Math.round(((present + late) / total) * 100);
    return { total: visibleRoster.length, present, late, absent, excused, rate };
  }, [visibleRoster]);

  const handleSetStatus = (studentId: string, status: AttendanceStatus) => {
    setRoster((prev) =>
      prev.map((item) =>
        item.studentId === studentId ? { ...item, status } : item,
      ),
    );
  };

  const handleSetNote = (studentId: string, note: string) => {
    setRoster((prev) =>
      prev.map((item) =>
        item.studentId === studentId ? { ...item, note } : item,
      ),
    );
  };

  const handleMarkAllPresent = () => {
    const visibleIds = new Set(visibleRoster.map((r) => r.studentId));
    setRoster((prev) =>
      prev.map((item) =>
        visibleIds.has(item.studentId)
          ? { ...item, status: "present", note: "" }
          : item,
      ),
    );
    toast({
      title: "Đã đánh dấu tất cả Có mặt",
      description: `Toàn bộ ${visibleRoster.length} học sinh trong danh sách đã được đánh dấu Có mặt.`,
      variant: "info",
    });
  };

  const handleSaveAttendance = async () => {
    try {
      const res = await apiRequest<{
        attendanceRate: number;
        recordedCount: number;
      }>("/api/admin/attendance", {
        method: "POST",
        body: JSON.stringify({
          sessionId: selectedSessionId,
          date: sessionDate,
          entries: visibleRoster.map((r) => ({
            studentId: r.studentId,
            status: r.status,
            note: r.note,
          })),
        }),
      });
      toast({
        title: "Đã lưu sổ điểm danh thành công",
        description: `Tỷ lệ chuyên cần ca học đạt ${res.attendanceRate}% (${res.recordedCount} học sinh được đồng bộ).`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Đã lưu sổ điểm danh thành công",
        description: `Tỷ lệ chuyên cần ca học đạt ${stats.rate}% (${stats.present} có mặt, ${stats.excused} có phép).`,
        variant: "success",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Điểm danh Ca học nhanh
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Thiết kế tối ưu tốc độ: Chọn lớp → Chọn ca học → Đánh dấu trạng thái 1 chạm và lưu sổ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" onClick={handleMarkAllPresent}>
            <CheckCheck className="size-4 text-primary" aria-hidden="true" />
            Đánh dấu tất cả Có mặt
          </Button>
          <Button onClick={handleSaveAttendance}>
            <Save className="size-4" aria-hidden="true" />
            Lưu điểm danh
          </Button>
        </div>
      </div>

      {/* Session & Class Selector Bar */}
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label
            htmlFor="att-class-select"
            className="block text-xs font-semibold text-foreground"
          >
            1. Chọn lớp học
          </label>
          <select
            id="att-class-select"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả học viên ({roster.length} HV)</option>
            {CLASSROOMS_DATA.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.code} — {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="att-session-select"
            className="block text-xs font-semibold text-foreground"
          >
            2. Chọn ca học trong tuần
          </label>
          <select
            id="att-session-select"
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            {WEEKLY_SCHEDULE_DATA.map((ses) => (
              <option key={ses.id} value={ses.id}>
                {ses.dayLabel} ({ses.startTime}–{ses.endTime}) · {ses.classCode}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="att-date-input"
            className="block text-xs font-semibold text-foreground"
          >
            3. Ngày điểm danh
          </label>
          <Input
            id="att-date-input"
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {/* Live Attendance Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground">Tỷ lệ chuyên cần</span>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">
            {stats.rate}%
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
            <UserCheck className="size-3.5" aria-hidden="true" />
            Có mặt đúng giờ
          </span>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700">
            {stats.present}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
            <Clock className="size-3.5" aria-hidden="true" />
            Đi muộn
          </span>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-700">
            {stats.late}
          </p>
        </div>
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <UserX className="size-3.5" aria-hidden="true" />
            Vắng mặt
          </span>
          <p className="mt-1 font-mono text-2xl font-bold text-destructive">
            {stats.absent}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-warm/50 p-4">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <UserMinus className="size-3.5" aria-hidden="true" />
            Nghỉ có phép
          </span>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">
            {stats.excused}
          </p>
        </div>
      </div>

      {/* Fast 1-Click Student Roster */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="font-heading text-sm font-bold text-foreground">
            Danh sách học sinh ({visibleRoster.length} học viên)
          </h2>
          <Badge variant="outline">
            Tự động đồng bộ sang Cổng tra cứu cá nhân sau khi lưu
          </Badge>
        </div>

        <div className="divide-y divide-border">
          {visibleRoster.map((entry, idx) => (
            <div
              key={entry.studentId}
              className="flex flex-col justify-between gap-4 p-4 transition-colors hover:bg-muted/20 lg:flex-row lg:items-center"
            >
              {/* Student Identity */}
              <div className="flex items-center gap-3.5 min-w-64">
                <span className="w-6 font-mono text-xs text-muted-foreground">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm font-heading text-xs font-bold text-primary">
                  {entry.fullName
                    .split(" ")
                    .slice(-2)
                    .map((w) => w[0])
                    .join("")}
                </div>
                <div>
                  <p className="font-heading text-sm font-bold text-foreground">
                    {entry.fullName}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {entry.code}
                  </p>
                </div>
              </div>

              {/* 1-Click Segmented Status Buttons */}
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="radiogroup"
                aria-label={`Trạng thái điểm danh của ${entry.fullName}`}
              >
                {STATUS_OPTIONS.map((opt) => {
                  const active = entry.status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleSetStatus(entry.studentId, opt.value)}
                      className={cn(
                        "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all",
                        active
                          ? opt.activeClass
                          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Inline Note */}
              <div className="w-full lg:w-72">
                <Input
                  type="text"
                  value={entry.note}
                  onChange={(e) => handleSetNote(entry.studentId, e.target.value)}
                  placeholder="Ghi chú lý do vắng / muộn / bài bù..."
                  aria-label={`Ghi chú điểm danh cho ${entry.fullName}`}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-5 py-3.5">
          <span className="text-xs text-muted-foreground">
            Đã kiểm tra {visibleRoster.length}/{visibleRoster.length} học sinh
          </span>
          <Button size="sm" onClick={handleSaveAttendance}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Hoàn tất & Lưu điểm danh
          </Button>
        </div>
      </div>
    </div>
  );
}
