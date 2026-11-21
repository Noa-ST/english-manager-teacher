"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import type { TeacherProfile } from "@/services/classroom-data";
import {
  parseCredentialDisplay,
  splitSloganLines,
} from "@/services/cms-helpers";
import { SETTINGS_UPDATED_EVENT } from "@/services/settings-helpers";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function CmsBrandStudioTab({
  teacherBrand,
  onBrandChange,
}: {
  teacherBrand: TeacherProfile;
  onBrandChange: (next: TeacherProfile) => void;
}) {
  const { toast } = useToast();

  const [name, setName] = React.useState(teacherBrand.name);
  const [title, setTitle] = React.useState(teacherBrand.title);
  const [slogan, setSlogan] = React.useState(teacherBrand.slogan);
  const [shortBio, setShortBio] = React.useState(teacherBrand.shortBio);
  const [philosophy, setPhilosophy] = React.useState(teacherBrand.philosophy);
  const [experienceYears, setExperienceYears] = React.useState(
    String(teacherBrand.experienceYears),
  );
  const [totalStudents, setTotalStudents] = React.useState(
    String(teacherBrand.totalStudents),
  );
  const [bandAchievementRate, setBandAchievementRate] = React.useState(
    teacherBrand.bandAchievementRate,
  );
  const [credentials, setCredentials] = React.useState<string[]>(
    teacherBrand.credentials.length > 0
      ? teacherBrand.credentials
      : [
          "M.A. in TESOL — University of Melbourne",
          "IELTS 8.5 Overall (9.0 Reading & Listening)",
          "Cambridge CELTA — Pass A",
        ],
  );
  const [email, setEmail] = React.useState(teacherBrand.email);
  const [officeHours, setOfficeHours] = React.useState(teacherBrand.officeHours);
  const [location, setLocation] = React.useState(teacherBrand.location);
  const [isSaving, setIsSaving] = React.useState(false);

  const [sloganLine1, sloganLine2] = React.useMemo(
    () => splitSloganLines(slogan),
    [slogan],
  );

  const previewCredentials = React.useMemo(
    () =>
      credentials
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map(parseCredentialDisplay),
    [credentials],
  );

  const handleCredentialChange = (index: number, value: string) => {
    setCredentials((prev) =>
      prev.map((item, idx) => (idx === index ? value : item)),
    );
  };

  const handleAddCredential = () => {
    setCredentials((prev) => [...prev, ""]);
  };

  const handleRemoveCredential = (index: number) => {
    setCredentials((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !title.trim() || !slogan.trim()) {
      toast({
        title: "Thiếu thông tin bắt buộc",
        description: "Vui lòng nhập đầy đủ Họ tên, Danh xưng và Slogan sư phạm.",
        variant: "warning",
      });
      return;
    }

    const cleanCredentials = credentials.map((c) => c.trim()).filter(Boolean);
    const payload = {
      name: name.trim(),
      title: title.trim(),
      slogan: slogan.trim(),
      shortBio: shortBio.trim(),
      philosophy: philosophy.trim(),
      experienceYears: Math.max(0, Number(experienceYears) || 0),
      totalStudents: Math.max(0, Number(totalStudents) || 0),
      bandAchievementRate: bandAchievementRate.trim(),
      credentials: cleanCredentials,
      email: email.trim(),
      officeHours: officeHours.trim(),
      location: location.trim(),
    };

    setIsSaving(true);
    try {
      const updated = await apiRequest<TeacherProfile>("/api/admin/cms", {
        method: "PATCH",
        body: JSON.stringify({
          module: "brand",
          payload,
        }),
      });
      onBrandChange(updated);
      window.dispatchEvent(
        new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: updated }),
      );
      toast({
        title: "Đã lưu Hồ sơ Thương hiệu Giáo viên",
        description:
          "Hero Trang chủ và Footer công khai đã được đồng bộ với thông tin mới.",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể lưu hồ sơ thương hiệu",
        description:
          err instanceof Error
            ? err.message
            : "Vui lòng kiểm tra lại định dạng email hoặc số liệu.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: Editable Brand Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-xs lg:col-span-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
          <div>
            <h3 className="font-heading text-base font-bold text-foreground">
              Biên tập Thương hiệu & Hero Trang chủ
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Đồng bộ trực tiếp với Cổng công khai (/) và phần chân trang (Footer).
            </p>
          </div>
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            Lưu hồ sơ thương hiệu
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="brand-name"
              className="block text-xs font-semibold text-foreground"
            >
              Họ tên & Học vị giảng viên
            </label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="brand-title"
              className="block text-xs font-semibold text-foreground"
            >
              Danh xưng chuyên môn (Eyebrow Hero)
            </label>
            <Input
              id="brand-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="brand-slogan"
            className="block text-xs font-semibold text-foreground"
          >
            Slogan sư phạm (Tiêu đề lớn Trang chủ)
          </label>
          <Input
            id="brand-slogan"
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            placeholder="Ví dụ: Tư duy ngôn ngữ mạch lạc — Nền tảng học thuật bền vững."
            required
          />
          <p className="text-[11px] text-muted-foreground">
            Mẹo: Dùng dấu <code className="rounded bg-muted px-1">—</code> hoặc{" "}
            <code className="rounded bg-muted px-1">–</code> để tách thành 2 dòng tương phản (chữ thẳng đậm + chữ nghiêng serif).
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="brand-bio"
            className="block text-xs font-semibold text-foreground"
          >
            Giới thiệu ngắn (Hero Bio)
          </label>
          <textarea
            id="brand-bio"
            rows={3}
            value={shortBio}
            onChange={(e) => setShortBio(e.target.value)}
            className="w-full rounded-xl border border-input bg-background p-3 text-xs leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="brand-philosophy"
            className="block text-xs font-semibold text-foreground"
          >
            Triết lý giảng dạy
          </label>
          <textarea
            id="brand-philosophy"
            rows={2}
            value={philosophy}
            onChange={(e) => setPhilosophy(e.target.value)}
            className="w-full rounded-xl border border-input bg-background p-3 text-xs leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label
              htmlFor="brand-exp"
              className="block text-xs font-semibold text-foreground"
            >
              Số năm kinh nghiệm
            </label>
            <Input
              id="brand-exp"
              type="number"
              min={0}
              max={60}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="brand-students"
              className="block text-xs font-semibold text-foreground"
            >
              Tổng số học viên đã đào tạo
            </label>
            <Input
              id="brand-students"
              type="number"
              min={0}
              value={totalStudents}
              onChange={(e) => setTotalStudents(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="brand-rate"
              className="block text-xs font-semibold text-foreground"
            >
              Tỷ lệ đạt Band mục tiêu
            </label>
            <Input
              id="brand-rate"
              value={bandAchievementRate}
              onChange={(e) => setBandAchievementRate(e.target.value)}
            />
          </div>
        </div>

        {/* Credentials Editor */}
        <div className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground">
              Bằng cấp & Chứng chỉ nổi bật (Hiển thị 3 mục đầu trên Hero)
            </span>
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
            {credentials.map((cred, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={cred}
                  onChange={(e) =>
                    handleCredentialChange(index, e.target.value)
                  }
                  placeholder="Ví dụ: M.A. in TESOL — University of Melbourne"
                  className="text-xs"
                />
                {credentials.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleRemoveCredential(index)}
                    aria-label={`Xóa chứng chỉ ${index + 1}`}
                  >
                    <Trash2
                      className="size-3.5 text-destructive"
                      aria-hidden="true"
                    />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label
              htmlFor="brand-email"
              className="block text-xs font-semibold text-foreground"
            >
              Email liên hệ công khai
            </label>
            <Input
              id="brand-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="brand-office-hours"
              className="block text-xs font-semibold text-foreground"
            >
              Giờ tiếp phụ huynh (Office Hours)
            </label>
            <Input
              id="brand-office-hours"
              value={officeHours}
              onChange={(e) => setOfficeHours(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="brand-location"
              className="block text-xs font-semibold text-foreground"
            >
              Địa điểm lớp học
            </label>
            <Input
              id="brand-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>
      </form>

      {/* Right: Live Visual Hero Preview */}
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border border-[#E6D7B8] bg-gradient-to-br from-[#FCF9F3] via-[#F7F0E2] to-[#EFE4CE] p-5 text-[#253047] shadow-xs sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="warm" className="text-[11px]">
              <Sparkles className="size-3 text-[#243B64]" aria-hidden="true" />
              Xem trước Hero Trang chủ
            </Badge>
            <Button
              variant="outline"
              size="xs"
              render={<Link href="/" />}
              nativeButton={false}
              className="bg-white/90 text-[#243B64]"
            >
              Xem Trang chủ thực tế
              <ExternalLink className="size-3" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="h-[2px] w-6 bg-[#D9AE54]" aria-hidden="true" />
              <p className="font-heading text-[11px] font-semibold tracking-wider text-[#496B9A] uppercase">
                {title || "Danh xưng chuyên môn"}
              </p>
            </div>

            <div className="space-y-0.5">
              <p className="font-heading text-xl leading-tight font-bold text-[#253047]">
                {sloganLine1 || "Tiêu đề thông điệp sư phạm"}
                {sloganLine2 ? " –" : ""}
              </p>
              {sloganLine2 && (
                <p className="font-serif text-xl leading-tight text-[#243B64] italic">
                  {sloganLine2}
                </p>
              )}
            </div>

            <p className="text-xs leading-relaxed text-[#253047]/85">
              Không gian học thuật của{" "}
              <strong className="font-bold text-[#253047]">
                {name || "Giáo viên"}
              </strong>
              . {shortBio}
            </p>

            {/* 3 Credentials Preview */}
            <div className="grid gap-3 border-t border-[#E2D4B7] pt-4 sm:grid-cols-3">
              {previewCredentials.map((cred, idx) => (
                <div key={`${cred.title}-${idx}`} className="flex items-start gap-2">
                  <div
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      idx === 0
                        ? "bg-[#243B64]/10 text-[#243B64]"
                        : "bg-[#D9AE54]/25 text-[#9A6F18]",
                    )}
                  >
                    {idx === 0 ? (
                      <GraduationCap className="size-3.5" aria-hidden="true" />
                    ) : idx === 1 ? (
                      <Trophy className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Award className="size-3.5" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-heading text-[11px] font-bold text-[#253047]">
                      {cred.title}
                    </p>
                    {cred.subtitle && (
                      <p className="truncate text-[10px] text-[#7B8497]">
                        {cred.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Metrics Preview */}
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#E2D4B7] bg-white/75 p-3 text-center">
              <div>
                <p className="font-mono text-sm font-bold text-[#243B64]">
                  {experienceYears || 0}+ năm
                </p>
                <p className="text-[10px] text-[#7B8497]">Kinh nghiệm</p>
              </div>
              <div>
                <p className="font-mono text-sm font-bold text-[#243B64]">
                  {totalStudents || 0}+
                </p>
                <p className="text-[10px] text-[#7B8497]">Học viên</p>
              </div>
              <div>
                <p className="truncate font-mono text-xs font-bold text-[#243B64]">
                  {bandAchievementRate || "94%"}
                </p>
                <p className="text-[10px] text-[#7B8497]">Đạt mục tiêu</p>
              </div>
            </div>

            {/* Philosophy & Contact Footer */}
            <div className="space-y-2 rounded-xl bg-white/80 p-3.5 text-xs text-[#253047]/85">
              {philosophy && (
                <p className="italic text-[#243B64]">“{philosophy}”</p>
              )}
              <div className="space-y-1 border-t border-[#E6D7B8] pt-2 text-[11px] text-[#7B8497]">
                <p className="flex items-center gap-1.5">
                  <Mail className="size-3 text-[#243B64]" aria-hidden="true" />
                  <span>{email}</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <Clock className="size-3 text-[#243B64]" aria-hidden="true" />
                  <span>{officeHours}</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <MapPin className="size-3 text-[#243B64]" aria-hidden="true" />
                  <span>{location}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
