import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

import { isSafeHttpOrRelativeUrl, validate } from "./common";
import type {
  SettingsAuditLogEntry,
  SystemSettingsState,
  TeacherProfile,
} from "./domain-types";
import {
  fromPrismaStudentStatus,
  fromPrismaTuitionStatus,
  mapPrismaAnnouncement,
  mapPrismaPodcast,
  mapPrismaSettingsAuditLog,
  mapPrismaTeacherSetting,
  toPrismaJson,
} from "./prisma-mappers";
import {
  BRAND_DESIGN_TOKENS,
  DEFAULT_BRAND_THEME,
  SETTINGS_FIELD_LABELS,
} from "./settings-helpers";
import {
  cleanupReplacedCloudinaryImage,
  getStorageStatus,
} from "./storage.service";

export { BRAND_DESIGN_TOKENS };

const DEFAULT_TEACHER_SETTINGS: SystemSettingsState = {
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
  currentTerm: "Học kỳ I · Năm học 2026–2027",
  defaultPortalPin: "123456",
  autoNotifyParents: true,
  presignedExpirySeconds: 900,
  lowAttendanceThresholdPercent: 90,
  tuitionReminderDaysBefore: 7,
  requirePortalVerification: true,
};

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Mã màu phải đúng định dạng Hex (#RRGGBB).");

export const brandThemeSchema = z.object({
  primary: hexColorSchema,
  accent: hexColorSchema,
  secondary: hexColorSchema,
  warm: hexColorSchema,
  highlight: hexColorSchema,
});

export const updateSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Họ tên giáo viên không được để trống.")
    .max(120)
    .optional(),
  title: z
    .string()
    .trim()
    .min(1, "Danh xưng chuyên môn không được để trống.")
    .max(160)
    .optional(),
  slogan: z
    .string()
    .trim()
    .min(1, "Thông điệp sư phạm không được để trống.")
    .max(240)
    .optional(),
  shortBio: z.string().trim().max(1500).optional(),
  philosophy: z.string().trim().max(1500).optional(),
  experienceYears: z.coerce.number().int().min(0).max(100).optional(),
  totalStudents: z.coerce.number().int().min(0).optional(),
  bandAchievementRate: z.string().trim().max(100).optional(),
  email: z.string().email("Email không đúng định dạng.").optional(),
  avatarUrl: z
    .string()
    .trim()
    .max(500, "Đường dẫn ảnh đại diện tối đa 500 ký tự.")
    .refine(
      (val) => val === "" || isSafeHttpOrRelativeUrl(val),
      "URL ảnh đại diện phải là đường dẫn nội bộ ('/') hoặc HTTP(S) hợp lệ.",
    )
    .optional(),
  officeHours: z.string().trim().max(160).optional(),
  location: z.string().trim().max(200).optional(),
  credentials: z.array(z.string().trim().min(1)).optional(),
  socials: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        href: z
          .string()
          .trim()
          .min(1)
          .refine(
            (val) => isSafeHttpOrRelativeUrl(val, { allowMailtoTel: true }),
            "Liên kết mạng xã hội chứa giao thức không an toàn.",
          ),
        handle: z.string().trim().min(1),
      }),
    )
    .optional(),
  brandTheme: brandThemeSchema.optional(),
  currentTerm: z.string().trim().max(120).optional(),
  defaultPortalPin: z
    .string()
    .trim()
    .min(4, "Mật khẩu tra cứu mặc định tối thiểu 4 ký tự.")
    .max(32, "Mật khẩu tra cứu mặc định tối đa 32 ký tự.")
    .optional(),
  autoNotifyParents: z.boolean().optional(),
  presignedExpirySeconds: z.coerce
    .number()
    .int()
    .min(60, "Thời hạn Signed URL ngắn hạn tối thiểu 60 giây.")
    .max(3600, "Thời hạn Signed URL ngắn hạn tối đa 3600 giây (1 giờ).")
    .optional(),
  lowAttendanceThresholdPercent: z.coerce
    .number()
    .int()
    .min(50, "Ngưỡng chuyên cần tối thiểu 50%.")
    .max(100, "Ngưỡng chuyên cần tối đa 100%.")
    .optional(),
  tuitionReminderDaysBefore: z.coerce
    .number()
    .int()
    .min(1, "Số ngày nhắc học phí tối thiểu 1 ngày.")
    .max(30, "Số ngày nhắc học phí tối đa 30 ngày.")
    .optional(),
  requirePortalVerification: z
    .literal(true, {
      error: "Xác thực Cổng Học sinh là quy tắc bảo mật bắt buộc, không thể tắt.",
    })
    .optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export function getDesignTokens() {
  return BRAND_DESIGN_TOKENS;
}

