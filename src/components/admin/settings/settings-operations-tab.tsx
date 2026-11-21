"use client";

import * as React from "react";
import Link from "next/link";
import {
  BellRing,
  Cloud,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  evaluatePortalPinStrength,
  formatExpiryDuration,
  generateStrongPortalPin,
  type SettingsFormDraft,
} from "@/services/settings-helpers";
import type { StorageHealthStatus } from "@/services/storage.service";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const EXPIRY_PRESETS = [
  { seconds: 300, label: "5 phút (300s)" },
  { seconds: 900, label: "15 phút (900s)" },
  { seconds: 1800, label: "30 phút (1800s)" },
  { seconds: 3600, label: "60 phút (3600s)" },
] as const;

export function SettingsOperationsTab({
  draft,
  onChange,
  storageStatus,
}: {
  draft: SettingsFormDraft;
  onChange: (updater: (prev: SettingsFormDraft) => SettingsFormDraft) => void;
  storageStatus: StorageHealthStatus | null;
}) {
  const [showPortalPin, setShowPortalPin] = React.useState(false);

  const pinStrength = React.useMemo(
    () => evaluatePortalPinStrength(draft.defaultPortalPin),
    [draft.defaultPortalPin],
  );

  const updateField = <K extends keyof SettingsFormDraft>(
    key: K,
    value: SettingsFormDraft[K],
  ) => {
    onChange((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Column: Academic Operations & Student Portal Security (7 cols) */}
      <div className="space-y-6 lg:col-span-7">
        {/* Card 1: Academic Term & Parent Alerts */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center gap-2.5 border-b border-border pb-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-warm text-primary">
              <BellRing className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Vận hành Học vụ &amp; Ngưỡng Cảnh báo
              </h2>
              <p className="text-xs text-muted-foreground">
                Đồng bộ học kỳ hiển thị trên Sidebar và áp dụng trực tiếp vào bộ lọc cảnh báo lớp học.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="set-term"
                className="block text-xs font-semibold text-foreground"
              >
                Học kỳ vận hành hiện tại
              </label>
              <Input
                id="set-term"
                value={draft.currentTerm}
                onChange={(e) => updateField("currentTerm", e.target.value)}
                placeholder="Học kỳ I · Năm học 2026–2027"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="set-low-attendance"
                  className="block text-xs font-semibold text-foreground"
                >
                  Ngưỡng cảnh báo chuyên cần thấp (%)
                </label>
                <Input
                  id="set-low-attendance"
                  type="number"
                  min={50}
                  max={100}
                  value={draft.lowAttendanceThresholdPercent}
                  onChange={(e) =>
                    updateField(
                      "lowAttendanceThresholdPercent",
                      Number(e.target.value) || 90,
                    )
                  }
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Học viên có chuyên cần dưới{" "}
                  <strong>{draft.lowAttendanceThresholdPercent}%</strong> sẽ
                  được đánh dấu tại Phân tích Hiệu quả (miễn học viên đang bảo lưu).
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="set-tuition-days"
                  className="block text-xs font-semibold text-foreground"
                >
                  Nhắc hạn học phí trước (Số ngày)
                </label>
                <Input
                  id="set-tuition-days"
                  type="number"
                  min={1}
                  max={30}
                  value={draft.tuitionReminderDaysBefore}
                  onChange={(e) =>
                    updateField(
                      "tuitionReminderDaysBefore",
                      Number(e.target.value) || 7,
                    )
                  }
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Khoảng thời gian cảnh báo trước hạn đóng học phí (1–30 ngày).
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3.5 text-xs">
              <input
                type="checkbox"
                checked={draft.autoNotifyParents}
                onChange={(e) =>
                  updateField("autoNotifyParents", e.target.checked)
                }
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <span>
                <strong className="font-semibold text-foreground">
                  Tự động nhắc thông báo Phụ huynh (Auto Parent Notifications)
                </strong>
                <span className="mt-0.5 block text-muted-foreground">
                  Gửi nhắc lịch điểm danh vắng/muộn, tổng kết buổi học và nhắc hạn học phí cho phụ huynh. Tách biệt với chính sách xác thực bảo mật Cổng học sinh.
                </span>
              </span>
            </label>
          </div>
        </section>

        {/* Card 2: Student Portal Auth Security */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center gap-2.5 border-b border-border pb-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <KeyRound className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Bảo mật Cổng Tra cứu Học sinh (Privacy-by-Design)
              </h2>
              <p className="text-xs text-muted-foreground">
                Loại bỏ hoàn toàn PIN backdoor cũ; chỉ mã PIN hiện hành mới hợp lệ khi xác thực.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs">
              <Lock
                className="mt-0.5 size-4 shrink-0 text-emerald-700"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold text-foreground">
                  Xác thực 2 lớp (Mã HS + Mật khẩu tra cứu): Bắt buộc hệ thống (Không thể tắt)
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Tuyệt đối không hiển thị điểm số, chuyên cần hay học phí trước khi xác thực thành công. Khi đổi PIN mới bên dưới, các mã cũ (123456 / HS2026) bị vô hiệu hóa ngay lập tức.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="set-pin"
                  className="block text-xs font-semibold text-foreground"
                >
                  Mật khẩu tra cứu mặc định (Portal PIN · 4–32 ký tự)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    updateField("defaultPortalPin", generateStrongPortalPin());
                    setShowPortalPin(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Tạo PIN ngẫu nhiên
                </button>
              </div>

              <div className="relative">
                <Input
                  id="set-pin"
                  type={showPortalPin ? "text" : "password"}
                  value={draft.defaultPortalPin}
                  onChange={(e) =>
                    updateField("defaultPortalPin", e.target.value)
                  }
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPortalPin((v) => !v)}
                  aria-label={
                    showPortalPin ? "Ẩn mã PIN mặc định" : "Hiện mã PIN mặc định"
                  }
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPortalPin ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              {/* Pin Strength Meter */}
              <div className="space-y-1.5 rounded-xl bg-background/70 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Độ mạnh PIN:</span>
                  <Badge
                    variant={
                      pinStrength.level === "strong"
                        ? "success"
                        : pinStrength.level === "medium"
                          ? "warning"
                          : "destructive"
                    }
                  >
                    {pinStrength.label} ({pinStrength.score}/100)
                  </Badge>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full transition-all",
                      pinStrength.level === "strong"
                        ? "bg-emerald-500"
                        : pinStrength.level === "medium"
                          ? "bg-amber-500"
                          : "bg-destructive",
                    )}
                    style={{ width: `${pinStrength.score}%` }}
                  />
                </div>
                {pinStrength.hints.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                    {pinStrength.hints.map((hint) => (
                      <li key={hint}>• {hint}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Right Column: Live Cloud Storage Config (Cloudinary Free + Supabase Free) (5 cols) */}
      <div className="space-y-6 lg:col-span-5">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-warm text-primary">
                <Cloud className="size-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Lưu trữ Đám mây Hiện hành
                </h2>
                <p className="text-xs text-muted-foreground">
                  Cloudinary Free (Ảnh CDN) + Supabase Storage Free (PDF/Audio)
                </p>
              </div>
            </div>
            <Badge variant={storageStatus?.configured ? "success" : "warning"}>
              {storageStatus?.configured ? "Đã kết nối" : "Chế độ mô phỏng"}
            </Badge>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-background p-3">
              <span className="text-muted-foreground">Cloudinary Free (Ảnh CDN)</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-foreground">
                  {storageStatus?.cloudinaryCloudName ?? "Chưa cấu hình"}
                </span>
                <Badge
                  variant={
                    storageStatus?.cloudinaryConfigured ? "success" : "outline"
                  }
                >
                  {storageStatus?.cloudinaryConfigured ? "Active" : "Mock"}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-xl bg-background p-3">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Globe className="size-3.5 text-primary" aria-hidden="true" />
                Supabase Public Bucket
              </span>
              <span className="font-mono font-semibold text-foreground">
                {storageStatus?.publicBucket ?? "english-manager-public"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-xl bg-background p-3">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                Supabase Private Bucket
              </span>
              <span className="font-mono font-semibold text-foreground">
                {storageStatus?.privateBucket ?? "english-manager-private"}
              </span>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              Định tuyến tự động:{" "}
              <strong className="font-mono text-foreground">
                Ảnh → {storageStatus?.routing.images ?? "cloudinary"}
              </strong>{" "}
              ·{" "}
              <strong className="font-mono text-foreground">
                PDF/Podcast → {storageStatus?.routing.documents ?? "supabase"}
              </strong>
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="set-expiry"
                  className="block text-xs font-semibold text-foreground"
                >
                  Thời hạn hiệu lực Signed URL (60 – 3600 giây)
                </label>
                <span className="font-mono text-[11px] font-semibold text-primary">
                  {formatExpiryDuration(draft.presignedExpirySeconds)}
                </span>
              </div>
              <Input
                id="set-expiry"
                type="number"
                min={60}
                max={3600}
                value={draft.presignedExpirySeconds}
                onChange={(e) =>
                  updateField(
                    "presignedExpirySeconds",
                    Number(e.target.value) || 900,
                  )
                }
                className="font-mono"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {EXPIRY_PRESETS.map((preset) => (
                  <button
                    key={preset.seconds}
                    type="button"
                    onClick={() =>
                      updateField("presignedExpirySeconds", preset.seconds)
                    }
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      draft.presignedExpirySeconds === preset.seconds
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Áp dụng trực tiếp cho mọi liên kết tải tệp Private qua{" "}
                <code className="font-mono text-foreground">
                  getSignedFileUrl()
                </code>{" "}
                và lộ trình học liệu.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/storage"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                Mở Kho Lưu trữ Đám mây (Quota &amp; Cleanup)
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
