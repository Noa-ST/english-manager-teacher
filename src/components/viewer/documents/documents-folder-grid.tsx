"use client";

import { Folder, FolderOpen } from "lucide-react";
import type { PublicResourceFolder } from "@/services/documents-helpers";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function DocumentsFolderGrid({
  folders,
  selectedFolderId,
  onSelectFolder,
}: {
  folders: PublicResourceFolder[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
}) {
  if (folders.length === 0) return null;

  return (
    <section aria-label="Thư mục học liệu" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">
          Danh mục thư mục ({folders.length})
        </h2>
        {selectedFolderId !== "all" && (
          <button
            type="button"
            onClick={() => onSelectFolder("all")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Xem tất cả thư mục
          </button>
        )}
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {folders.map((folder) => {
          const active = selectedFolderId === folder.id;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => onSelectFolder(active ? "all" : folder.id)}
              className={cn(
                "flex flex-col justify-between rounded-2xl border p-4 text-left transition-all",
                active
                  ? "border-primary bg-warm/65 shadow-xs"
                  : "border-border bg-card hover:border-primary/40 hover:shadow-2xs",
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-warm text-primary",
                    )}
                  >
                    {active ? (
                      <FolderOpen className="size-4" aria-hidden="true" />
                    ) : (
                      <Folder className="size-4" aria-hidden="true" />
                    )}
                  </div>
                  <Badge variant={active ? "default" : "outline"}>
                    {folder.itemCount} tệp
                  </Badge>
                </div>
                <h3 className="mt-3 font-heading text-sm font-bold text-foreground">
                  {folder.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {folder.description}
                </p>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Cập nhật: {folder.updatedAt}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
