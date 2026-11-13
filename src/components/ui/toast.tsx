"use client";

import * as React from "react";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "cn";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "success" | "info" | "warning" | "error";
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((item: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-3), { ...item, id }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((entry) => entry.id !== id));
    }, 3800);
  }, []);

  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((entry) => entry.id !== id));
  };

  return (
    <ToastContext value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2.5"
      >
        {items.map((item) => {
          const variant = item.variant ?? "success";
          const Icon =
            variant === "error" || variant === "warning"
              ? AlertTriangle
              : variant === "info"
                ? Info
                : CheckCircle2;

          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-3.5 text-sm shadow-lg transition-all",
                variant === "success" && "border-emerald-200",
                variant === "info" && "border-primary-accent/30",
                variant === "warning" && "border-amber-200",
                variant === "error" && "border-red-200",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  variant === "success" && "text-emerald-600",
                  variant === "info" && "text-primary-accent",
                  variant === "warning" && "text-amber-600",
                  variant === "error" && "text-red-600",
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-semibold text-foreground">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Đóng thông báo"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.use(ToastContext);
  if (!ctx) {
    return {
      toast: () => {},
    };
  }
  return ctx;
}

