"use client";

import * as React from "react";

import {
  ALERT_SETTINGS_STORAGE_KEY,
  DEFAULT_ALERT_SETTINGS,
  type AcademicAlertSettings,
} from "@/services/academic-alert.service";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface StudentAlertSettingsModalProps {
  open: boolean;
  onClose: () => void;
  alertSettings: AcademicAlertSettings;
  onSave: (next: AcademicAlertSettings) => void;
}

function StudentAlertSettingsInner({
  onClose,
  alertSettings,
  onSave,
}: Omit<StudentAlertSettingsModalProps, "open">) {
  const { toast } = useToast();
  const [temp, setTemp] = React.useState<AcademicAlertSettings>(() => ({
    ...alertSettings,
  }));

  const handleSave = () => {
    onSave(temp);
    try {
      localStorage.setItem(ALERT_SETTINGS_STORAGE_KEY, JSON.stringify(temp));
    } catch {
      // Ignore storage errors
    }
    onClose();
    toast({
      title: "Đã lưu cấu hình cảnh báo",
      description: `Ngưỡng chuyên cần: ${temp.attendanceThreshold}%. Quy tắc cảnh báo học vụ đã được cập nhật.`,
      variant: "success",
    });
  };

  return (
    <ModalDialog
      open
      onClose={onClose}
      title="Cấu hình Ngưỡng Cảnh báo Học vụ"
      description="Tùy chỉnh các tiêu chí nhận diện học sinh cần quan tâm để phù hợp với quy định cụ thể của trung tâm."
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTemp(DEFAULT_ALERT_SETTINGS)}
          >
            Khôi phục mặc định
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Hủy
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              Lưu cấu hình
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-xs">
        <div>
          <label className="block font-semibold text-foreground">
            Ngưỡng chuyên cần tối thiểu (%)
          </label>
          <p className="mb-2.5 text-[11px] text-muted-foreground">
            Học sinh có tỷ lệ đi học dưới ngưỡng này sẽ tự động nhận cảnh báo &ldquo;Cần theo dõi chuyên cần&rdquo;.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={temp.attendanceThreshold}
              onChange={(e) =>
                setTemp((prev) => ({
                  ...prev,
                  attendanceThreshold: Number(e.target.value),
                }))
              }
              className="flex-1 accent-primary"
            />
            <span className="w-12 text-right font-mono text-sm font-bold text-primary">
              {temp.attendanceThreshold}%
            </span>
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <label className="block font-semibold text-foreground">
            Các quy tắc cảnh báo tự động:
          </label>

          {[
            {
              key: "alertOnScoreDrop" as const,
              title: "Điểm TB giảm liên tiếp",
              desc: "Cảnh báo “Tiến độ học tập giảm” khi bài kiểm tra gần nhất thấp hơn bài trước đó.",
            },
            {
              key: "alertOnOverdueTuition" as const,
              title: "Học phí quá hạn",
              desc: "Cảnh báo “Chưa hoàn thành học phí” khi học sinh đang học đã quá hạn đóng học phí.",
            },
            {
              key: "alertOnNoGrades" as const,
              title: "Chưa có bài kiểm tra gần đây",
              desc: "Cảnh báo “Chưa có đánh giá gần đây” khi học sinh chính thức chưa có điểm định kỳ.",
            },
            {
              key: "alertBelowTarget" as const,
              title: "Điểm dưới mục tiêu cá nhân",
              desc: "Cảnh báo khi điểm trung bình hiện tại thấp hơn mục tiêu band điểm đề ra.",
            },
          ].map((rule) => (
            <label
              key={rule.key}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={temp[rule.key]}
                onChange={(e) =>
                  setTemp((prev) => ({ ...prev, [rule.key]: e.target.checked }))
                }
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <div>
                <p className="font-medium text-foreground">{rule.title}</p>
                <p className="text-[11px] text-muted-foreground">{rule.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </ModalDialog>
  );
}

export function StudentAlertSettingsModal({
  open,
  onClose,
  alertSettings,
  onSave,
}: StudentAlertSettingsModalProps) {
  if (!open) return null;
  return (
    <StudentAlertSettingsInner
      key={JSON.stringify(alertSettings)}
      onClose={onClose}
      alertSettings={alertSettings}
      onSave={onSave}
    />
  );
}
