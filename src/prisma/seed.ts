import "dotenv/config";

import {
  ADMIN_STUDENTS_DATA,
  ANNOUNCEMENTS_DATA,
  CLASSROOMS_DATA,
  HALL_OF_FAME_DATA,
  PODCAST_EPISODES_DATA,
  RESOURCE_FILES_DATA,
  RESOURCE_FOLDERS_DATA,
  STUDENT_PROJECTS_DATA,
  TEACHER_PROFILE,
  WEEKLY_SCHEDULE_DATA,
} from "../services/classroom-data";
import { prisma } from "../lib/db/prisma";

/**
 * Database Seeder — Populates PostgreSQL with the initial academic dataset.
 * Run with: `npx tsx src/prisma/seed.ts` (when PostgreSQL is up).
 */
async function main() {
  console.log("🌱 Seeding Teacher Brand Settings...");
  await prisma.teacherSetting.upsert({
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
      officeHours: TEACHER_PROFILE.officeHours,
      location: TEACHER_PROFILE.location,
    },
  });

  console.log("🌱 Seeding Classrooms...");
  for (const cls of CLASSROOMS_DATA) {
    await prisma.classroom.upsert({
      where: { code: cls.code },
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
        status: cls.status,
      },
    });
  }

  console.log("🌱 Seeding Weekly Sessions...");
  for (const ses of WEEKLY_SCHEDULE_DATA) {
    await prisma.classSession.upsert({
      where: { id: ses.id },
      update: {},
      create: {
        id: ses.id,
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

  console.log("🌱 Seeding Students & Academic Records...");
  for (const stu of ADMIN_STUDENTS_DATA) {
    const tuitionStatus =
      stu.tuitionStatus === "due-soon" ? "due_soon" : stu.tuitionStatus;
    const status = stu.status === "on-leave" ? "on_leave" : stu.status;

    await prisma.student.upsert({
      where: { code: stu.code },
      update: {},
      create: {
        id: stu.id,
        code: stu.code,
        fullName: stu.fullName,
        classroomId: stu.classId,
        className: stu.className,
        level: stu.level,
        joinedAt: stu.joinedAt,
        attendanceRate: stu.attendanceRate,
        averageScore: stu.averageScore,
        targetGoal: stu.targetGoal,
        tuitionStatus,
        tuitionPeriod: stu.tuitionPeriod,
        tuitionAmount: stu.tuitionAmount,
        parentRelation: stu.parentRelation,
        parentContactMasked: stu.parentContactMasked,
        status,
        recentComment: stu.recentComment,
      },
    });

    for (const gr of stu.grades) {
      await prisma.gradeRecord.upsert({
        where: { id: gr.id },
        update: {},
        create: {
          id: gr.id,
          studentId: stu.id,
          assessmentTitle: gr.assessmentTitle,
          date: gr.date,
          listening: gr.listening,
          reading: gr.reading,
          writing: gr.writing,
          speaking: gr.speaking,
          overall: gr.overall,
          comment: gr.comment,
        },
      });
    }

    for (let i = 0; i < stu.attendanceHistory.length; i++) {
      const att = stu.attendanceHistory[i];
      await prisma.attendanceRecord.upsert({
        where: { id: `att-${stu.id}-${i}` },
        update: {},
        create: {
          id: `att-${stu.id}-${i}`,
          studentId: stu.id,
          date: att.date,
          sessionName: att.sessionName,
          status: att.status,
          note: att.note,
        },
      });
    }
  }

  console.log("🌱 Seeding CMS Content & Resource Folders...");
  for (const ann of ANNOUNCEMENTS_DATA) {
    await prisma.announcement.upsert({
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
      await prisma.announcementAttachment.upsert({
        where: { id: att.id },
        update: {},
        create: {
          id: att.id,
          announcementId: ann.id,
          name: att.name,
          size: att.size,
          type: att.type,
          downloadCount: att.downloadCount,
        },
      });
    }
  }

  for (const ep of PODCAST_EPISODES_DATA) {
    const category = ep.category.replace("-", "_") as
      | "weekly_digest"
      | "ielts_listening"
      | "pronunciation"
      | "parent_corner";
    await prisma.podcastEpisode.upsert({
      where: { id: ep.id },
      update: {},
      create: {
        id: ep.id,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        summary: ep.summary,
        showNotes: ep.showNotes,
        category,
        categoryLabel: ep.categoryLabel,
        durationSeconds: ep.durationSeconds,
        durationLabel: ep.durationLabel,
        publishedAt: ep.publishedAt,
        isFeatured: Boolean(ep.isFeatured),
        coverTheme: ep.coverTheme,
        vocabularyHighlights: ep.vocabularyHighlights,
        status: ep.status,
      },
    });
  }

  for (const hof of HALL_OF_FAME_DATA) {
    await prisma.hallOfFameEntry.upsert({
      where: { id: hof.id },
      update: {},
      create: {
        id: hof.id,
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
    await prisma.studentProject.upsert({
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
      },
    });
  }

  for (const folder of RESOURCE_FOLDERS_DATA) {
    await prisma.resourceFolder.upsert({
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
    await prisma.resourceFile.upsert({
      where: { id: file.id },
      update: {},
      create: {
        id: file.id,
        folderId: file.folderId,
        folderName: file.folderName,
        title: file.title,
        description: file.description,
        fileType: file.fileType,
        size: file.size,
        sizeBytes: file.sizeBytes,
        updatedAt: file.updatedAt,
        downloads: file.downloads,
        pagesOrDuration: file.pagesOrDuration,
        level: file.level,
        visibility: file.visibility,
        previewSummary: file.previewSummary,
      },
    });
  }

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

