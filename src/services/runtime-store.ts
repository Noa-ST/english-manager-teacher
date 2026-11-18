import fs from "node:fs";
import path from "node:path";
import {
  ADMIN_STUDENTS_DATA,
  ANNOUNCEMENTS_DATA,
  CLASSROOMS_DATA,
  CLASS_SESSIONS_DATA,
  HALL_OF_FAME_DATA,
  PODCAST_EPISODES_DATA,
  RESOURCE_FILES_DATA,
  RESOURCE_FOLDERS_DATA,
  STORED_FILES_DATA,
  STUDENT_PROJECTS_DATA,
  TEACHER_PROFILE,
  WEEKLY_SCHEDULE_DATA,
  type AdminStudentRecord,
  type AnalyticsAlertAckRecord,
  type AnnouncementItem,
  type ClassroomGroup,
  type ClassSessionRecord,
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
import { formatSessionsToScheduleSummary } from "./schedule-helper";

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
  classSessions: ClassSessionRecord[];
  analyticsAlertAcks: AnalyticsAlertAckRecord[];
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
    classSessions: structuredClone(CLASS_SESSIONS_DATA),
    analyticsAlertAcks: [],
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

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "runtime-store.json");

function loadStoreFromFile(): RuntimeStore | null {
  if (process.env.APP_IS_TEST === "true" || process.env.NODE_ENV === "test") {
    return null;
  }
  try {
    if (fs.existsSync(STORE_FILE)) {
      const content = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(content) as RuntimeStore;
      if (parsed && Array.isArray(parsed.classrooms) && Array.isArray(parsed.students)) {
        // Ensure default classrooms are present in loaded store
        const existingClassIds = new Set(parsed.classrooms.map((c) => c.id));
        for (const defaultClass of CLASSROOMS_DATA) {
          if (!existingClassIds.has(defaultClass.id)) {
            parsed.classrooms.push(structuredClone(defaultClass));
          }
        }
        if (!Array.isArray(parsed.classSessions) || parsed.classSessions.length === 0) {
          parsed.classSessions = structuredClone(CLASS_SESSIONS_DATA);
        }
        if (!Array.isArray(parsed.analyticsAlertAcks)) {
          parsed.analyticsAlertAcks = [];
        }
        if (Array.isArray(parsed.sessions)) {
          // Sort sessions chronologically
          parsed.sessions.sort((a, b) => {
            if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
            return a.startTime.localeCompare(b.startTime);
          });
          for (const cls of parsed.classrooms) {
            const classSessions = parsed.sessions.filter((s) => s.classCode === cls.code);
            if (classSessions.length > 0) {
              cls.scheduleSummary = formatSessionsToScheduleSummary(classSessions);
            }
          }
        }
        return parsed;
      }
    }
  } catch {
    // ignore read errors
  }
  return null;
}

export function saveRuntimeStore(store?: RuntimeStore): void {
  if (process.env.APP_IS_TEST === "true" || process.env.NODE_ENV === "test") {
    return;
  }
  try {
    const current = store ?? globalForRuntimeStore.__englishManagerStore;
    if (!current) return;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(current, null, 2), "utf-8");
  } catch {
    // ignore write errors
  }
}

export function resetRuntimeStore(): void {
  globalForRuntimeStore.__englishManagerStore = createInitialStore();
}

const globalForRuntimeStore = globalThis as unknown as {
  __englishManagerStore?: RuntimeStore;
};

export function getRuntimeStore(): RuntimeStore {
  if (!globalForRuntimeStore.__englishManagerStore) {
    const fromFile = loadStoreFromFile();
    if (fromFile) {
      globalForRuntimeStore.__englishManagerStore = fromFile;
    } else {
      globalForRuntimeStore.__englishManagerStore = createInitialStore();
      saveRuntimeStore(globalForRuntimeStore.__englishManagerStore);
    }
  }
  return globalForRuntimeStore.__englishManagerStore;
}

