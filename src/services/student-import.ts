import type { ClassroomGroup } from "./classroom-data";
import { parseCsvLine } from "./student-helpers";

export interface ParsedImportStudent {
  code: string;
  fullName: string;
  classId: string;
  className: string;
  level: string;
  status: "active" | "trial" | "on-leave" | "archived";
  statusLabel: string;
  tuitionStatus: "paid" | "due-soon" | "overdue";
  tuitionDueDate: string;
  tuitionAmount: string;
  tuitionPeriod: string;
  parentName: string;
  parentPhone: string;
  targetGoal: string;
  recentComment: string;
  joinedAt: string;
  isValid: boolean;
  errorReason?: string;
}

export interface ParseStudentCsvResult {
  rows: ParsedImportStudent[];
  detectedColumnCount: number;
  error?: string;
}

export function cleanCsvHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCsvDate(val?: string): string {
  if (!val) return "";
  const trimmed = val.trim();
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

export function normalizeCsvPhone(val?: string): string {
  if (!val) return "";
  let digits = val.replace(/\D/g, "");
  // Excel commonly strips the leading 0 from 10-digit VN phone numbers: 945332900 -> 0945332900
  if (digits.length === 9 && !digits.startsWith("0")) {
    digits = "0" + digits;
  }
  return digits;
}

export function normalizeCsvTuitionAmount(val?: string): string {
  if (!val) return "5.800.000 ₫";
  const trimmed = val.trim();
  if (trimmed.endsWith("₫") || trimmed.endsWith("đ") || trimmed.endsWith("VND")) {
    return trimmed;
  }
  const numeric = parseInt(trimmed.replace(/\D/g, ""), 10);
  if (!isNaN(numeric)) {
    return numeric.toLocaleString("vi-VN") + " ₫";
  }
  return trimmed || "5.800.000 ₫";
}

export function findBestMatchingClass(
  rawClass: string,
  classes: ClassroomGroup[],
): ClassroomGroup | undefined {
  if (!rawClass) return classes[0];
  const query = rawClass.trim().toLowerCase();

  // 1. Exact ID or Code match
  const exact = classes.find(
    (c) => c.id.toLowerCase() === query || c.code.toLowerCase() === query,
  );
  if (exact) return exact;

  // 2. Exact or substring name match
  const byName = classes.find(
    (c) =>
      c.name.toLowerCase() === query ||
      c.name.toLowerCase().includes(query) ||
      query.includes(c.name.toLowerCase()),
  );
  if (byName) return byName;

  // 3. Keyword matching
  const keywords = query.split(/[\s\-_,()]+/);
  let bestMatch: ClassroomGroup | undefined = undefined;
  let maxMatchedKeywords = 0;

  for (const c of classes) {
    const cText = `${c.name} ${c.code} ${c.level}`.toLowerCase();
    const matchCount = keywords.filter((k) => k.length >= 3 && cText.includes(k)).length;
    if (matchCount > maxMatchedKeywords) {
      maxMatchedKeywords = matchCount;
      bestMatch = c;
    }
  }

  return bestMatch ?? classes[0];
}

export function parseStudentImportCsv(
  rawContent: string,
  classes: ClassroomGroup[],
  existingCodes: string[],
  todayIso: string = new Date().toISOString().slice(0, 10),
): ParseStudentCsvResult {
  const content = rawContent.replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    return {
      rows: [],
      detectedColumnCount: 0,
      error: "File không chứa dữ liệu học sinh.",
    };
  }

  const headerCols = parseCsvLine(lines[0]);
  const cleanHeaders = headerCols.map(cleanCsvHeader);
  const isHeaderRow =
    cleanHeaders.some(
      (h) => h.includes("ma hoc sinh") || h.includes("ma hs") || h === "code" || h.includes("student"),
    ) ||
    cleanHeaders.some((h) => h.includes("ho va ten") || h.includes("ho ten") || h.includes("full name"));

  const startIndex = isHeaderRow ? 1 : 0;

  const findColIdx = (predicate: (h: string) => boolean) =>
    cleanHeaders.findIndex(predicate);

  let codeIdx = findColIdx(
    (h) =>
      h.includes("ma hoc sinh") ||
      h.includes("ma hs") ||
      h === "ma" ||
      h === "code" ||
      h === "student id" ||
      (h.includes("ma") && !h.includes("lop")),
  );
  let nameIdx = findColIdx(
    (h) =>
      (h.includes("ho va ten") ||
        h.includes("ho ten") ||
        h.includes("ten hoc sinh") ||
        h === "ten" ||
        h.includes("full name") ||
        h === "name") &&
      !h.includes("phu huynh") &&
      !h.includes("lop"),
  );
  let classIdx = findColIdx((h) => h.includes("lop") || h.includes("class"));
  const levelIdx = findColIdx(
    (h) => h.includes("trinh do") || h.includes("level") || h.includes("cefr"),
  );
  const statusIdx = findColIdx(
    (h) =>
      (h.includes("tinh trang") || h.includes("trang thai")) &&
      !h.includes("hoc phi"),
  );
  let tuitionStatusIdx = findColIdx(
    (h) =>
      h.includes("trang thai hoc phi") ||
      (h.includes("hoc phi") &&
        !h.includes("muc") &&
        !h.includes("ngay") &&
        !h.includes("han") &&
        !h.includes("ky") &&
        !h.includes("so tien")),
  );
  const tuitionDueDateIdx = findColIdx(
    (h) =>
      !h.includes("trang thai") &&
      (h.includes("ngay nop") ||
        h.includes("han nop") ||
        h.includes("han dong") ||
        h.includes("due date")),
  );
  const tuitionAmountIdx = findColIdx(
    (h) =>
      h.includes("muc hoc phi") ||
      h.includes("so tien") ||
      h.includes("amount") ||
      h.includes("tien hoc phi"),
  );
  const tuitionPeriodIdx = findColIdx(
    (h) => h.includes("ky hoc phi") || h.includes("hoc ky") || h.includes("period"),
  );
  const parentNameIdx = findColIdx(
    (h) =>
      h.includes("phu huynh") &&
      !h.includes("sdt") &&
      !h.includes("dien thoai") &&
      !h.includes("so"),
  );
  const parentPhoneIdx = findColIdx(
    (h) =>
      h.includes("sdt") ||
      h.includes("dien thoai") ||
      h.includes("phone"),
  );
  let targetGoalIdx = findColIdx(
    (h) => h.includes("muc tieu") || h.includes("goal") || h.includes("dau ra"),
  );
  let commentIdx = findColIdx(
    (h) =>
      h.includes("nhan xet") ||
      h.includes("ghi chu") ||
      h.includes("comment") ||
      h.includes("note"),
  );
  const joinedAtIdx = findColIdx(
    (h) => h.includes("nhap hoc") || h.includes("vao hoc") || h.includes("joined"),
  );

  // Positional fallbacks for headerless or minimal 6-column CSV files
  if (codeIdx === -1) codeIdx = 0;
  if (nameIdx === -1 || nameIdx === codeIdx) nameIdx = 1;
  if (classIdx === -1) classIdx = 2;

  if (!isHeaderRow || cleanHeaders.length <= 8) {
    if (targetGoalIdx === -1) targetGoalIdx = 3;
    if (tuitionStatusIdx === -1) tuitionStatusIdx = 4;
    if (commentIdx === -1) commentIdx = 5;
  }

  const detectedColsList = [
    codeIdx,
    nameIdx,
    classIdx,
    levelIdx,
    statusIdx,
    tuitionStatusIdx,
    tuitionDueDateIdx,
    tuitionAmountIdx,
    tuitionPeriodIdx,
    parentNameIdx,
    parentPhoneIdx,
    targetGoalIdx,
    commentIdx,
    joinedAtIdx,
  ].filter((idx) => idx !== -1);

  const existingSet = new Set(existingCodes.map((c) => c.toUpperCase()));
  const seenCodes = new Set<string>();
  const results: ParsedImportStudent[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2 || !cols.some((c) => c.length > 0)) continue;

    const rawCode = (codeIdx !== -1 ? cols[codeIdx] || "" : "").trim().toUpperCase();
    const fullName = (nameIdx !== -1 ? cols[nameIdx] || "" : "").trim();
    const rawClass = (classIdx !== -1 ? cols[classIdx] || "" : "").trim();
    const rawLevel = (levelIdx !== -1 ? cols[levelIdx] || "" : "").trim();
    const rawStatus = (statusIdx !== -1 ? cols[statusIdx] || "" : "").trim().toLowerCase();
    const rawTuition = (tuitionStatusIdx !== -1 ? cols[tuitionStatusIdx] || "" : "")
      .trim()
      .toLowerCase();
    const rawDueDate = tuitionDueDateIdx !== -1 ? cols[tuitionDueDateIdx] || "" : "";
    const rawAmount = tuitionAmountIdx !== -1 ? cols[tuitionAmountIdx] || "" : "";
    const rawPeriod = (tuitionPeriodIdx !== -1 ? cols[tuitionPeriodIdx] || "" : "").trim();
    const parentName = (parentNameIdx !== -1 ? cols[parentNameIdx] || "" : "").trim();
    const rawParentPhone = parentPhoneIdx !== -1 ? cols[parentPhoneIdx] || "" : "";
    const targetGoal =
      (targetGoalIdx !== -1 ? cols[targetGoalIdx] || "" : "").trim() ||
      "Đạt mục tiêu khóa học";
    const recentComment =
      (commentIdx !== -1 ? cols[commentIdx] || "" : "").trim() || "Nhập từ file CSV.";
    const rawJoinedAt = joinedAtIdx !== -1 ? cols[joinedAtIdx] || "" : "";

    let status: "active" | "trial" | "on-leave" | "archived" = "active";
    let statusLabel = "Đang học";
    if (
      rawStatus.includes("bảo lưu") ||
      rawStatus.includes("on-leave") ||
      rawStatus.includes("leave")
    ) {
      status = "on-leave";
      statusLabel = "Bảo lưu";
    } else if (rawStatus.includes("thử") || rawStatus.includes("trial")) {
      status = "trial";
      statusLabel = "Học thử";
    } else if (rawStatus.includes("lưu trữ") || rawStatus.includes("archived")) {
      status = "archived";
      statusLabel = "Lưu trữ";
    }

    let tuitionStatus: "paid" | "due-soon" | "overdue" = "due-soon";
    if (
      rawTuition === "paid" ||
      rawTuition.includes("đã đóng") ||
      rawTuition.includes("hoàn thành") ||
      rawTuition.includes("thanh toán")
    ) {
      tuitionStatus = "paid";
    } else if (rawTuition === "overdue" || rawTuition.includes("quá hạn")) {
      tuitionStatus = "overdue";
    }

    const matchedClass = findBestMatchingClass(rawClass, classes);
    const resolvedDueDate =
      normalizeCsvDate(rawDueDate) || matchedClass?.tuitionDueDate || todayIso;
    const resolvedAmount = normalizeCsvTuitionAmount(rawAmount);
    const resolvedPeriod = rawPeriod || "Học kỳ II (Tháng 11 – 01)";
    const normalizedPhone = normalizeCsvPhone(rawParentPhone);
    const resolvedJoinedAt = normalizeCsvDate(rawJoinedAt) || todayIso;

    let isValid = true;
    let errorReason = "";

    if (!rawCode) {
      isValid = false;
      errorReason = "Thiếu mã học sinh";
    } else if (!fullName) {
      isValid = false;
      errorReason = "Thiếu họ và tên";
    } else if (existingSet.has(rawCode)) {
      isValid = false;
      errorReason = `Mã "${rawCode}" đã tồn tại trong hệ thống`;
    } else if (seenCodes.has(rawCode)) {
      isValid = false;
      errorReason = `Mã "${rawCode}" bị trùng lặp trong file CSV`;
    }

    if (isValid) seenCodes.add(rawCode);

    results.push({
      code: rawCode,
      fullName,
      classId: matchedClass?.id ?? "cls-ii-01",
      className: matchedClass?.name ?? "IELTS Intensive (Band 6.5–7.5+)",
      level: rawLevel || matchedClass?.level || "B2+",
      status,
      statusLabel,
      tuitionStatus,
      tuitionDueDate: resolvedDueDate,
      tuitionAmount: resolvedAmount,
      tuitionPeriod: resolvedPeriod,
      parentName,
      parentPhone: normalizedPhone,
      targetGoal,
      recentComment,
      joinedAt: resolvedJoinedAt,
      isValid,
      errorReason,
    });
  }

  return {
    rows: results,
    detectedColumnCount: new Set(detectedColsList).size,
  };
}
