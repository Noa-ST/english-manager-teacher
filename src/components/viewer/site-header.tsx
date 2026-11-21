"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  ChevronDown,
  GraduationCap,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "cn";
import { apiRequest } from "@/lib/api-client";
import { VIEWER_NAV } from "@/lib/routes";
import type {
  AnnouncementItem,
  TeacherProfile,
} from "@/services/classroom-data";
import { SETTINGS_UPDATED_EVENT } from "@/services/settings-helpers";
import { selectFeaturedAnnouncements } from "@/services/viewer-home-helpers";
import { Button } from "@/components/ui/button";

const EMPTY_TEACHER_PROFILE: TeacherProfile = {
  name: "",
  title: "",
  credentials: [],
  slogan: "",
  shortBio: "",
  philosophy: "",
  experienceYears: 0,
  totalStudents: 0,
  bandAchievementRate: "",
  email: "",
  avatarUrl: "/images/teacher-avatar.jpg",
  officeHours: "",
  location: "",
  socials: [],
};

interface HeaderSessionUser {
  id: string;
  role: "admin" | "student";
  fullName?: string;
  label?: string;
  studentCode?: string;
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [loginMenuOpen, setLoginMenuOpen] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState<HeaderSessionUser | null>(null);
  const [brandProfile, setBrandProfile] = React.useState<TeacherProfile>(
    EMPTY_TEACHER_PROFILE,
  );
  const [currentTerm, setCurrentTerm] = React.useState("Năm học 2026–2027");
  const [topAnnouncement, setTopAnnouncement] = React.useState<AnnouncementItem | null>(null);
  const loginDropdownRef = React.useRef<HTMLDivElement>(null);

