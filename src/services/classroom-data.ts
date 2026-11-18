/**
 * Centralized domain data & structured mock repository.
 *
 * Keeps all UI components decoupled from hardcoded data while the PostgreSQL
 * database migration is pending. Public data contains ZERO personal contact,
 * grade, attendance, or tuition information (Rule 8.12). Private student
 * portal data is strictly gated behind student credential verification.
 */

export interface TeacherProfile {
  name: string;
  avatarUrl?: string;
  title: string;
  credentials: string[];
  slogan: string;
  shortBio: string;
  philosophy: string;
  experienceYears: number;
  totalStudents: number;
  bandAchievementRate: string;
  email: string;
  officeHours: string;
  location: string;
  socials: { label: string; href: string; handle: string }[];
}

export type AnnouncementCategory = "urgent" | "schedule" | "tuition" | "homework" | "event";

export interface AnnouncementAttachment {
  id: string;
  name: string;
  size: string;
  type: "PDF" | "DOCX" | "SLIDE";
  downloadCount: number;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  excerpt: string;
  content: string[];
  category: AnnouncementCategory;
  categoryLabel: string;
  isUrgent?: boolean;
  isPinned?: boolean;
  publishedAt: string;
  readTime: string;
  targetClasses: string[];
  attachments: AnnouncementAttachment[];
  status: "published" | "draft";
}

export interface WeeklyClassSession {
  id: string;
  classCode: string;
  className: string;
  level: string;
  dayOfWeek: number; // 1 = Mon ... 7 = Sun
  dayLabel: string;
  startTime: string;
  endTime: string;
  room: string;
  topic: string;
  enrolledCount: number;
  capacity: number;
  status: "upcoming" | "ongoing" | "completed";
  hasConflict?: boolean;
}

export interface TimeSlotDef {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  period: "morning" | "afternoon" | "evening";
  isCustom?: boolean;
}

export const STANDARD_TIME_SLOTS: TimeSlotDef[] = [
  { id: "m1", label: "Sáng sớm", startTime: "08:30", endTime: "10:30", period: "morning" },
  { id: "m2", label: "Sáng", startTime: "09:00", endTime: "11:00", period: "morning" },
  { id: "a1", label: "Chiều", startTime: "14:30", endTime: "16:30", period: "afternoon" },
  { id: "e1", label: "Tối 1", startTime: "17:45", endTime: "19:45", period: "evening" },
  { id: "e2", label: "Tối 2", startTime: "18:00", endTime: "20:15", period: "evening" },
  { id: "e3", label: "Tối muộn", startTime: "19:50", endTime: "21:30", period: "evening" },
];

export const DAYS_OF_WEEK = [
  { dayNumber: 1, label: "Thứ 2", short: "T2", fullLabel: "Thứ Hai" },
  { dayNumber: 2, label: "Thứ 3", short: "T3", fullLabel: "Thứ Ba" },
  { dayNumber: 3, label: "Thứ 4", short: "T4", fullLabel: "Thứ Tư" },
  { dayNumber: 4, label: "Thứ 5", short: "T5", fullLabel: "Thứ Năm" },
  { dayNumber: 5, label: "Thứ 6", short: "T6", fullLabel: "Thứ Sáu" },
  { dayNumber: 6, label: "Thứ 7", short: "T7", fullLabel: "Thứ Bảy" },
  { dayNumber: 7, label: "Chủ Nhật", short: "CN", fullLabel: "Chủ Nhật" },
];

export const STANDARD_ROOMS = [
  "Phòng 302 · Cơ sở Nguyễn Du",
  "Phòng 204 · Cơ sở Nguyễn Du",
  "Phòng 401 · Cơ sở Nguyễn Du",
  "Phòng Lab 1 · Cơ sở Nguyễn Du",
  "Phòng 502 · Cơ sở Nguyễn Du",
];

export interface HallOfFameStudent {
  id: string;
  displayName: string;
  avatarInitials: string;
  className: string;
  rank: 1 | 2 | 3 | 4 | 5;
  period: "week" | "month" | "course";
  periodLabel: string;
  headlineMetric: string;
  badgeTitle: string;
  teacherEndorsement: string;
  milestones: string[];
}

export interface PodcastEpisode {
  id: string;
  episodeNumber: number;
  title: string;
  summary: string;
  showNotes: string[];
  category: "weekly-digest" | "ielts-listening" | "pronunciation" | "parent-corner";
  categoryLabel: string;
  durationSeconds: number;
  durationLabel: string;
  publishedAt: string;
  isFeatured?: boolean;
  coverTheme: "navy" | "cream" | "sky" | "coral";
  vocabularyHighlights: { term: string; ipa: string; meaning: string }[];
  status: "published" | "draft";
}

export interface StudentProjectItem {
  id: string;
  title: string;
  studentOrTeam: string;
  className: string;
  category: "Academic Essay" | "Video Presentation" | "Research Poster" | "Debate Portfolio";
  summary: string;
  keyTakeaway: string;
  publishedAt: string;
  externalUrl: string;
  featuredMetric: string;
  accentTheme: "navy" | "blue" | "coral" | "cream";
  status: "published" | "draft";
}

export interface ResourceFolder {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  itemCount: number;
  updatedAt: string;
  visibility: "public" | "private";
}

export interface ResourceFileItem {
  id: string;
  folderId: string;
  folderName: string;
  title: string;
  description: string;
  fileType: "PDF" | "SLIDE" | "AUDIO" | "WORKSHEET" | "IMAGE";
  size: string;
  sizeBytes: number;
  updatedAt: string;
  downloads: number;
  pagesOrDuration: string;
  level: string;
  visibility: "public" | "private";
  previewSummary: string[];
  objectKey?: string | null;
  publicUrl?: string | null;
  provider?: "cloudinary" | "supabase" | "r2" | "s3" | "local";
  mimeType?: string;
  bucketName?: string | null;
  storagePath?: string | null;
  cloudinaryPublicId?: string | null;
  category?: string;
  ownerId?: string | null;
  originalName?: string;
  storedName?: string;
  deletedAt?: string | null;
}

export interface StoredFileRecord {
  id: string;
  originalName: string;
  storedName: string;
  provider: "cloudinary" | "supabase" | "r2" | "s3" | "local";
  fileType: "IMAGE" | "AUDIO" | "PDF" | "SLIDE" | "WORKSHEET";
  mimeType: string;
  fileSize: number;
  bucketName: string | null;
  storagePath: string | null;
  cloudinaryPublicId: string | null;
  publicUrl: string | null;
  isPublic: boolean;
  ownerId: string | null;
  category: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  referencedBy: string[];
}

export interface StorageAuditLogEntry {
  id: string;
  action:
    | "UPLOAD_IMAGE"
    | "UPLOAD_PODCAST"
    | "UPLOAD_PDF"
    | "DELETE_FILE"
    | "REPLACE_FILE"
    | "CREATE_SIGNED_URL"
    | "ROLLBACK_ORPHAN";
  provider: "cloudinary" | "supabase" | "r2" | "s3" | "local";
  actorId: string;
  targetId: string;
  targetPath: string;
  status: "SUCCESS" | "FAILED" | "ROLLED_BACK";
  detail: string;
  createdAt: string;
}

export interface OrphanedStorageObject {
  id: string;
  provider: "cloudinary" | "supabase" | "r2" | "s3" | "local";
  bucketName: string | null;
  storagePath: string;
  cloudinaryPublicId: string | null;
  reason: string;
  createdAt: string;
}

export type WeekProgressStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  | "postponed";

export interface MaterialClassAssignment {
  classId: string;
  classCode: string;
  className: string;
  weekNumber: number;
  assignedAt?: string;
}

export interface CurriculumAttachment {
  id: string;
  name: string;
  url: string;
  size: string;
  sizeBytes?: number;
  type: "PDF" | "DOCX" | "SLIDE" | "WORKSHEET" | "IMAGE" | "AUDIO";
  uploadedAt: string;
  classId?: string;
  classCode?: string;
  weekNumber?: number;
  assignments?: MaterialClassAssignment[];
}

export interface MasterCurriculumMaterial {
  id: string;
  name: string;
  url: string;
  size: string;
  sizeBytes?: number;
  type: "PDF" | "DOCX" | "SLIDE" | "WORKSHEET" | "IMAGE" | "AUDIO";
  uploadedAt: string;
  assignments: MaterialClassAssignment[];
}

export interface CurriculumWeek {
  weekNumber: number;
  title: string;
  focus?: string;
  status?: WeekProgressStatus;
  scheduledDate?: string;
  completedDate?: string;
  teacherName?: string;
  notes?: string;
  homework?: string;
  materialsCount?: number;
  attachments?: CurriculumAttachment[];
}

/** Helper to determine the effective progress status of a curriculum week */
export function resolveWeekStatus(
  week: CurriculumWeek,
  currentWeekIndex?: number,
): WeekProgressStatus {
  if (week.status) return week.status;
  const activeWeek = currentWeekIndex ?? 1;
  if (week.weekNumber < activeWeek) return "completed";
  if (week.weekNumber === activeWeek) return "in-progress";
  return "not-started";
}

export interface CurriculumPreset {
  id: string;
  name: string;
  level: string;
  targetBand: string;
  totalWeeks: number;
  curriculum: CurriculumWeek[];
}

export interface ClassroomGroup {
  id: string;
  code: string;
  name: string;
  level: string;
  targetBand: string;
  scheduleSummary: string;
  room: string;
  enrolled: number;
  capacity: number;
  attendanceRate: number;
  averageScore: number;
  currentModule: string;
  status: "active" | "upcoming" | "completed" | "archived";
  totalWeeks?: number;
  currentWeekIndex?: number;
  curriculum?: CurriculumWeek[];
  tuitionDueDate?: string;
}

export interface AdminStudentRecord {
  id: string;
  code: string;
  fullName: string;
  classId: string;
  className: string;
  level: string;
  joinedAt: string;
  attendanceRate: number;
  averageScore: number;
  targetGoal: string;
  tuitionStatus: "paid" | "due-soon" | "overdue";
  tuitionPeriod: string;
  tuitionAmount: string;
  parentRelation: string;
  parentContactMasked: string;
  status: "active" | "trial" | "on-leave" | "archived";
  deletedAt?: string | null;
  recentComment: string;
  grades: {
    id: string;
    assessmentTitle: string;
    date: string;
    listening: number;
    reading: number;
    writing: number;
    speaking: number;
    overall: number;
    comment: string;
  }[];
  attendanceHistory: {
    sessionId?: string;
    date: string;
    sessionName: string;
    status: "present" | "late" | "absent" | "excused";
    note?: string;
  }[];
}

// -----------------------------------------------------------------------------
// TEACHING JOURNAL, SESSION LEARNING HISTORY & CLASS ANALYTICS CONTRACTS
// -----------------------------------------------------------------------------

export type JournalStatus = "completed" | "draft" | "not-started";
export type SessionCompletionResult = "completed" | "partial" | "not-completed";
export type SessionHomeworkStatus = "submitted" | "not-submitted" | "exempt" | "unrecorded";
export type SessionLearningStatus = "good" | "satisfactory" | "needs-support" | "unrecorded";
export type SessionSkillType = "Listening" | "Reading" | "Writing" | "Speaking" | "General";

export interface SessionAttachment {
  id: string;
  name: string;
  type: "PDF" | "SLIDE" | "IMAGE" | "DOCX" | "WORKSHEET";
  size: string;
  url?: string;
}

export interface JournalRevision {
  id: string;
  updatedAt: string;
  summary: string;
  previousTopic: string;
  previousNotes: string;
  previousCompletionResult: SessionCompletionResult;
}

export interface SessionStudentRecord {
  id: string;
  sessionId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  attendance: "present" | "excused" | "absent" | "late";
  homeworkStatus: SessionHomeworkStatus;
  learningStatus: SessionLearningStatus;
  skill: SessionSkillType;
  score?: number | null;
  teacherFeedback: string;
  followUp: string;
}

