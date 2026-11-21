import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { resetServerEnvCache } from "@/lib/env";
import {
  ANNOUNCEMENTS_DATA,
  HALL_OF_FAME_DATA,
  RESOURCE_FILES_DATA,
  STUDENT_PROJECTS_DATA,
} from "@/services/classroom-data";
import * as cmsService from "@/services/cms.service";
import { ForbiddenError } from "@/services/errors";
import * as podcastService from "@/services/podcast.service";
import * as scheduleService from "@/services/schedule.service";
import * as settingsService from "@/services/settings.service";
import * as storageService from "@/services/storage.service";
import * as viewerHelpers from "@/services/viewer-home-helpers";
import { getPublicOverviewData } from "@/services/viewer-overview.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

function applyTestEnv() {
  process.env.DATABASE_URL =
    "postgresql://postgres:test-db-pass@localhost:5432/english_manager?schema=public";
  process.env.AUTH_SECRET =
    "test-only-auth-secret-with-at-least-32-characters-long";
  process.env.ADMIN_EMAIL = "teacher@example.com";
  process.env.CLOUDINARY_CLOUD_NAME = "";
  process.env.CLOUDINARY_API_KEY = "";
  process.env.CLOUDINARY_API_SECRET = "";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_PUBLISHABLE_KEY = "";
  process.env.SUPABASE_SECRET_KEY = "";
  process.env.PRIVATE_FILE_URL_TTL_SECONDS = "900";
  resetServerEnvCache();
}

