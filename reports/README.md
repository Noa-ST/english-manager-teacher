# Thư mục Báo cáo Triển khai — English Manager & Teacher Portal

Thư mục này lưu trữ toàn bộ tài liệu báo cáo kỹ thuật và kế hoạch triển khai tính năng bằng tiếng Việt cho hệ thống **Quản lý Lớp học & Cổng thông tin Giáo viên (All-in-one)**, được xây dựng theo kiến trúc tách biệt logic bền vững 10 năm.

## Danh sách báo cáo

| STT | Tài liệu | Nội dung chính | Trạng thái |
| --- | --- | --- | --- |
| 01 | [Báo cáo Khởi tạo Setup & Kiến trúc Nền tảng](./01-bao-cao-setup-va-kien-truc.md) | Chi tiết cấu trúc thư mục, Next.js 16.4.6 (`Cache Components`), Prisma 7, ranh giới kiến trúc `src/services`, cơ chế Auth/Storage và kết quả kiểm thử khởi tạo. | Đã hoàn thành |
| 02 | [Báo cáo Kế hoạch Triển khai Chức năng (4 Giai đoạn)](./02-bao-cao-ke-hoach-trien-khai-chuc-nang.md) | Lộ trình triển khai chi tiết từng bước cho toàn bộ tính năng Admin CRM/CMS, Viewer Portal, Tra cứu cá nhân và Kho lưu trữ S3/R2 theo SRS. | Sẵn sàng thực thi |

## Trạng thái tổng quan theo 4 Giai đoạn

- [x] **Bước tiền đề (Scaffolding):** Khởi tạo cấu trúc thư mục, cấu hình Next.js 16, ESLint boundary rules, Prisma 7 config, lớp `src/services` và `src/lib`.
- [ ] **Giai đoạn 1 — Nền tảng (Foundation):** Sinh Prisma Schema & Migration, Auth giáo viên + học sinh, bộ UI primitives.
- [ ] **Giai đoạn 2 — Quản trị Lõi (Admin Core):** CRM Học sinh & Điểm số, Lịch dạy & Điểm danh nhanh, CMS (Thông báo, Podcast, Bảng vàng, Dự án), Dashboard tổng quan.
- [ ] **Giai đoạn 3 — Cổng thông tin Khách (Viewer Portal):** Caching (`use cache` + `cacheTag`), Trang chủ, Bảng vàng, Showcase, Podcast Player, Tra cứu cá nhân.
- [ ] **Giai đoạn 4 — Lưu trữ & Tinh chỉnh (Storage & Refinement):** Trình quản lý file Mini Drive S3/R2 (Public/Private), kiểm thử tự động, tối ưu hiệu năng & bảo mật.

