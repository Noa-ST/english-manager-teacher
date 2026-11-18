"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Award,
  Calendar,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  FolderOpen,
  GraduationCap,
  Headphones,
  LayoutGrid,
  MessageSquareText,
  Trophy,
  UserCheck,
} from "lucide-react";
import {
  ANNOUNCEMENTS_DATA,
  HALL_OF_FAME_DATA,
  PODCAST_EPISODES_DATA,
  RESOURCE_FILES_DATA,
  STUDENT_PROJECTS_DATA,
  TEACHER_PROFILE,
  WEEKLY_SCHEDULE_DATA,
  type AnnouncementItem,
  type HallOfFameStudent,
  type PodcastEpisode,
  type ResourceFileItem,
  type StudentProjectItem,
  type TeacherProfile,
  type WeeklyClassSession,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AudioPlayer } from "@/components/viewer/audio-player";
import { cn } from "@/lib/utils";

const PROJECT_CATEGORY_LABELS: Record<string, string> = {
  "Research Poster": "Poster Nghiên cứu",
  "Debate Portfolio": "Hồ sơ Tranh biện",
  "Video Presentation": "Video Thuyết trình",
  "Academic Essay": "Bài luận Học thuật",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  PDF: "Tài liệu PDF",
  SLIDE: "Slide bài giảng",
  WORKSHEET: "Phiếu bài tập",
  AUDIO: "Băng nghe (Audio)",
  IMAGE: "Hình ảnh",
};

const SCHEDULE_DAYS = [
  { value: 1, shortLabel: "Th 2", subLabel: "T2", dayName: "Thứ Hai" },
  { value: 2, shortLabel: "Th 3", subLabel: "T3", dayName: "Thứ Ba" },
  { value: 3, shortLabel: "Th 4", subLabel: "T4", dayName: "Thứ Tư" },
  { value: 4, shortLabel: "Th 5", subLabel: "T5", dayName: "Thứ Năm" },
  { value: 5, shortLabel: "Th 6", subLabel: "T6", dayName: "Thứ Sáu" },
  { value: 6, shortLabel: "Th 7", subLabel: "T7", dayName: "Thứ Bảy" },
  { value: 7, shortLabel: "CN", subLabel: "CN", dayName: "Chủ Nhật" },
] as const;

const emptySubscribe = () => () => {};
const getClientToday = () => {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
};
const getServerToday = () => 4;

