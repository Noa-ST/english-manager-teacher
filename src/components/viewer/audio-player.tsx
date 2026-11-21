"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "motion/react";
import {
  Download,
  FileText,
  Headphones,
  Pause,
  Play,
  Radio,
  RotateCcw,
  RotateCw,
  Share2,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDuration } from "@/lib/utils";
import {
  isSafePublicAudioUrl,
  type PublicPodcastEpisode,
} from "@/services/podcast-helpers";

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

export interface AudioPlayerHandle {
  seekTo: (seconds: number, autoPlay?: boolean) => void;
}

export function AudioPlayer({
  playerRef,
  episode,
  compact = false,
  className,
  hostName = "ThS. Nguyễn Minh Anh",
  hostAvatarUrl = "/images/teacher-avatar.jpg",
  onTimeUpdate,
  onPrevEpisode,
  onNextEpisode,
  onShareEpisode,
  showVocabulary = true,
}: {
  playerRef?: React.Ref<AudioPlayerHandle>;
  episode: PublicPodcastEpisode;
  compact?: boolean;
  className?: string;
  hostName?: string;
  hostAvatarUrl?: string;
  onTimeUpdate?: (seconds: number) => void;
  onPrevEpisode?: (() => void) | null;
  onNextEpisode?: (() => void) | null;
  onShareEpisode?: (episode: PublicPodcastEpisode) => void;
  showVocabulary?: boolean;
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const currentTimeRef = React.useRef(0);
  const onTimeUpdateRef = React.useRef(onTimeUpdate);

  const safeAudioUrl = isSafePublicAudioUrl(episode.audioUrl)
    ? episode.audioUrl.trim()
    : null;

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [speedIndex, setSpeedIndex] = React.useState(1); // 1x default
  const [isMuted, setIsMuted] = React.useState(false);
  const [audioDuration, setAudioDuration] = React.useState<number | null>(null);
  const [useSimulatedAudio, setUseSimulatedAudio] = React.useState(
    !safeAudioUrl,
  );
  const [speakingTerm, setSpeakingTerm] = React.useState<string | null>(null);

  const speed = SPEEDS[speedIndex];
  const hasRealAudio = Boolean(safeAudioUrl) && !useSimulatedAudio;
  const duration =
    hasRealAudio && audioDuration && audioDuration > 0
      ? audioDuration
      : episode.durationSeconds;

  const currentEpisodeKey = `${episode.id}::${safeAudioUrl ?? ""}`;
  const [prevEpisodeKey, setPrevEpisodeKey] = React.useState(currentEpisodeKey);
  if (prevEpisodeKey !== currentEpisodeKey) {
    setPrevEpisodeKey(currentEpisodeKey);
    setCurrentTime(0);
    setIsPlaying(false);
    setAudioDuration(null);
    setUseSimulatedAudio(!safeAudioUrl);
  }

  React.useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  React.useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Sync speed & mute attributes onto underlying <audio> element
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = isMuted;
    audio.playbackRate = speed;
  }, [isMuted, speed]);

  // Cancel any active speech synthesis when episode unmounts or switches
  React.useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [currentEpisodeKey]);

  // Interactive studio ticker fallback when episode has no playable audioUrl
  React.useEffect(() => {
    if (!isPlaying || hasRealAudio) return;
    const interval = window.setInterval(() => {
      const next = currentTimeRef.current + speed * 0.5;
      if (next >= duration) {
        currentTimeRef.current = 0;
        setCurrentTime(0);
        setIsPlaying(false);
        onTimeUpdateRef.current?.(0);
        return;
      }
      currentTimeRef.current = next;
      setCurrentTime(next);
      onTimeUpdateRef.current?.(next);
    }, 500);
    return () => window.clearInterval(interval);
  }, [isPlaying, hasRealAudio, speed, duration]);

  const seekInternal = React.useCallback(
    (seconds: number, autoPlay?: boolean) => {
      const target = Math.max(0, Math.min(duration, seconds));
      currentTimeRef.current = target;
      setCurrentTime(target);
      onTimeUpdateRef.current?.(target);

      if (hasRealAudio && audioRef.current) {
        audioRef.current.currentTime = target;
        if (autoPlay && audioRef.current.paused) {
          audioRef.current.play().catch(() => {
            setUseSimulatedAudio(true);
          });
        }
      }
      if (autoPlay) {
        setIsPlaying(true);
      }
    },
    [duration, hasRealAudio],
  );

  React.useImperativeHandle(
    playerRef,
    () => ({
      seekTo: (seconds: number, autoPlay = false) => {
        seekInternal(seconds, autoPlay);
      },
    }),
    [seekInternal],
  );

  const progressPercent =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const togglePlay = () => {
    const nextPlaying = !isPlaying;
    if (hasRealAudio && audioRef.current) {
      if (nextPlaying) {
        audioRef.current.play().catch(() => {
          setUseSimulatedAudio(true);
        });
      } else {
        audioRef.current.pause();
      }
    }
    setIsPlaying(nextPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekInternal(Number(e.target.value), false);
  };

  const skipSeconds = (delta: number) => {
    seekInternal(currentTime + delta, false);
  };

  const cycleSpeed = () => {
    setSpeedIndex((prev) => (prev + 1) % SPEEDS.length);
  };

  const handleSpeakVocabulary = (term: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(term);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      utterance.onend = () =>
        setSpeakingTerm((prev) => (prev === term ? null : prev));
      utterance.onerror = () =>
        setSpeakingTerm((prev) => (prev === term ? null : prev));
      setSpeakingTerm(term);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeakingTerm(null);
    }
  };

  const audioElement = safeAudioUrl ? (
    <audio
      ref={audioRef}
      src={safeAudioUrl}
      preload="metadata"
      onLoadedMetadata={(e) => {
        const d = e.currentTarget.duration;
        if (Number.isFinite(d) && d > 0) {
          setAudioDuration(d);
        }
      }}
      onTimeUpdate={(e) => {
        if (!useSimulatedAudio) {
          const t = e.currentTarget.currentTime;
          currentTimeRef.current = t;
          setCurrentTime(t);
          onTimeUpdateRef.current?.(t);
        }
      }}
      onEnded={() => {
        currentTimeRef.current = 0;
        setIsPlaying(false);
        setCurrentTime(0);
        onTimeUpdateRef.current?.(0);
      }}
      onError={() => {
        setUseSimulatedAudio(true);
      }}
    />
  ) : null;

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-3.5 rounded-2xl border border-[#E3E7EF] bg-white p-3 shadow-xs transition-all",
          className,
        )}
      >
        {audioElement}
        {/* Left Deep Navy Podcast Cover Plate */}
        <div className="relative flex min-h-[122px] w-[118px] shrink-0 flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-[#243B64] to-[#182B49] p-3.5 text-white shadow-xs sm:w-[126px]">
          <div className="relative z-10">
            <p className="font-serif text-base leading-[1.1] font-bold tracking-tight text-white">
              English
              <br />
              Manager
            </p>
            <p className="mt-1 font-sans text-[11px] font-medium text-[#B9D8F5]">
              {hasRealAudio ? "Podcast Audio" : "Kịch bản"}
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
              <span className="font-mono text-[10px] text-white/75">
                EP.{String(episode.episodeNumber).padStart(2, "0")}
              </span>
            )}

            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-7 text-[#B9D8F5]/85"
              aria-hidden="true"
            >
              <rect
                x="9"
                y="2"
                width="6"
                height="11"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M5 10V11C5 14.866 8.13401 18 12 18C15.866 18 19 14.866 19 11V10"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <path
                d="M12 18V22M8 22H16"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </div>

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
              onClick={togglePlay}
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
        "overflow-hidden rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xs transition-all sm:p-7",
        className,
      )}
    >
      {audioElement}
      {/* Top Studio Header: Episode Meta + Actions */}
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
          <span className="text-muted-foreground">{episode.publishedAt}</span>
          <span className="text-border">•</span>
          <span className="font-mono font-medium text-foreground">
            {episode.durationLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {safeAudioUrl && (
            <a
              href={safeAudioUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Tải tệp âm thanh MP3"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Tải audio</span>
            </a>
          )}
          {onShareEpisode && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onShareEpisode(episode)}
              aria-label="Sao chép liên kết tập podcast"
              className="h-7 rounded-md px-2 text-xs font-medium"
            >
              <Share2 className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Chia sẻ</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={cycleSpeed}
            aria-label={`Tốc độ phát hiện tại ${speed}x, nhấn để đổi`}
            className="h-7 rounded-md px-2 font-mono text-xs font-semibold"
          >
            {speed}x
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? "Bật âm thanh" : "Tắt tiếng"}
          >
            {isMuted ? (
              <VolumeX
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            ) : (
              <Volume2 className="size-4 text-foreground" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Transparent Source Status Pill */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
        {hasRealAudio ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
            <Radio className="size-3" aria-hidden="true" />
            Bản thu âm chính thức
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E6D7B8] bg-warm px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            <FileText className="size-3" aria-hidden="true" />
            Chế độ theo dõi kịch bản · Chưa đính kèm tệp audio
          </span>
        )}
      </div>

      {/* Episode Title & Host Info */}
      <div className="mt-3">
        <h3 className="font-serif text-lg leading-snug font-bold text-foreground sm:text-xl">
          {episode.title}
        </h3>

        {episode.summary && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {episode.summary}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2.5 text-xs text-muted-foreground">
          <div className="relative size-6 overflow-hidden rounded-full border border-border">
            {hostAvatarUrl.startsWith("http://") ||
            hostAvatarUrl.startsWith("https://") ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={hostAvatarUrl}
                alt={hostName}
                className="size-full object-cover object-top"
              />
            ) : (
              <Image
                src={hostAvatarUrl || "/images/teacher-avatar.jpg"}
                alt={hostName}
                fill
                className="object-cover object-top"
                sizes="24px"
              />
            )}
          </div>
          <span>
            Thực hiện bởi{" "}
            <strong className="font-medium text-foreground">{hostName}</strong>
          </span>
        </div>
      </div>

      {/* Studio Transport & Scrubber Bar */}
      <div className="mt-5 rounded-xl border border-border/80 bg-muted/35 p-3.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
          {onPrevEpisode !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!onPrevEpisode}
              onClick={() => onPrevEpisode?.()}
              aria-label="Tập trước"
              title="Tập trước"
              className="text-muted-foreground hover:text-foreground disabled:opacity-35"
            >
              <SkipBack className="size-4" aria-hidden="true" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => skipSeconds(-15)}
            aria-label="Lùi 15 giây"
            title="Lùi 15 giây"
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </Button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={togglePlay}
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
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => skipSeconds(15)}
            aria-label="Tua nhanh 15 giây"
            title="Tua nhanh 15 giây"
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCw className="size-4" aria-hidden="true" />
          </Button>

          {onNextEpisode !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!onNextEpisode}
              onClick={() => onNextEpisode?.()}
              aria-label="Tập tiếp theo"
              title="Tập tiếp theo"
              className="text-muted-foreground hover:text-foreground disabled:opacity-35"
            >
              <SkipForward className="size-4" aria-hidden="true" />
            </Button>
          )}

          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
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
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{formatDuration(currentTime)}</span>
              {isPlaying ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#496B9A] opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                  <span
                    className="mx-0.5 flex h-3 items-end gap-[2px]"
                    aria-hidden="true"
                  >
                    <span className="w-[2.5px] rounded-full bg-primary animate-[audioWave1_0.8s_ease-in-out_infinite]" />
                    <span className="w-[2.5px] rounded-full bg-primary animate-[audioWave2_0.9s_ease-in-out_infinite_0.15s]" />
                    <span className="w-[2.5px] rounded-full bg-primary animate-[audioWave3_0.7s_ease-in-out_infinite_0.3s]" />
                    <span className="w-[2.5px] rounded-full bg-primary animate-[audioWave4_1s_ease-in-out_infinite_0.1s]" />
                  </span>
                  <span>
                    {hasRealAudio
                      ? `Đang phát (${speed}x)`
                      : `Đang chạy theo mốc kịch bản (${speed}x)`}
                  </span>
                </span>
              ) : (
                <span>
                  {hasRealAudio
                    ? "Nhấn Play để nghe bản thu học thuật"
                    : "Nhấn Play để chạy bộ đếm theo mốc Show Notes"}
                </span>
              )}
              <span className="font-mono">{episode.durationLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lexical & Collocation Notes with Instant Web Speech Pronunciation */}
      {showVocabulary && episode.vocabularyHighlights.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#496B9A]">
              Từ vựng &amp; Collocations trọng tâm trong bài nghe:
            </p>
            <span className="text-[11px] text-muted-foreground">
              Bấm biểu tượng loa để nghe phát âm mẫu
            </span>
          </div>
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
            {episode.vocabularyHighlights.map((vocab) => {
              const isSpeaking = speakingTerm === vocab.term;
              return (
                <div
                  key={vocab.term}
                  className="flex flex-col justify-between rounded-xl border border-[#E4D8BA]/80 bg-warm/45 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-1.5">
                      <strong className="font-serif text-sm font-bold text-primary">
                        {vocab.term}
                      </strong>
                      <button
                        type="button"
                        onClick={() => handleSpeakVocabulary(vocab.term)}
                        aria-label={`Nghe phát âm từ ${vocab.term}`}
                        title={`Nghe phát âm ${vocab.term}`}
                        className={cn(
                          "shrink-0 rounded-md p-1 transition-colors",
                          isSpeaking
                            ? "bg-primary text-primary-foreground"
                            : "text-primary/80 hover:bg-white hover:text-primary",
                        )}
                      >
                        <Volume2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    {vocab.ipa && (
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {vocab.ipa}
                      </p>
                    )}
                  </div>
                  <p className="mt-1.5 leading-snug text-foreground/85">
                    {vocab.meaning}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