  // Sync session state on mount and route change
  React.useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((payload) => {
        if (!mounted) return;
        if (payload?.ok && payload?.data?.user) {
          setCurrentUser(payload.data.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => {
        if (mounted) setCurrentUser(null);
      });

    return () => {
      mounted = false;
    };
  }, [pathname]);

  // Sync live public brand, current term & featured urgent banner announcement
  React.useEffect(() => {
    let active = true;

    apiRequest<{
      teacher?: TeacherProfile;
      currentTerm?: string;
      announcements?: AnnouncementItem[];
    }>("/api/viewer/overview")
      .then((res) => {
        if (!active || !res) return;
        if (res.teacher) {
          setBrandProfile(res.teacher);
        }
        if (res.currentTerm?.trim()) {
          setCurrentTerm(res.currentTerm);
        }
        if (Array.isArray(res.announcements)) {
          const { featured } = selectFeaturedAnnouncements(res.announcements, 1);
          setTopAnnouncement(featured);
        }
      })
      .catch(() => {});

    const handleSettingsUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<Partial<TeacherProfile> & { currentTerm?: string }>
      ).detail;
      if (!detail) return;
      setBrandProfile((prev) => ({
        ...prev,
        ...(detail.name ? { name: detail.name } : {}),
        ...(detail.avatarUrl !== undefined ? { avatarUrl: detail.avatarUrl } : {}),
        ...(detail.title ? { title: detail.title } : {}),
      }));
      if (detail.currentTerm?.trim()) {
        setCurrentTerm(detail.currentTerm);
      }
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => {
      active = false;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, []);

  // Handle outside click for login dropdown
  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (loginDropdownRef.current && !loginDropdownRef.current.contains(e.target as Node)) {
        setLoginMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setCurrentUser(null);
      router.push("/");
      router.refresh();
    } catch {
      router.push("/");
      router.refresh();
    }
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const renderBrandAvatar = (sizes: string, priority = false) => {
    const src = brandProfile.avatarUrl?.trim() || "/images/teacher-avatar.jpg";
    if (src.startsWith("http://") || src.startsWith("https://")) {
      return (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={brandProfile.name}
          className="size-full object-cover object-[center_18%]"
        />
      );
    }
    return (
      <Image
        src={src}
        alt={brandProfile.name}
        fill
        className="object-cover object-[center_18%]"
        sizes={sizes}
        priority={priority}
      />
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#E3E7EF] bg-white/95 backdrop-blur-md">
      {/* SECTION 01: TOP ANNOUNCEMENT BAR (Deep Navy #1E3458) */}
      <div className="bg-[#1E3458] text-xs text-white">
        <div className="mx-auto flex h-9 max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-2 text-white/95">
            <GraduationCap className="size-4 shrink-0 text-[#D9AE54]" aria-hidden="true" />
            <span className="font-medium whitespace-nowrap">Academic English &amp; Mentorship</span>
            <span className="hidden text-white/40 sm:inline">•</span>
            <span className="hidden font-semibold text-[#F7F0E2] sm:inline whitespace-nowrap">
              {brandProfile.bandAchievementRate || "IELTS 7.0 – 8.0+"}
            </span>
            <span className="hidden text-white/40 md:inline">•</span>
            <Link
              href={
                topAnnouncement
                  ? (`/announcements/${topAnnouncement.id}` as const)
                  : "/announcements"
              }
              className="hidden truncate text-white/90 transition-colors hover:text-white hover:underline md:inline"
            >
              {topAnnouncement
                ? `Cùng học, cùng phát triển! — ${topAnnouncement.title}`
                : "Cùng học, cùng phát triển! — Khám phá bảng tin & tài liệu lớp học"}
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs text-white/90">
            <Calendar className="size-3.5 text-[#D9AE54]" aria-hidden="true" />
            <span className="font-medium whitespace-nowrap">{currentTerm}</span>
          </div>
        </div>
      </div>

      {/* SECTION 02: MAIN NAVIGATION */}
      <div className="mx-auto flex h-[72px] max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-3 focus-visible:outline-none"
        >
          <div className="relative size-11 shrink-0 overflow-hidden rounded-full border-2 border-[#E6D7B8] shadow-2xs transition-transform duration-200 group-hover:scale-[1.03]">
            {renderBrandAvatar("44px", true)}
          </div>
          <div className="flex flex-col">
            <span className="font-heading text-[15px] leading-tight font-bold tracking-tight text-[#243B64]">
              {brandProfile.name}
            </span>
            <span className="text-xs whitespace-nowrap text-[#7B8497]">
              Academic English &amp; Mentorship
            </span>
          </div>
        </Link>

        {/* Desktop Nav: Minimalist horizontal links with Navy bottom bar active state */}
        <nav
          aria-label="Điều hướng cổng thông tin học sinh"
          className="hidden h-full shrink-0 items-center gap-1 lg:flex xl:gap-3"
        >
          {VIEWER_NAV.filter((item) => item.href !== "/student").map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-full shrink-0 items-center px-3 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "font-bold text-[#243B64] after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-[#243B64]"
                    : "font-medium text-[#253047]/80 hover:text-[#243B64]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Action Authentication Section */}
        {currentUser ? (
          currentUser.role === "admin" ? (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <Button
                render={<Link href="/dashboard" />}
                nativeButton={false}
                variant="default"
                size="default"
                className="h-9 rounded-full bg-[#1E3458] px-4 text-xs font-semibold whitespace-nowrap text-white shadow-2xs hover:bg-[#243B64]"
              >
                <ShieldCheck className="size-3.5 text-[#D9AE54]" aria-hidden="true" />
                <span>Bàn làm việc Giáo viên</span>
              </Button>
              <button
                type="button"
                onClick={handleLogout}
                title="Đăng xuất tài khoản"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#D8DFEC] bg-white px-3 text-xs font-semibold text-[#556075] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                <span className="hidden xl:inline">Đăng xuất</span>
              </button>
            </div>
          ) : (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <Button
                render={<Link href="/student" />}
                nativeButton={false}
                variant="default"
                size="default"
                className="h-9 rounded-full border border-[#243B64] bg-[#EAF0FA] px-4 text-xs font-semibold whitespace-nowrap text-[#243B64] shadow-2xs hover:bg-[#d8e5f7]"
              >
                <GraduationCap className="size-3.5 text-[#243B64]" aria-hidden="true" />
                <span>Góc học tập ({currentUser.studentCode || currentUser.fullName || "Học sinh"})</span>
              </Button>
              <button
                type="button"
                onClick={handleLogout}
                title="Đăng xuất tài khoản"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#D8DFEC] bg-white px-3 text-xs font-semibold text-[#556075] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                <span className="hidden xl:inline">Đăng xuất</span>
              </button>
            </div>
          )
        ) : (
          <div className="relative hidden shrink-0 items-center gap-2 sm:flex" ref={loginDropdownRef}>
            {/* Clean, high-impact "Đăng nhập" Button with quick role popup */}
            <div className="inline-flex items-center rounded-full bg-[#1E3458] p-0.5 text-white shadow-2xs transition-all hover:bg-[#243B64]">
              <Link
                href="/login"
                className="inline-flex h-8 items-center gap-2 px-3.5 text-xs font-semibold text-white focus-visible:outline-none"
              >
                <LogIn className="size-3.5 text-[#D9AE54]" aria-hidden="true" />
                <span>Đăng nhập</span>
              </Link>
              <div className="h-4 w-px bg-white/20" />
              <button
                type="button"
                onClick={() => setLoginMenuOpen((v) => !v)}
                aria-expanded={loginMenuOpen}
                aria-label="Chọn đối tượng đăng nhập"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    loginMenuOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* Dropdown Options */}
            {loginMenuOpen && (
              <div className="animate-in fade-in slide-in-from-top-2 absolute top-full right-0 z-50 mt-2 w-72 rounded-2xl border border-[#E3E7EF] bg-white p-2 shadow-[0_12px_32px_-4px_rgba(30,52,88,0.18)] duration-150">
                <div className="border-b border-[#F0F3F8] px-3 py-2">
                  <p className="text-[11px] font-semibold tracking-wider text-[#7B8497] uppercase">
                    Chọn cổng đăng nhập
                  </p>
                </div>
                <div className="space-y-1 pt-1.5">
                  <Link
                    href="/login?role=student"
                    onClick={() => setLoginMenuOpen(false)}
                    className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-[#F5F8FC]"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF0FA] text-[#243B64] transition-colors group-hover:bg-[#243B64] group-hover:text-white">
                      <GraduationCap className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1E3458]">Cổng Học sinh</p>
                      <p className="mt-0.5 text-[11px] leading-tight text-[#7B8497]">
                        Dành cho học sinh có email &amp; mật khẩu được giáo viên cấp
                      </p>
                    </div>
                  </Link>

                  <Link
                    href="/login?role=admin"
                    onClick={() => setLoginMenuOpen(false)}
                    className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-[#FFF9ED]"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF2D6] text-[#A26D00] transition-colors group-hover:bg-[#1E3458] group-hover:text-white">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1E3458]">Cổng Giáo viên (Admin)</p>
                      <p className="mt-0.5 text-[11px] leading-tight text-[#7B8497]">
                        Quản trị lớp, điểm danh, chấm bài &amp; vận hành CMS
                      </p>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile Menu Trigger (44x44px target) */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted lg:hidden"
        >
          {mobileMenuOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-border bg-card px-4 pt-3 pb-5 shadow-md lg:hidden">
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-warm/45 p-3">
            <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-primary/20 shadow-xs">
              {renderBrandAvatar("44px")}
            </div>
            <div>
              <p className="font-heading text-sm font-bold text-foreground">
                {brandProfile.name}
              </p>
              <p className="text-xs text-muted-foreground">Academic English &amp; Mentorship</p>
            </div>
          </div>
          <nav aria-label="Menu di động" className="flex flex-col gap-1">
            {VIEWER_NAV.filter((item) => item.href !== "/student").map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile Auth Actions */}
          <div className="mt-4 border-t border-border pt-4">
            {currentUser ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-[#F5F7FB] p-2.5">
                  <div className="flex items-center gap-2">
                    {currentUser.role === "admin" ? (
                      <ShieldCheck className="size-4 text-[#D9AE54]" aria-hidden="true" />
                    ) : (
                      <GraduationCap className="size-4 text-[#243B64]" aria-hidden="true" />
                    )}
                    <span className="text-xs font-semibold text-[#1E3458]">
                      {currentUser.role === "admin"
                        ? `${brandProfile.name} (Giáo viên)`
                        : `Học sinh: ${currentUser.studentCode || currentUser.fullName || "Đang học"}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      void handleLogout();
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                  >
                    <LogOut className="size-3.5" aria-hidden="true" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
                <Button
                  render={
                    <Link
                      href={currentUser.role === "admin" ? "/dashboard" : "/student"}
                      onClick={() => setMobileMenuOpen(false)}
                    />
                  }
                  nativeButton={false}
                  className="h-10 w-full justify-center rounded-lg bg-[#1E3458] text-xs font-semibold text-white"
                >
                  {currentUser.role === "admin" ? "Vào Bàn làm việc" : "Vào Cổng học sinh"}
                </Button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  render={<Link href="/login?role=student" onClick={() => setMobileMenuOpen(false)} />}
                  nativeButton={false}
                  variant="outline"
                  className="h-11 w-full justify-center gap-2 rounded-lg border-border bg-card text-xs font-semibold text-[#243B64]"
                >
                  <GraduationCap className="size-4" aria-hidden="true" />
                  Đăng nhập Học sinh
                </Button>
                <Button
                  render={<Link href="/login?role=admin" onClick={() => setMobileMenuOpen(false)} />}
                  nativeButton={false}
                  size="default"
                  className="h-11 w-full justify-center gap-2 rounded-lg bg-[#1E3458] text-xs font-semibold text-white"
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Đăng nhập Giáo viên
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
