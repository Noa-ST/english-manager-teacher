-- =============================================================================
--  Supabase PostgreSQL Row Level Security (RLS) Policies
--  Covers ALL tables defined in src/prisma/schema.prisma.
--  Default posture: DENY ALL unless explicitly authorized by auth.uid() & role.
--  Note: Prisma server-side connections using the PostgreSQL owner/service role
--  bypass RLS automatically; these policies lock down PostgREST / anon / auth clients.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.is_active = true
  );
$$;

-- 1. Enable & force RLS on EVERY table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TeacherSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Classroom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CurriculumWeek" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CurriculumWeekAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CurriculumTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GradeRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AttendanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TuitionPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CommunicationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassTransferHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GradeChangeHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuthRateLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AnnouncementAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PodcastEpisode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HallOfFameEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ResourceFolder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ResourceFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stored_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaching_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_student_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_revision_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attachment_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_alert_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orphaned_storage_files ENABLE ROW LEVEL SECURITY;

-- 2. Profiles: owner can read own profile; admin can read/manage all
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_active_admin());

DROP POLICY IF EXISTS profiles_admin_write ON public.profiles;
CREATE POLICY profiles_admin_write ON public.profiles
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

-- 3. Student & student-scoped tables: student reads ONLY own rows; admin manages all
DROP POLICY IF EXISTS student_self_or_admin_select ON public."Student";
CREATE POLICY student_self_or_admin_select ON public."Student"
  FOR SELECT USING (
    public.is_active_admin()
    OR (profile_id = auth.uid() AND status <> 'archived' AND "deletedAt" IS NULL)
  );

DROP POLICY IF EXISTS student_admin_write ON public."Student";
CREATE POLICY student_admin_write ON public."Student"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS grade_self_or_admin_select ON public."GradeRecord";
CREATE POLICY grade_self_or_admin_select ON public."GradeRecord"
  FOR SELECT USING (
    public.is_active_admin()
    OR (
      status = 'published'
      AND EXISTS (
        SELECT 1 FROM public."Student" s
        WHERE s.id = "GradeRecord"."studentId"
          AND s.profile_id = auth.uid()
          AND s.status <> 'archived'
          AND s."deletedAt" IS NULL
      )
    )
  );

DROP POLICY IF EXISTS grade_admin_write ON public."GradeRecord";
CREATE POLICY grade_admin_write ON public."GradeRecord"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS attendance_self_or_admin_select ON public."AttendanceRecord";
CREATE POLICY attendance_self_or_admin_select ON public."AttendanceRecord"
  FOR SELECT USING (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1 FROM public."Student" s
      WHERE s.id = "AttendanceRecord"."studentId"
        AND s.profile_id = auth.uid()
        AND s.status <> 'archived'
        AND s."deletedAt" IS NULL
    )
  );

DROP POLICY IF EXISTS attendance_admin_write ON public."AttendanceRecord";
CREATE POLICY attendance_admin_write ON public."AttendanceRecord"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS tuition_self_or_admin_select ON public."TuitionPayment";
CREATE POLICY tuition_self_or_admin_select ON public."TuitionPayment"
  FOR SELECT USING (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1 FROM public."Student" s
      WHERE s.id = "TuitionPayment"."studentId"
        AND s.profile_id = auth.uid()
        AND s.status <> 'archived'
        AND s."deletedAt" IS NULL
    )
  );

DROP POLICY IF EXISTS tuition_admin_write ON public."TuitionPayment";
CREATE POLICY tuition_admin_write ON public."TuitionPayment"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS eval_self_or_admin_select ON public.session_student_evaluations;
CREATE POLICY eval_self_or_admin_select ON public.session_student_evaluations
  FOR SELECT USING (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1 FROM public."Student" s
      WHERE s.id = session_student_evaluations.student_id
        AND s.profile_id = auth.uid()
        AND s.status <> 'archived'
        AND s."deletedAt" IS NULL
    )
  );

DROP POLICY IF EXISTS eval_admin_write ON public.session_student_evaluations;
CREATE POLICY eval_admin_write ON public.session_student_evaluations
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

