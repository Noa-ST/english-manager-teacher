"use client";

import { LayoutGrid, List, RotateCcw, Search } from "lucide-react";
import {
  DOCUMENT_FILE_TYPE_FILTERS,
  type DocumentFileTypeFilter,
  type DocumentSortKey,
} from "@/services/documents-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DocumentsToolbar({
  selectedFileType,
  onSelectFileType,
  typeCounts,
  levels,
  selectedLevel,
  onSelectLevel,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  hasActiveFilters,
  onResetFilters,
}: {
  selectedFileType: DocumentFileTypeFilter;
  onSelectFileType: (ft: DocumentFileTypeFilter) => void;
  typeCounts: Record<DocumentFileTypeFilter, number>;
  levels: string[];
  selectedLevel: string;
  onSelectLevel: (level: string) => void;
  sortBy: DocumentSortKey;
  onSortChange: (sort: DocumentSortKey) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-2xs">
      {/* Row 1: All 5 File Format Tabs with Live Counts */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Lọc theo định dạng tài liệu"
      >
        {DOCUMENT_FILE_TYPE_FILTERS.map((ft) => {
          const active = selectedFileType === ft.value;
          const count = typeCounts[ft.value] ?? 0;
          return (
            <button
              key={ft.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectFileType(ft.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span>{ft.label}</span>
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

      {/* Row 2: Level + Sort + Reset + Search + Grid/List View Toggle */}
      <div className="flex flex-col gap-3 border-t border-border/70 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Lọc theo trình độ"
            value={selectedLevel}
            onChange={(e) => onSelectLevel(e.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tất cả trình độ</option>
            {levels.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </select>

          <select
            aria-label="Sắp xếp học liệu"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as DocumentSortKey)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="newest">Mới cập nhật trước</option>
            <option value="downloads_desc">Lượt tải nhiều nhất</option>
            <option value="title_asc">Tên tài liệu A → Z</option>
            <option value="size_asc">Dung lượng nhỏ → lớn</option>
          </select>

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

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:w-72 sm:flex-initial">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Tìm tên tài liệu, trình độ, nội dung..."
              aria-label="Tìm kiếm tài liệu"
              className="pl-9"
            />
          </div>

          <div
            className="inline-flex items-center rounded-xl border border-border bg-background p-1"
            role="group"
            aria-label="Chế độ hiển thị"
          >
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              aria-label="Hiển thị dạng lưới"
              aria-pressed={viewMode === "grid"}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              aria-label="Hiển thị dạng danh sách"
              aria-pressed={viewMode === "list"}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
