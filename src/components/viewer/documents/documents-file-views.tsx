"use client";

import {
  Download,
  Eye,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Presentation,
  Share2,
} from "lucide-react";
import {
  DOCUMENT_FILE_TYPE_LABELS,
  isSafePublicDocumentUrl,
  type PublicResourceFile,
} from "@/services/documents-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function DocumentFileIcon({
  fileType,
  className,
}: {
  fileType: PublicResourceFile["fileType"];
  className?: string;
}) {
  const iconClass = cn("size-4 text-primary", className);
  switch (fileType) {
    case "PDF":
      return <FileText className={iconClass} aria-hidden="true" />;
    case "SLIDE":
      return <Presentation className={iconClass} aria-hidden="true" />;
    case "AUDIO":
      return <FileAudio className={iconClass} aria-hidden="true" />;
    case "IMAGE":
      return <ImageIcon className={iconClass} aria-hidden="true" />;
    case "WORKSHEET":
      return <FileSpreadsheet className={iconClass} aria-hidden="true" />;
  }
}

export function DocumentsFileViews({
  files,
  viewMode,
  selectedLevel,
  downloadingId,
  highlightedId,
  onSelectLevel,
  onPreview,
  onDownload,
  onShare,
}: {
  files: PublicResourceFile[];
  viewMode: "grid" | "list";
  selectedLevel: string;
  downloadingId: string | null;
  highlightedId: string | null;
  onSelectLevel: (level: string) => void;
  onPreview: (file: PublicResourceFile) => void;
  onDownload: (file: PublicResourceFile) => void;
  onShare: (file: PublicResourceFile) => void;
}) {
  if (viewMode === "list") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên học liệu</TableHead>
            <TableHead>Thư mục</TableHead>
            <TableHead>Trình độ</TableHead>
            <TableHead>Dung lượng</TableHead>
            <TableHead>Lượt tải</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => {
            const hasUrl = isSafePublicDocumentUrl(file.publicUrl);
            const isDownloading = downloadingId === file.id;
            const isLevelSelected = selectedLevel === file.level;

            return (
              <TableRow
                key={file.id}
                className={cn(
                  highlightedId === file.id && "bg-warm/40",
                )}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm">
                      <DocumentFileIcon fileType={file.fileType} />
                    </div>
                    <div>
                      <p className="font-heading text-sm font-semibold text-foreground">
                        {file.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {DOCUMENT_FILE_TYPE_LABELS[file.fileType] ||
                          file.fileType}{" "}
                        · {file.pagesOrDuration} · {file.updatedAt}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {file.folderName}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectLevel(isLevelSelected ? "all" : file.level)
                    }
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                      isLevelSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-primary hover:bg-primary/15",
                    )}
                  >
                    {file.level}
                  </button>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {file.size}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {file.downloads}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onShare(file)}
                      aria-label={`Sao chép liên kết ${file.title}`}
                      title="Sao chép liên kết"
                    >
                      <Share2 className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => onPreview(file)}
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      <span>Xem trước</span>
                    </Button>
                    {hasUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
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
                        <span>Tải về</span>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => onDownload(file)}
                      >
                        <Eye className="size-3.5" aria-hidden="true" />
                        <span>Tóm tắt</span>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => {
        const hasUrl = isSafePublicDocumentUrl(file.publicUrl);
        const isDownloading = downloadingId === file.id;
        const isLevelSelected = selectedLevel === file.level;

        return (
          <article
            key={file.id}
            className={cn(
              "flex flex-col justify-between rounded-2xl border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-xs",
              highlightedId === file.id
                ? "border-primary ring-2 ring-primary/20"
                : "border-border",
            )}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm">
                    <DocumentFileIcon fileType={file.fileType} />
                  </div>
                  <Badge variant="outline">
                    {DOCUMENT_FILE_TYPE_LABELS[file.fileType] || file.fileType}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelectLevel(isLevelSelected ? "all" : file.level)
                  }
                  title={`Lọc trình độ ${file.level}`}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-semibold transition-colors",
                    isLevelSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-primary hover:bg-primary/15",
                  )}
                >
                  {file.level}
                </button>
              </div>

              <h3 className="mt-3.5 font-heading text-base font-bold text-foreground">
                {file.title}
              </h3>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {file.description}
              </p>
            </div>

            <div className="mt-5 space-y-3 border-t border-border pt-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {file.size} · {file.pagesOrDuration}
                </span>
                <span className="font-mono">{file.downloads} lượt tải</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onShare(file)}
                  aria-label={`Sao chép liên kết ${file.title}`}
                  title="Sao chép liên kết"
                  className="shrink-0"
                >
                  <Share2 className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onPreview(file)}
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  <span>Xem trước</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isDownloading}
                  className="flex-1"
                  onClick={() => onDownload(file)}
                >
                  {isDownloading ? (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : hasUrl ? (
                    <Download className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-3.5" aria-hidden="true" />
                  )}
                  <span>{hasUrl ? "Tải xuống" : "Mục lục"}</span>
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