export interface ClassSessionRecord {
  /** Central identifier linking schedule, teaching journal, and student learning history */
  id: string;
  classId: string;
  classCode: string;
  className: string;
  /** Calendar date in YYYY-MM-DD format */
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  room: string;
  weekNumber: number;
  topic: string;
  objectives: string;
  completionResult: SessionCompletionResult;
  generalNotes: string;
  homework: string;
  nextSessionPlan: string;
  journalStatus: JournalStatus;
  attachments: SessionAttachment[];
  revisions: JournalRevision[];
  studentRecords: SessionStudentRecord[];
  updatedAt: string;
}

export interface AnalyticsAlertAckRecord {
  alertId: string;
  status: "active" | "acknowledged" | "resolved";
  updatedAt: string;
  note?: string;
}

// -----------------------------------------------------------------------------
// 1. TEACHER BRAND PROFILE
// -----------------------------------------------------------------------------

export const TEACHER_PROFILE: TeacherProfile = {
  name: "ThS. Nguyễn Minh Anh",
  avatarUrl: "/images/teacher-avatar.jpg",
  title: "Academic English Educator & Curriculum Mentor",
  credentials: [
    "M.A. in TESOL — University of Melbourne",
    "IELTS 8.5 Overall (9.0 Reading & Listening)",
    "Cambridge CELTA Pass A",
  ],
  slogan: "Tư duy ngôn ngữ mạch lạc — Nền tảng học thuật bền vững.",
  shortBio:
    "Hơn 9 năm đồng hành cùng học sinh THCS, THPT và sinh viên đại học xây dựng năng lực tiếng Anh học thuật, viết luận phản biện và chinh phục IELTS 7.0–8.0+ bằng phương pháp sư phạm nhân văn, bài bản.",
  philosophy:
    "Mỗi học sinh đều có nhịp độ tiếp thu riêng. Lớp học không chỉ luyện kỹ thuật làm bài mà rèn thói quen đọc sâu, viết chuẩn và diễn đạt có cấu trúc.",
  experienceYears: 9,
  totalStudents: 420,
  bandAchievementRate: "94% đạt & vượt mục tiêu",
  email: "minhanh.academic@englishportal.vn",
  officeHours: "Thứ 3 & Thứ 5 · 14:00 – 17:00 (Tư vấn 1:1)",
  location: "Phòng 302, Không gian Học thuật Nguyễn Du, Quận 1",
  socials: [
    { label: "Spotify Podcast", href: "/podcast", handle: "@minhanh.notes" },
    { label: "Thư viện Học liệu", href: "/documents", handle: "Open Resource Hub" },
    { label: "Bảng tin Lớp học", href: "/announcements", handle: "Weekly Digest" },
  ],
};

// -----------------------------------------------------------------------------
// 2. ANNOUNCEMENTS (EDITORIAL NEWS FEED)
// -----------------------------------------------------------------------------

export const ANNOUNCEMENTS_DATA: AnnouncementItem[] = [
  {
    id: "ann-2026-11-mocktest",
    title: "Lịch thi thử IELTS Academic Quý IV & Hướng dẫn nộp bài Writing Task 2",
    excerpt:
      "Tất cả học viên khối IELTS Intensive 6.5+ và Academic Writing lưu ý lịch thi thử 4 kỹ năng cuối tháng 11 và quy chuẩn nộp bài luận trực tuyến.",
    content: [
      "Kính gửi Quý Phụ huynh và các em học sinh,",
      "Nhằm đánh giá chính xác mức độ tiến bộ sau 8 tuần học chuyên đề Argumentative Essay và Academic Listening, lớp sẽ tổ chức kỳ thi thử IELTS Academic đầy đủ 4 kỹ năng vào cuối tuần sau.",
      "1. Thời gian thi 3 kỹ năng Nghe – Đọc – Viết: Chủ nhật, 22/11/2026 (Ca sáng 08:00 – 11:15 tại Phòng 302).",
      "2. Lịch phỏng vấn Speaking 1:1: Đăng ký khung giờ 15 phút cá nhân trong mục Lịch học từ Thứ Năm (19/11).",
      "3. Quy chuẩn nộp bài Writing: Học sinh tải đề cương chuẩn bị và mẫu giấy thi chuẩn bên dưới, hoàn thành bài viết tay hoặc nộp bản nháp trước Thứ Sáu để cô phản hồi chi tiết.",
    ],
    category: "urgent",
    categoryLabel: "Thông báo quan trọng",
    isUrgent: true,
    isPinned: true,
    publishedAt: "12/11/2026",
    readTime: "3 phút đọc",
    targetClasses: ["IELTS Intensive 6.5+", "Academic Writing B2-C1"],
    attachments: [
      {
        id: "att-1",
        name: "Quy-che-thi-thu-IELTS-Quy-IV-2026.pdf",
        size: "1.4 MB",
        type: "PDF",
        downloadCount: 86,
      },
      {
        id: "att-2",
        name: "Checklist-Writing-Task-2-Academic.pdf",
        size: "820 KB",
        type: "PDF",
        downloadCount: 112,
      },
    ],
    status: "published",
  },
  {
    id: "ann-2026-11-workshop",
    title: "Chuyên đề cuối tuần: Phương pháp đọc phản biện (Critical Reading) tài liệu khoa học",
    excerpt:
      "Buổi chia sẻ mở rộng dành cho học sinh lớp Foundation và Intensive về kỹ thuật phân tích cấu trúc lập luận trong bài đọc dài.",
    content: [
      "Trong các bài thi học thuật, rào cản lớn nhất không chỉ nằm ở từ vựng mà ở khả năng nhận diện mạch lập luận của tác giả.",
      "Buổi chuyên đề tuần này sẽ tập trung vào 3 kỹ năng: (1) Tách mệnh đề chính – phụ trong câu phức, (2) Nhận diện thái độ và giọng điệu học thuật, (3) Tóm tắt đoạn văn bằng từ khóa cốt lõi.",
      "Học sinh vui lòng in trước bộ tài liệu Reading Passage mẫu đính kèm để thực hành trực tiếp trên lớp.",
    ],
    category: "event",
    categoryLabel: "Sự kiện học thuật",
    isPinned: true,
    publishedAt: "10/11/2026",
    readTime: "2 phút đọc",
    targetClasses: ["Tất cả các lớp"],
    attachments: [
      {
        id: "att-3",
        name: "Handout-Critical-Reading-Workshop.pdf",
        size: "2.1 MB",
        type: "PDF",
        downloadCount: 64,
      },
    ],
    status: "published",
  },
  {
    id: "ann-2026-11-homework-w46",
    title: "Tổng hợp bài tập tuần 46 & Tài liệu đọc thêm chủ đề Environment & Urbanization",
    excerpt:
      "Danh mục bài tập bắt buộc và bài nghe mở rộng dành cho từng khối lớp trong tuần học từ 09/11 đến 15/11/2026.",
    content: [
      "Cô gửi các em danh mục bài tập tuần 46 tương ứng với nội dung đã học trên lớp:",
      "- Lớp IELTS Foundation: Hoàn thành bài tập Collocations chủ đề Urban Life (trang 14–18) và nghe Podcast Tập 18.",
      "- Lớp IELTS Intensive 6.5+: Viết hoàn chỉnh 01 bài Essay chủ đề Sustainable Cities (tối thiểu 270 từ) và tự đối chiếu bằng Rubric trước khi nộp.",
      "- Lớp Junior Academic: Hoàn thành Sổ tay từ vựng tuần và ghi âm bài nói 2 phút.",
    ],
    category: "homework",
    categoryLabel: "Bài tập tuần",
    publishedAt: "09/11/2026",
    readTime: "2 phút đọc",
    targetClasses: ["IELTS Foundation", "IELTS Intensive 6.5+", "Junior Academic"],
    attachments: [
      {
        id: "att-4",
        name: "Vocabulary-Pack-Urbanization-W46.pdf",
        size: "1.8 MB",
        type: "PDF",
        downloadCount: 95,
      },
    ],
    status: "published",
  },
  {
    id: "ann-2026-11-schedule-adjust",
    title: "Điều chỉnh giờ học ca Thứ Bảy (14/11) cho lớp Academic Writing B2-C1",
    excerpt:
      "Ca học sáng Thứ Bảy tuần này sẽ lùi 30 phút (bắt đầu lúc 09:00 thay vì 08:30) để phục vụ kiểm tra thiết bị âm thanh phòng học.",
    content: [
      "Thông báo tới học sinh lớp Academic Writing B2-C1 (Mã lớp AW-02):",
      "Buổi học sáng Thứ Bảy ngày 14/11/2026 sẽ bắt đầu lúc 09:00 và kết thúc lúc 11:00 (lùi 30 phút so với lịch cố định).",
      "Nội dung buổi học: Sửa chi tiết bài luận Cohesion & Coherence và thực hành Paraphrasing nâng cao.",
    ],
    category: "schedule",
    categoryLabel: "Lịch học",
    publishedAt: "07/11/2026",
    readTime: "1 phút đọc",
    targetClasses: ["Academic Writing B2-C1"],
    attachments: [],
    status: "published",
  },
  {
    id: "ann-2026-11-tuition-q4",
    title: "Hướng dẫn tra cứu và xác nhận học phí Học kỳ II (Tháng 11 – Tháng 01)",
    excerpt:
      "Quý Phụ huynh có thể kiểm tra chi tiết trạng thái học phí và lịch sử điểm danh của con tại cổng Tra cứu cá nhân bằng Mã học sinh.",
    content: [
      "Kính gửi Quý Phụ huynh,",
      "Hệ thống đã cập nhật đầy đủ bảng tổng hợp chuyên cần tháng 10 và thông tin học phí kỳ tiếp theo.",
      "Để đảm bảo tính bảo mật thông tin cá nhân, toàn bộ biên nhận học phí và nhận xét định kỳ của từng học sinh chỉ hiển thị trong khu vực Tra cứu cá nhân sau khi xác thực bằng Mã học sinh.",
    ],
    category: "tuition",
    categoryLabel: "Học phí & Học vụ",
    publishedAt: "03/11/2026",
    readTime: "2 phút đọc",
    targetClasses: ["Tất cả các lớp"],
    attachments: [],
    status: "published",
  },
];

// -----------------------------------------------------------------------------
// 3. WEEKLY SCHEDULE SESSIONS
// -----------------------------------------------------------------------------

export const WEEKLY_SCHEDULE_DATA: WeeklyClassSession[] = [
  {
    id: "ses-mon-1",
    classCode: "IF-01",
    className: "IELTS Foundation (Band 5.0–6.0)",
    level: "B1+ → B2",
    dayOfWeek: 1,
    dayLabel: "Thứ Hai",
    startTime: "17:45",
    endTime: "19:45",
    room: "Phòng 302",
    topic: "Reading: Matching Headings & Từ vựng Sinh thái học",
    enrolledCount: 14,
    capacity: 15,
    status: "completed",
  },
  {
    id: "ses-tue-1",
    classCode: "II-01",
    className: "IELTS Intensive (Band 6.5–7.5+)",
    level: "B2 → C1",
    dayOfWeek: 2,
    dayLabel: "Thứ Ba",
    startTime: "18:00",
    endTime: "20:15",
    room: "Phòng 302",
    topic: "Writing Task 2: Counter-argument & Hedging Language",
    enrolledCount: 12,
    capacity: 12,
    status: "completed",
  },
  {
    id: "ses-wed-1",
    classCode: "JA-01",
    className: "Junior Academic Explorers",
    level: "A2+ → B1",
    dayOfWeek: 3,
    dayLabel: "Thứ Tư",
    startTime: "17:30",
    endTime: "19:15",
    room: "Phòng 204",
    topic: "Academic Presentation: Cấu trúc bài thuyết trình 3 phần",
    enrolledCount: 15,
    capacity: 16,
    status: "completed",
  },
  {
    id: "ses-thu-1",
    classCode: "IF-01",
    className: "IELTS Foundation (Band 5.0–6.0)",
    level: "B1+ → B2",
    dayOfWeek: 4,
    dayLabel: "Thứ Năm",
    startTime: "17:45",
    endTime: "19:45",
    room: "Phòng 302",
    topic: "Listening Section 3: Phân tích thảo luận học thuật",
    enrolledCount: 14,
    capacity: 15,
    status: "ongoing",
  },
  {
    id: "ses-thu-2",
    classCode: "AW-02",
    className: "Academic Writing & Critical Thinking",
    level: "B2 → C1",
    dayOfWeek: 4,
    dayLabel: "Thứ Năm",
    startTime: "19:50",
    endTime: "21:20",
    room: "Phòng Lab 1",
    topic: "Workshop sửa bài luận trực tiếp (1:1 Feedback)",
    enrolledCount: 10,
    capacity: 10,
    status: "upcoming",
  },
  {
    id: "ses-fri-1",
    classCode: "II-01",
    className: "IELTS Intensive (Band 6.5–7.5+)",
    level: "B2 → C1",
    dayOfWeek: 5,
    dayLabel: "Thứ Sáu",
    startTime: "18:00",
    endTime: "20:15",
    room: "Phòng 302",
    topic: "Speaking Part 3: Mở rộng lập luận trừu tượng",
    enrolledCount: 12,
    capacity: 12,
    status: "upcoming",
  },
  {
    id: "ses-sat-1",
    classCode: "AW-02",
    className: "Academic Writing & Critical Thinking",
    level: "B2 → C1",
    dayOfWeek: 6,
    dayLabel: "Thứ Bảy",
    startTime: "09:00",
    endTime: "11:00",
    room: "Phòng 302",
    topic: "Cohesion, Nominalization & Academic Register",
    enrolledCount: 10,
    capacity: 10,
    status: "upcoming",
  },
  {
    id: "ses-sun-1",
    classCode: "JA-01",
    className: "Junior Academic Explorers",
    level: "A2+ → B1",
    dayOfWeek: 7,
    dayLabel: "Chủ Nhật",
    startTime: "08:30",
    endTime: "10:15",
    room: "Phòng 204",
    topic: "Reading Club & Debate: Công nghệ trong trường học",
    enrolledCount: 15,
    capacity: 16,
    status: "upcoming",
  },
];

