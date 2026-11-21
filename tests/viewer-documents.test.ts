import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import {
  RESOURCE_FILES_DATA,
  RESOURCE_FOLDERS_DATA,
  type ResourceFileItem,
  type ResourceFolder,
} from "@/services/classroom-data";
import * as documentsHelpers from "@/services/documents-helpers";
import * as storageService from "@/services/storage.service";
import * as viewerOverviewService from "@/services/viewer-overview.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

describe("Viewer Public Documents Library Service & Helpers — /documents", () => {
  it("1. normalizeDocumentSearch & matchesNormalizedDocumentText khử dấu tiếng Việt và an toàn từ khóa ngắn", () => {
    assert.equal(
      documentsHelpers.normalizeDocumentSearch("  Mệnh đề Quan hệ & Sổ tay Từ vựng  "),
      "menh de quan he & so tay tu vung",
    );
    assert.equal(
      documentsHelpers.normalizeDocumentSearch("Đề cương Ôn tập Đọc hiểu"),
      "de cuong on tap doc hieu",
    );

    assert.equal(
      documentsHelpers.matchesNormalizedDocumentText("Mệnh đề Quan hệ Rút gọn", "menh de"),
      true,
    );
    assert.equal(
      documentsHelpers.matchesNormalizedDocumentText("Bộ 10 Bài đọc Khoa học", "ai"),
      false,
      "Từ khóa ngắn 'ai' không được khớp nhầm âm tiết 'bài'",
    );
  });

  it("2. isSafePublicDocumentUrl chỉ chấp nhận https://, http:// hoặc đường dẫn /... an toàn", () => {
    assert.equal(
      documentsHelpers.isSafePublicDocumentUrl("https://example.supabase.co/doc.pdf"),
      true,
    );
    assert.equal(
      documentsHelpers.isSafePublicDocumentUrl("http://localhost:3000/files/sample.pdf"),
      true,
    );
    assert.equal(documentsHelpers.isSafePublicDocumentUrl("/files/sample.pdf"), true);

    assert.equal(documentsHelpers.isSafePublicDocumentUrl("javascript:alert(1)"), false);
    assert.equal(documentsHelpers.isSafePublicDocumentUrl("data:text/html,hi"), false);
    assert.equal(documentsHelpers.isSafePublicDocumentUrl("//evil.com/doc.pdf"), false);
    assert.equal(documentsHelpers.isSafePublicDocumentUrl(""), false);
    assert.equal(documentsHelpers.isSafePublicDocumentUrl(null), false);
  });

  it("3. sanitizeDocumentFilesForPublic loại tệp private/đã xóa mềm & xóa triệt để 8 trường hạ tầng nội bộ", () => {
    const files = structuredClone(RESOURCE_FILES_DATA);
    const deletedPublic: ResourceFileItem = {
      ...files[0],
      id: "res-deleted-pub",
      visibility: "public",
      deletedAt: "2026-11-20T09:00:00.000Z",
    };
    const publicWithInfra: ResourceFileItem = {
      ...files[0],
      id: "res-pub-infra",
      visibility: "public",
      deletedAt: null,
      objectKey: "resources/secret-key.pdf",
      provider: "supabase",
      bucketName: "english-manager-public",
      storagePath: "resources/secret-path.pdf",
      cloudinaryPublicId: "secret-cid",
      ownerId: "admin-1",
      storedName: "uuid-secret.pdf",
      publicUrl: "javascript:alert(1)",
    };

    const sanitized = documentsHelpers.sanitizeDocumentFilesForPublic([
      ...files,
      deletedPublic,
      publicWithInfra,
    ]);

    assert.equal(
      sanitized.some((f) => f.id === "res-6"),
      false,
      "Không được xuất tệp nội bộ private (res-6)",
    );
    assert.equal(
      sanitized.some((f) => f.id === "res-deleted-pub"),
      false,
      "Không được xuất tệp đã xóa mềm",
    );

    const cleaned = sanitized.find((f) => f.id === "res-pub-infra");
    assert.ok(cleaned);
    assert.equal(cleaned.publicUrl, null, "URL không an toàn phải thành null");

    const forbiddenKeys = [
      "objectKey",
      "provider",
      "bucketName",
      "storagePath",
      "cloudinaryPublicId",
      "ownerId",
      "storedName",
      "deletedAt",
    ] as const;

    for (const key of forbiddenKeys) {
      assert.equal(
        key in cleaned,
        false,
        `Không được rò rỉ trường nội bộ "${key}" ra Cổng công khai`,
      );
    }

    // Kiểm tra mảng previewSummary được nhân bản độc lập
    cleaned.previewSummary.push("EXTRA");
    assert.equal(files[0].previewSummary.includes("EXTRA"), false);
  });

  it("4. sanitizeDocumentFoldersForPublic loại thư mục private & tính chính xác itemCount từ tệp công khai thực tế", () => {
    const files = structuredClone(RESOURCE_FILES_DATA);
    const folders = structuredClone(RESOURCE_FOLDERS_DATA);
    const publicFiles = documentsHelpers.sanitizeDocumentFilesForPublic(files);
    const foldersWithStaticMismatch: ResourceFolder[] = folders.map((f) => ({
      ...f,
      itemCount: 99,
    }));

    const publicFolders = documentsHelpers.sanitizeDocumentFoldersForPublic(
      foldersWithStaticMismatch,
      publicFiles,
    );

    assert.equal(
      publicFolders.some((f) => f.id === "fld-internal"),
      false,
      "Thư mục private fld-internal phải bị ẩn",
    );

    const writingFolder = publicFolders.find((f) => f.id === "fld-writing");
    assert.equal(
      writingFolder?.itemCount,
      2,
      "fld-writing thực tế có 2 tệp công khai (không phải số tĩnh 18 hay 99)",
    );

    const sumCounts = publicFolders.reduce((acc, f) => acc + f.itemCount, 0);
    assert.equal(
      sumCounts,
      publicFiles.length,
      "Tổng itemCount trên các thư mục công khai phải khớp đúng tổng tệp công khai",
    );
  });

  it("5. filterAndSortDocuments hỗ trợ tìm không dấu (cả mục lục), lọc thư mục/loại/trình độ & sắp xếp", () => {
    const files = structuredClone(RESOURCE_FILES_DATA);
    const extraImage: ResourceFileItem = {
      ...files[0],
      id: "res-img-1",
      folderId: "fld-writing",
      folderName: "01. Academic Writing & Essays",
      title: "Sơ đồ Mindmap Essay Structure",
      description: "Hình ảnh minh họa bố cục bài luận học thuật.",
      fileType: "IMAGE",
      size: "850 KB",
      sizeBytes: 870400,
      updatedAt: "15/11/2026",
      downloads: 12,
      level: "B2 – C1",
      visibility: "public",
      publicUrl: "https://res.cloudinary.com/demo/image/upload/mindmap.jpg",
      previewSummary: ["Sơ đồ tư duy 4 đoạn chuẩn Academic"],
    };

    const pub = documentsHelpers.sanitizeDocumentFilesForPublic([
      ...files,
      extraImage,
    ]);

    // Tìm theo mục lục không dấu
    const bySummary = documentsHelpers.filterAndSortDocuments(pub, {
      search: "nhuong bo",
    });
    assert.equal(bySummary.length, 1);
    assert.equal(bySummary[0].id, "res-2");

    // Lọc đúng định dạng IMAGE
    const images = documentsHelpers.filterAndSortDocuments(pub, {
      fileType: "IMAGE",
    });
    assert.equal(images.length, 1);
    assert.equal(images[0].id, "res-img-1");

    // Lọc theo trình độ & sắp xếp theo lượt tải nhiều nhất
    const byLevelAndDownloads = documentsHelpers.filterAndSortDocuments(pub, {
      level: "B2 – C1",
      sortBy: "downloads_desc",
    });
    assert.equal(byLevelAndDownloads.length, 3);
    assert.equal(byLevelAndDownloads[0].id, "res-1"); // 342
    assert.equal(byLevelAndDownloads[1].id, "res-4"); // 178
    assert.equal(byLevelAndDownloads[2].id, "res-img-1"); // 12

    // Sắp xếp theo dung lượng tăng dần
    const bySizeAsc = documentsHelpers.filterAndSortDocuments(pub, {
      sortBy: "size_asc",
    });
    assert.equal(bySizeAsc[0].id, "res-img-1");
  });

  it("6. countDocumentsByFileType, extractDocumentLevels & computeDocumentsStats tính toán chuẩn xác", () => {
    const files = structuredClone(RESOURCE_FILES_DATA);
    const folders = structuredClone(RESOURCE_FOLDERS_DATA);
    const pubFiles = documentsHelpers.sanitizeDocumentFilesForPublic(files);
    const pubFolders = documentsHelpers.sanitizeDocumentFoldersForPublic(
      folders,
      pubFiles,
    );

    const allCounts = documentsHelpers.countDocumentsByFileType(pubFiles);
    assert.deepEqual(allCounts, {
      all: 5,
      PDF: 2,
      WORKSHEET: 1,
      SLIDE: 1,
      AUDIO: 1,
      IMAGE: 0,
    });

    const writingCounts = documentsHelpers.countDocumentsByFileType(
      pubFiles,
      "fld-writing",
    );
    assert.equal(writingCounts.all, 2);
    assert.equal(writingCounts.PDF, 1);
    assert.equal(writingCounts.SLIDE, 1);

    const levels = documentsHelpers.extractDocumentLevels(pubFiles);
    assert.deepEqual(levels, ["B1 – B2", "B1+ – B2", "B2 – C1", "Band 6.5+"]);

    const stats = documentsHelpers.computeDocumentsStats(pubFolders, pubFiles);
    assert.equal(stats.totalFiles, 5);
    assert.equal(stats.totalFolders, 4);
    assert.equal(stats.totalDownloads, 342 + 215 + 289 + 178 + 264);
    assert.equal(stats.latestUpdatedAt, "11/11/2026");
  });

  describe(
    "DB-backed Storage & Overview Snapshot",
    { skip: !hasTestDatabase() },
    () => {
      beforeEach(async () => {
        await resetAndSeedTestDatabase();
      });

      after(async () => {
        await teardownTestDatabase();
      });

      it("7. storageService.listResourceFiles (không dấu & level) & recordPublicResourceDownload tăng lượt tải thật, chặn private", async () => {
        const bySearch = await storageService.listResourceFiles({
          publicOnly: true,
          search: "menh de quan he",
        });
        assert.equal(bySearch.length, 1);
        assert.equal(bySearch[0].id, "res-5");

        const byLevel = await storageService.listResourceFiles({
          publicOnly: true,
          level: "Band 6.5+",
        });
        assert.equal(byLevel.length, 1);
        assert.equal(byLevel[0].id, "res-2");

        const before = (
          await storageService.listResourceFiles({ publicOnly: true })
        ).find((f) => f.id === "res-1");
        assert.ok(before);
        const downloadsBefore = before.downloads;
        const dlResult =
          await storageService.recordPublicResourceDownload("res-1");
        assert.equal(dlResult.downloads, downloadsBefore + 1);

        await assert.rejects(
          async () => {
            await storageService.recordPublicResourceDownload("res-6");
          },
          { name: "ForbiddenError" },
        );
      });

      it("8. getPublicOverviewData chỉ trả tệp public và xóa sạch 8 trường hạ tầng nội bộ", async () => {
      const overview = await viewerOverviewService.getPublicOverviewData(
        new Date("2026-11-21T09:00:00"),
      );

      assert.ok(overview.resources.length > 0);
      assert.ok(overview.resources.every((r) => r.visibility === "public"));
      for (const r of overview.resources) {
        assert.equal("objectKey" in r, false);
        assert.equal("provider" in r, false);
        assert.equal("bucketName" in r, false);
        assert.equal("storagePath" in r, false);
        assert.equal("cloudinaryPublicId" in r, false);
        assert.equal("ownerId" in r, false);
        assert.equal("storedName" in r, false);
        assert.equal("deletedAt" in r, false);
      }
    });
  });
});
