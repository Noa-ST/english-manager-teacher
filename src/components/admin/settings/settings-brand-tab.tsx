"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  Check,
  Clock,
  Copy,
  ExternalLink,
  GraduationCap,
  ImageIcon,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Trophy,
  UploadCloud,
  UserCheck,
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import {
  parseCredentialDisplay,
  splitSloganLines,
} from "@/services/cms-helpers";
import {
  BRAND_THEME_PRESETS,
  DEFAULT_BRAND_THEME,
  type BrandThemeColors,
  type SettingsFormDraft,
} from "@/services/settings-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function SettingsBrandTab({
  draft,
  onChange,
  onAvatarCommitted,
  onBrandThemeCommitted,
}: {
  draft: SettingsFormDraft;
  onChange: (updater: (prev: SettingsFormDraft) => SettingsFormDraft) => void;
  onAvatarCommitted?: (newAvatarUrl: string) => Promise<void>;
  onBrandThemeCommitted?: (nextTheme: BrandThemeColors) => Promise<void>;
}) {
  const { toast } = useToast();
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);
  const [isSavingTheme, setIsSavingTheme] = React.useState(false);
  const [showManualAvatarUrl, setShowManualAvatarUrl] = React.useState(false);
  const avatarFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const updateField = <K extends keyof SettingsFormDraft>(
    key: K,
    value: SettingsFormDraft[K],
  ) => {
    onChange((prev) => ({ ...prev, [key]: value }));
  };

  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Định dạng ảnh không hợp lệ",
        description: "Vui lòng chọn tệp hình ảnh (JPG, PNG, WebP).",
        variant: "error",
      });
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Ảnh vượt quá dung lượng",
        description: "Giới hạn ảnh đại diện giáo viên là 5 MB.",
        variant: "error",
      });
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = "";
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const ticket = await apiRequest<{
        uploadUrl: string;
        method: "POST" | "PUT";
        formFields?: Record<string, string>;
        publicUrl: string | null;
        objectKey?: string;
        cloudinaryPublicId?: string;
      }>("/api/admin/storage/upload-url", {
        method: "POST",
        body: JSON.stringify({
          folder: "avatars",
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          visibility: "public",
          imageCategory: "teacher_avatar",
        }),
      });

      let finalUrl = ticket.publicUrl;
      let finalPublicId = ticket.cloudinaryPublicId ?? ticket.objectKey;

      if (ticket.method === "POST" && ticket.formFields && ticket.uploadUrl) {
        const form = new FormData();
        Object.entries(ticket.formFields).forEach(([k, v]) =>
          form.append(k, v),
        );
        form.append("file", file);

        const uploadRes = await fetch(ticket.uploadUrl, {
          method: "POST",
          body: form,
        });
        if (!uploadRes.ok) {
          throw new Error("Không thể tải ảnh lên Cloudinary.");
        }
        const cloudPayload = (await uploadRes.json().catch(() => null)) as {
          secure_url?: string;
          public_id?: string;
        } | null;
        if (cloudPayload?.secure_url) finalUrl = cloudPayload.secure_url;
        if (cloudPayload?.public_id) finalPublicId = cloudPayload.public_id;
      }

      if (!finalUrl) {
        throw new Error("Cloudinary không trả về đường dẫn ảnh hợp lệ.");
      }

      // Register in StoredFile inventory for /storage tracking & auto-cleanup
      await apiRequest("/api/admin/storage", {
        method: "POST",
        body: JSON.stringify({
          action: "uploadImage",
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          category: "teacher_avatar",
          referencedBy: "Hồ sơ Thương hiệu Giáo viên",
          existingPublicId: finalPublicId,
          existingPublicUrl: finalUrl,
        }),
      }).catch(() => {});

      if (onAvatarCommitted) {
        await onAvatarCommitted(finalUrl);
        toast({
          title: "Đã cập nhật ảnh đại diện giáo viên",
          description:
            "Ảnh mới đã lưu vào Cloudinary, đồng bộ toàn hệ thống và tự động dọn ảnh cũ.",
          variant: "success",
        });
      } else {
        updateField("avatarUrl", finalUrl);
        toast({
          title: "Tải ảnh đại diện lên Cloudinary thành công",
          description:
            "Bấm 'Lưu thay đổi' ở góc trên để áp dụng và tự động dọn ảnh cũ.",
          variant: "success",
        });
      }
    } catch (err) {
      toast({
        title: "Tải ảnh thất bại",
        description:
          err instanceof Error
            ? err.message
            : "Vui lòng kiểm tra cấu hình Cloudinary và thử lại.",
        variant: "error",
      });
    } finally {
      setIsUploadingAvatar(false);
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = "";
    }
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
  const [sloganLine1, sloganLine2] = React.useMemo(
    () => splitSloganLines(draft.slogan),
    [draft.slogan],
  );
  const previewCredentials = React.useMemo(
    () =>
      draft.credentials
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map(parseCredentialDisplay),
    [draft.credentials],
  );

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
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ImageIcon className="size-3.5 text-primary" aria-hidden="true" />
                    Ảnh đại diện giáo viên (Cloudinary)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowManualAvatarUrl((v) => !v)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-primary"
                  >
                    {showManualAvatarUrl ? "Ẩn nhập link URL" : "Nhập link URL"}
                  </button>
                </div>

                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void handleAvatarFileChange(e)}
                  className="hidden"
                />

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 p-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarPreviewSrc}
                      alt={draft.name || "Ảnh đại diện giáo viên"}
                      className="size-10 shrink-0 rounded-xl border border-border object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {draft.avatarUrl.includes("res.cloudinary.com")
                          ? "Ảnh Cloudinary HD"
                          : "Ảnh đại diện hiện tại"}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        JPG, PNG, WebP · Tối đa 5 MB
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isUploadingAvatar}
                      onClick={() => avatarFileInputRef.current?.click()}
                      className="h-8 px-2.5 text-xs whitespace-nowrap"
                    >
                      {isUploadingAvatar ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          Đang tải...
                        </>
                      ) : (
                        <>
                          <UploadCloud className="size-3.5 text-primary" aria-hidden="true" />
                          Đổi ảnh
                        </>
                      )}
                    </Button>
                    {draft.avatarUrl &&
                      draft.avatarUrl !== "/images/teacher-avatar.jpg" && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            const fallbackUrl = "/images/teacher-avatar.jpg";
                            if (onAvatarCommitted) {
                              setIsUploadingAvatar(true);
                              try {
                                await onAvatarCommitted(fallbackUrl);
                                toast({
                                  title: "Đã khôi phục ảnh đại diện mặc định",
                                  variant: "info",
                                });
                              } finally {
                                setIsUploadingAvatar(false);
                              }
                            } else {
                              updateField("avatarUrl", fallbackUrl);
                            }
                          }}
                          title="Khôi phục ảnh mặc định"
                          aria-label="Khôi phục ảnh mặc định"
                          className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                  </div>
                </div>

                {showManualAvatarUrl && (
                  <Input
                    id="set-avatar"
                    value={draft.avatarUrl}
                    onChange={(e) => updateField("avatarUrl", e.target.value)}
                    placeholder="https://res.cloudinary.com/... hoặc /images/teacher-avatar.jpg"
                    className="h-8 text-xs"
                  />
                )}
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

      {/* Right Column: Live Hero & Brand Preview + Design Tokens (5 cols) */}
      <div className="space-y-6 lg:col-span-5">
        {/* Live Hero & Public Brand Preview (Consolidated from Brand Studio) */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Badge variant="warm" className="gap-1">
                <Sparkles className="size-3" aria-hidden="true" />
                Xem trước Hero Trang chủ
              </Badge>
            </div>
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Xem Trang chủ thực tế
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-4 space-y-4 rounded-xl border border-border bg-warm/30 p-4">
            {/* Teacher Identity + Eyebrow */}
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
                <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {draft.title || "Chức danh chuyên môn"}
                </p>
              </div>
            </div>

            {/* 2-Line Contrasting Hero Headline */}
            <div className="space-y-1">
              <p className="font-heading text-lg leading-snug font-bold text-foreground">
                {sloganLine1 || "Thông điệp sư phạm"}
                {sloganLine2 && (
                  <>
                    {" "}
                    <span className="font-serif font-normal italic text-primary">
                      {sloganLine2}
                    </span>
                  </>
                )}
              </p>
              {draft.shortBio && (
                <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {draft.shortBio}
                </p>
              )}
            </div>

            {/* Top 3 Credentials */}
            {previewCredentials.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {previewCredentials.map((cred, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg border border-border/80 bg-card px-2.5 py-2"
                  >
                    {idx === 0 ? (
                      <GraduationCap className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    ) : idx === 1 ? (
                      <Trophy className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                    ) : (
                      <Award className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-foreground">
                        {cred.title}
                      </p>
                      {cred.subtitle && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {cred.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 3 Highlight Metrics */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border/80 bg-card p-2.5 text-center">
                <p className="font-heading text-sm font-bold text-foreground">
                  {draft.experienceYears}+ năm
                </p>
                <p className="text-[10px] text-muted-foreground">Kinh nghiệm</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-card p-2.5 text-center">
                <p className="font-heading text-sm font-bold text-foreground">
                  {draft.totalStudents}+
                </p>
                <p className="text-[10px] text-muted-foreground">Học viên</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-card p-2.5 text-center">
                <p className="truncate font-heading text-xs font-bold text-primary">
                  {draft.bandAchievementRate || "94%+"}
                </p>
                <p className="text-[10px] text-muted-foreground">Đạt mục tiêu</p>
              </div>
            </div>

            {draft.philosophy && (
              <p className="rounded-lg border border-border/70 bg-card px-3 py-2 font-serif text-xs text-foreground italic">
                &ldquo;{draft.philosophy}&rdquo;
              </p>
            )}

            <div className="space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
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

        {/* Interactive System-Wide Brand Theme Customizer */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-secondary/70 text-primary">
                <Palette className="size-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Bảng màu Giao diện Toàn hệ thống
                </h2>
                <p className="text-xs text-muted-foreground">
                  Chọn bộ màu mẫu hoặc tùy chỉnh từng mã màu — áp dụng trực tiếp cho Admin &amp; Cổng Học sinh.
                </p>
              </div>
            </div>
          </div>

          {/* 6 Curated Academic Presets */}
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bộ màu mẫu nhanh (1 chạm)
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
              {BRAND_THEME_PRESETS.map((preset) => {
                const isActive =
                  draft.brandTheme.primary.toUpperCase() ===
                    preset.colors.primary.toUpperCase() &&
                  draft.brandTheme.accent.toUpperCase() ===
                    preset.colors.accent.toUpperCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => updateField("brandTheme", { ...preset.colors })}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition-all ${
                      isActive
                        ? "border-primary bg-primary/8 ring-1 ring-primary/30"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-3.5 shrink-0 rounded-full border border-black/15"
                          style={{ backgroundColor: preset.colors.primary }}
                        />
                        <span
                          className="size-2.5 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: preset.colors.accent }}
                        />
                        <span
                          className="size-2.5 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: preset.colors.highlight }}
                        />
                      </div>
                      <p className="mt-1.5 truncate text-xs font-semibold text-foreground">
                        {preset.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {preset.subtitle}
                      </p>
                    </div>
                    {isActive && (
                      <Check
                        className="size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5 Individual Color Pickers */}
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tùy chỉnh chi tiết từng màu
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(
                [
                  {
                    key: "primary" as const,
                    name: "Màu chủ đạo (Primary)",
                    role: "Nút chính, tiêu đề, menu đang chọn",
                  },
                  {
                    key: "accent" as const,
                    name: "Màu điểm nhấn (Accent)",
                    role: "Viền focus, icon nhấn, biểu đồ",
                  },
                  {
                    key: "secondary" as const,
                    name: "Màu nền phụ (Secondary)",
                    role: "Nền badge phụ, hover nhẹ",
                  },
                  {
                    key: "warm" as const,
                    name: "Màu nền ấm (Warm)",
                    role: "Nền thẻ nổi bật, khu vực Hero",
                  },
                  {
                    key: "highlight" as const,
                    name: "Màu nổi bật (Highlight)",
                    role: "Cảnh báo nhẹ, điểm nhấn tiến độ",
                  },
                ] as const
              ).map((token) => {
                const value = draft.brandTheme[token.key];
                return (
                  <div
                    key={token.key}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-2.5"
                  >
                    <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) =>
                          updateField("brandTheme", {
                            ...draft.brandTheme,
                            [token.key]: e.target.value.toUpperCase(),
                          })
                        }
                        aria-label={`Chọn ${token.name}`}
                        className="size-8 shrink-0 cursor-pointer rounded-lg border border-black/15 bg-transparent p-0.5"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-foreground">
                          {token.name}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {value}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {token.role}
                        </p>
                      </div>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => void handleCopyTokenHex(token.name, value)}
                      title={`Sao chép mã ${value}`}
                      aria-label={`Sao chép mã màu ${token.name}`}
                      className="shrink-0 text-muted-foreground hover:text-primary"
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Apply / Reset Theme Actions */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSavingTheme}
              onClick={async () => {
                const resetColors = { ...DEFAULT_BRAND_THEME };
                updateField("brandTheme", resetColors);
                if (onBrandThemeCommitted) {
                  setIsSavingTheme(true);
                  try {
                    await onBrandThemeCommitted(resetColors);
                    toast({
                      title: "Đã khôi phục màu mặc định Modern Academic",
                      variant: "info",
                    });
                  } finally {
                    setIsSavingTheme(false);
                  }
                }
              }}
              className="h-8 px-3 text-xs"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Mặc định
            </Button>
            {onBrandThemeCommitted && (
              <Button
                type="button"
                size="sm"
                disabled={isSavingTheme}
                onClick={async () => {
                  setIsSavingTheme(true);
                  try {
                    await onBrandThemeCommitted(draft.brandTheme);
                    toast({
                      title: "Đã lưu & áp dụng bảng màu toàn hệ thống",
                      description:
                        "Màu sắc mới đã đồng bộ cho trang Quản trị, Trang chủ công khai và Cổng Học sinh.",
                      variant: "success",
                    });
                  } catch (err) {
                    toast({
                      title: "Không thể lưu bảng màu",
                      description:
                        err instanceof Error ? err.message : "Vui lòng thử lại.",
                      variant: "error",
                    });
                  } finally {
                    setIsSavingTheme(false);
                  }
                }}
                className="h-8 px-3.5 text-xs"
              >
                {isSavingTheme ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="size-3.5" aria-hidden="true" />
                    Áp dụng &amp; Lưu màu
                  </>
                )}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
