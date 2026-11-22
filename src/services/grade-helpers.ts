import type { AdminStudentRecord } from "./classroom-data";

export type GradePublishStatus = "published" | "draft";

export interface GradeCommentChip {
  id: string;
  label: string;
  text: string;
  skill: "Listening" | "Reading" | "Writing" | "Speaking" | "General";
}

export const GRADE_COMMENT_CHIPS: GradeCommentChip[] = [
  {
    id: "chip-l-good",
    label: "Nghe bắt ý tốt",
    text: "Kỹ năng Listening tiến bộ rõ rệt, nhận diện từ khóa và bẫy câu hỏi chính xác.",
    skill: "Listening",
  },
  {
    id: "chip-l-support",
    label: "Luyện thêm Dictation",
    text: "Cần rèn thêm tốc độ nghe Section 3–4 và chính tả số/tên riêng.",
    skill: "Listening",
  },
  {
    id: "chip-r-good",
    label: "Đọc hiểu chắc",
    text: "Xử lý tốt các dạng True/False/Not Given và paraphrasing học thuật.",
    skill: "Reading",
  },
  {
    id: "chip-r-support",
    label: "Tăng tốc Skimming",
    text: "Cần phân bổ thời gian Reading Passage 3 hợp lý hơn, tránh sa đà một câu.",
    skill: "Reading",
  },
  {
    id: "chip-w-good",
    label: "Writing mạch lạc",
    text: "Bài viết có cấu trúc lập luận rõ, dùng từ nối tự nhiên và ít lỗi ngữ pháp.",
    skill: "Writing",
  },
  {
    id: "chip-w-support",
    label: "Ôn cấu trúc câu phức",
    text: "Cần phát triển ý sâu hơn ở Task 2 và kiểm tra lại thì/mệnh đề quan hệ.",
    skill: "Writing",
  },
  {
    id: "chip-s-good",
    label: "Speaking tự tin",
    text: "Phát âm rõ ràng, ngữ điệu tự nhiên và mở rộng câu trả lời Part 2–3 tốt.",
    skill: "Speaking",
  },
  {
    id: "chip-s-support",
    label: "Giảm ngập ngừng",
    text: "Cần luyện phản xạ trả lời Part 3 trôi chảy hơn và đa dạng hóa collocations.",
    skill: "Speaking",
  },
];

export interface AssessmentSummaryItem {
  title: string;
  classroomId?: string | null;
  classCode?: string | null;
  className?: string | null;
  examDate?: string | null;
  gradedCount: number;
  publishedCount: number;
  draftCount: number;
  averageOverall: number | null;
  latestDate?: string;
}

export interface GradeAuditEntry {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  className: string;
  assessmentTitle: string;
  oldScore: number;
  newScore: number;
  changedAt: string;
  changedBy: string;
  reason?: string;
}

export interface GradeSkillAverages {
  gradedCount: number;
  totalCount: number;
  publishedCount: number;
  draftCount: number;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  speaking: number | null;
  overall: number | null;
  strongestSkill: string | null;
  weakestSkill: string | null;
}

export function computeIeltsOverall(
  listening: number,
  reading: number,
  writing: number,
  speaking: number,
): number {
  const raw = (listening + reading + writing + speaking) / 4;
  return Math.round(raw * 2) / 2;
}

/** Chuẩn hóa DD/MM/YYYY hoặc YYYY-MM-DD về YYYY-MM-DD để sắp xếp */
export function parseGradeDateToIso(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const viMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (viMatch) {
    const day = viMatch[1].padStart(2, "0");
    const month = viMatch[2].padStart(2, "0");
    return `${viMatch[3]}-${month}-${day}`;
  }
  return trimmed;
}

/** Chuyển YYYY-MM-DD sang DD/MM/YYYY hiển thị tiếng Việt */
export function formatGradeDateVi(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split("/");
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return trimmed;
}

