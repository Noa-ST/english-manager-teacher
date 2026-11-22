"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { cn } from "cn";
import { apiRequest } from "@/lib/api-client";
import { ADMIN_NAV } from "@/lib/routes";
import type { AdminStudentRecord, ClassroomGroup } from "@/services/domain-types";
import {
  persistTeacherBrandLocally,
  readStoredTeacherBrand,
  SETTINGS_UPDATED_EVENT,
} from "@/services/settings-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Breadcrumb } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { ToastProvider, useToast } from "@/components/ui/toast";

const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/dashboard": LayoutDashboard,
  "/students": Users,
  "/classes": BookOpen,
  "/schedule": CalendarDays,
  "/teaching-journal": ClipboardList,
  "/attendance": CheckSquare,
  "/grades": FileSpreadsheet,
  "/class-analytics": BarChart3,
  "/cms": Newspaper,
  "/storage": FolderKanban,
  "/settings": Settings,
};

interface ShellNotification {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
}

interface ShellBrandMeta {
  name: string;
  avatarUrl: string;
  currentTerm: string;
}

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [students, setStudents] = React.useState<AdminStudentRecord[]>([]);
  const [classes, setClasses] = React.useState<ClassroomGroup[]>([]);
  const [notifications, setNotifications] = React.useState<ShellNotification[]>([]);
  const [brandMeta, setBrandMeta] = React.useState<ShellBrandMeta>({
    name: "",
    avatarUrl: "",
    currentTerm: "",
  });

  // Sync live brand, term, global search index & notifications from PostgreSQL APIs
  React.useEffect(() => {
    let active = true;

    const cached = readStoredTeacherBrand();
    if (cached) {
      Promise.resolve().then(() => {
        if (!active) return;
        setBrandMeta((prev) => ({
          name: cached.name?.trim() ? cached.name : prev.name,
          avatarUrl: cached.avatarUrl?.trim() ? cached.avatarUrl : prev.avatarUrl,
          currentTerm: prev.currentTerm,
        }));
      });
    }

    apiRequest<Partial<ShellBrandMeta>>("/api/admin/settings")
      .then((res) => {
        if (!active || !res) return;
        setBrandMeta((prev) => ({
          name: res.name?.trim() ? res.name : prev.name,
          avatarUrl: res.avatarUrl?.trim() ? res.avatarUrl : prev.avatarUrl,
          currentTerm: res.currentTerm?.trim() ? res.currentTerm : prev.currentTerm,
        }));
        if (res.name || res.avatarUrl) {
          persistTeacherBrandLocally({
            ...(cached ?? {}),
            ...(res.name ? { name: res.name } : {}),
            ...(res.avatarUrl ? { avatarUrl: res.avatarUrl } : {}),
          });
        }
      })
      .catch(() => { });

    Promise.allSettled([
      apiRequest<AdminStudentRecord[]>(
        "/api/admin/students?status=non-archived&page=1&pageSize=200",
      ),
      apiRequest<ClassroomGroup[]>("/api/admin/classes"),
    ]).then(([stuRes, clsRes]) => {
      if (!active) return;
      const fetchedStudents =
        stuRes.status === "fulfilled" && Array.isArray(stuRes.value)
          ? stuRes.value
          : [];
      const fetchedClasses =
        clsRes.status === "fulfilled" && Array.isArray(clsRes.value)
          ? clsRes.value
          : [];

      setStudents(fetchedStudents);
      setClasses(fetchedClasses);

      const liveNotifs: ShellNotification[] = [];
      const activeCls = fetchedClasses.find((c) => c.status === "active");
      if (activeCls) {
        liveNotifs.push({
          id: `notif-cls-${activeCls.id}`,
          title: `Lớp ${activeCls.name} đang vận hành`,
          detail: `${activeCls.room} · ${activeCls.enrolled}/${activeCls.capacity} học sinh · ${activeCls.scheduleSummary}`,
          time: "Đang diễn ra",
          unread: true,
        });
      }

      const tuitionDueStudents = fetchedStudents.filter(
        (s) =>
          (s.tuitionStatus === "overdue" || s.tuitionStatus === "due-soon") &&
          s.status !== "trial",
      );
      if (tuitionDueStudents.length > 0) {
        const firstStu = tuitionDueStudents[0];
        liveNotifs.push({
          id: "notif-tuition-due",
          title: `${tuitionDueStudents.length} học sinh cần nhắc hạn học phí`,
          detail: `${firstStu.fullName} (${firstStu.code}) · Hạn ${firstStu.tuitionDueDate}`,
          time: "Hôm nay",
          unread: true,
        });
      }

      setNotifications(liveNotifs);
    });

    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<ShellBrandMeta>>).detail;
      if (!detail) return;
      setBrandMeta((prev) => ({
        name: detail.name?.trim() ? detail.name : prev.name,
        avatarUrl: detail.avatarUrl?.trim() ? detail.avatarUrl : prev.avatarUrl,
        currentTerm: detail.currentTerm?.trim()
          ? detail.currentTerm
          : prev.currentTerm,
      }));
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => {
      active = false;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K for Global Search
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const currentNav =
    ADMIN_NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    ADMIN_NAV[0];

  const unreadCount = notifications.filter((n) => n.unread).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    toast({
      title: "Đã đánh dấu tất cả thông báo là đã đọc",
      variant: "info",
    });
  };

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const renderBrandAvatar = () => {
    const src = brandMeta.avatarUrl?.trim();
    if (!src) {
      return <div className="size-full animate-pulse bg-muted/80" aria-hidden="true" />;
    }
    if (src.startsWith("http://") || src.startsWith("https://")) {
      return (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={brandMeta.name}
          className="size-full object-cover object-top"
        />
      );
    }
    return (
      <Image
        src={src}
        alt={brandMeta.name}
        fill
        className="object-cover object-top"
        sizes="32px"
      />
    );
  };

  const filteredStudents = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredClasses = classes.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const groupedNav = React.useMemo(() => {
    const groups = new Map<string, (typeof ADMIN_NAV)[number][]>();
    for (const item of ADMIN_NAV) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries());
  }, []);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop & Tablet Collapsible Sidebar */}
      <aside
        aria-label="Điều hướng Quản trị Giáo viên"
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          collapsed ? "w-[74px]" : "w-64",
        )}
      >
        {/* Brand Header */}
        <div className="flex h-15 items-center justify-between border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <div className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-border">
              {renderBrandAvatar()}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-bold text-primary">
                  Teacher Studio
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{brandMeta.name}</p>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {groupedNav.map(([groupName, items]) => (
            <div key={groupName}>
              {!collapsed && (
                <p className="mb-1.5 px-3 font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  {groupName}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        collapsed && "justify-center px-2",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Teacher Card & Sign out */}
        <div className="border-t border-sidebar-border p-3">
          {!collapsed ? (
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-heading text-xs font-semibold text-foreground">
                  {brandMeta.name}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Online
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {brandMeta.currentTerm}
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                Đăng xuất
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSignOut}
              title="Đăng xuất"
              aria-label="Đăng xuất"
              className="flex w-full items-center justify-center rounded-lg p-2.5 text-muted-foreground hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar Overlay Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-[#243B64]/45 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl">
            <div className="flex h-15 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2.5">
                <div className="relative size-8 overflow-hidden rounded-lg border border-border">
                  {renderBrandAvatar()}
                </div>
                <span className="font-heading text-sm font-bold text-primary">
                  Teacher Studio
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Đóng menu quản trị"
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 space-y-4 overflow-y-auto p-4">
              {groupedNav.map(([groupName, items]) => (
                <div key={groupName}>
                  <p className="mb-1.5 px-2 text-[11px] font-semibold text-muted-foreground uppercase">
                    {groupName}
                  </p>
                  <div className="space-y-1">
                    {items.map((item) => {
                      const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
                      const active =
                        pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground hover:bg-muted",
                          )}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="border-t border-border p-4">
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="w-full justify-center rounded-xl"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Đăng xuất Giáo viên
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu quản trị"
              className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted md:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <Breadcrumb
              items={[
                { label: "Quản trị", href: "/dashboard" },
                { label: currentNav.label },
              ]}
            />
          </div>

          <div className="flex items-center gap-2.5">
            {/* Global Search Trigger */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Tìm kiếm nhanh học sinh, lớp học hoặc tính năng"
              className="flex h-9 items-center gap-2.5 rounded-xl border border-border bg-background px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:w-64"
            >
              <Search className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden truncate sm:inline">Tìm học sinh, mã lớp, tài liệu...</span>
              <kbd className="ml-auto hidden rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
                Ctrl K
              </kbd>
            </button>

            {/* Notification Center */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label={`Thông báo hệ thống (${unreadCount} chưa đọc)`}
                aria-expanded={notifOpen}
                className="relative inline-flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted"
              >
                <Bell className="size-4" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-highlight font-mono text-[10px] font-bold text-foreground">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-border bg-card p-4 shadow-xl sm:w-96">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <p className="font-heading text-sm font-semibold text-foreground">
                      Trung tâm Thông báo
                    </p>
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Đánh dấu đã đọc
                    </button>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          "rounded-xl p-2.5 text-xs transition-colors",
                          n.unread ? "bg-accent/70" : "bg-background/60",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-foreground">{n.title}</p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {n.time}
                          </span>
                        </div>
                        <p className="mt-0.5 text-muted-foreground">{n.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              render={<Link href="/" />}
              nativeButton={false}
              variant="outline"
              size="sm"
              className="hidden rounded-xl sm:inline-flex"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Xem Cổng Học sinh
            </Button>
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* Global Search Modal */}
      <ModalDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Tìm kiếm Nhanh Toàn Hệ thống"
        description="Tra cứu tức thì hồ sơ học sinh, lớp học hoặc chuyển nhanh đến trang chức năng."
        size="md"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nhập tên học sinh (VD: Bảo Ngọc), mã HS-2026-01, hoặc mã lớp..."
              className="h-11 rounded-xl pl-10"
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Học sinh ({filteredStudents.length})
            </p>
            <div className="max-h-44 space-y-1.5 overflow-y-auto">
              {filteredStudents.map((stu) => (
                <Link
                  key={stu.id}
                  href="/students"
                  onClick={() => setSearchOpen(false)}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3.5 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <div>
                    <p className="font-medium text-foreground">{stu.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {stu.code} · {stu.className}
                    </p>
                  </div>
                  <Badge variant="info">Band {stu.averageScore.toFixed(1)}</Badge>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Lớp học ({filteredClasses.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredClasses.map((cls) => (
                <Link
                  key={cls.id}
                  href="/classes"
                  onClick={() => setSearchOpen(false)}
                  className="rounded-xl border border-border/70 bg-background p-3 text-xs transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <p className="font-semibold text-primary">
                    {cls.code} · {cls.name}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">{cls.scheduleSummary}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AdminShellInner>{children}</AdminShellInner>
    </ToastProvider>
  );
}
