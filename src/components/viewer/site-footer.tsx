import Link from "next/link";
import { BookOpen, Clock, Headphones, Mail, MapPin, Newspaper, ShieldCheck } from "lucide-react";
import { VIEWER_NAV } from "@/lib/routes";
import { TEACHER_PROFILE } from "@/services/classroom-data";

export function SiteFooter() {
  return (
    <footer className="relative mt-16 overflow-hidden bg-[#1E3458] text-white">
      {/* Main 4-Column Footer Grid */}
      <div className="mx-auto max-w-[1360px] px-4 py-12 sm:px-8 lg:px-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-12 lg:divide-x lg:divide-white/10">
          {/* Column 1: Brand Emblem & Tagline (3 cols) */}
          <div className="lg:col-span-3 lg:pr-6">
            <Link href="/" className="inline-flex items-center gap-3 focus-visible:outline-none">
              {/* Open Book + Golden Laurel Emblem */}
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[#D9AE54]/45 bg-white/10 text-[#D9AE54]">
                <svg
                  viewBox="0 0 40 40"
                  fill="none"
                  className="size-8"
                  aria-hidden="true"
                >
                  <path
                    d="M8 28C5.5 24 5 18 7.5 13C9 16 10 19 12 22"
                    stroke="#D9AE54"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M32 28C34.5 24 35 18 32.5 13C31 16 30 19 28 22"
                    stroke="#D9AE54"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M20 12C16.5 10.5 12 10.5 9.5 12V26C12 24.5 16.5 24.5 20 26C23.5 24.5 28 24.5 30.5 26V12C28 10.5 23.5 10.5 20 12Z"
                    fill="white"
                    fillOpacity="0.9"
                  />
                  <path
                    d="M20 12V26"
                    stroke="#1E3458"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <div>
                <p className="font-serif text-xl leading-none font-bold tracking-tight text-white">
                  English
                </p>
                <p className="mt-0.5 font-serif text-xl leading-none font-bold tracking-tight text-white">
                  Manager
                </p>
              </div>
            </Link>

            <p className="mt-4 font-serif text-sm text-[#F7F0E2] italic">
              Learn English. Grow Together.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/70">
              {TEACHER_PROFILE.name} · {TEACHER_PROFILE.title}
            </p>
          </div>

          {/* Column 2: Contact Info (3 cols) */}
          <div className="lg:col-span-3 lg:px-6">
            <h2 className="font-heading text-sm font-bold text-white">
              Liên hệ
            </h2>
            <ul className="mt-4 space-y-3 text-xs leading-relaxed text-white/85">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-[#D9AE54]" aria-hidden="true" />
                <span>{TEACHER_PROFILE.location}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0 text-[#D9AE54]" aria-hidden="true" />
                <span>{TEACHER_PROFILE.email}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-[#D9AE54]" aria-hidden="true" />
                <span>{TEACHER_PROFILE.officeHours}</span>
              </li>
            </ul>
          </div>

          {/* Column 3: Connect & Quick Channels (3 cols) */}
          <div className="lg:col-span-3 lg:px-6">
            <h2 className="font-heading text-sm font-bold text-white">
              Kết nối với chúng tôi
            </h2>

            {/* Circular Channel Icons */}
            <div className="mt-4 flex items-center gap-2.5">
              <Link
                href="/podcast"
                aria-label="Spotify Podcast @minhanh.notes"
                title="Podcast Học thuật (@minhanh.notes)"
                className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:border-[#D9AE54] hover:bg-[#D9AE54] hover:text-[#1E3458]"
              >
                <Headphones className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/documents"
                aria-label="Thư viện Học liệu Open Resource Hub"
                title="Thư viện Học liệu (Open Resource Hub)"
                className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:border-[#D9AE54] hover:bg-[#D9AE54] hover:text-[#1E3458]"
              >
                <BookOpen className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/announcements"
                aria-label="Bảng tin Lớp học Weekly Digest"
                title="Bảng tin Lớp học (Weekly Digest)"
                className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:border-[#D9AE54] hover:bg-[#D9AE54] hover:text-[#1E3458]"
              >
                <Newspaper className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                aria-label="Cổng Quản trị Giáo viên"
                title="Cổng Quản trị Giáo viên"
                className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:border-[#D9AE54] hover:bg-[#D9AE54] hover:text-[#1E3458]"
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
              </Link>
            </div>

            <ul className="mt-4 space-y-1.5 text-xs text-white/75">
              {TEACHER_PROFILE.socials.map((soc) => (
                <li key={soc.label}>
                  <Link
                    href={soc.href as never}
                    className="transition-colors hover:text-[#F7F0E2] hover:underline"
                  >
                    {soc.label}: <span className="font-medium text-white">{soc.handle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Educational Quote & Open Book Watermark (3 cols) */}
          <div className="relative lg:col-span-3 lg:pl-6">
            <blockquote className="relative z-10 font-serif text-sm leading-relaxed text-white/90 italic">
              “Education is not the filling of a pail, but the lighting of a fire.”
            </blockquote>
            <p className="relative z-10 mt-2 text-xs font-medium text-[#D9AE54]">
              — W.B. Yeats
            </p>
            <p className="relative z-10 mt-3 text-[11px] leading-relaxed text-white/65">
              “{TEACHER_PROFILE.philosophy}”
            </p>

            {/* Subtle Decorative Open Book Watermark */}
            <svg
              viewBox="0 0 180 100"
              fill="none"
              className="pointer-events-none absolute -right-4 -bottom-6 w-40 opacity-15"
              aria-hidden="true"
            >
              <path
                d="M90 25C65 15 30 18 10 28V82C30 72 65 70 90 82C115 70 150 72 170 82V28C150 18 115 15 90 25Z"
                stroke="white"
                strokeWidth="2"
              />
              <path d="M90 25V82" stroke="white" strokeWidth="2" />
              <path d="M25 42C45 35 68 35 82 42" stroke="white" strokeWidth="1.2" />
              <path d="M25 54C45 47 68 47 82 54" stroke="white" strokeWidth="1.2" />
              <path d="M98 42C112 35 135 35 155 42" stroke="white" strokeWidth="1.2" />
              <path d="M98 54C112 47 135 47 155 54" stroke="white" strokeWidth="1.2" />
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom Copyright & Policy Links */}
      <div className="border-t border-white/10 bg-[#182B49]">
        <div className="mx-auto flex max-w-[1360px] flex-col items-center justify-between gap-3 px-4 py-4 text-xs text-white/70 sm:flex-row sm:px-8 lg:px-10">
          <p>© 2026 English Manager · {TEACHER_PROFILE.name}. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-3">
            {VIEWER_NAV.slice(0, 3).map((item, idx) => (
              <span key={item.href} className="inline-flex items-center gap-3">
                {idx > 0 && <span className="text-white/25">|</span>}
                <Link href={item.href} className="transition-colors hover:text-white">
                  {item.label}
                </Link>
              </span>
            ))}
            <span className="text-white/25">|</span>
            <Link href="/student" className="transition-colors hover:text-white">
              Chính sách bảo mật
            </Link>
            <span className="text-white/25">|</span>
            <Link href="/documents" className="transition-colors hover:text-white">
              Điều khoản sử dụng
            </Link>
            <span className="text-white/25">|</span>
            <Link href="/login" className="transition-colors hover:text-white">
              Hỗ trợ
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
