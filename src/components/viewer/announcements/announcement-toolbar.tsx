"use client";

import { Paperclip, RotateCcw, Search } from "lucide-react";
import type { AnnouncementCategory } from "@/services/classroom-data";
import { ANNOUNCEMENT_CATEGORY_FILTERS } from "@/services/announcement-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AnnouncementToolbar({
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  availableClasses,
  selectedClass,
  onSelectClass,
  onlyWithAttachments,
  onToggleAttachments,
  searchQuery,
  onSearchChange,
  hasActiveFilters,
  onResetFilters,
}: {
  selectedCategory: "all" | AnnouncementCategory;
  onSelectCategory: (cat: "all" | AnnouncementCategory) => void;
  categoryCounts: Record<"all" | AnnouncementCategory, number>;
  availableClasses: string[];
  selectedClass: string;
  onSelectClass: (cls: string) => void;
  onlyWithAttachments: boolean;
  onToggleAttachments: () => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-2xs">
      {/* Row 1: Category Tabs with Live Counts */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Lọc thông báo theo danh mục"
      >
        {ANNOUNCEMENT_CATEGORY_FILTERS.map((cat) => {
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

      {/* Row 2: Class Filter + Attachments Toggle + Diacritic-Insensitive Search */}
      <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedClass}
            onChange={(e) => onSelectClass(e.target.value)}
            aria-label="Lọc theo lớp áp dụng"
            className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
          >
            <option value="all">Tất cả lớp áp dụng</option>
            {availableClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-pressed={onlyWithAttachments}
            onClick={onToggleAttachments}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors",
              onlyWithAttachments
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            <Paperclip className="size-3.5" aria-hidden="true" />
            <span>Có tệp đính kèm</span>
          </button>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              className="h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Xóa lọc
            </Button>
          )}
        </div>

        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tiêu đề, nội dung, lớp (không dấu)..."
            aria-label="Tìm kiếm thông báo"
            className="h-9 pl-9 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
