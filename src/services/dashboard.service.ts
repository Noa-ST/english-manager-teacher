import {
  type AdminStudentRecord,
  type AnnouncementItem,
  type ClassroomGroup,
  type WeeklyClassSession,
} from "./classroom-data";
import { isTimeOverlapping, normalizeRoomKey } from "./schedule-helper";
import {
  getStudentAcademicAlerts,
  type StudentAcademicAlert,
} from "./academic-alert.service";

export interface ScheduleConflictPair {
  sessionA: WeeklyClassSession;
  sessionB: WeeklyClassSession;
  conflictType: "room" | "teacher";
  reason: string;
}

export interface ClassPerformanceStat {
  id: string;
  code: string;
  name: string;
  averageScore: number;
  attendanceRate: number;
  enrolled: number;
  capacity: number;
  occupancyRate: number;
}

export interface ProgramTrackStat {
  id: string;
  trackKey: string;
  name: string;
  classCount: number;
  totalEnrolled: number;
  totalCapacity: number;
  occupancyRate: number;
  avgScore: number;
  attendanceRate: number;
  classes: ClassPerformanceStat[];
}

export type AlertSeverity = "critical" | "warning" | "info";

export interface PrioritizedAlertItem {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  classId: string;
  className: string;
  category: "tuition" | "academic" | "attendance";
  severity: AlertSeverity;
  badgeLabel: string;
  title: string;
  description: string;
  suggestedActionLabel: string;
  quickReminderText: string;
}

export interface ActionableStudentAlert {
  studentId: string;
  studentCode: string;
  studentName: string;
  className: string;
  tuitionStatus: "paid" | "due-soon" | "overdue";
  tuitionPeriod: string;
  academicAlerts: StudentAcademicAlert[];
}

export interface DashboardMetricsResult {
  /** 1. Tổng số học viên đang học */
  totalStudents: number;
  /** Số học viên mới nhập học trong tháng */
  newStudentsThisMonth: number;
  /** 2. Lớp học đang vận hành */
  activeClassesCount: number;
  /** Tổng chỉ tiêu sức chứa của các lớp */
  totalCapacity: number;
  /** Công suất lấp đầy thực tế (%) */
  occupancyRate: number;
  /** 3. Tổng số ca dạy trong tuần */
  weeklySessionsCount: number;
  /** Danh sách các xung đột lịch dạy (nếu có) */
  scheduleConflicts: ScheduleConflictPair[];
  /** Số ca xung đột lịch */
  scheduleConflictCount: number;
  /** 4. Tỷ lệ chuyên cần trung bình toàn trung tâm (%) */
  avgAttendanceRate: number;
  /** Số ca dạy trong ngày hôm nay */
  todaySessionsCount: number;
  /** Danh sách ca dạy hôm nay */
  todaySessions: WeeklyClassSession[];
  /** Số thông báo khẩn/quan trọng đang công bố */
  urgentAnnouncementsCount: number;
  /** Danh sách thống kê học tập theo từng khối lớp (Chi tiết từng lớp) */
  classPerformance: ClassPerformanceStat[];
  /** Danh sách thống kê học tập gom cụm theo Khối đào tạo (Rollup) */
  programTracks: ProgramTrackStat[];
  /** Danh sách cảnh báo học vụ & học phí đã xếp hạng ưu tiên */
  prioritizedAlerts: PrioritizedAlertItem[];
  /** Số lượng cảnh báo mức khẩn cấp (critical) */
  criticalAlertsCount: number;
  /** Số lượng cảnh báo mức cảnh báo (warning) */
  warningAlertsCount: number;
  /** Danh sách học sinh có cảnh báo cần lưu ý (học phí hoặc học vụ) */
  actionableAlerts: ActionableStudentAlert[];
  /** Danh sách học sinh có vấn đề học phí (quá hạn hoặc sắp đến hạn) */
  overdueStudents: AdminStudentRecord[];
  /** Số học sinh có cảnh báo học phí */
  overdueCount: number;
}

