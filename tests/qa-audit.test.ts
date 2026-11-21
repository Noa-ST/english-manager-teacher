import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { prisma } from "@/lib/db/prisma";
import { resetServerEnvCache } from "@/lib/env";
import {
  createStudentPortalToken,
  verifyStudentPortalToken,
} from "@/lib/student-token";
import { getStudentAcademicAlerts } from "@/services/academic-alert.service";
import * as classroomService from "@/services/classroom.service";
import * as cmsService from "@/services/cms.service";
import { NotFoundError, TooManyRequestsError, UnauthorizedError, ValidationError } from "@/services/errors";
import {
  assertNotRateLimited,
  clearAllMemoryRateLimits,
  getClientIp,
  registerFailedAttempt,
  resetRateLimit,
} from "@/services/rate-limit.service";
import * as scheduleService from "@/services/schedule.service";
import * as settingsService from "@/services/settings.service";
import { updateSettingsSchema } from "@/services/settings.service";
import * as storageService from "@/services/storage.service";
import * as studentService from "@/services/student.service";
import * as teachingJournalService from "@/services/teaching-journal.service";
import {
  createOrGenerateClassSession,
  sessionAttachmentSchema,
} from "@/services/teaching-journal.service";
import { getPublicOverviewData } from "@/services/viewer-overview.service";

import {
  hasTestDatabase,
  resetAndSeedTestDatabase,
  teardownTestDatabase,
} from "./test-db";

function applyAuditTestEnv() {
  (process.env as Record<string, string>).NODE_ENV = "test";
  process.env.APP_IS_TEST = "true";
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgresql://postgres:123456@localhost:5432/english_manager?schema=public";
  }
  process.env.AUTH_SECRET =
    "test-only-auth-secret-with-at-least-32-characters-long";
  process.env.ADMIN_EMAIL = "teacher@example.com";
  process.env.CLOUDINARY_CLOUD_NAME = "";
  process.env.CLOUDINARY_API_KEY = "";
  process.env.CLOUDINARY_API_SECRET = "";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_PUBLISHABLE_KEY = "";
  process.env.SUPABASE_SECRET_KEY = "";
  process.env.SUPABASE_PUBLIC_BUCKET = "english-manager-public";
  process.env.SUPABASE_PRIVATE_BUCKET = "english-manager-private";
  process.env.STORAGE_PROVIDER_IMAGES = "cloudinary";
  process.env.STORAGE_PROVIDER_DOCUMENTS = "supabase";
  process.env.STORAGE_PROVIDER_AUDIO = "supabase";
  resetServerEnvCache();
}

