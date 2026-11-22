import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { canAccessStudent } from "@/lib/rbac";
import { resetServerEnvCache } from "@/lib/env";
import {
  createStudentPortalToken,
  verifyStudentPortalToken,
} from "@/lib/student-token";
import {
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "@/services/errors";
import {
  assertNotRateLimited,
  clearAllMemoryRateLimits,
  registerFailedAttempt,
  resetRateLimit,
} from "@/services/rate-limit.service";
import * as classroomService from "@/services/classroom.service";
import { ADMIN_STUDENTS_DATA } from "@/services/classroom-data";
import * as settingsService from "@/services/settings.service";
import {
  buildGradeParentReport,
  buildGradesCsv,
  computeAssessmentSkillAverages,
} from "@/services/grade-helpers";
import * as studentService from "@/services/student.service";
import {
  DEFAULT_ALERT_SETTINGS,
  getStudentAcademicAlerts,
  parseTargetBand,
} from "@/services/academic-alert.service";
import { computeStudentSkillProfile } from "@/services/student-helpers";
import { parseStudentImportCsv } from "@/services/student-import";
import { CLASSROOMS_DATA } from "@/services/classroom-data";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

function applyTestEnv() {
  (process.env as Record<string, string>).NODE_ENV = "test";
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgresql://postgres:123456@localhost:5432/english_manager?schema=public";
  }
  process.env.AUTH_SECRET =
    "test-only-auth-secret-with-at-least-32-characters-long";
  process.env.ADMIN_EMAIL = "teacher@example.com";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  process.env.SUPABASE_SECRET_KEY = "test-service-key";
  resetServerEnvCache();
}

