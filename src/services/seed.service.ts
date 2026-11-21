import type { PrismaClient } from "@/generated/prisma/client";
import { disconnectPrisma, prisma } from "@/lib/db/prisma";

import {
  ADMIN_STUDENTS_DATA,
  ANNOUNCEMENTS_DATA,
  CLASSROOMS_DATA,
  CLASS_SESSIONS_DATA,
  CURRICULUM_PRESETS,
  HALL_OF_FAME_DATA,
  PODCAST_EPISODES_DATA,
  RESOURCE_FILES_DATA,
  RESOURCE_FOLDERS_DATA,
  SCHEDULE_EXCEPTIONS_DATA,
  STORED_FILES_DATA,
  STUDENT_PROJECTS_DATA,
  TEACHER_PROFILE,
  WEEKLY_SCHEDULE_DATA,
} from "./classroom-data";
import {
  toPrismaCompletionResult,
  toPrismaHomeworkStatus,
  toPrismaJournalStatus,
  toPrismaJson,
  toPrismaLearningStatus,
  toPrismaPodcastCategory,
  toPrismaStudentStatus,
  toPrismaTuitionStatus,
} from "./prisma-mappers";

const DEFAULT_ASSESSMENTS = [
  "Mock Test #3 — Toàn diện 4 kỹ năng (Tháng 11/2026)",
  "Argumentative Essay #4 — Education & AI",
  "Mid-term Academic Progress Check (Tháng 10/2026)",
];

