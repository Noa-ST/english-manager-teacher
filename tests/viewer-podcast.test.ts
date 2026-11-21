import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import {
  PODCAST_EPISODES_DATA,
  type PodcastEpisode,
} from "@/services/classroom-data";
import * as podcastHelpers from "@/services/podcast-helpers";
import * as podcastService from "@/services/podcast.service";
import * as viewerOverviewService from "@/services/viewer-overview.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

describe("Viewer Public Podcast Service & Helpers — /podcast", () => {
  it("1. normalizePodcastSearch khử dấu tiếng Việt và chữ đ/Đ chính xác", () => {
    assert.equal(
      podcastHelpers.normalizePodcastSearch("  Phát âm & Ngữ điệu Tự nhiên  "),
      "phat am & ngu dieu tu nhien",
    );
    assert.equal(
      podcastHelpers.normalizePodcastSearch("Đồng hành cùng con tuổi Teen"),
      "dong hanh cung con tuoi teen",
    );
  });

  it("2. isSafePublicAudioUrl chỉ chấp nhận https://, http:// hoặc đường dẫn tương đối an toàn", () => {
    assert.equal(podcastHelpers.isSafePublicAudioUrl("https://cdn.example.com/ep1.mp3"), true);
    assert.equal(podcastHelpers.isSafePublicAudioUrl("http://localhost:3000/ep1.mp3"), true);
    assert.equal(podcastHelpers.isSafePublicAudioUrl("/audio/ep1.mp3"), true);

    assert.equal(podcastHelpers.isSafePublicAudioUrl("javascript:alert(1)"), false);
    assert.equal(podcastHelpers.isSafePublicAudioUrl("data:audio/mp3;base64,AAA"), false);
    assert.equal(podcastHelpers.isSafePublicAudioUrl("//evil.com/x.mp3"), false);
    assert.equal(podcastHelpers.isSafePublicAudioUrl("   "), false);
    assert.equal(podcastHelpers.isSafePublicAudioUrl(null), false);
  });

  it("3. sanitizePodcastsForPublic loại bản nháp (draft), xóa audioKey/thumbnailKey & chuẩn hóa URL", () => {
    const podcasts = structuredClone(PODCAST_EPISODES_DATA);
    const draftEpisode: PodcastEpisode = {
      ...podcasts[0],
      id: "ep-draft-secret",
      episodeNumber: 99,
      status: "draft",
      audioKey: "private/secret.mp3",
      thumbnailKey: "private/secret.jpg",
      audioUrl: "https://cdn.example.com/secret.mp3",
    };
    const publishedWithKeys: PodcastEpisode = {
      ...podcasts[0],
      id: "ep-pub-keys",
      episodeNumber: 20,
      status: "published",
      audioKey: "english-portal/podcast-20.mp3",
      thumbnailKey: "english-portal/thumb-20.jpg",
      audioUrl: "javascript:void(0)",
    };

    const sanitized = podcastHelpers.sanitizePodcastsForPublic([
      draftEpisode,
      publishedWithKeys,
      podcasts[0],
    ]);

    assert.equal(sanitized.some((ep) => ep.id === "ep-draft-secret"), false);
    const cleaned = sanitized.find((ep) => ep.id === "ep-pub-keys");
    assert.ok(cleaned);
    assert.equal("audioKey" in cleaned, false, "Không được rò rỉ audioKey");
    assert.equal("thumbnailKey" in cleaned, false, "Không được rò rỉ thumbnailKey");
    assert.equal(cleaned.audioUrl, null, "URL không an toàn phải bị loại thành null");
  });

  it("4. parseShowNoteChapters & resolveActiveChapterIndex tách đúng mốc MM:SS, HH:MM:SS và highlight chương theo giây", () => {
    const chapters = podcastHelpers.parseShowNoteChapters([
      "00:00 — Mở đầu: Tổng quan",
      "03:40 — 3 nhóm cấu trúc Hedging",
      "1:02:05 - Tổng kết mở rộng",
      "Ghi chú không có mốc thời gian",
    ]);

    assert.equal(chapters.length, 4);
    assert.equal(chapters[0].seconds, 0);
    assert.equal(chapters[0].timestampLabel, "00:00");
    assert.equal(chapters[0].text, "Mở đầu: Tổng quan");

    assert.equal(chapters[1].seconds, 220);
    assert.equal(chapters[1].timestampLabel, "03:40");
    assert.equal(chapters[1].text, "3 nhóm cấu trúc Hedging");

    assert.equal(chapters[2].seconds, 3725);
    assert.equal(chapters[2].timestampLabel, "1:02:05");

    assert.equal(chapters[3].seconds, null);
    assert.equal(chapters[3].timestampLabel, null);

    assert.equal(podcastHelpers.resolveActiveChapterIndex(chapters, 0), 0);
    assert.equal(podcastHelpers.resolveActiveChapterIndex(chapters, 219), 0);
    assert.equal(podcastHelpers.resolveActiveChapterIndex(chapters, 220), 1);
    assert.equal(podcastHelpers.resolveActiveChapterIndex(chapters, 3750), 2);
  });

  it("5. selectDefaultEpisode ưu tiên requestedId -> isFeatured -> số tập cao nhất", () => {
    const podcasts = structuredClone(PODCAST_EPISODES_DATA);
    const pub = podcastHelpers.sanitizePodcastsForPublic(podcasts);

    assert.equal(podcastHelpers.selectDefaultEpisode(pub, "pod-ep-17")?.id, "pod-ep-17");
    assert.equal(podcastHelpers.selectDefaultEpisode(pub, "missing-id")?.id, "pod-ep-19");

    const withoutFeatured = pub.map((ep) => ({ ...ep, isFeatured: false }));
    assert.equal(podcastHelpers.selectDefaultEpisode(withoutFeatured, null)?.episodeNumber, 19);
    assert.equal(podcastHelpers.selectDefaultEpisode([], null), null);
  });

  it("6. filterAndSortPodcasts tìm không dấu qua tiêu đề, Show Notes, nghĩa từ vựng, lọc audio & sắp xếp", () => {
    const podcasts = structuredClone(PODCAST_EPISODES_DATA);
    const enriched = podcastHelpers.sanitizePodcastsForPublic(
      podcasts.map((ep, idx) =>
        idx === 1 ? { ...ep, audioUrl: "https://cdn.example.com/ep18.mp3" } : ep,
      ),
    );

    const byShowNote = podcastHelpers.filterAndSortPodcasts(enriched, {
      search: "bay doi y",
    });
    assert.equal(byShowNote.length, 1);
    assert.equal(byShowNote[0].id, "pod-ep-18");

    const byVocabMeaning = podcastHelpers.filterAndSortPodcasts(enriched, {
      search: "dong luc tu than",
    });
    assert.equal(byVocabMeaning.length, 1);
    assert.equal(byVocabMeaning[0].id, "pod-ep-16");

    const audioOnly = podcastHelpers.filterAndSortPodcasts(enriched, {
      onlyWithAudio: true,
    });
    assert.equal(audioOnly.length, 1);
    assert.equal(audioOnly[0].id, "pod-ep-18");

    const shortestFirst = podcastHelpers.filterAndSortPodcasts(enriched, {
      sortBy: "shortest",
    });
    assert.equal(shortestFirst[0].id, "pod-ep-17"); // 650s
    assert.equal(shortestFirst[shortestFirst.length - 1].id, "pod-ep-16"); // 930s
  });

  it("7. countPodcastsByCategory, computePodcastStats, formatTotalListeningDuration & getAdjacentEpisodes", () => {
    const podcasts = structuredClone(PODCAST_EPISODES_DATA);
    const pub = podcastHelpers.sanitizePodcastsForPublic(podcasts);

    const counts = podcastHelpers.countPodcastsByCategory(pub);
    assert.equal(counts.all, 4);
    assert.equal(counts["weekly-digest"], 1);
    assert.equal(counts["ielts-listening"], 1);
    assert.equal(counts.pronunciation, 1);
    assert.equal(counts["parent-corner"], 1);

    const stats = podcastHelpers.computePodcastStats(pub);
    assert.equal(stats.totalEpisodes, 4);
    assert.equal(stats.totalDurationSeconds, 885 + 740 + 650 + 930);
    assert.equal(stats.totalVocabulary, 8);
    assert.equal(stats.audioReadyCount, 0);
    assert.equal(stats.latestPublishedAt, "11/11/2026");

    assert.equal(podcastHelpers.formatTotalListeningDuration(0), "0 phút");
    assert.equal(podcastHelpers.formatTotalListeningDuration(2580), "43 phút");
    assert.equal(podcastHelpers.formatTotalListeningDuration(3600), "1 giờ");
    assert.equal(podcastHelpers.formatTotalListeningDuration(4320), "1 giờ 12 phút");

    const adjMiddle = podcastHelpers.getAdjacentEpisodes("pod-ep-18", pub);
    assert.equal(adjMiddle.prev?.id, "pod-ep-19");
    assert.equal(adjMiddle.next?.id, "pod-ep-17");
  });

  describe("DB-backed Podcast Service", { skip: !hasTestDatabase() }, () => {
    beforeEach(async () => {
      await resetAndSeedTestDatabase();
    });

    after(async () => {
      await teardownTestDatabase();
    });

  it("8. podcastService.listPodcasts hỗ trợ tìm không dấu, lọc onlyWithAudio và ẩn draft theo mặc định", async () => {
    const createdDraft = await podcastService.createPodcast({
      title: "Tập nháp nội bộ chưa công khai",
      category: "weekly-digest",
      status: "draft",
      audioUrl: "https://cdn.example.com/draft.mp3",
    });
    const createdAudio = await podcastService.createPodcast({
      title: "Kỹ thuật Paraphrase IELTS Speaking Band 8",
      category: "pronunciation",
      status: "published",
      audioUrl: "https://cdn.example.com/paraphrase.mp3",
      showNotes: ["00:00 — Giới thiệu từ đồng nghĩa học thuật"],
    });

    const publicSearch = await podcastService.listPodcasts({
      search: "tu dong nghia",
    });
    assert.equal(publicSearch.items.length, 1);
    assert.equal(publicSearch.items[0].id, createdAudio.id);

    const onlyAudio = await podcastService.listPodcasts({
      onlyWithAudio: true,
    });
    assert.equal(onlyAudio.items.some((e) => e.id === createdDraft.id), false);
    assert.equal(onlyAudio.items.some((e) => e.id === createdAudio.id), true);

    const adminAll = await podcastService.listPodcasts({
      includeDrafts: true,
    });
    assert.ok(adminAll.items.some((e) => e.id === createdDraft.id));
  });

  it("9. getPublicOverviewData chỉ xuất tập published và loại sạch audioKey/thumbnailKey", async () => {
    await podcastService.createPodcast({
      title: "Bản nháp ẩn khỏi Overview",
      status: "draft",
      audioKey: "private/secret-draft.mp3",
    });
    await podcastService.createPodcast({
      title: "Bản xuất bản có khóa nội bộ",
      status: "published",
      audioKey: "private/secret-pub.mp3",
      thumbnailKey: "private/thumb-pub.jpg",
      audioUrl: "https://cdn.example.com/pub.mp3",
    });

    const overview = await viewerOverviewService.getPublicOverviewData(
      new Date("2026-11-21T09:00:00"),
    );

    assert.ok(overview.podcasts.length >= 5);
    assert.ok(overview.podcasts.every((ep) => ep.status === "published"));
    for (const ep of overview.podcasts) {
      assert.equal("audioKey" in ep, false);
      assert.equal("thumbnailKey" in ep, false);
    }
  });
  });
});
