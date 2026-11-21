import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { prisma } from "@/lib/db/prisma";
import { resetServerEnvCache } from "@/lib/env";
import {
  buildAnalyticsExecutiveSummary,
  buildClassAnalyticsCsv,
  computeClassHealthScore,
} from "@/services/class-analytics-helpers";
import { CLASS_SESSIONS_DATA } from "@/services/classroom-data";
import { addDaysIso, toIsoDate } from "@/services/schedule-calendar-helpers";
import * as scheduleService from "@/services/schedule.service";
import * as storageService from "@/services/storage.service";
import * as studentService from "@/services/student.service";
import {
  buildParentSessionDigest,
  buildTeachingJournalCsv,
  sanitizeSessionTimelineForStudent,
} from "@/services/teaching-journal-helpers";
import * as teachingJournalService from "@/services/teaching-journal.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

function applyTestEnv() {
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgresql://postgres:123456@localhost:5432/english_manager?schema=public";
  }
  process.env.AUTH_SECRET =
    process.env.AUTH_SECRET ||
    "test-only-auth-secret-with-at-least-32-characters-long";
  process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "teacher@example.com";
  process.env.STORAGE_PROVIDER_DOCUMENTS = "supabase";
  process.env.MAX_PDF_SIZE_MB = "40";
  resetServerEnvCache();
}

describe("Teaching Journal & Class Analytics — Pure Helpers (Offline)", () => {
  beforeEach(() => {
    applyTestEnv();
  });

  it("4.4a. sanitizeSessionTimelineForStudent CHỈ hiển thị buổi completed cho đúng studentId & ẩn hoàn toàn draft + privateNotes", () => {
    const completedSes = {
      ...structuredClone(CLASS_SESSIONS_DATA[0]),
      id: "cs-completed-fixture",
      classId: "cls-if-01",
      journalStatus: "completed" as const,
      generalNotes: "Ghi chú chung công khai",
      privateNotes: "SECRET_INTERNAL_TEACHER_MEMO",
      homework: "Làm bài đọc trang 20",
      studentRecords: [
        {
          id: "ssr-a",
          sessionId: "cs-completed-fixture",
          studentId: "stu-03",
          studentCode: "HS-2026-03",
          studentName: "Phạm Hà Phương",
          attendance: "present" as const,
          homeworkStatus: "submitted" as const,
          learningStatus: "good" as const,
          skill: "Reading" as const,
          score: 8.5,
          teacherFeedback: "Feedback riêng của A",
          followUp: "FOLLOWUP_NOI_BO_A",
        },
        {
          id: "ssr-b",
          sessionId: "cs-completed-fixture",
          studentId: "stu-06",
          studentCode: "HS-2026-06",
          studentName: "Đặng Quốc Huy",
          attendance: "absent" as const,
          homeworkStatus: "not-submitted" as const,
          learningStatus: "needs-support" as const,
          skill: "Reading" as const,
          score: 5,
          teacherFeedback: "Feedback riêng của B - A không được thấy",
          followUp: "FOLLOWUP_NOI_BO_B",
        },
      ],
    };

    const draftSes = {
      ...structuredClone(CLASS_SESSIONS_DATA[0]),
      id: "cs-draft-fixture",
      classId: "cls-if-01",
      journalStatus: "draft" as const,
      generalNotes: "Nội dung nháp chưa cho HS xem",
    };

    const timelineForA = sanitizeSessionTimelineForStudent(
      [completedSes, draftSes],
      "stu-03",
    );

    assert.equal(
      timelineForA.some((entry) => entry.id === completedSes.id),
      true,
    );
    assert.equal(timelineForA.some((entry) => entry.id === draftSes.id), false);

    const entryA = timelineForA.find((entry) => entry.id === completedSes.id)!;
    assert.equal(entryA.score, 8.5);
    assert.equal(entryA.studentFeedback, "Feedback riêng của A");

    const serializedA = JSON.stringify(timelineForA);
    assert.equal(serializedA.includes("SECRET_INTERNAL_TEACHER_MEMO"), false);
    assert.equal(serializedA.includes("FOLLOWUP_NOI_BO"), false);
    assert.equal(
      serializedA.includes("Feedback riêng của B - A không được thấy"),
      false,
    );
  });

  it("4.9a. buildParentSessionDigest & buildTeachingJournalCsv ẩn privateNotes và followUp", () => {
    const ses = {
      ...structuredClone(CLASS_SESSIONS_DATA[0]),
      topic: "Academic Presentation Practice",
      journalStatus: "completed" as const,
      generalNotes: "Cả lớp thuyết trình tự tin.",
      privateNotes: "TOP_SECRET_TEACHER_NOTE_DIGEST",
      homework: "Quay video nói 2 phút",
      studentRecords: [
        {
          id: "ssr-digest-1",
          sessionId: "cs-1",
          studentId: "stu-01",
          studentCode: "HS-2026-01",
          studentName: "Trần Bảo Ngọc",
          attendance: "present" as const,
          homeworkStatus: "submitted" as const,
          learningStatus: "good" as const,
          skill: "Speaking" as const,
          score: 9.5,
          teacherFeedback: "Phát âm rõ, ngữ điệu tự nhiên",
          followUp: "INTERNAL_FOLLOWUP_DIGEST",
        },
      ],
    };

    const digest = buildParentSessionDigest(ses);
    assert.ok(digest.includes("Academic Presentation Practice"));
    assert.ok(digest.includes("[9.5/10]"));
    assert.ok(digest.includes("Phát âm rõ, ngữ điệu tự nhiên"));
    assert.equal(digest.includes("TOP_SECRET_TEACHER_NOTE_DIGEST"), false);
    assert.equal(digest.includes("INTERNAL_FOLLOWUP_DIGEST"), false);

    const csv = buildTeachingJournalCsv([
      { ...ses, privateNotes: "CSV_SECRET_INTERNAL_NOTE" },
    ]);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes("Chuyên đề"));
    assert.ok(csv.includes("Điểm TB kiểm tra"));
    assert.equal(csv.includes("CSV_SECRET_INTERNAL_NOTE"), false);
  });

  it("5.4a. computeClassHealthScore, buildClassAnalyticsCsv & buildAnalyticsExecutiveSummary hoạt động chính xác", () => {
    const healthy = computeClassHealthScore({
      attendanceRate: 98,
      homeworkRate: 95,
      curriculumProgress: 80,
      isBehindSchedule: false,
      averageScore: 7.5,
      targetBand: "IELTS 7.0",
      attentionRatio: 0,
    });
    assert.ok(healthy.score >= 80);
    assert.equal(healthy.level, "healthy");

    const risky = computeClassHealthScore({
      attendanceRate: 62,
      homeworkRate: 40,
      curriculumProgress: 25,
      isBehindSchedule: true,
      averageScore: 4.5,
      targetBand: "IELTS 7.5",
      attentionRatio: 0.7,
    });
    assert.ok(risky.score < 60);
    assert.equal(risky.level, "at-risk");

    const sampleReport: teachingJournalService.ClassPerformanceAnalyticsReport = {
      kpi: {
        activeClassesCount: 1,
        overallAttendanceRate: 95,
        overallHomeworkRate: 90,
        overallCurriculumProgress: 60,
        studentsNeedingAttentionCount: 0,
        supportRatePercent: 0,
      },
      classComparisons: [
        {
          classId: "cls-ii-01",
          classCode: "II-01",
          className: "IELTS Intensive",
          level: "B2+",
          targetBand: "IELTS 7.0",
          enrolled: 12,
          capacity: 15,
          attendanceRate: 95,
          homeworkRate: 90,
          completedWeeks: 6,
          expectedWeek: 6,
          totalWeeks: 10,
          curriculumProgress: 60,
          isBehindSchedule: false,
          averageScore: 7.5,
          attentionStudentCount: 0,
          sessionsCompletedCount: 6,
          healthScore: healthy.score,
          healthLevel: healthy.level,
        },
      ],
      charts: {
        weeklySessions: [],
        curriculumProgress: [],
        skillAverages: {
          listening: 7.5,
          reading: 7.5,
          writing: 7.0,
          speaking: 7.5,
          overall: 7.5,
          gradedStudentCount: 12,
        },
        assessmentTrends: [],
      },
      alerts: [],
      summaryMetrics: {
        totalAlerts: 0,
        activeAlertsCount: 0,
        highSeverityCount: 0,
        mediumSeverityCount: 0,
        resolvedAlertsCount: 0,
        journalCompletionRate: 100,
        onLeaveStudentsCount: 0,
      },
      studentSpotlights: {
        topPerformers: [],
        atRiskStudents: [],
      },
    };

    const csv = buildClassAnalyticsCsv(sampleReport);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes("Điểm sức khỏe"));
    assert.ok(csv.includes("Cảnh báo"));

    const summary = buildAnalyticsExecutiveSummary(sampleReport);
    assert.ok(summary.includes("[BÁO CÁO PHÂN TÍCH HIỆU QUẢ LỚP HỌC]"));
    assert.ok(summary.includes("Xếp hạng Sức khỏe lớp học"));
  });
});

