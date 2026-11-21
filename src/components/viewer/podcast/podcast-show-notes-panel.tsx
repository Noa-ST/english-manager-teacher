"use client";

import { Clock, Play, Sparkles } from "lucide-react";
import type {
  PublicPodcastEpisode,
  ShowNoteChapter,
} from "@/services/podcast-helpers";
import { Badge } from "@/components/ui/badge";
import { cn, formatDuration } from "@/lib/utils";

export function PodcastShowNotesPanel({
  episode,
  chapters,
  activeChapterIndex,
  currentTime,
  onSeekChapter,
}: {
  episode: PublicPodcastEpisode;
  chapters: ShowNoteChapter[];
  activeChapterIndex: number;
  currentTime: number;
  onSeekChapter: (seconds: number) => void;
}) {
  return (
    <aside
      aria-label="Show Notes và mốc thời gian tương tác"
      className="flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="secondary">
            Show Notes · Tập #{episode.episodeNumber}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {formatDuration(currentTime)} / {episode.durationLabel}
          </span>
        </div>

        <div>
          <h2 className="font-heading text-lg font-bold text-foreground">
            Mốc thời gian &amp; Nội dung chính
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Nhấn trực tiếp vào bất kỳ mốc thời gian nào để chuyển trình phát tới
            đoạn tương ứng.
          </p>
        </div>

        {chapters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background/70 p-4 text-xs text-muted-foreground">
            Tập này chưa có danh sách mốc thời gian chi tiết.
          </div>
        ) : (
          <ul className="space-y-2.5 text-xs text-foreground/90">
            {chapters.map((chapter) => {
              const isActive = chapter.index === activeChapterIndex;
              const isInteractive = chapter.seconds !== null;

              if (!isInteractive) {
                return (
                  <li
                    key={`${chapter.index}-${chapter.raw}`}
                    className="flex items-start gap-2.5 rounded-xl border border-transparent bg-background p-3"
                  >
                    <Clock
                      className="mt-0.5 size-3.5 shrink-0 text-primary/70"
                      aria-hidden="true"
                    />
                    <span className="leading-relaxed">{chapter.text}</span>
                  </li>
                );
              }

              return (
                <li key={`${chapter.index}-${chapter.raw}`}>
                  <button
                    type="button"
                    onClick={() => onSeekChapter(chapter.seconds ?? 0)}
                    aria-label={`Phát từ mốc ${chapter.timestampLabel}: ${chapter.text}`}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all",
                      isActive
                        ? "border-primary/50 bg-warm/65 shadow-2xs"
                        : "border-transparent bg-background hover:border-primary/25 hover:bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground",
                      )}
                    >
                      <Play className="size-2.5" aria-hidden="true" />
                      {chapter.timestampLabel}
                    </span>
                    <span className="flex-1 leading-relaxed text-foreground">
                      {chapter.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-border/70 bg-background/80 p-3.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-semibold text-primary">
          <Sparkles className="size-3.5 text-[#B8861E]" aria-hidden="true" />
          <span>Gợi ý luyện tập</span>
        </div>
        <p className="mt-1 leading-relaxed">
          Sau khi nghe xong từng phân đoạn, hãy bấm biểu tượng loa trên thẻ từ
          vựng bên dưới trình phát để luyện lặp lại (Shadowing).
        </p>
      </div>
    </aside>
  );
}
