import {
  DAYS_OF_WEEK,
  type AdminStudentRecord,
  type ClassSessionRecord,
  type ClassroomGroup,
  type ResolvedScheduleOccurrence,
  type ScheduleException,
  type StudentScheduleOccurrence,
  type WeeklyClassSession,
} from "./classroom-data";
import {
  isTimeOverlapping,
  normalizeRoomKey,
  toMinutes,
} from "./schedule-helper";

// ---------------------------------------------------------------------------
// Local-Date Safe Calendar Utilities (no UTC shift on YYYY-MM-DD)
// ---------------------------------------------------------------------------

export function parseIsoDate(iso: string): Date {
  const parts = iso.split("-").map(Number);
  if (
    parts.length === 3 &&
    !Number.isNaN(parts[0]) &&
    !Number.isNaN(parts[1]) &&
    !Number.isNaN(parts[2])
  ) {
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  const base = parseIsoDate(iso);
  base.setDate(base.getDate() + days);
  return toIsoDate(base);
}

export function formatDisplayDateVi(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatShortDateVi(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

/** ISO day of week: 1 = Thứ Hai ... 7 = Chủ Nhật */
export function getDayOfWeekIso(iso: string): number {
  const d = parseIsoDate(iso);
  const jsDay = d.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function getDayLabelVi(dayOfWeek: number): string {
  return (
    DAYS_OF_WEEK.find((d) => d.dayNumber === dayOfWeek)?.fullLabel ??
    `Thứ ${dayOfWeek}`
  );
}

export function getMondayOfWeek(iso: string): string {
  const dow = getDayOfWeekIso(iso);
  return addDaysIso(iso, -(dow - 1));
}

export interface WeekDateSlot {
  date: string;
  dayOfWeek: number;
  dayLabel: string;
  shortLabel: string;
  shortDate: string;
  displayDate: string;
}

export function getWeekDates(weekStartIso: string): WeekDateSlot[] {
  const monday = getMondayOfWeek(weekStartIso);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysIso(monday, i);
    const dayOfWeek = i + 1;
    const def = DAYS_OF_WEEK.find((d) => d.dayNumber === dayOfWeek);
    return {
      date,
      dayOfWeek,
      dayLabel: def?.fullLabel ?? `Thứ ${dayOfWeek}`,
      shortLabel: def?.short ?? `T${dayOfWeek}`,
      shortDate: formatShortDateVi(date),
      displayDate: formatDisplayDateVi(date),
    };
  });
}

export interface MonthCalendarCell {
  date: string;
  dayNumber: number;
  dayOfWeek: number;
  inMonth: boolean;
}

export function getMonthCalendarGrid(
  year: number,
  monthIndex0: number,
): MonthCalendarCell[] {
  const firstOfMonth = new Date(year, monthIndex0, 1, 12, 0, 0);
  const firstIso = toIsoDate(firstOfMonth);
  const gridStartIso = getMondayOfWeek(firstIso);

  const lastOfMonth = new Date(year, monthIndex0 + 1, 0, 12, 0, 0);
  const lastDow = getDayOfWeekIso(toIsoDate(lastOfMonth));
  const totalDays =
    Math.round(
      (parseIsoDate(toIsoDate(lastOfMonth)).getTime() -
        parseIsoDate(gridStartIso).getTime()) /
        86_400_000,
    ) +
    1 +
    (7 - lastDow);

  const cellCount = Math.max(35, Math.ceil(totalDays / 7) * 7);
  return Array.from({ length: cellCount }, (_, idx) => {
    const date = addDaysIso(gridStartIso, idx);
    const parsed = parseIsoDate(date);
    return {
      date,
      dayNumber: parsed.getDate(),
      dayOfWeek: getDayOfWeekIso(date),
      inMonth: parsed.getMonth() === monthIndex0 && parsed.getFullYear() === year,
    };
  });
}

export function getDurationMinutes(startTime: string, endTime: string): number {
  return Math.max(0, toMinutes(endTime) - toMinutes(startTime));
}

// ---------------------------------------------------------------------------
// Calendar Occurrence Resolver (Recurring + Exceptions + Execution Bridge)
// ---------------------------------------------------------------------------

export interface ResolveOccurrencesInput {
  fromDate: string;
  toDate: string;
  sessions: WeeklyClassSession[];
  exceptions: ScheduleException[];
  classes: ClassroomGroup[];
  students?: AdminStudentRecord[];
  classSessions?: ClassSessionRecord[];
  includeInactiveClasses?: boolean;
  todayIso?: string;
  classCodeFilter?: string;
}

export function resolveScheduleOccurrences(
  input: ResolveOccurrencesInput,
): ResolvedScheduleOccurrence[] {
  const from = parseIsoDate(input.fromDate);
  const to = parseIsoDate(input.toDate);
  if (to.getTime() < from.getTime()) return [];

  const todayIso = input.todayIso || toIsoDate(new Date());
  const classCodeFilterUpper = input.classCodeFilter?.trim().toUpperCase();

  const classByCode = new Map<string, ClassroomGroup>();
  const classById = new Map<string, ClassroomGroup>();
  for (const cls of input.classes) {
    classByCode.set(cls.code.toUpperCase(), cls);
    classById.set(cls.id, cls);
  }

  // Live student counts per classroom
  const liveEnrolledByClassId = new Map<string, number>();
  const activeStudentsByClassId = new Map<string, AdminStudentRecord[]>();
  if (input.students) {
    for (const stu of input.students) {
      if (stu.status === "archived" || stu.deletedAt) continue;
      liveEnrolledByClassId.set(
        stu.classId,
        (liveEnrolledByClassId.get(stu.classId) ?? 0) + 1,
      );
      const bucket = activeStudentsByClassId.get(stu.classId) ?? [];
      bucket.push(stu);
      activeStudentsByClassId.set(stu.classId, bucket);
    }
  }

  // Execution logs indexed by classId + date
  const journalByClassAndDate = new Map<string, ClassSessionRecord>();
  if (input.classSessions) {
    for (const cs of input.classSessions) {
      journalByClassAndDate.set(`${cs.classId}::${cs.date}`, cs);
    }
  }

  // Index recurring exceptions by session+originalDate (plus fallback by classCode+originalDate+startTime)
  const recurringOverrideByKey = new Map<string, ScheduleException>();
  const recurringOverrideBySlot = new Map<string, ScheduleException>();
  const destinationExceptionsByDate = new Map<string, ScheduleException[]>();

  for (const exc of input.exceptions) {
    if (exc.type === "canceled" || exc.type === "rescheduled") {
      if (exc.originalSessionId) {
        recurringOverrideByKey.set(
          `${exc.originalSessionId}::${exc.originalDate}`,
          exc,
        );
      }
      recurringOverrideBySlot.set(
        `${exc.classCode.toUpperCase()}::${exc.originalDate}`,
        exc,
      );
    }

    if (exc.type === "rescheduled" || exc.type === "makeup") {
      const targetDate = exc.newDate || exc.originalDate;
      if (targetDate >= input.fromDate && targetDate <= input.toDate) {
        const list = destinationExceptionsByDate.get(targetDate) ?? [];
        list.push(exc);
        destinationExceptionsByDate.set(targetDate, list);
      }
    }
  }

  const resolveExecutionMeta = (
    cls: ClassroomGroup | undefined,
    classId: string,
    date: string,
  ): {
    classSessionId?: string;
    attendanceRecorded: boolean;
    attendanceRate: number | null;
    journalStatus: ResolvedScheduleOccurrence["journalStatus"];
  } => {
    const cs = journalByClassAndDate.get(`${classId}::${date}`);
    if (cs) {
      const required = cs.studentRecords.filter((r) => r.attendance !== "excused");
      const presentOrLate = required.filter(
        (r) => r.attendance === "present" || r.attendance === "late",
      ).length;
      const rate =
        required.length > 0 ? Math.round((presentOrLate / required.length) * 100) : null;
      return {
        classSessionId: cs.id,
        attendanceRecorded: cs.studentRecords.length > 0,
        attendanceRate: rate,
        journalStatus: cs.journalStatus,
      };
    }

    const studentsInClass = activeStudentsByClassId.get(classId) ?? [];
    if (studentsInClass.length > 0) {
      const parts = date.split("-");
      const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : date;
      const hits = studentsInClass
        .map((stu) =>
          stu.attendanceHistory.find(
            (a) => a.date === date || a.date === displayDate,
          ),
        )
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (hits.length > 0) {
        const required = hits.filter((h) => h.status !== "excused");
        const attended = required.filter(
          (h) => h.status === "present" || h.status === "late",
        ).length;
        return {
          attendanceRecorded: true,
          attendanceRate:
            required.length > 0 ? Math.round((attended / required.length) * 100) : 100,
          journalStatus: "none",
        };
      }
    }

    return {
      attendanceRecorded: false,
      attendanceRate: null,
      journalStatus: "none",
    };
  };

  const resolveStatus = (
    date: string,
    attendanceRecorded: boolean,
    journalStatus: ResolvedScheduleOccurrence["journalStatus"],
  ): ResolvedScheduleOccurrence["status"] => {
    if (attendanceRecorded || journalStatus === "completed" || date < todayIso) {
      return "completed";
    }
    if (date === todayIso) {
      return "ongoing";
    }
    return "upcoming";
  };

  const occurrences: ResolvedScheduleOccurrence[] = [];
  const totalDays =
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  for (let offset = 0; offset < totalDays; offset++) {
    const date = addDaysIso(input.fromDate, offset);
    const dow = getDayOfWeekIso(date);
    const dayLabel = getDayLabelVi(dow);

    // 1. Recurring sessions matching this dayOfWeek
    for (const ses of input.sessions) {
      if (ses.dayOfWeek !== dow) continue;
      if (
        classCodeFilterUpper &&
        ses.classCode.toUpperCase() !== classCodeFilterUpper
      ) {
        continue;
      }

      const cls = classByCode.get(ses.classCode.toUpperCase());
      if (
        !input.includeInactiveClasses &&
        cls &&
        (cls.status === "archived" || cls.status === "completed")
      ) {
        continue;
      }

      const classId = cls?.id ?? `cls-${ses.classCode.toLowerCase()}`;
      const enrolledCount = cls
        ? (liveEnrolledByClassId.get(cls.id) ?? cls.enrolled)
        : ses.enrolledCount;
      const capacity = cls?.capacity ?? ses.capacity;
      const weekNumber = cls?.currentWeekIndex ?? 1;
      const totalWeeks = cls?.totalWeeks ?? 12;

      const override =
        recurringOverrideByKey.get(`${ses.id}::${date}`) ??
        recurringOverrideBySlot.get(`${ses.classCode.toUpperCase()}::${date}`);

      if (override?.type === "rescheduled") {
        // Rescheduled off this original date — rendered cleanly on override.newDate instead
        continue;
      }

      const execMeta = resolveExecutionMeta(cls, classId, date);
      if (override?.type === "canceled") {
        occurrences.push({
          occurrenceKey: `${ses.id}::${date}`,
          date,
          dayOfWeek: dow,
          dayLabel,
          startTime: ses.startTime,
          endTime: ses.endTime,
          classId,
          classCode: cls?.code ?? ses.classCode,
          className: cls?.name ?? ses.className,
          level: cls?.level ?? ses.level,
          room: ses.room,
          topic: ses.topic,
          enrolledCount,
          capacity,
          weekNumber,
          totalWeeks,
          source: "recurring",
          status: "canceled",
          hasConflict: false,
          recurringSessionId: ses.id,
          exceptionId: override.id,
          exceptionType: "canceled",
          exceptionReason: override.reason,
          originalDate: date,
          ...execMeta,
        });
        continue;
      }

      occurrences.push({
        occurrenceKey: `${ses.id}::${date}`,
        date,
        dayOfWeek: dow,
        dayLabel,
        startTime: ses.startTime,
        endTime: ses.endTime,
        classId,
        classCode: cls?.code ?? ses.classCode,
        className: cls?.name ?? ses.className,
        level: cls?.level ?? ses.level,
        room: ses.room,
        topic: ses.topic,
        enrolledCount,
        capacity,
        weekNumber,
        totalWeeks,
        source: "recurring",
        status: resolveStatus(
          date,
          execMeta.attendanceRecorded,
          execMeta.journalStatus,
        ),
        hasConflict: false,
        recurringSessionId: ses.id,
        ...execMeta,
      });
    }

    // 2. Rescheduled / Makeup exceptions landing on this date
    const extraExceptions = destinationExceptionsByDate.get(date) ?? [];
    for (const exc of extraExceptions) {
      if (
        classCodeFilterUpper &&
        exc.classCode.toUpperCase() !== classCodeFilterUpper
      ) {
        continue;
      }
      const cls =
        classById.get(exc.classId) ??
        classByCode.get(exc.classCode.toUpperCase());
      if (
        !input.includeInactiveClasses &&
        cls &&
        (cls.status === "archived" || cls.status === "completed")
      ) {
        continue;
      }

      const classId = cls?.id ?? exc.classId;
      const enrolledCount = cls
        ? (liveEnrolledByClassId.get(cls.id) ?? cls.enrolled)
        : 12;
      const capacity = cls?.capacity ?? 15;
      const weekNumber = cls?.currentWeekIndex ?? 1;
      const totalWeeks = cls?.totalWeeks ?? 12;
      const execMeta = resolveExecutionMeta(cls, classId, date);

      occurrences.push({
        occurrenceKey: `exc::${exc.id}::${date}`,
        date,
        dayOfWeek: dow,
        dayLabel,
        startTime: exc.startTime,
        endTime: exc.endTime,
        classId,
        classCode: cls?.code ?? exc.classCode,
        className: cls?.name ?? exc.className,
        level: cls?.level ?? exc.level,
        room: exc.room,
        topic: exc.topic,
        enrolledCount,
        capacity,
        weekNumber,
        totalWeeks,
        source: exc.type === "makeup" ? "makeup" : "rescheduled",
        status: resolveStatus(
          date,
          execMeta.attendanceRecorded,
          execMeta.journalStatus,
        ),
        hasConflict: false,
        recurringSessionId: exc.originalSessionId,
        exceptionId: exc.id,
        exceptionType: exc.type,
        exceptionReason: exc.reason,
        originalDate: exc.originalDate,
        ...execMeta,
      });
    }
  }

  // Date-scoped conflict detection across active (non-canceled) occurrences
  const byDate = new Map<string, ResolvedScheduleOccurrence[]>();
  for (const occ of occurrences) {
    if (occ.status === "canceled") continue;
    const list = byDate.get(occ.date) ?? [];
    list.push(occ);
    byDate.set(occ.date, list);
  }

  for (const dayList of byDate.values()) {
    for (let i = 0; i < dayList.length; i++) {
      for (let j = i + 1; j < dayList.length; j++) {
        const a = dayList[i];
        const b = dayList[j];
        if (!isTimeOverlapping(a.startTime, a.endTime, b.startTime, b.endTime)) {
          continue;
        }
        const sameRoom =
          normalizeRoomKey(a.room) !== "" &&
          normalizeRoomKey(a.room) === normalizeRoomKey(b.room);
        const msgForA = sameRoom
          ? `Trùng phòng ${a.room.split("·")[0].trim()} với lớp ${b.classCode} (${b.startTime}–${b.endTime})`
          : `Trùng giờ dạy giáo viên với lớp ${b.classCode} (${b.startTime}–${b.endTime} tại ${b.room.split("·")[0].trim()})`;
        const msgForB = sameRoom
          ? `Trùng phòng ${b.room.split("·")[0].trim()} với lớp ${a.classCode} (${a.startTime}–${a.endTime})`
          : `Trùng giờ dạy giáo viên với lớp ${a.classCode} (${a.startTime}–${a.endTime} tại ${a.room.split("·")[0].trim()})`;

        a.hasConflict = true;
        if (!a.conflictMessage) a.conflictMessage = msgForA;
        b.hasConflict = true;
        if (!b.conflictMessage) b.conflictMessage = msgForB;
      }
    }
  }

  return occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return a.classCode.localeCompare(b.classCode);
  });
}

