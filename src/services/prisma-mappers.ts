import type {
  AnalyticsAlertAck as PrismaAnalyticsAlertAck,
  Announcement,
  AnnouncementAttachment as PrismaAnnouncementAttachment,
  AttendanceRecord as PrismaAttendanceRecord,
  Classroom as PrismaClassroom,
  ClassroomStatus,
  ClassSession as PrismaClassSession,
  ClassTransferHistory as PrismaClassTransferHistory,
  CommunicationLog as PrismaCommunicationLog,
  CurriculumTemplate as PrismaCurriculumTemplate,
  CurriculumWeek as PrismaCurriculumWeek,
  CurriculumWeekAttachment as PrismaCurriculumWeekAttachment,
  GradeChangeHistory as PrismaGradeChangeHistory,
  GradeRecord,
  HallOfFameEntry,
  HomeworkStatus,
  JournalRevisionLog as PrismaJournalRevisionLog,
  JournalStatus,
  LearningStatus,
  OrphanedStorageFile as PrismaOrphanedStorageFile,
  PodcastCategory,
  PodcastEpisode as PrismaPodcastEpisode,
  Prisma,
  ResourceFile as PrismaResourceFile,
  ResourceFolder as PrismaResourceFolder,
  ScheduleException as PrismaScheduleException,
  SessionAttachmentFile as PrismaSessionAttachmentFile,
  SessionCompletionResult,
  SessionStudentEvaluation as PrismaSessionStudentEvaluation,
  SettingsAuditLog,
  StorageAuditLog as PrismaStorageAuditLog,
  StoredFile as PrismaStoredFile,
  Student,
  StudentProject,
  StudentStatus,
  TeacherSetting,
  TeachingJournalEntry as PrismaTeachingJournalEntry,
  TuitionPayment as PrismaTuitionPayment,
  TuitionStatus,
} from "@/generated/prisma/client";

import type {
  AdminStudentRecord,
  AnalyticsAlertAckRecord,
  AnnouncementAttachment,
  AnnouncementItem,
  BrandThemeColors,
  ClassroomGroup,
  ClassSessionRecord,
  CommunicationLogEntry,
  CurriculumAttachment,
  CurriculumSkillFocus,
  CurriculumTemplate,
  CurriculumWeek,
  HallOfFameStudent,
  JournalRevision,
  OrphanedStorageObject,
  PodcastEpisode,
  ResourceFileItem,
  ResourceFolder,
  ScheduleException,
  SessionAttachment,
  SessionHomeworkStatus,
  SessionLearningStatus,
  SessionSkillType,
  SessionStudentRecord,
  SettingsAuditLogEntry,
  StorageAuditLogEntry,
  StoredFileRecord,
  StudentClassTransferEntry,
  StudentGradeChangeEntry,
  StudentProjectItem,
  SystemSettingsState,
  TeacherProfile,
  TuitionPaymentRecord,
  WeekProgressStatus,
  WeeklyClassSession,
} from "./domain-types";

// -----------------------------------------------------------------------------
//  ENUM CONVERTERS (Prisma snake_case <-> Domain kebab-case)
// -----------------------------------------------------------------------------

const PODCAST_CAT_TO_PRISMA: Record<PodcastEpisode["category"], PodcastCategory> = {
  "weekly-digest": "weekly_digest",
  "ielts-listening": "ielts_listening",
  pronunciation: "pronunciation",
  "parent-corner": "parent_corner",
};

const PODCAST_CAT_FROM_PRISMA: Record<PodcastCategory, PodcastEpisode["category"]> = {
  weekly_digest: "weekly-digest",
  ielts_listening: "ielts-listening",
  pronunciation: "pronunciation",
  parent_corner: "parent-corner",
};

export function toPrismaPodcastCategory(
  cat: PodcastEpisode["category"],
): PodcastCategory {
  return PODCAST_CAT_TO_PRISMA[cat];
}

export function fromPrismaPodcastCategory(
  cat: PodcastCategory,
): PodcastEpisode["category"] {
  return PODCAST_CAT_FROM_PRISMA[cat];
}

export function toPrismaTuitionStatus(
  status: AdminStudentRecord["tuitionStatus"],
): TuitionStatus {
  return status === "due-soon" ? "due_soon" : status;
}

export function fromPrismaTuitionStatus(
  status: TuitionStatus,
): AdminStudentRecord["tuitionStatus"] {
  return status === "due_soon" ? "due-soon" : status;
}

export function toPrismaStudentStatus(
  status: AdminStudentRecord["status"],
): StudentStatus {
  return status === "on-leave" ? "on_leave" : status;
}

export function fromPrismaStudentStatus(
  status: StudentStatus,
): AdminStudentRecord["status"] {
  return status === "on_leave" ? "on-leave" : status;
}

export function toPrismaClassroomStatus(
  status: ClassroomGroup["status"],
): ClassroomStatus {
  return status;
}

