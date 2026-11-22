"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, GraduationCap, Trophy } from "lucide-react";
import type { PublicHallOfFameStudent } from "@/services/hall-of-fame-helpers";
import { selectFeaturedHallOfFame } from "@/services/viewer-home-helpers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HomeHallOfFameSection({
  hallOfFame,
}: {
  hallOfFame: PublicHallOfFameStudent[];
}) {
  const featuredHonors = React.useMemo(
    () => selectFeaturedHallOfFame(hallOfFame, 4),
    [hallOfFame],
  );

  return (
    <section className="relative overflow-hidden border-y border-[#E6D7B8] bg-gradient-to-r from-[#F7F0E2] via-[#F4E9D2] to-[#F7F0E2] py-10 sm:py-12">
      <div
        className="pointer-events-none absolute -top-12 -left-12 size-48 rounded-full bg-[#D9AE54]/10 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-12 -bottom-12 size-48 rounded-full bg-[#D9AE54]/10 blur-2xl"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-10">
        <div className="grid items-center gap-8 lg:grid-cols-12">
          {/* Left Column (4 cols) */}
          <div className="lg:col-span-4">
            <div className="flex items-start gap-3.5">
              <div className="flex size-13 shrink-0 items-center justify-center rounded-2xl border border-[#D9AE54]/50 bg-gradient-to-b from-[#FFFDF9] to-[#F5E6C4] text-[#B8861E] shadow-xs">
                <Trophy
                  className="size-7 fill-[#D9AE54]/25 text-[#D9AE54]"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="font-heading text-xs font-bold tracking-wider text-[#243B64] uppercase sm:text-[13px]">
                  <span className="font-normal text-[#7B8497]">03.</span> BẢNG
                  VÀNG HỌC SINH
                </p>
                <h2 className="mt-0.5 font-serif text-2xl leading-tight font-semibold text-[#253047] italic sm:text-[26px]">
                  Tỏa sáng cùng English Manager
                </h2>
              </div>
            </div>

            <p className="mt-3.5 text-xs leading-relaxed text-[#556075] sm:text-[13.5px]">
              Ghi nhận những nỗ lực và thành tích xuất sắc của các em học sinh
              trên hành trình chinh phục tiếng Anh.
            </p>

            <div className="mt-5">
              <Button
                size="default"
                className="h-9 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-deep-navy"
                render={<Link href="/hall-of-fame" />}
                nativeButton={false}
              >
                Xem bảng vàng
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Right Column (8 cols): 4-Student Horizontal Laureate Gallery */}
          <div className="lg:col-span-8">
            {featuredHonors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#DFD0B0] bg-white/60 px-6 py-10 text-center">
                <p className="font-heading text-sm font-bold text-[#243B64]">
                  Chưa có học viên được vinh danh trong kỳ này
                </p>
                <p className="mt-1 text-xs text-[#7B8497]">
                  Bảng vàng thành tích sẽ tự động cập nhật sau mỗi kỳ thi thử
                  và đánh giá chính thức.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 sm:gap-6">
                {featuredHonors.map((student, index) => (
                  <Link
                    key={student.id}
                    href={{
                      pathname: "/hall-of-fame",
                      query: { highlight: student.id },
                    }}
                    className="group flex flex-col items-center text-center focus-visible:outline-none"
                  >
                    {/* Circular Avatar with Golden Laurel Wreath SVG */}
                    <div className="relative flex size-28 items-center justify-center sm:size-30">
                      <svg
                        viewBox="0 0 120 120"
                        fill="none"
                        className="pointer-events-none absolute inset-0 size-full transition-transform duration-300 group-hover:scale-105"
                        aria-hidden="true"
                      >
                        <circle
                          cx="60"
                          cy="60"
                          r="44"
                          stroke="#D9AE54"
                          strokeWidth="2"
                          strokeOpacity="0.65"
                        />
                        <path
                          d="M60 108C30 104 12 82 12 54C12 32 25 16 42 10"
                          stroke="#D9AE54"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeDasharray="4 5"
                        />
                        <path
                          d="M60 108C90 104 108 82 108 54C108 32 95 16 78 10"
                          stroke="#D9AE54"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeDasharray="4 5"
                        />
                        <circle cx="60" cy="10" r="3" fill="#D9AE54" />
                      </svg>

                      <div
                        className={cn(
                          "relative flex size-21 flex-col items-center justify-center overflow-hidden rounded-full border-2 border-[#D9AE54] shadow-xs transition-transform duration-300 group-hover:scale-[1.03] sm:size-22",
                          index % 2 === 0
                            ? "bg-gradient-to-b from-primary to-deep-navy text-white"
                            : "bg-gradient-to-b from-[#FFFDF9] to-warm text-primary",
                        )}
                      >
                        <GraduationCap
                          className={cn(
                            "mb-0.5 size-4",
                            index % 2 === 0 ? "text-[#D9AE54]" : "text-[#9A6F18]",
                          )}
                          aria-hidden="true"
                        />
                        <span className="font-serif text-lg leading-none font-bold tracking-tight">
                          {student.avatarInitials}
                        </span>
                        <span
                          className={cn(
                            "py-0.2 mt-1 rounded-full px-1.5 text-[9px] font-semibold",
                            index % 2 === 0
                              ? "bg-white/15 text-[#F7F0E2]"
                              : "bg-[#243B64]/10 text-[#243B64]",
                          )}
                        >
                          #{student.rank}
                        </span>
                      </div>
                    </div>

                    <h3 className="mt-1.5 font-heading text-xs font-bold text-[#253047] group-hover:text-[#243B64] sm:text-sm">
                      {student.displayName}
                    </h3>
                    <p className="mt-0.5 font-heading text-xs font-extrabold text-[#243B64] sm:text-[13.5px]">
                      {student.headlineMetric}
                    </p>
                    <p className="text-[11px] font-medium text-[#9A6F18]">
                      {student.badgeTitle}
                    </p>
                    <p className="text-[10.5px] text-[#7B8497]">
                      ({student.periodLabel})
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
