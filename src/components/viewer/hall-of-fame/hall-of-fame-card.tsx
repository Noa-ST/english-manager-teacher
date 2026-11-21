"use client";

import { ArrowUpRight, Award, CheckCircle2 } from "lucide-react";
import type { PublicHallOfFameStudent } from "@/services/hall-of-fame-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HallOfFameCard({
  item,
  selectedClass,
  onFilterClass,
  onSelectStudent,
  isHighlighted = false,
}: {
  item: PublicHallOfFameStudent;
  selectedClass: string;
  onFilterClass: (className: string) => void;
  onSelectStudent: (student: PublicHallOfFameStudent) => void;
  isHighlighted?: boolean;
}) {
  const isClassSelected = selectedClass === item.className;

  return (
    <article
      onClick={() => onSelectStudent(item)}
      className={cn(
        "group flex cursor-pointer flex-col justify-between rounded-2xl border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm",
        isHighlighted
          ? "border-primary ring-2 ring-primary/20"
          : "border-border",
      )}
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warm">{item.periodLabel}</Badge>
            <Badge variant="outline">Hạng #{item.rank}</Badge>
          </div>
          <span className="font-mono text-xs font-bold text-primary">
            {item.headlineMetric}
          </span>
        </div>

        <div className="mt-4 flex items-start gap-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary/70 font-heading text-sm font-bold text-primary">
            {item.avatarInitials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-base font-bold text-foreground transition-colors group-hover:text-primary">
                {item.displayName}
              </h3>
              <Badge variant="secondary" className="text-[11px]">
                <Award className="size-3 text-primary" aria-hidden="true" />
                {item.badgeTitle}
              </Badge>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFilterClass(isClassSelected ? "all" : item.className);
              }}
              title={`Lọc học sinh lớp ${item.className}`}
              className={cn(
                "mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                isClassSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/80 text-muted-foreground hover:bg-secondary hover:text-primary",
              )}
            >
              {item.className}
            </button>
            {item.teacherEndorsement && (
              <p className="mt-2.5 text-xs leading-relaxed text-foreground/85 italic">
                “{item.teacherEndorsement}”
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap gap-1.5">
          {item.milestones.map((milestone) => (
            <span
              key={milestone}
              className="inline-flex items-center gap-1 rounded-lg bg-background px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              <CheckCircle2
                className="size-3 text-primary"
                aria-hidden="true"
              />
              {milestone}
            </span>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 rounded-lg px-2.5 text-xs text-primary hover:bg-secondary/70"
          onClick={(e) => {
            e.stopPropagation();
            onSelectStudent(item);
          }}
        >
          <span>Chứng nhận</span>
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
