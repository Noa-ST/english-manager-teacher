"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";
import type {
  ResourceFileItem,
  ResourceFolder,
  StoredFileRecord,
} from "@/services/classroom-data";
import type { StorageHealthStatus } from "@/services/storage.service";
import {
  formatStorageBytes,
  IMAGE_CATEGORY_LABELS,
} from "@/services/storage-helpers";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function StorageUploadModal({
  open,
  initialKind,
  replaceTarget,
  folders,
  storageStatus,
  onClose,
  onUploaded,
}: {
  open: boolean;
  initialKind: "image" | "podcast" | "pdf";
  replaceTarget: StoredFileRecord | null;
  folders: ResourceFolder[];
  storageStatus: StorageHealthStatus | null;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { toast } = useToast();

  const resolvedReplaceKind: "image" | "podcast" | "pdf" = replaceTarget
    ? replaceTarget.fileType === "IMAGE"
      ? "image"
      : replaceTarget.fileType === "AUDIO"
        ? "podcast"
        : "pdf"
    : initialKind;

  const [uploadTargetKind, setUploadTargetKind] = React.useState<
    "image" | "podcast" | "pdf"
  >(resolvedReplaceKind);
  const [uploadTitle, setUploadTitle] = React.useState("");
  const [uploadFolderId, setUploadFolderId] = React.useState(
    folders[0]?.id ?? "fld-writing",
  );
  const [uploadImageCategory, setUploadImageCategory] = React.useState(
    replaceTarget?.category || "project",
  );
  const [uploadPdfCategory, setUploadPdfCategory] = React.useState(
    "resources/exercises",
  );
  const [uploadVisibility, setUploadVisibility] =
    React.useState<ResourceFileItem["visibility"]>("public");
  const [uploadLevel, setUploadLevel] = React.useState("B2 – C1");
  const [uploadPages, setUploadPages] = React.useState("24 trang");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [imagePreviewDataUrl, setImagePreviewDataUrl] = React.useState<
    string | null
  >(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isUploading, setIsUploading] = React.useState(false);

  const sessionKey = `${open}:${initialKind}:${replaceTarget?.id ?? ""}`;
  const [prevSessionKey, setPrevSessionKey] = React.useState(sessionKey);
  if (sessionKey !== prevSessionKey) {
    setPrevSessionKey(sessionKey);
    if (open) {
      setUploadTargetKind(resolvedReplaceKind);
      setUploadTitle(replaceTarget ? replaceTarget.originalName : "");
      setUploadFolderId(folders[0]?.id ?? "fld-writing");
      setUploadImageCategory(
        replaceTarget?.fileType === "IMAGE" && replaceTarget.category
          ? replaceTarget.category
          : "project",
      );
      const vis: ResourceFileItem["visibility"] = replaceTarget
        ? replaceTarget.isPublic
          ? "public"
          : "private"
        : "public";
      setUploadVisibility(vis);
      setUploadPdfCategory(
        vis === "public" ? "resources/exercises" : "internal-documents",
      );
      setSelectedFile(null);
      setImagePreviewDataUrl(null);
      setUploadProgress(0);
    }
  }

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim() && !selectedFile) return;

    const fileName =
      selectedFile?.name ??
      (uploadTargetKind === "image"
        ? "academic-banner.webp"
        : uploadTargetKind === "podcast"
          ? "episode-audio.mp3"
          : "academic-material.pdf");
    const mimeType =
      selectedFile?.type ||
      (uploadTargetKind === "image"
        ? "image/webp"
        : uploadTargetKind === "podcast"
          ? "audio/mpeg"
          : "application/pdf");
    const sizeBytes = selectedFile?.size ?? 1548576;

    setIsUploading(true);
    setUploadProgress(20);

    try {
      const effectiveVis =
        uploadTargetKind === "image" ? "public" : uploadVisibility;
      const ticket = await apiRequest<{
        key: string;
        provider: "cloudinary" | "supabase" | "r2" | "s3" | "local";
        method: "POST" | "PUT";
        uploadUrl: string;
        headers: Record<string, string>;
        formFields?: Record<string, string>;
        bucketName: string | null;
        storagePath: string;
        cloudinaryPublicId: string | null;
        publicUrl: string | null;
      }>("/api/admin/storage/upload-url", {
        method: "POST",
        body: JSON.stringify({
          folder:
            uploadTargetKind === "image"
              ? "resources"
              : uploadTargetKind === "podcast"
                ? "podcasts"
                : "documents",
          fileName,
          contentType: mimeType,
          size: sizeBytes,
          visibility: effectiveVis,
          imageCategory:
            uploadTargetKind === "image" ? uploadImageCategory : undefined,
        }),
      });

      setUploadProgress(55);

      if (
        selectedFile &&
        ((ticket.provider === "cloudinary" &&
          storageStatus?.cloudinaryConfigured) ||
          (ticket.provider === "supabase" && storageStatus?.supabaseConfigured))
      ) {
        if (ticket.method === "POST" && ticket.formFields) {
          const form = new FormData();
          Object.entries(ticket.formFields).forEach(([k, v]) =>
            form.append(k, v),
          );
          form.append("file", selectedFile);
          const res = await fetch(ticket.uploadUrl, {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            throw new Error(
              `Tải ảnh lên Cloudinary thất bại (HTTP ${res.status})`,
            );
          }
        } else {
          const res = await fetch(ticket.uploadUrl, {
            method: "PUT",
            headers: ticket.headers,
            body: selectedFile,
          });
          if (!res.ok) {
            throw new Error(
              `Tải tệp lên Supabase Storage thất bại (HTTP ${res.status})`,
            );
          }
        }
      }

      setUploadProgress(85);

      if (replaceTarget) {
        const replacementPayload: Record<string, unknown> = {
          fileName,
          mimeType,
          sizeBytes,
          visibility: effectiveVis,
          existingPublicId: ticket.cloudinaryPublicId ?? undefined,
          existingPublicUrl: ticket.publicUrl ?? undefined,
          existingStoragePath: ticket.storagePath,
        };
        if (uploadTargetKind === "image") {
          replacementPayload.category = uploadImageCategory;
        } else if (uploadTargetKind === "pdf") {
          replacementPayload.category = uploadPdfCategory;
        }
        await apiRequest<StoredFileRecord>("/api/admin/storage", {
          method: "POST",
          body: JSON.stringify({
            action: "replaceFile",
            targetFileId: replaceTarget.id,
            replacement: replacementPayload,
          }),
        });
      } else if (uploadTargetKind === "image") {
        // Single-Key Upload Registration: preserve exact ticket publicId/publicUrl
        await apiRequest<StoredFileRecord>("/api/admin/storage", {
          method: "POST",
          body: JSON.stringify({
            action: "uploadImage",
            fileName,
            mimeType,
            sizeBytes,
            category: uploadImageCategory,
            existingPublicId:
              ticket.cloudinaryPublicId ?? ticket.storagePath ?? undefined,
            existingPublicUrl: ticket.publicUrl ?? undefined,
          }),
        });
      } else {
        await apiRequest<ResourceFileItem>("/api/admin/storage", {
          method: "POST",
          body: JSON.stringify({
            title: uploadTitle.trim() || fileName,
            folderId: uploadFolderId,
            fileType: uploadTargetKind === "podcast" ? "AUDIO" : "PDF",
            visibility: effectiveVis,
            level: uploadLevel,
            pagesOrDuration: uploadPages,
            size: formatStorageBytes(sizeBytes),
            sizeBytes,
            objectKey: ticket.storagePath,
            publicUrl: ticket.publicUrl,
            provider: ticket.provider,
            mimeType,
            bucketName: ticket.bucketName,
            category:
              uploadTargetKind === "podcast" ? "podcasts" : uploadPdfCategory,
            originalName: fileName,
          }),
        });
      }

      setUploadProgress(100);
      toast({
        title: replaceTarget
          ? "Đã thay thế tệp an toàn (giữ nguyên tham chiếu)"
          : uploadTargetKind === "image"
            ? "Đã tải ảnh lên Cloudinary Free"
            : "Đã tải tệp lên Supabase Storage Free",
        description: `Tệp "${uploadTitle.trim() || fileName}" đã lưu đồng bộ một khóa duy nhất.`,
        variant: "success",
      });
      onUploaded();
      onClose();
    } catch (err) {
      toast({
        title: "Không thể tải tệp lên hệ thống",
        description:
          err instanceof Error
            ? err.message
            : "Vui lòng kiểm tra định dạng tệp, dung lượng và cấu hình .env.",
        variant: "error",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={
        replaceTarget
          ? `Thay thế tệp "${replaceTarget.originalName}"`
          : "Tải tài nguyên lên Hệ thống Lưu trữ"
      }
      description={
        replaceTarget
          ? "Thay tệp mới trong khi bảo toàn toàn bộ tham chiếu (referencedBy) và tự động dọn tệp cũ."
          : "Hệ thống tự động kiểm tra Magic Bytes, giữ nguyên định danh Ticket và định tuyến sang Cloudinary Free hoặc Supabase Free."
      }
      size="md"
    >
      <form onSubmit={handleUploadSubmit} className="space-y-4">
        {!replaceTarget && (
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "pdf", label: "PDF (Supabase)" },
                { id: "podcast", label: "Podcast MP3/M4A" },
                { id: "image", label: "Hình ảnh (Cloudinary)" },
              ] as const
            ).map((kind) => (
              <button
                key={kind.id}
                type="button"
                onClick={() => {
                  setUploadTargetKind(kind.id);
                  setSelectedFile(null);
                  setImagePreviewDataUrl(null);
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                  uploadTargetKind === kind.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {kind.label}
              </button>
            ))}
          </div>
        )}

        <label
          htmlFor="up-file"
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/30 bg-warm/40 p-5 text-center transition-colors hover:border-primary/60"
        >
          <UploadCloud className="size-8 text-primary" aria-hidden="true" />
          <p className="mt-2 font-heading text-sm font-semibold text-foreground">
            {selectedFile
              ? `Đã chọn: ${selectedFile.name} (${formatStorageBytes(selectedFile.size)})`
              : "Nhấn để chọn tệp từ máy tính"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {uploadTargetKind === "image"
              ? "Chỉ chấp nhận JPEG, JPG, PNG, WebP (Tối đa 5 MB) → Cloudinary Free"
              : uploadTargetKind === "podcast"
                ? "Chỉ chấp nhận MP3, M4A (Tối đa 40 MB) → Supabase Free"
                : "Chỉ chấp nhận PDF (Tối đa 40 MB) → Supabase Free"}
          </p>
          <input
            id="up-file"
            type="file"
            accept={
              uploadTargetKind === "image"
                ? ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                : uploadTargetKind === "podcast"
                  ? ".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
                  : ".pdf,application/pdf"
            }
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setSelectedFile(file);
              if (file && file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = () =>
                  setImagePreviewDataUrl(
                    typeof reader.result === "string" ? reader.result : null,
                  );
                reader.readAsDataURL(file);
              } else {
                setImagePreviewDataUrl(null);
              }
              if (file && !uploadTitle.trim()) {
                setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
              }
            }}
          />
        </label>

        {imagePreviewDataUrl && (
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="mb-2 text-xs font-semibold text-foreground">
              Xem trước ảnh trước khi lưu lên Cloudinary:
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreviewDataUrl}
              alt="Xem trước ảnh tải lên"
              className="mx-auto max-h-40 rounded-lg object-contain"
            />
          </div>
        )}

        {uploadProgress > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Tiến trình kiểm tra &amp; tải lên</span>
              <span className="font-mono font-semibold text-primary">
                {uploadProgress}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="up-title"
            className="block text-xs font-semibold text-foreground"
          >
            Tên hiển thị của tài nguyên
          </label>
          <Input
            id="up-title"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="Ví dụ: Bộ đề luyện Reading Cam 19 — Kèm giải thích chi tiết"
            required
          />
        </div>

        {uploadTargetKind === "image" ? (
          <div className="space-y-1.5">
            <label
              htmlFor="up-img-cat"
              className="block text-xs font-semibold text-foreground"
            >
              Thư mục Cloudinary (`english-manager/...`)
            </label>
            <select
              id="up-img-cat"
              value={uploadImageCategory}
              onChange={(e) => setUploadImageCategory(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
            >
              {Object.entries(IMAGE_CATEGORY_LABELS)
                .filter(([k]) => k !== "all")
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {!replaceTarget && (
              <div className="space-y-1.5">
                <label
                  htmlFor="up-folder"
                  className="block text-xs font-semibold text-foreground"
                >
                  Thư mục học liệu
                </label>
                <select
                  id="up-folder"
                  value={uploadFolderId}
                  onChange={(e) => setUploadFolderId(e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
                >
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="up-vis"
                className="block text-xs font-semibold text-foreground"
              >
                Supabase Bucket &amp; Quyền truy cập
              </label>
              <select
                id="up-vis"
                value={uploadVisibility}
                onChange={(e) => {
                  const nextVis =
                    e.target.value as ResourceFileItem["visibility"];
                  setUploadVisibility(nextVis);
                  setUploadPdfCategory(
                    nextVis === "public"
                      ? "resources/exercises"
                      : "internal-documents",
                  );
                }}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="public">Public Bucket</option>
                <option value="private">Private Bucket (15m Signed URL)</option>
              </select>
            </div>
          </div>
        )}

        {uploadTargetKind === "pdf" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="up-pdf-cat"
                className="block text-xs font-semibold text-foreground"
              >
                Nhánh thư mục Bucket
              </label>
              <select
                id="up-pdf-cat"
                value={uploadPdfCategory}
                onChange={(e) => setUploadPdfCategory(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {uploadVisibility === "public" ? (
                  <>
                    <option value="resources/grammar">resources/grammar</option>
                    <option value="resources/vocabulary">
                      resources/vocabulary
                    </option>
                    <option value="resources/exercises">
                      resources/exercises
                    </option>
                    <option value="attachments">attachments</option>
                  </>
                ) : (
                  <>
                    <option value="exams">exams (Đề thi)</option>
                    <option value="answers">answers (Đáp án)</option>
                    <option value="internal-documents">
                      internal-documents (Nội bộ)
                    </option>
                    <option value="student-documents">
                      student-documents (Học sinh)
                    </option>
                    <option value="teacher-resources">
                      teacher-resources (Giáo viên)
                    </option>
                  </>
                )}
              </select>
            </div>

            {!replaceTarget && (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor="up-level"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Trình độ
                  </label>
                  <Input
                    id="up-level"
                    value={uploadLevel}
                    onChange={(e) => setUploadLevel(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="up-pages"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Số trang / Thời lượng
                  </label>
                  <Input
                    id="up-pages"
                    value={uploadPages}
                    onChange={(e) => setUploadPages(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={isUploading}>
            <UploadCloud className="size-4" aria-hidden="true" />
            {isUploading
              ? "Đang xử lý & tải lên..."
              : replaceTarget
                ? "Thay thế tệp an toàn"
                : "Bắt đầu tải lên"}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
