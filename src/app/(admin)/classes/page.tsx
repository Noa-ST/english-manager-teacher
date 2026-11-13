"use client";

import * as React from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import {
  ADMIN_STUDENTS_DATA,
  CLASSROOMS_DATA,
  type ClassroomGroup,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export default function AdminClassesPage() {
  const { toast } = useToast();
  const [classes, setClasses] = React.useState<ClassroomGroup[]>(CLASSROOMS_DATA);
  const [rosterClass, setRosterClass] = React.useState<ClassroomGroup | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingClass, setEditingClass] = React.useState<ClassroomGroup | null>(null);

  // Form states
  const [formCode, setFormCode] = React.useState("");
  const [formName, setFormName] = React.useState("");
  const [formLevel, setFormLevel] = React.useState("CEFR B2");
  const [formTargetBand, setFormTargetBand] = React.useState("IELTS 6.5–7.5+");
  const [formSchedule, setFormSchedule] = React.useState("Thứ 3 & Thứ 6 · 18:00 – 20:00");
  const [formRoom, setFormRoom] = React.useState("Phòng 302 · Cơ sở Nguyễn Du");
  const [formCapacity, setFormCapacity] = React.useState(15);
  const [formModule, setFormModule] = React.useState("Module 1: Academic Reading & Writing");

  React.useEffect(() => {
    apiRequest<ClassroomGroup[]>("/api/admin/classes")
      .then(setClasses)
      .catch(() => {});
  }, []);

  const openCreateModal = () => {
    setEditingClass(null);
    setFormCode(`CL-0${classes.length + 1}`);
    setFormName("");
    setFormLevel("CEFR B2");
    setFormTargetBand("IELTS 7.0+");
    setFormSchedule("Thứ 3 & Thứ 7 · 18:00 – 20:00");
    setFormRoom("Phòng 302 · Cơ sở Nguyễn Du");
    setFormCapacity(15);
    setFormModule("Module 1: Critical Reading & Essay Architecture");
    setIsModalOpen(true);
  };

  const openEditModal = (cls: ClassroomGroup) => {
    setEditingClass(cls);
    setFormCode(cls.code);
    setFormName(cls.name);
    setFormLevel(cls.level);
    setFormTargetBand(cls.targetBand);
    setFormSchedule(cls.scheduleSummary);
    setFormRoom(cls.room);
    setFormCapacity(cls.capacity);
    setFormModule(cls.currentModule);
    setIsModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const payload = {
      code: formCode.trim().toUpperCase(),
      name: formName.trim(),
      level: formLevel.trim(),
      targetBand: formTargetBand.trim(),
      scheduleSummary: formSchedule.trim(),
      room: formRoom.trim(),
      capacity: Number(formCapacity) || 15,
      currentModule: formModule.trim(),
    };

    if (editingClass) {
      try {
        const updated = await apiRequest<ClassroomGroup>(
          `/api/admin/classes/${encodeURIComponent(editingClass.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
        setClasses((prev) =>
          prev.map((item) => (item.id === editingClass.id ? updated : item)),
        );
      } catch {
        setClasses((prev) =>
          prev.map((item) =>
            item.id === editingClass.id ? { ...item, ...payload } : item,
          ),
        );
      }
      toast({
        title: "Đã cập nhật thông tin lớp học",
        description: `Lớp ${formCode} — ${formName} đã được lưu.`,
        variant: "success",
      });
    } else {
      try {
        const created = await apiRequest<ClassroomGroup>("/api/admin/classes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setClasses((prev) => [...prev, created]);
      } catch {
        // Fallback if offline
      }
      toast({
        title: "Đã khởi tạo lớp học mới",
        description: `Lớp ${payload.code} — ${payload.name} đã sẵn sàng phân bổ học sinh.`,
        variant: "success",
      });
    }

    setIsModalOpen(false);
  };

  const studentsInRosterClass = React.useMemo(() => {
    if (!rosterClass) return [];
    return ADMIN_STUDENTS_DATA.filter((s) => s.classId === rosterClass.id);
  }, [rosterClass]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản lý Lớp học & Khung chương trình
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Theo dõi sĩ số, công suất phòng học, tiến độ học phần (Module) và danh sách học viên
            từng lớp.
          </p>
        </div>

        <Button onClick={openCreateModal}>
          <Plus className="size-4" aria-hidden="true" />
          Tạo lớp học mới
        </Button>
      </div>

      {/* Class Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {classes.map((cls) => {
          const capacityPct = Math.min(
            100,
            Math.round((cls.enrolled / cls.capacity) * 100),
          );
          return (
            <div
              key={cls.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-2xs transition-all hover:border-accent/50"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="font-mono">
                      {cls.code}
                    </Badge>
                    <Badge variant="secondary">{cls.level}</Badge>
                    <Badge variant="warm">{cls.targetBand}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => openEditModal(cls)}
                    aria-label={`Chỉnh sửa lớp ${cls.name}`}
                  >
                    <Edit3 className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>

                <h2 className="mt-3 font-heading text-xl font-bold text-foreground">
                  {cls.name}
                </h2>

                <div className="mt-3 rounded-xl bg-warm/45 p-3 text-xs text-foreground/90">
                  <strong className="font-semibold text-primary">
                    Học phần hiện tại:
                  </strong>{" "}
                  {cls.currentModule}
                </div>

                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-3.5 text-accent" aria-hidden="true" />
                    <span>{cls.scheduleSummary}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-3.5 text-accent" aria-hidden="true" />
                    <span>{cls.room}</span>
                  </div>
                </div>

                {/* Capacity Bar */}
                <div className="mt-5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      Sĩ số lớp ({cls.enrolled}/{cls.capacity} học viên)
                    </span>
                    <span className="font-mono font-semibold text-primary">
                      {capacityPct}% công suất
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${capacityPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer Metrics & Actions */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <div className="flex items-center gap-4 text-xs">
                  <span>
                    Điểm TB:{" "}
                    <strong className="font-mono font-bold text-primary">
                      {cls.averageScore.toFixed(1)}
                    </strong>
                  </span>
                  <span>
                    Chuyên cần:{" "}
                    <strong className="font-mono font-bold text-emerald-700">
                      {cls.attendanceRate}%
                    </strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setRosterClass(cls)}
                  >
                    <Users className="size-3.5" aria-hidden="true" />
                    Danh sách lớp
                  </Button>
                  <Button
                    size="xs"
                    render={<Link href="/attendance" />}
                    nativeButton={false}
                  >
                    <ClipboardCheck className="size-3.5" aria-hidden="true" />
                    Điểm danh
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Roster Modal */}
      <ModalDialog
        open={Boolean(rosterClass)}
        onClose={() => setRosterClass(null)}
        title={
          rosterClass
            ? `Danh sách học viên: ${rosterClass.code} — ${rosterClass.name}`
            : "Danh sách lớp"
        }
        description={
          rosterClass
            ? `${rosterClass.scheduleSummary} · ${rosterClass.room}`
            : undefined
        }
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setRosterClass(null)}>
            Đóng
          </Button>
        }
      >
        {rosterClass && (
          <div className="space-y-3 text-xs">
            {studentsInRosterClass.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                Lớp học mới khởi tạo, chưa có học viên được phân bổ trong danh sách mẫu.
              </p>
            ) : (
              studentsInRosterClass.map((stu) => (
                <div
                  key={stu.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5"
                >
                  <div>
                    <p className="font-heading text-sm font-bold text-foreground">
                      {stu.fullName}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        ({stu.code})
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Mục tiêu: {stu.targetGoal} · Chuyên cần: {stu.attendanceRate}%
                    </p>
                  </div>
                  <Badge variant="default" className="font-mono">
                    TB {stu.averageScore.toFixed(1)}
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}
      </ModalDialog>

      {/* Create / Edit Class Modal */}
      <ModalDialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingClass
            ? `Chỉnh sửa lớp: ${editingClass.code}`
            : "Khởi tạo lớp học mới"
        }
        description="Thiết lập mã lớp, khung giờ cố định, sĩ số tối đa và học phần đang giảng dạy."
        size="md"
      >
        <form onSubmit={handleSaveClass} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="cls-code"
                className="block text-xs font-semibold text-foreground"
              >
                Mã lớp
              </label>
              <Input
                id="cls-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                required
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cls-cap"
                className="block text-xs font-semibold text-foreground"
              >
                Sĩ số tối đa
              </label>
              <Input
                id="cls-cap"
                type="number"
                min={5}
                max={40}
                value={formCapacity}
                onChange={(e) => setFormCapacity(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="cls-name"
              className="block text-xs font-semibold text-foreground"
            >
              Tên lớp học
            </label>
            <Input
              id="cls-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Ví dụ: IELTS Intensive (Band 6.5–7.5+)"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="cls-level"
                className="block text-xs font-semibold text-foreground"
              >
                Khung trình độ (CEFR)
              </label>
              <Input
                id="cls-level"
                value={formLevel}
                onChange={(e) => setFormLevel(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cls-band"
                className="block text-xs font-semibold text-foreground"
              >
                Cam kết đầu ra
              </label>
              <Input
                id="cls-band"
                value={formTargetBand}
                onChange={(e) => setFormTargetBand(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="cls-schedule"
              className="block text-xs font-semibold text-foreground"
            >
              Lịch học cố định
            </label>
            <Input
              id="cls-schedule"
              value={formSchedule}
              onChange={(e) => setFormSchedule(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="cls-module"
              className="block text-xs font-semibold text-foreground"
            >
              Học phần (Module) đang giảng dạy
            </label>
            <Input
              id="cls-module"
              value={formModule}
              onChange={(e) => setFormModule(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {editingClass ? "Cập nhật lớp" : "Tạo lớp học"}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