/**
 * Xác định thứ trong tuần theo định dạng tiếng Việt ("Thứ Hai", "Thứ Ba", ..., "Chủ Nhật")
 */
export function getDayLabelForDate(date: Date = new Date()): string {
  const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  if (dayIndex === 0) return "Chủ Nhật";
  const map: Record<number, string> = {
    1: "Thứ Hai",
    2: "Thứ Ba",
    3: "Thứ Tư",
    4: "Thứ Năm",
    5: "Thứ Sáu",
    6: "Thứ Bảy",
  };
  return map[dayIndex] || "Thứ Hai";
}

/**
 * Kiểm tra các xung đột lịch dạy nghiêm ngặt cho mô hình 1 giáo viên chính:
 * Phát hiện CẢ trùng phòng học (đã chuẩn hóa tên phòng) LẪN trùng giờ dạy giáo viên.
 */
export function detectScheduleConflicts(
  sessions: WeeklyClassSession[],
): ScheduleConflictPair[] {
  const conflicts: ScheduleConflictPair[] = [];
  const n = sessions.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = sessions[i];
      const b = sessions[j];

      const sameDay =
        (typeof a.dayOfWeek === "number" && a.dayOfWeek === b.dayOfWeek) ||
        (Boolean(a.dayLabel) && a.dayLabel === b.dayLabel);
      if (!sameDay) continue;

      if (!isTimeOverlapping(a.startTime, a.endTime, b.startTime, b.endTime)) {
        continue;
      }

      const roomA = normalizeRoomKey(a.room);
      const roomB = normalizeRoomKey(b.room);
      const isSameRoom = Boolean(roomA && roomB && roomA === roomB);

      if (isSameRoom) {
        conflicts.push({
          sessionA: a,
          sessionB: b,
          conflictType: "room",
          reason: `Phòng ${a.room} bị trùng giờ vào ${a.dayLabel}: Ca ${a.classCode} (${a.startTime}–${a.endTime}) và Ca ${b.classCode} (${b.startTime}–${b.endTime}).`,
        });
      } else {
        conflicts.push({
          sessionA: a,
          sessionB: b,
          conflictType: "teacher",
          reason: `Trùng giờ dạy giáo viên vào ${a.dayLabel}: Ca ${a.classCode} (${a.startTime}–${a.endTime} tại ${a.room}) giao thoa với Ca ${b.classCode} (${b.startTime}–${b.endTime} tại ${b.room}).`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Tính công suất lấp đầy trung bình toàn bộ các lớp học đang hoạt động.
 */
export function computeOccupancyRate(classes: ClassroomGroup[]): {
  totalEnrolled: number;
  totalCapacity: number;
  rate: number;
} {
  const activeClasses = classes.filter((c) => c.status !== "archived");
  const totalEnrolled = activeClasses.reduce((sum, c) => sum + (c.enrolled || 0), 0);
  const totalCapacity = activeClasses.reduce((sum, c) => sum + (c.capacity || 0), 0);
  const rate =
    totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;

  return { totalEnrolled, totalCapacity, rate };
}

/**
 * Lọc danh sách ca dạy cho một ngày cụ thể (mặc định hôm nay).
 */
export function getSessionsForDate(
  sessions: WeeklyClassSession[],
  date: Date = new Date(),
): WeeklyClassSession[] {
  const dayLabel = getDayLabelForDate(date);
  const dow = date.getDay() === 0 ? 7 : date.getDay();
  return sessions.filter(
    (s) => s.dayLabel === dayLabel || s.dayOfWeek === dow,
  );
}

/**
 * Tổng hợp toàn bộ KPI và chỉ số điều hành học vụ cho Dashboard ThS. Nguyễn Minh Anh.
 */
/**
 * Gom cụm các lớp học hoạt động theo Khối đào tạo (Rollup by Program Track).
 * Giúp thu gọn từ 30-50 lớp lẻ thành 4-5 nhóm chiến lược khi trung tâm phình to.
 */
export function groupClassesIntoProgramTracks(
  classes: ClassroomGroup[],
): ProgramTrackStat[] {
  const activeClasses = classes.filter((c) => c.status !== "archived");

  const trackDefs = [
    {
      key: "ielts",
      name: "Khối IELTS (Intensive & Foundation)",
      match: (c: ClassroomGroup) =>
        c.code.startsWith("II") ||
        c.code.startsWith("IF") ||
        c.code.toUpperCase().includes("IELTS") ||
        c.name.toUpperCase().includes("IELTS"),
    },
    {
      key: "junior",
      name: "Khối Học thuật Thiếu niên (Junior)",
      match: (c: ClassroomGroup) =>
        c.code.startsWith("JA") ||
        c.name.toLowerCase().includes("junior"),
    },
    {
      key: "academic",
      name: "Khối Viết học thuật & Tư duy phản biện",
      match: (c: ClassroomGroup) =>
        c.code.startsWith("AW") ||
        c.name.toLowerCase().includes("writing") ||
        c.name.toLowerCase().includes("critical"),
    },
    {
      key: "basic",
      name: "Khối Tiếng Anh Nền tảng & Cấp tốc",
      match: (c: ClassroomGroup) =>
        c.code.startsWith("MG") ||
        c.name.toLowerCase().includes("basic") ||
        c.name.toLowerCase().includes("mất gốc") ||
        c.name.toLowerCase().includes("cấp tốc"),
    },
  ];

  const assignedClassIds = new Set<string>();
  const tracks: ProgramTrackStat[] = [];

  for (const def of trackDefs) {
    const matched = activeClasses.filter(
      (c) => !assignedClassIds.has(c.id) && def.match(c),
    );
    if (matched.length > 0) {
      matched.forEach((c) => assignedClassIds.add(c.id));
      const totalEnrolled = matched.reduce((sum, c) => sum + (c.enrolled || 0), 0);
      const totalCapacity = matched.reduce((sum, c) => sum + (c.capacity || 0), 0);
      const occupancyRate =
        totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;

      const avgScore = Number(
        (
          matched.reduce((sum, c) => sum + (c.averageScore || 0), 0) /
          matched.length
        ).toFixed(1),
      );
      const attendanceRate = Number(
        (
          matched.reduce((sum, c) => sum + (c.attendanceRate || 0), 0) /
          matched.length
        ).toFixed(1),
      );

      const classStats: ClassPerformanceStat[] = matched.map((cls) => ({
        id: cls.id,
        code: cls.code,
        name: cls.name,
        averageScore: cls.averageScore,
        attendanceRate: cls.attendanceRate,
        enrolled: cls.enrolled,
        capacity: cls.capacity,
        occupancyRate:
          cls.capacity > 0 ? Math.round((cls.enrolled / cls.capacity) * 100) : 0,
      }));

      tracks.push({
        id: `track-${def.key}`,
        trackKey: def.key,
        name: def.name,
        classCount: matched.length,
        totalEnrolled,
        totalCapacity,
        occupancyRate,
        avgScore,
        attendanceRate,
        classes: classStats,
      });
    }
  }

  // Các lớp chưa thuộc khối nào gom vào "Khối Đào tạo khác"
  const remaining = activeClasses.filter((c) => !assignedClassIds.has(c.id));
  if (remaining.length > 0) {
    const totalEnrolled = remaining.reduce((sum, c) => sum + (c.enrolled || 0), 0);
    const totalCapacity = remaining.reduce((sum, c) => sum + (c.capacity || 0), 0);
    const occupancyRate =
      totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
    const avgScore = Number(
      (
        remaining.reduce((sum, c) => sum + (c.averageScore || 0), 0) /
        remaining.length
      ).toFixed(1),
    );
    const attendanceRate = Number(
      (
        remaining.reduce((sum, c) => sum + (c.attendanceRate || 0), 0) /
        remaining.length
      ).toFixed(1),
    );

    tracks.push({
      id: "track-other",
      trackKey: "other",
      name: "Khối Đào tạo Khác",
      classCount: remaining.length,
      totalEnrolled,
      totalCapacity,
      occupancyRate,
      avgScore,
      attendanceRate,
      classes: remaining.map((cls) => ({
        id: cls.id,
        code: cls.code,
        name: cls.name,
        averageScore: cls.averageScore,
        attendanceRate: cls.attendanceRate,
        enrolled: cls.enrolled,
        capacity: cls.capacity,
        occupancyRate:
          cls.capacity > 0 ? Math.round((cls.enrolled / cls.capacity) * 100) : 0,
      })),
    });
  }

  return tracks;
}

/**
 * Trích xuất và phân cấp ưu tiên các cảnh báo học vụ & học phí (Triage by Severity).
 * Mức độ: critical (đỏ - quá hạn / điểm giảm) -> warning (vàng - sắp đến hạn / chuyên cần thấp) -> info (chưa điểm).
 */
export function extractPrioritizedAlerts(
  students: AdminStudentRecord[],
  attendanceThreshold = 80,
): PrioritizedAlertItem[] {
  const alerts: PrioritizedAlertItem[] = [];

  for (const s of students) {
    if (s.status !== "active") continue;

    // 1. Cảnh báo học phí
    if (s.tuitionStatus === "overdue") {
      alerts.push({
        id: `alert-tuition-${s.id}`,
        studentId: s.id,
        studentCode: s.code,
        studentName: s.fullName,
        classId: s.classId,
        className: s.className,
        category: "tuition",
        severity: "critical",
        badgeLabel: "Quá hạn HP",
        title: "Học phí quá hạn thanh toán",
        description: `${s.tuitionPeriod || "Học kỳ hiện tại"} · Quá hạn cần gửi nhắc nhở`,
        suggestedActionLabel: "Nhắc học phí",
        quickReminderText: `Chào bạn/phụ huynh em ${s.fullName} (${s.code}), trung tâm xin gửi thông báo học phí ${s.tuitionPeriod || "kỳ học"} hiện đã quá hạn. Nhờ gia đình sớm hoàn tất để đảm bảo quyền lợi học tập cho em nhé. Cảm ơn bạn!`,
      });
    } else if (s.tuitionStatus === "due-soon") {
      alerts.push({
        id: `alert-tuition-${s.id}`,
        studentId: s.id,
        studentCode: s.code,
        studentName: s.fullName,
        classId: s.classId,
        className: s.className,
        category: "tuition",
        severity: "warning",
        badgeLabel: "Sắp đến hạn",
        title: "Học phí sắp đến hạn",
        description: `${s.tuitionPeriod || "Học kỳ tiếp theo"} · Cần gửi thông báo trước`,
        suggestedActionLabel: "Gửi thông báo",
        quickReminderText: `Chào bạn/phụ huynh em ${s.fullName} (${s.code}), học phí ${s.tuitionPeriod || "kỳ học"} sắp đến hạn thanh toán. Bạn/phụ huynh vui lòng chuẩn bị hoàn tất đúng hạn nhé!`,
      });
    }

    // 2. Cảnh báo học vụ & chuyên cần từ academic-alert.service
    const academicAlerts = getStudentAcademicAlerts(s, {
      attendanceThreshold,
      alertOnScoreDrop: true,
      alertOnOverdueTuition: true,
      alertOnNoGrades: true,
      alertBelowTarget: true,
    });
    for (let i = 0; i < academicAlerts.length; i++) {
      const ac = academicAlerts[i];
      if (ac.type === "score-drop") {
        alerts.push({
          id: `alert-academic-${s.id}-${i}`,
          studentId: s.id,
          studentCode: s.code,
          studentName: s.fullName,
          classId: s.classId,
          className: s.className,
          category: "academic",
          severity: "critical",
          badgeLabel: "Điểm sa sút",
          title: ac.title,
          description: ac.description,
          suggestedActionLabel: "Xem bảng điểm",
          quickReminderText: `Chào em ${s.fullName}, cô Minh Anh nhận thấy kết quả các bài kiểm tra gần đây có dấu hiệu giảm nhẹ. Em sắp xếp liên hệ cô để được định hướng kèm thêm nhé!`,
        });
      } else if (ac.type === "attendance") {
        const isCritical = ac.level === "destructive";
        alerts.push({
          id: `alert-academic-${s.id}-${i}`,
          studentId: s.id,
          studentCode: s.code,
          studentName: s.fullName,
          classId: s.classId,
          className: s.className,
          category: "attendance",
          severity: isCritical ? "critical" : "warning",
          badgeLabel: "Chuyên cần thấp",
          title: ac.title,
          description: ac.description,
          suggestedActionLabel: "Nhắc chuyên cần",
          quickReminderText: `Chào em ${s.fullName}, tỷ lệ chuyên cần của em hiện đang dưới chuẩn (${s.attendanceRate}%). Em cố gắng tham gia đầy đủ các buổi học nhé!`,
        });
      } else if (ac.type === "below-target") {
        alerts.push({
          id: `alert-academic-${s.id}-${i}`,
          studentId: s.id,
          studentCode: s.code,
          studentName: s.fullName,
          classId: s.classId,
          className: s.className,
          category: "academic",
          severity: "warning",
          badgeLabel: "Dưới mục tiêu",
          title: ac.title,
          description: ac.description,
          suggestedActionLabel: "Hỗ trợ học tập",
          quickReminderText: `Chào em ${s.fullName}, điểm TB hiện tại của em đang thấp hơn mục tiêu đề ra (${s.targetGoal}). Em cố gắng rèn luyện thêm theo dặn dò của giáo viên nhé!`,
        });
      } else if (ac.type === "no-grades") {
        alerts.push({
          id: `alert-academic-${s.id}-${i}`,
          studentId: s.id,
          studentCode: s.code,
          studentName: s.fullName,
          classId: s.classId,
          className: s.className,
          category: "academic",
          severity: "info",
          badgeLabel: "Chưa có điểm",
          title: ac.title,
          description: ac.description,
          suggestedActionLabel: "Nhập điểm",
          quickReminderText: `Học sinh ${s.fullName} (${s.code}) chưa có bài kiểm tra định kỳ gần đây.`,
        });
      }
    }
  }

  // Sắp xếp ưu tiên: critical (đỏ) -> warning (vàng) -> info (xanh/xám)
  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return alerts.sort((a, b) => {
    const diff = severityOrder[a.severity] - severityOrder[b.severity];
    if (diff !== 0) return diff;
    // Cùng severity thì tuition lên trước
    if (a.category === "tuition" && b.category !== "tuition") return -1;
    if (b.category === "tuition" && a.category !== "tuition") return 1;
    return a.studentName.localeCompare(b.studentName, "vi");
  });
}

export function computeDashboardMetrics(input: {
  classes: ClassroomGroup[];
  sessions: WeeklyClassSession[];
  students: AdminStudentRecord[];
  announcements: AnnouncementItem[];
  currentDate?: Date;
  attendanceThreshold?: number;
}): DashboardMetricsResult {
  const attendanceThreshold = input.attendanceThreshold ?? 80;
  const now = input.currentDate || new Date();
  const currentMonthStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  const activeClasses = input.classes.filter((c) => c.status !== "archived");
  const { totalEnrolled, totalCapacity, rate: occupancyRate } =
    computeOccupancyRate(activeClasses);

  // Học viên mới trong tháng
  const newStudentsThisMonth = input.students.filter(
    (s) =>
      s.status === "active" &&
      (s.joinedAt.includes(currentMonthStr) || s.joinedAt.includes(String(now.getFullYear()))),
  ).length;

  // Xung đột lịch dạy
  const scheduleConflicts = detectScheduleConflicts(input.sessions);

  // Tỷ lệ chuyên cần trung bình
  const avgAttendanceRate =
    activeClasses.length > 0
      ? Number(
          (
            activeClasses.reduce((sum, c) => sum + (c.attendanceRate || 0), 0) /
            activeClasses.length
          ).toFixed(1),
        )
      : 0;

  // Ca dạy hôm nay
  const todaySessions = getSessionsForDate(input.sessions, now);

  // Thông báo quan trọng đang hiển thị
  const urgentAnnouncementsCount = input.announcements.filter(
    (a) =>
      a.status === "published" &&
      (a.category === "urgent" || a.isPinned === true),
  ).length;

  // Thống kê học tập theo khối lớp
  const classPerformance: ClassPerformanceStat[] = activeClasses.map((cls) => ({
    id: cls.id,
    code: cls.code,
    name: cls.name,
    averageScore: cls.averageScore,
    attendanceRate: cls.attendanceRate,
    enrolled: cls.enrolled,
    capacity: cls.capacity,
    occupancyRate:
      cls.capacity > 0 ? Math.round((cls.enrolled / cls.capacity) * 100) : 0,
  }));

  // Danh sách học sinh cần lưu ý (học phí hoặc học vụ)
  const actionableAlerts: ActionableStudentAlert[] = [];
  for (const s of input.students) {
    if (s.status !== "active") continue;
    const isTuitionIssue =
      s.tuitionStatus === "overdue" || s.tuitionStatus === "due-soon";
    const academicAlerts = getStudentAcademicAlerts(s, {
      attendanceThreshold,
      alertOnScoreDrop: true,
      alertOnOverdueTuition: true,
      alertOnNoGrades: true,
      alertBelowTarget: true,
    });

    if (isTuitionIssue || academicAlerts.length > 0) {
      actionableAlerts.push({
        studentId: s.id,
        studentCode: s.code,
        studentName: s.fullName,
        className: s.className,
        tuitionStatus: s.tuitionStatus,
        tuitionPeriod: s.tuitionPeriod,
        academicAlerts,
      });
    }
  }

  const overdueStudents = input.students.filter(
    (s) =>
      s.status === "active" &&
      (s.tuitionStatus === "overdue" || s.tuitionStatus === "due-soon"),
  );

  // Gom cụm theo Khối đào tạo (Rollup)
  const programTracks = groupClassesIntoProgramTracks(input.classes);

  // Danh sách cảnh báo học vụ & học phí ưu tiên (Triage)
  const prioritizedAlerts = extractPrioritizedAlerts(
    input.students,
    attendanceThreshold,
  );
  const criticalAlertsCount = prioritizedAlerts.filter(
    (a) => a.severity === "critical",
  ).length;
  const warningAlertsCount = prioritizedAlerts.filter(
    (a) => a.severity === "warning",
  ).length;

  return {
    totalStudents: totalEnrolled,
    newStudentsThisMonth,
    activeClassesCount: activeClasses.length,
    totalCapacity,
    occupancyRate,
    weeklySessionsCount: input.sessions.length,
    scheduleConflicts,
    scheduleConflictCount: scheduleConflicts.length,
    avgAttendanceRate,
    todaySessionsCount: todaySessions.length,
    todaySessions,
    urgentAnnouncementsCount,
    classPerformance,
    programTracks,
    prioritizedAlerts,
    criticalAlertsCount,
    warningAlertsCount,
    actionableAlerts,
    overdueStudents,
    overdueCount: overdueStudents.length,
  };
}
