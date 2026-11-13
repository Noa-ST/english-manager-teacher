"use client";

import * as React from "react";
import {
  Award,
  CheckCircle2,
  Medal,
  Quote,
  Search,
  Sparkles,
  Trophy,
} from "lucide-react";
import {
  HALL_OF_FAME_DATA,
  type HallOfFameStudent,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PERIOD_TABS: { value: "all" | "week" | "month" | "course"; label: string }[] = [
  { value: "all", label: "Tất cả kỳ vinh danh" },
  { value: "month", label: "Vinh danh Tháng" },
  { value: "week", label: "Vinh danh Tuần" },
  { value: "course", label: "Toàn khóa học" },
];

export default function HallOfFamePage() {
  const [honors, setHonors] =
    React.useState<HallOfFameStudent[]>(HALL_OF_FAME_DATA);
  const [selectedPeriod, setSelectedPeriod] = React.useState<
    "all" | "week" | "month" | "course"
  >("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    apiRequest<HallOfFameStudent[]>("/api/viewer/hall-of-fame")
      .then(setHonors)
      .catch(() => {});
  }, []);

  // Top 3 podium highlights (prioritize monthly top 3)
  const podiumStudents = React.useMemo(() => {
    const monthlyTop = honors
      .filter((s) => s.period === "month" && s.rank <= 3)
      .sort((a, b) => a.rank - b.rank);
    return monthlyTop;
  }, [honors]);

  const filteredList = React.useMemo(() => {
    return honors.filter((item) => {
      const matchesPeriod =
        selectedPeriod === "all" || item.period === selectedPeriod;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        item.displayName.toLowerCase().includes(q) ||
        item.className.toLowerCase().includes(q) ||
        item.badgeTitle.toLowerCase().includes(q) ||
        item.headlineMetric.toLowerCase().includes(q);
      return matchesPeriod && matchesQuery;
    });
  }, [honors, selectedPeriod, searchQuery]);

  // Display order for desktop podium: Rank 2 (left), Rank 1 (center elevated), Rank 3 (right)
  const orderedPodium: HallOfFameStudent[] = React.useMemo(() => {
    const r1 = podiumStudents.find((s) => s.rank === 1);
    const r2 = podiumStudents.find((s) => s.rank === 2);
    const r3 = podiumStudents.find((s) => s.rank === 3);
    return [r2, r1, r3].filter((item): item is HallOfFameStudent => Boolean(item));
  }, [podiumStudents]);

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* Header */}
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Trang chủ", href: "/" },
            { label: "Bảng vàng vinh danh" },
          ]}
        />
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
              <Trophy className="size-4" aria-hidden="true" />
              <span>Academic Honor Roll</span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Bảng vàng vinh danh học sinh
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Tôn vinh những cá nhân có thành tích bứt phá, thái độ học tập bền bỉ và đóng góp tích
              cực cho cộng đồng học thuật của lớp.
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            Cập nhật kỳ Tháng 10–11/2026
          </Badge>
        </div>
      </div>

      {/* Podium Section (Top 3) */}
      <section aria-label="Top 3 Học sinh xuất sắc nhất tháng" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold text-foreground">
            Top 3 Gương mặt tiêu biểu trong tháng
          </h2>
          <span className="text-xs text-muted-foreground">
            Đánh giá dựa trên Điểm định kỳ, Chuyên cần & Tư duy phản biện
          </span>
        </div>

        <div className="grid items-stretch gap-6 lg:grid-cols-3">
          {orderedPodium.map((student) => {
            const isFirst = student.rank === 1;
            return (
              <div
                key={student.id}
                className={cn(
                  "relative flex flex-col justify-between rounded-2xl border p-6 transition-all sm:p-7",
                  isFirst
                    ? "border-primary/40 bg-gradient-to-b from-warm/75 via-card to-card shadow-lg lg:-translate-y-2"
                    : "border-border bg-card shadow-xs",
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
                              : "bg-highlight/30 text-foreground",
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
                    <div>
                      <h3 className="font-heading text-xl font-bold text-foreground">
                        {student.displayName}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                        {student.className}
                      </p>
                      <div className="mt-2">
                        <Badge variant="secondary">
                          <Medal className="size-3" aria-hidden="true" />
                          {student.badgeTitle}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Teacher Endorsement */}
                  <div className="mt-5 rounded-xl bg-background/85 p-3.5 text-xs leading-relaxed text-muted-foreground">
                    <Quote
                      className="mb-1 size-4 text-accent/70"
                      aria-hidden="true"
                    />
                    <p className="italic text-foreground/90">
                      “{student.teacherEndorsement}”
                    </p>
                  </div>
                </div>

                {/* Milestones */}
                <div className="mt-5 border-t border-border pt-4">
                  <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Dấu ấn học thuật
                  </p>
                  <ul className="space-y-1.5 text-xs text-foreground/90">
                    {student.milestones.map((milestone) => (
                      <li key={milestone} className="flex items-center gap-2">
                        <CheckCircle2
                          className="size-3.5 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        <span>{milestone}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Filter & Historical Archive Section */}
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Lọc bảng vàng theo kỳ vinh danh"
          >
            {PERIOD_TABS.map((tab) => {
              const active = selectedPeriod === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedPeriod(tab.value)}
                  className={cn(
                    "rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên học sinh, danh hiệu, lớp..."
              aria-label="Tìm kiếm trong bảng vàng"
              className="pl-9"
            />
          </div>
        </div>

        {filteredList.length === 0 ? (
          <EmptyState
            title="Không tìm thấy hồ sơ vinh danh phù hợp"
            description="Thử chuyển sang kỳ vinh danh khác hoặc xóa từ khóa tìm kiếm."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedPeriod("all");
                  setSearchQuery("");
                }}
              >
                Xem toàn bộ Bảng vàng
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredList.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-all hover:border-accent/40"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="warm">{item.periodLabel}</Badge>
                      <Badge variant="outline">Hạng #{item.rank}</Badge>
                    </div>
                    <span className="font-mono text-xs font-bold text-primary">
                      {item.headlineMetric}
                    </span>
                  </div>

                  <div className="mt-4 flex items-start gap-3.5">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary/50 font-heading text-sm font-bold text-primary">
                      {item.avatarInitials}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-base font-bold text-foreground">
                          {item.displayName}
                        </h3>
                        <Badge variant="secondary" className="text-[11px]">
                          <Award className="size-3" aria-hidden="true" />
                          {item.badgeTitle}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.className}</p>
                      <p className="mt-2 text-xs leading-relaxed text-foreground/85 italic">
                        “{item.teacherEndorsement}”
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {item.milestones.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 rounded-lg bg-background px-2.5 py-1 text-[11px] text-muted-foreground"
                    >
                      <CheckCircle2 className="size-3 text-accent" aria-hidden="true" />
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
