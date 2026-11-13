"use client";

import * as React from "react";
import { KeyRound, RefreshCw, ShieldAlert, UserPlus, Users } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function StudentAccountManager() {
  const { toast } = useToast();
  const [items, setItems] = React.useState<ManagedAccountItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedStudentId, setSelectedStudentId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

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
        description: "Chọn học sinh, nhập email hợp lệ và mật khẩu tối thiểu 8 ký tự.",
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
      setSelectedStudentId("");
      await loadAccounts();
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

  const handleToggleActive = async (item: ManagedAccountItem) => {
    if (!item.profileId) return;
    try {
      await apiRequest("/api/admin/accounts", {
        method: "PATCH",
        body: JSON.stringify({
          profileId: item.profileId,
          isActive: !item.isActive,
        }),
      });
      toast({
        title: item.isActive ? "Đã vô hiệu hóa tài khoản" : "Đã kích hoạt lại tài khoản",
        description: `${item.fullName} (${item.email})`,
        variant: "success",
      });
      await loadAccounts();
    } catch (err) {
      toast({
        title: "Cập nhật trạng thái thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
    }
  };

  const handleResetPassword = async (item: ManagedAccountItem) => {
    if (!item.profileId) return;
    const nextPassword = window.prompt(
      `Nhập mật khẩu mới cho ${item.fullName} (${item.email}) — tối thiểu 8 ký tự:`,
    );
    if (!nextPassword) return;
    if (nextPassword.length < 8) {
      toast({
        title: "Mật khẩu quá ngắn",
        description: "Mật khẩu mới phải có ít nhất 8 ký tự.",
        variant: "error",
      });
      return;
    }
    try {
      await apiRequest("/api/admin/accounts", {
        method: "PATCH",
        body: JSON.stringify({
          profileId: item.profileId,
          newPassword: nextPassword,
        }),
      });
      toast({
        title: "Đã đặt lại mật khẩu",
        description: `Mật khẩu của ${item.email} đã được cập nhật.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Đặt lại mật khẩu thất bại",
        description: err instanceof Error ? err.message : "Vui lòng thử lại.",
        variant: "error",
      });
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
        <Button type="button" variant="outline" size="sm" onClick={() => void loadAccounts()}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Làm mới
        </Button>
      </div>

      {/* Create student account form */}
      <form
        onSubmit={handleCreateAccount}
        className="grid gap-3 rounded-xl border border-border bg-muted/25 p-4 md:grid-cols-4"
      >
        <div className="space-y-1">
          <label htmlFor="acc-student" className="text-xs font-semibold text-foreground">
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
          <label htmlFor="acc-email" className="text-xs font-semibold text-foreground">
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
          <label htmlFor="acc-pass" className="text-xs font-semibold text-foreground">
            Mật khẩu khởi tạo
          </label>
          <Input
            id="acc-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tối thiểu 8 ký tự"
            className="h-9 text-xs"
            disabled={unlinkedStudents.length === 0}
          />
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

      {/* Accounts table */}
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
              <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                Đang tải danh sách tài khoản...
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.studentId}>
                <TableCell className="font-mono text-xs font-semibold">
                  {item.studentCode}
                </TableCell>
                <TableCell>
                  <div className="text-xs font-semibold text-foreground">{item.fullName}</div>
                  <div className="text-[11px] text-muted-foreground">{item.className}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {item.hasAuthAccount ? (
                    <span className="font-mono text-foreground">{item.email}</span>
                  ) : (
                    <span className="text-muted-foreground italic">Chưa cấp tài khoản</span>
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
                        onClick={() => void handleResetPassword(item)}
                      >
                        <KeyRound className="size-3.5" aria-hidden="true" />
                        Đổi MK
                      </Button>
                      <Button
                        type="button"
                        variant={item.isActive ? "outline" : "default"}
                        size="sm"
                        onClick={() => void handleToggleActive(item)}
                      >
                        <ShieldAlert className="size-3.5" aria-hidden="true" />
                        {item.isActive ? "Khóa" : "Mở khóa"}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