export function computeAssessmentSkillAverages(
  rows: Array<{
    listening: number | null;
    reading: number | null;
    writing: number | null;
    speaking: number | null;
    overall: number | null;
    status?: GradePublishStatus | "ungraded";
  }>,
): GradeSkillAverages {
  const totalCount = rows.length;
  let gradedCount = 0;
  let publishedCount = 0;
  let draftCount = 0;
  let sumL = 0;
  let sumR = 0;
  let sumW = 0;
  let sumS = 0;
  let sumO = 0;

  for (const r of rows) {
    const hasAll =
      r.listening !== null &&
      r.reading !== null &&
      r.writing !== null &&
      r.speaking !== null;
    if (!hasAll) continue;

    gradedCount += 1;
    if (r.status === "draft") draftCount += 1;
    else publishedCount += 1;

    sumL += r.listening!;
    sumR += r.reading!;
    sumW += r.writing!;
    sumS += r.speaking!;
    sumO +=
      r.overall ??
      computeIeltsOverall(r.listening!, r.reading!, r.writing!, r.speaking!);
  }

  if (gradedCount === 0) {
    return {
      gradedCount: 0,
      totalCount,
      publishedCount: 0,
      draftCount: 0,
      listening: null,
      reading: null,
      writing: null,
      speaking: null,
      overall: null,
      strongestSkill: null,
      weakestSkill: null,
    };
  }

  const listening = Math.round((sumL / gradedCount) * 10) / 10;
  const reading = Math.round((sumR / gradedCount) * 10) / 10;
  const writing = Math.round((sumW / gradedCount) * 10) / 10;
  const speaking = Math.round((sumS / gradedCount) * 10) / 10;
  const overall = Math.round((sumO / gradedCount) * 10) / 10;

  const skillPairs = [
    { name: "Listening", val: listening },
    { name: "Reading", val: reading },
    { name: "Writing", val: writing },
    { name: "Speaking", val: speaking },
  ];
  const sorted = [...skillPairs].sort((a, b) => b.val - a.val);

  return {
    gradedCount,
    totalCount,
    publishedCount,
    draftCount,
    listening,
    reading,
    writing,
    speaking,
    overall,
    strongestSkill: sorted[0]?.name ?? null,
    weakestSkill:
      sorted[sorted.length - 1] && sorted[sorted.length - 1].val < sorted[0].val
        ? sorted[sorted.length - 1].name
        : null,
  };
}

export function computeStudentGradeDelta(
  student: Pick<AdminStudentRecord, "grades">,
  currentAssessmentTitle: string,
  currentOverall: number | null,
): { previousOverall: number | null; delta: number | null } {
  if (currentOverall === null) {
    return { previousOverall: null, delta: null };
  }
  const previousPublished = (student.grades ?? []).find(
    (g) =>
      g.assessmentTitle !== currentAssessmentTitle &&
      (g.status ?? "published") !== "draft",
  );
  if (!previousPublished) {
    return { previousOverall: null, delta: null };
  }
  const delta =
    Math.round((currentOverall - previousPublished.overall) * 10) / 10;
  return {
    previousOverall: previousPublished.overall,
    delta,
  };
}

/**
 * Tạo bản tin kết quả kiểm tra gửi Phụ huynh (Zalo / Email).
 * TUYỆT ĐỐI không đưa privateNote nội bộ của giáo viên vào bản tin.
 */
