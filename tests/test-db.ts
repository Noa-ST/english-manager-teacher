import fs from "node:fs";
import path from "node:path";

import { disconnectPrisma, prisma } from "@/lib/db/prisma";
import { seedDatabase } from "@/services/seed.service";

function loadTestEnvFromDotEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadTestEnvFromDotEnv();

export function hasTestDatabase(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL?.trim());
}

function assertSafeTestDatabaseUrl(url: string): void {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error(`Invalid TEST_DATABASE_URL: "${url}"`);
  }
  const isRemoteSupabase =
    hostname.endsWith("supabase.co") || hostname.endsWith("supabase.com");
  if (isRemoteSupabase && process.env.ALLOW_REMOTE_TEST_DB_RESET !== "true") {
    throw new Error(
      `Refusing to truncate remote database "${hostname}" during tests. Point TEST_DATABASE_URL to a local PostgreSQL test DB or set ALLOW_REMOTE_TEST_DB_RESET=true explicitly.`,
    );
  }
}

export async function resetAndSeedTestDatabase(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required to reset and seed the test database.");
  }
  assertSafeTestDatabaseUrl(url);

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      public.settings_audit_logs,
      public.analytics_alert_acks,
      public.storage_audit_logs,
      public.orphaned_storage_files,
      public.journal_revision_logs,
      public.session_attachment_files,
      public.session_student_evaluations,
      public.teaching_journal_entries,
      public."AnnouncementAttachment",
      public."Announcement",
      public."PodcastEpisode",
      public."HallOfFameEntry",
      public."StudentProject",
      public."ResourceFile",
      public."ResourceFolder",
      public."GradeChangeHistory",
      public."ClassTransferHistory",
      public."CommunicationLog",
      public."TuitionPayment",
      public."AttendanceRecord",
      public."GradeRecord",
      public.assessment_catalogs,
      public."Student",
      public.schedule_exceptions,
      public."ClassSession",
      public."CurriculumWeekAttachment",
      public."CurriculumWeek",
      public."CurriculumTemplate",
      public."Classroom",
      public.stored_files,
      public."TeacherSetting",
      public."AuthRateLimit"
    RESTART IDENTITY CASCADE;
  `);

  await seedDatabase(prisma);
}

export async function teardownTestDatabase(): Promise<void> {
  await disconnectPrisma();
}
