"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Layers,
  RefreshCw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import {
  computeHallOfFameStats,
  countHallOfFameByPeriod,
  extractHallOfFameClasses,
  extractHallOfFamePeriodLabels,
  filterAndSortHallOfFame,
  selectPodiumForPeriod,
  type HallOfFamePeriodFilter,
  type HallOfFameSortKey,
  type PublicHallOfFameStudent,
  type ViewerHallOfFameEndorser,
  type ViewerHallOfFamePayload,
} from "@/services/hall-of-fame-helpers";
import { apiRequest } from "@/lib/api-client";
import { HallOfFameCard } from "@/components/viewer/hall-of-fame/hall-of-fame-card";
import { HallOfFameCertificateModal } from "@/components/viewer/hall-of-fame/hall-of-fame-certificate-modal";
import { HallOfFamePodium } from "@/components/viewer/hall-of-fame/hall-of-fame-podium";
import { HallOfFameToolbar } from "@/components/viewer/hall-of-fame/hall-of-fame-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  EmptyState,
  PaginationBar,
  Skeleton,
} from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

const VALID_PERIODS = new Set<string>(["all", "month", "week", "course"]);
const VALID_SORTS = new Set<string>(["rank_asc", "period_recent", "name_asc"]);

function parsePeriodParam(raw: string | null): HallOfFamePeriodFilter {
  if (raw && VALID_PERIODS.has(raw)) {
    return raw as HallOfFamePeriodFilter;
  }
  return "all";
}

function parseSortParam(raw: string | null): HallOfFameSortKey {
  if (raw && VALID_SORTS.has(raw)) {
    return raw as HallOfFameSortKey;
  }
  return "rank_asc";
}

function HallOfFameSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-120 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-76 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
    </div>
  );
}

function HallOfFameContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [honors, setHonors] = React.useState<PublicHallOfFameStudent[]>([]);
  const [endorser, setEndorser] = React.useState<ViewerHallOfFameEndorser>({
    name: "",
    title: "",
  });
  const [currentTerm, setCurrentTerm] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const [selectedPeriod, setSelectedPeriod] =
    React.useState<HallOfFamePeriodFilter>(() =>
      parsePeriodParam(searchParams.get("period")),
    );
  const [selectedClass, setSelectedClass] = React.useState<string>(
    () => searchParams.get("class") ?? "all",
  );
  const [selectedPeriodLabel, setSelectedPeriodLabel] = React.useState<string>(
    () => searchParams.get("batch") ?? "all",
  );
  const [sortBy, setSortBy] = React.useState<HallOfFameSortKey>(() =>
    parseSortParam(searchParams.get("sort")),
  );
  const [searchQuery, setSearchQuery] = React.useState<string>(
    () => searchParams.get("q") ?? "",
  );
  const [selectedStudentId, setSelectedStudentId] = React.useState<
    string | null
  >(() => searchParams.get("highlight"));

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(6);

  React.useEffect(() => {
    let active = true;
    apiRequest<ViewerHallOfFamePayload>("/api/viewer/hall-of-fame")
      .then((res) => {
        if (!active) return;
        setHonors(Array.isArray(res?.items) ? res.items : []);
        setEndorser(res?.teacherEndorser ?? { name: "", title: "" });
        setCurrentTerm(res?.currentTerm ?? "");
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("Không thể tải dữ liệu Bảng vàng vinh danh. Vui lòng thử lại.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadNonce]);

  const syncUrlParams = (next: {
    period: HallOfFamePeriodFilter;
    cls: string;
    batch: string;
    sort: HallOfFameSortKey;
    q: string;
    highlight: string | null;
  }) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (next.period !== "all") params.set("period", next.period);
    if (next.cls !== "all") params.set("class", next.cls);
    if (next.batch !== "all") params.set("batch", next.batch);
    if (next.sort !== "rank_asc") params.set("sort", next.sort);
    if (next.q.trim()) params.set("q", next.q.trim());
    if (next.highlight) params.set("highlight", next.highlight);
    const qs = params.toString();
    const targetUrl = qs ? `/hall-of-fame?${qs}` : "/hall-of-fame";
    window.history.replaceState(null, "", targetUrl);
  };

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const handleSelectPeriod = (period: HallOfFamePeriodFilter) => {
    setSelectedPeriod(period);
    setSelectedPeriodLabel("all");
    setPage(1);
    syncUrlParams({
      period,
      cls: selectedClass,
      batch: "all",
      sort: sortBy,
      q: searchQuery,
      highlight: selectedStudentId,
    });
  };

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    setPage(1);
    syncUrlParams({
      period: selectedPeriod,
      cls,
      batch: selectedPeriodLabel,
      sort: sortBy,
      q: searchQuery,
      highlight: selectedStudentId,
    });
  };

  const handleSelectPeriodLabel = (batch: string) => {
    setSelectedPeriodLabel(batch);
    setPage(1);
    syncUrlParams({
      period: selectedPeriod,
      cls: selectedClass,
      batch,
      sort: sortBy,
      q: searchQuery,
      highlight: selectedStudentId,
    });
  };

  const handleSortChange = (sort: HallOfFameSortKey) => {
    setSortBy(sort);
    setPage(1);
    syncUrlParams({
      period: selectedPeriod,
      cls: selectedClass,
      batch: selectedPeriodLabel,
      sort,
      q: searchQuery,
      highlight: selectedStudentId,
    });
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPage(1);
    syncUrlParams({
      period: selectedPeriod,
      cls: selectedClass,
      batch: selectedPeriodLabel,
      sort: sortBy,
      q,
      highlight: selectedStudentId,
    });
  };

  const handleResetFilters = () => {
    setSelectedPeriod("all");
    setSelectedClass("all");
    setSelectedPeriodLabel("all");
    setSortBy("rank_asc");
    setSearchQuery("");
    setPage(1);
    syncUrlParams({
      period: "all",
      cls: "all",
      batch: "all",
      sort: "rank_asc",
      q: "",
      highlight: selectedStudentId,
    });
  };

  const handleSelectStudent = (student: PublicHallOfFameStudent) => {
    setSelectedStudentId(student.id);
    syncUrlParams({
      period: selectedPeriod,
      cls: selectedClass,
      batch: selectedPeriodLabel,
      sort: sortBy,
      q: searchQuery,
      highlight: student.id,
    });
  };

  const handleCloseCertificate = () => {
    setSelectedStudentId(null);
    syncUrlParams({
      period: selectedPeriod,
      cls: selectedClass,
      batch: selectedPeriodLabel,
      sort: sortBy,
      q: searchQuery,
      highlight: null,
    });
  };

  const handleCopyShareLink = async (student: PublicHallOfFameStudent) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/hall-of-fame?highlight=${encodeURIComponent(student.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Đã sao chép liên kết chứng nhận",
        description: `Chia sẻ hồ sơ vinh danh của ${student.displayName}.`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Không thể truy cập clipboard",
        description: "Vui lòng sao chép trực tiếp đường dẫn trên thanh địa chỉ.",
        variant: "error",
      });
    }
  };

  const stats = React.useMemo(() => computeHallOfFameStats(honors), [honors]);
  const periodCounts = React.useMemo(
    () => countHallOfFameByPeriod(honors),
    [honors],
  );
  const availableClasses = React.useMemo(
    () => extractHallOfFameClasses(honors),
    [honors],
  );
  const availablePeriodLabels = React.useMemo(
    () => extractHallOfFamePeriodLabels(honors, selectedPeriod),
    [honors, selectedPeriod],
  );

  const isUnnarrowed =
    !searchQuery.trim() &&
    selectedClass === "all" &&
    selectedPeriodLabel === "all";

  const activePodium = React.useMemo(() => {
    if (!isUnnarrowed) return null;
    return selectPodiumForPeriod(honors, selectedPeriod);
  }, [honors, isUnnarrowed, selectedPeriod]);

  const filteredList = React.useMemo(
    () =>
      filterAndSortHallOfFame(honors, {
        period: selectedPeriod,
        className: selectedClass,
        periodLabel: selectedPeriodLabel,
        search: searchQuery,
        sortBy,
        excludeIds: activePodium?.entryIds,
      }),
    [
      honors,
      selectedPeriod,
      selectedClass,
      selectedPeriodLabel,
      searchQuery,
      sortBy,
      activePodium,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedList = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  const selectedStudent = React.useMemo(
    () => honors.find((item) => item.id === selectedStudentId) ?? null,
    [honors, selectedStudentId],
  );

  const hasActiveFilters =
    selectedPeriod !== "all" ||
    selectedClass !== "all" ||
    selectedPeriodLabel !== "all" ||
    sortBy !== "rank_asc" ||
    searchQuery.trim().length > 0;

  if (loading) {
    return <HallOfFameSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
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
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase">
              <Trophy className="size-4 text-[#B8861E]" aria-hidden="true" />
              <span>Academic Honor Roll</span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Bảng vàng vinh danh học sinh
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Tôn vinh những cá nhân có thành tích bứt phá, thái độ học tập bền
              bỉ và đóng góp tích cực cho cộng đồng học thuật của lớp.
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            <span>
              {currentTerm || "Dữ liệu cập nhật trực tiếp"}
              {stats.latestPeriodLabel
                ? ` · Mới nhất: ${stats.latestPeriodLabel}`
                : ""}
            </span>
          </Badge>
        </div>

        {/* Summary Strip */}
        {!error && honors.length > 0 && (
          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warm text-primary">
                <Trophy className="size-5 text-[#B8861E]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Gương mặt vinh danh
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.totalHonors} học sinh
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Users className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Khối lớp góp mặt
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.uniqueClasses} lớp học
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-highlight/25 text-primary">
                <Layers className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Đợt vinh danh đã lưu
                </p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {stats.uniquePeriods} đợt ghi nhận
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Recovery Banner */}
      {error ? (
        <EmptyState
          title="Không thể tải Bảng vàng vinh danh"
          description={error}
          action={
            <Button type="button" variant="outline" onClick={handleRetry}>
              <RefreshCw className="size-4" aria-hidden="true" />
              <span>Thử tải lại</span>
            </Button>
          }
        />
      ) : (
        <>
          {/* Dynamic Period-Aware Podium (Hidden cleanly while searching/filtering specific class/batch) */}
          {activePodium && (
            <HallOfFamePodium
              podium={activePodium}
              selectedClass={selectedClass}
              onFilterClass={handleSelectClass}
              onSelectStudent={handleSelectStudent}
            />
          )}

          {/* Filter Toolbar + Archive Grid */}
          <section className="space-y-6">
            <HallOfFameToolbar
              selectedPeriod={selectedPeriod}
              onSelectPeriod={handleSelectPeriod}
              periodCounts={periodCounts}
              classes={availableClasses}
              selectedClass={selectedClass}
              onSelectClass={handleSelectClass}
              periodLabels={availablePeriodLabels}
              selectedPeriodLabel={selectedPeriodLabel}
              onSelectPeriodLabel={handleSelectPeriodLabel}
              sortBy={sortBy}
              onSortChange={handleSortChange}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              hasActiveFilters={hasActiveFilters}
              onResetFilters={handleResetFilters}
            />

            {honors.length === 0 ? (
              <EmptyState
                title="Bảng vàng chưa có hồ sơ vinh danh"
                description="Danh sách học viên xuất sắc sẽ tự động cập nhật sau mỗi kỳ thi thử và đánh giá định kỳ."
              />
            ) : filteredList.length === 0 && activePodium ? (
              <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-5 py-5 text-center sm:flex-row sm:text-left">
                <p className="text-sm text-muted-foreground">
                  Toàn bộ gương mặt tiêu biểu của{" "}
                  <strong className="font-semibold text-foreground">
                    {activePodium.periodLabel}
                  </strong>{" "}
                  đang được tôn vinh ở Bục Top 3 phía trên.
                </p>
                {selectedPeriod !== "all" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectPeriod("all")}
                  >
                    Xem tất cả các kỳ ({honors.length})
                  </Button>
                )}
              </div>
            ) : filteredList.length === 0 ? (
              <EmptyState
                title="Không tìm thấy hồ sơ vinh danh phù hợp"
                description="Thử chuyển sang kỳ vinh danh khác hoặc xóa từ khóa tìm kiếm."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                  >
                    Xem toàn bộ Bảng vàng
                  </Button>
                }
              />
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-base font-bold text-foreground sm:text-lg">
                    {activePodium
                      ? "Các kỳ & gương mặt vinh danh khác"
                      : "Kết quả tra cứu Bảng vàng"}{" "}
                    <span className="font-mono text-sm font-normal text-muted-foreground">
                      ({filteredList.length})
                    </span>
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {paginatedList.map((item) => (
                    <HallOfFameCard
                      key={item.id}
                      item={item}
                      selectedClass={selectedClass}
                      onFilterClass={handleSelectClass}
                      onSelectStudent={handleSelectStudent}
                      isHighlighted={selectedStudentId === item.id}
                    />
                  ))}
                </div>

                <PaginationBar
                  page={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredList.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(sz) => {
                    setPageSize(sz);
                    setPage(1);
                  }}
                  pageSizeOptions={[4, 6, 10, 20]}
                />
              </div>
            )}
          </section>
        </>
      )}

      <HallOfFameCertificateModal
        student={selectedStudent}
        endorser={endorser}
        currentTerm={currentTerm}
        onClose={handleCloseCertificate}
        onCopyShareLink={handleCopyShareLink}
      />
    </div>
  );
}

export default function HallOfFamePage() {
  return (
    <React.Suspense fallback={<HallOfFameSkeleton />}>
      <HallOfFameContent />
    </React.Suspense>
  );
}
