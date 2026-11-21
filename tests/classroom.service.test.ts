import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { prisma } from "@/lib/db/prisma";
import { resetServerEnvCache } from "@/lib/env";
import {
  listClassrooms,
  listAllClassrooms,
  getClassroomById,
  createClassroom,
  updateClassroom,
  archiveClassroom,
  restoreClassroom,
  advanceClassroomWeek,
  listAllCurriculumMaterials,
  addClassroomMaterial,
  removeClassroomMaterial,
  assignMaterialToClasses,
  removeMaterialFromAllClasses,
  completeClassroom,
  activateClassroom,
  cloneClassroom,
  shiftClassroomCurriculumDates,
  listCurriculumTemplates,
  saveClassroomAsTemplate,
  deleteCurriculumTemplate,
} from "@/services/classroom.service";
import { resolveWeekStatus, type ClassroomGroup } from "@/services/classroom-data";
import { sanitizeClassroomRoadmapForStudent } from "@/services/classroom-helpers";
import { ConflictError, NotFoundError, ValidationError } from "@/services/errors";
import { recordAttendance, getAttendanceSnapshot } from "@/services/schedule.service";
import {
  listResourceFiles,
  listStorageAuditLogs,
  listStoredFiles,
  uploadCurriculumAttachment,
} from "@/services/storage.service";
import * as studentService from "@/services/student.service";
import * as teachingJournalService from "@/services/teaching-journal.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

function applyTestEnv() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ||
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

describe("Classroom Service — Pure Helpers (Offline)", () => {
  beforeEach(() => {
    applyTestEnv();
  });

  it("7.8. resolveWeekStatus tính toán chính xác trạng thái tuần kế thừa khi chưa set explicit", () => {
    const weekPast = { weekNumber: 1, title: "Tuần cũ" };
    const weekCurrent = { weekNumber: 3, title: "Tuần hiện tại" };
    const weekFuture = { weekNumber: 5, title: "Tuần tương lai" };
    const weekExplicit = {
      weekNumber: 1,
      title: "Tuần cũ nhưng hoãn",
      status: "postponed" as const,
    };

    assert.strictEqual(resolveWeekStatus(weekPast, 3), "completed");
    assert.strictEqual(resolveWeekStatus(weekCurrent, 3), "in-progress");
    assert.strictEqual(resolveWeekStatus(weekFuture, 3), "not-started");
    assert.strictEqual(resolveWeekStatus(weekExplicit, 3), "postponed");
  });

  it("9.9. Sanitize lộ trình học cho Cổng Học sinh ẩn ghi chú nội bộ & khóa tuần tương lai", () => {
    const cls: ClassroomGroup = {
      id: "cls-priv-fixture",
      code: "PRIV-01",
      name: "Lớp Bảo Mật Cổng HS",
      level: "IELTS 6.5+",
      targetBand: "7.0",
      scheduleSummary: "Thứ 2 (18:00 - 19:30)",
      room: "Phòng 301",
      enrolled: 0,
      capacity: 12,
      attendanceRate: 100,
      averageScore: 0,
      currentModule: "Tuần 1/3 · Tuần Mở Khóa",
      status: "active",
      totalWeeks: 3,
      currentWeekIndex: 1,
      curriculum: [
        {
          weekNumber: 1,
          title: "Tuần Mở Khóa",
          notes: "Ghi chú nội bộ: Em A hơi chậm phần từ vựng",
          homework: "Làm bài đọc Test 1",
          status: "in-progress",
          attachments: [
            {
              id: "att-pub-1",
              name: "Test1.pdf",
              type: "PDF",
              size: "500 KB",
              url: "/uploads/t1.pdf",
              uploadedAt: "10/11/2026",
            },
          ],
        },
        {
          weekNumber: 2,
          title: "Tuần Tương Lai",
          notes: "Đáp án nội bộ đề thi",
          homework: "Đề bí mật chưa phát",
          status: "not-started",
          attachments: [
            {
              id: "att-sec-2",
              name: "SecretKey.pdf",
              type: "PDF",
              size: "800 KB",
              url: "/uploads/secret.pdf",
              uploadedAt: "10/11/2026",
            },
          ],
        },
      ],
    };

    const roadmap = sanitizeClassroomRoadmapForStudent(cls);
    const w1 = roadmap.weeks.find((w) => w.weekNumber === 1);
    const w2 = roadmap.weeks.find((w) => w.weekNumber === 2);

    assert.ok(w1 && !w1.isLocked);
    assert.strictEqual("notes" in w1, false);
    assert.strictEqual(w1.homework, "Làm bài đọc Test 1");
    assert.strictEqual(w1.attachments.length, 1);

    assert.ok(w2 && w2.isLocked);
    assert.strictEqual(w2.homework, undefined);
    assert.strictEqual(w2.attachments.length, 0);
  });
});