export function toPrismaJournalStatus(
  status: ClassSessionRecord["journalStatus"],
): JournalStatus {
  return status === "not-started" ? "not_started" : status;
}

export function fromPrismaJournalStatus(
  status: JournalStatus,
): ClassSessionRecord["journalStatus"] {
  return status === "not_started" ? "not-started" : status;
}

export function toPrismaCompletionResult(
  result: ClassSessionRecord["completionResult"],
): SessionCompletionResult {
  return result === "not-completed" ? "not_completed" : result;
}

export function fromPrismaCompletionResult(
  result: SessionCompletionResult,
): ClassSessionRecord["completionResult"] {
  return result === "not_completed" ? "not-completed" : result;
}

export function toPrismaHomeworkStatus(
  status: SessionHomeworkStatus,
): HomeworkStatus {
  return status === "not-submitted" ? "not_submitted" : status;
}

export function fromPrismaHomeworkStatus(
  status: HomeworkStatus,
): SessionHomeworkStatus {
  return status === "not_submitted" ? "not-submitted" : status;
}

export function toPrismaLearningStatus(
  status: SessionLearningStatus,
): LearningStatus {
  return status === "needs-support" ? "needs_support" : status;
}

export function fromPrismaLearningStatus(
  status: LearningStatus,
): SessionLearningStatus {
  return status === "needs_support" ? "needs-support" : status;
}

export function parseSocialsJson(json: unknown): TeacherProfile["socials"] {
  if (!Array.isArray(json)) return [];
  const result: TeacherProfile["socials"] = [];
  for (const item of json) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).label === "string" &&
      typeof (item as Record<string, unknown>).href === "string" &&
      typeof (item as Record<string, unknown>).handle === "string"
    ) {
      result.push({
        label: (item as Record<string, string>).label,
        href: (item as Record<string, string>).href,
        handle: (item as Record<string, string>).handle,
      });
    }
  }
  return result;
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function parseVocabularyJson(
  json: unknown,
): PodcastEpisode["vocabularyHighlights"] {
  if (!Array.isArray(json)) return [];
  const result: PodcastEpisode["vocabularyHighlights"] = [];
  for (const item of json) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).term === "string" &&
      typeof (item as Record<string, unknown>).meaning === "string"
    ) {
      const rec = item as Record<string, unknown>;
      result.push({
        term: rec.term as string,
        ipa: typeof rec.ipa === "string" ? rec.ipa : "",
        meaning: rec.meaning as string,
      });
    }
  }
  return result;
}

// -----------------------------------------------------------------------------
//  SETTINGS & AUDIT MAPPERS
// -----------------------------------------------------------------------------

function parseBrandThemeJson(raw: unknown): BrandThemeColors | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const hex = /^#[0-9A-Fa-f]{6}$/;
  const primary = typeof obj.primary === "string" && hex.test(obj.primary) ? obj.primary.toUpperCase() : "#243B64";
  const accent = typeof obj.accent === "string" && hex.test(obj.accent) ? obj.accent.toUpperCase() : "#496B9A";
  const secondary = typeof obj.secondary === "string" && hex.test(obj.secondary) ? obj.secondary.toUpperCase() : "#EAF0FA";
  const warm = typeof obj.warm === "string" && hex.test(obj.warm) ? obj.warm.toUpperCase() : "#F7F0E2";
  const highlight = typeof obj.highlight === "string" && hex.test(obj.highlight) ? obj.highlight.toUpperCase() : "#E8A18B";
  return { primary, accent, secondary, warm, highlight };
}

export function mapPrismaTeacherSetting(row: TeacherSetting): SystemSettingsState {
  return {
    name: row.name,
    avatarUrl: row.avatarUrl ?? undefined,
    title: row.title,
    credentials: [...row.credentials],
    slogan: row.slogan,
    shortBio: row.shortBio,
    philosophy: row.philosophy,
    experienceYears: row.experienceYears,
    totalStudents: row.totalStudents,
    bandAchievementRate: row.bandAchievementRate,
    email: row.email,
    officeHours: row.officeHours,
    location: row.location,
    socials: parseSocialsJson(row.socialsJson),
    brandTheme: parseBrandThemeJson(row.brandThemeJson),
    currentTerm: row.currentTerm,
    defaultPortalPin: row.defaultPortalPin,
    autoNotifyParents: row.autoNotifyParents,
    presignedExpirySeconds: row.presignedExpirySeconds,
    lowAttendanceThresholdPercent: row.lowAttendanceThresholdPercent,
    tuitionReminderDaysBefore: row.tuitionReminderDaysBefore,
    requirePortalVerification: row.requirePortalVerification,
  };
}

const VALID_SETTINGS_ACTIONS = new Set<SettingsAuditLogEntry["action"]>([
  "UPDATE_BRAND",
  "UPDATE_SECURITY",
  "UPDATE_OPERATIONS",
  "RESET_SETTINGS",
  "EXPORT_SNAPSHOT",
  "CREATE_STUDENT_ACCOUNT",
  "TOGGLE_STUDENT_ACCOUNT",
  "RESET_STUDENT_PASSWORD",
]);

