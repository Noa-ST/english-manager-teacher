# DESIGN SYSTEM — Classroom Management & Teacher Personal Branding Platform

> **Generated & Validated with UI UX Pro Max Skill (`ui-ux-pro-max`, `design-system`, `ui-styling`)**
> **Design Direction:** Modern Academic – Friendly & Premium
> **Archetype:** Education Editorial Portal (Public Viewer) + High-Efficiency Academic Workspace (Teacher Admin)

---

## 1. Brand & Aesthetic Philosophy

Hệ thống kết hợp hai không gian trải nghiệm bổ trợ lẫn nhau trên cùng một ngôn ngữ thiết kế **Modern Academic – Friendly & Premium**:

1. **Public Portal (`(viewer)`) — Education Editorial & Personal Brand:**
   - Mang cảm hứng từ các tạp chí học thuật hiện đại (Editorial Publishing, Kinfolk/Monocle-inspired EdTech, Coursera/MasterClass editorial layout).
   - Nhiều khoảng trắng thoáng đãng, phân cấp chữ viết rõ ràng, điểm nhấn ấm áp từ nền **Cream (`#F5EEDC`)** và sắc **Coral (`#F3A98B`)** kết hợp cùng sự tin cậy, chuẩn mực của **Navy (`#243B64`)**.
2. **Admin Dashboard (`(admin)`) — High-Velocity Teacher Workspace:**
   - Ưu tiên tốc độ thao tác, mật độ thông tin hợp lý, giảm số lần click (đặc biệt cho Điểm danh nhanh 1-chạm và Nhập điểm hàng loạt).
   - Bố cục lưới 12 cột chuẩn Swiss Style, đường viền mảnh tinh tế (`1px solid #E3E8F2`), trạng thái tương tác rõ ràng.

### Anti-Patterns (Tuyệt đối tránh)
- Không thiết kế giống cổng thông tin trường học truyền thống nặng nề.
- Không dùng phong cách trẻ con (Claymorphism, font hoạt hình, màu neon rực rỡ).
- Không lạm dụng gradient tím/hồng kiểu AI đại trà hoặc glassmorphism dày đặc.
- Không dùng emoji (`🎓`, `🚀`, `🔥`) thay cho icon hệ thống — sử dụng 100% vector SVG từ `lucide-react`.
- Không lồng quá nhiều tầng card-trong-card gây rối mắt.
- Không lộ bất kỳ thông tin cá nhân/điểm số/học phí của học sinh trước khi xác thực.

---

## 2. Three-Layer Color Token System

### 2.1. Layer 1 — Primitive Brand Tokens
| Token | Hex | Vai trò gốc |
| :--- | :--- | :--- |
| `--brand-navy` | `#243B64` | Primary Academic Navy |
| `--brand-blue` | `#6C8FE6` | Primary Accent Blue |
| `--brand-sky` | `#B9D8F5` | Secondary Soft Sky |
| `--brand-cream` | `#F5EEDC` | Warm Editorial Background |
| `--brand-coral` | `#F3A98B` | Warm Highlight & Achievement Accent |
| `--brand-white` | `#FFFFFF` | Pure Surface |
| `--brand-light-gray` | `#F7F8FC` | Cool Canvas Background |
| `--brand-text` | `#253047` | Deep Ink Primary Text |
| `--brand-muted` | `#7B8497` | Muted Caption / Secondary Accent |
| `--brand-muted-strong` | `#566074` | Accessible Secondary Text (≥ 4.5:1 AA on `#F7F8FC` & `#FFFFFF`) |

