import type {
  StorageAuditLogEntry,
  StoredFileRecord,
} from "./classroom-data";
import type { QuotaAlertLevel } from "./storage.service";

export type StorageAdminTab =
  | "overview"
  | "images"
  | "files"
  | "curriculum"
  | "config";

export const IMAGE_CATEGORY_LABELS: Record<string, string> = {
  all: "Tất cả danh mục ảnh",
  teacher_avatar: "Ảnh đại diện giáo viên (avatars/teachers)",
  project: "Ảnh dự án học sinh (projects)",
  podcast_thumbnail: "Thumbnail podcast (podcasts)",
  announcement: "Ảnh thông báo (announcements)",
  article: "Ảnh bài viết (articles)",
  resource: "Ảnh minh họa tài nguyên (resources)",
};

export const FILE_TYPE_LABELS: Record<string, string> = {
  PDF: "Tài liệu PDF",
  DOCX: "Văn bản Word (.docx)",
  SLIDE: "Slide bài giảng",
  WORKSHEET: "Phiếu bài tập",
  AUDIO: "Tệp âm thanh (Audio)",
  IMAGE: "Hình ảnh",
};

export const AUDIT_ACTION_LABELS: Record<
  StorageAuditLogEntry["action"],
  string
> = {
  UPLOAD_IMAGE: "Tải ảnh lên Cloudinary",
  UPLOAD_PODCAST: "Tải Podcast lên Supabase",
  UPLOAD_PDF: "Tải tài liệu PDF lên Supabase",
  DELETE_FILE: "Xóa tệp lưu trữ",
  REPLACE_FILE: "Thay thế tệp an toàn",
  CREATE_SIGNED_URL: "Cấp Signed URL bảo mật",
  ROLLBACK_ORPHAN: "Rollback tệp lỗi metadata",
  TOGGLE_VISIBILITY: "Đổi quyền Công khai / Nội bộ",
  CLEANUP_ORPHANS: "Dọn dẹp tệp mồ côi",
  UPDATE_METADATA: "Cập nhật thông tin học liệu",
};

export const CLOUDINARY_PRESET_SPECS = [
  {
    key: "avatar",
    label: "Avatar 1:1",
    dimensions: "256 × 256",
    rawTransform: "c_fill,g_auto,w_256,h_256,f_auto,q_auto",
  },
  {
    key: "podcast_thumbnail",
    label: "Thumbnail Podcast",
    dimensions: "640 × 360",
    rawTransform: "c_fill,w_640,h_360,f_auto,q_auto",
  },
  {
    key: "project",
    label: "Dự án Học sinh",
    dimensions: "1200 × 900",
    rawTransform: "c_limit,w_1200,h_900,f_auto,q_auto",
  },
  {
    key: "article",
    label: "Bài viết / Thông báo",
    dimensions: "1200 × 800",
    rawTransform: "c_limit,w_1200,h_800,f_auto,q_auto",
  },
  {
    key: "preview",
    label: "Ảnh xem trước",
    dimensions: "400 × 300",
    rawTransform: "c_fill,w_400,h_300,f_auto,q_auto",
  },
] as const;

export function formatStorageBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (safe >= 1024 * 1024) {
    return `${(safe / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(safe / 1024))} KB`;
}

export function getQuotaAlertMeta(level: QuotaAlertLevel): {
  label: string;
  badgeVariant: "success" | "warning" | "destructive" | "secondary";
  barClass: string;
  recommendation: string;
} {
  switch (level) {
    case "locked":
      return {
        label: "Đã khóa Upload (>= 95%)",
        badgeVariant: "destructive",
        barClass: "bg-destructive",
        recommendation:
          "Dung lượng đã chạm ngưỡng bảo vệ Free Tier. Hãy xóa bớt tệp không dùng hoặc dọn tệp mồ côi để mở khóa.",
      };
    case "critical":
      return {
        label: "Nguy cấp (>= 85%)",
        badgeVariant: "destructive",
        barClass: "bg-rose-500",
        recommendation:
          "Sắp chạm trần gói Free Tier. Khuyến nghị rà soát các tệp chưa gắn kết để giải phóng dung lượng.",
      };
    case "warning":
      return {
        label: "Cảnh báo (>= 70%)",
        badgeVariant: "warning",
        barClass: "bg-amber-500",
        recommendation:
          "Dung lượng đã vượt 70%. Nên kiểm tra các tệp cũ hoặc dọn dẹp tệp mồ côi định kỳ.",
      };
    case "healthy":
      return {
        label: "An toàn",
        badgeVariant: "success",
        barClass: "bg-primary",
        recommendation:
          "Mức sử dụng dung lượng đang trong ngưỡng an toàn của gói Free Tier.",
      };
    default:
      return {
        label: "Chưa rõ",
        badgeVariant: "secondary",
        barClass: "bg-muted-foreground",
        recommendation:
          "Chưa có dữ liệu đo dung lượng cho nhà cung cấp lưu trữ này.",
      };
  }
}

export interface CloudinaryPresetUrlItem {
  key: string;
  label: string;
  dimensions: string;
  url: string;
}

export function buildCloudinaryPresetUrls(
  publicUrl: string | null | undefined,
  publicId: string | null | undefined,
): CloudinaryPresetUrlItem[] {
  const cleanId = (publicId ?? "").replace(/^\/+/, "").trim();
  if (!cleanId) return [];

  let cloudName = "demo-english-manager";
  if (publicUrl) {
    const match = publicUrl.match(/res\.cloudinary\.com\/([^/]+)\//i);
    if (match?.[1]) {
      cloudName = decodeURIComponent(match[1]);
    }
  }

  return CLOUDINARY_PRESET_SPECS.map((spec) => ({
    key: spec.key,
    label: spec.label,
    dimensions: spec.dimensions,
    url: `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/${spec.rawTransform}/${cleanId}`,
  }));
}

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

export function buildStorageInventoryCsv(files: StoredFileRecord[]): string {
  const header = [
    "ID",
    "Tên tệp gốc",
    "Provider",
    "Loại tệp",
    "Dung lượng (Bytes)",
    "Dung lượng hiển thị",
    "Quyền truy cập",
    "Bucket",
    "Đường dẫn / Public ID",
    "Số tham chiếu",
    "Ngày tạo",
  ]
    .map(escapeCsvCell)
    .join(",");

  const rows = files.map((f) =>
    [
      f.id,
      f.originalName,
      f.provider.toUpperCase(),
      f.fileType,
      f.fileSize,
      formatStorageBytes(f.fileSize),
      f.isPublic ? "Public" : "Private",
      f.bucketName ?? "Cloudinary",
      f.cloudinaryPublicId ?? f.storagePath ?? f.storedName,
      f.referencedBy?.length ?? 0,
      f.createdAt,
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return `\uFEFF${[header, ...rows].join("\n")}`;
}
