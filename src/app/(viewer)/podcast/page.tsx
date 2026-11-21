"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Clock,
  Headphones,
  ListMusic,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  computePodcastStats,
  countPodcastsByCategory,
  filterAndSortPodcasts,
  formatTotalListeningDuration,
  getAdjacentEpisodes,
  parseShowNoteChapters,
  resolveActiveChapterIndex,
  selectDefaultEpisode,
  type PodcastCategoryFilter,
  type PodcastSortKey,
  type PublicPodcastEpisode,
  type ViewerPodcastHost,
  type ViewerPodcastsPayload,
} from "@/services/podcast-helpers";
import { apiRequest } from "@/lib/api-client";
import {
  AudioPlayer,
  type AudioPlayerHandle,
} from "@/components/viewer/audio-player";
import { PodcastEpisodeCard } from "@/components/viewer/podcast/podcast-episode-card";
import { PodcastShowNotesPanel } from "@/components/viewer/podcast/podcast-show-notes-panel";
import { PodcastToolbar } from "@/components/viewer/podcast/podcast-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  EmptyState,
  PaginationBar,
  Skeleton,
} from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

const VALID_CATEGORIES = new Set<string>([
  "all",
  "weekly-digest",
  "ielts-listening",
  "pronunciation",
  "parent-corner",
]);

const VALID_SORTS = new Set<string>([
  "newest",
  "oldest",
  "shortest",
  "longest",
]);

function parseCategoryParam(raw: string | null): PodcastCategoryFilter {
  if (raw && VALID_CATEGORIES.has(raw)) {
    return raw as PodcastCategoryFilter;
  }
  return "all";
}

function parseSortParam(raw: string | null): PodcastSortKey {
  if (raw && VALID_SORTS.has(raw)) {
    return raw as PodcastSortKey;
  }
  return "newest";
}

function PodcastSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-4 w-120 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <div className="grid gap-8 lg:grid-cols-12">
        <Skeleton className="h-96 rounded-2xl lg:col-span-7" />
        <Skeleton className="h-96 rounded-2xl lg:col-span-5" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
    </div>
  );
}

function PodcastPageContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const playerRef = React.useRef<AudioPlayerHandle | null>(null);
  const studioSectionRef = React.useRef<HTMLElement | null>(null);

  const [episodes, setEpisodes] = React.useState<PublicPodcastEpisode[]>([]);
  const [host, setHost] = React.useState<ViewerPodcastHost>({
    name: "",
    title: "",
    avatarUrl: "/images/teacher-avatar.jpg",
  });
  const [currentTerm, setCurrentTerm] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const [activeEpisodeId, setActiveEpisodeId] = React.useState<string>(
    () => searchParams.get("episode") ?? "",
  );
  const [playbackTime, setPlaybackTime] = React.useState(0);

  const [selectedCategory, setSelectedCategory] =
    React.useState<PodcastCategoryFilter>(() =>
      parseCategoryParam(searchParams.get("category")),
    );
  const [sortBy, setSortBy] = React.useState<PodcastSortKey>(() =>
    parseSortParam(searchParams.get("sort")),
  );
  const [onlyWithAudio, setOnlyWithAudio] = React.useState<boolean>(
    () => searchParams.get("audio") === "1",
  );
  const [searchQuery, setSearchQuery] = React.useState<string>(
    () => searchParams.get("q") ?? "",
  );

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  React.useEffect(() => {
    let active = true;
    apiRequest<ViewerPodcastsPayload>("/api/viewer/podcasts")
      .then((res) => {
        if (!active) return;
        setEpisodes(Array.isArray(res?.items) ? res.items : []);
        setHost(
          res?.host ?? {
            name: "",
            title: "",
            avatarUrl: "/images/teacher-avatar.jpg",
          },
        );
        setCurrentTerm(res?.currentTerm ?? "");
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("Không thể tải danh sách Podcast học thuật. Vui lòng thử lại.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadNonce]);

  const syncUrlParams = (next: {
    episode: string;
    category: PodcastCategoryFilter;
    sort: PodcastSortKey;
    audio: boolean;
    q: string;
  }) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (next.episode) params.set("episode", next.episode);
    if (next.category !== "all") params.set("category", next.category);
    if (next.sort !== "newest") params.set("sort", next.sort);
    if (next.audio) params.set("audio", "1");
    if (next.q.trim()) params.set("q", next.q.trim());
    const qs = params.toString();
    const targetUrl = qs ? `/podcast?${qs}` : "/podcast";
    window.history.replaceState(null, "", targetUrl);
  };

  const stats = React.useMemo(() => computePodcastStats(episodes), [episodes]);
  const categoryCounts = React.useMemo(
    () => countPodcastsByCategory(episodes),
    [episodes],
  );

  const filteredEpisodes = React.useMemo(
    () =>
      filterAndSortPodcasts(episodes, {
        category: selectedCategory,
        search: searchQuery,
        onlyWithAudio,
        sortBy,
      }),
    [episodes, selectedCategory, searchQuery, onlyWithAudio, sortBy],
  );

  const activeEpisode = React.useMemo(
    () => selectDefaultEpisode(episodes, activeEpisodeId || null),
    [episodes, activeEpisodeId],
  );

  const chapters = React.useMemo(
    () => parseShowNoteChapters(activeEpisode?.showNotes ?? []),
    [activeEpisode],
  );

  const activeChapterIndex = React.useMemo(
    () => resolveActiveChapterIndex(chapters, playbackTime),
    [chapters, playbackTime],
  );

  const navigationPlaylist =
    filteredEpisodes.length > 0 ? filteredEpisodes : episodes;
  const adjacentEpisodes = React.useMemo(
    () =>
      activeEpisode
        ? getAdjacentEpisodes(activeEpisode.id, navigationPlaylist)
        : { prev: null, next: null },
    [activeEpisode, navigationPlaylist],
  );

  const totalPages = Math.max(1, Math.ceil(filteredEpisodes.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedEpisodes = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEpisodes.slice(start, start + pageSize);
  }, [filteredEpisodes, currentPage, pageSize]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const handleSelectEpisode = (ep: PublicPodcastEpisode) => {
    setActiveEpisodeId(ep.id);
    setPlaybackTime(0);
    syncUrlParams({
      episode: ep.id,
      category: selectedCategory,
      sort: sortBy,
      audio: onlyWithAudio,
      q: searchQuery,
    });
    studioSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  };

  const handleSeekChapter = (seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    setPlaybackTime(seconds);
  };

  const handleSelectCategory = (category: PodcastCategoryFilter) => {
    setSelectedCategory(category);
    setPage(1);
    syncUrlParams({
      episode: activeEpisode?.id ?? activeEpisodeId,
      category,
      sort: sortBy,
      audio: onlyWithAudio,
      q: searchQuery,
    });
  };

  const handleSortChange = (sort: PodcastSortKey) => {
    setSortBy(sort);
    setPage(1);
    syncUrlParams({
      episode: activeEpisode?.id ?? activeEpisodeId,
      category: selectedCategory,
      sort,
      audio: onlyWithAudio,
      q: searchQuery,
    });
  };

  const handleToggleAudioOnly = () => {
    const nextAudio = !onlyWithAudio;
    setOnlyWithAudio(nextAudio);
    setPage(1);
    syncUrlParams({
      episode: activeEpisode?.id ?? activeEpisodeId,
      category: selectedCategory,
      sort: sortBy,
      audio: nextAudio,
      q: searchQuery,
    });
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPage(1);
    syncUrlParams({
      episode: activeEpisode?.id ?? activeEpisodeId,
      category: selectedCategory,
      sort: sortBy,
      audio: onlyWithAudio,
      q,
    });
  };

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSortBy("newest");
    setOnlyWithAudio(false);
    setSearchQuery("");
    setPage(1);
    syncUrlParams({
      episode: activeEpisode?.id ?? activeEpisodeId,
      category: "all",
      sort: "newest",
      audio: false,
      q: "",
    });
  };

  const handleShareEpisode = async (ep: PublicPodcastEpisode) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/podcast?episode=${encodeURIComponent(ep.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Đã sao chép liên kết tập podcast",
        description: `Tập #${ep.episodeNumber}: ${ep.title}`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Không thể truy cập clipboard",
        description: "Vui lòng sao chép trực tiếp đường dẫn trên thanh địa chỉ.",
        variant: "error",
      });
    }
  };

  const hasActiveFilters =
    selectedCategory !== "all" ||
    sortBy !== "newest" ||
    onlyWithAudio ||
    searchQuery.trim().length > 0;

  if (loading) {
    return <PodcastSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* Header */}
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Trang chủ", href: "/" },
            { label: "Podcast & Audio Newsletter" },
          ]}
        />
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase">
              <Headphones className="size-4 text-[#B8861E]" aria-hidden="true" />
              <span>Academic Audio Newsletter</span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Podcast học thuật &amp; Bản tin âm thanh
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Lắng nghe phân tích chuyên đề IELTS, hướng dẫn ngữ điệu học thuật
              và chia sẻ phương pháp tự học{" "}
              {host.name ? `từ ${host.name}.` : "cùng giáo viên hướng dẫn."}
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            <span>
              {currentTerm || "Cập nhật trực tiếp"}
              {stats.latestPublishedAt
                ? ` · Tập mới: ${stats.latestPublishedAt}`
                : ""}
            </span>
          </Badge>
        </div>

        {/* Summary Strip */}
        {!error && episodes.length > 0 && (
          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warm text-primary">
                <Headphones className="size-5 text-[#B8861E]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Tập đã xuất bản
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.totalEpisodes} tập
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({stats.audioReadyCount} có tệp audio)
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Clock className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Tổng thời lượng nghe
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {formatTotalListeningDuration(stats.totalDurationSeconds)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-highlight/25 text-primary">
                <BookOpen className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Từ vựng học thuật
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.totalVocabulary} mục tiêu biểu
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error State or Content */}
      {error ? (
        <EmptyState
          title="Không thể tải Podcast học thuật"
          description={error}
          action={
            <Button type="button" variant="outline" onClick={handleRetry}>
              <RefreshCw className="size-4" aria-hidden="true" />
              <span>Thử tải lại</span>
            </Button>
          }
        />
      ) : episodes.length === 0 || !activeEpisode ? (
        <EmptyState
          title="Chưa có tập Podcast công khai"
          description="Các bản tin âm thanh và chuyên đề tự học sẽ hiển thị tại đây ngay khi giáo viên xuất bản."
        />
      ) : (
        <>
          {/* Studio Player + Interactive Show Notes */}
          <section
            ref={studioSectionRef}
            aria-label="Trình phát Podcast và Show Notes tương tác"
            className="grid gap-8 lg:grid-cols-12"
          >
            <div className="lg:col-span-7">
              <AudioPlayer
                key={activeEpisode.id}
                playerRef={playerRef}
                episode={activeEpisode}
                hostName={host.name || "Giáo viên điều hành"}
                hostAvatarUrl={host.avatarUrl || "/images/teacher-avatar.jpg"}
                onTimeUpdate={setPlaybackTime}
                onPrevEpisode={
                  adjacentEpisodes.prev
                    ? () => handleSelectEpisode(adjacentEpisodes.prev!)
                    : null
                }
                onNextEpisode={
                  adjacentEpisodes.next
                    ? () => handleSelectEpisode(adjacentEpisodes.next!)
                    : null
                }
                onShareEpisode={handleShareEpisode}
              />
            </div>

            <div className="lg:col-span-5">
              <PodcastShowNotesPanel
                episode={activeEpisode}
                chapters={chapters}
                activeChapterIndex={activeChapterIndex}
                currentTime={playbackTime}
                onSeekChapter={handleSeekChapter}
              />
            </div>
          </section>

          {/* Playlist & Episode Explorer */}
          <section className="space-y-6">
            <PodcastToolbar
              selectedCategory={selectedCategory}
              onSelectCategory={handleSelectCategory}
              categoryCounts={categoryCounts}
              sortBy={sortBy}
              onSortChange={handleSortChange}
              onlyWithAudio={onlyWithAudio}
              onToggleAudioOnly={handleToggleAudioOnly}
              audioReadyCount={stats.audioReadyCount}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              hasActiveFilters={hasActiveFilters}
              onResetFilters={handleResetFilters}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
                <ListMusic className="size-5 text-primary" aria-hidden="true" />
                <span>Danh sách phát ({filteredEpisodes.length} tập)</span>
              </h2>
              <span className="text-xs text-muted-foreground">
                Nhấn vào tập bất kỳ để chuyển bài phát trên trình nghe
              </span>
            </div>

            {filteredEpisodes.length === 0 ? (
              <EmptyState
                title="Không tìm thấy tập Podcast phù hợp"
                description="Thử chọn danh mục khác hoặc xóa bộ lọc tìm kiếm hiện tại."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                  >
                    Hiển thị tất cả các tập
                  </Button>
                }
              />
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  {paginatedEpisodes.map((ep) => (
                    <PodcastEpisodeCard
                      key={ep.id}
                      episode={ep}
                      isSelected={ep.id === activeEpisode.id}
                      onSelect={handleSelectEpisode}
                      onShare={handleShareEpisode}
                    />
                  ))}
                </div>

                <PaginationBar
                  page={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredEpisodes.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(sz) => {
                    setPageSize(sz);
                    setPage(1);
                  }}
                  pageSizeOptions={[4, 6, 10, 20]}
                />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function PodcastPage() {
  return (
    <React.Suspense fallback={<PodcastSkeleton />}>
      <PodcastPageContent />
    </React.Suspense>
  );
}
