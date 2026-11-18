-- =============================================================================
-- ENGLISH MANAGER — AUDIT TRAIL, RATE LIMITING & CLASS CONSISTENCY
-- Migration 003: ClassTransferHistory, GradeChangeHistory, AuthRateLimit & RLS
-- Target: Supabase PostgreSQL
-- =============================================================================

BEGIN;

-- 1. CLASS TRANSFER HISTORY (Audit Trail: Who moved which student, when and why)
CREATE TABLE IF NOT EXISTS public."ClassTransferHistory" (
  id text PRIMARY KEY DEFAULT ('cth_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
  "studentId" text NOT NULL REFERENCES public."Student"(id) ON DELETE CASCADE,
  "oldClassId" text NOT NULL,
  "newClassId" text NOT NULL,
  "changedBy" text NOT NULL DEFAULT 'admin',
  "changedAt" timestamptz NOT NULL DEFAULT now(),
  reason text
);

CREATE INDEX IF NOT EXISTS idx_class_transfer_student ON public."ClassTransferHistory"("studentId");
CREATE INDEX IF NOT EXISTS idx_class_transfer_changed_at ON public."ClassTransferHistory"("changedAt");

-- 2. GRADE CHANGE HISTORY (Audit Trail: Preserves score adjustments / re-grading)
CREATE TABLE IF NOT EXISTS public."GradeChangeHistory" (
  id text PRIMARY KEY DEFAULT ('gch_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
  "studentId" text NOT NULL REFERENCES public."Student"(id) ON DELETE CASCADE,
  "gradeRecordId" text REFERENCES public."GradeRecord"(id) ON DELETE SET NULL,
  "assessmentTitle" text NOT NULL,
  "oldScore" double precision NOT NULL,
  "newScore" double precision NOT NULL,
  "changedBy" text NOT NULL DEFAULT 'admin',
  "changedAt" timestamptz NOT NULL DEFAULT now(),
  reason text
);

CREATE INDEX IF NOT EXISTS idx_grade_change_student ON public."GradeChangeHistory"("studentId");
CREATE INDEX IF NOT EXISTS idx_grade_change_record ON public."GradeChangeHistory"("gradeRecordId");
CREATE INDEX IF NOT EXISTS idx_grade_change_changed_at ON public."GradeChangeHistory"("changedAt");

-- 3. AUTH RATE LIMITS TABLE (Persistent, Multi-Instance Brute-Force Defense)
CREATE TABLE IF NOT EXISTS public."AuthRateLimit" (
  id text PRIMARY KEY DEFAULT ('arl_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
  identifier text NOT NULL UNIQUE,
  "failedAttempts" integer NOT NULL DEFAULT 1,
  "firstFailedAt" timestamptz NOT NULL DEFAULT now(),
  "lastFailedAt" timestamptz NOT NULL DEFAULT now(),
  "lockedUntil" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_identifier ON public."AuthRateLimit"(identifier);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_locked ON public."AuthRateLimit"("lockedUntil");

-- 4. ROW LEVEL SECURITY (RLS) FOR NEW TABLES
ALTER TABLE public."ClassTransferHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GradeChangeHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuthRateLimit" ENABLE ROW LEVEL SECURITY;

-- ClassTransferHistory: Admins full control; Students may only read their own transfers
DROP POLICY IF EXISTS "class_transfer_admin_all" ON public."ClassTransferHistory";
CREATE POLICY "class_transfer_admin_all"
  ON public."ClassTransferHistory"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "class_transfer_student_select" ON public."ClassTransferHistory";
CREATE POLICY "class_transfer_student_select"
  ON public."ClassTransferHistory"
  FOR SELECT
  TO authenticated
  USING ("studentId" = public.current_student_id());

-- GradeChangeHistory: Admins full control; Students may only read their own grade adjustments
DROP POLICY IF EXISTS "grade_change_admin_all" ON public."GradeChangeHistory";
CREATE POLICY "grade_change_admin_all"
  ON public."GradeChangeHistory"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "grade_change_student_select" ON public."GradeChangeHistory";
CREATE POLICY "grade_change_student_select"
  ON public."GradeChangeHistory"
  FOR SELECT
  TO authenticated
  USING ("studentId" = public.current_student_id());

-- AuthRateLimit: Managed strictly by server / service_role
DROP POLICY IF EXISTS "rate_limits_admin_all" ON public."AuthRateLimit";
CREATE POLICY "rate_limits_admin_all"
  ON public."AuthRateLimit"
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. RECONCILIATION FUNCTION: Recalculate Class.enrolled from Ground Truth
CREATE OR REPLACE FUNCTION public.sync_classroom_enrolled(target_class_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF target_class_id IS NOT NULL THEN
    UPDATE public."Classroom" c
    SET enrolled = (
      SELECT COUNT(*)::int
      FROM public."Student" s
      WHERE s."classroomId" = c.id
        AND s.status = 'active'
        AND s."deletedAt" IS NULL
    )
    WHERE c.id = target_class_id;
  ELSE
    UPDATE public."Classroom" c
    SET enrolled = (
      SELECT COUNT(*)::int
      FROM public."Student" s
      WHERE s."classroomId" = c.id
        AND s.status = 'active'
        AND s."deletedAt" IS NULL
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_classroom_enrolled(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_classroom_enrolled(text) TO authenticated;

COMMIT;
