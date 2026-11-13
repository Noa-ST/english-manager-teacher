# BÁO CÁO THIẾT KẾ & TRIỂN KHAI UI/UX TOÀN DIỆN (UI/UX PRO MAX)

> **Dự án**: Classroom Management & Teacher Personal Branding Platform  
> **Định hướng thiết kế**: Modern Academic — Friendly & Premium  
> **Bộ kỹ năng áp dụng**: `ui-ux-pro-max`, `design-system`, `ui-styling`  
> **Trạng thái kiểm định**: `tsc --noEmit` (0 lỗi), `eslint` (0 lỗi, 0 cảnh báo), `next build` (26/26 trang thành công)

---

## 1. Tổng quan Quy trình Áp dụng UI/UX Pro Max Skill

Chúng tôi đã kích hoạt và chạy trực tiếp công cụ phân tích của **UI/UX Pro Max** (`.agents/skills/ui-ux-pro-max/scripts/search.py`) kết hợp cùng tài liệu `design-system` và `ui-styling`:
1. **Phân tích sản phẩm & Style Direction**: Lựa chọn kiến trúc **Modern Academic – Friendly & Premium** (kết hợp giữa *Editorial Academic* cho cổng thương hiệu cá nhân của giáo viên và *Minimalist Swiss Grid* cho bảng điều khiển quản trị lớp học).
2. **Kiến trúc Token 3 tầng (Three-Layer Token Architecture)**: Thiết lập đầy đủ tại [DESIGN_SYSTEM.md](file:///d:/Project-My/english-manager-teacher/DESIGN_SYSTEM.md) và [src/app/globals.css](file:///d:/Project-My/english-manager-teacher/src/app/globals.css):
   - **Navy (`#243B64`)**: Primary Brand & Authority.
   - **Blue (`#6C8FE6`)**: Primary Accent & Interactive Highlights.
   - **Sky (`#B9D8F5`)**: Secondary Surface & Badges.
   - **Cream (`#F5EEDC`)**: Warm Editorial Background & Podium Spotlights.
   - **Coral (`#F3A98B`)**: Urgent Callouts & Achievement Highlights.
   - **White (`#FFFFFF`) & Light Gray (`#F7F8FC`)**: Surface & App Canvas.
   - **Slate (`#253047`) & Muted (`#556075` / `#7B8497`)**: Hệ thống phân cấp chữ đạt chuẩn tương phản **WCAG 2.2 AA**.
3. **Typography Tiếng Việt Chuẩn Mực**: Cấu hình tại [src/app/layout.tsx](file:///d:/Project-My/english-manager-teacher/src/app/layout.tsx) với `Be Vietnam Pro` cho toàn bộ Heading/Display, `Inter` cho Body/Controls và `Geist Mono` cho Mã học sinh, Điểm số, Thời lượng.

---

## 2. Hệ thống Shared UI Components Đã Xây Dựng

Toàn bộ các UI Primitives trong `src/components/` đều hỗ trợ đầy đủ trạng thái (`default`, `hover`, `focus-visible`, `active`, `disabled`, `loading`, `error`, `success`):
- [button.tsx](file:///d:/Project-My/english-manager-teacher/src/components/ui/button.tsx) & [input.tsx](file:///d:/Project-My/english-manager-teacher/src/components/ui/input.tsx): Nút bấm và ô nhập liệu chuẩn 8pt grid.
- [badge.tsx](file:///d:/Project-My/english-manager-teacher/src/components/ui/badge.tsx): Hỗ trợ 10 biến thể ngữ nghĩa (`default`, `secondary`, `warm`, `highlight`, `success`, `warning`, `info`, `destructive`, `outline`, `ghost`).
- [table.tsx](file:///d:/Project-My/english-manager-teacher/src/components/ui/table.tsx): Bảng dữ liệu học thuật có bo góc 16px, hàng hover mượt và cố định tiêu đề.
- [dialog.tsx](file:///d:/Project-My/english-manager-teacher/src/components/ui/dialog.tsx): Bao gồm `ModalDialog` (hỗ trợ phím `Escape`, khóa cuộn, ARIA role) và `ConfirmDialog` cho các tác vụ xóa/lưu trữ.
- [feedback.tsx](file:///d:/Project-My/english-manager-teacher/src/components/ui/feedback.tsx): Bao gồm `Skeleton`, `EmptyState`, `Breadcrumb` và `PaginationBar`.
- [toast.tsx](file:///d:/Project-My/english-manager-teacher/src/components/ui/toast.tsx): Hệ thống thông báo phản hồi tức thì (`ToastProvider` & `useToast`).
- [audio-player.tsx](file:///d:/Project-My/english-manager-teacher/src/components/viewer/audio-player.tsx): Trình phát Podcast tương tác có thanh tua thời gian thực, đổi tốc độ đọc (`0.75x`, `1x`, `1.25x`, `1.5x`), tua nhanh ±15 giây và từ vựng nổi bật.

---

## 3. Chi tiết Các Trang Public Portal (`src/app/(viewer)/`)

1. **Trang chủ Editorial ([page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28viewer%29/%28home%29/page.tsx))**:
   - Hero giới thiệu thương hiệu cá nhân **ThS. Nguyễn Minh Anh**, chứng chỉ quốc tế, triết lý sư phạm và thống kê kết quả đầu ra.
   - Điểm nhấn Thông báo khẩn, Lịch học tuần có bộ lọc theo từng thứ, Top 3 Bảng vàng, Trình nghe Podcast nổi bật, Dự án học sinh và Tài liệu mới nhất.
2. **Bảng tin & Chi tiết Thông báo ([announcements/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28viewer%29/announcements/page.tsx) & [announcements/[id]/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28viewer%29/announcements/%5Bid%5D/page.tsx))**:
   - Ghim thông báo khẩn đầu trang, lọc theo 5 danh mục, tìm kiếm theo lớp/từ khóa, xem toàn văn và tải tệp đính kèm.
3. **Bảng vàng Học sinh ([hall-of-fame/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28viewer%29/hall-of-fame/page.tsx))**:
   - Bục vinh danh Top 3 (Hạng 1 nổi bật ở trung tâm), lọc theo Tuần / Tháng / Khóa học, huy hiệu thành tích và nhận xét của giáo viên.
4. **Podcast / Audio Newsletter ([podcast/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28viewer%29/podcast/page.tsx))**:
   - Trình phát âm thanh đồng bộ trực tiếp với danh sách phát, hiển thị Show Notes kèm mốc thời gian và danh mục từ vựng học thuật (IPA + nghĩa tiếng Việt).
5. **Thư viện Dự án Học sinh ([showcase/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28viewer%29/showcase/page.tsx))**:
   - Lọc theo thể loại (`Research Poster`, `Debate Portfolio`, `Video Presentation`, `Academic Essay`) và theo lớp học, tích hợp hộp thoại xem tóm tắt đồ án.
6. **Kho Tài liệu Học tập ([documents/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28viewer%29/documents/page.tsx))**:
   - Duyệt theo thư mục, thanh `Breadcrumb` động, chuyển đổi chế độ Lưới (`Grid`) / Danh sách (`List`), hộp thoại Xem trước nội dung (`Preview Modal`) và tải xuống.
7. **Cổng Tra cứu Cá nhân Bảo mật ([student/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28viewer%29/student/page.tsx) & [student/[id]/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28viewer%29/student/%5Bid%5D/page.tsx))**:
   - **Tuân thủ nghiêm ngặt quy tắc bảo mật**: Trước khi xác thực chỉ hiển thị biểu mẫu nhập Mã học sinh + Mật khẩu tra cứu, tuyệt đối không lộ dữ liệu cá nhân. Sau khi xác thực hiển thị đầy đủ Hồ sơ, Biểu đồ 4 kỹ năng, Lịch sử điểm, Nhật ký điểm danh, Nhận xét giáo viên và Học phí.

---

## 4. Chi tiết Các Trang Admin Dashboard (`src/app/(admin)/`)

1. **Admin Shell & Tìm kiếm Toàn cục ([admin-shell.tsx](file:///d:/Project-My/english-manager-teacher/src/components/admin/admin-shell.tsx))**:
   - Sidebar thu gọn/mở rộng, Drawer trên di động, hộp thoại Tìm kiếm nhanh (`Ctrl+K`), Trung tâm thông báo và nút chuyển nhanh sang Cổng học sinh.
2. **Tổng quan Dashboard ([dashboard/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28admin%29/dashboard/page.tsx))**:
   - 4 thẻ KPI vận hành, thanh 6 thao tác nhanh (`Quick Actions` mở modal tạo học sinh & đăng thông báo ngay tại chỗ), lịch dạy trong ngày, biểu đồ chuyên cần theo lớp và cảnh báo học vụ.
3. **Quản lý Hồ sơ Học sinh ([students/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28admin%29/students/page.tsx))**:
   - Tìm kiếm, lọc theo lớp & học phí, sắp xếp đa tiêu chí, chọn hàng loạt (`Bulk Actions`), phân trang, hộp thoại Xem chi tiết hồ sơ và Thêm/Sửa/Xóa học sinh.
4. **Quản lý Lớp học ([classes/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28admin%29/classes/page.tsx))**:
   - Thẻ lớp học trực quan với thanh công suất sĩ số, học phần hiện tại, xem danh sách học viên từng lớp và tạo/chỉnh sửa lớp.
5. **Quản lý Lịch dạy & Ca học ([schedule/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28admin%29/schedule/page.tsx))**:
   - Chuyển đổi Lịch Tuần (7 cột) và Tổng quan Tháng, bộ kiểm tra xung đột lịch dạy tự động (`Conflict Detector`) và modal lên lịch ca dạy mới.
6. **Điểm danh 1 Chạm ([attendance/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28admin%29/attendance/page.tsx))**:
   - Chọn lớp, chọn ca học, nút **Đánh dấu tất cả Có mặt**, chọn nhanh 4 trạng thái (`Có mặt`, `Đi muộn`, `Vắng mặt`, `Có phép`) kèm ghi chú trên từng dòng học sinh.
7. **Quản lý Điểm số & Nhận xét ([grades/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28admin%29/grades/page.tsx))**:
   - Nhập điểm hàng loạt 4 kỹ năng (`Listening`, `Reading`, `Writing`, `Speaking`), tự động tính `Overall` chuẩn thang 9.0 và nhập nhận xét trực tiếp.
8. **Quản trị Nội dung CMS ([cms/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28admin%29/cms/page.tsx))**:
   - 5 phân hệ trong một không gian thống nhất: Thông báo (tích hợp thanh công cụ Rich Text Editor, ghim tin, lưu nháp, xem trước), Podcast, Bảng vàng, Dự án học sinh và Học liệu.
9. **Quản lý Kho File Cloud ([storage/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28admin%29/storage/page.tsx))**:
   - Thanh dung lượng Cloudflare R2 / S3, cây thư mục bên trái, vùng kéo thả tải tệp, chuyển đổi quyền `Public` / `Private` trực tiếp và xem trước tệp.
10. **Cài đặt Hệ thống ([settings/page.tsx](file:///d:/Project-My/english-manager-teacher/src/app/%28admin%29/settings/page.tsx))**:
    - Cập nhật hồ sơ thương hiệu giáo viên, bảng màu Design System, mật khẩu mặc định Cổng tra cứu và thời hạn Presigned URL.

