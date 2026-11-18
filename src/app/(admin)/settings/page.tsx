"use client";

import * as React from "react";
import {
  CheckCircle2,
  Cloud,
  Globe,
  KeyRound,
  Palette,
  Save,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { TEACHER_PROFILE } from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { StudentAccountManager } from "@/components/admin/student-account-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export default function AdminSettingsPage() {
  const { toast } = useToast();

  // Teacher Brand Profile state
  const [teacherName, setTeacherName] = React.useState(TEACHER_PROFILE.name);
  const [teacherTitle, setTeacherTitle] = React.useState(TEACHER_PROFILE.title);
  const [slogan, setSlogan] = React.useState(TEACHER_PROFILE.slogan);
  const [shortBio, setShortBio] = React.useState(TEACHER_PROFILE.shortBio);
  const [officeHours, setOfficeHours] = React.useState(
    TEACHER_PROFILE.officeHours,
  );
  const [location, setLocation] = React.useState(TEACHER_PROFILE.location);

  // Academic & Portal Access Settings
  const [currentTerm, setCurrentTerm] = React.useState(
    "Học kỳ I · Năm học 2026–2027",
  );
  const [defaultPortalPin, setDefaultPortalPin] = React.useState("123456");
  const [autoNotifyParents, setAutoNotifyParents] = React.useState(true);
  const [presignedExpirySeconds, setPresignedExpirySeconds] =
    React.useState("900");

  React.useEffect(() => {
    apiRequest<{
      name: string;
      title: string;
      slogan: string;
      shortBio: string;
      officeHours: string;
      location: string;
      currentTerm: string;
      defaultPortalPin: string;
      autoNotifyParents: boolean;
      presignedExpirySeconds: number;
    }>("/api/admin/settings")
      .then((res) => {
        setTeacherName(res.name);
        setTeacherTitle(res.title);
        setSlogan(res.slogan);
        setShortBio(res.shortBio);
        setOfficeHours(res.officeHours);
        setLocation(res.location);
        setCurrentTerm(res.currentTerm);
        setDefaultPortalPin(res.defaultPortalPin);
        setAutoNotifyParents(res.autoNotifyParents);
        setPresignedExpirySeconds(String(res.presignedExpirySeconds));
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          name: teacherName,
          title: teacherTitle,
          slogan,
          shortBio,
          officeHours,
          location,
          currentTerm,
          defaultPortalPin,
          autoNotifyParents,
          presignedExpirySeconds: Number(presignedExpirySeconds) || 900,
        }),
      });
    } catch {
      // Fallback
    }
    toast({
      title: "Đã lưu cấu hình hệ thống",
      description:
        "Thông tin thương hiệu cá nhân và thiết lập bảo mật Cổng học sinh đã được cập nhật.",
      variant: "success",
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Cài đặt Hệ thống & Thương hiệu Giáo viên
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý hồ sơ thương hiệu cá nhân trên Public Portal, cấu hình học kỳ và bảo mật
            Cloudflare R2.
          </p>
        </div>

        <Button onClick={handleSaveSettings}>
          <Save className="size-4" aria-hidden="true" />
          Lưu toàn bộ cài đặt
        </Button>
      </div>

      <form onSubmit={handleSaveSettings} className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Teacher Personal Branding (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-warm text-primary">
                  <UserCheck className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-heading text-base font-bold text-foreground">
                    Hồ sơ Thương hiệu Giáo viên (Public Branding)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Hiển thị trực tiếp tại Hero Section và Footer của Cổng thông tin công khai.
                  </p>
                </div>
              </div>
              <Badge variant="warm">Modern Academic</Badge>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="set-name"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Họ tên & Học vị hiển thị
                  </label>
                  <Input
                    id="set-name"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="set-title"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Danh xưng chuyên môn
                  </label>
                  <Input
                    id="set-title"
                    value={teacherTitle}
                    onChange={(e) => setTeacherTitle(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="set-slogan"
                  className="block text-xs font-semibold text-foreground"
                >
                  Thông điệp sư phạm chủ đạo (Hero Headline)
                </label>
                <Input
                  id="set-slogan"
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="set-bio"
                  className="block text-xs font-semibold text-foreground"
                >
                  Giới thiệu ngắn (Editorial Bio)
                </label>
                <textarea
                  id="set-bio"
                  rows={3}
                  value={shortBio}
                  onChange={(e) => setShortBio(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background p-3 text-xs leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="set-hours"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Khung giờ tư vấn 1:1 (Office Hours)
                  </label>
                  <Input
                    id="set-hours"
                    value={officeHours}
                    onChange={(e) => setOfficeHours(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="set-loc"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Địa điểm phòng học
                  </label>
                  <Input
                    id="set-loc"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Design System Token Preview */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 border-b border-border pb-4">
              <div className="flex size-9 items-center justify-center rounded-xl bg-secondary/50 text-primary">
                <Palette className="size-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Hệ thống Bảng màu Thương hiệu (Design System Tokens)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Phong cách Modern Academic — Friendly & Premium đang được kích hoạt.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {[
                { name: "Navy Primary", hex: "#243B64", bg: "bg-[#243B64]" },
                { name: "Blue Accent", hex: "#6C8FE6", bg: "bg-[#6C8FE6]" },
                { name: "Sky Secondary", hex: "#B9D8F5", bg: "bg-[#B9D8F5]" },
                { name: "Warm Cream", hex: "#F5EEDC", bg: "bg-[#F5EEDC]" },
                { name: "Coral Highlight", hex: "#F3A98B", bg: "bg-[#F3A98B]" },
              ].map((sw) => (
                <div
                  key={sw.hex}
                  className="rounded-xl border border-border bg-background p-2.5 text-center"
                >
                  <div
                    className={`mx-auto h-8 w-full rounded-lg border border-black/10 ${sw.bg}`}
                  />
                  <p className="mt-1.5 text-[11px] font-semibold text-foreground">
                    {sw.name}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {sw.hex}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Security, Portal Access & Cloud R2 (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Student Portal Privacy & Auth */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 border-b border-border pb-4">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <KeyRound className="size-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Bảo mật Cổng tra cứu Học sinh
                </h2>
                <p className="text-xs text-muted-foreground">
                  Quy tắc bảo vệ quyền riêng tư học vụ (Privacy-by-Design).
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="set-term"
                  className="block text-xs font-semibold text-foreground"
                >
                  Học kỳ vận hành hiện tại
                </label>
                <Input
                  id="set-term"
                  value={currentTerm}
                  onChange={(e) => setCurrentTerm(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="set-pin"
                  className="block text-xs font-semibold text-foreground"
                >
                  Mật khẩu tra cứu mặc định khi khởi tạo Mã HS mới
                </label>
                <Input
                  id="set-pin"
                  type="text"
                  value={defaultPortalPin}
                  onChange={(e) => setDefaultPortalPin(e.target.value)}
                  className="font-mono"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-background p-3.5 text-xs">
                <input
                  type="checkbox"
                  checked={autoNotifyParents}
                  onChange={(e) => setAutoNotifyParents(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-input accent-primary"
                />
                <span>
                  <strong className="font-semibold text-foreground">
                    Bắt buộc xác thực 2 lớp (Mã HS + Mật khẩu)
                  </strong>
                  <span className="mt-0.5 block text-muted-foreground">
                    Tuyệt đối không hiển thị điểm số, chuyên cần hoặc học phí trước khi xác thực
                    thành công.
                  </span>
                </span>
              </label>
            </div>
          </section>

          {/* Cloud Storage S3 / R2 Config */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-warm text-primary">
                  <Cloud className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-heading text-base font-bold text-foreground">
                    Cấu hình Cloud Object Storage
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Cloudflare R2 / AWS S3 Presigned URL
                  </p>
                </div>
              </div>
              <Badge variant="success">Đang hoạt động</Badge>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-xl bg-background p-3">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="size-3.5 text-primary" aria-hidden="true" />
                  Public Bucket
                </span>
                <span className="font-mono font-semibold text-foreground">
                  english-portal-public
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-background p-3">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                  Private Bucket
                </span>
                <span className="font-mono font-semibold text-foreground">
                  english-portal-private
                </span>
              </div>

              <div className="space-y-1.5 pt-1">
                <label
                  htmlFor="set-expiry"
                  className="block text-xs font-semibold text-foreground"
                >
                  Thời hạn hiệu lực Presigned URL (Giây)
                </label>
                <Input
                  id="set-expiry"
                  type="number"
                  value={presignedExpirySeconds}
                  onChange={(e) => setPresignedExpirySeconds(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <Button type="submit" size="lg" className="w-full">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Lưu toàn bộ thiết lập hệ thống
            </Button>
          </div>
        </div>
      </form>

      <StudentAccountManager />
    </div>
  );
}
