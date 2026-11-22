import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { prisma } from "@/lib/db/prisma";
import { resetServerEnvCache } from "@/lib/env";
import { STORED_FILES_DATA } from "@/services/classroom-data";
import { ConflictError, ForbiddenError, NotFoundError } from "@/services/errors";
import * as storageHelpers from "@/services/storage-helpers";
import * as storageService from "@/services/storage.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

// Valid magic byte headers for binary file verification
const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const VALID_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const VALID_MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);
const EXE_PE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

function applyTestEnv(overrides: Record<string, string> = {}) {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ||
      "postgresql://postgres:123456@localhost:5432/english_manager?schema=public";
  }
  process.env.AUTH_SECRET =
    "test-only-auth-secret-with-at-least-32-characters-long";
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
  process.env.MAX_IMAGE_SIZE_MB = "5";
  process.env.MAX_AUDIO_SIZE_MB = "40";
  process.env.MAX_PDF_SIZE_MB = "40";
  process.env.PRIVATE_FILE_URL_TTL_SECONDS = "900";
  process.env.SUPABASE_FREE_STORAGE_LIMIT_MB = "1024";
  process.env.CLOUDINARY_FREE_STORAGE_LIMIT_MB = "1024";
  Object.assign(process.env, overrides);
  resetServerEnvCache();
}

