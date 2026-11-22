import type { SettingsAuditLogEntry, TeacherProfile } from "./classroom-data";
import type { BrandThemeColors } from "./domain-types";

export type { BrandThemeColors };

export type SettingsAdminTab = "brand" | "operations" | "accounts" | "system";

export const SETTINGS_UPDATED_EVENT = "english-manager:settings-updated";
export const BRAND_THEME_STORAGE_KEY = "english-manager:brand-theme";
export const TEACHER_BRAND_STORAGE_KEY = "english-manager:teacher-brand";

export const DEFAULT_BRAND_THEME: BrandThemeColors = {
  primary: "#243B64",
  accent: "#496B9A",
  secondary: "#EAF0FA",
  warm: "#F7F0E2",
  highlight: "#E8A18B",
};

export interface BrandThemePreset {
  id: string;
  name: string;
  subtitle: string;
  colors: BrandThemeColors;
}

export const BRAND_THEME_PRESETS: BrandThemePreset[] = [
  {
    id: "modern-academic",
    name: "Modern Academic",
    subtitle: "Xanh Navy mặc định",
    colors: DEFAULT_BRAND_THEME,
  },
  {
    id: "oxford-emerald",
    name: "Oxford Emerald",
    subtitle: "Xanh lục bảo học thuật",
    colors: {
      primary: "#14532D",
      accent: "#15803D",
      secondary: "#ECFDF5",
      warm: "#FEF9EE",
      highlight: "#D97706",
    },
  },
  {
    id: "cambridge-burgundy",
    name: "Cambridge Burgundy",
    subtitle: "Đỏ rượu vang cổ điển",
    colors: {
      primary: "#7F1D1D",
      accent: "#B91C1C",
      secondary: "#FEF2F2",
      warm: "#FDF6EC",
      highlight: "#D97706",
    },
  },
  {
    id: "royal-indigo",
    name: "Royal Indigo",
    subtitle: "Tím chàm hiện đại",
    colors: {
      primary: "#312E81",
      accent: "#4F46E5",
      secondary: "#EEF2FF",
      warm: "#FAF5FF",
      highlight: "#EC4899",
    },
  },
  {
    id: "ocean-teal",
    name: "Ocean Teal",
    subtitle: "Xanh đại dương thanh lịch",
    colors: {
      primary: "#134E4A",
      accent: "#0F766E",
      secondary: "#F0FDFA",
      warm: "#FEFCE8",
      highlight: "#F97316",
    },
  },
  {
    id: "warm-slate",
    name: "Warm Slate",
    subtitle: "Xám than tối giản",
    colors: {
      primary: "#1E293B",
      accent: "#475569",
      secondary: "#F1F5F9",
      warm: "#F8F4EC",
      highlight: "#E11D48",
    },
  },
];

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function normalizeBrandTheme(
  raw?: Partial<BrandThemeColors> | null,
): BrandThemeColors {
  return {
    primary:
      raw?.primary && HEX_COLOR_RE.test(raw.primary)
        ? raw.primary.toUpperCase()
        : DEFAULT_BRAND_THEME.primary,
    accent:
      raw?.accent && HEX_COLOR_RE.test(raw.accent)
        ? raw.accent.toUpperCase()
        : DEFAULT_BRAND_THEME.accent,
    secondary:
      raw?.secondary && HEX_COLOR_RE.test(raw.secondary)
        ? raw.secondary.toUpperCase()
        : DEFAULT_BRAND_THEME.secondary,
    warm:
      raw?.warm && HEX_COLOR_RE.test(raw.warm)
        ? raw.warm.toUpperCase()
        : DEFAULT_BRAND_THEME.warm,
    highlight:
      raw?.highlight && HEX_COLOR_RE.test(raw.highlight)
        ? raw.highlight.toUpperCase()
        : DEFAULT_BRAND_THEME.highlight,
  };
}

function getContrastingForeground(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? "#1E293B" : "#FFFFFF";
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Derives a WCAG-safe dark brand surface (lightness clamped <= maxLightness)
 * preserving the chosen primary hue so white text on Top Bar & Footer always
 * maintains high contrast (>= 7:1) even if a user picks a bright primary color.
 */
export function deriveSafeDarkSurface(hex: string, maxLightness = 0.22): string {
  const { h, s, l } = hexToHsl(hex);
  const safeL = Math.min(l, maxLightness);
  const safeS = Math.min(s, 0.56);
  return hslToHex(h, safeS, safeL);
}

export function applyBrandThemeToDocument(
  rawTheme?: Partial<BrandThemeColors> | null,
): BrandThemeColors {
  const theme = normalizeBrandTheme(rawTheme);
  if (typeof document === "undefined") return theme;

  const root = document.documentElement;
  const primaryFg = getContrastingForeground(theme.primary);
  const deepPrimary = deriveSafeDarkSurface(theme.primary, 0.22);
  const footerDark = deriveSafeDarkSurface(theme.primary, 0.16);

  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-foreground", primaryFg);
  root.style.setProperty("--brand-navy", theme.primary);
  root.style.setProperty("--brand-deep-navy", deepPrimary);
  root.style.setProperty("--brand-footer-dark", footerDark);
  root.style.setProperty("--sidebar-primary", theme.primary);
  root.style.setProperty("--sidebar-primary-foreground", primaryFg);
  root.style.setProperty("--secondary-foreground", theme.primary);
  root.style.setProperty("--accent-foreground", theme.primary);
  root.style.setProperty("--chart-1", theme.primary);

  root.style.setProperty("--primary-accent", theme.accent);
  root.style.setProperty("--brand-blue", theme.accent);
  root.style.setProperty("--ring", theme.accent);
  root.style.setProperty("--sidebar-ring", theme.accent);
  root.style.setProperty("--chart-2", theme.accent);

  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--accent", theme.secondary);
  root.style.setProperty("--brand-soft-blue", theme.secondary);
  root.style.setProperty("--sidebar-accent", theme.secondary);
  root.style.setProperty("--sidebar-accent-foreground", theme.primary);

  root.style.setProperty("--warm", theme.warm);
  root.style.setProperty("--brand-cream", theme.warm);

  root.style.setProperty("--highlight", theme.highlight);
  root.style.setProperty("--brand-coral", theme.highlight);
  root.style.setProperty("--chart-3", theme.highlight);

  return theme;
}

export function persistBrandThemeLocally(theme: BrandThemeColors): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BRAND_THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // Ignore storage quota errors
  }
}

export function readStoredBrandTheme(): BrandThemeColors | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BRAND_THEME_STORAGE_KEY);
    if (!raw) return null;
    return normalizeBrandTheme(JSON.parse(raw) as Partial<BrandThemeColors>);
  } catch {
    return null;
  }
}

export function persistTeacherBrandLocally(
  teacher: Partial<TeacherProfile>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      TEACHER_BRAND_STORAGE_KEY,
      JSON.stringify(teacher),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function readStoredTeacherBrand(): Partial<TeacherProfile> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TEACHER_BRAND_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<TeacherProfile>;
  } catch {
    return null;
  }
}

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
  brandTheme: BrandThemeColors;
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
  brandTheme: "Bảng màu thương hiệu",
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
