"use client";

import * as React from "react";
import {
  CheckCircle2,
  Edit3,
  FileText,
  Film,
  FolderGit2,
  Image as ImageIcon,
  Loader2,
  Search,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type {
  ClassroomGroup,
  StudentProjectItem,
} from "@/services/classroom-data";
import { PROJECT_CATEGORY_LABELS } from "@/services/cms-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatFileSize } from "@/lib/utils";

export function CmsProjectsTab({
  projects,
  classroomsList,
  onProjectsChange,
  createTrigger,
}: {
  projects: StudentProjectItem[];
  classroomsList: ClassroomGroup[];
  onProjectsChange: React.Dispatch<React.SetStateAction<StudentProjectItem[]>>;
  createTrigger: number;
}) {
  const { toast } = useToast();

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "pending_review" | "published" | "draft"
  >("all");
  const [categoryFilter, setCategoryFilter] = React.useState<
    "all" | StudentProjectItem["category"]
  >("all");
  const [classFilter, setClassFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  // Modal & Confirm
  const [projModalOpen, setProjModalOpen] = React.useState(false);
  const [editingProj, setEditingProj] =
    React.useState<StudentProjectItem | null>(null);
  const [deletingProj, setDeletingProj] =
    React.useState<StudentProjectItem | null>(null);

  // Form states
  const [projTitle, setProjTitle] = React.useState("");
  const [projAuthor, setProjAuthor] = React.useState("");
  const [projClassName, setProjClassName] = React.useState(
    classroomsList[0]?.name || "IELTS Intensive (Band 6.5–7.5+)",
  );
  const [projCategory, setProjCategory] =
    React.useState<StudentProjectItem["category"]>("Research Poster");
  const [projAccentTheme, setProjAccentTheme] =
    React.useState<StudentProjectItem["accentTheme"]>("navy");
  const [projSummary, setProjSummary] = React.useState("");
  const [projKeyTakeaway, setProjKeyTakeaway] = React.useState("");
  const [projFeaturedMetric, setProjFeaturedMetric] =
    React.useState("Điểm Đồ án: 9.2/10");
  const [projStatus, setProjStatus] =
    React.useState<StudentProjectItem["status"]>("published");
  const [projPosterUrl, setProjPosterUrl] = React.useState("");
  const [projDocUrl, setProjDocUrl] = React.useState("");
  const [projDocName, setProjDocName] = React.useState("");
  const [projDocSize, setProjDocSize] = React.useState("");
  const [projVideoUrl, setProjVideoUrl] = React.useState("");
  const [projTags, setProjTags] = React.useState("");

  // Upload state
  const [isUploadingPoster, setIsUploadingPoster] = React.useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = React.useState(false);
  const [showManualPosterUrl, setShowManualPosterUrl] = React.useState(false);
  const [showManualDocUrl, setShowManualDocUrl] = React.useState(false);
  const posterFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const docFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [prevCreateTrigger, setPrevCreateTrigger] =
    React.useState(createTrigger);
  if (createTrigger !== prevCreateTrigger) {
    setPrevCreateTrigger(createTrigger);
    if (createTrigger > 0) {
      setEditingProj(null);
      setProjTitle("");
      setProjAuthor("");
      setProjClassName(
        classroomsList[0]?.name || "IELTS Intensive (Band 6.5–7.5+)",
      );
      setProjCategory("Research Poster");
      setProjAccentTheme("navy");
      setProjSummary("");
      setProjKeyTakeaway(
        "Bố cục chặt chẽ, dẫn chứng số liệu thuyết phục và phong thái trình bày tự tin.",
      );
      setProjFeaturedMetric("Điểm Đồ án: 9.2/10");
      setProjStatus("published");
      setProjPosterUrl("");
      setProjDocUrl("");
      setProjDocName("");
      setProjDocSize("");
      setProjVideoUrl("");
      setProjTags("");
      setIsUploadingPoster(false);
      setIsUploadingDoc(false);
      setShowManualPosterUrl(false);
      setShowManualDocUrl(false);
      setProjModalOpen(true);
    }
  }

  const classOptions = React.useMemo(() => {
    const set = new Set<string>();
    classroomsList.forEach((c) => set.add(c.name));
    projects.forEach((p) => {
      if (p.className) set.add(p.className);
    });
    return Array.from(set);
  }, [classroomsList, projects]);

  const filteredProjects = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) {
        return false;
      }
      if (classFilter !== "all" && p.className !== classFilter) return false;
      if (
        q &&
        !p.title.toLowerCase().includes(q) &&
        !p.studentOrTeam.toLowerCase().includes(q) &&
        !p.summary.toLowerCase().includes(q) &&
        !p.tags?.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }, [projects, statusFilter, categoryFilter, classFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedProjects = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, currentPage, pageSize]);

  const openEditProject = (p: StudentProjectItem) => {
    setEditingProj(p);
    setProjTitle(p.title);
    setProjAuthor(p.studentOrTeam);
    setProjClassName(p.className);
    setProjCategory(p.category);
    setProjAccentTheme(p.accentTheme || "navy");
    setProjSummary(p.summary);
    setProjKeyTakeaway(p.keyTakeaway);
    setProjFeaturedMetric(p.featuredMetric);
    setProjStatus(p.status);
    setProjPosterUrl(p.posterUrl || "");
    setProjDocUrl(p.documentUrl || "");
    setProjDocName(p.documentName || "");
    setProjDocSize(p.documentSize || "");
    setProjVideoUrl(p.videoUrl || "");
    setProjTags(p.tags ? p.tags.join(", ") : "");
    setIsUploadingPoster(false);
    setIsUploadingDoc(false);
    setShowManualPosterUrl(Boolean(p.posterUrl));
    setShowManualDocUrl(Boolean(p.documentUrl));
    setProjModalOpen(true);
  };

  const handlePosterFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Định dạng không hợp lệ",
        description: "Vui lòng chọn tệp ảnh (.png, .jpg, .webp).",
        variant: "error",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Ảnh vượt quá dung lượng",
        description: "Giới hạn tải ảnh lên Cloudinary Free là 10 MB.",
        variant: "error",
      });
      return;
    }

    setIsUploadingPoster(true);
    try {
      const ticket = await apiRequest<{
        uploadUrl: string;
        method: "POST" | "PUT";
        formFields?: Record<string, string>;
        publicUrl: string | null;
      }>("/api/admin/storage/upload-url", {
        method: "POST",
        body: JSON.stringify({
          folder: "projects",
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          visibility: "public",
          imageCategory: "project",
        }),
      });

      if (ticket.method === "POST" && ticket.formFields && ticket.uploadUrl) {
        const form = new FormData();
        Object.entries(ticket.formFields).forEach(([k, v]) =>
          form.append(k, v),
        );
        form.append("file", file);
        await fetch(ticket.uploadUrl, { method: "POST", body: form }).catch(
          () => null,
        );
      }

      setProjPosterUrl(ticket.publicUrl || URL.createObjectURL(file));
      toast({
        title: "Tải ảnh poster thành công",
        description: `Poster "${file.name}" đã sẵn sàng hiển thị.`,
        variant: "success",
      });
    } catch {
      setProjPosterUrl(URL.createObjectURL(file));
      toast({
        title: "Đã chọn ảnh poster",
        description: `Đã áp dụng ảnh "${file.name}" cho dự án.`,
        variant: "info",
      });
    } finally {
      setIsUploadingPoster(false);
      if (posterFileInputRef.current) posterFileInputRef.current.value = "";
    }
  };

  const handleDocFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      toast({
        title: "Định dạng không hợp lệ",
        description: "Vui lòng chọn tệp tài liệu định dạng PDF (.pdf).",
        variant: "error",
      });
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: "Tài liệu vượt quá dung lượng",
        description: "Giới hạn tải PDF lên Supabase Storage Free là 25 MB.",
        variant: "error",
      });
      return;
    }

    setIsUploadingDoc(true);
    try {
      const ticket = await apiRequest<{
        uploadUrl: string;
        method: "POST" | "PUT";
        headers: Record<string, string>;
        publicUrl: string | null;
      }>("/api/admin/storage/upload-url", {
        method: "POST",
        body: JSON.stringify({
          folder: "documents",
          fileName: file.name,
          contentType: "application/pdf",
          size: file.size,
          visibility: "public",
        }),
      });

      if (ticket.uploadUrl) {
        await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: ticket.headers || { "Content-Type": "application/pdf" },
          body: file,
        }).catch(() => null);
      }

      const formattedSize = formatFileSize(file.size);
      setProjDocUrl(ticket.publicUrl || URL.createObjectURL(file));
      setProjDocName(file.name);
      setProjDocSize(formattedSize);

      toast({
        title: "Tải PDF thành công",
        description: `Tài liệu "${file.name}" (${formattedSize}) sẵn sàng tải về.`,
        variant: "success",
      });
    } catch {
      const formattedSize = formatFileSize(file.size);
      setProjDocUrl(URL.createObjectURL(file));
      setProjDocName(file.name);
      setProjDocSize(formattedSize);
      toast({
        title: "Đã chọn tài liệu PDF",
        description: `Đã đính kèm "${file.name}" (${formattedSize}).`,
        variant: "info",
      });
    } finally {
      setIsUploadingDoc(false);
      if (docFileInputRef.current) docFileInputRef.current.value = "";
    }
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projTitle.trim()) return;

    const tagsArray = projTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      title: projTitle.trim(),
      studentOrTeam: projAuthor.trim() || "Nhóm Học sinh Lớp IELTS",
      className: projClassName.trim() || "IELTS Intensive (Band 6.5–7.5+)",
      category: projCategory,
      accentTheme: projAccentTheme,
      summary: projSummary.trim(),
      keyTakeaway: projKeyTakeaway.trim(),
      featuredMetric: projFeaturedMetric.trim(),
      status: projStatus,
      posterUrl: projPosterUrl.trim() || null,
      documentUrl: projDocUrl.trim() || null,
      documentName: projDocName.trim() || null,
      documentSize: projDocSize.trim() || null,
      videoUrl: projVideoUrl.trim() || null,
      tags: tagsArray,
    };

    try {
      if (editingProj) {
        const updated = await apiRequest<StudentProjectItem>("/api/admin/cms", {
          method: "PATCH",
          body: JSON.stringify({
            module: "projects",
            id: editingProj.id,
            payload,
          }),
        });
        onProjectsChange((prev) =>
          prev.map((item) => (item.id === editingProj.id ? updated : item)),
        );
        toast({
          title: "Đã cập nhật dự án học sinh",
          description: updated.title,
          variant: "success",
        });
      } else {
        const created = await apiRequest<StudentProjectItem>("/api/admin/cms", {
          method: "POST",
          body: JSON.stringify({
            module: "projects",
            payload,
          }),
        });
        onProjectsChange((prev) => [created, ...prev]);
        toast({
          title: "Đã lưu Dự án học sinh",
          description: created.title,
          variant: created.status === "published" ? "success" : "info",
        });
      }
      setEditingProj(null);
      setProjModalOpen(false);
    } catch (err) {
      toast({
        title: "Không thể lưu dự án",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const handleApproveProject = async (p: StudentProjectItem) => {
    try {
      const updated = await apiRequest<StudentProjectItem>("/api/admin/cms", {
        method: "POST",
        body: JSON.stringify({
          module: "projects-approve",
          payload: { id: p.id },
        }),
      });
      onProjectsChange((prev) =>
        prev.map((item) => (item.id === p.id ? updated : item)),
      );
      toast({
        title: "Đã duyệt và xuất bản dự án lên Thư viện Showcase",
        description: p.title,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Duyệt dự án thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const handleToggleProjectPublish = async (p: StudentProjectItem) => {
    const nextStatus = p.status === "published" ? "draft" : "published";
    try {
      const updated = await apiRequest<StudentProjectItem>("/api/admin/cms", {
        method: "PATCH",
        body: JSON.stringify({
          module: "projects",
          id: p.id,
          payload: { status: nextStatus },
        }),
      });
      onProjectsChange((prev) =>
        prev.map((item) => (item.id === p.id ? updated : item)),
      );
      toast({
        title:
          nextStatus === "published"
            ? "Đã xuất bản dự án lên Cổng công khai"
            : "Đã chuyển dự án về Bản nháp",
        description: p.title,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Cập nhật trạng thái thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const confirmDeleteProject = async () => {
    if (!deletingProj) return;
    try {
      await apiRequest(
        `/api/admin/cms?module=projects&id=${encodeURIComponent(deletingProj.id)}`,
        { method: "DELETE" },
      );
      onProjectsChange((prev) =>
        prev.filter((item) => item.id !== deletingProj.id),
      );
      toast({
        title: "Đã gỡ dự án khỏi thư viện",
        description: deletingProj.title,
        variant: "info",
      });
      setDeletingProj(null);
    } catch (err) {
      toast({
        title: "Không thể xóa dự án",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
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
            placeholder="Tìm đề tài, tác giả, tag..."
            aria-label="Tìm kiếm dự án"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(
                e.target.value as
                  | "all"
                  | "pending_review"
                  | "published"
                  | "draft",
              );
              setPage(1);
            }}
            aria-label="Lọc trạng thái phê duyệt"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Mọi trạng thái</option>
            <option value="pending_review">Chờ giáo viên duyệt</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Bản nháp (Ẩn công khai)</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(
                e.target.value as "all" | StudentProjectItem["category"],
              );
              setPage(1);
            }}
            aria-label="Lọc thể loại dự án"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Mọi thể loại</option>
            {Object.entries(PROJECT_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo lớp học"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Mọi lớp học</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          title="Chưa có dự án học sinh phù hợp"
          description="Thử thay đổi bộ lọc trạng thái/thể loại hoặc đăng tải dự án mới."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {paginatedProjects.map((p) => (
            <div
              key={p.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5"
            >
              <div>
                {p.posterUrl && (
                  <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-xl bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.posterUrl}
                      alt={p.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-1">
                      {p.videoUrl && (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-xs backdrop-blur-xs">
                          <Film className="size-2.5" aria-hidden="true" /> Video
                        </span>
                      )}
                      {p.documentUrl && (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-xs backdrop-blur-xs">
                          <FileText className="size-2.5" aria-hidden="true" />{" "}
                          PDF
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-xs backdrop-blur-xs">
                        <ImageIcon className="size-2.5" aria-hidden="true" />{" "}
                        Poster HD
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">
                      {PROJECT_CATEGORY_LABELS[p.category] || p.category}
                    </Badge>
                    <Badge
                      variant={
                        p.status === "published"
                          ? "success"
                          : p.status === "pending_review"
                            ? "warning"
                            : "outline"
                      }
                    >
                      {p.status === "published"
                        ? "Đã xuất bản"
                        : p.status === "pending_review"
                          ? "Chờ duyệt"
                          : "Bản nháp"}
                    </Badge>
                  </div>
                  <Badge variant="warm">{p.featuredMetric}</Badge>
                </div>

                <h3 className="mt-2.5 font-heading text-base font-bold text-foreground">
                  {p.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-primary">
                  Tác giả: {p.studentOrTeam} · {p.className}
                </p>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {p.summary}
                </p>

                {p.tags && p.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {p.keyTakeaway && (
                  <p className="mt-2 rounded-lg bg-warm/30 p-2 text-xs text-foreground/90">
                    <strong className="text-primary">Nhận xét:</strong>{" "}
                    {p.keyTakeaway}
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
                <span className="text-muted-foreground">
                  Ngày đăng: {p.publishedAt}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.status === "pending_review" ? (
                    <Button size="xs" onClick={() => handleApproveProject(p)}>
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Duyệt & Đăng
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleToggleProjectPublish(p)}
                    >
                      <Send className="size-3.5" aria-hidden="true" />
                      {p.status === "published" ? "Chuyển nháp" : "Xuất bản"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => openEditProject(p)}
                  >
                    <Edit3 className="size-3.5" aria-hidden="true" />
                    Sửa
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setDeletingProj(p)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Xóa
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
        totalItems={filteredProjects.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(sz) => {
          setPageSize(sz);
          setPage(1);
        }}
        pageSizeOptions={[6, 12, 24]}
      />

      {/* MODAL: ADD / EDIT STUDENT PROJECT */}
      <ModalDialog
        open={projModalOpen}
        onClose={() => setProjModalOpen(false)}
        title={
          editingProj
            ? "Biên tập & Phê duyệt Dự án học sinh"
            : "Đăng tải Dự án học sinh mới"
        }
        description={
          editingProj
            ? "Cập nhật nội dung, lớp học, nhận xét chuyên môn, đa phương tiện và trạng thái xuất bản."
            : "Tuyển chọn sản phẩm học thuật tiêu biểu vào thư viện Showcase."
        }
        size="lg"
      >
        <form onSubmit={handleSaveProject} className="space-y-4">
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
                htmlFor="proj-class"
                className="block text-xs font-semibold text-foreground"
              >
                Lớp học thực hiện
              </label>
              <select
                id="proj-class"
                value={projClassName}
                onChange={(e) => setProjClassName(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {classOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="Research Poster">
                  Poster nghiên cứu (Research Poster)
                </option>
                <option value="Debate Portfolio">
                  Hồ sơ tranh biện (Debate Portfolio)
                </option>
                <option value="Video Presentation">
                  Video thuyết trình (Video Presentation)
                </option>
                <option value="Academic Essay">
                  Bài luận học thuật (Academic Essay)
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="proj-accent"
                className="block text-xs font-semibold text-foreground"
              >
                Chủ đề màu thẻ (Accent Theme)
              </label>
              <select
                id="proj-accent"
                value={projAccentTheme}
                onChange={(e) =>
                  setProjAccentTheme(
                    e.target.value as StudentProjectItem["accentTheme"],
                  )
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="navy">Navy (Primary)</option>
                <option value="blue">Blue Accent</option>
                <option value="coral">Coral Highlight</option>
                <option value="cream">Warm Cream</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="proj-metric"
                className="block text-xs font-semibold text-foreground"
              >
                Điểm số / Chỉ số nổi bật
              </label>
              <Input
                id="proj-metric"
                value={projFeaturedMetric}
                onChange={(e) => setProjFeaturedMetric(e.target.value)}
                placeholder="Ví dụ: Điểm Đồ án: 9.5/10"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="proj-status"
                className="block text-xs font-semibold text-foreground"
              >
                Trạng thái phê duyệt & đăng
              </label>
              <select
                id="proj-status"
                value={projStatus}
                onChange={(e) =>
                  setProjStatus(e.target.value as StudentProjectItem["status"])
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="published">Xuất bản công khai (Published)</option>
                <option value="pending_review">
                  Chờ giáo viên duyệt (Pending Review)
                </option>
                <option value="draft">Bản nháp nội bộ (Draft)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="proj-sum"
              className="block text-xs font-semibold text-foreground"
            >
              Tóm tắt dự án (Abstract)
            </label>
            <textarea
              id="proj-sum"
              rows={2}
              value={projSummary}
              onChange={(e) => setProjSummary(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="proj-takeaway"
              className="block text-xs font-semibold text-foreground"
            >
              Nhận xét chuyên môn của giáo viên
            </label>
            <textarea
              id="proj-takeaway"
              rows={2}
              value={projKeyTakeaway}
              onChange={(e) => setProjKeyTakeaway(e.target.value)}
              placeholder="Ghi nhận điểm mạnh, tư duy phản biện hoặc phong thái thuyết trình..."
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          {/* RICH MEDIA ATTACHMENTS */}
          <div className="space-y-4 rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <FolderGit2 className="size-4 text-primary" aria-hidden="true" />
                <span>
                  Đính kèm Đa phương tiện (Cloudinary + Supabase Free)
                </span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                Auto Cloud Sync
              </Badge>
            </div>

            <input
              type="file"
              ref={posterFileInputRef}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handlePosterFileChange}
            />
            <input
              type="file"
              ref={docFileInputRef}
              accept="application/pdf"
              className="hidden"
              onChange={handleDocFileChange}
            />

            {/* Poster uploader */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                <label className="flex items-center gap-1">
                  <ImageIcon
                    className="size-3 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span>Ảnh bìa Poster dự án (Cloudinary Free)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowManualPosterUrl((v) => !v)}
                  className="text-[10px] font-normal text-primary hover:underline"
                >
                  {showManualPosterUrl ? "Ẩn nhập link URL" : "Hoặc dán URL ảnh"}
                </button>
              </div>

              {projPosterUrl ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-2.5 shadow-2xs">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={projPosterUrl}
                      alt="Poster preview"
                      className="h-12 w-20 shrink-0 rounded-md border border-border object-cover"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-foreground">
                          Ảnh bìa Poster đã gán
                        </span>
                        <Badge
                          variant="success"
                          className="px-1.5 py-0 text-[9px]"
                        >
                          Cloudinary HD
                        </Badge>
                      </div>
                      <p className="mt-0.5 max-w-xs truncate text-[10px] text-muted-foreground">
                        {projPosterUrl}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={isUploadingPoster}
                      onClick={() => posterFileInputRef.current?.click()}
                    >
                      {isUploadingPoster ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Đổi ảnh khác"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setProjPosterUrl("")}
                      aria-label="Xóa ảnh poster"
                    >
                      <Trash2
                        className="size-3 text-destructive"
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() =>
                    !isUploadingPoster && posterFileInputRef.current?.click()
                  }
                  className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-background/60 p-3.5 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  {isUploadingPoster ? (
                    <div className="flex items-center gap-2 py-1 text-xs font-medium text-primary">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Đang tải ảnh lên Cloudinary Free...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
                        <UploadCloud className="size-4" aria-hidden="true" />
                      </div>
                      <p className="text-xs font-semibold text-foreground">
                        Tải ảnh Poster từ máy tính
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        PNG, JPG, WebP tối đa 10 MB
                      </p>
                    </>
                  )}
                </div>
              )}

              {showManualPosterUrl && (
                <div className="pt-1">
                  <Input
                    value={projPosterUrl}
                    onChange={(e) => setProjPosterUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/... hoặc Cloudinary URL"
                    className="text-xs"
                  />
                </div>
              )}
            </div>

            {/* PDF document uploader */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                <label className="flex items-center gap-1">
                  <FileText
                    className="size-3 text-blue-600"
                    aria-hidden="true"
                  />
                  <span>
                    Hồ sơ nghiên cứu / Slide PDF (Supabase Storage Free)
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowManualDocUrl((v) => !v)}
                  className="text-[10px] font-normal text-primary hover:underline"
                >
                  {showManualDocUrl
                    ? "Ẩn nhập link thủ công"
                    : "Hoặc nhập link URL thủ công"}
                </button>
              </div>

              {projDocUrl ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-50/40 p-2.5 shadow-2xs dark:bg-blue-950/20">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <FileText className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {projDocName || "Tài liệu dự án.pdf"}
                        </span>
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[9px]"
                        >
                          {projDocSize || "PDF"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 max-w-xs truncate text-[10px] text-muted-foreground">
                        {projDocUrl}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={isUploadingDoc}
                      onClick={() => docFileInputRef.current?.click()}
                    >
                      {isUploadingDoc ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Đổi tệp khác"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setProjDocUrl("");
                        setProjDocName("");
                        setProjDocSize("");
                      }}
                      aria-label="Xóa tệp PDF"
                    >
                      <Trash2
                        className="size-3 text-destructive"
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() =>
                    !isUploadingDoc && docFileInputRef.current?.click()
                  }
                  className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-background/60 p-3.5 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  {isUploadingDoc ? (
                    <div className="flex items-center gap-2 py-1 text-xs font-medium text-primary">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Đang tải tệp PDF lên Supabase Storage Free...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                        <UploadCloud className="size-4" aria-hidden="true" />
                      </div>
                      <p className="text-xs font-semibold text-foreground">
                        Tải tệp PDF từ máy tính
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Bài luận, slide thuyết trình (.pdf) tối đa 25 MB
                      </p>
                    </>
                  )}
                </div>
              )}

              {showManualDocUrl && (
                <div className="grid gap-2 pt-1 sm:grid-cols-3">
                  <Input
                    value={projDocUrl}
                    onChange={(e) => setProjDocUrl(e.target.value)}
                    placeholder="URL tệp PDF"
                    className="text-xs"
                  />
                  <Input
                    value={projDocName}
                    onChange={(e) => setProjDocName(e.target.value)}
                    placeholder="Tên tệp (vd: Final.pdf)"
                    className="text-xs"
                  />
                  <Input
                    value={projDocSize}
                    onChange={(e) => setProjDocSize(e.target.value)}
                    placeholder="Dung lượng (vd: 2.4 MB)"
                    className="text-xs"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label
                htmlFor="proj-video"
                className="block text-[11px] font-semibold text-foreground"
              >
                URL Video Thuyết trình (YouTube / Vimeo)
              </label>
              <Input
                id="proj-video"
                value={projVideoUrl}
                onChange={(e) => setProjVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... hoặc youtu.be/..."
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="proj-tags"
                className="block text-[11px] font-semibold text-foreground"
              >
                Chủ đề / Tags (phân cách bằng dấu phẩy)
              </label>
              <Input
                id="proj-tags"
                value={projTags}
                onChange={(e) => setProjTags(e.target.value)}
                placeholder="IELTS Writing, Urban Planning, AI Education"
                className="text-xs"
              />
            </div>
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
              {editingProj ? "Lưu thay đổi" : "Lưu Dự án"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      <ConfirmDialog
        open={Boolean(deletingProj)}
        onClose={() => setDeletingProj(null)}
        onConfirm={confirmDeleteProject}
        title="Xác nhận gỡ bỏ Dự án học sinh?"
        description={
          deletingProj
            ? `Dự án "${deletingProj.title}" sẽ bị xóa khỏi danh sách quản trị.`
            : ""
        }
        confirmLabel="Xóa dự án"
        variant="destructive"
      />
    </div>
  );
}
