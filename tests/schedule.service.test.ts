import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { prisma } from "@/lib/db/prisma";
import {
  buildAbsentParentNotice,
  buildAttendanceMatrixCsv,
  computeConsecutiveAbsences,
} from "@/services/attendance-helpers";
import * as classroomService from "@/services/classroom.service";
import * as cmsService from "@/services/cms.service";
import { ConflictError, NotFoundError, ValidationError } from "@/services/errors";
import { toIsoDate } from "@/services/schedule-calendar-helpers";
import * as scheduleService from "@/services/schedule.service";
import * as studentService from "@/services/student.service";
import * as teachingJournalService from "@/services/teaching-journal.service";
import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

describe("Schedule Service — Pure Attendance & Export Helpers (Offline)", () => {
  it("4.7a. computeConsecutiveAbsences phát hiện đúng chuỗi vắng không phép liên tiếp (bỏ qua excused)", () => {
    const history = [
      { date: "2026-11-18", sessionName: "Ca 3", status: "absent" as const },
      { date: "2026-11-16", sessionName: "Ca 2", status: "excused" as const },
      { date: "2026-11-14", sessionName: "Ca 1", status: "absent" as const },
      { date: "2026-11-11", sessionName: "Ca 0", status: "present" as const },
    ];
    assert.strictEqual(computeConsecutiveAbsences(history), 2);
  });

  it("4.9a. buildAbsentParentNotice & buildAttendanceMatrixCsv định dạng chuẩn và ẩn học sinh có mặt", () => {
    const notice = buildAbsentParentNotice({
      classCode: "IF-01",
      className: "IELTS Foundation",
      date: "2026-11-23",
      sessionLabel: "Ca Thứ Hai (17:45–19:45)",
      entries: [
        {
          studentCode: "HS-2026-03",
          fullName: "Phạm Hà Phương",
          status: "absent",
          note: "Chưa thấy tới lớp",
        },
        {
          studentCode: "HS-2026-06",
          fullName: "Đặng Quốc Huy",
          status: "present",
        },
      ],
    });

    assert.ok(notice.includes("Phạm Hà Phương"));
    assert.ok(notice.includes("23/11/2026"));
    assert.strictEqual(notice.includes("Đặng Quốc Huy"), false);

    const csv = buildAttendanceMatrixCsv({
      classId: "cls-if-01",
      classCode: "IF-01",
      className: "IELTS Foundation",
      fromDate: "2026-11-01",
      toDate: "2026-11-30",
      columns: [
        {
          columnId: "col-1",
          date: "2026-11-23",
          displayDate: "23/11/2026",
          label: "Thứ Hai",
          topic: "Reading Matching Headings",
          attendanceRate: 50,
        },
      ],
      rows: [
        {
          studentId: "stu-03",
          studentCode: "HS-2026-03",
          studentName: "Phạm Hà Phương",
          studentStatus: "active",
          attendanceRate: 50,
          presentCount: 0,
          lateCount: 0,
          absentCount: 1,
          excusedCount: 0,
          consecutiveAbsences: 1,
          cells: {
            "col-1": { status: "absent", note: "Chưa thấy tới lớp" },
          },
        },
      ],
      averageAttendanceRate: 50,
      highRiskStudentsCount: 1,
    });
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes("Mã HS"));
    assert.ok(csv.includes("Vắng liên tiếp"));
  });
});