describe("Student Service — Pure Helpers, Security & RBAC (Offline)", () => {
  beforeEach(() => {
    applyTestEnv();
    clearAllMemoryRateLimits();
  });

  describe("7. An ninh Cổng Tra cứu, Token & Giới hạn Tần suất (Rate Limiting)", () => {
    it("7.1. Tạo signed JWT token với đầy đủ sub, code, role='student' và thời hạn 2h", async () => {
      const token = await createStudentPortalToken({
        studentId: "stu-01",
        studentCode: "HS-2026-01",
      });

      assert.ok(typeof token === "string");
      assert.ok(token.split(".").length === 3, "JWT token phải có 3 phần header.payload.signature");
    });

    it("7.2. Token hợp lệ giải mã thành công đúng studentId và studentCode", async () => {
      const token = await createStudentPortalToken({
        studentId: "stu-01",
        studentCode: "HS-2026-01",
      });

      const verified = await verifyStudentPortalToken(token);
      assert.ok(verified !== null);
      assert.strictEqual(verified.studentId, "stu-01");
      assert.strictEqual(verified.studentCode, "HS-2026-01");
    });

    it("7.3. Token giả mạo hoặc sai chữ ký bị từ chối hoàn toàn (trả về null)", async () => {
      const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature";
      const verified = await verifyStudentPortalToken(fakeToken);
      assert.strictEqual(verified, null);
    });

    it("7.4. Rate limiting: Thử sai 5 lần liên tiếp sẽ kích hoạt khóa tạm thời (TooManyRequestsError)", async () => {
      const testIdentifier = "ip:192.168.1.50";

      // Thử sai 4 lần -> chưa bị khóa
      for (let i = 0; i < 4; i++) {
        await registerFailedAttempt(testIdentifier);
      }
      // Vẫn pass kiểm tra
      await assertNotRateLimited(testIdentifier);

      // Thử sai lần thứ 5 -> kích hoạt khóa
      await registerFailedAttempt(testIdentifier);

      // Kiểm tra ném TooManyRequestsError
      await assert.rejects(
        async () => {
          await assertNotRateLimited(testIdentifier);
        },
        (err: unknown) => {
          assert.ok(err instanceof TooManyRequestsError);
          assert.match((err as TooManyRequestsError).message, /quá 5 lần liên tiếp/i);
          return true;
        },
      );
    });

    it("7.5. Rate limiting: Khi nhập đúng, bộ đếm thất bại được reset thành công", async () => {
      const testIdentifier = "code:HS-2026-01";

      // Thử sai 3 lần
      for (let i = 0; i < 3; i++) {
        await registerFailedAttempt(testIdentifier);
      }

      // Reset sau khi nhập đúng
      await resetRateLimit(testIdentifier);

      // Đếm lại từ đầu: 4 lần nữa vẫn không bị khóa
      for (let i = 0; i < 4; i++) {
        await registerFailedAttempt(testIdentifier);
      }
      await assertNotRateLimited(testIdentifier);
    });
  });

  describe("9. Phân quyền RBAC & Phòng chống IDOR", () => {
    it("9.1. Học sinh chỉ được phép truy cập hồ sơ của chính mình", async () => {
      const studentProfile = {
        id: "usr-student-01",
        email: "student@example.com",
        fullName: "Trần Bảo Ngọc",
        avatarUrl: null,
        role: "student" as const,
        isActive: true,
        studentId: "stu-01",
        studentCode: "HS-2026-01",
      };

      // Cho phép khi tra cứu mã hoặc ID của chính mình
      const canAccessOwnCode = await canAccessStudent("HS-2026-01", studentProfile);
      const canAccessOwnId = await canAccessStudent("stu-01", studentProfile);
      assert.strictEqual(canAccessOwnCode, true);
      assert.strictEqual(canAccessOwnId, true);
    });

    it("9.2. Học sinh cố tình đổi ID/mã để xem hồ sơ của học sinh khác bị chặn đứng (chống IDOR)", async () => {
      const studentProfile = {
        id: "usr-student-01",
        email: "student@example.com",
        fullName: "Trần Bảo Ngọc",
        avatarUrl: null,
        role: "student" as const,
        isActive: true,
        studentId: "stu-01",
        studentCode: "HS-2026-01",
      };

      // Cố tình xem HS-2026-02 hoặc stu-02
      const canAccessOtherCode = await canAccessStudent("HS-2026-02", studentProfile);
      const canAccessOtherId = await canAccessStudent("stu-02", studentProfile);
      assert.strictEqual(canAccessOtherCode, false);
      assert.strictEqual(canAccessOtherId, false);
    });

    it("9.3. Admin được phép truy cập toàn quyền mọi hồ sơ học sinh", async () => {
      const adminProfile = {
        id: "usr-admin-01",
        email: "teacher@example.com",
        fullName: "ThS. Nguyễn Minh Anh",
        avatarUrl: null,
        role: "admin" as const,
        isActive: true,
        studentId: null,
        studentCode: null,
      };

      assert.strictEqual(await canAccessStudent("HS-2026-01", adminProfile), true);
      assert.strictEqual(await canAccessStudent("HS-2026-02", adminProfile), true);
      assert.strictEqual(await canAccessStudent("stu-unknown", adminProfile), true);
    });

    it("9.4. Tài khoản bị vô hiệu hóa (isActive: false) bị từ chối truy cập", async () => {
      const disabledProfile = {
        id: "usr-student-disabled",
        email: "disabled@example.com",
        fullName: "Học sinh Tạm khóa",
        avatarUrl: null,
        role: "student" as const,
        isActive: false,
        studentId: "stu-01",
        studentCode: "HS-2026-01",
      };

      assert.strictEqual(await canAccessStudent("HS-2026-01", disabledProfile), false);
    });
  });

  describe("11/13. Pure Helpers — Target Band, Alerts, Sanitization & Skill Profile", () => {
    it("11.1. Trích xuất đúng band điểm mục tiêu từ các dạng chuỗi targetGoal", () => {
      assert.strictEqual(parseTargetBand("IELTS 8.0 (Du học Úc)"), 8.0);
      assert.strictEqual(parseTargetBand("IELTS 7.5 Overall"), 7.5);
      assert.strictEqual(parseTargetBand("Writing 7.5+ & Học bổng"), 7.5);
      assert.strictEqual(parseTargetBand("Đạt tối thiểu 5 điểm kỳ thi tốt nghiệp"), 5.0);
      assert.strictEqual(parseTargetBand("Mục tiêu: 6.5"), 6.5);
    });

    it("11.6. Nhận diện cảnh báo điểm TB giảm liên tiếp khi bài thi mới nhất thấp hơn bài trước", () => {
      const studentWithDrop = {
        id: "stu-test-drop",
        code: "HS-DROP",
        fullName: "Học sinh Giảm Điểm",
        classId: "cls-ii-01",
        className: "IELTS Intensive",
        level: "B2",
        joinedAt: "01/08/2026",
        attendanceRate: 95,
        averageScore: 6.5,
        targetGoal: "IELTS 7.0",
        tuitionStatus: "paid" as const,
        tuitionPeriod: "",
        tuitionAmount: "",
        parentRelation: "",
        parentContactMasked: "",
        status: "active" as const,
        recentComment: "",
        grades: [
          {
            id: "g1",
            assessmentTitle: "Mock Test 1",
            date: "10/10/2026",
            listening: 7.0,
            reading: 7.0,
            writing: 7.0,
            speaking: 7.0,
            overall: 7.0,
            comment: "",
          },
          {
            id: "g2",
            assessmentTitle: "Mock Test 2",
            date: "05/11/2026",
            listening: 6.5,
            reading: 6.5,
            writing: 6.5,
            speaking: 6.5,
            overall: 6.5,
            comment: "",
          },
        ],
        attendanceHistory: [],
      };

      const alerts = getStudentAcademicAlerts(studentWithDrop, DEFAULT_ALERT_SETTINGS);
      const scoreDropAlert = alerts.find((a) => a.type === "score-drop");
      assert.ok(scoreDropAlert, "Học sinh giảm từ 7.0 xuống 6.5 phải có cảnh báo score-drop");
      assert.strictEqual(scoreDropAlert.title, "Tiến độ học tập giảm");
    });

    it("13.2. sanitizeStudentForPortal tước bỏ hoàn toàn ghi chú nội bộ và SĐT/Email phụ huynh", () => {
      const base = structuredClone(ADMIN_STUDENTS_DATA[0]);
      base.portalPinHash = "scrypt:salt:hash";
      base.privateNote = "Ghi chú mật chỉ giáo viên đọc";
      base.parentPhone = "0988777666";
      base.parentEmail = "anhhung@example.com";
      base.parentNote = "Ghi chú riêng gia đình";
      base.parentContactMasked = "0988 ••• 666";
      base.communicationLogs = [
        {
          id: "log-1",
          date: "2026-11-18",
          channel: "zalo",
          category: "academic",
          summary: "Trao đổi riêng với bố",
          loggedBy: "admin",
        },
      ];

      const sanitized = studentService.sanitizeStudentForPortal(base);
      assert.strictEqual(sanitized.portalPinHash, undefined);
      assert.strictEqual(sanitized.privateNote, undefined);
      assert.strictEqual(sanitized.parentPhone, undefined);
      assert.strictEqual(sanitized.parentEmail, undefined);
      assert.strictEqual(sanitized.parentNote, undefined);
      assert.strictEqual(sanitized.communicationLogs, undefined);
      assert.strictEqual(sanitized.parentContactMasked, "0988 ••• 666");
    });

    it("13.3. getStudentAcademicAlerts miễn cảnh báo phù hợp cho trạng thái trial, on-leave và archived", () => {
      const base = structuredClone(ADMIN_STUDENTS_DATA[0]);
      const trialStu = {
        ...base,
        status: "trial" as const,
        tuitionStatus: "overdue" as const,
        grades: [],
      };
      const trialAlerts = getStudentAcademicAlerts(trialStu, DEFAULT_ALERT_SETTINGS);
      assert.strictEqual(
        trialAlerts.some((a) => a.type === "tuition" || a.type === "no-grades"),
        false,
      );

      const leaveStu = {
        ...base,
        status: "on-leave" as const,
        tuitionStatus: "overdue" as const,
        attendanceRate: 50,
        attendanceHistory: [
          { date: "10/11/2026", sessionName: "Buổi 1", status: "absent" as const },
        ],
      };
      const leaveAlerts = getStudentAcademicAlerts(leaveStu, DEFAULT_ALERT_SETTINGS);
      assert.strictEqual(
        leaveAlerts.some((a) => a.type === "tuition" || a.type === "attendance"),
        false,
      );

      const archivedStu = {
        ...base,
        status: "archived" as const,
        deletedAt: "2026-11-18T00:00:00.000Z",
      };
      const archivedAlerts = getStudentAcademicAlerts(archivedStu, DEFAULT_ALERT_SETTINGS);
      assert.strictEqual(archivedAlerts.length, 0);
    });

    it("13.9. computeStudentSkillProfile tính đúng Entry/Current/Target band, delta và điểm mạnh/yếu", () => {
      const stu = ADMIN_STUDENTS_DATA.find((s) => s.id === "stu-04")!; // Reading 9.0, Listening 8.0, Writing 6.5, Speaking 6.5
      const profile = computeStudentSkillProfile(stu);

      assert.strictEqual(profile.hasGrades, true);
      assert.strictEqual(profile.entryBand, 6.0);
      assert.strictEqual(profile.currentBand, 7.5);
      assert.strictEqual(profile.targetBand, 7.5);
      assert.strictEqual(profile.bandDelta, 1.5);
      assert.strictEqual(profile.strongestSkill?.label, "Reading");
      assert.strictEqual(profile.strongestSkill?.score, 9.0);
      assert.strictEqual(profile.weakestSkill?.score, 6.5);
    });

    it("13.10. parseTargetBand không nhận nhầm trình độ CEFR (B1/B2/C1/C2) thành điểm số", () => {
      assert.strictEqual(parseTargetBand("Cambridge B1 Pass with Distinction"), null);
      assert.strictEqual(parseTargetBand("CEFR B2+"), null);
      assert.strictEqual(parseTargetBand("Đạt C1 Academic"), null);
      assert.strictEqual(parseTargetBand("Đạt B2 và IELTS 6.5"), 6.5);
      assert.strictEqual(parseTargetBand("IELTS 3.0–3.5+"), 3.0);
    });

    it("13.11. parseStudentImportCsv đọc chuẩn 16 cột xuất Excel (không nhận nhầm Mã HS thành Họ và tên)", () => {
      const csv =
        "\uFEFF" +
        [
          "Mã học sinh,Họ và tên,Lớp theo học,Trình độ,Tình trạng học vụ,Điểm TB,Chuyên cần (%),Trạng thái học phí,Ngày nộp học phí,Mức học phí,Kỳ học phí,Phụ huynh,SĐT phụ huynh,Mục tiêu đầu ra,Nhận xét của giáo viên,Ngày nhập học",
          "HS-2026-09,Lâm Chấn Khang,IELTS Foundation (Band 5.0–6.0),B1,Đang học,5,0%,Quá hạn,20/12/2026,5.200.000,Học kỳ II,Anh Quốc,945332900,IELTS 6.0,,20/11/2026",
          "HS-2026-08,Bùi Trường Linh,IELTS Foundation (Band 5.0–6.0),B1+,Đang học,6,0%,Sắp đến hạn,20/12/2026,5.200.000,Học kỳ II,Cô Thanh,982774115,IELTS 6.5 (Xét tuyển ĐH),Chăm chỉ,20/11/2026",
        ].join("\r\n");

      const res = parseStudentImportCsv(csv, CLASSROOMS_DATA, ["HS-2026-01"], "2026-11-22");
      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.rows.length, 2);
      assert.strictEqual(res.detectedColumnCount, 14);

      const first = res.rows[0];
      assert.strictEqual(first.code, "HS-2026-09");
      assert.strictEqual(first.fullName, "Lâm Chấn Khang");
      assert.strictEqual(first.status, "active");
      assert.strictEqual(first.tuitionStatus, "overdue");
      assert.strictEqual(first.tuitionDueDate, "2026-12-20");
      assert.strictEqual(first.tuitionAmount, "5.200.000 ₫");
      assert.strictEqual(first.tuitionPeriod, "Học kỳ II");
      assert.strictEqual(first.parentName, "Anh Quốc");
      assert.strictEqual(first.parentPhone, "0945332900");
      assert.strictEqual(first.targetGoal, "IELTS 6.0");
      assert.strictEqual(first.joinedAt, "2026-11-20");
      assert.strictEqual(first.isValid, true);

      const second = res.rows[1];
      assert.strictEqual(second.code, "HS-2026-08");
      assert.strictEqual(second.fullName, "Bùi Trường Linh");
      assert.strictEqual(second.tuitionStatus, "due-soon");
      assert.strictEqual(second.parentPhone, "0982774115");
      assert.strictEqual(second.targetGoal, "IELTS 6.5 (Xét tuyển ĐH)");
      assert.strictEqual(second.recentComment, "Chăm chỉ");
      assert.strictEqual(second.isValid, true);
    });

    it("13.12. parseStudentImportCsv đọc chuẩn file mẫu 6 cột tối giản", () => {
      const csv = [
        "Mã học sinh,Họ và tên,Mã lớp hoặc Tên lớp,Mục tiêu đầu ra,Trạng thái học phí (paid/due-soon/overdue),Nhận xét giáo viên",
        "HS-2026-90,Trần Văn Bình,cls-ii-01,IELTS 7.0 Overall,paid,Học viên mới",
      ].join("\n");

      const res = parseStudentImportCsv(csv, CLASSROOMS_DATA, [], "2026-11-22");
      assert.strictEqual(res.rows.length, 1);
      assert.strictEqual(res.rows[0].code, "HS-2026-90");
      assert.strictEqual(res.rows[0].fullName, "Trần Văn Bình");
      assert.strictEqual(res.rows[0].classId, "cls-ii-01");
      assert.strictEqual(res.rows[0].targetGoal, "IELTS 7.0 Overall");
      assert.strictEqual(res.rows[0].tuitionStatus, "paid");
      assert.strictEqual(res.rows[0].recentComment, "Học viên mới");
      assert.strictEqual(res.rows[0].tuitionDueDate !== "paid", true);
    });
  });
});