// -----------------------------------------------------------------------------
// 4. HALL OF FAME (PUBLIC HONOR ROLL — NO PRIVATE PII)
// -----------------------------------------------------------------------------

export const HALL_OF_FAME_DATA: HallOfFameStudent[] = [
  {
    id: "hof-1",
    displayName: "Trần Bảo Ngọc",
    avatarInitials: "BN",
    className: "IELTS Intensive 6.5+",
    rank: 1,
    period: "month",
    periodLabel: "Tháng 11/2026",
    headlineMetric: "IELTS 8.0 Overall",
    badgeTitle: "Học viên Xuất sắc Tháng",
    teacherEndorsement:
      "Bảo Ngọc có sự tiến bộ vượt bậc ở kỹ năng Writing (từ 6.5 lên 7.5 trong 10 tuần) nhờ thói quen lập dàn ý logic và tự biên tập câu chữ tỉ mỉ.",
    milestones: ["Reading 8.5", "Writing 7.5", "100% Chuyên cần"],
  },
  {
    id: "hof-2",
    displayName: "Lê Hoàng Minh Khôi",
    avatarInitials: "MK",
    className: "Academic Writing B2-C1",
    rank: 2,
    period: "month",
    periodLabel: "Tháng 11/2026",
    headlineMetric: "Best Research Essay",
    badgeTitle: "Cây bút Học thuật Ấn tượng",
    teacherEndorsement:
      "Bài tiểu luận 1.200 từ của Minh Khôi về đô thị bền vững đạt điểm tuyệt đối về cấu trúc lập luận và trích dẫn học thuật.",
    milestones: ["Writing 8.0", "Top 1 Mock Test", "Trưởng nhóm Debate"],
  },
  {
    id: "hof-3",
    displayName: "Phạm Hà Phương",
    avatarInitials: "HP",
    className: "IELTS Foundation",
    rank: 3,
    period: "month",
    periodLabel: "Tháng 11/2026",
    headlineMetric: "+1.5 Band Score",
    badgeTitle: "Bứt phá Nền tảng",
    teacherEndorsement:
      "Từ mức nền 4.5, Hà Phương đã vươn lên 6.0 trong kỳ thi thử giữa kỳ với sổ tay hơn 400 collocations tự tổng hợp.",
    milestones: ["Listening 6.5", "Hoàn thành 100% bài tập", "Sổ tay Từ vựng mẫu"],
  },
  {
    id: "hof-4",
    displayName: "Nguyễn Đức Anh",
    avatarInitials: "ĐA",
    className: "IELTS Intensive 6.5+",
    rank: 1,
    period: "week",
    periodLabel: "Tuần 45 (02/11 – 08/11)",
    headlineMetric: "9.0 Reading Mock",
    badgeTitle: "Quán quân Đọc hiểu Tuần",
    teacherEndorsement:
      "Hoàn thành 40/40 câu Reading Academic trong 52 phút với phần giải thích từ khóa rõ ràng cho cả lớp.",
    milestones: ["40/40 Reading", "Hỗ trợ bạn cùng lớp"],
  },
  {
    id: "hof-5",
    displayName: "Vũ Thanh Trúc",
    avatarInitials: "TT",
    className: "Junior Academic Explorers",
    rank: 2,
    period: "week",
    periodLabel: "Tuần 45 (02/11 – 08/11)",
    headlineMetric: "Best Speaker",
    badgeTitle: "Thuyết trình Xuất sắc",
    teacherEndorsement:
      "Tự tin trình bày chủ đề Khoa học Thường thức trong 5 phút hoàn toàn bằng tiếng Anh mà không phụ thuộc kịch bản.",
    milestones: ["Pronunciation 8.5/10", "Tương tác sôi nổi"],
  },
  {
    id: "hof-6",
    displayName: "Đặng Quốc Huy",
    avatarInitials: "QH",
    className: "IELTS Foundation",
    rank: 3,
    period: "week",
    periodLabel: "Tuần 45 (02/11 – 08/11)",
    headlineMetric: "Chuỗi 12 buổi đúng giờ",
    badgeTitle: "Tinh thần Học tập Bền bỉ",
    teacherEndorsement:
      "Nộp đầy đủ toàn bộ bài viết sửa lại (Second Draft) và cải thiện rõ rệt độ chính xác ngữ pháp.",
    milestones: ["Grammar Accuracy +25%", "Chuyên cần tuyệt đối"],
  },
  {
    id: "hof-7",
    displayName: "Hoàng Gia Hân",
    avatarInitials: "GH",
    className: "IELTS Intensive 6.5+",
    rank: 1,
    period: "course",
    periodLabel: "Khóa Hè – Thu 2026",
    headlineMetric: "IELTS 8.0 (L:8.5 R:8.5)",
    badgeTitle: "Thủ khoa Khóa học",
    teacherEndorsement:
      "Hình mẫu về phương pháp học chủ động, đạt học bổng tuyển thẳng đại học quốc tế ngay sau khi kết thúc khóa.",
    milestones: ["Overall 8.0", "Học bổng Đại học", "Mentor CLB Đọc"],
  },
  {
    id: "hof-8",
    displayName: "Bùi Nhật Minh",
    avatarInitials: "NM",
    className: "Academic Writing B2-C1",
    rank: 2,
    period: "course",
    periodLabel: "Khóa Hè – Thu 2026",
    headlineMetric: "IELTS 7.5 Overall",
    badgeTitle: "Á khoa Khóa học",
    teacherEndorsement:
      "Tư duy phản biện sắc bén, luôn đặt câu hỏi sâu và dẫn dắt các buổi thảo luận nhóm hiệu quả.",
    milestones: ["Speaking 7.5", "Writing 7.5", "98% Chuyên cần"],
  },
  {
    id: "hof-9",
    displayName: "Ngô Khánh Linh",
    avatarInitials: "KL",
    className: "IELTS Foundation",
    rank: 3,
    period: "course",
    periodLabel: "Khóa Hè – Thu 2026",
    headlineMetric: "Band 6.5 (Vượt mục tiêu)",
    badgeTitle: "Học viên Tiến bộ Nhất Khóa",
    teacherEndorsement:
      "Tăng 2.0 band điểm tổng sau 16 tuần nhờ kỷ luật tự học đáng ngưỡng mộ.",
    milestones: ["+2.0 Overall", "100% Bài tập tuần"],
  },
];

// -----------------------------------------------------------------------------
// 5. PODCAST / AUDIO NEWSLETTER
// -----------------------------------------------------------------------------

export const PODCAST_EPISODES_DATA: PodcastEpisode[] = [
  {
    id: "pod-ep-19",
    episodeNumber: 19,
    title: "Hedging in Academic Writing: Làm sao để lập luận thuyết phục mà không cực đoan?",
    summary:
      "Phân tích cách các học giả sử dụng ngôn ngữ chừng mực (Modals, Adverbs of Probability, Reporting Verbs) để nâng tầm bài viết IELTS Writing Task 2 từ Band 6.5 lên 7.5+.",
    showNotes: [
      "00:00 — Mở đầu: Vì sao các câu khẳng định tuyệt đối ('always', 'never', 'prove') làm giảm tính học thuật?",
      "03:40 — 3 nhóm cấu trúc Hedging quan trọng nhất trong bài luận xã hội & khoa học.",
      "08:15 — Phân tích trực tiếp 2 đoạn văn của học sinh: Trước và sau khi biên tập Hedging.",
      "12:10 — Bài tập ứng dụng nhanh trong 5 phút cho tuần học này.",
    ],
    category: "weekly-digest",
    categoryLabel: "Bản tin Học thuật Tuần",
    durationSeconds: 885,
    durationLabel: "14:45",
    publishedAt: "11/11/2026",
    isFeatured: true,
    coverTheme: "navy",
    vocabularyHighlights: [
      {
        term: "mitigate",
        ipa: "/ˈmɪt.ɪ.ɡeɪt/",
        meaning: "giảm nhẹ mức độ nghiêm trọng của một vấn đề",
      },
      {
        term: "plausible",
        ipa: "/ˈplɔː.zə.bəl/",
        meaning: "hợp lý, có khả năng đúng trên thực tế",
      },
      {
        term: "ostensibly",
        ipa: "/ɒsˈten.sə.bli/",
        meaning: "bề ngoài có vẻ như (nhưng thực chất có thể khác)",
      },
    ],
    status: "published",
  },
  {
    id: "pod-ep-18",
    episodeNumber: 18,
    title: "Chiến thuật nghe Section 3: Nhận diện sự đồng thuận và bất đồng giữa hai sinh viên",
    summary:
      "Hướng dẫn cách bắt tín hiệu đổi ý (Discourse Markers) và ngữ điệu ngập ngừng trong các cuộc thảo luận học thuật tốc độ nhanh.",
    showNotes: [
      "00:00 — Cấu trúc điển hình của cuộc đối thoại giữa Tutor và 2 sinh viên.",
      "04:20 — 10 cụm từ báo hiệu 'Bẫy đổi ý' thường gặp nhất.",
      "09:10 — Luyện nghe trích đoạn mẫu tốc độ chuẩn.",
    ],
    category: "ielts-listening",
    categoryLabel: "Luyện nghe Chuyên sâu",
    durationSeconds: 740,
    durationLabel: "12:20",
    publishedAt: "04/11/2026",
    coverTheme: "sky",
    vocabularyHighlights: [
      {
        term: "consensus",
        ipa: "/kənˈsen.səs/",
        meaning: "sự đồng thuận chung của nhóm",
      },
      {
        term: "skeptical",
        ipa: "/ˈskep.tɪ.kəl/",
        meaning: "hoài nghi, cần thêm bằng chứng",
      },
    ],
    status: "published",
  },
  {
    id: "pod-ep-17",
    episodeNumber: 17,
    title: "Sentence Stress & Chunking: Bí quyết nói tiếng Anh tự nhiên không bị 'đều đều'",
    summary:
      "Cách ngắt cụm ý (Thought Groups) và đặt trọng âm câu giúp bài nói Speaking Part 2 & 3 mạch lạc, dễ theo dõi hơn ngay lập tức.",
    showNotes: [
      "00:00 — Khác biệt giữa nhịp điệu tiếng Việt và tiếng Anh (Stress-timed).",
      "03:15 — Thực hành ngắt cụm trên đoạn mẫu chủ đề Education.",
      "07:50 — Hướng dẫn tự thu âm và kiểm tra tại nhà.",
    ],
    category: "pronunciation",
    categoryLabel: "Phát âm & Ngữ điệu",
    durationSeconds: 650,
    durationLabel: "10:50",
    publishedAt: "28/10/2026",
    coverTheme: "coral",
    vocabularyHighlights: [
      {
        term: "intonation",
        ipa: "/ˌɪn.təˈneɪ.ʃən/",
        meaning: "ngữ điệu lên xuống của giọng nói",
      },
      {
        term: "articulate",
        ipa: "/ɑːˈtɪk.jə.leɪt/",
        meaning: "diễn đạt rõ ràng, mạch lạc",
      },
    ],
    status: "published",
  },
  {
    id: "pod-ep-16",
    episodeNumber: 16,
    title: "Góc Phụ huynh: Đồng hành cùng con tuổi Teen học ngoại ngữ không áp lực điểm số",
    summary:
      "Chia sẻ từ kinh nghiệm thực tế đứng lớp của cô Minh Anh về cách xây dựng thói quen đọc 20 phút mỗi ngày tại gia đình.",
    showNotes: [
      "00:00 — Khi nào việc nhắc nhở biến thành áp lực vô hình?",
      "05:00 — Cách đọc hiểu bảng nhận xét định kỳ của giáo viên.",
      "10:30 — 3 hoạt động cuối tuần giúp con yêu thích tiếng Anh học thuật.",
    ],
    category: "parent-corner",
    categoryLabel: "Góc Phụ huynh",
    durationSeconds: 930,
    durationLabel: "15:30",
    publishedAt: "20/10/2026",
    coverTheme: "cream",
    vocabularyHighlights: [
      {
        term: "intrinsic motivation",
        ipa: "/ɪnˈtrɪn.zɪk/",
        meaning: "động lực tự thân từ bên trong",
      },
    ],
    status: "published",
  },
];

