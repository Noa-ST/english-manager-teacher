import type { JournalStatus } from "./classroom-data";

export type AttendanceStatusValue = "present" | "late" | "absent" | "excused";

export interface QuickAttendanceNoteChip {
  id: string;
  label: string;
  text: string;
  targetStatuses: AttendanceStatusValue[];
}

export const ATTENDANCE_QUICK_NOTE_CHIPS: QuickAttendanceNoteChip[] = [
  {
    id: "chip-late-traffic",
    label: "Kẹt xe",
    text: "Đến muộn do kẹt xe.",
    targetStatuses: ["late"],
  },
  {
    id: "chip-excused-sick",
    label: "Ốm (có phép)",
    text: "Phụ huynh xin phép nghỉ ốm.",
    targetStatuses: ["excused"],
  },
  {
    id: "chip-excused-family",
    label: "Việc gia đình",
    text: "Xin nghỉ có phép vì việc gia đình.",
    targetStatuses: ["excused"],
  },
  {
    id: "chip-absent-unexcused",
    label: "Vắng không báo",
    text: "Vắng mặt chưa có thông báo từ gia đình.",
    targetStatuses: ["absent"],
  },
  {
    id: "chip-makeup-arranged",
    label: "Hẹn học bù",
    text: "Đã hẹn sắp xếp học bù ca khác trong tuần.",
    targetStatuses: ["absent", "excused"],
  },
  {
    id: "chip-late-homework-check",
    label: "Nhắc ôn đầu giờ",
    text: "Vào muộn phần kiểm tra bài cũ đầu giờ.",
    targetStatuses: ["late"],
  },
];

export interface DayScheduleOccurrenceOption {
  occurrenceKey: string;
  sessionId?: string;
  scheduleExceptionId?: string;
  classId: string;
  classCode: string;
  className: string;
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  room: string;
  topic: string;
  source: "recurring" | "rescheduled" | "makeup";
  status: "upcoming" | "ongoing" | "completed" | "canceled";
  attendanceRecorded: boolean;
  attendanceRate: number | null;
  exceptionReason?: string;
}

export interface PendingAttendanceItem {
  occurrenceKey: string;
  sessionId: string;
  scheduleExceptionId?: string;
  classId: string;
  classCode: string;
  className: string;
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  room: string;
  topic: string;
  enrolledCount: number;
  source: "recurring" | "rescheduled" | "makeup";
  isToday: boolean;
}

export interface AttendanceSnapshotResult {
  date: string;
  alreadyRecorded: boolean;
  classSessionId?: string;
  journalStatus?: JournalStatus;
  isCanceledDate: boolean;
  canceledReason?: string;
  dayOccurrences: DayScheduleOccurrenceOption[];
  entries: Record<string, { status: AttendanceStatusValue; note: string }>;
  onLeaveStudents: Array<{
    id: string;
    code: string;
    fullName: string;
    leaveReason?: string;
  }>;
  consecutiveAbsencesByStudentId: Record<string, number>;
}

export interface AttendanceMatrixColumn {
  columnId: string;
  date: string;
  displayDate: string;
  label: string;
  topic: string;
  classSessionId?: string;
  attendanceRate: number;
}

export interface AttendanceMatrixCell {
  status: AttendanceStatusValue | null;
  note?: string;
}

export interface AttendanceMatrixRow {
  studentId: string;
  studentCode: string;
  studentName: string;
  studentStatus: "active" | "trial" | "on-leave" | "archived";
  attendanceRate: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  consecutiveAbsences: number;
  cells: Record<string, AttendanceMatrixCell>;
}

export interface ClassAttendanceMatrixReport {
  classId: string;
  classCode: string;
  className: string;
  fromDate: string;
  toDate: string;
  columns: AttendanceMatrixColumn[];
  rows: AttendanceMatrixRow[];
  averageAttendanceRate: number;
  highRiskStudentsCount: number;
}

/** Chuẩn hóa mọi chuỗi ngày (YYYY-MM-DD hoặc DD/MM/YYYY) về YYYY-MM-DD */
export function normalizeHistoryDateToIso(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const viMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (viMatch) {
    return `${viMatch[3]}-${viMatch[2]}-${viMatch[1]}`;
  }
  return trimmed;
}

/** Hiển thị ngày YYYY-MM-DD sang DD/MM/YYYY */
export function formatAttendanceDateVi(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return trimmed;
}

export interface AttendanceSummaryStats {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number;
}

export function computeAttendanceStats(
  entries: Array<{ status: AttendanceStatusValue }>,
): AttendanceSummaryStats {
  const total = entries.length;
  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;

  for (const e of entries) {
    if (e.status === "present") present += 1;
    else if (e.status === "late") late += 1;
    else if (e.status === "absent") absent += 1;
    else if (e.status === "excused") excused += 1;
  }

  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 100;
  return { total, present, late, absent, excused, rate };
}

/**
 * Đếm số buổi vắng không phép liên tiếp gần nhất của học sinh.
 * Sắp theo ngày giảm dần; buổi nghỉ có phép (excused) không ngắt/không cộng vào chuỗi vắng không phép;
 * dừng ngay khi gặp buổi Có mặt hoặc Đi muộn.
 */
