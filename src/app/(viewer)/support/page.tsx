"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Award,
  Calendar,
  Check,
  Clock,
  Copy,
  CreditCard,
  Headphones,
  HelpCircle,
  KeyRound,
  Mail,
  MapPin,
  MessageCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  LegalPageShell,
  useTeacherPublicProfile,
  type LegalHighlightCard,
  type LegalTocItem,
} from "@/components/viewer/legal-page-shell";
import { SupportFaq } from "@/components/viewer/support-faq";

const SUPPORT_TOC: LegalTocItem[] = [
  { id: "quick-actions", label: "Hỗ trợ nhanh theo nhu cầu" },
  { id: "faq", label: "Câu hỏi thường gặp (FAQ)" },
  { id: "direct-contact", label: "Liên hệ trực tiếp Giáo viên" },
];

const SUPPORT_HIGHLIGHTS: LegalHighlightCard[] = [
  {
    icon: <KeyRound className="size-4 shrink-0" aria-hidden="true" />,
    title: "Cấp lại mật khẩu nhanh",
    description:
      "Quên mật khẩu Cổng học sinh? Liên hệ giáo viên kèm Mã HS để được cấp lại ngay trong vài phút.",
  },
  {
    icon: <HelpCircle className="size-4 shrink-0" aria-hidden="true" />,
    title: "Giải đáp học vụ 24/7",
    description:
      "Tra cứu nhanh hướng dẫn xem điểm 4 kỹ năng, tải học liệu nội bộ và xuất lịch học sang Google Calendar.",
  },
  {
    icon: <MessageCircle className="size-4 shrink-0" aria-hidden="true" />,
    title: "Tư vấn học tập 1:1",
    description:
      "Phụ huynh có thể đặt lịch trao đổi trực tiếp tại phòng học hoặc qua Email trong khung giờ tư vấn định kỳ.",
  },
];

const QUICK_HELP_CARDS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: Route;
  ctaLabel: string;
}> = [
  {
    icon: KeyRound,
    title: "Đăng nhập Cổng Học sinh",
    description:
      "Truy cập góc học tập cá nhân bằng Mã học sinh và mật khẩu do giáo viên cấp.",
    href: "/login" as Route,
    ctaLabel: "Tới trang đăng nhập",
  },
  {
    icon: Award,
    title: "Tra cứu Bảng điểm 4 kỹ năng",
    description:
      "Xem chi tiết điểm Listening, Reading, Writing, Speaking, chỉ số tiến bộ và lời phê giáo viên.",
    href: "/student/grades" as Route,
    ctaLabel: "Mở Bảng điểm",
  },
  {
    icon: CreditCard,
    title: "Kiểm tra Học phí & Biên nhận",
    description:
      "Theo dõi kỳ học phí hiện tại, hạn nộp và lịch sử mã biên nhận điện tử của học viên.",
    href: "/student/profile" as Route,
    ctaLabel: "Xem Hồ sơ & Học phí",
  },
  {
    icon: Calendar,
    title: "Lịch học lớp & Xuất file .ICS",
    description:
      "Xem lịch học 14 ngày tới, lộ trình 12 tuần và tải file .ICS thêm vào lịch điện thoại.",
    href: "/student/schedule" as Route,
    ctaLabel: "Xem Lịch học lớp",
  },
];

