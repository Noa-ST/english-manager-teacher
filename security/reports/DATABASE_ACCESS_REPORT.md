# DATABASE_ACCESS Security Report

## Status: MEDIUM

## Findings

In `supabase/migrations/001_rbac_profiles_rls.sql`, Row Level Security (RLS) is enabled and strictly configured for core tables:
- `profiles`
- `Student`
- `GradeRecord`
- `AttendanceRecord`
- `ClassSession`
- `Classroom`
- `Announcement`
- `ResourceFile`
- `stored_files`

However, several auxiliary models defined in `src/prisma/schema.prisma` are not yet included in the RLS migration script:
1. `TeacherSetting`
2. `AnnouncementAttachment`
3. `PodcastEpisode`
4. `HallOfFameEntry`
5. `StudentProject`
6. `ResourceFolder`

## What's at risk

If a user or attacker queries Supabase PostgreSQL directly using the client-side `anon` public key (via Supabase PostgREST API `https://<project>.supabase.co/rest/v1/`), tables without RLS enabled might be readable or writable directly if exposed to the public schema. In Next.js, access is mostly protected by Server-side Prisma, but defense-in-depth requires RLS on all public tables in Supabase.

## What's already secure

- Service role functions `is_admin()`, `current_student_id()`, `current_student_classroom_id()` are `SECURITY DEFINER` and revoked from `PUBLIC`.
- `guard_profile_privilege_columns` trigger prevents non-admin users from escalating their role or modifying `is_active`.
- Scoped policies ensure students can only view their own records (`"studentId" = public.current_student_id()`).

## Recommendations

Add an auxiliary migration `002_rls_auxiliary_tables.sql` enabling RLS on:
- `TeacherSetting` (Admin ALL; Public/Anon SELECT)
- `AnnouncementAttachment` (Admin ALL; Public/Anon SELECT if published)
- `PodcastEpisode` (Admin ALL; Public/Anon SELECT if status = 'published')
- `HallOfFameEntry` (Admin ALL; Public/Anon SELECT)
- `StudentProject` (Admin ALL; Public/Anon SELECT)
- `ResourceFolder` (Admin ALL; Student/Anon SELECT for public folders)

