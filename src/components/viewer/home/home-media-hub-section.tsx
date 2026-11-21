"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Headphones,
  LayoutGrid,
  Loader2,
} from "lucide-react";
import {
  isSafePublicDocumentUrl,
  type PublicResourceFile,
} from "@/services/documents-helpers";
import type { PublicPodcastEpisode } from "@/services/podcast-helpers";
import type { PublicStudentProject } from "@/services/showcase-helpers";
import {
  HOME_FILE_TYPE_LABELS,
  PROJECT_CATEGORY_LABELS,
  selectFeaturedProjects,
  selectPublicResources,
} from "@/services/viewer-home-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { AudioPlayer } from "@/components/viewer/audio-player";
import { cn } from "@/lib/utils";

const PROJECT_THEME_GRADIENTS: Record<
  PublicStudentProject["accentTheme"],
  string
> = {
  navy: "from-[#EAF0FA] via-[#D7E4F7] to-[#B9D8F5]",
  blue: "from-[#E6F2FA] via-[#D4E7F5] to-[#B8D5EB]",
  coral: "from-[#FCEEE8] via-[#F7DDD2] to-[#F3C5B3]",
  cream: "from-[#E6F2EA] via-[#D4E9DC] to-[#B8D9C5]",
};

export function HomeMediaHubSection({
  podcasts,
  projects,
  resources,
  teacherName,
  teacherAvatarUrl,
}: {
  podcasts: PublicPodcastEpisode[];
  projects: PublicStudentProject[];
  resources: PublicResourceFile[];
  teacherName: string;
  teacherAvatarUrl?: string;
}) {
  const { toast } = useToast();
  const [activePodcastId, setActivePodcastId] = React.useState("");
  const [downloadCounts, setDownloadCounts] = React.useState<
    Record<string, number>
  >({});
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = React.useState<PublicResourceFile | null>(
    null,
  );

  const featuredPodcast = React.useMemo(() => {
    if (activePodcastId) {
      const found = podcasts.find((ep) => ep.id === activePodcastId);
      if (found) return found;
    }
    return podcasts.find((ep) => ep.isFeatured) ?? podcasts[0];
  }, [podcasts, activePodcastId]);

  const featuredProjects = React.useMemo(
    () => selectFeaturedProjects(projects, 2),
    [projects],
  );

  const publicResources = React.useMemo(
    () => selectPublicResources(resources, 3),
    [resources],
  );

  const handleResourceDownload = async (doc: PublicResourceFile) => {
    setDownloadingId(doc.id);
    try {
      const res = await apiRequest<{
        id: string;
        title: string;
        downloads: number;
        publicUrl: string | null;
      }>("/api/viewer/documents", {
        method: "POST",
        body: JSON.stringify({ fileId: doc.id }),
      });

      setDownloadCounts((prev) => ({
        ...prev,
        [doc.id]: res.downloads,
      }));

      const targetUrl = res.publicUrl ?? doc.publicUrl ?? null;
      if (isSafePublicDocumentUrl(targetUrl)) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
        toast({
          title: "Đang mở / tải xuống học liệu",
          description: `${doc.title} (${doc.size}) — ${res.downloads} lượt tải.`,
          variant: "success",
        });
      } else {
        setPreviewDoc(doc);
        toast({
          title: "Đã ghi nhận lượt xem tóm tắt học liệu",
          description:
            "Tệp này hiện ở dạng tóm tắt xem nhanh. Vui lòng xem chi tiết bên dưới hoặc vào Kho tài liệu.",
          variant: "info",
        });
      }
    } catch (err) {
      toast({
        title: "Không thể tải tài liệu lúc này",
        description:
          err instanceof Error
            ? err.message
            : "Vui lòng mở trong trang Kho tài liệu để thử lại.",
        variant: "error",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className="mx-auto max-w-[1360px] px-4 py-10 sm:px-8 sm:py-12 lg:px-10">
      <div className="grid gap-8 lg:grid-cols-12 lg:divide-x lg:divide-[#E3E7EF]">
        {/* COLUMN 1 (4 cols): 04. PODCAST HỌC THUẬT */}
        <div className="flex flex-col justify-between lg:col-span-4 lg:pr-7">
          <div>
            <div className="flex items-center gap-2">
              <Headphones
                className="size-4 text-[#D9AE54]"
                aria-hidden="true"
              />
              <h2 className="font-heading text-xs font-bold tracking-wide text-[#243B64] uppercase sm:text-sm">
                <span className="font-normal text-[#7B8497]">04.</span> PODCAST
                HỌC THUẬT
              </h2>
            </div>

            <p className="mt-1.5 font-serif text-lg font-bold text-[#243B64] sm:text-xl">
              Nghe để học – Học để tiến bộ
            </p>

            <p className="mt-1.5 text-xs leading-relaxed text-[#556075] sm:text-[13px]">
              Những bài học tiếng Anh, chia sẻ kinh nghiệm và câu chuyện truyền
              cảm hứng.
            </p>

            {featuredPodcast ? (
              <div className="mt-4">
                <AudioPlayer
                  episode={featuredPodcast}
                  compact
                  hostName={teacherName}
                  hostAvatarUrl={teacherAvatarUrl}
                />

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {podcasts.slice(0, 3).map((ep) => {
                    const active = ep.id === featuredPodcast.id;
                    return (
                      <button
                        key={ep.id}
                        type="button"
                        onClick={() => setActivePodcastId(ep.id)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                          active
                            ? "bg-[#243B64] font-semibold text-white"
                            : "border border-[#E3E7EF] bg-white text-[#556075] hover:border-[#243B64]/40 hover:text-[#243B64]",
                        )}
                      >
                        Tập {ep.episodeNumber} ({ep.durationLabel})
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-[#DCE5F4] bg-white px-4 py-8 text-center">
                <p className="text-xs font-semibold text-[#243B64]">
                  Chưa có tập podcast công khai
                </p>
                <p className="mt-1 text-[11px] text-[#7B8497]">
                  Các bản thu học thuật mới sẽ sớm được xuất bản.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end pt-2">
            <Link
              href="/podcast"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#243B64] hover:underline"
            >
              Xem tất cả podcast
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* COLUMN 2 (4 cols): 05. DỰ ÁN HỌC SINH TIÊU BIỂU */}
        <div className="flex flex-col justify-between lg:col-span-4 lg:px-7">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <LayoutGrid
                  className="size-4 text-[#D9AE54]"
                  aria-hidden="true"
                />
                <h2 className="font-heading text-xs font-bold tracking-wide text-[#243B64] uppercase sm:text-sm">
                  <span className="font-normal text-[#7B8497]">05.</span> DỰ ÁN
                  HỌC SINH TIÊU BIỂU
                </h2>
              </div>
              <Link
                href="/showcase"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#243B64] hover:underline"
              >
                Xem tất cả
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>

            <p className="mt-1.5 font-serif text-lg font-bold text-[#243B64] sm:text-xl">
              Sáng tạo – Tự tin – Hội nhập
            </p>

            {featuredProjects.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[#DCE5F4] bg-white px-4 py-8 text-center">
                <p className="text-xs font-semibold text-[#243B64]">
                  Chưa có dự án tiêu biểu được công bố
                </p>
                <p className="mt-1 text-[11px] text-[#7B8497]">
                  Các poster nghiên cứu và bài luận xuất sắc sau khi duyệt sẽ
                  xuất hiện tại đây.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3.5">
                {featuredProjects.map((project) => {
                  const categoryLabel =
                    PROJECT_CATEGORY_LABELS[project.category] ||
                    project.category;
                  const gradient =
                    PROJECT_THEME_GRADIENTS[project.accentTheme] ??
                    PROJECT_THEME_GRADIENTS.navy;

                  return (
                    <Link
                      key={project.id}
                      href={{
                        pathname: "/showcase",
                        query: { project: project.id },
                      }}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-[#E3E7EF] bg-white shadow-2xs transition-all hover:-translate-y-0.5 hover:border-[#243B64]/40 hover:shadow-xs"
                    >
                      {project.posterUrl?.trim() ? (
                        <div className="relative h-36 overflow-hidden bg-muted sm:h-40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={project.posterUrl}
                            alt={project.title}
                            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#1E3458]/70 via-transparent to-transparent" />
                          <span className="absolute top-2.5 left-2.5 rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-bold text-[#243B64] shadow-2xs">
                            {categoryLabel}
                          </span>
                          <span className="absolute right-2.5 bottom-2 left-2.5 truncate text-[10.5px] font-semibold text-white">
                            {project.featuredMetric} · {project.className}
                          </span>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "relative flex h-36 flex-col justify-between overflow-hidden bg-gradient-to-br p-3 sm:h-40",
                            gradient,
                          )}
                        >
                          <span className="self-start rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#243B64] shadow-2xs">
                            {categoryLabel}
                          </span>

                          <div className="my-auto flex flex-col items-center rounded-lg border border-[#243B64]/15 bg-white/92 px-2.5 py-2 text-center shadow-2xs">
                            <span className="line-clamp-1 font-serif text-xs leading-tight font-bold text-[#243B64]">
                              {project.featuredMetric || categoryLabel}
                            </span>
                            <span className="mt-0.5 line-clamp-1 text-[9.5px] font-medium text-[#496B9A]">
                              {project.publishedAt}
                            </span>
                          </div>

                          <span className="truncate text-[10px] font-semibold text-[#253047]/80">
                            {project.className}
                          </span>
                        </div>
                      )}

                      <div className="p-3">
                        <h3 className="line-clamp-2 font-heading text-xs leading-snug font-bold text-[#253047] group-hover:text-[#243B64]">
                          {project.title}
                        </h3>
                        <p className="mt-1 truncate text-[11px] text-[#7B8497]">
                          {project.studentOrTeam}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end pt-2">
            <Link
              href="/showcase"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#243B64] hover:underline"
            >
              Khám phá dự án học sinh
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* COLUMN 3 (4 cols): 06. THƯ VIỆN TÀI LIỆU */}
        <div className="flex flex-col justify-between lg:col-span-4 lg:pl-7">
          <div>
            <div className="flex items-center gap-2">
              <FolderOpen
                className="size-4 text-[#D9AE54]"
                aria-hidden="true"
              />
              <h2 className="font-heading text-xs font-bold tracking-wide text-[#243B64] uppercase sm:text-sm">
                <span className="font-normal text-[#7B8497]">06.</span> THƯ VIỆN
                TÀI LIỆU
              </h2>
            </div>

            <p className="mt-1.5 font-serif text-lg font-bold text-[#243B64] sm:text-xl">
              Học liệu chất lượng, đồng hành cùng bạn
            </p>

            {publicResources.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[#DCE5F4] bg-white px-4 py-8 text-center">
                <p className="text-xs font-semibold text-[#243B64]">
                  Chưa có tài liệu công khai mới
                </p>
                <p className="mt-1 text-[11px] text-[#7B8497]">
                  Học liệu mở sẽ hiển thị sau khi giáo viên chuyển quyền Công
                  khai.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {publicResources.map((doc) => {
                  const liveDownloads =
                    downloadCounts[doc.id] ?? doc.downloads ?? 0;
                  const isLoadingDoc = downloadingId === doc.id;

                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#E3E7EF] bg-white px-3.5 py-3 shadow-2xs transition-colors hover:border-[#243B64]/40"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF0FA] text-[#243B64]">
                          <FileText className="size-4.5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-heading text-xs font-bold text-[#253047] hover:text-[#243B64] sm:text-[13px]">
                            {doc.title}
                          </h3>
                          <p className="mt-0.5 text-[11px] text-[#7B8497]">
                            {HOME_FILE_TYPE_LABELS[doc.fileType] || doc.fileType}
                            {" · "}
                            {doc.size} · {liveDownloads} lượt tải
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleResourceDownload(doc)}
                        disabled={isLoadingDoc}
                        aria-label={`Tải tài liệu ${doc.title}`}
                        title={
                          doc.publicUrl
                            ? "Mở / Tải xuống tài liệu"
                            : "Xem tóm tắt tài liệu"
                        }
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#E3E7EF] bg-[#F8F9FC] text-[#243B64] transition-colors hover:bg-[#243B64] hover:text-white disabled:opacity-60"
                      >
                        {isLoadingDoc ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Download className="size-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end pt-2">
            <Link
              href="/documents"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#243B64] hover:underline"
            >
              Xem thư viện tài liệu
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {/* Resource Quick-Preview Modal (when clicking card or doc without physical file URL) */}
      <ModalDialog
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.title ?? "Chi tiết học liệu"}
        description={
          previewDoc
            ? `${HOME_FILE_TYPE_LABELS[previewDoc.fileType] ?? previewDoc.fileType} · ${previewDoc.level} · ${previewDoc.pagesOrDuration} (${previewDoc.size})`
            : undefined
        }
        size="md"
      >
        {previewDoc && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">{previewDoc.folderName}</Badge>
              <Badge variant="warm">{previewDoc.level}</Badge>
              <Badge variant="outline">
                {downloadCounts[previewDoc.id] ?? previewDoc.downloads ?? 0} lượt
                tải
              </Badge>
            </div>

            <p className="leading-relaxed text-muted-foreground">
              {previewDoc.description}
            </p>

            {previewDoc.previewSummary.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                <p className="text-xs font-bold text-foreground">
                  Nội dung trọng tâm trong tài liệu:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {previewDoc.previewSummary.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewDoc(null)}
              >
                Đóng
              </Button>
              {previewDoc.publicUrl ? (
                <Button
                  type="button"
                  onClick={() => void handleResourceDownload(previewDoc)}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Tải tệp gốc ({previewDoc.size})
                </Button>
              ) : (
                <Button
                  render={<Link href="/documents" />}
                  nativeButton={false}
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Mở trong Kho tài liệu
                </Button>
              )}
            </div>
          </div>
        )}
      </ModalDialog>
    </section>
  );
}
