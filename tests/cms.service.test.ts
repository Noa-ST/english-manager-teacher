import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { prisma } from "@/lib/db/prisma";
import {
  ADMIN_STUDENTS_DATA,
  ANNOUNCEMENTS_DATA,
  HALL_OF_FAME_DATA,
  PODCAST_EPISODES_DATA,
  RESOURCE_FILES_DATA,
  STUDENT_PROJECTS_DATA,
} from "@/services/classroom-data";
import * as cmsService from "@/services/cms.service";
import * as cmsHelpers from "@/services/cms-helpers";
import { ValidationError } from "@/services/errors";
import * as podcastService from "@/services/podcast.service";
import * as settingsService from "@/services/settings.service";
import * as storageService from "@/services/storage.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

describe("CMS Service — Quản trị Nội dung & Thương hiệu", () => {
  describe(
    "PostgreSQL / Prisma CMS & Podcast CRUD",
    { skip: !hasTestDatabase() },
    () => {
      beforeEach(async () => {
        await resetAndSeedTestDatabase();
      });

      after(async () => {
        await teardownTestDatabase();
      });

  // ===========================================================================
  // 1. BẢN TIN & THÔNG BÁO (ANNOUNCEMENTS)
  // ===========================================================================
  describe("1. Quản lý Bản tin & Thông báo (Announcements)", () => {
    it("1.1. Lấy danh sách thông báo đã xuất bản (mặc định loại bỏ bản nháp)", async () => {
      const list = await cmsService.listAnnouncements();
      assert.ok(list.length > 0, "Phải có danh sách thông báo mẫu");
      assert.ok(
        list.every((item) => item.status === "published"),
        "Mặc định chỉ trả về các thông báo có status=published",
      );
    });

    it("1.2. Lấy tất cả thông báo bao gồm bản nháp khi includeDrafts=true", async () => {
      // Tạo 1 bản nháp
      await cmsService.createAnnouncement({
        title: "Thông báo bản nháp thử nghiệm nội bộ",
        category: "tuition",
        status: "draft",
      });

      const publishedOnly = await cmsService.listAnnouncements({
        includeDrafts: false,
      });
      const withDrafts = await cmsService.listAnnouncements({
        includeDrafts: true,
      });

      assert.strictEqual(
        withDrafts.length,
        publishedOnly.length + 1,
        "includeDrafts=true phải bao gồm thêm thông báo nháp",
      );
      assert.ok(withDrafts.some((item) => item.status === "draft"));
    });

    it("1.3. Lọc thông báo theo danh mục (urgent, schedule, tuition, event)", async () => {
      const urgentList = await cmsService.listAnnouncements({
        category: "urgent",
      });
      assert.ok(urgentList.length > 0);
      assert.ok(urgentList.every((item) => item.category === "urgent"));

      const scheduleList = await cmsService.listAnnouncements({
        category: "schedule",
      });
      assert.ok(scheduleList.every((item) => item.category === "schedule"));
    });

    it("1.4. Tìm kiếm thông báo theo từ khóa tiêu đề hoặc trích dẫn", async () => {
      const searchResults = await cmsService.listAnnouncements({
        search: "ielts",
      });
      assert.ok(searchResults.length > 0);
      assert.ok(
        searchResults.every(
          (a) =>
            a.title.toLowerCase().includes("ielts") ||
            a.excerpt.toLowerCase().includes("ielts") ||
            a.targetClasses.some((cls) => cls.toLowerCase().includes("ielts")),
        ),
      );
    });

    it("1.5. Xem chi tiết thông báo theo ID thành công", async () => {
      const list = await cmsService.listAnnouncements();
      const first = list[0];
      const detail = await cmsService.getAnnouncementById(first.id);

      assert.strictEqual(detail.id, first.id);
      assert.strictEqual(detail.title, first.title);
      assert.ok(Array.isArray(detail.content));
    });

    it("1.6. Ném NotFoundError khi xem ID thông báo không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await cmsService.getAnnouncementById("ann-non-existent-9999");
        },
        { name: "NotFoundError" },
      );
    });

    it("1.7. Soạn thảo thông báo mới (xuất bản ngay, tự động gán nhãn categoryLabel, ghim đầu trang)", async () => {
      const created = await cmsService.createAnnouncement({
        title: "Lịch thi thử IELTS Mock Test đợt 2 tháng 12/2026",
        excerpt: "Kỳ thi thử trực tiếp tại Phòng Lab nhằm đánh giá band điểm.",
        content: [
          "Kính gửi Quý Phụ huynh và học sinh,",
          "Nhà trường tổ chức kỳ thi thử IELTS toàn diện 4 kỹ năng.",
        ],
        category: "urgent",
        isPinned: true,
        status: "published",
      });

      assert.ok(created.id.startsWith("ann-"));
      assert.strictEqual(created.categoryLabel, "Thông báo quan trọng");
      assert.strictEqual(created.isUrgent, true);
      assert.strictEqual(created.isPinned, true);
      assert.strictEqual(created.status, "published");
      assert.strictEqual(created.content.length, 2);

      // Bài ghim được chèn lên đầu danh sách
      const list = await cmsService.listAnnouncements();
      assert.strictEqual(list[0].id, created.id);
    });

    it("1.8. Soạn thảo thông báo dưới dạng bản nháp (status=draft)", async () => {
      const draft = await cmsService.createAnnouncement({
        title: "Kế hoạch nghỉ Tết Dương Lịch 2027 (Dự thảo)",
        category: "event",
        status: "draft",
      });

      assert.strictEqual(draft.status, "draft");
      assert.strictEqual(draft.categoryLabel, "Sự kiện học thuật");

      const publicList = await cmsService.listAnnouncements();
      assert.ok(!publicList.some((a) => a.id === draft.id));
    });

    it("1.9. Chặn tạo thông báo nếu tiêu đề rỗng", async () => {
      await assert.rejects(
        async () => {
          await cmsService.createAnnouncement({
            title: "   ",
            category: "urgent",
          });
        },
        { name: "ValidationError" },
      );
    });

    it("1.10. Biên tập thông báo thành công (cập nhật nội dung, danh mục, đổi draft sang published)", async () => {
      const draft = await cmsService.createAnnouncement({
        title: "Bản tin dự kiến",
        category: "homework",
        status: "draft",
      });

      const updated = await cmsService.updateAnnouncement(draft.id, {
        title: "Bản tin chính thức đã hoàn thiện",
        category: "event",
        status: "published",
        content: ["Đoạn văn 1 đã biên tập.", "Đoạn văn 2 bổ sung."],
      });

      assert.strictEqual(updated.title, "Bản tin chính thức đã hoàn thiện");
      assert.strictEqual(updated.category, "event");
      assert.strictEqual(updated.categoryLabel, "Sự kiện học thuật");
      assert.strictEqual(updated.status, "published");
      assert.strictEqual(updated.content.length, 2);

      const publicList = await cmsService.listAnnouncements();
      assert.ok(publicList.some((a) => a.id === draft.id));
    });

    it("1.11. Xóa bản tin thông báo thành công khỏi runtime store", async () => {
      const item = await cmsService.createAnnouncement({
        title: "Thông báo sắp bị xóa",
        category: "schedule",
      });

      await cmsService.deleteAnnouncement(item.id);

      await assert.rejects(
        async () => {
          await cmsService.getAnnouncementById(item.id);
        },
        { name: "NotFoundError" },
      );
    });

    it("1.12. Ném NotFoundError khi xóa hoặc sửa ID thông báo không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await cmsService.updateAnnouncement("ann-ghost", { title: "Test" });
        },
        { name: "NotFoundError" },
      );

      await assert.rejects(
        async () => {
          await cmsService.deleteAnnouncement("ann-ghost");
        },
        { name: "NotFoundError" },
      );
    });

    it("1.13. Lọc thông báo theo lớp học mục tiêu (targetClass)", async () => {
      const ieltsAnnouncements = await cmsService.listAnnouncements({
        targetClass: "IELTS Intensive",
      });
      assert.ok(ieltsAnnouncements.length > 0);
      assert.ok(
        ieltsAnnouncements.every((a) =>
          a.targetClasses.some((c) =>
            c.toLowerCase().includes("ielts intensive"),
          ),
        ),
      );
    });

    it("1.14. Soạn thảo thông báo có đính kèm tài liệu học vụ (attachments)", async () => {
      const created = await cmsService.createAnnouncement({
        title: "Tài liệu ôn thi Speaking Part 2 & 3",
        category: "homework",
        targetClasses: ["IELTS Intensive 6.5+"],
        attachments: [
          {
            id: "att-1",
            name: "Speaking-Part-2-Cue-Cards-2026.pdf",
            size: "1.2 MB",
            url: "https://example.com/speaking.pdf",
          },
        ],
      });

      assert.strictEqual(created.attachments.length, 1);
      assert.strictEqual(created.attachments[0].name, "Speaking-Part-2-Cue-Cards-2026.pdf");
      assert.strictEqual(created.attachments[0].size, "1.2 MB");
    });

    it("1.15. Thêm tệp đính kèm vào thông báo đã có (addAnnouncementAttachment)", async () => {
      const list = await cmsService.listAnnouncements();
      const target = list[0];

      const updated = await cmsService.addAnnouncementAttachment(target.id, {
        id: "att-new-pdf",
        name: "Huong-Dan-Lam-Bai-Doc.pdf",
        size: "650 KB",
      });

      assert.ok(updated.attachments.some((att) => att.id === "att-new-pdf"));
    });

    it("1.16. Xóa tệp đính kèm khỏi thông báo (removeAnnouncementAttachment)", async () => {
      const list = await cmsService.listAnnouncements();
      const target = list[0];

      // Đảm bảo có tệp đính kèm
      await cmsService.addAnnouncementAttachment(target.id, {
        id: "att-to-remove",
        name: "File-Tam-Thoi.docx",
        size: "300 KB",
      });

      const afterRemove = await cmsService.removeAnnouncementAttachment(
        target.id,
        "att-to-remove",
      );
      assert.ok(!afterRemove.attachments.some((att) => att.id === "att-to-remove"));
    });

    it("1.17. Lọc theo trạng thái Ghim đầu trang (isPinned) và Ưu tiên khẩn (isUrgent)", async () => {
      const pinnedList = await cmsService.listAnnouncements({
        isPinned: true,
      });
      assert.ok(pinnedList.every((a) => a.isPinned === true));

      const urgentList = await cmsService.listAnnouncements({
        isUrgent: true,
      });
      assert.ok(urgentList.every((a) => a.isUrgent === true));
    });

    it("1.18. Vòng đời Hủy xuất bản (Unpublish): chuyển published sang draft ẩn khỏi Cổng công khai", async () => {
      const list = await cmsService.listAnnouncements();
      const first = list[0];

      // Chuyển sang draft
      await cmsService.updateAnnouncement(first.id, {
        status: "draft",
      });

      const publicList = await cmsService.listAnnouncements({
        includeDrafts: false,
      });
      assert.ok(!publicList.some((a) => a.id === first.id));

      // Xuất bản lại
      await cmsService.updateAnnouncement(first.id, {
        status: "published",
      });
      const rePublishedList = await cmsService.listAnnouncements({
        includeDrafts: false,
      });
      assert.ok(rePublishedList.some((a) => a.id === first.id));
    });
  });

  // ===========================================================================
  // 2. BẢNG VÀNG VINH DANH (HALL OF FAME)
  // ===========================================================================
  describe("2. Bảng vàng Vinh danh Học sinh (Hall of Fame)", () => {
    it("2.1. Lấy danh sách vinh danh Bảng vàng và tìm kiếm theo tên hoặc danh hiệu", async () => {
      const all = await cmsService.listHallOfFame();
      assert.ok(all.length >= 3, "Phải có danh sách Bảng vàng mẫu ban đầu");

      const filtered = await cmsService.listHallOfFame({ search: "Khôi" });
      assert.ok(filtered.length > 0);
      assert.ok(filtered.some((h) => h.displayName.includes("Khôi")));
    });

    it("2.2. Lọc danh sách Bảng vàng theo kỳ vinh danh (week, month, course)", async () => {
      const monthList = await cmsService.listHallOfFame({ period: "month" });
      assert.ok(monthList.every((h) => h.period === "month"));

      const weekList = await cmsService.listHallOfFame({ period: "week" });
      assert.ok(weekList.every((h) => h.period === "week"));
    });

    it("2.3. Thêm gương mặt mới vào Bảng vàng (tự động tính avatarInitials, định dạng periodLabel)", async () => {
      const created = await cmsService.createHallOfFameEntry({
        displayName: "Trần Bảo Ngọc",
        className: "IELTS Intensive (Band 6.5–7.5+)",
        rank: 1,
        period: "month",
        headlineMetric: "IELTS 8.5 Overall (Reading 9.0)",
        badgeTitle: "Valedictorian of the Month",
        teacherEndorsement:
          "Sự bứt phá ngoạn mục với điểm Reading tuyệt đối 9.0/9.0.",
      });

      assert.ok(created.id.startsWith("hof-"));
      assert.strictEqual(created.displayName, "Trần Bảo Ngọc");
      assert.strictEqual(created.avatarInitials, "BN");
      assert.strictEqual(created.rank, 1);
      assert.strictEqual(created.period, "month");
      const now = new Date();
      const expectedPeriodLabel = `Vinh danh Tháng ${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
      assert.strictEqual(created.periodLabel, expectedPeriodLabel);

      const list = await cmsService.listHallOfFame();
      assert.strictEqual(list[0].id, created.id);
    });

    it("2.4. Validate dữ liệu Bảng vàng (chặn tên rỗng hoặc rank sai)", async () => {
      await assert.rejects(
        async () => {
          await cmsService.createHallOfFameEntry({
            displayName: "",
            headlineMetric: "IELTS 8.0",
            badgeTitle: "Top Scorer",
          });
        },
        { name: "ValidationError" },
      );

      await assert.rejects(
        async () => {
          await cmsService.createHallOfFameEntry({
            displayName: "Nguyễn Văn A",
            rank: 99 as 1,
            headlineMetric: "Top 1",
            badgeTitle: "Best",
          });
        },
        { name: "ValidationError" },
      );
    });

    it("2.5. Gỡ bỏ gương mặt khỏi Bảng vàng thành công", async () => {
      const entry = await cmsService.createHallOfFameEntry({
        displayName: "Học Sinh Tạm Thời",
        headlineMetric: "7.0",
        badgeTitle: "Honor",
      });

      await cmsService.deleteHallOfFameEntry(entry.id);

      const list = await cmsService.listHallOfFame();
      assert.ok(!list.some((h) => h.id === entry.id));
    });

    it("2.6. Ném NotFoundError khi xóa ID Bảng vàng không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await cmsService.deleteHallOfFameEntry("hof-non-existent");
        },
        { name: "NotFoundError" },
      );
    });

    it("2.7. Xem chi tiết hồ sơ Bảng vàng theo ID (getHallOfFameById)", async () => {
      const list = await cmsService.listHallOfFame();
      const first = list[0];

      const detail = await cmsService.getHallOfFameById(first.id);
      assert.strictEqual(detail.id, first.id);
      assert.strictEqual(detail.displayName, first.displayName);
      assert.ok(detail.headlineMetric);
      assert.ok(Array.isArray(detail.milestones));
    });

    it("2.8. Ném NotFoundError khi xem ID Bảng vàng không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await cmsService.getHallOfFameById("hof-ghost-id");
        },
        { name: "NotFoundError" },
      );
    });

    it("2.9. Cập nhật thông tin Bảng vàng thành công (updateHallOfFameEntry)", async () => {
      const entry = await cmsService.createHallOfFameEntry({
        displayName: "Lê Minh Trí",
        className: "Junior Academic Explorers",
        rank: 2,
        period: "week",
        headlineMetric: "Top 1 Weekly Vocabulary",
        badgeTitle: "Rising Star",
      });

      const updated = await cmsService.updateHallOfFameEntry(entry.id, {
        displayName: "Lê Minh Trí (Senior)",
        rank: 1,
        headlineMetric: "IELTS 7.5 Overall",
        badgeTitle: "Academic Champion",
      });

      assert.strictEqual(updated.displayName, "Lê Minh Trí (Senior)");
      assert.strictEqual(updated.rank, 1);
      assert.strictEqual(updated.headlineMetric, "IELTS 7.5 Overall");
      assert.strictEqual(updated.badgeTitle, "Academic Champion");
    });

    it("2.10. Tự động cập nhật avatarInitials tương ứng khi cập nhật displayName", async () => {
      const entry = await cmsService.createHallOfFameEntry({
        displayName: "Nguyễn Nhật Nam",
        rank: 3,
        headlineMetric: "Band 7.0",
        badgeTitle: "Honor",
      });
      assert.strictEqual(entry.avatarInitials, "NN");

      const updated = await cmsService.updateHallOfFameEntry(entry.id, {
        displayName: "Phạm Thu Hà",
      });
      assert.strictEqual(updated.avatarInitials, "TH");
    });

    it("2.11. Ném NotFoundError khi cập nhật ID Bảng vàng không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await cmsService.updateHallOfFameEntry("hof-ghost-id", {
            displayName: "Test",
          });
        },
        { name: "NotFoundError" },
      );
    });

    it("2.12. Lọc danh sách Bảng vàng theo thứ hạng tối đa (maxRank=3 cho Top 3 Podium)", async () => {
      const top3 = await cmsService.listHallOfFame({ maxRank: 3 });
      assert.ok(top3.length > 0);
      assert.ok(top3.every((h) => h.rank <= 3));
    });

    it("2.13. Tạo vinh danh Bảng vàng kèm studentId, classId và mảng milestones", async () => {
      const entry = await cmsService.createHallOfFameEntry({
        studentId: "stu-01",
        classId: "cls-ii-01",
        displayName: "Trần Bảo Ngọc",
        className: "IELTS Intensive 6.5+",
        rank: 1,
        period: "month",
        periodLabel: "Tháng 11/2026",
        headlineMetric: "IELTS 8.0 Overall",
        badgeTitle: "Học viên Xuất sắc Tháng",
        teacherEndorsement: "Tiến bộ vượt bậc kỹ năng Writing.",
        milestones: ["Reading 8.5", "Writing 7.5", "100% Chuyên cần"],
      });

      assert.strictEqual(entry.studentId, "stu-01");
      assert.strictEqual(entry.classId, "cls-ii-01");
      assert.strictEqual(entry.periodLabel, "Tháng 11/2026");
      assert.deepStrictEqual(entry.milestones, [
        "Reading 8.5",
        "Writing 7.5",
        "100% Chuyên cần",
      ]);
    });

    it("2.14. Thiết lập Top 3 tháng và kiểm tra tính toàn vẹn thứ hạng (thay thế rank cũ)", async () => {
      const month = "Tháng 12/2026";
      const entryA = await cmsService.createHallOfFameEntry({
        displayName: "Học viên A",
        className: "IELTS Intensive",
        rank: 1,
        period: "month",
        periodLabel: month,
        headlineMetric: "8.0",
        badgeTitle: "Quán quân cũ",
      });

      assert.strictEqual(entryA.rank, 1);

      // Thêm học viên B cùng rank 1 vào cùng tháng -> thay thế học viên A ở rank 1
      const entryB = await cmsService.createHallOfFameEntry({
        displayName: "Học viên B",
        className: "IELTS Intensive",
        rank: 1,
        period: "month",
        periodLabel: month,
        headlineMetric: "8.5",
        badgeTitle: "Quán quân mới",
      });

      const listMonth = await cmsService.listHallOfFame({ period: "month" });
      const rank1InMonth = listMonth.filter(
        (h) => h.periodLabel === month && h.rank === 1,
      );
      assert.strictEqual(rank1InMonth.length, 1);
      assert.strictEqual(rank1InMonth[0].id, entryB.id);
      assert.strictEqual(rank1InMonth[0].displayName, "Học viên B");
    });

    it("2.15. Hoán đổi thứ hạng giữa Rank 1 và Rank 2 (swapPodiumRanks)", async () => {
      const month = "Tháng 11/2026";
      const listBefore = await cmsService.listHallOfFame({ period: "month" });
      const r1Before = listBefore.find(
        (h) => h.periodLabel === month && h.rank === 1,
      );
      const r2Before = listBefore.find(
        (h) => h.periodLabel === month && h.rank === 2,
      );

      assert.ok(r1Before, "Cần có học viên Rank 1 ban đầu");
      assert.ok(r2Before, "Cần có học viên Rank 2 ban đầu");

      const swapped = await cmsService.swapPodiumRanks(month, 1, 2);
      const swappedR1 = swapped.find((h) => h.id === r1Before.id);
      const swappedR2 = swapped.find((h) => h.id === r2Before.id);

      assert.strictEqual(swappedR1?.rank, 2);
      assert.strictEqual(swappedR2?.rank, 1);

      // Hoán đổi lại để giữ nguyên dữ liệu mẫu cho các test khác
      await cmsService.swapPodiumRanks(month, 1, 2);
    });

    it("2.16. Thuật toán tự động đề cử Top 3 từ điểm số thực tế (recommendTop3Students)", async () => {
      const recs = await cmsService.recommendTop3Students();
      assert.strictEqual(recs.length, 3);
      assert.strictEqual(recs[0].rank, 1);
      assert.strictEqual(recs[1].rank, 2);
      assert.strictEqual(recs[2].rank, 3);

      for (const rec of recs) {
        assert.ok(rec.studentId);
        assert.ok(rec.displayName);
        assert.ok(rec.headlineMetric);
        assert.ok(rec.badgeTitle);
        assert.ok(Array.isArray(rec.milestones) && rec.milestones.length >= 2);
      }
    });
  });

  // ===========================================================================
  // 3. TUYỂN TẬP DỰ ÁN HỌC SINH (STUDENT PROJECTS SHOWCASE)
  // ===========================================================================
  describe("3. Tuyển tập Dự án Học sinh (Student Projects Showcase)", () => {
    it("3.1. Lấy danh sách dự án học sinh và tìm kiếm theo tiêu đề hoặc tác giả", async () => {
      const all = await cmsService.listStudentProjects();
      assert.ok(all.length >= 3, "Phải có danh sách dự án học sinh mẫu");

      const searchMatch = await cmsService.listStudentProjects({
        search: "AI",
      });
      assert.ok(searchMatch.length > 0);
      assert.ok(
        searchMatch.every(
          (p) =>
            p.title.toLowerCase().includes("ai") ||
            p.studentOrTeam.toLowerCase().includes("ai"),
        ),
      );
    });

    it("3.2. Lọc dự án theo phân loại học thuật (category)", async () => {
      const essayList = await cmsService.listStudentProjects({
        category: "Academic Essay",
      });
      assert.ok(essayList.every((p) => p.category === "Academic Essay"));

      const posterList = await cmsService.listStudentProjects({
        category: "Research Poster",
      });
      assert.ok(posterList.every((p) => p.category === "Research Poster"));
    });

    it("3.3. Đăng tải dự án học sinh mới thành công", async () => {
      const created = await cmsService.createStudentProject({
        title:
          "The Impact of Generative AI on Secondary Language Acquisition",
        studentOrTeam: "Nhóm Nghiên cứu K24 (Lê Long & Quỳnh Nga)",
        className: "IELTS Intensive (Band 6.5–7.5+)",
        category: "Research Poster",
        summary:
          "Nghiên cứu định lượng trên mẫu 120 học sinh THPT về tần suất ứng dụng AI trong kỹ năng viết.",
        featuredMetric: "Điểm Đồ án: 9.8/10 · Best Academic Presentation",
      });

      assert.ok(created.id.startsWith("proj-"));
      assert.strictEqual(created.category, "Research Poster");
      assert.strictEqual(created.featuredMetric, "Điểm Đồ án: 9.8/10 · Best Academic Presentation");
      assert.strictEqual(created.status, "published");

      const list = await cmsService.listStudentProjects();
      assert.strictEqual(list[0].id, created.id);
    });

    it("3.4. Validate dữ liệu dự án (chặn tiêu đề hoặc tác giả để trống)", async () => {
      await assert.rejects(
        async () => {
          await cmsService.createStudentProject({
            title: "",
            studentOrTeam: "Nhóm tác giả",
          });
        },
        { name: "ValidationError" },
      );

      await assert.rejects(
        async () => {
          await cmsService.createStudentProject({
            title: "Tên dự án hợp lệ",
            studentOrTeam: "",
          });
        },
        { name: "ValidationError" },
      );
    });

    it("3.5. Gỡ bỏ dự án học sinh khỏi thư viện thành công", async () => {
      const proj = await cmsService.createStudentProject({
        title: "Dự án thử nghiệm xóa",
        studentOrTeam: "Tác giả test",
      });

      await cmsService.deleteStudentProject(proj.id);

      const list = await cmsService.listStudentProjects();
      assert.ok(!list.some((p) => p.id === proj.id));
    });

    it("3.6. Ném NotFoundError khi xóa ID dự án không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await cmsService.deleteStudentProject("proj-ghost-id");
        },
        { name: "NotFoundError" },
      );
    });

    it("3.7. Xem chi tiết dự án theo ID thành công và ném NotFoundError khi ID không tồn tại", async () => {
      const all = await cmsService.listStudentProjects();
      const first = all[0];
      const detail = await cmsService.getStudentProjectById(first.id);
      assert.strictEqual(detail.id, first.id);
      assert.strictEqual(detail.title, first.title);

      await assert.rejects(
        async () => {
          await cmsService.getStudentProjectById("proj-non-existent");
        },
        { name: "NotFoundError" },
      );
    });

    it("3.8. Cập nhật thông tin dự án học sinh thành công (updateStudentProject)", async () => {
      const proj = await cmsService.createStudentProject({
        title: "Dự án nghiên cứu trước khi chỉnh sửa",
        studentOrTeam: "Nhóm Ban Đầu",
        category: "Academic Essay",
      });

      const updated = await cmsService.updateStudentProject(proj.id, {
        title: "Dự án nghiên cứu đã được giáo viên biên tập lại tiêu đề",
        keyTakeaway: "Bổ sung nhận xét chi tiết và định dạng bảng dẫn chứng chuẩn APA.",
        featuredMetric: "Điểm Đồ án: 9.6/10",
        accentTheme: "coral",
      });

      assert.strictEqual(updated.title, "Dự án nghiên cứu đã được giáo viên biên tập lại tiêu đề");
      assert.strictEqual(updated.keyTakeaway, "Bổ sung nhận xét chi tiết và định dạng bảng dẫn chứng chuẩn APA.");
      assert.strictEqual(updated.featuredMetric, "Điểm Đồ án: 9.6/10");
      assert.strictEqual(updated.accentTheme, "coral");
    });

    it("3.9. Phê duyệt dự án học sinh chờ duyệt (approveStudentProject) chuyển sang published", async () => {
      const pendingProj = await cmsService.createStudentProject({
        title: "Hồ sơ tranh biện học sinh gửi nộp chờ giáo viên duyệt",
        studentOrTeam: "Đội Debate Triển vọng",
        category: "Debate Portfolio",
        status: "pending_review",
      });

      // Kiểm tra danh sách công khai không hiển thị dự án pending
      const publicList1 = await cmsService.listStudentProjects({ includeDrafts: false });
      assert.ok(!publicList1.some((p) => p.id === pendingProj.id));

      // Giáo viên duyệt và xuất bản dự án
      const approved = await cmsService.approveStudentProject(pendingProj.id, {
        keyTakeaway: "Đã hoàn thiện video và hồ sơ phản biện đầy đủ tiêu chí A1-A3.",
        featuredMetric: "Điểm Đồ án: 9.4/10 · Xuất sắc",
      });

      assert.strictEqual(approved.status, "published");
      assert.strictEqual(approved.featuredMetric, "Điểm Đồ án: 9.4/10 · Xuất sắc");

      // Kiểm tra danh sách công khai đã hiển thị dự án
      const publicList2 = await cmsService.listStudentProjects({ includeDrafts: false });
      assert.ok(publicList2.some((p) => p.id === pendingProj.id));
    });

    it("3.10. Bản nháp (draft) của dự án không xuất hiện trên danh sách công khai", async () => {
      const draftProj = await cmsService.createStudentProject({
        title: "Dự án đang làm dở (Bản nháp)",
        studentOrTeam: "Học sinh tự lưu nháp",
        status: "draft",
      });

      const publicList = await cmsService.listStudentProjects({ includeDrafts: false });
      assert.ok(!publicList.some((p) => p.id === draftProj.id));

      const adminList = await cmsService.listStudentProjects({ includeDrafts: true });
      assert.ok(adminList.some((p) => p.id === draftProj.id));
    });

    it("3.11. Đăng tải dự án đầy đủ Rich Media (Poster Cloudinary, PDF Supabase, Video YouTube, Tags)", async () => {
      const richProj = await cmsService.createStudentProject({
        title: "Biodiversity & Urban Forestry in Sustainable Cities",
        studentOrTeam: "Nhóm Sinh thái K23",
        className: "IELTS Intensive (Band 6.5–7.5+)",
        category: "Research Poster",
        summary: "Phân tích tác động của không gian xanh đô thị đến sức khỏe tinh thần và khí hậu cục bộ.",
        keyTakeaway: "Phương pháp nghiên cứu đa biến và phong cách trình bày khoa học xuất sắc.",
        featuredMetric: "Điểm Đồ án: 9.7/10 · Environmental Best Paper",
        posterUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1200&q=80",
        posterPublicId: "projects/posters/forestry-k23",
        documentUrl: "https://mock-supabase.co/storage/v1/object/public/projects/urban-forestry.pdf",
        documentName: "Urban-Forestry-Research-Paper.pdf",
        documentSize: "3.2 MB",
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        tags: ["Urban Forestry", "Ecology", "Academic Research"],
      });

      assert.strictEqual(richProj.posterUrl, "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1200&q=80");
      assert.strictEqual(richProj.posterPublicId, "projects/posters/forestry-k23");
      assert.strictEqual(richProj.documentUrl, "https://mock-supabase.co/storage/v1/object/public/projects/urban-forestry.pdf");
      assert.strictEqual(richProj.documentName, "Urban-Forestry-Research-Paper.pdf");
      assert.strictEqual(richProj.documentSize, "3.2 MB");
      assert.strictEqual(richProj.videoUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      assert.deepStrictEqual(richProj.tags, ["Urban Forestry", "Ecology", "Academic Research"]);
    });

    it("3.12. Cập nhật các trường đa phương tiện của dự án học sinh (updateStudentProject with media)", async () => {
      const proj = await cmsService.createStudentProject({
        title: "Dự án ban đầu chưa có video",
        studentOrTeam: "Nhóm Thí sinh",
      });

      const updated = await cmsService.updateStudentProject(proj.id, {
        videoUrl: "https://youtu.be/L_LUpnjgPso",
        posterUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        documentUrl: "https://supabase.co/doc.pdf",
        documentName: "Presentation.pdf",
        documentSize: "1.8 MB",
        tags: ["Debate", "Economics"],
      });

      assert.strictEqual(updated.videoUrl, "https://youtu.be/L_LUpnjgPso");
      assert.strictEqual(updated.posterUrl, "https://res.cloudinary.com/demo/image/upload/sample.jpg");
      assert.strictEqual(updated.documentUrl, "https://supabase.co/doc.pdf");
      assert.strictEqual(updated.documentName, "Presentation.pdf");
      assert.strictEqual(updated.documentSize, "1.8 MB");
      assert.deepStrictEqual(updated.tags, ["Debate", "Economics"]);
    });

    it("3.14. Tìm kiếm dự án học sinh theo Tag từ khóa (listStudentProjects with tag search)", async () => {
      await cmsService.createStudentProject({
        title: "EdTech Innovation in Rural Schools",
        studentOrTeam: "Nhóm EdTech",
        tags: ["EdTech", "RuralEducation"],
      });

      const matched = await cmsService.listStudentProjects({ search: "ruraleducation" });
      assert.ok(matched.length > 0, "Phải tìm thấy dự án theo tag ruraleducation");
      assert.ok(matched.some((p) => p.tags?.includes("RuralEducation")));
    });
  });

  // ===========================================================================
  // 4. KÊNH PHÁT THANH PODCAST AUDIO (PODCAST EPISODES)
  // ===========================================================================
  describe("4. Kênh Phát thanh Podcast Audio (Podcast Episodes)", () => {
    it("4.1. Lấy danh sách tập Podcast có phân trang và chỉ lấy tập published", async () => {
      const page1 = await podcastService.listPodcasts({ page: 1, pageSize: 2 });
      assert.strictEqual(page1.items.length, 2);
      assert.ok(page1.total >= 4);
      assert.ok(page1.items.every((ep) => ep.status === "published"));
    });

    it("4.2. Tìm kiếm tập Podcast theo từ khóa tiêu đề hoặc tóm tắt nội dung", async () => {
      const res = await podcastService.listPodcasts({
        search: "ielts",
        page: 1,
        pageSize: 10,
      });
      assert.ok(res.items.length > 0);
      assert.ok(
        res.items.every(
          (ep) =>
            ep.title.toLowerCase().includes("ielts") ||
            ep.summary.toLowerCase().includes("ielts"),
        ),
      );
    });

    it("4.3. Lấy chi tiết tập Podcast theo ID thành công", async () => {
      const page = await podcastService.listPodcasts({ page: 1, pageSize: 5 });
      const first = page.items[0];
      const ep = await podcastService.getPodcastById(first.id);

      assert.strictEqual(ep.id, first.id);
      assert.strictEqual(ep.title, first.title);
      assert.ok(ep.episodeNumber > 0);
      assert.ok(ep.showNotes.length > 0);
    });

    it("4.4. Xuất bản tập Podcast mới (tự động tính số tập tăng dần, gán showNotes chuẩn)", async () => {
      const created = await podcastService.createPodcast({
        title: "Tập đặc biệt: Chiến lược trả lời Speaking Part 3 ấn tượng",
        summary:
          "Hướng dẫn cách mở rộng ý, đưa dẫn chứng phản biện và vận dụng từ vựng C1-C2.",
        durationLabel: "15:45",
        durationSeconds: 945,
        category: "ielts-listening",
      });

      assert.ok(created.id.startsWith("ep-"));
      assert.ok(created.episodeNumber >= 13, "Số tập mới phải tăng tiến tự động");
      assert.strictEqual(created.categoryLabel, "IELTS & Học thuật");
      assert.strictEqual(created.durationLabel, "15:45");
      assert.ok(created.vocabularyHighlights.length > 0);

      const listRes = await podcastService.listPodcasts({ page: 1, pageSize: 50 });
      assert.strictEqual(listRes.items[0].id, created.id);
    });

    it("4.5. Cập nhật thông tin tập Podcast (tiêu đề, thời lượng, tóm tắt)", async () => {
      const ep = await podcastService.createPodcast({
        title: "Tập audio chuẩn bị sửa",
        durationLabel: "10:00",
        category: "pronunciation",
      });

      const updated = await podcastService.updatePodcast(ep.id, {
        title: "Tập audio đã được biên tập lại tiêu đề",
        durationLabel: "12:15",
        summary: "Nội dung tóm tắt mới sau khi biên tập.",
      });

      assert.strictEqual(updated.title, "Tập audio đã được biên tập lại tiêu đề");
      assert.strictEqual(updated.durationLabel, "12:15");
      assert.strictEqual(updated.summary, "Nội dung tóm tắt mới sau khi biên tập.");
    });

    it("4.6. Xóa tập Podcast thành công", async () => {
      const ep = await podcastService.createPodcast({
        title: "Tập audio sắp xóa",
        durationLabel: "05:00",
        category: "weekly-digest",
      });

      await podcastService.deletePodcast(ep.id);

      await assert.rejects(
        async () => {
          await podcastService.getPodcastById(ep.id);
        },
        { name: "NotFoundError" },
      );
    });

    it("4.7. Ném NotFoundError khi xem hoặc xóa ID Podcast không tồn tại", async () => {
      await assert.rejects(
        async () => {
          await podcastService.getPodcastById("ep-ghost-999");
        },
        { name: "NotFoundError" },
      );

      await assert.rejects(
        async () => {
          await podcastService.deletePodcast("ep-ghost-999");
        },
        { name: "NotFoundError" },
      );
    });

    it("4.8. Lọc danh sách tập Podcast theo từng chủ đề category cụ thể", async () => {
      const digestList = await podcastService.listPodcasts({
        category: "weekly-digest",
        page: 1,
        pageSize: 10,
      });
      assert.ok(digestList.items.length > 0);
      assert.ok(digestList.items.every((ep) => ep.category === "weekly-digest"));

      const ieltsList = await podcastService.listPodcasts({
        category: "ielts-listening",
        page: 1,
        pageSize: 10,
      });
      assert.ok(ieltsList.items.every((ep) => ep.category === "ielts-listening"));
    });

    it("4.9. Tự động tính toán định dạng durationLabel từ durationSeconds khi không truyền nhãn", async () => {
      const ep = await podcastService.createPodcast({
        title: "Tập thử nghiệm tính tự động nhãn thời lượng",
        durationSeconds: 945, // 15 phút 45 giây
        category: "weekly-digest",
      });

      assert.strictEqual(ep.durationSeconds, 945);
      assert.strictEqual(ep.durationLabel, "15:45");
    });

    it("4.10. Cập nhật mốc thời gian showNotes và từ vựng học thuật vocabularyHighlights", async () => {
      const ep = await podcastService.createPodcast({
        title: "Tập audio với show notes và từ vựng chuẩn",
        category: "ielts-listening",
      });

      const updated = await podcastService.updatePodcast(ep.id, {
        showNotes: [
          "00:00 — Giới thiệu tổng quan",
          "05:12 — Phân tích lỗi ngữ điệu phổ biến",
          "11:30 — Bài tập luyện cơ miệng",
        ],
        vocabularyHighlights: [
          {
            term: "intonation nuance",
            ipa: "/ˌɪn.təˈneɪ.ʃən ˈnjuː.ɑːns/",
            meaning: "sắc thái ngữ điệu biểu cảm trong diễn đạt",
          },
        ],
      });

      assert.strictEqual(updated.showNotes.length, 3);
      assert.strictEqual(updated.showNotes[1], "05:12 — Phân tích lỗi ngữ điệu phổ biến");
      assert.strictEqual(updated.vocabularyHighlights.length, 1);
      assert.strictEqual(updated.vocabularyHighlights[0].term, "intonation nuance");
    });

    it("4.11. Cập nhật chủ đề màu bìa coverTheme và trạng thái ghim nổi bật isFeatured", async () => {
      const ep = await podcastService.createPodcast({
        title: "Tập podcast chủ đề sắc màu",
        category: "parent-corner",
        coverTheme: "cream",
        isFeatured: false,
      });

      assert.strictEqual(ep.coverTheme, "cream");
      assert.strictEqual(ep.isFeatured, false);

      const updated = await podcastService.updatePodcast(ep.id, {
        coverTheme: "coral",
        isFeatured: true,
      });

      assert.strictEqual(updated.coverTheme, "coral");
      assert.strictEqual(updated.isFeatured, true);
    });

    it("4.12. Chặn dữ liệu không hợp lệ (tiêu đề rỗng, category sai, thời lượng âm) ném ValidationError", async () => {
      await assert.rejects(
        async () => {
          await podcastService.createPodcast({
            title: "",
          });
        },
        (err: unknown) => err instanceof ValidationError,
      );

      await assert.rejects(
        async () => {
          await podcastService.createPodcast({
            title: "Tiêu đề hợp lệ",
            category: "invalid-category",
          });
        },
        (err: unknown) => err instanceof ValidationError,
      );

      await assert.rejects(
        async () => {
          await podcastService.createPodcast({
            title: "Tiêu đề hợp lệ",
            durationSeconds: -50,
          });
        },
        (err: unknown) => err instanceof ValidationError,
      );
    });

    it("4.13. Chuyển đổi trạng thái tập podcast giữa draft và published", async () => {
      const draftEp = await podcastService.createPodcast({
        title: "Tập Podcast dự thảo tháng tới",
        status: "draft",
      });

      // Kiểm tra không xuất hiện trên viewer list
      const publicList1 = await podcastService.listPodcasts({ includeDrafts: false });
      assert.ok(!publicList1.items.some((p) => p.id === draftEp.id));

      // Xuất bản (publish) tập podcast
      const publishedEp = await podcastService.updatePodcast(draftEp.id, {
        status: "published",
      });
      assert.strictEqual(publishedEp.status, "published");

      // Kiểm tra đã xuất hiện trên viewer list
      const publicList2 = await podcastService.listPodcasts({ includeDrafts: false });
      assert.ok(publicList2.items.some((p) => p.id === draftEp.id));
    });

    it("4.14. Phân trang tính toán chính xác khi trang yêu cầu vượt quá tổng số trang", async () => {
      const outOfBounds = await podcastService.listPodcasts({
        page: 999,
        pageSize: 10,
      });

      assert.strictEqual(outOfBounds.items.length, 0);
      assert.strictEqual(outOfBounds.page, 999);
      assert.ok(outOfBounds.total >= 4);
    });

    it("4.15. Tìm kiếm tập Podcast theo thuật ngữ từ vựng học thuật vocabularyHighlights", async () => {
      // Tập mẫu pod-ep-19 có vocabulary: mitigate, plausible, ostensibly
      const res = await podcastService.listPodcasts({
        search: "mitigate",
        page: 1,
        pageSize: 10,
      });

      assert.ok(res.items.length > 0);
      assert.ok(
        res.items.some((ep) =>
          ep.vocabularyHighlights.some((v) =>
            v.term.toLowerCase().includes("mitigate"),
          ),
        ),
      );
    });
  });

  // ===========================================================================
  // 5. TÍNH TOÀN VẸN & ĐỒNG BỘ LIÊN MODULE (CROSS-MODULE INTEGRATION)
  // ===========================================================================
  describe("5. Tính Toàn vẹn & Đồng bộ Liên Module (Cross-Module Integration)", () => {
    it("5.1. Khi thông báo được tạo hoặc xóa, danh sách hiển thị tự động đồng bộ", async () => {
      const before = await cmsService.listAnnouncements();
      const initialCount = before.length;

      const created = await cmsService.createAnnouncement({
        title: "Thông báo kiểm tra đồng bộ",
        category: "schedule",
      });

      const afterCreate = await cmsService.listAnnouncements();
      assert.strictEqual(afterCreate.length, initialCount + 1);

      await cmsService.deleteAnnouncement(created.id);
      const afterDelete = await cmsService.listAnnouncements();
      assert.strictEqual(afterDelete.length, initialCount);
    });

    it("5.2. Bản nháp (draft) của thông báo và Podcast không rò rỉ ra danh sách công khai", async () => {
      const draftAnn = await cmsService.createAnnouncement({
        title: "Draft bí mật thông báo",
        status: "draft",
      });
      const draftPod = await podcastService.createPodcast({
        title: "Draft podcast audio",
        status: "draft",
      });

      const publicAnn = await cmsService.listAnnouncements();
      const publicPod = await podcastService.listPodcasts();

      assert.ok(!publicAnn.some((a) => a.id === draftAnn.id));
      assert.ok(!publicPod.items.some((p) => p.id === draftPod.id));
    });

    it("5.3. Hệ thống lưu trữ tài liệu liên kết chặt chẽ với tab Học liệu công khai của CMS", async () => {
      const publicFiles = await storageService.listResourceFiles({
        publicOnly: true,
      });
      assert.ok(publicFiles.length > 0, "Phải có danh sách tài nguyên công khai");
      assert.ok(
        publicFiles.every((f) => f.visibility === "public"),
        "Học liệu công khai chỉ lấy các tệp public",
      );
    });
  });

  // ===========================================================================
  // 6. BẢO MẬT XUẤT BẢN, ĐIỂM CÔNG BỐ & ĐỒNG BỘ BRAND STUDIO
  // ===========================================================================
  describe("6. Bảo mật Xuất bản, Điểm Công bố & Đồng bộ Brand Studio", () => {
    it("6.1. getPublishedAnnouncementById chặn bản nháp (draft) bằng NotFoundError và cho phép bản đã đăng", async () => {
      const draftAnn = await cmsService.createAnnouncement({
        title: "Thông báo nháp nội bộ cần bảo vệ",
        status: "draft",
      });

      await assert.rejects(
        async () => {
          await cmsService.getPublishedAnnouncementById(draftAnn.id);
        },
        { name: "NotFoundError" },
      );

      await assert.rejects(
        async () => {
          await cmsService.getAnnouncementById(draftAnn.id, {
            includeDrafts: false,
          });
        },
        { name: "NotFoundError" },
      );

      const adminView = await cmsService.getAnnouncementById(draftAnn.id);
      assert.strictEqual(adminView.status, "draft");

      const pubAnn = await cmsService.createAnnouncement({
        title: "Thông báo đã xuất bản công khai",
        status: "published",
      });
      const publicView = await cmsService.getPublishedAnnouncementById(pubAnn.id);
      assert.strictEqual(publicView.id, pubAnn.id);
    });

    it("6.2. listStudentProjects({ includeDrafts: true }) bao gồm cả draft và pending_review cho Admin CMS", async () => {
      const draftProj = await cmsService.createStudentProject({
        title: "Dự án bản nháp nội bộ",
        studentOrTeam: "Nhóm Alpha",
        status: "draft",
      });
      const pendingProj = await cmsService.createStudentProject({
        title: "Dự án chờ duyệt từ học sinh",
        studentOrTeam: "Nhóm Beta",
        status: "pending_review",
      });

      const publicOnly = await cmsService.listStudentProjects();
      assert.ok(!publicOnly.some((p) => p.id === draftProj.id));
      assert.ok(!publicOnly.some((p) => p.id === pendingProj.id));

      const adminAll = await cmsService.listStudentProjects({
        includeDrafts: true,
      });
      assert.ok(adminAll.some((p) => p.id === draftProj.id));
      assert.ok(adminAll.some((p) => p.id === pendingProj.id));
    });

    it("6.3. recommendTop3Students loại trừ điểm nháp (draft) và học viên đang bảo lưu (on-leave)", async () => {
      const activeStudents = await prisma.student.findMany({
        where: { status: "active", deletedAt: null },
        orderBy: { id: "asc" },
        take: 2,
      });
      const firstActive = activeStudents[0];
      const secondActive = activeStudents[1];
      assert.ok(firstActive && secondActive, "Phải có tối thiểu 2 học sinh active mẫu");

      // Chuyển học sinh đầu sang trạng thái on-leave với điểm công bố rất cao 9.0
      await prisma.student.update({
        where: { id: firstActive.id },
        data: { status: "on_leave", averageScore: 9.0 },
      });
      await prisma.gradeRecord.deleteMany({ where: { studentId: firstActive.id } });
      await prisma.gradeRecord.create({
        data: {
          id: "g-leave-1",
          studentId: firstActive.id,
          classroomId: firstActive.classroomId,
          assessmentTitle: "Mock 9.0",
          date: "2026-11-18",
          listening: 9.0,
          reading: 9.0,
          writing: 9.0,
          speaking: 9.0,
          overall: 9.0,
          comment: "Bảo lưu nhưng điểm cao",
          status: "published",
        },
      });

      // Học sinh active thứ hai chỉ có điểm nháp (draft) 9.5 và 1 bài published 7.0
      await prisma.student.update({
        where: { id: secondActive.id },
        data: { averageScore: 9.5 },
      });
      await prisma.gradeRecord.deleteMany({ where: { studentId: secondActive.id } });
      await prisma.gradeRecord.createMany({
        data: [
          {
            id: "g-draft-secret",
            studentId: secondActive.id,
            classroomId: secondActive.classroomId,
            assessmentTitle: "Bài chấm nháp nội bộ",
            date: "2026-11-19",
            listening: 9.5,
            reading: 9.5,
            writing: 9.5,
            speaking: 9.5,
            overall: 9.5,
            comment: "Nhận xét nháp chưa công bố",
            status: "draft",
          },
          {
            id: "g-pub-only",
            studentId: secondActive.id,
            classroomId: secondActive.classroomId,
            assessmentTitle: "Mid-term Published",
            date: "2026-11-10",
            listening: 7.0,
            reading: 7.0,
            writing: 7.0,
            speaking: 7.0,
            overall: 7.0,
            comment: "Điểm đã công bố",
            status: "published",
          },
        ],
      });

      const recs = await cmsService.recommendTop3Students();
      assert.ok(recs.length >= 1 && recs.length <= 3);

      // Học viên on-leave tuyệt đối không xuất hiện trong đề cử Top 3
      assert.ok(
        recs.every((r) => r.studentId !== firstActive.id),
        "Học viên bảo lưu on-leave không được đề cử lên Bảng vàng",
      );

      // Nếu học sinh thứ 2 xuất hiện trong Top 3, tuyệt đối không lộ điểm draft 9.5
      const matchedSecond = recs.find((r) => r.studentId === secondActive.id);
      if (matchedSecond) {
        assert.ok(
          !matchedSecond.headlineMetric.includes("9.5"),
          "Không được tính hoặc hiển thị điểm chấm nháp 9.5",
        );
        assert.ok(
          matchedSecond.headlineMetric.includes("7.0"),
          "Phải tính điểm trung bình từ bài đã công bố (7.0)",
        );
        assert.ok(
          !matchedSecond.milestones.some((m) => m.includes("9.5")),
          "Milestones không được lộ điểm đọc/viết của bài draft",
        );
      }
    });

    it("6.4. Tệp đính kèm thông báo lưu trữ đầy đủ url và objectKey", async () => {
      const created = await cmsService.createAnnouncement({
        title: "Thông báo có URL đính kèm thực tế",
        category: "schedule",
        attachments: [
          {
            id: "att-url-1",
            name: "Lich-Thi-Cuoi-Ky.pdf",
            size: "1.5 MB",
            type: "PDF",
            url: "https://storage.example.com/public/lich-thi.pdf",
            objectKey: "resources/exercises/2026/11/lich-thi.pdf",
          },
        ],
      });

      assert.strictEqual(
        created.attachments[0].url,
        "https://storage.example.com/public/lich-thi.pdf",
      );
      assert.strictEqual(
        created.attachments[0].objectKey,
        "resources/exercises/2026/11/lich-thi.pdf",
      );

      const updated = await cmsService.addAnnouncementAttachment(created.id, {
        id: "att-url-2",
        name: "Slide-Huong-Dan.pdf",
        size: "2.1 MB",
        type: "SLIDE",
        url: "https://storage.example.com/public/slide.pdf",
      });
      assert.strictEqual(updated.attachments.length, 2);
      assert.strictEqual(
        updated.attachments[1].url,
        "https://storage.example.com/public/slide.pdf",
      );
    });

    it("6.5. Podcast lưu trữ audioKey/audioUrl và đảm bảo chỉ 1 tập nổi bật (isFeatured) tại một thời điểm", async () => {
      const ep1 = await podcastService.createPodcast({
        title: "Tập 1 Nổi bật ban đầu",
        durationLabel: "10:15",
        isFeatured: true,
        audioKey: "podcasts/2026/11/ep1.mp3",
        audioUrl: "https://storage.example.com/ep1.mp3",
      });
      assert.strictEqual(ep1.durationSeconds, 615);
      assert.strictEqual(ep1.isFeatured, true);
      assert.strictEqual(ep1.audioKey, "podcasts/2026/11/ep1.mp3");
      assert.strictEqual(ep1.audioUrl, "https://storage.example.com/ep1.mp3");

      const ep2 = await podcastService.createPodcast({
        title: "Tập 2 thay thế Nổi bật",
        durationLabel: "08:30",
        isFeatured: true,
        audioUrl: "https://storage.example.com/ep2.mp3",
      });

      const refreshedEp1 = await podcastService.getPodcastById(ep1.id);
      assert.strictEqual(refreshedEp1.isFeatured, false);
      assert.strictEqual(ep2.isFeatured, true);
      assert.strictEqual(ep2.durationSeconds, 510);

      const backToEp1 = await podcastService.updatePodcast(ep1.id, {
        isFeatured: true,
      });
      const refreshedEp2 = await podcastService.getPodcastById(ep2.id);
      assert.strictEqual(backToEp1.isFeatured, true);
      assert.strictEqual(refreshedEp2.isFeatured, false);
    });

    it("6.7. Brand Studio đồng bộ cập nhật từ CMS tới getTeacherBrandProfile", async () => {
      await settingsService.updateSystemSettings({
        slogan: "Học sâu hiểu bản chất — Tự tin chuẩn quốc tế.",
        bandAchievementRate: "96% đạt & vượt band 7.0+",
        officeHours: "Thứ 4 & Thứ 6 · 15:00 – 18:00",
        credentials: [
          "M.Ed. in Applied Linguistics — Oxford",
          "IELTS 8.5 Overall (9.0 Writing)",
          "CELTA Distinction",
        ],
      });

      const brand = await settingsService.getTeacherBrandProfile();
      assert.strictEqual(
        brand.slogan,
        "Học sâu hiểu bản chất — Tự tin chuẩn quốc tế.",
      );
      assert.strictEqual(brand.bandAchievementRate, "96% đạt & vượt band 7.0+");
      assert.strictEqual(brand.officeHours, "Thứ 4 & Thứ 6 · 15:00 – 18:00");
      assert.strictEqual(brand.credentials.length, 3);
      assert.strictEqual(
        brand.credentials[0],
        "M.Ed. in Applied Linguistics — Oxford",
      );
    });
  });
    },
  );

  describe("Pure Helpers — CMS & Media Utilities", () => {
    it("3.13. Hàm tiện ích getYoutubeEmbedUrl xử lý đa dạng định dạng URL (watch, embed, short, vimeo, null, empty)", () => {
      assert.strictEqual(
        cmsService.getYoutubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      );
      assert.strictEqual(
        cmsService.getYoutubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ"),
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      );
      assert.strictEqual(
        cmsService.getYoutubeEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ"),
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      );
      assert.strictEqual(
        cmsService.getYoutubeEmbedUrl("https://vimeo.com/76979871"),
        "https://player.vimeo.com/video/76979871",
      );
      assert.strictEqual(
        cmsService.getYoutubeEmbedUrl("https://example.com/video.mp4"),
        "https://example.com/video.mp4",
      );
      assert.strictEqual(cmsService.getYoutubeEmbedUrl(null), null);
      assert.strictEqual(cmsService.getYoutubeEmbedUrl(undefined), null);
      assert.strictEqual(cmsService.getYoutubeEmbedUrl(""), null);
      assert.strictEqual(cmsService.getYoutubeEmbedUrl("   "), null);
    });

    it("6.6. Pure helpers (cms-helpers.ts) tách slogan, chứng chỉ, thời lượng và snapshot điểm công bố chính xác", () => {
      assert.deepStrictEqual(
        cmsHelpers.splitSloganLines(
          "Tư duy ngôn ngữ mạch lạc — Nền tảng học thuật bền vững.",
        ),
        ["Tư duy ngôn ngữ mạch lạc", "Nền tảng học thuật bền vững."],
      );
      assert.deepStrictEqual(
        cmsHelpers.splitSloganLines("Single line slogan"),
        ["Single line slogan", ""],
      );

      assert.deepStrictEqual(
        cmsHelpers.parseCredentialDisplay(
          "M.A. in TESOL — University of Melbourne",
        ),
        { title: "M.A. in TESOL", subtitle: "University of Melbourne" },
      );
      assert.deepStrictEqual(
        cmsHelpers.parseCredentialDisplay(
          "IELTS 8.5 Overall (9.0 Reading & Listening)",
        ),
        {
          title: "IELTS 8.5 Overall",
          subtitle: "(9.0 Reading & Listening)",
        },
      );

      assert.strictEqual(cmsHelpers.parseDurationLabelToSeconds("12:30"), 750);
      assert.strictEqual(
        cmsHelpers.parseDurationLabelToSeconds("01:02:03"),
        3723,
      );
      assert.strictEqual(
        cmsHelpers.parseDurationLabelToSeconds("invalid", 600),
        600,
      );

      const baseStudent = ADMIN_STUDENTS_DATA[0];
      const draftOnlyStudent = {
        ...baseStudent,
        averageScore: 9.0,
        grades: [
          {
            id: "g-only-draft",
            assessmentTitle: "Draft",
            date: "2026-11-20",
            listening: 9.0,
            reading: 9.0,
            writing: 9.0,
            speaking: 9.0,
            overall: 9.0,
            comment: "Nháp chưa công bố",
            status: "draft" as const,
          },
        ],
      };
      const snap = cmsHelpers.extractPublishedStudentHonorSnapshot(
        draftOnlyStudent,
      );
      assert.strictEqual(snap.hasPublishedGrades, false);
      assert.strictEqual(snap.averageScore, 0);
      assert.ok(!snap.headlineMetric.includes("9.0"));

      const stats = cmsHelpers.computeCmsSummaryStats({
        announcements: ANNOUNCEMENTS_DATA,
        podcasts: PODCAST_EPISODES_DATA,
        hallOfFame: HALL_OF_FAME_DATA,
        projects: STUDENT_PROJECTS_DATA,
        resources: RESOURCE_FILES_DATA,
      });
      assert.ok(stats.announcementsPublished >= 1);
      assert.ok(stats.resourcesPublic >= 1);
    });
  });
});