export function mapPrismaSettingsAuditLog(
  row: SettingsAuditLog,
): SettingsAuditLogEntry {
  const action: SettingsAuditLogEntry["action"] = VALID_SETTINGS_ACTIONS.has(
    row.action as SettingsAuditLogEntry["action"],
  )
    ? (row.action as SettingsAuditLogEntry["action"])
    : "UPDATE_BRAND";

  return {
    id: row.id,
    action,
    actorId: row.actorId,
    changedFields: [...row.changedFields],
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
}

// -----------------------------------------------------------------------------
//  CMS & PODCAST MAPPERS
// -----------------------------------------------------------------------------

function normalizeAnnouncementAttachmentType(
  raw: string,
): AnnouncementAttachment["type"] {
  if (raw === "DOCX" || raw === "SLIDE") return raw;
  return "PDF";
}

export function mapPrismaAnnouncementAttachment(
  att: PrismaAnnouncementAttachment,
): AnnouncementAttachment {
  return {
    id: att.id,
    name: att.name,
    size: att.size,
    type: normalizeAnnouncementAttachmentType(att.type),
    downloadCount: att.downloadCount,
    url: att.url,
    objectKey: att.objectKey,
  };
}

export type AnnouncementWithAttachments = Announcement & {
  attachments: PrismaAnnouncementAttachment[];
};

export function mapPrismaAnnouncement(
  row: AnnouncementWithAttachments,
): AnnouncementItem {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    content: [...row.content],
    category: row.category,
    categoryLabel: row.categoryLabel,
    isUrgent: row.isUrgent,
    isPinned: row.isPinned,
    publishedAt: row.publishedAt,
    readTime: row.readTime,
    targetClasses: [...row.targetClasses],
    attachments: row.attachments.map(mapPrismaAnnouncementAttachment),
    status: row.status === "draft" ? "draft" : "published",
  };
}

export function mapPrismaPodcast(row: PrismaPodcastEpisode): PodcastEpisode {
  const coverTheme: PodcastEpisode["coverTheme"] =
    row.coverTheme === "cream" ||
    row.coverTheme === "sky" ||
    row.coverTheme === "coral"
      ? row.coverTheme
      : "navy";

  return {
    id: row.id,
    episodeNumber: row.episodeNumber,
    title: row.title,
    summary: row.summary,
    showNotes: [...row.showNotes],
    category: fromPrismaPodcastCategory(row.category),
    categoryLabel: row.categoryLabel,
    durationSeconds: row.durationSeconds,
    durationLabel: row.durationLabel,
    publishedAt: row.publishedAt,
    isFeatured: row.isFeatured,
    coverTheme,
    vocabularyHighlights: parseVocabularyJson(row.vocabularyHighlights),
    status: row.status === "draft" ? "draft" : "published",
    audioKey: row.audioKey,
    audioUrl: row.audioUrl,
    thumbnailKey: row.thumbnailKey,
  };
}

export function mapPrismaHallOfFame(row: HallOfFameEntry): HallOfFameStudent {
  const clampedRank = Math.min(5, Math.max(1, row.rank)) as 1 | 2 | 3 | 4 | 5;
  return {
    id: row.id,
    studentId: row.studentId ?? undefined,
    classId: row.classId ?? undefined,
    displayName: row.displayName,
    avatarInitials: row.avatarInitials,
    className: row.className,
    rank: clampedRank,
    period: row.period,
    periodLabel: row.periodLabel,
    headlineMetric: row.headlineMetric,
    badgeTitle: row.badgeTitle,
    teacherEndorsement: row.teacherEndorsement,
    milestones: [...row.milestones],
  };
}

const VALID_PROJECT_CATEGORIES = new Set<StudentProjectItem["category"]>([
  "Academic Essay",
  "Video Presentation",
  "Research Poster",
  "Debate Portfolio",
]);

export function mapPrismaStudentProject(row: StudentProject): StudentProjectItem {
  const category: StudentProjectItem["category"] = VALID_PROJECT_CATEGORIES.has(
    row.category as StudentProjectItem["category"],
  )
    ? (row.category as StudentProjectItem["category"])
    : "Research Poster";

  const accentTheme: StudentProjectItem["accentTheme"] =
    row.accentTheme === "blue" ||
    row.accentTheme === "coral" ||
    row.accentTheme === "cream"
      ? row.accentTheme
      : "navy";

  return {
    id: row.id,
    title: row.title,
    studentOrTeam: row.studentOrTeam,
    className: row.className,
    category,
    summary: row.summary,
    keyTakeaway: row.keyTakeaway,
    publishedAt: row.publishedAt,
    externalUrl: row.externalUrl,
    featuredMetric: row.featuredMetric,
    accentTheme,
    status: row.status,
    posterUrl: row.posterUrl,
    posterPublicId: row.posterPublicId,
    documentUrl: row.documentUrl,
    documentName: row.documentName,
    documentSize: row.documentSize,
    videoUrl: row.videoUrl,
    tags: [...row.tags],
  };
}

