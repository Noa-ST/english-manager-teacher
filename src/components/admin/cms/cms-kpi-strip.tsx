"use client";

import * as React from "react";
import {
  Award,
  BookOpen,
  FolderGit2,
  Headphones,
  Megaphone,
} from "lucide-react";
import type { CmsSummaryStats, CmsTab } from "@/services/cms-helpers";
import { cn } from "@/lib/utils";

export function CmsKpiStrip({
  stats,
  activeTab,
  onSelectTab,
}: {
  stats: CmsSummaryStats;
  activeTab: CmsTab;
  onSelectTab: (tab: CmsTab) => void;
}) {
  const cards: {
    tab: CmsTab;
    title: string;
    primary: string;
    detail: React.ReactNode;
    icon: React.ReactNode;
    accentClass: string;
  }[] = [
    {
      tab: "announcements",
      title: "Thông báo (News)",
      primary: `${stats.announcementsPublished} đã đăng`,
      detail: `${stats.announcementsDraft} bản nháp · ${stats.announcementsPinned} ghim`,
      icon: <Megaphone className="size-4" aria-hidden="true" />,
      accentClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      tab: "podcast",
      title: "Podcast Audio",
      primary: `${stats.podcastsPublished} đã phát hành`,
      detail: `${stats.podcastsDraft} nháp · ${stats.podcastsFeatured} nổi bật`,
      icon: <Headphones className="size-4" aria-hidden="true" />,
      accentClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    },
    {
      tab: "hall-of-fame",
      title: "Bảng vàng Vinh danh",
      primary: `${stats.honorsTotal} vinh danh`,
      detail: `${stats.honorsMonthly} gương mặt theo tháng`,
      icon: <Award className="size-4" aria-hidden="true" />,
      accentClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      tab: "projects",
      title: "Dự án Học sinh",
      primary: `${stats.projectsPublished} đã đăng`,
      detail: (
        <>
          <span
            className={cn(
              stats.projectsPending > 0 &&
                "font-semibold text-amber-600 dark:text-amber-400",
            )}
          >
            {stats.projectsPending} chờ duyệt
          </span>{" "}
          · {stats.projectsDraft} nháp
        </>
      ),
      icon: <FolderGit2 className="size-4" aria-hidden="true" />,
      accentClass:
        stats.projectsPending > 0
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
    {
      tab: "resources",
      title: "Học liệu Công khai",
      primary: `${stats.resourcesPublic} công khai`,
      detail: `${stats.resourcesPrivate} tệp nội bộ`,
      icon: <BookOpen className="size-4" aria-hidden="true" />,
      accentClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => {
        const isActive = activeTab === card.tab;
        return (
          <button
            key={card.tab}
            type="button"
            onClick={() => onSelectTab(card.tab)}
            className={cn(
              "flex flex-col justify-between rounded-2xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-xs",
              isActive
                ? "border-primary ring-2 ring-primary/15 shadow-xs"
                : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {card.title}
              </span>
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-xl",
                  card.accentClass,
                )}
              >
                {card.icon}
              </span>
            </div>
            <p className="mt-2.5 font-heading text-lg font-bold text-foreground">
              {card.primary}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {card.detail}
            </p>
          </button>
        );
      })}
    </div>
  );
}
