import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type {
  AdminStudentRecord,
  AnnouncementItem,
  ClassroomGroup,
  WeeklyClassSession,
} from "../src/services/classroom-data";
import {
  computeDashboardMetrics,
  computeOccupancyRate,
  detectScheduleConflicts,
  extractPrioritizedAlerts,
  getDayLabelForDate,
  getSessionsForDate,
  groupClassesIntoProgramTracks,
} from "../src/services/dashboard.service";

// Mock helper fixtures
function createMockClass(overrides: Partial<ClassroomGroup> = {}): ClassroomGroup {
  return {
    id: "cls-01",
    code: "II-01",
    name: "IELTS Intensive",
    level: "CEFR B2",
    targetBand: "7.0+",
    scheduleSummary: "T3 - T5: 19:00 - 21:00",
    room: "Phòng 201",
    currentModule: "Writing Task 2",
    capacity: 12,
    enrolled: 8,
    status: "active",
    attendanceRate: 95.0,
    averageScore: 7.5,
    curriculum: [],
    ...overrides,
  };
}

function createMockStudent(overrides: Partial<AdminStudentRecord> = {}): AdminStudentRecord {
  return {
    id: "stu-01",
    code: "HS-2026-01",
    fullName: "Trần Bảo Ngọc",
    classId: "cls-01",
    className: "IELTS Intensive",
    level: "CEFR B2",
    joinedAt: "10/11/2026",
    attendanceRate: 96,
    averageScore: 7.8,
    targetGoal: "IELTS 7.5 Overall",
    tuitionStatus: "paid",
    tuitionPeriod: "Học kỳ I",
    tuitionAmount: "5.800.000 ₫",
    parentRelation: "Phụ huynh",
    parentContactMasked: "090 ••• 123",
    status: "active",
    recentComment: "Tiến bộ nhanh",
    grades: [],
    attendanceHistory: [],
    ...overrides,
  };
}

function createMockSession(overrides: Partial<WeeklyClassSession> = {}): WeeklyClassSession {
  return {
    id: "sess-01",
    classCode: "II-01",
    className: "IELTS Intensive",
    level: "CEFR B2",
    dayLabel: "Thứ Năm",
    dayOfWeek: 4,
    startTime: "18:00",
    endTime: "20:00",
    room: "Phòng Academic 201",
    topic: "Writing Task 2 Academic",
    enrolledCount: 8,
    capacity: 12,
    status: "ongoing",
    ...overrides,
  };
}

function createMockAnnouncement(overrides: Partial<AnnouncementItem> = {}): AnnouncementItem {
  return {
    id: "ann-01",
    title: "Thông báo lịch thi thử",
    excerpt: "Lịch thi thử IELTS Academic",
    content: ["Nội dung thi thử"],
    category: "urgent",
    categoryLabel: "Khẩn cấp",
    publishedAt: "10/11/2026",
    readTime: "2 phút",
    targetClasses: [],
    attachments: [],
    isPinned: true,
    status: "published",
    ...overrides,
  };
}