export interface SystemHealthCheckItem {
  id:
    | "database"
    | "supabase_auth"
    | "cloudinary"
    | "supabase_storage"
    | "portal_security";
  name: string;
  status: "healthy" | "warning" | "unconfigured";
  summary: string;
  detail: string;
}

export interface SystemHealthSummary {
  checkedAt: string;
  overallStatus: "healthy" | "warning";
  checks: SystemHealthCheckItem[];
  counts: {
    classrooms: number;
    students: number;
    activeStudents: number;
    sessions: number;
    storedFiles: number;
    announcements: number;
    podcasts: number;
  };
  security: {
    requirePortalVerification: boolean;
    isUsingDefaultPortalPin: boolean;
    presignedExpirySeconds: number;
    lowAttendanceThresholdPercent: number;
    tuitionReminderDaysBefore: number;
  };
}

const MAX_SETTINGS_AUDIT_LOGS = 150;

async function ensureDefaultSettingsRow() {
  const existing = await prisma.teacherSetting.findUnique({
    where: { id: "default" },
  });
  if (existing) return existing;

  return prisma.teacherSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      name: DEFAULT_TEACHER_SETTINGS.name,
      title: DEFAULT_TEACHER_SETTINGS.title,
      credentials: DEFAULT_TEACHER_SETTINGS.credentials,
      slogan: DEFAULT_TEACHER_SETTINGS.slogan,
      shortBio: DEFAULT_TEACHER_SETTINGS.shortBio,
      philosophy: DEFAULT_TEACHER_SETTINGS.philosophy,
      experienceYears: DEFAULT_TEACHER_SETTINGS.experienceYears,
      totalStudents: DEFAULT_TEACHER_SETTINGS.totalStudents,
      bandAchievementRate: DEFAULT_TEACHER_SETTINGS.bandAchievementRate,
      email: DEFAULT_TEACHER_SETTINGS.email,
      avatarUrl: DEFAULT_TEACHER_SETTINGS.avatarUrl ?? null,
      socialsJson: toPrismaJson(DEFAULT_TEACHER_SETTINGS.socials),
      brandThemeJson: toPrismaJson(DEFAULT_BRAND_THEME),
      officeHours: DEFAULT_TEACHER_SETTINGS.officeHours,
      location: DEFAULT_TEACHER_SETTINGS.location,
      currentTerm: DEFAULT_TEACHER_SETTINGS.currentTerm,
      defaultPortalPin: DEFAULT_TEACHER_SETTINGS.defaultPortalPin,
      autoNotifyParents: DEFAULT_TEACHER_SETTINGS.autoNotifyParents,
      presignedExpirySeconds: DEFAULT_TEACHER_SETTINGS.presignedExpirySeconds,
      lowAttendanceThresholdPercent:
        DEFAULT_TEACHER_SETTINGS.lowAttendanceThresholdPercent,
      tuitionReminderDaysBefore:
        DEFAULT_TEACHER_SETTINGS.tuitionReminderDaysBefore,
      requirePortalVerification: true,
    },
  });
}

export async function recordSettingsAuditLog(
  entry: Omit<SettingsAuditLogEntry, "id" | "createdAt">,
): Promise<SettingsAuditLogEntry> {
  const created = await prisma.settingsAuditLog.create({
    data: {
      id: `setlog-${randomUUID().slice(0, 12)}`,
      action: entry.action,
      actorId: entry.actorId,
      changedFields: entry.changedFields,
      summary: entry.summary,
    },
  });

  const staleRows = await prisma.settingsAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_SETTINGS_AUDIT_LOGS,
    select: { id: true },
  });
  if (staleRows.length > 0) {
    await prisma.settingsAuditLog.deleteMany({
      where: { id: { in: staleRows.map((r) => r.id) } },
    });
  }

  return mapPrismaSettingsAuditLog(created);
}