-- 4. Classroom & Enrolled Student Class Materials
DROP POLICY IF EXISTS classroom_enrolled_or_admin_select ON public."Classroom";
CREATE POLICY classroom_enrolled_or_admin_select ON public."Classroom"
  FOR SELECT USING (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1 FROM public."Student" s
      WHERE s."classroomId" = "Classroom".id
        AND s.profile_id = auth.uid()
        AND s.status <> 'archived'
        AND s."deletedAt" IS NULL
    )
  );

DROP POLICY IF EXISTS classroom_admin_write ON public."Classroom";
CREATE POLICY classroom_admin_write ON public."Classroom"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

-- 5. Public Published Content (strictly filtered by status = 'published' or visibility = 'public')
DROP POLICY IF EXISTS announcement_public_select ON public."Announcement";
CREATE POLICY announcement_public_select ON public."Announcement"
  FOR SELECT USING (status = 'published' OR public.is_active_admin());

DROP POLICY IF EXISTS announcement_admin_write ON public."Announcement";
CREATE POLICY announcement_admin_write ON public."Announcement"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS announcement_att_public_select ON public."AnnouncementAttachment";
CREATE POLICY announcement_att_public_select ON public."AnnouncementAttachment"
  FOR SELECT USING (
    public.is_active_admin()
    OR EXISTS (
      SELECT 1 FROM public."Announcement" a
      WHERE a.id = "AnnouncementAttachment"."announcementId" AND a.status = 'published'
    )
  );

DROP POLICY IF EXISTS announcement_att_admin_write ON public."AnnouncementAttachment";
CREATE POLICY announcement_att_admin_write ON public."AnnouncementAttachment"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS podcast_public_select ON public."PodcastEpisode";
CREATE POLICY podcast_public_select ON public."PodcastEpisode"
  FOR SELECT USING (status = 'published' OR public.is_active_admin());

DROP POLICY IF EXISTS podcast_admin_write ON public."PodcastEpisode";
CREATE POLICY podcast_admin_write ON public."PodcastEpisode"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS hof_public_select ON public."HallOfFameEntry";
CREATE POLICY hof_public_select ON public."HallOfFameEntry"
  FOR SELECT USING (auth.role() IN ('anon', 'authenticated') OR public.is_active_admin());

DROP POLICY IF EXISTS hof_admin_write ON public."HallOfFameEntry";
CREATE POLICY hof_admin_write ON public."HallOfFameEntry"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS project_public_select ON public."StudentProject";
CREATE POLICY project_public_select ON public."StudentProject"
  FOR SELECT USING (status = 'published' OR public.is_active_admin());

DROP POLICY IF EXISTS project_admin_write ON public."StudentProject";
CREATE POLICY project_admin_write ON public."StudentProject"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS folder_public_select ON public."ResourceFolder";
CREATE POLICY folder_public_select ON public."ResourceFolder"
  FOR SELECT USING (visibility = 'public' OR public.is_active_admin());

DROP POLICY IF EXISTS folder_admin_write ON public."ResourceFolder";
CREATE POLICY folder_admin_write ON public."ResourceFolder"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS resource_file_public_select ON public."ResourceFile";
CREATE POLICY resource_file_public_select ON public."ResourceFile"
  FOR SELECT USING ((visibility = 'public' AND "deletedAt" IS NULL) OR public.is_active_admin());

DROP POLICY IF EXISTS resource_file_admin_write ON public."ResourceFile";
CREATE POLICY resource_file_admin_write ON public."ResourceFile"
  FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

-- 6. Admin-only internal & operational tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'TeacherSetting',
    'settings_audit_logs',
    'CurriculumWeek',
    'CurriculumWeekAttachment',
    'CurriculumTemplate',
    'ClassSession',
    'schedule_exceptions',
    'assessment_catalogs',
    'CommunicationLog',
    'ClassTransferHistory',
    'GradeChangeHistory',
    'AuthRateLimit',
    'stored_files',
    'teaching_journal_entries',
    'journal_revision_logs',
    'session_attachment_files',
    'analytics_alert_acks',
    'storage_audit_logs',
    'orphaned_storage_files'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_only_all ON public.%I;', tbl);
    EXECUTE format(
      'CREATE POLICY admin_only_all ON public.%I FOR ALL USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());',
      tbl
    );
  END LOOP;
END $$;
