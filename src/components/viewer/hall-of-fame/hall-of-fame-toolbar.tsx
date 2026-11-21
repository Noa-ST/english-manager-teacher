"use client";

import { RotateCcw, Search } from "lucide-react";
import type {
  HallOfFamePeriodFilter,
  HallOfFameSortKey,
} from "@/services/hall-of-fame-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PERIOD_TABS: { value: HallOfFamePeriodFilter; label: string }[] = [
  { value: "all", label: "Tất cả kỳ vinh danh" },
  { value: "month", label: "Vinh danh Tháng" },
  { value: "week", label: "Vinh danh Tuần" },
  { value: "course", label: "Toàn khóa học" },
];

export function HallOfFameToolbar({
  selectedPeriod,
  onSelectPeriod,
  periodCounts,
  classes,
  selectedClass,
  onSelectClass,
  periodLabels,
  selectedPeriodLabel,
  onSelectPeriodLabel,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
  hasActiveFilters,
  onResetFilters,
}: {
  selectedPeriod: HallOfFamePeriodFilter;
  onSelectPeriod: (period: HallOfFamePeriodFilter) => void;
  periodCounts: Record<HallOfFamePeriodFilter, number>;
  classes: string[];
  selectedClass: string;
  onSelectClass: (className: string) => void;
  periodLabels: string[];
  selectedPeriodLabel: string;
  onSelectPeriodLabel: (label: string) => void;
  sortBy: HallOfFameSortKey;
  onSortChange: (sort: HallOfFameSortKey) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-2xs">
      {/* Row 1: Period Tabs with Live Counts */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Lọc bảng vàng theo kỳ vinh danh"
      >
        {PERIOD_TABS.map((tab) => {
          const active = selectedPeriod === tab.value;
          const count = periodCounts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectPeriod(tab.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span>{tab.label}</span>
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

      {/* Row 2: Class + Specific Batch + Sort + Diacritic-Insensitive Search */}
      <div className="flex flex-col gap-3 border-t border-border/70 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Lọc theo lớp học"
            value={selectedClass}
            onChange={(e) => onSelectClass(e.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tất cả lớp học</option>
            {classes.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo đợt vinh danh cụ thể"
            value={selectedPeriodLabel}
            onChange={(e) => onSelectPeriodLabel(e.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tất cả đợt vinh danh</option>
            {periodLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>

          <select
            aria-label="Sắp xếp danh sách bảng vàng"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as HallOfFameSortKey)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="rank_asc">Ưu tiên thứ hạng</option>
            <option value="period_recent">Đợt mới nhất</option>
            <option value="name_asc">Tên A → Z</option>
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

        <div className="relative w-full lg:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tên học sinh, danh hiệu, lớp, dấu ấn..."
            aria-label="Tìm kiếm trong bảng vàng"
            className="pl-9"
          />
        </div>
      </div>
    </div>
  );
}
