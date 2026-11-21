"use client";

import * as React from "react";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useTodayIso } from "@/lib/use-today-iso";
import {
  STANDARD_ROOMS,
  type ClassroomGroup,
  type ResolvedScheduleOccurrence,
  type ScheduleException,
  type WeeklyClassSession,
} from "@/services/classroom-data";
import {
  addDaysIso,
  buildScheduleCsvContent,
  buildScheduleIcsContent,
  computeScheduleRangeKpis,
  downloadTextFile,
  formatDisplayDateVi,
  getMondayOfWeek,
  getMonthCalendarGrid,
  getWeekDates,
  parseIsoDate,
  resolveScheduleOccurrences,
  toIsoDate,
  type ScheduleRangeKpis,
} from "@/services/schedule-calendar-helpers";
import { matchStandardRoom, normalizeRoomKey } from "@/services/schedule-helper";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ScheduleKpiStrip,
  type ScheduleStatusFilter,
} from "@/components/admin/schedule/schedule-kpi-strip";
import { ScheduleMonthCalendar } from "@/components/admin/schedule/schedule-month-calendar";
import { ScheduleRoomMatrix } from "@/components/admin/schedule/schedule-room-matrix";
import { ScheduleWeekGrid } from "@/components/admin/schedule/schedule-week-grid";
import { SessionDetailModal } from "@/components/admin/schedule/session-detail-modal";
import { SessionExceptionModal } from "@/components/admin/schedule/session-exception-modal";
import {
  SessionFormModal,
  type SessionModalMode,
} from "@/components/admin/schedule/session-form-modal";

interface CalendarApiResponse {
  fromDate: string;
  toDate: string;
  occurrences: ResolvedScheduleOccurrence[];
  exceptions: ScheduleException[];
  sessions: WeeklyClassSession[];
  kpis: ScheduleRangeKpis;
}