// -----------------------------------------------------------------------------
// 6. STUDENT PROJECTS SHOWCASE
// -----------------------------------------------------------------------------

export const STUDENT_PROJECTS_DATA: StudentProjectItem[] = [
  {
    id: "proj-1",
    title: "Urban Green Spaces & Mental Well-being in High-Density Cities",
    studentOrTeam: "Nhóm Lê Hoàng Minh Khôi & Trần Bảo Ngọc",
    className: "Academic Writing B2-C1",
    category: "Research Poster",
    summary:
      "Báo cáo nghiên cứu tổng hợp 12 tài liệu học thuật kèm Infographic phân tích tác động của diện tích cây xanh đô thị đến sức khỏe tinh thần học sinh THPT.",
    keyTakeaway: "Đạt điểm 9.5/10 kỳ đánh giá giữa khóa · Trích dẫn chuẩn APA 7th",
    publishedAt: "08/11/2026",
    externalUrl: "/documents",
    featuredMetric: "1.500 từ · 12 nguồn APA",
    accentTheme: "navy",
    status: "published",
  },
  {
    id: "proj-2",
    title: "The Ethics of AI Tutors in Secondary Education — A Structured Debate",
    studentOrTeam: "Đội Debate Alpha (4 học sinh)",
    className: "IELTS Intensive 6.5+",
    category: "Debate Portfolio",
    summary:
      "Hồ sơ lập luận phản biện 2 chiều và video ghi hình phiên tranh biện học thuật kéo dài 25 phút bằng tiếng Anh về vai trò của AI trong giáo dục phổ thông.",
    keyTakeaway: "Sử dụng hơn 35 cụm từ Academic Discourse & Hedging chuẩn mực",
    publishedAt: "01/11/2026",
    externalUrl: "/podcast",
    featuredMetric: "Video 25 phút + Kịch bản",
    accentTheme: "blue",
    status: "published",
  },
  {
    id: "proj-3",
    title: "Illustrated Guide to Renewable Energy Technologies for Young Learners",
    studentOrTeam: "Vũ Thanh Trúc & Nhóm Creative",
    className: "Junior Academic Explorers",
    category: "Video Presentation",
    summary:
      "Cẩm nang minh họa song ngữ và bài thuyết trình video giải thích cơ chế năng lượng mặt trời và gió bằng ngôn ngữ khoa học dễ hiểu.",
    keyTakeaway: "Giải nhất Thuyết trình Khoa học Quý III/2026",
    publishedAt: "24/10/2026",
    externalUrl: "/documents",
    featuredMetric: "Booklet 16 trang",
    accentTheme: "coral",
    status: "published",
  },
  {
    id: "proj-4",
    title: "Preserving Traditional Craft Villages in Vietnam's Digital Economy",
    studentOrTeam: "Phạm Hà Phương",
    className: "IELTS Foundation",
    category: "Academic Essay",
    summary:
      "Bài tiểu luận phân tích giải pháp kết hợp thương mại điện tử và du lịch văn hóa nhằm bảo tồn làng nghề truyền thống Việt Nam.",
    keyTakeaway: "Bài viết mẫu tiêu biểu về cấu trúc Problem – Solution Essay",
    publishedAt: "15/10/2026",
    externalUrl: "/documents",
    featuredMetric: "Band 7.5 Writing Criterion",
    accentTheme: "cream",
    status: "published",
  },
];

// -----------------------------------------------------------------------------
// 7. RESOURCE LIBRARY (FOLDERS & FILES)
// -----------------------------------------------------------------------------

export const RESOURCE_FOLDERS_DATA: ResourceFolder[] = [
  {
    id: "fld-writing",
    name: "01. Academic Writing & Essays",
    description: "Khung dàn ý, bộ từ vựng học thuật, bài mẫu phân tích Band 7.0–8.5.",
    parentId: null,
    itemCount: 18,
    updatedAt: "11/11/2026",
    visibility: "public",
  },
  {
    id: "fld-reading",
    name: "02. Critical Reading Passages",
    description: "Tuyển tập bài đọc khoa học, xã hội kèm bảng phân tích Paraphrase.",
    parentId: null,
    itemCount: 24,
    updatedAt: "09/11/2026",
    visibility: "public",
  },
  {
    id: "fld-listening",
    name: "03. Listening & Pronunciation Lab",
    description: "Audio luyện nghe Section 3–4, transcript và bài tập ngữ điệu.",
    parentId: null,
    itemCount: 15,
    updatedAt: "05/11/2026",
    visibility: "public",
  },
  {
    id: "fld-grammar",
    name: "04. Core Grammar for IELTS",
    description: "Hệ thống chủ điểm ngữ pháp học thuật ứng dụng trong viết và nói.",
    parentId: null,
    itemCount: 12,
    updatedAt: "01/11/2026",
    visibility: "public",
  },
  {
    id: "fld-internal",
    name: "05. Đề thi thử & Đáp án Chi tiết (Nội bộ)",
    description: "Tài liệu lưu hành nội bộ dành riêng cho học sinh đang theo học.",
    parentId: null,
    itemCount: 9,
    updatedAt: "12/11/2026",
    visibility: "private",
  },
];

export const RESOURCE_FILES_DATA: ResourceFileItem[] = [
  {
    id: "res-1",
    folderId: "fld-writing",
    folderName: "01. Academic Writing & Essays",
    title: "Sổ tay 120 Academic Collocations & Hedging Structures",
    description:
      "Tổng hợp các cụm từ học thuật theo 10 chủ đề lớn kèm ví dụ câu đúng/sai thường gặp của học sinh Việt Nam.",
    fileType: "PDF",
    size: "3.2 MB",
    sizeBytes: 3355443,
    updatedAt: "11/11/2026",
    downloads: 342,
    pagesOrDuration: "42 trang",
    level: "B2 – C1",
    visibility: "public",
    previewSummary: [
      "Chương 1: Nguyên tắc sử dụng Hedging & Modals trong văn phong học thuật.",
      "Chương 2: 120 Academic Collocations phân nhóm theo Environment, Education, Technology, Public Health.",
      "Chương 3: Bảng đối chiếu 50 lỗi dịch từng từ (Word-by-word translation) và cách sửa tự nhiên.",
    ],
  },
  {
    id: "res-2",
    folderId: "fld-writing",
    folderName: "01. Academic Writing & Essays",
    title: "Slide Bài giảng: Cấu trúc Counter-Argument trong Writing Task 2",
    description:
      "Bộ slide bài giảng trực quan hướng dẫn 3 bước xây dựng đoạn phản biện sắc bén.",
    fileType: "SLIDE",
    size: "5.8 MB",
    sizeBytes: 6081740,
    updatedAt: "08/11/2026",
    downloads: 215,
    pagesOrDuration: "28 slides",
    level: "Band 6.5+",
    visibility: "public",
    previewSummary: [
      "Slide 1–8: Khi nào nên dùng Counter-argument trong bài Discussion & Opinion Essay?",
      "Slide 9–18: Công thức Concession (Nhượng bộ) → Refutation (Bác bỏ).",
      "Slide 19–28: Phân tích 4 đoạn văn mẫu đạt điểm Coherence & Cohesion 8.0.",
    ],
  },
  {
    id: "res-3",
    folderId: "fld-reading",
    folderName: "02. Critical Reading Passages",
    title: "Bộ 10 Bài đọc Khoa học Thường thức kèm Bảng Synonym Mapping",
    description:
      "Luyện kỹ năng tìm từ đồng nghĩa và đọc hiểu mạch liên kết giữa các đoạn văn dài.",
    fileType: "WORKSHEET",
    size: "2.4 MB",
    sizeBytes: 2516582,
    updatedAt: "06/11/2026",
    downloads: 289,
    pagesOrDuration: "30 trang",
    level: "B1+ – B2",
    visibility: "public",
    previewSummary: [
      "Gồm 10 bài đọc chủ đề Khoa học thần kinh, Khảo cổ học, Khí hậu và Đô thị hóa.",
      "Kèm bảng Keyword Mapping đối chiếu từ khóa trong câu hỏi và văn bản gốc.",
    ],
  },
  {
    id: "res-4",
    folderId: "fld-listening",
    folderName: "03. Listening & Pronunciation Lab",
    title: "Audio Pack & Transcript: 15 Cuộc thảo luận Học thuật Section 3",
    description:
      "Tệp âm thanh chất lượng cao kèm bản gỡ băng đánh dấu trọng âm và cụm từ chuyển ý.",
    fileType: "AUDIO",
    size: "18.5 MB",
    sizeBytes: 19398656,
    updatedAt: "04/11/2026",
    downloads: 178,
    pagesOrDuration: "45 phút + PDF",
    level: "B2 – C1",
    visibility: "public",
    previewSummary: [
      "15 đoạn hội thoại giữa sinh viên và giáo sư hướng dẫn luận văn.",
      "Transcript có đánh dấu IPA và liên âm (Connected Speech).",
    ],
  },
  {
    id: "res-5",
    folderId: "fld-grammar",
    folderName: "04. Core Grammar for IELTS",
    title: "Chuyên đề Mệnh đề Quan hệ Rút gọn & Danh hóa (Nominalization)",
    description:
      "Tài liệu thực hành chuyển đổi câu đơn giản sang câu học thuật cô đọng, giàu thông tin.",
    fileType: "PDF",
    size: "1.9 MB",
    sizeBytes: 1992294,
    updatedAt: "29/10/2026",
    downloads: 264,
    pagesOrDuration: "22 trang",
    level: "B1 – B2",
    visibility: "public",
    previewSummary: [
      "Lý thuyết cô đọng kèm sơ đồ tư duy cấu trúc câu.",
      "60 bài tập viết lại câu ứng dụng trực tiếp vào Writing Task 1 & Task 2.",
    ],
  },
  {
    id: "res-6",
    folderId: "fld-internal",
    folderName: "05. Đề thi thử & Đáp án Chi tiết (Nội bộ)",
    title: "Bộ Đề Thi Thử IELTS Academic Quý IV/2026 (Kèm Rubric Chấm)",
    description:
      "Đề thi thử chuẩn hóa lưu hành nội bộ cho kỳ kiểm tra định kỳ tháng 11/2026.",
    fileType: "PDF",
    size: "4.6 MB",
    sizeBytes: 4823449,
    updatedAt: "12/11/2026",
    downloads: 42,
    pagesOrDuration: "36 trang",
    level: "Nội bộ lớp",
    visibility: "private",
    previewSummary: [
      "Tài liệu giới hạn quyền truy cập (Private Bucket) — chỉ tải về qua Presigned URL có thời hạn 15 phút.",
    ],
    provider: "supabase",
    mimeType: "application/pdf",
    bucketName: "english-manager-private",
    storagePath: "exams/2026/11/ielts-mock-test-q4-2026.pdf",
    objectKey: "exams/2026/11/ielts-mock-test-q4-2026.pdf",
    category: "exams",
  },
];

