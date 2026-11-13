# Báo cáo 02: Kế hoạch Triển khai Chức năng (4 Giai đoạn)

Tài liệu này mô tả chi tiết lộ trình triển khai các tính năng dựa trên **Đặc tả Yêu cầu Phần mềm (SRS)** và kiến trúc nền tảng đã thiết lập. Toàn bộ quá trình tuân thủ nguyên tắc: **Mọi nghiệp vụ và truy vấn DB nằm trong `src/services/`, Route Handlers và UI chỉ làm nhiệm vụ giao tiếp/trình bày**.

---

## Giai đoạn 1: Nền tảng (Foundation — Database, Xác thực & UI Primitives)

**Mục tiêu:** Hoàn thiện mô hình dữ liệu quan hệ trên PostgreSQL, luồng đăng nhập cho cả Giáo viên (Admin) và Học sinh/Phụ huynh (Viewer), cùng bộ component giao diện cơ bản.

### 1.1. Thiết kế & Khởi tạo Prisma Schema (`src/prisma/schema.prisma`)
- **Nhóm Học vụ (CRM):**
  - `Student`: `id`, `code` (Mã học sinh — unique), `fullName`, `staticPasswordHash`, `parentName`, `parentPhone`, `parentEmail`, `status`, timestamps.
  - `Assessment` / `Grade`: `id`, `studentId`, `title` (bài kiểm tra/đợt đánh giá), `score`, `maxScore`, `comment` (nhận xét định kỳ), `evaluatedAt`.
  - `TuitionRecord`: `id`, `studentId`, `periodLabel` (tháng/khóa), `amount`, `status` (đã đóng / chưa đóng / miễn giảm), `paidAt`, `note`.
- **Nhóm Lịch dạy & Điểm danh:**
  - `ClassSession`: `id`, `name` (tên ca học), `dayOfWeek` (0–6), `startTime`, `endTime`, `room`, `isActive`.
  - `Enrollment`: quan hệ nhiều-nhiều giữa `Student` và `ClassSession`.
  - `Attendance`: `id`, `sessionId`, `studentId`, `lessonDate`, `status` (`present` | `absent` | `late` | `excused`), `note` (ràng buộc unique `[sessionId, studentId, lessonDate]`).
- **Nhóm Nội dung (CMS) & Kho lưu trữ:**
  - `Announcement`: `id`, `title`, `contentHtml`/`contentJson` (rich-text), `tag` (`event` | `tuition` | `schedule` | `homework`), `isPinned` (thông báo khẩn), `publishedAt`, danh sách file đính kèm.
  - `Podcast`: `id`, `title`, `description`, `audioKey`, `thumbnailKey`, `durationSeconds`, `publishedAt`.
  - `HallOfFameEntry`: `id`, `studentId` (hoặc tên hiển thị), `periodType` (`week` | `month` | `course`), `periodLabel`, `achievement`, `awardedAt`.
  - `Project`: `id`, `title`, `description`, `studentId`/`authorName`, `className`, `category`, `projectUrl`, `coverImageKey`, `publishedAt`.
  - `Folder` & `FileObject`: cây thư mục cha-con (`parentId`), `storageKey`, `mimeType`, `sizeBytes`, `visibility` (`public` | `private`), liên kết folder.
- Chạy `prisma migrate dev` và viết seed script tạo dữ liệu mẫu phát triển.

### 1.2. Hệ thống Xác thực & Phân quyền
- **Đăng nhập Giáo viên (Admin):**
  - Tạo API `POST /api/auth/login` và `POST /api/auth/logout` gọi `verifyAdminCredentials` (`src/services/auth.service.ts`) + `createSession`/`destroySession` (`src/lib/auth.ts`).
  - Hoàn thiện form đăng nhập tại `src/app/login/page.tsx`, tự động điều hướng về `?next=` hoặc `/dashboard`.
  - Bổ sung nút đăng xuất và hiển thị tài khoản đang đăng nhập trong `AdminHeader`.
- **Xác thực Tra cứu Cá nhân (Học sinh/Phụ huynh):**
  - Bổ sung `verifyStudentCredentials(studentCode, staticPassword)` trong `src/services/auth.service.ts`.
  - Cấp session cookie phân quyền `role: "student"` giới hạn chặt chẽ theo `id` của chính học sinh đó.

