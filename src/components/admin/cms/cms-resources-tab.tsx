"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileText,
  Folder,
  Loader2,
  Paperclip,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type {
  ClassroomGroup,
  ResourceFileItem,
  ResourceFolder,
} from "@/services/classroom-data";
import { FILE_TYPE_LABELS } from "@/services/cms-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatFileSize } from "@/lib/utils";

export function CmsResourcesTab({
  resources,
  foldersList,
  classroomsList,
  onResourcesChange,
  createTrigger,
}: {
  resources: ResourceFileItem[];
  foldersList: ResourceFolder[];
  classroomsList: ClassroomGroup[];
  onResourcesChange: React.Dispatch<React.SetStateAction<ResourceFileItem[]>>;
  createTrigger: number;
}) {
  const { toast } = useToast();

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = React.useState("");
  const [folderFilter, setFolderFilter] = React.useState("all");
  const [fileTypeFilter, setFileTypeFilter] = React.useState<
    "all" | ResourceFileItem["fileType"]
  >("all");
  const [visibilityFilter, setVisibilityFilter] = React.useState<
    "all" | "public" | "private"
  >("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  // Modal & Confirm state
  const [editingResId, setEditingResId] = React.useState<string | null>(null);
  const [resModalOpen, setResModalOpen] = React.useState(false);
  const [deletingResource, setDeletingResource] =
    React.useState<ResourceFileItem | null>(null);

  // Form states
  const [resTitle, setResTitle] = React.useState("");
  const [resFolderId, setResFolderId] = React.useState(
    foldersList[0]?.id || "fld-writing",
  );
  const [resFileType, setResFileType] =
    React.useState<ResourceFileItem["fileType"]>("PDF");
  const [resVisibility, setResVisibility] =
    React.useState<"public" | "private">("public");
  const [resDescription, setResDescription] = React.useState("");
  const [resLevel, setResLevel] = React.useState("IELTS 6.5+");
  const [resPagesOrDuration, setResPagesOrDuration] =
    React.useState("18 trang");
  const [resSize, setResSize] = React.useState("2.4 MB");
  const [resSizeBytes, setResSizeBytes] = React.useState(2516582);
  const [resFileUrl, setResFileUrl] = React.useState("");
  const [resFileName, setResFileName] = React.useState("");
  const [resAttachmentSource, setResAttachmentSource] = React.useState<
    "curriculum" | "upload" | "manual"
  >("upload");
  const [selectedCurriculumMatId, setSelectedCurriculumMatId] =
    React.useState("");
  const [isUploadingResFile, setIsUploadingResFile] = React.useState(false);
  const resFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [prevCreateTrigger, setPrevCreateTrigger] =
    React.useState(createTrigger);
  if (createTrigger !== prevCreateTrigger) {
    setPrevCreateTrigger(createTrigger);
    if (createTrigger > 0) {
      setEditingResId(null);
      setResTitle("");
      setResFolderId(foldersList[0]?.id || "fld-writing");
      setResFileType("PDF");
      setResVisibility("public");
      setResDescription("");
      setResLevel("IELTS 6.5+");
      setResPagesOrDuration("18 trang");
      setResSize("2.4 MB");
      setResSizeBytes(2516582);
      setResFileUrl("");
      setResFileName("");
      setResAttachmentSource("upload");
      setSelectedCurriculumMatId("");
      setResModalOpen(true);
    }
  }

  const availableClassroomMaterials = React.useMemo(() => {
    const list: {
      id: string;
      name: string;
      url: string;
      size: string;
      type: ResourceFileItem["fileType"];
      className: string;
    }[] = [];
    const seen = new Set<string>();

    classroomsList.forEach((cls) => {
      cls.curriculum?.forEach((w) => {
        w.attachments?.forEach((att) => {
          if (!seen.has(att.name)) {
            seen.add(att.name);
            list.push({
              id: att.id,
              name: att.name,
              url: att.url,
              size: att.size,
              type: (att.type === "DOCX"
                ? "WORKSHEET"
                : att.type) as ResourceFileItem["fileType"],
              className: cls.name,
            });
          }
        });
      });
    });
    return list;
  }, [classroomsList]);

  const filteredResources = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return resources.filter((file) => {
      if (folderFilter !== "all" && file.folderId !== folderFilter) {
        return false;
      }
      if (fileTypeFilter !== "all" && file.fileType !== fileTypeFilter) {
        return false;
      }
      if (visibilityFilter !== "all" && file.visibility !== visibilityFilter) {
        return false;
      }
      if (
        q &&
        !file.title.toLowerCase().includes(q) &&
        !file.description.toLowerCase().includes(q) &&
        !file.folderName.toLowerCase().includes(q) &&
        !file.level.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [resources, folderFilter, fileTypeFilter, visibilityFilter, searchQuery]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredResources.length / pageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedResources = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredResources.slice(start, start + pageSize);
  }, [filteredResources, currentPage, pageSize]);

  const handleResFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "Tài liệu vượt quá dung lượng",
        description: "Giới hạn tải tệp lên Storage là 50 MB.",
        variant: "error",
      });
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    let detectedType: ResourceFileItem["fileType"] = "PDF";
    if (ext === "ppt" || ext === "pptx") detectedType = "SLIDE";
    else if (ext === "mp3" || ext === "wav" || ext === "m4a")
      detectedType = "AUDIO";
    else if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp")
      detectedType = "IMAGE";
    else if (ext === "doc" || ext === "docx") detectedType = "WORKSHEET";

    setResFileType(detectedType);
    setResFileName(file.name);
    if (!resTitle.trim()) {
      setResTitle(file.name.replace(/\.[^/.]+$/, ""));
    }

    const formattedSize = formatFileSize(file.size);
    setResSize(formattedSize);
    setResSizeBytes(file.size);

    setIsUploadingResFile(true);
    try {
      const ticket = await apiRequest<{
        uploadUrl: string;
        method: "POST" | "PUT";
        headers?: Record<string, string>;
        publicUrl: string | null;
      }>("/api/admin/storage/upload-url", {
        method: "POST",
        body: JSON.stringify({
          folder: detectedType === "AUDIO" ? "podcasts" : "documents",
          fileName: file.name,
          contentType:
            file.type ||
            (detectedType === "AUDIO" ? "audio/mpeg" : "application/pdf"),
          size: file.size,
          visibility: resVisibility,
        }),
      });

      if (ticket.uploadUrl) {
        await fetch(ticket.uploadUrl, {
          method: ticket.method || "PUT",
          headers: ticket.headers || {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        }).catch(() => null);
      }

      setResFileUrl(ticket.publicUrl || URL.createObjectURL(file));
      toast({
        title: "Tải tệp học liệu thành công",
        description: `Tệp "${file.name}" (${formattedSize}) sẵn sàng công bố.`,
        variant: "success",
      });
    } catch {
      setResFileUrl(URL.createObjectURL(file));
      toast({
        title: "Đã chọn tệp đính kèm",
        description: `Tệp "${file.name}" (${formattedSize}) sẵn sàng xuất bản.`,
        variant: "info",
      });
    } finally {
      setIsUploadingResFile(false);
      if (resFileInputRef.current) resFileInputRef.current.value = "";
    }
  };

  const handleSelectCurriculumMaterial = (matId: string) => {
    setSelectedCurriculumMatId(matId);
    const mat = availableClassroomMaterials.find((m) => m.id === matId);
    if (!mat) return;
    setResFileName(mat.name);
    setResFileUrl(mat.url);
    setResSize(mat.size);
    if (mat.type) setResFileType(mat.type);
    if (!resTitle.trim()) {
      setResTitle(mat.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
    }
    toast({
      title: "Đã liên kết tệp từ Lớp học",
      description: `${mat.name} (${mat.size}) từ lớp ${mat.className}`,
      variant: "info",
    });
  };

  const openEditResource = (file: ResourceFileItem) => {
    setEditingResId(file.id);
    setResTitle(file.title);
    setResFolderId(file.folderId);
    setResFileType(file.fileType);
    setResVisibility(file.visibility);
    setResDescription(file.description);
    setResLevel(file.level);
    setResPagesOrDuration(file.pagesOrDuration);
    setResSize(file.size);
    setResSizeBytes(file.sizeBytes || 2516582);
    setResFileUrl(file.publicUrl || "");
    setResFileName(file.originalName || file.title);
    const matchedMat = availableClassroomMaterials.find(
      (m) => m.url === file.publicUrl || m.name === file.originalName,
    );
    if (matchedMat) {
      setSelectedCurriculumMatId(matchedMat.id);
      setResAttachmentSource("curriculum");
    } else {
      setSelectedCurriculumMatId("");
      setResAttachmentSource("upload");
    }
    setResModalOpen(true);
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resTitle.trim()) return;

    const payload = {
      title: resTitle.trim(),
      folderId: resFolderId,
      fileType: resFileType,
      visibility: resVisibility,
      description: resDescription.trim() || undefined,
      level: resLevel.trim() || "IELTS 6.5+",
      pagesOrDuration: resPagesOrDuration.trim() || "18 trang",
      size: resSize.trim() || "2.4 MB",
      sizeBytes: resSizeBytes,
      publicUrl: resFileUrl.trim() || undefined,
      originalName: resFileName.trim() || resTitle.trim(),
    };

    try {
      if (editingResId) {
        const updated = await apiRequest<ResourceFileItem>("/api/admin/cms", {
          method: "PATCH",
          body: JSON.stringify({
            module: "resources",
            id: editingResId,
            payload,
          }),
        });
        onResourcesChange((prev) =>
          prev.map((r) => (r.id === editingResId ? updated : r)),
        );
        toast({
          title: "Đã cập nhật học liệu số",
          description: updated.title,
          variant: "success",
        });
      } else {
        const created = await apiRequest<ResourceFileItem>("/api/admin/cms", {
          method: "POST",
          body: JSON.stringify({
            module: "resources",
            payload,
          }),
        });
        onResourcesChange((prev) => [created, ...prev]);
        toast({
          title: "Đã đăng tải học liệu mới",
          description: `${created.title} (${created.size})`,
          variant: "success",
        });
      }
      setEditingResId(null);
      setResModalOpen(false);
    } catch (err) {
      toast({
        title: "Không thể lưu học liệu",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const handleToggleResVisibility = async (file: ResourceFileItem) => {
    const nextVis = file.visibility === "public" ? "private" : "public";
    try {
      const updated = await apiRequest<ResourceFileItem>("/api/admin/cms", {
        method: "POST",
        body: JSON.stringify({
          module: "resources-toggle-visibility",
          payload: { id: file.id },
        }),
      });
      onResourcesChange((prev) =>
        prev.map((r) => (r.id === file.id ? updated : r)),
      );
      toast({
        title:
          nextVis === "public"
            ? "Đã chuyển sang Công khai (/documents)"
            : "Đã chuyển sang Nội bộ (Ẩn khỏi Cổng công khai)",
        description: file.title,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể đổi quyền truy cập",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const confirmDeleteResource = async () => {
    if (!deletingResource) return;
    try {
      await apiRequest(
        `/api/admin/cms?module=resources&id=${encodeURIComponent(deletingResource.id)}`,
        { method: "DELETE" },
      );
      onResourcesChange((prev) =>
        prev.filter((r) => r.id !== deletingResource.id),
      );
      toast({
        title: "Đã gỡ bỏ học liệu",
        description: `Học liệu "${deletingResource.title}" đã được gỡ bỏ.`,
        variant: "info",
      });
      setDeletingResource(null);
    } catch (err) {
      toast({
        title: "Không thể gỡ học liệu",
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
            placeholder="Tìm tên tài liệu, mô tả, trình độ..."
            aria-label="Tìm kiếm học liệu"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={folderFilter}
            onChange={(e) => {
              setFolderFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo thư mục"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Mọi thư mục ({foldersList.length})</option>
            {foldersList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <select
            value={fileTypeFilter}
            onChange={(e) => {
              setFileTypeFilter(
                e.target.value as "all" | ResourceFileItem["fileType"],
              );
              setPage(1);
            }}
            aria-label="Lọc theo định dạng tệp"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Mọi định dạng</option>
            {Object.entries(FILE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={visibilityFilter}
            onChange={(e) => {
              setVisibilityFilter(
                e.target.value as "all" | "public" | "private",
              );
              setPage(1);
            }}
            aria-label="Lọc theo quyền xem"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Mọi quyền xem</option>
            <option value="public">Công khai (/documents)</option>
            <option value="private">Nội bộ (Private)</option>
          </select>
        </div>
      </div>

      {/* Resources List */}
      {filteredResources.length === 0 ? (
        <EmptyState
          title="Chưa có học liệu phù hợp bộ lọc"
          description="Thử chọn thư mục/định dạng khác hoặc đăng tải học liệu mới."
        />
      ) : (
        <div className="space-y-3">
          {paginatedResources.map((file) => (
            <div
              key={file.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs md:flex-row md:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleResVisibility(file)}
                    title="Nhấn để đổi quyền xem Công khai / Nội bộ"
                    className="cursor-pointer"
                  >
                    <Badge
                      variant={
                        file.visibility === "public" ? "success" : "outline"
                      }
                    >
                      {file.visibility === "public" ? "Công khai" : "Nội bộ"}
                    </Badge>
                  </button>
                  <Badge variant="secondary">
                    {FILE_TYPE_LABELS[file.fileType] || file.fileType}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Folder
                      className="size-3 text-muted-foreground/80"
                      aria-hidden="true"
                    />
                    {file.folderName}
                  </span>
                  {file.level && (
                    <Badge variant="outline" className="text-[11px]">
                      {file.level}
                    </Badge>
                  )}
                </div>

                <h3 className="mt-2 font-heading text-sm font-bold text-foreground">
                  {file.title}
                </h3>
                {file.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {file.description}
                  </p>
                )}

                {file.publicUrl && (
                  <div className="mt-2.5 inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/60 px-2.5 py-1 text-xs text-foreground/85">
                    <Paperclip
                      className="size-3 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="max-w-[280px] truncate">
                      {file.originalName || file.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      ({file.size})
                    </span>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-3 md:flex-col md:items-end md:justify-center md:border-t-0 md:pt-0">
                <span className="font-mono text-xs text-muted-foreground">
                  {file.size} · {file.downloads} lượt tải · {file.pagesOrDuration}
                </span>

                <div className="flex items-center gap-1.5">
                  {file.publicUrl && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        window.open(
                          file.publicUrl!,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      <Download
                        className="size-3.5 text-primary"
                        aria-hidden="true"
                      />
                      Tải về
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleToggleResVisibility(file)}
                  >
                    <ArrowLeftRight className="size-3" aria-hidden="true" />
                    {file.visibility === "public" ? "Nội bộ" : "Công khai"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => openEditResource(file)}
                  >
                    <Edit3
                      className="size-3.5 text-foreground/70"
                      aria-hidden="true"
                    />
                    Sửa
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setDeletingResource(file)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Gỡ bỏ
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
        totalItems={filteredResources.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(sz) => {
          setPageSize(sz);
          setPage(1);
        }}
        pageSizeOptions={[6, 12, 24]}
      />

      {/* MODAL: ADD / EDIT RESOURCE FILE */}
      <ModalDialog
        open={resModalOpen}
        onClose={() => setResModalOpen(false)}
        title={
          editingResId ? "Chỉnh sửa Học liệu số" : "Đăng tải Học liệu số mới"
        }
        description="Công bố tài liệu học thuật (PDF, Slide bài giảng, Phiếu bài tập, Audio) lên Cổng học sinh."
        size="lg"
      >
        <form onSubmit={handleSaveResource} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="res-title"
              className="block text-xs font-semibold text-foreground"
            >
              Tiêu đề học liệu
            </label>
            <Input
              id="res-title"
              value={resTitle}
              onChange={(e) => setResTitle(e.target.value)}
              placeholder="Ví dụ: Sổ tay 120 Academic Collocations & Hedging Structures"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="res-folder"
                className="block text-xs font-semibold text-foreground"
              >
                Thư mục học thuật
              </label>
              <select
                id="res-folder"
                value={resFolderId}
                onChange={(e) => setResFolderId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground"
              >
                {foldersList.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="res-type"
                className="block text-xs font-semibold text-foreground"
              >
                Loại tệp học liệu
              </label>
              <select
                id="res-type"
                value={resFileType}
                onChange={(e) =>
                  setResFileType(e.target.value as ResourceFileItem["fileType"])
                }
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground"
              >
                <option value="PDF">Tài liệu PDF (.pdf)</option>
                <option value="SLIDE">Slide bài giảng (.pptx, .pdf)</option>
                <option value="WORKSHEET">Phiếu bài tập (.docx, .pdf)</option>
                <option value="AUDIO">Băng nghe Audio (.mp3, .wav)</option>
                <option value="IMAGE">Hình ảnh / Infographic</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="res-vis"
                className="block text-xs font-semibold text-foreground"
              >
                Quyền truy cập
              </label>
              <select
                id="res-vis"
                value={resVisibility}
                onChange={(e) =>
                  setResVisibility(e.target.value as "public" | "private")
                }
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground"
              >
                <option value="public">Công khai trên Cổng (/documents)</option>
                <option value="private">Nội bộ lớp học (Private)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="res-level"
                className="block text-xs font-semibold text-foreground"
              >
                Trình độ mục tiêu
              </label>
              <Input
                id="res-level"
                value={resLevel}
                onChange={(e) => setResLevel(e.target.value)}
                placeholder="Ví dụ: IELTS 6.5+"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="res-pages"
                className="block text-xs font-semibold text-foreground"
              >
                Số trang / Thời lượng
              </label>
              <Input
                id="res-pages"
                value={resPagesOrDuration}
                onChange={(e) => setResPagesOrDuration(e.target.value)}
                placeholder="Ví dụ: 18 trang, 45 phút"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="res-desc"
              className="block text-xs font-semibold text-foreground"
            >
              Mô tả tóm tắt & Hướng dẫn học sinh
            </label>
            <textarea
              id="res-desc"
              rows={2}
              value={resDescription}
              onChange={(e) => setResDescription(e.target.value)}
              placeholder="Tóm tắt nội dung tài liệu, cách áp dụng vào bài thi hoặc hướng dẫn luyện tập..."
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          {/* FILE ATTACHMENT SECTION */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                <Paperclip className="size-3.5 text-primary" aria-hidden="true" />
                Nguồn tệp học liệu đính kèm
              </span>
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setResAttachmentSource("curriculum")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    resAttachmentSource === "curriculum"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Lấy từ Lớp học ({availableClassroomMaterials.length})
                </button>
                <button
                  type="button"
                  onClick={() => setResAttachmentSource("upload")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    resAttachmentSource === "upload"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Tải tệp từ máy
                </button>
                <button
                  type="button"
                  onClick={() => setResAttachmentSource("manual")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    resAttachmentSource === "manual"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Nhập URL
                </button>
              </div>
            </div>

            {resAttachmentSource === "curriculum" && (
              <div className="space-y-2">
                <label
                  htmlFor="curriculum-mat-select"
                  className="block text-xs font-semibold text-foreground"
                >
                  Chọn tài liệu đã phân bổ trong Khung chương trình Lớp học
                </label>
                <select
                  id="curriculum-mat-select"
                  value={selectedCurriculumMatId}
                  onChange={(e) =>
                    handleSelectCurriculumMaterial(e.target.value)
                  }
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground"
                >
                  <option value="">
                    -- Chọn tài liệu từ các lớp đang giảng dạy --
                  </option>
                  {availableClassroomMaterials.map((mat) => (
                    <option key={mat.id} value={mat.id}>
                      {mat.name} ({mat.size} · {mat.type}) — Lớp: {mat.className}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {resAttachmentSource === "upload" && (
              <>
                <input
                  ref={resFileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.mp3,.wav,.m4a,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={handleResFileChange}
                />
                {!resFileUrl && (
                  <div
                    onClick={() => resFileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/80 bg-background/50 p-4 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    {isUploadingResFile ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                        <span>Đang tải tệp lên Supabase Storage Free...</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <UploadCloud className="size-4" aria-hidden="true" />
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          Chọn tệp tài liệu riêng từ máy tính
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Hỗ trợ PDF, Slide PPTX, Word DOCX, Audio MP3 (Tối đa 50 MB)
                        </p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {resAttachmentSource === "manual" && (
              <div className="grid gap-2 pt-1 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                    Đường dẫn tệp (URL)
                  </label>
                  <Input
                    value={resFileUrl}
                    onChange={(e) => setResFileUrl(e.target.value)}
                    placeholder="https://drive.google.com/... hoặc link direct"
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                    Dung lượng tệp
                  </label>
                  <Input
                    value={resSize}
                    onChange={(e) => setResSize(e.target.value)}
                    placeholder="Ví dụ: 3.2 MB"
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {resFileUrl && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-2.5 dark:bg-emerald-950/20">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <FileText className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">
                      {resFileName || "Tệp học liệu"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {resSize} · {FILE_TYPE_LABELS[resFileType]} · Sẵn sàng đính kèm
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      window.open(resFileUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    <Eye className="size-3.5" aria-hidden="true" />
                    Xem
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      if (resAttachmentSource === "upload") {
                        resFileInputRef.current?.click();
                      } else {
                        setResFileUrl("");
                        setResFileName("");
                      }
                    }}
                  >
                    Đổi tệp
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {editingResId ? "Lưu thay đổi" : "Đăng tải Học liệu"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      <ConfirmDialog
        open={Boolean(deletingResource)}
        onClose={() => setDeletingResource(null)}
        onConfirm={confirmDeleteResource}
        title="Xác nhận gỡ bỏ học liệu?"
        description={
          deletingResource
            ? `Học liệu "${deletingResource.title}" sẽ bị gỡ khỏi Kho tài liệu.`
            : ""
        }
        confirmLabel="Gỡ học liệu"
        variant="destructive"
      />
    </div>
  );
}
