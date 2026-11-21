"use client";

import * as React from "react";
import {
  CheckCircle2,
  ClipboardEdit,
  History,
  PencilLine,
  Search,
  Send,
  Trash2,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { removeVietnameseTones } from "@/lib/utils";
import type {
  AssessmentSummaryItem,
  GradeAuditEntry,
} from "@/services/grade-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

interface GradesAuditTabProps {
  assessmentStats: AssessmentSummaryItem[];
  changeHistory: GradeAuditEntry[];
  onOpenAssessment: (title: string) => void;
  onRefresh: () => Promise<void>;
}

export function GradesAuditTab({
  assessmentStats,
  changeHistory,
  onOpenAssessment,
  onRefresh,
}: GradesAuditTabProps) {
  const { toast } = useToast();
  const [auditSearch, setAuditSearch] = React.useState("");
  const [renamingTarget, setRenamingTarget] = React.useState<string | null>(
    null,
  );
  const [renameNewTitle, setRenameNewTitle] = React.useState("");
  const [deletingTitle, setDeletingTitle] = React.useState<string | null>(null);
  const [busyTitle, setBusyTitle] = React.useState<string | null>(null);

  const filteredHistory = React.useMemo(() => {
    const q = removeVietnameseTones(auditSearch.trim().toLowerCase());
    if (!q) return changeHistory;
    return changeHistory.filter((item) =>
      removeVietnameseTones(
        `${item.studentName} ${item.studentCode} ${item.assessmentTitle} ${item.reason ?? ""}`.toLowerCase(),
      ).includes(q),
    );
  }, [changeHistory, auditSearch]);

  const handlePublishAssessment = async (title: string) => {
    setBusyTitle(title);
    try {
      const res = await apiRequest<{ publishedCount: number }>(
        "/api/admin/grades",
        {
          method: "POST",
          body: JSON.stringify({
            action: "publish-assessment",
            assessmentTitle: title,
          }),
        },
      );
      toast({
        variant: "success",
        title: `Đã công bố ${res.publishedCount} bản ghi điểm`,
        description: `Kỳ "${title}" đã hiển thị trên Cổng Học sinh.`,
      });
      await onRefresh();
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể công bố kỳ kiểm tra",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyTitle(null);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingTarget || renameNewTitle.trim().length < 3) return;

    setBusyTitle(renamingTarget);
    try {
      await apiRequest("/api/admin/grades", {
        method: "PATCH",
        body: JSON.stringify({
          action: "rename-assessment",
          oldTitle: renamingTarget,
          newTitle: renameNewTitle.trim(),
        }),
      });
      toast({
        variant: "success",
        title: "Đã đổi tên kỳ kiểm tra",
      });
      setRenamingTarget(null);
      setRenameNewTitle("");
      await onRefresh();
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể đổi tên kỳ kiểm tra",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyTitle(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deletingTitle) return;
    const title = deletingTitle;
    try {
      const params = new URLSearchParams({
        action: "delete-assessment",
        title,
      });
      await apiRequest(`/api/admin/grades?${params.toString()}`, {
        method: "DELETE",
      });
      toast({
        variant: "success",
        title: "Đã xóa kỳ kiểm tra",
        description: title,
      });
      await onRefresh();
    } catch (err) {
      toast({
        variant: "error",
        title: "Không thể xóa kỳ kiểm tra",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeletingTitle(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Assessments Catalog Table */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
              <ClipboardEdit className="size-4 text-primary" aria-hidden="true" />
              Danh mục kỳ kiểm tra & Tiến độ công bố ({assessmentStats.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Theo dõi số học viên đã chấm, bản nháp chưa công bố và quản lý tên kỳ kiểm tra.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-muted-foreground">
                <th className="px-4 py-3">Tên kỳ kiểm tra</th>
                <th className="px-4 py-3 text-center">Đã chấm</th>
                <th className="px-4 py-3 text-center">Công bố / Nháp</th>
                <th className="px-4 py-3 text-center">Overall TB</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {assessmentStats.map((item) => (
                <tr key={item.title} className="hover:bg-muted/20">
                  <td className="px-4 py-3.5">
                    <p className="font-heading font-semibold text-foreground">
                      {item.title}
                    </p>
                    {item.latestDate && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Cập nhật ngày thi: {item.latestDate}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono text-xs font-semibold tabular-nums">
                    {item.gradedCount} HV
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <div className="inline-flex items-center gap-1.5 text-xs">
                      <Badge variant="success" className="text-[11px]">
                        {item.publishedCount} công bố
                      </Badge>
                      {item.draftCount > 0 && (
                        <Badge variant="warning" className="text-[11px]">
                          {item.draftCount} nháp
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono text-sm font-bold tabular-nums text-primary">
                    {item.averageOverall !== null
                      ? item.averageOverall.toFixed(1)
                      : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="flex flex-nowrap items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={() => onOpenAssessment(item.title)}
                        className="h-8 px-2.5 text-xs whitespace-nowrap"
                      >
                        Mở bảng điểm
                      </Button>
                      {item.draftCount > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyTitle === item.title}
                          onClick={() => void handlePublishAssessment(item.title)}
                          className="h-8 px-2.5 text-xs whitespace-nowrap"
                        >
                          <Send className="size-3.5 text-emerald-600" aria-hidden="true" />
                          Công bố tất cả
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => {
                          setRenamingTarget(item.title);
                          setRenameNewTitle(item.title);
                        }}
                        title="Đổi tên kỳ kiểm tra"
                        aria-label={`Đổi tên kỳ ${item.title}`}
                        className="size-8 shrink-0"
                      >
                        <PencilLine className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setDeletingTitle(item.title)}
                        title="Xóa kỳ kiểm tra (chỉ cho xóa khi chưa có điểm)"
                        aria-label={`Xóa kỳ ${item.title}`}
                        className="size-8 shrink-0 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit Trail */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
              <History className="size-4 text-primary" aria-hidden="true" />
              Nhật ký điều chỉnh & Xóa điểm (Audit Trail · {filteredHistory.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Ghi nhận tự động mỗi khi điểm Overall hoặc điểm thành phần của học viên được sửa đổi hay xóa bỏ.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Tìm tên HS, kỳ thi, lý do..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Chưa có lịch sử điều chỉnh điểm nào khớp bộ lọc.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold uppercase tracking-wide whitespace-nowrap text-muted-foreground">
                  <th className="px-4 py-2.5">Ngày sửa</th>
                  <th className="px-4 py-2.5">Học viên</th>
                  <th className="px-4 py-2.5">Kỳ kiểm tra</th>
                  <th className="px-4 py-2.5 text-center">Thay đổi Overall</th>
                  <th className="px-4 py-2.5">Lý do & Người sửa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredHistory.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-muted-foreground tabular-nums">
                      {log.changedAt}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">
                        {log.studentName}
                      </span>{" "}
                      <span className="font-mono text-muted-foreground">
                        ({log.studentCode})
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {log.assessmentTitle}
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-semibold tabular-nums">
                      <span className="text-muted-foreground">
                        {log.oldScore.toFixed(1)}
                      </span>{" "}
                      →{" "}
                      <span className="text-primary">
                        {log.newScore.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.reason || "Cập nhật điểm"} ·{" "}
                      <span className="text-foreground">{log.changedBy}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Rename Modal */}
      <ModalDialog
        open={Boolean(renamingTarget)}
        onClose={() => setRenamingTarget(null)}
        title="Đổi tên kỳ kiểm tra"
        description="Đồng bộ cập nhật tên mới trên toàn bộ hồ sơ học viên và lịch sử điểm."
        size="sm"
      >
        <form onSubmit={handleRenameSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rename-assessment-input">Tên kỳ kiểm tra mới</Label>
            <Input
              id="rename-assessment-input"
              value={renameNewTitle}
              onChange={(e) => setRenameNewTitle(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenamingTarget(null)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={Boolean(busyTitle)}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Lưu tên mới
            </Button>
          </div>
        </form>
      </ModalDialog>

      <ConfirmDialog
        open={Boolean(deletingTitle)}
        onClose={() => setDeletingTitle(null)}
        onConfirm={() => void handleDeleteConfirmed()}
        variant="destructive"
        title="Xác nhận xóa kỳ kiểm tra"
        description={`Xóa kỳ "${deletingTitle ?? ""}" khỏi danh mục? Hệ thống chỉ cho phép xóa khi chưa có bản ghi điểm nào thuộc kỳ thi này.`}
        confirmLabel="Xóa kỳ thi"
      />
    </div>
  );
}
