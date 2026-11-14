"use client";

import * as React from "react";
import {
  Archive,
  ArrowUpDown,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileUp,
  MailCheck,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  ADMIN_STUDENTS_DATA,
  CLASSROOMS_DATA,
  type AdminStudentRecord,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { removeVietnameseTones } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ModalDialog } from "@/components/ui/dialog";
import { EmptyState, PaginationBar } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 5;

export default function AdminStudentsPage() {
  const { toast } = useToast();
  const [students, setStudents] = React.useState<AdminStudentRecord[]>(
    ADMIN_STUDENTS_DATA,
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [classFilter, setClassFilter] = React.useState<string>("all");
  const [tuitionFilter, setTuitionFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<"active" | "archived" | "all">("active");
  const [sortBy, setSortBy] = React.useState<"name" | "score" | "attendance">(
    "score",
  );
  const [page, setPage] = React.useState(1);

  // Bulk selection
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  // Detail & Form Modals
  const [viewingStudent, setViewingStudent] =
    React.useState<AdminStudentRecord | null>(null);
  const [editingStudent, setEditingStudent] =
    React.useState<AdminStudentRecord | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [archivingStudent, setArchivingStudent] =
    React.useState<AdminStudentRecord | null>(null);

  // Form state for Create/Edit
  const [formName, setFormName] = React.useState("");
  const [formCode, setFormCode] = React.useState("");
  const [formClassId, setFormClassId] = React.useState(
    CLASSROOMS_DATA[0]?.id ?? "cls-ii-01",
  );
  const [formGoal, setFormGoal] = React.useState("IELTS 7.0 Overall");
  const [formTuitionStatus, setFormTuitionStatus] =
    React.useState<AdminStudentRecord["tuitionStatus"]>("paid");
  const [formComment, setFormComment] = React.useState("");

  React.useEffect(() => {
    apiRequest<AdminStudentRecord[]>("/api/admin/students?page=1&pageSize=100")
      .then((items) => {
        if (items.length > 0) setStudents(items);
      })
      .catch(() => {});
  }, []);

  const openCreateModal = () => {
    let nextNum = students.length + 1;
    let candidateCode = `HS-2026-${String(nextNum).padStart(2, "0")}`;
    while (students.some((s) => s.code.toUpperCase() === candidateCode)) {
      nextNum += 1;
      candidateCode = `HS-2026-${String(nextNum).padStart(2, "0")}`;
    }

    setEditingStudent(null);
    setFormName("");
    setFormCode(candidateCode);
    setFormClassId(CLASSROOMS_DATA[0]?.id ?? "cls-ii-01");
    setFormGoal("Đạt mục tiêu khóa học");
    setFormTuitionStatus("due-soon");
    setFormComment("");
    setIsCreateModalOpen(true);
  };

  const openEditModal = (stu: AdminStudentRecord) => {
    setEditingStudent(stu);
    setFormName(stu.fullName);
    setFormCode(stu.code);
    setFormClassId(stu.classId);
    setFormGoal(stu.targetGoal);
    setFormTuitionStatus(stu.tuitionStatus);
    setFormComment(stu.recentComment);
    setIsCreateModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập họ và tên học sinh.",
        variant: "error",
      });
      return;
    }

    const normalizedCode = formCode.trim().toUpperCase();
    if (!normalizedCode) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập mã định danh học sinh.",
        variant: "error",
      });
      return;
    }

    // Kiểm tra trùng mã học sinh trước khi gửi request
    const isDuplicate = students.some(
      (s) =>
        s.code.toUpperCase() === normalizedCode &&
        s.id !== editingStudent?.id,
    );
    if (isDuplicate) {
      toast({
        title: "Mã học sinh đã tồn tại",
        description: `Mã "${normalizedCode}" đã được sử dụng cho một học sinh khác. Vui lòng nhập mã khác.`,
        variant: "error",
      });
      return;
    }

    const targetClass =
      CLASSROOMS_DATA.find((c) => c.id === formClassId) ?? CLASSROOMS_DATA[0];

    if (editingStudent) {
      try {
        const updated = await apiRequest<AdminStudentRecord>(
          `/api/admin/students/${encodeURIComponent(editingStudent.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              code: normalizedCode,
              fullName: formName.trim(),
              classId: targetClass?.id ?? editingStudent.classId,
              targetGoal: formGoal.trim(),
              tuitionStatus: formTuitionStatus,
              recentComment: formComment.trim(),
            }),
          },
        );
        setStudents((prev) =>
          prev.map((item) => (item.id === editingStudent.id ? updated : item)),
        );
        toast({
          title: "Đã cập nhật hồ sơ học sinh",
          description: `Thông tin của ${formName} (${normalizedCode}) đã được lưu.`,
          variant: "success",
        });
        setIsCreateModalOpen(false);
      } catch (err) {
        toast({
          title: "Không thể cập nhật hồ sơ",
          description:
            err instanceof Error ? err.message : "Đã có lỗi xảy ra khi lưu thay đổi.",
          variant: "error",
        });
      }
    } else {
      try {
        const created = await apiRequest<AdminStudentRecord>(
          "/api/admin/students",
          {
            method: "POST",
            body: JSON.stringify({
              code: normalizedCode,
              fullName: formName.trim(),
              classId: targetClass?.id ?? "cls-ii-01",
              targetGoal: formGoal.trim(),
              tuitionStatus: formTuitionStatus,
              recentComment: formComment.trim(),
            }),
          },
        );
        setStudents((prev) => [created, ...prev]);
        toast({
          title: "Đã thêm học sinh mới",
          description: `Học sinh ${formName} (${normalizedCode}) đã được thêm vào danh sách.`,
          variant: "success",
        });
        setIsCreateModalOpen(false);
      } catch (err) {
        toast({
          title: "Không thể tạo hồ sơ học sinh",
          description:
            err instanceof Error ? err.message : "Đã có lỗi xảy ra khi thêm học sinh.",
          variant: "error",
        });
      }
    }
  };

  const handleArchiveConfirmed = async () => {
    if (!archivingStudent) return;
    try {
      await apiRequest(
        `/api/admin/students/${encodeURIComponent(archivingStudent.id)}`,
        { method: "DELETE" },
      );
    } catch {
      // Fallback if offline
    }
    setStudents((prev) =>
      prev.map((s) =>
        s.id === archivingStudent.id
          ? { ...s, status: "archived", deletedAt: new Date().toISOString() }
          : s,
      ),
    );
    setSelectedIds((prev) => prev.filter((id) => id !== archivingStudent.id));
    toast({
      title: "Đã lưu trữ hồ sơ học sinh",
      description: `Hồ sơ ${archivingStudent.fullName} (${archivingStudent.code}) đã được chuyển vào mục Lưu trữ. Toàn bộ điểm số và học phí vẫn được bảo toàn.`,
      variant: "info",
    });
    setArchivingStudent(null);
  };

  const handleRestoreStudent = async (stu: AdminStudentRecord) => {
    try {
      await apiRequest(
        `/api/admin/students/${encodeURIComponent(stu.id)}/restore`,
        { method: "POST" },
      );
    } catch (err) {
      toast({
        title: "Không thể khôi phục",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        variant: "error",
      });
      return;
    }
    setStudents((prev) =>
      prev.map((item) =>
        item.id === stu.id
          ? { ...item, status: "active", deletedAt: null }
          : item,
      ),
    );
    toast({
      title: "Đã khôi phục hồ sơ",
      description: `Học sinh ${stu.fullName} (${stu.code}) đã quay lại danh sách đang theo học.`,
      variant: "success",
    });
  };

  const filteredAndSorted = React.useMemo(() => {
    const filtered = students.filter((s) => {
      const matchesClass = classFilter === "all" || s.classId === classFilter;
      const matchesTuition =
        tuitionFilter === "all" || s.tuitionStatus === tuitionFilter;
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "archived"
            ? s.status === "archived"
            : s.status !== "archived";
      const q = searchQuery.trim();
      if (!q) return matchesClass && matchesTuition && matchesStatus;

      const normQ = removeVietnameseTones(q);
      const matchesSearch =
        removeVietnameseTones(s.fullName).includes(normQ) ||
        removeVietnameseTones(s.code).includes(normQ) ||
        removeVietnameseTones(s.className).includes(normQ);
      return matchesClass && matchesTuition && matchesStatus && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.fullName.localeCompare(b.fullName, "vi");
      if (sortBy === "attendance") return b.attendanceRate - a.attendanceRate;
      return b.averageScore - a.averageScore;
    });
  }, [students, classFilter, tuitionFilter, statusFilter, searchQuery, sortBy]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSorted.length / PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedStudents = filteredAndSorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const toggleSelectAll = () => {
    const pageIds = paginatedStudents.map((s) => s.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản lý Hồ sơ Học sinh
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý mã định danh, theo dõi tiến độ 4 kỹ năng, chuyên cần và học phí của từng học
            viên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast({
                title: "Nhập danh sách từ Excel/CSV",
                description: "Đã mở trình kiểm tra định dạng tệp CSV học sinh.",
                variant: "info",
              })
            }
          >
            <FileUp className="size-3.5" aria-hidden="true" />
            Nhập CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast({
                title: "Đã xuất báo cáo học vụ",
                description: `Đã tải xuống danh sách ${filteredAndSorted.length} học sinh (Excel).`,
                variant: "success",
              })
            }
          >
            <Download className="size-3.5" aria-hidden="true" />
            Xuất Excel
          </Button>
          <Button size="sm" onClick={openCreateModal}>
            <UserPlus className="size-3.5" aria-hidden="true" />
            Thêm học sinh mới
          </Button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo họ tên, mã học sinh (VD: HS-2026-01), tên lớp..."
            aria-label="Tìm kiếm học sinh"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo lớp học"
            className="h-8 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả các lớp ({CLASSROOMS_DATA.length})</option>
            {CLASSROOMS_DATA.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.code} — {cls.name}
              </option>
            ))}
          </select>

          <select
            value={tuitionFilter}
            onChange={(e) => {
              setTuitionFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo trạng thái học phí"
            className="h-8 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả trạng thái học phí</option>
            <option value="paid">Đã hoàn thành</option>
            <option value="due-soon">Sắp đến hạn</option>
            <option value="overdue">Quá hạn thanh toán</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "active" | "archived" | "all");
              setPage(1);
            }}
            aria-label="Lọc theo tình trạng học vụ"
            className="h-8 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="active">
              Đang học ({students.filter((s) => s.status !== "archived").length})
            </option>
            <option value="archived">
              Đã lưu trữ ({students.filter((s) => s.status === "archived").length})
            </option>
            <option value="all">Tất cả hồ sơ ({students.length})</option>
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSortBy((prev) =>
                prev === "score"
                  ? "attendance"
                  : prev === "attendance"
                    ? "name"
                    : "score",
              )
            }
          >
            <ArrowUpDown className="size-3.5" aria-hidden="true" />
            Sắp xếp:{" "}
            {sortBy === "score"
              ? "Điểm TB"
              : sortBy === "attendance"
                ? "Chuyên cần"
                : "Họ tên"}
          </Button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-warm/70 px-4 py-3 text-xs">
          <span className="font-semibold text-primary">
            Đã chọn {selectedIds.length} học sinh
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              className="bg-card"
              onClick={() => {
                toast({
                  title: "Đã gửi phiếu báo học tập",
                  description: `Đã gửi báo cáo định kỳ cho ${selectedIds.length} học sinh đã chọn.`,
                  variant: "success",
                });
                setSelectedIds([]);
              }}
            >
              <MailCheck className="size-3.5" aria-hidden="true" />
              Gửi phiếu điểm hàng loạt
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelectedIds([])}
            >
              Bỏ chọn
            </Button>
          </div>
        </div>
      )}

      {/* Data Table */}
      {paginatedStudents.length === 0 ? (
        <EmptyState
          title="Không tìm thấy hồ sơ học sinh"
          description="Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc lớp học."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setClassFilter("all");
                setTuitionFilter("all");
              }}
            >
              Đặt lại bộ lọc
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
          <Table className="border-0 rounded-none">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả học sinh trên trang"
                    checked={
                      paginatedStudents.length > 0 &&
                      paginatedStudents.every((s) => selectedIds.includes(s.id))
                    }
                    onChange={toggleSelectAll}
                    className="size-4 rounded border-input accent-primary"
                  />
                </TableHead>
                <TableHead>Mã HS & Họ tên</TableHead>
                <TableHead>Lớp theo học</TableHead>
                <TableHead className="text-center">Điểm TB</TableHead>
                <TableHead className="text-center">Chuyên cần</TableHead>
                <TableHead>Học phí</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedStudents.map((stu) => (
                <TableRow key={stu.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Chọn học sinh ${stu.fullName}`}
                      checked={selectedIds.includes(stu.id)}
                      onChange={() => toggleSelectOne(stu.id)}
                      className="size-4 rounded border-input accent-primary"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warm font-heading text-xs font-bold text-primary">
                        {stu.fullName
                          .split(" ")
                          .slice(-2)
                          .map((w) => w[0])
                          .join("")}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-heading text-sm font-semibold text-foreground">
                            {stu.fullName}
                          </p>
                          {stu.status === "archived" && (
                            <Badge
                              variant="outline"
                              className="border-amber-400/60 bg-amber-500/10 text-[10px] font-medium text-amber-700"
                            >
                              Đã lưu trữ
                            </Badge>
                          )}
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">
                          {stu.code} · Mục tiêu: {stu.targetGoal}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-medium text-foreground">
                      {stu.className}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Trình độ {stu.level}
                    </p>
                  </TableCell>
                  <TableCell className="text-center">
                    {stu.grades.length > 0 && stu.averageScore > 0 ? (
                      <Badge variant="default" className="font-mono">
                        {stu.averageScore.toFixed(1)}
                      </Badge>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground" title="Chưa có bài kiểm tra">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {stu.attendanceHistory.length > 0 ? (
                      <span className="font-mono text-xs font-semibold text-emerald-700">
                        {stu.attendanceRate}%
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground" title="Chưa có dữ liệu điểm danh">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        stu.tuitionStatus === "paid"
                          ? "success"
                          : stu.tuitionStatus === "due-soon"
                            ? "warning"
                            : "destructive"
                      }
                    >
                      {stu.tuitionStatus === "paid"
                        ? "Đã đóng"
                        : stu.tuitionStatus === "due-soon"
                          ? "Sắp đến hạn"
                          : "Quá hạn"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setViewingStudent(stu)}
                        aria-label={`Xem chi tiết ${stu.fullName}`}
                        title="Xem chi tiết hồ sơ"
                      >
                        <Eye className="size-3.5 text-primary" aria-hidden="true" />
                      </Button>
                      {stu.status === "archived" ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRestoreStudent(stu)}
                          aria-label={`Khôi phục ${stu.fullName}`}
                          title="Khôi phục về danh sách đang học"
                        >
                          <RotateCcw className="size-3.5 text-emerald-600" aria-hidden="true" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => openEditModal(stu)}
                            aria-label={`Chỉnh sửa ${stu.fullName}`}
                            title="Chỉnh sửa hồ sơ"
                          >
                            <Edit3 className="size-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setArchivingStudent(stu)}
                            aria-label={`Lưu trữ ${stu.fullName}`}
                            title="Lưu trữ hồ sơ"
                          >
                            <Archive className="size-3.5 text-amber-600" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            totalItems={filteredAndSorted.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Student Detail Modal */}
      <ModalDialog
        open={Boolean(viewingStudent)}
        onClose={() => setViewingStudent(null)}
        title={
          viewingStudent
            ? `Hồ sơ Học vụ: ${viewingStudent.fullName} (${viewingStudent.code})`
            : "Chi tiết học sinh"
        }
        description={viewingStudent?.className}
        size="lg"
        footer={
          viewingStudent ? (
            <>
              <Button variant="outline" onClick={() => setViewingStudent(null)}>
                Đóng
              </Button>
              <Button
                onClick={() => {
                  const target = viewingStudent;
                  setViewingStudent(null);
                  openEditModal(target);
                }}
              >
                <Edit3 className="size-4" aria-hidden="true" />
                Chỉnh sửa hồ sơ
              </Button>
            </>
          ) : undefined
        }
      >
        {viewingStudent && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-background p-3.5">
                <span className="text-muted-foreground">Điểm trung bình</span>
                <p className="mt-1 font-mono text-xl font-bold text-primary">
                  {viewingStudent.grades.length > 0 && viewingStudent.averageScore > 0
                    ? viewingStudent.averageScore.toFixed(1)
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-background p-3.5">
                <span className="text-muted-foreground">Chuyên cần</span>
                <p className="mt-1 font-mono text-xl font-bold text-emerald-700">
                  {viewingStudent.attendanceHistory.length > 0
                    ? `${viewingStudent.attendanceRate}%`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-warm/60 p-3.5">
                <span className="text-muted-foreground">Học phí</span>
                <p className="mt-1 font-mono text-sm font-bold text-foreground">
                  {viewingStudent.tuitionAmount}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-warm/40 p-4">
              <p className="font-semibold text-primary">Nhận xét gần nhất của giáo viên:</p>
              <p className="mt-1 leading-relaxed text-foreground">
                {viewingStudent.recentComment
                  ? `“${viewingStudent.recentComment}”`
                  : "Chưa có nhận xét."}
              </p>
            </div>

            <div>
              <h4 className="mb-2 font-heading text-sm font-bold text-foreground">
                Bảng điểm các bài kiểm tra ({viewingStudent.grades.length})
              </h4>
              {viewingStudent.grades.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
                  Học sinh mới nhập học, chưa có bài kiểm tra nào được ghi nhận.
                </div>
              ) : (
                <div className="space-y-2">
                  {viewingStudent.grades.map((g) => (
                    <div
                      key={g.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3"
                    >
                      <div>
                        <p className="font-semibold text-foreground">{g.assessmentTitle}</p>
                        <p className="text-muted-foreground">
                          Ngày: {g.date} · L:{g.listening} R:{g.reading} W:{g.writing} S:
                          {g.speaking}
                        </p>
                      </div>
                      <Badge variant="default" className="font-mono">
                        Overall {g.overall.toFixed(1)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Create / Edit Student Modal */}
      <ModalDialog
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={
          editingStudent
            ? `Cập nhật học sinh: ${editingStudent.fullName}`
            : "Thêm hồ sơ học sinh mới"
        }
        description="Thông tin học sinh được bảo mật và đồng bộ với Cổng tra cứu cá nhân."
        size="md"
      >
        <form onSubmit={handleSaveStudent} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-code"
                className="block text-xs font-semibold text-foreground"
              >
                Mã định danh học sinh
              </label>
              <Input
                id="stu-form-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                required
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-name"
                className="block text-xs font-semibold text-foreground"
              >
                Họ và tên học sinh
              </label>
              <Input
                id="stu-form-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nhập họ và tên đầy đủ"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-class"
                className="block text-xs font-semibold text-foreground"
              >
                Phân lớp học
              </label>
              <select
                id="stu-form-class"
                value={formClassId}
                onChange={(e) => setFormClassId(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                {CLASSROOMS_DATA.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.code} — {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="stu-form-tuition"
                className="block text-xs font-semibold text-foreground"
              >
                Trạng thái học phí
              </label>
              <select
                id="stu-form-tuition"
                value={formTuitionStatus}
                onChange={(e) =>
                  setFormTuitionStatus(
                    e.target.value as AdminStudentRecord["tuitionStatus"],
                  )
                }
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="paid">Đã hoàn thành</option>
                <option value="due-soon">Sắp đến hạn</option>
                <option value="overdue">Quá hạn thanh toán</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="stu-form-goal"
              className="block text-xs font-semibold text-foreground"
            >
              Mục tiêu đầu ra
            </label>
            <Input
              id="stu-form-goal"
              value={formGoal}
              onChange={(e) => setFormGoal(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="stu-form-comment"
              className="block text-xs font-semibold text-foreground"
            >
              Nhận xét chuyên môn của giáo viên
            </label>
            <textarea
              id="stu-form-comment"
              rows={3}
              value={formComment}
              onChange={(e) => setFormComment(e.target.value)}
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {editingStudent ? "Lưu thay đổi" : "Tạo hồ sơ"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Archive Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(archivingStudent)}
        onClose={() => setArchivingStudent(null)}
        onConfirm={handleArchiveConfirmed}
        title="Xác nhận lưu trữ hồ sơ học sinh?"
        description={
          archivingStudent
            ? `Hồ sơ "${archivingStudent.fullName}" (${archivingStudent.code}) sẽ được chuyển vào mục Lưu trữ. Sĩ số lớp sẽ tự động giảm 1, toàn bộ điểm số và lịch sử học tập vẫn được bảo lưu an toàn.`
            : ""
        }
        confirmLabel="Lưu trữ hồ sơ"
        variant="default"
      />
    </div>
  );
}
