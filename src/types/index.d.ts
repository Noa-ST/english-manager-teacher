/**
 * Cross-cutting domain types (framework- and ORM-agnostic).
 *
 * Entity DTOs are declared next to their service (e.g. `StudentSummary` in
 * student.service.ts) and will be derived from Prisma models once the schema
 * lands. Only truly shared primitives live here.
 */

export type ID = string;

/** Admin = Teacher. Student = Student with personal portal access. */
export type Role = "admin" | "student";

export interface SessionUser {
  id: ID;
  role: Role;
  /** Display label (email or student code). */
  label: string;
  fullName?: string;
  studentId?: string;
  studentCode?: string;
}

export interface UserProfile {
  id: ID;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: Role;
  isActive: boolean;
  studentId: string | null;
  studentCode: string | null;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Storage access level (SRS 3.2 — "phân quyền file Public/Private"). */
export type FileVisibility = "public" | "private";

/** Supported cloud & local storage providers. */
export type StorageProviderName = "cloudinary" | "supabase" | "r2" | "s3" | "local";

/** Logical media family routed by StorageService. */
export type StorageMediaKind = "image" | "audio" | "pdf";

/** Logical storage areas; also the first segment of every object key. */
export type StorageFolder =
  | "podcasts"
  | "thumbnails"
  | "showcase"
  | "documents"
  | "attachments"
  | "avatars/students"
  | "avatars/teachers"
  | "projects"
  | "announcements"
  | "articles"
  | "resources"
  | "resources/grammar"
  | "resources/vocabulary"
  | "resources/exercises"
  | "exams"
  | "answers"
  | "internal-documents"
  | "student-documents"
  | "teacher-resources";

/** Announcement tags (SRS 3.1 — Sự kiện, Học phí, Lịch học, Bài tập). */
export type AnnouncementTag = "event" | "tuition" | "schedule" | "homework";

/** Hall of Fame periods (SRS 3.1 — Tuần/Tháng/Khóa học). */
export type HonorPeriod = "week" | "month" | "course";

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

