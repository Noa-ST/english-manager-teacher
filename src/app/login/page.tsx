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
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-client";
import { BigBenSilhouette } from "@/components/viewer/big-ben-silhouette";
import { SiteFooter } from "@/components/viewer/site-footer";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const roleParam = searchParams.get("role");

  const [userSelectedRole, setUserSelectedRole] = React.useState<"student" | "admin" | null>(null);
  const activeRole: "student" | "admin" =
    userSelectedRole ?? (roleParam === "admin" ? "admin" : "student");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [resetMode, setResetMode] = React.useState(false);
  const [resetSent, setResetSent] = React.useState(false);
  const [supportEmail, setSupportEmail] = React.useState("");
  const [teacherName, setTeacherName] = React.useState("");
  const errorSummaryRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let active = true;
    apiRequest<{ teacher?: { name?: string; email?: string } }>("/api/viewer/overview")
      .then((res) => {
        if (!active || !res?.teacher) return;
        if (res.teacher.email) setSupportEmail(res.teacher.email);
        if (res.teacher.name) setTeacherName(res.teacher.name);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const resolveDestination = (role: "admin" | "student", defaultPath: string) => {
    if (
      !nextParam ||
      !nextParam.startsWith("/") ||
      nextParam.startsWith("//") ||
      nextParam.startsWith("/\\")
    ) {
      return defaultPath;
    }
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
        body: JSON.stringify({
          email: targetEmail.trim(),
          password: targetPassword,
          rememberMe,
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        data?: { user: { role: "admin" | "student" }; redirectTo: string };
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok || !payload.data) {
        const defaultMsg =
          activeRole === "student"
            ? "Email hoặc mật khẩu chưa chính xác. Vui lòng kiểm tra lại thông tin tài khoản được giáo viên cấp."
            : "Email hoặc mật khẩu quản trị chưa chính xác. Vui lòng kiểm tra lại.";
        setError(payload.error?.message || defaultMsg);
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
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        let payload: { error?: { message?: string } } | null = null;
        try {
          payload = (await response.json()) as { error?: { message?: string } };
        } catch {
          payload = null;
        }
        if (!response.ok) {
          setError(
            payload?.error?.message ||
              "Không thể gửi yêu cầu khôi phục mật khẩu. Vui lòng thử lại sau.",
          );
          window.setTimeout(() => errorSummaryRef.current?.focus(), 50);
          return;
        }
        setResetSent(true);
      } catch {
        setError("Không thể gửi yêu cầu khôi phục mật khẩu.");
        window.setTimeout(() => errorSummaryRef.current?.focus(), 50);
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
                  Cùng xây dựng hành trình học tiếng Anh hiệu quả
                  {teacherName ? ` với sự đồng hành của ${teacherName}` : ""}.
                  {" "}Không gian học thuật tập trung, minh bạch kết quả và đồng hành cùng sự tiến bộ của
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

                {/* Role Switcher Tabs (Học sinh vs Giáo viên) */}
                {!resetMode && (
                  <div className="mt-5">
                    <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#E3E7EF] bg-[#F5F7FB] p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserSelectedRole("student");
                          setError(null);
                        }}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all",
                          activeRole === "student"
                            ? "bg-white text-[#243B64] shadow-xs font-bold"
                            : "text-[#556075] hover:text-[#243B64]",
                        )}
                      >
                        <GraduationCap className="size-4" aria-hidden="true" />
                        <span>Học sinh</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUserSelectedRole("admin");
                          setError(null);
                        }}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all",
                          activeRole === "admin"
                            ? "bg-white text-[#1E3458] shadow-xs font-bold"
                            : "text-[#556075] hover:text-[#1E3458]",
                        )}
                      >
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        <span>Giáo viên (Admin)</span>
                      </button>
                    </div>

                    {/* Contextual Guidance Callout */}
                    {activeRole === "student" ? (
                      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#D9AE54]/35 bg-[#FFFDF9] p-3 text-xs">
                        <GraduationCap
                          className="mt-0.5 size-4 shrink-0 text-[#B88728]"
                          aria-hidden="true"
                        />
                        <div className="leading-relaxed">
                          <p className="font-semibold text-[#1E3458]">Cổng Học sinh &amp; Tra cứu</p>
                          <p className="mt-0.5 text-[11px] text-[#556075]">
                            Đăng nhập bằng <strong>Email</strong> và <strong>Mật khẩu</strong> do giáo viên cấp sẵn khi vào lớp để tra cứu điểm, nhận xét &amp; tải học liệu nội bộ.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#243B64]/20 bg-[#F0F4FA] p-3 text-xs">
                        <ShieldCheck
                          className="mt-0.5 size-4 shrink-0 text-[#243B64]"
                          aria-hidden="true"
                        />
                        <div className="leading-relaxed">
                          <p className="font-semibold text-[#1E3458]">Cổng Quản trị Giáo viên</p>
                          <p className="mt-0.5 text-[11px] text-[#556075]">
                            Dành cho {teacherName || "Giáo viên"} và quản trị viên quản lý lớp học, điểm danh, chấm bài, CMS &amp; tài liệu.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
                  {/* Email Field */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="login-email"
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#253047]"
                    >
                      <Mail className="size-3.5 text-[#243B64]" aria-hidden="true" />
                      {resetMode
                        ? "Email của bạn"
                        : activeRole === "student"
                          ? "Email học sinh (do giáo viên cấp)"
                          : "Email giáo viên / quản trị viên"}
                    </Label>
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={
                        activeRole === "student"
                          ? "VD: ngoc.tran@student.edu.vn hoặc email được cấp..."
                          : "VD: teacher@englishmanager.edu.vn..."
                      }
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
                        {activeRole === "student" ? "Mật khẩu học sinh" : "Mật khẩu quản trị"}
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
                          placeholder={
                            activeRole === "student"
                              ? "Nhập mật khẩu do giáo viên cấp..."
                              : "Nhập mật khẩu quản trị..."
                          }
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
                      {activeRole === "admin" ? (
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
                      ) : (
                        <span className="text-[11px] text-[#7B8497]">
                          Quên mật khẩu?{" "}
                          <Link
                            href={supportEmail ? `mailto:${supportEmail}` : "/"}
                            className="font-medium text-[#243B64] hover:underline"
                          >
                            Báo giáo viên
                          </Link>
                        </span>
                      )}
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
                      ) : activeRole === "student" ? (
                        <span className="inline-flex items-center gap-2">
                          <GraduationCap className="size-4" aria-hidden="true" />
                          Đăng nhập Cổng Học sinh
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <ShieldCheck className="size-4 text-[#D9AE54]" aria-hidden="true" />
                          Đăng nhập Cổng Quản trị
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

                {/* Help Note */}
                <div className="mt-5 rounded-xl bg-[#F5F7FB] p-3 text-center text-xs text-[#7B8497]">
                  <p>
                    {activeRole === "student"
                      ? "💡 Tài khoản học sinh do giáo viên cấp trực tiếp khi tham gia khóa học."
                      : "💡 Tài khoản giáo viên và quản trị viên do hệ thống trung tâm phân quyền."}
                  </p>
                  <p className="mt-1">
                    Cần hỗ trợ?{" "}
                    <Link
                      href={supportEmail ? `mailto:${supportEmail}` : "/support"}
                      className="font-semibold text-primary hover:underline"
                    >
                      Liên hệ {teacherName || "Giáo viên"}
                    </Link>
                  </p>
                </div>
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