export function computeConsecutiveAbsences(
  history: Array<{ date: string; status: AttendanceStatusValue }>,
): number {
  if (!history || history.length === 0) return 0;

  const sorted = [...history].sort((a, b) =>
    normalizeHistoryDateToIso(b.date).localeCompare(
      normalizeHistoryDateToIso(a.date),
    ),
  );

  let streak = 0;
  for (const item of sorted) {
    if (item.status === "absent") {
      streak += 1;
    } else if (item.status === "present" || item.status === "late") {
      break;
    }
  }
  return streak;
}

export function buildAbsentParentNotice(input: {
  className: string;
  classCode: string;
  date: string;
  sessionLabel?: string;
  entries: Array<{
    studentCode: string;
    fullName: string;
    status: AttendanceStatusValue;
    note?: string;
  }>;
}): string {
  const absentEntries = input.entries.filter((e) => e.status === "absent");
  const excusedEntries = input.entries.filter((e) => e.status === "excused");
  const lateEntries = input.entries.filter((e) => e.status === "late");

  const displayDate = formatAttendanceDateVi(input.date);
  const lines: string[] = [
    `[THÔNG BÁO CHUYÊN CẦN] Lớp ${input.className} (${input.classCode})`,
    `Ngày học: ${displayDate}${input.sessionLabel ? ` · ${input.sessionLabel}` : ""}`,
  ];

  if (
    absentEntries.length === 0 &&
    lateEntries.length === 0 &&
    excusedEntries.length === 0
  ) {
    lines.push(
      "",
      "Toàn bộ học viên lớp hôm nay đều Có mặt đầy đủ và đúng giờ.",
    );
  } else {
    if (absentEntries.length > 0) {
      lines.push("", `Học viên vắng chưa rõ lý do (${absentEntries.length}):`);
      for (const e of absentEntries) {
        lines.push(
          `• ${e.fullName} (${e.studentCode})${e.note ? ` — ${e.note}` : ""}`,
        );
      }
      lines.push(
        "Kính nhờ Quý Phụ huynh xác nhận tình hình của các em để cô sắp xếp tài liệu/học bù kịp thời.",
      );
    }

    if (excusedEntries.length > 0) {
      lines.push("", `Học viên nghỉ có phép (${excusedEntries.length}):`);
      for (const e of excusedEntries) {
        lines.push(
          `• ${e.fullName} (${e.studentCode})${e.note ? ` — ${e.note}` : ""}`,
        );
      }
    }

    if (lateEntries.length > 0) {
      lines.push("", `Học viên đi muộn (${lateEntries.length}):`);
      for (const e of lateEntries) {
        lines.push(
          `• ${e.fullName} (${e.studentCode})${e.note ? ` — ${e.note}` : ""}`,
        );
      }
    }
  }

  lines.push("", "Trân trọng,", "ThS. Nguyễn Minh Anh");
  return lines.join("\n");
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const MATRIX_STATUS_SHORT: Record<AttendanceStatusValue, string> = {
  present: "CM",
  late: "M",
  absent: "V",
  excused: "P",
};

/**
 * Xuất Sổ điểm danh Ma trận lớp dạng CSV chuẩn UTF-8 BOM mở trực tiếp trên Excel.
 * Quy ước: CM = Có mặt, M = Đi muộn, V = Vắng không phép, P = Nghỉ có phép, - = Chưa ghi.
 */
export function buildAttendanceMatrixCsv(
  report: ClassAttendanceMatrixReport,
): string {
  const baseHeaders = [
    "Mã HS",
    "Họ và tên",
    "Trạng thái",
    "Chuyên cần (%)",
    "Có mặt",
    "Đi muộn",
    "Vắng",
    "Có phép",
    "Vắng liên tiếp",
  ];
  const sessionHeaders = report.columns.map((c) => `${c.displayDate} (${c.label})`);
  const headers = [...baseHeaders, ...sessionHeaders];

  const rows = report.rows.map((row) => {
    const baseCells = [
      row.studentCode,
      row.studentName,
      row.studentStatus === "trial" ? "Học thử" : "Đang học",
      row.attendanceRate,
      row.presentCount,
      row.lateCount,
      row.absentCount,
      row.excusedCount,
      row.consecutiveAbsences,
    ];
    const colCells = report.columns.map((col) => {
      const cell = row.cells[col.columnId];
      if (!cell || !cell.status) return "-";
      const code = MATRIX_STATUS_SHORT[cell.status];
      return cell.note ? `${code} (${cell.note})` : code;
    });
    return [...baseCells, ...colCells].map(escapeCsvCell).join(",");
  });

  return `\uFEFF${[headers.map(escapeCsvCell).join(","), ...rows].join("\r\n")}`;
}

export interface StudentAttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  mandatoryTotal: number;
  rate: number;
}

export function buildStudentAttendanceSummary(
  history: Array<{ status: AttendanceStatusValue }>,
): StudentAttendanceSummary {
  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;

  for (const item of history) {
    if (item.status === "present") present += 1;
    else if (item.status === "late") late += 1;
    else if (item.status === "absent") absent += 1;
    else if (item.status === "excused") excused += 1;
  }

  const total = history.length;
  const mandatoryTotal = present + late + absent;
  const rate =
    mandatoryTotal > 0
      ? Math.round(((present + late) / mandatoryTotal) * 100)
      : 100;

  return { total, present, late, absent, excused, mandatoryTotal, rate };
}