export function buildGradeParentReport(input: {
  assessmentTitle: string;
  date?: string;
  classLabel?: string;
  entries: Array<{
    code: string;
    fullName: string;
    className: string;
    listening: number;
    reading: number;
    writing: number;
    speaking: number;
    overall: number;
    comment: string;
    delta?: number | null;
  }>;
}): string {
  const displayDate = input.date ? formatGradeDateVi(input.date) : "";
  const isSingle = input.entries.length === 1;
  const lines: string[] = [
    `[PHIẾU BÁO ĐIỂM & NHẬN XÉT] ${input.assessmentTitle}`,
    ...(input.classLabel ? [`Lớp: ${input.classLabel}`] : []),
    ...(displayDate ? [`Ngày đánh giá: ${displayDate}`] : []),
  ];

  if (input.entries.length === 0) {
    lines.push("", "Chưa có học viên nào được chấm điểm trong kỳ đánh giá này.");
  } else if (isSingle) {
    const e = input.entries[0];
    const deltaStr =
      typeof e.delta === "number" && e.delta !== 0
        ? ` (${e.delta > 0 ? `+${e.delta}` : e.delta} so với kỳ trước)`
        : "";
    lines.push(
      "",
      `Học viên: ${e.fullName} (${e.code}) · ${e.className}`,
      `Điểm 4 kỹ năng: Listening ${e.listening.toFixed(1)} · Reading ${e.reading.toFixed(1)} · Writing ${e.writing.toFixed(1)} · Speaking ${e.speaking.toFixed(1)}`,
      `Overall quy chuẩn: ${e.overall.toFixed(1)}${deltaStr}`,
    );
    if (e.comment?.trim()) {
      lines.push("", `Nhận xét chuyên môn của giáo viên:`, e.comment.trim());
    }
  } else {
    const avgOverall =
      Math.round(
        (input.entries.reduce((s, r) => s + r.overall, 0) /
          input.entries.length) *
          10,
      ) / 10;
    lines.push(
      `Số học viên đã chấm: ${input.entries.length} · Overall trung bình: ${avgOverall.toFixed(1)}`,
      "",
      "Kết quả chi tiết từng học viên:",
    );
    for (const e of input.entries) {
      const deltaStr =
        typeof e.delta === "number" && e.delta !== 0
          ? ` (${e.delta > 0 ? `+${e.delta}` : e.delta})`
          : "";
      lines.push(
        `• ${e.fullName} (${e.code}) — Overall ${e.overall.toFixed(1)}${deltaStr} [L ${e.listening.toFixed(1)} | R ${e.reading.toFixed(1)} | W ${e.writing.toFixed(1)} | S ${e.speaking.toFixed(1)}]${e.comment?.trim() ? `: ${e.comment.trim()}` : ""}`,
      );
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

/**
 * Xuất bảng điểm kỳ kiểm tra dạng CSV UTF-8 BOM.
 * KHÔNG bao giờ xuất privateNote nội bộ giáo viên.
 */
export function buildGradesCsv(input: {
  assessmentTitle: string;
  rows: Array<{
    code: string;
    fullName: string;
    className: string;
    date?: string;
    status: GradePublishStatus | "ungraded";
    listening: number | null;
    reading: number | null;
    writing: number | null;
    speaking: number | null;
    overall: number | null;
    comment: string;
  }>;
}): string {
  const headers = [
    "Mã HS",
    "Họ và tên",
    "Lớp học",
    "Kỳ kiểm tra",
    "Ngày thi",
    "Trạng thái",
    "Listening",
    "Reading",
    "Writing",
    "Speaking",
    "Overall",
    "Nhận xét chuyên môn",
  ];

  const statusVi: Record<GradePublishStatus | "ungraded", string> = {
    published: "Đã công bố",
    draft: "Bản nháp",
    ungraded: "Chưa chấm",
  };

  const csvRows = input.rows.map((r) =>
    [
      r.code,
      r.fullName,
      r.className,
      input.assessmentTitle,
      r.date ? formatGradeDateVi(r.date) : "",
      statusVi[r.status] ?? r.status,
      r.listening ?? "",
      r.reading ?? "",
      r.writing ?? "",
      r.speaking ?? "",
      r.overall ?? "",
      r.comment,
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return `\uFEFF${[headers.map(escapeCsvCell).join(","), ...csvRows].join("\r\n")}`;
}
