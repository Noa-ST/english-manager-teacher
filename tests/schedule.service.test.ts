import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { resetRuntimeStore, getRuntimeStore } from "@/services/runtime-store";
import * as scheduleService from "@/services/schedule.service";
import * as studentService from "@/services/student.service";
import { ValidationError } from "@/services/errors";

describe("Schedule Service — Quản lý Lịch dạy & Điểm danh Ca học nhanh", () => {
  beforeEach(() => {
    resetRuntimeStore();
  });

  describe("1. Điểm danh Ca học nhanh (recordAttendance)", () => {
    it("1.1. Điểm danh thành công với đầy đủ 4 trạng thái (present, late, absent, excused) và tính đúng tỷ lệ chuyên cần ca học", async () => {
      const summary = await scheduleService.recordAttendance({
        sessionId: "ses-mon-1",
        date: "2026-11-23",
        entries: [
          { studentId: "hs-2026-01", status: "present", note: "Đến đúng giờ" },
          { studentId: "hs-2026-02", status: "late", note: "Muộn 10 phút vì tắc đường" },
          { studentId: "hs-2026-03", status: "absent", note: "Nghỉ không báo" },
          { studentId: "hs-2026-04", status: "excused", note: "Có đơn xin nghỉ thi học kỳ" },
        ],
      });

      assert.strictEqual(summary.sessionId, "ses-mon-1");
      assert.strictEqual(summary.date, "2026-11-23");
      assert.strictEqual(summary.recordedCount, 4);
      // attendanceRate của ca học = (present + late) / total = (1 + 1) / 4 = 50%
      assert.strictEqual(summary.attendanceRate, 50);

      // Kiểm tra lịch sử điểm danh của học sinh
      const stu01 = await studentService.getStudentById("hs-2026-01");
      assert.ok(stu01);
      assert.ok(stu01.attendanceHistory.length > 0);
      assert.strictEqual(stu01.attendanceHistory[0].date, "2026-11-23");
      assert.strictEqual(stu01.attendanceHistory[0].status, "present");
      assert.strictEqual(stu01.attendanceHistory[0].note, "Đến đúng giờ");
    });

    it("1.2. Điểm danh đè (re-attendance) cùng ngày và ca học sẽ cập nhật bản ghi cũ, không tạo trùng lặp", async () => {
      // Điểm danh lần 1: hs-2026-01 vắng mặt
      await scheduleService.recordAttendance({
        sessionId: "ses-mon-1",
        date: "2026-11-23",
        entries: [
          { studentId: "hs-2026-01", status: "absent", note: "Chưa thấy đến" },
        ],
      });

      let stu = await studentService.getStudentById("hs-2026-01");
      assert.ok(stu);
      const initialHistoryLength = stu.attendanceHistory.length;
      assert.strictEqual(stu.attendanceHistory[0].status, "absent");

      // Điểm danh lại lần 2 (học sinh vào muộn được sửa lại thành "late")
      await scheduleService.recordAttendance({
        sessionId: "ses-mon-1",
        date: "2026-11-23",
        entries: [
          { studentId: "hs-2026-01", status: "late", note: "Đến muộn 15 phút" },
        ],
      });

      stu = await studentService.getStudentById("hs-2026-01");
      assert.ok(stu);
      assert.strictEqual(
        stu.attendanceHistory.length,
        initialHistoryLength,
        "Không được tăng số lượng bản ghi lịch sử khi điểm danh đè cùng buổi",
      );
      assert.strictEqual(stu.attendanceHistory[0].status, "late");
      assert.strictEqual(stu.attendanceHistory[0].note, "Đến muộn 15 phút");
    });

    it("1.3. Nghỉ có phép (excused) không bị tính là buổi vắng làm giảm tỷ lệ chuyên cần bắt buộc", async () => {
      const store = getRuntimeStore();
      const stu = store.students.find((s) => s.id === "stu-01");
      assert.ok(stu);

      // Thiết lập lịch sử điểm danh gồm 2 buổi có mặt
      stu.attendanceHistory = [
        { date: "2026-11-02", sessionName: "Ca Thứ Hai", status: "present" },
        { date: "2026-11-09", sessionName: "Ca Thứ Hai", status: "present" },
      ];

      // Thêm 1 buổi nghỉ có phép
      await scheduleService.recordAttendance({
        sessionId: "ses-mon-1",
        date: "2026-11-16",
        entries: [
          { studentId: "stu-01", status: "excused", note: "Ốm có giấy bác sĩ" },
        ],
      });

      const updatedStu = await studentService.getStudentById("stu-01");
      assert.ok(updatedStu);
      // Tỷ lệ chuyên cần tính trên các buổi bắt buộc: 2 có mặt / 2 buổi bắt buộc = 100%
      assert.strictEqual(
        updatedStu.attendanceRate,
        100,
        "Nghỉ có phép không được làm giảm tỷ lệ chuyên cần của học sinh",
      );
    });

    it("1.4. Tự động đồng bộ sang ClassSessionRecord (Nhật ký giảng dạy) khi có buổi học trùng khớp", async () => {
      const store = getRuntimeStore();
      // Lấy buổi học mẫu: cs-2026-11-17-ii01 (date: 2026-11-17, classId: cls-ii-01)
      const targetSession = store.classSessions.find((cs) => cs.id === "cs-2026-11-17-ii01");
      assert.ok(targetSession, "Phải có buổi học mẫu trong store");

      await scheduleService.recordAttendance({
        sessionId: targetSession.id,
        date: targetSession.date,
        entries: [
          { studentId: "stu-01", status: "late", note: "Đến muộn do kẹt xe" },
        ],
      });

      const updatedSession = store.classSessions.find((cs) => cs.id === targetSession.id);
      assert.ok(updatedSession);
      const studentRec = updatedSession.studentRecords.find((r) => r.studentId === "stu-01");
      assert.ok(studentRec);
      assert.strictEqual(studentRec.attendance, "late", "Phải đồng bộ trạng thái late vào nhật ký buổi học");
      assert.strictEqual(studentRec.teacherFeedback, "Đến muộn do kẹt xe");
    });

    it("1.5. Tự động đồng bộ và cập nhật chỉ số chuyên cần trung bình của lớp (classroom.attendanceRate)", async () => {
      const store = getRuntimeStore();
      const targetClass = store.classrooms.find((c) => c.id === "cls-if-01");
      assert.ok(targetClass);

      // Điểm danh ca học của lớp IF-01
      await scheduleService.recordAttendance({
        sessionId: "ses-mon-1",
        date: "2026-11-23",
        entries: [
          { studentId: "hs-2026-01", status: "present" },
          { studentId: "hs-2026-02", status: "present" },
        ],
      });

      const updatedClass = store.classrooms.find((c) => c.id === "cls-if-01");
      assert.ok(updatedClass);
      assert.ok(typeof updatedClass.attendanceRate === "number");
      assert.ok(updatedClass.attendanceRate > 0, "Chuyên cần trung bình lớp phải được cập nhật");
    });

    it("1.6. Validate dữ liệu đầu vào: ném ValidationError khi thiếu trường bắt buộc hoặc dữ liệu sai", async () => {
      // Thiếu sessionId
      await assert.rejects(
        () =>
          scheduleService.recordAttendance({
            date: "2026-11-23",
            entries: [{ studentId: "hs-2026-01", status: "present" }],
          }),
        ValidationError,
      );

      // Danh sách entries rỗng
      await assert.rejects(
        () =>
          scheduleService.recordAttendance({
            sessionId: "ses-mon-1",
            date: "2026-11-23",
            entries: [],
          }),
        ValidationError,
      );

      // Status không hợp lệ
      await assert.rejects(
        () =>
          scheduleService.recordAttendance({
            sessionId: "ses-mon-1",
            date: "2026-11-23",
            entries: [{ studentId: "hs-2026-01", status: "unknown_status" as unknown }],
          }),
        ValidationError,
      );
    });
  });

  describe("2. Danh sách Thời khóa biểu tuần (listWeeklySchedule)", () => {
    it("2.1. Danh sách ca học được sắp xếp theo ngày trong tuần (Thứ 2 -> Chủ Nhật) và giờ bắt đầu", async () => {
      const list = await scheduleService.listWeeklySchedule();
      assert.ok(list.length > 0);

      for (let i = 0; i < list.length - 1; i++) {
        const curr = list[i];
        const next = list[i + 1];
        if (curr.dayOfWeek === next.dayOfWeek) {
          assert.ok(
            curr.startTime.localeCompare(next.startTime) <= 0,
            `Ca ${curr.startTime} phải đứng trước hoặc bằng ca ${next.startTime} trong cùng ngày ${curr.dayOfWeek}`,
          );
        } else {
          assert.ok(
            curr.dayOfWeek < next.dayOfWeek,
            `Thứ ${curr.dayOfWeek} phải đứng trước Thứ ${next.dayOfWeek}`,
          );
        }
      }
    });

    it("2.2. Lọc ca học theo dayOfWeek cụ thể", async () => {
      // Lọc các ca Thứ Hai (dayOfWeek: 1)
      const mondaySessions = await scheduleService.listWeeklySchedule({ dayOfWeek: 1 });
      assert.ok(mondaySessions.length > 0);
      assert.ok(mondaySessions.every((s) => s.dayOfWeek === 1));

      // Lọc các ca Thứ Tư (dayOfWeek: 3)
      const wedSessions = await scheduleService.listWeeklySchedule({ dayOfWeek: 3 });
      assert.ok(wedSessions.every((s) => s.dayOfWeek === 3));
    });
  });
});