export type StudentWithGradesForRec = Student & {
  grades: GradeRecord[];
};

export function mapPrismaStudentForRecommendation(
  row: StudentWithGradesForRec,
): AdminStudentRecord {
  return {
    id: row.id,
    code: row.code,
    fullName: row.fullName,
    classId: row.classroomId,
    className: row.className,
    level: row.level,
    joinedAt: row.joinedAt,
    attendanceRate: row.attendanceRate,
    averageScore: row.averageScore,
    targetGoal: row.targetGoal,
    entryBand: row.entryBand ?? undefined,
    tuitionStatus: fromPrismaTuitionStatus(row.tuitionStatus),
    tuitionPeriod: row.tuitionPeriod,
    tuitionAmount: row.tuitionAmount,
    tuitionDueDate: row.tuitionDueDate ?? undefined,
    parentRelation: row.parentRelation,
    parentContactMasked: row.parentContactMasked,
    status: fromPrismaStudentStatus(row.status),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    recentComment: row.recentComment,
    grades: row.grades.map((g) => ({
      id: g.id,
      assessmentTitle: g.assessmentTitle,
      date: g.date,
      listening: g.listening,
      reading: g.reading,
      writing: g.writing,
      speaking: g.speaking,
      overall: g.overall,
      comment: g.comment,
      status: g.status,
      privateNote: g.privateNote ?? undefined,
      updatedAt: g.updatedAt.toISOString(),
    })),
    attendanceHistory: [],
  };
}

export type {
  JournalRevision,
  TuitionPaymentRecord,
};

// -----------------------------------------------------------------------------
//  STORAGE & RESOURCE LIBRARY MAPPERS (ĐỢT 2)
// -----------------------------------------------------------------------------

const VALID_STORED_FILE_TYPES = new Set<StoredFileRecord["fileType"]>([
  "IMAGE",
  "AUDIO",
  "PDF",
  "SLIDE",
  "WORKSHEET",
]);

const VALID_STORAGE_AUDIT_ACTIONS = new Set<StorageAuditLogEntry["action"]>([
  "UPLOAD_IMAGE",
  "UPLOAD_PODCAST",
  "UPLOAD_PDF",
  "DELETE_FILE",
  "REPLACE_FILE",
  "CREATE_SIGNED_URL",
  "ROLLBACK_ORPHAN",
  "TOGGLE_VISIBILITY",
  "CLEANUP_ORPHANS",
  "UPDATE_METADATA",
]);

export function mapPrismaResourceFolder(
  row: PrismaResourceFolder,
): ResourceFolder {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    itemCount: row.itemCount,
    updatedAt: row.updatedAt,
    visibility: row.visibility,
  };
}

