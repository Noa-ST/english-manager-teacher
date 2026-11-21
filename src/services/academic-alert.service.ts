import type { AdminStudentRecord } from "./classroom-data";
import { parseGradeDateToIso } from "./grade-helpers";

export interface AcademicAlertSettings {
  attendanceThreshold: number; // Mặc định: 80 (%)
  alertOnScoreDrop: boolean; // Mặc định: true (Điểm TB giảm liên tiếp)
  alertOnOverdueTuition: boolean; // Mặc định: true (Học phí quá hạn)
  alertOnNoGrades: boolean; // Mặc định: true (Chưa có bài kiểm tra/đánh giá)
  alertBelowTarget: boolean; // Mặc định: true (Điểm dưới mục tiêu)
}

export const DEFAULT_ALERT_SETTINGS: AcademicAlertSettings = {
  attendanceThreshold: 80,
  alertOnScoreDrop: true,
  alertOnOverdueTuition: true,
  alertOnNoGrades: true,
  alertBelowTarget: true,
};

export const ALERT_SETTINGS_STORAGE_KEY = "english_manager_academic_alert_settings_v1";

export interface StudentAcademicAlert {
  type: "attendance" | "score-drop" | "tuition" | "no-grades" | "below-target";
  level: "warning" | "destructive" | "info";
  title: string;
  description: string;
}

/**
 * Trích xuất mục tiêu điểm (IELTS band hoặc điểm số) từ chuỗi targetGoal của học sinh.
 */
export function parseTargetBand(goal: string | undefined | null): number | null {
  if (!goal) return null;
  // Loại bỏ mã trình độ CEFR (A1, A2, B1, B2, C1, C2...) để tránh nhận nhầm "B1" -> 1.0
  const cleaned = goal.replace(/\b[ABC][12]\+?\b/gi, " ");
  // Khớp "IELTS 7.5", "Band 8.0", "Writing 7.5+", "Mục tiêu: 6.5", "Đạt tối thiểu 5 điểm"
  const match = cleaned.match(
    /(?:IELTS|Band|mục tiêu|tối thiểu|writing|reading|speaking|listening)?\s*([0-9]+(?:\.[0-9]+)?)/i,
  );
  if (match && match[1]) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val >= 1 && val <= 10) return val;
  }
  return null;
}

/**
 * Tự động nhận diện các cảnh báo học vụ của học sinh theo cấu hình ngưỡng linh hoạt.
 */
export function getStudentAcademicAlerts(
  student: AdminStudentRecord,
  settings: AcademicAlertSettings = DEFAULT_ALERT_SETTINGS,
): StudentAcademicAlert[] {
  if (student.status === "archived") {
    return [];
  }

  const alerts: StudentAcademicAlert[] = [];
  const isTrial = student.status === "trial";
  const isOnLeave = student.status === "on-leave";

  // 1. Chuyên cần dưới ngưỡng cấu hình (Mặc định < 80%) — tạm hoãn khi đang bảo lưu
  if (
    !isOnLeave &&
    settings.attendanceThreshold > 0 &&
    student.attendanceHistory.length > 0 &&
    student.attendanceRate < settings.attendanceThreshold
  ) {
    alerts.push({
      type: "attendance",
      level:
        student.attendanceRate < settings.attendanceThreshold - 10
          ? "destructive"
          : "warning",
      title: "Cần theo dõi chuyên cần",
      description: `Chuyên cần hiện tại đạt ${student.attendanceRate}% (dưới ngưỡng ${settings.attendanceThreshold}%).`,
    });
  }

  // 2. Điểm TB giảm liên tiếp (so sánh 2 bài kiểm tra ĐÃ CÔNG BỐ gần nhất theo ngày tháng)
  const publishedGrades = student.grades.filter(
    (g) => (g.status ?? "published") !== "draft",
  );
  if (settings.alertOnScoreDrop && publishedGrades.length >= 2) {
    const sortedGrades = [...publishedGrades].sort((a, b) =>
      parseGradeDateToIso(b.date).localeCompare(parseGradeDateToIso(a.date)),
    );

    const newest = sortedGrades[0];
    const previous = sortedGrades[1];

    if (newest && previous && newest.overall < previous.overall) {
      alerts.push({
        type: "score-drop",
        level: "warning",
        title: "Tiến độ học tập giảm",
        description: `Bài "${newest.assessmentTitle}" đạt ${newest.overall.toFixed(1)}, giảm ${(previous.overall - newest.overall).toFixed(1)} band so với bài trước (${previous.overall.toFixed(1)}).`,
      });
    }
  }

  // 3. Học phí quá hạn — không cảnh báo khi học thử hoặc đang bảo lưu
  if (
    !isTrial &&
    !isOnLeave &&
    settings.alertOnOverdueTuition &&
    student.tuitionStatus === "overdue"
  ) {
    alerts.push({
      type: "tuition",
      level: "destructive",
      title: "Chưa hoàn thành học phí",
      description: `Học sinh đang quá hạn học phí (${student.tuitionPeriod || "Kỳ học hiện tại"}).`,
    });
  }

  // 4. Không có điểm trong thời gian dài / Chưa có đánh giá — bỏ qua cho học thử
  if (
    !isTrial &&
    settings.alertOnNoGrades &&
    (student.grades.length === 0 || student.averageScore === 0)
  ) {
    alerts.push({
      type: "no-grades",
      level: "info",
      title: "Chưa có đánh giá gần đây",
      description: "Học sinh chưa có bài kiểm tra hoặc điểm đánh giá năng lực.",
    });
  }

  // 5. Điểm dưới mục tiêu
  if (
    settings.alertBelowTarget &&
    student.averageScore > 0 &&
    student.targetGoal
  ) {
    const target = parseTargetBand(student.targetGoal);
    if (target !== null && student.averageScore < target) {
      alerts.push({
        type: "below-target",
        level: "warning",
        title: "Điểm dưới mục tiêu",
        description: `Điểm hiện tại (${student.averageScore.toFixed(1)}) thấp hơn mục tiêu đề ra (${target.toFixed(1)}).`,
      });
    }
  }

  return alerts;
}

export type AcademicFilterOption =
  | "all"
  | "has-alerts"
  | "no-grades"
  | "below-target"
  | "low-attendance"
  | "no-recent-comment";

/**
 * Kiểm tra xem học sinh có thỏa mãn bộ lọc tình trạng học tập hay không.
 */
export function matchesAcademicFilter(
  student: AdminStudentRecord,
  filter: AcademicFilterOption,
  settings: AcademicAlertSettings = DEFAULT_ALERT_SETTINGS,
): boolean {
  if (filter === "all") return true;

  if (filter === "has-alerts") {
    return getStudentAcademicAlerts(student, settings).length > 0;
  }

  if (filter === "no-grades") {
    return student.grades.length === 0 || student.averageScore === 0;
  }

  if (filter === "below-target") {
    const target = parseTargetBand(student.targetGoal);
    return (
      target !== null &&
      student.averageScore > 0 &&
      student.averageScore < target
    );
  }

  if (filter === "low-attendance") {
    return (
      student.attendanceHistory.length > 0 &&
      student.attendanceRate < settings.attendanceThreshold
    );
  }

  if (filter === "no-recent-comment") {
    return (
      !student.recentComment ||
      student.recentComment.trim() === "" ||
      student.recentComment.toLowerCase().includes("chưa có nhận xét") ||
      student.recentComment.toLowerCase().includes("mới nhập học")
    );
  }

  return true;
}
