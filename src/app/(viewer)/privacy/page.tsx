"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  Clock,
  Database,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

import {
  LegalPageShell,
  useTeacherPublicProfile,
  type LegalHighlightCard,
  type LegalTocItem,
} from "@/components/viewer/legal-page-shell";

const PRIVACY_TOC: LegalTocItem[] = [
  { id: "scope", label: "Phạm vi dữ liệu học vụ được thu thập" },
  { id: "purpose", label: "Mục đích sử dụng dữ liệu" },
  { id: "security", label: "Biện pháp bảo vệ kỹ thuật & Phân quyền" },
  { id: "infrastructure", label: "Hạ tầng lưu trữ minh bạch" },
  { id: "rights", label: "Quyền của Phụ huynh & Học viên" },
  { id: "contact", label: "Đầu mối liên hệ về quyền riêng tư" },
];

const PRIVACY_HIGHLIGHTS: LegalHighlightCard[] = [
  {
    icon: <Lock className="size-4 shrink-0" aria-hidden="true" />,
    title: "Không công khai hồ sơ cá nhân",
    description:
      "Điểm số, điểm danh, học phí và nhận xét chỉ hiển thị sau khi đăng nhập đúng tài khoản Cổng Học sinh.",
  },
  {
    icon: <EyeOff className="size-4 shrink-0" aria-hidden="true" />,
    title: "Ẩn số điện thoại & Ghi chú nội bộ",
    description:
      "Số điện thoại phụ huynh luôn được che (0903 ••• 812); ghi chú sư phạm nội bộ không bao giờ lộ ra ngoài.",
  },
  {
    icon: <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />,
    title: "Bảo mật chuẩn hiện đại",
    description:
      "Mật khẩu băm scrypt, phiên HttpOnly Cookie, khóa tạm sau 5 lần sai và chống truy cập chéo hồ sơ (IDOR).",
  },
];

