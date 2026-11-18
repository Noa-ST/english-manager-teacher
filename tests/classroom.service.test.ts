import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

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
} from "@/services/classroom.service";
import { resolveWeekStatus } from "@/services/classroom-data";
import { ConflictError, NotFoundError, ValidationError } from "@/services/errors";
import { resetRuntimeStore, getRuntimeStore } from "@/services/runtime-store";

describe("Classroom Service — Quản lý Lớp học & Khung chương trình", () => {
  beforeEach(() => {
    resetRuntimeStore();
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
      const store = getRuntimeStore();
      const realCount = store.students.filter(
        (s) => s.classId === first.id && s.status !== "archived" && !s.deletedAt,
      ).length;
      assert.strictEqual(first.enrolled, realCount);
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

    it("4.5. Tự động đồng bộ mã lớp, tên lớp, trình độ sang học sinh & nhật ký buổi học khi cập nhật", async () => {
      const updated = await updateClassroom("cls-ii-01", {
        code: "II-01-PRO",
        name: "IELTS Intensive Pro",
        level: "C1+",
      });
      assert.strictEqual(updated.code, "II-01-PRO");

      const store = getRuntimeStore();
      const linkedStudents = store.students.filter((s) => s.classId === "cls-ii-01");
      assert.ok(linkedStudents.length > 0);
      assert.ok(linkedStudents.every((s) => s.className === "IELTS Intensive Pro" && s.level === "C1+"));

      const linkedSessions = store.classSessions.filter((cs) => cs.classId === "cls-ii-01");
      if (linkedSessions.length > 0) {
        assert.ok(
          linkedSessions.every(
            (cs) => cs.classCode === "II-01-PRO" && cs.className === "IELTS Intensive Pro",
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
      const store = getRuntimeStore();
      const targetClassId = "cls-ii-01";
      const beforeClasses = await listClassrooms();
      const beforeClass = beforeClasses.find((c) => c.id === targetClassId)!;
      const initialEnrolled = beforeClass.enrolled;

      // Find an active student in this class and archive them
      const studentIdx = store.students.findIndex(
        (s) => s.classId === targetClassId && s.status !== "archived",
      );
      assert.ok(studentIdx !== -1, "Phải có học sinh trong lớp để test");
      store.students[studentIdx].status = "archived";

      // Re-query classrooms
      const afterClasses = await listClassrooms();
      const afterClass = afterClasses.find((c) => c.id === targetClassId)!;
      assert.strictEqual(afterClass.enrolled, initialEnrolled - 1);
    });

    it("6.2. Sau khi tất cả học sinh được chuyển hoặc lưu trữ, lớp có thể được lưu trữ thành công", async () => {
      const store = getRuntimeStore();
      // Create a new class with 1 student
      const newClass = await createClassroom({
        code: "SOLO-01",
        name: "Solo Class",
        capacity: 10,
        scheduleSummary: "Thứ 4 · 18:00",
        room: "Phòng 201",
        currentModule: "Module 1",
      });

      // Add a student to this class in store
      store.students.push({
        id: "stu-solo-01",
        code: "HS-SOLO-01",
        fullName: "Học Viên Thử Nghiệm",
        classId: newClass.id,
        className: newClass.name,
        level: "B2",
        joinedAt: "2026-11-01",
        attendanceRate: 100,
        averageScore: 8.0,
        targetGoal: "IELTS 7.5",
        tuitionStatus: "paid",
        tuitionPeriod: "Tháng 11",
        tuitionAmount: "5.000.000 ₫",
        parentRelation: "Phụ huynh",
        parentContactMasked: "0901 ••• 999",
        status: "active",
        recentComment: "Học tốt",
        grades: [],
        attendanceHistory: [],
      });

      // Verify cannot archive yet
      await assert.rejects(
        () => archiveClassroom(newClass.id),
        (err: unknown) => err instanceof ValidationError,
      );

      // Archive the student
      const stu = store.students.find((s) => s.id === "stu-solo-01")!;
      stu.status = "archived";

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

    it("7.8. resolveWeekStatus tính toán chính xác trạng thái tuần kế thừa khi chưa set explicit", () => {
      const weekPast = { weekNumber: 1, title: "Tuần cũ" };
      const weekCurrent = { weekNumber: 3, title: "Tuần hiện tại" };
      const weekFuture = { weekNumber: 5, title: "Tuần tương lai" };
      const weekExplicit = { weekNumber: 1, title: "Tuần cũ nhưng hoãn", status: "postponed" as const };

      assert.strictEqual(resolveWeekStatus(weekPast, 3), "completed");
      assert.strictEqual(resolveWeekStatus(weekCurrent, 3), "in-progress");
      assert.strictEqual(resolveWeekStatus(weekFuture, 3), "not-started");
      // Explicit status overrides position
      assert.strictEqual(resolveWeekStatus(weekExplicit, 3), "postponed");
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

      const store = getRuntimeStore();
      // Giả lập 1 học sinh chưa đóng học phí ở lớp này
      store.students.push({
        id: "stu-fee-test",
        code: "HS-FEE-01",
        fullName: "Trần Học Phí",
        classId: cls.id,
        className: cls.name,
        level: "B1",
        joinedAt: "2026-11-01",
        targetGoal: "IELTS 6.5",
        status: "active",
        tuitionStatus: "due-soon",
        tuitionPeriod: "Học kỳ II (Hạn 20/11/2026)",
        tuitionAmount: "7.500.000 ₫",
        parentRelation: "Mẹ",
        parentContactMasked: "090 •••• 123",
        recentComment: "Tiến bộ tốt",
        attendanceRate: 100,
        averageScore: 7.0,
        grades: [],
        attendanceHistory: [],
      });

      // Cập nhật hạn học phí đến tương lai (2026-11-28 > 2026-11-18)
      await updateClassroom(cls.id, {
        tuitionDueDate: "2026-11-28",
      });

      const updatedStore1 = getRuntimeStore();
      const stu1 = updatedStore1.students.find((s) => s.id === "stu-fee-test");
      assert.strictEqual(stu1?.tuitionStatus, "due-soon");
      assert.strictEqual(stu1?.tuitionPeriod, "Học kỳ II (Hạn 28/11/2026)");

      // Cập nhật hạn học phí quá hạn (2026-11-10 < 2026-11-18)
      await updateClassroom(cls.id, {
        tuitionDueDate: "2026-11-10",
      });

      const updatedStore2 = getRuntimeStore();
      const stu2 = updatedStore2.students.find((s) => s.id === "stu-fee-test");
      assert.strictEqual(stu2?.tuitionStatus, "overdue");
      assert.strictEqual(stu2?.tuitionPeriod, "Học kỳ II (Quá hạn từ 10/11/2026)");
    });
  });
});
