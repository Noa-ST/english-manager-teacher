"use client";

import * as React from "react";
import {
  CheckCircle2,
  Lock,
  MessageSquareShare,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import { removeVietnameseTones } from "@/lib/utils";
import type { AdminStudentRecord } from "@/services/classroom-data";
import {
  GRADE_COMMENT_CHIPS,
  computeIeltsOverall,
  computeStudentGradeDelta,
  formatGradeDateVi,
  type GradePublishStatus,
} from "@/services/grade-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";

export interface DraftGradeRow {
  studentId: string;
  code: string;
  fullName: string;
  classId: string;
  className: string;
  studentStatus: AdminStudentRecord["status"];
  grades: AdminStudentRecord["grades"];
  gradeId?: string;
  date?: string;
  listening: string;
  reading: string;
  writing: string;
  speaking: string;
  comment: string;
  privateNote: string;
  status: GradePublishStatus | "ungraded";
}

export function parseRowNumericScores(row: DraftGradeRow): {
  isGraded: boolean;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  speaking: number | null;
  overall: number | null;
} {
  const parseOne = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0 || n > 9) return null;
    return n;
  };
  const l = parseOne(row.listening);
  const r = parseOne(row.reading);
  const w = parseOne(row.writing);
  const s = parseOne(row.speaking);

  if (l === null || r === null || w === null || s === null) {
    return {
      isGraded: false,
      listening: l,
      reading: r,
      writing: w,
      speaking: s,
      overall: null,
    };
  }

  return {
    isGraded: true,
    listening: l,
    reading: r,
    writing: w,
    speaking: s,
    overall: computeIeltsOverall(l, r, w, s),
  };
}

interface GradesEntryTableProps {
  assessmentTitle: string;
  rows: DraftGradeRow[];
  onLeaveCountInScope: number;
  saving: boolean;
  changeReason: string;
  onChangeReason: (val: string) => void;
  onScoreChange: (
    studentId: string,
    skill: "listening" | "reading" | "writing" | "speaking",
    value: string,
  ) => void;
  onCommentChange: (studentId: string, comment: string) => void;
  onPrivateNoteChange: (studentId: string, privateNote: string) => void;
  onSaveBatch: (targetStatus: GradePublishStatus) => void;
  onOpenReport: (studentIds?: string[]) => void;
  onRequestDeleteGrade: (row: DraftGradeRow) => void;
}

type TableStatusFilter = "all" | "graded" | "ungraded" | "draft";

