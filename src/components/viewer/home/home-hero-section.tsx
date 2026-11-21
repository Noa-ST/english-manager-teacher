"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Award,
  Calendar,
  GraduationCap,
  ShieldCheck,
  Trophy,
  UserCheck,
} from "lucide-react";
import type { TeacherProfile } from "@/services/classroom-data";
import {
  parseCredentialDisplay,
  splitSloganLines,
} from "@/services/cms-helpers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HomeHeroSection({
  teacher,
  currentUser,
}: {
  teacher: TeacherProfile;
  currentUser: { role?: "admin" | "student"; studentId?: string } | null;
}) {
  const [sloganLine1, sloganLine2] = React.useMemo(
    () => splitSloganLines(teacher.slogan),
    [teacher.slogan],
  );
  const heroCredentials = React.useMemo(
    () => (teacher.credentials ?? []).slice(0, 3).map(parseCredentialDisplay),
    [teacher.credentials],
  );

  const avatarSrc = teacher.avatarUrl?.trim() || "/images/teacher-avatar.jpg";
  const isRemoteAvatar =
    avatarSrc.startsWith("http://") || avatarSrc.startsWith("https://");
  const isAdmin = currentUser?.role === "admin";

  return (
    <section className="relative overflow-hidden border-b border-[#E6D7B8] bg-gradient-to-r from-[#FCF9F3] via-[#F7F0E2] to-[#EFE4CE]">
      {/* Subtle Warm Background Arc Decoration */}
      <div
        className="pointer-events-none absolute -top-24 right-[38%] hidden h-[640px] w-[640px] rounded-full border border-[#E2D2B0]/60 lg:block"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-10">
        <div className="grid items-center gap-8 pt-8 pb-10 lg:grid-cols-12 lg:gap-6 lg:py-0">
          {/* Left Content (~55% / 7 cols) */}
          <div className="z-10 space-y-6 lg:col-span-7 lg:py-12 lg:pr-6">
            {/* 1. Eyebrow */}
            <div className="flex items-center gap-3">
              <span className="h-[2px] w-7 bg-[#D9AE54]" aria-hidden="true" />
              <p className="font-heading text-xs font-semibold tracking-[0.14em] text-[#496B9A] uppercase">
                {teacher.title}
              </p>
            </div>

            {/* 2. Large Two-Line Headline (Sans-serif bold + Serif italic Navy) */}
            <h1 className="space-y-1">
              <span className="block font-heading text-3xl leading-[1.18] font-bold tracking-tight text-[#253047] sm:text-4xl xl:text-[42px]">
                {sloganLine1}
                {sloganLine2 ? " –" : ""}
              </span>
              {sloganLine2 && (
                <span className="block font-serif text-3xl leading-[1.18] font-normal text-[#243B64] italic sm:text-4xl xl:text-[44px]">
                  {sloganLine2}
                </span>
              )}
            </h1>

            {/* 3. Teacher Bio */}
            <p className="max-w-2xl text-sm leading-[1.75] text-[#253047]/85 sm:text-[15.5px]">
              Chào mừng Quý Phụ huynh và các em học sinh đến với không gian học thuật của{" "}
              <strong className="font-bold text-[#253047]">{teacher.name}</strong>.{" "}
              {teacher.shortBio}
            </p>

            {/* 4. Role-Aware Pill CTAs */}
            <div className="flex flex-wrap items-center gap-3.5 pt-1">
              {isAdmin ? (
                <Button
                  size="lg"
                  className="group h-11 rounded-full bg-[#243B64] px-6 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#1E3458] sm:h-12 sm:text-sm"
                  render={<Link href="/dashboard" />}
                  nativeButton={false}
                >
                  <ShieldCheck className="size-4 text-[#D9AE54]" aria-hidden="true" />
                  Vào Bàn làm việc Giáo viên
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="group h-11 rounded-full bg-[#243B64] px-6 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#1E3458] sm:h-12 sm:text-sm"
                  render={<Link href="/student" />}
                  nativeButton={false}
                >
                  <UserCheck className="size-4" aria-hidden="true" />
                  Tra cứu điểm &amp; chuyên cần
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Button>
              )}

              <Button
                variant="outline"
                size="lg"
                className="h-11 rounded-full border-[#CFD7E6] bg-white px-6 text-xs font-semibold text-[#253047] shadow-2xs transition-colors hover:border-[#243B64]/40 hover:bg-[#FCF9F3] sm:h-12 sm:text-sm"
                render={<a href="#weekly-schedule" />}
                nativeButton={false}
              >
                <Calendar className="size-4 text-[#243B64]" aria-hidden="true" />
                Xem lịch học tuần này
              </Button>
            </div>

            {/* 5. Three Credentials with Icons & Vertical Dividers */}
            <div className="grid gap-4 border-t border-[#E2D4B7] pt-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[#DFD0B0]">
              {heroCredentials.map((cred, idx) => (
                <div
                  key={`${cred.title}-${idx}`}
                  className={cn(
                    "flex items-center gap-3",
                    idx === 0 && "sm:pr-4",
                    idx === 1 && "sm:px-4",
                    idx === 2 && "sm:pl-4",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      idx === 0
                        ? "bg-[#243B64]/10 text-[#243B64]"
                        : "bg-[#D9AE54]/20 text-[#9A6F18]",
                    )}
                  >
                    {idx === 0 ? (
                      <GraduationCap className="size-5" aria-hidden="true" />
                    ) : idx === 1 ? (
                      <Trophy className="size-4.5" aria-hidden="true" />
                    ) : (
                      <Award className="size-5" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-heading text-xs font-bold text-[#253047] sm:text-[13px]">
                      {cred.title}
                    </p>
                    {cred.subtitle && (
                      <p className="text-[11px] text-[#7B8497]">{cred.subtitle}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Portrait Column (~45% / 5 cols — Curved Editorial Arch Frame) */}
          <div className="relative lg:col-span-5 lg:self-stretch">
            <div className="relative mx-auto h-[370px] w-full max-w-[500px] sm:h-[430px] lg:h-full lg:min-h-[460px] lg:max-w-none">
              {/* Outer Golden Curved Ring Accent */}
              <div
                className="pointer-events-none absolute inset-y-0 -left-3 w-full rounded-l-[240px] rounded-r-2xl border-l-[3px] border-[#D9AE54]/55 lg:rounded-r-none"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-y-2 -left-1.5 w-full rounded-l-[240px] rounded-r-2xl border-l border-[#E6D7B8] lg:rounded-r-none"
                aria-hidden="true"
              />

              {/* Main Curved Portrait Container (overflow-hidden only clips the image, NOT the floating badge!) */}
              <div className="relative h-full w-full overflow-hidden rounded-2xl border-2 border-[#E4D3B2] bg-[#EADBC0] shadow-md lg:rounded-l-[240px] lg:rounded-r-none lg:border-y-0 lg:border-r-0 lg:border-l-4 lg:border-l-[#E4D3B2] lg:shadow-none">
                {isRemoteAvatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={avatarSrc}
                    alt={teacher.name}
                    className="size-full object-cover object-[center_18%]"
                  />
                ) : (
                  <Image
                    src={avatarSrc}
                    alt={teacher.name}
                    fill
                    className="object-cover object-[center_18%]"
                    sizes="(max-width: 1024px) 100vw, 560px"
                    priority
                  />
                )}

                {/* Subtle Bottom Vignette for Handwritten Signature */}
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#1E3458]/70 via-[#1E3458]/20 to-transparent" />

                {/* Handwritten Decorative Script: "Learn English. Grow Together." */}
                <div className="absolute right-4 bottom-4 z-10 -rotate-6 text-right select-none sm:right-6 sm:bottom-5">
                  <p className="font-[family-name:var(--font-script)] text-2xl leading-[0.95] font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] sm:text-3xl">
                    Learn English.
                    <br />
                    Grow Together.
                  </p>
                </div>
              </div>

              {/* Teacher Identity Card placed OUTSIDE overflow-hidden arch frame so text is NEVER clipped */}
              <div className="absolute bottom-4 left-3 z-20 rounded-2xl border border-[#E4D3B2] bg-white/95 px-4 py-2.5 shadow-md backdrop-blur-sm sm:bottom-5 sm:left-4 lg:-left-6">
                <p className="font-heading text-xs font-bold text-[#243B64] sm:text-sm">
                  {teacher.name}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-[#556075]">
                  {teacher.experienceYears}+ năm giảng dạy · {teacher.totalStudents}+ học viên
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
