import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "cn";
import { Button } from "./button";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-xl bg-muted", className)}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-warm text-primary">
        {icon ?? <FolderOpen className="size-5" aria-hidden="true" />}
      </div>
      <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export interface BreadcrumbEntry {
  label: string;
  href?: string;
  onClick?: () => void;
}

export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbEntry[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center text-sm", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
              {idx > 0 && (
                <ChevronRight className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
              )}
              {isLast ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {item.label}
                </span>
              ) : item.onClick ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="transition-colors hover:text-primary hover:underline"
                >
                  {item.label}
                </button>
              ) : item.href ? (
                <Link
                  href={item.href as never}
                  className="transition-colors hover:text-primary hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row">
      <span>
        Hiển thị <strong className="font-medium text-foreground">{start}</strong> –{" "}
        <strong className="font-medium text-foreground">{end}</strong> trong tổng số{" "}
        <strong className="font-medium text-foreground">{totalItems}</strong> mục
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="xs"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Trang trước"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Trước
        </Button>
        {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
          <Button
            key={pageNum}
            variant={pageNum === page ? "default" : "outline"}
            size="xs"
            onClick={() => onPageChange(pageNum)}
            aria-label={`Trang ${pageNum}`}
            aria-current={pageNum === page ? "page" : undefined}
            className="min-w-7"
          >
            {pageNum}
          </Button>
        ))}
        <Button
          variant="outline"
          size="xs"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Trang tiếp theo"
        >
          Sau
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