describe(
  "PostgreSQL / Prisma Schedule Service — Quản lý Lịch dạy & Điểm danh Ca học nhanh",
  { skip: !hasTestDatabase() },
  () => {
    beforeEach(async () => {
      await resetAndSeedTestDatabase();
    });

    after(async () => {
      await teardownTestDatabase();
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
        assert.strictEqual(summary.attendanceRate, 50);

        const stu01 = await studentService.getStudentById("hs-2026-01");
        assert.ok(stu01);
        const hit = stu01.attendanceHistory.find((a) => a.date === "2026-11-23");
        assert.ok(hit);
        assert.strictEqual(hit.status, "present");
        assert.strictEqual(hit.note, "Đến đúng giờ");
      });

      it("1.2. Điểm danh đè (re-attendance) cùng ngày và ca học sẽ cập nhật bản ghi cũ, không tạo trùng lặp", async () => {
        await scheduleService.recordAttendance({
          sessionId: "ses-mon-1",
          date: "2026-11-23",
          entries: [
            { studentId: "hs-2026-01", status: "absent", note: "Chưa thấy đến" },
          ],
        });

        let stu = await studentService.getStudentById("hs-2026-01");
        const initialHistoryLength = stu.attendanceHistory.length;
        const firstHit = stu.attendanceHistory.find((a) => a.date === "2026-11-23");
        assert.strictEqual(firstHit?.status, "absent");

        await scheduleService.recordAttendance({
          sessionId: "ses-mon-1",
          date: "2026-11-23",
          entries: [
            { studentId: "hs-2026-01", status: "late", note: "Đến muộn 15 phút" },
          ],
        });

        stu = await studentService.getStudentById("hs-2026-01");
        assert.strictEqual(
          stu.attendanceHistory.length,
          initialHistoryLength,
          "Không được tăng số lượng bản ghi lịch sử khi điểm danh đè cùng buổi",
        );
        const secondHit = stu.attendanceHistory.find((a) => a.date === "2026-11-23");
        assert.strictEqual(secondHit?.status, "late");
        assert.strictEqual(secondHit?.note, "Đến muộn 15 phút");
      });

      it("1.3. Nghỉ có phép (excused) không bị tính là buổi vắng làm giảm tỷ lệ chuyên cần bắt buộc", async () => {
        await prisma.attendanceRecord.deleteMany({
          where: { studentId: "stu-01" },
        });
        await prisma.attendanceRecord.createMany({
          data: [
            {
              id: "att-exc-test-1",
              studentId: "stu-01",
              classroomId: "cls-ii-01",
              date: "2026-11-02",
              sessionName: "Ca Thứ Hai",
              status: "present",
            },
            {
              id: "att-exc-test-2",
              studentId: "stu-01",
              classroomId: "cls-ii-01",
              date: "2026-11-09",
              sessionName: "Ca Thứ Hai",
              status: "present",
            },
          ],
        });

        await scheduleService.recordAttendance({
          sessionId: "ses-mon-1",
          date: "2026-11-16",
          entries: [
            { studentId: "stu-01", status: "excused", note: "Ốm có giấy bác sĩ" },
          ],
        });

        const updatedStu = await studentService.getStudentById("stu-01");
        assert.strictEqual(
          updatedStu.attendanceRate,
          100,
          "Nghỉ có phép không được làm giảm tỷ lệ chuyên cần của học sinh",
        );
      });

      it("1.4. Tự động đồng bộ sang ClassSessionRecord (Nhật ký giảng dạy) khi có buổi học trùng khớp", async () => {
        const targetSession = await teachingJournalService.getClassSessionById(
          "cs-2026-11-17-ii01",
        );

        await scheduleService.recordAttendance({
          sessionId: targetSession.id,
          date: targetSession.date,
          entries: [
            { studentId: "stu-01", status: "late", note: "Đến muộn do kẹt xe" },
          ],
        });

        const updatedSession = await teachingJournalService.getClassSessionById(
          targetSession.id,
        );
        const studentRec = updatedSession.studentRecords.find(
          (r) => r.studentId === "stu-01",
        );
        assert.ok(studentRec);
        assert.strictEqual(
          studentRec.attendance,
          "late",
          "Phải đồng bộ trạng thái late vào nhật ký buổi học",
        );
        assert.strictEqual(studentRec.teacherFeedback, "Đến muộn do kẹt xe");
      });

      it("1.5. Tự động đồng bộ và cập nhật chỉ số chuyên cần trung bình của lớp (classroom.attendanceRate)", async () => {
        await scheduleService.recordAttendance({
          sessionId: "ses-mon-1",
          date: "2026-11-23",
          entries: [
            { studentId: "hs-2026-01", status: "present" },
            { studentId: "hs-2026-02", status: "present" },
          ],
        });

        const updatedClass = await classroomService.getClassroomById("cls-if-01");
        assert.ok(updatedClass);
        assert.ok(typeof updatedClass.attendanceRate === "number");
        assert.ok(
          updatedClass.attendanceRate > 0,
          "Chuyên cần trung bình lớp phải được cập nhật",
        );
      });

      it("1.6. Validate dữ liệu đầu vào: ném ValidationError khi thiếu trường bắt buộc hoặc dữ liệu sai", async () => {
        await assert.rejects(
          () =>
            scheduleService.recordAttendance({
              date: "2026-11-23",
              entries: [{ studentId: "hs-2026-01", status: "present" }],
            }),
          ValidationError,
        );

        await assert.rejects(
          () =>
            scheduleService.recordAttendance({
              sessionId: "ses-mon-1",
              date: "2026-11-23",
              entries: [],
            }),
          ValidationError,
        );

        await assert.rejects(
          () =>
            scheduleService.recordAttendance({
              sessionId: "ses-mon-1",
              date: "2026-11-23",
              entries: [
                {
                  studentId: "hs-2026-01",
                  status: "unknown_status" as unknown,
                },
              ],
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
        const mondaySessions = await scheduleService.listWeeklySchedule({
          dayOfWeek: 1,
        });
        assert.ok(mondaySessions.length > 0);
        assert.ok(mondaySessions.every((s) => s.dayOfWeek === 1));

        const wedSessions = await scheduleService.listWeeklySchedule({
          dayOfWeek: 3,
        });
        assert.ok(wedSessions.every((s) => s.dayOfWeek === 3));
      });
    });

    describe("3. Nâng cấp Quản lý Lịch dạy & Ca học 360° (3 Giai đoạn)", () => {
      it("3.1. Chặn cứng cả trùng phòng (chuẩn hóa tên phòng) lẫn trùng giờ dạy giáo viên (khác phòng)", async () => {
        await assert.rejects(
          () =>
            scheduleService.createClassSession({
              classCode: "AW-02",
              dayOfWeek: 1,
              startTime: "18:00",
              endTime: "19:30",
              room: "Phòng 302 · Cơ sở Nguyễn Du",
              topic: "Academic Essay",
            }),
          ConflictError,
        );

        await assert.rejects(
          () =>
            scheduleService.createClassSession({
              classCode: "AW-02",
              dayOfWeek: 1,
              startTime: "18:30",
              endTime: "20:00",
              room: "Phòng Lab 1 · Cơ sở Nguyễn Du",
              topic: "Workshop khác phòng",
            }),
          ConflictError,
        );
      });

      it("3.2. Từ chối classCode không tồn tại (NotFoundError) hoặc lớp đã archived/completed (ValidationError)", async () => {
        await assert.rejects(
          () =>
            scheduleService.createClassSession({
              classCode: "NONEXISTENT-99",
              dayOfWeek: 7,
              startTime: "15:00",
              endTime: "17:00",
              room: "Phòng 302",
              topic: "Test lỗi mã lớp",
            }),
          NotFoundError,
        );

        const targetClass = await classroomService.getClassroomById("cls-ii-01");
        await prisma.classroom.update({
          where: { id: targetClass.id },
          data: { status: "completed" },
        });

        await assert.rejects(
          () =>
            scheduleService.createClassSession({
              classCode: targetClass.code,
              dayOfWeek: 7,
              startTime: "15:00",
              endTime: "17:00",
              room: "Phòng 302",
              topic: "Lớp đã kết thúc",
            }),
          ValidationError,
        );
      });

      it("3.3. Sửa ca cố định (updateClassSession) cập nhật lịch & đồng bộ 2 chiều scheduleSummary", async () => {
        const created = await scheduleService.createClassSession({
          classCode: "IF-01",
          dayOfWeek: 7,
          startTime: "14:00",
          endTime: "16:00",
          room: "Phòng 204 · Cơ sở Nguyễn Du",
          topic: "Chủ đề ban đầu",
        });

        const updated = await scheduleService.updateClassSession(created.id, {
          dayOfWeek: 6,
          startTime: "14:30",
          endTime: "16:30",
          room: "Phòng Lab 1 · Cơ sở Nguyễn Du",
          topic: "Chủ đề đã sửa sang Thứ 7",
        });

        assert.strictEqual(updated.dayOfWeek, 6);
        assert.strictEqual(updated.dayLabel, "Thứ Bảy");
        assert.strictEqual(updated.startTime, "14:30");
        assert.strictEqual(updated.topic, "Chủ đề đã sửa sang Thứ 7");

        const cls = await classroomService.getClassroomById("cls-if-01");
        assert.ok(cls.scheduleSummary.includes("14:30"));
      });

      it("3.4. Xóa ca học tự động tính lại cờ hasConflict cho các ca còn lại", async () => {
        await prisma.classSession.create({
          data: {
            id: "ses-conflict-test",
            classroomId: "cls-ja-01",
            classCode: "JA-01",
            className: "Junior Academic Explorers",
            level: "A2+",
            dayOfWeek: 1,
            dayLabel: "Thứ Hai",
            startTime: "18:00",
            endTime: "19:30",
            room: "Phòng 204",
            topic: "Trùng thử nghiệm",
            enrolledCount: 15,
            capacity: 16,
            status: "upcoming",
            hasConflict: true,
          },
        });
        const listWithConflict = await scheduleService.listWeeklySchedule();
        assert.strictEqual(
          listWithConflict.find((s) => s.id === "ses-mon-1")?.hasConflict,
          true,
        );

        await scheduleService.deleteClassSession("ses-conflict-test");
        const listAfterDelete = await scheduleService.listWeeklySchedule();
        assert.strictEqual(
          listAfterDelete.find((s) => s.id === "ses-mon-1")?.hasConflict,
          false,
        );
      });

      it("3.5. Hydrate động enrolledCount/capacity theo sĩ số thực tế & lọc bỏ lớp archived", async () => {
        const cls = await classroomService.getClassroomById("cls-ja-01");
        const activeStudents = await studentService.listAllStudents({
          classId: cls.id,
          status: "non-archived",
        });
        const liveCount = activeStudents.length;

        const list = await scheduleService.listWeeklySchedule({
          classCode: "JA-01",
        });
        assert.ok(list.length > 0);
        assert.strictEqual(list[0].enrolledCount, liveCount);

        await prisma.classroom.update({
          where: { id: cls.id },
          data: { status: "archived" },
        });
        const listAfterArchive = await scheduleService.listWeeklySchedule({
          classCode: "JA-01",
        });
        assert.strictEqual(listAfterArchive.length, 0);
      });

      it("3.6. Nghỉ 1 buổi (canceled) giữ nguyên lịch cố định tuần sau & chặn ngoại lệ trùng ngày", async () => {
        const exc = await scheduleService.createScheduleException({
          type: "canceled",
          originalSessionId: "ses-mon-1",
          originalDate: "2026-11-23",
          reason: "Nghỉ lễ nội bộ",
        });
        assert.strictEqual(exc.type, "canceled");

        await assert.rejects(
          () =>
            scheduleService.createScheduleException({
              type: "canceled",
              originalSessionId: "ses-mon-1",
              originalDate: "2026-11-23",
              reason: "Tạo trùng",
            }),
          ConflictError,
        );

        const calThisWeek = await scheduleService.getScheduleCalendarRange({
          fromDate: "2026-11-23",
          toDate: "2026-11-29",
          classCode: "IF-01",
        });
        const monOcc = calThisWeek.occurrences.find(
          (o) => o.date === "2026-11-23",
        );
        assert.strictEqual(monOcc?.status, "canceled");

        const calNextWeek = await scheduleService.getScheduleCalendarRange({
          fromDate: "2026-11-30",
          toDate: "2026-12-06",
          classCode: "IF-01",
        });
        const nextMonOcc = calNextWeek.occurrences.find(
          (o) => o.date === "2026-11-30",
        );
        assert.ok(nextMonOcc && nextMonOcc.status !== "canceled");

        await scheduleService.deleteScheduleException(exc.id);
      });

      it("3.7. Dời riêng 1 buổi (rescheduled) sang ngày trống & chặn nếu ngày đích trùng giờ", async () => {
        await assert.rejects(
          () =>
            scheduleService.createScheduleException({
              type: "rescheduled",
              originalSessionId: "ses-mon-1",
              originalDate: "2026-11-23",
              newDate: "2026-11-24",
              startTime: "18:30",
              endTime: "20:00",
              room: "Phòng 204 · Cơ sở Nguyễn Du",
              reason: "Đổi vào giờ bị trùng",
            }),
          ConflictError,
        );

        const moved = await scheduleService.createScheduleException({
          type: "rescheduled",
          originalSessionId: "ses-mon-1",
          originalDate: "2026-11-23",
          newDate: "2026-11-25",
          startTime: "09:00",
          endTime: "11:00",
          room: "Phòng 302 · Cơ sở Nguyễn Du",
          reason: "Dời sang sáng Thứ Tư",
        });
        assert.strictEqual(moved.newDate, "2026-11-25");

        const cal = await scheduleService.getScheduleCalendarRange({
          fromDate: "2026-11-23",
          toDate: "2026-11-29",
          classCode: "IF-01",
        });
        assert.strictEqual(
          cal.occurrences.some((o) => o.date === "2026-11-23"),
          false,
          "Ngày cũ đã dời không được hiển thị ca hoạt động nữa",
        );
        const wedOcc = cal.occurrences.find((o) => o.date === "2026-11-25");
        assert.strictEqual(wedOcc?.source, "rescheduled");
      });

      it("3.8. Thêm buổi dạy bù (makeup) & auto-đăng thông báo CMS khi notifyStudents=true", async () => {
        const beforeAnnouncements = await cmsService.listAnnouncements({
          includeDrafts: true,
        });

        const makeup = await scheduleService.createScheduleException({
          type: "makeup",
          classCode: "II-01",
          originalDate: "2026-11-29",
          newDate: "2026-11-29",
          startTime: "14:00",
          endTime: "16:00",
          room: "Phòng 302 · Cơ sở Nguyễn Du",
          topic: "Speaking Mock 1:1",
          reason: "Bồi dưỡng trước kỳ thi thật",
          notifyStudents: true,
        });

        assert.strictEqual(makeup.type, "makeup");
        assert.ok(makeup.announcementId);

        const afterAnnouncements = await cmsService.listAnnouncements({
          includeDrafts: true,
        });
        assert.strictEqual(
          afterAnnouncements.length,
          beforeAnnouncements.length + 1,
        );
        const createdAnn = await cmsService.getAnnouncementById(
          makeup.announcementId,
          { includeDrafts: true },
        );
        assert.strictEqual(createdAnn.category, "schedule");
        assert.strictEqual(createdAnn.status, "published");
      });

      it("3.9. Chặn buổi dạy bù trùng lịch trên ngày đích (ConflictError)", async () => {
        await assert.rejects(
          () =>
            scheduleService.createScheduleException({
              type: "makeup",
              classCode: "II-01",
              originalDate: "2026-11-29",
              newDate: "2026-11-29",
              startTime: "09:00",
              endTime: "11:00",
              room: "Phòng 401",
              reason: "Trùng giờ sáng CN",
            }),
          ConflictError,
        );
      });

      it("3.10. getScheduleCalendarRange nối dữ liệu Điểm danh + Nhật ký & tính KPIs", async () => {
        const targetDate = "2026-11-23";
        await scheduleService.recordAttendance({
          sessionId: "ses-mon-1",
          date: targetDate,
          entries: [{ studentId: "hs-2026-03", status: "present" }],
        });

        const cal = await scheduleService.getScheduleCalendarRange({
          fromDate: "2026-11-23",
          toDate: "2026-11-29",
          classCode: "IF-01",
          room: "Phòng 302",
          todayIso: "2026-11-23",
        });

        const monOcc = cal.occurrences.find((o) => o.date === targetDate);
        assert.ok(monOcc);
        assert.strictEqual(monOcc.attendanceRecorded, true);
        assert.ok(monOcc.classSessionId);
        assert.ok(cal.kpis.attendanceRecordedCount >= 1);
        assert.ok(cal.kpis.totalTeachingHours > 0);
      });
    });

    describe("4. Nghiệp vụ nâng cao Điểm danh Ca học nhanh & Ma trận lớp", () => {
      it("4.1. Chặn điểm danh cho lớp đã lưu trữ (archived) hoặc đã kết thúc (completed)", async () => {
        await prisma.classroom.update({
          where: { id: "cls-if-01" },
          data: { status: "archived" },
        });

        await assert.rejects(
          () =>
            scheduleService.recordAttendance({
              classId: "cls-if-01",
              sessionId: "ses-mon-1",
              date: "2026-11-30",
              entries: [{ studentId: "stu-03", status: "present" }],
            }),
          ValidationError,
        );

        await prisma.classroom.update({
          where: { id: "cls-if-01" },
          data: { status: "completed" },
        });
        await assert.rejects(
          () =>
            scheduleService.recordAttendance({
              classId: "cls-if-01",
              sessionId: "ses-mon-1",
              date: "2026-11-30",
              entries: [{ studentId: "stu-03", status: "present" }],
            }),
          ValidationError,
        );
      });

      it("4.2. Chặn cứng điểm danh vào ngày đã đánh dấu Tạm nghỉ (canceled) & phản ánh lên getAttendanceSnapshot", async () => {
        const targetDate = "2026-12-07"; // Monday
        await scheduleService.createScheduleException({
          type: "canceled",
          classId: "cls-if-01",
          originalSessionId: "ses-mon-1",
          originalDate: targetDate,
          reason: "Nghỉ lễ nội bộ",
        });

        const snap = await scheduleService.getAttendanceSnapshot({
          classId: "cls-if-01",
          sessionId: "ses-mon-1",
          date: targetDate,
        });
        assert.strictEqual(snap.isCanceledDate, true);
        assert.strictEqual(snap.canceledReason, "Nghỉ lễ nội bộ");

        await assert.rejects(
          () =>
            scheduleService.recordAttendance({
              classId: "cls-if-01",
              sessionId: "ses-mon-1",
              date: targetDate,
              entries: [{ studentId: "stu-03", status: "present" }],
            }),
          ValidationError,
        );
      });

      it("4.3. Khi truyền classId tường minh: chặn học viên lớp khác & chặn học viên đang bảo lưu (on-leave)", async () => {
        await studentService.updateStudent("stu-03", { status: "on-leave" });

        await assert.rejects(
          () =>
            scheduleService.recordAttendance({
              classId: "cls-if-01",
              sessionId: "ses-mon-1",
              date: "2026-12-14",
              entries: [{ studentId: "stu-03", status: "present" }],
            }),
          ValidationError,
        );

        await assert.rejects(
          () =>
            scheduleService.recordAttendance({
              classId: "cls-if-01",
              sessionId: "ses-mon-1",
              date: "2026-12-14",
              entries: [{ studentId: "stu-01", status: "present" }],
            }),
          ValidationError,
        );
      });

      it("4.4. Khi recordAttendance tự tạo ClassSessionRecord nháp, tự động loại học viên on-leave & khử trùng entries", async () => {
        await studentService.updateStudent("stu-03", { status: "on-leave" });

        const result = await scheduleService.recordAttendance({
          classId: "cls-if-01",
          sessionId: "ses-mon-1",
          date: "2026-12-14",
          entries: [
            { studentId: "stu-06", status: "absent", note: "Ghi nhầm ban đầu" },
            { studentId: "stu-06", status: "late", note: "Vào muộn 5 phút" },
          ],
        });

        assert.strictEqual(result.recordedCount, 1);
        assert.strictEqual(result.lateCount, 1);
        assert.ok(result.classSessionId);

        const createdJournal = await teachingJournalService.getClassSessionById(
          result.classSessionId,
        );
        assert.strictEqual(
          createdJournal.studentRecords.some((r) => r.studentId === "stu-03"),
          false,
          "Nhật ký nháp tạo từ Điểm danh không được chứa học viên on-leave",
        );
        const stu06Rec = createdJournal.studentRecords.find(
          (r) => r.studentId === "stu-06",
        );
        assert.ok(stu06Rec);
        assert.strictEqual(stu06Rec.attendance, "late");
      });

      it("4.5. Đồng bộ 2 chiều Điểm danh <-> Nhật ký <-> Xóa Nhật ký không tạo bản ghi trùng trong attendanceHistory", async () => {
        const targetDate = "2026-12-21";
        const res = await scheduleService.recordAttendance({
          classId: "cls-if-01",
          sessionId: "ses-mon-1",
          date: targetDate,
          entries: [{ studentId: "stu-03", status: "absent", note: "Chưa đến" }],
        });
        assert.ok(res.classSessionId);

        let stu03 = await studentService.getStudentById("stu-03");
        const countAfterAttendance = stu03.attendanceHistory.length;
        assert.ok(
          stu03.attendanceHistory.some(
            (a) => a.sessionId === res.classSessionId,
          ),
        );

        await teachingJournalService.updateClassSession(res.classSessionId, {
          topic: "Chuyên đề mới đổi tên",
          journalStatus: "completed",
          studentRecords: [
            {
              studentId: "stu-03",
              attendance: "late",
              homeworkStatus: "submitted",
              learningStatus: "good",
              skill: "Reading",
              teacherFeedback: "Vào muộn nhưng hoàn thành bài",
              followUp: "",
            },
          ],
        });

        stu03 = await studentService.getStudentById("stu-03");
        assert.strictEqual(
          stu03.attendanceHistory.length,
          countAfterAttendance,
          "Sửa từ Nhật ký không được tạo thêm bản ghi attendanceHistory trùng lặp",
        );
        const updatedAtt = stu03.attendanceHistory.find(
          (a) => a.sessionId === res.classSessionId,
        );
        assert.strictEqual(updatedAtt?.status, "late");

        await teachingJournalService.deleteClassSession(res.classSessionId);
        stu03 = await studentService.getStudentById("stu-03");
        assert.strictEqual(
          stu03.attendanceHistory.some(
            (a) => a.sessionId === res.classSessionId,
          ),
          false,
        );
      });

      it("4.6. getPendingAttendanceQueue trả về ca dạy bù chưa điểm danh & biến mất ngay sau khi lưu điểm danh", async () => {
        const todayIso = toIsoDate(new Date());
        const makeupExc = await scheduleService.createScheduleException({
          type: "makeup",
          classId: "cls-if-01",
          originalDate: todayIso,
          newDate: todayIso,
          startTime: "12:00",
          endTime: "13:30",
          room: "Phòng Lab 1 · Cơ sở Nguyễn Du",
          topic: "Luyện đề Listening cấp tốc",
          reason: "Bù ca kiểm tra",
        });

        const queueBefore = await scheduleService.getPendingAttendanceQueue(7);
        const item = queueBefore.find(
          (q) => q.scheduleExceptionId === makeupExc.id,
        );
        assert.ok(item, "Ca dạy bù hôm nay phải xuất hiện trong hàng chờ điểm danh");
        assert.strictEqual(item.isToday, true);

        await scheduleService.recordAttendance({
          classId: item.classId,
          sessionId: item.sessionId,
          scheduleExceptionId: item.scheduleExceptionId,
          date: item.date,
          entries: [
            { studentId: "stu-03", status: "present" },
            { studentId: "stu-06", status: "present" },
          ],
        });

        const queueAfter = await scheduleService.getPendingAttendanceQueue(7);
        assert.strictEqual(
          queueAfter.some((q) => q.scheduleExceptionId === makeupExc.id),
          false,
          "Ca học đã lưu điểm danh phải biến mất khỏi hàng chờ",
        );
      });

      it("4.7. computeConsecutiveAbsences & getAttendanceSnapshot phát hiện đúng chuỗi vắng không phép liên tiếp", async () => {
        await prisma.attendanceRecord.deleteMany({
          where: { studentId: "stu-03" },
        });
        await prisma.attendanceRecord.createMany({
          data: [
            {
              id: "att-ca-3",
              studentId: "stu-03",
              classroomId: "cls-if-01",
              date: "2026-11-18",
              sessionName: "Ca 3",
              status: "absent",
            },
            {
              id: "att-ca-2",
              studentId: "stu-03",
              classroomId: "cls-if-01",
              date: "2026-11-16",
              sessionName: "Ca 2",
              status: "excused",
            },
            {
              id: "att-ca-1",
              studentId: "stu-03",
              classroomId: "cls-if-01",
              date: "2026-11-14",
              sessionName: "Ca 1",
              status: "absent",
            },
            {
              id: "att-ca-0",
              studentId: "stu-03",
              classroomId: "cls-if-01",
              date: "2026-11-11",
              sessionName: "Ca 0",
              status: "present",
            },
          ],
        });

        const stu = await studentService.getStudentById("stu-03");
        assert.strictEqual(
          computeConsecutiveAbsences(stu.attendanceHistory),
          2,
        );

        const snap = await scheduleService.getAttendanceSnapshot({
          classId: "cls-if-01",
          date: "2026-11-23",
        });
        assert.strictEqual(snap.consecutiveAbsencesByStudentId["stu-03"], 2);
      });

      it("4.8. getClassAttendanceMatrix tổng hợp lưới buổi học × học viên & tính số học viên cần chú ý", async () => {
        await scheduleService.recordAttendance({
          classId: "cls-if-01",
          sessionId: "ses-mon-1",
          date: "2026-11-23",
          entries: [
            { studentId: "stu-03", status: "absent", note: "Vắng buổi 1" },
            { studentId: "stu-06", status: "present" },
          ],
        });
        await scheduleService.recordAttendance({
          classId: "cls-if-01",
          sessionId: "ses-thu-2",
          date: "2026-11-26",
          entries: [
            { studentId: "stu-03", status: "absent", note: "Vắng buổi 2" },
            { studentId: "stu-06", status: "late", note: "Muộn 5p" },
          ],
        });

        const matrix = await scheduleService.getClassAttendanceMatrix({
          classId: "cls-if-01",
          fromDate: "2026-11-20",
          toDate: "2026-11-30",
        });

        assert.strictEqual(matrix.classCode, "IF-01");
        assert.ok(matrix.columns.length >= 2);
        const row03 = matrix.rows.find((r) => r.studentId === "stu-03")!;
        assert.ok(row03);
        assert.strictEqual(row03.absentCount, 2);
        assert.ok(row03.consecutiveAbsences >= 2);
        assert.ok(matrix.highRiskStudentsCount >= 1);
      });

      it("4.9. buildAbsentParentNotice & buildAttendanceMatrixCsv định dạng chuẩn từ dữ liệu DB", async () => {
        const matrix = await scheduleService.getClassAttendanceMatrix({
          classId: "cls-if-01",
          fromDate: "2026-11-01",
          toDate: "2026-11-30",
        });
        const csv = buildAttendanceMatrixCsv(matrix);
        assert.ok(csv.startsWith("\uFEFF"));
        assert.ok(csv.includes("Mã HS"));
        assert.ok(csv.includes("Vắng liên tiếp"));
      });
    });
  },
);