export async function listSettingsAuditLogs(
  limit = 50,
): Promise<SettingsAuditLogEntry[]> {
  const rows = await prisma.settingsAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.map(mapPrismaSettingsAuditLog);
}

export async function getSystemSettings(): Promise<SystemSettingsState> {
  const row = await ensureDefaultSettingsRow();
  return mapPrismaTeacherSetting(row);
}

export async function getTeacherBrandProfile(): Promise<TeacherProfile> {
  const settings = await getSystemSettings();
  return {
    name: settings.name,
    avatarUrl: settings.avatarUrl,
    title: settings.title,
    credentials: settings.credentials,
    slogan: settings.slogan,
    shortBio: settings.shortBio,
    philosophy: settings.philosophy,
    experienceYears: settings.experienceYears,
    totalStudents: settings.totalStudents,
    bandAchievementRate: settings.bandAchievementRate,
    email: settings.email,
    officeHours: settings.officeHours,
    location: settings.location,
    socials: settings.socials,
  };
}

export async function getPublicBrandTheme() {
  const settings = await getSystemSettings();
  return settings.brandTheme ?? DEFAULT_BRAND_THEME;
}

function areSettingValuesEqual(prevVal: unknown, nextVal: unknown): boolean {
  if (Array.isArray(prevVal) || Array.isArray(nextVal)) {
    return JSON.stringify(prevVal) === JSON.stringify(nextVal);
  }
  return prevVal === nextVal;
}

export async function updateSystemSettings(
  input: unknown,
  actorId = "admin",
): Promise<SystemSettingsState> {
  const data = validate(updateSettingsSchema, input);
  const current = await getSystemSettings();

  const changedFields: string[] = [];
  const entries = Object.entries(data) as Array<
    [keyof UpdateSettingsInput, unknown]
  >;
  for (const [key, nextVal] of entries) {
    if (nextVal === undefined || key === "requirePortalVerification") continue;
    const prevVal = current[key as keyof SystemSettingsState];
    if (!areSettingValuesEqual(prevVal, nextVal)) {
      changedFields.push(String(key));
    }
  }

  const updatedRow = await prisma.teacherSetting.update({
    where: { id: "default" },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.slogan !== undefined ? { slogan: data.slogan } : {}),
      ...(data.shortBio !== undefined ? { shortBio: data.shortBio } : {}),
      ...(data.philosophy !== undefined ? { philosophy: data.philosophy } : {}),
      ...(data.experienceYears !== undefined
        ? { experienceYears: data.experienceYears }
        : {}),
      ...(data.totalStudents !== undefined
        ? { totalStudents: data.totalStudents }
        : {}),
      ...(data.bandAchievementRate !== undefined
        ? { bandAchievementRate: data.bandAchievementRate }
        : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.avatarUrl !== undefined
        ? { avatarUrl: data.avatarUrl || null }
        : {}),
      ...(data.officeHours !== undefined
        ? { officeHours: data.officeHours }
        : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.credentials !== undefined
        ? { credentials: data.credentials }
        : {}),
      ...(data.socials !== undefined
        ? { socialsJson: toPrismaJson(data.socials) }
        : {}),
      ...(data.brandTheme !== undefined
        ? { brandThemeJson: toPrismaJson(data.brandTheme) }
        : {}),
      ...(data.currentTerm !== undefined
        ? { currentTerm: data.currentTerm }
        : {}),
      ...(data.defaultPortalPin !== undefined
        ? { defaultPortalPin: data.defaultPortalPin }
        : {}),
      ...(data.autoNotifyParents !== undefined
        ? { autoNotifyParents: data.autoNotifyParents }
        : {}),
      ...(data.presignedExpirySeconds !== undefined
        ? { presignedExpirySeconds: data.presignedExpirySeconds }
        : {}),
      ...(data.lowAttendanceThresholdPercent !== undefined
        ? { lowAttendanceThresholdPercent: data.lowAttendanceThresholdPercent }
        : {}),
      ...(data.tuitionReminderDaysBefore !== undefined
        ? { tuitionReminderDaysBefore: data.tuitionReminderDaysBefore }
        : {}),
      requirePortalVerification: true,
    },
  });

  if (data.avatarUrl !== undefined && current.avatarUrl !== updatedRow.avatarUrl) {
    await cleanupReplacedCloudinaryImage({
      oldUrl: current.avatarUrl,
      newUrl: updatedRow.avatarUrl,
      actorId,
      reason: "Đổi ảnh đại diện Giáo viên (Hồ sơ Thương hiệu)",
    });
  }

  if (changedFields.length > 0) {
    const isSecurityChange =
      changedFields.includes("defaultPortalPin") ||
      changedFields.includes("presignedExpirySeconds");
    const isOperationsChange =
      changedFields.includes("currentTerm") ||
      changedFields.includes("autoNotifyParents") ||
      changedFields.includes("lowAttendanceThresholdPercent") ||
      changedFields.includes("tuitionReminderDaysBefore");

    const action: SettingsAuditLogEntry["action"] = isSecurityChange
      ? "UPDATE_SECURITY"
      : isOperationsChange
        ? "UPDATE_OPERATIONS"
        : "UPDATE_BRAND";

    const readableFields = changedFields.map((field) =>
      field === "defaultPortalPin"
        ? "Đã đổi Mật khẩu tra cứu mặc định (đã ẩn giá trị)"
        : SETTINGS_FIELD_LABELS[field] ?? field,
    );

    await recordSettingsAuditLog({
      action,
      actorId,
      changedFields,
      summary: `Cập nhật: ${readableFields.join(", ")}.`,
    });
  }

  return mapPrismaTeacherSetting(updatedRow);
}