describe("QA Audit Suite — Coverage & Empirical Bug Reproductions", () => {
  beforeEach(() => {
    applyAuditTestEnv();
    clearAllMemoryRateLimits();
    storageService.resetUploadRateLimit();
  });

  // =========================================================================
  // PART A: UNTESTED SECURITY & INFRASTRUCTURE MODULE COVERAGE
  // =========================================================================

  describe("Part A. Untested Security Module Coverage", () => {
    it("A.1. student-token: sign/verify roundtrip succeeds and rejects tampered JWT", async () => {
      const token = await createStudentPortalToken({
        studentId: "stu-01",
        studentCode: "HS-2026-01",
      });
      const verified = await verifyStudentPortalToken(token);
      assert.deepEqual(verified, {
        studentId: "stu-01",
        studentCode: "HS-2026-01",
      });

      const tampered = `${token.slice(0, -4)}xxxx`;
      const rejected = await verifyStudentPortalToken(tampered);
      assert.equal(rejected, null);
    });

    it("A.2. rate-limit: locks identifier after 5 failed attempts and unlocks after resetRateLimit", async () => {
      const key = "ip:203.0.113.10";
      for (let i = 0; i < 5; i += 1) {
        await assertNotRateLimited(key);
        await registerFailedAttempt(key);
      }

      await assert.rejects(
        () => assertNotRateLimited(key),
        (err: unknown) => err instanceof TooManyRequestsError,
      );

      await resetRateLimit(key);
      await assert.doesNotReject(() => assertNotRateLimited(key));
    });

    it("A.3. storage security helpers: blocks PE/ELF magic bytes and path traversal / dangerous extensions", () => {
      const peHeader = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
      const elfHeader = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);

      assert.throws(() => storageService.verifyFileMagicBytes(peHeader, "image"));
      assert.throws(() => storageService.verifyFileMagicBytes(elfHeader, "pdf"));

      assert.throws(() => storageService.slugifyFileName("../secret.pdf"));
      for (const badName of ["run.exe", "shell.php", "xss.html", "payload.js"]) {
        assert.throws(() => storageService.slugifyFileName(badName));
      }
    });
  });

  // =========================================================================
  // PART B: EMPIRICAL BUG REPRODUCTIONS (CHARACTERIZATION TESTS)
  // =========================================================================

  describe("Part B. Empirical Fix Regressions (Wave 1 Fixed Assertions + Wave 2 Repros)", () => {
    it("[BUG-03 FIXED] getClientIp ignores spoofed forwarding headers unless TRUST_PROXY=true", async () => {
      const prevTrust = process.env.TRUST_PROXY;
      delete process.env.TRUST_PROXY;
      try {
        const req1 = new Request("http://localhost/api/viewer/student-portal/verify", {
          headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.1" },
        });
        const ip1 = getClientIp(req1);

        for (let i = 0; i < 5; i += 1) {
          await registerFailedAttempt(`ip:${ip1}`);
        }
        await assert.rejects(() => assertNotRateLimited(`ip:${ip1}`), TooManyRequestsError);

        // Attacker rotating cf-connecting-ip / x-forwarded-for gets identical non-spoofable key
        const reqSpoofed = new Request("http://localhost/api/viewer/student-portal/verify", {
          headers: { "cf-connecting-ip": "198.51.100.2" },
        });
        const spoofedIp = getClientIp(reqSpoofed);
        assert.equal(spoofedIp, ip1);
        await assert.rejects(() => assertNotRateLimited(`ip:${spoofedIp}`), TooManyRequestsError);
      } finally {
        if (prevTrust !== undefined) process.env.TRUST_PROXY = prevTrust;
      }
    });

    it("[BUG-06 FIXED] Attachment, project & social link schemas reject javascript:/XSS URIs", () => {
      assert.throws(() =>
        classroomService.curriculumAttachmentSchema.parse({
          id: "att-xss-1",
          name: "XSS Test",
          url: "javascript:alert(1)",
          size: "1 MB",
          type: "PDF",
          uploadedAt: "21/11/2026",
        }),
      );

      assert.throws(() =>
        sessionAttachmentSchema.parse({
          id: "satt-xss-1",
          name: "XSS Session",
          url: "javascript:alert(document.cookie)",
        }),
      );

      assert.throws(() =>
        cmsService.announcementAttachmentSchema.parse({
          id: "annatt-xss-1",
          name: "XSS Announcement",
          size: "500 KB",
          url: "javascript:alert(1)",
        }),
      );

      assert.throws(() =>
        updateSettingsSchema.parse({
          socials: [{ label: "Site", href: "javascript:alert(1)", handle: "@test" }],
        }),
      );
    });

    it("[BUG-11 FIXED] Magic bytes reject truncated (<4 byte) executable buffers", () => {
      assert.doesNotThrow(() => storageService.verifyFileMagicBytes(undefined, "pdf"));
      assert.throws(
        () => storageService.verifyFileMagicBytes(new Uint8Array([0x4d, 0x5a]), "pdf"),
        ValidationError,
      );
    });

    describe(
      "PostgreSQL / Prisma QA Regressions (Đợt 1–4 Services)",
      { skip: !hasTestDatabase() },
      () => {
        beforeEach(async () => {
          await resetAndSeedTestDatabase();
        });

        after(async () => {
          await teardownTestDatabase();
        });

        it("[BUG-02 DB FIXED] verifyStudentPortal enforces per-student scrypt PIN and blocks archived students", async () => {
          const activeStudents = await studentService.listAllStudents({
            status: "active",
          });
          const target = activeStudents[0];
          assert.ok(target);

          await studentService.setStudentPortalPin(target.id, "CUSTOM88");

          await assert.rejects(
            () =>
              studentService.verifyStudentPortal({
                studentCode: target.code,
                accessKey: "123456",
              }),
            UnauthorizedError,
          );

          const ok = await studentService.verifyStudentPortal({
            studentCode: target.code,
            accessKey: "CUSTOM88",
          });
          assert.equal(ok.id, target.id);

          await studentService.archiveStudent(target.id);
          await assert.rejects(
            () =>
              studentService.verifyStudentPortal({
                studentCode: target.code,
                accessKey: "CUSTOM88",
              }),
            UnauthorizedError,
          );
        });

        it("[BUG-09 DB FIXED] recordGrade preserves latest published average on backfill and excludes drafts from class average & alerts", async () => {
          const cls = await classroomService.createClassroom({
            code: "QA-GRD-01",
            name: "QA Grade Class",
          });
          const pubStu = await studentService.createStudent({
            code: "HS-QA-PUB",
            fullName: "Published Student",
            classId: cls.id,
          });
          await studentService.recordGrade({
            studentId: pubStu.id,
            assessmentTitle: "Final Exam",
            date: "2026-11-20",
            listening: 8.0,
            reading: 8.0,
            writing: 8.0,
            speaking: 8.0,
            status: "published",
          });
          await studentService.recordGrade({
            studentId: pubStu.id,
            assessmentTitle: "Backfill Entry Test",
            date: "2026-10-01",
            listening: 5.0,
            reading: 5.0,
            writing: 5.0,
            speaking: 5.0,
            status: "published",
          });

          const refreshedPub = await studentService.getStudentById(pubStu.id);
          assert.equal(refreshedPub.averageScore, 8.0);

          const draftStu = await studentService.createStudent({
            code: "HS-QA-DRAFT",
            fullName: "Draft Only Student",
            classId: cls.id,
          });
          await studentService.recordGrade({
            studentId: draftStu.id,
            assessmentTitle: "Draft Exam",
            date: "2026-11-21",
            listening: 4.0,
            reading: 4.0,
            writing: 4.0,
            speaking: 4.0,
            status: "draft",
          });

          const hydratedCls = await classroomService.getClassroomById(cls.id);
          assert.equal(hydratedCls.averageScore, 8.0);

          const alerts = getStudentAcademicAlerts(
            await studentService.getStudentById(draftStu.id),
          );
          assert.ok(alerts.some((a) => a.type === "no-grades"));
        });

        it("[BUG-10 DB FIXED] student/tuition validation handles 0 VND, unknown classId, discount > base, invalid dueDate, and archived destination", async () => {
          await assert.rejects(
            () =>
              studentService.createStudent({
                code: "HS-BAD-CLS",
                fullName: "Bad Class",
                classId: "cls-does-not-exist",
              }),
            NotFoundError,
          );

          const zeroStu = await studentService.createStudent({
            code: "HS-ZERO-VND",
            fullName: "Zero Tuition",
            classId: "cls-ii-01",
            tuitionAmount: "0",
          });
          assert.equal(zeroStu.tuitionAmount, "0 ₫");

          await assert.rejects(
            () =>
              studentService.recordTuitionPayment(zeroStu.id, {
                period: "Tháng 11",
                baseAmount: 1_000_000,
                discountAmount: 1_500_000,
                paidAmount: 0,
                dueDate: "2026-11-30",
              }),
            ValidationError,
          );

          await assert.rejects(
            () =>
              studentService.recordTuitionPayment(zeroStu.id, {
                period: "Tháng 11",
                baseAmount: 1_000_000,
                discountAmount: 0,
                paidAmount: 500_000,
                dueDate: "99/99/2026",
              }),
            ValidationError,
          );

          const okDdMmYyyy = await studentService.recordTuitionPayment(zeroStu.id, {
            period: "Tháng 11",
            baseAmount: 1_000_000,
            discountAmount: 0,
            paidAmount: 1_000_000,
            dueDate: "25/11/2026",
          });
          assert.equal(okDdMmYyyy.payment.dueDate, "2026-11-25");

          const archCls = await classroomService.createClassroom({
            code: "QA-ARCH-DEST",
            name: "Archived Dest Class",
          });
          await classroomService.archiveClassroom(archCls.id);
          await assert.rejects(
            () =>
              studentService.updateStudent(zeroStu.id, {
                classId: archCls.id,
              }),
            ValidationError,
          );
        });

        it("[BUG-13 DB FIXED] batchRecordGrades rolls back atomically on partial failure", async () => {
          const activeStudents = await studentService.listAllStudents({
            status: "active",
          });
          const s1 = activeStudents[0];
          assert.ok(s1);
          const title = "Atomic Fail Check DB";

          await assert.rejects(
            () =>
              studentService.batchRecordGrades({
                assessmentTitle: title,
                entries: [
                  {
                    studentId: s1.id,
                    listening: 7.5,
                    reading: 7.5,
                    writing: 7.5,
                    speaking: 7.5,
                  },
                  {
                    studentId: "stu-non-existent-xyz",
                    listening: 6.0,
                    reading: 6.0,
                    writing: 6.0,
                    speaking: 6.0,
                  },
                ],
              }),
            NotFoundError,
          );

          const reloadedS1 = await studentService.getStudentById(s1.id);
          assert.equal(
            reloadedS1.grades.some((g) => g.assessmentTitle === title),
            false,
          );
        });

        it("[BUG-17 DB FIXED] addClassroomMaterial rejects archived class & weekNumber 0", async () => {
          const activeClasses = await classroomService.listClassrooms();
          const targetClass = activeClasses[0];
          assert.ok(targetClass);

          const archCls = await classroomService.createClassroom({
            code: "QA-MAT-ARCH",
            name: "Archived Materials Class",
          });
          await classroomService.archiveClassroom(archCls.id);

          await assert.rejects(
            () =>
              classroomService.addClassroomMaterial(archCls.id, 1, {
                id: "att-arch",
                name: "Archived File",
                url: "/files/arch.pdf",
                size: "1 MB",
                type: "PDF",
                uploadedAt: "21/11/2026",
              }),
            { name: "ValidationError" },
          );

          await assert.rejects(
            () =>
              classroomService.addClassroomMaterial(targetClass.id, 0, {
                id: "att-w0",
                name: "Week Zero File",
                url: "/files/week0.pdf",
                size: "1 MB",
                type: "PDF",
                uploadedAt: "21/11/2026",
              }),
            { name: "ValidationError" },
          );
        });

        it("[BUG-25 DB FIXED] recordTuitionPayment generates unique receipt codes", async () => {
          const activeStudents = await studentService.listAllStudents({
            status: "active",
          });
          const stu = activeStudents[0];
          assert.ok(stu);

          const p1 = await studentService.recordTuitionPayment(stu.id, {
            period: "Tháng 09/2026",
            baseAmount: 500_000,
            discountAmount: 0,
            paidAmount: 500_000,
            dueDate: "2026-09-30",
          });
          const p2 = await studentService.recordTuitionPayment(stu.id, {
            period: "Tháng 10/2026",
            baseAmount: 500_000,
            discountAmount: 0,
            paidAmount: 500_000,
            dueDate: "2026-10-31",
          });
          assert.ok(p1.payment.receiptCode);
          assert.ok(p2.payment.receiptCode);
          assert.notEqual(p1.payment.receiptCode, p2.payment.receiptCode);
        });

        it("[BUG-DB] updateResourceFile rejects missing folderId without mutating oldFolder.itemCount", async () => {
          const files = await storageService.listResourceFiles();
          const targetFile = files[0];
          assert.ok(targetFile);
          const foldersBefore = await storageService.listResourceFolders();
          const oldFolder = foldersBefore.find(
            (f) => f.id === targetFile.folderId,
          );
          assert.ok(oldFolder);
          const countBefore = oldFolder.itemCount;

          await assert.rejects(
            () =>
              storageService.updateResourceFile(targetFile.id, {
                folderId: "fld-does-not-exist",
              }),
            { name: "NotFoundError" },
          );

          const foldersAfter = await storageService.listResourceFolders();
          const unchangedFolder = foldersAfter.find(
            (f) => f.id === oldFolder.id,
          );
          assert.equal(unchangedFolder?.itemCount, countBefore);

          const filesAfter = await storageService.listResourceFiles();
          const unchangedFile = filesAfter.find((f) => f.id === targetFile.id);
          assert.equal(unchangedFile?.folderId, oldFolder.id);
        });

        it("[BUG-18 DB FIXED] HoF periodLabel uses current year/month", async () => {
          const now = new Date();
          const created = await cmsService.createHallOfFameEntry({
            displayName: "Nguyễn Dynamic QA",
            rank: 2,
            period: "week",
            headlineMetric: "8.0 IELTS",
            badgeTitle: "Weekly Top",
          });
          assert.ok(created.periodLabel.includes(String(now.getFullYear())));
        });

        it("[BUG-20 FIXED] recommendTop3Students returns unique active students and updateHallOfFameEntry guards duplicate month+rank", async () => {
          const first = await prisma.student.findFirstOrThrow({
            where: { status: "active", deletedAt: null },
            orderBy: { id: "asc" },
          });
          await prisma.student.updateMany({
            where: { id: { not: first.id } },
            data: { status: "archived" },
          });

          const recs = await cmsService.recommendTop3Students();
          assert.equal(recs.length, 1);
          const ids = recs.map((r) => r.studentId);
          assert.equal(new Set(ids).size, ids.length);

          const entry1 = await cmsService.createHallOfFameEntry({
            displayName: "Unique Rank One",
            rank: 1,
            period: "month",
            periodLabel: "Tháng 08/2026",
            headlineMetric: "8.5 IELTS",
            badgeTitle: "Top 1",
          });
          const entry2 = await cmsService.createHallOfFameEntry({
            displayName: "Unique Rank Two",
            rank: 2,
            period: "month",
            periodLabel: "Tháng 08/2026",
            headlineMetric: "8.0 IELTS",
            badgeTitle: "Top 2",
          });
          await assert.rejects(
            () =>
              cmsService.updateHallOfFameEntry(entry2.id, {
                rank: 1,
              }),
            { name: "ConflictError" },
          );
          assert.equal(entry1.rank, 1);
        });

        it("[BUG-21 FIXED] getPublicOverviewData strips internal capacity, enrolledCount and conflict flags from schedule", async () => {
          const overview = await getPublicOverviewData(new Date("2026-11-18T10:00:00Z"));
          assert.ok(overview.schedule.length > 0);
          const firstSession = overview.schedule[0] as unknown as Record<string, unknown>;

          assert.equal("enrolledCount" in firstSession, false);
          assert.equal("capacity" in firstSession, false);
          assert.equal("hasConflict" in firstSession, false);
        });

        it("[BUG-07 DB FIXED] recordAttendance without classId rejects archived and non-existent ghost studentIds", async () => {
          const activeStudents = await studentService.listAllStudents({
            status: "active",
          });
          const targetStu = activeStudents[0];
          assert.ok(targetStu);
          await studentService.archiveStudent(targetStu.id);

          const sessions = await scheduleService.listWeeklySchedule();
          assert.ok(sessions.length > 0);

          await assert.rejects(
            () =>
              scheduleService.recordAttendance({
                sessionId: sessions[0].id,
                date: "2026-11-18",
                entries: [{ studentId: targetStu.id, status: "present" }],
              }),
            ValidationError,
          );

          await assert.rejects(
            () =>
              scheduleService.recordAttendance({
                sessionId: sessions[0].id,
                date: "2026-11-18",
                entries: [{ studentId: "ghost-student-999", status: "present" }],
              }),
            NotFoundError,
          );
        });

        it("[BUG-13b DB FIXED] getClassAttendanceMatrix keeps same-day sessions distinct", async () => {
          const cls = await classroomService.createClassroom({
            code: "QA-2SES",
            name: "Two Sessions One Day",
          });
          const testDate = "2026-11-28";
          const morning = await createOrGenerateClassSession({
            classId: cls.id,
            date: testDate,
            startTime: "08:00",
            endTime: "10:00",
            topic: "Morning Session",
          });
          await new Promise((resolve) => setTimeout(resolve, 5));
          const evening = await createOrGenerateClassSession({
            classId: cls.id,
            date: testDate,
            startTime: "18:00",
            endTime: "20:00",
            topic: "Evening Session",
          });
          assert.notEqual(morning.id, evening.id);

          const matrix = await scheduleService.getClassAttendanceMatrix({
            classId: cls.id,
            fromDate: testDate,
            toDate: testDate,
          });
          assert.equal(matrix.columns.length, 2);
        });

        it("[BUG-17b DB FIXED] enrollStudents updates roster and deleteClassSession reverts completed week", async () => {
          const sessions = await scheduleService.listWeeklySchedule();
          const targetSession = sessions[0];
          assert.ok(targetSession);

          const allClasses = await classroomService.listClassrooms();
          const targetClass = allClasses.find(
            (c) =>
              c.code.toUpperCase() === targetSession.classCode.toUpperCase(),
          );
          assert.ok(targetClass);
          const sourceClass = allClasses.find((c) => c.id !== targetClass.id);
          assert.ok(sourceClass);

          const newStu = await studentService.createStudent({
            code: "HS-ENROLL-QA",
            fullName: "Học Viên Ghi Danh QA",
            classId: sourceClass.id,
          });

          await scheduleService.enrollStudents({
            sessionId: targetSession.id,
            studentIds: [newStu.id],
          });
          const enrolledStu = await studentService.getStudentById(newStu.id);
          assert.equal(enrolledStu.classId, targetClass.id);

          const tempSession =
            await teachingJournalService.createOrGenerateClassSession({
              classId: targetClass.id,
              date: "2026-12-19",
              startTime: "14:00",
              endTime: "16:00",
              weekNumber: 2,
            });
          await teachingJournalService.updateClassSession(tempSession.id, {
            journalStatus: "completed",
            completionResult: "completed",
            syncCurriculumWeek: true,
          });
          const clsBeforeDelete = await classroomService.getClassroomById(
            targetClass.id,
          );
          const weekBeforeDelete = clsBeforeDelete.curriculum?.find(
            (w) => w.weekNumber === 2,
          );
          assert.equal(weekBeforeDelete?.status, "completed");

          await teachingJournalService.deleteClassSession(tempSession.id);
          const clsAfterDelete = await classroomService.getClassroomById(
            targetClass.id,
          );
          const weekAfterDelete = clsAfterDelete.curriculum?.find(
            (w) => w.weekNumber === 2,
          );
          assert.equal(weekAfterDelete?.status, "in-progress");
          assert.equal(weekAfterDelete?.completedDate, undefined);
        });

        it("[BUG-18b DB FIXED] analytics respects custom lowAttendanceThresholdPercent", async () => {
          await settingsService.updateSystemSettings({
            lowAttendanceThresholdPercent: 99,
          });
          const activeStudents = await studentService.listAllStudents({
            status: "active",
          });
          const stu = activeStudents[0];
          assert.ok(stu);

          await prisma.student.update({
            where: { id: stu.id },
            data: { attendanceRate: 50 },
          });
          await prisma.attendanceRecord.create({
            data: {
              id: "att-qa-low-1",
              studentId: stu.id,
              classroomId: stu.classId,
              date: "2026-11-12",
              sessionName: "Buổi 2",
              status: "absent",
            },
          });

          const report =
            await teachingJournalService.getClassPerformanceAnalytics({
              classId: stu.classId,
            });
          assert.ok(
            report.studentSpotlights.atRiskStudents.some(
              (item) => item.studentId === stu.id,
            ),
          );
        });

        it("[BUG-22 DB FIXED] updateClassSession caps revisions history at 50 entries", async () => {
          const sessions = await teachingJournalService.listClassSessions();
          const targetSession = sessions[0];
          assert.ok(targetSession);
          await teachingJournalService.updateClassSession(targetSession.id, {
            journalStatus: "draft",
          });

          for (let i = 0; i < 55; i += 1) {
            await teachingJournalService.updateClassSession(targetSession.id, {
              topic: `Topic revision #${i}`,
            });
          }

          const updated = await teachingJournalService.getClassSessionById(
            targetSession.id,
          );
          assert.ok((updated.revisions?.length ?? 0) <= 50);
        });

        it("[BUG-25b DB FIXED] generates collision-resistant UUID session IDs", async () => {
          const classes = await classroomService.listClassrooms();
          const clsA = classes[0];
          const clsB = classes[1];
          assert.ok(clsA && clsB);

          const [sesA, sesB] = await Promise.all([
            createOrGenerateClassSession({
              classId: clsA.id,
              date: "2026-12-26",
              startTime: "09:00",
              endTime: "11:00",
            }),
            createOrGenerateClassSession({
              classId: clsB.id,
              date: "2026-12-26",
              startTime: "09:00",
              endTime: "11:00",
            }),
          ]);
          assert.notEqual(sesA.id, sesB.id);
          assert.match(sesA.id, /-[0-9a-f]{8}$/);
          assert.match(sesB.id, /-[0-9a-f]{8}$/);
        });
      },
    );
  });
});
