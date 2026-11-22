"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  BookOpen,
  CheckCircle2,
  CreditCard,
  FileText,
  KeyRound,
  Scale,
} from "lucide-react";

import {
  LegalPageShell,
  useTeacherPublicProfile,
  type LegalHighlightCard,
  type LegalTocItem,
} from "@/components/viewer/legal-page-shell";

const TERMS_TOC: LegalTocItem[] = [
  { id: "applicability", label: "Phạm vi áp dụng của Điều khoản" },
  { id: "accounts", label: "Tài khoản Cổng Học sinh & Trách nhiệm bảo mật" },
  { id: "academic-rules", label: "Quy chế Điểm số, Chuyên cần & Bảo lưu" },
  { id: "tuition", label: "Quy định Học phí & Biên nhận điện tử" },
  { id: "ip", label: "Bản quyền Học liệu & Dự án Học sinh" },
  { id: "changes", label: "Cập nhật điều khoản & Giải đáp" },
];

const TERMS_HIGHLIGHTS: LegalHighlightCard[] = [
  {
    icon: <BookOpen className="size-4 shrink-0" aria-hidden="true" />,
    title: "Đúng mục đích học tập",
    description:
      "Cổng công khai miễn phí cho cộng đồng; Cổng học sinh dành riêng cho học viên đang theo học và phụ huynh.",
  },
  {
    icon: <Scale className="size-4 shrink-0" aria-hidden="true" />,
    title: "Tôn trọng bản quyền học liệu",
    description:
      "PDF, Slide, Worksheet và Podcast chỉ phục vụ ôn tập cá nhân, không sao chép hoặc phát tán thương mại.",
  },
  {
    icon: <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />,
    title: "Minh bạch học vụ & học phí",
    description:
      "Điểm kiểm tra chỉ có hiệu lực chính thức sau khi Công bố; mọi khoản thu đều có mã biên nhận đối soát.",
  },
];

