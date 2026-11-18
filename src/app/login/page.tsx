"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  LogIn,
  Mail,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BigBenSilhouette } from "@/components/viewer/big-ben-silhouette";
import { SiteFooter } from "@/components/viewer/site-footer";
import { TEACHER_PROFILE } from "@/services/classroom-data";

const IS_DEV = process.env.NODE_ENV !== "production";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [resetMode, setResetMode] = React.useState(false);
  const [resetSent, setResetSent] = React.useState(false);
  const [quickLoginOpen, setQuickLoginOpen] = React.useState(false);
  const errorSummaryRef = React.useRef<HTMLDivElement>(null);

  const resolveDestination = (role: "admin" | "student", defaultPath: string) => {
    if (!nextParam || !nextParam.startsWith("/")) return defaultPath;
    if (role === "student" && !nextParam.startsWith("/student")) {
      return "/student";
    }
    return nextParam;
  };

  const performLogin = async (targetEmail: string, targetPassword: string) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail.trim(), password: targetPassword }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        data?: { user: { role: "admin" | "student" }; redirectTo: string };
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok || !payload.data) {
        setError(
          payload.error?.message ||
            "Thông tin đăng nhập chưa chính xác. Vui lòng kiểm tra lại email hoặc mật khẩu.",
        );
        window.setTimeout(() => errorSummaryRef.current?.focus(), 50);
        setLoading(false);
        return;
      }

      const dest = resolveDestination(payload.data.user.role, payload.data.redirectTo);
      router.push(dest as never);
      router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ xác thực. Vui lòng thử lại.");
      window.setTimeout(() => errorSummaryRef.current?.focus(), 50);
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role: "admin" | "student") => {
    if (!IS_DEV) return;
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/quick-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { user: { role: "admin" | "student" }; redirectTo: string };
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok || !payload.data) {
        setError(payload.error?.message || "Không thể đăng nhập nhanh.");
        setLoading(false);
        return;
      }

      const dest = resolveDestination(payload.data.user.role, payload.data.redirectTo);
      router.push(dest as never);
      router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ xác thực.");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetMode) {
      if (!email.trim()) {
        setError("Vui lòng nhập email tài khoản để nhận hướng dẫn khôi phục mật khẩu.");
        return;
      }
      setError(null);
      setLoading(true);
      try {
        await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        setResetSent(true);
      } catch {
        setError("Không thể gửi yêu cầu khôi phục mật khẩu.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setError("Vui lòng nhập đầy đủ email và mật khẩu xác thực.");
      window.setTimeout(() => errorSummaryRef.current?.focus(), 50);
      return;
    }
    await performLogin(email, password);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF7F2] text-[#253047]">
      {/* 1. TOP HEADER BAR */}
      <header className="border-b border-[#E3E7EF]/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-[1360px] items-center justify-between px-4 sm:px-8 lg:px-10">
          {/* Logo Brand Emblem */}
          <Link href="/" className="group inline-flex items-center gap-3 focus-visible:outline-none">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#D9AE54]/50 bg-[#1E3458] text-[#D9AE54] shadow-xs transition-transform duration-200 group-hover:scale-[1.03]">
              <svg viewBox="0 0 40 40" fill="none" className="size-7" aria-hidden="true">
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
                  fillOpacity="0.95"
                />
                <path d="M20 12V26" stroke="#1E3458" strokeWidth="1.5" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-[17px] leading-none font-bold tracking-tight text-[#1E3458]">
                English
              </span>
              <span className="mt-0.5 font-serif text-[17px] leading-none font-bold tracking-tight text-[#1E3458]">
                Manager
              </span>
            </div>
          </Link>

          {/* Return to homepage */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#556075] transition-colors hover:bg-white hover:text-[#1E3458]"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>Quay về trang chủ</span>
          </Link>
        </div>
      </header>

      {/* 2. MAIN BODY SECTION (2-Column Desktop, 1-Column Mobile) */}
      <main className="relative flex-1 overflow-hidden py-10 sm:py-14 lg:py-18">
        {/* Decorative Study Desk Photo (Far Left) */}
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 hidden w-[280px] overflow-hidden lg:block xl:w-[360px]">
          <Image
            src="/images/study-desk.jpg"
            alt="Study space"
            fill
            priority
            className="object-cover object-left opacity-85"
            sizes="(min-width: 1280px) 360px, 280px"
          />
          {/* Subtle gradient feather to seamlessly blend into #FAF7F2 */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FAF7F2]/30 to-[#FAF7F2]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#FAF7F2]/40 via-transparent to-[#FAF7F2]" />
        </div>

        {/* Delicate Big Ben Architectural Silhouette (Center Background) */}
        <div className="pointer-events-none absolute top-4 left-[50%] hidden -translate-x-1/2 lg:block xl:left-[47%]">
          <BigBenSilhouette className="h-[490px] w-auto text-[#D9AE54]" opacity={0.25} />
        </div>

        {/* Ambient Top Glow */}
        <div className="pointer-events-none absolute -top-32 right-1/4 size-[500px] rounded-full bg-[#B9D8F5]/25 blur-3xl" />

        <div className="relative mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-10">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
            {/* LEFT COLUMN: Brand Storytelling (Editorial Academic) */}
            <section
              aria-labelledby="brand-welcome-title"
              className="lg:col-span-7 lg:pl-16 xl:pl-28"
            >
              <div className="max-w-xl">
                <p className="font-heading text-xs font-semibold tracking-wider text-[#D9AE54] uppercase">
                  Academic English &amp; Mentorship Platform
                </p>
                <h1
                  id="brand-welcome-title"
                  className="mt-2 font-serif text-3xl font-bold tracking-tight text-[#1E3458] sm:text-4xl lg:text-[44px] lg:leading-[1.15]"
                >
                  Welcome to
                  <span className="mt-1 block font-serif text-4xl font-bold italic tracking-tight text-[#243B64] sm:text-5xl lg:text-[52px]">
                    English Manager
                  </span>
                </h1>

                {/* Golden Accent Line */}
                <div className="my-5 h-[3px] w-12 rounded-full bg-[#D9AE54]" />

                <p className="font-heading text-base font-bold text-[#1E3458] sm:text-lg">
                  Learn English. Grow Together.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#556075]">
                  Cùng xây dựng hành trình học tiếng Anh hiệu quả với sự đồng hành của cô Minh Anh.
                  Không gian học thuật tập trung, minh bạch kết quả và đồng hành cùng sự tiến bộ của
                  từng học viên.
                </p>

                {/* 3 Pillars / Feature Highlights with Clean Vertical Dividers */}
                <div className="mt-8 grid grid-cols-3 divide-x divide-[#E3E7EF] border-t border-[#E3E7EF]/90 pt-6 sm:mt-10">
                  <div className="flex flex-col items-center pr-2 text-center sm:pr-4">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#EAF0FA] text-[#243B64] shadow-2xs">
                      <GraduationCap className="size-5" aria-hidden="true" />
                    </div>
                    <span className="mt-2.5 text-xs font-semibold text-[#253047]">
                      Học thuật
                      <br />
                      chuyên sâu
                    </span>
                  </div>

                  <div className="flex flex-col items-center px-2 text-center sm:px-4">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#EAF0FA] text-[#243B64] shadow-2xs">
                      <Users className="size-5" aria-hidden="true" />
                    </div>
                    <span className="mt-2.5 text-xs font-semibold text-[#253047]">
                      Cộng đồng
                      <br />
                      học tập tích cực
                    </span>
                  </div>

                  <div className="flex flex-col items-center pl-2 text-center sm:pl-4">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#EAF0FA] text-[#243B64] shadow-2xs">
                      <TrendingUp className="size-5" aria-hidden="true" />
                    </div>
                    <span className="mt-2.5 text-xs font-semibold text-[#253047]">
                      Theo dõi tiến bộ
                      <br />
                      rõ ràng
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT COLUMN: Elevated Floating White Login Card */}
            <section
              aria-labelledby="login-card-title"
              className="lg:col-span-5 flex justify-center lg:justify-end"
            >
              <div className="w-full max-w-[460px] rounded-2xl border border-[#E3E7EF] bg-white p-7 shadow-[0_16px_50px_-12px_rgba(36,59,100,0.14)] sm:p-9">
                {/* Card Header with Open Book Icon */}
                <div className="flex items-center gap-3.5">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#1E3458] text-white shadow-xs">
                    <BookOpen className="size-5.5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2
                      id="login-card-title"
                      className="font-serif text-2xl font-bold tracking-tight text-[#1E3458] sm:text-[26px]"
                    >
                      {resetMode ? "Khôi phục mật khẩu" : "Đăng nhập"}
                    </h2>
                    <p className="mt-0.5 text-xs text-[#7B8497]">
                      {resetMode
                        ? "Nhập email để nhận liên kết khôi phục qua hộp thư"
                        : "Truy cập hệ thống quản lý học tập English Manager"}
                    </p>
                  </div>
                </div>

                {/* Error Alert Box */}
                {error && (
                  <div
                    ref={errorSummaryRef}
                    role="alert"
                    tabIndex={-1}
                    aria-live="assertive"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/95 p-3.5 text-xs text-red-800 outline-none"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">Không thể xác thực</p>
                      <p className="mt-0.5 leading-relaxed">{error}</p>
                    </div>
                  </div>
                )}

                {/* Success Alert Box for Password Reset */}
                {resetSent && (
                  <div
                    role="status"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/95 p-3.5 text-xs text-emerald-800"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-semibold">Đã gửi yêu cầu khôi phục</p>
                      <p className="mt-0.5 leading-relaxed">
                        Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến
                        hộp thư của bạn.
                      </p>
                    </div>
                  </div>
                )}

                {/* Sign-in Form */}
                <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                  {/* Email Field */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="login-email"
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#253047]"
                    >
                      <Mail className="size-3.5 text-[#243B64]" aria-hidden="true" />
                      Email của bạn
                    </Label>
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Nhập email..."
                      className="h-11 rounded-xl border-[#D8DFEC] bg-white px-3.5 text-xs text-[#253047] placeholder:text-[#9AA2B1] focus-visible:border-[#243B64] focus-visible:ring-2 focus-visible:ring-[#243B64]/20"
                    />
                  </div>

                  {/* Password Field (Only when not in resetMode) */}
                  {!resetMode && (
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="login-password"
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#253047]"
                      >
                        <Lock className="size-3.5 text-[#243B64]" aria-hidden="true" />
                        Mật khẩu
                      </Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Nhập mật khẩu..."
                          className="h-11 rounded-xl border-[#D8DFEC] bg-white pr-10 pl-3.5 text-xs text-[#253047] placeholder:text-[#9AA2B1] focus-visible:border-[#243B64] focus-visible:ring-2 focus-visible:ring-[#243B64]/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                          className="absolute top-1/2 right-2.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-[#7B8497] transition-colors hover:bg-[#F5F7FB] hover:text-[#253047]"
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" aria-hidden="true" />
                          ) : (
                            <Eye className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Options: Remember me & Forgot Password */}
                  {!resetMode && (
                    <div className="flex items-center justify-between pt-0.5">
                      <label className="inline-flex cursor-pointer items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="size-4 rounded border-[#D8DFEC] text-[#1E3458] focus:ring-[#1E3458]/20"
                        />
                        <span className="text-xs text-[#556075]">Ghi nhớ đăng nhập</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setResetMode(true);
                          setError(null);
                          setResetSent(false);
                        }}
                        className="text-xs font-semibold text-[#243B64] transition-colors hover:underline"
                      >
                        Quên mật khẩu?
                      </button>
                    </div>
                  )}

                  {/* Primary Submit Button */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={loading}
                      aria-busy={loading}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1E3458] text-xs font-semibold tracking-wide text-white shadow-xs transition-all hover:bg-[#243B64]"
                    >
                      {loading ? (
                        <span className="inline-flex items-center gap-2">
                          <svg
                            className="size-4 animate-spin text-white"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8H4z"
                            />
                          </svg>
                          Đang xác thực...
                        </span>
                      ) : resetMode ? (
                        <span>Gửi liên kết đặt lại mật khẩu</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <LogIn className="size-4" aria-hidden="true" />
                          Đăng nhập
                        </span>
                      )}
                    </Button>
                  </div>

                  {/* Return to Login if in resetMode */}
                  {resetMode && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setResetMode(false);
                        setError(null);
                        setResetSent(false);
                      }}
                      className="h-10 w-full rounded-xl border-[#D8DFEC] text-xs font-medium text-[#253047] hover:bg-[#F5F7FB]"
                    >
                      Quay lại đăng nhập
                    </Button>
                  )}
                </form>

                {/* Development Quick-Login Card (Strictly Gated to IS_DEV) */}
                {IS_DEV && !resetMode && (
                  <div className="mt-5 overflow-hidden rounded-xl border border-amber-200/90 bg-[#FFF9ED] text-xs">
                    <button
                      type="button"
                      onClick={() => setQuickLoginOpen((v) => !v)}
                      className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-amber-100/40"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
                          <Zap className="size-4 fill-amber-500 text-amber-600" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-heading font-bold text-[#1E3458]">
                            Vào nhanh 1-chạm
                          </p>
                          <p className="text-[11px] text-[#7B8497]">
                            (Chỉ dành cho môi trường phát triển)
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "size-4 text-[#7B8497] transition-transform duration-200",
                          quickLoginOpen && "rotate-180",
                        )}
                        aria-hidden="true"
                      />
                    </button>

                    {quickLoginOpen && (
                      <div className="border-t border-amber-200/70 p-3 pt-2.5">
                        <p className="mb-2 text-[11px] text-[#556075]">
                          Đăng nhập tức thì bằng tài khoản Supabase Auth được định cấu hình:
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void handleQuickLogin("admin")}
                            className="rounded-lg border border-[#D8DFEC] bg-white px-2.5 py-1.5 text-left font-medium text-[#1E3458] shadow-2xs transition-colors hover:border-[#1E3458] hover:bg-[#F5F7FB]"
                          >
                            <p className="font-semibold text-[11px]">Giáo viên / Quản trị viên</p>
                            <p className="text-[10px] text-[#7B8497] truncate">
                              teacher@example.com
                            </p>
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void handleQuickLogin("student")}
                            className="rounded-lg border border-[#D8DFEC] bg-white px-2.5 py-1.5 text-left font-medium text-[#1E3458] shadow-2xs transition-colors hover:border-[#1E3458] hover:bg-[#F5F7FB]"
                          >
                            <p className="font-semibold text-[11px]">Học sinh / Cổng học vụ</p>
                            <p className="text-[10px] text-[#7B8497] truncate">
                              student1@example.com
                            </p>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Help Note */}
                <p className="mt-5 text-center text-xs text-[#7B8497]">
                  Bạn cần hỗ trợ?{" "}
                  <Link
                    href={`mailto:${TEACHER_PROFILE.email}`}
                    className="font-semibold text-[#243B64] hover:underline"
                  >
                    Liên hệ giáo viên của bạn
                  </Link>
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* 3. SITE FOOTER (Consistent with Homepage) */}
      <SiteFooter />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF7F2]">
          <div className="size-8 animate-spin rounded-full border-2 border-[#1E3458] border-t-transparent" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
