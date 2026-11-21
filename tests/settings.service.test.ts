import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { prisma } from "@/lib/db/prisma";
import { resetServerEnvCache } from "@/lib/env";
import {
  createStudentAccountSchema,
  resetStudentPasswordSchema,
  toggleAccountActiveSchema,
} from "@/services/account.service";
import { UnauthorizedError, ValidationError } from "@/services/errors";
import * as settingsHelpers from "@/services/settings-helpers";
import * as settingsService from "@/services/settings.service";
import * as storageService from "@/services/storage.service";
import { listAllStudents, verifyStudentPortal } from "@/services/student.service";
import { getClassPerformanceAnalytics } from "@/services/teaching-journal.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

const TEST_DB_PASS = "test-db-pass-only";
const TEST_AUTH_SECRET = "test-auth-secret-with-at-least-32-chars";
const TEST_CLOUDINARY_SECRET = "test-cloudinary-api-secret";
const TEST_SUPABASE_SECRET = "test-supabase-service-secret";

function applyTestEnv(overrides: Record<string, string> = {}) {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    `postgresql://postgres:${TEST_DB_PASS}@localhost:5432/english_manager?schema=public`;
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.ADMIN_EMAIL = "teacher@example.com";
  process.env.CLOUDINARY_CLOUD_NAME = "";
  process.env.CLOUDINARY_API_KEY = "";
  process.env.CLOUDINARY_API_SECRET = "";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_PUBLISHABLE_KEY = "";
  process.env.SUPABASE_SECRET_KEY = "";
  process.env.SUPABASE_PUBLIC_BUCKET = "english-manager-public";
  process.env.SUPABASE_PRIVATE_BUCKET = "english-manager-private";
  process.env.STORAGE_PROVIDER_IMAGES = "cloudinary";
  process.env.STORAGE_PROVIDER_DOCUMENTS = "supabase";
  process.env.STORAGE_PROVIDER_AUDIO = "supabase";
  process.env.PRIVATE_FILE_URL_TTL_SECONDS = "900";
  Object.assign(process.env, overrides);
  resetServerEnvCache();
}