export default function AdminSchedulePage() {
  const { toast } = useToast();
  const todayIso = useTodayIso();
  const [anchorDateOverride, setAnchorDateOverride] = React.useState<string | null>(null);
  const [selectedMonthDateOverride, setSelectedMonthDateOverride] = React.useState<string | null>(null);
  const anchorDate = anchorDateOverride ?? todayIso;
  const selectedMonthDate = selectedMonthDateOverride ?? todayIso;
  const [viewMode, setViewMode] = React.useState<"week" | "month" | "rooms">("week");

  const [classes, setClasses] = React.useState<ClassroomGroup[]>([]);
  const [sessions, setSessions] = React.useState<WeeklyClassSession[]>([]);
  const [exceptions, setExceptions] = React.useState<ScheduleException[]>([]);
  const [serverOccurrences, setServerOccurrences] = React.useState<
    ResolvedScheduleOccurrence[] | null
  >(null);

  // Filters
  const [selectedClassCode, setSelectedClassCode] = React.useState<string>("all");
  const [selectedRoom, setSelectedRoom] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<ScheduleStatusFilter>("all");

  // Modals state
  const [formState, setFormState] = React.useState<{
    open: boolean;
    mode: SessionModalMode;
    editingSession?: WeeklyClassSession | null;
    defaultDayOfWeek?: number;
    defaultDate?: string;
    defaultRoom?: string;
  }>({ open: false, mode: "create-recurring" });

  const [exceptionState, setExceptionState] = React.useState<{
    open: boolean;
    occurrence: ResolvedScheduleOccurrence | null;
    initialMode: "rescheduled" | "canceled";
  }>({ open: false, occurrence: null, initialMode: "rescheduled" });

  const [detailOccurrence, setDetailOccurrence] =
    React.useState<ResolvedScheduleOccurrence | null>(null);

  // Date range calculation
  const anchorParsed = React.useMemo(() => parseIsoDate(anchorDate), [anchorDate]);
  const anchorYear = anchorParsed.getFullYear();
  const anchorMonth0 = anchorParsed.getMonth();

  const weekDates = React.useMemo(() => getWeekDates(anchorDate), [anchorDate]);

  const queryRange = React.useMemo(() => {
    if (viewMode === "month") {
      const cells = getMonthCalendarGrid(anchorYear, anchorMonth0);
      return {
        fromDate: cells[0].date,
        toDate: cells[cells.length - 1].date,
      };
    }
    return {
      fromDate: weekDates[0].date,
      toDate: weekDates[6].date,
    };
  }, [viewMode, anchorYear, anchorMonth0, weekDates]);

  const refreshSchedule = React.useCallback(async () => {
    try {
      const [clsItems, calData] = await Promise.all([
        apiRequest<ClassroomGroup[]>("/api/admin/classes"),
        apiRequest<CalendarApiResponse>(
          `/api/admin/schedule/calendar?from=${queryRange.fromDate}&to=${queryRange.toDate}`,
        ),
      ]);
      if (Array.isArray(clsItems)) {
        setClasses(clsItems);
      }
      if (calData) {
        setSessions(calData.sessions);
        setExceptions(calData.exceptions);
        setServerOccurrences(calData.occurrences);
      }
    } catch {
      // ignore fallback errors
    }
  }, [queryRange.fromDate, queryRange.toDate]);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<ClassroomGroup[]>("/api/admin/classes"),
      apiRequest<CalendarApiResponse>(
        `/api/admin/schedule/calendar?from=${queryRange.fromDate}&to=${queryRange.toDate}`,
      ),
    ])
      .then(([clsItems, calData]) => {
        if (!active) return;
        if (Array.isArray(clsItems) && clsItems.length > 0) {
          setClasses(clsItems);
        }
        if (calData) {
          setSessions(calData.sessions);
          setExceptions(calData.exceptions);
          setServerOccurrences(calData.occurrences);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [queryRange.fromDate, queryRange.toDate]);

  const facilityRooms = React.useMemo(() => {
    const set = new Set<string>(STANDARD_ROOMS);
    for (const c of classes) {
      if (c.room) set.add(matchStandardRoom(c.room, STANDARD_ROOMS) || c.room);
    }
    for (const s of sessions) {
      if (s.room) set.add(matchStandardRoom(s.room, STANDARD_ROOMS) || s.room);
    }
    return Array.from(set);
  }, [classes, sessions]);

  const resolvedRangeOccurrences = React.useMemo(() => {
    if (serverOccurrences) return serverOccurrences;
    return resolveScheduleOccurrences({
      fromDate: queryRange.fromDate,
      toDate: queryRange.toDate,
      sessions,
      exceptions,
      classes,
      todayIso,
    });
  }, [serverOccurrences, queryRange.fromDate, queryRange.toDate, sessions, exceptions, classes, todayIso]);

  const filteredOccurrences = React.useMemo(() => {
    return resolvedRangeOccurrences.filter((o) => {
      if (
        selectedClassCode !== "all" &&
        o.classCode.toUpperCase() !== selectedClassCode.toUpperCase()
      ) {
        return false;
      }
      if (
        selectedRoom !== "all" &&
        normalizeRoomKey(o.room) !== normalizeRoomKey(selectedRoom)
      ) {
        return false;
      }
      if (statusFilter === "ongoing" && o.status !== "ongoing") return false;
      if (statusFilter === "upcoming" && o.status !== "upcoming") return false;
      if (statusFilter === "completed" && o.status !== "completed") return false;
      if (
        statusFilter === "exceptions" &&
        o.source === "recurring" &&
        o.status !== "canceled"
      ) {
        return false;
      }
      if (statusFilter === "conflicts" && !o.hasConflict) return false;
      return true;
    });
  }, [resolvedRangeOccurrences, selectedClassCode, selectedRoom, statusFilter]);

  const visibleKpis = React.useMemo(
    () => computeScheduleRangeKpis(filteredOccurrences),
    [filteredOccurrences],
  );

  // Navigation Handlers
  const handleNavigate = (dir: -1 | 0 | 1) => {
    if (dir === 0) {
      setAnchorDateOverride(todayIso);
      setSelectedMonthDateOverride(todayIso);
      return;
    }
    if (viewMode === "month") {
      const next = new Date(anchorYear, anchorMonth0 + dir, 1, 12, 0, 0);
      const iso = toIsoDate(next);
      setAnchorDateOverride(iso);
      setSelectedMonthDateOverride(iso);
    } else {
      setAnchorDateOverride((prev) => addDaysIso(prev ?? todayIso, dir * 7));
    }
  };

  const rangeLabel = React.useMemo(() => {
    if (viewMode === "month") {
      return `Tháng ${anchorMonth0 + 1}/${anchorYear}`;
    }
    return `Tuần ${formatDisplayDateVi(weekDates[0].date)} – ${formatDisplayDateVi(weekDates[6].date)}`;
  }, [viewMode, anchorMonth0, anchorYear, weekDates]);

  const handleDeleteRecurring = async (
    sessionId: string,
    className: string,
    dayLabel: string,
  ) => {
    if (
      !confirm(
        `Bạn có chắc muốn xóa ca cố định của lớp "${className}" (${dayLabel})? Thao tác này sẽ cập nhật lịch lặp của lớp.`,
      )
    ) {
      return;
    }
    try {
      await apiRequest(`/api/admin/schedule/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      toast({
        title: "Đã xóa ca dạy cố định",
        description: "Đã cập nhật thời khóa biểu và đồng bộ lại lịch của lớp.",
        variant: "success",
      });
      await refreshSchedule();
    } catch (err) {
      toast({
        title: "Lỗi xóa ca học",
        description: err instanceof Error ? err.message : "Không thể xóa ca học.",
        variant: "error",
      });
    }
  };

  const handleRevertException = async (exceptionId: string) => {
    try {
      await apiRequest(
        `/api/admin/schedule/exceptions/${encodeURIComponent(exceptionId)}`,
        { method: "DELETE" },
      );
      toast({
        title: "Đã hoàn tác thay đổi lịch",
        description: "Buổi học đã trở về lịch cố định ban đầu.",
        variant: "info",
      });
      await refreshSchedule();
    } catch (err) {
      toast({
        title: "Không thể hoàn tác",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        variant: "error",
      });
    }
  };

  const handleExportIcs = () => {
    const ics = buildScheduleIcsContent(
      filteredOccurrences,
      `Teacher Studio — ${rangeLabel}`,
    );
    downloadTextFile(
      `lich-giang-day-${queryRange.fromDate}-den-${queryRange.toDate}.ics`,
      ics,
      "text/calendar;charset=utf-8",
    );
    toast({
      title: "Đã xuất tệp lịch .ICS",
      description: "Bạn có thể nhập trực tiếp vào Google Calendar hoặc Apple Calendar.",
      variant: "success",
    });
  };

  const handleExportCsv = () => {
    const csv = buildScheduleCsvContent(filteredOccurrences);
    downloadTextFile(
      `lich-giang-day-${queryRange.fromDate}-den-${queryRange.toDate}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
    toast({
      title: "Đã xuất bảng lịch CSV",
      variant: "success",
    });
  };

  return (
    <div className="space-y-5">
      {/* Header & Top Primary Actions (Single balanced row on desktop) */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản lý Lịch dạy & Ca học
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Điều phối thời khóa biểu thực tế theo tuần/tháng/phòng, chặn trùng lịch giáo viên và liên thông Điểm danh & Nhật ký.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {visibleKpis.conflictCount === 0 ? (
            <Badge variant="success" className="h-9 whitespace-nowrap rounded-lg px-3">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              0 xung đột lịch dạy
            </Badge>
          ) : (
            <Badge variant="destructive" className="h-9 whitespace-nowrap rounded-lg px-3">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Phát hiện {visibleKpis.conflictCount} xung đột
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-9 whitespace-nowrap"
            onClick={() =>
              setFormState({
                open: true,
                mode: "create-makeup",
                defaultDate: todayIso,
              })
            }
          >
            <CalendarPlus className="size-4 text-primary" aria-hidden="true" />
            Thêm dạy bù
          </Button>

          <Button
            size="sm"
            className="h-9 whitespace-nowrap"
            onClick={() =>
              setFormState({
                open: true,
                mode: "create-recurring",
                defaultDate: weekDates[5]?.date || todayIso,
                defaultDayOfWeek: 6,
              })
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Thêm ca cố định
          </Button>
        </div>
      </div>

      {/* Unified Date Navigation & View Mode Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-8 whitespace-nowrap"
            onClick={() => handleNavigate(-1)}
            aria-label="Khoảng thời gian trước"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {viewMode === "month" ? "Tháng trước" : "Tuần trước"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-8 whitespace-nowrap"
            onClick={() => handleNavigate(0)}
          >
            Hôm nay
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-8 whitespace-nowrap"
            onClick={() => handleNavigate(1)}
            aria-label="Khoảng thời gian tiếp theo"
          >
            {viewMode === "month" ? "Tháng sau" : "Tuần sau"}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm font-bold whitespace-nowrap text-foreground">
            {rangeLabel}
          </span>
          {viewMode !== "month" &&
            getMondayOfWeek(todayIso) === weekDates[0].date && (
              <Badge variant="warm" className="whitespace-nowrap text-[11px]">
                Tuần hiện tại
              </Badge>
            )}
        </div>

        {/* View Switcher */}
        <div
          className="inline-flex shrink-0 items-center self-start rounded-xl border border-border bg-background p-1 lg:self-auto"
          role="group"
          aria-label="Chế độ xem lịch"
        >
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors cursor-pointer",
              viewMode === "week"
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="size-3.5" aria-hidden="true" />
            Lịch Tuần
          </button>
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors cursor-pointer",
              viewMode === "month"
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Calendar className="size-3.5" aria-hidden="true" />
            Lịch Tháng
          </button>
          <button
            type="button"
            onClick={() => setViewMode("rooms")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors cursor-pointer",
              viewMode === "rooms"
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Building2 className="size-3.5" aria-hidden="true" />
            Phòng học
          </button>
        </div>
      </div>

      {/* KPI Strip + Filter + Export Bar */}
      <ScheduleKpiStrip
        kpis={visibleKpis}
        classes={classes}
        rooms={facilityRooms}
        selectedClassCode={selectedClassCode}
        selectedRoom={selectedRoom}
        statusFilter={statusFilter}
        onClassCodeChange={setSelectedClassCode}
        onRoomChange={setSelectedRoom}
        onStatusFilterChange={setStatusFilter}
        onResetFilters={() => {
          setSelectedClassCode("all");
          setSelectedRoom("all");
          setStatusFilter("all");
        }}
        onExportIcs={handleExportIcs}
        onExportCsv={handleExportCsv}
      />

      {/* Active View */}
      {viewMode === "week" ? (
        <ScheduleWeekGrid
          weekDates={weekDates}
          todayIso={todayIso}
          occurrences={filteredOccurrences}
          onAddSessionForDay={(dayOfWeek, date) =>
            setFormState({
              open: true,
              mode: "create-recurring",
              defaultDayOfWeek: dayOfWeek,
              defaultDate: date,
            })
          }
          onViewDetail={(occ) => setDetailOccurrence(occ)}
          onEditRecurring={(sessionId) => {
            const target = sessions.find((s) => s.id === sessionId);
            if (!target) return;
            setFormState({
              open: true,
              mode: "edit-recurring",
              editingSession: target,
            });
          }}
          onOpenException={(occ, mode) =>
            setExceptionState({ open: true, occurrence: occ, initialMode: mode })
          }
          onDeleteRecurring={handleDeleteRecurring}
          onRevertException={handleRevertException}
        />
      ) : viewMode === "month" ? (
        <ScheduleMonthCalendar
          year={anchorYear}
          monthIndex0={anchorMonth0}
          todayIso={todayIso}
          occurrences={filteredOccurrences}
          selectedDate={selectedMonthDate}
          onSelectDate={setSelectedMonthDateOverride}
          onAddMakeup={(date) =>
            setFormState({
              open: true,
              mode: "create-makeup",
              defaultDate: date,
            })
          }
          onViewDetail={(occ) => setDetailOccurrence(occ)}
        />
      ) : (
        <ScheduleRoomMatrix
          rooms={facilityRooms}
          weekDates={weekDates}
          todayIso={todayIso}
          occurrences={filteredOccurrences}
          onAddSessionForCell={(room, dayOfWeek, date) =>
            setFormState({
              open: true,
              mode: "create-recurring",
              defaultRoom: room,
              defaultDayOfWeek: dayOfWeek,
              defaultDate: date,
            })
          }
          onViewDetail={(occ) => setDetailOccurrence(occ)}
        />
      )}

      {/* Modals */}
      <SessionFormModal
        open={formState.open}
        onClose={() => setFormState((prev) => ({ ...prev, open: false }))}
        mode={formState.mode}
        classes={classes}
        sessions={sessions}
        exceptions={exceptions}
        facilityRooms={facilityRooms}
        weekDates={weekDates}
        editingSession={formState.editingSession}
        defaultDayOfWeek={formState.defaultDayOfWeek}
        defaultDate={formState.defaultDate}
        defaultRoom={formState.defaultRoom}
        onSaved={refreshSchedule}
      />

      <SessionExceptionModal
        open={exceptionState.open}
        onClose={() => setExceptionState((prev) => ({ ...prev, open: false }))}
        occurrence={exceptionState.occurrence}
        initialMode={exceptionState.initialMode}
        classes={classes}
        sessions={sessions}
        exceptions={exceptions}
        facilityRooms={facilityRooms}
        onSaved={refreshSchedule}
      />

      <SessionDetailModal
        open={Boolean(detailOccurrence)}
        onClose={() => setDetailOccurrence(null)}
        occurrence={detailOccurrence}
        onEditRecurring={(sessionId) => {
          const target = sessions.find((s) => s.id === sessionId);
          if (!target) return;
          setFormState({
            open: true,
            mode: "edit-recurring",
            editingSession: target,
          });
        }}
        onOpenException={(occ, mode) =>
          setExceptionState({ open: true, occurrence: occ, initialMode: mode })
        }
        onRevertException={handleRevertException}
        onDeleteRecurring={handleDeleteRecurring}
      />
    </div>
  );
}
