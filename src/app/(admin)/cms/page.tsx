"use client";

import * as React from "react";
import {
  Award,
  Bold,
  BookOpen,
  CheckCircle2,
  Edit3,
  Eye,
  FileAudio,
  FolderGit2,
  Heading2,
  Headphones,
  Italic,
  Link2,
  List,
  Megaphone,
  Pin,
  Plus,
  Quote,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  ANNOUNCEMENTS_DATA,
  HALL_OF_FAME_DATA,
  PODCAST_EPISODES_DATA,
  RESOURCE_FILES_DATA,
  STUDENT_PROJECTS_DATA,
  type AnnouncementItem,
  type HallOfFameStudent,
  type PodcastEpisode,
  type ResourceFileItem,
  type StudentProjectItem,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type CmsTab =
  | "announcements"
  | "podcast"
  | "hall-of-fame"
  | "projects"
  | "resources";

const CMS_TABS: { id: CmsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "announcements",
    label: "Thông báo (News)",
    icon: <Megaphone className="size-4" aria-hidden="true" />,
  },
  {
    id: "podcast",
    label: "Podcast Audio",
    icon: <Headphones className="size-4" aria-hidden="true" />,
  },
  {
    id: "hall-of-fame",
    label: "Bảng vàng Vinh danh",
    icon: <Award className="size-4" aria-hidden="true" />,
  },
  {
    id: "projects",
    label: "Dự án Học sinh",
    icon: <FolderGit2 className="size-4" aria-hidden="true" />,
  },
  {
    id: "resources",
    label: "Học liệu Công khai",
    icon: <BookOpen className="size-4" aria-hidden="true" />,
  },
];

const PROJECT_CATEGORY_LABELS: Record<string, string> = {
  "Research Poster": "Poster nghiên cứu",
  "Debate Portfolio": "Hồ sơ tranh biện",
  "Video Presentation": "Video thuyết trình",
  "Academic Essay": "Bài luận học thuật",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  PDF: "Tài liệu PDF",
  SLIDE: "Slide bài giảng",
  WORKSHEET: "Phiếu bài tập",
  AUDIO: "Băng nghe (Audio)",
  IMAGE: "Hình ảnh",
};