export const STORED_FILES_DATA: StoredFileRecord[] = [
  {
    id: "sf-img-1",
    originalName: "teacher-minh-anh-portrait.webp",
    storedName: "teacher-minh-anh-portrait.webp",
    provider: "cloudinary",
    fileType: "IMAGE",
    mimeType: "image/webp",
    fileSize: 420864,
    bucketName: null,
    storagePath: "english-manager/avatars/teachers/2026/11/teacher-minh-anh-portrait",
    cloudinaryPublicId: "english-manager/avatars/teachers/2026/11/teacher-minh-anh-portrait",
    publicUrl:
      "https://res.cloudinary.com/demo-english-manager/image/upload/c_fill,g_auto,w_256,h_256,f_auto,q_auto/english-manager/avatars/teachers/2026/11/teacher-minh-anh-portrait",
    isPublic: true,
    ownerId: "admin",
    category: "teacher_avatar",
    createdAt: "2026-11-01T08:00:00.000Z",
    updatedAt: "2026-11-01T08:00:00.000Z",
    deletedAt: null,
    referencedBy: ["teacher_profile:default"],
  },
  {
    id: "sf-img-2",
    originalName: "project-urban-green-spaces-cover.jpg",
    storedName: "project-urban-green-spaces-cover.jpg",
    provider: "cloudinary",
    fileType: "IMAGE",
    mimeType: "image/jpeg",
    fileSize: 1258291,
    bucketName: null,
    storagePath: "english-manager/projects/2026/11/project-urban-green-spaces-cover",
    cloudinaryPublicId: "english-manager/projects/2026/11/project-urban-green-spaces-cover",
    publicUrl:
      "https://res.cloudinary.com/demo-english-manager/image/upload/c_limit,w_1200,h_900,f_auto,q_auto/english-manager/projects/2026/11/project-urban-green-spaces-cover",
    isPublic: true,
    ownerId: "admin",
    category: "project",
    createdAt: "2026-11-05T09:30:00.000Z",
    updatedAt: "2026-11-05T09:30:00.000Z",
    deletedAt: null,
    referencedBy: ["project:proj-1"],
  },
  {
    id: "sf-img-3",
    originalName: "podcast-ep12-thumbnail.png",
    storedName: "podcast-ep12-thumbnail.png",
    provider: "cloudinary",
    fileType: "IMAGE",
    mimeType: "image/png",
    fileSize: 685400,
    bucketName: null,
    storagePath: "english-manager/podcasts/2026/11/podcast-ep12-thumbnail",
    cloudinaryPublicId: "english-manager/podcasts/2026/11/podcast-ep12-thumbnail",
    publicUrl:
      "https://res.cloudinary.com/demo-english-manager/image/upload/c_fill,w_640,h_360,f_auto,q_auto/english-manager/podcasts/2026/11/podcast-ep12-thumbnail",
    isPublic: true,
    ownerId: "admin",
    category: "podcast_thumbnail",
    createdAt: "2026-11-10T10:15:00.000Z",
    updatedAt: "2026-11-10T10:15:00.000Z",
    deletedAt: null,
    referencedBy: [],
  },
  {
    id: "sf-aud-1",
    originalName: "episode-012-hedging-academic-writing.mp3",
    storedName: "podcasts/2026/11/episode-012-hedging-academic-writing.mp3",
    provider: "supabase",
    fileType: "AUDIO",
    mimeType: "audio/mpeg",
    fileSize: 19398656,
    bucketName: "english-manager-public",
    storagePath: "podcasts/2026/11/episode-012-hedging-academic-writing.mp3",
    cloudinaryPublicId: null,
    publicUrl:
      "https://example.supabase.co/storage/v1/object/public/english-manager-public/podcasts/2026/11/episode-012-hedging-academic-writing.mp3",
    isPublic: true,
    ownerId: "admin",
    category: "podcasts",
    createdAt: "2026-11-04T14:00:00.000Z",
    updatedAt: "2026-11-04T14:00:00.000Z",
    deletedAt: null,
    referencedBy: ["resource:res-4"],
  },
  {
    id: "sf-pdf-1",
    originalName: "120-academic-collocations-handbook.pdf",
    storedName: "resources/vocabulary/2026/11/120-academic-collocations-handbook.pdf",
    provider: "supabase",
    fileType: "PDF",
    mimeType: "application/pdf",
    fileSize: 3355443,
    bucketName: "english-manager-public",
    storagePath: "resources/vocabulary/2026/11/120-academic-collocations-handbook.pdf",
    cloudinaryPublicId: null,
    publicUrl:
      "https://example.supabase.co/storage/v1/object/public/english-manager-public/resources/vocabulary/2026/11/120-academic-collocations-handbook.pdf",
    isPublic: true,
    ownerId: "admin",
    category: "resources/vocabulary",
    createdAt: "2026-11-11T09:00:00.000Z",
    updatedAt: "2026-11-11T09:00:00.000Z",
    deletedAt: null,
    referencedBy: ["resource:res-1"],
  },
  {
    id: "sf-pdf-2",
    originalName: "ielts-mock-test-q4-2026.pdf",
    storedName: "exams/2026/11/ielts-mock-test-q4-2026.pdf",
    provider: "supabase",
    fileType: "PDF",
    mimeType: "application/pdf",
    fileSize: 4823449,
    bucketName: "english-manager-private",
    storagePath: "exams/2026/11/ielts-mock-test-q4-2026.pdf",
    cloudinaryPublicId: null,
    publicUrl: null,
    isPublic: false,
    ownerId: "admin",
    category: "exams",
    createdAt: "2026-11-12T15:30:00.000Z",
    updatedAt: "2026-11-12T15:30:00.000Z",
    deletedAt: null,
    referencedBy: ["resource:res-6"],
  },
];

// -----------------------------------------------------------------------------
// 7.5. CURRICULUM PRESETS (KHUNG GIÁO TRÌNH MẪU ĐỊNH SẴN)
// -----------------------------------------------------------------------------

export const CURRICULUM_PRESETS: CurriculumPreset[] = [
  {
    id: "preset-basic-8w",
    name: "Mất gốc & Lấy lại căn bản cấp tốc (8 tuần)",
    level: "A1 → A2",
    targetBand: "IELTS 3.0–3.5+",
    totalWeeks: 8,
    curriculum: [
      { weekNumber: 1, title: "Bảng phiên âm IPA & Chuẩn hóa phát âm" },
      { weekNumber: 2, title: "12 thì cơ bản & Ngữ pháp cấu trúc câu" },
      { weekNumber: 3, title: "Danh từ, Đại từ & Giới từ thông dụng" },
      { weekNumber: 4, title: "Kỹ năng nghe hội thoại sinh hoạt hàng ngày" },
      { weekNumber: 5, title: "Kỹ năng đọc hiểu mẩu tin & thư ngắn" },
      { weekNumber: 6, title: "Thực hành nói phản xạ giao tiếp căn bản" },
      { weekNumber: 7, title: "Mở rộng vốn từ vựng gia đình & công việc" },
      { weekNumber: 8, title: "Ôn tập tổng hợp & Kiểm tra đánh giá cuối khóa" },
    ],
  },
  {
    id: "preset-found-14w",
    name: "IELTS Foundation (Band 5.0–6.0) (14 tuần)",
    level: "B1+ → B2",
    targetBand: "5.5 – 6.5",
    totalWeeks: 14,
    curriculum: [
      { weekNumber: 1, title: "IELTS Overview & Listening Part 1" },
      { weekNumber: 2, title: "Reading Question Types & Skimming" },
      { weekNumber: 3, title: "Writing Task 1: Line Graph & Bar Chart" },
      { weekNumber: 4, title: "Speaking Part 1: Fluency & Pronunciation" },
      { weekNumber: 5, title: "Listening Part 2: Map & Multiple Choice" },
      { weekNumber: 6, title: "Reading: True/False/Not Given Mastery" },
      {
        weekNumber: 7,
        title: "Paragraph Structure & Paraphrasing",
        attachments: [
          {
            id: "att-if-01-w7-1",
            name: "Slide-Bai-Giang-Tuan-7-Paragraph-Structure.pdf",
            url: "/documents/sample-slide.pdf",
            size: "2.4 MB",
            sizeBytes: 2516582,
            type: "SLIDE",
            uploadedAt: "10/11/2026",
            classCode: "IF-01",
            weekNumber: 7,
          },
          {
            id: "att-if-01-w7-2",
            name: "Phieu-Bai-Tap-Paraphrasing-Practice-Task-1.docx",
            url: "/documents/sample-worksheet.docx",
            size: "1.1 MB",
            sizeBytes: 1153433,
            type: "DOCX",
            uploadedAt: "10/11/2026",
            classCode: "IF-01",
            weekNumber: 7,
          },
        ],
      },
      { weekNumber: 8, title: "Writing Task 2: Opinion Essay" },
      { weekNumber: 9, title: "Speaking Part 2: Long Turn & Cue Card Strategy" },
      { weekNumber: 10, title: "Listening Part 3: Academic Discussion" },
      { weekNumber: 11, title: "Reading: Matching Headings & Features" },
      { weekNumber: 12, title: "Writing Task 2: Discussion Both Views" },
      { weekNumber: 13, title: "Speaking Part 3: Abstract Ideas & Complex Structures" },
      { weekNumber: 14, title: "Mock Test 4 Kỹ năng & Đánh giá đầu ra" },
    ],
  },
  {
    id: "preset-int-16w",
    name: "IELTS Intensive (Band 6.5–7.5+) (16 tuần)",
    level: "B2 → C1",
    targetBand: "7.0 – 8.0",
    totalWeeks: 16,
    curriculum: [
      {
        weekNumber: 1,
        title: "Advanced Lexical Resource & Collocations",
        attachments: [
          {
            id: "att-ii-01-w1-1",
            name: "Cambridge-18-Academic-Test-2-Collocations.pdf",
            url: "/documents/cambridge-18.pdf",
            size: "3.8 MB",
            sizeBytes: 3984588,
            type: "PDF",
            uploadedAt: "08/11/2026",
            classCode: "II-01",
            weekNumber: 1,
          },
          {
            id: "att-ii-01-w1-2",
            name: "Bo-Flashcards-120-Academic-Collocations.docx",
            url: "/documents/collocations-handout.docx",
            size: "850 KB",
            sizeBytes: 870400,
            type: "DOCX",
            uploadedAt: "08/11/2026",
            classCode: "II-01",
            weekNumber: 1,
          },
        ],
      },
      { weekNumber: 2, title: "Listening Part 1 & 2: Distractors & Speed Drill" },
      { weekNumber: 3, title: "Reading: Speed Reading & Inference Questions" },
      { weekNumber: 4, title: "Writing Task 1: Complex Mixed Charts & Process" },
      { weekNumber: 5, title: "Speaking Part 1 & 2: Natural Idiomatic Phrasing" },
      { weekNumber: 6, title: "Writing Task 2: Causes/Solutions & Two-part Question" },
      { weekNumber: 7, title: "Listening Part 3: Academic Lecture & Multiple Speakers" },
      { weekNumber: 8, title: "Reading: Complex Science & History Texts" },
      {
        weekNumber: 9,
        title: "Argumentative Essay & Listening Part 3",
        attachments: [
          {
            id: "att-ii-01-w9-1",
            name: "Slide-Writing-Task-2-Counter-Argument.pdf",
            url: "/documents/counter-argument-slide.pdf",
            size: "4.2 MB",
            sizeBytes: 4404019,
            type: "SLIDE",
            uploadedAt: "12/11/2026",
            classCode: "II-01",
            weekNumber: 9,
          },
        ],
      },
      { weekNumber: 10, title: "Writing Task 1: Map Comparison & Advanced Flow" },
      { weekNumber: 11, title: "Speaking Part 3: Debate & Critical Stance" },
      { weekNumber: 12, title: "Listening Part 4: Monologue & Note Completion" },
      { weekNumber: 13, title: "Writing Task 2: High-band Counter-argument & Rebuttal" },
      { weekNumber: 14, title: "Reading: Time Management under 55 mins" },
      { weekNumber: 15, title: "Full Mock Exam & Intensive One-on-one Feedback" },
      { weekNumber: 16, title: "Exam Psychology & Final Strategy Checklist" },
    ],
  },
  {
    id: "preset-writing-10w",
    name: "Academic Writing & Critical Thinking (10 tuần)",
    level: "B2 → C1",
    targetBand: "Writing 7.0+",
    totalWeeks: 10,
    curriculum: [
      { weekNumber: 1, title: "Academic Voice & Formality" },
      { weekNumber: 2, title: "Sentence Structure & Cohesion Devices" },
      { weekNumber: 3, title: "Paragraph Logic: Claim, Evidence, Analysis" },
      { weekNumber: 4, title: "Data Commentary & Synthesizing Sources" },
      { weekNumber: 5, title: "Writing with Critical Tone & Objectivity" },
      { weekNumber: 6, title: "Research Synthesis & Hedging" },
      { weekNumber: 7, title: "Argumentative Rhetoric & Avoiding Fallacies" },
      { weekNumber: 8, title: "Literature Review Structure" },
      { weekNumber: 9, title: "Peer Review Workshop & Advanced Editing" },
      { weekNumber: 10, title: "Final Paper Presentation & Evaluation" },
    ],
  },
  {
    id: "preset-junior-12w",
    name: "Junior Academic Explorers (12 tuần)",
    level: "A2+ → B1",
    targetBand: "Cambridge B1 Preliminary",
    totalWeeks: 12,
    curriculum: [
      { weekNumber: 1, title: "Ice-breaker & Storytelling Fundamentals" },
      { weekNumber: 2, title: "World Geography & Nature Vocabulary" },
      { weekNumber: 3, title: "Animal Habitats & Simple Science Reading" },
      { weekNumber: 4, title: "Creative Writing: My Imaginary Adventure" },
      { weekNumber: 5, title: "Cambridge B1 Listening: Everyday Dialogues" },
      { weekNumber: 6, title: "Pronunciation: Intonation & Linking Sounds" },
      { weekNumber: 7, title: "Historical Heroes & Past Tense Narration" },
      { weekNumber: 8, title: "Public Speaking & Science Reading" },
      { weekNumber: 9, title: "Debate for Kids: Technology in School" },
      { weekNumber: 10, title: "Writing an Informal Letter to a Penpal" },
      { weekNumber: 11, title: "Cambridge B1 Mock Test Practice" },
      { weekNumber: 12, title: "Project Showcase & Graduation Celebration" },
    ],
  },
];