export default function PrivacyPolicyPage() {
  const profile = useTeacherPublicProfile();

  return (
    <LegalPageShell
      activeSlug="privacy"
      badgeLabel="Chính sách bảo mật"
      updatedAtLabel="Cập nhật lần cuối: Học kỳ I · Năm học 2026–2027"
      title="Chính sách Bảo mật & Quyền riêng tư Học viên"
      subtitle={`Không gian học thuật ${profile.name} cam kết bảo vệ tuyệt đối thông tin học tập, điểm số và dữ liệu liên hệ của Phụ huynh và Học viên theo nguyên tắc minh bạch, tối giản và không thương mại hóa dữ liệu.`}
      highlights={PRIVACY_HIGHLIGHTS}
      toc={PRIVACY_TOC}
    >
      {/* 1. Scope */}
      <section
        id="scope"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          1. Phạm vi dữ liệu học vụ được thu thập
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Hệ thống chỉ lưu trữ các thông tin thực sự cần thiết cho việc giảng dạy, đánh giá năng lực và phối hợp với gia đình:
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          <li>
            • <strong>Thông tin định danh học viên:</strong> Mã học sinh (VD:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              HS-2026-01
            </code>
            ), họ và tên, lớp theo học, trình độ CEFR, ngày nhập học và mục tiêu đầu ra.{" "}
            <span className="font-medium text-primary">
              Hệ thống không thu thập và không lưu ảnh chân dung của học sinh.
            </span>
          </li>
          <li>
            • <strong>Hồ sơ học thuật:</strong> Điểm kiểm tra định kỳ 4 kỹ năng (Listening, Reading, Writing, Speaking), nhận xét chuyên môn của giáo viên, lịch sử chuyên cần và tình trạng nộp bài tập về nhà.
          </li>
          <li>
            • <strong>Thông tin liên hệ gia đình &amp; Học phí:</strong> Tên phụ huynh, mối quan hệ, số điện thoại/email liên hệ và sổ theo dõi thanh toán học phí theo từng kỳ.
          </li>
        </ul>
      </section>

      {/* 2. Purpose */}
      <section
        id="purpose"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          2. Mục đích sử dụng dữ liệu
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Dữ liệu học viên chỉ được sử dụng cho các mục đích học vụ chính đáng:
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          <li>
            • Cung cấp Cổng tra cứu cá nhân (<code className="font-mono text-xs">/student</code>) giúp Phụ huynh và Học viên theo dõi tiến bộ, lịch học và học liệu theo thời gian thực.
          </li>
          <li>
            • Phát hiện sớm rủi ro học tập (nghỉ học nhiều, chưa nộp BTVN, tụt điểm kỹ năng) để giáo viên hỗ trợ kèm cặp kịp thời.
          </li>
          <li>
            • Đối soát học phí minh bạch, cấp mã biên nhận điện tử và gửi thông báo học vụ quan trọng tới gia đình.
          </li>
          <li>
            • <strong>Cam kết 3 không:</strong> Không bán, không cho thuê và không chia sẻ dữ liệu học sinh cho bất kỳ bên thứ ba quảng cáo nào.
          </li>
        </ul>
      </section>

      {/* 3. Technical Security */}
      <section
        id="security"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          3. Biện pháp bảo vệ kỹ thuật &amp; Phân quyền
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/80 bg-muted/25 p-4">
            <p className="font-heading text-xs font-bold text-primary">
              Mã hóa mật khẩu &amp; Phiên đăng nhập
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Mật khẩu Cổng học sinh được băm một chiều bằng thuật toán <code>scrypt</code> có muối ngẫu nhiên. Phiên đăng nhập lưu bằng cookie <code>HttpOnly</code>, <code>SameSite=Lax</code> và tự động khóa tạm nếu nhập sai liên tiếp 5 lần.
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/25 p-4">
            <p className="font-heading text-xs font-bold text-primary">
              Phân quyền RBAC &amp; Chống xem chéo (IDOR)
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Mỗi tài khoản học sinh chỉ được phép truy cập duy nhất hồ sơ của chính mình. Mọi nỗ lực thay đổi mã số để xem dữ liệu học viên khác đều bị chặn ngay từ tầng máy chủ.
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/25 p-4">
            <p className="font-heading text-xs font-bold text-primary">
              Tách biệt ghi chú nội bộ &amp; Bản nháp điểm
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ghi chú nội bộ của giáo viên và các bài kiểm tra đang ở trạng thái Bản nháp được lọc bỏ hoàn toàn trước khi trả dữ liệu ra Cổng học sinh hoặc Phiếu báo cáo phụ huynh.
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/25 p-4">
            <p className="font-heading text-xs font-bold text-primary">
              Tài liệu nội bộ dùng Signed URL có thời hạn
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Học liệu riêng của lớp học được bảo vệ trong kho riêng tư; đường dẫn tải về chỉ có hiệu lực trong khoảng thời gian ngắn sau khi đã xác thực học viên.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Infrastructure */}
      <section
        id="infrastructure"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-lg font-bold text-foreground">
            4. Hạ tầng lưu trữ minh bạch
          </h2>
        </div>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          <li>
            • <strong>Cơ sở dữ liệu PostgreSQL (Supabase):</strong> Lưu trữ hồ sơ học viên, bảng điểm, lịch học, điểm danh và nhật ký học vụ với cơ chế sao lưu định kỳ.
          </li>
          <li>
            • <strong>Supabase Storage:</strong> Lưu trữ tệp PDF, Slide bài giảng, phiếu bài tập và tệp âm thanh Podcast.
          </li>
          <li>
            • <strong>Cloudinary:</strong> Chỉ lưu trữ hình ảnh công khai của website (ảnh bìa dự án học sinh đã duyệt, ảnh bìa Podcast, ảnh đại diện giáo viên); tự động xóa ảnh cũ khi thay đổi.
          </li>
        </ul>
      </section>

      {/* 5. Rights */}
      <section
        id="rights"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <UserCheck className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-lg font-bold text-foreground">
            5. Quyền của Phụ huynh &amp; Học viên
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Phụ huynh và Học viên có toàn quyền yêu cầu giáo viên thực hiện các thao tác sau bất cứ lúc nào:
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          <li>
            • Kiểm tra, đính chính thông tin cá nhân, số điện thoại liên hệ hoặc mục tiêu học tập.
          </li>
          <li>
            • Yêu cầu đặt lại mật khẩu hoặc tạm khóa tài khoản Cổng Học sinh ngay lập tức nếu nghi ngờ lộ mật khẩu.
          </li>
          <li>
            • Yêu cầu ẩn dự án học sinh khỏi mục Showcase công khai hoặc lưu trữ/xóa hồ sơ sau khi kết thúc khóa học.
          </li>
        </ul>
      </section>

      {/* 6. Contact */}
      <section
        id="contact"
        className="scroll-mt-28 rounded-2xl border border-border bg-warm/35 p-6 shadow-2xs"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          6. Đầu mối liên hệ về quyền riêng tư
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Mọi thắc mắc hoặc yêu cầu liên quan đến dữ liệu cá nhân, vui lòng liên hệ trực tiếp với giáo viên phụ trách:
        </p>
        <div className="mt-4 space-y-2 text-sm text-foreground">
          <p className="font-semibold">{profile.name}</p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Mail className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <a
              href={`mailto:${profile.email}`}
              className="font-medium text-primary hover:underline"
            >
              {profile.email}
            </a>
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{profile.officeHours}</span>
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{profile.location}</span>
          </p>
        </div>
        <div className="mt-4">
          <Link
            href={"/support" as Route}
            className="inline-flex h-9 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-deep-navy"
          >
            Tới Trung tâm Hỗ trợ →
          </Link>
        </div>
      </section>
    </LegalPageShell>
  );
}