describe("Storage System — Pure Security Validations, Presets & Helpers (Offline)", () => {
  beforeEach(() => {
    applyTestEnv();
    storageService.resetUploadRateLimit();
  });

  it("4. Chặn upload file sai loại hoặc giả mạo Magic Bytes (.exe đổi tên thành .png)", async () => {
    await assert.rejects(
      () =>
        storageService.uploadImage({
          fileName: "malware.exe",
          mimeType: "image/png",
          sizeBytes: 1024,
        }),
      /bị chặn vì lý do bảo mật/i,
    );

    await assert.rejects(
      () =>
        storageService.uploadImage({
          fileName: "spoofed-image.png",
          mimeType: "image/png",
          sizeBytes: 2048,
          fileBuffer: EXE_PE_BYTES,
        }),
      /tệp thực thi \(PE\/MZ\)/i,
    );
  });

  it("5. Chặn upload file vượt quá dung lượng cấu hình (Ảnh > 5MB, Podcast/PDF > 40MB)", async () => {
    await assert.rejects(
      () =>
        storageService.uploadImage({
          fileName: "oversized-photo.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 6 * 1024 * 1024,
        }),
      /vượt quá giới hạn dung lượng cho phép \(5 MB\)/i,
    );

    await assert.rejects(
      () =>
        storageService.uploadPdf({
          fileName: "huge-book.pdf",
          mimeType: "application/pdf",
          sizeBytes: 42 * 1024 * 1024,
        }),
      /vượt quá giới hạn an toàn 40 MB/i,
    );
  });

  it("14. Chặn upload sai Provider (upload PDF qua Cloudinary hoặc upload Ảnh qua Supabase)", async () => {
    await assert.rejects(
      () =>
        storageService.uploadImage({
          fileName: "avatar.png",
          mimeType: "image/png",
          sizeBytes: 100 * 1024,
          provider: "supabase",
        }),
      /Hình ảnh phải định tuyến qua "cloudinary"/i,
    );

    await assert.rejects(
      () =>
        storageService.uploadPdf({
          fileName: "lesson.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100 * 1024,
          provider: "cloudinary",
        }),
      /PDF phải định tuyến qua "supabase"/i,
    );
  });

  it("15. Rate Limiting: Chặn người dùng nếu upload quá tốc độ cho phép (tối đa 25 tệp/phút)", () => {
    const actorId = "abusive-user-123";
    for (let i = 0; i < 25; i++) {
      storageService.checkUploadRateLimit(actorId);
    }

    assert.throws(
      () => storageService.checkUploadRateLimit(actorId),
      /Tốc độ tải tệp vượt quá giới hạn bảo mật/i,
    );
  });

  it("16. Path Traversal & Ký tự độc hại: Chặn tệp có tên chứa ../, null bytes hoặc đuôi file nguy hiểm", () => {
    assert.throws(
      () => storageService.slugifyFileName("../../etc/passwd.png"),
      /chứa ký tự điều hướng đường dẫn/i,
    );

    assert.throws(
      () => storageService.slugifyFileName("malicious-script.php"),
      /bị chặn vì lý do bảo mật/i,
    );

    assert.throws(
      () => storageService.slugifyFileName("virus.bat"),
      /bị chặn vì lý do bảo mật/i,
    );

    const safe = storageService.slugifyFileName("Bài Tập Về Nhà - Tuần 1.pdf");
    assert.equal(safe.extension, "pdf");
    assert.ok(!safe.base.includes(" "));
  });

  it("18a. Báo cáo Tình trạng Kết nối Storage (getStorageStatus)", () => {
    const status = storageService.getStorageStatus();
    assert.ok(status.cloudinaryCloudName);
    assert.ok(status.publicBucket);
    assert.ok(status.privateBucket);
    assert.ok(status.routing);
    assert.equal(status.routing.images, "cloudinary");
    assert.equal(status.routing.audio, "supabase");
    assert.equal(status.routing.documents, "supabase");
  });

  it("19. Image Presets & Cloudinary URL Transforms: Tạo đúng transformation preset avatar, podcast_thumbnail, project, preview", () => {
    const publicId = "english-manager/avatars/students/sample-avatar";
    const avatar = storageService.getOptimizedImageUrl(publicId, "avatar");
    assert.ok(avatar.includes("c_fill,g_auto,w_256,h_256,f_auto,q_auto"));

    const thumb = storageService.getOptimizedImageUrl(publicId, "podcast_thumbnail");
    assert.ok(thumb.includes("c_fill,w_640,h_360,f_auto,q_auto"));

    const project = storageService.getOptimizedImageUrl(publicId, "project");
    assert.ok(project.includes("c_limit,w_1200,h_900,f_auto,q_auto"));

    const preview = storageService.getOptimizedImageUrl(publicId, "preview");
    assert.ok(preview.includes("c_fill,w_400,h_300,f_auto,q_auto"));
  });

  it("34. storage-helpers tính toán Cloudinary presets, Quota alerts và xuất CSV kiểm kê chính xác", () => {
    const presets = storageHelpers.buildCloudinaryPresetUrls(
      "https://res.cloudinary.com/demo-english-manager/image/upload/v1/english-manager/articles/hero-01.jpg",
      "english-manager/articles/hero-01",
    );
    assert.strictEqual(presets.length, 5);
    assert.ok(
      presets.some(
        (p) =>
          p.key === "avatar" &&
          p.url.includes("c_fill,g_auto,w_256,h_256,f_auto,q_auto/english-manager/articles/hero-01"),
      ),
    );

    const lockedAlert = storageHelpers.getQuotaAlertMeta("locked");
    assert.strictEqual(lockedAlert.badgeVariant, "destructive");
    const warningAlert = storageHelpers.getQuotaAlertMeta("warning");
    assert.strictEqual(warningAlert.badgeVariant, "warning");

    assert.strictEqual(storageHelpers.formatStorageBytes(1024 * 1024 * 2), "2.00 MB");
    assert.strictEqual(storageHelpers.formatStorageBytes(5120), "5 KB");
    assert.strictEqual(
      storageHelpers.AUDIT_ACTION_LABELS.TOGGLE_VISIBILITY,
      "Đổi quyền Công khai / Nội bộ",
    );

    const csv = storageHelpers.buildStorageInventoryCsv(STORED_FILES_DATA);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes("Tên tệp gốc"));
    assert.ok(csv.includes("Cloudinary") || csv.includes("CLOUDINARY"));
  });

  it("35. extractCloudinaryPublicIdFromUrl bóc tách đúng public_id Cloudinary và bỏ qua link ngoài / ảnh tĩnh", () => {
    assert.strictEqual(
      storageService.extractCloudinaryPublicIdFromUrl(
        "https://res.cloudinary.com/demo/image/upload/v1732291234/english-manager/projects/2026-11/poster-1.webp",
      ),
      "english-manager/projects/2026-11/poster-1",
    );
    assert.strictEqual(
      storageService.extractCloudinaryPublicIdFromUrl(
        "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_256,h_256,f_auto,q_auto/v1732291234/english-manager/avatars/teachers/2026-11/avatar-1.jpg",
      ),
      "english-manager/avatars/teachers/2026-11/avatar-1",
    );
    assert.strictEqual(
      storageService.extractCloudinaryPublicIdFromUrl(
        "english-manager/podcasts/thumbnails/ep1.png",
      ),
      "english-manager/podcasts/thumbnails/ep1",
    );
    assert.strictEqual(
      storageService.extractCloudinaryPublicIdFromUrl(
        "https://images.unsplash.com/photo-1532012164546-f432f2e3777f",
      ),
      null,
    );
    assert.strictEqual(
      storageService.extractCloudinaryPublicIdFromUrl("/images/teacher-avatar.jpg"),
      null,
    );
  });

  it("36. extractSupabaseStorageTarget bóc tách đúng bucket & path cho URL Supabase Storage / bare key và bỏ qua link ngoài", () => {
    const publicTarget = storageService.extractSupabaseStorageTarget(
      "https://dwurggugjpmmmexjvvee.supabase.co/storage/v1/object/public/english-manager-public/podcasts/2026/11/episode-19.m4a",
    );
    assert.deepStrictEqual(publicTarget, {
      bucket: "english-manager-public",
      storagePath: "podcasts/2026/11/episode-19.m4a",
      visibility: "public",
    });

    const privateTarget = storageService.extractSupabaseStorageTarget(
      "https://dwurggugjpmmmexjvvee.supabase.co/storage/v1/object/sign/english-manager-private/documents/2026/11/worksheet.pdf?token=abc",
    );
    assert.deepStrictEqual(privateTarget, {
      bucket: "english-manager-private",
      storagePath: "documents/2026/11/worksheet.pdf",
      visibility: "private",
    });

    const bareKey = storageService.extractSupabaseStorageTarget(
      "podcasts/2026/11/ep-19.mp3",
    );
    assert.deepStrictEqual(bareKey, {
      bucket: "english-manager-public",
      storagePath: "podcasts/2026/11/ep-19.mp3",
      visibility: "public",
    });

    assert.strictEqual(
      storageService.extractSupabaseStorageTarget("https://example.com/documents/sample.pdf"),
      null,
    );
  });
});