// -----------------------------------------------------------------------------
// 8. ADMIN CLASSES & STUDENT RECORDS (SERVER / AUTHENTICATED ONLY)
// -----------------------------------------------------------------------------

export const CLASSROOMS_DATA: ClassroomGroup[] = [
  {
    id: "cls-ii-01",
    code: "II-01",
    name: "IELTS Intensive (Band 6.5–7.5+)",
    level: "B2 → C1",
    targetBand: "7.0 – 8.0",
    scheduleSummary: "Thứ 3 & Thứ 6 · 18:00 – 20:15",
    room: "Phòng 302",
    enrolled: 2,
    capacity: 12,
    attendanceRate: 96.5,
    averageScore: 7.4,
    currentModule: "Tuần 9/16 · Argumentative Essay & Listening Part 3",
    status: "active",
    totalWeeks: 16,
    currentWeekIndex: 9,
    curriculum: CURRICULUM_PRESETS[2].curriculum,
    tuitionDueDate: "2026-11-20",
  },
  {
    id: "cls-if-01",
    code: "IF-01",
    name: "IELTS Foundation (Band 5.0–6.0)",
    level: "B1+ → B2",
    targetBand: "5.5 – 6.5",
    scheduleSummary: "Thứ 2 & Thứ 5 · 17:45 – 19:45",
    room: "Phòng 302",
    enrolled: 2,
    capacity: 15,
    attendanceRate: 94.2,
    averageScore: 6.1,
    currentModule: "Tuần 7/14 · Paragraph Structure & Paraphrasing",
    status: "active",
    totalWeeks: 14,
    currentWeekIndex: 7,
    curriculum: CURRICULUM_PRESETS[1].curriculum,
    tuitionDueDate: "2026-11-20",
  },
  {
    id: "cls-aw-02",
    code: "AW-02",
    name: "Academic Writing & Critical Thinking",
    level: "B2 → C1",
    targetBand: "Writing 7.0+",
    scheduleSummary: "Thứ 5 (19:50) & Thứ 7 (09:00)",
    room: "Phòng 302",
    enrolled: 1,
    capacity: 10,
    attendanceRate: 98.0,
    averageScore: 7.6,
    currentModule: "Tuần 6/10 · Research Synthesis & Hedging",
    status: "active",
    totalWeeks: 10,
    currentWeekIndex: 6,
    curriculum: CURRICULUM_PRESETS[3].curriculum,
    tuitionDueDate: "2026-11-20",
  },
  {
    id: "cls-ja-01",
    code: "JA-01",
    name: "Junior Academic Explorers",
    level: "A2+ → B1",
    targetBand: "Cambridge B1 Preliminary",
    scheduleSummary: "Thứ 4 (17:30) & Chủ Nhật (08:30)",
    room: "Phòng 204",
    enrolled: 1,
    capacity: 16,
    attendanceRate: 95.0,
    averageScore: 8.2,
    currentModule: "Tuần 8/12 · Public Speaking & Science Reading",
    status: "active",
    totalWeeks: 12,
    currentWeekIndex: 8,
    curriculum: CURRICULUM_PRESETS[4].curriculum,
    tuitionDueDate: "2026-11-25",
  },
  {
    id: "cls-mg-05",
    code: "MG-05",
    name: "Basic Level (Mất gốc - Lấy lại gốc cấp tốc)",
    level: "A1 → A2 (Mất gốc)",
    targetBand: "IELTS 3.0–3.5+",
    scheduleSummary: "Thứ 2 (14:30 – 16:30) & Thứ 7 (19:50 – 21:30)",
    room: "Phòng 302 · Cơ sở Nguyễn Du",
    enrolled: 0,
    capacity: 15,
    attendanceRate: 100,
    averageScore: 0,
    currentModule: "Tuần 1/8 · Bảng phiên âm IPA & Chuẩn hóa phát âm",
    status: "active",
    totalWeeks: 8,
    currentWeekIndex: 1,
    curriculum: CURRICULUM_PRESETS[0].curriculum,
    tuitionDueDate: "2026-11-20",
  },
];

