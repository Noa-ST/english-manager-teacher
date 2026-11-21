"use client";

import * as React from "react";
import {
  Copy,
  Eye,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { StoredFileRecord } from "@/services/classroom-data";
import {
  buildCloudinaryPresetUrls,
  formatStorageBytes,
  IMAGE_CATEGORY_LABELS,
} from "@/services/storage-helpers";
import { apiRequest } from "@/lib/api-client";
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

export function StorageImagesTab({
  storedFiles,
  onOpenUploadImage,
  onReplaceImage,
  onDeleted,
}: {
  storedFiles: StoredFileRecord[];
  onOpenUploadImage: () => void;
  onReplaceImage: (img: StoredFileRecord) => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [imageCategoryFilter, setImageCategoryFilter] = React.useState("all");
  const [referenceFilter, setReferenceFilter] = React.useState<
    "all" | "referenced" | "unused"
  >("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [failedThumbIds, setFailedThumbIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  const [previewStoredImage, setPreviewStoredImage] =
    React.useState<StoredFileRecord | null>(null);
  const [deletingStoredFile, setDeletingStoredFile] =
    React.useState<StoredFileRecord | null>(null);

  const cloudinaryImages = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return storedFiles.filter((item) => {
      if (item.provider !== "cloudinary" || item.deletedAt) return false;
      if (
        imageCategoryFilter !== "all" &&
        item.category !== imageCategoryFilter
      ) {
        return false;
      }
      if (referenceFilter === "referenced" && item.referencedBy.length === 0) {
        return false;
      }
      if (referenceFilter === "unused" && item.referencedBy.length > 0) {
        return false;
      }
      if (
        q &&
        !item.originalName.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q) &&
        !(item.cloudinaryPublicId ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [storedFiles, imageCategoryFilter, referenceFilter, searchQuery]);

  const totalPages = Math.max(
    1,
    Math.ceil(cloudinaryImages.length / pageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedImages = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return cloudinaryImages.slice(start, start + pageSize);
  }, [cloudinaryImages, currentPage, pageSize]);

  const presetUrls = React.useMemo(() => {
    if (!previewStoredImage) return [];
    return buildCloudinaryPresetUrls(
      previewStoredImage.publicUrl,
      previewStoredImage.cloudinaryPublicId ?? previewStoredImage.storagePath,
    );
  }, [previewStoredImage]);

  const handleCopyUrl = (label: string, url: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    toast({
      title: `Đã sao chép URL (${label})`,
      description: url,
      variant: "info",
    });
  };

  const handleDeleteStoredFileConfirmed = async () => {
    if (!deletingStoredFile) return;
    try {
      await apiRequest(
        `/api/admin/storage?storedFileId=${encodeURIComponent(deletingStoredFile.id)}`,
        { method: "DELETE" },
      );
      toast({
        title: "Đã xóa ảnh Cloudinary thành công",
        description: `Đã xóa "${deletingStoredFile.originalName}" khỏi Cloudinary và cập nhật metadata.`,
        variant: "info",
      });
      onDeleted();
    } catch (err) {
      toast({
        title: "Từ chối xóa tài nguyên đang sử dụng",
        description:
          err instanceof Error
            ? err.message
            : "Tài nguyên vẫn đang được module khác tham chiếu.",
        variant: "error",
      });
    } finally {
      setDeletingStoredFile(null);
    }
  };

  const markThumbFailed = (id: string) => {
    setFailedThumbIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
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
            placeholder="Tìm ảnh theo tên file, public_id hoặc danh mục..."
            aria-label="Tìm kiếm ảnh Cloudinary"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={imageCategoryFilter}
            onChange={(e) => {
              setImageCategoryFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc danh mục ảnh Cloudinary"
            className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
          >
            {Object.entries(IMAGE_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={referenceFilter}
            onChange={(e) => {
              setReferenceFilter(
                e.target.value as "all" | "referenced" | "unused",
              );
              setPage(1);
            }}
            aria-label="Lọc trạng thái tham chiếu"
            className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
          >
            <option value="all">Mọi trạng thái tham chiếu</option>
            <option value="referenced">Đang được tham chiếu</option>
            <option value="unused">Chưa gắn kết (An toàn xóa)</option>
          </select>

          <Button size="sm" onClick={onOpenUploadImage}>
            <UploadCloud className="size-3.5" aria-hidden="true" />
            Upload Ảnh Cloudinary
          </Button>
        </div>
      </div>

      {cloudinaryImages.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="size-6" aria-hidden="true" />}
          title="Không có hình ảnh nào khớp bộ lọc"
          description="Tất cả hình ảnh đại diện, dự án học sinh, thumbnail podcast đều được quản lý và tối ưu tự động qua Cloudinary Free."
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ảnh &amp; Public ID</TableHead>
                <TableHead>Danh mục Folder</TableHead>
                <TableHead>Kích thước</TableHead>
                <TableHead>Tham chiếu</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedImages.map((img) => {
                const showImg =
                  Boolean(img.publicUrl) && !failedThumbIds.has(img.id);
                return (
                  <TableRow key={img.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {showImg ? (
                          <div className="size-10 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.publicUrl!}
                              alt={img.originalName}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={() => markThumbFailed(img.id)}
                            />
                          </div>
                        ) : (
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warm font-mono text-[10px] font-bold text-primary">
                            IMG
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            {img.originalName}
                          </p>
                          <p className="max-w-xs truncate font-mono text-[11px] text-muted-foreground">
                            {img.cloudinaryPublicId ?? img.storagePath}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {IMAGE_CATEGORY_LABELS[img.category] || img.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatStorageBytes(img.fileSize)}
                    </TableCell>
                    <TableCell>
                      {img.referencedBy.length > 0 ? (
                        <Badge
                          variant="info"
                          title={img.referencedBy.join(", ")}
                        >
                          Đang dùng ({img.referencedBy.length})
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Chưa gắn kết</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setPreviewStoredImage(img)}
                        >
                          <Eye className="size-3.5" aria-hidden="true" />
                          Preset
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onReplaceImage(img)}
                          title="Thay thế ảnh mà vẫn giữ nguyên tham chiếu đang dùng"
                        >
                          <RefreshCw className="size-3.5" aria-hidden="true" />
                          Thay thế
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeletingStoredFile(img)}
                          aria-label={`Xóa ảnh ${img.originalName}`}
                        >
                          <Trash2
                            className="size-3.5 text-destructive"
                            aria-hidden="true"
                          />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {cloudinaryImages.length > 0 && (
        <PaginationBar
          page={currentPage}
          totalPages={totalPages}
          totalItems={cloudinaryImages.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
          pageSizeOptions={[10, 20, 50]}
        />
      )}

      {/* Preview Stored Cloudinary Image + 5 Preset URLs Modal */}
      <ModalDialog
        open={Boolean(previewStoredImage)}
        onClose={() => setPreviewStoredImage(null)}
        title={previewStoredImage?.originalName ?? "Chi tiết ảnh Cloudinary"}
        description={previewStoredImage?.cloudinaryPublicId ?? undefined}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {previewStoredImage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const target = previewStoredImage;
                  setPreviewStoredImage(null);
                  onReplaceImage(target);
                }}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Thay thế ảnh an toàn
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setPreviewStoredImage(null)}
            >
              Đóng
            </Button>
          </div>
        }
      >
        {previewStoredImage && (
          <div className="space-y-4 text-xs">
            {previewStoredImage.publicUrl &&
              !failedThumbIds.has(previewStoredImage.id) && (
                <div className="flex max-h-60 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewStoredImage.publicUrl}
                    alt={previewStoredImage.originalName}
                    className="max-h-56 w-auto rounded-lg object-contain"
                    onError={() => markThumbFailed(previewStoredImage.id)}
                  />
                </div>
              )}

            <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2">
              <p>
                <strong>Danh mục:</strong>{" "}
                {IMAGE_CATEGORY_LABELS[previewStoredImage.category] ||
                  previewStoredImage.category}
              </p>
              <p>
                <strong>Kích thước:</strong>{" "}
                {formatStorageBytes(previewStoredImage.fileSize)}
              </p>
              <p className="sm:col-span-2">
                <strong>Tham chiếu hiện tại:</strong>{" "}
                {previewStoredImage.referencedBy.length > 0
                  ? previewStoredImage.referencedBy.join(", ")
                  : "Chưa gắn vào bài viết/hồ sơ nào"}
              </p>
            </div>

            {presetUrls.length > 0 && (
              <div className="space-y-2">
                <p className="font-heading text-xs font-bold text-foreground">
                  5 Transformation Presets cố định (f_auto, q_auto)
                </p>
                <div className="space-y-1.5">
                  {presetUrls.map((p) => (
                    <div
                      key={p.key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">
                          {p.label}{" "}
                          <span className="font-mono text-[11px] text-muted-foreground">
                            ({p.dimensions})
                          </span>
                        </p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {p.url}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => handleCopyUrl(p.label, p.url)}
                        className="shrink-0"
                      >
                        <Copy className="size-3" aria-hidden="true" />
                        Sao chép
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ModalDialog>

      {/* Delete Cloudinary Image Confirm */}
      <ConfirmDialog
        open={Boolean(deletingStoredFile)}
        onClose={() => setDeletingStoredFile(null)}
        onConfirm={handleDeleteStoredFileConfirmed}
        title="Xác nhận xóa ảnh khỏi Cloudinary?"
        description={
          deletingStoredFile
            ? deletingStoredFile.referencedBy.length > 0
              ? `CẢNH BÁO: Ảnh "${deletingStoredFile.originalName}" đang được tham chiếu bởi [${deletingStoredFile.referencedBy.join(", ")}]. Hệ thống sẽ từ chối xóa nếu chưa gỡ tham chiếu — hãy dùng nút "Thay thế".`
              : `Ảnh "${deletingStoredFile.originalName}" sẽ bị xóa khỏi Cloudinary và cập nhật metadata.`
            : ""
        }
        confirmLabel="Xóa ảnh"
        variant="destructive"
      />
    </div>
  );
}
