export { cn } from "cn";

const VI_LOCALE = "vi-VN";
const APP_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** 12/11/2026 */
export function formatDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(VI_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

/** 12/11/2026, 10:27 */
export function formatDateTime(value: Date | string | number): string {
  return new Intl.DateTimeFormat(VI_LOCALE, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

/** 1.5 MB */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** 754 -> "12:34" */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mmss = `${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
  return h ? `${h}:${mmss}` : mmss;
}

/**
 * Chuyển đổi chuỗi tiếng Việt có dấu thành không dấu (lowercase, chuẩn hóa Unicode NFD).
 * Dùng cho tìm kiếm không phân biệt dấu và chữ hoa/thường.
 * Ví dụ: "Trần Bảo Ngọc" -> "tran bao ngoc"
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

/**
 * Chuyển đổi YouTube / Vimeo URL thành embed iframe URL an toàn (youtube-nocookie)
 */
export function getYoutubeEmbedUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Pattern: youtube.com/watch?v=ID or youtu.be/ID or youtube.com/embed/ID
  const matchWatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
  );
  if (matchWatch && matchWatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${matchWatch[1]}`;
  }

  // Pattern: vimeo.com/ID
  const matchVimeo = trimmed.match(/vimeo\.com\/([0-9]+)/i);
  if (matchVimeo && matchVimeo[1]) {
    return `https://player.vimeo.com/video/${matchVimeo[1]}`;
  }

  // If already an embed or direct https mp4 link
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }

  return null;
}