export async function resetSystemSettings(
  actorId = "admin",
): Promise<SystemSettingsState> {
  const previous = await ensureDefaultSettingsRow();

  const updatedRow = await prisma.teacherSetting.update({
    where: { id: "default" },
    data: {
      name: DEFAULT_TEACHER_SETTINGS.name,
      avatarUrl: DEFAULT_TEACHER_SETTINGS.avatarUrl ?? null,
      title: DEFAULT_TEACHER_SETTINGS.title,
      credentials: DEFAULT_TEACHER_SETTINGS.credentials,
      slogan: DEFAULT_TEACHER_SETTINGS.slogan,
      shortBio: DEFAULT_TEACHER_SETTINGS.shortBio,
      philosophy: DEFAULT_TEACHER_SETTINGS.philosophy,
      experienceYears: DEFAULT_TEACHER_SETTINGS.experienceYears,
      totalStudents: DEFAULT_TEACHER_SETTINGS.totalStudents,
      bandAchievementRate: DEFAULT_TEACHER_SETTINGS.bandAchievementRate,
      email: DEFAULT_TEACHER_SETTINGS.email,
      socialsJson: toPrismaJson(DEFAULT_TEACHER_SETTINGS.socials),
      brandThemeJson: toPrismaJson(DEFAULT_BRAND_THEME),
      officeHours: DEFAULT_TEACHER_SETTINGS.officeHours,
      location: DEFAULT_TEACHER_SETTINGS.location,
      currentTerm: DEFAULT_TEACHER_SETTINGS.currentTerm,
      defaultPortalPin: DEFAULT_TEACHER_SETTINGS.defaultPortalPin,
      autoNotifyParents: DEFAULT_TEACHER_SETTINGS.autoNotifyParents,
      presignedExpirySeconds: DEFAULT_TEACHER_SETTINGS.presignedExpirySeconds,
      lowAttendanceThresholdPercent:
        DEFAULT_TEACHER_SETTINGS.lowAttendanceThresholdPercent,
      tuitionReminderDaysBefore:
        DEFAULT_TEACHER_SETTINGS.tuitionReminderDaysBefore,
      requirePortalVerification: true,
    },
  });

  if (previous.avatarUrl && previous.avatarUrl !== updatedRow.avatarUrl) {
    await cleanupReplacedCloudinaryImage({
      oldUrl: previous.avatarUrl,
      newUrl: updatedRow.avatarUrl,
      actorId,
      reason: "Đặt lại cài đặt mặc định (dọn ảnh đại diện cũ)",
    });
  }

  await recordSettingsAuditLog({
    action: "RESET_SETTINGS",
    actorId,
    changedFields: ["all"],
    summary:
      "Khôi phục toàn bộ cài đặt hệ thống và hồ sơ thương hiệu về giá trị mặc định.",
  });

  return mapPrismaTeacherSetting(updatedRow);
}