### 2.2. Layer 2 — Semantic Tokens
| Semantic Variable | Tailwind Class | Giá trị ánh xạ | Ngữ cảnh sử dụng |
| :--- | :--- | :--- | :--- |
| `--background` | `bg-background` | `#F7F8FC` | Nền tổng thể của trang |
| `--foreground` | `text-foreground` | `#253047` | Văn bản chính (tỷ lệ tương phản `11.8:1` AAA) |
| `--card` | `bg-card` | `#FFFFFF` | Bề mặt thẻ, bảng, modal, drawer |
| `--primary` | `bg-primary text-primary-foreground` | `#243B64` / `#FFFFFF` | CTA chính, trạng thái active, tiêu đề điểm nhấn |
| `--primary-accent` | `bg-primary-accent` | `#6C8FE6` | Focus ring, đường dẫn, biểu đồ, chỉ báo |
| `--secondary` | `bg-secondary text-secondary-foreground` | `#B9D8F5` / `#243B64` | Badge phụ, chip lọc, điểm nhấn nhẹ |
| `--warm` | `bg-warm text-warm-foreground` | `#F5EEDC` / `#253047` | Vùng Editorial Hero, trích dẫn, vinh danh Bảng vàng |
| `--highlight` | `bg-highlight text-highlight-foreground` | `#F3A98B` / `#253047` | Huy hiệu nổi bật, thông báo quan trọng, điểm nhấn ấm |
| `--muted` | `bg-muted text-muted-foreground` | `#EEF1F8` / `#566074` | Nền phụ, skeleton, văn bản mô tả phụ |
| `--border` | `border-border` | `#E3E8F2` | Đường viền mảnh phân tách khối |
| `--ring` | `ring-ring` | `#6C8FE6` | Viền focus bàn phím (`focus-visible`) |
| `--success` | `text-emerald-700 bg-emerald-50` | `#15803D` / `#ECFDF5` | Có mặt, Đã đóng học phí, Hoàn thành |
| `--warning` | `text-amber-800 bg-amber-50` | `#92400E` / `#FFFBEB` | Đi muộn, Sắp đến hạn, Bản nháp |
| `--destructive` | `text-destructive` | `#DC2626` | Vắng mặt không phép, Quá hạn, Xóa |

### 2.3. Quy tắc Phối màu (60–30–10 Rule)
- **60% Neutral Canvas:** `#F7F8FC` (Background) và `#FFFFFF` (Surface) tạo độ thoáng.
- **30% Academic Structure:** `#243B64` (Navy), `#253047` (Text) và `#F5EEDC` (Cream cho phân vùng nội dung biên tập).
- **10% Focal Accents:** `#6C8FE6` (Blue), `#B9D8F5` (Sky), `#F3A98B` (Coral) chỉ dùng cho CTA, badge, trạng thái chọn và biểu đồ.

---

## 3. Typography System

Được lựa chọn từ kết quả truy vấn `ui-ux-pro-max` (`--domain typography` → *Vietnamese Friendly*):

- **Heading & Editorial Display (`--font-heading`):** `Be Vietnam Pro` (`500`, `600`, `700`) — Thiết kế chuyên biệt cho dấu tiếng Việt, hình học hiện đại, thân thiện nhưng chững chạc.
- **Body & UI Controls (`--font-sans`):** `Inter` (`400`, `500`, `600`) — Độ rõ nét tối đa cho bảng dữ liệu, biểu mẫu, đoạn văn dài.
- **Code & Metrics (`--font-mono`):** `Geist Mono` (`400`, `500`) — Dùng cho Mã học sinh (`HS-2026-001`), thời lượng audio (`14:20`), điểm số (`8.5`).

### Thang phân cấp chữ (Type Scale)
| Cấp độ | Kích thước (Desktop / Mobile) | Line Height | Font / Weight | Cách dùng |
| :--- | :--- | :--- | :--- | :--- |
| **Display Hero** | `2.75rem` (44px) / `2rem` (32px) | `1.15` | `Be Vietnam Pro` `700` | Tiêu đề chính trang chủ |
| **Page Title (H1)** | `1.875rem` (30px) / `1.5rem` (24px) | `1.25` | `Be Vietnam Pro` `600` | Tiêu đề trang Public & Admin |
| **Section Title (H2)** | `1.375rem` (22px) / `1.25rem` (20px) | `1.3` | `Be Vietnam Pro` `600` | Tiêu đề phân khu |
| **Card Title (H3)** | `1.0625rem` (17px) | `1.4` | `Be Vietnam Pro` `600` | Tiêu đề thẻ, tên tập podcast, dự án |
| **Body Regular** | `0.9375rem` (15px) | `1.6` | `Inter` `400` | Nội dung bài viết, mô tả |
| **UI Control / Table** | `0.875rem` (14px) | `1.5` | `Inter` `500` | Nút bấm, ô nhập, dòng bảng dữ liệu |
| **Caption / Badge** | `0.75rem` (12px) | `1.4` | `Inter` `500` / `600` | Nhãn phân loại, timestamp, trạng thái |

