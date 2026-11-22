"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import type { SettingsAuditLogEntry } from "@/services/classroom-data";
import {
  applyBrandThemeToDocument,
  buildSnapshotFilename,
  DEFAULT_BRAND_THEME,
  normalizeBrandTheme,
  persistBrandThemeLocally,
  SETTINGS_UPDATED_EVENT,
  type BrandThemeColors,
  type SettingsAdminTab,
  type SettingsFormDraft,
} from "@/services/settings-helpers";
import type { SystemHealthSummary } from "@/services/settings.service";
import type { StorageHealthStatus } from "@/services/storage.service";
import { apiRequest } from "@/lib/api-client";
import { SettingsBrandTab } from "@/components/admin/settings/settings-brand-tab";
import { SettingsOperationsTab } from "@/components/admin/settings/settings-operations-tab";
import { SettingsSystemTab } from "@/components/admin/settings/settings-system-tab";
import { StudentAccountManager } from "@/components/admin/student-account-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface SettingsApiResponse extends SettingsFormDraft {
  storageStatus?: StorageHealthStatus;
  health?: SystemHealthSummary;
  auditLogs?: SettingsAuditLogEntry[];
}

const VALID_TABS: readonly SettingsAdminTab[] = [
  "brand",
  "operations",
  "accounts",
  "system",
];

function parseTabParam(raw: string | null): SettingsAdminTab {
  if (raw && (VALID_TABS as readonly string[]).includes(raw)) {
    return raw as SettingsAdminTab;
  }
  return "brand";
}

function createDefaultDraft(): SettingsFormDraft {
  return {
    name: "",
    title: "",
    slogan: "",
    shortBio: "",
    philosophy: "",
    experienceYears: 0,
    totalStudents: 0,
    bandAchievementRate: "",
    email: "",
    avatarUrl: "/images/teacher-avatar.jpg",
    officeHours: "",
    location: "",
    credentials: [],
    socials: [],
    brandTheme: { ...DEFAULT_BRAND_THEME },
    currentTerm: "Học kỳ I · Năm học 2026–2027",
    defaultPortalPin: "123456",
    autoNotifyParents: true,
    presignedExpirySeconds: 900,
    lowAttendanceThresholdPercent: 90,
    tuitionReminderDaysBefore: 7,
    requirePortalVerification: true,
  };
}

function extractDraftFromApi(res: SettingsApiResponse): SettingsFormDraft {
  const defaults = createDefaultDraft();
  return {
    name: res.name ?? defaults.name,
    title: res.title ?? defaults.title,
    slogan: res.slogan ?? defaults.slogan,
    shortBio: res.shortBio ?? defaults.shortBio,
    philosophy: res.philosophy ?? defaults.philosophy,
    experienceYears: res.experienceYears ?? defaults.experienceYears,
    totalStudents: res.totalStudents ?? defaults.totalStudents,
    bandAchievementRate:
      res.bandAchievementRate ?? defaults.bandAchievementRate,
    email: res.email ?? defaults.email,
    avatarUrl: res.avatarUrl ?? defaults.avatarUrl,
    officeHours: res.officeHours ?? defaults.officeHours,
    location: res.location ?? defaults.location,
    credentials: Array.isArray(res.credentials)
      ? [...res.credentials]
      : defaults.credentials,
    socials: Array.isArray(res.socials)
      ? res.socials.map((s) => ({ ...s }))
      : defaults.socials,
    brandTheme: normalizeBrandTheme(res.brandTheme),
    currentTerm: res.currentTerm ?? defaults.currentTerm,
    defaultPortalPin: res.defaultPortalPin ?? defaults.defaultPortalPin,
    autoNotifyParents: res.autoNotifyParents ?? defaults.autoNotifyParents,
    presignedExpirySeconds:
      res.presignedExpirySeconds ?? defaults.presignedExpirySeconds,
    lowAttendanceThresholdPercent:
      res.lowAttendanceThresholdPercent ??
      defaults.lowAttendanceThresholdPercent,
    tuitionReminderDaysBefore:
      res.tuitionReminderDaysBefore ?? defaults.tuitionReminderDaysBefore,
    requirePortalVerification: true,
  };
}

function SettingsWorkspaceContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const rawTabParam = searchParams.get("tab");
  const [prevTabParam, setPrevTabParam] = React.useState(rawTabParam);
  const [activeTab, setActiveTab] = React.useState<SettingsAdminTab>(() =>
    parseTabParam(rawTabParam),
  );
  if (rawTabParam !== prevTabParam) {
    setPrevTabParam(rawTabParam);
    setActiveTab(parseTabParam(rawTabParam));
  }

  const [draft, setDraft] = React.useState<SettingsFormDraft>(() =>
    createDefaultDraft(),
  );
  const [savedDraft, setSavedDraft] = React.useState<SettingsFormDraft>(() =>
    createDefaultDraft(),
  );
  const [storageStatus, setStorageStatus] =
    React.useState<StorageHealthStatus | null>(null);
  const [health, setHealth] = React.useState<SystemHealthSummary | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<SettingsAuditLogEntry[]>(
    [],
  );

  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  const isDirty = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedDraft),
    [draft, savedDraft],
  );

  const applyApiResponse = React.useCallback(
    (res: SettingsApiResponse, resetDraft = true) => {
      const nextDraft = extractDraftFromApi(res);
      setSavedDraft(nextDraft);
      if (resetDraft) {
        setDraft(nextDraft);
      }
      setStorageStatus(res.storageStatus ?? null);
      setHealth(res.health ?? null);
      setAuditLogs(res.auditLogs ?? []);
    },
    [],
  );

  React.useEffect(() => {
    let active = true;

    apiRequest<SettingsApiResponse>("/api/admin/settings")
      .then((res) => {
        if (!active) return;
        applyApiResponse(res, true);
      })
      .catch((err) => {
        if (!active) return;
        toast({
          title: "Không thể tải cấu hình hệ thống",
          description:
            err instanceof Error
              ? err.message
              : "Đã xảy ra lỗi khi kết nối API cài đặt.",
          variant: "error",
        });
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyApiResponse, toast]);

  const refreshSettings = React.useCallback(() => {
    setIsRefreshing(true);
    apiRequest<SettingsApiResponse>("/api/admin/settings")
      .then((res) => {
        applyApiResponse(res, !isDirty);
      })
      .catch((err) => {
        toast({
          title: "Làm mới cấu hình thất bại",
          description:
            err instanceof Error ? err.message : "Không thể đồng bộ dữ liệu.",
          variant: "error",
        });
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [applyApiResponse, isDirty, toast]);

  const handleCommitAvatarUrl = React.useCallback(
    async (newAvatarUrl: string) => {
      const res = await apiRequest<SettingsApiResponse>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ avatarUrl: newAvatarUrl }),
      });
      const resolvedUrl = res.avatarUrl ?? newAvatarUrl;
      setSavedDraft((prev) => ({ ...prev, avatarUrl: resolvedUrl }));
      setDraft((prev) => ({ ...prev, avatarUrl: resolvedUrl }));
      setStorageStatus(res.storageStatus ?? null);
      setHealth(res.health ?? null);
      setAuditLogs(res.auditLogs ?? []);
      window.dispatchEvent(
        new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: res }),
      );
    },
    [],
  );

  const handleCommitBrandTheme = React.useCallback(
    async (nextTheme: BrandThemeColors) => {
      const normalized = applyBrandThemeToDocument(nextTheme);
      persistBrandThemeLocally(normalized);
      const res = await apiRequest<SettingsApiResponse>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ brandTheme: normalized }),
      });
      const resolvedTheme = normalizeBrandTheme(res.brandTheme ?? normalized);
      applyBrandThemeToDocument(resolvedTheme);
      persistBrandThemeLocally(resolvedTheme);
      setSavedDraft((prev) => ({ ...prev, brandTheme: resolvedTheme }));
      setDraft((prev) => ({ ...prev, brandTheme: resolvedTheme }));
      setStorageStatus(res.storageStatus ?? null);
      setHealth(res.health ?? null);
      setAuditLogs(res.auditLogs ?? []);
      window.dispatchEvent(
        new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: res }),
      );
    },
    [],
  );

  // Live preview brand theme as user tweaks colors on /settings
  React.useEffect(() => {
    if (!isLoading) {
      applyBrandThemeToDocument(draft.brandTheme);
    }
  }, [draft.brandTheme, isLoading]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ...draft,
        credentials: draft.credentials.map((c) => c.trim()).filter(Boolean),
        socials: draft.socials.filter(
          (s) => s.label.trim() && s.href.trim() && s.handle.trim(),
        ),
        requirePortalVerification: true as const,
      };
      const res = await apiRequest<SettingsApiResponse>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      applyApiResponse(res, true);
      window.dispatchEvent(
        new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: res }),
      );
      toast({
        title: "Đã lưu cấu hình hệ thống",
        description:
          "Hồ sơ thương hiệu, quy tắc học vụ, bảo mật PIN và TTL Signed URL đã được đồng bộ toàn hệ thống.",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Không thể lưu cài đặt hệ thống",
        description:
          err instanceof Error
            ? err.message
            : "Vui lòng kiểm tra lại các trường nhập liệu.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetSettings = async () => {
    setIsResetting(true);
    try {
      const res = await apiRequest<SettingsApiResponse>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ action: "reset" }),
      });
      applyApiResponse(res, true);
      window.dispatchEvent(
        new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: res }),
      );
      toast({
        title: "Đã khôi phục cài đặt mặc định",
        description:
          "Thương hiệu, học kỳ, PIN mặc định và ngưỡng cảnh báo đã trở về thiết lập ban đầu.",
        variant: "info",
      });
    } catch (err) {
      toast({
        title: "Khôi phục cài đặt thất bại",
        description: err instanceof Error ? err.message : "Đã xảy ra lỗi.",
        variant: "error",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleExportSnapshot = async () => {
    setIsExporting(true);
    try {
      const res = await apiRequest<{
        snapshot: unknown;
        auditLogs?: SettingsAuditLogEntry[];
      }>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ action: "exportSnapshot" }),
      });

      const blob = new Blob([JSON.stringify(res.snapshot, null, 2)], {
        type: "application/json;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildSnapshotFilename();
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      if (res.auditLogs) {
        setAuditLogs(res.auditLogs);
      }

      toast({
        title: "Đã xuất bản sao lưu hệ thống",
        description: `Tệp ${buildSnapshotFilename()} đã tải xuống (đã ẩn mã PIN bảo mật).`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Xuất bản sao lưu thất bại",
        description: err instanceof Error ? err.message : "Đã xảy ra lỗi.",
        variant: "error",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const tabs: Array<{
    id: SettingsAdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    hasWarningDot?: boolean;
  }> = [
    {
      id: "brand",
      label: "Thương hiệu & Hồ sơ",
      icon: UserCheck,
    },
    {
      id: "operations",
      label: "Học vụ, Bảo mật & Lưu trữ",
      icon: ShieldCheck,
    },
    {
      id: "accounts",
      label: "Tài khoản Học sinh (RBAC)",
      icon: Users,
    },
    {
      id: "system",
      label: "Hệ thống, Sao lưu & Audit Log",
      icon: Activity,
      hasWarningDot: health?.overallStatus === "warning",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Cài đặt Hệ thống &amp; Thương hiệu Giáo viên
            </h1>
            {isDirty && (
              <Badge variant="warning" className="text-xs">
                Có thay đổi chưa lưu
              </Badge>
            )}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Quản lý một nguồn sự thật duy nhất cho Hồ sơ công khai, Học kỳ, Bảo mật PIN Cổng học sinh, thời hạn Signed URL và Tài khoản RBAC.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={refreshSettings}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin")}
              aria-hidden="true"
            />
            Làm mới
          </Button>
          {isDirty && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(savedDraft)}
              disabled={isSaving}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Hoàn tác
            </Button>
          )}
          <Button
            type="button"
            onClick={() => void handleSaveSettings()}
            disabled={isLoading || isSaving || !isDirty}
          >
            <Save className="size-4" aria-hidden="true" />
            {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Phân hệ cài đặt hệ thống"
        className="flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/40 p-1.5"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
              {tab.hasWarningDot && (
                <span
                  aria-label="Có khuyến nghị bảo mật"
                  className="size-2 rounded-full bg-amber-500"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-52 w-full rounded-2xl" />
          </div>
          <div className="space-y-4 lg:col-span-5">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          {activeTab === "brand" && (
            <SettingsBrandTab
              draft={draft}
              onChange={setDraft}
              onAvatarCommitted={handleCommitAvatarUrl}
              onBrandThemeCommitted={handleCommitBrandTheme}
            />
          )}

          {activeTab === "operations" && (
            <SettingsOperationsTab
              draft={draft}
              onChange={setDraft}
              storageStatus={storageStatus}
            />
          )}

          {activeTab === "accounts" && (
            <StudentAccountManager onAccountMutated={refreshSettings} />
          )}

          {activeTab === "system" && (
            <SettingsSystemTab
              health={health}
              auditLogs={auditLogs}
              onResetSettings={handleResetSettings}
              onExportSnapshot={handleExportSnapshot}
              isResetting={isResetting}
              isExporting={isExporting}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Đang tải phân hệ Cài đặt Hệ thống &amp; Thương hiệu...
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <Skeleton className="h-80 w-full rounded-2xl lg:col-span-7" />
            <Skeleton className="h-80 w-full rounded-2xl lg:col-span-5" />
          </div>
        </div>
      }
    >
      <SettingsWorkspaceContent />
    </React.Suspense>
  );
}