// ---------------------------------------------------------------------------
// Range KPIs & Export Utilities (.ics & CSV)
// ---------------------------------------------------------------------------

export interface ScheduleRangeKpis {
  totalActiveSessions: number;
  canceledCount: number;
  makeupCount: number;
  rescheduledCount: number;
  totalTeachingHours: number;
  totalExpectedStudentVisits: number;
  attendanceRecordedCount: number;
  journalCompletedCount: number;
  conflictCount: number;
  roomUtilization: Array<{ room: string; sessionCount: number; hours: number }>;
}

export function computeScheduleRangeKpis(
  occurrences: ResolvedScheduleOccurrence[],
): ScheduleRangeKpis {
  const active = occurrences.filter((o) => o.status !== "canceled");
  const canceledCount = occurrences.filter((o) => o.status === "canceled").length;
  const makeupCount = active.filter((o) => o.source === "makeup").length;
  const rescheduledCount = active.filter((o) => o.source === "rescheduled").length;

  let totalMinutes = 0;
  let totalExpectedStudentVisits = 0;
  let attendanceRecordedCount = 0;
  let journalCompletedCount = 0;
  let conflictCount = 0;

  const roomStats = new Map<string, { room: string; sessionCount: number; minutes: number }>();

  for (const occ of active) {
    const mins = getDurationMinutes(occ.startTime, occ.endTime);
    totalMinutes += mins;
    totalExpectedStudentVisits += occ.enrolledCount;
    if (occ.attendanceRecorded) attendanceRecordedCount += 1;
    if (occ.journalStatus === "completed") journalCompletedCount += 1;
    if (occ.hasConflict) conflictCount += 1;

    const shortRoom = occ.room.split("·")[0].trim() || "Phòng chưa rõ";
    const key = normalizeRoomKey(shortRoom) || shortRoom.toLowerCase();
    const entry = roomStats.get(key) ?? { room: shortRoom, sessionCount: 0, minutes: 0 };
    entry.sessionCount += 1;
    entry.minutes += mins;
    roomStats.set(key, entry);
  }

  return {
    totalActiveSessions: active.length,
    canceledCount,
    makeupCount,
    rescheduledCount,
    totalTeachingHours: Math.round((totalMinutes / 60) * 10) / 10,
    totalExpectedStudentVisits,
    attendanceRecordedCount,
    journalCompletedCount,
    conflictCount,
    roomUtilization: Array.from(roomStats.values())
      .map((r) => ({
        room: r.room,
        sessionCount: r.sessionCount,
        hours: Math.round((r.minutes / 60) * 10) / 10,
      }))
      .sort((a, b) => b.hours - a.hours),
  };
}

