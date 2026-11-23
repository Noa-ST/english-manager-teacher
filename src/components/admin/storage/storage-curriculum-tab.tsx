"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileAudio,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Paperclip,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { uploadCurriculumFileDirect } from "@/lib/direct-upload";
import type {
  ClassroomGroup,
  MasterCurriculumMaterial,
} from "@/services/classroom-data";
import {
  FILE_TYPE_LABELS,
  formatStorageBytes,
} from "@/services/storage-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { cn, removeVietnameseTones } from "@/lib/utils";

export function StorageCurriculumTab({
  classes,
  curriculumMaterials,
  onRefresh,
}: {
  classes: ClassroomGroup[];
  curriculumMaterials: MasterCurriculumMaterial[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();

  // Filters & Pagination
  const [curriculumClassFilter, setCurriculumClassFilter] =
    React.useState("all");
  const [curriculumWeekFilter, setCurriculumWeekFilter] = React.useState("all");
  const [curriculumTypeFilter, setCurriculumTypeFilter] = React.useState("all");
  const [curriculumSearchQuery, setCurriculumSearchQuery] = React.useState("");
  const [curriculumPage, setCurriculumPage] = React.useState(1);
  const [curriculumPageSize, setCurriculumPageSize] = React.useState(10);

  // Upload Curriculum modal
  const [isUploadCurriculumOpen, setIsUploadCurriculumOpen] =
    React.useState(false);
  const [curriculumUploadClassId, setCurriculumUploadClassId] =
    React.useState(classes[0]?.id || "");
  const [curriculumUploadWeek, setCurriculumUploadWeek] = React.useState(1);
  const [curriculumUploadFile, setCurriculumUploadFile] =
    React.useState<File | null>(null);
  const [isUploadingCurriculum, setIsUploadingCurriculum] =
    React.useState(false);

  // Multi-Class Distribution & Delete states
  const [assigningMaterial, setAssigningMaterial] =
    React.useState<MasterCurriculumMaterial | null>(null);
  const [assigningTargets, setAssigningTargets] = React.useState<
    Array<{ classId: string; weekNumber: number }>
  >([]);
  const [isSavingAssignments, setIsSavingAssignments] = React.useState(false);
  const [deletingCurriculumMaterial, setDeletingCurriculumMaterial] =
    React.useState<MasterCurriculumMaterial | null>(null);

  const filteredCurriculumMaterials = React.useMemo(() => {
    return curriculumMaterials.filter((item) => {
      if (curriculumClassFilter !== "all") {
        const hasClass = item.assignments.some(
          (a) => a.classId === curriculumClassFilter,
        );
        if (!hasClass) return false;
      }
      if (curriculumWeekFilter !== "all") {
        const hasWeek = item.assignments.some(
          (a) => a.weekNumber === Number(curriculumWeekFilter),
        );
        if (!hasWeek) return false;
      }
      if (
        curriculumTypeFilter !== "all" &&
        item.type !== curriculumTypeFilter
      ) {
        return false;
      }
      if (curriculumSearchQuery.trim()) {
        const q = removeVietnameseTones(
          curriculumSearchQuery.trim().toLowerCase(),
        );
        const matchName = removeVietnameseTones(
          item.name.toLowerCase(),
        ).includes(q);
        const matchClass = item.assignments.some(
          (a) =>
            removeVietnameseTones(a.className.toLowerCase()).includes(q) ||
            a.classCode.toLowerCase().includes(q),
        );
        if (!matchName && !matchClass) return false;
      }
      return true;
    });
  }, [
    curriculumMaterials,
    curriculumClassFilter,
    curriculumWeekFilter,
    curriculumTypeFilter,
    curriculumSearchQuery,
  ]);

  const totalCurriculumPages = Math.max(
    1,
    Math.ceil(filteredCurriculumMaterials.length / curriculumPageSize),
  );
  const currentCurriculumPage = Math.min(curriculumPage, totalCurriculumPages);
  const paginatedCurriculumMaterials = React.useMemo(() => {
    const start = (currentCurriculumPage - 1) * curriculumPageSize;
    return filteredCurriculumMaterials.slice(
      start,
      start + curriculumPageSize,
    );
  }, [filteredCurriculumMaterials, currentCurriculumPage, curriculumPageSize]);

  const handleOpenAssignModal = (material: MasterCurriculumMaterial) => {
    setAssigningMaterial(material);
    setAssigningTargets(
      material.assignments.map((a) => ({
        classId: a.classId,
        weekNumber: a.weekNumber,
      })),
    );
  };

  const handleToggleClass = (classId: string, checked: boolean) => {
    if (checked) {
      const cls = classes.find((c) => c.id === classId);
      const defaultWeek = cls?.currentWeekIndex || 1;
      setAssigningTargets((prev) => [
        ...prev.filter((t) => t.classId !== classId),
        { classId, weekNumber: defaultWeek },
      ]);
    } else {
      setAssigningTargets((prev) => prev.filter((t) => t.classId !== classId));
    }
  };

  const handleClassWeekChange = (classId: string, weekNumber: number) => {
    setAssigningTargets((prev) => [
      ...prev.filter((t) => t.classId !== classId),
      { classId, weekNumber },
    ]);
  };

  const handleSelectAllClasses = () => {
    const activeClasses = classes.filter((c) => c.status !== "archived");
    setAssigningTargets(
      activeClasses.map((cls) => {
        const existing = assigningTargets.find((t) => t.classId === cls.id);
        return {
          classId: cls.id,
          weekNumber: existing
            ? existing.weekNumber
            : cls.currentWeekIndex || 1,
        };
      }),
    );
  };

  const handleSaveAssignments = async () => {
    if (!assigningMaterial) return;
    setIsSavingAssignments(true);
    try {
      const res = await fetch("/api/admin/classes/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          attachment: {
            id: assigningMaterial.id,
            name: assigningMaterial.name,
            url: assigningMaterial.url,
            size: assigningMaterial.size,
            sizeBytes: assigningMaterial.sizeBytes,
            type: assigningMaterial.type,
            uploadedAt: assigningMaterial.uploadedAt,
          },
          assignments: assigningTargets,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || "Lỗi khi lưu phân bổ tài liệu");
      }

      toast({
        title: "Phân bổ tài liệu thành công!",
        description: `Tài liệu "${assigningMaterial.name}" đã được phân bổ vào ${assigningTargets.length} lớp học.`,
        variant: "success",
      });

      setAssigningMaterial(null);
      onRefresh();
    } catch (err) {
      toast({
        title: "Không thể phân bổ tài liệu",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra",
        variant: "error",
      });
    } finally {
      setIsSavingAssignments(false);
    }
  };

  const handleUploadCurriculumMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetClassId = curriculumUploadClassId || classes[0]?.id || "";
    if (!curriculumUploadFile || !targetClassId) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng chọn tệp và lớp học cần đính kèm tài liệu.",
        variant: "error",
      });
      return;
    }

    setIsUploadingCurriculum(true);
    try {
      const directUpload = await uploadCurriculumFileDirect(
        curriculumUploadFile,
        "private",
      );
      await apiRequest("/api/admin/classes/materials", {
        method: "POST",
        body: JSON.stringify({
          action: "register-direct",
          classId: targetClassId,
          weekNumber: curriculumUploadWeek,
          directUpload,
        }),
      });

      toast({
        title: "Tải tài liệu thành công!",
        description: `Tài liệu "${curriculumUploadFile.name}" đã được gắn vào Tuần ${curriculumUploadWeek}.`,
        variant: "success",
      });

      setIsUploadCurriculumOpen(false);
      setCurriculumUploadFile(null);
      onRefresh();
    } catch (err) {
      toast({
        title: "Không thể tải tài liệu",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra",
        variant: "error",
      });
    } finally {
      setIsUploadingCurriculum(false);
    }
  };

  const handleDeleteCurriculumMaterial = async () => {
    if (!deletingCurriculumMaterial) return;
    try {
      const url = `/api/admin/classes/materials?attachmentId=${encodeURIComponent(
        deletingCurriculumMaterial.id,
      )}&removeAll=true`;
      const res = await fetch(url, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || "Lỗi khi xóa tài liệu");
      }

      toast({
        title: "Đã gỡ tài liệu khỏi lộ trình",
        description: `Đã xóa tài liệu "${deletingCurriculumMaterial.name}" khỏi toàn bộ lớp học liên kết.`,
        variant: "success",
      });

      setDeletingCurriculumMaterial(null);
      onRefresh();
    } catch (err) {
      toast({
        title: "Không thể xóa tài liệu",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra",
        variant: "error",
      });
    }
  };

  const handleViewOrDownloadCurriculumItem = async (
    item: MasterCurriculumMaterial,
  ) => {
    if (item.url && item.url.startsWith("/api/admin/storage/download-url")) {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-heading text-lg font-bold text-foreground">
              Quản lý Tài liệu Lớp học &amp; Lộ trình Bài giảng
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Quản lý tập trung toàn bộ giáo trình, slide, bài tập theo từng lớp &amp; tuần học phần; đồng bộ tự động 2 chiều với Quản lý Lớp học và Signed URL bảo mật.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Làm mới
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (classes.length > 0 && !curriculumUploadClassId) {
                setCurriculumUploadClassId(classes[0].id);
              }
              setIsUploadCurriculumOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="size-4" aria-hidden="true" />
            Tải tài liệu lên lớp học
          </Button>
        </div>
      </div>

      {/* Metric KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Tổng tài liệu học liệu
            </p>
            <Paperclip className="size-4 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {curriculumMaterials.length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tài liệu trong kho &amp; lộ trình bài giảng
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Lớp học có tài liệu</p>
            <BookOpen className="size-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {
              new Set(
                curriculumMaterials.flatMap((m) =>
                  m.assignments.map((a) => a.classId),
                ),
              ).size
            }{" "}
            / {classes.filter((c) => c.status !== "archived").length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Lớp học đang có tài liệu học phần
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Tổng dung lượng tài liệu
            </p>
            <HardDrive className="size-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {formatStorageBytes(
              curriculumMaterials.reduce(
                (sum, m) => sum + (m.sizeBytes || 0),
                0,
              ),
            )}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Dung lượng tối ưu (dùng chung không nhân bản)
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Kết quả lọc hiện tại</p>
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {filteredCurriculumMaterials.length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tài liệu thỏa mãn tiêu chí tìm kiếm
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={curriculumSearchQuery}
            onChange={(e) => {
              setCurriculumSearchQuery(e.target.value);
              setCurriculumPage(1);
            }}
            placeholder="Tìm tài liệu theo tên tệp, tên tuần hoặc mã lớp..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={curriculumClassFilter}
            onChange={(e) => {
              setCurriculumClassFilter(e.target.value);
              setCurriculumPage(1);
            }}
            aria-label="Lọc theo lớp học"
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả lớp học ({classes.length})</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>

          <select
            value={curriculumWeekFilter}
            onChange={(e) => {
              setCurriculumWeekFilter(e.target.value);
              setCurriculumPage(1);
            }}
            aria-label="Lọc theo tuần học"
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả các tuần</option>
            {Array.from({ length: 16 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Tuần {w}
              </option>
            ))}
          </select>

          <select
            value={curriculumTypeFilter}
            onChange={(e) => {
              setCurriculumTypeFilter(e.target.value);
              setCurriculumPage(1);
            }}
            aria-label="Lọc theo định dạng"
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả định dạng</option>
            <option value="PDF">Tài liệu PDF</option>
            <option value="DOCX">Văn bản Word (.docx)</option>
            <option value="SLIDE">Slide bài giảng (.pptx)</option>
            <option value="WORKSHEET">Phiếu bài tập (.xlsx)</option>
            <option value="IMAGE">Hình ảnh</option>
            <option value="AUDIO">Âm thanh Audio</option>
          </select>

          {(curriculumSearchQuery ||
            curriculumClassFilter !== "all" ||
            curriculumWeekFilter !== "all" ||
            curriculumTypeFilter !== "all") && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setCurriculumSearchQuery("");
                setCurriculumClassFilter("all");
                setCurriculumWeekFilter("all");
                setCurriculumTypeFilter("all");
                setCurriculumPage(1);
              }}
              className="text-xs text-muted-foreground"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {filteredCurriculumMaterials.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-6" aria-hidden="true" />}
            title="Không có tài liệu nào"
            description="Hãy bấm 'Tải tài liệu lên lớp học' hoặc điều chỉnh bộ lọc."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên tài liệu &amp; Định dạng</TableHead>
                <TableHead>Lớp học &amp; Tuần liên kết</TableHead>
                <TableHead>Dung lượng &amp; Ngày tải</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCurriculumMaterials.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      {item.type === "SLIDE" ? (
                        <Presentation
                          className="size-4 shrink-0 text-amber-600"
                          aria-hidden="true"
                        />
                      ) : item.type === "WORKSHEET" ? (
                        <FileSpreadsheet
                          className="size-4 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                      ) : item.type === "AUDIO" ? (
                        <FileAudio
                          className="size-4 shrink-0 text-purple-600"
                          aria-hidden="true"
                        />
                      ) : item.type === "IMAGE" ? (
                        <ImageIcon
                          className="size-4 shrink-0 text-sky-600"
                          aria-hidden="true"
                        />
                      ) : (
                        <FileText
                          className="size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      )}
                      <div>
                        <p
                          className="text-xs font-semibold text-foreground"
                          title={item.name}
                        >
                          {item.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {FILE_TYPE_LABELS[item.type] || item.type}
                          </Badge>
                          {item.assignments.length > 1 && (
                            <Badge variant="info" className="text-[10px]">
                              {item.assignments.length} lớp dùng chung
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    {item.assignments.length === 0 ? (
                      <Badge
                        variant="outline"
                        className="border-dashed text-[10px] text-muted-foreground"
                      >
                        Chưa phân bổ lớp
                      </Badge>
                    ) : (
                      <div className="flex max-w-sm flex-wrap gap-1">
                        {item.assignments.map((a) => (
                          <span
                            key={`${a.classId}-${a.weekNumber}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                            title={`${a.className} - Tuần ${a.weekNumber}`}
                          >
                            <span className="font-mono font-bold">
                              {a.classCode}
                            </span>
                            <span className="text-muted-foreground">
                              · Tuần {a.weekNumber}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="text-xs">
                      <p className="font-mono text-foreground">{item.size}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.uploadedAt}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => handleViewOrDownloadCurriculumItem(item)}
                      >
                        <Download className="size-3" aria-hidden="true" />
                        Xem / Tải
                      </Button>

                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleOpenAssignModal(item)}
                        className="gap-1 border-primary/30 text-primary hover:bg-primary/5"
                      >
                        <Share2 className="size-3" aria-hidden="true" />
                        Phân bổ
                      </Button>

                      <Link
                        href="/classes"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <ExternalLink className="size-3" aria-hidden="true" />
                        Lộ trình
                      </Link>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setDeletingCurriculumMaterial(item)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {filteredCurriculumMaterials.length > 0 && (
        <PaginationBar
          page={currentCurriculumPage}
          totalPages={totalCurriculumPages}
          totalItems={filteredCurriculumMaterials.length}
          pageSize={curriculumPageSize}
          onPageChange={setCurriculumPage}
          onPageSizeChange={(sz) => {
            setCurriculumPageSize(sz);
            setCurriculumPage(1);
          }}
          pageSizeOptions={[10, 20, 50]}
        />
      )}

      {/* Modal: Upload Curriculum Material */}
      <ModalDialog
        open={isUploadCurriculumOpen}
        onClose={() => setIsUploadCurriculumOpen(false)}
        title="Tải tài liệu lên Lớp học & Lộ trình bài giảng"
        description="Tài liệu sẽ tự động kiểm tra chữ ký Magic Bytes và liên kết trực tiếp vào tuần học phần."
        size="md"
      >
        <form
          onSubmit={handleUploadCurriculumMaterial}
          className="space-y-4 text-xs"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="cur-upload-class"
              className="block text-xs font-semibold text-foreground"
            >
              Chọn lớp học <span className="text-destructive">*</span>
            </label>
            <select
              id="cur-upload-class"
              value={curriculumUploadClassId || classes[0]?.id || ""}
              onChange={(e) => {
                setCurriculumUploadClassId(e.target.value);
                setCurriculumUploadWeek(1);
              }}
              required
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.code} — {cls.name} ({cls.totalWeeks ?? 12} tuần)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="cur-upload-week"
              className="block text-xs font-semibold text-foreground"
            >
              Chọn tuần học phần liên kết{" "}
              <span className="text-destructive">*</span>
            </label>
            <select
              id="cur-upload-week"
              value={curriculumUploadWeek}
              onChange={(e) => setCurriculumUploadWeek(Number(e.target.value))}
              required
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              {(() => {
                const targetCls = classes.find(
                  (c) =>
                    c.id === (curriculumUploadClassId || classes[0]?.id || ""),
                );
                const total = targetCls?.totalWeeks ?? 12;
                return Array.from({ length: total }, (_, i) => {
                  const wNum = i + 1;
                  const weekItem = targetCls?.curriculum?.find(
                    (w) => w.weekNumber === wNum,
                  );
                  return (
                    <option key={wNum} value={wNum}>
                      Tuần {wNum}: {weekItem?.title || `Học phần tuần ${wNum}`}
                    </option>
                  );
                });
              })()}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              Chọn tệp từ máy tính <span className="text-destructive">*</span>
            </label>
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
              <input
                type="file"
                id="cur-file-input"
                accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.mp3"
                onChange={(e) =>
                  setCurriculumUploadFile(e.target.files?.[0] || null)
                }
                className="block w-full cursor-pointer text-xs text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:opacity-90"
                required
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Hỗ trợ PDF, Word (.docx), Slide (.pptx), Bài tập (.xlsx), Hình ảnh hoặc Âm thanh.
              </p>
            </div>
            {curriculumUploadFile && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                Đã chọn: {curriculumUploadFile.name} (
                {formatStorageBytes(curriculumUploadFile.size)})
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setIsUploadCurriculumOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="xs"
              disabled={isUploadingCurriculum || !curriculumUploadFile}
            >
              {isUploadingCurriculum
                ? "Đang tải lên..."
                : "Tải lên & Gắn vào Lộ trình"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal: Multi-Class Material Assignment */}
      <ModalDialog
        open={Boolean(assigningMaterial)}
        onClose={() => setAssigningMaterial(null)}
        title="Phân bổ tài liệu vào các lớp học"
        description="Một tài liệu có thể liên kết đồng thời đến nhiều lớp mà không cần tải lại."
        size="lg"
      >
        {assigningMaterial && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground">
                  {assigningMaterial.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {FILE_TYPE_LABELS[assigningMaterial.type] ||
                    assigningMaterial.type}{" "}
                  · {assigningMaterial.size}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {assigningTargets.length} lớp đã chọn
              </Badge>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-semibold text-foreground">
                Danh sách lớp học áp dụng (
                {classes.filter((c) => c.status !== "archived").length} lớp hoạt động)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllClasses}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Chọn tất cả
                </button>
                <span className="text-xs text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={() => setAssigningTargets([])}
                  className="text-[11px] text-muted-foreground hover:underline"
                >
                  Bỏ chọn tất cả
                </button>
              </div>
            </div>

            <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {classes
                .filter((cls) => cls.status !== "archived")
                .map((cls) => {
                  const isChecked = assigningTargets.some(
                    (t) => t.classId === cls.id,
                  );
                  const currentWeek =
                    assigningTargets.find((t) => t.classId === cls.id)
                      ?.weekNumber ||
                    cls.currentWeekIndex ||
                    1;
                  const total = cls.totalWeeks ?? 12;

                  return (
                    <div
                      key={cls.id}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 transition-colors",
                        isChecked ? "bg-primary/5" : "hover:bg-muted/30",
                      )}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            handleToggleClass(cls.id, e.target.checked)
                          }
                          className="size-4 rounded border-input text-primary focus:ring-primary"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className="font-mono text-[10px] font-bold"
                            >
                              {cls.code}
                            </Badge>
                            <span className="truncate text-xs font-semibold text-foreground">
                              {cls.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Hiện đang ở Tuần {cls.currentWeekIndex || 1}/
                            {total}
                          </p>
                        </div>
                      </label>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          Gán vào:
                        </span>
                        <select
                          disabled={!isChecked}
                          value={currentWeek}
                          onChange={(e) =>
                            handleClassWeekChange(
                              cls.id,
                              Number(e.target.value),
                            )
                          }
                          className={cn(
                            "h-8 rounded-lg border border-input bg-background px-2 text-xs font-medium text-foreground",
                            !isChecked && "cursor-not-allowed opacity-50",
                          )}
                        >
                          {Array.from({ length: total }, (_, i) => {
                            const wNum = i + 1;
                            const weekItem = cls.curriculum?.find(
                              (w) => w.weekNumber === wNum,
                            );
                            return (
                              <option key={wNum} value={wNum}>
                                Tuần {wNum}
                                {weekItem?.title ? `: ${weekItem.title}` : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-muted-foreground">
                Đã chọn {assigningTargets.length} lớp học
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setAssigningMaterial(null)}
                >
                  Hủy
                </Button>
                <Button
                  type="button"
                  size="xs"
                  disabled={isSavingAssignments}
                  onClick={handleSaveAssignments}
                >
                  {isSavingAssignments
                    ? "Đang lưu..."
                    : `Lưu phân bổ (${assigningTargets.length} lớp)`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </ModalDialog>

      <ConfirmDialog
        open={Boolean(deletingCurriculumMaterial)}
        onClose={() => setDeletingCurriculumMaterial(null)}
        onConfirm={handleDeleteCurriculumMaterial}
        title="Gỡ tài liệu khỏi các lớp học?"
        description={
          deletingCurriculumMaterial
            ? `Thao tác này sẽ gỡ tài liệu "${deletingCurriculumMaterial.name}" khỏi toàn bộ ${deletingCurriculumMaterial.assignments.length} lớp học liên kết.`
            : ""
        }
        confirmLabel="Gỡ khỏi tất cả lớp"
        cancelLabel="Hủy"
        variant="destructive"
      />
    </div>
  );
}