describe("Viewer Public Homepage Service & Helpers — Trang chủ Công khai (/)", () => {
  beforeEach(() => {
    applyTestEnv();
  });

  it("1. getCurrentWeekDateRange tính chính xác Thứ Hai đến Chủ Nhật kể cả đầu tuần, cuối tuần & giao năm", () => {
    // Thứ Hai (2026-11-16)
    const monRange = viewerHelpers.getCurrentWeekDateRange(
      new Date(2026, 10, 16, 9, 0),
    );
    assert.equal(monRange.mondayIso, "2026-11-16");
    assert.equal(monRange.sundayIso, "2026-11-22");
    assert.equal(monRange.datesByDay[4].iso, "2026-11-19");
    assert.equal(monRange.datesByDay[4].shortDate, "19/11");
    assert.equal(monRange.label, "16/11 – 22/11/2026");

    // Chủ Nhật (2026-11-22) vẫn thuộc cùng tuần 16/11–22/11
    const sunRange = viewerHelpers.getCurrentWeekDateRange(
      new Date(2026, 10, 22, 20, 30),
    );
    assert.equal(sunRange.mondayIso, "2026-11-16");
    assert.equal(sunRange.sundayIso, "2026-11-22");

    // Tuần giao năm 2026 -> 2027 (Thứ Tư 2026-12-30)
    const crossYear = viewerHelpers.getCurrentWeekDateRange(
      new Date(2026, 11, 30, 12, 0),
    );
    assert.equal(crossYear.mondayIso, "2026-12-28");
    assert.equal(crossYear.sundayIso, "2027-01-03");
    assert.equal(crossYear.label, "28/12 – 03/01/2027");
  });

  it("2. resolveOccurrenceLiveStatus tính đúng trạng thái thực tế theo ngày & giờ hiện tại", () => {
    const now = new Date(2026, 10, 18, 19, 0); // 2026-11-18 19:00

    assert.equal(
      viewerHelpers.resolveOccurrenceLiveStatus(
        { date: "2026-11-17", startTime: "18:00", endTime: "20:00", status: "upcoming" },
        now,
      ),
      "completed",
    );
    assert.equal(
      viewerHelpers.resolveOccurrenceLiveStatus(
        { date: "2026-11-19", startTime: "18:00", endTime: "20:00", status: "completed" },
        now,
      ),
      "upcoming",
    );
    assert.equal(
      viewerHelpers.resolveOccurrenceLiveStatus(
        { date: "2026-11-18", startTime: "18:00", endTime: "20:00", status: "upcoming" },
        now,
      ),
      "ongoing",
    );
    assert.equal(
      viewerHelpers.resolveOccurrenceLiveStatus(
        { date: "2026-11-18", startTime: "14:00", endTime: "16:00", status: "upcoming" },
        now,
      ),
      "completed",
    );
    assert.equal(
      viewerHelpers.resolveOccurrenceLiveStatus(
        { date: "2026-11-18", startTime: "18:00", endTime: "20:00", status: "canceled" },
        now,
      ),
      "canceled",
    );
  });

  it("3. selectFeaturedAnnouncements loại bỏ bản nháp (draft) và ưu tiên Tin khẩn / Ghim", () => {
    const base = structuredClone(ANNOUNCEMENTS_DATA[0]);
    assert.ok(base);

    const items = [
      { ...base, id: "a-draft", isUrgent: true, isPinned: true, status: "draft" as const },
      { ...base, id: "a-normal", isUrgent: false, isPinned: false, status: "published" as const },
      { ...base, id: "a-pinned", isUrgent: false, isPinned: true, status: "published" as const },
      { ...base, id: "a-urgent-pin", isUrgent: true, isPinned: true, status: "published" as const },
      { ...base, id: "a-extra", isUrgent: false, isPinned: false, status: "published" as const },
    ];

    const { featured, secondary } = viewerHelpers.selectFeaturedAnnouncements(items, 2);
    assert.equal(featured?.id, "a-urgent-pin");
    assert.equal(secondary.length, 2);
    assert.equal(secondary[0].id, "a-pinned");
    assert.equal(secondary.some((i) => i.id === "a-draft"), false);
  });

  it("4. selectFeaturedHallOfFame sắp xếp chuẩn thứ hạng #1 -> #4 dù dữ liệu gốc bị đảo thứ tự", () => {
    const reversed = [...structuredClone(HALL_OF_FAME_DATA)].reverse();

    const sortedTop4 = viewerHelpers.selectFeaturedHallOfFame(reversed, 4);
    assert.equal(sortedTop4.length, Math.min(4, reversed.length));
    for (let i = 1; i < sortedTop4.length; i++) {
      assert.ok(sortedTop4[i].rank >= sortedTop4[i - 1].rank);
    }
  });

  it("5. selectFeaturedProjects chỉ chọn dự án đã xuất bản (published) & ưu tiên dự án có posterUrl", () => {
    const seed = structuredClone(STUDENT_PROJECTS_DATA[0]);
    assert.ok(seed);

    const list = [
      { ...seed, id: "p-draft", status: "draft" as const, posterUrl: "https://cdn.example/draft.jpg" },
      { ...seed, id: "p-pending", status: "pending_review" as const, posterUrl: "https://cdn.example/pend.jpg" },
      { ...seed, id: "p-no-img", status: "published" as const, posterUrl: null },
      { ...seed, id: "p-with-img", status: "published" as const, posterUrl: "https://cdn.example/poster.jpg" },
    ];

    const selected = viewerHelpers.selectFeaturedProjects(list, 2);
    assert.equal(selected.length, 2);
    assert.equal(selected[0].id, "p-with-img");
    assert.equal(selected[1].id, "p-no-img");
  });

  it("6. selectPublicResources lọc tuyệt đối tệp nội bộ (private) và tệp đã xóa mềm", () => {
    const seed = structuredClone(RESOURCE_FILES_DATA[0]);
    assert.ok(seed);

    const list = [
      { ...seed, id: "f-priv", visibility: "private" as const, deletedAt: null },
      { ...seed, id: "f-del", visibility: "public" as const, deletedAt: "2026-11-20T00:00:00Z" },
      { ...seed, id: "f-pub-1", visibility: "public" as const, deletedAt: null },
    ];

    const selected = viewerHelpers.selectPublicResources(list, 3);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, "f-pub-1");
  });

  describe(
    "DB-backed Viewer Homepage Overview Service",
    { skip: !hasTestDatabase() },
    () => {
      beforeEach(async () => {
        await resetAndSeedTestDatabase();
      });

      after(async () => {
        await teardownTestDatabase();
      });

      it("7. getPublicOverviewData đảm bảo Cổng kiểm duyệt Công khai & Privacy-by-Design", async () => {
        await settingsService.updateSystemSettings({
          defaultPortalPin: "TOP-SECRET-PIN-99",
          presignedExpirySeconds: 1500,
        });

        const draftAnn = await cmsService.createAnnouncement({
          title: "Thông báo nội bộ chưa duyệt",
          excerpt: "Chỉ ở chế độ nháp",
          category: "urgent",
          status: "draft",
        });

        const pendingProj = await cmsService.createStudentProject({
          title: "Bài luận chờ duyệt chưa công bố",
          studentOrTeam: "Nguyễn Test",
          className: "IELTS 6.5",
          category: "Academic Essay",
          summary: "Đang chờ duyệt",
          featuredMetric: "7.0",
          status: "pending_review",
        });

        const draftPodcast = await podcastService.createPodcast({
          episodeNumber: 99,
          title: "Tập Podcast nháp",
          summary: "Chưa phát hành công khai",
          category: "weekly-digest",
          durationSeconds: 300,
          status: "draft",
        });

        const privateDoc = await storageService.createResourceFile({
          title: "Đề thi mật nội bộ",
          folderId: "fld-writing",
          fileType: "PDF",
          visibility: "private",
        });

        const overview = await getPublicOverviewData(
          new Date(2026, 10, 18, 10, 0),
        );
        const teacherRecord = overview.teacher as unknown as Record<
          string,
          unknown
        >;

        assert.equal(teacherRecord.defaultPortalPin, undefined);
        assert.equal(teacherRecord.presignedExpirySeconds, undefined);
        assert.equal(
          overview.announcements.some((a) => a.id === draftAnn.id),
          false,
        );
        assert.equal(
          overview.projects.some((p) => p.id === pendingProj.id),
          false,
        );
        assert.equal(
          overview.podcasts.some((p) => p.id === draftPodcast.id),
          false,
        );
        assert.equal(
          overview.resources.some((r) => r.id === privateDoc.id),
          false,
        );

        // Không rò rỉ dữ liệu sĩ số, tỷ lệ chuyên cần hay ghi chú nhật ký vào lịch tuần công khai
        assert.ok(overview.weekOccurrences.length > 0);
        const firstOcc = overview.weekOccurrences[0] as unknown as Record<
          string,
          unknown
        >;
        assert.equal(firstOcc.enrolledCount, undefined);
        assert.equal(firstOcc.capacity, undefined);
        assert.equal(firstOcc.attendanceRate, undefined);
        assert.equal(firstOcc.attendanceRecorded, undefined);
        assert.equal(firstOcc.journalStatus, undefined);
      });

      it("8. getPublicOverviewData hợp nhất đúng ngoại lệ lịch dạy (Dạy bù & Báo nghỉ/Hủy ca) trong tuần", async () => {
        const now = new Date(2026, 10, 18, 10, 0); // Tuần 2026-11-16..2026-11-22
        const sessions = await scheduleService.listWeeklySchedule({
          dayOfWeek: 0,
        });
        const targetSession = sessions[0];
        assert.ok(targetSession);

        const targetDateOffset = targetSession.dayOfWeek - 1;
        const origDate = viewerHelpers.toLocalIsoDate(
          new Date(2026, 10, 16 + targetDateOffset),
        );
        const makeupDate = "2026-11-22";

        await scheduleService.createScheduleException({
          type: "canceled",
          originalSessionId: targetSession.id,
          classCode: targetSession.classCode,
          originalDate: origDate,
          reason: "Nghỉ lễ nội bộ trung tâm",
        });

        await scheduleService.createScheduleException({
          type: "makeup",
          classCode: targetSession.classCode,
          originalDate: makeupDate,
          newDate: makeupDate,
          startTime: "14:30",
          endTime: "16:30",
          room: "Phòng 401 · Cơ sở Nguyễn Du",
          topic: "Buổi học bù chuyên đề Speaking Part 3",
          reason: "Bù ca nghỉ trong tuần",
        });

        const overview = await getPublicOverviewData(now);
        const canceledOcc = overview.weekOccurrences.find(
          (o) =>
            o.date === origDate &&
            o.classCode === targetSession.classCode &&
            o.status === "canceled",
        );
        const makeupOcc = overview.weekOccurrences.find(
          (o) =>
            o.date === makeupDate &&
            o.source === "makeup" &&
            o.classCode === targetSession.classCode,
        );

        assert.ok(canceledOcc);
        assert.equal(canceledOcc.exceptionReason, "Nghỉ lễ nội bộ trung tâm");
        assert.ok(makeupOcc);
        assert.equal(
          makeupOcc.topic,
          "Buổi học bù chuyên đề Speaking Part 3",
        );
      });

      it("9. recordPublicResourceDownload tăng lượt tải thật trên tệp Công khai & chặn tệp Nội bộ", async () => {
        const publicFile = await storageService.createResourceFile({
          title: "Bộ đề Reading Band 7.5+ Công khai",
          folderId: "fld-writing",
          fileType: "PDF",
          visibility: "public",
          objectKey: "resources/exercises/reading-public.pdf",
        });
        const privateFile = await storageService.createResourceFile({
          title: "Đáp án chấm thi nội bộ",
          folderId: "fld-writing",
          fileType: "PDF",
          visibility: "private",
          objectKey: "internal-documents/grading-key.pdf",
        });

        const firstDownload =
          await storageService.recordPublicResourceDownload(publicFile.id);
        assert.equal(firstDownload.downloads, 1);
        assert.ok(firstDownload.publicUrl?.includes("reading-public.pdf"));

        const secondDownload =
          await storageService.recordPublicResourceDownload(publicFile.id);
        assert.equal(secondDownload.downloads, 2);

        await assert.rejects(
          () => storageService.recordPublicResourceDownload(privateFile.id),
          (err: unknown) => err instanceof ForbiddenError,
        );
      });

      it("10. Thay đổi Hồ sơ Thương hiệu & Học kỳ trong Settings phản ánh ngay lên getPublicOverviewData()", async () => {
        await settingsService.updateSystemSettings({
          name: "ThS. Nguyễn Minh Anh (Cambridge Mentor)",
          avatarUrl:
            "https://res.cloudinary.com/demo/image/upload/teacher-new.jpg",
          slogan: "Học bản chất – Tự tin làm chủ học thuật",
          bandAchievementRate: "96% đạt mục tiêu",
          currentTerm: "Học kỳ II · Năm học 2026–2027",
        });

        const overview = await getPublicOverviewData(
          new Date(2026, 10, 18, 10, 0),
        );
        assert.equal(
          overview.teacher.name,
          "ThS. Nguyễn Minh Anh (Cambridge Mentor)",
        );
        assert.equal(
          overview.teacher.avatarUrl,
          "https://res.cloudinary.com/demo/image/upload/teacher-new.jpg",
        );
        assert.equal(
          overview.teacher.slogan,
          "Học bản chất – Tự tin làm chủ học thuật",
        );
        assert.equal(
          overview.teacher.bandAchievementRate,
          "96% đạt mục tiêu",
        );
        assert.equal(overview.currentTerm, "Học kỳ II · Năm học 2026–2027");
      });
    },
  );
});
