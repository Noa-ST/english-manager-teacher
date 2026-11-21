import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import * as announcementHelpers from "@/services/announcement-helpers";
import { ANNOUNCEMENTS_DATA } from "@/services/classroom-data";
import * as cmsService from "@/services/cms.service";
import { NotFoundError } from "@/services/errors";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

describe("Viewer Public Announcements Service & Helpers — /announcements & /announcements/[id]", () => {
  it("1. normalizeAnnouncementSearch khử dấu tiếng Việt và chữ đ/Đ chính xác", () => {
    assert.equal(
      announcementHelpers.normalizeAnnouncementSearch("  Lịch thi thử Điểm số Đặc biệt  "),
      "lich thi thu diem so dac biet",
    );
    assert.equal(
      announcementHelpers.normalizeAnnouncementSearch("Đề cương Reading B2–C1"),
      "de cuong reading b2–c1",
    );
  });

  it("2. estimateReadTimeLabel tính thời gian đọc linh hoạt theo tổng số từ", () => {
    assert.equal(
      announcementHelpers.estimateReadTimeLabel(["Thông báo ngắn gọn."]),
      "1 phút đọc",
    );
    const longParagraph = Array.from({ length: 420 }, () => "academic").join(" ");
    assert.equal(
      announcementHelpers.estimateReadTimeLabel([longParagraph]),
      "3 phút đọc",
    );
  });

  it("3. selectHeroAnnouncement ưu tiên Tin khẩn + Ghim, bỏ qua bản nháp (draft) và trả null nếu không có", () => {
    const announcements = structuredClone(ANNOUNCEMENTS_DATA);
    const base = announcements[0];
    assert.ok(base);

    const list = [
      { ...base, id: "a-draft", status: "draft" as const, isUrgent: true, isPinned: true },
      { ...base, id: "a-norm", status: "published" as const, isUrgent: false, isPinned: false },
      { ...base, id: "a-pin", status: "published" as const, isUrgent: false, isPinned: true },
      { ...base, id: "a-urg-pin", status: "published" as const, isUrgent: true, isPinned: true },
    ];
    assert.equal(announcementHelpers.selectHeroAnnouncement(list)?.id, "a-urg-pin");

    const noHero = [{ ...base, id: "a-only-norm", status: "published" as const, isUrgent: false, isPinned: false }];
    assert.equal(announcementHelpers.selectHeroAnnouncement(noHero), null);
  });

  it("4. filterAndSortAnnouncements lọc kết hợp không dấu, danh mục, lớp áp dụng, tệp đính kèm & excludeId", () => {
    const announcements = structuredClone(ANNOUNCEMENTS_DATA);
    const filtered = announcementHelpers.filterAndSortAnnouncements(announcements, {
      targetClass: "IELTS Intensive 6.5+",
      search: "bai tap",
      onlyWithAttachments: true,
    });
    assert.ok(filtered.length >= 1);
    assert.ok(filtered.every((item) => item.status === "published" && item.attachments.length > 0));

    // Kiểm tra lớp cụ thể vẫn bao gồm bản tin gửi "Tất cả các lớp" và hỗ trợ excludeId
    const byClass = announcementHelpers.filterAndSortAnnouncements(announcements, {
      targetClass: "IELTS Foundation",
      excludeId: announcements[0].id,
    });
    assert.equal(byClass.some((i) => i.id === announcements[0].id), false);
    assert.ok(
      byClass.some(
        (i) =>
          i.targetClasses.includes("IELTS Foundation") ||
          i.targetClasses.includes("Tất cả các lớp"),
      ),
    );
  });

  it("5. extractUniqueTargetClasses & countAnnouncementsByCategory tính đúng số lượng và sắp xếp lớp", () => {
    const announcements = structuredClone(ANNOUNCEMENTS_DATA);
    const published = announcements.filter((a) => a.status === "published");
    const counts = announcementHelpers.countAnnouncementsByCategory(announcements);
    assert.equal(counts.all, published.length);
    assert.equal(
      counts.urgent + counts.event + counts.homework + counts.schedule + counts.tuition,
      published.length,
    );

    const classes = announcementHelpers.extractUniqueTargetClasses(announcements);
    if (classes.includes("Tất cả các lớp")) {
      assert.equal(classes[0], "Tất cả các lớp");
    }
    assert.ok(classes.length >= 2);
  });

  it("6. selectRelatedAnnouncements chấm điểm liên quan theo danh mục + lớp chung và loại bỏ bài hiện tại", () => {
    const announcements = structuredClone(ANNOUNCEMENTS_DATA);
    const published = announcements.filter((a) => a.status === "published");
    const current = published[0];
    assert.ok(current);

    const related = announcementHelpers.selectRelatedAnnouncements(current, published, 2);
    assert.ok(related.length <= 2);
    assert.equal(related.some((r) => r.id === current.id), false);
  });

  it("7. getAdjacentAnnouncements trả về prev/next chính xác tại đầu, giữa và cuối danh sách", () => {
    const announcements = structuredClone(ANNOUNCEMENTS_DATA);
    const published = announcements.filter((a) => a.status === "published");
    assert.ok(published.length >= 3);

    const atFirst = announcementHelpers.getAdjacentAnnouncements(published[0].id, published);
    assert.equal(atFirst.prev, null);
    assert.equal(atFirst.next?.id, published[1].id);

    const atMiddle = announcementHelpers.getAdjacentAnnouncements(published[1].id, published);
    assert.equal(atMiddle.prev?.id, published[0].id);
    assert.equal(atMiddle.next?.id, published[2].id);

    const atLast = announcementHelpers.getAdjacentAnnouncements(
      published[published.length - 1].id,
      published,
    );
    assert.equal(atLast.prev?.id, published[published.length - 2].id);
    assert.equal(atLast.next, null);
  });

  describe("DB-backed Announcements Service", { skip: !hasTestDatabase() }, () => {
    beforeEach(async () => {
      await resetAndSeedTestDatabase();
    });

    after(async () => {
      await teardownTestDatabase();
    });

  it("8. cmsService.listAnnouncements tìm không dấu, lọc có tệp đính kèm, bao gồm 'Tất cả các lớp' & ẩn draft", async () => {
    const draft = await cmsService.createAnnouncement({
      title: "Thông báo nháp Điểm danh bổ sung",
      excerpt: "Nội dung mật",
      category: "schedule",
      status: "draft",
      targetClasses: ["IELTS Intensive 6.5+"],
    });

    const publicList = await cmsService.listAnnouncements({
      includeDrafts: false,
      search: "lich thi thu",
    });
    assert.ok(publicList.length >= 1);
    assert.equal(publicList.some((a) => a.id === draft.id), false);

    const withAttachments = await cmsService.listAnnouncements({
      includeDrafts: false,
      onlyWithAttachments: true,
    });
    assert.ok(withAttachments.length >= 1);
    assert.ok(withAttachments.every((a) => a.attachments.length > 0));

    const classFiltered = await cmsService.listAnnouncements({
      includeDrafts: false,
      targetClass: "IELTS Intensive 6.5+",
      includeAllClassesTarget: true,
    });
    assert.ok(
      classFiltered.some((a) => a.targetClasses.includes("Tất cả các lớp")),
    );
    assert.equal(classFiltered.some((a) => a.id === draft.id), false);
  });

  it("9. cmsService.createAnnouncement tính động readTime tương ứng độ dài nội dung", async () => {
    const longText = Array.from({ length: 400 }, () => "word").join(" ");
    const created = await cmsService.createAnnouncement({
      title: "Hướng dẫn chuyên sâu Academic Writing",
      content: [longText],
      category: "event",
      status: "published",
    });
    assert.equal(created.readTime, "3 phút đọc");
  });

  it("10. recordAnnouncementAttachmentDownload tăng downloadCount trên bản published và chặn bản draft", async () => {
    const publishedAnn = await cmsService.createAnnouncement({
      title: "Tài liệu Ôn tập Cuối kỳ",
      category: "homework",
      status: "published",
      attachments: [
        {
          id: "att-pub-1",
          name: "On-tap-cuoi-ky.pdf",
          size: "1.5 MB",
          type: "PDF",
          downloadCount: 0,
          url: "/files/on-tap.pdf",
        },
      ],
    });

    const res1 = await cmsService.recordAnnouncementAttachmentDownload(
      publishedAnn.id,
      "att-pub-1",
    );
    assert.equal(res1.downloadCount, 1);
    assert.equal(res1.url, "/files/on-tap.pdf");

    const res2 = await cmsService.recordAnnouncementAttachmentDownload(
      publishedAnn.id,
      "att-pub-1",
    );
    assert.equal(res2.downloadCount, 2);

    const draftAnn = await cmsService.createAnnouncement({
      title: "Tài liệu Nháp Chưa Công Bố",
      category: "homework",
      status: "draft",
      attachments: [
        {
          id: "att-draft-1",
          name: "Secret.pdf",
          size: "1.0 MB",
          type: "PDF",
          downloadCount: 0,
        },
      ],
    });

    await assert.rejects(
      () =>
        cmsService.recordAnnouncementAttachmentDownload(
          draftAnn.id,
          "att-draft-1",
        ),
      (err: unknown) => err instanceof NotFoundError,
    );
  });
  });
});