export const ADMIN_STUDENTS_DATA: AdminStudentRecord[] = [
  {
    id: "stu-01",
    code: "HS-2026-01",
    fullName: "Trần Bảo Ngọc",
    classId: "cls-ii-01",
    className: "IELTS Intensive (Band 6.5–7.5+)",
    level: "C1",
    joinedAt: "05/08/2026",
    attendanceRate: 100,
    averageScore: 8.0,
    targetGoal: "IELTS 8.0 (Du học Úc)",
    tuitionStatus: "paid",
    tuitionPeriod: "Học kỳ II (Tháng 11 – 01)",
    tuitionAmount: "6.400.000 ₫",
    parentRelation: "Phụ huynh: Cô Thu Hà (Mẹ)",
    parentContactMasked: "0903 ••• 812",
    status: "active",
    recentComment:
      "Tư duy lập luận rất trưởng thành. Cần duy trì tốc độ kiểm soát thời gian ở Task 1 dưới 18 phút.",
    grades: [
      {
        id: "gr-1",
        assessmentTitle: "Mock Test #3 — Toàn diện 4 kỹ năng",
        date: "08/11/2026",
        listening: 8.5,
        reading: 8.5,
        writing: 7.5,
        speaking: 7.5,
        overall: 8.0,
        comment:
          "Bài Writing Task 2 sử dụng Hedging rất tự nhiên. Phần Speaking Part 3 trả lời sâu, từ vựng học thuật chính xác.",
      },
      {
        id: "gr-2",
        assessmentTitle: "Chuyên đề Academic Writing — Argumentative Essay",
        date: "25/10/2026",
        listening: 8.0,
        reading: 8.5,
        writing: 7.5,
        speaking: 7.0,
        overall: 7.75,
        comment:
          "Đã khắc phục triệt để lỗi câu quá dài. Luận điểm đoạn thân bài thứ 2 rất thuyết phục.",
      },
      {
        id: "gr-3",
        assessmentTitle: "Mock Test #2 — Giữa khóa",
        date: "04/10/2026",
        listening: 8.0,
        reading: 8.0,
        writing: 7.0,
        speaking: 7.0,
        overall: 7.5,
        comment: "Nền tảng đọc – nghe vững chắc. Cần mở rộng thêm vốn collocations chủ đề Kinh tế.",
      },
      {
        id: "gr-4",
        assessmentTitle: "Placement & Diagnostic Test",
        date: "15/08/2026",
        listening: 7.5,
        reading: 7.5,
        writing: 6.5,
        speaking: 6.5,
        overall: 7.0,
        comment: "Đầu vào tốt, phát âm rõ ràng, cần rèn thêm cấu trúc đoạn văn học thuật.",
      },
    ],
    attendanceHistory: [
      {
        date: "10/11/2026",
        sessionName: "Ca Thứ Ba · Writing Task 2: Counter-argument",
        status: "present",
        note: "Hoàn thành bài mẫu tại lớp xuất sắc",
      },
      {
        date: "06/11/2026",
        sessionName: "Ca Thứ Sáu · Speaking Part 3: Abstract Topics",
        status: "present",
      },
      {
        date: "03/11/2026",
        sessionName: "Ca Thứ Ba · Reading: Matching Information",
        status: "present",
      },
      {
        date: "30/10/2026",
        sessionName: "Ca Thứ Sáu · Listening Section 4 Note Completion",
        status: "present",
      },
      {
        date: "27/10/2026",
        sessionName: "Ca Thứ Ba · Lexical Resource Workshop",
        status: "present",
      },
    ],
  },
  {
    id: "stu-02",
    code: "HS-2026-02",
    fullName: "Lê Hoàng Minh Khôi",
    classId: "cls-aw-02",
    className: "Academic Writing & Critical Thinking",
    level: "B2+",
    joinedAt: "12/08/2026",
    attendanceRate: 96,
    averageScore: 7.8,
    targetGoal: "Writing 7.5+ & Học bổng",
    tuitionStatus: "paid",
    tuitionPeriod: "Học kỳ II (Tháng 11 – 01)",
    tuitionAmount: "5.800.000 ₫",
    parentRelation: "Phụ huynh: Anh Hoàng Nam (Bố)",
    parentContactMasked: "0918 ••• 405",
    status: "active",
    recentComment:
      "Khả năng tổng hợp tài liệu nghiên cứu và trích dẫn dẫn chứng rất sắc sảo.",
    grades: [
      {
        id: "gr-201",
        assessmentTitle: "Research Essay Milestone #2",
        date: "07/11/2026",
        listening: 8.0,
        reading: 8.5,
        writing: 8.0,
        speaking: 7.0,
        overall: 7.8,
        comment: "Cấu trúc bài viết chặt chẽ, sử dụng Nominalization chuẩn xác.",
      },
      {
        id: "gr-202",
        assessmentTitle: "Critical Summary & Paraphrasing Test",
        date: "17/10/2026",
        listening: 7.5,
        reading: 8.0,
        writing: 7.5,
        speaking: 7.0,
        overall: 7.5,
        comment: "Diễn đạt lại ý tưởng gốc mạch lạc, không bị phụ thuộc cấu trúc câu gốc.",
      },
    ],
    attendanceHistory: [
      {
        date: "07/11/2026",
        sessionName: "Ca Thứ Bảy · Cohesion & Nominalization",
        status: "present",
      },
      {
        date: "05/11/2026",
        sessionName: "Ca Thứ Năm · 1:1 Essay Feedback",
        status: "present",
      },
      {
        date: "31/10/2026",
        sessionName: "Ca Thứ Bảy · Critical Reading Synthesis",
        status: "late",
        note: "Đến muộn 10 phút do kẹt xe, đã báo trước",
      },
    ],
  },
  {
    id: "stu-03",
    code: "HS-2026-03",
    fullName: "Phạm Hà Phương",
    classId: "cls-if-01",
    className: "IELTS Foundation (Band 5.0–6.0)",
    level: "B1+",
    joinedAt: "01/09/2026",
    attendanceRate: 95,
    averageScore: 6.2,
    targetGoal: "IELTS 6.5 (Xét tuyển ĐH)",
    tuitionStatus: "due-soon",
    tuitionPeriod: "Học kỳ II (Hạn 20/11/2026)",
    tuitionAmount: "5.200.000 ₫",
    parentRelation: "Phụ huynh: Cô Thanh Mai (Mẹ)",
    parentContactMasked: "0982 ••• 119",
    status: "active",
    recentComment:
      "Tăng 1.5 band kể từ đầu khóa. Cần chú ý phát âm âm cuối (ending sounds) trong Speaking.",
    grades: [
      {
        id: "gr-301",
        assessmentTitle: "Mid-term Progress Test",
        date: "05/11/2026",
        listening: 6.5,
        reading: 6.5,
        writing: 6.0,
        speaking: 6.0,
        overall: 6.2,
        comment: "Kỹ năng Nghe và Đọc tiến bộ rất nhanh. Cần luyện thêm dạng bài Map Labeling.",
      },
    ],
    attendanceHistory: [
      {
        date: "09/11/2026",
        sessionName: "Ca Thứ Hai · Reading Matching Headings",
        status: "present",
      },
      {
        date: "05/11/2026",
        sessionName: "Ca Thứ Năm · Listening Section 3",
        status: "present",
      },
    ],
  },
  {
    id: "stu-04",
    code: "HS-2026-04",
    fullName: "Nguyễn Đức Anh",
    classId: "cls-ii-01",
    className: "IELTS Intensive (Band 6.5–7.5+)",
    level: "B2+",
    joinedAt: "05/08/2026",
    attendanceRate: 92,
    averageScore: 7.5,
    targetGoal: "IELTS 7.5 Overall",
    tuitionStatus: "paid",
    tuitionPeriod: "Học kỳ II (Tháng 11 – 01)",
    tuitionAmount: "6.400.000 ₫",
    parentRelation: "Phụ huynh: Anh Minh Đức (Bố)",
    parentContactMasked: "0936 ••• 720",
    status: "active",
    recentComment:
      "Đạt 9.0 Reading trong bài thi thử tuần 45. Cần phân bổ thêm thời gian luyện Speaking Part 2.",
    grades: [
      {
        id: "gr-401",
        assessmentTitle: "Mock Test #3 — Toàn diện 4 kỹ năng",
        date: "08/11/2026",
        listening: 8.0,
        reading: 9.0,
        writing: 6.5,
        speaking: 6.5,
        overall: 7.5,
        comment: "Điểm Reading tuyệt đối. Cần nâng độ đa dạng cấu trúc câu phức trong Writing.",
      },
    ],
    attendanceHistory: [
      {
        date: "10/11/2026",
        sessionName: "Ca Thứ Ba · Writing Task 2",
        status: "present",
      },
      {
        date: "06/11/2026",
        sessionName: "Ca Thứ Sáu · Speaking Part 3",
        status: "excused",
        note: "Xin phép nghỉ thi học sinh giỏi cấp trường (đã học bù qua video)",
      },
    ],
  },
  {
    id: "stu-05",
    code: "HS-2026-05",
    fullName: "Vũ Thanh Trúc",
    classId: "cls-ja-01",
    className: "Junior Academic Explorers",
    level: "B1",
    joinedAt: "10/09/2026",
    attendanceRate: 100,
    averageScore: 8.6,
    targetGoal: "Cambridge B1 Pass with Distinction",
    tuitionStatus: "paid",
    tuitionPeriod: "Học kỳ II (Tháng 11 – 01)",
    tuitionAmount: "4.800.000 ₫",
    parentRelation: "Phụ huynh: Chị Ngọc Lan (Mẹ)",
    parentContactMasked: "0974 ••• 338",
    status: "active",
    recentComment:
      "Phong thái thuyết trình tự tin, phát âm chuẩn và luôn chủ động hỗ trợ các bạn trong nhóm.",
    grades: [
      {
        id: "gr-501",
        assessmentTitle: "Science Presentation & Reading Check",
        date: "08/11/2026",
        listening: 8.5,
        reading: 8.5,
        writing: 8.0,
        speaking: 9.0,
        overall: 8.6,
        comment: "Bài thuyết trình mạch lạc, sử dụng visual aids rất sáng tạo.",
      },
    ],
    attendanceHistory: [
      {
        date: "11/11/2026",
        sessionName: "Ca Thứ Tư · Academic Presentation",
        status: "present",
      },
    ],
  },
  {
    id: "stu-06",
    code: "HS-2026-06",
    fullName: "Đặng Quốc Huy",
    classId: "cls-if-01",
    className: "IELTS Foundation (Band 5.0–6.0)",
    level: "B1",
    joinedAt: "01/09/2026",
    attendanceRate: 88,
    averageScore: 5.8,
    targetGoal: "IELTS 6.0",
    tuitionStatus: "overdue",
    tuitionPeriod: "Học kỳ II (Quá hạn 5 ngày)",
    tuitionAmount: "5.200.000 ₫",
    parentRelation: "Phụ huynh: Anh Quốc Tuấn (Bố)",
    parentContactMasked: "0945 ••• 901",
    status: "active",
    recentComment:
      "Thái độ học tập tích cực, nộp đủ bài sửa lần 2. Cần ôn tập kỹ thì Hiện tại hoàn thành và Mệnh đề quan hệ.",
    grades: [
      {
        id: "gr-601",
        assessmentTitle: "Mid-term Progress Test",
        date: "05/11/2026",
        listening: 6.0,
        reading: 6.0,
        writing: 5.5,
        speaking: 5.5,
        overall: 5.8,
        comment: "Đã nắm được cách phân bổ thời gian làm bài Reading.",
      },
    ],
    attendanceHistory: [
      {
        date: "09/11/2026",
        sessionName: "Ca Thứ Hai · Reading Matching Headings",
        status: "present",
      },
      {
        date: "05/11/2026",
        sessionName: "Ca Thứ Năm · Listening Section 3",
        status: "absent",
        note: "Vắng mặt (cô đã gửi tài liệu bù)",
      },
    ],
  },
];

/**
 * Verifies student lookup credentials (Mã học sinh + mật khẩu tĩnh).
 * Default demo access code for testing: "123456" (or "HS2026").
 */
export function authenticateStudentPortal(
  studentCode: string,
  accessKey: string,
): AdminStudentRecord | null {
  const normalizedCode = studentCode.trim().toUpperCase();
  const normalizedKey = accessKey.trim();

  if (normalizedKey !== "123456" && normalizedKey !== "HS2026") {
    return null;
  }

  return (
    ADMIN_STUDENTS_DATA.find((student) => student.code.toUpperCase() === normalizedCode) ?? null
  );
}

// -----------------------------------------------------------------------------
// 9. INITIAL CLASS SESSIONS, TEACHING JOURNALS & SESSION LEARNING HISTORY
// -----------------------------------------------------------------------------