describe(
  "PostgreSQL / Prisma Storage CRUD, Quota & Audit",
  { skip: !hasTestDatabase() },
  () => {
    beforeEach(async () => {
      applyTestEnv();
      await resetAndSeedTestDatabase();
      storageService.resetUploadRateLimit();
    });

    after(async () => {
      await teardownTestDatabase();
    });

    it("1. Upload ảnh lên Cloudinary vào đúng folder và tạo URL tối ưu f_auto,q_auto", async () => {
      const img = await storageService.uploadImage({
        fileName: "teacher-avatar.png",
        mimeType: "image/png",
        sizeBytes: 512 * 1024,
        category: "teacher_avatar",
        fileBuffer: VALID_PNG_BYTES,
      });

      assert.equal(img.provider, "cloudinary");
      assert.equal(img.fileType, "IMAGE");
      assert.equal(img.isPublic, true);
      assert.ok(img.cloudinaryPublicId?.startsWith("english-manager/avatars/teachers/"));
      assert.ok(img.publicUrl?.includes("f_auto,q_auto"));

      const avatarUrl = await storageService.getFileUrl(img.id, { preset: "avatar" });
      assert.ok(avatarUrl.includes("w_256,h_256,f_auto,q_auto"));
    });

    it("2. Upload podcast MP3/M4A lên Supabase Storage (english-manager-public/podcasts)", async () => {
      const podcast = await storageService.uploadPodcast({
        fileName: "episode-15-listening-tips.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 12 * 1024 * 1024,
        visibility: "public",
        fileBuffer: VALID_MP3_BYTES,
      });

      assert.equal(podcast.provider, "supabase");
      assert.equal(podcast.fileType, "AUDIO");
      assert.equal(podcast.bucketName, "english-manager-public");
      assert.ok(podcast.storagePath?.startsWith("podcasts/"));
      assert.ok(podcast.publicUrl?.includes("/storage/v1/object/public/english-manager-public/"));
    });

    it("3. Upload PDF công khai và riêng tư lên đúng bucket Supabase", async () => {
      const publicPdf = await storageService.uploadPdf({
        fileName: "grammar-conditionals.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2 * 1024 * 1024,
        visibility: "public",
        category: "resources/grammar",
        fileBuffer: VALID_PDF_BYTES,
      });
      assert.equal(publicPdf.bucketName, "english-manager-public");
      assert.equal(publicPdf.isPublic, true);
      assert.ok(publicPdf.publicUrl);

      const privatePdf = await storageService.uploadPdf({
        fileName: "ielts-mock-exam-answer-key.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3 * 1024 * 1024,
        visibility: "private",
        category: "answers",
        fileBuffer: VALID_PDF_BYTES,
      });
      assert.equal(privatePdf.bucketName, "english-manager-private");
      assert.equal(privatePdf.isPublic, false);
      // Private files must NEVER persist a signed URL in database metadata
      assert.equal(privatePdf.publicUrl, null);
    });

    it("6. Tạo Signed URL có thời hạn 15 phút (900 giây) cho file riêng tư", async () => {
      const privatePdf = await storageService.uploadPdf({
        fileName: "private-test.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024 * 1024,
        visibility: "private",
        category: "exams",
        fileBuffer: VALID_PDF_BYTES,
      });

      const signed = await storageService.getSignedFileUrl({
        fileId: privatePdf.id,
        actorId: "admin",
        actorRole: "admin",
        downloadName: "De-Thi-Thu.pdf",
      });

      assert.equal(signed.expiresInSeconds, 900);
      assert.ok(signed.url.includes("/storage/v1/object/sign/english-manager-private/"));
      assert.ok(signed.url.includes("token="));
    });

    it("7. Chặn truy cập private file khi chưa đăng nhập hoặc không đủ quyền", async () => {
      const examPdf = await storageService.uploadPdf({
        fileName: "secret-exam.pdf",
        mimeType: "application/pdf",
        sizeBytes: 512 * 1024,
        visibility: "private",
        category: "exams",
        fileBuffer: VALID_PDF_BYTES,
      });

      // Unauthenticated access rejected
      await assert.rejects(
        () =>
          storageService.getSignedFileUrl({
            fileId: examPdf.id,
            actorId: null,
            actorRole: null,
          }),
        /Yêu cầu đăng nhập/i,
      );

      // Student trying to access teacher's `exams` rejected
      await assert.rejects(
        () =>
          storageService.getSignedFileUrl({
            fileId: examPdf.id,
            actorId: "stu-01",
            actorRole: "student",
          }),
        /không có quyền truy cập/i,
      );

      // Direct getFileUrl on private file rejected
      await assert.rejects(
        () => storageService.getFileUrl(examPdf.id),
        /Tệp riêng tư không có Public URL/i,
      );
    });

    it("8. Xóa ảnh Cloudinary: chặn xóa nếu đang được tham chiếu, cho phép xóa khi không còn tham chiếu", async () => {
      const referencedImg = await storageService.uploadImage({
        fileName: "project-cover.webp",
        mimeType: "image/webp",
        sizeBytes: 300 * 1024,
        category: "project",
        referencedBy: ["project:proj-99"],
      });

      await assert.rejects(
        () =>
          storageService.deleteFile({
            id: referencedImg.id,
            actorId: "admin",
            actorRole: "admin",
          }),
        /đang được tham chiếu/i,
      );

      const standaloneImg = await storageService.uploadImage({
        fileName: "temp-banner.png",
        mimeType: "image/png",
        sizeBytes: 200 * 1024,
        category: "announcement",
        fileBuffer: VALID_PNG_BYTES,
      });

      const deleted = await storageService.deleteFile({
        id: standaloneImg.id,
        actorId: "admin",
        actorRole: "admin",
      });
      assert.ok(deleted.deletedAt);
      assert.equal(deleted.publicUrl, null);
    });

    it("9. Xóa PDF Supabase và cập nhật metadata", async () => {
      const pdf = await storageService.uploadPdf({
        fileName: "old-worksheet.pdf",
        mimeType: "application/pdf",
        sizeBytes: 400 * 1024,
        visibility: "public",
        category: "resources/exercises",
        fileBuffer: VALID_PDF_BYTES,
      });

      await storageService.deleteFile({
        id: pdf.id,
        actorId: "admin",
        actorRole: "admin",
      });

      await assert.rejects(
        () => storageService.getFileMetadata(pdf.id),
        /not found/i,
      );
    });

    it("10. Kiểm tra đầy đủ các trường metadata PostgreSQL (StoredFileRecord)", async () => {
      const pdf = await storageService.uploadPdf({
        fileName: "writing-rubric.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1048576,
        visibility: "public",
        category: "resources/grammar",
        fileBuffer: VALID_PDF_BYTES,
      });

      const meta = await storageService.getFileMetadata(pdf.id);
      assert.equal(meta.originalName, "writing-rubric.pdf");
      assert.equal(meta.provider, "supabase");
      assert.equal(meta.fileType, "PDF");
      assert.equal(meta.mimeType, "application/pdf");
      assert.equal(meta.fileSize, 1048576);
      assert.equal(meta.bucketName, "english-manager-public");
      assert.ok(meta.storagePath?.startsWith("resources/grammar/"));
      assert.equal(meta.cloudinaryPublicId, null);
      assert.equal(meta.isPublic, true);
      assert.equal(meta.deletedAt, null);
    });

    it("11. Xử lý lỗi đồng bộ: tự động rollback file trên Storage nếu lưu metadata thất bại", async () => {
      await assert.rejects(
        () =>
          storageService.uploadImage({
            fileName: "rollback-test.png",
            mimeType: "image/png",
            sizeBytes: 120 * 1024,
            category: "resource",
            fileBuffer: VALID_PNG_BYTES,
            simulateMetadataFailure: true,
          }),
        /Simulated PostgreSQL metadata save failure/i,
      );

      const logs = await storageService.listStorageAuditLogs();
      assert.ok(logs.some((l) => l.action === "ROLLBACK_ORPHAN" && l.status === "ROLLED_BACK"));
    });

    it("12. Kiểm tra ngưỡng Quota (70% warning, 85% critical, 95% tạm khóa upload mới)", async () => {
      // 1) 70% warning: ~26.3 MB / 35 MB = 75.14% -> warning
      applyTestEnv({
        SUPABASE_FREE_STORAGE_LIMIT_MB: "35",
      });
      assert.equal((await storageService.checkStorageQuota()).supabase.alertLevel, "warning");

      // 2) 85% critical: ~26.3 MB / 30 MB = 87.67% -> critical
      applyTestEnv({
        SUPABASE_FREE_STORAGE_LIMIT_MB: "30",
      });
      assert.equal((await storageService.checkStorageQuota()).supabase.alertLevel, "critical");

      // 3) 95% lock: Uploading 3 MB pushes total to ~29.3 MB / 30 MB = 97.67% >= 95% -> locked!
      await assert.rejects(
        () =>
          storageService.uploadPdf({
            fileName: "exceed-quota.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3 * 1024 * 1024,
            visibility: "public",
            fileBuffer: VALID_PDF_BYTES,
          }),
        /Tạm khóa tải tệp mới/i,
      );
    });

    it("13. Bảo mật: Không bao giờ làm lộ CLOUDINARY_API_SECRET hoặc SUPABASE_SECRET_KEY trong ticket hay log", async () => {
      applyTestEnv({
        CLOUDINARY_CLOUD_NAME: "my-cloud",
        CLOUDINARY_API_KEY: "123456789",
        CLOUDINARY_API_SECRET: "SUPER_SECRET_CLOUDINARY_KEY_999",
        SUPABASE_SECRET_KEY: "SUPER_SECRET_SUPABASE_SERVICE_ROLE_888",
      });

      const ticket = await storageService.createUploadUrl({
        folder: "projects",
        fileName: "poster.png",
        contentType: "image/png",
        size: 500 * 1024,
        visibility: "public",
      });

      const serializedTicket = JSON.stringify(ticket);
      assert.equal(serializedTicket.includes("SUPER_SECRET_CLOUDINARY_KEY_999"), false);
      assert.equal(serializedTicket.includes("SUPER_SECRET_SUPABASE_SERVICE_ROLE_888"), false);
    });

    it("17. Toggle Quyền riêng tư: Chuyển đổi 1 chạm giữa Public Bucket và Private Bucket cho học liệu", async () => {
      const list = await storageService.listResourceFiles();
      assert.ok(list.length > 0);
      const targetFile = list[0];
      const initialVis = targetFile.visibility;

      const toggled = await storageService.toggleResourceFileVisibility(targetFile.id);
      const expectedVis = initialVis === "public" ? "private" : "public";
      assert.equal(toggled.visibility, expectedVis);

      const toggledBack = await storageService.toggleResourceFileVisibility(targetFile.id);
      assert.equal(toggledBack.visibility, initialVis);
    });

    it("18b. Báo cáo Quota Metrics từ PostgreSQL (checkStorageQuota)", async () => {
      const quota = await storageService.checkStorageQuota();
      assert.ok(quota.cloudinary.trackedStorageBytes >= 0);
      assert.ok(quota.supabase.trackedStorageBytes >= 0);
      assert.equal(quota.cloudinary.storageLimitBytes, 1024 * 1024 * 1024);
      assert.equal(quota.supabase.storageLimitBytes, 1024 * 1024 * 1024);
    });

    it("20. Quản lý Tệp rác (Orphan Files) và Ghi nhận Lịch sử Audit Trail", async () => {
      const pdf = await storageService.uploadPdf({
        fileName: "audit-test.pdf",
        mimeType: "application/pdf",
        sizeBytes: 150 * 1024,
        visibility: "public",
        category: "resources/grammar",
        fileBuffer: VALID_PDF_BYTES,
      });

      const logs = await storageService.listStorageAuditLogs();
      assert.ok(logs.length > 0);
      assert.ok(logs.some((l) => l.action === "UPLOAD_PDF" && l.targetId === pdf.id));

      await storageService.deleteFile({
        id: pdf.id,
        actorId: "admin",
        actorRole: "admin",
      });

      const updatedLogs = await storageService.listStorageAuditLogs();
      assert.ok(updatedLogs.some((l) => l.action === "DELETE_FILE" && l.targetId === pdf.id));
    });

    it("21. Liệt kê thư mục học liệu và phân định quyền hiển thị (listResourceFolders)", async () => {
      const publicFolders = await storageService.listResourceFolders({ publicOnly: true });
      assert.ok(publicFolders.length > 0);
      assert.ok(publicFolders.every((f) => f.visibility === "public"));

      const allFolders = await storageService.listResourceFolders();
      assert.ok(allFolders.length >= publicFolders.length);
    });

    it("22. Tìm kiếm và lọc học liệu số theo thư mục, định dạng file và từ khóa (listResourceFiles)", async () => {
      const writingFiles = await storageService.listResourceFiles({
        folderId: "fld-writing",
      });
      assert.ok(writingFiles.length > 0);
      assert.ok(writingFiles.every((f) => f.folderId === "fld-writing"));

      const pdfFiles = await storageService.listResourceFiles({
        fileType: "PDF",
      });
      assert.ok(pdfFiles.length > 0);
      assert.ok(pdfFiles.every((f) => f.fileType === "PDF"));

      const searchFiles = await storageService.listResourceFiles({
        search: "essay",
      });
      assert.ok(
        searchFiles.every(
          (f) =>
            f.title.toLowerCase().includes("essay") ||
            f.description.toLowerCase().includes("essay") ||
            f.folderName.toLowerCase().includes("essay"),
        ),
      );

      const publicOnlyFiles = await storageService.listResourceFiles({
        publicOnly: true,
      });
      assert.ok(publicOnlyFiles.every((f) => f.visibility === "public"));
    });

    it("23. Thêm mới học liệu số vào thư mục (createResourceFile) và cập nhật số lượng tệp", async () => {
      const foldersBefore = await storageService.listResourceFolders();
      const folder = foldersBefore.find((f) => f.id === "fld-writing")!;
      const initialItemCount = folder.itemCount;

      const newResource = await storageService.createResourceFile({
        title: "IELTS Writing Task 2 Master Template 2026",
        folderId: "fld-writing",
        fileType: "PDF",
        visibility: "public",
        size: "3.2 MB",
        sizeBytes: 3355443,
        pagesOrDuration: "24 trang",
        level: "IELTS 7.0+",
      });

      assert.ok(newResource.id.startsWith("res-"));
      assert.strictEqual(newResource.title, "IELTS Writing Task 2 Master Template 2026");
      assert.strictEqual(newResource.folderId, "fld-writing");
      assert.strictEqual(newResource.visibility, "public");

      // Số lượng tệp của thư mục tự động tăng 1
      const foldersAfter = await storageService.listResourceFolders();
      const updatedFolder = foldersAfter.find((f) => f.id === "fld-writing")!;
      assert.strictEqual(updatedFolder.itemCount, initialItemCount + 1);
    });

    it("24. Xóa học liệu số (deleteResourceFile) và tự động giảm số lượng tệp của thư mục", async () => {
      const created = await storageService.createResourceFile({
        title: "Tài liệu học liệu chuẩn bị xóa",
        folderId: "fld-writing",
        fileType: "WORKSHEET",
      });

      const foldersBefore = await storageService.listResourceFolders();
      const countBefore = foldersBefore.find((f) => f.id === "fld-writing")!.itemCount;

      await storageService.deleteResourceFile(created.id);

      const foldersAfter = await storageService.listResourceFolders();
      const countAfter = foldersAfter.find((f) => f.id === "fld-writing")!.itemCount;
      assert.strictEqual(countAfter, countBefore - 1);

      await assert.rejects(
        async () => {
          await storageService.deleteResourceFile("res-ghost-999");
        },
        (err: unknown) => err instanceof NotFoundError,
      );
    });

    it("25. Bảo mật học liệu riêng tư: Chặn cấp publicUrl cho tài liệu private và tạo Presigned URL an toàn", async () => {
      const privateFile = await storageService.createResourceFile({
        title: "Đề thi thử IELTS nội bộ có đáp án chi tiết",
        folderId: "fld-writing",
        fileType: "PDF",
        visibility: "private",
      });

      assert.strictEqual(privateFile.visibility, "private");
      assert.strictEqual(privateFile.publicUrl, null);

      const signed = await storageService.getSignedFileUrl({
        fileId: privateFile.id,
        actorId: "admin",
        actorRole: "admin",
        expiresInSeconds: 600,
      });
      assert.ok(signed.url);
      assert.ok(signed.url.includes("english-manager-private"));
      assert.strictEqual(signed.expiresInSeconds, 600);
    });

    it("26. Cập nhật thông tin học liệu số (updateResourceFile) bao gồm đổi tên, thư mục, mức độ và quyền riêng tư", async () => {
      const created = await storageService.createResourceFile({
        title: "Chuyên đề Từ vựng Cũ",
        folderId: "fld-writing",
        fileType: "PDF",
        visibility: "public",
        level: "IELTS 6.0",
      });

      const updated = await storageService.updateResourceFile(created.id, {
        title: "Chuyên đề Từ vựng Học thuật 2026 (Đã cập nhật)",
        folderId: "fld-reading",
        level: "IELTS 7.5+",
        visibility: "private",
        description: "Tài liệu cập nhật mới nhất cho học viên nội bộ.",
      });

      assert.strictEqual(updated.id, created.id);
      assert.strictEqual(updated.title, "Chuyên đề Từ vựng Học thuật 2026 (Đã cập nhật)");
      assert.strictEqual(updated.folderId, "fld-reading");
      assert.strictEqual(updated.level, "IELTS 7.5+");
      assert.strictEqual(updated.visibility, "private");
      assert.strictEqual(updated.publicUrl, null, "File private không có publicUrl");

      // Thư mục cũ và mới tự động đồng bộ số lượng tệp
      const folders = await storageService.listResourceFolders();
      const readingFolder = folders.find((f) => f.id === "fld-reading")!;
      assert.ok(readingFolder.itemCount > 0);
    });

    it("27. Đính kèm tệp PDF/Audio/Slide thực tế cho học liệu và đồng bộ sang danh sách StoredFileRecord", async () => {
      const resFile = await storageService.createResourceFile({
        title: "Mock Test Listening Section 3 Audio Pack",
        folderId: "fld-listening",
        fileType: "AUDIO",
        visibility: "public",
        size: "18.5 MB",
        sizeBytes: 19398656,
        publicUrl: "https://mock-supabase.supabase.co/storage/v1/object/public/course-materials/audio/section3.mp3",
        originalName: "section3_audio_pack.mp3",
      });

      assert.strictEqual(resFile.fileType, "AUDIO");
      assert.ok(resFile.publicUrl?.includes(".mp3"));

      // Kiểm tra đã được đồng bộ vào StoredFileRecord
      const stored = await storageService.getFileMetadata(resFile.id);
      assert.ok(stored);
      assert.strictEqual(stored.originalName, "section3_audio_pack.mp3");
      assert.strictEqual(stored.fileType, "AUDIO");
      assert.strictEqual(stored.fileSize, 19398656);
    });

    it("28. Single-Key Upload Registration: giữ nguyên cloudinaryPublicId & storagePath từ Signed Ticket", async () => {
      const imgTicket = await storageService.createUploadUrl({
        folder: "resources",
        fileName: "banner-ielts.png",
        contentType: "image/png",
        size: 245760,
        visibility: "public",
        imageCategory: "announcement",
      });
      assert.ok(imgTicket.cloudinaryPublicId);

      const savedImg = await storageService.uploadImage({
        fileName: "banner-ielts.png",
        mimeType: "image/png",
        sizeBytes: 245760,
        category: "announcement",
        existingPublicId: imgTicket.cloudinaryPublicId ?? undefined,
        existingPublicUrl: imgTicket.publicUrl ?? undefined,
      });
      assert.strictEqual(savedImg.cloudinaryPublicId, imgTicket.cloudinaryPublicId);
      assert.strictEqual(savedImg.storagePath, imgTicket.cloudinaryPublicId);
      if (imgTicket.publicUrl) {
        assert.strictEqual(savedImg.publicUrl, imgTicket.publicUrl);
      }

      const pdfTicket = await storageService.createUploadUrl({
        folder: "documents",
        fileName: "cambridge-pack.pdf",
        contentType: "application/pdf",
        size: 524288,
        visibility: "private",
      });
      assert.ok(pdfTicket.storagePath);

      const savedPdf = await storageService.uploadPdf({
        fileName: "cambridge-pack.pdf",
        mimeType: "application/pdf",
        sizeBytes: 524288,
        visibility: "private",
        category: "internal-documents",
        existingStoragePath: pdfTicket.storagePath,
      });
      assert.strictEqual(savedPdf.storagePath, pdfTicket.storagePath);
      assert.strictEqual(savedPdf.isPublic, false);
      assert.strictEqual(savedPdf.publicUrl, null);
    });

    it("29. toggleResourceFileVisibility xóa publicUrl khi chuyển Private và khôi phục khi chuyển Public", async () => {
      const created = await storageService.createResourceFile(
        {
          title: "Speaking Part 2 Cue Cards",
          folderId: "fld-speaking",
          fileType: "PDF",
          visibility: "public",
          objectKey: "resources/exercises/speaking-cue-cards.pdf",
          originalName: "speaking-cue-cards.pdf",
        },
        "admin-1",
      );
      assert.ok(created.publicUrl);

      const toggledPrivate = await storageService.toggleResourceFileVisibility(
        created.id,
        "admin-1",
      );
      assert.strictEqual(toggledPrivate.visibility, "private");
      assert.strictEqual(toggledPrivate.publicUrl, null);
      assert.strictEqual((await storageService.getFileMetadata(created.id)).isPublic, false);
      assert.strictEqual((await storageService.getFileMetadata(created.id)).publicUrl, null);

      const toggledPublic = await storageService.toggleResourceFileVisibility(
        created.id,
        "admin-1",
      );
      assert.strictEqual(toggledPublic.visibility, "public");
      assert.ok(toggledPublic.publicUrl?.includes("speaking-cue-cards.pdf"));
      assert.strictEqual((await storageService.getFileMetadata(created.id)).isPublic, true);

      const logs = await storageService.listStorageAuditLogs();
      assert.ok(logs.some((log) => log.action === "TOGGLE_VISIBILITY"));
    });

    it("30. replaceFile chuyển giao toàn bộ referencedBy sang tệp mới, cập nhật học liệu và ghi Audit Log", async () => {
      const resFile = await storageService.createResourceFile(
        {
          title: "Writing Task 2 Handbook v1",
          folderId: "fld-writing",
          fileType: "PDF",
          visibility: "public",
          size: "1.2 MB",
          sizeBytes: 1258291,
          objectKey: "resources/exercises/writing-v1.pdf",
          originalName: "writing-v1.pdf",
        },
        "admin-1",
      );

      await prisma.storedFile.update({
        where: { id: resFile.id },
        data: {
          referencedBy: ["classroom:cls-ielts-65", "curriculum:mat-w2"],
        },
      });

      const replaced = await storageService.replaceFile({
        targetFileId: resFile.id,
        replacement: {
          fileName: "writing-v2.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048000,
          category: "resources/exercises",
          existingStoragePath: "resources/exercises/writing-v2-singlekey.pdf",
        },
      });

      assert.deepStrictEqual(replaced.referencedBy, [
        "classroom:cls-ielts-65",
        "curriculum:mat-w2",
      ]);
      assert.strictEqual(replaced.isPublic, true);
      assert.strictEqual(replaced.storagePath, "resources/exercises/writing-v2-singlekey.pdf");
      await assert.rejects(
        () => storageService.getFileMetadata(resFile.id),
        NotFoundError,
      );

      const filesInFolder = await storageService.listResourceFiles({
        folderId: "fld-writing",
      });
      const linkedUpdated = filesInFolder.find(
        (f) =>
          f.id === replaced.id ||
          f.storagePath === "resources/exercises/writing-v2-singlekey.pdf" ||
          f.objectKey === "resources/exercises/writing-v2-singlekey.pdf",
      );
      assert.ok(linkedUpdated);
      assert.strictEqual(linkedUpdated.sizeBytes, 2048000);

      const logs = await storageService.listStorageAuditLogs();
      assert.ok(logs.some((log) => log.action === "REPLACE_FILE"));
    });

    it("31. Folder CRUD: tạo, cập nhật folderName lan truyền xuống tệp và chặn xóa thư mục không rỗng", async () => {
      const folder = await storageService.createResourceFolder({
        name: "Grammar Intensive Vault",
        description: "Ngữ pháp chuyên sâu Band 7.5+",
        visibility: "private",
      });
      assert.strictEqual(folder.visibility, "private");
      assert.strictEqual(folder.itemCount, 0);

      const childFile = await storageService.createResourceFile({
        title: "Inversion & Cleft Sentences",
        folderId: folder.id,
        fileType: "PDF",
        visibility: "private",
        objectKey: "internal-documents/inversion.pdf",
        originalName: "inversion.pdf",
      });

      const renamed = await storageService.updateResourceFolder(folder.id, {
        name: "Grammar C1 Mastery",
        visibility: "public",
      });
      assert.strictEqual(renamed.name, "Grammar C1 Mastery");

      const folderFiles = await storageService.listResourceFiles({
        folderId: folder.id,
      });
      const syncedChild = folderFiles.find((f) => f.id === childFile.id);
      assert.ok(syncedChild);
      assert.strictEqual(syncedChild.folderName, "Grammar C1 Mastery");

      await assert.rejects(
        () => storageService.deleteResourceFolder(folder.id),
        ConflictError,
      );

      await storageService.deleteResourceFile(childFile.id);
      await storageService.deleteResourceFolder(folder.id);

      const remainingFolders = await storageService.listResourceFolders();
      assert.strictEqual(
        remainingFolders.some((f) => f.id === folder.id),
        false,
      );
    });

    it("32. cleanupOrphanedFiles yêu cầu quyền admin, xóa sạch tệp mồ côi và ghi Audit Log", async () => {
      await prisma.orphanedStorageFile.create({
        data: {
          id: "orp-test-1",
          provider: "supabase",
          bucketName: "course-materials-private",
          storagePath: "internal-documents/abandoned-draft.pdf",
          cloudinaryPublicId: null,
          reason: "Rollback metadata thất bại sau upload",
        },
      });

      await assert.rejects(
        () =>
          storageService.cleanupOrphanedFiles({
            actorId: "stu-1",
            actorRole: "student",
          }),
        ForbiddenError,
      );

      const cleanupRes = await storageService.cleanupOrphanedFiles({
        actorId: "admin-1",
        actorRole: "admin",
      });
      assert.strictEqual(cleanupRes.cleanedCount, 1);
      assert.strictEqual(cleanupRes.failedCount, 0);
      assert.strictEqual((await storageService.listOrphanedFiles()).length, 0);

      const logs = await storageService.listStorageAuditLogs();
      assert.ok(logs.some((log) => log.action === "CLEANUP_ORPHANS"));
    });

    it("33. createResourceFile & updateResourceFile ghi Audit Trail và khôi phục publicUrl khi chuyển Private -> Public", async () => {
      const created = await storageService.createResourceFile(
        {
          title: "Listening Dictation Transcript",
          folderId: "fld-listening",
          fileType: "PDF",
          visibility: "private",
          objectKey: "internal-documents/dictation-transcript.pdf",
          originalName: "dictation-transcript.pdf",
        },
        "admin-audit",
      );
      assert.strictEqual(created.visibility, "private");
      assert.strictEqual(created.publicUrl, null);

      const updated = await storageService.updateResourceFile(
        created.id,
        {
          title: "Listening Dictation Transcript (Public Edition)",
          visibility: "public",
        },
        "admin-audit",
      );
      assert.strictEqual(updated.visibility, "public");
      assert.ok(updated.publicUrl?.includes("dictation-transcript.pdf"));

      const logs = await storageService.listStorageAuditLogs();
      assert.ok(logs.some((log) => log.action === "UPLOAD_PDF"));
      assert.ok(logs.some((log) => log.action === "UPDATE_METADATA"));
    });
  },
);
