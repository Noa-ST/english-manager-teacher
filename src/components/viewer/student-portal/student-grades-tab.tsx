"use client";

import * as React from "react";
import { Award, Search, Sparkles, Target, TrendingUp } from "lucide-react";
import type { AdminStudentRecord } from "@/services/classroom-data";
import { removeVietnameseTones } from "@/lib/utils";
import { computeStudentSkillProfile } from "@/services/student-helpers";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StudentGradesTabProps {
  student: AdminStudentRecord;
}

export function StudentGradesTab({ student }: StudentGradesTabProps) {
  const [gradeSearchQuery, setGradeSearchQuery] = React.useState("");

  const publishedGrades = React.useMemo(
    () =>
      student.grades.filter((g) => (g.status ?? "published") !== "draft"),
    [student.grades],
  );
  const latestGrade = publishedGrades[0];
  const skillProfile = React.useMemo(
    () => computeStudentSkillProfile(student),
    [student],
  );

  const filteredGrades = React.useMemo(() => {
    const q = removeVietnameseTones(gradeSearchQuery.trim().toLowerCase());
    if (!q) return publishedGrades;
    return publishedGrades.filter((g) =>
      removeVietnameseTones(
        `${g.assessmentTitle} ${g.comment} ${g.date}`.toLowerCase(),
      ).includes(q),
    );
  }, [publishedGrades, gradeSearchQuery]);

  return (
    <div className="space-y-6">
      {/* 1. Band Progression Strip (Entry -> Current -> Target) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <span className="text-xs text-muted-foreground">Điểm đầu vào (Entry)</span>
          <p className="mt-1.5 font-mono text-2xl font-bold text-foreground">
            {skillProfile.entryBand !== null
              ? `Band ${skillProfile.entryBand.toFixed(1)}`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mốc đánh giá xếp lớp ban đầu
          </p>
        </div>

        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary">
              Overall Trung bình hiện tại
            </span>
            <TrendingUp className="size-4 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-primary">
            Band {student.averageScore.toFixed(1)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Qua {publishedGrades.length} kỳ kiểm tra đã công bố
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <span className="text-xs text-muted-foreground">Mức tiến bộ tích lũy</span>
          <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-700">
            {skillProfile.bandDelta !== null
              ? `${skillProfile.bandDelta >= 0 ? "+" : ""}${skillProfile.bandDelta.toFixed(1)} Band`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            So sánh với mốc điểm đầu vào
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Mục tiêu đầu ra</span>
            <Target className="size-4 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-1.5 font-heading text-lg font-bold text-foreground">
            {student.targetGoal}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {skillProfile.targetBand !== null && skillProfile.currentBand !== null
              ? skillProfile.targetBand > skillProfile.currentBand
                ? `Còn cách mục tiêu ${(skillProfile.targetBand - skillProfile.currentBand).toFixed(1)} band`
                : "Đã chạm/vượt ngưỡng Band mục tiêu"
              : "Theo lộ trình cam kết"}
          </p>
        </div>
      </div>

      {/* 2. 4-Skill Detailed Breakdown Cards */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              Phân tích Chuyên sâu 4 Kỹ năng (Listening · Reading · Writing · Speaking)
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Điểm trung bình tích lũy từng kỹ năng trên thang chuẩn 9.0 và điểm kỳ thi gần nhất.
            </p>
          </div>
          {latestGrade && (
            <Badge variant="warm">
              Bài gần nhất: {latestGrade.assessmentTitle} ({latestGrade.overall.toFixed(1)})
            </Badge>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {skillProfile.skills.map((skill) => {
            const latestSkillScore = latestGrade
              ? latestGrade[skill.key]
              : skill.score;
            const pct = Math.min(100, Math.round((skill.score / 9) * 100));
            const isStrongest =
              skillProfile.strongestSkill?.label === skill.label &&
              skillProfile.hasGrades;
            const isWeakest =
              skillProfile.weakestSkill?.label === skill.label &&
              skillProfile.hasGrades &&
              skillProfile.strongestSkill?.label !== skillProfile.weakestSkill?.label;

            return (
              <div
                key={skill.key}
                className="flex flex-col justify-between rounded-xl border border-border bg-muted/20 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-sm font-bold text-foreground">
                      {skill.label}
                    </span>
                    {isStrongest ? (
                      <Badge variant="success" className="text-[10px]">
                        Thế mạnh
                      </Badge>
                    ) : isWeakest ? (
                      <Badge variant="warning" className="text-[10px]">
                        Cần bứt phá
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-bold text-primary">
                      {skill.score.toFixed(1)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      / 9.0 (TB)
                    </span>
                  </div>
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <p className="mt-3 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
                  Kỳ gần nhất:{" "}
                  <strong className="font-mono text-foreground">
                    {latestSkillScore.toFixed(1)}
                  </strong>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Full Grade History Table */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <Award className="size-5 text-primary" aria-hidden="true" />
              Bảng điểm & Lịch sử Đánh giá Định kỳ ({publishedGrades.length})
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Thang điểm quy chuẩn 9.0 · Kèm biến động điểm số và nhận xét chi tiết từng bài làm.
            </p>
          </div>
          {publishedGrades.length >= 2 && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={gradeSearchQuery}
                onChange={(e) => setGradeSearchQuery(e.target.value)}
                placeholder="Tìm kỳ kiểm tra hoặc nhận xét..."
                aria-label="Tìm kỳ kiểm tra"
                className="h-8 rounded-lg border border-input bg-background pr-3 pl-8 text-xs"
              />
            </div>
          )}
        </div>

        {publishedGrades.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
            Chưa có bài kiểm tra nào được giáo viên công bố điểm.
          </p>
        ) : filteredGrades.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
            Không tìm thấy bài kiểm tra nào khớp từ khóa “{gradeSearchQuery}”.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bài kiểm tra / Đánh giá</TableHead>
                <TableHead>Ngày thi</TableHead>
                <TableHead className="text-center">Listening</TableHead>
                <TableHead className="text-center">Reading</TableHead>
                <TableHead className="text-center">Writing</TableHead>
                <TableHead className="text-center">Speaking</TableHead>
                <TableHead className="text-center">Overall</TableHead>
                <TableHead>Nhận xét bài làm</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGrades.map((g) => {
                const originalIdx = publishedGrades.findIndex(
                  (item) => item.id === g.id,
                );
                const prevGrade =
                  originalIdx >= 0
                    ? publishedGrades[originalIdx + 1]
                    : undefined;
                const delta = prevGrade
                  ? Math.round((g.overall - prevGrade.overall) * 10) / 10
                  : null;

                return (
                  <TableRow key={g.id}>
                    <TableCell className="font-heading font-semibold text-foreground">
                      {g.assessmentTitle}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {g.date}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">
                      {g.listening.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">
                      {g.reading.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">
                      {g.writing.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">
                      {g.speaking.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <Badge variant="default" className="font-mono">
                          {g.overall.toFixed(1)}
                        </Badge>
                        {delta !== null && delta !== 0 && (
                          <span
                            className={`text-[11px] font-semibold tabular-nums ${
                              delta > 0 ? "text-emerald-700" : "text-destructive"
                            }`}
                          >
                            {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">
                      {g.comment || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
