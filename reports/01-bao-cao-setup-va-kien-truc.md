# Báo cáo 01: Khởi tạo Setup & Kiến trúc Nền tảng

- **Dự án:** Hệ thống Quản lý Lớp học & Cổng thông tin Giáo viên (`english-manager-teacher`)
- **Công nghệ lõi:** Next.js `16.4.6` (App Router + Turbopack), React `19.3.0`, TypeScript `^5`, Tailwind CSS v4 (`4.3.3`), Shadcn UI (`base-nova`), Prisma ORM `7.10.1` (PostgreSQL + `@prisma/adapter-pg`), AWS S3 SDK (`@aws-sdk/client-s3`), Zod `4.6.7`, `jose`, `bcryptjs`.
- **Trạng thái:** Đã hoàn thành khởi tạo cấu trúc và vượt qua toàn bộ kiểm tra biên dịch (`prisma generate`, `prisma validate`, `next typegen`, `tsc --noEmit`, `eslint`, `next build`).

---

## 1. Kiến trúc định hướng & Các quyết định kỹ thuật đã triển khai

### 1.1. Cấu hình Next.js 16 & Mô hình Render (`next.config.ts`)
- Bật **`cacheComponents: true`** và **`partialPrefetching: true`**:
  - Phân hệ **Viewer Portal** sử dụng static shell kết hợp directive `'use cache'`, `cacheLife`, và `cacheTag` (tương đương ISR trong Next.js 16) để tối ưu SEO và tốc độ tải trang.
  - Phân hệ **Admin Dashboard** đọc session tại request-time bên trong ranh giới `<Suspense>` (Partial Prerendering / SSR).