describe(
  "PostgreSQL / Prisma Teaching Journal, Session Learning History & Class Analytics",
  { skip: !hasTestDatabase() },
  () => {
    beforeEach(async () => {
      applyTestEnv();
      storageService.resetUploadRateLimit();
      await resetAndSeedTestDatabase();
    });

    after(async () => {
      await teardownTestDatabase();
    });

    describe("1. Nhật ký giảng dạy (Teaching Journal)", () => {
      it("1.1. Lấy danh sách buổi học và lọc theo lớp, trạng thái, từ khóa tiếng Việt không dấu", async () => {
        const all = await teachingJournalService.listClassSessions();
        assert.ok(all.length >= 6, "Phải có danh sách buổi học khởi tạo");

        const completedOnly = await teachingJournalService.listClassSessions({
          journalStatus: "completed",
        });
        assert.ok(
          completedOnly.every((s) => s.journalStatus === "completed"),
          "Chỉ trả về các buổi đã hoàn thành nhật ký",
        );

        const searchMatch = await teachingJournalService.listClassSessions({
          search: "matching headings",
        });
        assert.strictEqual(searchMatch.length, 1);
        assert.strictEqual(searchMatch[0].classCode, "IF-01");
      });

      it("1.2. Tự động tạo buổi học từ lịch cố định và gợi ý nội dung theo tuần chương trình", async () => {
        const created = await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-if-01",
          date: "2026-11-19",
          weekNumber: 8,
        });

        assert.strictEqual(created.classCode, "IF-01");
        assert.strictEqual(created.date, "2026-11-19");
        assert.strictEqual(created.weekNumber, 8);
        assert.ok(created.startTime.length > 0, "Tự động lấy giờ bắt đầu từ lịch cố định");
        assert.ok(created.room.includes("Phòng"), "Tự động lấy phòng học của lớp");
        assert.strictEqual(
          created.studentRecords.length,
          2,
          "Tự động nạp danh sách học sinh đang hoạt động của lớp IF-01",
        );
      });

      it("1.3. Sao chép nội dung từ buổi học trước (copyFromPreviousSession)", async () => {
        const copied = await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-if-01",
          date: "2026-11-20",
          copyFromPreviousSession: true,
        });

        assert.strictEqual(copied.journalStatus, "draft");
        assert.ok(
          copied.topic.includes("Passage 2") ||
            copied.generalNotes.includes("16/11/2026"),
          "Kế thừa kế hoạch buổi tiếp theo từ buổi học liền trước",
        );
      });

      it("1.4. Chỉnh sửa nhật ký đã lưu tự động ghi lại lịch sử chỉnh sửa (revisions)", async () => {
        const session = await teachingJournalService.getClassSessionById(
          "cs-2026-11-14-ii01",
        );
        const initialRevisionsCount = session.revisions.length;

        const updated = await teachingJournalService.updateClassSession(
          session.id,
          {
            topic: "Writing Task 2 – Counter-Argument (Updated Masterclass)",
            generalNotes:
              "Đã bổ sung thêm 2 đoạn mẫu Band 8.5 cho học viên tham khảo.",
            completionResult: "completed",
            journalStatus: "completed",
          },
        );

        assert.strictEqual(
          updated.revisions.length,
          initialRevisionsCount + 1,
          "Phải tự động lưu thêm 1 bản ghi lịch sử chỉnh sửa",
        );
        assert.strictEqual(
          updated.revisions[0].previousTopic,
          "Writing Task 2 – Counter-Argument & Concession Paragraphs",
        );
      });
    });

    describe("2. Lịch sử học tập theo từng buổi (Session Learning History)", () => {
      it("2.1. Cập nhật đánh giá từng học sinh trong buổi và đồng bộ điểm danh sang Hồ sơ học sinh", async () => {
        const session = await teachingJournalService.getClassSessionById(
          "cs-2026-11-17-ii01",
        );

        const updated = await teachingJournalService.updateClassSession(
          session.id,
          {
            journalStatus: "completed",
            completionResult: "completed",
            homework: "Thu âm bài nói Part 3 chủ đề Technology",
            studentRecords: session.studentRecords.map((r) =>
              r.studentId === "stu-01"
                ? {
                    studentId: r.studentId,
                    attendance: "present",
                    homeworkStatus: "submitted",
                    learningStatus: "good",
                    skill: "Speaking",
                    score: 8.5,
                    teacherFeedback:
                      "Phản xạ rất tự nhiên, dùng tốt cấu trúc hedging.",
                    followUp: "Duy trì luyện tập.",
                  }
                : {
                    studentId: r.studentId,
                    attendance: "excused",
                    homeworkStatus: "exempt",
                    learningStatus: "satisfactory",
                    skill: "Speaking",
                    score: null,
                    teacherFeedback: "Xin phép nghỉ có lý do chính đáng.",
                    followUp: "Xem lại video bài giảng.",
                  },
            ),
          },
        );

        assert.strictEqual(updated.journalStatus, "completed");

        const timelineStu01 =
          await teachingJournalService.getStudentLearningTimeline("stu-01");
        assert.ok(timelineStu01.totalSessions >= 3);
        assert.strictEqual(
          timelineStu01.timeline[0].teacherFeedback,
          "Phản xạ rất tự nhiên, dùng tốt cấu trúc hedging.",
        );

        const timelineStu04 =
          await teachingJournalService.getStudentLearningTimeline("stu-04");
        assert.strictEqual(timelineStu04.excusedCount, 1);
        assert.strictEqual(
          timelineStu04.attendanceRate,
          100,
          "Nghỉ có phép không làm giảm tỷ lệ chuyên cần trên các buổi bắt buộc",
        );
      });
    });

    describe("3. Phân tích hiệu quả lớp học (Class Performance Analytics)", () => {
      it("3.1. Học sinh mới nhập học chưa có điểm không bị tính thành 0 làm giảm điểm TB của lớp", async () => {
        const beforeReport =
          await teachingJournalService.getClassPerformanceAnalytics({
            classId: "cls-ii-01",
          });
        const scoreBefore = beforeReport.classComparisons[0].averageScore;
        assert.ok(scoreBefore && scoreBefore > 7.0);

        await studentService.createStudent({
          code: "HS-NEW-ANALYTICS",
          fullName: "Học Viên Mới Nhập Học",
          classId: "cls-ii-01",
          targetGoal: "IELTS 7.0",
        });

        const afterReport =
          await teachingJournalService.getClassPerformanceAnalytics({
            classId: "cls-ii-01",
          });
        const scoreAfter = afterReport.classComparisons[0].averageScore;

        assert.strictEqual(
          scoreAfter,
          scoreBefore,
          "Điểm trung bình lớp không bị kéo tụt bởi học sinh mới chưa có bài thi",
        );
      });

      it("3.2. Tự động nhận diện cảnh báo học sinh (chưa nộp bài tập, vắng học, kỹ năng dưới mục tiêu) và cho phép đánh dấu Đã xử lý", async () => {
        const report =
          await teachingJournalService.getClassPerformanceAnalytics();
        assert.ok(report.alerts.length > 0, "Phải phát hiện các cảnh báo học vụ");

        const huyAlert = report.alerts.find((a) => a.studentId === "stu-06");
        assert.ok(huyAlert, "Phải có cảnh báo cho học sinh Đặng Quốc Huy (stu-06)");
        assert.strictEqual(huyAlert.ackStatus, "active");

        await teachingJournalService.updateAnalyticsAlertStatus({
          alertId: huyAlert.alertId,
          status: "resolved",
          note: "Đã làm việc với phụ huynh và nhận bài nộp bù",
        });

        const updatedReport =
          await teachingJournalService.getClassPerformanceAnalytics();
        const updatedAlert = updatedReport.alerts.find(
          (a) => a.alertId === huyAlert.alertId,
        );
        assert.strictEqual(updatedAlert?.ackStatus, "resolved");
      });

      it("3.3. Lọc theo classId trả về chính xác KPI, danh sách so sánh và cảnh báo chỉ thuộc về lớp đó", async () => {
        const targetClassId = "cls-ii-01";
        const report = await teachingJournalService.getClassPerformanceAnalytics({
          classId: targetClassId,
        });

        assert.strictEqual(report.kpi.activeClassesCount, 1);
        assert.strictEqual(report.classComparisons.length, 1);
        assert.strictEqual(report.classComparisons[0].classId, targetClassId);
        assert.strictEqual(report.classComparisons[0].classCode, "II-01");
        assert.ok(
          report.alerts.every((a) => a.classId === targetClassId),
          "Mọi cảnh báo phải thuộc về đúng lớp học được lọc",
        );
      });

      it("3.4. Lọc theo programType chỉ trả về các lớp phù hợp với từ khóa chương trình", async () => {
        const ieltsReport =
          await teachingJournalService.getClassPerformanceAnalytics({
            programType: "IELTS",
          });
        assert.ok(ieltsReport.classComparisons.length >= 2);
        assert.ok(
          ieltsReport.classComparisons.every(
            (c) =>
              c.className.toLowerCase().includes("ielts") ||
              c.targetBand.toLowerCase().includes("ielts"),
          ),
        );
        assert.strictEqual(
          ieltsReport.kpi.activeClassesCount,
          ieltsReport.classComparisons.length,
        );
      });

      it("3.5. Lọc theo period (7d, 30d) lọc chính xác các buổi học theo mốc thời gian", async () => {
        const allReport =
          await teachingJournalService.getClassPerformanceAnalytics({
            period: "all",
          });
        const d7Report =
          await teachingJournalService.getClassPerformanceAnalytics({
            period: "7d",
          });

        assert.ok(
          d7Report.charts.weeklySessions.length <=
            allReport.charts.weeklySessions.length,
          "Số lượng buổi trong 7 ngày phải nhỏ hơn hoặc bằng toàn bộ kỳ",
        );
        assert.ok(
          d7Report.charts.weeklySessions.every((s) => s.date >= "2026-11-10"),
          "Các buổi trong 7d phải diễn ra từ ngày mốc 2026-11-10 trở đi",
        );
      });

      it("3.6. Tính toán chuẩn xác các chỉ số vĩ mô KPI: chuyên cần, BTVN và hoàn thành chương trình", async () => {
        const report = await teachingJournalService.getClassPerformanceAnalytics();

        assert.ok(
          report.kpi.overallAttendanceRate >= 0 &&
            report.kpi.overallAttendanceRate <= 100,
        );
        assert.ok(
          report.kpi.overallHomeworkRate >= 0 &&
            report.kpi.overallHomeworkRate <= 100,
        );
        assert.ok(
          report.kpi.overallCurriculumProgress >= 0 &&
            report.kpi.overallCurriculumProgress <= 100,
        );
        assert.ok(
          report.kpi.supportRatePercent >= 0 &&
            report.kpi.supportRatePercent <= 100,
        );
      });

      it("3.7. Phát hiện chính xác lớp học chậm tiến độ và kích hoạt cảnh báo curriculum-behind khi trễ >= 2 tuần", async () => {
        const report = await teachingJournalService.getClassPerformanceAnalytics();
        const behindClass = report.classComparisons.find(
          (c) => c.isBehindSchedule,
        );

        if (behindClass) {
          assert.ok(
            behindClass.expectedWeek - behindClass.completedWeeks >= 2,
          );
          const behindAlert = report.alerts.find(
            (a) =>
              a.classId === behindClass.classId &&
              a.type === "curriculum-behind",
          );
          assert.ok(behindAlert);
          assert.strictEqual(behindAlert.targetType, "class");
        }
      });

      it("3.8. Sĩ số enrolled và capacity trong bảng so sánh phản ánh đúng số học sinh thực tế", async () => {
        const report = await teachingJournalService.getClassPerformanceAnalytics();
        const allStudents = await studentService.listAllStudents({
          status: "non-archived",
        });
        for (const comp of report.classComparisons) {
          const activeCount = allStudents.filter(
            (s) => s.classId === comp.classId,
          ).length;
          assert.strictEqual(
            comp.enrolled,
            activeCount,
            `Sĩ số enrolled của lớp ${comp.classCode} phải khớp số học sinh hoạt động`,
          );
          assert.ok(comp.capacity > 0, "Sức chứa lớp học phải lớn hơn 0");
        }
      });

      it("3.9. Trích xuất đúng chuỗi biểu đồ weeklySessions theo thứ tự thời gian tăng dần", async () => {
        const report = await teachingJournalService.getClassPerformanceAnalytics();
        const sessions = report.charts.weeklySessions;

        assert.ok(sessions.length > 0, "Phải có dữ liệu chuỗi buổi học");
        for (let i = 1; i < sessions.length; i++) {
          assert.ok(
            sessions[i].date >= sessions[i - 1].date,
            "Danh sách buổi học biểu đồ phải được sắp xếp tăng dần theo ngày",
          );
        }
      });

      it("3.10. Tính toán đúng trung bình 4 kỹ năng (L, R, W, S) và Overall Band của học sinh có điểm", async () => {
        const report = await teachingJournalService.getClassPerformanceAnalytics();
        const { skillAverages } = report.charts;

        assert.ok(skillAverages.gradedStudentCount > 0);
        assert.ok(skillAverages.listening > 0 && skillAverages.listening <= 9.0);
        assert.ok(skillAverages.reading > 0 && skillAverages.reading <= 9.0);
        assert.ok(skillAverages.writing > 0 && skillAverages.writing <= 9.0);
        assert.ok(skillAverages.speaking > 0 && skillAverages.speaking <= 9.0);
        assert.ok(skillAverages.overall > 0 && skillAverages.overall <= 9.0);
      });

      it("3.11. Tổng hợp chính xác xu hướng điểm theo từng bài kiểm tra chính thức", async () => {
        const report = await teachingJournalService.getClassPerformanceAnalytics();
        const trends = report.charts.assessmentTrends;

        assert.ok(trends.length > 0);
        for (const t of trends) {
          assert.ok(t.assessmentTitle.length > 0);
          assert.ok(t.overall > 0 && t.overall <= 9.0);
        }
      });

      it("3.12. Tự động phát hiện cảnh báo điểm sa sút liên tiếp (score-drop) khi bài thi mới giảm điểm", async () => {
        const newStu = await studentService.createStudent({
          code: "HS-SCORE-DROP",
          fullName: "Học Sinh Tụt Điểm Test",
          classId: "cls-if-01",
          targetGoal: "IELTS 7.0",
        });

        await studentService.recordGrade({
          studentId: newStu.id,
          assessmentTitle: "Mock Test 1",
          date: "2026-10-15",
          listening: 7.0,
          reading: 7.5,
          writing: 6.5,
          speaking: 7.0,
          status: "published",
        });
        await studentService.recordGrade({
          studentId: newStu.id,
          assessmentTitle: "Mock Test 2",
          date: "2026-11-15",
          listening: 6.0,
          reading: 6.0,
          writing: 5.5,
          speaking: 6.5,
          status: "published",
        });

        const report = await teachingJournalService.getClassPerformanceAnalytics({
          classId: "cls-if-01",
        });
        const dropAlert = report.alerts.find(
          (a) => a.studentId === newStu.id && a.type === "score-drop",
        );
        assert.ok(dropAlert, "Phải sinh ra cảnh báo score-drop");
        assert.strictEqual(dropAlert.severity, "high");
        assert.ok(dropAlert.detail.includes("giảm 1"));
      });

      it("3.13. Tự động phát hiện cảnh báo kỹ năng dưới mục tiêu đầu ra (skill-below-target)", async () => {
        const report = await teachingJournalService.getClassPerformanceAnalytics();
        const skillAlert = report.alerts.find(
          (a) => a.type === "skill-below-target",
        );
        if (skillAlert) {
          assert.ok(skillAlert.title.includes("kỹ năng"));
          assert.strictEqual(skillAlert.targetType, "student");
        }
      });

      it("3.14. Tự động phát hiện cảnh báo chuyên cần thấp (low-attendance) dưới ngưỡng 90%", async () => {
        const report = await teachingJournalService.getClassPerformanceAnalytics();
        const lowAttAlert = report.alerts.find(
          (a) => a.type === "low-attendance",
        );
        assert.ok(lowAttAlert, "Phải phát hiện cảnh báo chuyên cần thấp (stu-06)");
        assert.strictEqual(lowAttAlert.studentId, "stu-06");
        assert.ok(lowAttAlert.detail.includes("88%"));
      });

      it("3.15. Vòng đời trạng thái cảnh báo: active -> acknowledged -> resolved -> active (mở lại)", async () => {
        const report = await teachingJournalService.getClassPerformanceAnalytics();
        const targetAlert = report.alerts[0];
        assert.ok(targetAlert);

        const ack1 = await teachingJournalService.updateAnalyticsAlertStatus({
          alertId: targetAlert.alertId,
          status: "acknowledged",
          note: "Đã ghi nhận cần gọi điện",
        });
        assert.strictEqual(ack1.status, "acknowledged");

        let rep = await teachingJournalService.getClassPerformanceAnalytics();
        let alertState = rep.alerts.find(
          (a) => a.alertId === targetAlert.alertId,
        );
        assert.strictEqual(alertState?.ackStatus, "acknowledged");

        const ack2 = await teachingJournalService.updateAnalyticsAlertStatus({
          alertId: targetAlert.alertId,
          status: "resolved",
          note: "Đã hoàn thành buổi phụ đạo",
        });
        assert.strictEqual(ack2.status, "resolved");

        rep = await teachingJournalService.getClassPerformanceAnalytics();
        alertState = rep.alerts.find((a) => a.alertId === targetAlert.alertId);
        assert.strictEqual(alertState?.ackStatus, "resolved");

        const ack3 = await teachingJournalService.updateAnalyticsAlertStatus({
          alertId: targetAlert.alertId,
          status: "active",
        });
        assert.strictEqual(ack3.status, "active");

        rep = await teachingJournalService.getClassPerformanceAnalytics();
        alertState = rep.alerts.find((a) => a.alertId === targetAlert.alertId);
        assert.strictEqual(alertState?.ackStatus, "active");
      });

      it("3.16. Giải quyết toàn bộ cảnh báo của học sinh sẽ giảm số học sinh cần chú ý (studentsNeedingAttentionCount)", async () => {
        const beforeReport =
          await teachingJournalService.getClassPerformanceAnalytics();
        const initialCount = beforeReport.kpi.studentsNeedingAttentionCount;
        assert.ok(initialCount > 0);

        const stu06Alerts = beforeReport.alerts.filter(
          (a) => a.studentId === "stu-06",
        );
        assert.ok(stu06Alerts.length > 0);

        for (const al of stu06Alerts) {
          await teachingJournalService.updateAnalyticsAlertStatus({
            alertId: al.alertId,
            status: "resolved",
          });
        }

        const afterReport =
          await teachingJournalService.getClassPerformanceAnalytics();
        assert.strictEqual(
          afterReport.kpi.studentsNeedingAttentionCount,
          initialCount - 1,
        );
      });

      it("3.17. Validate chặt chẽ dữ liệu đầu vào khi cập nhật trạng thái cảnh báo (chặn dữ liệu lỗi)", async () => {
        await assert.rejects(
          async () => {
            await teachingJournalService.updateAnalyticsAlertStatus({
              status: "resolved",
            });
          },
          { name: "ValidationError" },
        );

        await assert.rejects(
          async () => {
            await teachingJournalService.updateAnalyticsAlertStatus({
              alertId: "alert-1",
              status: "unknown_status" as unknown as "active",
            });
          },
          { name: "ValidationError" },
        );
      });
    });

    describe("4. Nghiệp vụ nâng cao Nhật ký Giảng dạy & Cổng Học sinh", () => {
      it("4.1. Chặn tạo nhật ký cho lớp archived/completed & bỏ qua học sinh on-leave trong danh sách điểm danh", async () => {
        await prisma.classroom.update({
          where: { id: "cls-ii-01" },
          data: { status: "archived" },
        });

        await assert.rejects(
          async () => {
            await teachingJournalService.createOrGenerateClassSession({
              classId: "cls-ii-01",
              date: "2026-11-28",
            });
          },
          { name: "ValidationError" },
        );

        await prisma.classroom.update({
          where: { id: "cls-ii-01" },
          data: { status: "active" },
        });

        await studentService.updateStudent("stu-03", { status: "on-leave" });

        const created = await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-if-01",
          date: "2026-11-28",
          startTime: "17:45",
          endTime: "19:45",
        });

        assert.equal(
          created.studentRecords.some((r) => r.studentId === "stu-03"),
          false,
          "Học sinh đang bảo lưu (on-leave) không được đưa vào bảng điểm danh",
        );
        assert.equal(
          created.studentRecords.some((r) => r.studentId === "stu-06"),
          true,
          "Học sinh đang học phải có mặt trong bảng điểm danh",
        );
      });

      it("4.2. Chặn tạo trùng nhật ký cùng (classId, date, startTime) & chặn startTime >= endTime khi cập nhật", async () => {
        await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-if-01",
          date: "2026-11-29",
          startTime: "17:45",
          endTime: "19:45",
        });

        await assert.rejects(
          async () => {
            await teachingJournalService.createOrGenerateClassSession({
              classId: "cls-if-01",
              date: "2026-11-29",
              startTime: "17:45",
              endTime: "19:45",
            });
          },
          { name: "ConflictError" },
        );

        const list = await teachingJournalService.listClassSessions({
          classId: "cls-if-01",
        });
        const target = list[0];
        assert.ok(target);

        await assert.rejects(
          async () => {
            await teachingJournalService.updateClassSession(target.id, {
              startTime: "20:00",
              endTime: "18:00",
            });
          },
          { name: "ValidationError" },
        );
      });

      it("4.3. Lưu privateNotes nội bộ giáo viên và KHÔNG rò rỉ vào attendanceHistory hay recentComment của học sinh", async () => {
        const ses = await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-ja-01",
          date: "2026-11-30",
          startTime: "17:30",
          endTime: "19:15",
        });

        const firstStuId = ses.studentRecords[0]?.studentId;
        assert.ok(firstStuId);

        const secretNote = "GHI_CHU_NOI_BO_GIAO_VIEN_KHONG_HIEN_CONG_HS";
        const secretFollowUp = "NHAC_NOI_BO_PHU_HUYNH_RIENG";
        const publicFeedback = "Con phát âm tốt và chủ động trả lời câu hỏi.";

        const updated = await teachingJournalService.updateClassSession(ses.id, {
          journalStatus: "completed",
          generalNotes: "Lớp hoàn thành tốt bài thực hành.",
          privateNotes: secretNote,
          studentRecords: [
            {
              studentId: firstStuId,
              attendance: "present",
              homeworkStatus: "submitted",
              learningStatus: "good",
              skill: "Speaking",
              score: 9,
              teacherFeedback: publicFeedback,
              followUp: secretFollowUp,
            },
          ],
        });

        assert.equal(updated.privateNotes, secretNote);

        const stu = await studentService.getStudentById(firstStuId);
        assert.ok(stu);
        assert.equal(stu.recentComment, publicFeedback);
        const serializedHistory = JSON.stringify(stu.attendanceHistory);
        assert.equal(serializedHistory.includes(secretNote), false);
        assert.equal(serializedHistory.includes(secretFollowUp), false);
      });

      it("4.4. sanitizeSessionTimelineForStudent CHỈ hiển thị buổi completed cho đúng studentId & ẩn hoàn toàn draft + privateNotes", async () => {
        const clsStudents = await studentService.listAllStudents({
          classId: "cls-if-01",
          status: "non-archived",
        });
        assert.ok(clsStudents.length >= 2);
        const [stuA, stuB] = clsStudents;

        const completedSes =
          await teachingJournalService.createOrGenerateClassSession({
            classId: "cls-if-01",
            date: "2026-12-01",
            startTime: "17:45",
            endTime: "19:45",
            topic: "Bài công khai Portal",
          });

        await teachingJournalService.updateClassSession(completedSes.id, {
          journalStatus: "completed",
          generalNotes: "Ghi chú chung công khai",
          privateNotes: "SECRET_INTERNAL_TEACHER_MEMO",
          homework: "Làm bài đọc trang 20",
          studentRecords: [
            {
              studentId: stuA.id,
              attendance: "present",
              homeworkStatus: "submitted",
              learningStatus: "good",
              skill: "Reading",
              score: 8.5,
              teacherFeedback: "Feedback riêng của A",
              followUp: "FOLLOWUP_NOI_BO_A",
            },
            {
              studentId: stuB.id,
              attendance: "absent",
              homeworkStatus: "not-submitted",
              learningStatus: "needs-support",
              skill: "Reading",
              score: 5,
              teacherFeedback: "Feedback riêng của B - A không được thấy",
              followUp: "FOLLOWUP_NOI_BO_B",
            },
          ],
        });

        const draftSes =
          await teachingJournalService.createOrGenerateClassSession({
            classId: "cls-if-01",
            date: "2026-12-03",
            startTime: "17:45",
            endTime: "19:45",
            topic: "Bài nháp chưa công bố",
          });

        await teachingJournalService.updateClassSession(draftSes.id, {
          journalStatus: "draft",
          generalNotes: "Nội dung nháp chưa cho HS xem",
        });

        const allSessions = await teachingJournalService.listClassSessions();
        const timelineForA = sanitizeSessionTimelineForStudent(
          allSessions,
          stuA.id,
        );

        assert.equal(
          timelineForA.some((entry) => entry.id === completedSes.id),
          true,
        );
        assert.equal(
          timelineForA.some((entry) => entry.id === draftSes.id),
          false,
        );

        const entryA = timelineForA.find(
          (entry) => entry.id === completedSes.id,
        )!;
        assert.equal(entryA.score, 8.5);
        assert.equal(entryA.studentFeedback, "Feedback riêng của A");

        const serializedA = JSON.stringify(timelineForA);
        assert.equal(
          serializedA.includes("SECRET_INTERNAL_TEACHER_MEMO"),
          false,
        );
        assert.equal(serializedA.includes("FOLLOWUP_NOI_BO"), false);
        assert.equal(
          serializedA.includes("Feedback riêng của B - A không được thấy"),
          false,
        );
      });

      it("4.5. restoreJournalRevision khôi phục đầy đủ nội dung phiên bản trước và lưu thêm bản ghi lịch sử", async () => {
        const ses = await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-if-01",
          date: "2026-12-05",
          startTime: "17:45",
          endTime: "19:45",
          topic: "Topic Ban Đầu",
        });

        await teachingJournalService.updateClassSession(ses.id, {
          journalStatus: "draft",
          topic: "Topic V1",
          generalNotes: "Notes V1",
          homework: "HW V1",
          completionResult: "partial",
        });

        const v2 = await teachingJournalService.updateClassSession(ses.id, {
          topic: "Topic V2",
          generalNotes: "Notes V2",
          homework: "HW V2",
          completionResult: "completed",
        });

        assert.ok(v2.revisions.length >= 1);
        const revToRestore = v2.revisions[0];
        assert.equal(revToRestore.previousTopic, "Topic V1");
        assert.equal(revToRestore.previousHomework, "HW V1");

        const restored = await teachingJournalService.restoreJournalRevision(
          ses.id,
          { revisionId: revToRestore.id },
        );

        assert.equal(restored.topic, "Topic V1");
        assert.equal(restored.generalNotes, "Notes V1");
        assert.equal(restored.homework, "HW V1");
        assert.equal(restored.completionResult, "partial");
        assert.equal(restored.revisions[0].previousTopic, "Topic V2");
      });

      it("4.6. deleteClassSession xóa buổi học & đồng bộ gỡ sessionId khỏi attendanceHistory của học viên", async () => {
        const ses = await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-if-01",
          date: "2026-12-06",
          startTime: "17:45",
          endTime: "19:45",
        });
        const stuId = ses.studentRecords[0]!.studentId;

        await teachingJournalService.updateClassSession(ses.id, {
          journalStatus: "completed",
          studentRecords: [
            {
              studentId: stuId,
              attendance: "absent",
              homeworkStatus: "not-submitted",
              learningStatus: "needs-support",
              skill: "General",
              teacherFeedback: "Nghỉ buổi 06/12",
              followUp: "",
            },
          ],
        });

        const stuBefore = await studentService.getStudentById(stuId);
        assert.equal(
          stuBefore.attendanceHistory.some((a) => a.sessionId === ses.id),
          true,
        );

        const delRes = await teachingJournalService.deleteClassSession(ses.id);
        assert.equal(delRes.deleted, true);

        await assert.rejects(
          async () => teachingJournalService.getClassSessionById(ses.id),
          { name: "NotFoundError" },
        );

        const stuAfter = await studentService.getStudentById(stuId);
        assert.equal(
          stuAfter.attendanceHistory.some((a) => a.sessionId === ses.id),
          false,
          "Phải xóa attendanceHistory gắn với session đã bị xóa",
        );
      });

      it("4.7. getPendingSessionsFromSchedule trả về buổi dạy theo TKB/dạy bù chưa có nhật ký và tự biến mất sau khi tạo", async () => {
        const todayIso = toIsoDate(new Date());
        const yesterdayIso = addDaysIso(todayIso, -1);

        const createdExc = await scheduleService.createScheduleException({
          type: "makeup",
          classId: "cls-if-01",
          originalDate: yesterdayIso,
          newDate: yesterdayIso,
          startTime: "10:00",
          endTime: "11:30",
          room: "Phòng Lab 1 · Cơ sở Nguyễn Du",
          topic: "Buổi phụ đạo Writing đặc biệt",
          reason: "Ôn tập trước kiểm tra",
        });

        const pendingBefore =
          await teachingJournalService.getPendingSessionsFromSchedule(7);
        const matched = pendingBefore.find(
          (p) => p.scheduleExceptionId === createdExc.id,
        );
        assert.ok(
          matched,
          "Buổi dạy bù hôm qua chưa có nhật ký phải xuất hiện trong pending",
        );

        await teachingJournalService.createOrGenerateClassSession({
          classId: matched.classId,
          date: matched.date,
          startTime: matched.startTime,
          endTime: matched.endTime,
          room: matched.room,
          topic: matched.topic,
          scheduleExceptionId: matched.scheduleExceptionId,
        });

        const pendingAfter =
          await teachingJournalService.getPendingSessionsFromSchedule(7);
        assert.equal(
          pendingAfter.some((p) => p.scheduleExceptionId === createdExc.id),
          false,
          "Sau khi tạo nhật ký cho buổi đó thì không còn nằm trong danh sách pending",
        );
      });

      it("4.8. Tải tài liệu PDF thật (uploadCurriculumAttachment + addSessionAttachment) & chặn tệp giả mạo magic bytes", async () => {
        const ses = await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-ja-01",
          date: "2026-12-08",
          startTime: "17:30",
          endTime: "19:15",
        });

        const validPdfBytes = new TextEncoder().encode("%PDF-1.4\n%TestHandout");
        const { storedFile, attachment } =
          await storageService.uploadCurriculumAttachment({
            fileName: "Speaking-Handout-Week9.pdf",
            mimeType: "application/pdf",
            sizeBytes: validPdfBytes.byteLength,
            fileBuffer: validPdfBytes,
            classId: ses.classId,
            classCode: ses.classCode,
            weekNumber: ses.weekNumber,
            visibility: "public",
            actorId: "teacher@example.com",
            actorRole: "admin",
          });

        const updated = await teachingJournalService.addSessionAttachment(
          ses.id,
          {
            id: attachment.id,
            storedFileId: storedFile.id,
            name: attachment.name,
            type: "PDF",
            size: attachment.size,
            url: attachment.url,
            uploadedAt: attachment.uploadedAt,
          },
        );

        assert.equal(updated.attachments.length, 1);
        assert.equal(updated.attachments[0].storedFileId, storedFile.id);

        const spoofedBytes = new TextEncoder().encode("MZ_NOT_A_PDF_EXE");
        await assert.rejects(
          async () =>
            storageService.uploadCurriculumAttachment({
              fileName: "malware.pdf",
              mimeType: "application/pdf",
              sizeBytes: spoofedBytes.byteLength,
              fileBuffer: spoofedBytes,
              classId: ses.classId,
              classCode: ses.classCode,
              weekNumber: ses.weekNumber,
              visibility: "public",
              actorId: "teacher@example.com",
              actorRole: "admin",
            }),
          { name: "ValidationError" },
        );
      });

      it("4.9. buildParentSessionDigest tổng hợp điểm/nhận xét công khai và KHÔNG chứa privateNotes hoặc followUp", async () => {
        const ses = await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-ja-01",
          date: "2026-12-10",
          startTime: "17:30",
          endTime: "19:15",
          topic: "Academic Presentation Practice",
        });
        const stuId = ses.studentRecords[0]!.studentId;

        const updated = await teachingJournalService.updateClassSession(ses.id, {
          journalStatus: "completed",
          generalNotes: "Cả lớp thuyết trình tự tin.",
          privateNotes: "TOP_SECRET_TEACHER_NOTE_DIGEST",
          homework: "Quay video nói 2 phút",
          studentRecords: [
            {
              studentId: stuId,
              attendance: "present",
              homeworkStatus: "submitted",
              learningStatus: "good",
              skill: "Speaking",
              score: 9.5,
              teacherFeedback: "Phát âm rõ, ngữ điệu tự nhiên",
              followUp: "INTERNAL_FOLLOWUP_DIGEST",
            },
          ],
        });

        const digest = buildParentSessionDigest(updated);
        assert.ok(digest.includes("Academic Presentation Practice"));
        assert.ok(digest.includes("[9.5/10]"));
        assert.ok(digest.includes("Phát âm rõ, ngữ điệu tự nhiên"));
        assert.equal(digest.includes("TOP_SECRET_TEACHER_NOTE_DIGEST"), false);
        assert.equal(digest.includes("INTERNAL_FOLLOWUP_DIGEST"), false);
      });

      it("4.10. buildTeachingJournalCsv tạo file CSV UTF-8 BOM đúng định dạng và ẩn privateNotes", async () => {
        const list = await teachingJournalService.listClassSessions();
        assert.ok(list.length > 0);
        list[0] = { ...list[0], privateNotes: "CSV_SECRET_INTERNAL_NOTE" };

        const csv = buildTeachingJournalCsv(list);
        assert.ok(csv.startsWith("\uFEFF"));
        assert.ok(csv.includes("Chuyên đề"));
        assert.ok(csv.includes("Điểm TB kiểm tra"));
        assert.equal(csv.includes("CSV_SECRET_INTERNAL_NOTE"), false);
      });
    });

    describe("5. Phân tích Hiệu quả Nâng cao, Sức khỏe Lớp & Can thiệp hàng loạt", () => {
      it("5.1. Hỗ trợ lọc động theo khoảng ngày fromDate / toDate", async () => {
        await teachingJournalService.createOrGenerateClassSession({
          classId: "cls-if-01",
          date: "2026-10-05",
          startTime: "17:45",
          endTime: "19:45",
          topic: "Buổi tháng 10 cũ",
        });

        const octoberOnly =
          await teachingJournalService.getClassPerformanceAnalytics({
            fromDate: "2026-10-01",
            toDate: "2026-10-31",
          });

        assert.ok(
          octoberOnly.charts.weeklySessions.length >= 1 &&
            octoberOnly.charts.weeklySessions.every(
              (s) => s.date >= "2026-10-01" && s.date <= "2026-10-31",
            ),
        );
      });

      it("5.2. Điểm bản nháp (draft) KHÔNG bị tính vào skillAverages, assessmentTrends hay kích hoạt score-drop", async () => {
        const freshStu = await studentService.createStudent({
          code: "HS-DRAFT-ANALYTICS",
          fullName: "Học Sinh Điểm Nháp",
          classId: "cls-if-01",
        });

        await studentService.recordGrade({
          studentId: freshStu.id,
          assessmentTitle: "Published Baseline",
          date: "2026-11-10",
          listening: 7.0,
          reading: 7.0,
          writing: 7.0,
          speaking: 7.0,
          status: "published",
        });

        await studentService.recordGrade({
          studentId: freshStu.id,
          assessmentTitle: "Unpublished Draft Quiz",
          date: "2026-11-19",
          listening: 4.5,
          reading: 4.5,
          writing: 4.5,
          speaking: 4.5,
          status: "draft",
        });

        const report =
          await teachingJournalService.getClassPerformanceAnalytics({
            classId: "cls-if-01",
          });

        assert.equal(
          report.alerts.some(
            (a) => a.studentId === freshStu.id && a.type === "score-drop",
          ),
          false,
          "Điểm draft không được tạo cảnh báo tụt điểm score-drop",
        );
        assert.equal(
          report.charts.assessmentTrends.some(
            (t) => t.assessmentTitle === "Unpublished Draft Quiz",
          ),
          false,
          "Bài thi draft không được xuất hiện trong assessmentTrends",
        );
      });

      it("5.3. Học viên đang bảo lưu (on-leave) được miễn toàn bộ cảnh báo học vụ", async () => {
        await studentService.updateStudent("stu-06", { status: "on-leave" });

        const report =
          await teachingJournalService.getClassPerformanceAnalytics();

        assert.equal(
          report.alerts.some((a) => a.studentId === "stu-06"),
          false,
          "Học viên on-leave không được sinh cảnh báo rủi ro học vụ",
        );
        assert.ok(report.summaryMetrics.onLeaveStudentsCount >= 1);
      });

      it("5.4. computeClassHealthScore & classComparisons tính đúng điểm sức khỏe lớp", async () => {
        const report =
          await teachingJournalService.getClassPerformanceAnalytics();
        assert.ok(report.classComparisons.length > 0);
        for (const comp of report.classComparisons) {
          assert.ok(comp.healthScore >= 0 && comp.healthScore <= 100);
          assert.ok(["healthy", "watch", "at-risk"].includes(comp.healthLevel));
        }
      });

      it("5.5. studentSpotlights phân loại học viên cần can thiệp (atRiskStudents) & nổi bật (topPerformers)", async () => {
        const report =
          await teachingJournalService.getClassPerformanceAnalytics();

        assert.ok(Array.isArray(report.studentSpotlights.atRiskStudents));
        assert.ok(Array.isArray(report.studentSpotlights.topPerformers));
        if (report.studentSpotlights.atRiskStudents.length > 0) {
          assert.ok(
            report.studentSpotlights.atRiskStudents.every(
              (s) => s.activeAlertCount >= 1 || s.attendanceRate < 85,
            ),
          );
        }
        if (report.studentSpotlights.topPerformers.length > 0) {
          assert.ok(
            report.studentSpotlights.topPerformers.every(
              (s) => s.highAlertCount === 0,
            ),
          );
        }
      });

      it("5.6. batchUpdateAnalyticsAlertStatus xử lý hàng loạt nhiều cảnh báo kèm ghi chú can thiệp", async () => {
        const initial =
          await teachingJournalService.getClassPerformanceAnalytics();
        const targetIds = initial.alerts.slice(0, 2).map((a) => a.alertId);
        assert.ok(targetIds.length >= 1);

        const batchRes =
          await teachingJournalService.batchUpdateAnalyticsAlertStatus({
            alertIds: targetIds,
            status: "resolved",
            note: "Đã phân công trợ giảng kèm nhóm tuần này",
          });

        assert.equal(batchRes.updatedCount, targetIds.length);

        const after =
          await teachingJournalService.getClassPerformanceAnalytics();
        for (const id of targetIds) {
          const matched = after.alerts.find((a) => a.alertId === id);
          assert.equal(matched?.ackStatus, "resolved");
          assert.equal(
            matched?.note,
            "Đã phân công trợ giảng kèm nhóm tuần này",
          );
        }
      });

      it("5.7. buildClassAnalyticsCsv & buildAnalyticsExecutiveSummary xuất đúng nội dung điều hành", async () => {
        const report =
          await teachingJournalService.getClassPerformanceAnalytics();

        const csv = buildClassAnalyticsCsv(report);
        assert.ok(csv.startsWith("\uFEFF"));
        assert.ok(csv.includes("Điểm sức khỏe"));
        assert.ok(csv.includes("Cảnh báo"));

        const summary = buildAnalyticsExecutiveSummary(report);
        assert.ok(summary.includes("[BÁO CÁO PHÂN TÍCH HIỆU QUẢ LỚP HỌC]"));
        assert.ok(summary.includes("Xếp hạng Sức khỏe lớp học"));
      });
    });
  },
);