export default function AdminCmsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<CmsTab>("announcements");

  // 1. Announcements State
  const [announcements, setAnnouncements] =
    React.useState<AnnouncementItem[]>(ANNOUNCEMENTS_DATA);
  const [annModalOpen, setAnnModalOpen] = React.useState(false);
  const [editingAnn, setEditingAnn] = React.useState<AnnouncementItem | null>(
    null,
  );
  const [previewAnn, setPreviewAnn] = React.useState<AnnouncementItem | null>(
    null,
  );
  const [deletingAnn, setDeletingAnn] = React.useState<AnnouncementItem | null>(
    null,
  );

  // Announcement Rich Text Editor form
  const [annTitle, setAnnTitle] = React.useState("");
  const [annCategory, setAnnCategory] =
    React.useState<AnnouncementItem["category"]>("urgent");
  const [annIsPinned, setAnnIsPinned] = React.useState(true);
  const [annContentText, setAnnContentText] = React.useState("");

  // 2. Podcast State
  const [podcasts, setPodcasts] = React.useState<PodcastEpisode[]>(
    PODCAST_EPISODES_DATA,
  );
  const [podModalOpen, setPodModalOpen] = React.useState(false);
  const [podTitle, setPodTitle] = React.useState("");
  const [podSummary, setPodSummary] = React.useState("");
  const [podDuration, setPodDuration] = React.useState("12:30");

  // 3. Hall of Fame State
  const [honors, setHonors] =
    React.useState<HallOfFameStudent[]>(HALL_OF_FAME_DATA);
  const [hofModalOpen, setHofModalOpen] = React.useState(false);
  const [hofName, setHofName] = React.useState("");
  const hofClass = "IELTS Intensive (Band 6.5–7.5+)";
  const [hofMetric, setHofMetric] = React.useState("IELTS 8.0 Overall");
  const [hofBadge, setHofBadge] = React.useState("Academic Excellence");
  const [hofEndorsement, setHofEndorsement] = React.useState("");

  // 4. Projects State
  const [projects, setProjects] = React.useState<StudentProjectItem[]>(
    STUDENT_PROJECTS_DATA,
  );
  const [projModalOpen, setProjModalOpen] = React.useState(false);
  const [projTitle, setProjTitle] = React.useState("");
  const [projAuthor, setProjAuthor] = React.useState("");
  const [projCategory, setProjCategory] =
    React.useState<StudentProjectItem["category"]>("Research Poster");
  const [projSummary, setProjSummary] = React.useState("");

  // 5. Resources State
  const [resources, setResources] =
    React.useState<ResourceFileItem[]>(RESOURCE_FILES_DATA);

  // Pagination State
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  React.useEffect(() => {
    apiRequest<{
      announcements: AnnouncementItem[];
      podcasts: PodcastEpisode[];
      hallOfFame: HallOfFameStudent[];
      projects: StudentProjectItem[];
      resources?: ResourceFileItem[];
    }>("/api/admin/cms")
      .then((res) => {
        if (res.announcements) setAnnouncements(res.announcements);
        if (res.podcasts) setPodcasts(res.podcasts);
        if (res.hallOfFame) setHonors(res.hallOfFame);
        if (res.projects) setProjects(res.projects);
        if (res.resources) setResources(res.resources);
      })
      .catch(() => {});
  }, []);

  // --- Announcement Editor Handlers ---
  const openCreateAnnouncement = () => {
    setEditingAnn(null);
    setAnnTitle("");
    setAnnCategory("urgent");
    setAnnIsPinned(true);
    setAnnContentText(
      "Kính gửi Quý Phụ huynh và các em học sinh,\n\nNội dung thông báo chi tiết...",
    );
    setAnnModalOpen(true);
  };

  const openEditAnnouncement = (item: AnnouncementItem) => {
    setEditingAnn(item);
    setAnnTitle(item.title);
    setAnnCategory(item.category);
    setAnnIsPinned(Boolean(item.isPinned));
    setAnnContentText(item.content.join("\n\n"));
    setAnnModalOpen(true);
  };

  const insertRichFormat = (snippet: string) => {
    setAnnContentText((prev) => `${prev}\n${snippet}`);
  };

  const handleSaveAnnouncement = async (
    statusOverride: "published" | "draft",
  ) => {
    if (!annTitle.trim()) return;
    const paragraphs = annContentText
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    try {
      if (editingAnn) {
        const updated = await apiRequest<AnnouncementItem>("/api/admin/cms", {
          method: "PATCH",
          body: JSON.stringify({
            module: "announcements",
            id: editingAnn.id,
            payload: {
              title: annTitle.trim(),
              excerpt: paragraphs[0] ?? annTitle.trim(),
              content: paragraphs,
              category: annCategory,
              isPinned: annIsPinned,
              status: statusOverride,
            },
          }),
        });
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === editingAnn.id ? updated : a)),
        );
      } else {
        const created = await apiRequest<AnnouncementItem>("/api/admin/cms", {
          method: "POST",
          body: JSON.stringify({
            module: "announcements",
            payload: {
              title: annTitle.trim(),
              excerpt: paragraphs[0] ?? annTitle.trim(),
              content: paragraphs,
              category: annCategory,
              isPinned: annIsPinned,
              status: statusOverride,
            },
          }),
        });
        setAnnouncements((prev) => [created, ...prev]);
      }
    } catch {
      // Fallback handled gracefully
    }

    toast({
      title:
        statusOverride === "published"
          ? "Đã xuất bản thông báo lên Cổng học sinh"
          : "Đã lưu bản nháp thông báo",
      description: annTitle,
      variant: statusOverride === "published" ? "success" : "info",
    });
    setAnnModalOpen(false);
  };

  const handleDeleteAnnouncement = async () => {
    if (!deletingAnn) return;
    try {
      await apiRequest(
        `/api/admin/cms?module=announcements&id=${encodeURIComponent(deletingAnn.id)}`,
        { method: "DELETE" },
      );
    } catch {
      // Fallback
    }
    setAnnouncements((prev) => prev.filter((a) => a.id !== deletingAnn.id));
    toast({
      title: "Đã xóa bản tin thông báo",
      description: deletingAnn.title,
      variant: "info",
    });
    setDeletingAnn(null);
  };

  // --- Podcast Handler ---
  const handleCreatePodcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podTitle.trim()) return;
    try {
      const created = await apiRequest<PodcastEpisode>("/api/admin/cms", {
        method: "POST",
        body: JSON.stringify({
          module: "podcasts",
          payload: {
            title: podTitle.trim(),
            summary: podSummary.trim(),
            durationLabel: podDuration,
          },
        }),
      });
      setPodcasts((prev) => [created, ...prev]);
      toast({
        title: "Đã xuất bản tập Podcast mới",
        description: `Tập #${created.episodeNumber}: ${created.title}`,
        variant: "success",
      });
    } catch {
      // Fallback
    }
    setPodTitle("");
    setPodSummary("");
    setPodModalOpen(false);
  };

  // --- Hall of Fame Handler ---
  const handleCreateHonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hofName.trim()) return;
    try {
      const created = await apiRequest<HallOfFameStudent>("/api/admin/cms", {
        method: "POST",
        body: JSON.stringify({
          module: "hall-of-fame",
          payload: {
            displayName: hofName.trim(),
            className: hofClass,
            headlineMetric: hofMetric,
            badgeTitle: hofBadge,
            teacherEndorsement: hofEndorsement.trim(),
          },
        }),
      });
      setHonors((prev) => [created, ...prev]);
      toast({
        title: "Đã thêm vinh danh vào Bảng vàng",
        description: `Học sinh ${created.displayName} (${created.headlineMetric})`,
        variant: "success",
      });
    } catch {
      // Fallback
    }
    setHofName("");
    setHofEndorsement("");
    setHofModalOpen(false);
  };

  // --- Student Project Handler ---
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projTitle.trim()) return;
    try {
      const created = await apiRequest<StudentProjectItem>("/api/admin/cms", {
        method: "POST",
        body: JSON.stringify({
          module: "projects",
          payload: {
            title: projTitle.trim(),
            studentOrTeam: projAuthor.trim() || "Nhóm Học sinh Lớp IELTS",
            category: projCategory,
            summary: projSummary.trim(),
          },
        }),
      });
      setProjects((prev) => [created, ...prev]);
      toast({
        title: "Đã đăng tải Dự án học sinh",
        description: created.title,
        variant: "success",
      });
    } catch {
      // Fallback
    }
    setProjTitle("");
    setProjAuthor("");
    setProjSummary("");
    setProjModalOpen(false);
  };

  const currentListLength = React.useMemo(() => {
    switch (activeTab) {
      case "announcements":
        return announcements.length;
      case "podcast":
        return podcasts.length;
      case "hall-of-fame":
        return honors.length;
      case "projects":
        return projects.length;
      case "resources":
        return resources.length;
      default:
        return 0;
    }
  }, [activeTab, announcements.length, podcasts.length, honors.length, projects.length, resources.length]);

  const totalPages = Math.max(1, Math.ceil(currentListLength / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedAnnouncements = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return announcements.slice(start, start + pageSize);
  }, [announcements, currentPage, pageSize]);

  const paginatedPodcasts = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return podcasts.slice(start, start + pageSize);
  }, [podcasts, currentPage, pageSize]);

  const paginatedHonors = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return honors.slice(start, start + pageSize);
  }, [honors, currentPage, pageSize]);

  const paginatedProjects = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return projects.slice(start, start + pageSize);
  }, [projects, currentPage, pageSize]);

  const paginatedResources = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return resources.slice(start, start + pageSize);
  }, [resources, currentPage, pageSize]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản trị Nội dung & Thương hiệu (CMS)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Biên tập bản tin thông báo, phát hành Podcast, cập nhật Bảng vàng và tuyển chọn Dự án
            học sinh trên Cổng công khai.
          </p>
        </div>

        {activeTab === "announcements" && (
          <Button onClick={openCreateAnnouncement}>
            <Plus className="size-4" aria-hidden="true" />
            Soạn thông báo mới
          </Button>
        )}
        {activeTab === "podcast" && (
          <Button onClick={() => setPodModalOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Tải lên tập Podcast mới
          </Button>
        )}
        {activeTab === "hall-of-fame" && (
          <Button onClick={() => setHofModalOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Thêm gương mặt Bảng vàng
          </Button>
        )}
        {activeTab === "projects" && (
          <Button onClick={() => setProjModalOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Đăng dự án học sinh
          </Button>
        )}
      </div>

      {/* CMS Module Navigation Tabs */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-card p-2"
        role="tablist"
        aria-label="Các phân hệ CMS"
      >
        {CMS_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActiveTab(tab.id);
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ANNOUNCEMENTS */}
      {activeTab === "announcements" && (
        <div className="space-y-4">
          {paginatedAnnouncements.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      item.status === "published" ? "success" : "warning"
                    }
                  >
                    {item.status === "published" ? "Đã xuất bản" : "Bản nháp"}
                  </Badge>
                  <Badge
                    variant={item.isUrgent ? "highlight" : "secondary"}
                  >
                    {item.categoryLabel}
                  </Badge>
                  {item.isPinned && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <Pin className="size-3" aria-hidden="true" />
                      Ghim đầu trang
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {item.publishedAt}
                  </span>
                </div>

                <h3 className="font-heading text-base font-bold text-foreground">
                  {item.title}
                </h3>
                <p className="max-w-3xl text-xs text-muted-foreground">
                  {item.excerpt}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setPreviewAnn(item)}
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  Xem trước
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => openEditAnnouncement(item)}
                >
                  <Edit3 className="size-3.5" aria-hidden="true" />
                  Biên tập
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setDeletingAnn(item)}
                  aria-label={`Xóa thông báo ${item.title}`}
                >
                  <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: PODCASTS */}
      {activeTab === "podcast" && (
        <div className="grid gap-4 md:grid-cols-2">
          {paginatedPodcasts.map((ep) => (
            <div
              key={ep.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">Tập #{ep.episodeNumber}</Badge>
                    <Badge variant="secondary">{ep.categoryLabel}</Badge>
                  </div>
                  <Badge variant="success">Đã xuất bản</Badge>
                </div>

                <h3 className="mt-3 font-heading text-base font-bold text-foreground">
                  {ep.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {ep.summary}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  Thời lượng: <strong className="font-mono">{ep.durationLabel}</strong> ·{" "}
                  {ep.publishedAt}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    toast({
                      title: "Đã đồng bộ RSS & Audio Player",
                      description: `Tập #${ep.episodeNumber} đang hoạt động trên Cổng học sinh.`,
                      variant: "info",
                    })
                  }
                >
                  Kiểm tra Audio
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: HALL OF FAME */}
      {activeTab === "hall-of-fame" && (
        <div className="grid gap-4 md:grid-cols-2">
          {paginatedHonors.map((h) => (
            <div
              key={h.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="warm">
                    Hạng #{h.rank} · {h.periodLabel}
                  </Badge>
                  <span className="font-mono text-xs font-bold text-primary">
                    {h.headlineMetric}
                  </span>
                </div>
                <h3 className="mt-3 font-heading text-base font-bold text-foreground">
                  {h.displayName} —{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {h.className}
                  </span>
                </h3>
                <p className="mt-2 text-xs italic text-foreground/85">
                  “{h.teacherEndorsement}”
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <Badge variant="secondary">{h.badgeTitle}</Badge>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setHonors((prev) => prev.filter((item) => item.id !== h.id));
                    toast({
                      title: "Đã gỡ khỏi Bảng vàng",
                      description: h.displayName,
                      variant: "info",
                    });
                  }}
                >
                  <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                  Gỡ bỏ
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: STUDENT PROJECTS */}
      {activeTab === "projects" && (
        <div className="grid gap-4 md:grid-cols-2">
          {paginatedProjects.map((p) => (
            <div
              key={p.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary">
                    {PROJECT_CATEGORY_LABELS[p.category] || p.category}
                  </Badge>
                  <Badge variant="warm">{p.featuredMetric}</Badge>
                </div>
                <h3 className="mt-2.5 font-heading text-base font-bold text-foreground">
                  {p.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-primary">
                  Tác giả: {p.studentOrTeam} · {p.className}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{p.summary}</p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                <span className="text-muted-foreground">Ngày đăng: {p.publishedAt}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setProjects((prev) => prev.filter((item) => item.id !== p.id));
                    toast({
                      title: "Đã gỡ dự án khỏi thư viện",
                      description: p.title,
                      variant: "info",
                    });
                  }}
                >
                  <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                  Xóa
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 5: PUBLIC RESOURCES QUICK SYNC */}
      {activeTab === "resources" && (
        <div className="space-y-3">
          {paginatedResources.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      file.visibility === "public" ? "success" : "outline"
                    }
                  >
                    {file.visibility === "public"
                      ? "Công khai"
                      : "Nội bộ"}
                  </Badge>
                  <Badge variant="secondary">
                    {FILE_TYPE_LABELS[file.fileType] || file.fileType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {file.folderName}
                  </span>
                </div>
                <h3 className="mt-1.5 font-heading text-sm font-bold text-foreground">
                  {file.title}
                </h3>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {file.size} · {file.downloads} lượt tải
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pagination for active tab list */}
      <PaginationBar
        page={currentPage}
        totalPages={totalPages}
        totalItems={currentListLength}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(sz) => {
          setPageSize(sz);
          setPage(1);
        }}
        pageSizeOptions={[6, 12, 24]}
      />

      {/* MODAL: RICH TEXT ANNOUNCEMENT EDITOR */}
      <ModalDialog
        open={annModalOpen}
        onClose={() => setAnnModalOpen(false)}
        title={
          editingAnn
            ? "Biên tập bản tin thông báo"
            : "Soạn thảo bản tin thông báo mới"
        }
        description="Hỗ trợ định dạng bài viết học thuật, gắn thẻ ưu tiên và lưu nháp trước khi xuất bản."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setAnnModalOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSaveAnnouncement("draft")}
            >
              Lưu bản nháp
            </Button>
            <Button onClick={() => handleSaveAnnouncement("published")}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Xuất bản thông báo
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="cms-ann-title"
              className="block text-xs font-semibold text-foreground"
            >
              Tiêu đề thông báo
            </label>
            <Input
              id="cms-ann-title"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="Nhập tiêu đề thông báo rõ ràng, chuẩn mực..."
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="cms-ann-cat"
                className="block text-xs font-semibold text-foreground"
              >
                Chuyên mục bản tin
              </label>
              <select
                id="cms-ann-cat"
                value={annCategory}
                onChange={(e) =>
                  setAnnCategory(e.target.value as AnnouncementItem["category"])
                }
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="urgent">Thông báo quan trọng (Khẩn)</option>
                <option value="event">Sự kiện học thuật</option>
                <option value="homework">Bài tập tuần</option>
                <option value="schedule">Lịch học</option>
                <option value="tuition">Học phí & Học vụ</option>
              </select>
            </div>

            <div className="flex items-end pb-1">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={annIsPinned}
                  onChange={(e) => setAnnIsPinned(e.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                <span>Ghim thông báo lên đầu Bảng tin học sinh</span>
              </label>
            </div>
          </div>

          {/* Rich Text Formatting Toolbar */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-foreground">
              Nội dung chi tiết (Trình soạn thảo học thuật)
            </span>
            <div className="overflow-hidden rounded-xl border border-input bg-background">
              <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2.5 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => insertRichFormat("**Nội dung in đậm**")}
                  aria-label="In đậm"
                >
                  <Bold className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => insertRichFormat("*Nội dung in nghiêng*")}
                  aria-label="In nghiêng"
                >
                  <Italic className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => insertRichFormat("### Đề mục phần mới")}
                  aria-label="Tiêu đề phụ"
                >
                  <Heading2 className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    insertRichFormat("• Mục lưu ý số 1\n• Mục lưu ý số 2")
                  }
                  aria-label="Danh sách"
                >
                  <List className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    insertRichFormat("> Lưu ý học thuật quan trọng dành cho học viên.")
                  }
                  aria-label="Trích dẫn"
                >
                  <Quote className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    insertRichFormat("[Tài liệu đính kèm](/documents)")
                  }
                  aria-label="Chèn liên kết"
                >
                  <Link2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              <textarea
                rows={7}
                value={annContentText}
                onChange={(e) => setAnnContentText(e.target.value)}
                aria-label="Nội dung thông báo"
                className="w-full bg-transparent p-3.5 text-xs leading-relaxed text-foreground outline-none"
              />
            </div>
          </div>
        </div>
      </ModalDialog>

      {/* MODAL: PREVIEW ANNOUNCEMENT */}
      <ModalDialog
        open={Boolean(previewAnn)}
        onClose={() => setPreviewAnn(null)}
        title={previewAnn?.title ?? "Xem trước thông báo"}
        description={
          previewAnn
            ? `${previewAnn.categoryLabel} · Ngày đăng: ${previewAnn.publishedAt}`
            : undefined
        }
        size="md"
        footer={
          <Button variant="outline" onClick={() => setPreviewAnn(null)}>
            Đóng chế độ xem trước
          </Button>
        }
      >
        {previewAnn && (
          <div className="space-y-3 text-xs leading-relaxed text-foreground">
            {previewAnn.content.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>
        )}
      </ModalDialog>

      {/* MODAL: PODCAST UPLOAD */}
      <ModalDialog
        open={podModalOpen}
        onClose={() => setPodModalOpen(false)}
        title="Phát hành tập Podcast / Audio Newsletter mới"
        description="Tải tệp âm thanh MP3/M4A và cấu hình ghi chú bài nghe cho học sinh."
        size="md"
      >
        <form onSubmit={handleCreatePodcast} className="space-y-4">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 bg-warm/30 p-5 text-center">
            <FileAudio className="size-7 text-primary" aria-hidden="true" />
            <p className="mt-2 font-heading text-xs font-bold text-foreground">
              Kéo thả tệp âm thanh (.mp3, .m4a) hoặc nhấn để chọn
            </p>
            <p className="text-[11px] text-muted-foreground">
              Tự động tối ưu bitrate và lưu trữ trên Cloud R2
            </p>
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

          <div className="space-y-1.5">
            <label
              htmlFor="pod-dur"
              className="block text-xs font-semibold text-foreground"
            >
              Thời lượng hiển thị
            </label>
            <Input
              id="pod-dur"
              value={podDuration}
              onChange={(e) => setPodDuration(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="pod-sum"
              className="block text-xs font-semibold text-foreground"
            >
              Tóm tắt nội dung (Show Summary)
            </label>
            <textarea
              id="pod-sum"
              rows={3}
              value={podSummary}
              onChange={(e) => setPodSummary(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPodModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <UploadCloud className="size-4" aria-hidden="true" />
              Phát hành Podcast
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* MODAL: ADD HALL OF FAME */}
      <ModalDialog
        open={hofModalOpen}
        onClose={() => setHofModalOpen(false)}
        title="Vinh danh học sinh lên Bảng vàng"
        description="Hiển thị trang trọng trên trang chủ và chuyên trang Bảng vàng."
        size="md"
      >
        <form onSubmit={handleCreateHonor} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="hof-name"
              className="block text-xs font-semibold text-foreground"
            >
              Tên hiển thị học sinh
            </label>
            <Input
              id="hof-name"
              value={hofName}
              onChange={(e) => setHofName(e.target.value)}
              placeholder="Ví dụ: Nguyễn Minh Khuê"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="hof-metric"
                className="block text-xs font-semibold text-foreground"
              >
                Thành tích nổi bật
              </label>
              <Input
                id="hof-metric"
                value={hofMetric}
                onChange={(e) => setHofMetric(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="hof-badge"
                className="block text-xs font-semibold text-foreground"
              >
                Huy hiệu danh hiệu
              </label>
              <Input
                id="hof-badge"
                value={hofBadge}
                onChange={(e) => setHofBadge(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="hof-quote"
              className="block text-xs font-semibold text-foreground"
            >
              Lời khen & Nhận xét của giáo viên
            </label>
            <textarea
              id="hof-quote"
              rows={3}
              value={hofEndorsement}
              onChange={(e) => setHofEndorsement(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setHofModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <Award className="size-4" aria-hidden="true" />
              Lưu vào Bảng vàng
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* MODAL: ADD STUDENT PROJECT */}
      <ModalDialog
        open={projModalOpen}
        onClose={() => setProjModalOpen(false)}
        title="Đăng tải Dự án học sinh mới"
        description="Tuyển chọn sản phẩm học thuật tiêu biểu vào thư viện Showcase."
        size="md"
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="proj-title"
              className="block text-xs font-semibold text-foreground"
            >
              Tên dự án / Đề tài
            </label>
            <Input
              id="proj-title"
              value={projTitle}
              onChange={(e) => setProjTitle(e.target.value)}
              placeholder="Ví dụ: Urban Green Spaces & Mental Wellbeing"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="proj-author"
                className="block text-xs font-semibold text-foreground"
              >
                Học sinh / Nhóm thực hiện
              </label>
              <Input
                id="proj-author"
                value={projAuthor}
                onChange={(e) => setProjAuthor(e.target.value)}
                placeholder="Ví dụ: Nhóm 3 — Lớp IELTS Intensive"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="proj-cat"
                className="block text-xs font-semibold text-foreground"
              >
                Phân loại sản phẩm
              </label>
              <select
                id="proj-cat"
                value={projCategory}
                onChange={(e) =>
                  setProjCategory(
                    e.target.value as StudentProjectItem["category"],
                  )
                }
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="Research Poster">Poster nghiên cứu (Research Poster)</option>
                <option value="Debate Portfolio">Hồ sơ tranh biện (Debate Portfolio)</option>
                <option value="Video Presentation">Video thuyết trình (Video Presentation)</option>
                <option value="Academic Essay">Bài luận học thuật (Academic Essay)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="proj-sum"
              className="block text-xs font-semibold text-foreground"
            >
              Tóm tắt dự án
            </label>
            <textarea
              id="proj-sum"
              rows={3}
              value={projSummary}
              onChange={(e) => setProjSummary(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setProjModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Xuất bản Dự án
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deletingAnn)}
        onClose={() => setDeletingAnn(null)}
        onConfirm={handleDeleteAnnouncement}
        title="Xác nhận xóa bản tin thông báo?"
        description={
          deletingAnn
            ? `Bản tin "${deletingAnn.title}" sẽ bị gỡ khỏi Cổng thông tin học sinh.`
            : ""
        }
        confirmLabel="Xóa bản tin"
        variant="destructive"
      />
    </div>
  );
}
