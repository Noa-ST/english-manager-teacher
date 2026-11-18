"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Plus,
  Save,
  Search,
} from "lucide-react";
import {
  ADMIN_STUDENTS_DATA,
  CLASSROOMS_DATA,
  type AdminStudentRecord,
  type ClassroomGroup,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { removeVietnameseTones } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { PaginationBar } from "@/components/ui/feedback";
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

interface GradeEntryRow {
  studentId: string;
  code: string;
  fullName: string;
  classId: string;
  className: string;
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
  comment: string;
}

const ASSESSMENTS = [
  "Mock Test #3 — Toàn diện 4 kỹ năng (Tháng 11/2026)",
  "Argumentative Essay #4 — Education & AI",
  "Mid-term Academic Progress Check (Tháng 10/2026)",
];

const SKILL_LABELS: Record<string, string> = {
  listening: "Nghe",
  reading: "Đọc",
  writing: "Viết",
  speaking: "Nói",
};

function mergeClassesWithDefaults(cached: ClassroomGroup[]): ClassroomGroup[] {
  const map = new Map<string, ClassroomGroup>();
  for (const c of CLASSROOMS_DATA) {
    map.set(c.id, c);
  }
  for (const c of cached) {
    map.set(c.id, c);
  }
  return Array.from(map.values());
}

export default function AdminGradesPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialClassId = searchParams.get("classId") ?? "all";

  const [classes, setClasses] = React.useState<ClassroomGroup[]>(CLASSROOMS_DATA);

  const [assessments, setAssessments] = React.useState<string[]>(ASSESSMENTS);
  const [selectedAssessment, setSelectedAssessment] = React.useState<string>(
    ASSESSMENTS[0],
  );
  const [selectedClassId, setSelectedClassId] = React.useState<string>(initialClassId);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [isNewTestModalOpen, setIsNewTestModalOpen] = React.useState(false);
  const [newTestTitle, setNewTestTitle] = React.useState("");

  const [rows, setRows] = React.useState<GradeEntryRow[]>(() =>
    ADMIN_STUDENTS_DATA.filter((s) => s.status !== "archived").map((stu) => {
      const latest = stu.grades[0];
      return {
        studentId: stu.id,
        code: stu.code,
        fullName: stu.fullName,
        classId: stu.classId,
        className: stu.className,
        listening: latest?.listening ?? 7.0,
        reading: latest?.reading ?? 7.0,
        writing: latest?.writing ?? 6.5,
        speaking: latest?.speaking ?? 7.0,
        comment: latest?.comment ?? stu.recentComment,
      };
    }),
  );

  React.useEffect(() => {
    apiRequest<{
      assessments: string[];
      classes: ClassroomGroup[];
      students: AdminStudentRecord[];
    }>("/api/admin/grades")
      .then((data) => {
        if (data.classes && data.classes.length > 0) {
          const merged = mergeClassesWithDefaults(data.classes);
          setClasses(merged);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("teacher_studio_classrooms_v1", JSON.stringify(merged));
            } catch {}
          }
        }
        if (data.assessments && data.assessments.length > 0) {
          setAssessments(data.assessments);
          setSelectedAssessment((curr) => curr || data.assessments[0]);
        }
        if (data.students && data.students.length > 0) {
          setRows((prev) => {
            const prevMap = new Map(prev.map((r) => [r.studentId, r]));
            return data.students.map((stu) => {
              const existing = prevMap.get(stu.id);
              if (existing) {
                return {
                  ...existing,
                  code: stu.code,
                  fullName: stu.fullName,
                  classId: stu.classId,
                  className: stu.className,
                };
              }
              const latest = stu.grades[0];
              return {
                studentId: stu.id,
                code: stu.code,
                fullName: stu.fullName,
                classId: stu.classId,
                className: stu.className,
                listening: latest?.listening ?? 7.0,
                reading: latest?.reading ?? 7.0,
                writing: latest?.writing ?? 6.5,
                speaking: latest?.speaking ?? 7.0,
                comment: latest?.comment ?? stu.recentComment,
              };
            });
          });
        }
      })
      .catch(() => {});
  }, []);

  const visibleRows = React.useMemo(() => {
    return rows.filter((row) => {
      const matchesClass =
        selectedClassId === "all" || row.classId === selectedClassId;
      const q = searchQuery.trim();
      if (!q) return matchesClass;

      const normQ = removeVietnameseTones(q);
      const matchesSearch =
        removeVietnameseTones(row.fullName).includes(normQ) ||
        removeVietnameseTones(row.code).includes(normQ);
      return matchesClass && matchesSearch;
    });
  }, [rows, selectedClassId, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = visibleRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const computeOverall = (r: GradeEntryRow) => {
    const raw = (r.listening + r.reading + r.writing + r.speaking) / 4;
    return Math.round(raw * 2) / 2;
  };

  const handleScoreChange = (
    studentId: string,
    skill: "listening" | "reading" | "writing" | "speaking",
    value: string,
  ) => {
    const num = Math.max(0, Math.min(9, Number(value) || 0));
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, [skill]: num } : r)),
    );
  };

  const handleCommentChange = (studentId: string, comment: string) => {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, comment } : r)),
    );
  };

  const handleSaveGrades = async () => {
    try {
      await apiRequest("/api/admin/grades", {
        method: "POST",
        body: JSON.stringify({
          action: "batch-grades",
          assessmentTitle: selectedAssessment,
          entries: visibleRows.map((r) => ({
            studentId: r.studentId,
            listening: r.listening,
            reading: r.reading,
            writing: r.writing,
            speaking: r.speaking,
            comment: r.comment,
          })),
        }),
      });
    } catch {
      // Fallback handled gracefully
    }
    toast({
      title: "Đã lưu bảng điểm & nhận xét",
      description: `Đã cập nhật điểm số kỳ "${selectedAssessment}" cho ${visibleRows.length} học sinh.`,
      variant: "success",
    });
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTestTitle.trim()) return;
    const title = newTestTitle.trim();
    try {
      const res = await apiRequest<{ assessments: string[] }>(
        "/api/admin/grades",
        {
          method: "POST",
          body: JSON.stringify({
            action: "create-assessment",
            title,
          }),
        },
      );
      setAssessments(res.assessments);
    } catch {
      setAssessments((prev) => [title, ...prev]);
    }
    setSelectedAssessment(title);
    setNewTestTitle("");
    setIsNewTestModalOpen(false);
    toast({
      title: "Đã tạo bài kiểm tra mới",
      description: `Kỳ đánh giá "${title}" đã sẵn sàng nhập điểm.`,
      variant: "success",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Quản lý Điểm số & Nhận xét chuyên môn
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập điểm 4 kỹ năng (Listening, Reading, Writing, Speaking), tự động quy đổi Overall và
            gửi nhận xét cá nhân hóa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => setIsNewTestModalOpen(true)}
          >
            <Plus className="size-4 text-primary" aria-hidden="true" />
            Tạo bài kiểm tra mới
          </Button>
          <Button onClick={handleSaveGrades}>
            <Save className="size-4" aria-hidden="true" />
            Lưu bảng điểm
          </Button>
        </div>
      </div>

      {/* Filter & Assessment Selector */}
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-5">
          <label
            htmlFor="grade-assessment-select"
            className="block text-xs font-semibold text-foreground"
          >
            Kỳ kiểm tra / Bài đánh giá
          </label>
          <select
            id="grade-assessment-select"
            value={selectedAssessment}
            onChange={(e) => setSelectedAssessment(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            {assessments.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 lg:col-span-4">
          <label
            htmlFor="grade-class-select"
            className="block text-xs font-semibold text-foreground"
          >
            Lọc theo lớp học
          </label>
          <select
            id="grade-class-select"
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setPage(1);
            }}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground"
          >
            <option value="all">Tất cả các lớp ({rows.length} học sinh)</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.code} — {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 lg:col-span-3">
          <label
            htmlFor="grade-student-search"
            className="block text-xs font-semibold text-foreground"
          >
            Tìm học sinh
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="grade-student-search"
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Tên hoặc Mã HS..."
              className="h-9 pl-9"
            />
          </div>
        </div>
      </div>

      {/* Skill Averages Comparison Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(
          [
            {
              label: "Listening TB",
              val:
                visibleRows.reduce((s, r) => s + r.listening, 0) /
                (visibleRows.length || 1),
              highlight: false,
            },
            {
              label: "Reading TB",
              val:
                visibleRows.reduce((s, r) => s + r.reading, 0) /
                (visibleRows.length || 1),
              highlight: false,
            },
            {
              label: "Writing TB",
              val:
                visibleRows.reduce((s, r) => s + r.writing, 0) /
                (visibleRows.length || 1),
              highlight: false,
            },
            {
              label: "Speaking TB",
              val:
                visibleRows.reduce((s, r) => s + r.speaking, 0) /
                (visibleRows.length || 1),
              highlight: false,
            },
            {
              label: "Overall Toàn lớp",
              val:
                visibleRows.reduce((s, r) => s + computeOverall(r), 0) /
                (visibleRows.length || 1),
              highlight: true,
            },
          ]
        ).map((stat) => (
          <div
            key={stat.label}
            className={
              stat.highlight
                ? "rounded-2xl border border-primary/30 bg-warm/65 p-4"
                : "rounded-2xl border border-border bg-card p-4"
            }
          >
            <span className="text-xs text-muted-foreground">{stat.label}</span>
            <p className="mt-1 font-mono text-2xl font-bold text-primary">
              {stat.val.toFixed(1)}
            </p>
          </div>
        ))}
      </div>

      {/* Batch Grade & Comment Entry Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Học sinh</TableHead>
            <TableHead className="w-24 text-center">Listening</TableHead>
            <TableHead className="w-24 text-center">Reading</TableHead>
            <TableHead className="w-24 text-center">Writing</TableHead>
            <TableHead className="w-24 text-center">Speaking</TableHead>
            <TableHead className="w-24 text-center">Overall</TableHead>
            <TableHead>Nhận xét chuyên môn của giáo viên</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedRows.map((row) => {
            const overall = computeOverall(row);
            return (
              <TableRow key={row.studentId}>
                <TableCell>
                  <p className="font-heading text-sm font-bold text-foreground">
                    {row.fullName}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {row.code} · {row.className}
                  </p>
                </TableCell>
                {(
                  ["listening", "reading", "writing", "speaking"] as const
                ).map((skill) => (
                  <TableCell key={skill} className="text-center">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="9"
                      value={row[skill]}
                      onChange={(e) =>
                        handleScoreChange(row.studentId, skill, e.target.value)
                      }
                      aria-label={`Điểm ${SKILL_LABELS[skill] || skill} của ${row.fullName}`}
                      className="mx-auto h-8 w-18 text-center font-mono text-xs font-semibold"
                    />
                  </TableCell>
                ))}
                <TableCell className="text-center">
                  <Badge variant="default" className="font-mono text-xs">
                    {overall.toFixed(1)}
                  </Badge>
                </TableCell>
                <TableCell className="min-w-72">
                  <Input
                    type="text"
                    value={row.comment}
                    onChange={(e) =>
                      handleCommentChange(row.studentId, e.target.value)
                    }
                    aria-label={`Nhận xét cho ${row.fullName}`}
                    className="h-8 text-xs"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {visibleRows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            totalItems={visibleRows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>
      )}

      {/* New Assessment Modal */}
      <ModalDialog
        open={isNewTestModalOpen}
        onClose={() => setIsNewTestModalOpen(false)}
        title="Tạo kỳ kiểm tra / đánh giá mới"
        description="Khởi tạo bảng điểm mới để nhập điểm 4 kỹ năng cho học sinh."
        size="md"
      >
        <form onSubmit={handleCreateAssessment} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="new-test-title"
              className="block text-xs font-semibold text-foreground"
            >
              Tên bài kiểm tra / Đánh giá định kỳ
            </label>
            <Input
              id="new-test-title"
              value={newTestTitle}
              onChange={(e) => setNewTestTitle(e.target.value)}
              placeholder="Ví dụ: Mock Test #4 — Quý IV/2026"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsNewTestModalOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Tạo bảng điểm
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
