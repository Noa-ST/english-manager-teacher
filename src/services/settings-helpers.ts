import type { SettingsAuditLogEntry, TeacherProfile } from "./classroom-data";

export type SettingsAdminTab = "brand" | "operations" | "accounts" | "system";

export const SETTINGS_UPDATED_EVENT = "english-manager:settings-updated";

export interface SettingsFormDraft {
  name: string;
  title: string;
  slogan: string;
  shortBio: string;
  philosophy: string;
  experienceYears: number;
  totalStudents: number;
  bandAchievementRate: string;
  email: string;
  avatarUrl: string;
  officeHours: string;
  location: string;
  credentials: string[];
  socials: TeacherProfile["socials"];
  currentTerm: string;
  defaultPortalPin: string;
  autoNotifyParents: boolean;
  presignedExpirySeconds: number;
  lowAttendanceThresholdPercent: number;
  tuitionReminderDaysBefore: number;
  requirePortalVerification: boolean;
}

export const BRAND_DESIGN_TOKENS = {
  primary: {
    name: "Navy Primary",
    hex: "#243B64",
    role: "Màu chủ đạo, tiêu đề & nút bấm chính",
  },
  accent: {
    name: "Blue Accent",
    hex: "#6C8FE6",
    role: "Điểm nhấn thị giác, thẻ active, icon phụ",
  },
  secondary: {
    name: "Sky Secondary",
    hex: "#B9D8F5",
    role: "Nền phụ, border hover, badge nổi bật",
  },
  warm: {
    name: "Warm Cream",
    hex: "#F5EEDC",
    role: "Nền thẻ ấm áp, background nhẹ nhàng",
  },
  coral: {
    name: "Coral Highlight",
    hex: "#F3A98B",
    role: "Cảnh báo nhẹ, highlight tiến độ học viên",
  },
} as const;

export const SETTINGS_AUDIT_ACTION_LABELS: Record<
  SettingsAuditLogEntry["action"],
  string
> = {
  UPDATE_BRAND: "Cập nhật Hồ sơ Thương hiệu",
  UPDATE_SECURITY: "Cập nhật Bảo mật & PIN",
  UPDATE_OPERATIONS: "Cập nhật Học vụ & Vận hành",
  RESET_SETTINGS: "Khôi phục Cài đặt Mặc định",
  EXPORT_SNAPSHOT: "Xuất bản Sao lưu JSON",
  CREATE_STUDENT_ACCOUNT: "Cấp Tài khoản Học sinh",
  TOGGLE_STUDENT_ACCOUNT: "Khóa / Mở Tài khoản Học sinh",
  RESET_STUDENT_PASSWORD: "Đặt lại Mật khẩu Học sinh",
};

export const SETTINGS_FIELD_LABELS: Record<string, string> = {
  name: "Họ tên & Học vị",
  title: "Danh xưng chuyên môn",
  slogan: "Thông điệp sư phạm",
  shortBio: "Giới thiệu ngắn",
  philosophy: "Triết lý giảng dạy",
  experienceYears: "Số năm kinh nghiệm",
  totalStudents: "Tổng số học sinh",
  bandAchievementRate: "Tỷ lệ đạt Band",
  email: "Email liên hệ",
  avatarUrl: "Ảnh đại diện giáo viên",
  officeHours: "Khung giờ tư vấn",
  location: "Địa điểm phòng học",
  credentials: "Bằng cấp & Chứng chỉ",
  socials: "Kênh kết nối công khai",
  currentTerm: "Học kỳ hiện tại",
  defaultPortalPin: "PIN tra cứu mặc định",
  autoNotifyParents: "Tự động nhắc Phụ huynh",
  presignedExpirySeconds: "Thời hạn Signed URL",
  lowAttendanceThresholdPercent: "Ngưỡng cảnh báo chuyên cần",
  tuitionReminderDaysBefore: "Nhắc hạn học phí trước",
};

const WEAK_DEFAULT_PINS = new Set([
  "123456",
  "000000",
  "111111",
  "654321",
  "1234",
  "HS2026",
  "ADMIN",
]);

export function evaluatePortalPinStrength(pin: string): {
  level: "weak" | "medium" | "strong";
  label: string;
  score: number;
  hints: string[];
} {
  const trimmed = pin.trim();
  const hints: string[] = [];

  if (!trimmed) {
    return {
      level: "weak",
      label: "Yếu",
      score: 0,
      hints: ["Vui lòng nhập mã PIN từ 4 đến 32 ký tự."],
    };
  }

  if (WEAK_DEFAULT_PINS.has(trimmed.toUpperCase())) {
    return {
      level: "weak",
      label: "Yếu",
      score: 25,
      hints: [
        "Đang dùng mã PIN mặc định/phổ biến, nên đổi ngay để tăng bảo mật.",
      ],
    };
  }

  let score = 20;
  if (trimmed.length >= 6) {
    score += 25;
  } else {
    hints.push("Nên dùng tối thiểu 6 ký tự (khuyến nghị 8+ ký tự).");
  }

  if (trimmed.length >= 8) {
    score += 20;
  }

  const hasLetter = /[a-zA-Z]/.test(trimmed);
  const hasDigit = /\d/.test(trimmed);
  if (hasLetter && hasDigit) {
    score += 25;
  } else {
    hints.push("Kết hợp thêm cả chữ cái và chữ số để chống đoán mã.");
  }

  const uniqueChars = new Set(trimmed).size;
  if (uniqueChars >= Math.min(4, trimmed.length)) {
    score += 10;
  } else {
    hints.push("Tránh lặp lại cùng một ký tự nhiều lần.");
  }

  const clampedScore = Math.min(100, score);
  if (clampedScore >= 75) {
    return {
      level: "strong",
      label: "Mạnh",
      score: clampedScore,
      hints,
    };
  }
  if (clampedScore >= 45) {
    return {
      level: "medium",
      label: "Trung bình",
      score: clampedScore,
      hints,
    };
  }
  return {
    level: "weak",
    label: "Yếu",
    score: clampedScore,
    hints,
  };
}

function getRandomIndex(max: number): number {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function generateStrongPortalPin(length = 8): string {
  const safeLength = Math.max(6, Math.min(32, Math.floor(length)));
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;

  const chars: string[] = [
    letters[getRandomIndex(letters.length)],
    digits[getRandomIndex(digits.length)],
  ];
  while (chars.length < safeLength) {
    chars.push(all[getRandomIndex(all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = getRandomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function generateStrongAccountPassword(length = 12): string {
  const safeLength = Math.max(8, Math.min(64, Math.floor(length)));
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;

  const chars: string[] = [
    upper[getRandomIndex(upper.length)],
    lower[getRandomIndex(lower.length)],
    digits[getRandomIndex(digits.length)],
    symbols[getRandomIndex(symbols.length)],
  ];
  while (chars.length < safeLength) {
    chars.push(all[getRandomIndex(all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = getRandomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function formatExpiryDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  if (safe < 60) {
    return `${safe} giây`;
  }
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  if (rem === 0) {
    return `${mins} phút (${safe} giây)`;
  }
  return `${mins} phút ${rem} giây (${safe} giây)`;
}

export function buildSnapshotFilename(date = new Date()): string {
  return `english-manager-snapshot-${date.toISOString().slice(0, 10)}.json`;
}
