import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { resetRuntimeStore } from "@/services/runtime-store";
import * as studentService from "@/services/student.service";
import * as teachingJournalService from "@/services/teaching-journal.service";

describe("Teaching Journal, Session Learning History & Class Analytics", () => {
  beforeEach(() => {
    resetRuntimeStore();
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
        copied.topic.includes("Passage 2") || copied.generalNotes.includes("16/11/2026"),
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
          generalNotes: "Đã bổ sung thêm 2 đoạn mẫu Band 8.5 cho học viên tham khảo.",
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
                  teacherFeedback: "Phản xạ rất tự nhiên, dùng tốt cấu trúc hedging.",
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

      // Kiểm tra Timeline lịch sử học tập của học sinh stu-01
      const timelineStu01 =
        await teachingJournalService.getStudentLearningTimeline("stu-01");
      assert.ok(timelineStu01.totalSessions >= 3);
      assert.strictEqual(
        timelineStu01.timeline[0].teacherFeedback,
        "Phản xạ rất tự nhiên, dùng tốt cấu trúc hedging.",
      );

      // Kiểm tra nghỉ có phép (excused) của stu-04 không bị tính phạt như vắng không phép
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

      // Thêm học sinh mới chưa có bài kiểm tra nào (averageScore = 0, grades = [])
      await studentService.createStudent({
        code: "HS-NEW-ANALYTICS",
        fullName: "Học Viên Mới Nhập Học",
        classId: "cls-ii-01",
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

      // Tìm cảnh báo chưa nộp bài tập hoặc vắng học của stu-06 (Đặng Quốc Huy)
      const huyAlert = report.alerts.find((a) => a.studentId === "stu-06");
      assert.ok(huyAlert, "Phải có cảnh báo cho học sinh Đặng Quốc Huy (stu-06)");
      assert.strictEqual(huyAlert.ackStatus, "active");

      // Giáo viên đánh dấu cảnh báo là Đã xử lý (resolved)
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
  });
});
