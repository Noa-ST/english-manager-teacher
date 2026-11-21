"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Award,
  CheckCircle2,
  Edit3,
  GraduationCap,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import type {
  AdminStudentRecord,
  ClassroomGroup,
  HallOfFameStudent,
} from "@/services/classroom-data";
import { extractPublishedStudentHonorSnapshot } from "@/services/cms-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const STATUS_BADGE_MAP: Record<AdminStudentRecord["status"], string> = {
  active: "",
  trial: " [Học thử]",
  "on-leave": " [Bảo lưu]",
  archived: " [Lưu trữ]",
};

export function CmsHallOfFameTab({
  honors,
  classroomsList,
  studentsList,
  onHonorsChange,
  createTrigger,
}: {
  honors: HallOfFameStudent[];
  classroomsList: ClassroomGroup[];
  studentsList: AdminStudentRecord[];
  onHonorsChange: React.Dispatch<React.SetStateAction<HallOfFameStudent[]>>;
  createTrigger: number;
}) {
  const { toast } = useToast();

  const [podiumMonth, setPodiumMonth] = React.useState("Tháng 11/2026");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [periodFilter, setPeriodFilter] = React.useState<
    "all" | "month" | "week" | "course"
  >("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  // Modal states
  const [hofModalOpen, setHofModalOpen] = React.useState(false);
  const [editingHofId, setEditingHofId] = React.useState<string | null>(null);
  const [deletingHonor, setDeletingHonor] =
    React.useState<HallOfFameStudent | null>(null);

  // Form states
  const [hofSourceMode, setHofSourceMode] = React.useState<"class" | "manual">(
    "class",
  );
  const [hofSelectedClassId, setHofSelectedClassId] = React.useState(
    classroomsList[0]?.id || "",
  );
  const [hofSelectedStudentId, setHofSelectedStudentId] = React.useState("");
  const [hofName, setHofName] = React.useState("");
  const [hofClass, setHofClass] = React.useState(
    classroomsList[0]?.name || "",
  );
  const [hofRank, setHofRank] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [hofPeriod, setHofPeriod] = React.useState<"week" | "month" | "course">(
    "month",
  );
  const [hofPeriodLabel, setHofPeriodLabel] = React.useState("Tháng 11/2026");
  const [hofMetric, setHofMetric] = React.useState("IELTS 8.0 Overall");
  const [hofBadge, setHofBadge] = React.useState("Học viên Xuất sắc Tháng");
  const [hofMilestone1, setHofMilestone1] = React.useState("Reading 8.5");
  const [hofMilestone2, setHofMilestone2] = React.useState("Writing 7.5");
  const [hofMilestone3, setHofMilestone3] = React.useState("100% Chuyên cần");
  const [hofEndorsement, setHofEndorsement] = React.useState("");

  const openCreateHonor = (
    targetRank?: 1 | 2 | 3 | 4 | 5,
    targetPeriod?: "week" | "month" | "course",
  ) => {
    setEditingHofId(null);
    setHofSourceMode("class");
    const firstClass = classroomsList[0];
    const initialClassId = firstClass ? firstClass.id : "";
    setHofSelectedClassId(initialClassId);
    setHofClass(firstClass ? firstClass.name : "");

    const firstStudent = studentsList.find(
      (s) => s.classId === initialClassId && s.status === "active",
    );
    if (firstStudent) {
      const snap = extractPublishedStudentHonorSnapshot(firstStudent);
      setHofSelectedStudentId(firstStudent.id);
      setHofName(firstStudent.fullName);
      setHofClass(firstStudent.className);
      setHofMetric(snap.headlineMetric);
      setHofEndorsement(snap.endorsement);
      setHofMilestone1(snap.milestones[0] || "");
      setHofMilestone2(snap.milestones[1] || "");
      setHofMilestone3(snap.milestones[2] || "");
    } else {
      setHofSelectedStudentId("");
      setHofName("");
      setHofMetric("IELTS 8.0 Overall");
      setHofEndorsement("");
      setHofMilestone1("Reading 8.5");
      setHofMilestone2("Writing 7.5");
      setHofMilestone3("100% Chuyên cần");
    }

    const r = targetRank ?? 1;
    setHofRank(r);
    setHofPeriod(targetPeriod ?? "month");
    setHofPeriodLabel(podiumMonth);
    setHofBadge(
      r === 1
        ? "Học viên Xuất sắc Tháng"
        : r === 2
          ? "Cây bút Học thuật Ấn tượng"
          : r === 3
            ? "Bứt phá Nền tảng"
            : "Academic Excellence",
    );
    setHofModalOpen(true);
  };

  const [prevCreateTrigger, setPrevCreateTrigger] =
    React.useState(createTrigger);
  if (createTrigger !== prevCreateTrigger) {
    setPrevCreateTrigger(createTrigger);
    if (createTrigger > 0) {
      openCreateHonor();
    }
  }

  const availableMonths = React.useMemo(() => {
    const months = new Set<string>();
    months.add("Tháng 11/2026");
    months.add("Tháng 12/2026");
    months.add("Tháng 10/2026");
    honors.forEach((h) => {
      if (h.period === "month" && h.periodLabel) months.add(h.periodLabel);
    });
    return Array.from(months);
  }, [honors]);

  const monthlyPodium = React.useMemo(() => {
    const list = honors.filter(
      (h) =>
        h.period === "month" &&
        h.periodLabel.toLowerCase() === podiumMonth.toLowerCase(),
    );
    return {
      r1: list.find((h) => h.rank === 1) || null,
      r2: list.find((h) => h.rank === 2) || null,
      r3: list.find((h) => h.rank === 3) || null,
    };
  }, [honors, podiumMonth]);

  const availableStudentsInClass = React.useMemo(() => {
    const nonArchived = studentsList.filter((s) => s.status !== "archived");
    const scoped = hofSelectedClassId
      ? nonArchived.filter((s) => s.classId === hofSelectedClassId)
      : nonArchived;
    return [...scoped].sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return a.fullName.localeCompare(b.fullName, "vi");
    });
  }, [studentsList, hofSelectedClassId]);

  const filteredHonors = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return honors.filter((h) => {
      if (periodFilter !== "all" && h.period !== periodFilter) {
        return false;
      }
      if (
        q &&
        !h.displayName.toLowerCase().includes(q) &&
        !h.className.toLowerCase().includes(q) &&
        !h.badgeTitle.toLowerCase().includes(q) &&
        !h.headlineMetric.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [honors, periodFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredHonors.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedHonors = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHonors.slice(start, start + pageSize);
  }, [filteredHonors, currentPage, pageSize]);

  const openEditHonor = (h: HallOfFameStudent) => {
    setEditingHofId(h.id);
    setHofName(h.displayName);
    setHofClass(h.className);
    setHofRank(h.rank);
    setHofPeriod(h.period);
    setHofPeriodLabel(h.periodLabel);
    setHofMetric(h.headlineMetric);
    setHofBadge(h.badgeTitle);
    setHofMilestone1(h.milestones?.[0] || "");
    setHofMilestone2(h.milestones?.[1] || "");
    setHofMilestone3(h.milestones?.[2] || "");
    setHofEndorsement(h.teacherEndorsement);
    setHofSelectedStudentId(h.studentId || "");
    setHofSelectedClassId(h.classId || "");
    setHofSourceMode(h.studentId ? "class" : "manual");
    setHofModalOpen(true);
  };

  const handleHofStudentChange = (
    studentId: string,
    classNameOverride?: string,
  ) => {
    setHofSelectedStudentId(studentId);
    const stu = studentsList.find((s) => s.id === studentId);
    if (!stu) return;

    const snap = extractPublishedStudentHonorSnapshot(stu);
    setHofName(stu.fullName);
    setHofClass(classNameOverride || stu.className);
    setHofMetric(snap.headlineMetric);
    setHofEndorsement(snap.endorsement);
    setHofMilestone1(snap.milestones[0] || "");
    setHofMilestone2(snap.milestones[1] || "");
    setHofMilestone3(snap.milestones[2] || "");
  };

  const handleHofClassChange = (classId: string) => {
    setHofSelectedClassId(classId);
    const cls = classroomsList.find((c) => c.id === classId);
    if (cls) setHofClass(cls.name);

    const firstStu = studentsList.find(
      (s) => s.classId === classId && s.status === "active",
    );
    if (firstStu) {
      handleHofStudentChange(firstStu.id, cls?.name);
    } else {
      setHofSelectedStudentId("");
      setHofName("");
    }
  };

  const handleSaveHonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hofName.trim()) return;

    const milestones = [
      hofMilestone1.trim(),
      hofMilestone2.trim(),
      hofMilestone3.trim(),
    ].filter(Boolean);

    const payload = {
      studentId: hofSourceMode === "class" ? hofSelectedStudentId : undefined,
      classId: hofSourceMode === "class" ? hofSelectedClassId : undefined,
      displayName: hofName.trim(),
      className: hofClass.trim() || "IELTS Intensive 6.5+",
      rank: hofRank,
      period: hofPeriod,
      periodLabel: hofPeriodLabel.trim(),
      headlineMetric: hofMetric.trim(),
      badgeTitle: hofBadge.trim(),
      teacherEndorsement: hofEndorsement.trim(),
      milestones:
        milestones.length > 0
          ? milestones
          : [hofMetric.trim(), "100% bài tập hoàn thành đúng hạn"],
    };

    try {
      if (editingHofId) {
        const updated = await apiRequest<HallOfFameStudent>("/api/admin/cms", {
          method: "PATCH",
          body: JSON.stringify({
            module: "hall-of-fame",
            id: editingHofId,
            payload,
          }),
        });
        onHonorsChange((prev) =>
          prev.map((item) => (item.id === editingHofId ? updated : item)),
        );
        toast({
          title: "Đã cập nhật Bảng vàng",
          description: `Học sinh ${updated.displayName} (${updated.headlineMetric})`,
          variant: "success",
        });
      } else {
        const created = await apiRequest<HallOfFameStudent>("/api/admin/cms", {
          method: "POST",
          body: JSON.stringify({
            module: "hall-of-fame",
            payload,
          }),
        });
        if (payload.period === "month") {
          onHonorsChange((prev) => [
            created,
            ...prev.filter(
              (h) =>
                !(
                  h.period === "month" &&
                  h.periodLabel.toLowerCase() ===
                    payload.periodLabel.toLowerCase() &&
                  h.rank === payload.rank
                ),
            ),
          ]);
        } else {
          onHonorsChange((prev) => [created, ...prev]);
        }
        toast({
          title: "Đã thêm vinh danh vào Bảng vàng",
          description: `Học sinh ${created.displayName} (${created.headlineMetric})`,
          variant: "success",
        });
      }
      setEditingHofId(null);
      setHofModalOpen(false);
    } catch (err) {
      toast({
        title: "Không thể lưu vinh danh Bảng vàng",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const handleSmartSuggestTop3 = async () => {
    try {
      const recs = await apiRequest<
        {
          rank: 1 | 2 | 3;
          studentId: string;
          classId: string;
          displayName: string;
          className: string;
          headlineMetric: string;
          badgeTitle: string;
          teacherEndorsement: string;
          milestones: string[];
        }[]
      >("/api/admin/cms", {
        method: "POST",
        body: JSON.stringify({
          module: "hall-of-fame-recommend",
        }),
      });

      const createdEntries: HallOfFameStudent[] = [];
      for (const r of recs) {
        const created = await apiRequest<HallOfFameStudent>("/api/admin/cms", {
          method: "POST",
          body: JSON.stringify({
            module: "hall-of-fame",
            payload: {
              studentId: r.studentId,
              classId: r.classId,
              displayName: r.displayName,
              className: r.className,
              rank: r.rank,
              period: "month",
              periodLabel: podiumMonth,
              headlineMetric: r.headlineMetric,
              badgeTitle: r.badgeTitle,
              teacherEndorsement: r.teacherEndorsement,
              milestones: r.milestones,
            },
          }),
        });
        createdEntries.push(created);
      }

      onHonorsChange((prev) => [
        ...createdEntries,
        ...prev.filter(
          (h) =>
            !(
              h.period === "month" &&
              h.periodLabel.toLowerCase() === podiumMonth.toLowerCase() &&
              h.rank <= 3
            ),
        ),
      ]);

      toast({
        title: "Đã tự động đề cử Top 3 Tháng (Điểm đã công bố)",
        description: `Đã chọn 3 học viên đang học xuất sắc nhất vào bục Podium ${podiumMonth}.`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Đề cử thất bại",
        description: "Không thể lấy danh sách đề xuất từ sổ điểm đã công bố.",
        variant: "error",
      });
    }
  };

  const handleSwapPodiumRanks = async (
    rankA: 1 | 2 | 3,
    rankB: 1 | 2 | 3,
  ) => {
    const itemA = honors.find(
      (h) =>
        h.period === "month" &&
        h.periodLabel.toLowerCase() === podiumMonth.toLowerCase() &&
        h.rank === rankA,
    );
    const itemB = honors.find(
      (h) =>
        h.period === "month" &&
        h.periodLabel.toLowerCase() === podiumMonth.toLowerCase() &&
        h.rank === rankB,
    );
    if (!itemA || !itemB) {
      toast({
        title: "Chưa đủ học sinh để hoán đổi",
        description: `Cả hai vị trí Hạng #${rankA} và Hạng #${rankB} cần được thiết lập trước.`,
        variant: "warning",
      });
      return;
    }

    try {
      await apiRequest("/api/admin/cms", {
        method: "POST",
        body: JSON.stringify({
          module: "hall-of-fame-swap",
          payload: {
            periodLabel: podiumMonth,
            rankA,
            rankB,
          },
        }),
      });

      onHonorsChange((prev) =>
        prev.map((h) => {
          if (h.id === itemA.id) return { ...h, rank: rankB };
          if (h.id === itemB.id) return { ...h, rank: rankA };
          return h;
        }),
      );

      toast({
        title: "Đã hoán đổi thứ hạng",
        description: `Hạng #${rankA} (${itemA.displayName}) ⇄ Hạng #${rankB} (${itemB.displayName})`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Hoán đổi thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const confirmDeleteHonor = async () => {
    if (!deletingHonor) return;
    try {
      await apiRequest(
        `/api/admin/cms?module=hall-of-fame&id=${encodeURIComponent(deletingHonor.id)}`,
        { method: "DELETE" },
      );
      onHonorsChange((prev) => prev.filter((h) => h.id !== deletingHonor.id));
      toast({
        title: "Đã gỡ khỏi Bảng vàng",
        description: `Học sinh ${deletingHonor.displayName}`,
        variant: "info",
      });
      setDeletingHonor(null);
    } catch (err) {
      toast({
        title: "Không thể gỡ vinh danh",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* PODIUM STUDIO TOP 3 THÁNG */}
      <div className="rounded-2xl border border-border bg-gradient-to-b from-card via-card to-muted/20 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-500/10 p-1.5 text-amber-500 dark:bg-amber-500/20">
                <Trophy className="size-5" aria-hidden="true" />
              </div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                Bục vinh danh Top 3 Tiêu biểu trong tháng (Podium Studio)
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Chỉ tổng hợp điểm đã công bố (published) của học viên đang theo học và đồng bộ trực tiếp lên Cổng công khai.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="podium-month-select"
                className="whitespace-nowrap text-xs font-semibold text-muted-foreground"
              >
                Kỳ tháng:
              </label>
              <select
                id="podium-month-select"
                value={podiumMonth}
                onChange={(e) => setPodiumMonth(e.target.value)}
                className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSmartSuggestTop3}
              className="border-amber-500/30 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
            >
              <Sparkles className="size-3.5 text-amber-500" aria-hidden="true" />
              Đề xuất Top 3 từ Điểm đã công bố
            </Button>
          </div>
        </div>

        {/* 3 Podium Cards Layout: [Rank 2, Rank 1, Rank 3] */}
        <div className="mt-6 grid grid-cols-1 items-end gap-4 md:grid-cols-3 lg:gap-6">
          {([2, 1, 3] as const).map((rank) => {
            const item =
              rank === 1
                ? monthlyPodium.r1
                : rank === 2
                  ? monthlyPodium.r2
                  : monthlyPodium.r3;
            const isRank1 = rank === 1;
            const isRank2 = rank === 2;

            const rankMeta = isRank1
              ? {
                  label: "Hạng #1 · Quán quân",
                  borderClass:
                    "border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20 shadow-md",
                  headerBg:
                    "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  avatarBg:
                    "bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-2 ring-amber-400/30",
                  tagIcon: (
                    <Trophy
                      className="size-3.5 text-amber-500"
                      aria-hidden="true"
                    />
                  ),
                }
              : isRank2
                ? {
                    label: "Hạng #2 · Á quân",
                    borderClass:
                      "border-slate-300 dark:border-slate-700 shadow-sm",
                    headerBg:
                      "bg-slate-500/10 text-slate-700 dark:text-slate-300",
                    avatarBg:
                      "bg-slate-500/20 text-slate-700 dark:text-slate-300 ring-2 ring-slate-400/30",
                    tagIcon: (
                      <Award
                        className="size-3.5 text-slate-500"
                        aria-hidden="true"
                      />
                    ),
                  }
                : {
                    label: "Hạng #3 · Bứt phá",
                    borderClass:
                      "border-orange-300 dark:border-orange-800 shadow-sm",
                    headerBg:
                      "bg-orange-500/10 text-orange-700 dark:text-orange-300",
                    avatarBg:
                      "bg-orange-500/20 text-orange-700 dark:text-orange-300 ring-2 ring-orange-400/30",
                    tagIcon: (
                      <Award
                        className="size-3.5 text-orange-500"
                        aria-hidden="true"
                      />
                    ),
                  };

            if (item) {
              return (
                <div
                  key={rank}
                  className={`relative flex flex-col justify-between rounded-2xl bg-card p-5 transition-all ${
                    rankMeta.borderClass
                  } ${
                    isRank1
                      ? "order-first md:order-none md:-translate-y-2 md:p-6"
                      : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${rankMeta.headerBg}`}
                      >
                        {rankMeta.tagIcon}
                        {rankMeta.label}
                      </span>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                        {item.headlineMetric}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <div
                        className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rankMeta.avatarBg}`}
                      >
                        {item.avatarInitials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-heading text-base font-bold text-foreground">
                          {item.displayName}
                        </h4>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.className}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        <Award className="size-3.5" aria-hidden="true" />
                        {item.badgeTitle}
                      </span>
                    </div>

                    <p className="mt-3 line-clamp-3 rounded-xl border border-border/50 bg-muted/40 p-2.5 text-xs italic text-muted-foreground/90">
                      “{item.teacherEndorsement}”
                    </p>

                    <div className="mt-3.5 space-y-1.5 border-t border-border/50 pt-2.5">
                      <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                        Dấu ấn học thuật
                      </span>
                      <div className="space-y-1 text-xs text-foreground/85">
                        {(item.milestones && item.milestones.length > 0
                          ? item.milestones
                          : [item.headlineMetric, "100% chuyên cần"]
                        ).map((m, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <CheckCircle2
                              className="size-3 shrink-0 text-emerald-500"
                              aria-hidden="true"
                            />
                            <span className="truncate">{m}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => openEditHonor(item)}
                    >
                      <Edit3 className="size-3.5" aria-hidden="true" />
                      Đổi học sinh
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setDeletingHonor(item)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Gỡ slot
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={rank}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-card/40 p-6 text-center transition-all ${
                  isRank1
                    ? "order-first min-h-[360px] md:order-none md:-translate-y-2"
                    : "min-h-[320px]"
                }`}
              >
                <div
                  className={`flex size-12 items-center justify-center rounded-full ${rankMeta.headerBg}`}
                >
                  {rankMeta.tagIcon}
                </div>
                <h4 className="mt-3 font-heading text-sm font-bold text-foreground">
                  {rankMeta.label}
                </h4>
                <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">
                  Vị trí bục {podiumMonth} chưa có học sinh đại diện.
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => openCreateHonor(rank)}
                  className="mt-4"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Gán Học sinh Hạng #{rank}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Quick Swap Toolbar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            Đồng bộ tức thì với trang Bảng vàng công khai (/hall-of-fame) và Trang chủ (/).
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => handleSwapPodiumRanks(1, 2)}
            >
              <ArrowLeftRight className="size-3" aria-hidden="true" />
              Hoán đổi Hạng 1 ⇄ 2
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => handleSwapPodiumRanks(2, 3)}
            >
              <ArrowLeftRight className="size-3" aria-hidden="true" />
              Hoán đổi Hạng 2 ⇄ 3
            </Button>
          </div>
        </div>
      </div>

      {/* ALL HONORS LIST & HISTORY */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-heading text-base font-bold text-foreground">
              Tất cả gương mặt Bảng vàng & Lịch sử vinh danh
            </h3>
            <p className="text-xs text-muted-foreground">
              {filteredHonors.length}/{honors.length} hồ sơ vinh danh theo tuần, tháng và toàn khóa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm tên HS, lớp, danh hiệu..."
                aria-label="Tìm kiếm Bảng vàng"
                className="h-9 pl-8 text-xs"
              />
            </div>

            <select
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(
                  e.target.value as "all" | "month" | "week" | "course",
                );
                setPage(1);
              }}
              aria-label="Lọc theo kỳ vinh danh"
              className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              <option value="all">Mọi kỳ vinh danh</option>
              <option value="month">Theo Tháng</option>
              <option value="week">Theo Tuần</option>
              <option value="course">Toàn khóa học</option>
            </select>
          </div>
        </div>

        {filteredHonors.length === 0 ? (
          <EmptyState
            title="Không tìm thấy hồ sơ Bảng vàng phù hợp"
            description="Thử chọn kỳ vinh danh khác hoặc thêm gương mặt tiêu biểu mới."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {paginatedHonors.map((h) => (
              <div
                key={h.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={h.rank === 1 ? "warm" : "secondary"}>
                        Hạng #{h.rank} · {h.periodLabel}
                      </Badge>
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                        {h.period === "month"
                          ? "Theo Tháng"
                          : h.period === "week"
                            ? "Theo Tuần"
                            : "Khóa học"}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-primary">
                      {h.headlineMetric}
                    </span>
                  </div>

                  <div className="mt-3 flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {h.avatarInitials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-heading text-base font-bold text-foreground">
                        {h.displayName}
                      </h4>
                      <p className="truncate text-xs text-muted-foreground">
                        {h.className}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 line-clamp-2 text-xs italic text-foreground/85">
                    “{h.teacherEndorsement}”
                  </p>

                  {h.milestones && h.milestones.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {h.milestones.map((m, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          <CheckCircle2
                            className="size-2.5 text-emerald-500"
                            aria-hidden="true"
                          />
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <Badge variant="secondary">{h.badgeTitle}</Badge>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => openEditHonor(h)}
                    >
                      <Edit3
                        className="size-3.5 text-foreground/70"
                        aria-hidden="true"
                      />
                      Sửa
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setDeletingHonor(h)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Gỡ bỏ
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <PaginationBar
          page={currentPage}
          totalPages={totalPages}
          totalItems={filteredHonors.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
          pageSizeOptions={[6, 12, 24]}
        />
      </div>

      {/* MODAL: ADD / EDIT HALL OF FAME */}
      <ModalDialog
        open={hofModalOpen}
        onClose={() => setHofModalOpen(false)}
        title={
          editingHofId
            ? "Chỉnh sửa vinh danh Bảng vàng"
            : "Vinh danh học sinh lên Bảng vàng"
        }
        description="Chỉ trích xuất thành tích từ các bài kiểm tra đã công bố (published) trên Cổng công khai."
        size="lg"
      >
        <form onSubmit={handleSaveHonor} className="space-y-5">
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                <GraduationCap className="size-4 text-primary" aria-hidden="true" />
                1. Nguồn học sinh
              </label>
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setHofSourceMode("class")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    hofSourceMode === "class"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Chọn từ Lớp học
                </button>
                <button
                  type="button"
                  onClick={() => setHofSourceMode("manual")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    hofSourceMode === "manual"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Nhập ngoài hệ thống
                </button>
              </div>
            </div>

            {hofSourceMode === "class" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="hof-class-select"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Chọn Lớp học
                  </label>
                  <select
                    id="hof-class-select"
                    value={hofSelectedClassId}
                    onChange={(e) => handleHofClassChange(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">-- Chọn lớp học --</option>
                    {classroomsList.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="hof-student-select"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Chọn Học sinh trong lớp
                  </label>
                  <select
                    id="hof-student-select"
                    value={hofSelectedStudentId}
                    onChange={(e) => handleHofStudentChange(e.target.value)}
                    disabled={!hofSelectedClassId}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="">
                      -- Chọn học sinh ({availableStudentsInClass.length}) --
                    </option>
                    {availableStudentsInClass.map((stu) => {
                      const snap = extractPublishedStudentHonorSnapshot(stu);
                      return (
                        <option key={stu.id} value={stu.id}>
                          {stu.fullName}
                          {STATUS_BADGE_MAP[stu.status]} — Điểm đã công bố:{" "}
                          {snap.averageScore.toFixed(1)} · CC:{" "}
                          {stu.attendanceRate}%
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="hof-name"
                  className="block text-xs font-semibold text-foreground"
                >
                  Tên hiển thị học sinh
                </label>
                <Input
                  id="hof-name"
                  value={hofName}
                  onChange={(e) => setHofName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Minh Khuê"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="hof-class-input"
                  className="block text-xs font-semibold text-foreground"
                >
                  Lớp / Khóa học
                </label>
                <Input
                  id="hof-class-input"
                  value={hofClass}
                  onChange={(e) => setHofClass(e.target.value)}
                  placeholder="Ví dụ: IELTS Intensive 6.5+"
                  required
                />
              </div>
            </div>

            {hofSourceMode === "class" && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Sparkles
                  className="size-3 shrink-0 text-amber-500"
                  aria-hidden="true"
                />
                Chỉ trích xuất từ các bài kiểm tra đã công bố (published), bỏ qua điểm chấm nháp.
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
              <Trophy className="size-4 text-amber-500" aria-hidden="true" />
              2. Thiết lập Thứ hạng & Kỳ vinh danh
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="hof-period-select"
                  className="block text-xs font-semibold text-foreground"
                >
                  Loại kỳ
                </label>
                <select
                  id="hof-period-select"
                  value={hofPeriod}
                  onChange={(e) =>
                    setHofPeriod(e.target.value as "week" | "month" | "course")
                  }
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground"
                >
                  <option value="month">Vinh danh Tháng (Podium)</option>
                  <option value="week">Vinh danh Tuần</option>
                  <option value="course">Toàn khóa học</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="hof-period-label"
                  className="block text-xs font-semibold text-foreground"
                >
                  Nhãn kỳ vinh danh
                </label>
                <Input
                  id="hof-period-label"
                  value={hofPeriodLabel}
                  onChange={(e) => setHofPeriodLabel(e.target.value)}
                  placeholder="Ví dụ: Tháng 11/2026"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="hof-rank-select"
                  className="block text-xs font-semibold text-foreground"
                >
                  Thứ hạng
                </label>
                <select
                  id="hof-rank-select"
                  value={hofRank}
                  onChange={(e) => {
                    const r = Number(e.target.value) as 1 | 2 | 3 | 4 | 5;
                    setHofRank(r);
                    if (
                      r === 1 &&
                      (!hofBadge || hofBadge === "Academic Excellence")
                    ) {
                      setHofBadge("Học viên Xuất sắc Tháng");
                    } else if (
                      r === 2 &&
                      (!hofBadge || hofBadge === "Academic Excellence")
                    ) {
                      setHofBadge("Cây bút Học thuật Ấn tượng");
                    } else if (
                      r === 3 &&
                      (!hofBadge || hofBadge === "Academic Excellence")
                    ) {
                      setHofBadge("Bứt phá Nền tảng");
                    }
                  }}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground"
                >
                  <option value={1}>Hạng #1 (Quán quân Tháng)</option>
                  <option value={2}>Hạng #2 (Á quân Tháng)</option>
                  <option value={3}>Hạng #3 (Bứt phá Tháng)</option>
                  <option value={4}>Hạng #4</option>
                  <option value={5}>Hạng #5</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="hof-metric"
                className="block text-xs font-semibold text-foreground"
              >
                Thành tích nổi bật
              </label>
              <Input
                id="hof-metric"
                value={hofMetric}
                onChange={(e) => setHofMetric(e.target.value)}
                placeholder="Ví dụ: IELTS 8.0 Overall"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="hof-badge"
                className="block text-xs font-semibold text-foreground"
              >
                Huy hiệu danh hiệu
              </label>
              <Input
                id="hof-badge"
                value={hofBadge}
                onChange={(e) => setHofBadge(e.target.value)}
                placeholder="Ví dụ: Học viên Xuất sắc Tháng"
                required
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
              <Award className="size-4 text-primary" aria-hidden="true" />
              4. Dấu ấn học thuật
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="hof-m1"
                  className="text-[11px] text-muted-foreground"
                >
                  Dấu ấn 1
                </label>
                <Input
                  id="hof-m1"
                  value={hofMilestone1}
                  onChange={(e) => setHofMilestone1(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="hof-m2"
                  className="text-[11px] text-muted-foreground"
                >
                  Dấu ấn 2
                </label>
                <Input
                  id="hof-m2"
                  value={hofMilestone2}
                  onChange={(e) => setHofMilestone2(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="hof-m3"
                  className="text-[11px] text-muted-foreground"
                >
                  Dấu ấn 3
                </label>
                <Input
                  id="hof-m3"
                  value={hofMilestone3}
                  onChange={(e) => setHofMilestone3(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="hof-quote"
              className="block text-xs font-semibold text-foreground"
            >
              Lời khen & Nhận xét của giáo viên
            </label>
            <textarea
              id="hof-quote"
              rows={3}
              value={hofEndorsement}
              onChange={(e) => setHofEndorsement(e.target.value)}
              placeholder="Lời khen ngợi, ghi nhận sự tiến bộ hoặc tinh thần nỗ lực của học sinh..."
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setHofModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <Award className="size-4" aria-hidden="true" />
              {editingHofId ? "Lưu thay đổi" : "Lưu vào Bảng vàng"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deletingHonor)}
        onClose={() => setDeletingHonor(null)}
        onConfirm={confirmDeleteHonor}
        title="Xác nhận gỡ học sinh khỏi Bảng vàng?"
        description={
          deletingHonor
            ? `Hồ sơ vinh danh của "${deletingHonor.displayName}" (${deletingHonor.periodLabel}) sẽ bị gỡ.`
            : ""
        }
        confirmLabel="Gỡ vinh danh"
        variant="destructive"
      />
    </div>
  );
}
