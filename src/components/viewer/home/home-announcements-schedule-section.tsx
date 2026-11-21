"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  MessageSquareText,
  Paperclip,
} from "lucide-react";
import type {
  AnnouncementItem,
  StudentScheduleOccurrence,
} from "@/services/classroom-data";
import {
  SCHEDULE_DAYS,
  selectFeaturedAnnouncements,
  type HomeWeekDateRange,
  type PublicWeeklyClassSession,
} from "@/services/viewer-home-helpers";
import { cn } from "@/lib/utils";

export function HomeAnnouncementsScheduleSection({
  announcements,
  weekOccurrences,
  scheduleFallback,
  weekRange,
  selectedDay,
  onSelectDay,
  currentUser,
}: {
  announcements: AnnouncementItem[];
  weekOccurrences: StudentScheduleOccurrence[];
  scheduleFallback: PublicWeeklyClassSession[];
  weekRange: HomeWeekDateRange;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  currentUser: { role?: "admin" | "student"; studentId?: string } | null;
}) {
  const [isScheduleExpanded, setIsScheduleExpanded] = React.useState(false);

  const { featured: featuredAnnouncement, secondary: secondaryAnnouncements } =
    React.useMemo(
      () => selectFeaturedAnnouncements(announcements, 3),
      [announcements],
    );

  // Use real merged week occurrences (with makeup/rescheduled/canceled exceptions);
  // fall back to recurring template mapped onto the active week dates if empty.
  const normalizedWeekItems: StudentScheduleOccurrence[] = React.useMemo(() => {
    if (weekOccurrences.length > 0) {
      return weekOccurrences;
    }
    return scheduleFallback.map((session) => {
      const dateIso = weekRange.datesByDay[session.dayOfWeek]?.iso ?? "";
      return {
        occurrenceKey: `fallback-${session.id}-${dateIso}`,
        date: dateIso,
        dayOfWeek: session.dayOfWeek,
        dayLabel:
          SCHEDULE_DAYS.find((d) => d.value === session.dayOfWeek)?.dayName ??
          "Trong tuần",
        startTime: session.startTime,
        endTime: session.endTime,
        classCode: session.classCode,
        className: session.className,
        level: session.level,
        room: session.room,
        topic: session.topic,
        source: "recurring",
        status: session.status,
      };
    });
  }, [weekOccurrences, scheduleFallback, weekRange]);

  const activeWeekCount = React.useMemo(
    () => normalizedWeekItems.filter((s) => s.status !== "canceled").length,
    [normalizedWeekItems],
  );

  const daySessions = React.useMemo(() => {
    return normalizedWeekItems.filter((s) => s.dayOfWeek === selectedDay);
  }, [normalizedWeekItems, selectedDay]);

  const visibleScheduleSessions = React.useMemo(() => {
    if (isScheduleExpanded || daySessions.length <= 2) {
      return daySessions;
    }
    return daySessions.slice(0, 2);
  }, [daySessions, isScheduleExpanded]);

  const selectedDayMeta = React.useMemo(() => {
    return (
      SCHEDULE_DAYS.find((d) => d.value === selectedDay) ?? SCHEDULE_DAYS[3]
    );
  }, [selectedDay]);

  const fullScheduleUrl: "/schedule" | "/student/schedule" =
    currentUser?.role === "admin" ? "/schedule" : "/student/schedule";

  return (
    <section className="mx-auto max-w-[1360px] px-4 py-10 sm:px-8 sm:py-12 lg:px-10">
      <div className="grid items-start gap-8 lg:grid-cols-12">
        {/* Left Column (7 cols): 01. THÔNG BÁO MỚI NHẤT */}
        <div className="lg:col-span-7">
          <div className="flex items-center justify-between gap-4 border-b border-[#E3E7EF] pb-3.5">
            <div className="flex items-center gap-2">
              <MessageSquareText
                className="size-4 text-[#D9AE54]"
                aria-hidden="true"
              />
              <h2 className="font-heading text-sm font-bold tracking-wide text-[#243B64] uppercase sm:text-[15px]">
                <span className="font-normal text-[#7B8497]">01.</span> THÔNG BÁO
                MỚI NHẤT
              </h2>
            </div>
            <Link
              href="/announcements"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#243B64] transition-colors hover:text-[#496B9A] hover:underline"
            >
              Xem tất cả
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          {!featuredAnnouncement ? (
            <div className="mt-5 rounded-2xl border border-dashed border-[#DCE5F4] bg-white px-6 py-12 text-center">
              <p className="font-heading text-sm font-bold text-[#243B64]">
                Chưa có thông báo công khai mới
              </p>
              <p className="mt-1 text-xs text-[#7B8497]">
                Các thông báo lịch học, kỳ thi và hoạt động lớp học đã xuất bản sẽ
                hiển thị tại đây.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-5 md:grid-cols-12">
              {/* Featured Announcement Card (7 cols) */}
              <article className="overflow-hidden rounded-2xl border border-[#E3E7EF] bg-white shadow-2xs transition-shadow hover:shadow-xs md:col-span-7">
                {/* Editorial Study Desk Visual Banner */}
                <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-[#EFE4CE] via-[#E5D4B3] to-[#D5BE95]">
                  <svg
                    viewBox="0 0 400 180"
                    fill="none"
                    className="h-full w-full object-cover"
                    aria-hidden="true"
                  >
                    <rect width="400" height="180" fill="url(#deskGrad)" />
                    <path d="M0 145H400V180H0V145Z" fill="#DFC9A3" />
                    <path
                      d="M0 145H400"
                      stroke="#CBB186"
                      strokeWidth="1.5"
                    />
                    <g transform="translate(32, 74)">
                      <rect
                        x="0"
                        y="48"
                        width="145"
                        height="22"
                        rx="3"
                        fill="#243B64"
                      />
                      <rect
                        x="6"
                        y="52"
                        width="133"
                        height="14"
                        rx="2"
                        fill="#FBF7EE"
                      />
                      <line
                        x1="12"
                        y1="57"
                        x2="130"
                        y2="57"
                        stroke="#D9AE54"
                        strokeWidth="1"
                      />
                      <rect
                        x="10"
                        y="25"
                        width="130"
                        height="23"
                        rx="3"
                        fill="#8C5A32"
                      />
                      <rect
                        x="16"
                        y="29"
                        width="118"
                        height="15"
                        rx="2"
                        fill="#FCF9F3"
                      />
                      <rect
                        x="18"
                        y="4"
                        width="115"
                        height="21"
                        rx="3"
                        fill="#496B9A"
                      />
                      <rect
                        x="24"
                        y="8"
                        width="103"
                        height="13"
                        rx="2"
                        fill="#FFFDF9"
                      />
                    </g>
                    <g transform="translate(225, 58)">
                      <path
                        d="M78 24C92 24 92 62 78 62"
                        stroke="#FBF7EE"
                        strokeWidth="7"
                        strokeLinecap="round"
                      />
                      <rect
                        x="0"
                        y="10"
                        width="80"
                        height="76"
                        rx="12"
                        fill="#FFFDF9"
                        stroke="#E4D6B8"
                        strokeWidth="2"
                      />
                      <ellipse
                        cx="40"
                        cy="12"
                        rx="38"
                        ry="6"
                        fill="#E8DEC8"
                      />
                      <text
                        x="40"
                        y="45"
                        textAnchor="middle"
                        fill="#253047"
                        fontFamily="serif"
                        fontStyle="italic"
                        fontWeight="bold"
                        fontSize="14"
                      >
                        Dream
                      </text>
                      <text
                        x="40"
                        y="63"
                        textAnchor="middle"
                        fill="#243B64"
                        fontFamily="serif"
                        fontStyle="italic"
                        fontWeight="bold"
                        fontSize="14"
                      >
                        Big
                      </text>
                    </g>
                    <defs>
                      <linearGradient
                        id="deskGrad"
                        x1="0"
                        y1="0"
                        x2="400"
                        y2="180"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop stopColor="#F7EFE0" />
                        <stop offset="0.6" stopColor="#E8D7B9" />
                        <stop offset="1" stopColor="#D7C098" />
                      </linearGradient>
                    </defs>
                  </svg>

                  <span className="absolute top-3.5 left-3.5 rounded-full bg-[#D9AE54] px-3 py-1 text-[11px] font-bold text-white shadow-xs">
                    {featuredAnnouncement.isUrgent
                      ? "Tin khẩn"
                      : featuredAnnouncement.isPinned
                        ? "Đã ghim"
                        : "Tin nổi bật"}
                  </span>
                </div>

                {/* Card Text Body */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#7B8497]">
                    <div className="flex items-center gap-1.5">
                      <Calendar
                        className="size-3.5 text-[#D9AE54]"
                        aria-hidden="true"
                      />
                      <span>{featuredAnnouncement.publishedAt}</span>
                    </div>
                    {featuredAnnouncement.attachments.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF0FA] px-2 py-0.5 text-[10.5px] font-semibold text-[#243B64]">
                        <Paperclip className="size-3" aria-hidden="true" />
                        {featuredAnnouncement.attachments.length} tệp đính kèm
                      </span>
                    )}
                  </div>

                  <h3 className="mt-1.5 font-heading text-[15px] leading-snug font-bold text-[#243B64] sm:text-base">
                    <Link
                      href={`/announcements/${featuredAnnouncement.id}` as const}
                      className="transition-colors hover:text-[#496B9A] hover:underline"
                    >
                      {featuredAnnouncement.title}
                    </Link>
                  </h3>

                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#556075] sm:text-[13px]">
                    {featuredAnnouncement.excerpt}
                  </p>
                </div>
              </article>

              {/* Right List of Secondary Announcements (5 cols) */}
              <div className="divide-y divide-[#E3E7EF] md:col-span-5">
                {secondaryAnnouncements.map((item) => (
                  <article
                    key={item.id}
                    className="py-3.5 first:pt-1 last:pb-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-[#7B8497]">
                      <div className="flex items-center gap-1.5">
                        <Calendar
                          className="size-3.5 text-[#9AA3B5]"
                          aria-hidden="true"
                        />
                        <time>{item.publishedAt}</time>
                      </div>
                      {item.isPinned && (
                        <span className="rounded bg-[#FFF2D6] px-1.5 py-0.5 text-[10px] font-semibold text-[#9A6F18]">
                          Ghim
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 font-heading text-xs leading-snug font-bold text-[#253047] sm:text-[13.5px]">
                      <Link
                        href={`/announcements/${item.id}` as const}
                        className="transition-colors hover:text-[#243B64] hover:underline"
                      >
                        {item.title}
                      </Link>
                    </h3>
                    <p className="mt-1 line-clamp-1 text-[11.5px] text-[#7B8497]">
                      {item.categoryLabel} · {item.targetClasses.join(", ")}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (5 cols): 02. LỊCH DẠY & CÁC KHÓA HỌC TRONG TUẦN */}
        <div id="weekly-schedule" className="scroll-mt-24 lg:col-span-5">
          <div className="flex h-full flex-col justify-between rounded-2xl border border-[#DCE5F4] bg-[#F4F7FC] p-5 shadow-2xs sm:p-6">
            <div>
              {/* Section 02 Header with Week Range & Active Counter */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCE5F4]/70 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Calendar
                      className="size-4 text-[#243B64]"
                      aria-hidden="true"
                    />
                    <h2 className="font-heading text-sm font-bold tracking-wide text-[#243B64] uppercase sm:text-[14.5px]">
                      <span className="font-normal text-[#7B8497]">02.</span> LỊCH
                      DẠY TUẦN NÀY
                    </h2>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-[#556075]">
                    Tuần {weekRange.label}
                  </p>
                </div>
                <span className="rounded-full border border-[#DCE5F4] bg-white px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#243B64]">
                  {activeWeekCount} ca hoạt động
                </span>
              </div>

              {/* 7-Day Selector Bar with Actual Short Date */}
              <div
                className="mt-3.5 grid grid-cols-7 gap-1 rounded-xl border border-[#DCE5F4] bg-white p-1.5 shadow-2xs"
                role="tablist"
                aria-label="Chọn ngày trong tuần"
              >
                {SCHEDULE_DAYS.map((day) => {
                  const isSelected = selectedDay === day.value;
                  const sessionsForDay = normalizedWeekItems.filter(
                    (s) => s.dayOfWeek === day.value,
                  );
                  const activeCount = sessionsForDay.filter(
                    (s) => s.status !== "canceled",
                  ).length;
                  const hasException = sessionsForDay.some(
                    (s) => s.source !== "recurring" || s.status === "canceled",
                  );
                  const shortDate =
                    weekRange.datesByDay[day.value]?.shortDate ?? day.subLabel;

                  return (
                    <button
                      key={day.value}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelectDay(day.value);
                        setIsScheduleExpanded(false);
                      }}
                      className={cn(
                        "relative flex flex-col items-center justify-center rounded-lg py-1.5 text-center transition-all select-none",
                        isSelected
                          ? "bg-[#243B64] text-white shadow-xs"
                          : activeCount > 0 || hasException
                            ? "text-[#253047] hover:bg-[#EAF0FA] hover:text-[#243B64]"
                            : "text-[#9AA2B1] opacity-70 hover:bg-[#F4F7FC]",
                      )}
                    >
                      <span className="text-[11px] font-bold">
                        {day.shortLabel}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 font-mono text-[9.5px]",
                          isSelected
                            ? "font-semibold text-[#F7F0E2]"
                            : activeCount > 0
                              ? "text-[#556075]"
                              : "text-[#9AA2B1]",
                        )}
                      >
                        {shortDate}
                      </span>

                      {(activeCount > 0 || hasException) && !isSelected && (
                        <span
                          className={cn(
                            "mt-0.5 size-1 rounded-full",
                            hasException ? "bg-amber-500" : "bg-[#D9AE54]",
                          )}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Contextual Day Overview Header */}
              <div className="mt-3.5 flex items-center justify-between px-0.5 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-[#243B64]">
                  <Clock
                    className="size-3.5 text-[#D9AE54]"
                    aria-hidden="true"
                  />
                  <span>
                    {selectedDayMeta.dayName} (
                    {weekRange.datesByDay[selectedDay]?.shortDate ??
                      selectedDayMeta.subLabel}
                    ):{" "}
                    <span className="font-bold text-[#253047]">
                      {daySessions.filter((s) => s.status !== "canceled").length >
                      0
                        ? `${daySessions.filter((s) => s.status !== "canceled").length} ca học`
                        : "Không có ca học"}
                    </span>
                  </span>
                </div>
                {daySessions.some((s) => s.status === "ongoing") && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Đang diễn ra
                  </span>
                )}
              </div>

              {/* Class Sessions List */}
              <div className="mt-3 space-y-2.5">
                {daySessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DCE5F4] bg-white/70 px-4 py-8 text-center">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#EAF0FA] text-[#243B64]">
                      <CalendarCheck className="size-5" aria-hidden="true" />
                    </div>
                    <p className="mt-2.5 font-heading text-xs font-bold text-[#243B64]">
                      Không có ca học nào trong {selectedDayMeta.dayName}
                    </p>
                    <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-[#7B8497]">
                      Thời gian dành cho giáo viên chấm chữa bài viết 1:1, tư vấn
                      học thuật và học viên tự học.
                    </p>
                  </div>
                ) : (
                  visibleScheduleSessions.map((session) => {
                    const shortRoom = session.room.replace("Phòng ", "P.");
                    const isCompleted = session.status === "completed";
                    const isOngoing = session.status === "ongoing";
                    const isCanceled = session.status === "canceled";

                    return (
                      <div
                        key={session.occurrenceKey}
                        className={cn(
                          "rounded-xl border bg-white p-3.5 shadow-2xs transition-all hover:border-[#243B64]/40 hover:shadow-xs",
                          isCanceled
                            ? "border-rose-200/80 bg-rose-50/40 opacity-75"
                            : isCompleted
                              ? "border-[#E3E7EF] opacity-80"
                              : "border-[#DCE5F4]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-[#EAF0FA] px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-[#243B64]">
                                {session.classCode}
                              </span>
                              <span className="text-[10.5px] font-medium text-[#7B8497]">
                                {session.level}
                              </span>
                              {session.source === "makeup" && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                  Dạy bù
                                </span>
                              )}
                              {session.source === "rescheduled" && (
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                                  Đổi lịch
                                </span>
                              )}
                            </div>
                            <h3
                              className={cn(
                                "mt-1 font-heading text-xs leading-snug font-bold text-[#253047] sm:text-[13.5px]",
                                isCanceled && "line-through",
                              )}
                            >
                              {session.className}
                            </h3>
                          </div>

                          <span className="shrink-0 rounded-md border border-[#DCE5F4] bg-[#EAF0FA] px-2 py-0.5 font-mono text-xs font-bold text-[#243B64]">
                            {shortRoom}
                          </span>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between border-t border-[#F1F4FA] pt-2 text-xs">
                          <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-[#556075]">
                            <Clock
                              className="size-3 text-[#D9AE54]"
                              aria-hidden="true"
                            />
                            <span>
                              {session.startTime} – {session.endTime}
                            </span>
                          </div>

                          {isOngoing && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <span className="relative flex size-1.5">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                              </span>
                              Đang học
                            </span>
                          )}
                          {session.status === "upcoming" && (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                              Sắp diễn ra
                            </span>
                          )}
                          {isCompleted && (
                            <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                              Đã kết thúc
                            </span>
                          )}
                          {isCanceled && (
                            <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                              Đã hủy
                            </span>
                          )}
                        </div>

                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#556075]">
                          <span className="font-semibold text-[#253047]">
                            Nội dung:
                          </span>{" "}
                          {session.topic}
                        </p>
                        {session.exceptionReason && (
                          <p className="mt-1 text-[11px] font-medium text-amber-800">
                            Ghi chú lịch: {session.exceptionReason}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {daySessions.length > 2 && (
                <button
                  type="button"
                  onClick={() => setIsScheduleExpanded((prev) => !prev)}
                  className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-lg border border-[#DCE5F4] bg-white py-1.5 text-xs font-semibold text-[#243B64] transition-colors hover:bg-[#EAF0FA]"
                >
                  {isScheduleExpanded ? (
                    <>
                      <span>Thu gọn danh sách ca học</span>
                      <ChevronUp className="size-3.5" aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      <span>
                        Xem thêm ({daySessions.length - 2} ca học khác trong
                        ngày)
                      </span>
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="mt-4 border-t border-[#DCE5F4] pt-3">
              <Link
                href={fullScheduleUrl}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#243B64] text-xs font-semibold text-white shadow-2xs transition-all hover:bg-[#1E3458]"
              >
                <span>Xem toàn bộ lịch học</span>
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
              <p className="mt-1.5 text-center text-[10.5px] text-[#7B8497]">
                {currentUser?.role === "admin"
                  ? "Quản trị lịch dạy dành cho Giáo viên (ADMIN)"
                  : currentUser?.role === "student"
                    ? "Xem lịch học chi tiết của lớp bạn đang theo học"
                    : "Học sinh & phụ huynh tra cứu lịch học lớp chính thức"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
