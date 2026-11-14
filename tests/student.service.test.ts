import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/services/errors";
import { getRuntimeStore, resetRuntimeStore } from "@/services/runtime-store";
import * as studentService from "@/services/student.service";

describe("Student Service — Quản lý Hồ sơ Học sinh", () => {
  beforeEach(() => {
    resetRuntimeStore();
  });

  // =========================================================================
  // SUITE 1: TÌM KIẾM TIẾNG VIỆT, BỘ LỌC, SẮP XẾP & PHÂN TRANG
  // =========================================================================
  describe("1. Tra cứu, Tìm kiếm tiếng Việt & Bộ lọc (List, Search & Filter)", () => {
    it("1.1. Tìm kiếm không dấu: 'bao' tìm ra học sinh 'Trần Bảo Ngọc'", async () => {
      const res = await studentService.listStudents({ search: "bao" });
      assert.strictEqual(res.total, 1);
      assert.strictEqual(res.items[0].fullName, "Trần Bảo Ngọc");
      assert.strictEqual(res.items[0].code, "HS-2026-01");
    });

    it("1.2. Tìm kiếm không dấu: 'bao ngoc' hoặc 'tran bao ngoc' tìm chính xác", async () => {
      const res1 = await studentService.listStudents({ search: "bao ngoc" });
      assert.strictEqual(res1.total, 1);
      assert.strictEqual(res1.items[0].fullName, "Trần Bảo Ngọc");

      const res2 = await studentService.listStudents({ search: "tran bao ngoc" });
      assert.strictEqual(res2.total, 1);
      assert.strictEqual(res2.items[0].fullName, "Trần Bảo Ngọc");
    });

    it("1.3. Tìm kiếm không dấu với các học sinh khác: 'duc anh', 'dang quoc huy', 'khoi'", async () => {
      const resDucAnh = await studentService.listStudents({ search: "duc anh" });
      assert.strictEqual(resDucAnh.total, 1);
      assert.strictEqual(resDucAnh.items[0].fullName, "Nguyễn Đức Anh");

      const resHuy = await studentService.listStudents({ search: "dang quoc huy" });
      assert.strictEqual(resHuy.total, 1);
      assert.strictEqual(resHuy.items[0].fullName, "Đặng Quốc Huy");

      const resKhoi = await studentService.listStudents({ search: "khoi" });
      assert.strictEqual(resKhoi.total, 1);
      assert.strictEqual(resKhoi.items[0].fullName, "Lê Hoàng Minh Khôi");
    });

    it("1.4. Tìm kiếm có dấu đầy đủ: 'Bảo Ngọc', 'Vũ Thanh Trúc'", async () => {
      const res1 = await studentService.listStudents({ search: "Bảo Ngọc" });
      assert.strictEqual(res1.total, 1);
      assert.strictEqual(res1.items[0].fullName, "Trần Bảo Ngọc");

      const res2 = await studentService.listStudents({ search: "Vũ Thanh Trúc" });
      assert.strictEqual(res2.total, 1);
      assert.strictEqual(res2.items[0].fullName, "Vũ Thanh Trúc");
    });

    it("1.5. Tìm kiếm theo mã học sinh không phân biệt hoa thường ('hs-2026-02')", async () => {
      const res = await studentService.listStudents({ search: "hs-2026-02" });
      assert.strictEqual(res.total, 1);
      assert.strictEqual(res.items[0].code, "HS-2026-02");
      assert.strictEqual(res.items[0].fullName, "Lê Hoàng Minh Khôi");
    });

    it("1.6. Tìm kiếm theo tên lớp học không dấu ('ielts foundation' và 'junior academic')", async () => {
      const resFoundation = await studentService.listStudents({ search: "ielts foundation" });
      assert.strictEqual(resFoundation.total, 2);
      const foundationNames = resFoundation.items.map((s) => s.fullName);
      assert.ok(foundationNames.includes("Phạm Hà Phương"));
      assert.ok(foundationNames.includes("Đặng Quốc Huy"));

      const resJunior = await studentService.listStudents({ search: "junior academic" });
      assert.strictEqual(resJunior.total, 1);
      assert.strictEqual(resJunior.items[0].fullName, "Vũ Thanh Trúc");
    });

    it("1.7. Lọc theo lớp học (classId)", async () => {
      const resClass = await studentService.listStudents({ classId: "cls-ii-01" });
      assert.strictEqual(resClass.total, 2);
      const codes = resClass.items.map((s) => s.code);
      assert.ok(codes.includes("HS-2026-01"));
      assert.ok(codes.includes("HS-2026-04"));

      const resAll = await studentService.listStudents({ classId: "all" });
      assert.strictEqual(resAll.total, 6);
    });

    it("1.8. Lọc theo trạng thái học phí (tuitionStatus)", async () => {
      const resPaid = await studentService.listStudents({ tuitionStatus: "paid" });
      assert.strictEqual(resPaid.total, 4);
      assert.ok(resPaid.items.every((s) => s.tuitionStatus === "paid"));

      const resDueSoon = await studentService.listStudents({ tuitionStatus: "due-soon" });
      assert.strictEqual(resDueSoon.total, 1);
      assert.strictEqual(resDueSoon.items[0].code, "HS-2026-03");

      const resOverdue = await studentService.listStudents({ tuitionStatus: "overdue" });
      assert.strictEqual(resOverdue.total, 1);
      assert.strictEqual(resOverdue.items[0].code, "HS-2026-06");
    });

    it("1.9. Sắp xếp danh sách (sortBy: score, attendance, name)", async () => {
      // Mặc định: theo điểm TB giảm dần
      const resScore = await studentService.listStudents({ sortBy: "score" });
      for (let i = 0; i < resScore.items.length - 1; i++) {
        assert.ok(resScore.items[i].averageScore >= resScore.items[i + 1].averageScore);
      }

      // Theo chuyên cần giảm dần
      const resAttendance = await studentService.listStudents({ sortBy: "attendance" });
      for (let i = 0; i < resAttendance.items.length - 1; i++) {
        assert.ok(
          resAttendance.items[i].attendanceRate >= resAttendance.items[i + 1].attendanceRate,
        );
      }

      // Theo tên học sinh (tiếng Việt a-z)
      const resName = await studentService.listStudents({ sortBy: "name" });
      for (let i = 0; i < resName.items.length - 1; i++) {
        assert.ok(
          resName.items[i].fullName.localeCompare(resName.items[i + 1].fullName, "vi") <= 0,
        );
      }
    });

    it("1.10. Phân trang kết quả (page, pageSize, total)", async () => {
      const page1 = await studentService.listStudents({ page: 1, pageSize: 2 });
      assert.strictEqual(page1.items.length, 2);
      assert.strictEqual(page1.page, 1);
      assert.strictEqual(page1.pageSize, 2);
      assert.strictEqual(page1.total, 6);

      const page2 = await studentService.listStudents({ page: 2, pageSize: 2 });
      assert.strictEqual(page2.items.length, 2);
      assert.strictEqual(page2.page, 2);
      assert.notStrictEqual(page1.items[0].id, page2.items[0].id);

      const pageOut = await studentService.listStudents({ page: 10, pageSize: 2 });
      assert.strictEqual(pageOut.items.length, 0);
      assert.strictEqual(pageOut.total, 6);
    });
  });

  // =========================================================================
  // SUITE 2: THÊM MỚI HỌC SINH (CREATE STUDENT & BUSINESS INVARIANTS)
  // =========================================================================
  describe("2. Thêm mới học sinh & Ràng buộc nghiệp vụ (Create Student)", () => {
    it("2.1. Học sinh mới tạo phải có averageScore=0, attendanceRate=0, grades=[], attendanceHistory=[]", async () => {
      const newStudent = await studentService.createStudent({
        code: "hs-2026-99",
        fullName: "Nguyễn Tuấn Khang",
        classId: "cls-ii-01",
        targetGoal: "IELTS 7.0",
      });

      // Kiểm tra tính toàn vẹn trạng thái khởi tạo
      assert.strictEqual(newStudent.code, "HS-2026-99", "Mã học sinh phải tự động in hoa");
      assert.strictEqual(newStudent.fullName, "Nguyễn Tuấn Khang");
      assert.strictEqual(newStudent.averageScore, 0, "Điểm TB mới tạo phải là 0");
      assert.strictEqual(newStudent.attendanceRate, 0, "Chuyên cần mới tạo phải là 0%");
      assert.deepStrictEqual(newStudent.grades, [], "Danh sách điểm phải là mảng rỗng");
      assert.deepStrictEqual(
        newStudent.attendanceHistory,
        [],
        "Lịch sử điểm danh phải là mảng rỗng",
      );
      assert.strictEqual(newStudent.status, "active");
      assert.strictEqual(
        newStudent.tuitionStatus,
        "due-soon",
        "Mặc định trạng thái học phí là due-soon",
      );
      assert.strictEqual(newStudent.recentComment, "Học viên mới nhập học.");
    });

    it("2.2. Tăng số lượng enrolled của lớp học khi thêm học sinh mới", async () => {
      const store = getRuntimeStore();
      const targetClass = store.classrooms.find((c) => c.id === "cls-ii-01")!;
      const previousEnrolled = targetClass.enrolled;

      await studentService.createStudent({
        code: "HS-2026-88",
        fullName: "Trần Minh Thư",
        classId: "cls-ii-01",
      });

      assert.strictEqual(targetClass.enrolled, previousEnrolled + 1);
    });

    it("2.3. Chặn trùng mã học sinh và ném ConflictError", async () => {
      // Thử tạo trùng mã "HS-2026-01" đã có sẵn của Trần Bảo Ngọc
      await assert.rejects(
        async () => {
          await studentService.createStudent({
            code: "HS-2026-01",
            fullName: "Học sinh Giả mạo",
            classId: "cls-ii-01",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictError);
          assert.match((err as ConflictError).message, /đã tồn tại/i);
          return true;
        },
      );

      // Thử tạo trùng mã viết thường "hs-2026-01"
      await assert.rejects(
        async () => {
          await studentService.createStudent({
            code: "hs-2026-01",
            fullName: "Học sinh Giả mạo Thường",
            classId: "cls-ii-01",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictError);
          return true;
        },
      );
    });

    it("2.4. Validate lỗi đầu vào khi thiếu mã hoặc tên học sinh (ValidationError)", async () => {
      // Thiếu code
      await assert.rejects(
        async () => {
          await studentService.createStudent({
            code: "",
            fullName: "Thiếu mã",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          return true;
        },
      );

      // Thiếu fullName
      await assert.rejects(
        async () => {
          await studentService.createStudent({
            code: "HS-TEST-01",
            fullName: "",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          return true;
        },
      );

      // Sai tuitionStatus
      await assert.rejects(
        async () => {
          await studentService.createStudent({
            code: "HS-TEST-02",
            fullName: "Sai học phí",
            tuitionStatus: "invalid-status" as unknown as "paid",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          return true;
        },
      );
    });
  });

  // =========================================================================
  // SUITE 3: XEM CHI TIẾT & CẬP NHẬT (GET BY ID & UPDATE)
  // =========================================================================
  describe("3. Xem chi tiết & Cập nhật học sinh (Get by ID & Update)", () => {
    it("3.1. Tìm kiếm học sinh theo ID ('stu-01')", async () => {
      const student = await studentService.getStudentById("stu-01");
      assert.strictEqual(student.id, "stu-01");
      assert.strictEqual(student.fullName, "Trần Bảo Ngọc");
    });

    it("3.2. Tìm kiếm học sinh theo mã định danh ('HS-2026-01' và 'hs-2026-01')", async () => {
      const studentUpper = await studentService.getStudentById("HS-2026-01");
      assert.strictEqual(studentUpper.id, "stu-01");

      const studentLower = await studentService.getStudentById("hs-2026-01");
      assert.strictEqual(studentLower.id, "stu-01");
    });

    it("3.3. Ném NotFoundError khi tìm học sinh không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await studentService.getStudentById("stu-nonexistent");
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundError);
          assert.match((err as NotFoundError).message, /not found/i);
          return true;
        },
      );
    });

    it("3.4. Cập nhật thông tin học sinh và tự động in hoa mã học sinh mới", async () => {
      const updated = await studentService.updateStudent("stu-01", {
        code: "hs-2026-01-new",
        fullName: "Trần Bảo Ngọc (Cập nhật)",
        targetGoal: "IELTS 8.5",
        tuitionStatus: "paid",
        recentComment: "Tiến bộ vượt bậc sau kỳ thi thử.",
      });

      assert.strictEqual(updated.code, "HS-2026-01-NEW");
      assert.strictEqual(updated.fullName, "Trần Bảo Ngọc (Cập nhật)");
      assert.strictEqual(updated.targetGoal, "IELTS 8.5");
      assert.strictEqual(updated.recentComment, "Tiến bộ vượt bậc sau kỳ thi thử.");
    });

    it("3.5. Chuyển lớp học sinh khi cập nhật classId", async () => {
      const updated = await studentService.updateStudent("stu-01", {
        classId: "cls-aw-02",
      });

      assert.strictEqual(updated.classId, "cls-aw-02");
      assert.strictEqual(
        updated.className,
        "Academic Writing & Critical Thinking",
      );
    });

    it("3.6. Ném NotFoundError khi cập nhật học sinh không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await studentService.updateStudent("stu-unknown", {
            fullName: "Không tồn tại",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundError);
          return true;
        },
      );
    });
  });

  // =========================================================================
  // SUITE 4: LƯU TRỮ MỀM (SOFT DELETE / ARCHIVE) & KHÔI PHỤC (RESTORE)
  // =========================================================================
  describe("4. Lưu trữ mềm (Archive / Soft Delete) & Khôi phục (Restore)", () => {
    it("4.1. Lưu trữ mềm: cập nhật status='archived', có deletedAt, giảm sĩ số lớp, giữ nguyên grades", async () => {
      const store = getRuntimeStore();
      const student = store.students.find((s) => s.id === "stu-01")!;
      const originalGradesCount = student.grades.length;
      const targetClass = store.classrooms.find((c) => c.id === student.classId)!;
      const previousEnrolled = targetClass.enrolled;

      const archived = await studentService.archiveStudent("stu-01");

      assert.strictEqual(archived.status, "archived");
      assert.ok(archived.deletedAt, "deletedAt phải được gán ISO string");
      assert.strictEqual(
        archived.grades.length,
        originalGradesCount,
        "Lịch sử điểm phải được giữ nguyên vẹn",
      );
      assert.strictEqual(
        targetClass.enrolled,
        previousEnrolled - 1,
        "Sĩ số lớp phải giảm 1",
      );
    });

    it("4.2. deleteStudent hoạt động như archiveStudent (soft delete)", async () => {
      await studentService.deleteStudent("stu-02");
      const stu2 = await studentService.getStudentById("stu-02");
      assert.strictEqual(stu2.status, "archived");
      assert.ok(stu2.deletedAt);
    });

    it("4.3. Lọc danh sách theo trạng thái: active loại trừ archived, archived chỉ lấy archived, all lấy cả hai", async () => {
      // Lưu trữ 1 học sinh
      await studentService.archiveStudent("stu-01");

      // Mặc định (status="active"): không có học sinh đã lưu trữ
      const activeList = await studentService.listStudents({});
      assert.strictEqual(activeList.total, 5);
      assert.ok(activeList.items.every((s) => s.status !== "archived"));

      // status="archived": chỉ có học sinh đã lưu trữ
      const archivedList = await studentService.listStudents({ status: "archived" });
      assert.strictEqual(archivedList.total, 1);
      assert.strictEqual(archivedList.items[0].id, "stu-01");

      // status="all": gồm cả đang học và lưu trữ
      const allList = await studentService.listStudents({ status: "all" });
      assert.strictEqual(allList.total, 6);
    });

    it("4.4. Khôi phục học sinh đã lưu trữ: status='active', deletedAt=null, tăng lại sĩ số lớp", async () => {
      const store = getRuntimeStore();
      const student = store.students.find((s) => s.id === "stu-01")!;
      const targetClass = store.classrooms.find((c) => c.id === student.classId)!;

      // Lưu trữ trước
      await studentService.archiveStudent("stu-01");
      const enrolledAfterArchive = targetClass.enrolled;

      // Khôi phục
      const restored = await studentService.restoreStudent("stu-01");
      assert.strictEqual(restored.status, "active");
      assert.strictEqual(restored.deletedAt, null);
      assert.strictEqual(targetClass.enrolled, enrolledAfterArchive + 1);

      // Kiểm tra lại trong danh sách active
      const activeList = await studentService.listStudents({ status: "active" });
      assert.ok(activeList.items.some((s) => s.id === "stu-01"));
    });

    it("4.5. Ném NotFoundError khi lưu trữ hoặc khôi phục học sinh không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await studentService.archiveStudent("nonexistent-id");
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundError);
          return true;
        },
      );

      await assert.rejects(
        async () => {
          await studentService.restoreStudent("nonexistent-id");
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundError);
          return true;
        },
      );
    });
  });

  // =========================================================================
  // SUITE 5: NHẬP ĐIỂM & TÍNH ĐIỂM IELTS 4 KỸ NĂNG (GRADES & ASSESSMENTS)
  // =========================================================================
  describe("5. Nhập điểm & Đánh giá định kỳ (Grades & Assessments)", () => {
    it("5.1. Nhập điểm tính Overall chuẩn IELTS làm tròn bước 0.5 (L8, R8.5, W7, S7 -> 7.5)", async () => {
      // (8 + 8.5 + 7 + 7) / 4 = 7.625 -> làm tròn đến 0.5 gần nhất = 7.5
      const updated = await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Mock Test Q4",
        listening: 8,
        reading: 8.5,
        writing: 7,
        speaking: 7,
        comment: "Kỹ năng nghe đọc tiến bộ rõ rệt.",
      });

      assert.strictEqual(updated.averageScore, 7.5);
      assert.strictEqual(updated.recentComment, "Kỹ năng nghe đọc tiến bộ rõ rệt.");

      const newGrade = updated.grades.find((g) => g.assessmentTitle === "Mock Test Q4")!;
      assert.ok(newGrade);
      assert.strictEqual(newGrade.overall, 7.5);
      assert.strictEqual(newGrade.listening, 8);
      assert.strictEqual(newGrade.reading, 8.5);
    });

    it("5.2. Cập nhật điểm bài thi đã tồn tại (không tạo bản ghi duplicate)", async () => {
      const studentBefore = await studentService.getStudentById("stu-01");
      const initialCount = studentBefore.grades.length;
      const existingTitle = studentBefore.grades[0].assessmentTitle;

      // Cập nhật lại bài thi đầu tiên
      const updated = await studentService.recordGrade({
        studentId: "stu-01",
        assessmentTitle: existingTitle,
        listening: 9.0,
        reading: 9.0,
        writing: 8.0,
        speaking: 8.0,
        comment: "Cập nhật điểm phúc khảo.",
      });

      assert.strictEqual(updated.grades.length, initialCount);
      assert.strictEqual(updated.averageScore, 8.5); // (9+9+8+8)/4 = 8.5
      assert.strictEqual(updated.recentComment, "Cập nhật điểm phúc khảo.");
    });

    it("5.3. Ném NotFoundError khi nhập điểm cho học sinh không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await studentService.recordGrade({
            studentId: "stu-ghost",
            assessmentTitle: "Test",
            listening: 7,
            reading: 7,
            writing: 7,
            speaking: 7,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof NotFoundError);
          return true;
        },
      );
    });

    it("5.4. Nhập điểm đồng loạt cho nhiều học sinh (batchRecordGrades)", async () => {
      const res = await studentService.batchRecordGrades({
        assessmentTitle: "Kiểm tra Chung Giữa kỳ",
        entries: [
          {
            studentId: "stu-01",
            listening: 8.0,
            reading: 8.0,
            writing: 7.5,
            speaking: 7.5,
            comment: "Tốt",
          },
          {
            studentId: "stu-02",
            listening: 7.0,
            reading: 7.0,
            writing: 6.5,
            speaking: 6.5,
            comment: "Khá",
          },
        ],
      });

      assert.strictEqual(res.updatedCount, 2);

      const stu1 = await studentService.getStudentById("stu-01");
      const stu2 = await studentService.getStudentById("stu-02");
      assert.strictEqual(stu1.averageScore, 8); // (8+8+7.5+7.5)/4 = 7.75 -> round(15.5)/2 = 8
      assert.strictEqual(stu2.averageScore, 7); // (7+7+6.5+6.5)/4 = 6.75 -> round(13.5)/2 = 7
    });

    it("5.5. Quản lý danh mục bài kiểm tra (listAssessments & createAssessment)", async () => {
      const initial = await studentService.listAssessments();
      assert.ok(initial.length >= 3);

      const updated = await studentService.createAssessment({
        title: "Kỳ thi Đánh giá Năng lực Q1 2027",
      });
      assert.ok(updated.includes("Kỳ thi Đánh giá Năng lực Q1 2027"));

      // Thêm lại cùng tên không bị trùng
      const updated2 = await studentService.createAssessment({
        title: "Kỳ thi Đánh giá Năng lực Q1 2027",
      });
      assert.strictEqual(
        updated2.filter((t) => t === "Kỳ thi Đánh giá Năng lực Q1 2027").length,
        1,
      );
    });
  });

  // =========================================================================
  // SUITE 6: CỔNG TRA CỨU CÁ NHÂN (STUDENT PORTAL VERIFICATION)
  // =========================================================================
  describe("6. Xác thực Cổng Tra cứu Cá nhân (Student Portal Verification)", () => {
    it("6.1. Xác thực thành công với mã học sinh in hoa và PIN mặc định (123456)", async () => {
      const student = await studentService.verifyStudentPortal({
        studentCode: "HS-2026-01",
        accessKey: "123456",
      });
      assert.strictEqual(student.code, "HS-2026-01");
      assert.strictEqual(student.fullName, "Trần Bảo Ngọc");
    });

    it("6.2. Xác thực thành công khi học sinh nhập mã chữ thường ('hs-2026-01')", async () => {
      const student = await studentService.verifyStudentPortal({
        studentCode: "hs-2026-01",
        accessKey: "123456",
      });
      assert.strictEqual(student.code, "HS-2026-01");
      assert.strictEqual(student.fullName, "Trần Bảo Ngọc");
    });

    it("6.3. Xác thực thành công với key dự phòng 'HS2026'", async () => {
      const student = await studentService.verifyStudentPortal({
        studentCode: "HS-2026-01",
        accessKey: "HS2026",
      });
      assert.strictEqual(student.code, "HS-2026-01");
    });

    it("6.4. Từ chối xác thực khi nhập sai mật khẩu tra cứu (UnauthorizedError)", async () => {
      await assert.rejects(
        async () => {
          await studentService.verifyStudentPortal({
            studentCode: "HS-2026-01",
            accessKey: "wrong-password-999",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof UnauthorizedError);
          assert.match((err as UnauthorizedError).message, /không chính xác/i);
          return true;
        },
      );
    });

    it("6.5. Từ chối xác thực khi mã học sinh không tồn tại (UnauthorizedError)", async () => {
      await assert.rejects(
        async () => {
          await studentService.verifyStudentPortal({
            studentCode: "HS-2099-99",
            accessKey: "123456",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof UnauthorizedError);
          assert.match((err as UnauthorizedError).message, /không tìm thấy hồ sơ/i);
          return true;
        },
      );
    });
  });
});