describe("Settings & Teacher Branding Service — Cài đặt Hệ thống & Thương hiệu Giáo viên", () => {
  describe(
    "PostgreSQL / Prisma Settings CRUD",
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

      it("1. Lấy cấu hình hệ thống ban đầu (Default System Settings & Teacher Profile)", async () => {
        const settings = await settingsService.getSystemSettings();

        // Teacher Branding
        assert.equal(settings.name, "ThS. Nguyễn Minh Anh");
        assert.ok(settings.title.includes("Academic English Educator"));
        assert.ok(settings.slogan.includes("Tư duy ngôn ngữ"));
        assert.ok(settings.shortBio.length > 20);
        assert.ok(settings.officeHours.includes("Thứ 3 & Thứ 5"));
        assert.ok(settings.location.includes("Phòng 302"));
        assert.ok(settings.credentials.length >= 3);
        assert.ok(settings.socials.length >= 2);

        // Academic & Security Settings
        assert.equal(settings.currentTerm, "Học kỳ I · Năm học 2026–2027");
        assert.equal(settings.defaultPortalPin, "123456");
        assert.equal(settings.autoNotifyParents, true);
        assert.equal(settings.presignedExpirySeconds, 900);
        assert.equal(settings.lowAttendanceThresholdPercent, 90);
        assert.equal(settings.tuitionReminderDaysBefore, 7);
        assert.equal(settings.requirePortalVerification, true);
      });

      it("2. Cập nhật thông tin thương hiệu giáo viên thành công và tự động trim khoảng trắng", async () => {
        const updated = await settingsService.updateSystemSettings({
          name: "  ThS. Nguyễn Minh Anh (IELTS 8.5)  ",
          title: "  Senior Academic Mentor & Head of Curriculum  ",
          slogan: "  Kiến thức sâu sắc — Tư duy vững vàng  ",
          shortBio: "Hơn 10 năm kinh nghiệm đào tạo học sinh chuyên và du học sinh.",
          officeHours: "Thứ 2, 4, 6 · 15:00 - 18:00",
          location: "Phòng Academic Studio 401 · Cơ sở Nguyễn Du",
        });

        assert.equal(updated.name, "ThS. Nguyễn Minh Anh (IELTS 8.5)");
        assert.equal(updated.title, "Senior Academic Mentor & Head of Curriculum");
        assert.equal(updated.slogan, "Kiến thức sâu sắc — Tư duy vững vàng");
        assert.equal(updated.officeHours, "Thứ 2, 4, 6 · 15:00 - 18:00");
        assert.equal(updated.location, "Phòng Academic Studio 401 · Cơ sở Nguyễn Du");

        // Runtime store sync
        const current = await settingsService.getSystemSettings();
        assert.equal(current.name, "ThS. Nguyễn Minh Anh (IELTS 8.5)");
      });

      it("3. Validate dữ liệu đầu vào: Chặn tên, danh xưng, slogan để trống hoặc vượt giới hạn", async () => {
        // Name trống
        await assert.rejects(
          () => settingsService.updateSystemSettings({ name: "   " }),
          (err: unknown) => err instanceof ValidationError,
        );

        // Name quá dài (> 120 ký tự)
        await assert.rejects(
          () => settingsService.updateSystemSettings({ name: "A".repeat(125) }),
          (err: unknown) => err instanceof ValidationError,
        );

        // Title trống
        await assert.rejects(
          () => settingsService.updateSystemSettings({ title: "" }),
          (err: unknown) => err instanceof ValidationError,
        );

        // Slogan trống
        await assert.rejects(
          () => settingsService.updateSystemSettings({ slogan: "   " }),
          (err: unknown) => err instanceof ValidationError,
        );

        // Email sai định dạng
        await assert.rejects(
          () => settingsService.updateSystemSettings({ email: "not-an-email" }),
          (err: unknown) => err instanceof ValidationError,
        );

        // Avatar URL chứa javascript: protocol
        await assert.rejects(
          () => settingsService.updateSystemSettings({ avatarUrl: "javascript:alert(1)" }),
          (err: unknown) => err instanceof ValidationError,
        );
      });

      it("4. Cập nhật Mật khẩu tra cứu mặc định Cổng học sinh (Portal PIN) & Đồng bộ xác thực", async () => {
        // Cập nhật PIN mới
        const updated = await settingsService.updateSystemSettings({
          defaultPortalPin: "888999",
        });
        assert.equal(updated.defaultPortalPin, "888999");

        // Lấy một học sinh trong PostgreSQL
        const students = await listAllStudents({ status: "active" });
        const student = students[0];
        assert.ok(student);

        // Xác thực bằng PIN mới thành công
        const verifyNew = await verifyStudentPortal({
          studentCode: student.code,
          accessKey: "888999",
        });
        assert.equal(verifyNew.code, student.code);

        // Xác thực bằng PIN sai thất bại
        await assert.rejects(
          () =>
            verifyStudentPortal({
              studentCode: student.code,
              accessKey: "wrong-pin-999",
            }),
          /Mã học sinh hoặc Mật khẩu tra cứu không chính xác/i,
        );
      });

      it("5. Validate PIN tra cứu: Chặn mã PIN quá ngắn (< 4 ký tự) hoặc quá dài (> 32 ký tự)", async () => {
        await assert.rejects(
          () => settingsService.updateSystemSettings({ defaultPortalPin: "12" }),
          (err: unknown) => err instanceof ValidationError,
        );

        await assert.rejects(
          () => settingsService.updateSystemSettings({ defaultPortalPin: "A".repeat(35) }),
          (err: unknown) => err instanceof ValidationError,
        );
      });

      it("6. Cập nhật & Ràng buộc Thời hạn Signed URL (60s đến 3600s)", async () => {
        // Cập nhật hợp lệ 1800s (30 phút) và trần 3600s (1 giờ)
        const valid = await settingsService.updateSystemSettings({
          presignedExpirySeconds: 1800,
        });
        assert.equal(valid.presignedExpirySeconds, 1800);

        const maxValid = await settingsService.updateSystemSettings({
          presignedExpirySeconds: 3600,
        });
        assert.equal(maxValid.presignedExpirySeconds, 3600);

        // Chặn thời hạn dưới 60s
        await assert.rejects(
          () => settingsService.updateSystemSettings({ presignedExpirySeconds: 30 }),
          (err: unknown) => err instanceof ValidationError,
        );

        // Chặn thời hạn trên 3600s (1 giờ)
        await assert.rejects(
          () => settingsService.updateSystemSettings({ presignedExpirySeconds: 3601 }),
          (err: unknown) => err instanceof ValidationError,
        );
        await assert.rejects(
          () => settingsService.updateSystemSettings({ presignedExpirySeconds: 100000 }),
          (err: unknown) => err instanceof ValidationError,
        );
      });

      it("7. Cập nhật Học kỳ hiện tại & Chuyển đổi trạng thái Tự động nhắc Phụ huynh (autoNotifyParents)", async () => {
        const updated = await settingsService.updateSystemSettings({
          currentTerm: "Học kỳ II · Năm học 2026–2027 (Sprint Luyện đề)",
          autoNotifyParents: false,
        });
        assert.equal(updated.currentTerm, "Học kỳ II · Năm học 2026–2027 (Sprint Luyện đề)");
        assert.equal(updated.autoNotifyParents, false);
        assert.equal(updated.requirePortalVerification, true);

        const reUpdated = await settingsService.updateSystemSettings({
          autoNotifyParents: true,
        });
        assert.equal(reUpdated.autoNotifyParents, true);
      });

      it("8. Cập nhật từng phần (Partial Update): Bảo toàn các trường không được truyền vào", async () => {
        const original = await settingsService.getSystemSettings();

        // Chỉ cập nhật officeHours
        const partial = await settingsService.updateSystemSettings({
          officeHours: "Thứ Bảy · 08:30 - 11:30",
        });

        assert.equal(partial.officeHours, "Thứ Bảy · 08:30 - 11:30");
        // Các trường khác giữ nguyên
        assert.equal(partial.name, original.name);
        assert.equal(partial.title, original.title);
        assert.equal(partial.slogan, original.slogan);
        assert.equal(partial.currentTerm, original.currentTerm);
        assert.equal(partial.defaultPortalPin, original.defaultPortalPin);
      });

      it("9. Cập nhật Bằng cấp chuyên môn (Credentials) & Mạng xã hội (Socials)", async () => {
        const newCredentials = [
          "M.A. in Applied Linguistics — University of Oxford",
          "IELTS 8.5 Overall (Reading 9.0, Listening 9.0)",
          "Cambridge Delta Module 1 & 2 Pass",
        ];
        const newSocials = [
          { label: "YouTube Channel", href: "https://youtube.com/@teacher.minhanh", handle: "@teacher.minhanh" },
          { label: "Substack Newsletter", href: "https://minhanh.substack.com", handle: "minhanh.academic" },
        ];

        const updated = await settingsService.updateSystemSettings({
          credentials: newCredentials,
          socials: newSocials,
        });

        assert.equal(updated.credentials.length, 3);
        assert.equal(updated.credentials[0], newCredentials[0]);
        assert.equal(updated.socials.length, 2);
        assert.equal(updated.socials[0].label, "YouTube Channel");
      });

      it("10. Khôi phục Cài đặt Mặc định (Reset System Settings)", async () => {
        // Thay đổi cài đặt
        await settingsService.updateSystemSettings({
          name: "Tên Tạm Thời",
          defaultPortalPin: "999999",
          presignedExpirySeconds: 3600,
          lowAttendanceThresholdPercent: 75,
          tuitionReminderDaysBefore: 14,
        });

        // Reset về mặc định
        const restored = await settingsService.resetSystemSettings();
        assert.equal(restored.name, "ThS. Nguyễn Minh Anh");
        assert.equal(restored.defaultPortalPin, "123456");
        assert.equal(restored.presignedExpirySeconds, 900);
        assert.equal(restored.lowAttendanceThresholdPercent, 90);
        assert.equal(restored.tuitionReminderDaysBefore, 7);
        assert.equal(restored.currentTerm, "Học kỳ I · Năm học 2026–2027");
      });

      it("11. Bảng màu Hệ thống Thương hiệu (Design System Tokens Invariants)", () => {
        const tokens = settingsService.getDesignTokens();

        assert.equal(tokens.primary.hex, "#243B64");
        assert.equal(tokens.accent.hex, "#6C8FE6");
        assert.equal(tokens.secondary.hex, "#B9D8F5");
        assert.equal(tokens.warm.hex, "#F5EEDC");
        assert.equal(tokens.coral.hex, "#F3A98B");

        assert.ok(tokens.primary.role.includes("Màu chủ đạo"));
        assert.ok(tokens.accent.role.includes("Điểm nhấn"));
      });

      it("12. Trích xuất Hồ sơ Thương hiệu Công khai (getTeacherBrandProfile)", async () => {
        const profile = await settingsService.getTeacherBrandProfile();

        assert.equal(profile.name, "ThS. Nguyễn Minh Anh");
        assert.ok(profile.title);
        assert.ok(profile.slogan);
        assert.ok(profile.shortBio);
        assert.ok(profile.philosophy);
        assert.ok(profile.credentials.length > 0);
        assert.ok(profile.socials.length > 0);
      });

      it("13. Ràng buộc Tạo tài khoản Học sinh (createStudentAccountSchema)", () => {
        // Thiếu studentId
        assert.throws(
          () =>
            createStudentAccountSchema.parse({
              studentId: "   ",
              email: "student@example.com",
              password: "password123",
            }),
          /Vui lòng chọn hồ sơ học sinh/i,
        );

        // Email sai định dạng
        assert.throws(
          () =>
            createStudentAccountSchema.parse({
              studentId: "stu-1",
              email: "bad-email",
              password: "password123",
            }),
          /Email học sinh không đúng định dạng/i,
        );

        // Mật khẩu quá ngắn (< 8 ký tự)
        assert.throws(
          () =>
            createStudentAccountSchema.parse({
              studentId: "stu-1",
              email: "student@example.com",
              password: "short",
            }),
          /Mật khẩu tối thiểu 8 ký tự/i,
        );

        // Hợp lệ
        const valid = createStudentAccountSchema.parse({
          studentId: "stu-1",
          email: "Student.Valid@Example.Com",
          password: "strongPassword123",
        });
        assert.equal(valid.studentId, "stu-1");
      });

      it("14. Ràng buộc Khóa / Mở khóa Tài khoản Học sinh (toggleAccountActiveSchema)", () => {
        // profileId không phải UUID
        assert.throws(
          () =>
            toggleAccountActiveSchema.parse({
              profileId: "invalid-id",
              isActive: false,
            }),
          /ID tài khoản không hợp lệ/i,
        );

        // Hợp lệ với UUID chuẩn
        const valid = toggleAccountActiveSchema.parse({
          profileId: "c18f3a38-5182-4916-a33d-cbb3a3a79d01",
          isActive: true,
        });
        assert.equal(valid.isActive, true);
      });

      it("15. Ràng buộc Đặt lại Mật khẩu Học sinh (resetStudentPasswordSchema)", () => {
        // Mật khẩu mới dưới 8 ký tự
        assert.throws(
          () =>
            resetStudentPasswordSchema.parse({
              profileId: "c18f3a38-5182-4916-a33d-cbb3a3a79d01",
              newPassword: "123",
            }),
          /Mật khẩu mới tối thiểu 8 ký tự/i,
        );

        // Hợp lệ
        const valid = resetStudentPasswordSchema.parse({
          profileId: "c18f3a38-5182-4916-a33d-cbb3a3a79d01",
          newPassword: "NewSecretPassword2026!",
        });
        assert.equal(valid.newPassword, "NewSecretPassword2026!");
      });

      // Re-enabled in Đợt 3 once verifyStudentPortal reads Settings from Prisma
      it("16. Loại bỏ backdoor PIN cứng ('123456' / 'HS2026'): Chỉ chấp nhận PIN hiện hành", async () => {
        await settingsService.updateSystemSettings({ defaultPortalPin: "NEWPIN26" });
        const students = await listAllStudents({ status: "active" });
        const student = students[0];
        assert.ok(student);

        await assert.rejects(
          () =>
            verifyStudentPortal({
              studentCode: student.code,
              accessKey: "123456",
            }),
          (err: unknown) => err instanceof UnauthorizedError,
        );
        await assert.rejects(
          () =>
            verifyStudentPortal({
              studentCode: student.code,
              accessKey: "HS2026",
            }),
          (err: unknown) => err instanceof UnauthorizedError,
        );

        // Chỉ PIN mới "NEWPIN26" mới được xác thực
        const verified = await verifyStudentPortal({
          studentCode: student.code,
          accessKey: "NEWPIN26",
        });
        assert.equal(verified.code, student.code);
      });

      // Re-enabled in Đợt 2 once storageService reads Settings from Prisma
      it("17. Hiệu lực tức thì sang Storage: getSignedFileUrl dùng presignedExpirySeconds từ Settings", async () => {
        await settingsService.updateSystemSettings({ presignedExpirySeconds: 1800 });
        const privatePdf = await storageService.uploadPdf({
          fileName: "settings-ttl-test.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          visibility: "private",
          category: "internal-documents",
        });

        const signed = await storageService.getSignedFileUrl({
          fileId: privatePdf.id,
          actorId: "admin-settings",
          actorRole: "admin",
        });
        assert.equal(signed.expiresInSeconds, 1800);
      });

      it("18. Hiệu lực tức thì sang Class Analytics: Ngưỡng chuyên cần thấp & nhắc hạn học phí", async () => {
        await assert.rejects(
          () => settingsService.updateSystemSettings({ lowAttendanceThresholdPercent: 49 }),
          (err: unknown) => err instanceof ValidationError,
        );
        await assert.rejects(
          () => settingsService.updateSystemSettings({ lowAttendanceThresholdPercent: 101 }),
          (err: unknown) => err instanceof ValidationError,
        );
        await assert.rejects(
          () => settingsService.updateSystemSettings({ tuitionReminderDaysBefore: 0 }),
          (err: unknown) => err instanceof ValidationError,
        );

        const activeStudents = await listAllStudents({ status: "active" });
        const stu = activeStudents[0];
        assert.ok(stu);
        await prisma.student.update({
          where: { id: stu.id },
          data: { attendanceRate: 84 },
        });
        await prisma.attendanceRecord.create({
          data: {
            id: "att-settings-sync-1",
            studentId: stu.id,
            classroomId: stu.classId,
            date: "2026-11-20",
            sessionName: "Speaking Feedback",
            status: "late",
          },
        });

        // Mặc định 90%: 84 < 90 -> có cảnh báo low-attendance
        const defaultAnalytics = await getClassPerformanceAnalytics({ period: "all" });
        assert.ok(
          defaultAnalytics.alerts.some(
            (a) => a.type === "low-attendance" && a.studentId === stu.id,
          ),
        );

        // Giảm ngưỡng xuống 80%: 84 >= 80 -> không còn cảnh báo low-attendance cho học sinh này
        const updated = await settingsService.updateSystemSettings({
          lowAttendanceThresholdPercent: 80,
          tuitionReminderDaysBefore: 10,
        });
        assert.equal(updated.lowAttendanceThresholdPercent, 80);
        assert.equal(updated.tuitionReminderDaysBefore, 10);

        const relaxedAnalytics = await getClassPerformanceAnalytics({ period: "all" });
        assert.equal(
          relaxedAnalytics.alerts.some(
            (a) => a.type === "low-attendance" && a.studentId === stu.id,
          ),
          false,
        );
      });

      it("19. Bảo mật Hồ sơ Công khai: getTeacherBrandProfile KHÔNG rò rỉ PIN, TTL hay cấu hình nội bộ", async () => {
        await settingsService.updateSystemSettings({
          defaultPortalPin: "SECRET-8888",
          presignedExpirySeconds: 1200,
        });

        const profile = await settingsService.getTeacherBrandProfile();
        const record = profile as unknown as Record<string, unknown>;
        assert.equal(record.defaultPortalPin, undefined);
        assert.equal(record.presignedExpirySeconds, undefined);
        assert.equal(record.autoNotifyParents, undefined);
        assert.equal(record.lowAttendanceThresholdPercent, undefined);
        assert.equal(record.tuitionReminderDaysBefore, undefined);
      });

      it("20. Nhật ký Thay đổi Cài đặt (Settings Audit Log): Ghi đầy đủ hành động & ẩn giá trị PIN", async () => {
        await settingsService.updateSystemSettings({ name: "ThS. Nguyễn Minh Anh (2027)" }, "admin-1");
        await settingsService.updateSystemSettings({ defaultPortalPin: "TopSecret99" }, "admin-1");
        await settingsService.resetSystemSettings("admin-1");

        const logs = await settingsService.listSettingsAuditLogs();
        assert.ok(logs.some((l) => l.action === "UPDATE_BRAND"));
        assert.ok(logs.some((l) => l.action === "UPDATE_SECURITY"));
        assert.ok(logs.some((l) => l.action === "RESET_SETTINGS"));

        // Tuyệt đối không lưu PIN thô vào Audit Log
        const serialized = JSON.stringify(logs);
        assert.equal(serialized.includes("TopSecret99"), false);
      });

      it("21. System Health Summary & Sanitized Snapshot Export không lộ khóa bí mật", async () => {
        applyTestEnv({
          CLOUDINARY_CLOUD_NAME: "demo-cloud",
          CLOUDINARY_API_KEY: "test-cloud-key",
          CLOUDINARY_API_SECRET: TEST_CLOUDINARY_SECRET,
          SUPABASE_URL: "https://demo-project.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "test-supa-pub-key",
          SUPABASE_SECRET_KEY: TEST_SUPABASE_SECRET,
        });
        const healthDefault = await settingsService.getSystemHealthSummary();
        assert.equal(healthDefault.checks.length, 5);
        assert.equal(healthDefault.security.isUsingDefaultPortalPin, true);
        assert.equal(healthDefault.overallStatus, "warning");

        // Tuyệt đối không lộ khóa bí mật .env
        const healthJson = JSON.stringify(healthDefault);
        assert.equal(healthJson.includes(TEST_DB_PASS), false);
        assert.equal(healthJson.includes(TEST_AUTH_SECRET), false);
        assert.equal(healthJson.includes(TEST_CLOUDINARY_SECRET), false);
        assert.equal(healthJson.includes(TEST_SUPABASE_SECRET), false);

        // Đổi PIN mới giúp health về trạng thái "healthy"
        await settingsService.updateSystemSettings({ defaultPortalPin: "CustomPin2027" });
        const healthUpdated = await settingsService.getSystemHealthSummary();
        assert.equal(healthUpdated.security.isUsingDefaultPortalPin, false);
        assert.equal(healthUpdated.overallStatus, "healthy");

        // Xuất bản sao lưu JSON: che giấu PIN và ghi Audit Log
        const snapshot = await settingsService.exportSystemSnapshot("admin-snapshot");
        assert.equal(snapshot.settings.defaultPortalPin, "[REDACTED]");
        assert.equal(snapshot.exportedBy, "admin-snapshot");
        assert.ok(snapshot.summary.classroomsCount > 0);
        const afterExportLogs = await settingsService.listSettingsAuditLogs();
        assert.ok(afterExportLogs.some((l) => l.action === "EXPORT_SNAPSHOT"));
      });
    },
  );

  it("22. Pure Helpers (settings-helpers.ts): Kiểm tra độ mạnh PIN, sinh PIN/MK, định dạng TTL & tên tệp", () => {
    const weakDefault = settingsHelpers.evaluatePortalPinStrength("123456");
    assert.equal(weakDefault.level, "weak");
    const weakBackdoor = settingsHelpers.evaluatePortalPinStrength("HS2026");
    assert.equal(weakBackdoor.level, "weak");
    const strong = settingsHelpers.evaluatePortalPinStrength("M9kP4vR8");
    assert.equal(strong.level, "strong");

    const genPin = settingsHelpers.generateStrongPortalPin(8);
    assert.equal(genPin.length, 8);
    assert.ok(/[A-Z]/.test(genPin) && /\d/.test(genPin));

    const genPass = settingsHelpers.generateStrongAccountPassword(12);
    assert.equal(genPass.length, 12);
    assert.ok(/[A-Z]/.test(genPass) && /[a-z]/.test(genPass) && /\d/.test(genPass));

    assert.equal(settingsHelpers.formatExpiryDuration(900), "15 phút (900 giây)");
    assert.equal(settingsHelpers.formatExpiryDuration(90), "1 phút 30 giây (90 giây)");
    assert.equal(settingsHelpers.formatExpiryDuration(45), "45 giây");

    const fileName = settingsHelpers.buildSnapshotFilename(
      new Date("2026-11-21T00:00:00.000Z"),
    );
    assert.equal(fileName, "english-manager-snapshot-2026-11-21.json");
    assert.equal(
      settingsHelpers.SETTINGS_AUDIT_ACTION_LABELS.EXPORT_SNAPSHOT,
      "Xuất bản Sao lưu JSON",
    );
    assert.equal(settingsHelpers.BRAND_DESIGN_TOKENS.primary.hex, "#243B64");
  });
});
