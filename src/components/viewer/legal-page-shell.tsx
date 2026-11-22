"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ChevronRight,
  FileText,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import type { TeacherProfile } from "@/services/classroom-data";
import {
  persistTeacherBrandLocally,
  readStoredTeacherBrand,
  SETTINGS_UPDATED_EVENT,
} from "@/services/settings-helpers";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface LegalTocItem {
  id: string;
  label: string;
}

export interface LegalHighlightCard {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export type LegalPageSlug = "privacy" | "terms" | "support";

const EMPTY_PROFILE: TeacherProfile = {
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
  avatarUrl: "",
  officeHours: "",
  location: "",
  socials: [],
};

export function useTeacherPublicProfile() {
  const [profile, setProfile] = React.useState<TeacherProfile>(EMPTY_PROFILE);

  React.useEffect(() => {
    let active = true;

    const cached = readStoredTeacherBrand();
    if (cached) {
      Promise.resolve().then(() => {
        if (active) setProfile((prev) => ({ ...prev, ...cached }));
      });
    }

    apiRequest<{ teacher?: TeacherProfile }>("/api/viewer/overview")
      .then((res) => {
        if (!active || !res?.teacher) return;
        setProfile((prev) => ({ ...prev, ...res.teacher }));
        persistTeacherBrandLocally(res.teacher);
      })
      .catch(() => {});

    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<TeacherProfile>>).detail;
      if (!detail) return;
      setProfile((prev) => ({
        ...prev,
        ...detail,
      }));
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => {
      active = false;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, []);

  return profile;
}

const LEGAL_NAV_ITEMS: Array<{
  slug: LegalPageSlug;
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    slug: "privacy",
    href: "/privacy" as Route,
    label: "Chính sách bảo mật",
    icon: ShieldCheck,
  },
  {
    slug: "terms",
    href: "/terms" as Route,
    label: "Điều khoản sử dụng",
    icon: FileText,
  },
  {
    slug: "support",
    href: "/support" as Route,
    label: "Trung tâm hỗ trợ",
    icon: HelpCircle,
  },
];

interface LegalPageShellProps {
  activeSlug: LegalPageSlug;
  badgeLabel: string;
  updatedAtLabel: string;
  title: string;
  subtitle: string;
  highlights: LegalHighlightCard[];
  toc: LegalTocItem[];
  children: React.ReactNode;
}

export function LegalPageShell({
  activeSlug,
  badgeLabel,
  updatedAtLabel,
  title,
  subtitle,
  highlights,
  toc,
  children,
}: LegalPageShellProps) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 lg:px-10 lg:py-12">
      {/* Breadcrumb */}
      <nav
        aria-label="Đường dẫn điều hướng"
        className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-primary">
          Trang chủ
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="font-semibold text-foreground">{badgeLabel}</span>
      </nav>

      {/* Hero Header */}
      <section className="rounded-3xl border border-border bg-card p-6 shadow-xs sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warm">{badgeLabel}</Badge>
          <span className="text-xs text-muted-foreground">
            {updatedAtLabel}
          </span>
        </div>

        <h1 className="mt-3 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          {title}
        </h1>
        <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {subtitle}
        </p>

        {/* 3 Key Highlights (TL;DR) */}
        <div className="mt-6 grid gap-3.5 sm:grid-cols-3">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-border/80 bg-warm/35 p-4"
            >
              <div className="flex items-center gap-2 text-primary">
                {item.icon}
                <h2 className="font-heading text-xs font-bold text-foreground sm:text-sm">
                  {item.title}
                </h2>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 2-Column Body */}
      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Left Sticky Sidebar: TOC + Cross-navigation */}
        <aside className="space-y-5 lg:col-span-3">
          <div className="sticky top-28 space-y-5">
            {/* Cross-page switcher */}
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs">
              <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Thông tin &amp; Pháp lý
              </p>
              <div className="space-y-1">
                {LEGAL_NAV_ITEMS.map((nav) => {
                  const Icon = nav.icon;
                  const isActive = nav.slug === activeSlug;
                  return (
                    <Link
                      key={nav.slug}
                      href={nav.href}
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                      <span>{nav.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* On-page Table of Contents */}
            {toc.length > 0 && (
              <div className="hidden rounded-2xl border border-border bg-card p-4 shadow-2xs lg:block">
                <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Mục lục trang này
                </p>
                <ul className="space-y-1.5 text-xs">
                  {toc.map((entry, idx) => (
                    <li key={entry.id}>
                      <a
                        href={`#${entry.id}`}
                        className="flex items-start gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
                      >
                        <span className="font-mono text-[11px] font-semibold text-primary/80">
                          {idx + 1}.
                        </span>
                        <span className="leading-snug">{entry.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>

        {/* Right Main Content */}
        <div className="space-y-6 lg:col-span-9">{children}</div>
      </div>
    </div>
  );
}