export function GradesEntryTable({
  assessmentTitle,
  rows,
  onLeaveCountInScope,
  saving,
  changeReason,
  onChangeReason,
  onScoreChange,
  onCommentChange,
  onPrivateNoteChange,
  onSaveBatch,
  onOpenReport,
  onRequestDeleteGrade,
}: GradesEntryTableProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<TableStatusFilter>("all");
  const [expandedChipsStudentId, setExpandedChipsStudentId] = React.useState<
    string | null
  >(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const filteredRows = React.useMemo(() => {
    const q = removeVietnameseTones(searchQuery.trim().toLowerCase());
    return rows.filter((row) => {
      const parsed = parseRowNumericScores(row);
      if (statusFilter === "graded" && !parsed.isGraded) return false;
      if (statusFilter === "ungraded" && parsed.isGraded) return false;
      if (statusFilter === "draft" && row.status !== "draft") return false;

      if (q) {
        const hay = removeVietnameseTones(
          `${row.fullName} ${row.code} ${row.className} ${row.comment}`.toLowerCase(),
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, searchQuery, statusFilter]);

  const readyToSaveCount = React.useMemo(
    () =>
      filteredRows.filter((row) => parseRowNumericScores(row).isGraded).length,
    [filteredRows],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const appendChipComment = (row: DraftGradeRow, chipText: string) => {
    const existing = row.comment.trim();
    if (existing.includes(chipText)) return;
    onCommentChange(row.studentId, existing ? `${existing} ${chipText}` : chipText);
  };

  return (
    <div className="space-y-3">
      {onLeaveCountInScope > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2 text-xs text-blue-900">
          Có <strong>{onLeaveCountInScope}</strong> học viên đang ở trạng thái Bảo lưu/Tạm nghỉ nên được ẩn khỏi danh sách chấm điểm kỳ này.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
        {/* Table Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
              {(
                [
                  ["all", `Tất cả (${rows.length})`],
                  ["graded", "Đã có điểm"],
                  ["ungraded", "Chưa chấm"],
                  ["draft", "Bản nháp"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(key);
                    setPage(1);
                  }}
                  className={`h-7 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === key
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
              <div className="relative flex-1 sm:w-56 sm:flex-none">
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
                  placeholder="Tìm tên, mã HS..."
                  className="h-9 pl-8 text-xs"
                />
              </div>

              <Input
                value={changeReason}
                onChange={(e) => onChangeReason(e.target.value)}
                placeholder="Lý do điều chỉnh điểm (nếu sửa)..."
                className="h-9 flex-1 text-xs sm:w-64 sm:flex-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs">
            <span className="text-muted-foreground">
              Học viên chưa thi để ô trống — chỉ lưu & tính trung bình trên{" "}
              <strong className="text-foreground">{readyToSaveCount}</strong> học viên đã nhập đủ 4 kỹ năng.
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={readyToSaveCount === 0}
                onClick={() => onOpenReport()}
                className="h-9 px-3.5 whitespace-nowrap text-xs"
              >
                <MessageSquareShare className="size-3.5 text-primary" aria-hidden="true" />
                Phiếu báo điểm cả lớp
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving || readyToSaveCount === 0}
                onClick={() => onSaveBatch("draft")}
                className="h-9 px-3.5 whitespace-nowrap text-xs"
              >
                <Save className="size-3.5" aria-hidden="true" />
                Lưu bản nháp
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || readyToSaveCount === 0}
                onClick={() => onSaveBatch("published")}
                className="h-9 px-4 whitespace-nowrap text-xs"
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {saving ? "Đang lưu..." : "Lưu & Công bố Cổng HS"}
              </Button>
            </div>
          </div>
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Chưa có học viên nào trong phạm vi lọc"
              description="Hãy chuyển sang lớp khác hoặc bỏ bộ lọc trạng thái."
            />
          </div>
        ) : filteredRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Không có học viên nào khớp điều kiện tìm kiếm.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-muted-foreground">
                  <th className="px-4 py-3">Học viên & Trạng thái</th>
                  <th className="w-20 px-2 py-3 text-center">Listening</th>
                  <th className="w-20 px-2 py-3 text-center">Reading</th>
                  <th className="w-20 px-2 py-3 text-center">Writing</th>
                  <th className="w-20 px-2 py-3 text-center">Speaking</th>
                  <th className="w-24 px-2 py-3 text-center">Overall</th>
                  <th className="min-w-[290px] px-3 py-3">
                    Nhận xét chuyên môn & Nội bộ GV
                  </th>
                  <th className="w-[164px] px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {paginatedRows.map((row) => {
                  const parsed = parseRowNumericScores(row);
                  const { delta } = computeStudentGradeDelta(
                    { grades: row.grades },
                    assessmentTitle,
                    parsed.overall,
                  );
                  const isChipsExpanded =
                    expandedChipsStudentId === row.studentId;

                  return (
                    <tr
                      key={row.studentId}
                      className="transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-heading text-sm font-bold text-foreground">
                            {row.fullName}
                          </span>
                          {row.studentStatus === "trial" && (
                            <Badge variant="info" className="text-[10px]">
                              Học thử
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {row.code} · {row.className}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {row.status === "published" && parsed.isGraded ? (
                            <Badge variant="success" className="text-[10px]">
                              Đã công bố
                            </Badge>
                          ) : row.status === "draft" && parsed.isGraded ? (
                            <Badge variant="warning" className="text-[10px]">
                              Bản nháp
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Chưa chấm
                            </Badge>
                          )}
                          {row.date && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {formatGradeDateVi(row.date)}
                            </span>
                          )}
                        </div>
                      </td>

                      {(
                        ["listening", "reading", "writing", "speaking"] as const
                      ).map((skill) => (
                        <td key={skill} className="px-1.5 py-3 align-middle text-center">
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            max="9"
                            placeholder="-"
                            value={row[skill]}
                            onChange={(e) =>
                              onScoreChange(row.studentId, skill, e.target.value)
                            }
                            aria-label={`Điểm ${skill} của ${row.fullName}`}
                            className="mx-auto h-8 w-16 text-center font-mono text-xs font-semibold tabular-nums"
                          />
                        </td>
                      ))}

                      <td className="px-2 py-3 align-middle text-center">
                        {parsed.overall !== null ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <Badge variant="default" className="font-mono text-xs">
                              {parsed.overall.toFixed(1)}
                            </Badge>
                            {delta !== null && delta !== 0 && (
                              <span
                                className={`text-[10px] font-semibold tabular-nums ${
                                  delta > 0
                                    ? "text-emerald-700"
                                    : "text-destructive"
                                }`}
                              >
                                {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5 align-middle">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="text"
                              value={row.comment}
                              onChange={(e) =>
                                onCommentChange(row.studentId, e.target.value)
                              }
                              placeholder="Nhận xét công khai (hiện Cổng HS khi Công bố)..."
                              aria-label={`Nhận xét công khai cho ${row.fullName}`}
                              className="h-8 flex-1 text-xs"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant={isChipsExpanded ? "secondary" : "outline"}
                              onClick={() =>
                                setExpandedChipsStudentId(
                                  isChipsExpanded ? null : row.studentId,
                                )
                              }
                              title="Mở gợi ý nhận xét 4 kỹ năng"
                              className="size-8 shrink-0"
                            >
                              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                            </Button>
                          </div>

                          {isChipsExpanded && (
                            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-2">
                              {GRADE_COMMENT_CHIPS.map((chip) => (
                                <button
                                  key={chip.id}
                                  type="button"
                                  onClick={() => appendChipComment(row, chip.text)}
                                  className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                                >
                                  + {chip.label}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="relative">
                            <Lock
                              className="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-amber-700"
                              aria-hidden="true"
                            />
                            <Input
                              type="text"
                              value={row.privateNote}
                              onChange={(e) =>
                                onPrivateNoteChange(row.studentId, e.target.value)
                              }
                              placeholder="Ghi chú nội bộ GV (ẩn hoàn toàn với HS & PH)..."
                              aria-label={`Ghi chú nội bộ cho ${row.fullName}`}
                              className="h-8 border-amber-200/80 bg-amber-50/40 pl-7 text-[11px] text-amber-950 placeholder:text-amber-700/60"
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 align-middle text-right whitespace-nowrap">
                        <div className="flex flex-nowrap items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!parsed.isGraded}
                            onClick={() => onOpenReport([row.studentId])}
                            className="h-8 px-3 text-xs whitespace-nowrap"
                          >
                            <MessageSquareShare className="size-3.5" aria-hidden="true" />
                            Báo điểm PH
                          </Button>
                          {row.gradeId && (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() => onRequestDeleteGrade(row)}
                              aria-label={`Xóa điểm kỳ ${assessmentTitle} của ${row.fullName}`}
                              title="Xóa bản ghi điểm"
                              className="size-8 shrink-0 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredRows.length > 0 && (
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            totalItems={filteredRows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
          />
        )}
      </div>
    </div>
  );
}