function parseDateOrNow(raw?: string | null): Date {
  if (!raw) return new Date();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Idempotent full database seeder covering all domain models in PostgreSQL.
 * Called by `src/prisma/seed.ts` (`npm run db:seed`) and `tests/test-db.ts`.
 */
export async function seedDatabase(client: PrismaClient = prisma): Promise<void> {
  // 1. Teacher Brand & System Settings
  await client.teacherSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      name: TEACHER_PROFILE.name,
      title: TEACHER_PROFILE.title,
      credentials: TEACHER_PROFILE.credentials,
      slogan: TEACHER_PROFILE.slogan,
      shortBio: TEACHER_PROFILE.shortBio,
      philosophy: TEACHER_PROFILE.philosophy,
      experienceYears: TEACHER_PROFILE.experienceYears,
      totalStudents: TEACHER_PROFILE.totalStudents,
      bandAchievementRate: TEACHER_PROFILE.bandAchievementRate,
      email: TEACHER_PROFILE.email,
      avatarUrl: TEACHER_PROFILE.avatarUrl ?? "/images/teacher-avatar.jpg",
      socialsJson: toPrismaJson(TEACHER_PROFILE.socials),
      officeHours: TEACHER_PROFILE.officeHours,
      location: TEACHER_PROFILE.location,
      currentTerm: "Học kỳ I · Năm học 2026–2027",
      defaultPortalPin: "123456",
      autoNotifyParents: true,
      presignedExpirySeconds: 900,
      lowAttendanceThresholdPercent: 90,
      tuitionReminderDaysBefore: 7,
      requirePortalVerification: true,
    },
  });

  // 2. Stored Files (must precede attachments & resources)
  const seededStoredFileIds = new Set<string>();
  for (const sf of STORED_FILES_DATA) {
    seededStoredFileIds.add(sf.id);
    await client.storedFile.upsert({
      where: { id: sf.id },
      update: {},
      create: {
        id: sf.id,
        originalName: sf.originalName,
        storedName: sf.storedName,
        provider: sf.provider,
        fileType: sf.fileType,
        mimeType: sf.mimeType,
        fileSize: sf.fileSize,
        bucketName: sf.bucketName,
        storagePath: sf.storagePath,
        cloudinaryPublicId: sf.cloudinaryPublicId,
        publicUrl: sf.publicUrl,
        isPublic: sf.isPublic,
        ownerId: sf.ownerId,
        category: sf.category,
        referencedBy: sf.referencedBy,
        createdAt: parseDateOrNow(sf.createdAt),
        updatedAt: parseDateOrNow(sf.updatedAt),
        deletedAt: sf.deletedAt ? parseDateOrNow(sf.deletedAt) : null,
      },
    });
  }

  // 3. Classrooms & Curriculum Weeks
  const classByCode = new Map<string, string>();
  const seededClassIds = new Set<string>();
  for (const cls of CLASSROOMS_DATA) {
    seededClassIds.add(cls.id);
    classByCode.set(cls.code.toUpperCase(), cls.id);

    await client.classroom.upsert({
      where: { id: cls.id },
      update: {},
      create: {
        id: cls.id,
        code: cls.code,
        name: cls.name,
        level: cls.level,
        targetBand: cls.targetBand,
        scheduleSummary: cls.scheduleSummary,
        room: cls.room,
        enrolled: cls.enrolled,
        capacity: cls.capacity,
        attendanceRate: cls.attendanceRate,
        averageScore: cls.averageScore,
        currentModule: cls.currentModule,
        startDate: cls.startDate ?? null,
        expectedEndDate: cls.expectedEndDate ?? null,
        completedAt: cls.completedAt ?? null,
        totalWeeks: cls.totalWeeks ?? 12,
        currentWeekIndex: cls.currentWeekIndex ?? 1,
        tuitionDueDate: cls.tuitionDueDate ?? "2026-11-20",
        status: cls.status,
      },
    });

    for (const week of cls.curriculum ?? []) {
      const weekId = `cw-${cls.id}-w${week.weekNumber}`;
      await client.curriculumWeek.upsert({
        where: {
          classroomId_weekNumber: {
            classroomId: cls.id,
            weekNumber: week.weekNumber,
          },
        },
        update: {},
        create: {
          id: weekId,
          classroomId: cls.id,
          weekNumber: week.weekNumber,
          title: week.title,
          focus: week.focus ?? null,
          focusSkill: week.focusSkill ?? null,
          notes: week.notes ?? null,
          status: week.status ?? "not-started",
          scheduledDate: week.scheduledDate ?? null,
          completedDate: week.completedDate ?? null,
          teacherName: week.teacherName ?? null,
          plannedSessions: week.plannedSessions ?? 2,
          isAssessmentMilestone: Boolean(week.isAssessmentMilestone),
          assessmentTitle: week.assessmentTitle ?? null,
          lessonObjectives: week.lessonObjectives ?? [],
          homework: week.homework ?? null,
          homeworkDueDate: week.homeworkDueDate ?? null,
          materialsCount:
            week.materialsCount ?? week.attachments?.length ?? 0,
        },
      });

      for (const att of week.attachments ?? []) {
        const storedFileId =
          att.storedFileId && seededStoredFileIds.has(att.storedFileId)
            ? att.storedFileId
            : null;
        await client.curriculumWeekAttachment.upsert({
          where: { id: `${cls.id}-${att.id}` },
          update: {},
          create: {
            id: `${cls.id}-${att.id}`,
            attachmentKey: att.id,
            weekId,
            title: att.name,
            type: att.type,
            url: att.url,
            storedFileId,
            sizeLabel: att.size,
            sizeBytes: att.sizeBytes ?? null,
            visibility: att.visibility === "private" ? "private" : "public",
            uploadedAt: att.uploadedAt,
          },
        });
      }
    }
  }

  // 4. Curriculum Templates (Presets)
  for (const preset of CURRICULUM_PRESETS) {
    await client.curriculumTemplate.upsert({
      where: { id: preset.id },
      update: {},
      create: {
        id: preset.id,
        name: preset.name,
        level: preset.level,
        targetBand: preset.targetBand,
        description: `Khung chương trình chuẩn (${preset.targetBand})`,
        totalWeeks: preset.totalWeeks,
        isCustom: false,
        weeksJson: JSON.stringify(preset.curriculum),
      },
    });
  }

  // 5. Weekly Sessions & Schedule Exceptions
  const seededWeeklySessionIds = new Set<string>();
  for (const ses of WEEKLY_SCHEDULE_DATA) {
    seededWeeklySessionIds.add(ses.id);
    const classroomId = classByCode.get(ses.classCode.toUpperCase()) ?? null;
    await client.classSession.upsert({
      where: { id: ses.id },
      update: {},
      create: {
        id: ses.id,
        classroomId,
        classCode: ses.classCode,
        className: ses.className,
        level: ses.level,
        dayOfWeek: ses.dayOfWeek,
        dayLabel: ses.dayLabel,
        startTime: ses.startTime,
        endTime: ses.endTime,
        room: ses.room,
        topic: ses.topic,
        enrolledCount: ses.enrolledCount,
        capacity: ses.capacity,
        status: ses.status,
        hasConflict: Boolean(ses.hasConflict),
      },
    });
  }

  const seededExceptionIds = new Set<string>();
  for (const exc of SCHEDULE_EXCEPTIONS_DATA) {
    if (!seededClassIds.has(exc.classId)) continue;
    seededExceptionIds.add(exc.id);
    await client.scheduleException.upsert({
      where: { id: exc.id },
      update: {},
      create: {
        id: exc.id,
        type: exc.type,
        originalSessionId:
          exc.originalSessionId && seededWeeklySessionIds.has(exc.originalSessionId)
            ? exc.originalSessionId
            : null,
        classroomId: exc.classId,
        originalDate: exc.originalDate,
        newDate: exc.newDate ?? null,
        startTime: exc.startTime,
        endTime: exc.endTime,
        room: exc.room,
        topic: exc.topic,
        reason: exc.reason,
        announcementId: exc.announcementId ?? null,
        createdAt: parseDateOrNow(exc.createdAt),
      },
    });
  }

  // 6. Teaching Journal Entries & Child Records (must precede AttendanceRecord linking)
  const seededJournalIds = new Set<string>();
  for (const journal of CLASS_SESSIONS_DATA) {
    if (!seededClassIds.has(journal.classId)) continue;
    seededJournalIds.add(journal.id);
    await client.teachingJournalEntry.upsert({
      where: { id: journal.id },
      update: {},
      create: {
        id: journal.id,
        classroomId: journal.classId,
        scheduleExceptionId:
          journal.scheduleExceptionId && seededExceptionIds.has(journal.scheduleExceptionId)
            ? journal.scheduleExceptionId
            : null,
        date: journal.date,
        dayLabel: journal.dayLabel,
        startTime: journal.startTime,
        endTime: journal.endTime,
        room: journal.room,
        weekNumber: journal.weekNumber,
        topic: journal.topic,
        objectives: journal.objectives,
        completionResult: toPrismaCompletionResult(journal.completionResult),
        generalNotes: journal.generalNotes,
        privateNotes: journal.privateNotes ?? "",
        homework: journal.homework,
        nextSessionPlan: journal.nextSessionPlan,
        journalStatus: toPrismaJournalStatus(journal.journalStatus),
        updatedAt: parseDateOrNow(journal.updatedAt),
      },
    });
  }

  // 7. Students, Grades, Attendance, Tuition, Communication, History
  const assessmentTitles = new Set<string>(DEFAULT_ASSESSMENTS);
  const seededStudentIds = new Set<string>();
  const seededGradeIds = new Set<string>();

  for (const stu of ADMIN_STUDENTS_DATA) {
    seededStudentIds.add(stu.id);
    await client.student.upsert({
      where: { id: stu.id },
      update: {},
      create: {
        id: stu.id,
        code: stu.code,
        fullName: stu.fullName,
        accessPinHash: stu.portalPinHash ?? "",
        classroomId: stu.classId,
        className: stu.className,
        level: stu.level,
        joinedAt: stu.joinedAt,
        attendanceRate: stu.attendanceRate,
        averageScore: stu.averageScore,
        targetGoal: stu.targetGoal,
        entryBand: stu.entryBand ?? null,
        tuitionStatus: toPrismaTuitionStatus(stu.tuitionStatus),
        tuitionPeriod: stu.tuitionPeriod,
        tuitionAmount: stu.tuitionAmount,
        tuitionDueDate: stu.tuitionDueDate ?? "2026-11-20",
        parentRelation: stu.parentRelation,
        parentContactMasked: stu.parentContactMasked,
        parentName: stu.parentName ?? null,
        parentPhone: stu.parentPhone ?? null,
        parentEmail: stu.parentEmail ?? null,
        parentNote: stu.parentNote ?? null,
        privateNote: stu.privateNote ?? null,
        leaveStartDate: stu.leaveStartDate ?? null,
        leaveReturnDate: stu.leaveReturnDate ?? null,
        leaveReason: stu.leaveReason ?? null,
        status: toPrismaStudentStatus(stu.status),
        recentComment: stu.recentComment,
        deletedAt: stu.deletedAt ? parseDateOrNow(stu.deletedAt) : null,
      },
    });

    for (const gr of stu.grades) {
      seededGradeIds.add(gr.id);
      assessmentTitles.add(gr.assessmentTitle);
      await client.gradeRecord.upsert({
        where: { id: gr.id },
        update: {},
        create: {
          id: gr.id,
          studentId: stu.id,
          classroomId: stu.classId,
          assessmentTitle: gr.assessmentTitle,
          date: gr.date,
          listening: gr.listening,
          reading: gr.reading,
          writing: gr.writing,
          speaking: gr.speaking,
          overall: gr.overall,
          comment: gr.comment,
          privateNote: gr.privateNote ?? null,
          status: gr.status === "draft" ? "draft" : "published",
        },
      });
    }

    for (let i = 0; i < stu.attendanceHistory.length; i += 1) {
      const att = stu.attendanceHistory[i];
      const sessionId =
        att.sessionId && seededWeeklySessionIds.has(att.sessionId)
          ? att.sessionId
          : null;
      const teachingJournalEntryId =
        att.sessionId && seededJournalIds.has(att.sessionId)
          ? att.sessionId
          : null;

      await client.attendanceRecord.upsert({
        where: { id: `att-${stu.id}-${i}` },
        update: {},
        create: {
          id: `att-${stu.id}-${i}`,
          studentId: stu.id,
          classroomId: stu.classId,
          sessionId,
          teachingJournalEntryId,
          date: att.date,
          sessionName: att.sessionName,
          status: att.status,
          note: att.note ?? null,
        },
      });
    }

    for (const pay of stu.tuitionHistory ?? []) {
      await client.tuitionPayment.upsert({
        where: { id: pay.id },
        update: {},
        create: {
          id: pay.id,
          studentId: stu.id,
          period: pay.period,
          baseAmount: pay.baseAmount,
          discountAmount: pay.discountAmount,
          paidAmount: pay.paidAmount,
          dueDate: pay.dueDate,
          paidAt: pay.paidAt ?? null,
          method: pay.method ?? null,
          status: pay.status,
          note: pay.note ?? null,
          receiptCode: pay.receiptCode ?? null,
        },
      });
    }

    for (const comm of stu.communicationLogs ?? []) {
      await client.communicationLog.upsert({
        where: { id: comm.id },
        update: {},
        create: {
          id: comm.id,
          studentId: stu.id,
          date: comm.date,
          channel: comm.channel,
          category: comm.category,
          summary: comm.summary,
          parentResponse: comm.parentResponse ?? null,
          nextFollowUpDate: comm.nextFollowUpDate ?? null,
          loggedBy: comm.loggedBy,
        },
      });
    }

    for (const tr of stu.classTransferHistory ?? []) {
      await client.classTransferHistory.upsert({
        where: { id: tr.id },
        update: {},
        create: {
          id: tr.id,
          studentId: stu.id,
          oldClassId: tr.oldClassId,
          oldClassName: tr.oldClassName,
          newClassId: tr.newClassId,
          newClassName: tr.newClassName,
          changedBy: tr.changedBy,
          changedAt: parseDateOrNow(tr.changedAt),
          reason: tr.reason ?? null,
        },
      });
    }

    for (const gch of stu.gradeChangeHistory ?? []) {
      await client.gradeChangeHistory.upsert({
        where: { id: gch.id },
        update: {},
        create: {
          id: gch.id,
          studentId: stu.id,
          gradeRecordId:
            gch.gradeRecordId && seededGradeIds.has(gch.gradeRecordId)
              ? gch.gradeRecordId
              : null,
          assessmentTitle: gch.assessmentTitle,
          oldScore: gch.oldScore,
          newScore: gch.newScore,
          changedBy: gch.changedBy,
          changedAt: parseDateOrNow(gch.changedAt),
          reason: gch.reason ?? null,
        },
      });
    }
  }

  for (const journal of CLASS_SESSIONS_DATA) {
    if (!seededJournalIds.has(journal.id)) continue;

    for (const rec of journal.studentRecords) {
      if (!seededStudentIds.has(rec.studentId)) continue;
      await client.sessionStudentEvaluation.upsert({
        where: {
          entryId_studentId: {
            entryId: journal.id,
            studentId: rec.studentId,
          },
        },
        update: {},
        create: {
          id: rec.id,
          entryId: journal.id,
          studentId: rec.studentId,
          attendance: rec.attendance,
          homeworkStatus: toPrismaHomeworkStatus(rec.homeworkStatus),
          learningStatus: toPrismaLearningStatus(rec.learningStatus),
          skill: rec.skill,
          score: rec.score ?? null,
          teacherFeedback: rec.teacherFeedback,
          followUp: rec.followUp,
        },
      });
    }

    for (const rev of journal.revisions) {
      await client.journalRevisionLog.upsert({
        where: { id: rev.id },
        update: {},
        create: {
          id: rev.id,
          entryId: journal.id,
          summary: rev.summary,
          previousTopic: rev.previousTopic,
          previousObjectives: rev.previousObjectives ?? null,
          previousNotes: rev.previousNotes,
          previousHomework: rev.previousHomework ?? null,
          previousNextSessionPlan: rev.previousNextSessionPlan ?? null,
          previousCompletionResult: toPrismaCompletionResult(
            rev.previousCompletionResult,
          ),
        },
      });
    }

    for (const att of journal.attachments) {
      const storedFileId =
        att.storedFileId && seededStoredFileIds.has(att.storedFileId)
          ? att.storedFileId
          : null;
      await client.sessionAttachmentFile.upsert({
        where: { id: att.id },
        update: {},
        create: {
          id: att.id,
          entryId: journal.id,
          storedFileId,
          name: att.name,
          fileType: att.type,
          size: att.size,
          url: att.url ?? null,
        },
      });
    }
  }

  // 8. Assessment Catalog
  for (const title of assessmentTitles) {
    await client.assessmentCatalog.upsert({
      where: { title },
      update: {},
      create: {
        title,
        category: title.toLowerCase().includes("essay")
          ? "writing-task"
          : title.toLowerCase().includes("mid-term")
            ? "progress-check"
            : "mock-test",
      },
    });
  }

  // 9. CMS: Announcements, Podcasts, Hall of Fame, Student Projects
  for (const ann of ANNOUNCEMENTS_DATA) {
    await client.announcement.upsert({
      where: { id: ann.id },
      update: {},
      create: {
        id: ann.id,
        title: ann.title,
        excerpt: ann.excerpt,
        content: ann.content,
        category: ann.category,
        categoryLabel: ann.categoryLabel,
        isUrgent: Boolean(ann.isUrgent),
        isPinned: Boolean(ann.isPinned),
        publishedAt: ann.publishedAt,
        readTime: ann.readTime,
        targetClasses: ann.targetClasses,
        status: ann.status,
      },
    });

    for (const att of ann.attachments) {
      await client.announcementAttachment.upsert({
        where: { id: att.id },
        update: {},
        create: {
          id: att.id,
          announcementId: ann.id,
          name: att.name,
          size: att.size,
          type: att.type,
          url: att.url ?? null,
          objectKey: att.objectKey ?? null,
          downloadCount: att.downloadCount,
        },
      });
    }
  }

  for (const ep of PODCAST_EPISODES_DATA) {
    await client.podcastEpisode.upsert({
      where: { id: ep.id },
      update: {},
      create: {
        id: ep.id,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        summary: ep.summary,
        showNotes: ep.showNotes,
        category: toPrismaPodcastCategory(ep.category),
        categoryLabel: ep.categoryLabel,
        audioKey: ep.audioKey ?? null,
        audioUrl: ep.audioUrl ?? null,
        thumbnailKey: ep.thumbnailKey ?? null,
        durationSeconds: ep.durationSeconds,
        durationLabel: ep.durationLabel,
        publishedAt: ep.publishedAt,
        isFeatured: Boolean(ep.isFeatured),
        coverTheme: ep.coverTheme,
        vocabularyHighlights: toPrismaJson(ep.vocabularyHighlights),
        status: ep.status,
      },
    });
  }

  for (const hof of HALL_OF_FAME_DATA) {
    await client.hallOfFameEntry.upsert({
      where: { id: hof.id },
      update: {},
      create: {
        id: hof.id,
        studentId: hof.studentId ?? null,
        classId: hof.classId ?? null,
        displayName: hof.displayName,
        avatarInitials: hof.avatarInitials,
        className: hof.className,
        rank: hof.rank,
        period: hof.period,
        periodLabel: hof.periodLabel,
        headlineMetric: hof.headlineMetric,
        badgeTitle: hof.badgeTitle,
        teacherEndorsement: hof.teacherEndorsement,
        milestones: hof.milestones,
      },
    });
  }

  for (const proj of STUDENT_PROJECTS_DATA) {
    await client.studentProject.upsert({
      where: { id: proj.id },
      update: {},
      create: {
        id: proj.id,
        title: proj.title,
        studentOrTeam: proj.studentOrTeam,
        className: proj.className,
        category: proj.category,
        summary: proj.summary,
        keyTakeaway: proj.keyTakeaway,
        publishedAt: proj.publishedAt,
        externalUrl: proj.externalUrl,
        featuredMetric: proj.featuredMetric,
        accentTheme: proj.accentTheme,
        status: proj.status,
        posterUrl: proj.posterUrl ?? null,
        posterPublicId: proj.posterPublicId ?? null,
        documentUrl: proj.documentUrl ?? null,
        documentName: proj.documentName ?? null,
        documentSize: proj.documentSize ?? null,
        videoUrl: proj.videoUrl ?? null,
        tags: proj.tags ?? [],
      },
    });
  }

  // 10. Resource Folders & Resource Files
  for (const folder of RESOURCE_FOLDERS_DATA) {
    await client.resourceFolder.upsert({
      where: { id: folder.id },
      update: {},
      create: {
        id: folder.id,
        name: folder.name,
        description: folder.description,
        parentId: folder.parentId,
        itemCount: folder.itemCount,
        updatedAt: folder.updatedAt,
        visibility: folder.visibility,
      },
    });
  }

  for (const file of RESOURCE_FILES_DATA) {
    await client.resourceFile.upsert({
      where: { id: file.id },
      update: {},
      create: {
        id: file.id,
        folderId: file.folderId,
        folderName: file.folderName,
        title: file.title,
        description: file.description,
        fileType: file.fileType,
        provider: file.provider ?? "supabase",
        mimeType: file.mimeType ?? "application/pdf",
        bucketName: file.bucketName ?? null,
        storagePath: file.storagePath ?? null,
        cloudinaryPublicId: file.cloudinaryPublicId ?? null,
        publicUrl: file.publicUrl ?? null,
        objectKey: file.objectKey ?? null,
        size: file.size,
        sizeBytes: file.sizeBytes,
        updatedAt: file.updatedAt,
        downloads: file.downloads,
        pagesOrDuration: file.pagesOrDuration,
        level: file.level,
        visibility: file.visibility,
        category: file.category ?? "general",
        ownerId: file.ownerId ?? null,
        originalName: file.originalName ?? null,
        storedName: file.storedName ?? null,
        previewSummary: file.previewSummary,
        deletedAt: file.deletedAt ? parseDateOrNow(file.deletedAt) : null,
      },
    });
  }
}

export async function disconnectSeedClient(): Promise<void> {
  await disconnectPrisma();
}
