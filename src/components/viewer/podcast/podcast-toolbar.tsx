"use client";

import { Radio, RotateCcw, Search } from "lucide-react";
import {
  PODCAST_CATEGORY_FILTERS,
  type PodcastCategoryFilter,
  type PodcastSortKey,
} from "@/services/podcast-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PodcastToolbar({
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  sortBy,
  onSortChange,
  onlyWithAudio,
  onToggleAudioOnly,
  audioReadyCount,
  searchQuery,
  onSearchChange,
  hasActiveFilters,
  onResetFilters,
}: {
  selectedCategory: PodcastCategoryFilter;
  onSelectCategory: (cat: PodcastCategoryFilter) => void;
  categoryCounts: Record<PodcastCategoryFilter, number>;
  sortBy: PodcastSortKey;
  onSortChange: (sort: PodcastSortKey) => void;
  onlyWithAudio: boolean;
  onToggleAudioOnly: () => void;
  audioReadyCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-2xs">
      {/* Row 1: Category Tabs with Live Counts */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Lọc tập podcast theo chủ đề"
      >
        {PODCAST_CATEGORY_FILTERS.map((cat) => {
          const active = selectedCategory === cat.value;
          const count = categoryCounts[cat.value] ?? 0;
          return (
            <button
              key={cat.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectCategory(cat.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span>{cat.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 font-mono text-[10.5px]",
                  active
                    ? "bg-white/20 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Row 2: Audio-only toggle + Sort + Reset + Diacritic-Insensitive Search */}
      <div className="flex flex-col gap-3 border-t border-border/70 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Sắp xếp danh sách tập podcast"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as PodcastSortKey)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="newest">Mới nhất (Số tập cao → thấp)</option>
            <option value="oldest">Cũ nhất (Số tập thấp → cao)</option>
            <option value="shortest">Thời lượng ngắn nhất</option>
            <option value="longest">Thời lượng dài nhất</option>
          </select>

          <button
            type="button"
            aria-pressed={onlyWithAudio}
            onClick={onToggleAudioOnly}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors",
              onlyWithAudio
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-foreground hover:bg-muted",
            )}
          >
            <Radio className="size-3.5" aria-hidden="true" />
            <span>Có bản thu âm ({audioReadyCount})</span>
          </button>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              className="h-9 rounded-xl px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              <span>Đặt lại bộ lọc</span>
            </Button>
          )}
        </div>

        <div className="relative w-full lg:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tên tập, Show Notes, từ vựng..."
            aria-label="Tìm kiếm tập podcast"
            className="pl-9"
          />
        </div>
      </div>
    </div>
  );
}