### 1.3. Bổ sung UI Primitives (`src/components/ui/`)
- Cài đặt các thành phần Shadcn UI còn thiếu cho các giai đoạn sau: `table`, `dialog`, `select`, `tabs`, `textarea`, `dropdown-menu`, `sonner` (toast thông báo).

---

## Giai đoạn 2: Quản trị Lõi (Admin Core — CRM, Lịch dạy & CMS)

**Mục tiêu:** Cung cấp đầy đủ công cụ vận hành lớp học và xuất bản nội dung cho giáo viên tại `src/app/(admin)/`. Mọi thao tác chỉnh sửa đều cập nhật cache tag ngay lập tức.

### 2.1. Quản lý Học sinh & Học vụ (`/students`)
- **Service (`src/services/student.service.ts`):** Triển khai đầy đủ `listStudents` (tìm kiếm, phân trang), `getStudentById`, `createStudent`, `updateStudent`, `deleteStudent`, `recordGrade`, quản lý trạng thái học phí (`TuitionRecord`) và reset mật khẩu tĩnh cho học sinh.
- **API & UI:** Hoàn thiện `/api/admin/students` (và `/api/admin/students/[id]`), xây dựng bảng dữ liệu học sinh, modal thêm/sửa hồ sơ, drawer nhập điểm & nhận xét định kỳ, cập nhật học phí.

### 2.2. Quản lý Lịch dạy & Điểm danh nhanh (`/schedule`)
- **Service (`src/services/schedule.service.ts`):** Triển khai `listWeeklySchedule`, `createClassSession`, sửa/xóa ca học, `enrollStudents` (xếp học sinh vào ca), và `recordAttendance` (upsert hàng loạt cho cả buổi học trong 1 request).
- **UI (`src/components/admin/`):** Giao diện thời khóa biểu theo tuần, trình quản lý danh sách học sinh trong ca, và màn hình **Điểm danh nhanh** (tick trạng thái `Có mặt / Muộn / Vắng / Có phép` + ghi chú cho từng học sinh chỉ với 1 lần lưu).

### 2.3. Hệ thống Quản lý Nội dung (`/cms`)
- **Services mới & hoàn thiện:** Tạo `announcement.service.ts`, `hall-of-fame.service.ts`, `showcase.service.ts` và hoàn thiện `podcast.service.ts`.
- **Các phân hệ trong `/cms`:**
  - **Thông báo:** Trình soạn thảo Rich-text (làm sạch HTML chống XSS ở tầng service), gắn Tag (`Sự kiện`, `Học phí`, `Lịch học`, `Bài tập`), ghim thông báo khẩn, đính kèm tài liệu.
  - **Podcast:** Form upload file âm thanh (`.mp3`/`.m4a`) và ảnh thumbnail trực tiếp lên S3/R2 qua presigned URL, lưu metadata và đặt lịch xuất bản.
  - **Bảng vàng (Hall of Fame):** Thêm/sửa/xóa học sinh xuất sắc theo `Tuần`, `Tháng`, hoặc `Khóa học`.
  - **Dự án học sinh (Showcase):** Đăng tải sản phẩm học sinh kèm hình ảnh minh họa, phân loại lớp học/dự án, và đường dẫn sản phẩm.
- **Làm mới Cache tức thì:** Mỗi mutation ở tầng Admin gọi `updateTag()` / `revalidateTag()` dựa trên `CacheTags` (`src/lib/cache-tags.ts`) để dữ liệu ngoài Cổng Viewer cập nhật ngay.

### 2.4. Tổng quan Admin Dashboard (`/dashboard`)
- Hiển thị số liệu thực tế: tổng số học sinh đang học, các ca học trong ngày hôm nay, thống kê điểm danh gần nhất, danh sách học sinh chưa hoàn thành học phí và các nội dung vừa xuất bản.

---

## Giai đoạn 3: Cổng thông tin Khách (Viewer Portal — SEO, Streaming & Tra cứu)

**Mục tiêu:** Hoàn thiện giao diện công khai cho học sinh và phụ huynh tại `src/app/(viewer)/` với hiệu năng cao (static shell + `'use cache'`, tối ưu SEO).

### 3.1. Tầng đọc dữ liệu có Cache (`use cache` + `cacheLife` + `cacheTag`)
- Tạo các hàm đọc dữ liệu công khai được gắn tag theo `CacheTags` để toàn bộ trang Viewer tận dụng Partial Prerendering / ISR của Next.js 16 và tự động làm mới khi giáo viên cập nhật nội dung.
- Bổ sung `generateMetadata` động và OpenGraph cho các trang công khai để tối ưu SEO.

