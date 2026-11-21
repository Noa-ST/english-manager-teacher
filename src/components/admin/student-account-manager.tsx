"use client";

import * as React from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Unlock,
  UserPlus,
  Users,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { generateStrongAccountPassword } from "@/services/settings-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

interface ManagedAccountItem {
  profileId: string | null;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  email: string | null;
  role: "admin" | "student";
  isActive: boolean;
  hasAuthAccount: boolean;
  lastSignInAt: string | null;
}

export function StudentAccountManager({
  onAccountMutated,
}: {
  onAccountMutated?: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<ManagedAccountItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedStudentId, setSelectedStudentId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showCreatePassword, setShowCreatePassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Modal & Confirm dialog state
  const [resetTarget, setResetTarget] =
    React.useState<ManagedAccountItem | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = React.useState("");
  const [showResetPassword, setShowResetPassword] = React.useState(false);
  const [resetSubmitting, setResetSubmitting] = React.useState(false);
  const [togglingTarget, setTogglingTarget] =
    React.useState<ManagedAccountItem | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "linked" | "unlinked" | "active" | "inactive"
  >("all");

  // Pagination state
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const accountStats = React.useMemo(() => {
    const linked = items.filter((i) => i.hasAuthAccount).length;
    const active = items.filter((i) => i.hasAuthAccount && i.isActive).length;
    const unlinkedOrLocked = items.length - active;
    return { total: items.length, linked, active, unlinkedOrLocked };
  }, [items]);

  const filteredAccounts = React.useMemo(() => {
    return items.filter((item) => {
      if (statusFilter === "linked" && !item.hasAuthAccount) return false;
      if (statusFilter === "unlinked" && item.hasAuthAccount) return false;
      if (statusFilter === "active" && (!item.hasAuthAccount || !item.isActive)) {
        return false;
      }
      if (statusFilter === "inactive" && (!item.hasAuthAccount || item.isActive)) {
        return false;
      }

      if (!searchTerm.trim()) return true;
      const q = searchTerm.trim().toLowerCase();
      return (
        item.fullName.toLowerCase().includes(q) ||
        item.studentCode.toLowerCase().includes(q) ||
        item.className.toLowerCase().includes(q) ||
        Boolean(item.email && item.email.toLowerCase().includes(q))
      );
    });
  }, [items, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedAccounts = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [filteredAccounts, currentPage, pageSize]);

  const loadAccounts = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<ManagedAccountItem[]>("/api/admin/accounts");
      setItems(data);
      const firstUnlinked = data.find((item) => !item.hasAuthAccount);
      if (firstUnlinked) {
        setSelectedStudentId((prev) => prev || firstUnlinked.studentId);
      }
    } catch (err) {
      toast({
        title: "Không tải được danh sách tài khoản",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    let active = true;
    apiRequest<ManagedAccountItem[]>("/api/admin/accounts")
      .then((data) => {
        if (!active) return;
        setItems(data);
        const firstUnlinked = data.find((item) => !item.hasAuthAccount);
        if (firstUnlinked) {
          setSelectedStudentId((prev) => prev || firstUnlinked.studentId);
        }
      })
      .catch((err) => {
        if (!active) return;
        toast({
          title: "Không tải được danh sách tài khoản",
          description: err instanceof Error ? err.message : "Vui lòng thử lại.",
          variant: "error",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [toast]);

  const unlinkedStudents = items.filter((item) => !item.hasAuthAccount);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !email.trim() || password.length < 8) {
      toast({
        title: "Thiếu thông tin",
        description:
          "Chọn học sinh, nhập email hợp lệ và mật khẩu tối thiểu 8 ký tự.",
        variant: "error",
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest("/api/admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          studentId: selectedStudentId,
          email: email.trim(),
          password,
        }),
      });
      toast({
        title: "Đã tạo tài khoản học sinh",
        description: `Đã cấp tài khoản Supabase Auth cho ${email.trim()}.`,
        variant: "success",
      });
      setEmail("");
      setPassword("");
      setShowCreatePassword(false);
      setSelectedStudentId("");
      await loadAccounts();
      onAccountMutated?.();
    } catch (err) {
      toast({
        title: "Không thể tạo tài khoản",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmToggleActive = async () => {
    if (!togglingTarget?.profileId) return;
    const item = togglingTarget;
    try {
      await apiRequest("/api/admin/accounts", {
        method: "PATCH",
        body: JSON.stringify({
          profileId: item.profileId,
          isActive: !item.isActive,
        }),
      });
      toast({
        title: item.isActive
          ? "Đã vô hiệu hóa tài khoản"
          : "Đã kích hoạt lại tài khoản",
        description: `${item.fullName} (${item.email})`,
        variant: "success",
      });
      await loadAccounts();
      onAccountMutated?.();
    } catch (err) {
      toast({
        title: "Cập nhật trạng thái thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setTogglingTarget(null);
    }
  };

  const openResetPasswordModal = (item: ManagedAccountItem) => {
    setResetTarget(item);
    setResetPasswordValue("");
    setShowResetPassword(false);
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget?.profileId) return;
    if (resetPasswordValue.length < 8) {
      toast({
        title: "Mật khẩu quá ngắn",
        description: "Mật khẩu mới phải có ít nhất 8 ký tự.",
        variant: "error",
      });
      return;
    }

    setResetSubmitting(true);
    try {
      await apiRequest("/api/admin/accounts", {
        method: "PATCH",
        body: JSON.stringify({
          profileId: resetTarget.profileId,
          newPassword: resetPasswordValue,
        }),
      });
      toast({
        title: "Đã đặt lại mật khẩu",
        description: `Mật khẩu của ${resetTarget.email ?? resetTarget.fullName} đã được cập nhật.`,
        variant: "success",
      });
      setResetTarget(null);
      setResetPasswordValue("");
      onAccountMutated?.();
    } catch (err) {
      toast({
        title: "Đặt lại mật khẩu thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold text-foreground">
              Quản lý Tài khoản Học sinh (Supabase Auth · RBAC)
            </h2>
            <p className="text-xs text-muted-foreground">
              Chỉ giáo viên (ADMIN) mới có quyền cấp, khóa hoặc đặt lại mật khẩu tài khoản STUDENT.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadAccounts()}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Làm mới
        </Button>
      </div>

      {/* 4 Compact Account Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-background/60 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">Tổng hồ sơ HS</p>
          <p className="mt-0.5 font-heading text-lg font-bold text-foreground">
            {accountStats.total}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/60 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">Đã cấp Auth 1:1</p>
          <p className="mt-0.5 font-heading text-lg font-bold text-primary">
            {accountStats.linked}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/60 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">Đang hoạt động</p>
          <p className="mt-0.5 font-heading text-lg font-bold text-emerald-700">
            {accountStats.active}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/60 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">Chưa cấp / Đã khóa</p>
          <p className="mt-0.5 font-heading text-lg font-bold text-amber-700">
            {accountStats.unlinkedOrLocked}
          </p>
        </div>
      </div>

      {/* Create student account form */}
      <form
        onSubmit={handleCreateAccount}
        className="grid gap-3 rounded-xl border border-border bg-muted/25 p-4 md:grid-cols-4"
      >
        <div className="space-y-1">
          <label
            htmlFor="acc-student"
            className="text-xs font-semibold text-foreground"
          >
            Hồ sơ học sinh (1:1)
          </label>
          <select
            id="acc-student"
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
            disabled={unlinkedStudents.length === 0}
          >
            {unlinkedStudents.length === 0 ? (
              <option value="">Tất cả học sinh đã có tài khoản</option>
            ) : (
              unlinkedStudents.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.studentCode} — {s.fullName}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="acc-email"
            className="text-xs font-semibold text-foreground"
          >
            Email đăng nhập
          </label>
          <Input
            id="acc-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.com"
            className="h-9 text-xs"
            disabled={unlinkedStudents.length === 0}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="acc-pass"
              className="text-xs font-semibold text-foreground"
            >
              Mật khẩu khởi tạo
            </label>
            <button
              type="button"
              onClick={() => {
                setPassword(generateStrongAccountPassword());
                setShowCreatePassword(true);
              }}
              disabled={unlinkedStudents.length === 0}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              Tạo MK mạnh
            </button>
          </div>
          <div className="relative">
            <Input
              id="acc-pass"
              type={showCreatePassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              className="h-9 pr-9 text-xs"
              disabled={unlinkedStudents.length === 0}
            />
            <button
              type="button"
              onClick={() => setShowCreatePassword((v) => !v)}
              aria-label={showCreatePassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showCreatePassword ? (
                <EyeOff className="size-3.5" aria-hidden="true" />
              ) : (
                <Eye className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-end">
          <Button
            type="submit"
            size="sm"
            className="h-9 w-full"
            disabled={submitting || unlinkedStudents.length === 0}
          >
            <UserPlus className="size-3.5" aria-hidden="true" />
            {submitting ? "Đang tạo..." : "Cấp tài khoản STUDENT"}
          </Button>
        </div>
      </form>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên học sinh, mã HS, lớp học hoặc email..."
            className="h-9 pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(
                e.target.value as
                  | "all"
                  | "linked"
                  | "unlinked"
                  | "active"
                  | "inactive",
              );
              setPage(1);
            }}
            aria-label="Lọc theo trạng thái tài khoản"
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            <option value="all">Tất cả ({items.length})</option>
            <option value="linked">
              Đã cấp tài khoản ({items.filter((i) => i.hasAuthAccount).length})
            </option>
            <option value="unlinked">
              Chưa cấp tài khoản ({items.filter((i) => !i.hasAuthAccount).length})
            </option>
            <option value="active">
              Đang hoạt động (
              {items.filter((i) => i.hasAuthAccount && i.isActive).length})
            </option>
            <option value="inactive">
              Đã vô hiệu hóa (
              {items.filter((i) => i.hasAuthAccount && !i.isActive).length})
            </option>
          </select>
        </div>
      </div>

      {/* Accounts table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã HS</TableHead>
              <TableHead>Học sinh</TableHead>
              <TableHead>Email Supabase Auth</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-xs text-muted-foreground"
                >
                  Đang tải danh sách tài khoản...
                </TableCell>
              </TableRow>
            ) : paginatedAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8">
                  <EmptyState
                    icon={<Users className="size-6 text-muted-foreground" />}
                    title="Không tìm thấy tài khoản phù hợp"
                    description={
                      searchTerm
                        ? `Không có học sinh nào khớp với từ khóa "${searchTerm}".`
                        : "Chưa có tài khoản nào theo bộ lọc đã chọn."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paginatedAccounts.map((item) => (
                <TableRow key={item.studentId}>
                  <TableCell className="font-mono text-xs font-semibold">
                    {item.studentCode}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold text-foreground">
                      {item.fullName}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.className}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.hasAuthAccount ? (
                      <span className="font-mono text-foreground">
                        {item.email}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Chưa cấp tài khoản
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {!item.hasAuthAccount ? (
                      <Badge variant="outline">Chưa kích hoạt</Badge>
                    ) : item.isActive ? (
                      <Badge variant="success">Đang hoạt động</Badge>
                    ) : (
                      <Badge variant="destructive">Đã vô hiệu hóa</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.hasAuthAccount && item.profileId ? (
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openResetPasswordModal(item)}
                        >
                          <KeyRound className="size-3.5" aria-hidden="true" />
                          Đổi MK
                        </Button>
                        <Button
                          type="button"
                          variant={item.isActive ? "outline" : "default"}
                          size="sm"
                          onClick={() => setTogglingTarget(item)}
                        >
                          {item.isActive ? (
                            <Lock className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Unlock className="size-3.5" aria-hidden="true" />
                          )}
                          {item.isActive ? "Khóa" : "Mở khóa"}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        —
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Bar */}
      {filteredAccounts.length > 0 && (
        <PaginationBar
          page={currentPage}
          totalPages={totalPages}
          totalItems={filteredAccounts.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
          pageSizeOptions={[5, 10, 20]}
        />
      )}

      {/* ModalDialog thay thế window.prompt() khi đặt lại mật khẩu học sinh */}
      <ModalDialog
        open={Boolean(resetTarget)}
        onClose={() => {
          if (!resetSubmitting) {
            setResetTarget(null);
            setResetPasswordValue("");
          }
        }}
        title="Đặt lại Mật khẩu Học sinh"
        description={
          resetTarget
            ? `Cập nhật mật khẩu đăng nhập cho ${resetTarget.fullName} (${resetTarget.email ?? resetTarget.studentCode}).`
            : undefined
        }
        size="sm"
      >
        <form onSubmit={handleConfirmResetPassword} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="modal-reset-pass"
                className="text-xs font-semibold text-foreground"
              >
                Mật khẩu mới (tối thiểu 8 ký tự)
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetPasswordValue(generateStrongAccountPassword());
                  setShowResetPassword(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                Tạo mật khẩu mạnh
              </button>
            </div>

            <div className="relative">
              <Input
                id="modal-reset-pass"
                type={showResetPassword ? "text" : "password"}
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                placeholder="Nhập mật khẩu mới tối thiểu 8 ký tự"
                className="pr-10 font-mono text-xs"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowResetPassword((v) => !v)}
                aria-label={showResetPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showResetPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {resetPasswordValue.length > 0 && resetPasswordValue.length < 8 && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
                Cần thêm {8 - resetPasswordValue.length} ký tự để đạt độ dài tối thiểu.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResetTarget(null);
                setResetPasswordValue("");
              }}
              disabled={resetSubmitting}
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              disabled={resetSubmitting || resetPasswordValue.length < 8}
            >
              <KeyRound className="size-4" aria-hidden="true" />
              {resetSubmitting ? "Đang cập nhật..." : "Xác nhận đổi mật khẩu"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* ConfirmDialog xác nhận khóa / mở khóa tài khoản */}
      <ConfirmDialog
        open={Boolean(togglingTarget)}
        onClose={() => setTogglingTarget(null)}
        onConfirm={() => void handleConfirmToggleActive()}
        title={
          togglingTarget?.isActive
            ? `Khóa tài khoản ${togglingTarget.fullName}?`
            : `Mở khóa tài khoản ${togglingTarget?.fullName ?? ""}?`
        }
        description={
          togglingTarget?.isActive
            ? `Học sinh (${togglingTarget.email ?? togglingTarget.studentCode}) sẽ bị ngắt quyền đăng nhập Supabase Auth cho đến khi bạn mở khóa lại.`
            : `Học sinh (${togglingTarget?.email ?? togglingTarget?.studentCode ?? ""}) sẽ được khôi phục quyền truy cập Cổng học sinh.`
        }
        confirmLabel={togglingTarget?.isActive ? "Xác nhận khóa" : "Mở khóa ngay"}
        variant={togglingTarget?.isActive ? "destructive" : "default"}
      />
    </section>
  );
}
