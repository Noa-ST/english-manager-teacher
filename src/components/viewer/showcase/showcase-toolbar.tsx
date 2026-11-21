"use client";

import { RotateCcw, Search, Tag, X } from "lucide-react";
import {
  SHOWCASE_CATEGORY_FILTERS,
  type ShowcaseCategoryFilter,
  type ShowcaseMediaFilter,
  type ShowcaseSortKey,
} from "@/services/showcase-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ShowcaseToolbar({
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  classes,
  selectedClass,
  onSelectClass,
  selectedTag,
  onSelectTag,
  mediaFilter,
  onMediaFilterChange,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
  hasActiveFilters,
  onResetFilters,
}: {
  selectedCategory: ShowcaseCategoryFilter;
  onSelectCategory: (cat: ShowcaseCategoryFilter) => void;
  categoryCounts: Record<ShowcaseCategoryFilter, number>;
  classes: string[];
  selectedClass: string;
  onSelectClass: (cls: string) => void;
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  mediaFilter: ShowcaseMediaFilter;
  onMediaFilterChange: (media: ShowcaseMediaFilter) => void;
  sortBy: ShowcaseSortKey;
  onSortChange: (sort: ShowcaseSortKey) => void;
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
        aria-label="Lọc dự án theo thể loại"
      >
        {SHOWCASE_CATEGORY_FILTERS.map((cat) => {
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

      {/* Row 2: Class + Media + Sort + Active Tag + Search */}
      <div className="flex flex-col gap-3 border-t border-border/70 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedClass}
            onChange={(e) => onSelectClass(e.target.value)}
            aria-label="Lọc theo lớp học"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tất cả các lớp</option>
            {classes.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>

          <select
            value={mediaFilter}
            onChange={(e) =>
              onMediaFilterChange(e.target.value as ShowcaseMediaFilter)
            }
            aria-label="Lọc theo định dạng đính kèm"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tất cả định dạng</option>
            <option value="video">Có Video thuyết trình</option>
            <option value="pdf">Có hồ sơ PDF</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as ShowcaseSortKey)}
            aria-label="Sắp xếp dự án"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="newest">Mới xuất bản trước</option>
            <option value="oldest">Cũ hơn trước</option>
            <option value="title_asc">Tiêu đề A → Z</option>
          </select>

          {selectedTag !== "all" && (
            <button
              type="button"
              onClick={() => onSelectTag("all")}
              aria-label={`Bỏ lọc chủ đề ${selectedTag}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              <Tag className="size-3" aria-hidden="true" />
              <span>#{selectedTag}</span>
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}

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

        <div className="relative w-full lg:w-76">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tên dự án, tác giả, lớp, #tag..."
            aria-label="Tìm kiếm dự án học sinh"
            className="pl-9"
          />
        </div>
      </div>
    </div>
  );
}