### 3.2. Trang chủ & Bảng tin Thông báo (`/` và bộ lọc Tag)
- Hiển thị tổng quan: Thông báo khẩn nổi bật, Học sinh xuất sắc mới nhất, Tập Podcast mới nhất, và Timeline lịch học trong tuần.
- Danh sách thông báo từ giáo viên có bộ lọc trực quan theo Tag (`Sự kiện`, `Học phí`, `Lịch học`, `Bài tập`) và xem file đính kèm.

### 3.3. Bảng Vàng & Thư viện Dự án (`/hall-of-fame`, `/showcase`)
- **Bảng Vàng:** Giao diện vinh danh theo `Tuần` / `Tháng` / `Khóa học`, có bộ lọc lịch sử theo các kỳ trước.
- **Thư viện Dự án:** Lưới trưng bày sản phẩm thực hành (tối ưu ảnh qua `next/image`), bộ lọc theo lớp học và loại hình dự án, kèm link xem trực tiếp.

### 3.4. Trình phát Audio Newsletter (`/podcast`)
- Xây dựng component client `AudioPlayer` trong `src/components/viewer/` hỗ trợ: phát/tạm dừng, tua thanh tiến độ (HTTP Range request trực tiếp từ S3/R2), điều chỉnh tốc độ phát, hiển thị thumbnail, mô tả tập và chuyển bài theo danh sách phát.

### 3.5. Tra cứu Cá nhân (`/student/[id]` & trang nhập mã)
- Form nhập `Mã học sinh (Student ID)` + `Mật khẩu tĩnh` xác thực qua API Viewer.
- Hiển thị dữ liệu riêng tư (bọc trong `<Suspense>` + `use cache: private` hoặc truy vấn request-time có xác thực session học sinh):
  - Bảng điểm chi tiết và nhận xét định kỳ của giáo viên.
  - Lịch sử điểm danh theo từng ca học / ngày học.
  - Trạng thái đóng học phí theo kỳ.
- Bảo đảm học sinh chỉ xem được hồ sơ tương ứng với session đã xác thực.

---

## Giai đoạn 4: Lưu trữ Đa phương tiện & Tinh chỉnh (Storage & Refinement)

**Mục tiêu:** Hoàn thiện trình quản lý tài liệu kiểu Google Drive mini trên S3/R2, kiểm tra bảo mật toàn diện và tối ưu trải nghiệm người dùng.

### 4.1. Trình quản lý File & Tài liệu (`/storage` cho Admin & `/documents` cho Viewer)
- **Service (`document.service.ts` kết hợp `storage.service.ts`):**
  - Quản lý cấu trúc thư mục lồng nhau (`Folder`) và tệp tin (`FileObject`).
  - Hỗ trợ đổi quyền truy cập `Public` <-> `Private` (di chuyển object an toàn giữa bucket public và bucket private, cập nhật DB theo transaction/bù trừ lỗi).
  - Xóa file đồng bộ cả metadata trong PostgreSQL và object trên S3/R2 (`deleteObject`).
- **Giao diện Admin (`/storage`):** Cây thư mục breadcrumb, kéo-thả upload nhiều file trực tiếp lên S3/R2 (thanh tiến trình PUT presigned URL), đổi tên, di chuyển thư mục, bật/tắt `Public/Private`.
- **Giao diện Viewer (`/documents`):** Duyệt thư mục môn học (PDF, Slide), xem trước (inline PDF/preview modal), tải xuống trực tiếp (file public) hoặc lấy presigned download URL có thời hạn ngắn (file private dành cho học sinh đã xác thực).

### 4.2. Kiểm thử & Hoàn thiện Production
- **Kiểm thử tự động (`src/services/**`):** Viết unit/integration tests cho validation Zod, kiểm tra bảo mật mật khẩu, logic chống path-traversal của object key, và nghiệp vụ điểm danh hàng loạt.
- **Cấu hình Cloud Storage & Hiệu năng:** Kiểm tra cấu hình CORS trên Cloudflare R2 / AWS S3 cho direct browser `PUT` và audio streaming (`Range`, `Content-Range`), kiểm tra responsive trên thiết bị di động, và đánh giá Lighthouse (Performance, Accessibility, SEO) cho toàn bộ `(viewer)` portal.

