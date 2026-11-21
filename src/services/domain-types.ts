export {
  DAYS_OF_WEEK,
  STANDARD_ROOMS,
  STANDARD_TIME_SLOTS,
  resolveWeekStatus,
  type AdminStudentRecord,
  type AnalyticsAlertAckRecord,
  type AnnouncementAttachment,
  type AnnouncementCategory,
  type AnnouncementItem,
  type ClassroomGroup,
  type ClassSessionRecord,
  type CommunicationLogEntry,
  type CurriculumAttachment,
  type CurriculumPreset,
  type CurriculumSkillFocus,
  type CurriculumTemplate,
  type CurriculumWeek,
  type HallOfFameStudent,
  type JournalRevision,
  type JournalStatus,
  type MasterCurriculumMaterial,
  type MaterialClassAssignment,
  type OrphanedStorageObject,
  type PendingScheduleJournalItem,
  type PodcastEpisode,
  type ResolvedScheduleOccurrence,
  type ResourceFileItem,
  type ResourceFolder,
  type ScheduleException,
  type ScheduleExceptionType,
  type SessionAttachment,
  type SessionCompletionResult,
  type SessionHomeworkStatus,
  type SessionLearningStatus,
  type SessionSkillType,
  type SessionStudentRecord,
  type SettingsAuditLogEntry,
  type StorageAuditLogEntry,
  type StoredFileRecord,
  type StudentClassTransferEntry,
  type StudentGradeChangeEntry,
  type StudentPortalSessionEntry,
  type StudentProjectItem,
  type StudentScheduleOccurrence,
  type TeacherProfile,
  type TimeSlotDef,
  type TuitionPaymentRecord,
  type WeekProgressStatus,
  type WeeklyClassSession,
} from "./classroom-data";
import type { TeacherProfile } from "./classroom-data";

export interface SystemSettingsState extends TeacherProfile {
  currentTerm: string;
  defaultPortalPin: string;
  autoNotifyParents: boolean;
  presignedExpirySeconds: number;
  lowAttendanceThresholdPercent: number;
  tuitionReminderDaysBefore: number;
  requirePortalVerification: boolean;
}