export default function SupportCenterPage() {
  const profile = useTeacherPublicProfile();
  const { toast } = useToast();
  const [copiedEmail, setCopiedEmail] = React.useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(profile.email);
      setCopiedEmail(true);
      toast({
        title: "Đã sao chép Email giáo viên",
        description: profile.email,
        variant: "success",
      });
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      toast({
        title: "Không thể tự động sao chép",
        description: `Email: ${profile.email}`,
        variant: "warning",
      });
    }
  };

  return (
    <LegalPageShell
      activeSlug="support"
      badgeLabel="Trung tâm hỗ trợ"
      updatedAtLabel="Hỗ trợ Phụ huynh & Học viên"
      title="Trung tâm Hỗ trợ Phụ huynh & Học viên"
      subtitle={`Hướng dẫn nhanh sử dụng Cổng Học sinh, giải đáp các câu hỏi thường gặp về điểm số, học phí, tài liệu và kênh liên hệ trực tiếp với ${profile.name}.`}
      highlights={SUPPORT_HIGHLIGHTS}
      toc={SUPPORT_TOC}
    >
      {/* 1. Quick Action Cards */}
      <section
        id="quick-actions"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          1. Hỗ trợ nhanh theo nhu cầu
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Chọn đúng khu vực bạn cần thao tác trên hệ thống:
        </p>

        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          {QUICK_HELP_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="flex flex-col justify-between rounded-2xl border border-border/80 bg-background p-4 transition-colors hover:border-primary/40"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </div>
                    <h3 className="font-heading text-sm font-bold text-foreground">
                      {card.title}
                    </h3>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {card.description}
                  </p>
                </div>
                <div className="mt-3.5 pt-2">
                  <Link
                    href={card.href}
                    className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
                  >
                    {card.ctaLabel} →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Interactive FAQ */}
      <section
        id="faq"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 shadow-2xs"
      >
        <div className="mb-4">
          <h2 className="font-heading text-lg font-bold text-foreground">
            2. Câu hỏi thường gặp (FAQ)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Gõ từ khóa hoặc chọn nhóm chủ đề để tìm câu trả lời nhanh.
          </p>
        </div>

        <SupportFaq />
      </section>

      {/* 3. Direct Teacher Contact */}
      <section
        id="direct-contact"
        className="scroll-mt-28 rounded-2xl border border-border bg-warm/35 p-6 shadow-2xs"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          3. Liên hệ trực tiếp Giáo viên
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Nếu vấn đề của bạn chưa có trong mục Câu hỏi thường gặp, vui lòng liên hệ trực tiếp:
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2.5 rounded-2xl border border-border bg-card p-4 text-xs">
            <p className="font-heading text-sm font-bold text-foreground">
              {profile.name}
            </p>
            <p className="text-primary">{profile.title}</p>
            <div className="space-y-2 pt-1 text-muted-foreground">
              <p className="flex items-center gap-2">
                <Mail className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <a
                  href={`mailto:${profile.email}`}
                  className="truncate font-medium text-foreground hover:text-primary hover:underline"
                >
                  {profile.email}
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Clock className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{profile.officeHours}</span>
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{profile.location}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                render={<a href={`mailto:${profile.email}`} />}
                nativeButton={false}
                className="h-8 px-3 text-xs"
              >
                <Mail className="size-3.5" aria-hidden="true" />
                Gửi Email ngay
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleCopyEmail()}
                className="h-8 px-3 text-xs"
              >
                {copiedEmail ? (
                  <>
                    <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
                    Đã sao chép
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" aria-hidden="true" />
                    Sao chép Email
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 text-xs">
            <div>
              <p className="font-heading text-sm font-bold text-foreground">
                Kênh học thuật &amp; Cập nhật lớp học
              </p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                Theo dõi các thông báo nghỉ lễ, lịch thi thử IELTS định kỳ và tài liệu mới nhất trên Cổng công khai.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/announcements"
                  className="inline-flex items-center rounded-lg border border-border bg-background px-2.5 py-1.5 font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Bảng tin lớp học
                </Link>
                <Link
                  href="/documents"
                  className="inline-flex items-center rounded-lg border border-border bg-background px-2.5 py-1.5 font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Thư viện tài liệu
                </Link>
                <Link
                  href="/podcast"
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Headphones className="size-3 text-primary" aria-hidden="true" />
                  Podcast
                </Link>
              </div>
            </div>
            <p className="mt-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
              Thời gian phản hồi thông thường: trong vòng 24 giờ làm việc.
            </p>
          </div>
        </div>
      </section>
    </LegalPageShell>
  );
}
