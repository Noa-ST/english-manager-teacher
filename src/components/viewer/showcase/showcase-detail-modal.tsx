"use client";

import {
  Award,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Share2,
} from "lucide-react";
import {
  isSafePublicUrl,
  resolveSafeVideoEmbedUrl,
  SHOWCASE_CATEGORY_LABELS,
  type PublicStudentProject,
  type ViewerShowcaseMentor,
} from "@/services/showcase-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";

export function ShowcaseDetailModal({
  project,
  mentor,
  currentTerm,
  prevProject,
  nextProject,
  onNavigate,
  onSelectTag,
  onShare,
  onClose,
}: {
  project: PublicStudentProject | null;
  mentor: ViewerShowcaseMentor;
  currentTerm: string;
  prevProject: PublicStudentProject | null;
  nextProject: PublicStudentProject | null;
  onNavigate: (target: PublicStudentProject) => void;
  onSelectTag: (tag: string) => void;
  onShare: (project: PublicStudentProject) => void;
  onClose: () => void;
}) {
  if (!project) return null;

  const safeVideoUrl = isSafePublicUrl(project.videoUrl)
    ? project.videoUrl
    : null;
  const embedUrl = resolveSafeVideoEmbedUrl(safeVideoUrl);
  const safePosterUrl = isSafePublicUrl(project.posterUrl)
    ? project.posterUrl
    : null;
  const safeDocUrl = isSafePublicUrl(project.documentUrl)
    ? project.documentUrl
    : null;
  const categoryLabel =
    SHOWCASE_CATEGORY_LABELS[project.category] || project.category;

  const mentorName = mentor.name.trim() || "Giáo viên điều hành";
  const mentorTitle =
    mentor.title.trim() || "Academic English & Mentorship";

  return (
    <ModalDialog
      open={Boolean(project)}
      onClose={onClose}
      title={project.title}
      description={`${categoryLabel} · Thực hiện: ${project.studentOrTeam}`}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {prevProject && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onNavigate(prevProject)}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                <span>Dự án trước</span>
              </Button>
            )}
            {nextProject && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onNavigate(nextProject)}
              >
                <span>Dự án sau</span>
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onShare(project)}
            >
              <Share2 className="size-3.5" aria-hidden="true" />
              <span>Sao chép liên kết</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {safeDocUrl && (
              <a
                href={safeDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Download className="size-3.5" aria-hidden="true" />
                <span>Tải PDF ({project.documentSize || "PDF"})</span>
              </a>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">{project.featuredMetric}</Badge>
          <Badge variant="secondary">{project.className}</Badge>
          <Badge variant="outline">Xuất bản: {project.publishedAt}</Badge>
          {currentTerm && <Badge variant="warm">{currentTerm}</Badge>}
        </div>

        {/* Video Section — Strictly Trusted Embeds or Safe Outbound Link */}
        {safeVideoUrl && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <div className="flex items-center justify-between border-b border-border bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-100">
              <span className="flex items-center gap-1.5 text-rose-400">
                <Film className="size-4" aria-hidden="true" />
                Video thuyết trình &amp; Pitching
              </span>
              <a
                href={safeVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white"
              >
                <span>Mở tab mới</span>
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </div>
            {embedUrl ? (
              <div className="relative aspect-video w-full bg-black">
                <iframe
                  src={embedUrl}
                  title={project.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-between gap-3 bg-muted/40 p-4 text-xs sm:flex-row">
                <span className="text-muted-foreground">
                  Video thuyết trình được lưu trữ trên liên kết ngoài (không sử
                  dụng nhúng iframe trực tiếp).
                </span>
                <a
                  href={safeVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <span>Xem video gốc</span>
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Poster Image Preview */}
        {safePosterUrl && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 py-2 text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <ImageIcon className="size-4" aria-hidden="true" />
                Poster nghiên cứu học thuật
              </span>
              <a
                href={safePosterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <span>Mở ảnh gốc</span>
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </div>
            <div className="flex max-h-96 items-center justify-center overflow-hidden bg-black/5 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={safePosterUrl}
                alt={project.title}
                className="max-h-80 w-auto rounded-lg object-contain shadow-xs"
              />
            </div>
          </div>
        )}

        {/* PDF Document Attachment */}
        {safeDocUrl && (
          <div className="flex flex-col gap-3 rounded-xl border border-blue-500/20 bg-blue-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <FileText className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">
                  {project.documentName || "Hồ sơ nghiên cứu đầy đủ (PDF)"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {project.documentSize || "PDF"} · Tài liệu học thuật đính kèm
                </p>
              </div>
            </div>
            <a
              href={safeDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span>Tải tài liệu PDF</span>
            </a>
          </div>
        )}

        {/* Clickable Topic Tags */}
        {project.tags && project.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Chủ đề:
            </span>
            {project.tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSelectTag(t)}
                className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        {/* Abstract */}
        {project.summary && (
          <div className="rounded-xl border border-border bg-background p-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Tóm tắt nội dung dự án (Abstract)
            </h3>
            <p className="mt-1.5 leading-relaxed text-muted-foreground">
              {project.summary}
            </p>
          </div>
        )}

        {/* Live-Synced Mentor Evaluation */}
        {project.keyTakeaway && (
          <div className="rounded-xl border border-primary/20 bg-warm/50 p-4">
            <div className="flex items-center gap-2 font-heading text-sm font-semibold text-primary">
              <Award className="size-4 text-[#B8861E]" aria-hidden="true" />
              <span>Đánh giá &amp; Nhận xét từ Giảng viên hướng dẫn</span>
            </div>
            <p className="mt-1.5 leading-relaxed text-foreground/90">
              {project.keyTakeaway}
            </p>
            <p className="mt-2.5 text-right text-xs text-muted-foreground">
              — <strong className="font-semibold text-primary">{mentorName}</strong>
              {mentorTitle ? ` · ${mentorTitle}` : ""}
            </p>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
