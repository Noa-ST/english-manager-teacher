"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "motion/react";
import {
  Headphones,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";
import type { PodcastEpisode } from "@/services/classroom-data";

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

export function AudioPlayer({
  episode,
  compact = false,
  className,
}: {
  episode: PodcastEpisode;
  compact?: boolean;
  className?: string;
}) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [speedIndex, setSpeedIndex] = React.useState(1); // 1x default
  const [isMuted, setIsMuted] = React.useState(false);

  const speed = SPEEDS[speedIndex];
  const duration = episode.durationSeconds;

  const [prevEpisodeId, setPrevEpisodeId] = React.useState(episode.id);
  if (prevEpisodeId !== episode.id) {
    setPrevEpisodeId(episode.id);
    setCurrentTime(0);
    setIsPlaying(false);
  }

  // Smooth interactive playback ticker
  React.useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + speed * 0.5;
        if (next >= duration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [isPlaying, speed, duration]);

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = Number(e.target.value);
    setCurrentTime(nextVal);
  };

  const skipSeconds = (delta: number) => {
    setCurrentTime((prev) => Math.max(0, Math.min(duration, prev + delta)));
  };

  const cycleSpeed = () => {
    setSpeedIndex((prev) => (prev + 1) % SPEEDS.length);
  };

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-3.5 rounded-2xl border border-[#E3E7EF] bg-white p-3 shadow-xs transition-all",
          className,
        )}
      >
        {/* Left Deep Navy Podcast Cover Plate (Matches Reference Image) */}
        <div className="relative flex min-h-[122px] w-[118px] shrink-0 flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-[#243B64] to-[#182B49] p-3.5 text-white shadow-xs sm:w-[126px]">
          <div className="relative z-10">
            <p className="font-serif text-base leading-[1.1] font-bold tracking-tight text-white">
              English
              <br />
              Manager
            </p>
            <p className="mt-1 font-sans text-[11px] font-medium text-[#B9D8F5]">
              Podcast
            </p>
          </div>

          <div className="relative z-10 flex items-end justify-between">
            {isPlaying ? (
              <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
                <span className="w-[2px] rounded-full bg-[#D9AE54] animate-[audioWave1_0.8s_ease-in-out_infinite]" />
                <span className="w-[2px] rounded-full bg-[#D9AE54] animate-[audioWave2_0.9s_ease-in-out_infinite_0.15s]" />
                <span className="w-[2px] rounded-full bg-[#D9AE54] animate-[audioWave3_0.7s_ease-in-out_infinite_0.3s]" />
              </span>
            ) : (
              <span className="font-mono text-[10px] text-white/60">
                EP.{String(episode.episodeNumber).padStart(2, "0")}
              </span>
            )}

            {/* Studio Microphone SVG */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-7 text-[#B9D8F5]/85"
              aria-hidden="true"
            >
              <rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M5 10V11C5 14.866 8.13401 18 12 18C15.866 18 19 14.866 19 11V10"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <path d="M12 18V22M8 22H16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>

          {/* Subtle Decorative Soundwave Arcs */}
          <div className="pointer-events-none absolute -right-6 -bottom-6 size-20 rounded-full border border-white/10" />
        </div>

        {/* Right Episode Info & Controls */}
        <div className="min-w-0 flex-1 py-0.5 pr-1">
          <h3 className="line-clamp-2 font-heading text-xs leading-snug font-bold text-[#253047] sm:text-[13.5px]">
            Episode {episode.episodeNumber}: {episode.title}
          </h3>

          <p className="mt-1.5 font-mono text-xs text-[#7B8497]">
            {formatDuration(currentTime)} / {episode.durationLabel}
          </p>

          <div className="mt-3 flex items-center gap-2.5">
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsPlaying((p) => !p)}
              aria-label={isPlaying ? "Tạm dừng" : "Phát tập podcast"}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#243B64] text-white shadow-xs transition-colors hover:bg-[#1E3458]"
            >
              {isPlaying ? (
                <Pause className="size-3.5" aria-hidden="true" />
              ) : (
                <Play className="ml-0.5 size-3.5" aria-hidden="true" />
              )}
            </motion.button>

            <input
              type="range"
              min={0}
              max={duration}
              step={1}
              value={Math.floor(currentTime)}
              onChange={handleSeek}
              aria-label="Thanh tiến độ phát âm thanh"
              className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[#E3E7EF] accent-[#243B64]"
              style={{
                background: `linear-gradient(to right, #243B64 ${progressPercent}%, #E3E7EF ${progressPercent}%)`,
              }}
            />

            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              aria-label={isMuted ? "Bật âm thanh" : "Tắt tiếng"}
              className="rounded-md p-1 text-[#7B8497] transition-colors hover:bg-muted hover:text-[#253047]"
            >
              {isMuted ? (
                <VolumeX className="size-4" aria-hidden="true" />
              ) : (
                <Volume2 className="size-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={cycleSpeed}
              aria-label={`Tốc độ phát ${speed}x`}
              className="rounded-md border border-[#E3E7EF] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#253047] hover:bg-muted"
            >
              {speed}x
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card text-card-foreground transition-all",
        compact ? "p-4" : "p-6 sm:p-7",
        className,
      )}
    >
      {/* Top Studio Header: Episode Meta + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 font-semibold text-primary-foreground">
            <Headphones className="size-3.5 text-[#D9AE54]" aria-hidden="true" />
            Tập {String(episode.episodeNumber).padStart(2, "0")}
          </span>
          <span className="font-semibold text-[#496B9A]">
            {episode.categoryLabel}
          </span>
          <span className="text-border">•</span>
          <span className="text-muted-foreground">
            {episode.publishedAt}
          </span>
          <span className="text-border">•</span>
          <span className="font-medium text-foreground">
            {episode.durationLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={cycleSpeed}
            aria-label={`Tốc độ phát hiện tại ${speed}x, nhấn để đổi`}
            className="h-7 rounded-md px-2 text-xs font-semibold"
          >
            {speed}x
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? "Bật âm thanh" : "Tắt tiếng"}
          >
            {isMuted ? (
              <VolumeX className="size-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Volume2 className="size-4 text-foreground" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Episode Title & Host Info */}
      <div className="mt-4">
        <h3 className="font-serif text-lg leading-snug font-bold text-foreground sm:text-xl">
          {episode.title}
        </h3>

        {!compact && episode.summary && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {episode.summary}
          </p>
        )}

        {!compact && (
          <div className="mt-3 flex items-center gap-2.5 text-xs text-muted-foreground">
            <div className="relative size-6 overflow-hidden rounded-full border border-border">
              <Image
                src="/images/teacher-avatar.jpg"
                alt="ThS. Nguyễn Minh Anh"
                fill
                className="object-cover object-top"
                sizes="24px"
              />
            </div>
            <span>
              Thực hiện bởi <strong className="font-medium text-foreground">ThS. Nguyễn Minh Anh</strong>
            </span>
          </div>
        )}
      </div>

      {/* Studio Transport & Scrubber Bar */}
      <div className="mt-5 rounded-xl border border-border/80 bg-muted/35 p-3.5 sm:px-4">
        <div className="flex items-center gap-3.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => skipSeconds(-15)}
            aria-label="Lùi 15 giây"
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </Button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? "Tạm dừng" : "Phát tập podcast"}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
          >
            {isPlaying ? (
              <Pause className="size-4" aria-hidden="true" />
            ) : (
              <Play className="ml-0.5 size-4" aria-hidden="true" />
            )}
          </motion.button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => skipSeconds(15)}
            aria-label="Tua nhanh 15 giây"
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCw className="size-4" aria-hidden="true" />
          </Button>

          <div className="flex flex-1 flex-col gap-1.5">
            <input
              type="range"
              min={0}
              max={duration}
              step={1}
              value={Math.floor(currentTime)}
              onChange={handleSeek}
              aria-label="Thanh tiến độ phát âm thanh"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
              style={{
                background: `linear-gradient(to right, var(--primary) ${progressPercent}%, var(--border) ${progressPercent}%)`,
              }}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">{formatDuration(currentTime)}</span>
              {isPlaying ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#496B9A] opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                  <span className="mx-0.5 flex h-3 items-end gap-[2px]" aria-hidden="true">
                    <span className="w-[2.5px] rounded-full bg-primary animate-[audioWave1_0.8s_ease-in-out_infinite]" />
                    <span className="w-[2.5px] rounded-full bg-primary animate-[audioWave2_0.9s_ease-in-out_infinite_0.15s]" />
                    <span className="w-[2.5px] rounded-full bg-primary animate-[audioWave3_0.7s_ease-in-out_infinite_0.3s]" />
                    <span className="w-[2.5px] rounded-full bg-primary animate-[audioWave4_1s_ease-in-out_infinite_0.1s]" />
                  </span>
                  Đang phát ({speed}x)
                </span>
              ) : (
                <span>Nhấn Play để nghe bản thu học thuật</span>
              )}
              <span className="font-mono">{episode.durationLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lexical & Collocation Notes (3-column balanced row) */}
      {!compact && episode.vocabularyHighlights.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-semibold text-[#496B9A]">
            Từ vựng &amp; Collocations trọng tâm trong bài nghe:
          </p>
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
            {episode.vocabularyHighlights.map((vocab) => (
              <div
                key={vocab.term}
                className="rounded-lg border border-[#E4D8BA]/80 bg-warm/45 p-2.5 text-xs"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <strong className="font-serif text-sm font-bold text-primary">
                    {vocab.term}
                  </strong>
                  <span className="text-[11px] text-muted-foreground">{vocab.ipa}</span>
                </div>
                <p className="mt-1 leading-snug text-foreground/85">{vocab.meaning}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
