import { parseTargetBand } from "./academic-alert.service";

export type ClassHealthLevel = "healthy" | "watch" | "at-risk";

export interface ClassHealthResult {
  score: number;
  level: ClassHealthLevel;
}

export interface StudentSpotlightItem {
  studentId: string;
  studentCode: string;
  studentName: string;
  classId: string;
  classCode: string;
  className: string;
  status: "active" | "trial" | "on-leave" | "archived";
  attendanceRate: number;
  latestOverall: number | null;
  bandDelta: number | null;
  activeAlertCount: number;
  highAlertCount: number;
  highlightReason: string;
}

/**
 * Tính chỉ số Sức khỏe Lớp học (0–100) theo 4 trụ cột:
 * - Chuyên cần (30%)
 * - Tỷ lệ hoàn thành BTVN (25%)
 * - Tiến độ Khung chương trình (20%, trừ điểm nếu chậm tiến độ)
 * - Kết quả điểm thi so với Band mục tiêu & mật độ cảnh báo rủi ro (25%)
 */
export function computeClassHealthScore(input: {
  attendanceRate: number;
  homeworkRate: number | null;
  curriculumProgress: number;
  isBehindSchedule: boolean;
  averageScore: number | null;
  targetBand?: string;
  attentionRatio: number;
}): ClassHealthResult {
  const attScore = Math.min(100, Math.max(0, input.attendanceRate));
  const hwScore =
    input.homeworkRate !== null
      ? Math.min(100, Math.max(0, input.homeworkRate))
      : 85;

  let curriculumScore = Math.min(
    100,
    Math.max(40, input.curriculumProgress > 0 ? input.curriculumProgress + 35 : 70),
  );
  if (input.isBehindSchedule) {
    curriculumScore = Math.max(20, curriculumScore - 25);
  }

  let academicScore = 80;
  if (input.averageScore !== null && input.averageScore > 0) {
    const parsedTarget = input.targetBand ? parseTargetBand(input.targetBand) : null;
    if (parsedTarget && parsedTarget > 0) {
      const ratio = (input.averageScore / parsedTarget) * 100;
      academicScore = Math.min(100, Math.max(30, ratio));
    } else {
      academicScore = Math.min(100, Math.max(35, (input.averageScore / 9) * 110));
    }
  }

  const rawWeighted =
    attScore * 0.3 +
    hwScore * 0.25 +
    curriculumScore * 0.2 +
    academicScore * 0.25;
  const alertPenalty = Math.min(25, Math.round(input.attentionRatio * 35));
  const score = Math.round(
    Math.min(100, Math.max(0, rawWeighted - alertPenalty)),
  );

  const level: ClassHealthLevel =
    score >= 80 ? "healthy" : score >= 60 ? "watch" : "at-risk";
  return { score, level };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface AnalyticsCsvInput {
  kpi: {
    activeClassesCount: number;
    overallAttendanceRate: number;
    overallHomeworkRate: number;
    overallCurriculumProgress: number;
    studentsNeedingAttentionCount: number;
  };
  classComparisons: Array<{
    classCode: string;
    className: string;
    enrolled: number;
    capacity: number;
    healthScore: number;
    healthLevel: ClassHealthLevel;
    attendanceRate: number;
    homeworkRate: number | null;
    completedWeeks: number;
    totalWeeks: number;
    curriculumProgress: number;
    averageScore: number | null;
    attentionStudentCount: number;
  }>;
  alerts: Array<{
    severity: "high" | "medium";
    ackStatus: "active" | "acknowledged" | "resolved";
    classCode: string;
    studentName?: string;
    studentCode?: string;
    title: string;
    metricLabel: string;
    note?: string;
  }>;
  summaryMetrics?: {
    activeAlertsCount: number;
    highSeverityCount: number;
    journalCompletionRate: number;
    onLeaveStudentsCount: number;
  };
}

const HEALTH_LABEL_VI: Record<ClassHealthLevel, string> = {
  healthy: "Ổn định",
  watch: "Cần theo dõi",
  "at-risk": "Rủi ro",
};

export function buildClassAnalyticsCsv(report: AnalyticsCsvInput): string {
  const lines: string[] = [];

  lines.push(
    [
      "Mã lớp",
      "Tên lớp",
      "Sĩ số",
      "Điểm sức khỏe",
      "Trạng thái lớp",
      "Chuyên cần (%)",
      "Nộp BTVN (%)",
      "Tuần hoàn thành",
      "Tiến độ CT (%)",
      "Điểm TB công bố",
      "HS cần chú ý",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  for (const c of report.classComparisons) {
    lines.push(
      [
        c.classCode,
        c.className,
        `${c.enrolled}/${c.capacity}`,
        c.healthScore,
        HEALTH_LABEL_VI[c.healthLevel] ?? c.healthLevel,
        c.attendanceRate,
        c.homeworkRate ?? "Chưa ghi",
        `${c.completedWeeks}/${c.totalWeeks}`,
        c.curriculumProgress,
        c.averageScore ?? "Chưa có điểm",
        c.attentionStudentCount,
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  lines.push("");
  lines.push(
    [
      "Mức độ",
      "Trạng thái xử lý",
      "Mã lớp",
      "Học viên",
      "Cảnh báo",
      "Chỉ số",
      "Ghi chú can thiệp",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  for (const a of report.alerts) {
    lines.push(
      [
        a.severity === "high" ? "Cao" : "Trung bình",
        a.ackStatus,
        a.classCode,
        a.studentName ? `${a.studentName} (${a.studentCode ?? ""})` : "Cả lớp",
        a.title,
        a.metricLabel,
        a.note ?? "",
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  return `\uFEFF${lines.join("\r\n")}`;
}

export function buildAnalyticsExecutiveSummary(
  report: AnalyticsCsvInput,
): string {
  const lines: string[] = [
    "[BÁO CÁO PHÂN TÍCH HIỆU QUẢ LỚP HỌC]",
    `Số lớp đang vận hành: ${report.kpi.activeClassesCount}`,
    `Chuyên cần TB: ${report.kpi.overallAttendanceRate}% · Nộp BTVN TB: ${report.kpi.overallHomeworkRate}% · Tiến độ CT: ${report.kpi.overallCurriculumProgress}%`,
    `Số học sinh cần chú ý: ${report.kpi.studentsNeedingAttentionCount}${report.summaryMetrics ? ` (${report.summaryMetrics.highSeverityCount} cảnh báo ưu tiên cao · Hoàn tất Nhật ký: ${report.summaryMetrics.journalCompletionRate}%)` : ""}`,
  ];

  const ranked = [...report.classComparisons].sort(
    (a, b) => b.healthScore - a.healthScore,
  );
  if (ranked.length > 0) {
    lines.push("", "Xếp hạng Sức khỏe lớp học:");
    for (const cls of ranked) {
      lines.push(
        `• ${cls.classCode} — ${cls.className}: ${cls.healthScore}/100 (${HEALTH_LABEL_VI[cls.healthLevel]}) · CC ${cls.attendanceRate}% · CT ${cls.curriculumProgress}%${cls.averageScore !== null ? ` · TB ${cls.averageScore.toFixed(1)}` : ""}`,
      );
    }
  }

  const urgentAlerts = report.alerts.filter(
    (a) => a.ackStatus !== "resolved" && a.severity === "high",
  );
  if (urgentAlerts.length > 0) {
    lines.push("", `Cảnh báo ưu tiên cao chưa xử lý (${urgentAlerts.length}):`);
    for (const a of urgentAlerts.slice(0, 6)) {
      lines.push(
        `• [${a.classCode}] ${a.studentName ? `${a.studentName}: ` : ""}${a.title} (${a.metricLabel})`,
      );
    }
  }

  lines.push("", "Người tổng hợp: ThS. Nguyễn Minh Anh");
  return lines.join("\n");
}
