"use client";

import * as React from "react";
import {
  BookOpen,
  Calendar,
  Clock,
  Headphones,
  ListMusic,
  Play,
  Search,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  PODCAST_EPISODES_DATA,
  type PodcastEpisode,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { AudioPlayer } from "@/components/viewer/audio-player";
import { cn } from "@/lib/utils";

const PODCAST_CATEGORIES: {
  value: "all" | PodcastEpisode["category"];
  label: string;
}[] = [
  { value: "all", label: "Tất cả chủ đề" },
  { value: "weekly-digest", label: "Tổng kết tuần" },
  { value: "ielts-listening", label: "IELTS & Học thuật" },
  { value: "pronunciation", label: "Phát âm & Ngữ điệu" },
  { value: "parent-corner", label: "Góc Phụ huynh" },
];

export default function PodcastPage() {
  const [episodes, setEpisodes] = React.useState<PodcastEpisode[]>(
    PODCAST_EPISODES_DATA,
  );
  const [activeEpisodeId, setActiveEpisodeId] = React.useState<string>(
    PODCAST_EPISODES_DATA[0]?.id ?? "",
  );
  const [selectedCategory, setSelectedCategory] = React.useState<
    "all" | PodcastEpisode["category"]
  >("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    apiRequest<PodcastEpisode[]>("/api/viewer/podcasts")
      .then((items) => {
        if (items.length > 0) setEpisodes(items);
      })
      .catch(() => {});
  }, []);

  const activeEpisode = React.useMemo(
    () =>
      episodes.find((ep) => ep.id === activeEpisodeId) ?? episodes[0],
    [episodes, activeEpisodeId],
  );

  const filteredEpisodes = React.useMemo(() => {
    return episodes.filter((ep) => {
      const matchesCat =
        selectedCategory === "all" || ep.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        ep.title.toLowerCase().includes(q) ||
        ep.summary.toLowerCase().includes(q) ||
        ep.vocabularyHighlights.some((v) => v.term.toLowerCase().includes(q));
      return matchesCat && matchesQuery;
    });
  }, [episodes, selectedCategory, searchQuery]);

  if (!activeEpisode) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
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
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
              <Headphones className="size-4" aria-hidden="true" />
              <span>Academic Audio Newsletter</span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Podcast học thuật & Bản tin âm thanh
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Lắng nghe phân tích chuyên đề IELTS, hướng dẫn ngữ điệu học thuật và chia sẻ phương
              pháp tự học hàng tuần từ ThS. Nguyễn Minh Anh.
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            Phát hành định kỳ Thứ Tư hàng tuần
          </Badge>
        </div>
      </div>

      {/* Featured / Active Episode Player & Show Notes */}
      <section className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <AudioPlayer key={activeEpisode.id} episode={activeEpisode} />
        </div>

        {/* Show Notes & Key Vocabulary of Active Episode */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary">Show Notes · Tập #{activeEpisode.episodeNumber}</Badge>
              <span className="text-xs text-muted-foreground">
                {activeEpisode.publishedAt}
              </span>
            </div>

            <h2 className="font-heading text-lg font-bold text-foreground">
              Mốc thời gian & Nội dung chính
            </h2>

            <ul className="space-y-2.5 text-xs text-foreground/90">
              {activeEpisode.showNotes.map((note) => (
                <li
                  key={note}
                  className="flex items-start gap-2.5 rounded-xl bg-background p-3"
                >
                  <Clock
                    className="mt-0.5 size-3.5 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
              <BookOpen className="size-3.5 text-accent" aria-hidden="true" />
              <span>Từ vựng học thuật trọng tâm trong tập này</span>
            </div>
            <div className="space-y-2">
              {activeEpisode.vocabularyHighlights.map((vocab) => (
                <div
                  key={vocab.term}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border/70 bg-warm/35 px-3 py-2 text-xs"
                >
                  <div>
                    <strong className="font-semibold text-primary">{vocab.term}</strong>{" "}
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {vocab.ipa}
                    </span>
                  </div>
                  <span className="text-foreground/85">{vocab.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Playlist & Episode Explorer */}
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Lọc tập podcast theo chủ đề"
          >
            {PODCAST_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={cn(
                    "rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên tập, từ vựng học thuật..."
              aria-label="Tìm kiếm tập podcast"
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
            <ListMusic className="size-5 text-primary" aria-hidden="true" />
            Danh sách phát ({filteredEpisodes.length} tập)
          </h2>
          <span className="text-xs text-muted-foreground">
            Nhấn vào tập bất kỳ để chuyển bài phát trên trình nghe
          </span>
        </div>

        {filteredEpisodes.length === 0 ? (
          <EmptyState
            title="Không tìm thấy tập Podcast phù hợp"
            description="Thử chọn danh mục khác hoặc xóa từ khóa tìm kiếm."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedCategory("all");
                  setSearchQuery("");
                }}
              >
                Hiển thị tất cả các tập
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredEpisodes.map((ep) => {
              const isSelected = ep.id === activeEpisode.id;
              return (
                <div
                  key={ep.id}
                  onClick={() => setActiveEpisodeId(ep.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveEpisodeId(ep.id);
                    }
                  }}
                  className={cn(
                    "group flex cursor-pointer flex-col justify-between rounded-2xl border p-5 transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    isSelected
                      ? "border-primary bg-warm/45 shadow-xs"
                      : "border-border bg-card hover:border-accent/50",
                  )}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant={isSelected ? "default" : "secondary"}>
                          Tập #{ep.episodeNumber}
                        </Badge>
                        <Badge variant="outline">{ep.categoryLabel}</Badge>
                      </div>
                      <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {ep.durationLabel}
                      </span>
                    </div>

                    <h3 className="mt-3 font-heading text-base font-bold text-foreground group-hover:text-primary">
                      {ep.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {ep.summary}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-border pt-3.5 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="size-3.5" aria-hidden="true" />
                      {ep.publishedAt}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 font-semibold",
                        isSelected ? "text-primary" : "text-accent group-hover:text-primary",
                      )}
                    >
                      {isSelected ? (
                        <>
                          <Volume2 className="size-3.5" aria-hidden="true" />
                          Đang chọn trên trình phát
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5" aria-hidden="true" />
                          Nghe tập này
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