describe("Dashboard Service — Tổng quan Học vụ ThS. Nguyễn Minh Anh", () => {
  describe("1. Tính toán Sĩ số & Học viên (Enrolled Students & Admissions)", () => {
    test("1.1. Tính tổng số học viên đang học từ các lớp active", () => {
      const classes = [
        createMockClass({ id: "c1", enrolled: 5, status: "active" }),
        createMockClass({ id: "c2", enrolled: 10, status: "active" }),
      ];
      const res = computeDashboardMetrics({
        classes,
        sessions: [],
        students: [],
        announcements: [],
      });
      assert.equal(res.totalStudents, 15);
    });

    test("1.2. Loại bỏ sĩ số của lớp archived ra khỏi tổng sĩ số đang học", () => {
      const classes = [
        createMockClass({ id: "c1", enrolled: 6, status: "active" }),
        createMockClass({ id: "c2", enrolled: 8, status: "archived" }),
      ];
      const res = computeDashboardMetrics({
        classes,
        sessions: [],
        students: [],
        announcements: [],
      });
      assert.equal(res.totalStudents, 6);
      assert.equal(res.activeClassesCount, 1);
    });

    test("1.3. Tính toán chính xác số học viên mới nhập học trong tháng", () => {
      const novDate = new Date(2026, 10, 15); // Month index 10 is November
      const students = [
        createMockStudent({ id: "s1", joinedAt: "05/11/2026", status: "active" }),
        createMockStudent({ id: "s2", joinedAt: "12/11/2026", status: "active" }),
        createMockStudent({ id: "s3", joinedAt: "20/09/2025", status: "active" }),
        createMockStudent({ id: "s4", joinedAt: "01/11/2026", status: "archived" }),
      ];
      const res = computeDashboardMetrics({
        classes: [],
        sessions: [],
        students,
        announcements: [],
        currentDate: novDate,
      });
      assert.equal(res.newStudentsThisMonth, 2);
    });
  });

  describe("2. Chỉ số Vận hành & Công suất Lấp đầy (Occupancy Rate)", () => {
    test("2.1. Tính công suất lấp đầy thực tế: enrolled / capacity", () => {
      const classes = [
        createMockClass({ id: "c1", enrolled: 10, capacity: 12 }),
        createMockClass({ id: "c2", enrolled: 8, capacity: 8 }),
      ];
      // Total enrolled = 18, Total capacity = 20 -> 90%
      const { rate } = computeOccupancyRate(classes);
      assert.equal(rate, 90);
    });

    test("2.2. Xử lý an toàn khi tổng sức chứa capacity = 0 (tránh chia cho 0)", () => {
      const classes = [
        createMockClass({ id: "c1", enrolled: 0, capacity: 0 }),
      ];
      const { rate } = computeOccupancyRate(classes);
      assert.equal(rate, 0);
    });

    test("2.3. Tính toán công suất lấp đầy cho từng khối lớp trong classPerformance", () => {
      const classes = [
        createMockClass({ id: "c1", code: "II-01", enrolled: 9, capacity: 10 }),
        createMockClass({ id: "c2", code: "IF-02", enrolled: 6, capacity: 12 }),
      ];
      const res = computeDashboardMetrics({
        classes,
        sessions: [],
        students: [],
        announcements: [],
      });
      assert.equal(res.classPerformance.length, 2);
      assert.equal(res.classPerformance[0].occupancyRate, 90);
      assert.equal(res.classPerformance[1].occupancyRate, 50);
    });
  });

  describe("3. Lịch dạy & Phát hiện Xung đột (Schedule & Conflict Detection)", () => {
    test("3.1. Đếm chính xác tổng số ca dạy trong tuần", () => {
      const sessions = [
        createMockSession({ id: "s1" }),
        createMockSession({ id: "s2" }),
        createMockSession({ id: "s3" }),
      ];
      const res = computeDashboardMetrics({
        classes: [],
        sessions,
        students: [],
        announcements: [],
      });
      assert.equal(res.weeklySessionsCount, 3);
    });

    test("3.2. Báo 0 xung đột khi không có ca nào trùng phòng và trùng giờ", () => {
      const sessions = [
        createMockSession({
          id: "s1",
          dayLabel: "Thứ Hai",
          room: "Phòng 201",
          startTime: "18:00",
          endTime: "19:30",
        }),
        createMockSession({
          id: "s2",
          dayLabel: "Thứ Hai",
          room: "Phòng 201",
          startTime: "19:30",
          endTime: "21:00",
        }),
      ];
      const conflicts = detectScheduleConflicts(sessions);
      assert.equal(conflicts.length, 0);
    });

    test("3.3. Phát hiện xung đột khi 2 ca cùng ngày, cùng phòng và trùng khung giờ", () => {
      const sessions = [
        createMockSession({
          id: "s1",
          classCode: "II-01",
          dayLabel: "Thứ Tư",
          room: "Phòng Lab 102",
          startTime: "18:00",
          endTime: "20:00",
        }),
        createMockSession({
          id: "s2",
          classCode: "IF-02",
          dayLabel: "Thứ Tư",
          room: "Phòng Lab 102",
          startTime: "19:00",
          endTime: "21:00",
        }),
      ];
      const conflicts = detectScheduleConflicts(sessions);
      assert.equal(conflicts.length, 1);
      assert.match(conflicts[0].reason, /Phòng Lab 102 bị trùng giờ vào Thứ Tư/);
    });

    test("3.4. Phát hiện xung đột giờ dạy giáo viên ngay cả khi 2 ca trùng giờ khác phòng (1 GV chính)", () => {
      const sessions = [
        createMockSession({
          id: "s1",
          classCode: "II-01",
          dayLabel: "Thứ Sáu",
          room: "Phòng 201",
          startTime: "18:00",
          endTime: "20:00",
        }),
        createMockSession({
          id: "s2",
          classCode: "IF-02",
          dayLabel: "Thứ Sáu",
          room: "Phòng 202",
          startTime: "18:00",
          endTime: "20:00",
        }),
      ];
      const conflicts = detectScheduleConflicts(sessions);
      assert.equal(conflicts.length, 1);
      assert.equal(conflicts[0].conflictType, "teacher");
      assert.match(conflicts[0].reason, /Trùng giờ dạy giáo viên/);
    });

    test("3.4b. Chuẩn hóa tên phòng khi kiểm tra xung đột phòng học (vd Phòng 302 vs Phòng 302 · Cơ sở Nguyễn Du)", () => {
      const sessions = [
        createMockSession({
          id: "s1",
          classCode: "II-01",
          dayLabel: "Thứ Ba",
          room: "Phòng 302",
          startTime: "18:00",
          endTime: "20:00",
        }),
        createMockSession({
          id: "s2",
          classCode: "AW-02",
          dayLabel: "Thứ Ba",
          room: "Phòng 302 · Cơ sở Nguyễn Du",
          startTime: "19:00",
          endTime: "21:00",
        }),
      ];
      const conflicts = detectScheduleConflicts(sessions);
      assert.equal(conflicts.length, 1);
      assert.equal(conflicts[0].conflictType, "room");
    });

    test("3.5. getSessionsForDate lọc chính xác các ca dạy của ngày hôm nay", () => {
      const testThursday = new Date(2026, 10, 19); // 19/11/2026 is Thursday
      const sessions = [
        createMockSession({ id: "s1", dayLabel: "Thứ Năm", dayOfWeek: 4 }),
        createMockSession({ id: "s2", dayLabel: "Thứ Năm", dayOfWeek: 4 }),
        createMockSession({ id: "s3", dayLabel: "Thứ Sáu", dayOfWeek: 5 }),
      ];
      const today = getSessionsForDate(sessions, testThursday);
      assert.equal(today.length, 2);
      assert.equal(getDayLabelForDate(testThursday), "Thứ Năm");
    });
  });

  describe("4. Tỷ lệ Chuyên cần & Cảnh báo Học vụ (Attendance & Alerts)", () => {
    test("4.1. Tính trung bình tỷ lệ chuyên cần trung bình của toàn bộ các lớp", () => {
      const classes = [
        createMockClass({ id: "c1", attendanceRate: 98.0 }),
        createMockClass({ id: "c2", attendanceRate: 96.0 }),
      ];
      const res = computeDashboardMetrics({
        classes,
        sessions: [],
        students: [],
        announcements: [],
      });
      assert.equal(res.avgAttendanceRate, 97.0);
    });

    test("4.2. Phát hiện học sinh có cảnh báo học phí (overdue và due-soon)", () => {
      const students = [
        createMockStudent({ id: "s1", tuitionStatus: "paid" }),
        createMockStudent({ id: "s2", tuitionStatus: "due-soon" }),
        createMockStudent({ id: "s3", tuitionStatus: "overdue" }),
      ];
      const res = computeDashboardMetrics({
        classes: [],
        sessions: [],
        students,
        announcements: [],
      });
      assert.equal(res.overdueCount, 2);
      assert.equal(res.overdueStudents.length, 2);
      assert.ok(res.overdueStudents.some((a) => a.tuitionStatus === "overdue"));
      assert.ok(res.overdueStudents.some((a) => a.tuitionStatus === "due-soon"));
    });

    test("4.3. Đếm chính xác số thông báo quan trọng (urgent hoặc isPinned)", () => {
      const announcements = [
        createMockAnnouncement({ id: "a1", category: "urgent", status: "published" }),
        createMockAnnouncement({ id: "a2", category: "schedule", isPinned: true, status: "published" }),
        createMockAnnouncement({ id: "a3", category: "urgent", status: "draft" }), // draft không tính
      ];
      const res = computeDashboardMetrics({
        classes: [],
        sessions: [],
        students: [],
        announcements,
      });
      assert.equal(res.urgentAnnouncementsCount, 2);
    });
  });

  describe("5. Phân nhóm Khối đào tạo & Phân cấp Cảnh báo Ưu tiên (Program Tracks & Prioritized Alerts)", () => {
    test("5.1. groupClassesIntoProgramTracks nhóm chính xác các lớp lẻ vào khối đào tạo tương ứng", () => {
      const classes = [
        createMockClass({ id: "c1", code: "II-01", name: "IELTS Intensive", enrolled: 12, capacity: 12, averageScore: 7.5, attendanceRate: 98.0 }),
        createMockClass({ id: "c2", code: "IF-01", name: "IELTS Foundation", enrolled: 14, capacity: 15, averageScore: 6.0, attendanceRate: 92.0 }),
        createMockClass({ id: "c3", code: "AW-02", name: "Academic Writing", enrolled: 10, capacity: 12, averageScore: 7.8, attendanceRate: 96.0 }),
        createMockClass({ id: "c4", code: "JA-01", name: "Junior Academic Explorers", enrolled: 15, capacity: 16, averageScore: 8.6, attendanceRate: 100.0 }),
        createMockClass({ id: "c5", code: "MG-05", name: "Basic Level", enrolled: 8, capacity: 10, averageScore: 6.5, attendanceRate: 90.0 }),
        createMockClass({ id: "c6", code: "SP-01", name: "Specialized Seminar", enrolled: 5, capacity: 10, averageScore: 8.0, attendanceRate: 95.0 }),
      ];

      const tracks = groupClassesIntoProgramTracks(classes);
      assert.ok(tracks.length >= 4);

      const ieltsTrack = tracks.find((t) => t.trackKey === "ielts");
      assert.ok(ieltsTrack);
      assert.equal(ieltsTrack?.classCount, 2);
      assert.equal(ieltsTrack?.totalEnrolled, 26);
      assert.equal(ieltsTrack?.totalCapacity, 27);
      assert.equal(ieltsTrack?.occupancyRate, 96);

      const awTrack = tracks.find((t) => t.trackKey === "academic");
      assert.ok(awTrack);
      assert.equal(awTrack?.classCount, 1);

      const otherTrack = tracks.find((t) => t.trackKey === "other");
      assert.ok(otherTrack);
      assert.equal(otherTrack?.classCount, 1);
    });

    test("5.2. extractPrioritizedAlerts phân loại đúng mức độ nghiêm trọng: critical trước warning", () => {
      const sampleGrades = [
        {
          id: "g1",
          assessmentTitle: "Kiểm tra Định kỳ 1",
          date: "01/11/2026",
          listening: 7.5,
          reading: 7.0,
          writing: 7.0,
          speaking: 7.5,
          overall: 7.5,
          comment: "Làm bài tốt",
        },
      ];
      const students = [
        createMockStudent({
          id: "s1",
          fullName: "Nguyễn Văn A",
          tuitionStatus: "due-soon",
          tuitionPeriod: "Học kỳ II",
          grades: sampleGrades,
        }),
        createMockStudent({
          id: "s2",
          fullName: "Đặng Quốc B",
          tuitionStatus: "overdue",
          tuitionPeriod: "Học kỳ I",
          grades: sampleGrades,
        }),
      ];

      const alerts = extractPrioritizedAlerts(students);
      assert.equal(alerts.length, 2);
      // Quá hạn học phí phải được ưu tiên critical xếp lên đầu
      assert.equal(alerts[0].severity, "critical");
      assert.equal(alerts[0].studentName, "Đặng Quốc B");
      assert.equal(alerts[0].badgeLabel, "Quá hạn HP");
      assert.ok(alerts[0].quickReminderText.includes("Đặng Quốc B"));

      // Sắp đến hạn học phí xếp thứ hai (warning)
      assert.equal(alerts[1].severity, "warning");
      assert.equal(alerts[1].studentName, "Nguyễn Văn A");
      assert.equal(alerts[1].badgeLabel, "Sắp đến hạn");
    });

    test("5.3. computeDashboardMetrics tích hợp đầy đủ programTracks và prioritizedAlerts", () => {
      const sampleGrades = [
        {
          id: "g1",
          assessmentTitle: "Định kỳ",
          date: "05/11/2026",
          listening: 8.0,
          reading: 8.0,
          writing: 8.0,
          speaking: 8.0,
          overall: 8.0,
          comment: "Đạt band xuất sắc",
        },
      ];
      const classes = [
        createMockClass({ id: "c1", code: "II-01", name: "IELTS Intensive" }),
        createMockClass({ id: "c2", code: "AW-02", name: "Academic Writing" }),
      ];
      const students = [
        createMockStudent({ id: "s1", tuitionStatus: "overdue", grades: sampleGrades }),
        createMockStudent({ id: "s2", tuitionStatus: "paid", grades: sampleGrades }),
      ];

      const res = computeDashboardMetrics({
        classes,
        sessions: [],
        students,
        announcements: [],
      });

      assert.ok(Array.isArray(res.programTracks));
      assert.equal(res.programTracks.length, 2);
      assert.ok(Array.isArray(res.prioritizedAlerts));
      assert.equal(res.prioritizedAlerts.length, 1);
      assert.equal(res.criticalAlertsCount, 1);
      assert.equal(res.warningAlertsCount, 0);
    });
  });
});
