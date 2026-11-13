import {
  ADMIN_STUDENTS_DATA,
  ANNOUNCEMENTS_DATA,
  CLASSROOMS_DATA,
  HALL_OF_FAME_DATA,
  PODCAST_EPISODES_DATA,
  RESOURCE_FILES_DATA,
  RESOURCE_FOLDERS_DATA,
  STORED_FILES_DATA,
  STUDENT_PROJECTS_DATA,
  TEACHER_PROFILE,
  WEEKLY_SCHEDULE_DATA,
  type AdminStudentRecord,
  type AnnouncementItem,
  type ClassroomGroup,
  type HallOfFameStudent,
  type OrphanedStorageObject,
  type PodcastEpisode,
  type ResourceFileItem,
  type ResourceFolder,
  type StorageAuditLogEntry,
  type StoredFileRecord,
  type StudentProjectItem,
  type TeacherProfile,
  type WeeklyClassSession,
} from "./classroom-data";

export interface SystemSettingsState extends TeacherProfile {
  currentTerm: string;
  defaultPortalPin: string;
  autoNotifyParents: boolean;
  presignedExpirySeconds: number;
}

export interface RuntimeStore {
  settings: SystemSettingsState;
  classrooms: ClassroomGroup[];
  sessions: WeeklyClassSession[];
  students: AdminStudentRecord[];
  assessments: string[];
  announcements: AnnouncementItem[];
  podcasts: PodcastEpisode[];
  hallOfFame: HallOfFameStudent[];
  projects: StudentProjectItem[];
  folders: ResourceFolder[];
  files: ResourceFileItem[];
  storedFiles: StoredFileRecord[];
  storageAuditLogs: StorageAuditLogEntry[];
  orphanFiles: OrphanedStorageObject[];
}

function createInitialStore(): RuntimeStore {
  return {
    settings: {
      ...structuredClone(TEACHER_PROFILE),
      currentTerm: "Học kỳ I · Năm học 2026–2027",
      defaultPortalPin: "123456",
      autoNotifyParents: true,
      presignedExpirySeconds: 900,
    },
    classrooms: structuredClone(CLASSROOMS_DATA),
    sessions: structuredClone(WEEKLY_SCHEDULE_DATA),
    students: structuredClone(ADMIN_STUDENTS_DATA),
    assessments: [
      "Mock Test #3 — Toàn diện 4 kỹ năng (Tháng 11/2026)",
      "Argumentative Essay #4 — Education & AI",
      "Mid-term Academic Progress Check (Tháng 10/2026)",
    ],
    announcements: structuredClone(ANNOUNCEMENTS_DATA),
    podcasts: structuredClone(PODCAST_EPISODES_DATA),
    hallOfFame: structuredClone(HALL_OF_FAME_DATA),
    projects: structuredClone(STUDENT_PROJECTS_DATA),
    folders: structuredClone(RESOURCE_FOLDERS_DATA),
    files: structuredClone(RESOURCE_FILES_DATA),
    storedFiles: structuredClone(STORED_FILES_DATA),
    storageAuditLogs: [],
    orphanFiles: [],
  };
}

export function resetRuntimeStore(): void {
  globalForRuntimeStore.__englishManagerStore = createInitialStore();
}

const globalForRuntimeStore = globalThis as unknown as {
  __englishManagerStore?: RuntimeStore;
};

export function getRuntimeStore(): RuntimeStore {
  if (!globalForRuntimeStore.__englishManagerStore) {
    globalForRuntimeStore.__englishManagerStore = createInitialStore();
  }
  return globalForRuntimeStore.__englishManagerStore;
}

