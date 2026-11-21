"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  Clock,
  Copy,
  ExternalLink,
  Link2,
  Mail,
  MapPin,
  Palette,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react";
import {
  BRAND_DESIGN_TOKENS,
  type SettingsFormDraft,
} from "@/services/settings-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function SettingsBrandTab({
  draft,
  onChange,
}: {
  draft: SettingsFormDraft;
  onChange: (updater: (prev: SettingsFormDraft) => SettingsFormDraft) => void;
}) {
  const { toast } = useToast();

  const updateField = <K extends keyof SettingsFormDraft>(
    key: K,
    value: SettingsFormDraft[K],
  ) => {
    onChange((prev) => ({ ...prev, [key]: value }));
  };

  const handleCredentialChange = (index: number, value: string) => {
    onChange((prev) => ({
      ...prev,
      credentials: prev.credentials.map((item, idx) =>
        idx === index ? value : item,
      ),
    }));
  };

  const handleAddCredential = () => {
    onChange((prev) => ({
      ...prev,
      credentials: [...prev.credentials, ""],
    }));
  };

  const handleRemoveCredential = (index: number) => {
    onChange((prev) => ({
      ...prev,
      credentials: prev.credentials.filter((_, idx) => idx !== index),
    }));
  };

  const handleSocialChange = (
    index: number,
    field: "label" | "href" | "handle",
    value: string,
  ) => {
    onChange((prev) => ({
      ...prev,
      socials: prev.socials.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const handleAddSocial = () => {
    onChange((prev) => ({
      ...prev,
      socials: [...prev.socials, { label: "", href: "/", handle: "" }],
    }));
  };

  const handleRemoveSocial = (index: number) => {
    onChange((prev) => ({
      ...prev,
      socials: prev.socials.filter((_, idx) => idx !== index),
    }));
  };

  const handleCopyTokenHex = async (name: string, hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      toast({
        title: `Đã sao chép mã màu ${name}`,
        description: hex,
        variant: "info",
      });
    } catch {
      toast({
        title: "Không thể sao chép tự động",
        description: `Mã màu ${name}: ${hex}`,
        variant: "warning",
      });
    }
  };

  const avatarPreviewSrc = draft.avatarUrl.trim() || "/images/teacher-avatar.jpg";

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Column: Detailed Teacher Profile & Brand Fields (7 cols) */}
      <div className="space-y-6 lg:col-span-7">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-warm text-primary">
                <UserCheck className="size-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Hồ sơ Thương hiệu Giáo viên (Public Branding)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Đồng bộ tức thì lên Hero Cổng công khai, Footer và Sidebar Giáo viên.
                </p>
              </div>
            </div>
            <Badge variant="warm">Single Source of Truth</Badge>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="set-name"
                  className="block text-xs font-semibold text-foreground"
                >
                  Họ tên &amp; Học vị hiển thị
                </label>
                <Input
                  id="set-name"
                  value={draft.name}
                  onChange={(e) => updateField("name", e.target.value)}
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
                  value={draft.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="set-email"
                  className="block text-xs font-semibold text-foreground"
                >
                  Email liên hệ công khai
                </label>
                <Input
                  id="set-email"
                  type="email"
                  value={draft.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="teacher@englishportal.vn"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="set-avatar"
                  className="block text-xs font-semibold text-foreground"
                >
                  Ảnh đại diện giáo viên (URL hoặc /images/...)
                </label>
                <Input
                  id="set-avatar"
                  value={draft.avatarUrl}
                  onChange={(e) => updateField("avatarUrl", e.target.value)}
                  placeholder="/images/teacher-avatar.jpg"
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
                value={draft.slogan}
                onChange={(e) => updateField("slogan", e.target.value)}
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
                value={draft.shortBio}
                onChange={(e) => updateField("shortBio", e.target.value)}
                className="w-full rounded-xl border border-input bg-background p-3 text-xs leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="set-philosophy"
                className="block text-xs font-semibold text-foreground"
              >
                Triết lý giảng dạy (hiển thị tại Footer &amp; About)
              </label>
              <textarea
                id="set-philosophy"
                rows={2}
                value={draft.philosophy}
                onChange={(e) => updateField("philosophy", e.target.value)}
                className="w-full rounded-xl border border-input bg-background p-3 text-xs leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="set-exp"
                  className="block text-xs font-semibold text-foreground"
                >
                  Số năm kinh nghiệm
                </label>
                <Input
                  id="set-exp"
                  type="number"
                  min={0}
                  max={100}
                  value={draft.experienceYears}
                  onChange={(e) =>
                    updateField("experienceYears", Number(e.target.value) || 0)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="set-total-stu"
                  className="block text-xs font-semibold text-foreground"
                >
                  Học viên đã đào tạo
                </label>
                <Input
                  id="set-total-stu"
                  type="number"
                  min={0}
                  value={draft.totalStudents}
                  onChange={(e) =>
                    updateField("totalStudents", Number(e.target.value) || 0)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="set-rate"
                  className="block text-xs font-semibold text-foreground"
                >
                  Thành tích đầu ra
                </label>
                <Input
                  id="set-rate"
                  value={draft.bandAchievementRate}
                  onChange={(e) =>
                    updateField("bandAchievementRate", e.target.value)
                  }
                />
              </div>
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
                  value={draft.officeHours}
                  onChange={(e) => updateField("officeHours", e.target.value)}
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
                  value={draft.location}
                  onChange={(e) => updateField("location", e.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Credentials & Social Links */}
        <section className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="size-4 text-primary" aria-hidden="true" />
                <h3 className="font-heading text-sm font-bold text-foreground">
                  Bằng cấp &amp; Chứng chỉ chuyên môn
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleAddCredential}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Thêm bằng cấp
              </Button>
            </div>

            <div className="space-y-2">
              {draft.credentials.map((cred, index) => (
                <div key={`cred-${index}`} className="flex items-center gap-2">
                  <Input
                    value={cred}
                    onChange={(e) =>
                      handleCredentialChange(index, e.target.value)
                    }
                    placeholder="VD: IELTS 8.5 Overall · Cambridge CELTA Pass A"
                    className="h-9 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveCredential(index)}
                    aria-label="Xóa bằng cấp"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {draft.credentials.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Chưa có chứng chỉ nào. Nhấn &quot;Thêm bằng cấp&quot; để hiển thị trên trang chủ.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-primary" aria-hidden="true" />
                <h3 className="font-heading text-sm font-bold text-foreground">
                  Kênh kết nối công khai (Footer Socials)
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleAddSocial}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Thêm kênh
              </Button>
            </div>

            <div className="space-y-2.5">
              {draft.socials.map((soc, index) => (
                <div
                  key={`social-${index}`}
                  className="grid gap-2 rounded-xl border border-border bg-background/60 p-3 sm:grid-cols-12"
                >
                  <Input
                    value={soc.label}
                    onChange={(e) =>
                      handleSocialChange(index, "label", e.target.value)
                    }
                    placeholder="Tên kênh"
                    className="h-8 text-xs sm:col-span-4"
                  />
                  <Input
                    value={soc.handle}
                    onChange={(e) =>
                      handleSocialChange(index, "handle", e.target.value)
                    }
                    placeholder="Handle (@...)"
                    className="h-8 text-xs sm:col-span-3"
                  />
                  <Input
                    value={soc.href}
                    onChange={(e) =>
                      handleSocialChange(index, "href", e.target.value)
                    }
                    placeholder="/podcast hoặc https://..."
                    className="h-8 text-xs sm:col-span-4"
                  />
                  <div className="flex items-center justify-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveSocial(index)}
                      aria-label="Xóa kênh kết nối"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Right Column: Live Brand Preview & Design Tokens (5 cols) */}
      <div className="space-y-6 lg:col-span-5">
        {/* Live Teacher Brand Card Preview */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Xem trước Hiển thị Công khai
              </h2>
              <p className="text-xs text-muted-foreground">
                Cập nhật theo thời gian thực khi chỉnh sửa.
              </p>
            </div>
            <Link
              href={{ pathname: "/cms", query: { tab: "brand" } }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Mở Brand Studio
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-4 space-y-4 rounded-xl border border-border bg-background/70 p-4">
            <div className="flex items-center gap-3.5">
              <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarPreviewSrc}
                  alt={draft.name || "Ảnh đại diện giáo viên"}
                  className="size-full object-cover object-top"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-bold text-foreground">
                  {draft.name || "Chưa nhập tên giáo viên"}
                </p>
                <p className="truncate text-xs text-primary">
                  {draft.title || "Chức danh chuyên môn"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {draft.experienceYears}+ năm · {draft.totalStudents}+ học viên ·{" "}
                  {draft.bandAchievementRate}
                </p>
              </div>
            </div>

            <p className="rounded-lg bg-warm/60 px-3 py-2 font-serif text-xs text-foreground italic">
              &ldquo;{draft.slogan || "Thông điệp sư phạm"}&rdquo;
            </p>

            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <Mail className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{draft.email}</span>
              </p>
              <p className="flex items-center gap-2">
                <Clock className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{draft.officeHours}</span>
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{draft.location}</span>
              </p>
            </div>
          </div>
        </section>

        {/* Design System Tokens Card */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center gap-2.5 border-b border-border pb-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-secondary/50 text-primary">
              <Palette className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Hệ thống Bảng màu Thương hiệu (Design Tokens)
              </h2>
              <p className="text-xs text-muted-foreground">
                Nhấn vào thẻ màu để sao chép nhanh mã Hex chuẩn Modern Academic.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
            {Object.values(BRAND_DESIGN_TOKENS).map((token) => (
              <button
                key={token.hex}
                type="button"
                onClick={() => void handleCopyTokenHex(token.name, token.hex)}
                className="group rounded-xl border border-border bg-background p-2.5 text-left transition-colors hover:border-primary/40"
              >
                <div
                  className="h-8 w-full rounded-lg border border-black/10"
                  style={{ backgroundColor: token.hex }}
                />
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <p className="truncate text-[11px] font-semibold text-foreground">
                    {token.name}
                  </p>
                  <Copy
                    className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {token.hex}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                  {token.role}
                </p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
