import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import {
  STUDENT_PROJECTS_DATA,
  type StudentProjectItem,
} from "@/services/classroom-data";
import * as cmsService from "@/services/cms.service";
import * as showcaseHelpers from "@/services/showcase-helpers";
import * as viewerOverviewService from "@/services/viewer-overview.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

describe("Viewer Public Student Showcase Service & Helpers — /showcase", () => {
  it("1. normalizeShowcaseSearch khử dấu tiếng Việt và chữ đ/Đ chính xác", () => {
    assert.equal(
      showcaseHelpers.normalizeShowcaseSearch("  Đồ án Nghiên cứu Đô thị  "),
      "do an nghien cuu do thi",
    );
    assert.equal(
      showcaseHelpers.normalizeShowcaseSearch("Tranh biện Tiếng Anh B2–C1"),
      "tranh bien tieng anh b2–c1",
    );
  });

  it("2. isSafePublicUrl & resolveSafeVideoEmbedUrl chỉ cho phép YouTube/Vimeo embed tin cậy", () => {
    assert.equal(
      showcaseHelpers.isSafePublicUrl("https://res.cloudinary.com/demo/poster.jpg"),
      true,
    );
    assert.equal(showcaseHelpers.isSafePublicUrl("/documents"), true);
    assert.equal(showcaseHelpers.isSafePublicUrl("javascript:alert(1)"), false);
    assert.equal(showcaseHelpers.isSafePublicUrl("data:text/html,<svg>"), false);
    assert.equal(showcaseHelpers.isSafePublicUrl("//evil.com/x.pdf"), false);

    // YouTube -> youtube-nocookie.com
    assert.equal(
      showcaseHelpers.resolveSafeVideoEmbedUrl(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      ),
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    assert.equal(
      showcaseHelpers.resolveSafeVideoEmbedUrl("https://youtu.be/2vjPBrBU-TM"),
      "https://www.youtube-nocookie.com/embed/2vjPBrBU-TM",
    );
    // Vimeo -> player.vimeo.com
    assert.equal(
      showcaseHelpers.resolveSafeVideoEmbedUrl("https://vimeo.com/76979871"),
      "https://player.vimeo.com/video/76979871",
    );

    // Chặn tuyệt đối iframe URL tùy ý (ví dụ website lạ hoặc javascript:)
    assert.equal(
      showcaseHelpers.resolveSafeVideoEmbedUrl("https://evil.com/phishing-iframe"),
      null,
    );
    assert.equal(
      showcaseHelpers.resolveSafeVideoEmbedUrl("javascript:alert(1)"),
      null,
    );
  });

  it("3. sanitizeProjectsForPublic lọc ẩn draft/pending_review, xóa posterPublicId & làm sạch URL", () => {
    const projects = structuredClone(STUDENT_PROJECTS_DATA);
    const draftProj: StudentProjectItem = {
      ...projects[0],
      id: "proj-draft",
      status: "draft",
      posterPublicId: "secret-draft-pid",
    };
    const pendingProj: StudentProjectItem = {
      ...projects[0],
      id: "proj-pending",
      status: "pending_review",
      posterPublicId: "secret-pending-pid",
    };
    const unsafePubProj: StudentProjectItem = {
      ...projects[0],
      id: "proj-pub-unsafe",
      status: "published",
      posterPublicId: "english-portal/secret-cloudinary-id",
      posterUrl: "javascript:alert(1)",
      documentUrl: "data:application/pdf;base64,AAA",
      videoUrl: "//evil.com/video",
      externalUrl: "javascript:void(0)",
    };

    const sanitized = showcaseHelpers.sanitizeProjectsForPublic([
      draftProj,
      pendingProj,
      unsafePubProj,
      ...projects,
    ]);

    assert.equal(sanitized.some((p) => p.id === "proj-draft"), false);
    assert.equal(sanitized.some((p) => p.id === "proj-pending"), false);

    const cleaned = sanitized.find((p) => p.id === "proj-pub-unsafe");
    assert.ok(cleaned);
    assert.equal("posterPublicId" in cleaned, false, "Không được rò rỉ posterPublicId");
    assert.equal(cleaned.posterUrl, null);
    assert.equal(cleaned.documentUrl, null);
    assert.equal(cleaned.videoUrl, null);
    assert.equal(cleaned.externalUrl, "");
  });

  it("4. filterAndSortProjects tìm không dấu đa trường, lọc tag/media/lớp & sắp xếp chính xác", () => {
    const projects = structuredClone(STUDENT_PROJECTS_DATA);
    const pub = showcaseHelpers.sanitizeProjectsForPublic(projects);

    // Từ khóa ngắn "AI" khớp đúng từ khóa bắt đầu bằng "ai", không khớp nhầm "tài liệu" / "bài luận" / "giải"
    const byShortAi = showcaseHelpers.filterAndSortProjects(pub, {
      search: "AI",
    });
    assert.deepEqual(
      byShortAi.map((p) => p.id),
      ["proj-2"],
    );

    // Tìm theo tên tác giả không dấu
    const byAuthor = showcaseHelpers.filterAndSortProjects(pub, {
      search: "minh khoi",
    });
    assert.equal(byAuthor.length, 1);
    assert.equal(byAuthor[0].id, "proj-1");

    // Tìm theo nhận xét giảng viên (keyTakeaway) không dấu
    const byTakeaway = showcaseHelpers.filterAndSortProjects(pub, {
      search: "thuyet trinh khoa hoc",
    });
    assert.equal(byTakeaway.length, 1);
    assert.equal(byTakeaway[0].id, "proj-3");

    // Lọc theo tag không phân biệt hoa thường
    const byTag = showcaseHelpers.filterAndSortProjects(pub, {
      tag: "stem",
    });
    assert.equal(byTag.length, 1);
    assert.equal(byTag[0].id, "proj-3");

    // Lọc chỉ dự án có Video
    const onlyVideo = showcaseHelpers.filterAndSortProjects(pub, {
      media: "video",
    });
    assert.deepEqual(
      onlyVideo.map((p) => p.id),
      ["proj-2", "proj-3"],
    );

    // Sắp xếp mới nhất -> cũ nhất theo DD/MM/YYYY
    const newest = showcaseHelpers.filterAndSortProjects(pub, {
      sortBy: "newest",
    });
    assert.deepEqual(
      newest.map((p) => p.id),
      ["proj-1", "proj-2", "proj-3", "proj-4"],
    );

    // Sắp xếp cũ nhất trước
    const oldest = showcaseHelpers.filterAndSortProjects(pub, {
      sortBy: "oldest",
    });
    assert.equal(oldest[0].id, "proj-4");
  });

  it("5. countProjectsByCategory, extractProjectClasses, extractProjectTags, computeShowcaseStats & getAdjacentProjects", () => {
    const projects = structuredClone(STUDENT_PROJECTS_DATA);
    const pub = showcaseHelpers.sanitizeProjectsForPublic(projects);

    const counts = showcaseHelpers.countProjectsByCategory(pub);
    assert.equal(counts.all, 4);
    assert.equal(counts["Research Poster"], 1);
    assert.equal(counts["Debate Portfolio"], 1);
    assert.equal(counts["Video Presentation"], 1);
    assert.equal(counts["Academic Essay"], 1);

    const classes = showcaseHelpers.extractProjectClasses(pub);
    assert.equal(classes.length, 4);

    const tags = showcaseHelpers.extractProjectTags(pub);
    assert.ok(tags.includes("STEM"));
    assert.ok(tags.includes("APA 7th"));

    const stats = showcaseHelpers.computeShowcaseStats(pub);
    assert.deepEqual(stats, {
      totalProjects: 4,
      uniqueClasses: 4,
      videoCount: 2,
      pdfCount: 4,
      latestPublishedAt: "08/11/2026",
    });

    const adj = showcaseHelpers.getAdjacentProjects("proj-2", pub);
    assert.equal(adj.prev?.id, "proj-1");
    assert.equal(adj.next?.id, "proj-3");
  });

  describe("DB-backed Student Showcase Service", { skip: !hasTestDatabase() }, () => {
    beforeEach(async () => {
      await resetAndSeedTestDatabase();
    });

    after(async () => {
      await teardownTestDatabase();
    });

  it("6. cmsService.listStudentProjects tìm không dấu, lọc tag/media & giữ posterPublicId cho Admin", async () => {
    const draftCreated = await cmsService.createStudentProject({
      title: "Dự án Nháp chưa duyệt",
      studentOrTeam: "Nhóm Thử Nghiệm",
      status: "draft",
      posterPublicId: "admin/draft-pid",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    const pubCreated = await cmsService.createStudentProject({
      title: "Nghiên cứu Năng lượng Sạch Đô thị",
      studentOrTeam: "Nguyễn Bảo Anh",
      status: "published",
      posterPublicId: "admin/pub-pid",
      documentUrl: "https://example.com/clean-energy.pdf",
      tags: ["Clean Energy", "Sustainability"],
    });

    const publicBySearch = await cmsService.listStudentProjects({
      search: "nang luong sach",
    });
    assert.equal(publicBySearch.length, 1);
    assert.equal(publicBySearch[0].id, pubCreated.id);
    assert.equal(publicBySearch[0].posterPublicId, "admin/pub-pid");

    const publicByTag = await cmsService.listStudentProjects({
      tag: "sustainability",
    });
    assert.equal(publicByTag.length, 1);
    assert.equal(publicByTag[0].id, pubCreated.id);

    const publicVideo = await cmsService.listStudentProjects({
      media: "video",
    });
    assert.equal(
      publicVideo.some((p) => p.id === draftCreated.id),
      false,
    );

    const adminAll = await cmsService.listStudentProjects({
      includeDrafts: true,
    });
    assert.ok(adminAll.some((p) => p.id === draftCreated.id));
  });

  it("7. getPublicOverviewData chỉ trả dự án published và không rò rỉ posterPublicId", async () => {
    await cmsService.createStudentProject({
      title: "Hồ sơ đang chờ duyệt ẩn",
      studentOrTeam: "Học viên Ẩn",
      status: "pending_review",
      posterPublicId: "secret/pending-pid",
    });
    await cmsService.createStudentProject({
      title: "Hồ sơ công khai có posterPublicId nội bộ",
      studentOrTeam: "Học viên Công Khai",
      status: "published",
      posterPublicId: "secret/public-pid",
      posterUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    });

    const overview = await viewerOverviewService.getPublicOverviewData(
      new Date("2026-11-21T09:00:00"),
    );

    assert.ok(overview.projects.length >= 5);
    assert.ok(overview.projects.every((p) => p.status === "published"));
    for (const p of overview.projects) {
      assert.equal("posterPublicId" in p, false);
    }
  });
  });
});