describe(
  "PostgreSQL / Prisma Student CRM, Grades & Tuition Service",
  { skip: !hasTestDatabase() },
  () => {
    beforeEach(async () => {
      applyTestEnv();
      await resetAndSeedTestDatabase();
      clearAllMemoryRateLimits();
    });

    after(async () => {
      await teardownTestDatabase();
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
      const beforeClass = await classroomService.getClassroomById("cls-ii-01");
      const previousEnrolled = beforeClass.enrolled;

      await studentService.createStudent({
        code: "HS-2026-88",
        fullName: "Trần Minh Thư",
        classId: "cls-ii-01",
      });

      const afterClass = await classroomService.getClassroomById("cls-ii-01");
      assert.strictEqual(afterClass.enrolled, previousEnrolled + 1);
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

    it("2.5. Tạo học sinh hàng loạt (batchCreateStudents): thành công và báo cáo lỗi nếu có dòng trùng", async () => {
      const res = await studentService.batchCreateStudents([
        {
          code: "HS-BATCH-01",
          fullName: "Học sinh Hàng loạt 1",
          classId: "cls-ii-01",
        },
        {
          code: "HS-BATCH-02",
          fullName: "Học sinh Hàng loạt 2",
          classId: "cls-aw-02",
        },
        {
          code: "HS-2026-01", // Trùng mã đã có
          fullName: "Học sinh Trùng Mã",
          classId: "cls-ii-01",
        },
      ]);

      assert.strictEqual(res.created.length, 2);
      assert.strictEqual(res.failed.length, 1);
      assert.strictEqual(res.failed[0].code, "HS-2026-01");
      assert.match(res.failed[0].reason, /đã tồn tại/i);

      const found = await studentService.getStudentById("HS-BATCH-01");
      assert.strictEqual(found.fullName, "Học sinh Hàng loạt 1");
    });

    it("2.6. Tạo học sinh với Ngày nhập học tùy chỉnh định dạng YYYY-MM-DD", async () => {
      const student = await studentService.createStudent({
        code: "HS-DATE-01",
        fullName: "Học sinh Ngày Tùy chỉnh",
        classId: "cls-ii-01",
        joinedAt: "2026-09-15",
      });
      assert.strictEqual(student.joinedAt, "15/09/2026");
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

    it("3.7. Cập nhật Ngày nhập học (joinedAt) thành công", async () => {
      const updated = await studentService.updateStudent("stu-01", {
        joinedAt: "2026-07-20",
      });
      assert.strictEqual(updated.joinedAt, "20/07/2026");
    });

    it("3.8. Chặn đổi mã học sinh trùng với mã của học sinh khác (ConflictError)", async () => {
      // stu-01 cố tình đổi code thành HS-2026-02 (đã thuộc về stu-02)
      await assert.rejects(
        async () => {
          await studentService.updateStudent("stu-01", {
            code: "HS-2026-02",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictError);
          assert.match((err as ConflictError).message, /đã tồn tại/i);
          return true;
        },
      );
    });

    it("3.9. Đồng bộ sĩ số hai chiều khi chuyển học sinh đang học sang lớp khác", async () => {
      const stu = await studentService.getStudentById("stu-01");
      const oldClassBefore = await classroomService.getClassroomById(stu.classId);
      const newClassBefore = await classroomService.getClassroomById("cls-aw-02");

      const prevOldEnrolled = oldClassBefore.enrolled;
      const prevNewEnrolled = newClassBefore.enrolled;

      await studentService.updateStudent("stu-01", {
        classId: "cls-aw-02",
      });

      const oldClassAfter = await classroomService.getClassroomById(stu.classId);
      const newClassAfter = await classroomService.getClassroomById("cls-aw-02");
      assert.strictEqual(oldClassAfter.enrolled, prevOldEnrolled - 1, "Sĩ số lớp cũ phải giảm 1");
      assert.strictEqual(newClassAfter.enrolled, prevNewEnrolled + 1, "Sĩ số lớp mới phải tăng 1");
    });
  });

  // =========================================================================
  // SUITE 4: LƯU TRỮ MỀM (SOFT DELETE / ARCHIVE) & KHÔI PHỤC (RESTORE)
  // =========================================================================
  describe("4. Lưu trữ mềm (Archive / Soft Delete) & Khôi phục (Restore)", () => {
    it("4.1. Lưu trữ mềm: cập nhật status='archived', có deletedAt, giảm sĩ số lớp, giữ nguyên grades", async () => {
      const student = await studentService.getStudentById("stu-01");
      const originalGradesCount = student.grades.length;
      const targetClassBefore = await classroomService.getClassroomById(student.classId);
      const previousEnrolled = targetClassBefore.enrolled;

      const archived = await studentService.archiveStudent("stu-01");
      const targetClassAfter = await classroomService.getClassroomById(student.classId);

      assert.strictEqual(archived.status, "archived");
      assert.ok(archived.deletedAt, "deletedAt phải được gán ISO string");
      assert.strictEqual(
        archived.grades.length,
        originalGradesCount,
        "Lịch sử điểm phải được giữ nguyên vẹn",
      );
      assert.strictEqual(
        targetClassAfter.enrolled,
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
      const student = await studentService.getStudentById("stu-01");

      // Lưu trữ trước
      await studentService.archiveStudent("stu-01");
      const classAfterArchive = await classroomService.getClassroomById(student.classId);

      // Khôi phục
      const restored = await studentService.restoreStudent("stu-01");
      const classAfterRestore = await classroomService.getClassroomById(student.classId);
      assert.strictEqual(restored.status, "active");
      assert.strictEqual(restored.deletedAt, null);
      assert.strictEqual(classAfterRestore.enrolled, classAfterArchive.enrolled + 1);

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

    it("4.6. Lưu trữ hàng loạt (batchArchiveStudents): chuyển trạng thái và giảm sĩ số", async () => {
      const res = await studentService.batchArchiveStudents({
        studentIds: ["stu-01", "stu-02"],
      });
      assert.strictEqual(res.archivedCount, 2);

      const stu1 = await studentService.getStudentById("stu-01");
      const stu2 = await studentService.getStudentById("stu-02");
      assert.strictEqual(stu1.status, "archived");
      assert.strictEqual(stu2.status, "archived");

      // Danh sách active chỉ còn 4 học sinh
      const active = await studentService.listStudents({ status: "active" });
      assert.strictEqual(active.total, 4);
    });

    it("4.7. Tính lũy thừa (Idempotency): Lưu trữ nhiều lần không làm giảm sĩ số lớp nhiều lần", async () => {
      const student = await studentService.getStudentById("stu-01");

      // Lần 1: lưu trữ
      await studentService.archiveStudent("stu-01");
      const firstClass = await classroomService.getClassroomById(student.classId);

      // Lần 2: gọi lại cùng học sinh
      await studentService.archiveStudent("stu-01");
      const secondClass = await classroomService.getClassroomById(student.classId);
      assert.strictEqual(secondClass.enrolled, firstClass.enrolled, "Sĩ số không được tiếp tục giảm khi học sinh đã ở trạng thái archived");
    });

    it("4.8. Tính lũy thừa (Idempotency): Khôi phục nhiều lần không làm tăng sĩ số lớp nhiều lần", async () => {
      const student = await studentService.getStudentById("stu-01");
      const initialClass = await classroomService.getClassroomById(student.classId);

      // Đang active sẵn, gọi restoreStudent
      await studentService.restoreStudent("stu-01");
      const afterClass = await classroomService.getClassroomById(student.classId);
      assert.strictEqual(afterClass.enrolled, initialClass.enrolled, "Sĩ số không được tăng thêm khi học sinh vốn đã active");
    });

    it("4.9. Khôi phục hàng loạt (batchRestoreStudents): chuyển trạng thái active và tăng lại sĩ số", async () => {
      // Đầu tiên lưu trữ stu-01 và stu-02
      await studentService.batchArchiveStudents({ studentIds: ["stu-01", "stu-02"] });

      // Gọi batchRestore
      const res = await studentService.batchRestoreStudents({ studentIds: ["stu-01", "stu-02"] });
      assert.strictEqual(res.restoredCount, 2);

      const stu1 = await studentService.getStudentById("stu-01");
      const stu2 = await studentService.getStudentById("stu-02");
      assert.strictEqual(stu1.status, "active");
      assert.strictEqual(stu2.status, "active");

      const active = await studentService.listStudents({ status: "active" });
      assert.strictEqual(active.total, 6);
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

    it("6.3. Từ chối key backdoor 'HS2026' và chỉ chấp nhận PIN hiện hành từ System Settings", async () => {
      await assert.rejects(
        () =>
          studentService.verifyStudentPortal({
            studentCode: "HS-2026-01",
            accessKey: "HS2026",
          }),
        (err: unknown) => err instanceof UnauthorizedError,
      );

      await settingsService.updateSystemSettings({ defaultPortalPin: "PORTAL99" });

      await assert.rejects(
        () =>
          studentService.verifyStudentPortal({
            studentCode: "HS-2026-01",
            accessKey: "123456",
          }),
        (err: unknown) => err instanceof UnauthorizedError,
      );

      const student = await studentService.verifyStudentPortal({
        studentCode: "HS-2026-01",
        accessKey: "PORTAL99",
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

    it("6.5. Từ chối xác thực với thông báo đồng nhất khi mã học sinh không tồn tại (chống User Enumeration)", async () => {
      await assert.rejects(
        async () => {
          await studentService.verifyStudentPortal({
            studentCode: "HS-2099-99",
            accessKey: "123456",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof UnauthorizedError);
          assert.match((err as UnauthorizedError).message, /không chính xác/i);
          return true;
        },
      );
    });

    it("6.6. Thông báo lỗi khi sai PIN và sai Mã học sinh hoàn toàn giống nhau (bảo mật tuyệt đối thông tin tài khoản)", async () => {
      let wrongPinMsg = "";
      let wrongCodeMsg = "";

      try {
        await studentService.verifyStudentPortal({
          studentCode: "HS-2026-01",
          accessKey: "wrong-pin",
        });
      } catch (e) {
        wrongPinMsg = (e as Error).message;
      }

      try {
        await studentService.verifyStudentPortal({
          studentCode: "HS-NONEXISTENT",
          accessKey: "123456",
        });
      } catch (e) {
        wrongCodeMsg = (e as Error).message;
      }

      assert.ok(wrongPinMsg.length > 0);
      assert.strictEqual(wrongPinMsg, wrongCodeMsg, "Thông báo lỗi phải đồng nhất để không lộ sự tồn tại của tài khoản");
    });
  });

  // =========================================================================
  // SUITE 7: AN NINH CỔNG TRA CỨU, TOKEN & RATE LIMITING (BRUTE-FORCE DEFENSE)
  // =========================================================================
  // =========================================================================
  // SUITE 8: TÍNH NHẤT QUÁN SĨ SỐ LỚP & ĐỐI CHIẾU THỰC TẾ
  // =========================================================================
  describe("8. Tính Nhất quán Sĩ số Lớp & Báo cáo Đối chiếu", () => {
    it("8.1. Sĩ số lớp tự động cân bằng chính xác khi luân chuyển học sinh giữa nhiều lớp", async () => {
      const cls1Before = await classroomService.getClassroomById("cls-ii-01");
      const cls2Before = await classroomService.getClassroomById("cls-aw-02");
      const cls3Before = await classroomService.getClassroomById("cls-ja-01");
      const initialCls1 = cls1Before.enrolled;
      const initialCls2 = cls2Before.enrolled;
      const initialCls3 = cls3Before.enrolled;

      // stu-01 chuyển từ cls-ii-01 sang cls-aw-02
      await studentService.updateStudent("stu-01", { classId: "cls-aw-02" });
      assert.strictEqual((await classroomService.getClassroomById("cls-ii-01")).enrolled, initialCls1 - 1);
      assert.strictEqual((await classroomService.getClassroomById("cls-aw-02")).enrolled, initialCls2 + 1);

      // stu-01 chuyển tiếp sang cls-ja-01
      await studentService.updateStudent("stu-01", { classId: "cls-ja-01" });
      assert.strictEqual((await classroomService.getClassroomById("cls-aw-02")).enrolled, initialCls2); // quay về ban đầu
      assert.strictEqual((await classroomService.getClassroomById("cls-ja-01")).enrolled, initialCls3 + 1);
    });

    it("8.2. Học sinh đang archived chuyển lớp không làm thay đổi sĩ số các lớp", async () => {
      // Lưu trữ stu-01
      await studentService.archiveStudent("stu-01");
      const cls1Enrolled = (await classroomService.getClassroomById("cls-ii-01")).enrolled;
      const cls2Enrolled = (await classroomService.getClassroomById("cls-aw-02")).enrolled;

      // Đổi lớp khi đang archived
      await studentService.updateStudent("stu-01", { classId: "cls-aw-02" });
      assert.strictEqual((await classroomService.getClassroomById("cls-ii-01")).enrolled, cls1Enrolled, "Lớp cũ không bị trừ thêm");
      assert.strictEqual((await classroomService.getClassroomById("cls-aw-02")).enrolled, cls2Enrolled, "Lớp mới không bị tăng khi học sinh đang lưu trữ");
    });
  });

  // =========================================================================
  // SUITE 10: XỬ LÝ THAO TÁC ĐỒNG THỜI & TÍNH TOÀN VẸN
  // =========================================================================
  describe("10. Xử lý Thao tác Đồng thời & Tính Toàn vẹn Dữ liệu", () => {
    it("10.1. Hai Admin cùng lưu trữ một học sinh: kết quả an toàn và sĩ số không bị trừ hai lần", async () => {
      const student = await studentService.getStudentById("stu-01");
      const clsBefore = await classroomService.getClassroomById(student.classId);

      // Thực thi đồng thời (Promise.all)
      await Promise.all([
        studentService.archiveStudent("stu-01"),
        studentService.archiveStudent("stu-01"),
      ]);

      const clsAfter = await classroomService.getClassroomById(student.classId);
      assert.strictEqual(clsAfter.enrolled, clsBefore.enrolled - 1, "Sĩ số chỉ được trừ đúng 1 lần");
    });

    it("10.2. Hai Admin cùng khôi phục một học sinh: kết quả an toàn và sĩ số không bị tăng hai lần", async () => {
      const student = await studentService.getStudentById("stu-01");

      // Lưu trữ trước
      await studentService.archiveStudent("stu-01");
      const clsAfterArchive = await classroomService.getClassroomById(student.classId);

      // Thực thi khôi phục đồng thời (Promise.all)
      await Promise.all([
        studentService.restoreStudent("stu-01"),
        studentService.restoreStudent("stu-01"),
      ]);

      const clsAfterRestore = await classroomService.getClassroomById(student.classId);
      assert.strictEqual(clsAfterRestore.enrolled, clsAfterArchive.enrolled + 1, "Sĩ số chỉ được cộng lại đúng 1 lần");
    });

    it("10.3. Hai Admin cùng thêm một mã học sinh: người thứ hai bị từ chối với ConflictError", async () => {
      await studentService.createStudent({
        code: "HS-CONCURRENT-01",
        fullName: "Học sinh 1",
        classId: "cls-ii-01",
      });

      await assert.rejects(
        async () => {
          await studentService.createStudent({
            code: "HS-CONCURRENT-01",
            fullName: "Học sinh 2",
            classId: "cls-aw-02",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictError);
          return true;
        },
      );
    });

    it("10.4. Nhập hàng loạt (batchCreateStudents): dòng lỗi không làm hỏng các dòng hợp lệ", async () => {
      const res = await studentService.batchCreateStudents([
        { code: "HS-SAFE-01", fullName: "Học sinh Hợp lệ 1" },
        { code: "HS-2026-01", fullName: "Học sinh Trùng Mã" }, // Trùng
        { code: "HS-SAFE-02", fullName: "Học sinh Hợp lệ 2" },
      ]);

      assert.strictEqual(res.created.length, 2);
      assert.strictEqual(res.failed.length, 1);
      assert.strictEqual(res.failed[0].code, "HS-2026-01");

      const stu1 = await studentService.getStudentById("HS-SAFE-01");
      const stu2 = await studentService.getStudentById("HS-SAFE-02");
      assert.ok(stu1);
      assert.ok(stu2);
    });
  });

  // =========================================================================
  // SUITE 11: BỘ LỌC NHANH TÌNH TRẠNG HỌC TẬP & CẢNH BÁO HỌC VỤ TỰ ĐỘNG
  // =========================================================================
  describe("11. Bộ lọc Nhanh Tình trạng Học tập & Cảnh báo Học vụ Tự động", () => {
    it("11.2. Nhận diện cảnh báo học phí quá hạn cho học sinh (HS-2026-06)", async () => {
      const student = await studentService.getStudentById("HS-2026-06");
      assert.ok(student);
      const alerts = getStudentAcademicAlerts(student, DEFAULT_ALERT_SETTINGS);
      const tuitionAlert = alerts.find((a) => a.type === "tuition");
      assert.ok(tuitionAlert, "Học sinh quá hạn học phí phải có cảnh báo tuition");
      assert.strictEqual(tuitionAlert.title, "Chưa hoàn thành học phí");
      assert.strictEqual(tuitionAlert.level, "destructive");
    });

    it("11.3. Nhận diện cảnh báo điểm dưới mục tiêu (HS-2026-06 đạt 5.8 < mục tiêu 6.0)", async () => {
      const student = await studentService.getStudentById("HS-2026-06");
      assert.ok(student);
      const alerts = getStudentAcademicAlerts(student, DEFAULT_ALERT_SETTINGS);
      const targetAlert = alerts.find((a) => a.type === "below-target");
      assert.ok(targetAlert, "Học sinh có điểm dưới mục tiêu phải nhận cảnh báo below-target");
      assert.strictEqual(targetAlert.title, "Điểm dưới mục tiêu");
    });

    it("11.4. Nhận diện cảnh báo chuyên cần thấp theo ngưỡng cấu hình", async () => {
      // HS-2026-06 có attendanceRate = 88%
      const student = await studentService.getStudentById("HS-2026-06");
      assert.ok(student);

      // Với ngưỡng mặc định 80%, học sinh 88% KHÔNG bị cảnh báo chuyên cần
      const defaultAlerts = getStudentAcademicAlerts(student, {
        ...DEFAULT_ALERT_SETTINGS,
        attendanceThreshold: 80,
      });
      assert.strictEqual(defaultAlerts.some((a) => a.type === "attendance"), false);

      // Khi trung tâm cấu hình ngưỡng là 90%, học sinh 88% sẽ BỊ cảnh báo
      const strictAlerts = getStudentAcademicAlerts(student, {
        ...DEFAULT_ALERT_SETTINGS,
        attendanceThreshold: 90,
      });
      const attAlert = strictAlerts.find((a) => a.type === "attendance");
      assert.ok(attAlert, "Học sinh 88% dưới ngưỡng 90% phải nhận cảnh báo chuyên cần");
      assert.strictEqual(attAlert.title, "Cần theo dõi chuyên cần");
    });

    it("11.5. Nhận diện cảnh báo học sinh chưa có bài kiểm tra/đánh giá nào", async () => {
      const newStu = await studentService.createStudent({
        code: "HS-NEW-ALERT",
        fullName: "Học sinh Mới Chưa Có Điểm",
        classId: "cls-ii-01",
      });
      const alerts = getStudentAcademicAlerts(newStu, DEFAULT_ALERT_SETTINGS);
      const noGradesAlert = alerts.find((a) => a.type === "no-grades");
      assert.ok(noGradesAlert, "Học sinh chưa có điểm phải nhận cảnh báo no-grades");
      assert.strictEqual(noGradesAlert.title, "Chưa có đánh giá gần đây");
    });

    it("11.7. Bộ lọc academicStatus='has-alerts' lọc chính xác các học sinh cần quan tâm", async () => {
      const res = await studentService.listStudents({ academicStatus: "has-alerts" });
      assert.ok(res.total >= 1, "Phải tìm thấy ít nhất 1 học sinh có cảnh báo");
      // HS-2026-06 có cảnh báo học phí và điểm dưới mục tiêu
      const foundHuy = res.items.find((s) => s.code === "HS-2026-06");
      assert.ok(foundHuy, "HS-2026-06 phải nằm trong danh sách cần quan tâm");
    });

    it("11.8. Bộ lọc academicStatus='below-target' lọc ra học sinh có điểm dưới mục tiêu", async () => {
      const res = await studentService.listStudents({ academicStatus: "below-target" });
      assert.ok(res.total >= 1);
      const foundHuy = res.items.find((s) => s.code === "HS-2026-06");
      assert.ok(foundHuy, "Đặng Quốc Huy (5.8 < 6.0) phải xuất hiện trong bộ lọc below-target");
    });

    it("11.9. Bộ lọc academicStatus='no-grades' lọc ra học sinh chưa có điểm bài thi", async () => {
      await studentService.createStudent({
        code: "HS-NO-GRADE-TEST",
        fullName: "Học sinh Chưa Thi",
        classId: "cls-ii-01",
      });

      const res = await studentService.listStudents({ academicStatus: "no-grades" });
      assert.ok(res.total >= 1);
      assert.ok(res.items.some((s) => s.code === "HS-NO-GRADE-TEST"));
    });

    it("11.10. Bộ lọc academicStatus='low-attendance' phản hồi chính xác theo attendanceThreshold", async () => {
      // Với ngưỡng 85%, học sinh 88% không bị coi là low attendance
      const res85 = await studentService.listStudents({
        academicStatus: "low-attendance",
        attendanceThreshold: 85,
      });
      assert.ok(!res85.items.some((s) => s.code === "HS-2026-06"));

      // Với ngưỡng 90%, học sinh 88% bị coi là low attendance
      const res90 = await studentService.listStudents({
        academicStatus: "low-attendance",
        attendanceThreshold: 90,
      });
      assert.ok(res90.items.some((s) => s.code === "HS-2026-06"));
    });

    it("11.11. Bộ lọc academicStatus='no-recent-comment' lọc ra học sinh chưa có nhận xét", async () => {
      await studentService.createStudent({
        code: "HS-NO-COMMENT",
        fullName: "Học sinh Chưa Nhận Xét",
        classId: "cls-ii-01",
        recentComment: "",
      });

      const res = await studentService.listStudents({ academicStatus: "no-recent-comment" });
      assert.ok(res.total >= 1);
      assert.ok(res.items.some((s) => s.code === "HS-NO-COMMENT"));
    });
  });

  // =========================================================================
  // SUITE 12: KIỂM SOÁT SĨ SỐ & RÀNG BUỘC CHUYỂN LỚP (Capacity & Single Source of Truth)
  // =========================================================================
  describe("12. Kiểm soát Sĩ số & Ràng buộc chuyển lớp (Capacity Enforcement & Single Source of Truth)", () => {
    it("12.1. Chặn thêm học sinh mới vào lớp đã đủ sĩ số tối đa (ném ValidationError)", async () => {
      const classes = await classroomService.listClassrooms();
      const testClass = classes[0];
      const activeInClass = await studentService.listAllStudents({
        classId: testClass.id,
        status: "non-archived",
      });
      assert.strictEqual(activeInClass.length, 2, "Lớp ban đầu có đúng 2 học viên");

      await classroomService.updateClassroom(testClass.id, { capacity: 2 });

      // Attempting to add a 3rd student must throw ValidationError
      await assert.rejects(
        () =>
          studentService.createStudent({
            code: "HS-OVER-CAPACITY",
            fullName: "Học sinh Vượt Sĩ Số",
            classId: testClass.id,
          }),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          assert.match(err.message, /đã đủ sĩ số tối đa/);
          return true;
        },
      );
    });

    it("12.2. Chặn chuyển học sinh từ lớp A sang lớp B khi lớp B đã đủ sĩ số (ném ValidationError)", async () => {
      const classA = await classroomService.getClassroomById("cls-ii-01");
      const classB = await classroomService.getClassroomById("cls-if-01");
      await classroomService.updateClassroom(classB.id, {
        capacity: classB.enrolled,
      });

      const studentsInA = await studentService.listAllStudents({
        classId: classA.id,
        status: "non-archived",
      });
      const studentInA = studentsInA[0];
      assert.ok(studentInA, "Phải có học sinh trong lớp A");

      // Transfer student from classA to full classB
      await assert.rejects(
        () =>
          studentService.updateStudent(studentInA.id, {
            classId: classB.id,
          }),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          assert.match(err.message, /đã đủ sĩ số/);
          return true;
        },
      );
    });

    it("12.3. Chuyển lớp thành công khi lớp đích còn chỗ và tự động cập nhật sĩ số cả 2 lớp", async () => {
      const classA = await classroomService.getClassroomById("cls-ii-01");
      const classEmpty = await classroomService.getClassroomById("cls-mg-05");

      const studentsInA = await studentService.listAllStudents({
        classId: classA.id,
        status: "non-archived",
      });
      const studentToMove = studentsInA[0]!;

      const initialAEnrolled = classA.enrolled;
      const initialEmptyEnrolled = classEmpty.enrolled;

      const moved = await studentService.updateStudent(studentToMove.id, {
        classId: classEmpty.id,
      });

      assert.strictEqual(moved.classId, classEmpty.id);
      assert.strictEqual(
        (await classroomService.getClassroomById(classEmpty.id)).enrolled,
        initialEmptyEnrolled + 1,
      );
      assert.strictEqual(
        (await classroomService.getClassroomById(classA.id)).enrolled,
        initialAEnrolled - 1,
      );
    });

    it("12.4. Lưu trữ học sinh giải phóng 1 chỗ trong lớp (enrolled giảm)", async () => {
      const targetClass = await classroomService.getClassroomById("cls-ii-01");
      const initialEnrolled = targetClass.enrolled;

      const activeStudents = await studentService.listAllStudents({
        classId: targetClass.id,
        status: "non-archived",
      });
      const student = activeStudents[0]!;

      await studentService.archiveStudent(student.id);

      assert.strictEqual(
        (await classroomService.getClassroomById(targetClass.id)).enrolled,
        initialEnrolled - 1,
      );
    });

    it("12.5. Chặn khôi phục học sinh vào lớp đã đầy sĩ số (ném ValidationError)", async () => {
      const targetClass = await classroomService.getClassroomById("cls-ii-01");

      // Archive one student
      const activeStudents = await studentService.listAllStudents({
        classId: targetClass.id,
        status: "non-archived",
      });
      const student = activeStudents[0]!;
      await studentService.archiveStudent(student.id);

      // Now set capacity equal to current enrolled count so class is full
      const afterArchive = await classroomService.getClassroomById(targetClass.id);
      await classroomService.updateClassroom(targetClass.id, {
        capacity: afterArchive.enrolled,
      });

      // Attempt to restore must fail
      await assert.rejects(
        () => studentService.restoreStudent(student.id),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          assert.match(err.message, /đã đủ sĩ số/);
          return true;
        },
      );
    });

    it("12.6. Sĩ số enrolled ở toàn bộ các lớp luôn luôn khớp 100% với học sinh hoạt động thực tế", async () => {
      // Add a student to cls-mg-05
      await studentService.createStudent({
        code: "HS-SYNC-TEST-01",
        fullName: "Đồng Bộ 1",
        classId: "cls-mg-05",
      });

      const [allClasses, allStudents] = await Promise.all([
        classroomService.listAllClassrooms(true),
        studentService.listAllStudents({ status: "all" }),
      ]);

      // Verify every single classroom's enrolled matches active students count
      for (const cls of allClasses) {
        const actualCount = allStudents.filter(
          (s) => s.classId === cls.id && s.status !== "archived" && !s.deletedAt,
        ).length;
        assert.strictEqual(
          cls.enrolled,
          actualCount,
          `Sĩ số của lớp ${cls.code} (${cls.enrolled}) phải bằng số học sinh thực tế (${actualCount})`,
        );
      }
    });
  });

  // =========================================================================
  // SUITE 13: STUDENT CRM 360° (PHỤ HUYNH, VÒNG ĐỜI, SỔ HỌC PHÍ, GIAO TIẾP, CHẨN ĐOÁN)
  // =========================================================================
  describe("13. Student CRM 360° — Phụ huynh, Vòng đời, Sổ học phí, Giao tiếp & Chuyển lớp hàng loạt", () => {
    it("13.1. Tạo học sinh kèm thông tin phụ huynh đầy đủ, privateNote, vòng đời trial/on-leave và tự mask SĐT", async () => {
      const trialStu = await studentService.createStudent({
        code: "HS-TRIAL-01",
        fullName: "Lê Minh Tâm",
        classId: "cls-mg-05",
        status: "trial",
        parentName: "Chị Lan Anh",
        parentPhone: "0912345678",
        parentEmail: "lananh@example.com",
        parentNote: "Chỉ nghe máy sau 18h",
        privateNote: "Cần quan sát phản xạ phát âm trong 2 buổi đầu",
        entryBand: 4.5,
      });

      assert.strictEqual(trialStu.status, "trial");
      assert.strictEqual(trialStu.parentName, "Chị Lan Anh");
      assert.strictEqual(trialStu.parentPhone, "0912345678");
      assert.strictEqual(trialStu.parentContactMasked, "0912 ••• 678");
      assert.strictEqual(trialStu.privateNote, "Cần quan sát phản xạ phát âm trong 2 buổi đầu");
      assert.strictEqual(trialStu.entryBand, 4.5);

      const leaveStu = await studentService.updateStudent(trialStu.id, {
        status: "on-leave",
        leaveStartDate: "2026-11-20",
        leaveReturnDate: "2026-12-10",
        leaveReason: "Thi học kỳ ở trường",
      });
      assert.strictEqual(leaveStu.status, "on-leave");
      assert.strictEqual(leaveStu.leaveStartDate, "2026-11-20");
      assert.strictEqual(leaveStu.leaveReturnDate, "2026-12-10");
      assert.strictEqual(leaveStu.leaveReason, "Thi học kỳ ở trường");
    });

    it("13.2b. DB roundtrip verifyStudentPortal tước bỏ hoàn toàn ghi chú nội bộ và SĐT/Email phụ huynh", async () => {
      const created = await studentService.createStudent({
        code: "HS-PORTAL-SAFE",
        fullName: "Nguyễn An Bình",
        classId: "cls-mg-05",
        parentName: "Anh Hùng",
        parentPhone: "0988777666",
        parentEmail: "anhhung@example.com",
        parentNote: "Ghi chú riêng gia đình",
        privateNote: "Ghi chú mật chỉ giáo viên đọc",
      });
      await studentService.addCommunicationLog(created.id, {
        channel: "zalo",
        category: "academic",
        summary: "Trao đổi riêng với bố",
      });

      const sanitized = studentService.sanitizeStudentForPortal(
        await studentService.getStudentById(created.id),
      );
      assert.strictEqual(sanitized.privateNote, undefined);
      assert.strictEqual(sanitized.parentPhone, undefined);
      assert.strictEqual(sanitized.parentEmail, undefined);
      assert.strictEqual(sanitized.parentNote, undefined);
      assert.strictEqual(sanitized.communicationLogs, undefined);
      assert.strictEqual(sanitized.parentContactMasked, "0988 ••• 666");

      // verifyStudentPortal cũng tự động làm sạch payload
      const portalRes = await studentService.verifyStudentPortal({
        studentCode: "HS-PORTAL-SAFE",
        accessKey: "123456",
      });
      assert.strictEqual(portalRes.privateNote, undefined);
      assert.strictEqual(portalRes.parentPhone, undefined);
    });

    it("13.3b. DB roundtrip getStudentAcademicAlerts miễn cảnh báo cho trial, on-leave và archived", async () => {
      const trialStu = await studentService.createStudent({
        code: "HS-ALERT-TRIAL",
        fullName: "Võ Thị Thử",
        classId: "cls-mg-05",
        status: "trial",
        tuitionStatus: "overdue",
      });
      const trialAlerts = getStudentAcademicAlerts(trialStu, DEFAULT_ALERT_SETTINGS);
      assert.strictEqual(
        trialAlerts.some((a) => a.type === "tuition" || a.type === "no-grades"),
        false,
      );

      const leaveStu = await studentService.createStudent({
        code: "HS-ALERT-LEAVE",
        fullName: "Đinh Văn Bảo Lưu",
        classId: "cls-mg-05",
        status: "on-leave",
        tuitionStatus: "overdue",
      });
      leaveStu.attendanceRate = 50;
      leaveStu.attendanceHistory = [
        { date: "10/11/2026", sessionName: "Buổi 1", status: "absent" },
      ];
      const leaveAlerts = getStudentAcademicAlerts(leaveStu, DEFAULT_ALERT_SETTINGS);
      assert.strictEqual(
        leaveAlerts.some((a) => a.type === "tuition" || a.type === "attendance"),
        false,
      );

      await studentService.archiveStudent(leaveStu.id);
      const archivedAlerts = getStudentAcademicAlerts(
        await studentService.getStudentById(leaveStu.id),
        DEFAULT_ALERT_SETTINGS,
      );
      assert.strictEqual(archivedAlerts.length, 0);
    });

    it("13.4. Sổ thu học phí (recordTuitionPayment): thu một phần, giảm trừ học bổng, thu đủ và tự đồng bộ trạng thái", async () => {
      // Thu một phần cho stu-06 (hiện đang overdue 5.200.000 đ)
      const partialRes = await studentService.recordTuitionPayment("stu-06", {
        paymentId: "pay-stu06-2",
        period: "Học kỳ II (2026)",
        baseAmount: 5200000,
        discountAmount: 200000,
        paidAmount: 2000000,
        dueDate: "2026-11-25",
        paidAt: "2026-11-18",
        method: "cash",
        note: "Đóng trước 2tr tiền mặt",
      });
      assert.strictEqual(partialRes.payment.status, "partial");
      assert.ok(partialRes.payment.receiptCode?.startsWith("PT-"));
      assert.strictEqual(partialRes.student.tuitionStatus, "due-soon");

      // Thu đủ phần còn lại (5.000.000 sau giảm trừ)
      const fullRes = await studentService.recordTuitionPayment("stu-06", {
        paymentId: "pay-stu06-2",
        period: "Học kỳ II (2026)",
        baseAmount: 5200000,
        discountAmount: 200000,
        paidAmount: 5000000,
        dueDate: "2026-11-25",
        paidAt: "2026-11-19",
        method: "transfer",
      });
      assert.strictEqual(fullRes.payment.status, "paid");
      assert.strictEqual(fullRes.student.tuitionStatus, "paid");
      assert.strictEqual(fullRes.student.tuitionAmount, "5.000.000 ₫");
    });

    it("13.5. Nhật ký tương tác phụ huynh (addCommunicationLog & deleteCommunicationLog)", async () => {
      const added = await studentService.addCommunicationLog("stu-02", {
        channel: "phone",
        category: "academic",
        summary: "Gọi trao đổi với bố về bài Research Essay.",
        parentResponse: "Bố đồng ý cho con tham gia Showcase.",
        nextFollowUpDate: "2026-11-28",
      });

      assert.strictEqual(added.entry.channel, "phone");
      assert.ok(
        (added.student.communicationLogs ?? []).some((c) => c.id === added.entry.id),
      );

      const afterDelete = await studentService.deleteCommunicationLog(
        "stu-02",
        added.entry.id,
      );
      assert.strictEqual(
        (afterDelete.communicationLogs ?? []).some((c) => c.id === added.entry.id),
        false,
      );
    });

    it("13.6. batchTransferStudents chuyển lớp hàng loạt, ghi lịch sử, đồng bộ sĩ số và chặn nguyên tử khi thiếu chỗ", async () => {
      // cls-mg-05 mặc định capacity 10, enrolled 0 -> đặt capacity = 1 để test chặn
      await classroomService.updateClassroom("cls-mg-05", { capacity: 1 });

      await assert.rejects(
        () =>
          studentService.batchTransferStudents({
            studentIds: ["stu-01", "stu-02"],
            targetClassId: "cls-mg-05",
            reason: "Test vượt sức chứa",
          }),
        (err: unknown) => {
          assert.ok(err instanceof ValidationError);
          assert.match(err.message, /chỗ trống/);
          return true;
        },
      );

      // Tăng capacity lên 5 và chuyển thành công cả 2 em
      await classroomService.updateClassroom("cls-mg-05", { capacity: 5 });
      const res = await studentService.batchTransferStudents({
        studentIds: ["stu-01", "stu-02"],
        targetClassId: "cls-mg-05",
        reason: "Ghép lớp chuyên đề cấp tốc",
      });
      assert.strictEqual(res.transferredCount, 2);
      assert.strictEqual(
        (await classroomService.getClassroomById("cls-mg-05")).enrolled,
        2,
      );

      const stu1 = await studentService.getStudentById("stu-01");
      assert.strictEqual(stu1.classId, "cls-mg-05");
      assert.strictEqual(
        stu1.classTransferHistory?.[0].reason,
        "Ghép lớp chuyên đề cấp tốc",
      );
    });

    it("13.7. recordGrade ghi nhận gradeChangeHistory khi cập nhật bài thi đã tồn tại", async () => {
      await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Mid-term Progress Test",
        listening: 7.5,
        reading: 7.5,
        writing: 7.0,
        speaking: 7.0,
        comment: "Chấm phúc khảo tăng điểm",
      });

      const updated = await studentService.getStudentById("stu-03");
      assert.strictEqual(updated.averageScore, 7.5);
      assert.ok((updated.gradeChangeHistory ?? []).length >= 1);
      assert.strictEqual(updated.gradeChangeHistory?.[0].oldScore, 6.2);
      assert.strictEqual(updated.gradeChangeHistory?.[0].newScore, 7.5);
    });

    it("13.8. getStudentsSummary, lọc status trial/on-leave/non-archived và sortBy tuitionDueDate", async () => {
      await studentService.createStudent({
        code: "HS-TRIAL-SUM",
        fullName: "Học Viên Thử",
        classId: "cls-mg-05",
        status: "trial",
      });
      await studentService.createStudent({
        code: "HS-LEAVE-SUM",
        fullName: "Học Viên Bảo Lưu",
        classId: "cls-mg-05",
        status: "on-leave",
      });

      const summary = await studentService.getStudentsSummary();
      assert.strictEqual(summary.totalActive, 6);
      assert.strictEqual(summary.totalTrial, 1);
      assert.strictEqual(summary.totalOnLeave, 1);
      assert.strictEqual(summary.totalNonArchived, 8);

      const trialPage = await studentService.listStudents({ status: "trial" });
      assert.strictEqual(trialPage.total, 1);
      assert.strictEqual(trialPage.items[0].code, "HS-TRIAL-SUM");

      const leavePage = await studentService.listStudents({ status: "on-leave" });
      assert.strictEqual(leavePage.total, 1);
      assert.strictEqual(leavePage.items[0].code, "HS-LEAVE-SUM");

      const sortedByDue = await studentService.listStudents({
        status: "non-archived",
        sortBy: "tuitionDueDate",
      });
      assert.strictEqual(sortedByDue.total, 8);
      for (let i = 1; i < sortedByDue.items.length; i++) {
        const prevDate = sortedByDue.items[i - 1].tuitionDueDate || "9999-12-31";
        const currDate = sortedByDue.items[i].tuitionDueDate || "9999-12-31";
        assert.ok(prevDate <= currDate);
      }
    });

    it("13.11. Tạo và cập nhật học sinh không cần thông tin phụ huynh vẫn hoạt động chuẩn xác", async () => {
      const noParentStu = await studentService.createStudent({
        code: "HS-NO-PARENT",
        fullName: "Học Sinh Tự Lập",
        classId: "cls-mg-05",
      });

      assert.strictEqual(noParentStu.parentRelation, "");
      assert.strictEqual(noParentStu.parentContactMasked, "");
      assert.strictEqual(noParentStu.parentName, undefined);
      assert.strictEqual(noParentStu.parentPhone, undefined);

      // Cập nhật thêm rồi xóa trắng lại thông tin phụ huynh
      const addedParent = await studentService.updateStudent(noParentStu.id, {
        parentName: "Cô Mai",
        parentPhone: "0911222333",
      });
      assert.strictEqual(addedParent.parentName, "Cô Mai");
      assert.strictEqual(addedParent.parentContactMasked, "0911 ••• 333");

      const clearedParent = await studentService.updateStudent(noParentStu.id, {
        parentName: "",
        parentRelation: "",
        parentPhone: "",
        parentEmail: "",
        parentNote: "",
      });
      assert.strictEqual(clearedParent.parentName, undefined);
      assert.strictEqual(clearedParent.parentRelation, "");
      assert.strictEqual(clearedParent.parentContactMasked, "");
      assert.strictEqual(clearedParent.parentPhone, undefined);
    });
  });

  // =========================================================================
  // SUITE 14: QUẢN LÝ ĐIỂM SỐ NÂNG CAO (DRAFT/PUBLISH, AUDIT, PRIVATE NOTE)
  // =========================================================================
  describe("14. Quản lý Điểm số & Nhận xét chuyên môn nâng cao", () => {
    it("14.1. createAssessment lưu xuống PostgreSQL bền vững", async () => {
      const updated = await studentService.createAssessment({
        title: "Mock Test Đặc Biệt Tháng 12",
      });
      assert.ok(updated.includes("Mock Test Đặc Biệt Tháng 12"));
      assert.ok(
        (await studentService.listAssessments()).includes("Mock Test Đặc Biệt Tháng 12"),
      );
    });

    it("14.2. renameAssessment đồng bộ tên kỳ thi sang học viên & audit log, chặn trùng tên", async () => {
      await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Kỳ Thi Cũ",
        listening: 7.0,
        reading: 7.0,
        writing: 6.5,
        speaking: 6.5,
        comment: "Khá tốt",
      });
      await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Kỳ Thi Cũ",
        listening: 8.0,
        reading: 8.0,
        writing: 7.5,
        speaking: 7.5,
        comment: "Phúc khảo",
      });

      const renamed = await studentService.renameAssessment({
        oldTitle: "Kỳ Thi Cũ",
        newTitle: "Kỳ Thi Đã Đổi Tên",
      });
      assert.ok(renamed.assessments.includes("Kỳ Thi Đã Đổi Tên"));
      assert.strictEqual(renamed.assessments.includes("Kỳ Thi Cũ"), false);
      assert.ok(renamed.updatedRecordsCount >= 1);

      const stu03 = await studentService.getStudentById("stu-03");
      assert.ok(stu03.grades.some((g) => g.assessmentTitle === "Kỳ Thi Đã Đổi Tên"));
      assert.ok(
        (stu03.gradeChangeHistory ?? []).some(
          (l) => l.assessmentTitle === "Kỳ Thi Đã Đổi Tên",
        ),
      );

      // Rename to another existing title must throw ConflictError
      await studentService.createAssessment({ title: "Kỳ Khác Đã Có" });
      await assert.rejects(
        () =>
          studentService.renameAssessment({
            oldTitle: "Kỳ Thi Đã Đổi Tên",
            newTitle: "Kỳ Khác Đã Có",
          }),
        ConflictError,
      );
    });

    it("14.3. deleteAssessment chặn xóa khi đã có điểm, cho phép xóa kỳ thi trống", async () => {
      await studentService.createAssessment({ title: "Kỳ Trống Chưa Chấm" });
      const afterDeleteEmpty = await studentService.deleteAssessment({
        title: "Kỳ Trống Chưa Chấm",
      });
      assert.strictEqual(
        afterDeleteEmpty.includes("Kỳ Trống Chưa Chấm"),
        false,
      );

      await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Kỳ Đã Có Điểm",
        listening: 6.5,
        reading: 6.5,
        writing: 6.0,
        speaking: 6.0,
      });

      await assert.rejects(
        () => studentService.deleteAssessment({ title: "Kỳ Đã Có Điểm" }),
        ConflictError,
      );
    });

    it("14.4. Chặn nhập điểm cho học viên đã lưu trữ (archived)", async () => {
      await studentService.archiveStudent("stu-03");
      await assert.rejects(
        () =>
          studentService.recordGrade({
            studentId: "stu-03",
            assessmentTitle: "Test Học Sinh Archived",
            listening: 7,
            reading: 7,
            writing: 7,
            speaking: 7,
          }),
        ValidationError,
      );
    });

    it("14.5. Bản nháp (draft) & privateNote KHÔNG đổi averageScore và bị ẩn khỏi sanitizeStudentForPortal", async () => {
      const stuBefore = await studentService.getStudentById("stu-03");
      const prevAvg = stuBefore.averageScore;
      const prevComment = stuBefore.recentComment;

      await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Draft Exam Unpublished",
        date: "2026-11-25",
        listening: 8.5,
        reading: 8.5,
        writing: 8.5,
        speaking: 8.5,
        comment: "Nhận xét nháp chưa công bố",
        privateNote: "GHI_CHU_NOI_BO_GIAO_VIEN_TRONG_DIEM",
        status: "draft",
      });

      const stuAdmin = await studentService.getStudentById("stu-03");
      assert.strictEqual(
        stuAdmin.averageScore,
        prevAvg,
        "Điểm nháp không được ghi đè averageScore",
      );
      assert.strictEqual(stuAdmin.recentComment, prevComment);

      // Add a privateNote on a published grade too
      await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Published With Private Note",
        listening: 7.5,
        reading: 7.5,
        writing: 7.5,
        speaking: 7.5,
        comment: "Nhận xét công khai",
        privateNote: "SECRET_TEACHER_EVAL_NOTE",
        status: "published",
      });

      const stuAdminPublished = await studentService.getStudentById("stu-03");
      const portalSafe = studentService.sanitizeStudentForPortal(stuAdminPublished);

      assert.strictEqual(
        portalSafe.grades.some((g) => g.assessmentTitle === "Draft Exam Unpublished"),
        false,
        "Cổng Học sinh KHÔNG được hiển thị bài kiểm tra ở trạng thái draft",
      );
      const pubGrade = portalSafe.grades.find(
        (g) => g.assessmentTitle === "Published With Private Note",
      )!;
      assert.ok(pubGrade);
      assert.strictEqual(pubGrade.privateNote, undefined);

      const serialized = JSON.stringify(portalSafe);
      assert.strictEqual(serialized.includes("SECRET_TEACHER_EVAL_NOTE"), false);
      assert.strictEqual(
        serialized.includes("GHI_CHU_NOI_BO_GIAO_VIEN_TRONG_DIEM"),
        false,
      );
    });

    it("14.6. publishAssessmentGrades công bố điểm nháp sang published & cập nhật averageScore", async () => {
      await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Final Mock Batch",
        listening: 8.0,
        reading: 8.0,
        writing: 8.0,
        speaking: 8.0,
        comment: "Hoàn thành xuất sắc",
        status: "draft",
      });

      const res = await studentService.publishAssessmentGrades({
        assessmentTitle: "Final Mock Batch",
      });
      assert.strictEqual(res.publishedCount, 1);

      const updated = await studentService.getStudentById("stu-03");
      assert.strictEqual(updated.averageScore, 8);
      assert.strictEqual(updated.recentComment, "Hoàn thành xuất sắc");
      const portalSafe = studentService.sanitizeStudentForPortal(updated);
      assert.ok(
        portalSafe.grades.some((g) => g.assessmentTitle === "Final Mock Batch"),
      );
    });

    it("14.7. Sửa bài thi cũ (không phải mới nhất) ghi audit log kèm reason mà không làm tụt averageScore mới nhất", async () => {
      await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Exam Old",
        listening: 6.0,
        reading: 6.0,
        writing: 6.0,
        speaking: 6.0,
        status: "published",
      });
      await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Exam Latest",
        listening: 8.0,
        reading: 8.0,
        writing: 8.0,
        speaking: 8.0,
        status: "published",
      });

      // Now edit Exam Old from 6.0 -> 6.5 with custom reason
      const afterEditOld = await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Exam Old",
        listening: 6.5,
        reading: 6.5,
        writing: 6.5,
        speaking: 6.5,
        reason: "Cộng điểm câu nghe bị lỗi file",
        status: "published",
      });

      assert.strictEqual(
        afterEditOld.averageScore,
        8,
        "Sửa bài thi cũ không được kéo tụt averageScore của bài thi published mới nhất",
      );
      assert.strictEqual(
        afterEditOld.gradeChangeHistory?.[0].reason,
        "Cộng điểm câu nghe bị lỗi file",
      );
    });

    it("14.8. deleteGradeRecord xóa bản ghi điểm, ghi audit log & tính lại averageScore", async () => {
      const stuAfterCreate = await studentService.recordGrade({
        studentId: "stu-03",
        assessmentTitle: "Mistaken Entry Test",
        listening: 9.0,
        reading: 9.0,
        writing: 9.0,
        speaking: 9.0,
        status: "published",
      });
      assert.strictEqual(stuAfterCreate.averageScore, 9);
      const mistaken = stuAfterCreate.grades.find(
        (g) => g.assessmentTitle === "Mistaken Entry Test",
      )!;

      const afterDelete = await studentService.deleteGradeRecord({
        studentId: "stu-03",
        gradeId: mistaken.id,
        reason: "Nhập nhầm học viên",
      });
      assert.strictEqual(
        afterDelete.grades.some((g) => g.id === mistaken.id),
        false,
      );
      assert.notStrictEqual(afterDelete.averageScore, 9);
      assert.strictEqual(afterDelete.gradeChangeHistory?.[0].newScore, 0);
      assert.strictEqual(
        afterDelete.gradeChangeHistory?.[0].reason,
        "Nhập nhầm học viên",
      );

      await assert.rejects(
        () =>
          studentService.deleteGradeRecord({
            studentId: "stu-03",
            gradeId: "non-existent-grade-id",
          }),
        NotFoundError,
      );
    });

    it("14.9. getGradesWorkspaceOverview, computeAssessmentSkillAverages, Report PH & CSV ẩn privateNote", async () => {
      const overview = await studentService.getGradesWorkspaceOverview();
      assert.ok(overview.assessmentStats.length >= 1);

      const avgs = computeAssessmentSkillAverages([
        {
          listening: 8,
          reading: 7,
          writing: 6.5,
          speaking: 7.5,
          overall: 7.5,
          status: "published",
        },
        {
          listening: null,
          reading: null,
          writing: null,
          speaking: null,
          overall: null,
          status: "ungraded",
        },
      ]);
      assert.strictEqual(avgs.gradedCount, 1);
      assert.strictEqual(avgs.totalCount, 2);
      assert.strictEqual(avgs.listening, 8);
      assert.strictEqual(avgs.strongestSkill, "Listening");
      assert.strictEqual(avgs.weakestSkill, "Writing");

      const report = buildGradeParentReport({
        assessmentTitle: "Mock Test #3",
        date: "2026-11-20",
        entries: [
          {
            code: "HS-2026-03",
            fullName: "Phạm Hà Phương",
            className: "IELTS Foundation",
            listening: 7,
            reading: 6.5,
            writing: 6,
            speaking: 6.5,
            overall: 6.5,
            comment: "Cần tăng tốc Reading Passage 3",
            delta: 0.5,
          },
        ],
      });
      assert.ok(report.includes("Overall quy chuẩn: 6.5 (+0.5 so với kỳ trước)"));
      assert.ok(report.includes("Cần tăng tốc Reading Passage 3"));

      const csv = buildGradesCsv({
        assessmentTitle: "Mock Test #3",
        rows: [
          {
            code: "HS-2026-03",
            fullName: "Phạm Hà Phương",
            className: "IELTS Foundation",
            date: "2026-11-20",
            status: "published",
            listening: 7,
            reading: 6.5,
            writing: 6,
            speaking: 6.5,
            overall: 6.5,
            comment: "Nhận xét công khai",
          },
        ],
      });
      assert.ok(csv.startsWith("\uFEFF"));
      assert.ok(csv.includes("Mock Test #3"));
      assert.ok(csv.includes("Nhận xét công khai"));
    });
  });
});
