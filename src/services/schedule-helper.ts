import {
  DAYS_OF_WEEK,
  STANDARD_ROOMS,
  STANDARD_TIME_SLOTS,
  type ClassroomGroup,
  type TimeSlotDef,
  type WeeklyClassSession,
} from "./classroom-data";

export interface SelectedSlot {
  dayNumber: number; // 1 to 7
  slotId: string;    // id from TimeSlotDef
}

export interface OccupiedSlotInfo {
  classId: string;
  classCode: string;
  className: string;
  room: string;
  startTime: string;
  endTime: string;
}

export interface SlotValidationResult {
  isValid: boolean;
  errorMessage?: string;
  normalizedStart?: string;
  normalizedEnd?: string;
  conflictingSlot?: TimeSlotDef;
  overlapRange?: { start: string; end: string };
  durationMinutes?: number;
}

/** Convert "HH:mm" to total minutes from midnight */
export function toMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/** Convert total minutes from midnight back to "HH:mm" */
export function toTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Check if two HH:mm intervals overlap: max(startA, startB) < min(endA, endB) */
export function isTimeOverlapping(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = toMinutes(startA);
  const aEnd = toMinutes(endA);
  const bStart = toMinutes(startB);
  const bEnd = toMinutes(endB);
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

/**
 * Normalize flexible user inputs like "7h", "7h30", "07:00", "19h50" into standard "HH:mm".
 */
export function normalizeTimeString(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");

  // Match "7h30", "19h50", "7h"
  const hMatch = s.match(/^(\d{1,2})h(\d{1,2})?$/);
  if (hMatch) {
    const h = parseInt(hMatch[1], 10);
    const m = hMatch[2] ? parseInt(hMatch[2], 10) : 0;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  // Match "7:30", "07:30"
  const colonMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  // Match standalone number "7", "19"
  const numMatch = s.match(/^(\d{1,2})$/);
  if (numMatch) {
    const h = parseInt(numMatch[1], 10);
    if (h >= 0 && h <= 23) {
      return `${h.toString().padStart(2, "0")}:00`;
    }
  }

  return null;
}

/**
 * Core validation rule for adding custom time slots:
 * 1. Valid format (HH:mm or Xh / XhY)
 * 2. startTime < endTime
 * 3. 45m <= duration <= 240m
 * 4. STRICT NO-OVERLAP: max(startA, startB) < min(endA, endB) against all existing slots
 */
export function validateNewTimeSlot(
  rawStart: string,
  rawEnd: string,
  existingSlots: TimeSlotDef[],
): SlotValidationResult {
  if (!rawStart?.trim() || !rawEnd?.trim()) {
    return {
      isValid: false,
      errorMessage: "Vui lòng nhập đầy đủ giờ bắt đầu và giờ kết thúc.",
    };
  }

  const start = normalizeTimeString(rawStart);
  const end = normalizeTimeString(rawEnd);

  if (!start) {
    return {
      isValid: false,
      errorMessage: `Giờ bắt đầu "${rawStart}" không đúng định dạng (hợp lệ: 07:00, 7h, 7h30).`,
    };
  }

  if (!end) {
    return {
      isValid: false,
      errorMessage: `Giờ kết thúc "${rawEnd}" không đúng định dạng (hợp lệ: 09:00, 9h, 9h30).`,
    };
  }

  const startMin = toMinutes(start);
  const endMin = toMinutes(end);

  if (startMin >= endMin) {
    return {
      isValid: false,
      errorMessage: `Giờ bắt đầu (${start}) phải sớm hơn giờ kết thúc (${end}).`,
      normalizedStart: start,
      normalizedEnd: end,
    };
  }

  const duration = endMin - startMin;
  if (duration < 45) {
    return {
      isValid: false,
      errorMessage: `Thời lượng ca học tối thiểu là 45 phút (hiện tại: ${duration} phút).`,
      normalizedStart: start,
      normalizedEnd: end,
      durationMinutes: duration,
    };
  }

  if (duration > 240) {
    return {
      isValid: false,
      errorMessage: `Thời lượng ca học không được vượt quá 4 giờ (hiện tại: ${duration} phút).`,
      normalizedStart: start,
      normalizedEnd: end,
      durationMinutes: duration,
    };
  }

  // Check overlap with existing slots
  for (const slot of existingSlots) {
    const slotStartMin = toMinutes(slot.startTime);
    const slotEndMin = toMinutes(slot.endTime);

    // Overlap formula: max(startA, startB) < min(endA, endB)
    const overlapStart = Math.max(startMin, slotStartMin);
    const overlapEnd = Math.min(endMin, slotEndMin);

    if (overlapStart < overlapEnd) {
      const overlapStartStr = toTimeString(overlapStart);
      const overlapEndStr = toTimeString(overlapEnd);

      return {
        isValid: false,
        errorMessage: `Khung giờ ${start} – ${end} bị trùng với khung giờ ${slot.startTime} – ${slot.endTime} đã có (giao thoa từ ${overlapStartStr} đến ${overlapEndStr}). Hai khung giờ không được đè lên nhau!`,
        normalizedStart: start,
        normalizedEnd: end,
        conflictingSlot: slot,
        overlapRange: { start: overlapStartStr, end: overlapEndStr },
        durationMinutes: duration,
      };
    }
  }

  return {
    isValid: true,
    normalizedStart: start,
    normalizedEnd: end,
    durationMinutes: duration,
  };
}

/** Sort slots chronologically by start time */
export function sortTimeSlots(slots: TimeSlotDef[]): TimeSlotDef[] {
  return [...slots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

/** Check if a time slot can be safely deleted without breaking active classes */
export function checkCanDeleteTimeSlot(
  slotId: string,
  classes: ClassroomGroup[],
  slots: TimeSlotDef[] = STANDARD_TIME_SLOTS,
): {
  canDelete: boolean;
  reason?: string;
  inUseCount: number;
  conflictingClassCodes: string[];
} {
  const slotDef = slots.find((s) => s.id === slotId);
  if (!slotDef) {
    return { canDelete: true, inUseCount: 0, conflictingClassCodes: [] };
  }

  // Scan occupied slots map across all active classes
  const map = getOccupiedSlotsMap(classes, undefined, slots);
  const conflictingCodesSet = new Set<string>();

  for (let d = 1; d <= 7; d++) {
    const key = `${d}-${slotId}`;
    if (map.has(key)) {
      const occ = map.get(key)!;
      conflictingCodesSet.add(occ.classCode);
    }
  }

  const conflictingClassCodes = Array.from(conflictingCodesSet);
  if (conflictingClassCodes.length > 0) {
    const codeList = conflictingClassCodes.join(", ");
    return {
      canDelete: false,
      reason: `Khung giờ ${slotDef.startTime} – ${slotDef.endTime} đang có ${conflictingClassCodes.length} lớp học (${codeList}). Không được phép xóa!`,
      inUseCount: conflictingClassCodes.length,
      conflictingClassCodes,
    };
  }

  return { canDelete: true, inUseCount: 0, conflictingClassCodes: [] };
}

/** Match a time string like "18:00" or "18:00 – 20:15" to the closest time slot */
export function findMatchingSlot(
  timeStr: string,
  slots: TimeSlotDef[] = STANDARD_TIME_SLOTS,
): TimeSlotDef | undefined {
  const cleaned = timeStr.trim();
  // If format "18:00 - 20:15"
  const rangeMatch = cleaned.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  if (rangeMatch) {
    const s = rangeMatch[1];
    const e = rangeMatch[2];
    // Exact match
    const exact = slots.find((slot) => slot.startTime === s && slot.endTime === e);
    if (exact) return exact;

    // Overlapping match
    return slots.find((slot) =>
      isTimeOverlapping(slot.startTime, slot.endTime, s, e),
    );
  }

  // If only start time like "19:50" or "09:00"
  const singleMatch = cleaned.match(/(\d{1,2}:\d{2})/);
  if (singleMatch) {
    const s = singleMatch[1];
    const targetMin = toMinutes(s);
    let closest: TimeSlotDef | undefined;
    let minDiff = Infinity;
    for (const slot of slots) {
      const slotStartMin = toMinutes(slot.startTime);
      const diff = Math.abs(slotStartMin - targetMin);
      if (diff < minDiff) {
        minDiff = diff;
        closest = slot;
      }
    }
    if (minDiff <= 35) return closest;
  }

  return undefined;
}

/** Parse day name into day number (1 = Mon ... 7 = Sun) */
export function parseDayNumber(dayStr: string): number | undefined {
  const cleanDay = dayStr.replace(/\(.*?\)/g, "").toLowerCase().trim();
  if (cleanDay.includes("chủ nhật") || cleanDay.includes("chu nhat") || cleanDay.includes("cn")) return 7;
  if (cleanDay.includes("hai") || /\b2\b|thứ\s*2/i.test(cleanDay)) return 1;
  if (cleanDay.includes("ba") || /\b3\b|thứ\s*3/i.test(cleanDay)) return 2;
  if (cleanDay.includes("tư") || cleanDay.includes("tu") || /\b4\b|thứ\s*4/i.test(cleanDay)) return 3;
  if (cleanDay.includes("năm") || cleanDay.includes("nam") || /\b5\b|thứ\s*5/i.test(cleanDay)) return 4;
  if (cleanDay.includes("sáu") || cleanDay.includes("sau") || /\b6\b|thứ\s*6/i.test(cleanDay)) return 5;
  if (cleanDay.includes("bảy") || cleanDay.includes("bay") || /\b7\b|thứ\s*7/i.test(cleanDay)) return 6;
  return undefined;
}

/**
 * Parse a summary string into an array of { dayNumber, slotId }.
 */
export function parseScheduleStringToSlots(
  scheduleSummary: string,
  slots: TimeSlotDef[] = STANDARD_TIME_SLOTS,
): SelectedSlot[] {
  if (!scheduleSummary) return [];
  const results: SelectedSlot[] = [];

  // Check if format has shared time: "Days · Time"
  if (scheduleSummary.includes("·")) {
    const [daysPart, timePart] = scheduleSummary.split("·");
    const matchedSlot = findMatchingSlot(timePart, slots);
    if (matchedSlot) {
      const dayTokens = daysPart.split(/[,&]/);
      for (const token of dayTokens) {
        const dayNum = parseDayNumber(token);
        if (dayNum) {
          results.push({ dayNumber: dayNum, slotId: matchedSlot.id });
        }
      }
      return results;
    }
  }

  // Check if format has per-day times: "Thứ 5 (19:50) & Thứ 7 (09:00)" or 3+ sessions with commas
  const perDayTokens = scheduleSummary.split(/[,&]/);
  for (const token of perDayTokens) {
    const dayNum = parseDayNumber(token);
    const timeMatch = token.match(/\((.*?)\)/);
    if (dayNum && timeMatch) {
      const slot = findMatchingSlot(timeMatch[1], slots);
      if (slot) {
        results.push({ dayNumber: dayNum, slotId: slot.id });
      }
    }
  }

  return results;
}

/**
 * Format selected slots into an idiomatic Vietnamese schedule summary.
 */
export function formatSlotsToScheduleString(
  slots: SelectedSlot[],
  slotDefs: TimeSlotDef[] = STANDARD_TIME_SLOTS,
): string {
  if (!slots || slots.length === 0) return "";

  const sorted = [...slots].sort((a, b) => a.dayNumber - b.dayNumber);

  const detailed = sorted.map((s) => {
    const slotDef = slotDefs.find((def) => def.id === s.slotId);
    const dayDef = DAYS_OF_WEEK.find((d) => d.dayNumber === s.dayNumber);
    const startTime = slotDef?.startTime ?? "18:00";
    const endTime = slotDef?.endTime ?? "20:00";
    return {
      dayNumber: s.dayNumber,
      dayLabel: dayDef?.label ?? `Thứ ${s.dayNumber}`,
      slotId: s.slotId,
      startTime,
      endTime,
      timeLabel: `${startTime} – ${endTime}`,
    };
  });

  const firstTime = detailed[0].timeLabel;
  const allSameTime = detailed.every((d) => d.timeLabel === firstTime);

  if (allSameTime) {
    const dayLabels = detailed.map((d) => d.dayLabel);
    let daysJoined = "";
    if (dayLabels.length === 1) {
      daysJoined = dayLabels[0];
    } else if (dayLabels.length === 2) {
      daysJoined = `${dayLabels[0]} & ${dayLabels[1]}`;
    } else {
      const last = dayLabels[dayLabels.length - 1];
      const rest = dayLabels.slice(0, -1).join(", ");
      daysJoined = `${rest} & ${last}`;
    }
    return `${daysJoined} · ${firstTime}`;
  }

  const items = detailed.map((d) => `${d.dayLabel} (${d.timeLabel})`);
  if (items.length <= 2) {
    return items.join(" & ");
  }
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(", ");
  return `${rest} & ${last}`;
}

/**
 * Format a list of WeeklyClassSession into an idiomatic Vietnamese schedule summary.
 */
export function formatSessionsToScheduleSummary(
  sessions: WeeklyClassSession[],
): string {
  if (!sessions || sessions.length === 0) return "";

  // Sort sessions chronologically: dayOfWeek (1..7), then startTime
  const sorted = [...sessions].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  const detailed = sorted.map((s) => {
    const dayDef = DAYS_OF_WEEK.find((d) => d.dayNumber === s.dayOfWeek);
    const dayLabel = dayDef?.label ?? s.dayLabel ?? `Thứ ${s.dayOfWeek}`;
    const timeLabel = `${s.startTime} – ${s.endTime}`;
    return {
      dayOfWeek: s.dayOfWeek,
      dayLabel,
      startTime: s.startTime,
      endTime: s.endTime,
      timeLabel,
    };
  });

  const firstTime = detailed[0].timeLabel;
  const allSameTime = detailed.every((d) => d.timeLabel === firstTime);

  if (allSameTime) {
    const dayLabels = detailed.map((d) => d.dayLabel);
    let daysJoined = "";
    if (dayLabels.length === 1) {
      daysJoined = dayLabels[0];
    } else if (dayLabels.length === 2) {
      daysJoined = `${dayLabels[0]} & ${dayLabels[1]}`;
    } else {
      const last = dayLabels[dayLabels.length - 1];
      const rest = dayLabels.slice(0, -1).join(", ");
      daysJoined = `${rest} & ${last}`;
    }
    return `${daysJoined} · ${firstTime}`;
  }

  // Different times
  const items = detailed.map((d) => `${d.dayLabel} (${d.timeLabel})`);
  if (items.length <= 2) {
    return items.join(" & ");
  }
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(", ");
  return `${rest} & ${last}`;
}

/**
 * Scan all active classrooms and build a Map of occupied slots:
 * Key: `${dayNumber}-${slotId}`
 * Value: OccupiedSlotInfo
 */
export function getOccupiedSlotsMap(
  classes: ClassroomGroup[],
  excludeClassId?: string,
  slots: TimeSlotDef[] = STANDARD_TIME_SLOTS,
): Map<string, OccupiedSlotInfo> {
  const map = new Map<string, OccupiedSlotInfo>();

  for (const cls of classes) {
    if (cls.status === "archived") continue;
    if (excludeClassId && cls.id === excludeClassId) continue;

    const parsedSlots = parseScheduleStringToSlots(cls.scheduleSummary, slots);
    for (const slot of parsedSlots) {
      const slotDef = slots.find((s) => s.id === slot.slotId);
      if (slotDef) {
        for (const candidate of slots) {
          if (
            candidate.id === slotDef.id ||
            isTimeOverlapping(candidate.startTime, candidate.endTime, slotDef.startTime, slotDef.endTime)
          ) {
            const key = `${slot.dayNumber}-${candidate.id}`;
            if (!map.has(key)) {
              map.set(key, {
                classId: cls.id,
                classCode: cls.code,
                className: cls.name,
                room: cls.room,
                startTime: slotDef.startTime,
                endTime: slotDef.endTime,
              });
            }
          }
        }
      }
    }
  }

  return map;
}

export const CUSTOM_SLOTS_STORAGE_KEY = "teacher_studio_custom_slots_v1";

export function loadCustomSlots(): TimeSlotDef[] {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(CUSTOM_SLOTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }
  return STANDARD_TIME_SLOTS;
}

export function saveCustomSlots(newSlots: TimeSlotDef[]): TimeSlotDef[] {
  const sorted = sortTimeSlots(newSlots);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(CUSTOM_SLOTS_STORAGE_KEY, JSON.stringify(sorted));
    } catch {
      // ignore
    }
  }
  return sorted;
}

export function matchStandardRoom(
  roomStr?: string,
  rooms: string[] = STANDARD_ROOMS,
): string | undefined {
  if (!roomStr) return undefined;
  const clean = roomStr.trim().toLowerCase();
  // Exact match
  const exact = rooms.find((r) => r.toLowerCase() === clean);
  if (exact) return exact;
  // Short match (e.g. "Phòng 302" matches "Phòng 302 · Cơ sở Nguyễn Du")
  const shortMatch = rooms.find((r) => {
    const rShort = r.split("·")[0].trim().toLowerCase();
    const cleanShort = clean.split("·")[0].trim().toLowerCase();
    return rShort === cleanShort || r.toLowerCase().startsWith(clean) || clean.startsWith(rShort);
  });
  if (shortMatch) return shortMatch;
  return undefined;
}
