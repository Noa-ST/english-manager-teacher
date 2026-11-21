"use client";

import { Award, TrendingDown, TrendingUp } from "lucide-react";

import type { GradeSkillAverages } from "@/services/grade-helpers";
import { Badge } from "@/components/ui/badge";

interface GradesKpiStripProps {
  averages: GradeSkillAverages;
}

export function GradesKpiStrip({ averages }: GradesKpiStripProps) {
  const skills = [
    { key: "Listening", label: "Listening TB", val: averages.listening },
    { key: "Reading", label: "Reading TB", val: averages.reading },
    { key: "Writing", label: "Writing TB", val: averages.writing },
    { key: "Speaking", label: "Speaking TB", val: averages.speaking },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {skills.map((item) => {
        const isStrongest = averages.strongestSkill === item.key;
        const isWeakest = averages.weakestSkill === item.key;

        return (
          <div
            key={item.key}
            className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {item.label}
              </span>
              {isStrongest && (
                <Badge variant="success" className="text-[10px]">
                  <TrendingUp className="size-2.5" aria-hidden="true" />
                  Thế mạnh
                </Badge>
              )}
              {isWeakest && (
                <Badge variant="warning" className="text-[10px]">
                  <TrendingDown className="size-2.5" aria-hidden="true" />
                  Cần rèn
                </Badge>
              )}
            </div>
            <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {item.val !== null ? item.val.toFixed(1) : "—"}
            </p>
          </div>
        );
      })}

      <div className="col-span-2 flex min-h-[104px] flex-col justify-between rounded-2xl border border-primary/30 bg-warm/65 p-4 shadow-2xs sm:col-span-1">
        <div className="flex items-center justify-between gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
            <Award className="size-3.5 text-primary" aria-hidden="true" />
            Overall TB
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {averages.gradedCount}/{averages.totalCount} đã chấm
          </span>
        </div>
        <div>
          <p className="font-mono text-2xl font-bold tabular-nums text-primary">
            {averages.overall !== null ? averages.overall.toFixed(1) : "—"}
          </p>
          {averages.gradedCount > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              {averages.publishedCount} công bố · {averages.draftCount} nháp
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
