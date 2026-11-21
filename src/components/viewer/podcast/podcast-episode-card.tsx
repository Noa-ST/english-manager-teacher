"use client";

import {
  BookOpen,
  Calendar,
  Clock,
  FileText,
  Play,
  Radio,
  Share2,
  Volume2,
} from "lucide-react";
import {
  isSafePublicAudioUrl,
  type PublicPodcastEpisode,
} from "@/services/podcast-helpers";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PodcastEpisodeCard({
  episode,
  isSelected,
  onSelect,
  onShare,
}: {
  episode: PublicPodcastEpisode;
  isSelected: boolean;
  onSelect: (episode: PublicPodcastEpisode) => void;
  onShare: (episode: PublicPodcastEpisode) => void;
}) {
  const hasRealAudio = isSafePublicAudioUrl(episode.audioUrl);
  const vocabCount = episode.vocabularyHighlights?.length ?? 0;

  return (
    <article
      onClick={() => onSelect(episode)}
      className={cn(
        "group flex cursor-pointer flex-col justify-between rounded-2xl border p-5 transition-all",
        isSelected
          ? "border-primary bg-warm/45 shadow-xs ring-1 ring-primary/15"
          : "border-border bg-card hover:border-primary/40 hover:shadow-sm",
      )}
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isSelected ? "default" : "secondary"}>
              Tập #{episode.episodeNumber}
            </Badge>
            <Badge variant="outline">{episode.categoryLabel}</Badge>
            {hasRealAudio ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                <Radio className="size-3" aria-hidden="true" />
                Audio
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <FileText className="size-3" aria-hidden="true" />
                Kịch bản
              </span>
            )}
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            {episode.durationLabel}
          </span>
        </div>

        <h3 className="mt-3 font-heading text-base font-bold text-foreground transition-colors group-hover:text-primary">
          {episode.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {episode.summary}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3.5 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-3.5" aria-hidden="true" />
            {episode.publishedAt}
          </span>
          {vocabCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <BookOpen className="size-3.5 text-primary/70" aria-hidden="true" />
              {vocabCount} từ vựng
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShare(episode);
            }}
            aria-label={`Sao chép liên kết tập ${episode.episodeNumber}`}
            title="Sao chép liên kết"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
          >
            <Share2 className="size-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(episode);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/70 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
            )}
          >
            {isSelected ? (
              <>
                <Volume2 className="size-3.5" aria-hidden="true" />
                <span>Đang phát</span>
              </>
            ) : (
              <>
                <Play className="size-3.5" aria-hidden="true" />
                <span>Nghe tập này</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
