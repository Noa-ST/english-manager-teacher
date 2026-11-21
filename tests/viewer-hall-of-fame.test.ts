import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import {
  HALL_OF_FAME_DATA,
  type HallOfFameStudent,
} from "@/services/classroom-data";
import * as cmsService from "@/services/cms.service";
import * as hallOfFameHelpers from "@/services/hall-of-fame-helpers";
import * as viewerOverviewService from "@/services/viewer-overview.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

describe("Viewer Public Hall of Fame Service & Helpers — /hall-of-fame", () => {
  it("1. normalizeHallOfFameSearch khử dấu tiếng Việt và chữ đ/Đ chính xác", () => {
    assert.equal(
      hallOfFameHelpers.normalizeHallOfFameSearch("  Trần Bảo Ngọc · Bứt phá  "),
      "tran bao ngoc · but pha",
    );
    assert.equal(
      hallOfFameHelpers.normalizeHallOfFameSearch("Đặng Quốc Huy — Quán quân Đọc hiểu"),
      "dang quoc huy — quan quan doc hieu",
    );
  });

  it("2. sanitizeHallOfFameForPublic loại bỏ tuyệt đối studentId và classId nội bộ", () => {
    const hallOfFame = structuredClone(HALL_OF_FAME_DATA);
    assert.ok(hallOfFame.some((s) => Boolean(s.studentId) && Boolean(s.classId)));

    const sanitized = hallOfFameHelpers.sanitizeHallOfFameForPublic(hallOfFame);
    assert.equal(sanitized.length, hallOfFame.length);

    for (const item of sanitized) {
      assert.equal("studentId" in item, false, "Không được rò rỉ studentId ra công khai");
      assert.equal("classId" in item, false, "Không được rò rỉ classId ra công khai");
      assert.ok(item.id.length > 0);
      assert.ok(item.displayName.length > 0);
      assert.ok(Array.isArray(item.milestones));
    }

    // Kiểm tra bản sao mảng milestones không chia sẻ tham chiếu
    sanitized[0].milestones.push("TEST");
    assert.equal(hallOfFame[0].milestones.includes("TEST"), false);
  });

  it("3. selectPodiumForPeriod thích ứng linh hoạt theo month / week / course và ưu tiên month khi chọn all", () => {
    const hallOfFame = structuredClone(HALL_OF_FAME_DATA);
    const publicList = hallOfFameHelpers.sanitizeHallOfFameForPublic(hallOfFame);

    const podiumAll = hallOfFameHelpers.selectPodiumForPeriod(publicList, "all");
    assert.ok(podiumAll);
    assert.equal(podiumAll.period, "month");
    assert.equal(podiumAll.heading, "Top 3 Gương mặt tiêu biểu trong tháng");
    assert.deepEqual(
      podiumAll.orderedEntries.map((s) => s.rank),
      [2, 1, 3],
      "Bục Top 3 desktop phải giữ thứ tự #2 – #1 – #3",
    );

    const podiumWeek = hallOfFameHelpers.selectPodiumForPeriod(publicList, "week");
    assert.ok(podiumWeek);
    assert.equal(podiumWeek.period, "week");
    assert.equal(podiumWeek.heading, "Top 3 Gương mặt tiêu biểu trong tuần");
    assert.equal(podiumWeek.periodLabel, "Tuần 45 (02/11 – 08/11)");

    const podiumCourse = hallOfFameHelpers.selectPodiumForPeriod(publicList, "course");
    assert.ok(podiumCourse);
    assert.equal(podiumCourse.period, "course");
    assert.equal(podiumCourse.heading, "Top 3 Gương mặt tiêu biểu toàn khóa");
    assert.equal(podiumCourse.periodLabel, "Khóa Hè – Thu 2026");
  });

  it("4. selectPodiumForPeriod gom đúng 1 đợt mới nhất khi có nhiều tháng/tuần và tự ẩn khi trống", () => {
    const mixedMonths: HallOfFameStudent[] = [
      {
        id: "m10-1",
        displayName: "Học viên Tháng 10 #1",
        avatarInitials: "A1",
        className: "IELTS Intensive 6.5+",
        rank: 1,
        period: "month",
        periodLabel: "Tháng 10/2026",
        headlineMetric: "7.5",
        badgeTitle: "Xuất sắc T10",
        teacherEndorsement: "Tốt",
        milestones: ["Reading 8.0"],
      },
      {
        id: "m10-2",
        displayName: "Học viên Tháng 10 #2",
        avatarInitials: "A2",
        className: "IELTS Foundation",
        rank: 2,
        period: "month",
        periodLabel: "Tháng 10/2026",
        headlineMetric: "7.0",
        badgeTitle: "Nổi bật T10",
        teacherEndorsement: "Tốt",
        milestones: ["Listening 7.5"],
      },
      {
        id: "m11-1",
        displayName: "Học viên Tháng 11 #1",
        avatarInitials: "B1",
        className: "IELTS Intensive 6.5+",
        rank: 1,
        period: "month",
        periodLabel: "Tháng 11/2026",
        headlineMetric: "8.0",
        badgeTitle: "Xuất sắc T11",
        teacherEndorsement: "Xuất sắc",
        milestones: ["Writing 8.0"],
      },
      {
        id: "m11-3",
        displayName: "Học viên Tháng 11 #3",
        avatarInitials: "B3",
        className: "Academic Writing B2-C1",
        rank: 3,
        period: "month",
        periodLabel: "Tháng 11/2026",
        headlineMetric: "7.5",
        badgeTitle: "Tiến bộ T11",
        teacherEndorsement: "Tốt",
        milestones: ["Speaking 7.5"],
      },
    ];

    const sanitized = hallOfFameHelpers.sanitizeHallOfFameForPublic(mixedMonths);
    const podium = hallOfFameHelpers.selectPodiumForPeriod(sanitized, "month");
    assert.ok(podium);
    assert.equal(podium.periodLabel, "Tháng 11/2026");
    assert.deepEqual(
      podium.entries.map((s) => s.id),
      ["m11-1", "m11-3"],
      "Không trộn hồ sơ Tháng 10 vào Bục Tháng 11",
    );

    // Khi chọn week trong tập chỉ có month -> trả null để ẩn Podium sạch sẽ
    assert.equal(hallOfFameHelpers.selectPodiumForPeriod(sanitized, "week"), null);
  });

  it("5. filterAndSortHallOfFame hỗ trợ tìm tiếng Việt không dấu, lọc lớp/đợt, loại ID Podium & sắp xếp", () => {
    const hallOfFame = structuredClone(HALL_OF_FAME_DATA);
    const publicList = hallOfFameHelpers.sanitizeHallOfFameForPublic(hallOfFame);

    // Tìm theo dấu ấn hoặc tên không dấu
    const byDiacriticFree = hallOfFameHelpers.filterAndSortHallOfFame(publicList, {
      search: "bao ngoc",
    });
    assert.equal(byDiacriticFree.length, 1);
    assert.equal(byDiacriticFree[0].displayName, "Trần Bảo Ngọc");

    const byMilestoneSearch = hallOfFameHelpers.filterAndSortHallOfFame(publicList, {
      search: "collocations",
    });
    assert.equal(byMilestoneSearch.length, 1);
    assert.equal(byMilestoneSearch[0].displayName, "Phạm Hà Phương");

    // Lọc kết hợp lớp & loại ID của Podium mặc định
    const podium = hallOfFameHelpers.selectPodiumForPeriod(publicList, "all");
    assert.ok(podium);
    const withoutPodium = hallOfFameHelpers.filterAndSortHallOfFame(publicList, {
      period: "all",
      excludeIds: podium.entryIds,
    });
    assert.equal(withoutPodium.length, publicList.length - podium.entries.length);
    assert.equal(
      withoutPodium.some((item) => podium.entryIds.has(item.id)),
      false,
    );

    // Sắp xếp theo tên tiếng Việt A -> Z
    const byName = hallOfFameHelpers.filterAndSortHallOfFame(publicList, {
      sortBy: "name_asc",
    });
    for (let i = 1; i < byName.length; i += 1) {
      assert.ok(
        byName[i - 1].displayName.localeCompare(byName[i].displayName, "vi") <= 0,
      );
    }
  });

  it("6. countHallOfFameByPeriod, extractHallOfFameClasses, extractHallOfFamePeriodLabels & computeHallOfFameStats", () => {
    const hallOfFame = structuredClone(HALL_OF_FAME_DATA);
    const publicList = hallOfFameHelpers.sanitizeHallOfFameForPublic(hallOfFame);

    const counts = hallOfFameHelpers.countHallOfFameByPeriod(publicList);
    assert.equal(counts.all, 9);
    assert.equal(counts.month, 3);
    assert.equal(counts.week, 3);
    assert.equal(counts.course, 3);

    const classes = hallOfFameHelpers.extractHallOfFameClasses(publicList);
    assert.deepEqual(classes, [
      "Academic Writing B2-C1",
      "IELTS Foundation",
      "IELTS Intensive 6.5+",
      "Junior Academic Explorers",
    ]);

    const monthLabels = hallOfFameHelpers.extractHallOfFamePeriodLabels(
      publicList,
      "month",
    );
    assert.deepEqual(monthLabels, ["Tháng 11/2026"]);

    const stats = hallOfFameHelpers.computeHallOfFameStats(publicList);
    assert.deepEqual(stats, {
      totalHonors: 9,
      uniqueClasses: 4,
      uniquePeriods: 3,
      latestPeriodLabel: "Tháng 11/2026",
    });
  });

  describe("DB-backed Hall of Fame Service", { skip: !hasTestDatabase() }, () => {
    beforeEach(async () => {
      await resetAndSeedTestDatabase();
    });

    after(async () => {
      await teardownTestDatabase();
    });

  it("7. cmsService.listHallOfFame hỗ trợ tìm kiếm không dấu, lọc className/periodLabel & giữ studentId cho Admin", async () => {
    const bySearch = await cmsService.listHallOfFame({ search: "minh khoi" });
    assert.equal(bySearch.length, 1);
    assert.equal(bySearch[0].displayName, "Lê Hoàng Minh Khôi");
    assert.equal(bySearch[0].studentId, "stu-02");

    const byClass = await cmsService.listHallOfFame({
      className: "IELTS Foundation",
    });
    assert.equal(byClass.length, 3);
    assert.ok(byClass.every((s) => s.className === "IELTS Foundation"));

    const byBatch = await cmsService.listHallOfFame({
      periodLabel: "Tuần 45 (02/11 – 08/11)",
    });
    assert.equal(byBatch.length, 3);
    assert.ok(byBatch.every((s) => s.period === "week"));
  });

  it("8. getPublicOverviewData đảm bảo hallOfFame công khai không rò rỉ studentId hoặc classId", async () => {
    const overview = await viewerOverviewService.getPublicOverviewData(
      new Date("2026-11-21T09:00:00"),
    );
    assert.ok(overview.hallOfFame.length > 0);
    for (const item of overview.hallOfFame) {
      assert.equal("studentId" in item, false);
      assert.equal("classId" in item, false);
    }
  });
  });
});
