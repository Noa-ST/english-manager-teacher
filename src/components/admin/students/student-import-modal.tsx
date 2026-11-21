"use client";

import * as React from "react";
import { CheckCircle2, Download, FileUp, Upload } from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import type { AdminStudentRecord, ClassroomGroup } from "@/services/classroom-data";
import { parseCsvLine } from "@/services/student-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

interface ParsedImportStudent {
  code: string;
  fullName: string;
  classId: string;
  className: string;
  targetGoal: string;
  tuitionStatus: "paid" | "due-soon" | "overdue";
  recentComment: string;
  isValid: boolean;
  errorReason?: string;
}

interface StudentImportModalProps {
  open: boolean;
  onClose: () => void;
  classes: ClassroomGroup[];
  existingCodes: string[];
  onImported: (created: AdminStudentRecord[]) => void;
}

export function StudentImportModal({
  open,
  onClose,
  classes,
  existingCodes,
  onImported,
}: StudentImportModalProps) {
  const { toast } = useToast();
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [parsedRows, setParsedRows] = React.useState<ParsedImportStudent[]>([]);
  const [isImporting, setIsImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const resetAndClose = () => {
    if (isImporting) return;
    setImportFile(null);
    setParsedRows([]);
    onClose();
  };

  const handleDownloadTemplate = () => {
    const templateHeaders = [
      "Mã học sinh",
      "Họ và tên",
      "Mã lớp hoặc Tên lớp",
      "Mục tiêu đầu ra",
      "Trạng thái học phí (paid/due-soon/overdue)",
      "Nhận xét giáo viên",
    ];
    const sampleRows = [
      [
        "HS-2026-90",
        "Trần Văn Bình",
        "cls-ii-01",
        "IELTS 7.0 Overall",
        "due-soon",
        "Học viên mới nhập học",
      ],
      [
        "HS-2026-91",
        "Lê Thị Mai",
        "cls-aw-02",
        "Writing 7.5+ & Học bổng",
        "paid",
        "Nền tảng ngữ pháp chắc",
      ],
    ];

    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const csvContent =
      "\uFEFF" +
      [
        templateHeaders.map(escapeCsv).join(","),
        ...sampleRows.map((r) => r.map(escapeCsv).join(",")),
      ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Mau_nhap_hoc_sinh.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        toast({
          title: "File CSV trống",
          description: "File không chứa dữ liệu học sinh.",
          variant: "error",
        });
        return;
      }

      const startIndex =
        lines[0].toLowerCase().includes("mã") || lines[0].toLowerCase().includes("code")
          ? 1
          : 0;

      const existingSet = new Set(existingCodes.map((c) => c.toUpperCase()));
      const seenCodes = new Set<string>();
      const results: ParsedImportStudent[] = [];

      for (let i = startIndex; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 2 || !cols.some((c) => c.length > 0)) continue;

        const rawCode = (cols[0] || "").trim().toUpperCase();
        const fullName = (cols[1] || "").trim();
        const rawClass = (cols[2] || "").trim();
        const targetGoal = (cols[3] || "").trim() || "Đạt mục tiêu khóa học";
        const rawTuition = (cols[4] || "").trim().toLowerCase();
        const recentComment = (cols[5] || "").trim() || "Nhập từ file CSV.";

        let tuitionStatus: "paid" | "due-soon" | "overdue" = "due-soon";
        if (
          rawTuition === "paid" ||
          rawTuition.includes("đã đóng") ||
          rawTuition.includes("hoàn thành")
        ) {
          tuitionStatus = "paid";
        } else if (rawTuition === "overdue" || rawTuition.includes("quá hạn")) {
          tuitionStatus = "overdue";
        }

        const matchedClass =
          classes.find(
            (c) =>
              c.id === rawClass ||
              c.code.toUpperCase() === rawClass.toUpperCase() ||
              c.name.toLowerCase().includes(rawClass.toLowerCase()),
          ) ?? classes[0];

        let isValid = true;
        let errorReason = "";

        if (!rawCode) {
          isValid = false;
          errorReason = "Thiếu mã học sinh";
        } else if (!fullName) {
          isValid = false;
          errorReason = "Thiếu họ và tên";
        } else if (existingSet.has(rawCode)) {
          isValid = false;
          errorReason = `Mã "${rawCode}" đã tồn tại trong hệ thống`;
        } else if (seenCodes.has(rawCode)) {
          isValid = false;
          errorReason = `Mã "${rawCode}" bị trùng lặp trong file CSV`;
        }

        if (isValid) seenCodes.add(rawCode);

        results.push({
          code: rawCode,
          fullName,
          classId: matchedClass?.id ?? "cls-ii-01",
          className: matchedClass?.name ?? "IELTS Intensive",
          targetGoal,
          tuitionStatus,
          recentComment,
          isValid,
          errorReason,
        });
      }

      setParsedRows(results);
    };

    reader.readAsText(file, "utf-8");
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsImporting(true);
    try {
      const response = await apiRequest<{
        created: AdminStudentRecord[];
        failed: { code: string; reason: string }[];
      }>("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          action: "batch-create",
          students: validRows.map((r) => ({
            code: r.code,
            fullName: r.fullName,
            classId: r.classId,
            targetGoal: r.targetGoal,
            tuitionStatus: r.tuitionStatus,
            recentComment: r.recentComment,
          })),
        }),
      });

      if (response.created && response.created.length > 0) {
        onImported(response.created);
        toast({
          title: "Nhập danh sách thành công",
          description: `Đã thêm thành công ${response.created.length} học sinh mới vào hệ thống.`,
          variant: "success",
        });
        setImportFile(null);
        setParsedRows([]);
        onClose();
      } else {
        toast({
          title: "Không thể thêm học sinh",
          description: response.failed?.[0]?.reason || "Các dòng đều bị lỗi hoặc trùng mã.",
          variant: "error",
        });
      }
    } catch (err) {
      toast({
        title: "Lỗi nhập CSV",
        description: err instanceof Error ? err.message : "Đã có lỗi xảy ra khi nhập dữ liệu.",
        variant: "error",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <ModalDialog
      open={open}
      onClose={resetAndClose}
      title="Nhập danh sách học sinh từ file CSV / Excel"
      description="Nhập nhanh danh sách học sinh mới từ bảng tính CSV (chuẩn UTF-8)."
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="size-3.5" aria-hidden="true" />
            Tải file mẫu CSV
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetAndClose}
              disabled={isImporting}
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmImport}
              disabled={isImporting || validCount === 0}
            >
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              {isImporting ? "Đang nhập dữ liệu..." : `Xác nhận nhập (${validCount} học sinh)`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="rounded-xl border border-dashed border-border bg-warm/30 p-4 text-center">
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <FileUp className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 font-medium text-foreground">
            {importFile ? importFile.name : "Kéo thả hoặc chọn file CSV từ máy tính của bạn"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Định dạng cột: Mã học sinh, Họ và tên, Mã lớp/Tên lớp, Mục tiêu, Trạng thái học phí, Nhận xét
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" aria-hidden="true" />
            {importFile ? "Chọn file khác" : "Chọn file CSV"}
          </Button>
        </div>

        {parsedRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">
                Xem trước dữ liệu ({parsedRows.length} dòng):
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="success">Hợp lệ: {validCount}</Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive">Bị từ chối: {invalidCount}</Badge>
                )}
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã HS</TableHead>
                    <TableHead>Họ và tên</TableHead>
                    <TableHead>Lớp</TableHead>
                    <TableHead>Học phí</TableHead>
                    <TableHead>Trạng thái kiểm tra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono font-medium">
                        {row.code || "—"}
                      </TableCell>
                      <TableCell>{row.fullName || "—"}</TableCell>
                      <TableCell>{row.className}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.tuitionStatus === "paid"
                              ? "success"
                              : row.tuitionStatus === "due-soon"
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {row.tuitionStatus === "paid"
                            ? "Đã đóng"
                            : row.tuitionStatus === "due-soon"
                              ? "Sắp đến hạn"
                              : "Quá hạn"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.isValid ? (
                          <span className="font-medium text-emerald-700">✓ Sẵn sàng nhập</span>
                        ) : (
                          <span className="font-medium text-destructive">✕ {row.errorReason}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
