import { parseTargetBand } from "./academic-alert.service";
import type { AdminStudentRecord, TuitionPaymentRecord } from "./classroom-data";
import { parseGradeDateToIso } from "./grade-helpers";

export interface StudentPortalAccountItem {
  profileId: string | null;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  email: string | null;
  role: "admin" | "student";
  isActive: boolean;
  hasAuthAccount: boolean;
  lastSignInAt: string | null;
}

export interface StudentsSummaryStats {
  totalAll: number;
  totalNonArchived: number;
  totalActive: number;
  totalTrial: number;
  totalOnLeave: number;
  totalArchived: number;
  avgIeltsScore: string;
  highAchieversCount: number;
  avgAttendanceRate: string;
  dueSoonCount: number;
  overdueCount: number;
  totalTuitionAlerts: number;
  alertsCount: number;
}

export function formatDisplayDate(val?: string): string {
  if (!val) return "—";
  if (val.includes("/")) return val;
  const parts = val.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return val;
}

export function toInputDateFormat(val?: string): string {
  if (!val) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const parts = val.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return val;
}

export function formatVnd(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  return `${safe.toLocaleString("vi-VN")} ₫`;
}

export function parseVndAmount(str?: string): number {
  if (!str) return 0;
  const digits = str.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function maskPhoneNumber(phone?: string): string {
  const clean = (phone ?? "").replace(/\s+/g, "").trim();
  if (!clean) return "";
  if (clean.length < 7) return clean;
  return `${clean.slice(0, 4)} ••• ${clean.slice(-3)}`;
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "," || char === ";") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export const STUDENT_STATUS_META: Record<
  AdminStudentRecord["status"],
  { label: string; shortLabel: string; badgeClass: string }
> = {
  active: {
    label: "Đang theo học",
    shortLabel: "Đang học",
    badgeClass: "border-emerald-300 bg-emerald-500/10 text-emerald-700",
  },
  trial: {
    label: "Học thử",
    shortLabel: "Học thử",
    badgeClass: "border-sky-300 bg-sky-500/10 text-sky-700",
  },
  "on-leave": {
    label: "Đang bảo lưu",
    shortLabel: "Bảo lưu",
    badgeClass: "border-amber-300 bg-amber-500/10 text-amber-800",
  },
  archived: {
    label: "Đã lưu trữ",
    shortLabel: "Đã lưu trữ",
    badgeClass: "border-slate-300 bg-slate-500/10 text-slate-600",
  },
};

export interface StudentSkillProfile {
  hasGrades: boolean;
  entryBand: number | null;
  currentBand: number | null;
  targetBand: number | null;
  bandDelta: number | null;
  skills: {
    key: "listening" | "reading" | "writing" | "speaking";
    label: string;
    score: number;
  }[];
  strongestSkill: { label: string; score: number } | null;
  weakestSkill: { label: string; score: number } | null;
}

export function computeStudentSkillProfile(
  student: AdminStudentRecord,
): StudentSkillProfile {
  const grades = [...(student.grades ?? [])]
    .filter((g) => (g.status ?? "published") !== "draft")
    .sort((a, b) =>
      parseGradeDateToIso(b.date).localeCompare(parseGradeDateToIso(a.date)),
    );
  const targetBand = parseTargetBand(student.targetGoal);

  if (grades.length === 0) {
    return {
      hasGrades: false,
      entryBand: student.entryBand ?? null,
      currentBand: student.averageScore > 0 ? student.averageScore : null,
      targetBand,
      bandDelta: null,
      skills: [
        { key: "listening", label: "Listening", score: 0 },
        { key: "reading", label: "Reading", score: 0 },
        { key: "writing", label: "Writing", score: 0 },
        { key: "speaking", label: "Speaking", score: 0 },
      ],
      strongestSkill: null,
      weakestSkill: null,
    };
  }

  const avg = (getter: (g: (typeof grades)[number]) => number) =>
    Number(
      (grades.reduce((sum, g) => sum + getter(g), 0) / grades.length).toFixed(1),
    );

  const skills: StudentSkillProfile["skills"] = [
    { key: "listening", label: "Listening", score: avg((g) => g.listening) },
    { key: "reading", label: "Reading", score: avg((g) => g.reading) },
    { key: "writing", label: "Writing", score: avg((g) => g.writing) },
    { key: "speaking", label: "Speaking", score: avg((g) => g.speaking) },
  ];

  const sortedSkills = [...skills].sort((a, b) => b.score - a.score);
  const strongestSkill = {
    label: sortedSkills[0].label,
    score: sortedSkills[0].score,
  };
  const weakestSkill = {
    label: sortedSkills[sortedSkills.length - 1].label,
    score: sortedSkills[sortedSkills.length - 1].score,
  };

  const oldestGrade = grades[grades.length - 1];
  const entryBand = student.entryBand ?? oldestGrade?.overall ?? null;
  const currentBand =
    student.averageScore > 0
      ? student.averageScore
      : grades[0]?.overall ?? null;
  const bandDelta =
    entryBand !== null && currentBand !== null
      ? Number((currentBand - entryBand).toFixed(2))
      : null;

  return {
    hasGrades: true,
    entryBand,
    currentBand,
    targetBand,
    bandDelta,
    skills,
    strongestSkill,
    weakestSkill,
  };
}

export function computeTuitionLedgerSummary(student: AdminStudentRecord): {
  totalBase: number;
  totalDiscount: number;
  totalPayable: number;
  totalPaid: number;
  remainingDebt: number;
} {
  const history = student.tuitionHistory ?? [];
  if (history.length === 0) {
    const base = parseVndAmount(student.tuitionAmount) || 5800000;
    const paid = student.tuitionStatus === "paid" ? base : 0;
    return {
      totalBase: base,
      totalDiscount: 0,
      totalPayable: base,
      totalPaid: paid,
      remainingDebt: Math.max(0, base - paid),
    };
  }

  const totalBase = history.reduce((sum, item) => sum + (item.baseAmount || 0), 0);
  const totalDiscount = history.reduce(
    (sum, item) => sum + (item.discountAmount || 0),
    0,
  );
  const totalPayable = Math.max(0, totalBase - totalDiscount);
  const totalPaid = history.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
  const remainingDebt = Math.max(0, totalPayable - totalPaid);

  return { totalBase, totalDiscount, totalPayable, totalPaid, remainingDebt };
}

export function buildTuitionReceiptMessage(
  student: AdminStudentRecord,
  payment: TuitionPaymentRecord,
): string {
  const payable = Math.max(0, payment.baseAmount - (payment.discountAmount || 0));
  const remaining = Math.max(0, payable - payment.paidAmount);
  const paidDate = payment.paidAt
    ? formatDisplayDate(payment.paidAt)
    : formatDisplayDate(new Date().toISOString().slice(0, 10));
  const methodLabel =
    payment.method === "cash"
      ? "Tiền mặt"
      : payment.method === "transfer"
        ? "Chuyển khoản"
        : "Thanh toán trực tiếp";

  if (remaining === 0) {
    return [
      `[XÁC NHẬN HỌC PHÍ] Kính gửi ${student.parentName || student.parentRelation || "Quý Phụ huynh / Học viên"},`,
      `Cô Minh Anh xác nhận đã nhận đủ học phí ${payment.period} cho học viên ${student.fullName} (${student.code} - Lớp ${student.className}).`,
      `- Số tiền đã thu: ${formatVnd(payment.paidAmount)} (${methodLabel}, ngày ${paidDate})${payment.receiptCode ? ` · Mã phiếu: ${payment.receiptCode}` : ""}.`,
      `Trân trọng cảm ơn gia đình đã luôn đồng hành cùng lớp học!`,
    ].join("\n");
  }

  return [
    `[BIÊN NHẬN HỌC PHÍ ĐỢT] Kính gửi ${student.parentName || student.parentRelation || "Quý Phụ huynh / Học viên"},`,
    `Cô Minh Anh xác nhận đã nhận ${formatVnd(payment.paidAmount)} (${methodLabel}, ngày ${paidDate}) học phí ${payment.period} cho em ${student.fullName} (${student.code}).`,
    `- Số tiền còn lại cần hoàn tất trước ${formatDisplayDate(payment.dueDate)}: ${formatVnd(remaining)}.`,
    `Cảm ơn gia đình rất nhiều!`,
  ].join("\n");
}

export function buildStudentProgressReportText(
  student: AdminStudentRecord,
  profile: StudentSkillProfile = computeStudentSkillProfile(student),
): string {
  const lines: string[] = [
    `PHIẾU BÁO CÁO TIẾN ĐỘ HỌC TẬP — ${student.fullName.toUpperCase()} (${student.code})`,
    `Lớp: ${student.className} (${student.level}) · Mục tiêu: ${student.targetGoal}`,
    `--------------------------------------------------`,
    `1. Chuyên cần: ${student.attendanceHistory.length > 0 ? `${student.attendanceRate}%` : "Chưa có dữ liệu điểm danh"}`,
  ];

  if (profile.hasGrades) {
    const scoreStr = profile.currentBand !== null ? profile.currentBand.toFixed(1) : "—";
    const deltaStr =
      profile.bandDelta !== null
        ? ` (${profile.bandDelta >= 0 ? "+" : ""}${profile.bandDelta.toFixed(1)} so với đầu vào)`
        : "";
    lines.push(`2. Điểm đánh giá hiện tại: ${scoreStr}${deltaStr}`);
    lines.push(
      `   Chi tiết 4 kỹ năng: ${profile.skills.map((s) => `${s.label} ${s.score.toFixed(1)}`).join(" | ")}`,
    );
    if (profile.strongestSkill && profile.weakestSkill) {
      lines.push(
        `   Điểm mạnh: ${profile.strongestSkill.label} (${profile.strongestSkill.score.toFixed(1)}) · Cần tập trung thêm: ${profile.weakestSkill.label} (${profile.weakestSkill.score.toFixed(1)})`,
      );
    }
  } else {
    lines.push(`2. Điểm đánh giá: Học viên mới nhập học, chưa có bài kiểm tra định kỳ.`);
  }

  const tuitionLabel =
    student.tuitionStatus === "paid"
      ? "Đã hoàn thành"
      : student.tuitionStatus === "due-soon"
        ? `Sắp đến hạn (${formatDisplayDate(student.tuitionDueDate)})`
        : `Quá hạn (${formatDisplayDate(student.tuitionDueDate)})`;
  lines.push(`3. Học phí (${student.tuitionPeriod}): ${tuitionLabel}`);
  lines.push(
    `4. Nhận xét của giáo viên: ${student.recentComment || "Theo sát tiến độ trên lớp."}`,
  );
  lines.push(`— ThS. Nguyễn Minh Anh (Academic English & Mentorship)`);

  // Tuyệt đối không bao gồm privateNote trong phiếu báo cáo gửi phụ huynh/học sinh
  return lines.join("\n");
}
