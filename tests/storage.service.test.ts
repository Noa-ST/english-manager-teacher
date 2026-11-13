import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { resetServerEnvCache } from "@/lib/env";
import { resetRuntimeStore } from "@/services/runtime-store";
import * as storageService from "@/services/storage.service";

// Valid magic byte headers for binary file verification
const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const VALID_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const VALID_MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);
const EXE_PE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

function applyTestEnv(overrides: Record<string, string> = {}) {
  process.env.DATABASE_URL =
    "postgresql://postgres:123456@localhost:5432/english_manager?schema=public";
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

describe("Storage System — Cloudinary Free + Supabase Free (14 Core Cases)", () => {
  beforeEach(() => {
    applyTestEnv();
    resetRuntimeStore();
    storageService.resetUploadRateLimit();
  });

  it("1. Upload ảnh lên Cloudinary vào đúng folder và tạo URL tối ưu f_auto,q_auto", async () => {
    const img = await storageService.uploadImage({
      fileName: "student-avatar.png",
      mimeType: "image/png",
      sizeBytes: 512 * 1024,
      category: "student_avatar",
      fileBuffer: VALID_PNG_BYTES,
    });

    assert.equal(img.provider, "cloudinary");
    assert.equal(img.fileType, "IMAGE");
    assert.equal(img.isPublic, true);
    assert.ok(img.cloudinaryPublicId?.startsWith("english-manager/avatars/students/"));
    assert.ok(img.publicUrl?.includes("f_auto,q_auto"));

    const avatarUrl = storageService.getFileUrl(img.id, { preset: "avatar" });
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
    assert.throws(
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

    assert.throws(
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

    const meta = storageService.getFileMetadata(pdf.id);
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

    const logs = storageService.listStorageAuditLogs();
    assert.ok(logs.some((l) => l.action === "ROLLBACK_ORPHAN" && l.status === "ROLLED_BACK"));
  });

  it("12. Kiểm tra ngưỡng Quota (70% warning, 85% critical, 95% tạm khóa upload mới)", async () => {
    // 1) 70% warning: ~26.3 MB / 35 MB = 75.14% -> warning
    applyTestEnv({
      SUPABASE_FREE_STORAGE_LIMIT_MB: "35",
    });
    assert.equal(storageService.checkStorageQuota().supabase.alertLevel, "warning");

    // 2) 85% critical: ~26.3 MB / 30 MB = 87.67% -> critical
    applyTestEnv({
      SUPABASE_FREE_STORAGE_LIMIT_MB: "30",
    });
    assert.equal(storageService.checkStorageQuota().supabase.alertLevel, "critical");

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
});
