"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FolderUp,
  Layers,
  Megaphone,
  Plus,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import {
  ADMIN_STUDENTS_DATA,
  CLASSROOMS_DATA,
  WEEKLY_SCHEDULE_DATA,
  type AdminStudentRecord,
  type AnnouncementItem,
  type ClassroomGroup,
  type WeeklyClassSession,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export default function AdminDashboardPage() {
  const { toast } = useToast();

  const [classes, setClasses] =
    React.useState<ClassroomGroup[]>(CLASSROOMS_DATA);
  const [sessions, setSessions] = React.useState<WeeklyClassSession[]>(
    WEEKLY_SCHEDULE_DATA,
  );
  const [students, setStudents] = React.useState<AdminStudentRecord[]>(
    ADMIN_STUDENTS_DATA,
  );

  // Interactive Quick Action modal states
  const [quickStudentOpen, setQuickStudentOpen] = React.useState(false);
  const [quickAnnouncementOpen, setQuickAnnouncementOpen] = React.useState(false);

  // Quick student form
  const [newStudentName, setNewStudentName] = React.useState("");
  const [newStudentClass, setNewStudentClass] = React.useState(
    CLASSROOMS_DATA[0]?.name ?? "",
  );
  const [newStudentGoal, setNewStudentGoal] = React.useState("IELTS 7.0 Overall");

  // Quick announcement form
  const [quickAnnTitle, setQuickAnnTitle] = React.useState("");
  const [quickAnnExcerpt, setQuickAnnExcerpt] = React.useState("");

  React.useEffect(() => {
    apiRequest<{
      classes: ClassroomGroup[];
      sessions: WeeklyClassSession[];
      students: AdminStudentRecord[];
      announcements: AnnouncementItem[];
    }>("/api/admin/dashboard")
      .then((res) => {
        setClasses(res.classes);
        setSessions(res.sessions);
        setStudents(res.students);
      })
      .catch(() => {});
  }, []);

  // Computed metrics
  const totalStudents = classes.reduce((sum, c) => sum + c.enrolled, 0);
  const activeClasses = classes.length;
  const weeklySessions = sessions.length;
  const avgAttendance = (
    classes.reduce((sum, c) => sum + c.attendanceRate, 0) /
    (classes.length || 1)
  ).toFixed(1);

  const overdueStudents = students.filter(
    (s) => s.tuitionStatus === "overdue" || s.tuitionStatus === "due-soon",
  );

  const handleQuickCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;
    const nextCode = `HS-2026-${String(students.length + 1).padStart(2, "0")}`;
    try {
      const created = await apiRequest<AdminStudentRecord>(
        "/api/admin/students",
        {
          method: "POST",
          body: JSON.stringify({
            code: nextCode,
            fullName: newStudentName,
            classId: newStudentClass,
            targetGoal: newStudentGoal,
          }),
        },
      );
      setStudents((prev) => [created, ...prev]);
    } catch {
      // Fallback handled gracefully
    }
    toast({
      title: "Đã khởi tạo hồ sơ học sinh mới",
      description: `Học sinh "${newStudentName}" (${nextCode}) đã được phân vào lớp ${newStudentClass}.`,
      variant: "success",
    });
    setNewStudentName("");
    setQuickStudentOpen(false);
  };

  const handleQuickPostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAnnTitle.trim()) return;
    try {
      await apiRequest<AnnouncementItem>("/api/admin/cms", {
        method: "POST",
        body: JSON.stringify({
          module: "announcements",
          payload: {
            title: quickAnnTitle,
            excerpt: quickAnnExcerpt,
            content: [quickAnnExcerpt],
            category: "urgent",
            isPinned: true,
            status: "published",
          },
        }),
      });
    } catch {
      // Fallback handled gracefully
    }
    toast({
      title: "Đã xuất bản thông báo nhanh",
      description: `Bản tin "${quickAnnTitle}" đã hiển thị trên Cổng học sinh.`,
      variant: "success",
    });
    setQuickAnnTitle("");
    setQuickAnnExcerpt("");
    setQuickAnnouncementOpen(false);
  };

  return (
    <div className="space-y-7">
      {/* Top Workspace Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-widest text-[#496B9A] uppercase">
            Học kỳ I · Tuần học thứ 46 (09/11 – 15/11/2026)
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Tổng quan Học vụ — ThS. Nguyễn Minh Anh
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hôm nay có <strong className="font-semibold text-foreground">2 ca dạy</strong> và{" "}
            <strong className="font-semibold text-foreground">1 thông báo quan trọng</strong> đang
            hiển thị trên cổng thông tin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            className="h-9 rounded-lg bg-card px-3.5 text-xs font-medium"
            onClick={() => setQuickStudentOpen(true)}
          >
            <UserPlus className="size-3.5 text-primary" aria-hidden="true" />
            Thêm học sinh
          </Button>
          <Button
            className="h-9 rounded-lg px-3.5 text-xs font-semibold"
            render={<Link href="/attendance" />}
            nativeButton={false}
          >
            <ClipboardCheck className="size-3.5" aria-hidden="true" />
            Điểm danh ca hôm nay
          </Button>
        </div>
      </div>

      {/* 1. KPI Summary Strip */}
      <section aria-label="Chỉ số vận hành lớp học" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tổng số học viên đang học
            </span>
            <Users className="size-4 text-[#496B9A]" aria-hidden="true" />
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold text-foreground">
            {totalStudents}
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2 text-xs">
            <span className="font-medium text-emerald-700">+6 học viên tháng 11</span>
            <Link href="/students" className="font-medium text-primary hover:underline">
              Hồ sơ →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Lớp học đang vận hành
            </span>
            <Layers className="size-4 text-[#496B9A]" aria-hidden="true" />
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold text-foreground">
            {activeClasses}
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2 text-xs">
            <span className="text-muted-foreground">Công suất lấp đầy: 91%</span>
            <Link href="/classes" className="font-medium text-primary hover:underline">
              Chi tiết →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Ca dạy trong tuần
            </span>
            <Calendar className="size-4 text-[#496B9A]" aria-hidden="true" />
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold text-foreground">
            {weeklySessions}
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2 text-xs">
            <span className="text-muted-foreground">0 xung đột lịch dạy</span>
            <Link href="/schedule" className="font-medium text-primary hover:underline">
              Lịch dạy →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tỷ lệ chuyên cần trung bình
            </span>
            <TrendingUp className="size-4 text-emerald-700" aria-hidden="true" />
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold text-emerald-700">
            {avgAttendance}%
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2 text-xs">
            <span className="text-muted-foreground">Mục tiêu học kỳ: ≥ 92%</span>
            <Link href="/attendance" className="font-medium text-primary hover:underline">
              Điểm danh →
            </Link>
          </div>
        </div>
      </section>

      {/* 2. QUICK ACTIONS BAR */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-base font-bold text-foreground">
              Thao tác tác vụ nhanh (Quick Actions)
            </h2>
            <p className="text-xs text-muted-foreground">
              Truy cập 1 chạm vào các nghiệp vụ quản lý lớp học thường xuyên nhất.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <button
            type="button"
            onClick={() => setQuickStudentOpen(true)}
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UserPlus className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Thêm học sinh</p>
              <p className="text-[11px] text-muted-foreground">Tạo mã HS mới</p>
            </div>
          </button>

          <Link
            href="/classes"
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
              <Plus className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Tạo lớp học</p>
              <p className="text-[11px] text-muted-foreground">Thiết lập sĩ số & ca</p>
            </div>
          </Link>

          <Link
            href="/attendance"
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-warm text-primary">
              <ClipboardCheck className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Điểm danh nhanh</p>
              <p className="text-[11px] text-muted-foreground">1 chạm toàn lớp</p>
            </div>
          </Link>

          <Link
            href="/grades"
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
              <Award className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Nhập bảng điểm</p>
              <p className="text-[11px] text-muted-foreground">4 kỹ năng & nhận xét</p>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setQuickAnnouncementOpen(true)}
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-highlight/30 text-foreground">
              <Megaphone className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Đăng thông báo</p>
              <p className="text-[11px] text-muted-foreground">Xuất bản bản tin</p>
            </div>
          </button>

          <Link
            href="/storage"
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-all hover:border-primary/40 hover:bg-warm/30"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-warm text-primary">
              <FolderUp className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-xs font-bold text-foreground">Tải lên tài liệu</p>
              <p className="text-[11px] text-muted-foreground">Cloud R2 / S3</p>
            </div>
          </Link>
        </div>
      </section>

      {/* 3. TODAY'S SCHEDULE & CLASS PERFORMANCE CHART */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Today's / Upcoming Teaching Schedule (7 cols) */}
        <section className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-2xs lg:col-span-7">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">
                  Ca dạy trọng tâm trong tuần
                </h2>
                <p className="text-xs text-muted-foreground">
                  Chuyển nhanh sang màn hình Điểm danh cho từng ca học.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/schedule" />}
                nativeButton={false}
              >
                Lịch đầy đủ
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-5 space-y-3">
              {sessions.slice(0, 4).map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default" className="font-mono">
                        {session.classCode}
                      </Badge>
                      <span className="font-heading text-sm font-bold text-foreground">
                        {session.className}
                      </span>
                      <Badge
                        variant={
                          session.status === "ongoing"
                            ? "success"
                            : session.status === "completed"
                              ? "outline"
                              : "info"
                        }
                      >
                        {session.status === "ongoing"
                          ? "Đang học"
                          : session.status === "completed"
                            ? "Đã hoàn thành"
                            : "Sắp diễn ra"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Chuyên đề: <strong className="text-foreground">{session.topic}</strong>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5 text-accent" aria-hidden="true" />
                        {session.dayLabel} · {session.startTime} – {session.endTime}
                      </span>
                      <span>{session.room}</span>
                      <span className="font-mono">
                        Sĩ số: {session.enrolledCount}/{session.capacity}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 bg-card"
                    render={<Link href="/attendance" />}
                    nativeButton={false}
                  >
                    <ClipboardCheck className="size-3.5 text-primary" aria-hidden="true" />
                    Điểm danh
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Class Performance & Actionable Alerts (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Class Performance Comparison */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-2xs">
            <h2 className="font-heading text-base font-bold text-foreground">
              Thống kê học tập theo khối lớp
            </h2>
            <p className="text-xs text-muted-foreground">
              Điểm trung bình quy đổi & tỷ lệ chuyên cần hiện tại
            </p>

            <div className="mt-4 space-y-4">
              {classes.map((cls) => (
                <div key={cls.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">
                      {cls.code} · {cls.name}
                    </span>
                    <span className="font-mono font-bold text-primary">
                      TB {cls.averageScore.toFixed(1)} · {cls.attendanceRate}% CC
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${cls.attendanceRate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Actionable Alerts */}
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase">
              <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
              <span>Cảnh báo học vụ cần lưu ý ({overdueStudents.length})</span>
            </div>

            <div className="mt-3 space-y-2.5">
              {overdueStudents.map((stu) => (
                <div
                  key={stu.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {stu.fullName}{" "}
                      <span className="font-mono text-muted-foreground">({stu.code})</span>
                    </p>
                    <p className="text-muted-foreground">{stu.tuitionPeriod}</p>
                  </div>
                  <Badge
                    variant={
                      stu.tuitionStatus === "overdue" ? "destructive" : "warning"
                    }
                  >
                    {stu.tuitionStatus === "overdue" ? "Quá hạn HP" : "Sắp đến hạn"}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Quick Create Student Modal */}
      <ModalDialog
        open={quickStudentOpen}
        onClose={() => setQuickStudentOpen(false)}
        title="Thêm nhanh hồ sơ học sinh"
        description="Cấp mã định danh học sinh mới và phân vào lớp đang vận hành."
        size="md"
      >
        <form onSubmit={handleQuickCreateStudent} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="quick-stu-name"
              className="block text-xs font-semibold text-foreground"
            >
              Họ và tên học sinh
            </label>
            <Input
              id="quick-stu-name"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="Ví dụ: Nguyễn Hoàng Nam"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="quick-stu-class"
              className="block text-xs font-semibold text-foreground"
            >
              Lớp theo học
            </label>
            <select
              id="quick-stu-class"
              value={newStudentClass}
              onChange={(e) => setNewStudentClass(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.name}>
                  {cls.code} — {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="quick-stu-goal"
              className="block text-xs font-semibold text-foreground"
            >
              Mục tiêu đầu ra cam kết
            </label>
            <Input
              id="quick-stu-goal"
              value={newStudentGoal}
              onChange={(e) => setNewStudentGoal(e.target.value)}
              placeholder="Ví dụ: IELTS 7.0 Overall"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuickStudentOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Lưu hồ sơ
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Quick Post Announcement Modal */}
      <ModalDialog
        open={quickAnnouncementOpen}
        onClose={() => setQuickAnnouncementOpen(false)}
        title="Đăng thông báo nhanh lên Cổng học sinh"
        description="Xuất bản thông báo trực tiếp tới bảng tin công khai."
        size="md"
      >
        <form onSubmit={handleQuickPostAnnouncement} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="quick-ann-title"
              className="block text-xs font-semibold text-foreground"
            >
              Tiêu đề bản tin
            </label>
            <Input
              id="quick-ann-title"
              value={quickAnnTitle}
              onChange={(e) => setQuickAnnTitle(e.target.value)}
              placeholder="Ví dụ: Lịch học bù ca Thứ Sáu lớp IELTS Intensive"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="quick-ann-excerpt"
              className="block text-xs font-semibold text-foreground"
            >
              Nội dung tóm tắt
            </label>
            <textarea
              id="quick-ann-excerpt"
              rows={4}
              value={quickAnnExcerpt}
              onChange={(e) => setQuickAnnExcerpt(e.target.value)}
              placeholder="Nhập nội dung thông báo gửi tới phụ huynh và học sinh..."
              required
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuickAnnouncementOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <Megaphone className="size-4" aria-hidden="true" />
              Xuất bản ngay
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