export async function getSystemHealthSummary(): Promise<SystemHealthSummary> {
  let env: ReturnType<typeof getServerEnv> | null = null;
  try {
    env = getServerEnv();
  } catch {
    env = null;
  }

  let storageStatus: ReturnType<typeof getStorageStatus> | null = null;
  try {
    storageStatus = getStorageStatus();
  } catch {
    storageStatus = null;
  }

  const [
    settings,
    classroomsCount,
    totalStudentsCount,
    activeStudentsCount,
    sessionsCount,
    storedFilesCount,
    announcementsCount,
    podcastsCount,
  ] = await Promise.all([
    getSystemSettings(),
    prisma.classroom.count(),
    prisma.student.count(),
    prisma.student.count({
      where: { status: { not: "archived" }, deletedAt: null },
    }),
    prisma.teachingJournalEntry.count(),
    prisma.storedFile.count({ where: { deletedAt: null } }),
    prisma.announcement.count(),
    prisma.podcastEpisode.count(),
  ]);

  const isDefaultPin = settings.defaultPortalPin === "123456";
  const dbConfigured = Boolean(env?.DATABASE_URL);
  const authConfigured = Boolean(env?.SUPABASE_URL && env?.SUPABASE_SECRET_KEY);
  const cloudinaryConfigured = Boolean(storageStatus?.cloudinaryConfigured);
  const supabaseStorageConfigured = Boolean(storageStatus?.supabaseConfigured);

  const checks: SystemHealthCheckItem[] = [
    {
      id: "database",
      name: "Cơ sở dữ liệu PostgreSQL (Prisma)",
      status: dbConfigured ? "healthy" : "warning",
      summary: dbConfigured
        ? "Đã kết nối trực tiếp cơ sở dữ liệu PostgreSQL qua Prisma."
        : "Chưa phát hiện biến môi trường DATABASE_URL.",
      detail: `${classroomsCount} lớp học · ${activeStudentsCount} học sinh đang theo học.`,
    },
    {
      id: "supabase_auth",
      name: "Supabase Auth & Phân quyền RBAC",
      status: authConfigured ? "healthy" : "unconfigured",
      summary: authConfigured
        ? "Supabase Auth Admin API sẵn sàng cấp/khóa tài khoản học sinh."
        : "Chưa cấu hình đầy đủ SUPABASE_URL / SUPABASE_SECRET_KEY (đã ẩn key).",
      detail: "Khóa bí mật chỉ đọc tại máy chủ (Server-only).",
    },
    {
      id: "cloudinary",
      name: "Cloudinary Free (Hình ảnh CDN)",
      status: cloudinaryConfigured ? "healthy" : "unconfigured",
      summary: cloudinaryConfigured
        ? `Đang hoạt động (${storageStatus?.cloudinaryCloudName ?? "Cloudinary"}).`
        : "Chưa cấu hình CLOUDINARY_* — đang chạy chế độ mô phỏng an toàn.",
      detail: `Định tuyến tự động cho toàn bộ ảnh (${storageStatus?.routing.images ?? "cloudinary"}).`,
    },
    {
      id: "supabase_storage",
      name: "Supabase Storage Free (Podcast & PDF)",
      status: supabaseStorageConfigured ? "healthy" : "unconfigured",
      summary: supabaseStorageConfigured
        ? "Kết nối thành công Bucket Public & Private."
        : "Chưa cấu hình khóa Supabase Storage — đang dùng đường dẫn mô phỏng.",
      detail: `Public: ${storageStatus?.publicBucket ?? "english-manager-public"} · Private: ${storageStatus?.privateBucket ?? "english-manager-private"}.`,
    },
    {
      id: "portal_security",
      name: "Bảo mật Cổng Học sinh & Signed URL",
      status: isDefaultPin ? "warning" : "healthy",
      summary: isDefaultPin
        ? "Cổng Học sinh đang sử dụng mã PIN mặc định (123456) — khuyến nghị đổi ngay."
        : "Đã thiết lập mã PIN riêng & loại bỏ hoàn toàn backdoor PIN cũ.",
      detail: `Hiệu lực Signed URL tệp Private: ${settings.presignedExpirySeconds} giây · Luôn bắt buộc xác thực.`,
    },
  ];

  const overallStatus: SystemHealthSummary["overallStatus"] =
    isDefaultPin || !dbConfigured ? "warning" : "healthy";

  return {
    checkedAt: new Date().toISOString(),
    overallStatus,
    checks,
    counts: {
      classrooms: classroomsCount,
      students: totalStudentsCount,
      activeStudents: activeStudentsCount,
      sessions: sessionsCount,
      storedFiles: storedFilesCount,
      announcements: announcementsCount,
      podcasts: podcastsCount,
    },
    security: {
      requirePortalVerification: true,
      isUsingDefaultPortalPin: isDefaultPin,
      presignedExpirySeconds: settings.presignedExpirySeconds,
      lowAttendanceThresholdPercent: settings.lowAttendanceThresholdPercent,
      tuitionReminderDaysBefore: settings.tuitionReminderDaysBefore,
    },
  };
}

