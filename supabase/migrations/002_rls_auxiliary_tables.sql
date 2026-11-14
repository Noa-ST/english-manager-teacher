-- =============================================================================
-- ENGLISH MANAGER — RLS MIGRATION FOR AUXILIARY TABLES
-- Covers: TeacherSetting, AnnouncementAttachment, PodcastEpisode,
--         HallOfFameEntry, StudentProject, ResourceFolder
-- =============================================================================

BEGIN;

-- 1. Enable RLS
ALTER TABLE IF EXISTS public."TeacherSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AnnouncementAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."PodcastEpisode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."HallOfFameEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."StudentProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ResourceFolder" ENABLE ROW LEVEL SECURITY;

-- 2. TeacherSetting Policies
DROP POLICY IF EXISTS "teacher_setting_admin_all" ON public."TeacherSetting";
CREATE POLICY "teacher_setting_admin_all"
  ON public."TeacherSetting"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "teacher_setting_public_read" ON public."TeacherSetting";
CREATE POLICY "teacher_setting_public_read"
  ON public."TeacherSetting"
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 3. AnnouncementAttachment Policies
DROP POLICY IF EXISTS "attachments_admin_all" ON public."AnnouncementAttachment";
CREATE POLICY "attachments_admin_all"
  ON public."AnnouncementAttachment"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "attachments_public_select" ON public."AnnouncementAttachment";
CREATE POLICY "attachments_public_select"
  ON public."AnnouncementAttachment"
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4. PodcastEpisode Policies
DROP POLICY IF EXISTS "podcast_admin_all" ON public."PodcastEpisode";
CREATE POLICY "podcast_admin_all"
  ON public."PodcastEpisode"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "podcast_public_published" ON public."PodcastEpisode";
CREATE POLICY "podcast_public_published"
  ON public."PodcastEpisode"
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- 5. HallOfFameEntry Policies
DROP POLICY IF EXISTS "hall_of_fame_admin_all" ON public."HallOfFameEntry";
CREATE POLICY "hall_of_fame_admin_all"
  ON public."HallOfFameEntry"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "hall_of_fame_public_select" ON public."HallOfFameEntry";
CREATE POLICY "hall_of_fame_public_select"
  ON public."HallOfFameEntry"
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 6. StudentProject Policies
DROP POLICY IF EXISTS "student_projects_admin_all" ON public."StudentProject";
CREATE POLICY "student_projects_admin_all"
  ON public."StudentProject"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "student_projects_public_select" ON public."StudentProject";
CREATE POLICY "student_projects_public_select"
  ON public."StudentProject"
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- 7. ResourceFolder Policies
DROP POLICY IF EXISTS "resource_folder_admin_all" ON public."ResourceFolder";
CREATE POLICY "resource_folder_admin_all"
  ON public."ResourceFolder"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "resource_folder_select_own_or_public" ON public."ResourceFolder";
CREATE POLICY "resource_folder_select_own_or_public"
  ON public."ResourceFolder"
  FOR SELECT
  TO authenticated
  USING (
    visibility = 'public'
    OR (auth.uid() IS NOT NULL AND "ownerId" = auth.uid()::text)
    OR public.is_admin()
  );

COMMIT;

