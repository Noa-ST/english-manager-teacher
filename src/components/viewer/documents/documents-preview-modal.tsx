"use client";

import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Share2,
} from "lucide-react";
import {
  DOCUMENT_FILE_TYPE_LABELS,
  isSafePublicDocumentUrl,
  type PublicResourceFile,
} from "@/services/documents-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";

export function DocumentsPreviewModal({
  file,
  downloadingId,
  onDownload,
  onShare,
  onClose,
}: {
  file: PublicResourceFile | null;
  downloadingId: string | null;
  onDownload: (file: PublicResourceFile) => void;
  onShare: (file: PublicResourceFile) => void;
  onClose: () => void;
}) {
  if (!file) return null;

  const hasDownloadUrl = isSafePublicDocumentUrl(file.publicUrl);
  const isDownloading = downloadingId === file.id;

  return (
    <ModalDialog
      open={Boolean(file)}
      onClose={onClose}
      title={file.title}
      description={`${file.folderName} · ${DOCUMENT_FILE_TYPE_LABELS[file.fileType] || file.fileType} (${file.size})`}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onShare(file)}
          >
            <Share2 className="size-3.5" aria-hidden="true" />
            <span>Sao chép liên kết</span>
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
            {hasDownloadUrl && (
              <Button
                type="button"
                size="sm"
                disabled={isDownloading}
                onClick={() => onDownload(file)}
              >
                {isDownloading ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Download className="size-3.5" aria-hidden="true" />
                )}
                <span>Tải bản đầy đủ ({file.size})</span>
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{file.level}</Badge>
          <Badge variant="outline">{file.pagesOrDuration}</Badge>
          <Badge variant="warm">{file.downloads} lượt tải</Badge>
          <span className="text-xs text-muted-foreground">
            Cập nhật: {file.updatedAt}
          </span>
        </div>

        <p className="leading-relaxed text-muted-foreground">
          {file.description}
        </p>

        {/* Inline Rich Media Preview when safe publicUrl exists */}
        {hasDownloadUrl && file.fileType === "IMAGE" && (
          <div className="overflow-hidden rounded-xl border border-border bg-muted/20 p-2">
            <div className="flex max-h-80 items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.publicUrl ?? ""}
                alt={file.title}
                className="max-h-76 w-auto rounded-lg object-contain"
              />
            </div>
            <div className="mt-2 flex justify-end px-2 pb-1">
              <a
                href={file.publicUrl ?? ""}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <span>Mở ảnh gốc</span>
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        )}

        {hasDownloadUrl && file.fileType === "AUDIO" && (
          <div className="rounded-xl border border-border bg-muted/35 p-3.5">
            <p className="mb-2 text-xs font-semibold text-primary">
              Nghe trước bản thu âm
            </p>
            <audio
              controls
              preload="metadata"
              src={file.publicUrl ?? ""}
              className="w-full"
            />
          </div>
        )}

        {/* Transparent Notice when no cloud file URL is attached yet */}
        {!hasDownloadUrl && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#E6D7B8] bg-warm/50 p-3.5 text-xs text-foreground">
            <FileText
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold text-primary">
                Chưa đính kèm tệp tải trực tiếp — đang hiển thị tóm tắt nội dung
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Giáo viên đang cập nhật tệp đính kèm đám mây cho học liệu này.
                Bạn có thể tham khảo trước mục lục chi tiết bên dưới.
              </p>
            </div>
          </div>
        )}

        {file.previewSummary.length > 0 && (
          <div className="rounded-xl border border-border bg-background p-4">
            <h4 className="font-heading text-xs font-semibold tracking-wider text-primary uppercase">
              Mục lục &amp; Nội dung tóm tắt
            </h4>
            <ul className="mt-2.5 space-y-2 text-xs text-foreground/90">
              {file.previewSummary.map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