- Bật **`typedRoutes: true`**: Kiểm tra hợp lệ đường dẫn `<Link href>` và `redirect()` ngay tại thời điểm biên dịch TypeScript.
- Cấu hình **`images.remotePatterns`** động từ biến môi trường `STORAGE_PUBLIC_URL`: Đảm bảo toàn bộ ảnh được phục vụ từ Cloudflare R2 / AWS S3 / CDN thay vì lưu trên host mã nguồn.
- Thiết lập các **HTTP Security Headers** mặc định (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`) và tắt header `X-Powered-By`.

### 1.2. Tách biệt Route Groups (`(viewer)` vs `(admin)`)
- **Phân hệ Khách (`src/app/(viewer)/`):**
  - `layout.tsx`: Shell công khai gồm `SiteHeader` và `SiteFooter`, không đọc `cookies()` hay `headers()` ở tầng layout để giữ nguyên static shell.
  - Các trang đã khởi tạo:
    - `src/app/(viewer)/(home)/page.tsx` (`/`) — Trang chủ tổng quan
    - `src/app/(viewer)/hall-of-fame/page.tsx` (`/hall-of-fame`) — Bảng vàng vinh danh
    - `src/app/(viewer)/podcast/page.tsx` (`/podcast`) — Audio Newsletter
    - `src/app/(viewer)/showcase/page.tsx` (`/showcase`) — Thư viện dự án học sinh
    - `src/app/(viewer)/documents/page.tsx` (`/documents`) — Kho tài liệu môn học
    - `src/app/(viewer)/student/[id]/page.tsx` (`/student/[id]`) — Tra cứu cá nhân (đọc `params` trong `<Suspense>`)
- **Phân hệ Quản trị (`src/app/(admin)/`):**
  - `layout.tsx`: Giao diện gồm `AdminSidebar`, `AdminHeader` và `AdminGuard` bọc trong `<Suspense>`.
  - Các trang đã khởi tạo:
    - `src/app/(admin)/dashboard/page.tsx` (`/dashboard`) — Tổng quan quản trị
    - `src/app/(admin)/cms/page.tsx` (`/cms`) — Quản lý nội dung (Thông báo, Podcast, Bảng vàng, Dự án)
    - `src/app/(admin)/students/page.tsx` (`/students`) — Quản lý hồ sơ học sinh, điểm số, học phí
    - `src/app/(admin)/schedule/page.tsx` (`/schedule`) — Quản lý ca học và điểm danh nhanh
    - `src/app/(admin)/storage/page.tsx` (`/storage`) — Trình quản lý kho file S3/R2
- **Trang đăng nhập (`src/app/login/page.tsx`):**
  - Tuyến `/login` độc lập đóng vai trò đích chuyển hướng (`LOGIN_PATH`) cho giáo viên khi chưa xác thực.

### 1.3. Nguyên tắc "Decoupled Logic" & Bảo vệ Ranh giới Kiến trúc
- **Tầng Business Logic (`src/services/`):** Hoàn toàn độc lập với Next.js (`next/*`) và HTTP. Mọi hàm public đều nhận `unknown` và xác thực qua Zod (`validate()`), ném ra các lỗi miền (`DomainError` trong `src/services/errors.ts`).
  - `src/services/storage.service.ts`: Đã triển khai hoàn chỉnh logic kiểm tra allow-list MIME type & dung lượng theo thư mục (`podcasts`, `thumbnails`, `showcase`, `documents`, `attachments`), sinh key chuẩn hóa không dấu tiếng Việt + UUID (`buildObjectKey`), cấp presigned `PUT` upload URL (`createUploadUrl`), presigned `GET` download URL cho file private (`createDownloadUrl`), và xóa object (`deleteObject`).
  - `src/services/auth.service.ts`: Đã triển khai kiểm tra thông tin đăng nhập giáo viên bằng `bcryptjs.compare` + `timingSafeEqual` (chống timing attack).
  - `src/services/student.service.ts`, `podcast.service.ts`, `schedule.service.ts`: Đã định nghĩa đầy đủ Zod schema contracts và interface trả về; các thân hàm đang trả `NotImplementedError` chờ bước sinh Prisma Schema.
- **Tầng Transport & Adapter (`src/lib/` & `src/app/api/`):**
  - `src/lib/http.ts`: Chứa `publicRoute`, `adminRoute`, `ok`, `fail`, `readJson`, `readQuery` để chuyển đổi `DomainError` sang HTTP Status Code chuẩn hóa theo envelope `ApiResponse<T>` (`src/types/api.d.ts`).
  - `src/app/api/admin/students/route.ts` và `src/app/api/admin/podcasts/route.ts`: Các Route Handler mỏng (~15 dòng), chỉ xử lý HTTP và ủy quyền toàn bộ nghiệp vụ cho `src/services/`.
  - `src/app/api/viewer/.gitkeep`: Giữ sẵn không gian cho các public read-only endpoints ở Giai đoạn 3.
- **Kiểm soát tự động bằng ESLint (`eslint.config.mjs`):**
  - Cấm mọi file ngoài `src/services/**` và `src/lib/db/**` import trực tiếp Prisma (`@/lib/db/*`, `@/generated/prisma*`, `@prisma/client*`).
  - Cấm mọi file trong `src/services/**` import `next` hoặc `next/*`.

### 1.4. Cơ sở dữ liệu, Bảo mật & Cấu hình tập trung (`src/lib/`, `src/prisma/`)
- `prisma.config.ts` & `src/prisma/schema.prisma`: Cấu hình Prisma 7 chuẩn mới (tách `DATABASE_URL` ra `prisma.config.ts`, sinh client vào `src/generated/prisma`, chạy qua `@prisma/adapter-pg` trong `src/lib/db/prisma.ts`).
- `src/lib/env.ts`: Kiểm tra biến môi trường bằng Zod (`getServerEnv()`), fail-fast khi subsystem liên quan được gọi nhưng vẫn cho phép `next build` chạy với static shell.
- `src/lib/auth.ts` & `src/proxy.ts`:
  - Session cookie `httpOnly` ký HS256 bằng `jose` (`em_session`).
  - Bảo vệ nhiều lớp: `src/proxy.ts` (kiểm tra lạc quan cấp request theo danh sách route trong `src/lib/routes.ts`), `AdminGuard` ở layout, và `requireAdmin` / `requireAdminApi` tại mọi Server Action / Route Handler.
- `src/lib/cache-tags.ts`: Tập trung hóa các khóa cache (`CacheTags`) dùng chung giữa tầng đọc dữ liệu của Viewer và tầng ghi dữ liệu của Admin.

---

## 2. Kết quả kiểm tra hệ thống sau khi Setup

| Lệnh kiểm tra | Mục đích | Kết quả |
| --- | --- | --- |
| `npx prisma generate` | Sinh Prisma Client vào `src/generated/prisma` | Thành công (Prisma 7.10.1) |
| `npx prisma validate` | Kiểm tra cú pháp và cấu hình `src/prisma/schema.prisma` | Hợp lệ |
| `npx next typegen` | Sinh kiểu dữ liệu cho toàn bộ Route và `PageProps` | Thành công |
| `npm run typecheck` | Kiểm tra TypeScript toàn dự án (`tsc --noEmit`) | Không có lỗi |
| `npm run lint` | Kiểm tra quy chuẩn mã nguồn và ESLint architectural rules | Không có lỗi |
| `npm run build` | Biên dịch production (`next build` với Turbopack) | Thành công (17/17 static worker passes) |

> **Lưu ý cấu hình môi trường trước khi chạy thực tế:** Tệp `.env` hiện tại là bản sao từ `.env.example`. Cần cập nhật `DATABASE_URL` trỏ tới PostgreSQL thật, tạo `AUTH_SECRET` ngẫu nhiên ≥ 32 ký tự, sinh `ADMIN_PASSWORD_HASH` (bcrypt), và điền thông tin bucket/key S3 hoặc Cloudflare R2.

