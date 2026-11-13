"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Calendar,
  GraduationCap,
  Menu,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { VIEWER_NAV } from "@/lib/routes";

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
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
              IELTS 7.0 – 8.0+
            </span>
            <span className="hidden text-white/40 md:inline">•</span>
            <Link
              href="/announcements"
              className="hidden truncate text-white/90 transition-colors hover:text-white hover:underline md:inline"
            >
              Cùng học, cùng phát triển! — Lịch thi thử IELTS Academic Quý IV đã mở đăng ký
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs text-white/90">
            <Calendar className="size-3.5 text-[#D9AE54]" aria-hidden="true" />
            <span className="font-medium whitespace-nowrap">Năm học 2026–2027</span>
          </div>
        </div>
      </div>

      {/* SECTION 02: MAIN NAVIGATION */}
      <div className="mx-auto flex h-[72px] max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="group flex items-center gap-3 focus-visible:outline-none shrink-0"
        >
          <div className="relative size-11 shrink-0 overflow-hidden rounded-full border-2 border-[#E6D7B8] shadow-2xs transition-transform duration-200 group-hover:scale-[1.03]">
            <Image
              src="/images/teacher-avatar.jpg"
              alt="ThS. Nguyễn Minh Anh"
              fill
              className="object-cover object-[center_18%]"
              sizes="44px"
              priority
            />
          </div>
          <div className="flex flex-col">
            <span className="font-heading text-[15px] leading-tight font-bold tracking-tight text-[#243B64]">
              ThS. Nguyễn Minh Anh
            </span>
            <span className="text-xs text-[#7B8497] whitespace-nowrap">
              Academic English &amp; Mentorship
            </span>
          </div>
        </Link>

        {/* Desktop Nav: Minimalist horizontal links with Navy bottom bar active state */}
        <nav
          aria-label="Điều hướng cổng thông tin học sinh"
          className="hidden h-full items-center gap-1 xl:gap-3 lg:flex shrink-0"
        >
          {VIEWER_NAV.filter((item) => item.href !== "/student").map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-full items-center whitespace-nowrap shrink-0 px-3 text-sm transition-colors",
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

        {/* Right Action Pill Buttons */}
        <div className="hidden items-center gap-2.5 sm:flex shrink-0">
          <Button
            render={<Link href="/student" />}
            nativeButton={false}
            variant="outline"
            size="default"
            className={cn(
              "h-9 rounded-full border-[#D8DFEC] bg-[#F5F7FB] px-4 whitespace-nowrap shrink-0 text-xs font-semibold text-[#253047] hover:border-[#243B64]/40 hover:bg-[#EAF0FA]",
              isActive("/student") && "border-[#243B64] bg-[#EAF0FA] text-[#243B64]",
            )}
          >
            <UserCheck className="size-3.5 text-[#243B64]" aria-hidden="true" />
            Tra cứu cá nhân
          </Button>
          <Button
            render={<Link href="/dashboard" />}
            nativeButton={false}
            variant="default"
            size="default"
            className="h-9 rounded-full bg-[#243B64] px-4 whitespace-nowrap shrink-0 text-xs font-semibold text-white shadow-2xs hover:bg-[#1E3458]"
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Cổng Giáo viên
          </Button>
        </div>

        {/* Mobile Menu Trigger (44x44px target) */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
          className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted lg:hidden shrink-0"
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
              <Image
                src="/images/teacher-avatar.jpg"
                alt="Ms. Minh Anh"
                fill
                className="object-cover object-top"
                sizes="44px"
              />
            </div>
            <div>
              <p className="font-heading text-sm font-bold text-foreground">ThS. Nguyễn Minh Anh</p>
              <p className="text-xs text-muted-foreground">Academic English &amp; Mentorship</p>
            </div>
          </div>
          <nav aria-label="Menu di động" className="flex flex-col gap-1">
            {VIEWER_NAV.map((item) => {
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
                  {item.href === "/student" && (
                    <span className="rounded-md bg-warm px-2 py-0.5 text-xs font-semibold text-primary">
                      Mã HS
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
            <Button
              render={<Link href="/student" onClick={() => setMobileMenuOpen(false)} />}
              nativeButton={false}
              variant="outline"
              className="h-11 w-full justify-center rounded-lg border-border bg-card text-xs font-semibold"
            >
              <UserCheck className="size-4 text-[#496B9A]" aria-hidden="true" />
              Tra cứu cá nhân
            </Button>
            <Button
              render={<Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} />}
              nativeButton={false}
              size="default"
              className="h-11 w-full justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              Cổng Giáo viên
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