---

## 4. Spacing, Layout & Radius System

- **Nhịp khoảng cách (8px Spatial Rhythm):** `4px` (`gap-1`), `8px` (`gap-2`), `12px` (`gap-3`), `16px` (`gap-4`), `24px` (`gap-6`), `32px` (`gap-8`), `48px` (`py-12`), `64px` (`py-16`).
- **Border Radius chủ đạo (`12px–18px`):**
  - `--radius`: `0.875rem` (`14px`) cho Card, Modal, Section panel.
  - `--radius-md`: `0.75rem` (`12px`) cho Button, Input, Select, Dropdown.
  - `--radius-xl`: `1.125rem` (`18px`) cho Hero container, Featured Podcast, Podium Card.
- **Đổ bóng & Viền (Elevation):**
  - Viền mặc định: `1px solid var(--border)` (`#E3E8F2`).
  - Shadow nhẹ tinh tế: `0 1px 3px rgba(36, 59, 100, 0.04), 0 6px 16px -4px rgba(36, 59, 100, 0.05)`.

---

## 5. Responsive Breakpoints & Adaptive Patterns

- **Mobile (`360px – 767px`):**
  - Public Portal ưu tiên Mobile-first: Navigation thu gọn vào ngăn kéo (Sheet/Drawer) có nút chạm `>= 44x44px`, Hero xếp dọc 1 cột, bộ lọc danh mục cuộn ngang mượt mà, trình phát Podcast bám đáy gọn gàng.
  - Admin Dashboard: Sidebar ẩn thành Drawer trượt ngang, bảng dữ liệu hỗ trợ cuộn ngang có cột cố định hoặc thẻ tóm tắt, giao diện Điểm danh tối ưu chạm ngón tay.
- **Tablet (`768px – 1023px`):**
  - Lưới 2 cột cho danh sách thẻ, Admin Sidebar hỗ trợ thu gọn (Collapsed Icon Rail `72px`) để nhường không gian cho bảng điểm và lịch dạy.
- **Desktop (`1024px+`):**
  - Public Portal: Container tối đa `1200px` (`max-w-6xl`), bố cục Editorial 12 cột bất đối xứng có chủ đích (예: 7 cột nội dung + 5 cột lịch/podcast).
  - Admin Dashboard: Sidebar mở rộng `256px` (có thể thu gọn về `72px`), Topbar cố định kèm Global Search, Notification Center và Breadcrumb.

---

## 6. Component & Accessibility Rules (WCAG 2.2 AA)

1. **Đầy đủ 8 trạng thái cho mọi Interactive Component:** `Default`, `Hover` (150–200ms transition), `Focus-visible` (2px ring `#6C8FE6`), `Active`, `Disabled` (`opacity-50 pointer-events-none`), `Loading` (spinner/skeleton + `aria-busy`), `Error` (`aria-invalid` + thông báo lỗi liên kết), `Success`.
2. **Icon Semantics:** Mọi icon trang trí đi kèm chữ phải có `aria-hidden="true"`. Mọi nút chỉ có icon phải có `aria-label` tiếng Việt rõ nghĩa.
3. **Accessible Authentication:** Cho phép dán mật khẩu (`paste`), hỗ trợ `autocomplete`, có Focusable Error Summary (`role="alert"`) khi biểu mẫu có lỗi.
4. **Bảo mật Dữ liệu Học sinh:** Trang Tra cứu Cá nhân (`/student`, `/student/[id]`) tuyệt đối không hiển thị điểm số, nhận xét hay học phí trước khi người dùng xác thực Mã học sinh + Mật khẩu.