export function mapPrismaResourceFile(row: PrismaResourceFile): ResourceFileItem {
  return {
    id: row.id,
    folderId: row.folderId,
    folderName: row.folderName,
    title: row.title,
    description: row.description,
    fileType: row.fileType,
    size: row.size,
    sizeBytes: row.sizeBytes,
    updatedAt: row.updatedAt,
    downloads: row.downloads,
    pagesOrDuration: row.pagesOrDuration,
    level: row.level,
    visibility: row.visibility,
    previewSummary: [...row.previewSummary],
    objectKey: row.objectKey,
    publicUrl: row.publicUrl,
    provider: row.provider,
    mimeType: row.mimeType,
    bucketName: row.bucketName,
    storagePath: row.storagePath,
    cloudinaryPublicId: row.cloudinaryPublicId,
    category: row.category,
    ownerId: row.ownerId,
    originalName: row.originalName ?? undefined,
    storedName: row.storedName ?? undefined,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

export function mapPrismaStoredFile(row: PrismaStoredFile): StoredFileRecord {
  const fileType: StoredFileRecord["fileType"] = VALID_STORED_FILE_TYPES.has(
    row.fileType as StoredFileRecord["fileType"],
  )
    ? (row.fileType as StoredFileRecord["fileType"])
    : "PDF";

  return {
    id: row.id,
    originalName: row.originalName,
    storedName: row.storedName,
    provider: row.provider,
    fileType,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    bucketName: row.bucketName,
    storagePath: row.storagePath,
    cloudinaryPublicId: row.cloudinaryPublicId,
    publicUrl: row.publicUrl,
    isPublic: row.isPublic,
    ownerId: row.ownerId,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    referencedBy: [...row.referencedBy],
  };
}

export function mapPrismaStorageAuditLog(
  row: PrismaStorageAuditLog,
): StorageAuditLogEntry {
  const action: StorageAuditLogEntry["action"] = VALID_STORAGE_AUDIT_ACTIONS.has(
    row.action as StorageAuditLogEntry["action"],
  )
    ? (row.action as StorageAuditLogEntry["action"])
    : "UPDATE_METADATA";

  const status: StorageAuditLogEntry["status"] =
    row.status === "FAILED" || row.status === "ROLLED_BACK"
      ? row.status
      : "SUCCESS";

  return {
    id: row.id,
    action,
    provider: row.provider,
    actorId: row.actorId,
    targetId: row.targetId,
    targetPath: row.targetPath,
    status,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapPrismaOrphanedStorageFile(
  row: PrismaOrphanedStorageFile,
): OrphanedStorageObject {
  return {
    id: row.id,
    provider: row.provider,
    bucketName: row.bucketName,
    storagePath: row.storagePath,
    cloudinaryPublicId: row.cloudinaryPublicId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

// -----------------------------------------------------------------------------
//  CLASSROOM, CURRICULUM & STUDENT CRM MAPPERS (ĐỢT 3)
// -----------------------------------------------------------------------------

const VALID_CURRICULUM_SKILLS = new Set<CurriculumSkillFocus>([
  "Listening",
  "Reading",
  "Writing",
  "Speaking",
  "Grammar-Vocab",
  "Mixed",
]);

const VALID_WEEK_STATUSES = new Set<WeekProgressStatus>([
  "not-started",
  "in-progress",
  "completed",
  "postponed",
]);

function normalizeCurriculumAttachmentType(
  raw: string,
): CurriculumAttachment["type"] {
  const upper = raw.toUpperCase();
  if (
    upper === "PDF" ||
    upper === "DOCX" ||
    upper === "SLIDE" ||
    upper === "WORKSHEET" ||
    upper === "IMAGE" ||
    upper === "AUDIO"
  ) {
    return upper;
  }
  return "PDF";
}

export function mapPrismaWeeklySession(
  row: PrismaClassSession,
): WeeklyClassSession {
  return {
    id: row.id,
    classCode: row.classCode,
    className: row.className,
    level: row.level,
    dayOfWeek: row.dayOfWeek,
    dayLabel: row.dayLabel,
    startTime: row.startTime,
    endTime: row.endTime,
    room: row.room,
    topic: row.topic,
    enrolledCount: row.enrolledCount,
    capacity: row.capacity,
    status: row.status,
    hasConflict: row.hasConflict,
  };
}

export function mapPrismaCurriculumWeekAttachment(
  row: PrismaCurriculumWeekAttachment,
  ctx?: { classId?: string; classCode?: string; weekNumber?: number },
): CurriculumAttachment {
  return {
    id: row.attachmentKey || row.id,
    name: row.title,
    url: row.url,
    size: row.sizeLabel ?? "1.0 MB",
    ...(row.sizeBytes !== null ? { sizeBytes: row.sizeBytes } : {}),
    type: normalizeCurriculumAttachmentType(row.type),
    uploadedAt: row.uploadedAt,
    ...(row.storedFileId ? { storedFileId: row.storedFileId } : {}),
    visibility: row.visibility,
    ...(ctx?.classId ? { classId: ctx.classId } : {}),
    ...(ctx?.classCode ? { classCode: ctx.classCode } : {}),
    ...(ctx?.weekNumber !== undefined ? { weekNumber: ctx.weekNumber } : {}),
  };
}

export type CurriculumWeekWithAttachments = PrismaCurriculumWeek & {
  attachments: PrismaCurriculumWeekAttachment[];
};

export function mapPrismaCurriculumWeek(
  row: CurriculumWeekWithAttachments,
  ctx?: { classId?: string; classCode?: string },
): CurriculumWeek {
  const focusSkill =
    row.focusSkill &&
    VALID_CURRICULUM_SKILLS.has(row.focusSkill as CurriculumSkillFocus)
      ? (row.focusSkill as CurriculumSkillFocus)
      : undefined;

  const status =
    row.status && VALID_WEEK_STATUSES.has(row.status as WeekProgressStatus)
      ? (row.status as WeekProgressStatus)
      : undefined;

  const mappedAttachments = row.attachments.map((att) =>
    mapPrismaCurriculumWeekAttachment(att, {
      ...ctx,
      weekNumber: row.weekNumber,
    }),
  );

  return {
    weekNumber: row.weekNumber,
    title: row.title,
    ...(row.focus ? { focus: row.focus } : {}),
    ...(focusSkill ? { focusSkill } : {}),
    ...(row.plannedSessions !== null
      ? { plannedSessions: row.plannedSessions }
      : {}),
    ...(status ? { status } : {}),
    ...(row.scheduledDate ? { scheduledDate: row.scheduledDate } : {}),
    ...(row.completedDate ? { completedDate: row.completedDate } : {}),
    ...(row.teacherName ? { teacherName: row.teacherName } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.homework ? { homework: row.homework } : {}),
    ...(row.homeworkDueDate ? { homeworkDueDate: row.homeworkDueDate } : {}),
    ...(row.isAssessmentMilestone
      ? {
          isAssessmentMilestone: true,
          ...(row.assessmentTitle ? { assessmentTitle: row.assessmentTitle } : {}),
        }
      : {}),
    ...(row.lessonObjectives.length > 0
      ? { lessonObjectives: [...row.lessonObjectives] }
      : {}),
    materialsCount:
      mappedAttachments.length > 0 ? mappedAttachments.length : row.materialsCount,
    attachments: mappedAttachments,
  };
}

export function mapPrismaCurriculumTemplate(
  row: PrismaCurriculumTemplate,
): CurriculumTemplate {
  let curriculum: CurriculumWeek[] = [];
  try {
    const parsed = JSON.parse(row.weeksJson);
    if (Array.isArray(parsed)) {
      curriculum = parsed as CurriculumWeek[];
    }
  } catch {
    curriculum = [];
  }

  let level = row.level;
  let targetBand = row.targetBand;
  if (!targetBand && level.includes(" · ")) {
    const [lvl, band] = level.split(" · ");
    level = lvl.trim();
    targetBand = band?.trim() ?? "";
  }

  return {
    id: row.id,
    name: row.name,
    level,
    targetBand,
    totalWeeks: row.totalWeeks,
    isCustom: row.isCustom,
    createdAt: row.createdAt.toISOString().slice(0, 10),
    curriculum,
  };
}

export type ClassroomWithCurriculum = PrismaClassroom & {
  curriculumWeeks: CurriculumWeekWithAttachments[];
  sessions?: PrismaClassSession[];
};

export function mapPrismaClassroom(
  row: ClassroomWithCurriculum,
  metrics?: {
    enrolled: number;
    averageScore: number;
    attendanceRate: number;
    scheduleSummary?: string;
  },
): ClassroomGroup {
  const sortedWeeks = [...row.curriculumWeeks].sort(
    (a, b) => a.weekNumber - b.weekNumber,
  );

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    level: row.level,
    targetBand: row.targetBand,
    scheduleSummary: metrics?.scheduleSummary ?? row.scheduleSummary,
    room: row.room,
    enrolled: metrics?.enrolled ?? row.enrolled,
    capacity: row.capacity,
    attendanceRate: metrics?.attendanceRate ?? row.attendanceRate,
    averageScore: metrics?.averageScore ?? row.averageScore,
    currentModule: row.currentModule,
    status: row.status,
    ...(row.startDate ? { startDate: row.startDate } : {}),
    ...(row.expectedEndDate ? { expectedEndDate: row.expectedEndDate } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
    totalWeeks: row.totalWeeks,
    currentWeekIndex: row.currentWeekIndex,
    curriculum: sortedWeeks.map((w) =>
      mapPrismaCurriculumWeek(w, { classId: row.id, classCode: row.code }),
    ),
    ...(row.tuitionDueDate ? { tuitionDueDate: row.tuitionDueDate } : {}),
  };
}

export type StudentWithRelations = Student & {
  grades: GradeRecord[];
  attendanceHistory: PrismaAttendanceRecord[];
  tuitionPayments: PrismaTuitionPayment[];
  communicationLogs: PrismaCommunicationLog[];
  classTransfers: PrismaClassTransferHistory[];
  gradeChangeHistory: PrismaGradeChangeHistory[];
};

function mapPrismaTuitionPayment(
  row: PrismaTuitionPayment,
): TuitionPaymentRecord {
  const method: TuitionPaymentRecord["method"] =
    row.method === "transfer" || row.method === "cash" || row.method === "other"
      ? row.method
      : undefined;

  const status: TuitionPaymentRecord["status"] =
    row.status === "paid" ||
    row.status === "partial" ||
    row.status === "due-soon" ||
    row.status === "overdue"
      ? row.status
      : "due-soon";

  return {
    id: row.id,
    period: row.period,
    baseAmount: row.baseAmount,
    discountAmount: row.discountAmount,
    paidAmount: row.paidAmount,
    dueDate: row.dueDate,
    ...(row.paidAt ? { paidAt: row.paidAt } : {}),
    ...(method ? { method } : {}),
    status,
    ...(row.note ? { note: row.note } : {}),
    ...(row.receiptCode ? { receiptCode: row.receiptCode } : {}),
  };
}

function mapPrismaCommunicationLog(
  row: PrismaCommunicationLog,
): CommunicationLogEntry {
  const channel: CommunicationLogEntry["channel"] =
    row.channel === "zalo" ||
    row.channel === "phone" ||
    row.channel === "email" ||
    row.channel === "in-person"
      ? row.channel
      : "zalo";

  const category: CommunicationLogEntry["category"] =
    row.category === "academic" ||
    row.category === "tuition" ||
    row.category === "attendance" ||
    row.category === "general"
      ? row.category
      : "general";

  return {
    id: row.id,
    date: row.date,
    channel,
    category,
    summary: row.summary,
    ...(row.parentResponse ? { parentResponse: row.parentResponse } : {}),
    ...(row.nextFollowUpDate ? { nextFollowUpDate: row.nextFollowUpDate } : {}),
    loggedBy: row.loggedBy,
  };
}

export function mapPrismaStudent(
  row: StudentWithRelations,
  classNameById?: Map<string, string>,
): AdminStudentRecord {
  return {
    id: row.id,
    code: row.code,
    fullName: row.fullName,
    ...(row.accessPinHash ? { portalPinHash: row.accessPinHash } : {}),
    classId: row.classroomId,
    className: row.className,
    level: row.level,
    joinedAt: row.joinedAt,
    attendanceRate: row.attendanceRate,
    averageScore: row.averageScore,
    targetGoal: row.targetGoal,
    ...(row.entryBand !== null ? { entryBand: row.entryBand } : {}),
    tuitionStatus: fromPrismaTuitionStatus(row.tuitionStatus),
    tuitionPeriod: row.tuitionPeriod,
    tuitionAmount: row.tuitionAmount,
    ...(row.tuitionDueDate ? { tuitionDueDate: row.tuitionDueDate } : {}),
    parentRelation: row.parentRelation,
    parentContactMasked: row.parentContactMasked,
    ...(row.parentName ? { parentName: row.parentName } : {}),
    ...(row.parentPhone ? { parentPhone: row.parentPhone } : {}),
    ...(row.parentEmail ? { parentEmail: row.parentEmail } : {}),
    ...(row.parentNote ? { parentNote: row.parentNote } : {}),
    ...(row.privateNote ? { privateNote: row.privateNote } : {}),
    ...(row.leaveStartDate ? { leaveStartDate: row.leaveStartDate } : {}),
    ...(row.leaveReturnDate ? { leaveReturnDate: row.leaveReturnDate } : {}),
    ...(row.leaveReason ? { leaveReason: row.leaveReason } : {}),
    tuitionHistory: row.tuitionPayments.map(mapPrismaTuitionPayment),
    communicationLogs: row.communicationLogs.map(mapPrismaCommunicationLog),
    classTransferHistory: row.classTransfers.map(
      (t): StudentClassTransferEntry => ({
        id: t.id,
        oldClassId: t.oldClassId,
        oldClassName:
          t.oldClassName || classNameById?.get(t.oldClassId) || t.oldClassId,
        newClassId: t.newClassId,
        newClassName:
          t.newClassName || classNameById?.get(t.newClassId) || t.newClassId,
        changedAt: t.changedAt.toISOString().slice(0, 10),
        changedBy: t.changedBy,
        ...(t.reason ? { reason: t.reason } : {}),
      }),
    ),
    gradeChangeHistory: row.gradeChangeHistory.map(
      (g): StudentGradeChangeEntry => ({
        id: g.id,
        ...(g.gradeRecordId ? { gradeRecordId: g.gradeRecordId } : {}),
        assessmentTitle: g.assessmentTitle,
        oldScore: g.oldScore,
        newScore: g.newScore,
        changedAt: g.changedAt.toISOString().slice(0, 10),
        changedBy: g.changedBy,
        ...(g.reason ? { reason: g.reason } : {}),
      }),
    ),
    status: fromPrismaStudentStatus(row.status),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    recentComment: row.recentComment,
    grades: row.grades.map((g) => ({
      id: g.id,
      assessmentTitle: g.assessmentTitle,
      date: g.date,
      listening: g.listening,
      reading: g.reading,
      writing: g.writing,
      speaking: g.speaking,
      overall: g.overall,
      comment: g.comment,
      status: g.status,
      ...(g.privateNote ? { privateNote: g.privateNote } : {}),
      updatedAt: g.updatedAt.toISOString(),
    })),
    attendanceHistory: row.attendanceHistory.map((a) => {
      const linkedSessionId = a.teachingJournalEntryId ?? a.sessionId ?? undefined;
      return {
        ...(linkedSessionId ? { sessionId: linkedSessionId } : {}),
        date: a.date,
        sessionName: a.sessionName,
        status: a.status,
        ...(a.note ? { note: a.note } : {}),
      };
    }),
  };
}

// -----------------------------------------------------------------------------
//  SCHEDULE, ATTENDANCE & TEACHING JOURNAL MAPPERS (ĐỢT 4)
// -----------------------------------------------------------------------------

export type ScheduleExceptionWithClassroom = PrismaScheduleException & {
  classroom: Pick<PrismaClassroom, "id" | "code" | "name" | "level">;
};

export function mapPrismaScheduleException(
  row: ScheduleExceptionWithClassroom,
): ScheduleException {
  return {
    id: row.id,
    type: row.type,
    ...(row.originalSessionId
      ? { originalSessionId: row.originalSessionId }
      : {}),
    classId: row.classroomId,
    classCode: row.classroom.code,
    className: row.classroom.name,
    level: row.classroom.level,
    originalDate: row.originalDate,
    ...(row.newDate
      ? { newDate: row.newDate }
      : row.type === "makeup"
        ? { newDate: row.originalDate }
        : {}),
    startTime: row.startTime,
    endTime: row.endTime,
    room: row.room,
    topic: row.topic,
    reason: row.reason,
    ...(row.announcementId ? { announcementId: row.announcementId } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

const VALID_SESSION_SKILLS = new Set<SessionSkillType>([
  "Listening",
  "Reading",
  "Writing",
  "Speaking",
  "General",
]);

function normalizeSessionSkill(raw: string): SessionSkillType {
  if (VALID_SESSION_SKILLS.has(raw as SessionSkillType)) {
    return raw as SessionSkillType;
  }
  return "General";
}

function normalizeSessionAttachmentType(
  raw: string,
): SessionAttachment["type"] {
  const upper = raw.toUpperCase();
  if (
    upper === "PDF" ||
    upper === "SLIDE" ||
    upper === "IMAGE" ||
    upper === "DOCX" ||
    upper === "WORKSHEET" ||
    upper === "AUDIO"
  ) {
    return upper;
  }
  return "PDF";
}

function formatDateTimeDisplayVi(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

function formatDateDisplayVi(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function mapPrismaSessionAttachmentFile(
  row: PrismaSessionAttachmentFile,
): SessionAttachment {
  return {
    id: row.id,
    ...(row.storedFileId ? { storedFileId: row.storedFileId } : {}),
    name: row.name,
    type: normalizeSessionAttachmentType(row.fileType),
    size: row.size,
    ...(row.url ? { url: row.url } : {}),
    uploadedAt: formatDateDisplayVi(row.uploadedAt),
  };
}

export function mapPrismaJournalRevisionLog(
  row: PrismaJournalRevisionLog,
): JournalRevision {
  return {
    id: row.id,
    updatedAt: formatDateTimeDisplayVi(row.createdAt),
    summary: row.summary,
    previousTopic: row.previousTopic,
    ...(row.previousObjectives !== null
      ? { previousObjectives: row.previousObjectives }
      : {}),
    previousNotes: row.previousNotes,
    ...(row.previousHomework !== null
      ? { previousHomework: row.previousHomework }
      : {}),
    ...(row.previousNextSessionPlan !== null
      ? { previousNextSessionPlan: row.previousNextSessionPlan }
      : {}),
    previousCompletionResult: fromPrismaCompletionResult(
      row.previousCompletionResult,
    ),
  };
}

export type SessionStudentEvaluationWithStudent =
  PrismaSessionStudentEvaluation & {
    student: Pick<Student, "id" | "code" | "fullName">;
  };

export function mapPrismaSessionStudentEvaluation(
  row: SessionStudentEvaluationWithStudent,
): SessionStudentRecord {
  return {
    id: row.id,
    sessionId: row.entryId,
    studentId: row.studentId,
    studentCode: row.student.code,
    studentName: row.student.fullName,
    attendance: row.attendance,
    homeworkStatus: fromPrismaHomeworkStatus(row.homeworkStatus),
    learningStatus: fromPrismaLearningStatus(row.learningStatus),
    skill: normalizeSessionSkill(row.skill),
    score: row.score ?? null,
    teacherFeedback: row.teacherFeedback,
    followUp: row.followUp,
  };
}

export type TeachingJournalEntryWithRelations = PrismaTeachingJournalEntry & {
  classroom: Pick<PrismaClassroom, "id" | "code" | "name">;
  studentEvaluations: SessionStudentEvaluationWithStudent[];
  revisions: PrismaJournalRevisionLog[];
  attachments: PrismaSessionAttachmentFile[];
};

export function mapPrismaTeachingJournalEntry(
  row: TeachingJournalEntryWithRelations,
): ClassSessionRecord {
  return {
    id: row.id,
    classId: row.classroomId,
    classCode: row.classroom.code,
    className: row.classroom.name,
    date: row.date,
    dayLabel: row.dayLabel,
    startTime: row.startTime,
    endTime: row.endTime,
    room: row.room,
    weekNumber: row.weekNumber,
    topic: row.topic,
    objectives: row.objectives,
    completionResult: fromPrismaCompletionResult(row.completionResult),
    generalNotes: row.generalNotes,
    privateNotes: row.privateNotes,
    homework: row.homework,
    nextSessionPlan: row.nextSessionPlan,
    journalStatus: fromPrismaJournalStatus(row.journalStatus),
    ...(row.scheduleExceptionId
      ? { scheduleExceptionId: row.scheduleExceptionId }
      : {}),
    attachments: row.attachments.map(mapPrismaSessionAttachmentFile),
    revisions: row.revisions.map(mapPrismaJournalRevisionLog),
    studentRecords: row.studentEvaluations.map(
      mapPrismaSessionStudentEvaluation,
    ),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapPrismaAnalyticsAlertAck(
  row: PrismaAnalyticsAlertAck,
): AnalyticsAlertAckRecord {
  return {
    alertId: row.alertId,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    ...(row.note ? { note: row.note } : {}),
  };
}
