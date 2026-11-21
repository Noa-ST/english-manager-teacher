"use client";

import * as React from "react";
import type {
  AnnouncementItem,
  HallOfFameStudent,
  PodcastEpisode,
  ResourceFileItem,
  StudentProjectItem,
  StudentScheduleOccurrence,
  TeacherProfile,
} from "@/services/classroom-data";
import type {
  HomeWeekDateRange,
  PublicWeeklyClassSession,
} from "@/services/viewer-home-helpers";
import type { PublicOverviewPayload } from "@/services/viewer-overview.service";
import { apiRequest } from "@/lib/api-client";
import { HomeAnnouncementsScheduleSection } from "@/components/viewer/home/home-announcements-schedule-section";
import { HomeHallOfFameSection } from "@/components/viewer/home/home-hall-of-fame-section";
import { HomeHeroSection } from "@/components/viewer/home/home-hero-section";
import { HomeMediaHubSection } from "@/components/viewer/home/home-media-hub-section";

const emptySubscribe = () => () => {};
const getClientToday = () => {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
};
const getServerToday = () => 4;

const DEFAULT_WEEK_RANGE: HomeWeekDateRange = {
  mondayIso: "2026-11-16",
  sundayIso: "2026-11-22",
  datesByDay: {
    1: { iso: "2026-11-16", shortDate: "16/11" },
    2: { iso: "2026-11-17", shortDate: "17/11" },
    3: { iso: "2026-11-18", shortDate: "18/11" },
    4: { iso: "2026-11-19", shortDate: "19/11" },
    5: { iso: "2026-11-20", shortDate: "20/11" },
    6: { iso: "2026-11-21", shortDate: "21/11" },
    7: { iso: "2026-11-22", shortDate: "22/11" },
  },
  label: "16/11 – 22/11/2026",
};

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

export default function ViewerHomePage() {
  // Safe SSR hydration using useSyncExternalStore (deterministic server day, live client day)
  const [userSelectedDay, setUserSelectedDay] = React.useState<number | null>(
    null,
  );
  const clientToday = React.useSyncExternalStore(
    emptySubscribe,
    getClientToday,
    getServerToday,
  );
  const selectedDay = userSelectedDay ?? clientToday;

  const [currentUser, setCurrentUser] = React.useState<{
    role?: "admin" | "student";
    studentId?: string;
  } | null>(null);

  const [teacher, setTeacher] = React.useState<TeacherProfile>(
    EMPTY_TEACHER_PROFILE,
  );
  const [announcements, setAnnouncements] = React.useState<AnnouncementItem[]>(
    [],
  );
  const [scheduleFallback, setScheduleFallback] = React.useState<
    PublicWeeklyClassSession[]
  >([]);
  const [weekRange, setWeekRange] =
    React.useState<HomeWeekDateRange>(DEFAULT_WEEK_RANGE);
  const [weekOccurrences, setWeekOccurrences] = React.useState<
    StudentScheduleOccurrence[]
  >([]);
  const [hallOfFame, setHallOfFame] = React.useState<HallOfFameStudent[]>([]);
  const [podcasts, setPodcasts] = React.useState<PodcastEpisode[]>([]);
  const [projects, setProjects] = React.useState<StudentProjectItem[]>([]);
  const [resources, setResources] = React.useState<ResourceFileItem[]>([]);

  React.useEffect(() => {
    let active = true;

    apiRequest<PublicOverviewPayload>("/api/viewer/overview")
      .then((data) => {
        if (!active || !data) return;
        setTeacher(data.teacher);
        setAnnouncements(data.announcements);
        setScheduleFallback(data.schedule);
        if (data.weekRange) {
          setWeekRange(data.weekRange);
        }
        if (Array.isArray(data.weekOccurrences)) {
          setWeekOccurrences(data.weekOccurrences);
        }
        setHallOfFame(data.hallOfFame);
        setPodcasts(data.podcasts);
        setProjects(data.projects);
        setResources(data.resources);
      })
      .catch(() => {
        // Fallback to static seed when offline
      });

    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!active) return;
        if (payload?.ok && payload?.data?.user) {
          setCurrentUser(payload.data.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="bg-[#F8F9FC] text-[#253047]">
      <HomeHeroSection teacher={teacher} currentUser={currentUser} />

      <HomeAnnouncementsScheduleSection
        announcements={announcements}
        weekOccurrences={weekOccurrences}
        scheduleFallback={scheduleFallback}
        weekRange={weekRange}
        selectedDay={selectedDay}
        onSelectDay={setUserSelectedDay}
        currentUser={currentUser}
      />

      <HomeHallOfFameSection hallOfFame={hallOfFame} />

      <HomeMediaHubSection
        podcasts={podcasts}
        projects={projects}
        resources={resources}
        teacherName={teacher.name}
        teacherAvatarUrl={teacher.avatarUrl}
      />
    </div>
  );
}
