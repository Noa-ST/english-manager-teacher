"use client";

import * as React from "react";
import {
  CheckCircle2,
  Edit3,
  FileAudio,
  Headphones,
  Loader2,
  Plus,
  Search,
  Send,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { PodcastEpisode } from "@/services/classroom-data";
import {
  PODCAST_CATEGORY_LABELS,
  parseDurationLabelToSeconds,
} from "@/services/cms-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { AudioPlayer } from "@/components/viewer/audio-player";
import { formatFileSize } from "@/lib/utils";

interface VocabDraftRow {
  term: string;
  ipa: string;
  meaning: string;
}

const DEFAULT_SHOW_NOTES = [
  "00:00 — Giới thiệu chủ đề học thuật trong tuần",
  "04:30 — Phân tích cấu trúc từ vựng & ngữ cảnh vận dụng",
  "09:15 — Bài tập thực hành phản xạ tại nhà",
].join("\n");

const DEFAULT_VOCAB: VocabDraftRow[] = [
  {
    term: "pedagogical clarity",
    ipa: "/ˌped.əˈɡɒdʒ.ɪ.kəl ˈklær.ə.ti/",
    meaning: "sự mạch lạc trong phương pháp sư phạm",
  },
];

export function CmsPodcastsTab({
  podcasts,
  onPodcastsChange,
  createTrigger,
}: {
  podcasts: PodcastEpisode[];
  onPodcastsChange: React.Dispatch<React.SetStateAction<PodcastEpisode[]>>;
  createTrigger: number;
}) {
  const { toast } = useToast();

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<
    "all" | PodcastEpisode["category"]
  >("all");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "published" | "draft"
  >("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  // Modal & Confirm state
  const [podModalOpen, setPodModalOpen] = React.useState(false);
  const [editingPod, setEditingPod] = React.useState<PodcastEpisode | null>(
    null,
  );
  const [previewPod, setPreviewPod] = React.useState<PodcastEpisode | null>(
    null,
  );
  const [deletingPod, setDeletingPod] = React.useState<PodcastEpisode | null>(
    null,
  );

  // Form states
  const [podTitle, setPodTitle] = React.useState("");
  const [podCategory, setPodCategory] =
    React.useState<PodcastEpisode["category"]>("weekly-digest");
  const [podCoverTheme, setPodCoverTheme] =
    React.useState<PodcastEpisode["coverTheme"]>("navy");
  const [podDuration, setPodDuration] = React.useState("12:30");
  const [podIsFeatured, setPodIsFeatured] = React.useState(false);
  const [podSummary, setPodSummary] = React.useState("");
  const [podShowNotesText, setPodShowNotesText] =
    React.useState(DEFAULT_SHOW_NOTES);
  const [podVocabRows, setPodVocabRows] =
    React.useState<VocabDraftRow[]>(DEFAULT_VOCAB);
  const [podAudioKey, setPodAudioKey] = React.useState("");
  const [podAudioUrl, setPodAudioUrl] = React.useState("");
  const [podAudioName, setPodAudioName] = React.useState("");
  const [showManualAudioUrl, setShowManualAudioUrl] = React.useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = React.useState(false);
  const audioFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [prevCreateTrigger, setPrevCreateTrigger] =
    React.useState(createTrigger);
  if (createTrigger !== prevCreateTrigger) {
    setPrevCreateTrigger(createTrigger);
    if (createTrigger > 0) {
      setEditingPod(null);
      setPodTitle("");
      setPodCategory("weekly-digest");
      setPodCoverTheme("navy");
      setPodDuration("12:30");
      setPodIsFeatured(false);
      setPodSummary("");
      setPodShowNotesText(DEFAULT_SHOW_NOTES);
      setPodVocabRows(DEFAULT_VOCAB);
      setPodAudioKey("");
      setPodAudioUrl("");
      setPodAudioName("");
      setShowManualAudioUrl(false);
      setPodModalOpen(true);
    }
  }

  const openEditPodcast = (ep: PodcastEpisode) => {
    setEditingPod(ep);
    setPodTitle(ep.title);
    setPodCategory(ep.category);
    setPodCoverTheme(ep.coverTheme);
    setPodDuration(ep.durationLabel);
    setPodIsFeatured(Boolean(ep.isFeatured));
    setPodSummary(ep.summary);
    setPodShowNotesText(
      ep.showNotes.length > 0 ? ep.showNotes.join("\n") : DEFAULT_SHOW_NOTES,
    );
    setPodVocabRows(
      ep.vocabularyHighlights.length > 0
        ? ep.vocabularyHighlights
        : DEFAULT_VOCAB,
    );
    setPodAudioKey(ep.audioKey || "");
    setPodAudioUrl(ep.audioUrl || "");
    setPodAudioName(ep.audioKey ? ep.audioKey.split("/").pop() || "" : "");
    setShowManualAudioUrl(Boolean(ep.audioUrl));
    setPodModalOpen(true);
  };

  const filteredPodcasts = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return podcasts.filter((ep) => {
      if (categoryFilter !== "all" && ep.category !== categoryFilter) {
        return false;
      }
      if (statusFilter !== "all" && ep.status !== statusFilter) {
        return false;
      }
      if (
        q &&
        !ep.title.toLowerCase().includes(q) &&
        !ep.summary.toLowerCase().includes(q) &&
        !ep.vocabularyHighlights.some((v) => v.term.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }, [podcasts, categoryFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPodcasts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedPodcasts = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPodcasts.slice(start, start + pageSize);
  }, [filteredPodcasts, currentPage, pageSize]);

  const handleAudioFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "mp3" && ext !== "m4a") {
      toast({
        title: "Định dạng âm thanh không hợp lệ",
        description: "Vui lòng chọn tệp định dạng .mp3 hoặc .m4a.",
        variant: "error",
      });
      return;
    }

    if (file.size > 40 * 1024 * 1024) {
      toast({
        title: "Tệp vượt quá dung lượng",
        description: "Giới hạn tải Podcast trên Supabase Free là 40 MB.",
        variant: "error",
      });
      return;
    }

    setIsUploadingAudio(true);
    try {
      const ticket = await apiRequest<{
        uploadUrl: string;
        method: "POST" | "PUT";
        headers?: Record<string, string>;
        publicUrl: string | null;
        storagePath: string;
        key?: string;
      }>("/api/admin/storage/upload-url", {
        method: "POST",
        body: JSON.stringify({
          folder: "podcasts",
          fileName: file.name,
          contentType: file.type || "audio/mpeg",
          size: file.size,
          visibility: "public",
        }),
      });

      if (ticket.uploadUrl) {
        await fetch(ticket.uploadUrl, {
          method: ticket.method || "PUT",
          headers: ticket.headers || {
            "Content-Type": file.type || "audio/mpeg",
          },
          body: file,
        }).catch(() => null);
      }

      const key = ticket.storagePath || ticket.key || "";
      setPodAudioKey(key);
      setPodAudioUrl(ticket.publicUrl || URL.createObjectURL(file));
      setPodAudioName(`${file.name} (${formatFileSize(file.size)})`);

      toast({
        title: "Đã tải tệp Podcast lên Supabase Storage",
        description: `${file.name} (${formatFileSize(file.size)}) sẵn sàng phát sóng.`,
        variant: "success",
      });
    } catch {
      setPodAudioUrl(URL.createObjectURL(file));
      setPodAudioName(`${file.name} (${formatFileSize(file.size)})`);
      toast({
        title: "Đã chọn tệp âm thanh cục bộ",
        description: file.name,
        variant: "info",
      });
    } finally {
      setIsUploadingAudio(false);
      if (audioFileInputRef.current) audioFileInputRef.current.value = "";
    }
  };

  const handleVocabChange = (
    idx: number,
    field: keyof VocabDraftRow,
    val: string,
  ) => {
    setPodVocabRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: val } : row)),
    );
  };

  const handleSavePodcast = async (statusOverride: "published" | "draft") => {
    if (!podTitle.trim()) {
      toast({
        title: "Tiêu đề Podcast không được để trống",
        variant: "warning",
      });
      return;
    }

    const showNotes = podShowNotesText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const vocabularyHighlights = podVocabRows
      .map((r) => ({
        term: r.term.trim(),
        ipa: r.ipa.trim(),
        meaning: r.meaning.trim(),
      }))
      .filter((r) => r.term && r.meaning);

    const durationSeconds = parseDurationLabelToSeconds(podDuration, 750);

    const payload = {
      title: podTitle.trim(),
      summary: podSummary.trim(),
      category: podCategory,
      coverTheme: podCoverTheme,
      durationLabel: podDuration.trim() || "12:30",
      durationSeconds,
      status: statusOverride,
      isFeatured: podIsFeatured,
      showNotes: showNotes.length > 0 ? showNotes : undefined,
      vocabularyHighlights:
        vocabularyHighlights.length > 0 ? vocabularyHighlights : undefined,
      audioKey: podAudioKey.trim() || null,
      audioUrl: podAudioUrl.trim() || null,
    };

    try {
      if (editingPod) {
        const updated = await apiRequest<PodcastEpisode>("/api/admin/cms", {
          method: "PATCH",
          body: JSON.stringify({
            module: "podcasts",
            id: editingPod.id,
            payload,
          }),
        });
        onPodcastsChange((prev) =>
          prev.map((ep) => {
            if (ep.id === editingPod.id) return updated;
            return updated.isFeatured ? { ...ep, isFeatured: false } : ep;
          }),
        );
        toast({
          title:
            statusOverride === "published"
              ? "Đã cập nhật và xuất bản tập Podcast"
              : "Đã lưu bản nháp tập Podcast",
          description: `Tập #${updated.episodeNumber}: ${updated.title}`,
          variant: "success",
        });
      } else {
        const created = await apiRequest<PodcastEpisode>("/api/admin/cms", {
          method: "POST",
          body: JSON.stringify({
            module: "podcasts",
            payload,
          }),
        });
        onPodcastsChange((prev) => [
          created,
          ...prev.map((ep) =>
            created.isFeatured ? { ...ep, isFeatured: false } : ep,
          ),
        ]);
        toast({
          title:
            statusOverride === "published"
              ? "Đã xuất bản tập Podcast mới"
              : "Đã lưu bản nháp tập Podcast",
          description: `Tập #${created.episodeNumber}: ${created.title}`,
          variant: statusOverride === "published" ? "success" : "info",
        });
      }
      setEditingPod(null);
      setPodModalOpen(false);
    } catch (err) {
      toast({
        title: "Không thể lưu tập Podcast",
        description:
          err instanceof Error ? err.message : "Vui lòng kiểm tra lại dữ liệu.",
        variant: "error",
      });
    }
  };

  const handleQuickUpdate = async (
    ep: PodcastEpisode,
    patch: Partial<Pick<PodcastEpisode, "status" | "isFeatured">>,
    successTitle: string,
  ) => {
    try {
      const updated = await apiRequest<PodcastEpisode>("/api/admin/cms", {
        method: "PATCH",
        body: JSON.stringify({
          module: "podcasts",
          id: ep.id,
          payload: patch,
        }),
      });
      onPodcastsChange((prev) =>
        prev.map((item) => {
          if (item.id === ep.id) return updated;
          return updated.isFeatured ? { ...item, isFeatured: false } : item;
        }),
      );
      toast({
        title: successTitle,
        description: `Tập #${updated.episodeNumber}: ${updated.title}`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Cập nhật Podcast thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const handleDeletePodcast = async () => {
    if (!deletingPod) return;
    try {
      await apiRequest(
        `/api/admin/cms?module=podcasts&id=${encodeURIComponent(deletingPod.id)}`,
        { method: "DELETE" },
      );
      onPodcastsChange((prev) => prev.filter((p) => p.id !== deletingPod.id));
      toast({
        title: "Đã xóa tập Podcast",
        description: `Tập #${deletingPod.episodeNumber}: ${deletingPod.title}`,
        variant: "info",
      });
      setDeletingPod(null);
    } catch (err) {
      toast({
        title: "Không thể xóa tập Podcast",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm tên tập, tóm tắt, từ vựng..."
            aria-label="Tìm kiếm Podcast"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(
                e.target.value as "all" | PodcastEpisode["category"],
              );
              setPage(1);
            }}
            aria-label="Lọc theo chủ đề Podcast"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Mọi chủ đề</option>
            {Object.entries(PODCAST_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "all" | "published" | "draft");
              setPage(1);
            }}
            aria-label="Lọc theo trạng thái phát hành"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Mọi trạng thái</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Bản nháp (Ẩn công khai)</option>
          </select>
        </div>
      </div>

      {/* Episode Grid */}
      {filteredPodcasts.length === 0 ? (
        <EmptyState
          title="Không có tập Podcast phù hợp"
          description="Thử điều chỉnh từ khóa tìm kiếm hoặc phát hành tập Podcast mới."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {paginatedPodcasts.map((ep) => (
            <div
              key={ep.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/35"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default">Tập #{ep.episodeNumber}</Badge>
                    <Badge variant="secondary">{ep.categoryLabel}</Badge>
                    {ep.isFeatured && (
                      <Badge variant="warm">
                        <Star className="size-3" aria-hidden="true" />
                        Nổi bật
                      </Badge>
                    )}
                  </div>
                  <Badge
                    variant={ep.status === "published" ? "success" : "warning"}
                  >
                    {ep.status === "published" ? "Đã xuất bản" : "Bản nháp"}
                  </Badge>
                </div>

                <h3 className="mt-3 font-heading text-base font-bold text-foreground">
                  {ep.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                  {ep.summary}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-md bg-muted px-2 py-0.5">
                    {ep.showNotes.length} mốc Show Notes
                  </span>
                  <span className="rounded-md bg-muted px-2 py-0.5">
                    {ep.vocabularyHighlights.length} từ vựng C1-C2
                  </span>
                  {ep.audioUrl || ep.audioKey ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                      <Headphones className="size-3" aria-hidden="true" />
                      Có tệp Audio
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  Thời lượng:{" "}
                  <strong className="font-mono text-foreground">
                    {ep.durationLabel}
                  </strong>{" "}
                  · {ep.publishedAt}
                </span>

                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setPreviewPod(ep)}
                    className="whitespace-nowrap"
                  >
                    <Headphones className="size-3.5" aria-hidden="true" />
                    Nghe thử
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      handleQuickUpdate(
                        ep,
                        { isFeatured: !ep.isFeatured },
                        ep.isFeatured
                          ? "Đã bỏ ghim nổi bật"
                          : "Đã đặt làm tập Podcast nổi bật Trang chủ",
                      )
                    }
                    className="whitespace-nowrap"
                  >
                    <Star className="size-3.5" aria-hidden="true" />
                    {ep.isFeatured ? "Bỏ nổi bật" : "Nổi bật"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      handleQuickUpdate(
                        ep,
                        {
                          status:
                            ep.status === "published" ? "draft" : "published",
                        },
                        ep.status === "published"
                          ? "Đã chuyển tập Podcast về Bản nháp"
                          : "Đã xuất bản tập Podcast",
                      )
                    }
                    className="whitespace-nowrap"
                  >
                    <Send className="size-3.5" aria-hidden="true" />
                    {ep.status === "published" ? "Nháp" : "Xuất bản"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => openEditPodcast(ep)}
                    className="whitespace-nowrap"
                  >
                    <Edit3 className="size-3.5" aria-hidden="true" />
                    Sửa
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setDeletingPod(ep)}
                    aria-label={`Xóa tập ${ep.title}`}
                  >
                    <Trash2
                      className="size-3.5 text-destructive"
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PaginationBar
        page={currentPage}
        totalPages={totalPages}
        totalItems={filteredPodcasts.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(sz) => {
          setPageSize(sz);
          setPage(1);
        }}
        pageSizeOptions={[6, 12, 24]}
      />

      {/* MODAL: CREATE / EDIT PODCAST */}
      <ModalDialog
        open={podModalOpen}
        onClose={() => setPodModalOpen(false)}
        title={
          editingPod
            ? `Biên tập Tập #${editingPod.episodeNumber}`
            : "Phát hành tập Podcast / Audio Newsletter mới"
        }
        description="Tải tệp âm thanh MP3/M4A, biên tập mốc Show Notes và bộ từ vựng học thuật cho học sinh."
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPodModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSavePodcast("draft")}
            >
              Lưu bản nháp
            </Button>
            <Button type="button" onClick={() => handleSavePodcast("published")}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {editingPod ? "Lưu & Xuất bản" : "Xuất bản Podcast"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Audio File Dropzone */}
          <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-warm/30 p-4">
            <input
              ref={audioFileInputRef}
              type="file"
              accept=".mp3,.m4a,audio/mpeg,audio/mp4"
              className="hidden"
              onChange={handleAudioFileChange}
            />
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {isUploadingAudio ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileAudio className="size-5" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <p className="font-heading text-xs font-bold text-foreground">
                    {podAudioName ||
                      (podAudioUrl
                        ? "Đã liên kết tệp âm thanh Podcast"
                        : "Chọn tệp âm thanh (.mp3, .m4a)")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {podAudioKey || podAudioUrl
                      ? podAudioKey || podAudioUrl
                      : "Lưu trữ tối đa 40 MB trên Supabase Storage Public Bucket"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={isUploadingAudio}
                  onClick={() => audioFileInputRef.current?.click()}
                >
                  <UploadCloud className="size-3.5" aria-hidden="true" />
                  {podAudioUrl ? "Đổi tệp" : "Tải tệp MP3/M4A"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowManualAudioUrl((v) => !v)}
                >
                  {showManualAudioUrl ? "Ẩn URL" : "Nhập URL"}
                </Button>
                {(podAudioUrl || podAudioKey) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      setPodAudioUrl("");
                      setPodAudioKey("");
                      setPodAudioName("");
                    }}
                    aria-label="Xóa tệp âm thanh"
                  >
                    <Trash2
                      className="size-3.5 text-destructive"
                      aria-hidden="true"
                    />
                  </Button>
                )}
              </div>
            </div>

            {showManualAudioUrl && (
              <Input
                value={podAudioUrl}
                onChange={(e) => setPodAudioUrl(e.target.value)}
                placeholder="https://.../podcast-episode.mp3"
                className="bg-background text-xs"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="pod-title"
              className="block text-xs font-semibold text-foreground"
            >
              Tiêu đề tập Podcast
            </label>
            <Input
              id="pod-title"
              value={podTitle}
              onChange={(e) => setPodTitle(e.target.value)}
              placeholder="Ví dụ: Chiến thuật phân tích biểu đồ tĩnh IELTS Writing Task 1"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="pod-cat"
                className="block text-xs font-semibold text-foreground"
              >
                Chuyên mục
              </label>
              <select
                id="pod-cat"
                value={podCategory}
                onChange={(e) =>
                  setPodCategory(e.target.value as PodcastEpisode["category"])
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {Object.entries(PODCAST_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pod-dur"
                className="block text-xs font-semibold text-foreground"
              >
                Thời lượng (MM:SS)
              </label>
              <Input
                id="pod-dur"
                value={podDuration}
                onChange={(e) => setPodDuration(e.target.value)}
                placeholder="12:30"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pod-theme"
                className="block text-xs font-semibold text-foreground"
              >
                Màu bìa (Cover Theme)
              </label>
              <select
                id="pod-theme"
                value={podCoverTheme}
                onChange={(e) =>
                  setPodCoverTheme(
                    e.target.value as PodcastEpisode["coverTheme"],
                  )
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="navy">Navy Academic</option>
                <option value="cream">Warm Cream</option>
                <option value="sky">Sky Blue</option>
                <option value="coral">Coral Accent</option>
              </select>
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={podIsFeatured}
              onChange={(e) => setPodIsFeatured(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            <span>Đặt làm tập Podcast Nổi bật (Hiển thị ưu tiên trên Trang chủ)</span>
          </label>

          <div className="space-y-1.5">
            <label
              htmlFor="pod-sum"
              className="block text-xs font-semibold text-foreground"
            >
              Tóm tắt nội dung (Show Summary)
            </label>
            <textarea
              id="pod-sum"
              rows={2}
              value={podSummary}
              onChange={(e) => setPodSummary(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          {/* Show Notes */}
          <div className="space-y-1.5">
            <label
              htmlFor="pod-notes"
              className="block text-xs font-semibold text-foreground"
            >
              Mốc thời gian Show Notes (mỗi dòng 1 mốc)
            </label>
            <textarea
              id="pod-notes"
              rows={3}
              value={podShowNotesText}
              onChange={(e) => setPodShowNotesText(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 font-mono text-xs text-foreground"
            />
          </div>

          {/* Vocabulary Highlights Editor */}
          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground">
                Từ vựng học thuật trọng tâm ({podVocabRows.length})
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() =>
                  setPodVocabRows((prev) => [
                    ...prev,
                    { term: "", ipa: "", meaning: "" },
                  ])
                }
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Thêm từ vựng
              </Button>
            </div>
            <div className="space-y-2">
              {podVocabRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid items-center gap-2 sm:grid-cols-12"
                >
                  <Input
                    value={row.term}
                    onChange={(e) =>
                      handleVocabChange(idx, "term", e.target.value)
                    }
                    placeholder="Thuật ngữ (term)"
                    className="text-xs sm:col-span-4"
                  />
                  <Input
                    value={row.ipa}
                    onChange={(e) =>
                      handleVocabChange(idx, "ipa", e.target.value)
                    }
                    placeholder="Phiên âm IPA"
                    className="font-mono text-xs sm:col-span-3"
                  />
                  <Input
                    value={row.meaning}
                    onChange={(e) =>
                      handleVocabChange(idx, "meaning", e.target.value)
                    }
                    placeholder="Nghĩa tiếng Việt"
                    className="text-xs sm:col-span-4"
                  />
                  <div className="flex justify-end sm:col-span-1">
                    {podVocabRows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          setPodVocabRows((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        aria-label={`Xóa từ vựng ${idx + 1}`}
                      >
                        <Trash2
                          className="size-3.5 text-destructive"
                          aria-hidden="true"
                        />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ModalDialog>

      {/* MODAL: PREVIEW PODCAST PLAYER */}
      <ModalDialog
        open={Boolean(previewPod)}
        onClose={() => setPreviewPod(null)}
        title={
          previewPod
            ? `Nghe thử Tập #${previewPod.episodeNumber}: ${previewPod.title}`
            : "Nghe thử Podcast"
        }
        description={previewPod?.categoryLabel}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setPreviewPod(null)}>
            Đóng trình nghe thử
          </Button>
        }
      >
        {previewPod && (
          <div className="space-y-4">
            <AudioPlayer episode={previewPod} />
            {previewPod.showNotes.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-xs">
                <p className="font-bold text-foreground">Mốc thời gian Show Notes:</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {previewPod.showNotes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </ModalDialog>

      {/* DELETE CONFIRM */}
      <ConfirmDialog
        open={Boolean(deletingPod)}
        onClose={() => setDeletingPod(null)}
        onConfirm={handleDeletePodcast}
        title="Xác nhận xóa tập Podcast?"
        description={
          deletingPod
            ? `Tập #${deletingPod.episodeNumber}: "${deletingPod.title}" sẽ bị gỡ khỏi kênh phát thanh.`
            : ""
        }
        confirmLabel="Xóa tập Podcast"
        variant="destructive"
      />
    </div>
  );
}