export async function exportSystemSnapshot(actorId = "admin") {
  const [
    settings,
    classrooms,
    students,
    folders,
    announcements,
    podcasts,
    sessionsCount,
    storedFilesCount,
  ] = await Promise.all([
    getSystemSettings(),
    prisma.classroom.findMany({ orderBy: { code: "asc" } }),
    prisma.student.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        fullName: true,
        classroomId: true,
        className: true,
        status: true,
        deletedAt: true,
        attendanceRate: true,
        averageScore: true,
        tuitionStatus: true,
      },
    }),
    prisma.resourceFolder.findMany({ orderBy: { name: "asc" } }),
    prisma.announcement.findMany({
      include: { attachments: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.podcastEpisode.findMany({ orderBy: { episodeNumber: "desc" } }),
    prisma.teachingJournalEntry.count(),
    prisma.storedFile.count({ where: { deletedAt: null } }),
  ]);

  const activeStudentsCount = students.filter(
    (s) => s.status !== "archived" && !s.deletedAt,
  ).length;

  const snapshot = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    exportedBy: actorId,
    settings: {
      ...settings,
      defaultPortalPin: "[REDACTED]",
    },
    summary: {
      classroomsCount: classrooms.length,
      studentsCount: students.length,
      activeStudentsCount,
      sessionsCount,
      announcementsCount: announcements.length,
      podcastsCount: podcasts.length,
      foldersCount: folders.length,
      storedFilesCount,
    },
    data: {
      classrooms,
      students: students.map((stu) => ({
        id: stu.id,
        code: stu.code,
        fullName: stu.fullName,
        classId: stu.classroomId,
        className: stu.className,
        status: fromPrismaStudentStatus(stu.status),
        attendanceRate: stu.attendanceRate,
        averageScore: stu.averageScore,
        tuitionStatus: fromPrismaTuitionStatus(stu.tuitionStatus),
      })),
      folders,
      announcements: announcements.map(mapPrismaAnnouncement),
      podcasts: podcasts.map(mapPrismaPodcast),
    },
  };

  await recordSettingsAuditLog({
    action: "EXPORT_SNAPSHOT",
    actorId,
    changedFields: [],
    summary:
      "Xuất bản sao lưu cấu hình & dữ liệu vận hành JSON (đã ẩn mã PIN).",
  });

  return snapshot;
}
