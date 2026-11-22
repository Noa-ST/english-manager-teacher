"use client";

import * as React from "react";
import {
  Bold,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit3,
  Eye,
  FileText,
  Heading2,
  Italic,
  Link2,
  List,
  Loader2,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  Quote,
  Search,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type {
  AnnouncementAttachment,
  AnnouncementItem,
  ClassroomGroup,
} from "@/services/classroom-data";
import { ANNOUNCEMENT_CATEGORY_LABELS } from "@/services/cms-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatFileSize } from "@/lib/utils";

export function CmsAnnouncementsTab({
  announcements,
  classroomsList,
  onAnnouncementsChange,
  createTrigger,
}: {
  announcements: AnnouncementItem[];
  classroomsList: ClassroomGroup[];
  onAnnouncementsChange: React.Dispatch<React.SetStateAction<AnnouncementItem[]>>;
  createTrigger: number;
}) {
  const { toast } = useToast();

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<
    "all" | AnnouncementItem["category"]
  >("all");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "published" | "draft"
  >("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  // Modal states
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

  // Editor form state
  const [annTitle, setAnnTitle] = React.useState("");
  const [annCategory, setAnnCategory] =
    React.useState<AnnouncementItem["category"]>("urgent");
  const [annIsPinned, setAnnIsPinned] = React.useState(true);
  const [annTargetClasses, setAnnTargetClasses] = React.useState<string[]>([
    "Tất cả các lớp",
  ]);
  const [classDropdownOpen, setClassDropdownOpen] = React.useState(false);
  const [classSearchText, setClassSearchText] = React.useState("");
  const classDropdownRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!classDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        classDropdownRef.current &&
        !classDropdownRef.current.contains(event.target as Node)
      ) {
        setClassDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [classDropdownOpen]);
  const [annContentText, setAnnContentText] = React.useState("");
  const [annAttachments, setAnnAttachments] = React.useState<
    AnnouncementAttachment[]
  >([]);

  // Attachment helper state
  const [attMode, setAttMode] = React.useState<
    "upload" | "curriculum" | "manual"
  >("upload");
  const [isUploadingAtt, setIsUploadingAtt] = React.useState(false);
  const [manualAttName, setManualAttName] = React.useState("");
  const [manualAttUrl, setManualAttUrl] = React.useState("");
  const [manualAttSize, setManualAttSize] = React.useState("1.0 MB");
  const [manualAttType, setManualAttType] =
    React.useState<AnnouncementAttachment["type"]>("PDF");
  const attFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const openCreateAnnouncement = () => {
    setEditingAnn(null);
    setAnnTitle("");
    setAnnCategory("urgent");
    setAnnIsPinned(true);
    setAnnTargetClasses(["Tất cả các lớp"]);
    setAnnContentText(
      "Kính gửi Quý Phụ huynh và các em học sinh,\n\nNội dung thông báo chi tiết...",
    );
    setAnnAttachments([]);
    setAttMode("upload");
    setManualAttName("");
    setManualAttUrl("");
    setAnnModalOpen(true);
  };

  const [prevCreateTrigger, setPrevCreateTrigger] =
    React.useState(createTrigger);
  if (createTrigger !== prevCreateTrigger) {
    setPrevCreateTrigger(createTrigger);
    if (createTrigger > 0) {
      setEditingAnn(null);
      setAnnTitle("");
      setAnnCategory("urgent");
      setAnnIsPinned(true);
      setAnnTargetClasses(["Tất cả các lớp"]);
      setAnnContentText(
        "Kính gửi Quý Phụ huynh và các em học sinh,\n\nNội dung thông báo chi tiết...",
      );
      setAnnAttachments([]);
      setAttMode("upload");
      setManualAttName("");
      setManualAttUrl("");
      setAnnModalOpen(true);
    }
  }

  const openEditAnnouncement = (item: AnnouncementItem) => {
    setEditingAnn(item);
    setAnnTitle(item.title);
    setAnnCategory(item.category);
    setAnnIsPinned(Boolean(item.isPinned));
    setAnnTargetClasses(
      item.targetClasses.length > 0
        ? item.targetClasses
        : ["Tất cả các lớp"],
    );
    setAnnContentText(item.content.join("\n\n"));
    setAnnAttachments(item.attachments ?? []);
    setAttMode("upload");
    setManualAttName("");
    setManualAttUrl("");
    setAnnModalOpen(true);
  };

  const availableCurriculumMaterials = React.useMemo(() => {
    const list: {
      id: string;
      name: string;
      url: string;
      size: string;
      type: AnnouncementAttachment["type"];
      className: string;
    }[] = [];
    const seen = new Set<string>();
    classroomsList.forEach((cls) => {
      cls.curriculum?.forEach((w) => {
        w.attachments?.forEach((att) => {
          if (seen.has(att.id)) return;
          seen.add(att.id);
          const mappedType: AnnouncementAttachment["type"] =
            att.type === "SLIDE"
              ? "SLIDE"
              : att.type === "DOCX" || att.type === "WORKSHEET"
                ? "DOCX"
                : "PDF";
          list.push({
            id: att.id,
            name: att.name,
            url: att.url,
            size: att.size,
            type: mappedType,
            className: cls.name,
          });
        });
      });
    });
    return list;
  }, [classroomsList]);

  const filteredAnnouncements = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return announcements.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.excerpt.toLowerCase().includes(q) &&
        !item.targetClasses.some((c) => c.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }, [announcements, categoryFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAnnouncements.length / pageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedAnnouncements = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAnnouncements.slice(start, start + pageSize);
  }, [filteredAnnouncements, currentPage, pageSize]);

  const insertRichFormat = (snippet: string) => {
    setAnnContentText((prev) => `${prev}\n${snippet}`);
  };

  const toggleTargetClass = (label: string) => {
    if (label === "Tất cả các lớp") {
      setAnnTargetClasses(["Tất cả các lớp"]);
      return;
    }
    setAnnTargetClasses((prev) => {
      const withoutAll = prev.filter((c) => c !== "Tất cả các lớp");
      const exists = withoutAll.includes(label);
      const next = exists
        ? withoutAll.filter((c) => c !== label)
        : [...withoutAll, label];
      return next.length > 0 ? next : ["Tất cả các lớp"];
    });
  };

  const handleAttachmentFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: "Tệp vượt quá dung lượng",
        description: "Giới hạn tệp đính kèm thông báo là 25 MB.",
        variant: "error",
      });
      return;
    }

    setIsUploadingAtt(true);
    const formattedSize = formatFileSize(file.size);
    try {
      const ticket = await apiRequest<{
        uploadUrl: string;
        method: "POST" | "PUT";
        headers?: Record<string, string>;
        publicUrl: string | null;
        storagePath: string;
      }>("/api/admin/storage/upload-url", {
        method: "POST",
        body: JSON.stringify({
          folder: "documents",
          fileName: file.name,
          contentType: file.type || "application/pdf",
          size: file.size,
          visibility: "public",
        }),
      });

      if (ticket.uploadUrl) {
        await fetch(ticket.uploadUrl, {
          method: ticket.method || "PUT",
          headers: ticket.headers || {
            "Content-Type": file.type || "application/pdf",
          },
          body: file,
        }).catch(() => null);
      }

      const ext = file.name.split(".").pop()?.toLowerCase();
      const attType: AnnouncementAttachment["type"] =
        ext === "ppt" || ext === "pptx"
          ? "SLIDE"
          : ext === "doc" || ext === "docx"
            ? "DOCX"
            : "PDF";

      setAnnAttachments((prev) => [
        ...prev,
        {
          id: `att-${Date.now()}`,
          name: file.name,
          size: formattedSize,
          type: attType,
          downloadCount: 0,
          url: ticket.publicUrl || URL.createObjectURL(file),
          objectKey: ticket.storagePath || null,
        },
      ]);

      toast({
        title: "Đã đính kèm tài liệu vào thông báo",
        description: `${file.name} (${formattedSize})`,
        variant: "success",
      });
    } catch {
      setAnnAttachments((prev) => [
        ...prev,
        {
          id: `att-${Date.now()}`,
          name: file.name,
          size: formattedSize,
          type: "PDF",
          downloadCount: 0,
          url: URL.createObjectURL(file),
        },
      ]);
      toast({
        title: "Đã chọn tệp đính kèm cục bộ",
        description: `${file.name} (${formattedSize})`,
        variant: "info",
      });
    } finally {
      setIsUploadingAtt(false);
      if (attFileInputRef.current) attFileInputRef.current.value = "";
    }
  };

  const handleAddCurriculumAttachment = (matId: string) => {
    const mat = availableCurriculumMaterials.find((m) => m.id === matId);
    if (!mat) return;
    if (annAttachments.some((a) => a.name === mat.name)) {
      toast({
        title: "Tệp đã có trong danh sách đính kèm",
        variant: "info",
      });
      return;
    }
    setAnnAttachments((prev) => [
      ...prev,
      {
        id: `att-${Date.now()}`,
        name: mat.name,
        size: mat.size,
        type: mat.type,
        downloadCount: 0,
        url: mat.url,
      },
    ]);
  };

  const handleAddManualAttachment = () => {
    if (!manualAttName.trim()) {
      toast({
        title: "Vui lòng nhập tên tệp đính kèm",
        variant: "warning",
      });
      return;
    }
    setAnnAttachments((prev) => [
      ...prev,
      {
        id: `att-${Date.now()}`,
        name: manualAttName.trim(),
        size: manualAttSize.trim() || "1.0 MB",
        type: manualAttType,
        downloadCount: 0,
        url: manualAttUrl.trim() || null,
      },
    ]);
    setManualAttName("");
    setManualAttUrl("");
  };

  const handleSaveAnnouncement = async (
    statusOverride: "published" | "draft",
  ) => {
    if (!annTitle.trim()) {
      toast({
        title: "Tiêu đề thông báo không được để trống",
        variant: "warning",
      });
      return;
    }
    const paragraphs = annContentText
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const payload = {
      title: annTitle.trim(),
      excerpt: paragraphs[0] ?? annTitle.trim(),
      content: paragraphs,
      category: annCategory,
      isPinned: annIsPinned,
      targetClasses: annTargetClasses,
      attachments: annAttachments,
      status: statusOverride,
    };

    try {
      if (editingAnn) {
        const updated = await apiRequest<AnnouncementItem>("/api/admin/cms", {
          method: "PATCH",
          body: JSON.stringify({
            module: "announcements",
            id: editingAnn.id,
            payload,
          }),
        });
        onAnnouncementsChange((prev) =>
          prev.map((a) => (a.id === editingAnn.id ? updated : a)),
        );
      } else {
        const created = await apiRequest<AnnouncementItem>("/api/admin/cms", {
          method: "POST",
          body: JSON.stringify({
            module: "announcements",
            payload,
          }),
        });
        onAnnouncementsChange((prev) => [created, ...prev]);
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
    } catch (err) {
      toast({
        title: "Không thể lưu thông báo",
        description:
          err instanceof Error ? err.message : "Vui lòng kiểm tra lại dữ liệu.",
        variant: "error",
      });
    }
  };

  const handleQuickPatch = async (
    item: AnnouncementItem,
    patch: Partial<Pick<AnnouncementItem, "isPinned" | "status">>,
    successTitle: string,
  ) => {
    try {
      const updated = await apiRequest<AnnouncementItem>("/api/admin/cms", {
        method: "PATCH",
        body: JSON.stringify({
          module: "announcements",
          id: item.id,
          payload: patch,
        }),
      });
      onAnnouncementsChange((prev) =>
        prev.map((a) => (a.id === item.id ? updated : a)),
      );
      toast({
        title: successTitle,
        description: item.title,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Cập nhật thất bại",
        description:
          err instanceof Error ? err.message : "Không thể đồng bộ thay đổi.",
        variant: "error",
      });
    }
  };

  const handleDeleteAnnouncement = async () => {
    if (!deletingAnn) return;
    try {
      await apiRequest(
        `/api/admin/cms?module=announcements&id=${encodeURIComponent(deletingAnn.id)}`,
        { method: "DELETE" },
      );
      onAnnouncementsChange((prev) =>
        prev.filter((a) => a.id !== deletingAnn.id),
      );
      toast({
        title: "Đã xóa bản tin thông báo",
        description: deletingAnn.title,
        variant: "info",
      });
      setDeletingAnn(null);
    } catch (err) {
      toast({
        title: "Không thể xóa bản tin",
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
            placeholder="Tìm tiêu đề, nội dung, lớp..."
            aria-label="Tìm kiếm thông báo"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(
                e.target.value as "all" | AnnouncementItem["category"],
              );
              setPage(1);
            }}
            aria-label="Lọc theo chuyên mục thông báo"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Mọi chuyên mục</option>
            {Object.entries(ANNOUNCEMENT_CATEGORY_LABELS).map(([k, v]) => (
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
            aria-label="Lọc theo trạng thái xuất bản"
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Mọi trạng thái</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Bản nháp (Ẩn công khai)</option>
          </select>
        </div>
      </div>

      {/* Announcements List */}
      {filteredAnnouncements.length === 0 ? (
        <EmptyState
          title="Chưa có thông báo phù hợp bộ lọc"
          description="Thử xóa bộ lọc tìm kiếm hoặc soạn thông báo mới."
          action={
            <Button size="sm" onClick={openCreateAnnouncement}>
              <Plus className="size-4" aria-hidden="true" />
              Soạn thông báo mới
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {paginatedAnnouncements.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/35 lg:flex-row lg:items-center"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      item.status === "published" ? "success" : "warning"
                    }
                  >
                    {item.status === "published" ? "Đã xuất bản" : "Bản nháp"}
                  </Badge>
                  <Badge variant={item.isUrgent ? "highlight" : "secondary"}>
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
                <p className="max-w-3xl text-xs text-muted-foreground line-clamp-2">
                  {item.excerpt}
                </p>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {item.targetClasses.map((cls) => (
                    <Badge key={cls} variant="outline" className="text-[11px]">
                      {cls}
                    </Badge>
                  ))}
                  {item.attachments.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                      <Paperclip className="size-3 text-primary" aria-hidden="true" />
                      {item.attachments.length} tệp đính kèm
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border pt-3 lg:border-t-0 lg:pt-0">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    handleQuickPatch(
                      item,
                      { isPinned: !item.isPinned },
                      item.isPinned ? "Đã bỏ ghim bản tin" : "Đã ghim bản tin",
                    )
                  }
                  className="whitespace-nowrap"
                >
                  {item.isPinned ? (
                    <>
                      <PinOff className="size-3.5" aria-hidden="true" />
                      Bỏ ghim
                    </>
                  ) : (
                    <>
                      <Pin className="size-3.5" aria-hidden="true" />
                      Ghim
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    handleQuickPatch(
                      item,
                      {
                        status:
                          item.status === "published" ? "draft" : "published",
                      },
                      item.status === "published"
                        ? "Đã chuyển về Bản nháp"
                        : "Đã xuất bản lên Cổng học sinh",
                    )
                  }
                  className="whitespace-nowrap"
                >
                  <Send className="size-3.5" aria-hidden="true" />
                  {item.status === "published" ? "Chuyển nháp" : "Xuất bản"}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setPreviewAnn(item)}
                  className="whitespace-nowrap"
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  Xem trước
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => openEditAnnouncement(item)}
                  className="whitespace-nowrap"
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
                  <Trash2
                    className="size-3.5 text-destructive"
                    aria-hidden="true"
                  />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PaginationBar
        page={currentPage}
        totalPages={totalPages}
        totalItems={filteredAnnouncements.length}
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
        description="Hỗ trợ định dạng học thuật, chọn lớp áp dụng, đính kèm tài liệu và lưu nháp trước khi xuất bản."
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
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
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

          {/* Target Classes Multi-Select Dropdown */}
          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="block text-xs font-semibold text-foreground">
                Lớp học áp dụng (Target Classes)
              </span>
              {!annTargetClasses.includes("Tất cả các lớp") && (
                <button
                  type="button"
                  onClick={() => setAnnTargetClasses(["Tất cả các lớp"])}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Đặt lại: Tất cả các lớp
                </button>
              )}
            </div>

            <div className="relative" ref={classDropdownRef}>
              <button
                type="button"
                onClick={() => setClassDropdownOpen((o) => !o)}
                aria-expanded={classDropdownOpen}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <span className="truncate">
                  {annTargetClasses.includes("Tất cả các lớp")
                    ? "Tất cả các lớp (Toàn trung tâm)"
                    : annTargetClasses.length === 1
                      ? annTargetClasses[0]
                      : `Đã chọn ${annTargetClasses.length} lớp học`}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                    classDropdownOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>

              {classDropdownOpen && (
                <div className="absolute right-0 left-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  <div className="border-b border-border p-2">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        type="search"
                        value={classSearchText}
                        onChange={(e) => setClassSearchText(e.target.value)}
                        placeholder="Tìm theo mã lớp hoặc tên lớp..."
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="max-h-52 overflow-y-auto p-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        toggleTargetClass("Tất cả các lớp");
                        setClassDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                        annTargetClasses.includes("Tất cả các lớp")
                          ? "bg-primary/10 font-semibold text-primary"
                          : "text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span>Tất cả các lớp (Toàn trung tâm)</span>
                      {annTargetClasses.includes("Tất cả các lớp") && (
                        <Check className="size-3.5 shrink-0" aria-hidden="true" />
                      )}
                    </button>

                    <div className="my-1 border-t border-border/60" />

                    {classroomsList
                      .filter((cls) => {
                        const q = classSearchText.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          cls.name.toLowerCase().includes(q) ||
                          cls.code.toLowerCase().includes(q)
                        );
                      })
                      .map((cls) => {
                        const selected = annTargetClasses.includes(cls.name);
                        return (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() => toggleTargetClass(cls.name)}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                              selected
                                ? "bg-primary/10 font-semibold text-primary"
                                : "text-foreground hover:bg-muted/60"
                            }`}
                          >
                            <span className="truncate">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {cls.code}
                              </span>{" "}
                              — {cls.name}
                            </span>
                            {selected && (
                              <Check className="size-3.5 shrink-0" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {!annTargetClasses.includes("Tất cả các lớp") && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {annTargetClasses.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                  >
                    <span>{label}</span>
                    <button
                      type="button"
                      onClick={() => toggleTargetClass(label)}
                      aria-label={`Bỏ chọn lớp ${label}`}
                      className="rounded-full p-0.5 hover:bg-primary/20"
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
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
                    insertRichFormat(
                      "> Lưu ý học thuật quan trọng dành cho học viên.",
                    )
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
                rows={6}
                value={annContentText}
                onChange={(e) => setAnnContentText(e.target.value)}
                aria-label="Nội dung thông báo"
                className="w-full bg-transparent p-3.5 text-xs leading-relaxed text-foreground outline-none"
              />
            </div>
          </div>

          {/* Attachments Manager */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Paperclip className="size-3.5 text-primary" aria-hidden="true" />
                Tài liệu & Biểu mẫu đính kèm ({annAttachments.length})
              </span>
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAttMode("upload")}
                  className={`rounded-md px-2 py-1 font-medium ${
                    attMode === "upload"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Tải tệp PDF
                </button>
                <button
                  type="button"
                  onClick={() => setAttMode("curriculum")}
                  className={`rounded-md px-2 py-1 font-medium ${
                    attMode === "curriculum"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Từ học liệu lớp ({availableCurriculumMaterials.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAttMode("manual")}
                  className={`rounded-md px-2 py-1 font-medium ${
                    attMode === "manual"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Nhập URL
                </button>
              </div>
            </div>

            {attMode === "upload" && (
              <div>
                <input
                  ref={attFileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  className="hidden"
                  onChange={handleAttachmentFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={isUploadingAtt}
                  onClick={() => attFileInputRef.current?.click()}
                >
                  {isUploadingAtt ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <UploadCloud className="size-3.5" aria-hidden="true" />
                  )}
                  Chọn tệp đính kèm từ máy tính
                </Button>
              </div>
            )}

            {attMode === "curriculum" && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddCurriculumAttachment(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground"
              >
                <option value="">
                  -- Chọn nhanh tài liệu từ Khung chương trình lớp học --
                </option>
                {availableCurriculumMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.size}) — {m.className}
                  </option>
                ))}
              </select>
            )}

            {attMode === "manual" && (
              <div className="grid gap-2 sm:grid-cols-12">
                <Input
                  value={manualAttName}
                  onChange={(e) => setManualAttName(e.target.value)}
                  placeholder="Tên tệp (vd: Huong-dan.pdf)"
                  className="text-xs sm:col-span-4"
                />
                <Input
                  value={manualAttUrl}
                  onChange={(e) => setManualAttUrl(e.target.value)}
                  placeholder="URL tài liệu (https://...)"
                  className="text-xs sm:col-span-4"
                />
                <Input
                  value={manualAttSize}
                  onChange={(e) => setManualAttSize(e.target.value)}
                  placeholder="1.0 MB"
                  className="text-xs sm:col-span-2"
                />
                <select
                  value={manualAttType}
                  onChange={(e) =>
                    setManualAttType(
                      e.target.value as AnnouncementAttachment["type"],
                    )
                  }
                  className="h-8 rounded-lg border border-input bg-background px-2 text-xs sm:col-span-1"
                >
                  <option value="PDF">PDF</option>
                  <option value="DOCX">DOCX</option>
                  <option value="SLIDE">SLIDE</option>
                </select>
                <Button
                  type="button"
                  size="xs"
                  onClick={handleAddManualAttachment}
                  className="sm:col-span-1"
                >
                  Thêm
                </Button>
              </div>
            )}

            {annAttachments.length > 0 && (
              <div className="space-y-1.5">
                {annAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText
                        className="size-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium text-foreground">
                        {att.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        ({att.type} · {att.size})
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setAnnAttachments((prev) =>
                          prev.filter((a) => a.id !== att.id),
                        )
                      }
                      aria-label={`Gỡ tệp ${att.name}`}
                    >
                      <Trash2
                        className="size-3.5 text-destructive"
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
          <div className="space-y-4 text-xs leading-relaxed text-foreground">
            <div className="flex flex-wrap gap-1.5">
              {previewAnn.targetClasses.map((cls) => (
                <Badge key={cls} variant="secondary">
                  {cls}
                </Badge>
              ))}
            </div>
            <div className="space-y-2.5">
              {previewAnn.content.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>
            {previewAnn.attachments.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="font-semibold text-foreground">
                  Tệp đính kèm ({previewAnn.attachments.length})
                </p>
                <div className="space-y-1.5">
                  {previewAnn.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                    >
                      <span className="truncate font-medium">
                        {att.name} ({att.size})
                      </span>
                      {att.url && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            window.open(
                              att.url!,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          <Download className="size-3" aria-hidden="true" />
                          Mở tệp
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
