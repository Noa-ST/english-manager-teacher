-- =============================================================================
-- ENGLISH MANAGER — TWO-ROLE RBAC & ROW LEVEL SECURITY (RLS) MIGRATION
-- Roles: 'admin' (Teacher) | 'student' (Student)
-- Target: Supabase PostgreSQL (linked to auth.users)
-- =============================================================================

BEGIN;

-- 1. PROFILES TABLE (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  avatar_url text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON public.profiles(role, is_active);

-- 2. LINK PROFILE_ID ON STUDENTS TABLE (1:1 Account-to-Student Binding)
-- If students table is managed via Prisma, this safely adds the FK column if missing.
ALTER TABLE IF EXISTS public."Student"
  ADD COLUMN IF NOT EXISTS profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_profile_id ON public."Student"(profile_id);

-- 3. SECURITY DEFINER HELPERS (Avoids RLS infinite recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id
  FROM public."Student" s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.id = auth.uid()
    AND p.role = 'student'
    AND p.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_student_classroom_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s."classroomId"
  FROM public."Student" s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.id = auth.uid()
    AND p.role = 'student'
    AND p.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_student_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_student_classroom_id() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_student_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_student_classroom_id() TO authenticated;

-- 4. ROLE-ESCALATION PROTECTION TRIGGER ON PROFILES
CREATE OR REPLACE FUNCTION public.guard_profile_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Service role / postgres superuser or verified admin may change role/is_active
  IF current_user IN ('postgres', 'service_role') OR public.is_admin() THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Forbidden: role cannot be modified by non-admin users';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Forbidden: is_active cannot be modified by non-admin users';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privilege_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privilege_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privilege_columns();

-- 5. ENABLE ROW LEVEL SECURITY ON SENSITIVE TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."GradeRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AttendanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ClassSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Classroom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ResourceFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stored_files ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES — PROFILES
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles_student_select_own" ON public.profiles;
CREATE POLICY "profiles_student_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() AND is_active = true);

DROP POLICY IF EXISTS "profiles_student_update_own" ON public.profiles;
CREATE POLICY "profiles_student_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() AND is_active = true)
  WITH CHECK (id = auth.uid() AND role = 'student');

-- 7. RLS POLICIES — STUDENT
DROP POLICY IF EXISTS "student_admin_all" ON public."Student";
CREATE POLICY "student_admin_all"
  ON public."Student"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "student_select_own" ON public."Student";
CREATE POLICY "student_select_own"
  ON public."Student"
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- 8. RLS POLICIES — GRADE RECORDS
DROP POLICY IF EXISTS "grades_admin_all" ON public."GradeRecord";
CREATE POLICY "grades_admin_all"
  ON public."GradeRecord"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "grades_student_select_own" ON public."GradeRecord";
CREATE POLICY "grades_student_select_own"
  ON public."GradeRecord"
  FOR SELECT
  TO authenticated
  USING ("studentId" = public.current_student_id());

-- 9. RLS POLICIES — ATTENDANCE RECORDS
DROP POLICY IF EXISTS "attendance_admin_all" ON public."AttendanceRecord";
CREATE POLICY "attendance_admin_all"
  ON public."AttendanceRecord"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "attendance_student_select_own" ON public."AttendanceRecord";
CREATE POLICY "attendance_student_select_own"
  ON public."AttendanceRecord"
  FOR SELECT
  TO authenticated
  USING ("studentId" = public.current_student_id());

-- 10. RLS POLICIES — CLASS SESSIONS & CLASSROOMS
DROP POLICY IF EXISTS "sessions_admin_all" ON public."ClassSession";
CREATE POLICY "sessions_admin_all"
  ON public."ClassSession"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sessions_student_select_own_class" ON public."ClassSession";
CREATE POLICY "sessions_student_select_own_class"
  ON public."ClassSession"
  FOR SELECT
  TO authenticated
  USING ("classroomId" = public.current_student_classroom_id());

DROP POLICY IF EXISTS "classroom_admin_all" ON public."Classroom";
CREATE POLICY "classroom_admin_all"
  ON public."Classroom"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "classroom_student_select_own" ON public."Classroom";
CREATE POLICY "classroom_student_select_own"
  ON public."Classroom"
  FOR SELECT
  TO authenticated
  USING (id = public.current_student_classroom_id());

-- 11. RLS POLICIES — ANNOUNCEMENTS
DROP POLICY IF EXISTS "announcements_admin_all" ON public."Announcement";
CREATE POLICY "announcements_admin_all"
  ON public."Announcement"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "announcements_public_published" ON public."Announcement";
CREATE POLICY "announcements_public_published"
  ON public."Announcement"
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- 12. RLS POLICIES — RESOURCE FILES & STORED FILES
DROP POLICY IF EXISTS "resource_admin_all" ON public."ResourceFile";
CREATE POLICY "resource_admin_all"
  ON public."ResourceFile"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "resource_public_or_authorized" ON public."ResourceFile";
CREATE POLICY "resource_public_or_authorized"
  ON public."ResourceFile"
  FOR SELECT
  TO anon, authenticated
  USING (
    "deletedAt" IS NULL
    AND (
      visibility = 'public'
      OR (auth.uid() IS NOT NULL AND "ownerId" = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "stored_files_admin_all" ON public.stored_files;
CREATE POLICY "stored_files_admin_all"
  ON public.stored_files
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "stored_files_student_select_allowed" ON public.stored_files;
CREATE POLICY "stored_files_student_select_allowed"
  ON public.stored_files
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (is_public = true OR owner_id = auth.uid()::text)
  );

COMMIT;

