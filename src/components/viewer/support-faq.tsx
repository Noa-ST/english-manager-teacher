"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";

import { removeVietnameseTones } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FaqCategory = "all" | "account" | "academic" | "schedule";

interface FaqItem {
  id: string;
  category: Exclude<FaqCategory, "all">;
  categoryLabel: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "faq-forgot-pin",
    category: "account",
    categoryLabel: "Tài khoản & Đăng nhập",
    question: "Tôi quên mật khẩu hoặc chưa được cấp tài khoản Cổng Học sinh thì làm thế nào?",
    answer:
      "Phụ huynh hoặc học viên chỉ cần nhắn Mã học sinh (ví dụ HS-2026-01) và Họ tên tới giáo viên qua Zalo hoặc Email. Giáo viên sẽ cấp mới hoặc đặt lại mật khẩu tức thì trên hệ thống quản trị trong vòng vài phút.",
  },
  {
    id: "faq-locked-5-tries",
    category: "account",
    categoryLabel: "Tài khoản & Đăng nhập",
    question: "Vì sao tôi nhập sai mật khẩu vài lần thì hệ thống báo tạm khóa đăng nhập?",
    answer:
      "Để bảo vệ dữ liệu điểm số và học phí của học viên, hệ thống tự động kích hoạt khóa tạm thời sau 5 lần nhập sai liên tiếp. Bạn vui lòng đợi ít phút rồi thử lại, hoặc liên hệ giáo viên để đặt lại mật khẩu mới.",
  },
  {
    id: "faq-missing-grade",
    category: "academic",
    categoryLabel: "Điểm số & Học liệu",
    question: "Vì sao con vừa làm bài kiểm tra xong nhưng chưa thấy điểm trên Cổng Học sinh?",
    answer:
      "Sau khi chấm, giáo viên có thể lưu điểm ở trạng thái Bản nháp để rà soát lại nhận xét 4 kỹ năng cho cả lớp. Điểm số và nhận xét sẽ hiển thị ngay lập tức trên mục Bảng điểm ngay khi giáo viên bấm Công bố.",
  },
  {
    id: "faq-private-doc",
    category: "academic",
    categoryLabel: "Điểm số & Học liệu",
    question: "Vì sao một số tài liệu PDF hoặc Slide bài giảng yêu cầu đăng nhập mới tải được?",
    answer:
      "Các tài liệu công khai ở mục Tài liệu ai cũng có thể tải tự do. Riêng giáo trình và đề luyện nội bộ của từng lớp học được bảo vệ bằng đường dẫn bảo mật có thời hạn (Signed URL) nên cần đăng nhập bằng tài khoản học sinh của lớp đó.",
  },
  {
    id: "faq-progress-report",
    category: "academic",
    categoryLabel: "Điểm số & Học liệu",
    question: "Phụ huynh muốn in hoặc lưu phiếu báo cáo kết quả học tập của con thì xem ở đâu?",
    answer:
      "Sau khi đăng nhập Cổng Học sinh, Phụ huynh mở tab Hồ sơ cá nhân (/student/profile) và cuộn xuống mục Báo cáo tiến độ học tập. Tại đó có sẵn nút In phiếu báo cáo (chuẩn A4) và nút Sao chép nội dung.",
  },
  {
    id: "faq-ics-calendar",
    category: "schedule",
    categoryLabel: "Lịch học & Học phí",
    question: "Làm thế nào để thêm lịch học cố định vào Google Calendar hoặc lịch điện thoại?",
    answer:
      "Tại Cổng Học sinh, vào tab Lịch học lớp (/student/schedule). Hệ thống có sẵn nút Xuất lịch (.ICS) để bạn tải tệp lịch về và nhập nhanh vào Google Calendar, Apple Calendar hoặc Outlook.",
  },
  {
    id: "faq-absence",
    category: "schedule",
    categoryLabel: "Lịch học & Học phí",
    question: "Quy trình xin nghỉ phép hoặc xin bảo lưu khóa học như thế nào?",
    answer:
      "Phụ huynh vui lòng thông báo trước buổi học cho giáo viên để được đánh dấu 'Nghỉ có phép' trên hệ thống điểm danh và gửi tài liệu tự học bù. Trường hợp cần bảo lưu dài ngày, giáo viên sẽ chuyển trạng thái hồ sơ sang Bảo lưu để tạm dừng tính chuyên cần và nhắc học phí.",
  },
  {
    id: "faq-tuition-receipt",
    category: "schedule",
    categoryLabel: "Lịch học & Học phí",
    question: "Sau khi chuyển khoản học phí, bao lâu thì trạng thái trên Cổng Học sinh cập nhật?",
    answer:
      "Ngay khi giáo viên xác nhận khoản thu, hệ thống lập tức chuyển trạng thái sang 'Đã hoàn thành', sinh mã biên nhận điện tử (REC-...) hiển thị tại tab Hồ sơ cá nhân và gửi tin nhắn xác nhận tới phụ huynh.",
  },
];

const CATEGORY_PILLS: Array<{ id: FaqCategory; label: string }> = [
  { id: "all", label: "Tất cả câu hỏi" },
  { id: "account", label: "Tài khoản & Đăng nhập" },
  { id: "academic", label: "Điểm số & Học liệu" },
  { id: "schedule", label: "Lịch học & Học phí" },
];

export function SupportFaq() {
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<FaqCategory>("all");
  const [openId, setOpenId] = React.useState<string | null>(FAQ_ITEMS[0].id);

  const filtered = React.useMemo(() => {
    const q = removeVietnameseTones(search.trim().toLowerCase());
    return FAQ_ITEMS.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      const hay = removeVietnameseTones(
        `${item.question} ${item.answer} ${item.categoryLabel}`.toLowerCase(),
      );
      return hay.includes(q);
    });
  }, [search, category]);

  return (
    <div className="space-y-4">
      {/* Search + Category filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm câu hỏi (VD: mật khẩu, học phí, ICS)..."
            className="h-9 pl-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORY_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setCategory(pill.id)}
              className={cn(
                "h-8 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                category === pill.id
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accordion List */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
          Không tìm thấy câu hỏi phù hợp. Bạn có thể liên hệ trực tiếp giáo viên ở mục bên dưới.
        </p>
      ) : (
        <div className="divide-y divide-border/80 overflow-hidden rounded-2xl border border-border bg-background">
          {filtered.map((item) => {
            const isOpen = openId === item.id;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {item.categoryLabel}
                    </span>
                    <p className="font-heading text-sm font-semibold text-foreground">
                      {item.question}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180 text-primary",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-border/50 bg-warm/20 px-5 py-3.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