describe(
  "PostgreSQL / Prisma Classroom & Curriculum Service",
  { skip: !hasTestDatabase() },
  () => {
    beforeEach(async () => {
      applyTestEnv();
      await resetAndSeedTestDatabase();
    });

    after(async () => {
      await teardownTestDatabase();
    });

  describe("1. Danh sách lớp & Tính toán Metrics động (List & Dynamic Metrics)", () => {
    it("1.1. Lấy danh sách lớp hoạt động (mặc định loại bỏ lớp archived)", async () => {
      const classes = await listClassrooms();
      assert.ok(classes.length > 0, "Phải có danh sách lớp khởi tạo");
      assert.ok(
        classes.every((c) => c.status !== "archived"),
        "Mặc định không chứa lớp archived",
      );
    });

    it("1.2. Tính toán sĩ số enrolled động từ bảng học sinh", async () => {
      const classes = await listClassrooms();
      const first = classes[0];
      const activeStudents = await studentService.listAllStudents({
        classId: first.id,
        status: "non-archived",
      });
      assert.strictEqual(first.enrolled, activeStudents.length);
    });

    it("1.3. Lấy tất cả lớp bao gồm cả archived khi includeArchived=true", async () => {
      const all = await listAllClassrooms(true);
      assert.ok(all.length >= 4);
    });
  });

  describe("2. Xem chi tiết theo ID (Get by ID)", () => {
    it("2.1. Tìm lớp học theo ID thành công", async () => {
      const cls = await getClassroomById("cls-ii-01");
      assert.strictEqual(cls.code, "II-01");
      assert.ok(cls.capacity > 0);
    });

    it("2.2. Ném NotFoundError khi ID không tồn tại", async () => {
      await assert.rejects(
        () => getClassroomById("cls-non-existent"),
        (err: unknown) => err instanceof NotFoundError,
      );
    });
  });

  describe("3. Khởi tạo lớp học mới & Ràng buộc mã lớp (Create Classroom)", () => {
    it("3.1. Tạo lớp học thành công và tự động in hoa mã lớp", async () => {
      const created = await createClassroom({
        code: "ielts-adv-01",
        name: "IELTS Advanced Masterclass",
        level: "C1",
        targetBand: "7.5–8.5",
        scheduleSummary: "Thứ 2 & Thứ 4 · 19:30 – 21:30",
        room: "Phòng 401",
        capacity: 12,
        currentModule: "Tuần 1/12 · Advanced Cohesion & Lexical Precision",
      });

      assert.strictEqual(created.code, "IELTS-ADV-01");
      assert.strictEqual(created.enrolled, 0);
      assert.strictEqual(created.status, "active");

      // Verify it appears in list
      const list = await listClassrooms();
      assert.ok(list.some((c) => c.code === "IELTS-ADV-01"));
    });

    it("3.2. Chặn trùng mã lớp và ném ConflictError", async () => {
      await assert.rejects(
        () =>
          createClassroom({
            code: "ii-01", // Already exists
            name: "Duplicate Class",
            level: "B2",
            targetBand: "7.0",
            scheduleSummary: "Thứ 3 · 18:00",
            room: "Phòng 302",
            capacity: 15,
            currentModule: "Module 1",
          }),
        (err: unknown) => err instanceof ConflictError,
      );
    });

    it("3.3. Validate dữ liệu đầu vào (thiếu tên hoặc capacity sai)", async () => {
      await assert.rejects(
        () =>
          createClassroom({
            code: "NEW-01",
            name: "", // Invalid empty name
            capacity: 2, // Min is 5
          }),
        (err: unknown) => err instanceof ValidationError,
      );
    });
  });

  describe("4. Chỉnh sửa lớp học (Update Classroom)", () => {
    it("4.1. Cập nhật thông tin lớp học thành công", async () => {
      const updated = await updateClassroom("cls-ii-01", {
        name: "IELTS Intensive Master (Band 7.0–8.0+)",
        capacity: 18,
        currentModule: "Tuần 10/16 · Complex Sentence Inversion",
      });

      assert.strictEqual(updated.name, "IELTS Intensive Master (Band 7.0–8.0+)");
      assert.strictEqual(updated.capacity, 18);
      assert.strictEqual(
        updated.currentModule,
        "Tuần 10/16 · Complex Sentence Inversion",
      );
    });

    it("4.2. Chặn đổi mã lớp sang mã đã thuộc về lớp khác", async () => {
      // IF-01 exists, cannot rename II-01 to IF-01
      await assert.rejects(
        () =>
          updateClassroom("cls-ii-01", {
            code: "IF-01",
          }),
        (err: unknown) => err instanceof ConflictError,
      );
    });

    it("4.3. Cho phép cập nhật mà giữ nguyên mã lớp cũ", async () => {
      const updated = await updateClassroom("cls-ii-01", {
        code: "II-01",
        name: "IELTS Intensive Kept",
      });
      assert.strictEqual(updated.code, "II-01");
      assert.strictEqual(updated.name, "IELTS Intensive Kept");
    });

    it("4.4. Chặn giảm sĩ số tối đa (capacity) thấp hơn số học viên đang theo học", async () => {
      const cls = await getClassroomById("cls-ii-01");
      assert.ok(cls.enrolled > 0);
      await assert.rejects(
        () =>
          updateClassroom("cls-ii-01", {
            capacity: Math.max(0, cls.enrolled - 1),
          }),
        (err: unknown) => err instanceof ValidationError,
      );
    });

    it("4.5. Tự động đồng bộ mã lớp, tên lớp, trình độ sang học sinh & lịch buổi học khi cập nhật", async () => {
      const updated = await updateClassroom("cls-ii-01", {
        code: "II-01-PRO",
        name: "IELTS Intensive Pro",
        level: "C1+",
      });
      assert.strictEqual(updated.code, "II-01-PRO");

      const linkedStudents = await studentService.listAllStudents({
        classId: "cls-ii-01",
        status: "all",
      });
      assert.ok(linkedStudents.length > 0);
      assert.ok(
        linkedStudents.every(
          (s) => s.className === "IELTS Intensive Pro" && s.level === "C1+",
        ),
      );

      const linkedSessions = await prisma.classSession.findMany({
        where: { classroomId: "cls-ii-01" },
      });
      if (linkedSessions.length > 0) {
        assert.ok(
          linkedSessions.every(
            (cs) =>
              cs.classCode === "II-01-PRO" && cs.className === "IELTS Intensive Pro",
          ),
        );
      }
    });
  });

  describe("5. Lưu trữ & Khôi phục lớp học (Archive & Restore)", () => {
    it("5.1. Chặn lưu trữ nếu lớp đang có học viên hoạt động", async () => {
      // cls-ii-01 has active students
      await assert.rejects(
        () => archiveClassroom("cls-ii-01"),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          assert.match(err.message, /Không thể lưu trữ lớp đang có/);
          return true;
        },
      );
    });

    it("5.2. Cho phép lưu trữ nếu lớp không có học viên nào", async () => {
      // Create empty class
      const emptyClass = await createClassroom({
        code: "EMPTY-01",
        name: "Empty Class For Archive",
        capacity: 10,
        scheduleSummary: "Thứ 7 · 14:00",
        room: "Phòng 101",
        currentModule: "Module 1",
      });

      const archived = await archiveClassroom(emptyClass.id);
      assert.strictEqual(archived.status, "archived");

      // No longer in active list
      const activeList = await listClassrooms();
      assert.ok(!activeList.some((c) => c.id === emptyClass.id));

      // Still in full list
      const allList = await listAllClassrooms(true);
      assert.ok(allList.some((c) => c.id === emptyClass.id && c.status === "archived"));
    });

    it("5.3. Khôi phục lớp đã lưu trữ thành công", async () => {
      const emptyClass = await createClassroom({
        code: "RESTORE-01",
        name: "Class To Restore",
        capacity: 10,
        scheduleSummary: "Chủ Nhật · 09:00",
        room: "Phòng 102",
        currentModule: "Module 1",
      });

      await archiveClassroom(emptyClass.id);
      const restored = await restoreClassroom(emptyClass.id);
      assert.strictEqual(restored.status, "active");

      const activeList = await listClassrooms();
      assert.ok(activeList.some((c) => c.id === emptyClass.id));
    });

    it("5.4. Chặn khôi phục lớp đã lưu trữ nếu mã lớp đó đã được tạo mới ở lớp hoạt động khác", async () => {
      const oldClass = await createClassroom({
        code: "DUP-RES-01",
        name: "Old Archived Class",
        capacity: 10,
      });
      await archiveClassroom(oldClass.id);

      // Create new active class using the freed code
      await createClassroom({
        code: "DUP-RES-01",
        name: "New Active Class",
        capacity: 12,
      });

      await assert.rejects(
        () => restoreClassroom(oldClass.id),
        (err: unknown) => err instanceof ConflictError,
      );
    });
  });

  describe("6. Tính toàn vẹn Dữ liệu Liên Module (Cross-Module Data Consistency)", () => {
    it("6.1. Khi học sinh bị lưu trữ mềm (archived), sĩ số lớp tự động giảm tương ứng", async () => {
      const targetClassId = "cls-ii-01";
      const beforeClasses = await listClassrooms();
      const beforeClass = beforeClasses.find((c) => c.id === targetClassId)!;
      const initialEnrolled = beforeClass.enrolled;

      // Find an active student in this class and archive them via Prisma-backed studentService
      const activeStudents = await studentService.listAllStudents({
        classId: targetClassId,
        status: "non-archived",
      });
      assert.ok(activeStudents.length > 0, "Phải có học sinh trong lớp để test");
      await studentService.archiveStudent(activeStudents[0].id);

      // Re-query classrooms
      const afterClasses = await listClassrooms();
      const afterClass = afterClasses.find((c) => c.id === targetClassId)!;
      assert.strictEqual(afterClass.enrolled, initialEnrolled - 1);
    });

    it("6.2. Sau khi tất cả học sinh được chuyển hoặc lưu trữ, lớp có thể được lưu trữ thành công", async () => {
      // Create a new class with 1 student
      const newClass = await createClassroom({
        code: "SOLO-01",
        name: "Solo Class",
        capacity: 10,
        scheduleSummary: "Thứ 4 · 18:00",
        room: "Phòng 201",
        currentModule: "Module 1",
      });

      const stu = await studentService.createStudent({
        code: "HS-SOLO-01",
        fullName: "Học Viên Thử Nghiệm",
        classId: newClass.id,
        targetGoal: "IELTS 7.5",
        tuitionStatus: "paid",
        tuitionAmount: "5.000.000 ₫",
      });

      // Verify cannot archive yet
      await assert.rejects(
        () => archiveClassroom(newClass.id),
        (err: unknown) => err instanceof ValidationError,
      );

      // Archive the student via Prisma-backed studentService
      await studentService.archiveStudent(stu.id);

      // Now archive the class should succeed
      const archived = await archiveClassroom(newClass.id);
      assert.strictEqual(archived.status, "archived");
    });
  });

  describe("7. Khung chương trình & Chuyển tuần 1 chạm (Curriculum & 1-Click Week Advance)", () => {
    it("7.1. Khởi tạo lớp học với Khung chương trình setup từ đầu", async () => {
      const created = await createClassroom({
        code: "SETUP-01",
        name: "Lớp Khung Chuẩn",
        totalWeeks: 8,
        currentWeekIndex: 1,
        curriculum: [
          { weekNumber: 1, title: "Phát âm IPA" },
          { weekNumber: 2, title: "Ngữ pháp 12 thì" },
          { weekNumber: 3, title: "Câu điều kiện" },
          { weekNumber: 4, title: "Ôn tập giữa khóa" },
          { weekNumber: 5, title: "Kỹ năng nghe hội thoại" },
          { weekNumber: 6, title: "Đọc hiểu văn bản" },
          { weekNumber: 7, title: "Luyện nói phản xạ" },
          { weekNumber: 8, title: "Kiểm tra cuối khóa" },
        ],
      });

      assert.strictEqual(created.totalWeeks, 8);
      assert.strictEqual(created.currentWeekIndex, 1);
      assert.strictEqual(created.currentModule, "Tuần 1/8 · Phát âm IPA");
      assert.strictEqual(created.curriculum?.length, 8);
    });

    it("7.2. Chuyển tuần 1 chạm (advanceClassroomWeek) tự động cập nhật bài học tiếp theo", async () => {
      const cls = await createClassroom({
        code: "NEXT-01",
        name: "Lớp Kiểm Tra Chuyển Tuần",
        totalWeeks: 4,
        currentWeekIndex: 1,
        curriculum: [
          { weekNumber: 1, title: "Bài mở đầu" },
          { weekNumber: 2, title: "Bài thực hành 1" },
          { weekNumber: 3, title: "Bài thực hành 2" },
          { weekNumber: 4, title: "Tổng kết" },
        ],
      });

      // Advance +1 week
      const advanced = await advanceClassroomWeek(cls.id);
      assert.strictEqual(advanced.currentWeekIndex, 2);
      assert.strictEqual(advanced.currentModule, "Tuần 2/4 · Bài thực hành 1");

      // Advance +1 week again
      const advanced2 = await advanceClassroomWeek(cls.id);
      assert.strictEqual(advanced2.currentWeekIndex, 3);
      assert.strictEqual(advanced2.currentModule, "Tuần 3/4 · Bài thực hành 2");
    });

    it("7.3. Chuyển tới một tuần cụ thể (nhảy cóc tuần học)", async () => {
      const cls = await createClassroom({
        code: "JUMP-01",
        name: "Lớp Nhảy Cóc",
        totalWeeks: 10,
        currentWeekIndex: 1,
        curriculum: [
          { weekNumber: 1, title: "Tuần 1" },
          { weekNumber: 5, title: "Giữa kỳ Part 5" },
          { weekNumber: 10, title: "Cuối kỳ Part 10" },
        ],
      });

      const jumped = await advanceClassroomWeek(cls.id, 5);
      assert.strictEqual(jumped.currentWeekIndex, 5);
      assert.strictEqual(jumped.currentModule, "Tuần 5/10 · Giữa kỳ Part 5");
    });

    it("7.4. Chuyển tuần không vượt quá tổng thời lượng khóa học (capped at totalWeeks)", async () => {
      const cls = await createClassroom({
        code: "MAX-01",
        name: "Lớp Kịch Kim",
        totalWeeks: 3,
        currentWeekIndex: 3,
        curriculum: [
          { weekNumber: 1, title: "B1" },
          { weekNumber: 2, title: "B2" },
          { weekNumber: 3, title: "B3" },
        ],
      });

      // Try to advance beyond totalWeeks
      const maxed = await advanceClassroomWeek(cls.id);
      assert.strictEqual(maxed.currentWeekIndex, 3);
      assert.strictEqual(maxed.currentModule, "Tuần 3/3 · B3");
    });

    it("7.5. Quản lý 4 trạng thái tiến độ tuần học độc lập (Chưa học, Đang học, Đã hoàn thành, Tạm hoãn)", async () => {
      const cls = await createClassroom({
        code: "STATUS-01",
        name: "Lớp Trạng Thái Tuần",
        totalWeeks: 4,
        currentWeekIndex: 1,
        curriculum: [
          { weekNumber: 1, title: "Tuần 1: Khởi động", status: "completed" },
          { weekNumber: 2, title: "Tuần 2: Chuyên sâu", status: "in-progress" },
          { weekNumber: 3, title: "Tuần 3: Ôn tập", status: "postponed" },
          { weekNumber: 4, title: "Tuần 4: Thi kết thúc", status: "not-started" },
        ],
      });

      assert.strictEqual(cls.curriculum?.[0].status, "completed");
      assert.strictEqual(cls.curriculum?.[1].status, "in-progress");
      assert.strictEqual(cls.curriculum?.[2].status, "postponed");
      assert.strictEqual(cls.curriculum?.[3].status, "not-started");
    });

    it("7.6. Dạy bù: Giáo viên nhảy về tuần 3 KHÔNG tự động đánh dấu tuần 4 và 5 là đã hoàn thành", async () => {
      const cls = await createClassroom({
        code: "MAKEUP-01",
        name: "Lớp Dạy Bù",
        totalWeeks: 6,
        currentWeekIndex: 5,
        curriculum: [
          { weekNumber: 1, title: "Tuần 1", status: "completed" },
          { weekNumber: 2, title: "Tuần 2", status: "completed" },
          { weekNumber: 3, title: "Tuần 3 (Dạy bù)", status: "postponed" },
          { weekNumber: 4, title: "Tuần 4", status: "in-progress" },
          { weekNumber: 5, title: "Tuần 5", status: "not-started" },
          { weekNumber: 6, title: "Tuần 6", status: "not-started" },
        ],
      });

      // Teacher goes back to Week 3 to teach makeup
      const updated = await advanceClassroomWeek(cls.id, {
        targetWeek: 3,
        status: "in-progress",
        setAsActiveWeek: true,
        notes: "Dạy bù kiến thức phần ngữ pháp đã tạm hoãn",
      });

      assert.strictEqual(updated.currentWeekIndex, 3);
      assert.strictEqual(updated.currentModule, "Tuần 3/6 · Tuần 3 (Dạy bù)");

      const w3 = updated.curriculum?.find((w) => w.weekNumber === 3);
      const w4 = updated.curriculum?.find((w) => w.weekNumber === 4);
      const w5 = updated.curriculum?.find((w) => w.weekNumber === 5);

      assert.strictEqual(w3?.status, "in-progress");
      assert.strictEqual(w3?.notes, "Dạy bù kiến thức phần ngữ pháp đã tạm hoãn");
      // Critical check: Week 4 and Week 5 MUST NOT be marked as completed!
      assert.strictEqual(w4?.status, "in-progress");
      assert.strictEqual(w5?.status, "not-started");
    });

    it("7.7. Lưu và cập nhật đầy đủ các trường: ngày dự kiến, ngày thực tế, giáo viên, ghi chú, bài tập", async () => {
      const cls = await createClassroom({
        code: "DETAIL-01",
        name: "Lớp Chi Tiết Tuần",
        totalWeeks: 3,
        currentWeekIndex: 1,
        curriculum: [
          { weekNumber: 1, title: "Tổng quan IELTS Writing Task 1" },
          { weekNumber: 2, title: "Phân tích Biểu đồ Đường & Cột" },
          { weekNumber: 3, title: "Viết bài hoàn chỉnh" },
        ],
      });

      const updated = await advanceClassroomWeek(cls.id, {
        targetWeek: 1,
        status: "completed",
        scheduledDate: "2026-11-10",
        completedDate: "2026-11-12",
        teacherName: "ThS. Nguyễn Minh Anh",
        notes: "Học sinh nắm vững cách viết Overview và chọn lọc số liệu nổi bật.",
        homework: "Cambridge IELTS 18 Test 2 Task 1",
      });

      const w1 = updated.curriculum?.find((w) => w.weekNumber === 1);
      assert.strictEqual(w1?.status, "completed");
      assert.strictEqual(w1?.scheduledDate, "2026-11-10");
      assert.strictEqual(w1?.completedDate, "2026-11-12");
      assert.strictEqual(w1?.teacherName, "ThS. Nguyễn Minh Anh");
      assert.strictEqual(
        w1?.notes,
        "Học sinh nắm vững cách viết Overview và chọn lọc số liệu nổi bật.",
      );
      assert.strictEqual(w1?.homework, "Cambridge IELTS 18 Test 2 Task 1");
    });

    it("7.9. Giới hạn currentWeekIndex không vượt quá totalWeeks khi tạo mới hoặc thu gọn khung chương trình", async () => {
      const cls = await createClassroom({
        code: "CLAMP-01",
        name: "Clamp Weeks Class",
        totalWeeks: 6,
        currentWeekIndex: 10,
      });
      assert.strictEqual(cls.currentWeekIndex, 6);

      const shrunk = await updateClassroom(cls.id, { totalWeeks: 4 });
      assert.strictEqual(shrunk.totalWeeks, 4);
      assert.strictEqual(shrunk.currentWeekIndex, 4);
    });

    it("7.10. Tôn trọng cờ setAsActiveWeek=false khi chỉnh sửa tuần khác mà không làm đổi tuần hiện tại", async () => {
      const cls = await createClassroom({
        code: "NOACT-01",
        name: "Keep Active Week Class",
        totalWeeks: 6,
        currentWeekIndex: 3,
        curriculum: [
          { weekNumber: 1, title: "Tuần 1" },
          { weekNumber: 2, title: "Tuần 2" },
          { weekNumber: 3, title: "Tuần 3" },
        ],
      });

      const updated = await advanceClassroomWeek(cls.id, {
        targetWeek: 2,
        status: "in-progress",
        setAsActiveWeek: false,
        notes: "Chuẩn bị giáo án bổ sung Tuần 2",
      });

      assert.strictEqual(updated.currentWeekIndex, 3);
      assert.strictEqual(
        updated.curriculum?.find((w) => w.weekNumber === 2)?.notes,
        "Chuẩn bị giáo án bổ sung Tuần 2",
      );
    });
  });

  describe("8. Quản lý Tài liệu Lớp học & Lộ trình Bài giảng (Curriculum Materials Hub)", () => {
    it("8.1. Cập nhật tiến độ tuần kèm danh sách attachments và tự động tính materialsCount", async () => {
      const cls = await createClassroom({
        code: "MAT-01",
        name: "Lớp Học phần có Tài liệu",
        totalWeeks: 8,
      });

      const updated = await advanceClassroomWeek(cls.id, {
        targetWeek: 1,
        status: "in-progress",
        attachments: [
          {
            id: "att-test-1",
            name: "Cambridge-18-Reading-Passage.pdf",
            url: "/documents/cambridge-18.pdf",
            size: "2.1 MB",
            sizeBytes: 2200000,
            type: "PDF",
            uploadedAt: "18/11/2026",
          },
          {
            id: "att-test-2",
            name: "Slide-Lecture-Unit-1.pptx",
            url: "/documents/slide-unit-1.pptx",
            size: "4.5 MB",
            sizeBytes: 4718592,
            type: "SLIDE",
            uploadedAt: "18/11/2026",
          },
        ],
      });

      const week1 = updated.curriculum?.find((w) => w.weekNumber === 1);
      assert.ok(week1);
      assert.strictEqual(week1.attachments?.length, 2);
      assert.strictEqual(week1.materialsCount, 2);
      assert.strictEqual(week1.attachments[0].name, "Cambridge-18-Reading-Passage.pdf");
      assert.strictEqual(week1.attachments[1].type, "SLIDE");
    });

    it("8.2. addClassroomMaterial thêm tài liệu vào tuần học phần thành công", async () => {
      const cls = await createClassroom({
        code: "MAT-02",
        name: "Lớp Đính kèm Tài liệu",
        totalWeeks: 10,
      });

      const updated = await addClassroomMaterial(cls.id, 2, {
        id: "att-mat-2",
        name: "Writing-Task-2-Template.docx",
        url: "/documents/writing-task-2.docx",
        size: "950 KB",
        sizeBytes: 972800,
        type: "DOCX",
        uploadedAt: "18/11/2026",
      });

      const week2 = updated.curriculum?.find((w) => w.weekNumber === 2);
      assert.ok(week2);
      assert.strictEqual(week2.attachments?.length, 1);
      assert.strictEqual(week2.materialsCount, 1);
      assert.strictEqual(week2.attachments[0].classCode, "MAT-02");
      assert.strictEqual(week2.attachments[0].weekNumber, 2);
    });

    it("8.3. removeClassroomMaterial gỡ tài liệu khỏi tuần học phần thành công", async () => {
      const cls = await createClassroom({
        code: "MAT-03",
        name: "Lớp Thử nghiệm Xóa Tài liệu",
        totalWeeks: 8,
      });

      await addClassroomMaterial(cls.id, 1, {
        id: "att-to-delete",
        name: "Doc-Can-Xoa.pdf",
        url: "/documents/to-delete.pdf",
        size: "1.0 MB",
        type: "PDF",
        uploadedAt: "18/11/2026",
      });

      const updatedAfterDelete = await removeClassroomMaterial(cls.id, 1, "att-to-delete");
      const week1 = updatedAfterDelete.curriculum?.find((w) => w.weekNumber === 1);
      assert.ok(week1);
      assert.strictEqual(week1.attachments?.length, 0);
      assert.strictEqual(week1.materialsCount, 0);
    });

    it("8.4. listAllCurriculumMaterials tổng hợp master materials và assignments từ các lớp hoạt động", async () => {
      const materials = await listAllCurriculumMaterials();
      assert.ok(Array.isArray(materials));
      assert.ok(materials.length >= 2, "Phải có ít nhất 2 tài liệu mẫu khởi tạo");
      const first = materials[0];
      assert.ok(first.id);
      assert.ok(first.name);
      assert.ok(first.type);
      assert.ok(Array.isArray(first.assignments));
    });

    it("8.5. UAT-02: Chặn tuyệt đối việc cập nhật mã lớp trùng với lớp khác (cả chữ thường, chữ hoa và khoảng trắng)", async () => {
      const cls1 = await createClassroom({
        code: "CODE-A",
        name: "Lớp Học Phần A",
      });

      const cls2 = await createClassroom({
        code: "CODE-B",
        name: "Lớp Học Phần B",
      });

      // Thử cập nhật cls2 với mã trùng cls1 (chữ thường)
      await assert.rejects(
        () => updateClassroom(cls2.id, { code: "code-a" }),
        (err: unknown) => {
          assert.ok(err instanceof ConflictError);
          assert.match((err as ConflictError).message, /Mã lớp "CODE-A" đã tồn tại/);
          return true;
        },
      );

      // Thử cập nhật cls2 với mã trùng cls1 kèm khoảng trắng
      await assert.rejects(
        () => updateClassroom(cls2.id, { code: "  CODE-A  " }),
        (err: unknown) => {
          assert.ok(err instanceof ConflictError);
          return true;
        },
      );

      // Cho phép cập nhật chính mình giữ nguyên mã
      const selfUpdate = await updateClassroom(cls1.id, { code: "CODE-A", name: "Lớp A Tên Mới" });
      assert.strictEqual(selfUpdate.name, "Lớp A Tên Mới");
      assert.strictEqual(selfUpdate.code, "CODE-A");
    });

    it("8.6. assignMaterialToClasses: phân bổ 1 tài liệu vào nhiều Lớp học & Tuần khác nhau", async () => {
      const clsA = await createClassroom({
        code: "MULTI-A",
        name: "Lớp Multi A",
      });
      const clsB = await createClassroom({
        code: "MULTI-B",
        name: "Lớp Multi B",
      });

      const sharedMaterial = {
        id: "mat-shared-01",
        name: "Tai_Lieu_Dung_Chung.pdf",
        url: "/documents/Tai_Lieu_Dung_Chung.pdf",
        size: "1.2 MB",
        type: "PDF" as const,
        uploadedAt: "18/11/2026",
      };

      // Phân bổ vào clsA (Tuần 1) và clsB (Tuần 3)
      const result = await assignMaterialToClasses({
        attachment: sharedMaterial,
        assignments: [
          { classId: clsA.id, weekNumber: 1 },
          { classId: clsB.id, weekNumber: 3 },
        ],
      });

      assert.strictEqual(result.updatedClassrooms.length, 2);
      assert.strictEqual(result.material.assignments.length, 2);

      // Kiểm tra trong clsA Tuần 1
      const updatedClsA = await getClassroomById(clsA.id);
      const week1A = updatedClsA.curriculum?.find((w) => w.weekNumber === 1);
      assert.ok(week1A);
      assert.ok(week1A.attachments?.some((a) => a.id === "mat-shared-01"));

      // Kiểm tra trong clsB Tuần 3
      const updatedClsB = await getClassroomById(clsB.id);
      const week3B = updatedClsB.curriculum?.find((w) => w.weekNumber === 3);
      assert.ok(week3B);
      assert.ok(week3B.attachments?.some((a) => a.id === "mat-shared-01"));

      // Cập nhật phân bổ: bỏ clsA, chỉ giữ clsB
      const reassign = await assignMaterialToClasses({
        attachment: sharedMaterial,
        assignments: [{ classId: clsB.id, weekNumber: 3 }],
      });
      assert.strictEqual(reassign.material.assignments.length, 1);
      assert.strictEqual(reassign.material.assignments[0].classId, clsB.id);

      // clsA không còn tài liệu này nữa
      const checkClsA = await getClassroomById(clsA.id);
      const checkWeek1A = checkClsA.curriculum?.find((w) => w.weekNumber === 1);
      assert.strictEqual(checkWeek1A?.attachments?.length ?? 0, 0);
    });

    it("8.7. removeMaterialFromAllClasses: gỡ tài liệu khỏi tất cả các lớp liên kết", async () => {
      const clsC = await createClassroom({
        code: "MULTI-C",
        name: "Lớp Multi C",
      });
      const clsD = await createClassroom({
        code: "MULTI-D",
        name: "Lớp Multi D",
      });

      const materialToPurge = {
        id: "mat-purge-99",
        name: "De_Xoa_Toan_Bo.docx",
        url: "/documents/De_Xoa_Toan_Bo.docx",
        size: "500 KB",
        type: "DOCX" as const,
        uploadedAt: "18/11/2026",
      };

      await assignMaterialToClasses({
        attachment: materialToPurge,
        assignments: [
          { classId: clsC.id, weekNumber: 2 },
          { classId: clsD.id, weekNumber: 4 },
        ],
      });

      const purgeResult = await removeMaterialFromAllClasses("mat-purge-99");
      assert.strictEqual(purgeResult.removed, true);
      assert.strictEqual(purgeResult.affectedClassesCount, 2);

      // Xác minh cả 2 lớp đều đã sạch tài liệu
      const c = await getClassroomById(clsC.id);
      const week2 = c.curriculum?.find((w) => w.weekNumber === 2);
      assert.strictEqual(week2?.attachments?.some((a) => a.id === "mat-purge-99"), false);

      const d = await getClassroomById(clsD.id);
      const week4 = d.curriculum?.find((w) => w.weekNumber === 4);
      assert.strictEqual(week4?.attachments?.some((a) => a.id === "mat-purge-99"), false);
    });

    it("8.8. Dạy bài này: advanceClassroomWeek với targetWeek kích hoạt in-progress và đổi tuần hiện tại", async () => {
      const cls = await createClassroom({
        code: "TEACH-01",
        name: "Lớp Thử Nghiệm Dạy Bài Này",
        totalWeeks: 4,
        currentWeekIndex: 1,
        curriculum: [
          { weekNumber: 1, title: "Tuần 1: Giới thiệu", status: "completed" },
          { weekNumber: 2, title: "Tuần 2: Từ vựng", status: "not-started" },
          { weekNumber: 3, title: "Tuần 3: Ngữ pháp", status: "not-started" },
          { weekNumber: 4, title: "Tuần 4: Ôn tập", status: "not-started" },
        ],
      });

      // Người dùng bấm "Dạy bài này" ở Tuần 3
      const updated = await advanceClassroomWeek(cls.id, {
        targetWeek: 3,
        status: "in-progress",
        setAsActiveWeek: true,
      });

      assert.strictEqual(updated.currentWeekIndex, 3);
      assert.ok(updated.currentModule.includes("Tuần 3/4"));
      const w3 = updated.curriculum?.find((w) => w.weekNumber === 3);
      assert.strictEqual(w3?.status, "in-progress");
    });

    it("8.9. tuitionDueDate: tạo mới và cập nhật hạn học phí của lớp, tự động đồng bộ trạng thái học phí (due-soon / overdue) cho học sinh", async () => {
      const cls = await createClassroom({
        code: "FEE-01",
        name: "Lớp Học Phí",
        tuitionDueDate: "2026-11-25",
      });
      assert.strictEqual(cls.tuitionDueDate, "2026-11-25");

      // Tạo 1 học sinh chưa đóng học phí ở lớp này trong PostgreSQL
      const feeStu = await studentService.createStudent({
        code: "HS-FEE-01",
        fullName: "Trần Học Phí",
        classId: cls.id,
        targetGoal: "IELTS 6.5",
        status: "active",
        tuitionStatus: "due-soon",
        tuitionPeriod: "Học kỳ II (Hạn 20/11/2026)",
        tuitionAmount: "7.500.000 ₫",
      });

      // Cập nhật hạn học phí đến tương lai (2026-11-28 > 2026-11-18)
      await updateClassroom(cls.id, {
        tuitionDueDate: "2026-11-28",
      });

      const stu1 = await studentService.getStudentById(feeStu.id);
      assert.strictEqual(stu1.tuitionStatus, "due-soon");
      assert.strictEqual(stu1.tuitionPeriod, "Học kỳ II (Hạn 28/11/2026)");

      // Cập nhật hạn học phí quá hạn (2026-11-10 < 2026-11-18)
      await updateClassroom(cls.id, {
        tuitionDueDate: "2026-11-10",
      });

      const stu2 = await studentService.getStudentById(feeStu.id);
      assert.strictEqual(stu2.tuitionStatus, "overdue");
      assert.strictEqual(stu2.tuitionPeriod, "Học kỳ II (Quá hạn từ 10/11/2026)");
    });
  });

  describe("9. Nâng cấp Quản lý Lớp học & Khung chương trình 360° (3 Giai đoạn)", () => {
    it("9.1. Kiểm tra chống trùng lịch (ConflictError) khi giao thoa thứ & khung giờ", async () => {
      await createClassroom({
        code: "CONF-A",
        name: "Lớp Conflict A",
        level: "IELTS 6.0+",
        targetBand: "6.5",
        scheduleSummary: "Thứ 2, Thứ 4 (08:00 - 09:30)",
        room: "Phòng 901",
        capacity: 15,
        status: "active",
      });

      await assert.rejects(
        () =>
          createClassroom({
            code: "CONF-B",
            name: "Lớp Conflict B",
            level: "IELTS 6.0+",
            targetBand: "6.5",
            scheduleSummary: "Thứ 2 (08:30 - 10:00)",
            room: "Phòng 901",
            capacity: 15,
            status: "active",
            validateScheduleConflict: true,
          }),
        ConflictError,
      );

      // Same day but non-overlapping time passes validation cleanly
      const nonOverlapping = await createClassroom({
        code: "CONF-C",
        name: "Lớp Conflict C",
        level: "IELTS 6.0+",
        targetBand: "6.5",
        scheduleSummary: "Thứ 2 (10:00 - 11:30)",
        room: "Phòng 901",
        capacity: 15,
        status: "active",
        validateScheduleConflict: true,
      });
      assert.strictEqual(nonOverlapping.code, "CONF-C");
    });

    it("9.2. Đồng bộ 2 chiều scheduleSummary <-> ClassSession trên DB & hydrate() không ghi đè", async () => {
      const created = await createClassroom({
        code: "SYNC-2W",
        name: "Lớp Sync 2 Chiều",
        level: "IELTS 6.5+",
        targetBand: "7.0",
        scheduleSummary: "Thứ 3, Thứ 5 (17:30 - 19:00)",
        room: "Phòng 902",
        capacity: 14,
        status: "active",
      });

      let dbSessions = await prisma.classSession.findMany({
        where: { classCode: "SYNC-2W" },
      });
      assert.strictEqual(dbSessions.length, 2);

      await updateClassroom(created.id, {
        scheduleSummary: "Thứ 4, Thứ 6 (18:00 - 19:30)",
        room: "Phòng 903",
      });

      dbSessions = await prisma.classSession.findMany({
        where: { classCode: "SYNC-2W" },
      });
      assert.strictEqual(dbSessions.length, 2);
      assert.ok(dbSessions.some((s) => s.dayLabel === "Thứ Tư" && s.startTime === "18:00"));
      assert.ok(dbSessions.some((s) => s.dayLabel === "Thứ Sáu" && s.room === "Phòng 903"));

      // listClassrooms() must preserve explicit scheduleSummary instead of overwriting from sessions
      const all = await listClassrooms();
      const reloaded = all.find((c) => c.id === created.id);
      assert.strictEqual(reloaded?.scheduleSummary, "Thứ 4, Thứ 6 (18:00 - 19:30)");
    });

    it("9.3. Tự động sinh scheduledDate từ startDate & markPreviousCompleted chốt các tuần trước", async () => {
      const cls = await createClassroom({
        code: "DATE-GEN",
        name: "Lớp Khai Giảng Chuẩn",
        level: "B2",
        targetBand: "6.5",
        scheduleSummary: "Thứ 7 (09:00 - 11:00)",
        room: "Phòng 201",
        capacity: 12,
        startDate: "2026-10-05",
        totalWeeks: 4,
      });

      assert.strictEqual(cls.curriculum?.[0]?.scheduledDate, "2026-10-05");
      assert.strictEqual(cls.curriculum?.[1]?.scheduledDate, "2026-10-12");
      assert.strictEqual(cls.curriculum?.[2]?.scheduledDate, "2026-10-19");
      assert.strictEqual(cls.curriculum?.[3]?.scheduledDate, "2026-10-26");
      assert.strictEqual(cls.expectedEndDate, "2026-10-26");

      const updated = await updateClassroom(cls.id, {
        currentWeekIndex: 3,
        markPreviousCompleted: true,
      });
      assert.strictEqual(updated.curriculum?.[0]?.status, "completed");
      assert.strictEqual(updated.curriculum?.[1]?.status, "completed");
      assert.strictEqual(updated.curriculum?.[2]?.status, "in-progress");
    });

    it("9.4. Dời lịch nghỉ lễ (+7 ngày) tịnh tiến các tuần chưa hoàn thành & giữ nguyên tuần đã hoàn thành", async () => {
      const cls = await createClassroom({
        code: "SHIFT-01",
        name: "Lớp Nghỉ Lễ",
        level: "B2",
        targetBand: "6.5",
        scheduleSummary: "Chủ Nhật (09:00 - 11:00)",
        room: "Phòng 202",
        capacity: 12,
        startDate: "2026-10-05",
        totalWeeks: 4,
      });
      await updateClassroom(cls.id, {
        currentWeekIndex: 3,
        markPreviousCompleted: true,
      });

      const shifted = await shiftClassroomCurriculumDates(cls.id, {
        fromWeekNumber: 3,
        shiftDays: 7,
      });
      // Weeks 1 & 2 completed => unchanged; Weeks 3 & 4 shifted +7 days
      assert.strictEqual(shifted.curriculum?.[0]?.scheduledDate, "2026-10-05");
      assert.strictEqual(shifted.curriculum?.[1]?.scheduledDate, "2026-10-12");
      assert.strictEqual(shifted.curriculum?.[2]?.scheduledDate, "2026-10-26");
      assert.strictEqual(shifted.curriculum?.[3]?.scheduledDate, "2026-11-02");
      assert.strictEqual(shifted.expectedEndDate, "2026-11-02");
    });

    it("9.5. Vòng đời lớp học: completeClassroom chốt khóa, chặn advanceClassroomWeek, activateClassroom mở lại", async () => {
      const cls = await createClassroom({
        code: "LIFE-01",
        name: "Lớp Vòng Đời",
        level: "C1",
        targetBand: "7.5",
        scheduleSummary: "Thứ 2 (19:30 - 21:00)",
        room: "Phòng 305",
        capacity: 10,
        status: "active",
      });

      const completed = await completeClassroom(cls.id);
      assert.strictEqual(completed.status, "completed");
      assert.ok(completed.completedAt);
      assert.strictEqual(
        await prisma.classSession.count({ where: { classCode: "LIFE-01" } }),
        0,
      );

      await assert.rejects(
        () => advanceClassroomWeek(cls.id),
        ValidationError,
      );

      const reactivated = await activateClassroom(cls.id);
      assert.strictEqual(reactivated.status, "active");
      assert.ok((await prisma.classSession.count({ where: { classCode: "LIFE-01" } })) > 0);
    });

    it("9.6. Nhân bản khóa học (cloneClassroom) giữ syllabus & reset trạng thái tuần sang upcoming", async () => {
      const source = await createClassroom({
        code: "SRC-K1",
        name: "Lớp Gốc K1",
        level: "IELTS 6.5+",
        targetBand: "7.0",
        scheduleSummary: "Thứ 3 (18:00 - 19:30)",
        room: "Phòng 401",
        capacity: 16,
        startDate: "2026-09-01",
        totalWeeks: 3,
        curriculum: [
          {
            weekNumber: 1,
            title: "Essay Architecture",
            status: "completed",
            homework: "Write 250 words",
            attachments: [
              {
                id: "att-clone-1",
                name: "Guide.pdf",
                type: "PDF",
                size: "1.2 MB",
                url: "/uploads/guide.pdf",
                uploadedAt: "01/09/2026",
              },
            ],
          },
          { weekNumber: 2, title: "Listening Part 3", status: "in-progress" },
          { weekNumber: 3, title: "Mock Test 1", status: "not-started", isAssessmentMilestone: true, assessmentTitle: "Mid-term Mock" },
        ],
      });

      const cloned = await cloneClassroom(source.id, {
        code: "SRC-K2",
        name: "Lớp Kế Tiếp K2",
        status: "upcoming",
        startDate: "2026-12-01",
        copyMaterials: true,
      });

      assert.strictEqual(cloned.code, "SRC-K2");
      assert.strictEqual(cloned.status, "upcoming");
      assert.strictEqual(cloned.enrolled, 0);
      assert.strictEqual(cloned.currentWeekIndex, 1);
      assert.strictEqual(cloned.curriculum?.[0]?.status, "in-progress");
      assert.strictEqual(cloned.curriculum?.[1]?.status, "not-started");
      assert.strictEqual(cloned.curriculum?.[0]?.scheduledDate, "2026-12-01");
      assert.strictEqual(cloned.curriculum?.[0]?.attachments?.length, 1);
    });

    it("9.7. Tạo, liệt kê và xóa Giáo trình mẫu tùy chỉnh (bảo vệ mẫu hệ thống mặc định)", async () => {
      const cls = (await listClassrooms())[0];
      const createdTpl = await saveClassroomAsTemplate(cls.id, {
        name: "Mẫu Khung Chuyên Sâu Test",
      });
      assert.strictEqual(createdTpl.isCustom, true);

      const templates = await listCurriculumTemplates();
      assert.ok(templates.some((t) => t.id === createdTpl.id));

      const systemPreset = templates.find((t) => !t.isCustom);
      assert.ok(systemPreset, "Phải có ít nhất 1 mẫu mặc định của hệ thống");
      await assert.rejects(
        () => deleteCurriculumTemplate(systemPreset.id),
        ValidationError,
      );

      const deleted = await deleteCurriculumTemplate(createdTpl.id);
      assert.strictEqual(deleted, true);
      assert.ok(!(await listCurriculumTemplates()).some((t) => t.id === createdTpl.id));
    });

    it("9.8. Upload tài liệu tuần học kiểm tra Magic Bytes, lưu UUID & ghi AuditLog", async () => {
      const cls = (await listClassrooms())[0];
      const fakeExe = Buffer.from("MZ\x90\x00fake-executable-payload");

      await assert.rejects(
        () =>
          uploadCurriculumAttachment({
            fileName: "trojan-disguised.pdf",
            mimeType: "application/pdf",
            sizeBytes: fakeExe.length,
            classId: cls.id,
            weekNumber: 1,
            actorRole: "admin",
            fileBuffer: fakeExe,
          }),
        ValidationError,
      );

      const validPdf = Buffer.from("%PDF-1.4\n%Test syllabus attachment content");
      const res = await uploadCurriculumAttachment({
        fileName: "Reading Week 1.pdf",
        mimeType: "application/pdf",
        sizeBytes: validPdf.length,
        classId: cls.id,
        classCode: cls.code,
        weekNumber: 1,
        actorRole: "admin",
        fileBuffer: validPdf,
      });

      assert.notStrictEqual(res.storedFile.storedName, "Reading Week 1.pdf");
      assert.strictEqual(res.attachment.storedFileId, res.storedFile.id);
      const [storedFiles, resourceFiles, auditLogs] = await Promise.all([
        listStoredFiles(),
        listResourceFiles(),
        listStorageAuditLogs(),
      ]);
      assert.ok(storedFiles.some((f) => f.id === res.storedFile.id));
      assert.ok(resourceFiles.some((f) => f.id === res.storedFile.id));
      assert.ok(auditLogs.some((a) => a.targetId === res.storedFile.id));
    });

    it("9.10. Khép vòng Điểm danh: tự sinh ClassSessionRecord gắn weekNumber & tách riêng HS bảo lưu", async () => {
      const classes = await listClassrooms();
      const targetClass = classes[0];
      const classStudents = await studentService.listAllStudents({
        classId: targetClass.id,
        status: "non-archived",
      });
      assert.ok(classStudents.length > 0);

      const leaveStu = classStudents[0];
      await studentService.updateStudent(leaveStu.id, {
        status: "on-leave",
        leaveReason: "Thi học sinh giỏi",
      });

      const targetDate = "2026-11-28";
      const result = await recordAttendance({
        sessionId: `manual-${targetClass.id}`,
        date: targetDate,
        entries: classStudents
          .filter((s) => s.id !== leaveStu.id)
          .map((s, idx) => ({
            studentId: s.id,
            status: idx === 0 ? "late" : "present",
            note: idx === 0 ? "Kẹt xe 10 phút" : "",
          })),
      });

      assert.ok(
        result.classSessionId,
        "Phải tự tạo draft ClassSessionRecord cho ngày điểm danh",
      );
      const createdCs = await teachingJournalService.getClassSessionById(
        result.classSessionId,
      );
      assert.strictEqual(createdCs.classId, targetClass.id);
      assert.strictEqual(
        createdCs.weekNumber,
        targetClass.currentWeekIndex ?? 1,
      );

      const snapshot = await getAttendanceSnapshot({
        classId: targetClass.id,
        date: targetDate,
      });
      assert.strictEqual(snapshot.onLeaveStudents.length >= 1, true);
      assert.ok(snapshot.onLeaveStudents.some((s) => s.id === leaveStu.id));
    });
  });
});
