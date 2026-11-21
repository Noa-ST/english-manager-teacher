"use client";

import {
  Award,
  CheckCircle2,
  Printer,
  Quote,
  Share2,
  Trophy,
} from "lucide-react";
import {
  getPeriodDisplayLabel,
  type PublicHallOfFameStudent,
  type ViewerHallOfFameEndorser,
} from "@/services/hall-of-fame-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";

export function HallOfFameCertificateModal({
  student,
  endorser,
  currentTerm,
  onClose,
  onCopyShareLink,
}: {
  student: PublicHallOfFameStudent | null;
  endorser: ViewerHallOfFameEndorser;
  currentTerm: string;
  onClose: () => void;
  onCopyShareLink: (student: PublicHallOfFameStudent) => void;
}) {
  if (!student) return null;

  const teacherName = endorser.name.trim() || "Giáo viên điều hành";
  const teacherTitle =
    endorser.title.trim() || "Academic English & Mentorship";

  return (
    <ModalDialog
      open={Boolean(student)}
      onClose={onClose}
      title="Chứng nhận Vinh danh Học thuật"
      description={`${getPeriodDisplayLabel(student.period)} · ${student.periodLabel}`}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onCopyShareLink(student)}
            >
              <Share2 className="size-3.5" aria-hidden="true" />
              <span>Sao chép liên kết</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="size-3.5" aria-hidden="true" />
              <span>In chứng nhận</span>
            </Button>
          </div>
          <Button type="button" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      {/* Editorial Certificate Surface */}
      <div className="rounded-2xl border-2 border-[#D9AE54]/60 bg-gradient-to-b from-[#FCF9F3] via-white to-[#F7F0E2]/70 p-6 shadow-xs print:border-primary/40 print:shadow-none sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6D7B8] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-[#D9AE54]/50 bg-[#F7F0E2] text-[#243B64]">
              <Trophy className="size-5 text-[#B8861E]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-widest text-primary uppercase">
                Academic Honor Certificate
              </p>
              <p className="text-xs text-muted-foreground">
                {currentTerm || "Chương trình Tiếng Anh Học thuật"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warm">{student.periodLabel}</Badge>
            <Badge variant="default">Hạng #{student.rank}</Badge>
          </div>
        </div>

        {/* Recipient Identity */}
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="flex size-18 items-center justify-center rounded-2xl border-2 border-[#D9AE54] bg-primary font-heading text-2xl font-bold text-primary-foreground shadow-sm">
            {student.avatarInitials}
          </div>
          <p className="mt-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Trân trọng vinh danh học viên
          </p>
          <h3 className="mt-1 font-serif text-2xl font-bold text-foreground sm:text-3xl">
            {student.displayName}
          </h3>
          <p className="mt-1 text-sm font-medium text-primary">
            {student.className}
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 text-xs">
              <Award className="size-3.5 text-primary" aria-hidden="true" />
              {student.badgeTitle}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs font-bold">
              {student.headlineMetric}
            </Badge>
          </div>
        </div>

        {/* Endorsement Quote */}
        {student.teacherEndorsement && (
          <div className="mt-6 rounded-xl border border-[#E6D7B8]/80 bg-white/90 p-4">
            <div className="flex items-start gap-2.5">
              <Quote
                className="mt-0.5 size-4 shrink-0 text-primary/55"
                aria-hidden="true"
              />
              <p className="text-sm leading-relaxed text-foreground/90 italic">
                “{student.teacherEndorsement}”
              </p>
            </div>
          </div>
        )}

        {/* Academic Milestones */}
        {student.milestones.length > 0 && (
          <div className="mt-5">
            <p className="mb-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Dấu ấn học thuật nổi bật
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {student.milestones.map((milestone) => (
                <div
                  key={milestone}
                  className="flex items-center gap-2 rounded-xl border border-border/70 bg-white/80 px-3 py-2 text-xs font-medium text-foreground"
                >
                  <CheckCircle2
                    className="size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{milestone}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Synchronized Endorser Signature */}
        <div className="mt-6 flex flex-col items-end justify-between gap-2 border-t border-[#E6D7B8] pt-4 text-right sm:flex-row sm:items-center sm:text-left">
          <div className="text-xs text-muted-foreground">
            Mã hồ sơ công khai:{" "}
            <span className="font-mono font-semibold text-foreground">
              {student.id}
            </span>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Xác nhận chuyên môn
            </p>
            <p className="mt-0.5 font-heading text-sm font-bold text-primary">
              {teacherName}
            </p>
            <p className="text-xs text-muted-foreground">{teacherTitle}</p>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}