export default function ViewerHomePage() {
  const { toast } = useToast();
  // Safe SSR hydration using useSyncExternalStore (defaults to Thursday on server, real day on client)
  const [userSelectedDay, setUserSelectedDay] = React.useState<number | null>(null);
  const clientToday = React.useSyncExternalStore(
    emptySubscribe,
    getClientToday,
    getServerToday
  );
  const selectedDay = userSelectedDay ?? clientToday;
  const setSelectedDay = React.useCallback((day: number) => {
    setUserSelectedDay(day);
  }, []);

  const [isScheduleExpanded, setIsScheduleExpanded] =
    React.useState<boolean>(false);
  const [currentUser, setCurrentUser] = React.useState<{
    role?: "admin" | "student";
    studentId?: string;
  } | null>(null);

  const [teacher, setTeacher] = React.useState<TeacherProfile>(TEACHER_PROFILE);
  const [announcements, setAnnouncements] =
    React.useState<AnnouncementItem[]>(ANNOUNCEMENTS_DATA);
  const [schedule, setSchedule] = React.useState<WeeklyClassSession[]>(
    WEEKLY_SCHEDULE_DATA,
  );
  const [hallOfFame, setHallOfFame] =
    React.useState<HallOfFameStudent[]>(HALL_OF_FAME_DATA);
  const [podcasts, setPodcasts] = React.useState<PodcastEpisode[]>(
    PODCAST_EPISODES_DATA,
  );
  const [projects, setProjects] = React.useState<StudentProjectItem[]>(
    STUDENT_PROJECTS_DATA,
  );
  const [resources, setResources] =
    React.useState<ResourceFileItem[]>(RESOURCE_FILES_DATA);

  const [activePodcastId, setActivePodcastId] = React.useState<string>("");

  React.useEffect(() => {
    apiRequest<{
      teacher: TeacherProfile;
      announcements: AnnouncementItem[];
      schedule: WeeklyClassSession[];
      hallOfFame: HallOfFameStudent[];
      podcasts: PodcastEpisode[];
      projects: StudentProjectItem[];
      resources: ResourceFileItem[];
    }>("/api/viewer/overview")
      .then((data) => {
        setTeacher(data.teacher);
        setAnnouncements(data.announcements);
        setSchedule(data.schedule);
        setHallOfFame(data.hallOfFame);
        setPodcasts(data.podcasts);
        setProjects(data.projects);
        setResources(data.resources);
      })
      .catch(() => {
        // Fallback to static seed on offline
      });

    // Detect logged-in role to route "Xem toàn bộ lịch học" accurately
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((payload) => {
        if (payload?.ok && payload?.data?.user) {
          setCurrentUser(payload.data.user);
        }
      })
      .catch(() => {});
  }, []);

  const urgentAnnouncement =
    announcements.find((item) => item.isUrgent) ?? announcements[0];
  const secondaryAnnouncements = announcements
    .filter((item) => item.id !== urgentAnnouncement?.id)
    .slice(0, 3);

  // Filter schedule strictly by the selected day
  const daySessions = React.useMemo(() => {
    return schedule.filter((session) => session.dayOfWeek === selectedDay);
  }, [schedule, selectedDay]);

  // Limit initial display to 2 sessions if multiple, expandable with "Xem thêm"
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

  const fullScheduleUrl = React.useMemo(() => {
    if (currentUser?.role === "admin") return "/schedule";
    return "/student/schedule";
  }, [currentUser]);

  const featuredHonors = React.useMemo(
    () => hallOfFame.slice(0, 4),
    [hallOfFame],
  );

  const featuredPodcast = React.useMemo(() => {
    if (activePodcastId) {
      const found = podcasts.find((ep) => ep.id === activePodcastId);
      if (found) return found;
    }
    return podcasts.find((ep) => ep.isFeatured) ?? podcasts[0];
  }, [podcasts, activePodcastId]);

  const featuredProjects = projects.slice(0, 2);

  const publicResources = resources
    .filter((r) => r.visibility === "public")
    .slice(0, 3);

  const handleResourceDownload = (title: string, size: string) => {
    toast({
      title: "Đang tải xuống học liệu",
      description: `${title} (${size}) đang được tải về thiết bị của bạn.`,
      variant: "success",
    });
  };

  return (
    <div className="bg-[#F8F9FC] text-[#253047]">
      {/* =====================================================================
          SECTION 03 – HERO (WARM CREAM + CURVED ARCH PORTRAIT FRAME)
      ===================================================================== */}
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
                  Tư duy ngôn ngữ mạch lạc –
                </span>
                <span className="block font-serif text-3xl leading-[1.18] font-normal text-[#243B64] italic sm:text-4xl xl:text-[44px]">
                  Nền tảng học thuật bền vững.
                </span>
              </h1>

              {/* 3. Teacher Bio */}
              <p className="max-w-2xl text-sm leading-[1.75] text-[#253047]/85 sm:text-[15.5px]">
                Chào mừng Quý Phụ huynh và các em học sinh đến với không gian học thuật của{" "}
                <strong className="font-bold text-[#253047]">{teacher.name}</strong>.{" "}
                {teacher.shortBio}
              </p>

              {/* 4. Two Pill CTAs */}
              <div className="flex flex-wrap items-center gap-3.5 pt-1">
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
                <div className="flex items-center gap-3 sm:pr-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#243B64]/10 text-[#243B64]">
                    <GraduationCap className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-heading text-xs font-bold text-[#253047] sm:text-[13px]">
                      M.A. in TESOL
                    </p>
                    <p className="text-[11px] text-[#7B8497]">University of Melbourne</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:px-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#D9AE54]/20 text-[#9A6F18]">
                    <Trophy className="size-4.5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-heading text-xs font-bold text-[#253047] sm:text-[13px]">
                      IELTS 8.5 Overall
                    </p>
                    <p className="text-[11px] text-[#7B8497]">(9.0 Reading &amp; Listening)</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:pl-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#D9AE54]/20 text-[#9A6F18]">
                    <Award className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-heading text-xs font-bold text-[#253047] sm:text-[13px]">
                      Cambridge CELTA
                    </p>
                    <p className="text-[11px] text-[#7B8497]">Pass A</p>
                  </div>
                </div>
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

                {/* Main Curved Portrait Container */}
                <div className="relative h-full w-full overflow-hidden rounded-2xl border-2 border-[#E4D3B2] bg-[#EADBC0] shadow-md lg:rounded-l-[240px] lg:rounded-r-none lg:border-y-0 lg:border-r-0 lg:border-l-4 lg:border-l-[#E4D3B2] lg:shadow-none">
                  <Image
                    src={teacher.avatarUrl || "/images/teacher-avatar.jpg"}
                    alt={teacher.name}
                    fill
                    className="object-cover object-[center_18%]"
                    sizes="(max-width: 1024px) 100vw, 560px"
                    priority
                  />

                  {/* Subtle Bottom Vignette for Handwritten Signature */}
                  <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#1E3458]/70 via-[#1E3458]/20 to-transparent" />

                  {/* Teacher Identity Badge at Bottom Left */}
                  <div className="absolute bottom-4 left-5 z-10 sm:left-8">
                    <p className="font-heading text-xs font-bold text-white drop-shadow-xs sm:text-sm">
                      {teacher.name}
                    </p>
                    <p className="text-[11px] text-[#F7F0E2]/90 drop-shadow-xs">
                      {teacher.experienceYears}+ năm giảng dạy · {teacher.totalStudents}+ học viên
                    </p>
                  </div>

                  {/* Handwritten Decorative Script: "Learn English. Grow Together." */}
                  <div className="absolute right-4 bottom-4 z-10 -rotate-6 text-right select-none sm:right-6 sm:bottom-5">
                    <p className="font-[family-name:var(--font-script)] text-2xl leading-[0.95] font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] sm:text-3xl">
                      Learn English.
                      <br />
                      Grow Together.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 04 – ANNOUNCEMENTS + WEEKLY SCHEDULE (SIDE-BY-SIDE)
      ===================================================================== */}
      <section className="mx-auto max-w-[1360px] px-4 py-10 sm:px-8 sm:py-12 lg:px-10">
        <div className="grid items-start gap-8 lg:grid-cols-12">
          {/* Left Column (7 cols): 01. THÔNG BÁO MỚI NHẤT */}
          <div className="lg:col-span-7">
            {/* Section 01 Header */}
            <div className="flex items-center justify-between gap-4 border-b border-[#E3E7EF] pb-3.5">
              <div className="flex items-center gap-2">
                <MessageSquareText className="size-4 text-[#D9AE54]" aria-hidden="true" />
                <h2 className="font-heading text-sm font-bold tracking-wide text-[#243B64] uppercase sm:text-[15px]">
                  <span className="font-normal text-[#7B8497]">01.</span> THÔNG BÁO MỚI NHẤT
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

            {/* 2-Column Sub-grid: Featured Card (Left) + Chronological List (Right) */}
            <div className="mt-5 grid gap-5 md:grid-cols-12">
              {/* Featured Announcement Card with Editorial Illustration Banner (7 cols) */}
              {urgentAnnouncement && (
                <article className="overflow-hidden rounded-2xl border border-[#E3E7EF] bg-white shadow-2xs transition-shadow hover:shadow-xs md:col-span-7">
                  {/* Editorial Study Desk Visual Banner */}
                  <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-[#EFE4CE] via-[#E5D4B3] to-[#D5BE95]">
                    {/* Warm Sunlight Window & Bookshelf Illustration */}
                    <svg
                      viewBox="0 0 400 180"
                      fill="none"
                      className="h-full w-full object-cover"
                      aria-hidden="true"
                    >
                      {/* Soft Sunlight Beams */}
                      <rect width="400" height="180" fill="url(#deskGrad)" />
                      <path d="M0 145H400V180H0V145Z" fill="#DFC9A3" />
                      <path d="M0 145H400" stroke="#CBB186" strokeWidth="1.5" />

                      {/* Stack of Academic Books on Left */}
                      <g transform="translate(32, 74)">
                        {/* Bottom Book */}
                        <rect x="0" y="48" width="145" height="22" rx="3" fill="#243B64" />
                        <rect x="6" y="52" width="133" height="14" rx="2" fill="#FBF7EE" />
                        <line x1="12" y1="57" x2="130" y2="57" stroke="#D9AE54" strokeWidth="1" />
                        {/* Middle Book */}
                        <rect x="10" y="25" width="130" height="23" rx="3" fill="#8C5A32" />
                        <rect x="16" y="29" width="118" height="15" rx="2" fill="#FCF9F3" />
                        {/* Top Open/Slanted Book */}
                        <rect x="18" y="4" width="115" height="21" rx="3" fill="#496B9A" />
                        <rect x="24" y="8" width="103" height="13" rx="2" fill="#FFFDF9" />
                      </g>

                      {/* Ceramic Mug with "Dream Big" */}
                      <g transform="translate(225, 58)">
                        {/* Mug Handle */}
                        <path
                          d="M78 24C92 24 92 62 78 62"
                          stroke="#FBF7EE"
                          strokeWidth="7"
                          strokeLinecap="round"
                        />
                        {/* Mug Body */}
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
                        <ellipse cx="40" cy="12" rx="38" ry="6" fill="#E8DEC8" />
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
                        <linearGradient id="deskGrad" x1="0" y1="0" x2="400" y2="180" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#F7EFE0" />
                          <stop offset="0.6" stopColor="#E8D7B9" />
                          <stop offset="1" stopColor="#D7C098" />
                        </linearGradient>
                      </defs>
                    </svg>

                    {/* Gold Pill Badge: Tin nổi bật */}
                    <span className="absolute top-3.5 left-3.5 rounded-full bg-[#D9AE54] px-3 py-1 text-[11px] font-bold text-white shadow-xs">
                      Tin nổi bật
                    </span>
                  </div>

                  {/* Card Text Body */}
                  <div className="p-4 sm:p-5">
                    <div className="flex items-center gap-1.5 text-xs text-[#7B8497]">
                      <Calendar className="size-3.5 text-[#D9AE54]" aria-hidden="true" />
                      <span>{urgentAnnouncement.publishedAt}</span>
                    </div>

                    <h3 className="mt-1.5 font-heading text-[15px] leading-snug font-bold text-[#243B64] sm:text-base">
                      <Link
                        href={`/announcements/${urgentAnnouncement.id}`}
                        className="transition-colors hover:text-[#496B9A] hover:underline"
                      >
                        {urgentAnnouncement.title}
                      </Link>
                    </h3>

                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#556075] sm:text-[13px]">
                      {urgentAnnouncement.excerpt}
                    </p>
                  </div>
                </article>
              )}

              {/* Right List of 3 Announcements (5 cols) */}
              <div className="divide-y divide-[#E3E7EF] md:col-span-5">
                {secondaryAnnouncements.map((item) => (
                  <article key={item.id} className="py-3.5 first:pt-1 last:pb-1">
                    <div className="flex items-center gap-1.5 text-xs text-[#7B8497]">
                      <Calendar className="size-3.5 text-[#9AA3B5]" aria-hidden="true" />
                      <time>{item.publishedAt}</time>
                    </div>
                    <h3 className="mt-1 font-heading text-xs leading-snug font-bold text-[#253047] sm:text-[13.5px]">
                      <Link
                        href={`/announcements/${item.id}`}
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
          </div>

          {/* Right Column (5 cols): 02. LỊCH DẠY & CÁC KHÓA HỌC TRONG TUẦN */}
          <div id="weekly-schedule" className="scroll-mt-24 lg:col-span-5">
            <div className="flex h-full flex-col justify-between rounded-2xl border border-[#DCE5F4] bg-[#F4F7FC] p-5 shadow-2xs sm:p-6">
              <div>
                {/* Section 02 Header with Total Counter Badge */}
                <div className="flex items-center justify-between gap-2 border-b border-[#DCE5F4]/70 pb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-4 text-[#243B64]" aria-hidden="true" />
                    <h2 className="font-heading text-sm font-bold tracking-wide text-[#243B64] uppercase sm:text-[14.5px]">
                      <span className="font-normal text-[#7B8497]">02.</span> LỊCH DẠY &amp; CÁC KHÓA HỌC
                    </h2>
                  </div>
                  <span className="rounded-full border border-[#DCE5F4] bg-white px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#243B64]">
                    {schedule.length} ca/tuần
                  </span>
                </div>

                {/* 7-Day of Week Selector Bar with class indicators (Requirement 2 & 9) */}
                <div
                  className="mt-3.5 grid grid-cols-7 gap-1 rounded-xl border border-[#DCE5F4] bg-white p-1.5 shadow-2xs"
                  role="tablist"
                  aria-label="Chọn ngày trong tuần"
                >
                  {SCHEDULE_DAYS.map((day) => {
                    const isSelected = selectedDay === day.value;
                    const sessionCount = schedule.filter(
                      (s) => s.dayOfWeek === day.value,
                    ).length;
                    const hasSessions = sessionCount > 0;

                    return (
                      <button
                        key={day.value}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => {
                          setSelectedDay(day.value);
                          setIsScheduleExpanded(false);
                        }}
                        className={cn(
                          "relative flex flex-col items-center justify-center rounded-lg py-1.5 text-center transition-all select-none",
                          isSelected
                            ? "bg-[#243B64] text-white shadow-xs"
                            : hasSessions
                              ? "text-[#253047] hover:bg-[#EAF0FA] hover:text-[#243B64]"
                              : "text-[#9AA2B1] opacity-70 hover:bg-[#F4F7FC]",
                        )}
                      >
                        <span className="text-[11px] font-bold">{day.shortLabel}</span>
                        <span
                          className={cn(
                            "mt-0.5 text-[10px]",
                            isSelected
                              ? "font-semibold text-[#F7F0E2]"
                              : hasSessions
                                ? "text-[#556075]"
                                : "text-[#9AA2B1]",
                          )}
                        >
                          {day.subLabel}
                        </span>

                        {/* Visual indicator dot for days with classes */}
                        {hasSessions && !isSelected && (
                          <span
                            className="mt-0.5 size-1 rounded-full bg-[#D9AE54]"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Contextual Day Overview Header (Requirement 7) */}
                <div className="mt-3.5 flex items-center justify-between px-0.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-[#243B64]">
                    <Clock className="size-3.5 text-[#D9AE54]" aria-hidden="true" />
                    <span>
                      {selectedDayMeta.dayName}:{" "}
                      <span className="font-bold text-[#253047]">
                        {daySessions.length > 0
                          ? `${daySessions.length} ca học`
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
                      Đang diễn ra ca học
                    </span>
                  )}
                </div>

                {/* Class Sessions List strictly for selected day (Requirements 3 & 5) */}
                <div className="mt-3 space-y-2.5">
                  {daySessions.length === 0 ? (
                    /* Clean Empty State when no classes scheduled (Requirement 9) */
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DCE5F4] bg-white/70 px-4 py-8 text-center">
                      <div className="flex size-10 items-center justify-center rounded-full bg-[#EAF0FA] text-[#243B64]">
                        <CalendarCheck className="size-5" aria-hidden="true" />
                      </div>
                      <p className="mt-2.5 font-heading text-xs font-bold text-[#243B64]">
                        Không có ca học nào trong {selectedDayMeta.dayName}
                      </p>
                      <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-[#7B8497]">
                        Thời gian dành cho giáo viên chấm chữa bài viết 1:1, tư vấn học thuật và học viên tự học.
                      </p>
                    </div>
                  ) : (
                    visibleScheduleSessions.map((session) => {
                      const shortRoom = session.room.replace("Phòng ", "P.");
                      const isCompleted = session.status === "completed";
                      const isOngoing = session.status === "ongoing";

                      return (
                        <div
                          key={session.id}
                          className={cn(
                            "rounded-xl border bg-white p-3.5 shadow-2xs transition-all hover:border-[#243B64]/40 hover:shadow-xs",
                            isCompleted ? "border-[#E3E7EF] opacity-75" : "border-[#DCE5F4]",
                          )}
                        >
                          {/* Row 1: Class Name & Room (Requirement 5) */}
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded bg-[#EAF0FA] px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-[#243B64]">
                                  {session.classCode}
                                </span>
                                <span className="text-[10.5px] font-medium text-[#7B8497]">
                                  {session.level}
                                </span>
                              </div>
                              <h3 className="mt-1 font-heading text-xs font-bold leading-snug text-[#253047] sm:text-[13.5px]">
                                {session.className}
                              </h3>
                            </div>

                            <span className="shrink-0 rounded-md border border-[#DCE5F4] bg-[#EAF0FA] px-2 py-0.5 font-mono text-xs font-bold text-[#243B64]">
                              {shortRoom}
                            </span>
                          </div>

                          {/* Row 2: Time & Status (Requirement 5) */}
                          <div className="mt-2.5 flex items-center justify-between border-t border-[#F1F4FA] pt-2 text-xs">
                            <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-[#556075]">
                              <Clock className="size-3 text-[#D9AE54]" aria-hidden="true" />
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
                          </div>

                          {/* Row 3: Brief Lesson Content (Requirement 5) */}
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#556075]">
                            <span className="font-semibold text-[#253047]">Nội dung:</span>{" "}
                            {session.topic}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Expand / Collapse Button if multiple sessions on day (Requirement 6) */}
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
                        <span>Xem thêm ({daySessions.length - 2} ca học khác trong ngày)</span>
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Footer CTA: "Xem toàn bộ lịch học" (Requirement 8) */}
              <div className="mt-4 border-t border-[#DCE5F4] pt-3">
                <Link
                  href={fullScheduleUrl as never}
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

      {/* =====================================================================
          SECTION 05 – STUDENT HALL OF FAME (WARM CREAM + CHAMPAGNE GOLD)
      ===================================================================== */}
      <section className="relative overflow-hidden border-y border-[#E6D7B8] bg-gradient-to-r from-[#F7F0E2] via-[#F4E9D2] to-[#F7F0E2] py-10 sm:py-12">
        {/* Subtle Decorative Wheat/Laurel Background Accents */}
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
            {/* Left Column (4 cols): Trophy + Editorial Title + Description + CTA */}
            <div className="lg:col-span-4">
              <div className="flex items-start gap-3.5">
                {/* Golden Trophy Emblem */}
                <div className="flex size-13 shrink-0 items-center justify-center rounded-2xl border border-[#D9AE54]/50 bg-gradient-to-b from-[#FFFDF9] to-[#F5E6C4] text-[#B8861E] shadow-xs">
                  <Trophy className="size-7 text-[#D9AE54] fill-[#D9AE54]/25" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-heading text-xs font-bold tracking-wider text-[#243B64] uppercase sm:text-[13px]">
                    <span className="font-normal text-[#7B8497]">03.</span> BẢNG VÀNG HỌC SINH
                  </p>
                  <h2 className="mt-0.5 font-serif text-2xl leading-tight font-semibold text-[#253047] italic sm:text-[26px]">
                    Tỏa sáng cùng English Manager
                  </h2>
                </div>
              </div>

              <p className="mt-3.5 text-xs leading-relaxed text-[#556075] sm:text-[13.5px]">
                Ghi nhận những nỗ lực và thành tích xuất sắc của các em học sinh trên hành trình
                chinh phục tiếng Anh.
              </p>

              <div className="mt-5">
                <Button
                  size="default"
                  className="h-9 rounded-full bg-[#243B64] px-5 text-xs font-semibold text-white shadow-xs hover:bg-[#1E3458]"
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
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 sm:gap-6">
                {featuredHonors.map((student, index) => (
                  <Link
                    key={student.id}
                    href="/hall-of-fame"
                    className="group flex flex-col items-center text-center focus-visible:outline-none"
                  >
                    {/* Circular Avatar with Golden Laurel Wreath SVG */}
                    <div className="relative flex size-28 items-center justify-center sm:size-30">
                      {/* Golden Laurel Wreath SVG Frame */}
                      <svg
                        viewBox="0 0 120 120"
                        fill="none"
                        className="pointer-events-none absolute inset-0 size-full transition-transform duration-300 group-hover:scale-105"
                        aria-hidden="true"
                      >
                        {/* Outer Soft Gold Ring */}
                        <circle
                          cx="60"
                          cy="60"
                          r="44"
                          stroke="#D9AE54"
                          strokeWidth="2"
                          strokeOpacity="0.65"
                        />
                        {/* Left Laurel Branch */}
                        <path
                          d="M60 108C30 104 12 82 12 54C12 32 25 16 42 10"
                          stroke="#D9AE54"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeDasharray="4 5"
                        />
                        {/* Right Laurel Branch */}
                        <path
                          d="M60 108C90 104 108 82 108 54C108 32 95 16 78 10"
                          stroke="#D9AE54"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeDasharray="4 5"
                        />
                        {/* Top Star Accent */}
                        <circle cx="60" cy="10" r="3" fill="#D9AE54" />
                      </svg>

                      {/* Inner Portrait Circle */}
                      <div
                        className={cn(
                          "relative flex size-21 flex-col items-center justify-center overflow-hidden rounded-full border-2 border-[#D9AE54] shadow-xs transition-transform duration-300 group-hover:scale-[1.03] sm:size-22",
                          index % 2 === 0
                            ? "bg-gradient-to-b from-[#243B64] to-[#1E3458] text-white"
                            : "bg-gradient-to-b from-[#FFFDF9] to-[#EFE2C6] text-[#243B64]",
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
                            "mt-1 rounded-full px-1.5 py-0.2 text-[9px] font-semibold",
                            index % 2 === 0
                              ? "bg-white/15 text-[#F7F0E2]"
                              : "bg-[#243B64]/10 text-[#243B64]",
                          )}
                        >
                          #{student.rank}
                        </span>
                      </div>
                    </div>

                    {/* Student Name, Metric & Period */}
                    <h3 className="mt-1.5 font-heading text-xs font-bold text-[#253047] group-hover:text-[#243B64] sm:text-sm">
                      {student.displayName}
                    </h3>
                    <p className="mt-0.5 font-heading text-xs font-extrabold text-[#243B64] sm:text-[13.5px]">
                      {student.headlineMetric}
                    </p>
                    <p className="text-[11px] text-[#7B8497]">
                      ({student.periodLabel})
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 06 – 3-COLUMN LOWER CONTENT: PODCAST | PROJECTS | LIBRARY
      ===================================================================== */}
      <section className="mx-auto max-w-[1360px] px-4 py-10 sm:px-8 sm:py-12 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-12 lg:divide-x lg:divide-[#E3E7EF]">
          {/* COLUMN 1 (4 cols): 04. PODCAST HỌC THUẬT */}
          <div className="flex flex-col justify-between lg:col-span-4 lg:pr-7">
            <div>
              <div className="flex items-center gap-2">
                <Headphones className="size-4 text-[#D9AE54]" aria-hidden="true" />
                <h2 className="font-heading text-xs font-bold tracking-wide text-[#243B64] uppercase sm:text-sm">
                  <span className="font-normal text-[#7B8497]">04.</span> PODCAST HỌC THUẬT
                </h2>
              </div>

              <p className="mt-1.5 font-serif text-lg font-bold text-[#243B64] sm:text-xl">
                Nghe để học – Học để tiến bộ
              </p>

              <p className="mt-1.5 text-xs leading-relaxed text-[#556075] sm:text-[13px]">
                Những bài học tiếng Anh, chia sẻ kinh nghiệm và câu chuyện truyền cảm hứng.
              </p>

              {/* Compact Navy & White Studio Player */}
              {featuredPodcast && (
                <div className="mt-4">
                  <AudioPlayer episode={featuredPodcast} compact />

                  {/* Episode Switcher Pills */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {podcasts.slice(0, 3).map((ep) => {
                      const active = ep.id === featuredPodcast.id;
                      return (
                        <button
                          key={ep.id}
                          type="button"
                          onClick={() => setActivePodcastId(ep.id)}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                            active
                              ? "bg-[#243B64] font-semibold text-white"
                              : "border border-[#E3E7EF] bg-white text-[#556075] hover:border-[#243B64]/40 hover:text-[#243B64]",
                          )}
                        >
                          Tập {ep.episodeNumber} ({ep.durationLabel})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end pt-2">
              <Link
                href="/podcast"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#243B64] hover:underline"
              >
                Xem tất cả podcast
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* COLUMN 2 (4 cols): 05. DỰ ÁN HỌC SINH TIÊU BIỂU */}
          <div className="flex flex-col justify-between lg:col-span-4 lg:px-7">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="size-4 text-[#D9AE54]" aria-hidden="true" />
                  <h2 className="font-heading text-xs font-bold tracking-wide text-[#243B64] uppercase sm:text-sm">
                    <span className="font-normal text-[#7B8497]">05.</span> DỰ ÁN HỌC SINH TIÊU BIỂU
                  </h2>
                </div>
                <Link
                  href="/showcase"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#243B64] hover:underline"
                >
                  Xem tất cả
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>

              <p className="mt-1.5 font-serif text-lg font-bold text-[#243B64] sm:text-xl">
                Sáng tạo – Tự tin – Hội nhập
              </p>

              {/* 2 Featured Project Visual Cards Side-by-Side */}
              <div className="mt-4 grid grid-cols-2 gap-3.5">
                {featuredProjects.map((project, idx) => (
                  <Link
                    key={project.id}
                    href="/showcase"
                    className="group flex flex-col overflow-hidden rounded-2xl border border-[#E3E7EF] bg-white shadow-2xs transition-all hover:-translate-y-0.5 hover:border-[#243B64]/40 hover:shadow-xs"
                  >
                    {/* Visual Project Poster Thumbnail */}
                    <div
                      className={cn(
                        "relative flex h-36 flex-col justify-between overflow-hidden p-3 sm:h-40",
                        idx === 0
                          ? "bg-gradient-to-br from-[#E6F2EA] via-[#D4E9DC] to-[#B8D9C5]"
                          : "bg-gradient-to-br from-[#EAF0FA] via-[#D7E4F7] to-[#B9D8F5]",
                      )}
                    >
                      <span className="self-start rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#243B64] shadow-2xs">
                        {PROJECT_CATEGORY_LABELS[project.category] ||
                          project.category}
                      </span>

                      {idx === 0 ? (
                        /* "Green Future / Urban Green Spaces" Poster Board Graphic */
                        <div className="my-auto flex flex-col items-center rounded-lg border border-emerald-700/20 bg-white/90 px-2.5 py-2 text-center shadow-2xs">
                          <span className="font-serif text-xs leading-none font-bold text-emerald-800">
                            Green Future
                          </span>
                          <span className="mt-0.5 text-[9px] font-medium text-emerald-700">
                            {project.featuredMetric}
                          </span>
                        </div>
                      ) : (
                        /* "Academic Debate / AI Tutors" Showcase Graphic */
                        <div className="my-auto flex flex-col items-center rounded-lg border border-[#243B64]/15 bg-white/90 px-2.5 py-2 text-center shadow-2xs">
                          <span className="font-serif text-xs leading-none font-bold text-[#243B64]">
                            Debate Club
                          </span>
                          <span className="mt-0.5 text-[9px] font-medium text-[#496B9A]">
                            {project.featuredMetric}
                          </span>
                        </div>
                      )}

                      <span className="truncate text-[10px] font-semibold text-[#253047]/80">
                        {project.className}
                      </span>
                    </div>

                    {/* Project Title & Student Name */}
                    <div className="p-3">
                      <h3 className="line-clamp-2 font-heading text-xs leading-snug font-bold text-[#253047] group-hover:text-[#243B64]">
                        {project.title}
                      </h3>
                      <p className="mt-1 truncate text-[11px] text-[#7B8497]">
                        {project.studentOrTeam}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-end pt-2">
              <Link
                href="/showcase"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#243B64] hover:underline"
              >
                Khám phá dự án học sinh
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* COLUMN 3 (4 cols): 06. THƯ VIỆN TÀI LIỆU */}
          <div className="flex flex-col justify-between lg:col-span-4 lg:pl-7">
            <div>
              <div className="flex items-center gap-2">
                <FolderOpen className="size-4 text-[#D9AE54]" aria-hidden="true" />
                <h2 className="font-heading text-xs font-bold tracking-wide text-[#243B64] uppercase sm:text-sm">
                  <span className="font-normal text-[#7B8497]">06.</span> THƯ VIỆN TÀI LIỆU
                </h2>
              </div>

              <p className="mt-1.5 font-serif text-lg font-bold text-[#243B64] sm:text-xl">
                Học liệu chất lượng, đồng hành cùng bạn
              </p>

              {/* 3 Stacked Compact Document Cards */}
              <div className="mt-4 space-y-2.5">
                {publicResources.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#E3E7EF] bg-white px-3.5 py-3 shadow-2xs transition-colors hover:border-[#243B64]/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF0FA] text-[#243B64]">
                        <FileText className="size-4.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-xs font-bold text-[#253047] sm:text-[13px]">
                          {doc.title}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-[#7B8497]">
                          ({FILE_TYPE_LABELS[doc.fileType] || doc.fileType},{" "}
                          {doc.size})
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleResourceDownload(doc.title, doc.size)}
                      aria-label={`Tải tài liệu ${doc.title}`}
                      title="Tải tài liệu"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#E3E7EF] bg-[#F8F9FC] text-[#243B64] transition-colors hover:bg-[#243B64] hover:text-white"
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-end pt-2">
              <Link
                href="/documents"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#243B64] hover:underline"
              >
                Xem thư viện tài liệu
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
