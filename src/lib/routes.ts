/**
 * Route registry — single source of truth for navigation AND protection.
 *
 * The `(admin)` route group adds no URL prefix, so admin pages live at the
 * root (`/dashboard`, `/cms`, …). Every protected prefix MUST be listed here:
 * proxy.ts and the admin sidebar both read from this file.
 */

export const ADMIN_NAV = [
  { href: "/dashboard", label: "Tổng quan", group: "Vận hành" },
  { href: "/students", label: "Học sinh", group: "Học vụ" },
  { href: "/classes", label: "Lớp & Ca học", group: "Học vụ" },
  { href: "/schedule", label: "Lịch dạy", group: "Học vụ" },
  { href: "/teaching-journal", label: "Nhật ký giảng dạy", group: "Học vụ" },
  { href: "/attendance", label: "Điểm danh", group: "Học vụ" },
  { href: "/grades", label: "Điểm & Nhận xét", group: "Học vụ" },
  { href: "/class-analytics", label: "Phân tích hiệu quả", group: "Học vụ" },
  { href: "/cms", label: "Nội dung (CMS)", group: "Thương hiệu & Cổng TT" },
  { href: "/storage", label: "Kho tài liệu", group: "Thương hiệu & Cổng TT" },
  { href: "/settings", label: "Cài đặt", group: "Hệ thống" },
] as const;

export const VIEWER_NAV = [
  { href: "/", label: "Trang chủ" },
  { href: "/announcements", label: "Thông báo" },
  { href: "/hall-of-fame", label: "Bảng vàng" },
  { href: "/podcast", label: "Podcast" },
  { href: "/showcase", label: "Dự án" },
  { href: "/documents", label: "Tài liệu" },
  { href: "/student", label: "Tra cứu cá nhân" },
] as const;

const ADMIN_PAGE_PREFIXES: readonly string[] = [...ADMIN_NAV.map((item) => item.href), "/admin"];
const ADMIN_API_PREFIX = "/api/admin";
const STUDENT_PAGE_PREFIX = "/student";
const STUDENT_API_PREFIX = "/api/student";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAdminPagePath(pathname: string): boolean {
  return ADMIN_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isAdminApiPath(pathname: string): boolean {
  return matchesPrefix(pathname, ADMIN_API_PREFIX);
}

export function isStudentPagePath(pathname: string): boolean {
  return matchesPrefix(pathname, STUDENT_PAGE_PREFIX);
}

export function isStudentApiPath(pathname: string): boolean {
  return matchesPrefix(pathname, STUDENT_API_PREFIX);
}
