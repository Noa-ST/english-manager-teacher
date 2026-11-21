"use client";

import {
  ArrowUpRight,
  Award,
  CheckCircle2,
  Medal,
  Quote,
} from "lucide-react";
import type {
  PodiumSelection,
  PublicHallOfFameStudent,
} from "@/services/hall-of-fame-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HallOfFamePodium({
  podium,
  selectedClass,
  onFilterClass,
  onSelectStudent,
}: {
  podium: PodiumSelection;
  selectedClass: string;
  onFilterClass: (className: string) => void;
  onSelectStudent: (student: PublicHallOfFameStudent) => void;
}) {
  const count = podium.orderedEntries.length;
  const gridClass =
    count === 1
      ? "mx-auto grid max-w-md grid-cols-1 gap-6"
      : count === 2
        ? "mx-auto grid max-w-4xl items-stretch gap-6 lg:grid-cols-2"
        : "grid items-stretch gap-6 lg:grid-cols-3";

  return (
    <section aria-label={podium.heading} className="space-y-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-heading text-lg font-bold text-foreground sm:text-xl">
            {podium.heading}
          </h2>
          <Badge variant="warm" className="border-primary/20 font-medium">
            {podium.periodLabel}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Đánh giá dựa trên Điểm định kỳ, Chuyên cần & Tư duy phản biện
        </span>
      </div>

      <div className={gridClass}>
        {podium.orderedEntries.map((student) => {
          const isFirst = student.rank === 1;
          const isClassSelected = selectedClass === student.className;

          return (
            <article
              key={student.id}
              onClick={() => onSelectStudent(student)}
              className={cn(
                "group relative flex cursor-pointer flex-col justify-between rounded-2xl border p-6 transition-all sm:p-7",
                isFirst
                  ? "border-primary/40 bg-gradient-to-b from-warm/75 via-card to-card shadow-lg hover:border-primary/65 lg:-translate-y-2"
                  : "border-border bg-card shadow-xs hover:border-primary/35 hover:shadow-md",
              )}
            >
              <div>
                {/* Top Rank Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-lg font-mono text-xs font-bold",
                        isFirst
                          ? "bg-primary text-primary-foreground"
                          : student.rank === 2
                            ? "bg-secondary text-primary"
                            : "bg-highlight/35 text-foreground",
                      )}
                    >
                      #{student.rank}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {student.periodLabel}
                    </span>
                  </div>
                  <Badge variant={isFirst ? "default" : "warm"}>
                    {student.headlineMetric}
                  </Badge>
                </div>

                {/* Avatar & Identity */}
                <div className="mt-5 flex items-center gap-4">
                  <div
                    className={cn(
                      "flex size-15 shrink-0 items-center justify-center rounded-2xl font-heading text-lg font-bold shadow-2xs",
                      isFirst
                        ? "bg-primary text-primary-foreground"
                        : "bg-warm text-primary",
                    )}
                  >
                    {student.avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading text-xl font-bold text-foreground transition-colors group-hover:text-primary">
                      {student.displayName}
                    </h3>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFilterClass(
                          isClassSelected ? "all" : student.className,
                        );
                      }}
                      title={`Lọc học sinh lớp ${student.className}`}
                      className={cn(
                        "mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                        isClassSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/80 text-muted-foreground hover:bg-secondary hover:text-primary",
                      )}
                    >
                      {student.className}
                    </button>
                    <div className="mt-2">
                      <Badge variant="secondary">
                        <Medal
                          className="size-3 text-primary"
                          aria-hidden="true"
                        />
                        {student.badgeTitle}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Teacher Endorsement */}
                {student.teacherEndorsement && (
                  <div className="mt-5 rounded-xl bg-background/90 p-3.5 text-xs leading-relaxed text-muted-foreground">
                    <Quote
                      className="mb-1 size-4 text-primary/55"
                      aria-hidden="true"
                    />
                    <p className="italic text-foreground/90">
                      “{student.teacherEndorsement}”
                    </p>
                  </div>
                )}
              </div>

              {/* Milestones + Certificate Action */}
              <div className="mt-5 space-y-4 border-t border-border pt-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Dấu ấn học thuật
                  </p>
                  <ul className="space-y-1.5 text-xs text-foreground/90">
                    {student.milestones.map((milestone) => (
                      <li key={milestone} className="flex items-center gap-2">
                        <CheckCircle2
                          className="size-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>{milestone}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    variant={isFirst ? "default" : "outline"}
                    size="sm"
                    className="h-8 rounded-lg px-3 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectStudent(student);
                    }}
                  >
                    <Award className="size-3.5" aria-hidden="true" />
                    <span>Xem chứng nhận</span>
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