export const CLASS_SESSIONS_DATA: ClassSessionRecord[] = [
  {
    id: "cs-2026-11-16-if01",
    classId: "cls-if-01",
    classCode: "IF-01",
    className: "IELTS Foundation (Band 5.0–6.0)",
    date: "2026-11-16",
    dayLabel: "Thứ Hai",
    startTime: "17:45",
    endTime: "19:45",
    room: "Phòng 204 · Cơ sở Nguyễn Du",
    weekNumber: 7,
    topic: "Reading – Matching Headings & Paraphrasing Core Ideas",
    objectives:
      "Nắm vững chiến thuật đọc lướt xác định Topic Sentence, tránh bẫy từ vựng lặp lại (word-spotting trap) và nâng tỷ lệ đúng dạng Matching Headings lên trên 75%.",
    completionResult: "completed",
    generalNotes:
      "Lớp tham gia thảo luận tích cực phần phân tích từ đồng nghĩa. Tuy nhiên một số học viên còn mất nhiều thời gian ở đoạn văn trừu tượng về Môi trường.",
    homework:
      "Cambridge IELTS 17 – Test 2, Reading Passage 2 (câu 14–26) + Bảng Paraphrase 15 cụm từ học thuật.",
    nextSessionPlan:
      "Chữa chi tiết bài tập Passage 2 và chuyển sang kỹ thuật viết câu chủ đề (Topic Sentence) trong Writing Task 2.",
    journalStatus: "completed",
    attachments: [
      {
        id: "att-if01-1",
        name: "Handout_Matching_Headings_Strategy.pdf",
        type: "PDF",
        size: "1.8 MB",
      },
      {
        id: "att-if01-2",
        name: "Slide_Paraphrasing_Patterns_Week7.pdf",
        type: "SLIDE",
        size: "3.2 MB",
      },
    ],
    revisions: [
      {
        id: "rev-if01-1",
        updatedAt: "16/11/2026 20:10",
        summary: "Khởi tạo nhật ký sau buổi học và ghi nhận bài tập về nhà",
        previousTopic: "Reading – Matching Headings",
        previousNotes: "Đã dạy xong phần lý thuyết.",
        previousCompletionResult: "partial",
      },
    ],
    studentRecords: [
      {
        id: "ssr-if01-1611-stu03",
        sessionId: "cs-2026-11-16-if01",
        studentId: "stu-03",
        studentCode: "HS-2026-03",
        studentName: "Phạm Hà Phương",
        attendance: "present",
        homeworkStatus: "submitted",
        learningStatus: "good",
        skill: "Reading",
        score: 7.0,
        teacherFeedback:
          "Đạt 8/10 câu đúng dạng Matching Headings. Xác định câu chủ đề đoạn văn nhanh và chính xác.",
        followUp: "Duy trì tốc độ đọc 18 phút/passage.",
      },
      {
        id: "ssr-if01-1611-stu06",
        sessionId: "cs-2026-11-16-if01",
        studentId: "stu-06",
        studentCode: "HS-2026-06",
        studentName: "Đặng Quốc Huy",
        attendance: "present",
        homeworkStatus: "not-submitted",
        learningStatus: "needs-support",
        skill: "Reading",
        score: 5.5,
        teacherFeedback:
          "Có mặt đầy đủ nhưng chưa hoàn thành bài tập từ vựng về nhà. Đạt 5/10 câu do còn dịch từng từ.",
        followUp: "Cần nộp bù bảng từ vựng trước thứ Năm và rèn kỹ năng đọc lấy ý chính.",
      },
    ],
    updatedAt: "2026-11-16T20:15:00.000Z",
  },
  {
    id: "cs-2026-11-14-ii01",
    classId: "cls-ii-01",
    classCode: "II-01",
    className: "IELTS Intensive (Band 6.5–7.5+)",
    date: "2026-11-14",
    dayLabel: "Thứ Sáu",
    startTime: "18:00",
    endTime: "20:15",
    room: "Phòng 302 · Cơ sở Nguyễn Du",
    weekNumber: 9,
    topic: "Writing Task 2 – Counter-Argument & Concession Paragraphs",
    objectives:
      "Xây dựng đoạn phản biện (Counter-argument) sắc bén cho đề bài Opinion/Discussion ở mức Band 7.5+, sử dụng mệnh đề nhượng bộ và hedging chuẩn học thuật.",
    completionResult: "completed",
    generalNotes:
      "Học viên nắm rất tốt cấu trúc Concession. Bài viết thực hành tại lớp trong 25 phút đạt độ mạch lạc cao, cần chú ý thêm sự đa dạng của Collocations chủ đề Công nghệ.",
    homework:
      "Hoàn thiện bài luận 280 từ chủ đề AI in Higher Education và tự đánh giá theo Checklist Band 7.5.",
    nextSessionPlan:
      "Sửa bài chi tiết 1:1 cho từng học viên và luyện Listening Section 4 Note Completion.",
    journalStatus: "completed",
    attachments: [
      {
        id: "att-ii01-1",
        name: "Writing_Task2_CounterArgument_Models_Band8.pdf",
        type: "PDF",
        size: "2.4 MB",
      },
    ],
    revisions: [],
    studentRecords: [
      {
        id: "ssr-ii01-1411-stu01",
        sessionId: "cs-2026-11-14-ii01",
        studentId: "stu-01",
        studentCode: "HS-2026-01",
        studentName: "Trần Bảo Ngọc",
        attendance: "present",
        homeworkStatus: "submitted",
        learningStatus: "good",
        skill: "Writing",
        score: 8.0,
        teacherFeedback:
          "Hoàn thành bài viết xuất sắc, lập luận phản biện chặt chẽ và sử dụng từ nối học thuật tự nhiên.",
        followUp: "Thử nghiệm thêm cấu trúc đảo ngữ nhẹ trong câu kết đoạn.",
      },
      {
        id: "ssr-ii01-1411-stu04",
        sessionId: "cs-2026-11-14-ii01",
        studentId: "stu-04",
        studentCode: "HS-2026-04",
        studentName: "Nguyễn Đức Anh",
        attendance: "present",
        homeworkStatus: "submitted",
        learningStatus: "satisfactory",
        skill: "Writing",
        score: 6.5,
        teacherFeedback:
          "Hoàn thành bài viết đúng thời gian nhưng còn yếu về cách phát triển luận điểm phụ ở đoạn Body 2.",
        followUp: "Cần bổ sung ví dụ cụ thể (Specific Example) thay vì nêu nhận định chung chung.",
      },
    ],
    updatedAt: "2026-11-14T20:40:00.000Z",
  },
  {
    id: "cs-2026-11-13-ja01",
    classId: "cls-ja-01",
    classCode: "JA-01",
    className: "Junior Academic Explorers",
    date: "2026-11-13",
    dayLabel: "Thứ Năm",
    startTime: "17:45",
    endTime: "19:30",
    room: "Phòng 401 · Cơ sở Nguyễn Du",
    weekNumber: 6,
    topic: "Reading Club & Science Storytelling Presentation",
    objectives:
      "Rèn kỹ năng thuyết trình khoa học bằng tiếng Anh theo cấu trúc Hook – Problem – Discovery – Conclusion và phản biện câu hỏi từ bạn cùng lớp.",
    completionResult: "completed",
    generalNotes:
      "Không khí lớp sôi nổi, học sinh tự tin đặt câu hỏi phản biện bằng tiếng Anh và sử dụng tốt ngữ điệu nhấn mạnh.",
    homework:
      "Thu âm đoạn Audio 2 phút tóm tắt bài thuyết trình đã chỉnh sửa.",
    nextSessionPlan:
      "Nghe phân tích podcast khoa học ngắn và mở rộng từ vựng chủ đề Renewable Energy.",
    journalStatus: "completed",
    attachments: [
      {
        id: "att-ja01-1",
        name: "Science_Storytelling_Rubric_B1.pdf",
        type: "WORKSHEET",
        size: "1.1 MB",
      },
    ],
    revisions: [],
    studentRecords: [
      {
        id: "ssr-ja01-1311-stu05",
        sessionId: "cs-2026-11-13-ja01",
        studentId: "stu-05",
        studentCode: "HS-2026-05",
        studentName: "Vũ Thanh Trúc",
        attendance: "present",
        homeworkStatus: "submitted",
        learningStatus: "good",
        skill: "Speaking",
        score: 9.0,
        teacherFeedback:
          "Thuyết trình mạch lạc, phát âm rõ ràng và trả lời câu hỏi phản biện rất thông minh.",
        followUp: "Khuyến khích tham gia dự án thuyết trình mẫu của khóa.",
      },
    ],
    updatedAt: "2026-11-13T20:00:00.000Z",
  },
  {
    id: "cs-2026-11-12-if01",
    classId: "cls-if-01",
    classCode: "IF-01",
    className: "IELTS Foundation (Band 5.0–6.0)",
    date: "2026-11-12",
    dayLabel: "Thứ Năm",
    startTime: "17:45",
    endTime: "19:45",
    room: "Phòng 204 · Cơ sở Nguyễn Du",
    weekNumber: 6,
    topic: "Listening Section 3 – Academic Discussion & Distractors",
    objectives:
      "Nhận diện bẫy đổi ý (Self-correction distractors) trong cuộc thảo luận giữa sinh viên và giảng viên hướng dẫn.",
    completionResult: "partial",
    generalNotes:
      "Đã hoàn thành 2 bài nghe mẫu Section 3. Phần phân tích transcript bài số 3 còn 10 phút cuối chưa kịp đi sâu nên chuyển sang đầu buổi tiếp theo.",
    homework:
      "Nghe chép chính tả (Dictation) đoạn hội thoại Section 3 trang 42 và gạch chân các từ nối chỉ sự đối lập.",
    nextSessionPlan:
      "Chữa nhanh 10 phút phần transcript còn lại trước khi học Reading Matching Headings.",
    journalStatus: "completed",
    attachments: [],
    revisions: [],
    studentRecords: [
      {
        id: "ssr-if01-1211-stu03",
        sessionId: "cs-2026-11-12-if01",
        studentId: "stu-03",
        studentCode: "HS-2026-03",
        studentName: "Phạm Hà Phương",
        attendance: "present",
        homeworkStatus: "submitted",
        learningStatus: "good",
        skill: "Listening",
        score: 6.5,
        teacherFeedback:
          "Nghe bắt từ khóa tốt, nhận diện được 4/5 bẫy đổi thông tin của người nói.",
        followUp: "Chú ý chính tả danh từ số nhiều ở phần điền từ.",
      },
      {
        id: "ssr-if01-1211-stu06",
        sessionId: "cs-2026-11-12-if01",
        studentId: "stu-06",
        studentCode: "HS-2026-06",
        studentName: "Đặng Quốc Huy",
        attendance: "absent",
        homeworkStatus: "not-submitted",
        learningStatus: "needs-support",
        skill: "Listening",
        score: null,
        teacherFeedback:
          "Vắng học không phép, chưa nộp bài tập về nhà buổi trước.",
        followUp: "Liên hệ phụ huynh kiểm tra tình hình chuyên cần và gửi bản thu âm bài giảng.",
      },
    ],
    updatedAt: "2026-11-12T20:10:00.000Z",
  },
  {
    id: "cs-2026-11-11-ii01",
    classId: "cls-ii-01",
    classCode: "II-01",
    className: "IELTS Intensive (Band 6.5–7.5+)",
    date: "2026-11-11",
    dayLabel: "Thứ Ba",
    startTime: "18:00",
    endTime: "20:15",
    room: "Phòng 302 · Cơ sở Nguyễn Du",
    weekNumber: 9,
    topic: "Reading – Matching Information & Complex Inference",
    objectives:
      "Giải quyết dạng bài Matching Information kết hợp True/False/Not Given ở mức độ suy luận học thuật cao.",
    completionResult: "completed",
    generalNotes:
      "Cả lớp hoàn thành full test Reading Passage 3 trong 20 phút với độ chính xác trên 85%.",
    homework: "Phân tích 20 cấu trúc câu phức trong bài đọc Passage 3.",
    nextSessionPlan: "Chuyển sang Writing Task 2 Counter-Argument.",
    journalStatus: "completed",
    attachments: [],
    revisions: [],
    studentRecords: [
      {
        id: "ssr-ii01-1111-stu01",
        sessionId: "cs-2026-11-11-ii01",
        studentId: "stu-01",
        studentCode: "HS-2026-01",
        studentName: "Trần Bảo Ngọc",
        attendance: "present",
        homeworkStatus: "submitted",
        learningStatus: "good",
        skill: "Reading",
        score: 8.5,
        teacherFeedback: "Đạt 13/14 câu Passage 3, tốc độ xử lý thông tin rất tốt.",
        followUp: "Tiếp tục duy trì phong độ.",
      },
      {
        id: "ssr-ii01-1111-stu04",
        sessionId: "cs-2026-11-11-ii01",
        studentId: "stu-04",
        studentCode: "HS-2026-04",
        studentName: "Nguyễn Đức Anh",
        attendance: "present",
        homeworkStatus: "submitted",
        learningStatus: "good",
        skill: "Reading",
        score: 9.0,
        teacherFeedback: "Tuyệt đối 14/14 câu đúng, kỹ năng skimming/scanning xuất sắc.",
        followUp: "Dành thêm thời gian sang bổ trợ kỹ năng Writing & Speaking.",
      },
    ],
    updatedAt: "2026-11-11T20:30:00.000Z",
  },
  {
    id: "cs-2026-11-14-aw02",
    classId: "cls-aw-02",
    classCode: "AW-02",
    className: "Academic Writing & Critical Thinking",
    date: "2026-11-14",
    dayLabel: "Thứ Bảy",
    startTime: "09:00",
    endTime: "11:00",
    room: "Phòng 302 · Cơ sở Nguyễn Du",
    weekNumber: 6,
    topic: "Research Synthesis & Citation Ethics (APA 7th)",
    objectives:
      "Thực hành tổng hợp 3 nguồn tài liệu học thuật đối lập vào một đoạn Literature Synthesis mà không đạo văn.",
    completionResult: "partial",
    generalNotes:
      "Bản nháp nhật ký: Đã hướng dẫn xong kỹ thuật Synthesis Matrix, đang chờ học viên nộp đoạn viết hoàn chỉnh cuối giờ.",
    homework: "Viết đoạn Literature Review 350 từ trích dẫn tối thiểu 4 nguồn học thuật.",
    nextSessionPlan: "Phản biện chéo (Peer Review) và sửa lỗi Nominalization.",
    journalStatus: "draft",
    attachments: [],
    revisions: [],
    studentRecords: [
      {
        id: "ssr-aw02-1411-stu02",
        sessionId: "cs-2026-11-14-aw02",
        studentId: "stu-02",
        studentCode: "HS-2026-02",
        studentName: "Lê Hoàng Minh Khôi",
        attendance: "present",
        homeworkStatus: "submitted",
        learningStatus: "good",
        skill: "Writing",
        score: 8.0,
        teacherFeedback: "Tổng hợp tài liệu sắc sảo, trích dẫn đúng chuẩn APA 7th.",
        followUp: "Hoàn thiện phần Conclusion của bài tiểu luận.",
      },
    ],
    updatedAt: "2026-11-14T11:15:00.000Z",
  },
  {
    id: "cs-2026-11-17-ii01",
    classId: "cls-ii-01",
    classCode: "II-01",
    className: "IELTS Intensive (Band 6.5–7.5+)",
    date: "2026-11-17",
    dayLabel: "Thứ Ba",
    startTime: "18:00",
    endTime: "20:15",
    room: "Phòng 302 · Cơ sở Nguyễn Du",
    weekNumber: 10,
    topic: "Speaking Part 3 – Abstract Topics & Hedging Expressions",
    objectives:
      "Mở rộng câu trả lời Speaking Part 3 theo mô hình Point – Explanation – Speculation/Example với các cụm từ rào đón học thuật.",
    completionResult: "not-completed",
    generalNotes: "",
    homework: "",
    nextSessionPlan: "",
    journalStatus: "not-started",
    attachments: [],
    revisions: [],
    studentRecords: [
      {
        id: "ssr-ii01-1711-stu01",
        sessionId: "cs-2026-11-17-ii01",
        studentId: "stu-01",
        studentCode: "HS-2026-01",
        studentName: "Trần Bảo Ngọc",
        attendance: "present",
        homeworkStatus: "unrecorded",
        learningStatus: "unrecorded",
        skill: "Speaking",
        score: null,
        teacherFeedback: "",
        followUp: "",
      },
      {
        id: "ssr-ii01-1711-stu04",
        sessionId: "cs-2026-11-17-ii01",
        studentId: "stu-04",
        studentCode: "HS-2026-04",
        studentName: "Nguyễn Đức Anh",
        attendance: "present",
        homeworkStatus: "unrecorded",
        learningStatus: "unrecorded",
        skill: "Speaking",
        score: null,
        teacherFeedback: "",
        followUp: "",
      },
    ],
    updatedAt: "2026-11-17T08:00:00.000Z",
  },
];