export default function TermsOfUsePage() {
  const profile = useTeacherPublicProfile();

  return (
    <LegalPageShell
      activeSlug="terms"
      badgeLabel="Điều khoản sử dụng"
      updatedAtLabel="Áp dụng từ: Học kỳ I · Năm học 2026–2027"
      title="Điều khoản Sử dụng & Quy chế Học vụ"
      subtitle={`Khi truy cập Cổng thông tin học thuật và Cổng tra cứu cá nhân của ${profile.name}, Phụ huynh và Học viên đồng ý tuân thủ các nguyên tắc vận hành minh bạch dưới đây để đảm bảo môi trường học tập tôn trọng và hiệu quả.`}
      highlights={TERMS_HIGHLIGHTS}
      toc={TERMS_TOC}
    >
      {/* 1. Applicability */}
      <section
        id="applicability"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-lg font-bold text-foreground">
            1. Phạm vi áp dụng của Điều khoản
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Điều khoản này điều chỉnh toàn bộ việc sử dụng:
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          <li>
            • <strong>Cổng thông tin công khai:</strong> Trang chủ, Bảng tin thông báo, Bảng vàng vinh danh, Podcast học thuật, Showcase Dự án học sinh và Thư viện tài liệu công khai.
          </li>
          <li>
            • <strong>Cổng tra cứu Học sinh (<code className="font-mono text-xs">/student</code>):</strong> Khu vực đăng nhập riêng để xem hồ sơ cá nhân, điểm 4 kỹ năng, lịch sử điểm danh, lộ trình học theo tuần và sổ theo dõi học phí.
          </li>
        </ul>
      </section>

      {/* 2. Accounts */}
      <section
        id="accounts"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-lg font-bold text-foreground">
            2. Tài khoản Cổng Học sinh &amp; Trách nhiệm bảo mật
          </h2>
        </div>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          <li>
            • Mỗi học viên được cấp 01 Mã học sinh định danh và mật khẩu truy cập riêng do giáo viên khởi tạo.
          </li>
          <li>
            • Học viên và Phụ huynh có trách nhiệm giữ kín thông tin đăng nhập, không chia sẻ cho người ngoài lớp học.
          </li>
          <li>
            • Không thực hiện các hành vi dò đoán mật khẩu, tự động cào dữ liệu (scraping) hoặc truy cập trái phép vào tài khoản khác. Tài khoản vi phạm có thể bị tạm khóa để đảm bảo an toàn chung.
          </li>
        </ul>
      </section>

      {/* 3. Academic Rules */}
      <section
        id="academic-rules"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          3. Quy chế Điểm số, Chuyên cần &amp; Bảo lưu
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          <li>
            • <strong>Điểm kiểm tra định kỳ:</strong> Điểm 4 kỹ năng và Overall chuẩn IELTS chỉ được công nhận và hiển thị trên Cổng Học sinh sau khi giáo viên hoàn tất rà soát và chuyển sang trạng thái <strong>Đã công bố</strong>. Mọi điều chỉnh phúc khảo đều được lưu vết công khai trong nhật ký bảng điểm.
          </li>
          <li>
            • <strong>Điểm danh &amp; Xin nghỉ:</strong> Học viên cần thông báo trước cho giáo viên khi nghỉ có phép để được ghi nhận đúng trạng thái chuyên cần và nhận tài liệu tự học bù của buổi đó.
          </li>
          <li>
            • <strong>Học thử &amp; Bảo lưu:</strong> Học viên đang ở trạng thái <em>Học thử</em> hoặc <em>Bảo lưu</em> được miễn các cảnh báo quá hạn học phí và cảnh báo chuyên cần trong thời gian tạm nghỉ theo thỏa thuận với giáo viên.
          </li>
        </ul>
      </section>

      {/* 4. Tuition */}
      <section
        id="tuition"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-lg font-bold text-foreground">
            4. Quy định Học phí &amp; Biên nhận điện tử
          </h2>
        </div>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          <li>
            • Mức học phí, kỳ học và hạn nộp được công bố rõ ràng trong thẻ <strong>Hồ sơ cá nhân</strong> của học viên trên Cổng tra cứu.
          </li>
          <li>
            • Sau khi giáo viên xác nhận khoản thanh toán (Chuyển khoản hoặc Tiền mặt), hệ thống tự động sinh mã biên nhận đối soát (dạng <code className="font-mono text-xs">REC-2026-XXXX</code>) và cập nhật trạng thái sang <strong>Đã hoàn thành</strong>.
          </li>
          <li>
            • Trường hợp cần đối soát hoặc điều chỉnh kỳ đóng, Phụ huynh vui lòng gửi mã biên nhận hoặc ảnh chuyển khoản trực tiếp cho giáo viên.
          </li>
        </ul>
      </section>

      {/* 5. IP */}
      <section
        id="ip"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          5. Bản quyền Học liệu &amp; Dự án Học sinh
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          <li>
            • Toàn bộ giáo trình, slide bài giảng, đề thi thử, bản ghi âm Podcast và bài viết chuyên môn thuộc bản quyền biên soạn của <strong>{profile.name}</strong>. Học viên được quyền tải về phục vụ học tập cá nhân, không được đăng bán hoặc phát hành lại khi chưa có sự đồng ý bằng văn bản.
          </li>
          <li>
            • Các bài luận, poster nghiên cứu hoặc video thuyết trình của học viên chỉ được trưng bày trên mục <strong>Dự án Học sinh (Showcase)</strong> và <strong>Bảng vàng</strong> sau khi giáo viên kiểm duyệt và nhận được sự đồng thuận của học viên/phụ huynh.
          </li>
        </ul>
      </section>

      {/* 6. Changes */}
      <section
        id="changes"
        className="scroll-mt-28 rounded-2xl border border-border bg-warm/35 p-6 shadow-2xs"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          6. Cập nhật điều khoản &amp; Giải đáp
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Quy chế học vụ và Điều khoản sử dụng có thể được điều chỉnh theo từng học kỳ để phù hợp với chương trình đào tạo. Mọi thay đổi quan trọng sẽ được thông báo trên Bảng tin chính thức của lớp học.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            href={"/privacy" as Route}
            className="inline-flex h-9 items-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            Xem Chính sách bảo mật
          </Link>
          <Link
            href={"/support" as Route}
            className="inline-flex h-9 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-deep-navy"
          >
            Cần hỗ trợ? Tới Trung tâm Hỗ trợ →
          </Link>
        </div>
      </section>
    </LegalPageShell>
  );
}
