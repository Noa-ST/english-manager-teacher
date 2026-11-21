import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { CLASSROOMS_DATA, STANDARD_TIME_SLOTS, type TimeSlotDef } from "@/services/classroom-data";
import * as classroomService from "@/services/classroom.service";
import { ConflictError } from "@/services/errors";
import {
  buildScheduleCsvContent,
  buildScheduleIcsContent,
  computeScheduleRangeKpis,
  resolveScheduleOccurrences,
} from "@/services/schedule-calendar-helpers";
import {
  isTimeOverlapping,
  parseScheduleStringToSlots,
  formatSlotsToScheduleString,
  getOccupiedSlotsMap,
  normalizeRoomKey,
  normalizeTimeString,
  validateNewTimeSlot,
  sortTimeSlots,
  checkCanDeleteTimeSlot,
} from "@/services/schedule-helper";
import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

describe("Schedule Helper — Xếp Lịch Cố Định & Chống Trùng Khung Giờ", () => {
  describe("1. Kiểm tra va chạm khung giờ (isTimeOverlapping)", () => {
    it("1.1. Phát hiện trùng nhau khi hai khung giờ đè lên nhau", () => {
      // 18:00 - 20:15 vs 17:45 - 19:45 (Trùng từ 18:00 đến 19:45)
      assert.strictEqual(isTimeOverlapping("18:00", "20:15", "17:45", "19:45"), true);
      // 18:00 - 20:00 vs 19:00 - 21:00
      assert.strictEqual(isTimeOverlapping("18:00", "20:00", "19:00", "21:00"), true);
    });

    it("1.2. Không va chạm khi hai khung giờ tách rời nhau", () => {
      // Sáng 08:30 - 10:30 vs Chiều 14:30 - 16:30
      assert.strictEqual(isTimeOverlapping("08:30", "10:30", "14:30", "16:30"), false);
      // Ca 17:45 - 19:45 vs Ca 19:50 - 21:30 (cách nhau 5 phút)
      assert.strictEqual(isTimeOverlapping("17:45", "19:45", "19:50", "21:30"), false);
    });
  });

  describe("2. Bóc tách chuỗi lịch học sang slot (parseScheduleStringToSlots)", () => {
    it("2.1. Bóc tách lịch cùng giờ: 'Thứ 3 & Thứ 6 · 18:00 – 20:15'", () => {
      const slots = parseScheduleStringToSlots("Thứ 3 & Thứ 6 · 18:00 – 20:15");
      assert.strictEqual(slots.length, 2);
      assert.strictEqual(slots[0].dayNumber, 2);
      assert.strictEqual(slots[0].slotId, "e2");
      assert.strictEqual(slots[1].dayNumber, 5);
      assert.strictEqual(slots[1].slotId, "e2");
    });

    it("2.2. Bóc tách lịch khác giờ: 'Thứ 5 (19:50) & Thứ 7 (09:00)'", () => {
      const slots = parseScheduleStringToSlots("Thứ 5 (19:50) & Thứ 7 (09:00)");
      assert.strictEqual(slots.length, 2);
      assert.strictEqual(slots[0].dayNumber, 4);
      assert.strictEqual(slots[0].slotId, "e3");
      assert.strictEqual(slots[1].dayNumber, 6);
      assert.strictEqual(slots[1].slotId, "m2");
    });
  });

  describe("3. Định dạng slot đã chọn thành chuỗi lịch chuẩn (formatSlotsToScheduleString)", () => {
    it("3.1. Gom các ngày có cùng khung giờ vào 1 cụm đẹp mắt", () => {
      const str = formatSlotsToScheduleString([
        { dayNumber: 2, slotId: "e2" },
        { dayNumber: 5, slotId: "e2" },
      ]);
      assert.strictEqual(str, "Thứ 3 & Thứ 6 · 18:00 – 20:15");
    });

    it("3.2. Hiển thị tách biệt khi các ngày học khung giờ khác nhau", () => {
      const str = formatSlotsToScheduleString([
        { dayNumber: 4, slotId: "e3" },
        { dayNumber: 6, slotId: "m2" },
      ]);
      assert.strictEqual(str, "Thứ 5 (19:50 – 21:30) & Thứ 7 (09:00 – 11:00)");
    });
  });

  describe("4. Nhận diện các slot đã bị chiếm (getOccupiedSlotsMap)", () => {
    it("4.1. Nhận diện chính xác các slot của 4 lớp khởi tạo", () => {
      const map = getOccupiedSlotsMap(CLASSROOMS_DATA);
      assert.ok(map.size > 0);

      // II-01 is on Day 2 (Thứ 3), slot e2
      assert.ok(map.has("2-e2"));
      assert.strictEqual(map.get("2-e2")?.classCode, "II-01");

      // II-01 is also on Day 5 (Thứ 6), slot e2
      assert.ok(map.has("5-e2"));
      assert.strictEqual(map.get("5-e2")?.classCode, "II-01");

      // IF-01 is on Day 1 (Thứ 2), slot e1
      assert.ok(map.has("1-e1"));
      assert.strictEqual(map.get("1-e1")?.classCode, "IF-01");
    });

    it("4.2. Loại trừ lớp đang chỉnh sửa khỏi danh sách xung đột", () => {
      // If editing cls-ii-01, slot 2-e2 should NOT be marked as conflict from another class
      const map = getOccupiedSlotsMap(CLASSROOMS_DATA, "cls-ii-01");
      assert.strictEqual(map.has("2-e2"), false);
      // But other classes like IF-01 are still marked
      assert.ok(map.has("1-e1"));
    });
  });

  describe("5. Logic Rule Chống Trùng Khung Giờ (validateNewTimeSlot & normalizeTimeString)", () => {
    it("5.1. Chuẩn hóa linh hoạt đầu vào người dùng: 7h, 7h30, 07:00, 19h50", () => {
      assert.strictEqual(normalizeTimeString("7h"), "07:00");
      assert.strictEqual(normalizeTimeString("7h30"), "07:30");
      assert.strictEqual(normalizeTimeString("07:00"), "07:00");
      assert.strictEqual(normalizeTimeString("7:30"), "07:30");
      assert.strictEqual(normalizeTimeString("19h50"), "19:50");
      assert.strictEqual(normalizeTimeString("7"), "07:00");
      assert.strictEqual(normalizeTimeString("abc"), null);
      assert.strictEqual(normalizeTimeString("25h00"), null);
    });

    it("5.2. Cho phép tạo khung giờ hợp lệ không bị va chạm", () => {
      const existing: TimeSlotDef[] = [
        { id: "s1", label: "08:30 – 10:30", startTime: "08:30", endTime: "10:30", period: "morning" },
        { id: "s2", label: "14:30 – 16:30", startTime: "14:30", endTime: "16:30", period: "afternoon" },
      ];

      const res = validateNewTimeSlot("7h", "8h30", existing);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.normalizedStart, "07:00");
      assert.strictEqual(res.normalizedEnd, "08:30");
      assert.strictEqual(res.durationMinutes, 90);
    });

    it("5.3. Case thực tế người dùng yêu cầu: 7h-9h vs 7h30-9h30 BỊ CHẶN do trùng lịch", () => {
      const existing: TimeSlotDef[] = [
        { id: "slot-custom-1", label: "07:00 – 09:00", startTime: "07:00", endTime: "09:00", period: "morning" },
      ];

      // Thử tạo 7h30 - 9h30 khi đã có 7h - 9h
      const res = validateNewTimeSlot("7h30", "9h30", existing);
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.conflictingSlot?.startTime, "07:00");
      assert.strictEqual(res.conflictingSlot?.endTime, "09:00");
      assert.ok(res.errorMessage?.includes("bị trùng với khung giờ 07:00 – 09:00"));
      assert.ok(res.errorMessage?.includes("07:30 đến 09:00"));
    });

    it("5.4. Chặn các dạng giao thoa khác: đè đầu, đè đuôi, bao trùm và nằm gọn bên trong", () => {
      const existing: TimeSlotDef[] = [
        { id: "base", label: "08:00 – 10:00", startTime: "08:00", endTime: "10:00", period: "morning" },
      ];

      // Đè đầu: 07:30 - 08:30
      const overlapFront = validateNewTimeSlot("07:30", "08:30", existing);
      assert.strictEqual(overlapFront.isValid, false);

      // Đè đuôi: 09:30 - 11:00
      const overlapBack = validateNewTimeSlot("09:30", "11:00", existing);
      assert.strictEqual(overlapBack.isValid, false);

      // Nằm gọn bên trong: 08:15 - 09:45
      const overlapInside = validateNewTimeSlot("08:15", "09:45", existing);
      assert.strictEqual(overlapInside.isValid, false);

      // Bao trùm toàn bộ: 07:00 - 11:00
      const overlapEnclosing = validateNewTimeSlot("07:00", "11:00", existing);
      assert.strictEqual(overlapEnclosing.isValid, false);

      // Trùng y hệt: 08:00 - 10:00
      const overlapIdentical = validateNewTimeSlot("08:00", "10:00", existing);
      assert.strictEqual(overlapIdentical.isValid, false);
    });

    it("5.5. Cho phép hai khung giờ tiếp giáp nhau mà không đè lên nhau (endA == startB)", () => {
      const existing: TimeSlotDef[] = [
        { id: "base", label: "07:00 – 09:00", startTime: "07:00", endTime: "09:00", period: "morning" },
      ];

      // Ca trước đó kết thúc đúng 07:00: 05:00 - 07:00 -> Hợp lệ
      const before = validateNewTimeSlot("05:00", "07:00", existing);
      assert.strictEqual(before.isValid, true);

      // Ca tiếp theo bắt đầu đúng 09:00: 09:00 - 11:00 -> Hợp lệ
      const after = validateNewTimeSlot("09:00", "11:00", existing);
      assert.strictEqual(after.isValid, true);
    });

    it("5.6. Validate thời gian: Giờ bắt đầu >= giờ kết thúc, thời lượng < 45m hoặc > 4h", () => {
      const emptySlots: TimeSlotDef[] = [];

      // start >= end
      const backwards = validateNewTimeSlot("09:00", "07:00", emptySlots);
      assert.strictEqual(backwards.isValid, false);
      assert.ok(backwards.errorMessage?.includes("phải sớm hơn giờ kết thúc"));

      // Thời lượng quá ngắn (< 45 phút)
      const tooShort = validateNewTimeSlot("08:00", "08:30", emptySlots);
      assert.strictEqual(tooShort.isValid, false);
      assert.ok(tooShort.errorMessage?.includes("tối thiểu là 45 phút"));

      // Thời lượng quá dài (> 240 phút = 4h)
      const tooLong = validateNewTimeSlot("07:00", "12:00", emptySlots);
      assert.strictEqual(tooLong.isValid, false);
      assert.ok(tooLong.errorMessage?.includes("không được vượt quá 4 giờ"));
    });
  });

  describe("6. Sắp xếp & Quản lý Khung giờ (sortTimeSlots & checkCanDeleteTimeSlot)", () => {
    it("6.1. Tự động sắp xếp các khung giờ theo thứ tự thời gian từ sáng đến tối", () => {
      const slots: TimeSlotDef[] = [
        { id: "s3", label: "18:00 – 20:00", startTime: "18:00", endTime: "20:00", period: "evening" },
        { id: "s1", label: "07:00 – 09:00", startTime: "07:00", endTime: "09:00", period: "morning" },
        { id: "s2", label: "14:00 – 16:00", startTime: "14:00", endTime: "16:00", period: "afternoon" },
      ];

      const sorted = sortTimeSlots(slots);
      assert.strictEqual(sorted[0].id, "s1"); // 07:00
      assert.strictEqual(sorted[1].id, "s2"); // 14:00
      assert.strictEqual(sorted[2].id, "s3"); // 18:00
    });

    it("6.2. Chặn xóa khung giờ nếu có lớp học đang sử dụng", () => {
      // Slot e2 (18:00 - 20:15) đang được lớp II-01 sử dụng
      const result = checkCanDeleteTimeSlot("e2", CLASSROOMS_DATA, STANDARD_TIME_SLOTS);
      assert.strictEqual(result.canDelete, false);
      assert.ok(result.conflictingClassCodes.includes("II-01"));
      assert.ok(result.reason?.includes("Không được phép xóa"));
    });

    it("6.3. Cho phép xóa khung giờ nếu không có lớp nào sử dụng", () => {
      // Khung giờ ca đêm (21:35 - 23:00) không có lớp nào học
      const emptySlot: TimeSlotDef = {
        id: "late-night",
        label: "Ca đêm",
        startTime: "21:35",
        endTime: "23:00",
        period: "evening",
      };
      const result = checkCanDeleteTimeSlot("late-night", CLASSROOMS_DATA, [
        ...STANDARD_TIME_SLOTS,
        emptySlot,
      ]);
      assert.strictEqual(result.canDelete, true);
      assert.strictEqual(result.inUseCount, 0);
    });
  });

  describe(
    "7. Quản lý Ca học & Kiểm soát Xung đột (PostgreSQL Schedule Session Integration)",
    { skip: !hasTestDatabase() },
    () => {
      beforeEach(async () => {
        await resetAndSeedTestDatabase();
      });

      after(async () => {
        await teardownTestDatabase();
      });

      it("7.1. Tạo ca học mới thành công", async () => {
        const { createClassSession } = await import("@/services/schedule.service");
        const session = await createClassSession({
          classCode: "IF-01",
          dayOfWeek: 6, // Thứ Bảy
          startTime: "14:30",
          endTime: "16:30",
          room: "Phòng 301 · Cơ sở Nguyễn Du",
          topic: "Luyện đề Reading Cam 18 Test 2",
        });

        assert.strictEqual(session.classCode, "IF-01");
        assert.strictEqual(session.dayOfWeek, 6);
        assert.strictEqual(session.startTime, "14:30");
        assert.strictEqual(session.endTime, "16:30");
        assert.strictEqual(session.room, "Phòng 301 · Cơ sở Nguyễn Du");
        assert.strictEqual(session.topic, "Luyện đề Reading Cam 18 Test 2");
      });

      it("7.2. Chặn cứng xung đột khi ca học mới bị đè khung giờ giáo viên/phòng học (ConflictError)", async () => {
        const { createClassSession } = await import("@/services/schedule.service");
        // Ca 1: Thứ Hai 17:45 - 19:45 đã có (IF-01)
        // Tạo ca 2 đè giờ vào Thứ Hai: 18:00 - 20:00 -> Phải ném ConflictError
        await assert.rejects(
          () =>
            createClassSession({
              classCode: "II-01",
              dayOfWeek: 1, // Thứ Hai
              startTime: "18:00",
              endTime: "20:00",
              room: "Phòng 302 · Cơ sở Nguyễn Du",
              topic: "Speaking Part 2 & 3",
            }),
          ConflictError,
        );
      });
    },
  );

  describe("8. Đồng bộ Lịch Lớp học & Sắp xếp Thời gian (Schedule Sync & Chronological Order)", () => {
    it("8.1. formatSessionsToScheduleSummary định dạng chuẩn tiếng Việt cho 3+ ca học", async () => {
      const { formatSessionsToScheduleSummary } = await import("@/services/schedule-helper");
      const mockSessions = [
        {
          id: "s1",
          classCode: "II-01",
          className: "IELTS Intensive",
          level: "B2",
          dayOfWeek: 2,
          dayLabel: "Thứ Ba",
          startTime: "18:00",
          endTime: "20:15",
          room: "Phòng 302",
          topic: "Writing",
          enrolledCount: 12,
          capacity: 15,
          status: "upcoming" as const,
        },
        {
          id: "s2",
          classCode: "II-01",
          className: "IELTS Intensive",
          level: "B2",
          dayOfWeek: 5,
          dayLabel: "Thứ Sáu",
          startTime: "18:00",
          endTime: "20:15",
          room: "Phòng 302",
          topic: "Speaking",
          enrolledCount: 12,
          capacity: 15,
          status: "upcoming" as const,
        },
        {
          id: "s3",
          classCode: "II-01",
          className: "IELTS Intensive",
          level: "B2",
          dayOfWeek: 4,
          dayLabel: "Thứ Năm",
          startTime: "08:30",
          endTime: "10:30",
          room: "Phòng 302",
          topic: "Reading",
          enrolledCount: 12,
          capacity: 15,
          status: "upcoming" as const,
        },
      ];

      const summary = formatSessionsToScheduleSummary(mockSessions);
      assert.strictEqual(
        summary,
        "Thứ 3 (18:00 – 20:15), Thứ 5 (08:30 – 10:30) & Thứ 6 (18:00 – 20:15)",
        "Phải sắp xếp theo thứ tự Thứ trong tuần và nối chuỗi bằng phẩy & và",
      );
    });

    it("8.2. parseScheduleStringToSlots bóc tách chính xác chuỗi có 3+ ca kèm dấu phẩy", () => {
      const slots = parseScheduleStringToSlots(
        "Thứ 3 (18:00 – 20:15), Thứ 5 (08:30 – 10:30) & Thứ 6 (18:00 – 20:15)",
      );
      assert.strictEqual(slots.length, 3, "Phải nhận diện đủ 3 ca học");
      assert.strictEqual(slots[0].dayNumber, 2);
      assert.strictEqual(slots[1].dayNumber, 4);
      assert.strictEqual(slots[2].dayNumber, 5);
    });

    describe(
      "8.3–8.4. Đồng bộ scheduleSummary trên PostgreSQL",
      { skip: !hasTestDatabase() },
      () => {
        beforeEach(async () => {
          await resetAndSeedTestDatabase();
        });

        after(async () => {
          await teardownTestDatabase();
        });

        it("8.3. Thêm ca học mới tự động cập nhật scheduleSummary của lớp và sắp xếp theo thời gian", async () => {
          const { createClassSession, listWeeklySchedule } = await import(
            "@/services/schedule.service"
          );

          // Thêm ca Thứ 7 chiều (trống lịch) cho lớp II-01
          const created = await createClassSession({
            classCode: "II-01",
            dayOfWeek: 6, // Thứ Bảy
            startTime: "14:30",
            endTime: "16:30",
            room: "Phòng 302 · Cơ sở Nguyễn Du",
            topic: "Mock test Speaking",
          });

          assert.strictEqual(created.classCode, "II-01");

          // Kiểm tra scheduleSummary của lớp II-01 được cập nhật
          const cls = await classroomService.getClassroomById("cls-ii-01");
          assert.ok(cls);
          assert.ok(
            cls.scheduleSummary.includes("Thứ 7") ||
              cls.scheduleSummary.includes("14:30"),
            `scheduleSummary phải chứa thông tin ca mới Thứ 7. Thực tế: ${cls.scheduleSummary}`,
          );

          // Kiểm tra listWeeklySchedule trả về đã được sắp xếp theo thời gian
          const saturdaySessions = await listWeeklySchedule({ dayOfWeek: 6 });
          for (let i = 0; i < saturdaySessions.length - 1; i++) {
            assert.ok(
              saturdaySessions[i].startTime <=
                saturdaySessions[i + 1].startTime,
              "Các ca trong ngày phải được sắp xếp tăng dần theo startTime",
            );
          }
        });

        it("8.4. Xóa ca học tự động cập nhật lại scheduleSummary của lớp", async () => {
          const { createClassSession, deleteClassSession } = await import(
            "@/services/schedule.service"
          );

          // Tạo một ca tạm cho lớp IF-01 vào Chủ Nhật
          const tempSession = await createClassSession({
            classCode: "IF-01",
            dayOfWeek: 7, // Chủ Nhật
            startTime: "14:30",
            endTime: "16:30",
            room: "Phòng 302 · Cơ sở Nguyễn Du",
            topic: "Workshop ngữ pháp",
          });

          let cls = await classroomService.getClassroomById("cls-if-01");
          assert.ok(cls);
          assert.ok(cls.scheduleSummary.includes("Chủ Nhật"));

          // Xóa ca này
          const deleted = await deleteClassSession(tempSession.id);
          assert.strictEqual(deleted, true);

          // Kiểm tra scheduleSummary của lớp IF-01 không còn Chủ Nhật
          cls = await classroomService.getClassroomById("cls-if-01");
          assert.ok(cls);
          assert.strictEqual(
            cls.scheduleSummary.includes("Chủ Nhật"),
            false,
            "scheduleSummary phải tự động gỡ bỏ Chủ Nhật sau khi xóa ca",
          );
        });
      },
    );
  });

  describe("9. Chuẩn hóa Phòng, Calendar Occurrence Resolver & Xuất .ICS/CSV", () => {
    it("9.1. normalizeRoomKey chuẩn hóa chính xác tên phòng kèm tên cơ sở", () => {
      assert.strictEqual(normalizeRoomKey("Phòng 302 · Cơ sở Nguyễn Du"), "phòng 302");
      assert.strictEqual(normalizeRoomKey("  phòng   302 "), "phòng 302");
      assert.strictEqual(normalizeRoomKey(""), "");
    });

    it("9.2. resolveScheduleOccurrences tổng hợp đúng lịch tuần + ngoại lệ & KPIs", () => {
      const occurrences = resolveScheduleOccurrences({
        fromDate: "2026-11-16",
        toDate: "2026-11-22",
        sessions: [
          {
            id: "s-mon",
            classCode: "IF-01",
            className: "IELTS Foundation",
            level: "B1+",
            dayOfWeek: 1,
            dayLabel: "Thứ Hai",
            startTime: "17:45",
            endTime: "19:45",
            room: "Phòng 302",
            topic: "Reading",
            enrolledCount: 14,
            capacity: 15,
            status: "upcoming",
          },
        ],
        exceptions: [
          {
            id: "exc-makeup",
            type: "makeup",
            classId: "cls-if-01",
            classCode: "IF-01",
            className: "IELTS Foundation",
            level: "B1+",
            originalDate: "2026-11-21",
            newDate: "2026-11-21",
            startTime: "14:00",
            endTime: "16:00",
            room: "Phòng 302",
            topic: "Dạy bù Reading",
            reason: "Ôn thi",
            createdAt: "2026-11-16T08:00:00Z",
          },
        ],
        classes: CLASSROOMS_DATA,
        todayIso: "2026-11-18",
      });

      assert.strictEqual(occurrences.length, 2);
      const kpis = computeScheduleRangeKpis(occurrences);
      assert.strictEqual(kpis.totalActiveSessions, 2);
      assert.strictEqual(kpis.makeupCount, 1);
      assert.strictEqual(kpis.totalTeachingHours, 4);

      const ics = buildScheduleIcsContent(occurrences);
      assert.ok(ics.includes("BEGIN:VCALENDAR"));
      assert.ok(ics.includes("BEGIN:VEVENT"));
      const csv = buildScheduleCsvContent(occurrences);
      assert.ok(csv.startsWith("\uFEFF"));
      assert.ok(csv.includes("IF-01"));
    });
  });
});
