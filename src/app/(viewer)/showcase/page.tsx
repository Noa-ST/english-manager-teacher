"use client";

import * as React from "react";
import {
  Award,
  BookOpen,
  Calendar,
  ExternalLink,
  Eye,
  FolderGit2,
  Layers,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import {
  STUDENT_PROJECTS_DATA,
  type StudentProjectItem,
} from "@/services/classroom-data";
import { apiRequest } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Breadcrumb, EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export const PROJECT_CATEGORY_LABELS: Record<string, string> = {
  "Research Poster": "Poster Nghiên Cứu",
  "Debate Portfolio": "Hồ Sơ Tranh Biện",
  "Video Presentation": "Video Thuyết Trình",
  "Academic Essay": "Bài Luận Học Thuật",
};

const PROJECT_CATEGORIES: {
  value: "all" | StudentProjectItem["category"];
  label: string;
}[] = [
  { value: "all", label: "Tất cả thể loại" },
  { value: "Research Poster", label: "Poster Nghiên Cứu" },
  { value: "Debate Portfolio", label: "Hồ Sơ Tranh Biện" },
  { value: "Video Presentation", label: "Video Thuyết Trình" },
  { value: "Academic Essay", label: "Bài Luận Học Thuật" },
];

export default function ShowcasePage() {
  const { toast } = useToast();
  const [projects, setProjects] = React.useState<StudentProjectItem[]>(
    STUDENT_PROJECTS_DATA,
  );
  const [selectedCategory, setSelectedCategory] = React.useState<
    "all" | StudentProjectItem["category"]
  >("all");
  const [selectedClass, setSelectedClass] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [previewProject, setPreviewProject] =
    React.useState<StudentProjectItem | null>(null);

  React.useEffect(() => {
    apiRequest<StudentProjectItem[]>("/api/viewer/showcase")
      .then(setProjects)
      .catch(() => {});
  }, []);

  const classOptions = React.useMemo(() => {
    const unique = Array.from(new Set(projects.map((p) => p.className)));
    return ["all", ...unique];
  }, [projects]);

  const filteredProjects = React.useMemo(() => {
    return projects.filter((p) => {
      const matchesCategory =
        selectedCategory === "all" || p.category === selectedCategory;
      const matchesClass =
        selectedClass === "all" || p.className === selectedClass;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.studentOrTeam.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q);
      return matchesCategory && matchesClass && matchesSearch;
    });
  }, [projects, selectedCategory, selectedClass, searchQuery]);

  const themeBannerStyles: Record<StudentProjectItem["accentTheme"], string> = {
    navy: "bg-primary text-primary-foreground",
    blue: "bg-accent text-accent-foreground",
    coral: "bg-highlight text-highlight-foreground",
    cream: "bg-warm text-warm-foreground border-b border-border",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* Header */}
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Trang chủ", href: "/" },
            { label: "Thư viện dự án học sinh" },
          ]}
        />
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
              <FolderGit2 className="size-4" aria-hidden="true" />
              <span>Creative Academic Portfolio</span>
            </div>
            <h1 className="mt-1 font-heading text-3xl font-bold text-foreground sm:text-4xl">
              Thư viện dự án & Sản phẩm học sinh
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Không gian trưng bày các bài luận học thuật, poster nghiên cứu khoa học, hồ sơ tranh
              biện và bài thuyết trình xuất sắc do học sinh các khối lớp thực hiện.
            </p>
          </div>
          <Badge variant="warm" className="self-start sm:self-auto">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            {STUDENT_PROJECTS_DATA.length} dự án tiêu biểu được tuyển chọn
          </Badge>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Lọc dự án theo thể loại"
          >
            {PROJECT_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={cn(
                    "rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              aria-label="Lọc theo lớp học"
              className="h-8 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {classOptions.map((cls) => (
                <option key={cls} value={cls}>
                  {cls === "all" ? "Tất cả các lớp" : cls}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên dự án, tác giả..."
                aria-label="Tìm kiếm dự án học sinh"
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Grid */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          title="Không tìm thấy dự án học sinh phù hợp"
          description="Thử thay đổi bộ lọc thể loại, lớp học hoặc từ khóa tìm kiếm."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCategory("all");
                setSelectedClass("all");
                setSearchQuery("");
              }}
            >
              Đặt lại bộ lọc
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filteredProjects.map((project) => (
            <article
              key={project.id}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-2xs transition-all hover:border-accent/50 hover:shadow-md"
            >
              <div>
                {/* Editorial Cover Header */}
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 px-6 py-4",
                    themeBannerStyles[project.accentTheme],
                  )}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Layers className="size-4" aria-hidden="true" />
                    <span>
                      {PROJECT_CATEGORY_LABELS[project.category] ||
                        project.category}
                    </span>
                  </div>
                  <span className="rounded-full bg-black/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold">
                    {project.featuredMetric}
                  </span>
                </div>

                {/* Card Content */}
                <div className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                      <Users className="size-3.5 text-accent" aria-hidden="true" />
                      {project.studentOrTeam}
                    </span>
                    <span>{project.className}</span>
                  </div>

                  <h2 className="mt-2.5 font-heading text-xl font-bold text-foreground group-hover:text-primary">
                    {project.title}
                  </h2>

                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                    {project.summary}
                  </p>

                  <div className="mt-4 rounded-xl bg-warm/45 p-3.5 text-xs leading-relaxed text-foreground/90">
                    <strong className="font-semibold text-primary">
                      Nhận xét chuyên môn:
                    </strong>{" "}
                    {project.keyTakeaway}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-3.5 text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="size-3.5" aria-hidden="true" />
                  Xuất bản: {project.publishedAt}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewProject(project)}
                  >
                    <Eye className="size-3.5" aria-hidden="true" />
                    Xem tóm tắt
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      toast({
                        title: "Đang mở hồ sơ dự án",
                        description: `Đã mở hồ sơ "${project.title}" trong chế độ đọc học thuật.`,
                        variant: "info",
                      });
                      setPreviewProject(project);
                    }}
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Hồ sơ đầy đủ
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Project Detail Modal */}
      <ModalDialog
        open={Boolean(previewProject)}
        onClose={() => setPreviewProject(null)}
        title={previewProject?.title ?? "Chi tiết dự án học sinh"}
        description={
          previewProject
            ? `${PROJECT_CATEGORY_LABELS[previewProject.category] || previewProject.category} · Thực hiện: ${previewProject.studentOrTeam}`
            : undefined
        }
        size="lg"
        footer={
          previewProject ? (
            <>
              <Button variant="outline" onClick={() => setPreviewProject(null)}>
                Đóng
              </Button>
              <Button
                onClick={() => {
                  toast({
                    title: "Đã tải bản thuyết trình PDF",
                    description: `Hồ sơ dự án "${previewProject.title}" đang được tải về.`,
                    variant: "success",
                  });
                  setPreviewProject(null);
                }}
              >
                <BookOpen className="size-4" aria-hidden="true" />
                Tải hồ sơ dự án (PDF)
              </Button>
            </>
          ) : undefined
        }
      >
        {previewProject && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{previewProject.featuredMetric}</Badge>
              <Badge variant="secondary">{previewProject.className}</Badge>
              <Badge variant="outline">Ngày đăng: {previewProject.publishedAt}</Badge>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <h3 className="font-heading text-sm font-semibold text-foreground">
                Tóm tắt nội dung dự án (Abstract)
              </h3>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">
                {previewProject.summary}
              </p>
            </div>

            <div className="rounded-xl border border-primary/20 bg-warm/50 p-4">
              <div className="flex items-center gap-2 font-heading text-sm font-semibold text-primary">
                <Award className="size-4 text-accent" aria-hidden="true" />
                <span>Đánh giá từ Giảng viên hướng dẫn</span>
              </div>
              <p className="mt-1.5 leading-relaxed text-foreground/90">
                {previewProject.keyTakeaway}
              </p>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