export function sanitizeOccurrencesForStudent(
  occurrences: ResolvedScheduleOccurrence[],
): StudentScheduleOccurrence[] {
  return occurrences.map((o) => ({
    occurrenceKey: o.occurrenceKey,
    date: o.date,
    dayOfWeek: o.dayOfWeek,
    dayLabel: o.dayLabel,
    startTime: o.startTime,
    endTime: o.endTime,
    classCode: o.classCode,
    className: o.className,
    level: o.level,
    room: o.room,
    topic: o.topic,
    source: o.source,
    status: o.status,
    ...(o.exceptionType ? { exceptionType: o.exceptionType } : {}),
    ...(o.exceptionReason ? { exceptionReason: o.exceptionReason } : {}),
    ...(o.originalDate ? { originalDate: o.originalDate } : {}),
  }));
}

function escapeIcsText(val: string): string {
  return val
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function buildScheduleIcsContent(
  occurrences: Array<
    Pick<
      ResolvedScheduleOccurrence,
      | "occurrenceKey"
      | "date"
      | "startTime"
      | "endTime"
      | "classCode"
      | "className"
      | "room"
      | "topic"
      | "status"
      | "source"
      | "exceptionReason"
    >
  >,
  calendarName = "Teacher Studio — Lịch giảng dạy",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Teacher Studio//English Manager Schedule//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];

  const stamp = toIsoDate(new Date()).replace(/-/g, "") + "T000000Z";

  for (const occ of occurrences) {
    if (occ.status === "canceled") continue;
    const dateCompact = occ.date.replace(/-/g, "");
    const startCompact = occ.startTime.replace(":", "") + "00";
    const endCompact = occ.endTime.replace(":", "") + "00";
    const summaryPrefix =
      occ.source === "makeup"
        ? "[Dạy bù] "
        : occ.source === "rescheduled"
          ? "[Đổi lịch] "
          : "";
    const summary = `${summaryPrefix}${occ.classCode} — ${occ.className}`;
    const descParts = [`Chuyên đề: ${occ.topic}`];
    if (occ.exceptionReason) {
      descParts.push(`Ghi chú thay đổi: ${occ.exceptionReason}`);
    }

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(occ.occurrenceKey)}@teacher-studio.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Ho_Chi_Minh:${dateCompact}T${startCompact}`,
      `DTEND;TZID=Asia/Ho_Chi_Minh:${dateCompact}T${endCompact}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `LOCATION:${escapeIcsText(occ.room)}`,
      `DESCRIPTION:${escapeIcsText(descParts.join("\n"))}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

export function buildScheduleCsvContent(
  occurrences: ResolvedScheduleOccurrence[],
): string {
  const header = [
    "Ngày",
    "Thứ",
    "Giờ bắt đầu",
    "Giờ kết thúc",
    "Mã lớp",
    "Tên lớp",
    "Phòng học",
    "Chuyên đề",
    "Sĩ số",
    "Loại lịch",
    "Trạng thái",
    "Điểm danh",
    "Nhật ký",
  ]
    .map(escapeCsvCell)
    .join(",");

  const rows = occurrences.map((o) =>
    [
      formatDisplayDateVi(o.date),
      o.dayLabel,
      o.startTime,
      o.endTime,
      o.classCode,
      o.className,
      o.room,
      o.topic,
      `${o.enrolledCount}/${o.capacity}`,
      o.source === "makeup"
        ? "Dạy bù"
        : o.source === "rescheduled"
          ? "Đổi lịch"
          : "Lịch cố định",
      o.status === "canceled"
        ? `Đã nghỉ (${o.exceptionReason || ""})`
        : o.status === "completed"
          ? "Đã hoàn thành"
          : o.status === "ongoing"
            ? "Hôm nay"
            : "Sắp diễn ra",
      o.attendanceRecorded
        ? `Đã điểm danh (${o.attendanceRate ?? 100}%)`
        : "Chưa điểm danh",
      o.journalStatus === "completed"
        ? "Đã hoàn tất"
        : o.journalStatus === "draft"
          ? "Bản nháp"
          : "Chưa ghi",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return `\uFEFF${[header, ...rows].join("\n")}`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/plain;charset=utf-8",
): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
