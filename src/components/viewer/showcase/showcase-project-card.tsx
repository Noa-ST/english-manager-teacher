"use client";

import {
  Calendar,
  Download,
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  Share2,
  Users,
} from "lucide-react";
import {
  isSafePublicUrl,
  normalizeShowcaseSearch,
  SHOWCASE_CATEGORY_LABELS,
  type PublicStudentProject,
} from "@/services/showcase-helpers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const THEME_BANNER_STYLES: Record<PublicStudentProject["accentTheme"], string> =
  {
    navy: "bg-primary text-primary-foreground",
    blue: "bg-secondary text-primary border-b border-border",
    coral: "bg-highlight text-highlight-foreground",
    cream: "bg-warm text-warm-foreground border-b border-border",
  };

export function ShowcaseProjectCard({
  project,
  selectedClass,
  selectedTag,
  onSelectClass,
  onSelectTag,
  onPreview,
  onShare,
  isHighlighted = false,
}: {
  project: PublicStudentProject;
  selectedClass: string;
  selectedTag: string;
  onSelectClass: (className: string) => void;
  onSelectTag: (tag: string) => void;
  onPreview: (project: PublicStudentProject) => void;
  onShare: (project: PublicStudentProject) => void;
  isHighlighted?: boolean;
}) {
  const safePosterUrl = isSafePublicUrl(project.posterUrl)
    ? project.posterUrl
    : null;
  const safeDocUrl = isSafePublicUrl(project.documentUrl)
    ? project.documentUrl
    : null;
  const safeVideoUrl = isSafePublicUrl(project.videoUrl)
    ? project.videoUrl
    : null;
  const categoryLabel =
    SHOWCASE_CATEGORY_LABELS[project.category] || project.category;

  const isClassSelected = selectedClass === project.className;
  const normalizedSelectedTag =
    selectedTag !== "all" ? normalizeShowcaseSearch(selectedTag) : "";

  return (
    <article
      onClick={() => onPreview(project)}
      className={cn(
        "group flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border bg-card shadow-2xs transition-all hover:border-primary/40 hover:shadow-md",
        isHighlighted
          ? "border-primary ring-2 ring-primary/20"
          : "border-border",
      )}
    >
      <div>
        {/* Editorial Cover Header: 16:9 Poster or Theme Banner Fallback */}
        {safePosterUrl ? (
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={safePosterUrl}
              alt={project.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/15" />

            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/65 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-xs">
              <Layers className="size-3.5" aria-hidden="true" />
              <span>{categoryLabel}</span>
            </div>

            <div className="absolute top-3 right-3 rounded-full bg-primary/95 px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary-foreground shadow-xs">
              {project.featuredMetric}
            </div>

            <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
              {safeVideoUrl && (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-600/90 px-2 py-0.5 text-[11px] font-medium text-white shadow-xs">
                  <Film className="size-3" aria-hidden="true" />
                  Video
                </span>
              )}
              {safeDocUrl && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-600/90 px-2 py-0.5 text-[11px] font-medium text-white shadow-xs">
                  <FileText className="size-3" aria-hidden="true" />
                  PDF
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 px-2 py-0.5 text-[11px] font-medium text-white shadow-xs">
                <ImageIcon className="size-3" aria-hidden="true" />
                Poster
              </span>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center justify-between gap-3 px-6 py-4",
              THEME_BANNER_STYLES[project.accentTheme],
            )}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Layers className="size-4" aria-hidden="true" />
              <span>{categoryLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              {safeVideoUrl && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-medium">
                  <Film className="size-3" aria-hidden="true" />
                  Video
                </span>
              )}
              {safeDocUrl && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-medium">
                  <FileText className="size-3" aria-hidden="true" />
                  PDF
                </span>
              )}
              <span className="rounded-full bg-black/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold">
                {project.featuredMetric}
              </span>
            </div>
          </div>
        )}

        {/* Card Content */}
        <div className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-primary">
              <Users className="size-3.5 text-primary/75" aria-hidden="true" />
              {project.studentOrTeam}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectClass(isClassSelected ? "all" : project.className);
              }}
              title={`Lọc dự án của lớp ${project.className}`}
              className={cn(
                "rounded-md px-2 py-0.5 font-medium transition-colors",
                isClassSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/80 text-muted-foreground hover:bg-secondary hover:text-primary",
              )}
            >
              {project.className}
            </button>
          </div>

          <h2 className="mt-2.5 font-heading text-xl font-bold text-foreground transition-colors group-hover:text-primary">
            {project.title}
          </h2>

          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            {project.summary}
          </p>

          {/* Clickable Hashtags */}
          {project.tags && project.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.tags.map((tag) => {
                const isTagActive =
                  normalizedSelectedTag === normalizeShowcaseSearch(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTag(isTagActive ? "all" : tag);
                    }}
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                      isTagActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-secondary hover:text-primary",
                    )}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          )}

          {project.keyTakeaway && (
            <div className="mt-4 rounded-xl bg-warm/50 p-3.5 text-xs leading-relaxed text-foreground/90">
              <strong className="font-semibold text-primary">
                Nhận xét chuyên môn:
              </strong>{" "}
              {project.keyTakeaway}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions — Clean, Non-Duplicate */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-3.5 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="size-3.5" aria-hidden="true" />
          Xuất bản: {project.publishedAt}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShare(project);
            }}
            aria-label={`Sao chép liên kết dự án ${project.title}`}
            title="Sao chép liên kết"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
          >
            <Share2 className="size-3.5" aria-hidden="true" />
          </button>

          {safeDocUrl && (
            <a
              href={safeDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              onClick={(e) => e.stopPropagation()}
              aria-label={`Tải tài liệu PDF của ${project.title}`}
              title={`Tải PDF (${project.documentSize || "PDF"})`}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span>PDF</span>
            </a>
          )}

          <Button
            type="button"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(project);
            }}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            <span>Xem hồ sơ</span>
          </Button>
        </div>
      </div>
    </article>
  );
}
