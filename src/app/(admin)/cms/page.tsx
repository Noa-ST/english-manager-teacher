"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Award,
  BookOpen,
  ExternalLink,
  FolderGit2,
  Headphones,
  Megaphone,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type {
  AdminStudentRecord,
  AnnouncementItem,
  ClassroomGroup,
  HallOfFameStudent,
  PodcastEpisode,
  ResourceFileItem,
  ResourceFolder,
  StudentProjectItem,
  TeacherProfile,
} from "@/services/classroom-data";
import { computeCmsSummaryStats, type CmsTab } from "@/services/cms-helpers";
import { apiRequest } from "@/lib/api-client";
import { CmsAnnouncementsTab } from "@/components/admin/cms/cms-announcements-tab";
import { CmsBrandStudioTab } from "@/components/admin/cms/cms-brand-studio-tab";
import { CmsHallOfFameTab } from "@/components/admin/cms/cms-hall-of-fame-tab";
import { CmsKpiStrip } from "@/components/admin/cms/cms-kpi-strip";
import { CmsPodcastsTab } from "@/components/admin/cms/cms-podcasts-tab";
import { CmsProjectsTab } from "@/components/admin/cms/cms-projects-tab";
import { CmsResourcesTab } from "@/components/admin/cms/cms-resources-tab";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const VALID_TABS: CmsTab[] = [
  "announcements",
  "podcast",
  "hall-of-fame",
  "projects",
  "resources",
  "brand",
];

interface CmsAdminPayload {
  announcements: AnnouncementItem[];
  podcasts: PodcastEpisode[];
  hallOfFame: HallOfFameStudent[];
  projects: StudentProjectItem[];
  resources?: ResourceFileItem[];
  folders?: ResourceFolder[];
  classrooms?: ClassroomGroup[];
  students?: AdminStudentRecord[];
  teacherBrand?: TeacherProfile;
}

const EMPTY_TEACHER_PROFILE: TeacherProfile = {
  name: "",
  title: "",
  credentials: [],
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
  socials: [],
};

function AdminCmsContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get("tab") as CmsTab | null;
  const [activeTab, setActiveTab] = React.useState<CmsTab>(() =>
    initialTabParam && VALID_TABS.includes(initialTabParam)
      ? initialTabParam
      : "announcements",
  );

  // Domain state
  const [announcements, setAnnouncements] = React.useState<AnnouncementItem[]>([]);
  const [podcasts, setPodcasts] = React.useState<PodcastEpisode[]>([]);
  const [honors, setHonors] = React.useState<HallOfFameStudent[]>([]);
  const [projects, setProjects] = React.useState<StudentProjectItem[]>([]);
  const [resources, setResources] = React.useState<ResourceFileItem[]>([]);
  const [foldersList, setFoldersList] = React.useState<ResourceFolder[]>([]);
  const [classroomsList, setClassroomsList] = React.useState<ClassroomGroup[]>([]);
  const [studentsList, setStudentsList] = React.useState<AdminStudentRecord[]>([]);
  const [teacherBrand, setTeacherBrand] =
    React.useState<TeacherProfile>(EMPTY_TEACHER_PROFILE);
  const [brandRevision, setBrandRevision] = React.useState(0);

  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Per-tab create triggers fired by header CTA
  const [createCounters, setCreateCounters] = React.useState<
    Record<CmsTab, number>
  >({
    announcements: 0,
    podcast: 0,
    "hall-of-fame": 0,
    projects: 0,
    resources: 0,
    brand: 0,
  });

  const applyCmsPayload = React.useCallback((res: CmsAdminPayload) => {
    if (res.announcements) setAnnouncements(res.announcements);
    if (res.podcasts) setPodcasts(res.podcasts);
    if (res.hallOfFame) setHonors(res.hallOfFame);
    if (res.projects) setProjects(res.projects);
    if (res.resources) setResources(res.resources);
    if (res.folders) setFoldersList(res.folders);
    if (res.classrooms) setClassroomsList(res.classrooms);
    if (res.students) setStudentsList(res.students);
    if (res.teacherBrand) {
      setTeacherBrand(res.teacherBrand);
      setBrandRevision((r) => r + 1);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    apiRequest<CmsAdminPayload>("/api/admin/cms")
      .then((res) => {
        if (!active) return;
        applyCmsPayload(res);
      })
      .catch((err) => {
        if (!active) return;
        toast({
          title: "Không thể tải dữ liệu CMS",
          description:
            err instanceof Error
              ? err.message
              : "Đang hiển thị dữ liệu cục bộ tạm thời.",
          variant: "error",
        });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyCmsPayload, toast]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    apiRequest<CmsAdminPayload>("/api/admin/cms")
      .then((res) => {
        applyCmsPayload(res);
        toast({
          title: "Đã làm mới dữ liệu CMS",
          variant: "info",
        });
      })
      .catch((err) => {
        toast({
          title: "Làm mới dữ liệu thất bại",
          description:
            err instanceof Error ? err.message : "Vui lòng thử lại sau.",
          variant: "error",
        });
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  };

  const triggerCreateForActiveTab = () => {
    setCreateCounters((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab] + 1,
    }));
  };

  const stats = React.useMemo(
    () =>
      computeCmsSummaryStats({
        announcements,
        podcasts,
        hallOfFame: honors,
        projects,
        resources,
      }),
    [announcements, podcasts, honors, projects, resources],
  );

  const tabItems: {
    id: CmsTab;
    label: string;
    countLabel?: string;
    highlightPending?: boolean;
    icon: React.ReactNode;
  }[] = [
    {
      id: "announcements",
      label: "Thông báo (News)",
      countLabel: String(announcements.length),
      icon: <Megaphone className="size-4" aria-hidden="true" />,
    },
    {
      id: "podcast",
      label: "Podcast Audio",
      countLabel: String(podcasts.length),
      icon: <Headphones className="size-4" aria-hidden="true" />,
    },
    {
      id: "hall-of-fame",
      label: "Bảng vàng Vinh danh",
      countLabel: String(honors.length),
      icon: <Award className="size-4" aria-hidden="true" />,
    },
    {
      id: "projects",
      label: "Dự án Học sinh",
      countLabel:
        stats.projectsPending > 0
          ? `${projects.length} (${stats.projectsPending} chờ duyệt)`
          : String(projects.length),
      highlightPending: stats.projectsPending > 0,
      icon: <FolderGit2 className="size-4" aria-hidden="true" />,
    },
    {
      id: "resources",
      label: "Học liệu Công khai",
      countLabel: String(resources.length),
      icon: <BookOpen className="size-4" aria-hidden="true" />,
    },
    {
      id: "brand",
      label: "Thương hiệu & Trang chủ",
      icon: <Sparkles className="size-4" aria-hidden="true" />,
    },
  ];

  const primaryCtaLabels: Partial<Record<CmsTab, string>> = {
    announcements: "Soạn thông báo mới",
    podcast: "Tải lên tập Podcast mới",
    "hall-of-fame": "Thêm gương mặt Bảng vàng",
    projects: "Đăng dự án học sinh",
    resources: "Đăng tải học liệu mới",
  };
  const primaryCtaLabel = primaryCtaLabels[activeTab];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản trị Nội dung &amp; Thương hiệu (CMS)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Biên tập bản tin, phát hành Podcast, quản lý Bảng vàng (theo điểm đã công bố), duyệt Dự án học sinh và Hồ sơ Thương hiệu trên Cổng công khai.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/" />}
            nativeButton={false}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Xem Cổng công khai
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn("size-3.5", isRefreshing && "animate-spin")}
              aria-hidden="true"
            />
            Làm mới
          </Button>
          {primaryCtaLabel && (
            <Button size="sm" onClick={triggerCreateForActiveTab}>
              <Plus className="size-4" aria-hidden="true" />
              {primaryCtaLabel}
            </Button>
          )}
        </div>
      </div>

      {/* KPI Summary Strip */}
      <CmsKpiStrip
        stats={stats}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* CMS Module Navigation Tabs */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-card p-2"
        role="tablist"
        aria-label="Các phân hệ CMS"
      >
        {tabItems.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.countLabel && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold",
                    active
                      ? "bg-white/20 text-white"
                      : tab.highlightPending
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {tab.countLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          {activeTab === "announcements" && (
            <CmsAnnouncementsTab
              announcements={announcements}
              classroomsList={classroomsList}
              onAnnouncementsChange={setAnnouncements}
              createTrigger={createCounters.announcements}
            />
          )}

          {activeTab === "podcast" && (
            <CmsPodcastsTab
              podcasts={podcasts}
              onPodcastsChange={setPodcasts}
              createTrigger={createCounters.podcast}
            />
          )}

          {activeTab === "hall-of-fame" && (
            <CmsHallOfFameTab
              honors={honors}
              classroomsList={classroomsList}
              studentsList={studentsList}
              onHonorsChange={setHonors}
              createTrigger={createCounters["hall-of-fame"]}
            />
          )}

          {activeTab === "projects" && (
            <CmsProjectsTab
              projects={projects}
              classroomsList={classroomsList}
              onProjectsChange={setProjects}
              createTrigger={createCounters.projects}
            />
          )}

          {activeTab === "resources" && (
            <CmsResourcesTab
              resources={resources}
              foldersList={foldersList}
              classroomsList={classroomsList}
              onResourcesChange={setResources}
              createTrigger={createCounters.resources}
            />
          )}

          {activeTab === "brand" && (
            <CmsBrandStudioTab
              key={brandRevision}
              teacherBrand={teacherBrand}
              onBrandChange={setTeacherBrand}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function AdminCmsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-12 w-72 rounded-xl" />
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      }
    >
      <AdminCmsContent />
    </React.Suspense>
  );
}
