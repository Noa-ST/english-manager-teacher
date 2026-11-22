"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Columns3,
  Download,
  FileUp,
  Info,
  Upload,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import type { AdminStudentRecord, ClassroomGroup } from "@/services/classroom-data";
import { formatDisplayDate } from "@/services/student-helpers";
import {
  parseStudentImportCsv,
  type ParsedImportStudent,
} from "@/services/student-import";
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

export type { ParsedImportStudent };

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
  const [detectedColumnCount, setDetectedColumnCount] = React.useState<number>(0);
  const [isImporting, setIsImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const resetAndClose = () => {
    if (isImporting) return;
    setImportFile(null);
    setParsedRows([]);
    setDetectedColumnCount(0);
    onClose();
  };

  const handleDownloadTemplate = () => {
    const templateHeaders = [
      "Mã học sinh",
      "Họ và tên",
      "Lớp theo học",
      "Trình độ",
      "Tình trạng học vụ",
      "Điểm TB",
      "Chuyên cần (%)",
      "Trạng thái học phí",
      "Ngày nộp học phí",
      "Mức học phí",
      "Kỳ học phí",
      "Phụ huynh",
      "SĐT phụ huynh",
      "Mục tiêu đầu ra",
      "Nhận xét của giáo viên",
      "Ngày nhập học",
    ];

    const sampleRows = [
      [
        "HS-2026-90",
        "Trần Văn Bình",
        "IELTS Intensive (Band 6.5–7.5+)",
        "C1",
        "Đang học",
        "7.5",
        "100%",
        "Sắp đến hạn",
        "20/12/2026",
        "5.800.000",
        "Học kỳ II (Tháng 11 – 01)",
        "Bác Trần Hùng",
        "0912345678",
        "IELTS 7.5 Overall (Du học Úc)",
        "Học viên mới nhập học, nền tảng Reading tốt",
        "20/11/2026",
      ],
      [
        "HS-2026-91",
        "Lê Thị Mai",
        "Academic Writing & Critical Thinking",
        "B2+",
        "Đang học",
        "7.0",
        "95%",
        "Đã đóng",
        "20/11/2026",
        "4.900.000",
        "Học kỳ II (Tháng 11 – 01)",
        "Cô Lê Thu",
        "0987654321",
        "Writing 7.5+ & Học bổng",
        "Nền tảng ngữ pháp chắc, tư duy phản biện sắc bén",
        "20/11/2026",
      ],
    ];

    const escapeCsv = (val: string) => `"${String(val ?? "").replace(/"/g, '""')}"`;
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
    link.download = "Mau_nhap_hoc_sinh_chuan.csv";
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

      const parsed = parseStudentImportCsv(content, classes, existingCodes);
      if (parsed.error) {
        toast({
          title: "File CSV trống",
          description: parsed.error,
          variant: "error",
        });
        setParsedRows([]);
        setDetectedColumnCount(0);
        return;
      }

      setDetectedColumnCount(parsed.detectedColumnCount);
      setParsedRows(parsed.rows);
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
            status: r.status,
            targetGoal: r.targetGoal,
            tuitionStatus: r.tuitionStatus,
            tuitionDueDate: r.tuitionDueDate,
            tuitionAmount: r.tuitionAmount,
            tuitionPeriod: r.tuitionPeriod,
            parentName: r.parentName || undefined,
            parentPhone: r.parentPhone || undefined,
            recentComment: r.recentComment,
            joinedAt: r.joinedAt,
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
        setDetectedColumnCount(0);
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
      description="Xem trước toàn bộ các cột thông tin học sinh trước khi xác nhận nhập vào hệ thống."
      size="2xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="size-3.5" aria-hidden="true" />
            Tải file mẫu CSV chuẩn (16 cột)
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
        {/* Upload Zone */}
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
            {importFile ? importFile.name : "Kéo thả hoặc chọn file CSV / Excel từ máy tính của bạn"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Hỗ trợ file xuất danh sách từ hệ thống hoặc file bảng tính tùy chỉnh (tự động nhận diện cột).
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

        {/* Data Preview Section */}
        {parsedRows.length > 0 && (
          <div className="space-y-3">
            {/* Header badges & scroll helper */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading font-semibold text-foreground">
                  Xem trước dữ liệu ({parsedRows.length} dòng):
                </span>
                <Badge variant="success">Hợp lệ: {validCount}</Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive">Bị từ chối: {invalidCount}</Badge>
                )}
                {detectedColumnCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                    <Columns3 className="size-3" aria-hidden="true" />
                    Nhận diện {detectedColumnCount} cột dữ liệu
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Info className="size-3.5 text-primary" aria-hidden="true" />
                <span>Cuộn ngang ↔ để xem đầy đủ tất cả các cột</span>
              </div>
            </div>

            {/* Scrollable Table View with Sticky Columns */}
            <div className="relative max-h-[440px] overflow-x-auto overflow-y-auto rounded-xl border border-border bg-card shadow-2xs">
              <Table className="min-w-[1380px] text-xs">
                <TableHeader className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs">
                  <TableRow>
                    <TableHead className="sticky left-0 z-30 min-w-[110px] bg-muted font-bold text-foreground">
                      Mã HS
                    </TableHead>
                    <TableHead className="sticky left-[110px] z-30 min-w-[160px] bg-muted font-bold text-foreground">
                      Họ và tên
                    </TableHead>
                    <TableHead className="min-w-[180px]">Lớp theo học</TableHead>
                    <TableHead className="min-w-[100px] text-center">Trạng thái</TableHead>
                    <TableHead className="min-w-[120px] text-center">Học phí</TableHead>
                    <TableHead className="min-w-[110px] text-right">Mức học phí</TableHead>
                    <TableHead className="min-w-[110px] text-center">Hạn / Ngày nộp</TableHead>
                    <TableHead className="min-w-[140px]">Kỳ học phí</TableHead>
                    <TableHead className="min-w-[130px]">Phụ huynh</TableHead>
                    <TableHead className="min-w-[110px] text-center">SĐT phụ huynh</TableHead>
                    <TableHead className="min-w-[170px]">Mục tiêu đầu ra</TableHead>
                    <TableHead className="min-w-[180px]">Nhận xét giáo viên</TableHead>
                    <TableHead className="min-w-[110px] text-center">Ngày nhập học</TableHead>
                    <TableHead className="sticky right-0 z-30 min-w-[150px] bg-muted text-center font-bold text-foreground">
                      Trạng thái kiểm tra
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, idx) => (
                    <TableRow
                      key={idx}
                      className={
                        !row.isValid
                          ? "bg-destructive/5 hover:bg-destructive/10"
                          : "hover:bg-muted/40"
                      }
                    >
                      <TableCell className="sticky left-0 z-10 bg-card font-mono font-bold text-primary">
                        {row.code || "—"}
                      </TableCell>
                      <TableCell className="sticky left-[110px] z-10 bg-card whitespace-nowrap font-medium text-foreground">
                        {row.fullName || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{row.className}</span>
                          <span className="rounded bg-warm px-1.5 py-0.2 text-[10px] text-muted-foreground">
                            {row.level}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            row.status === "active"
                              ? "outline"
                              : row.status === "trial"
                                ? "warning"
                                : "secondary"
                          }
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {row.statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            row.tuitionStatus === "paid"
                              ? "success"
                              : row.tuitionStatus === "due-soon"
                                ? "warning"
                                : "destructive"
                          }
                          className="px-2 py-0.5 text-[11px]"
                        >
                          {row.tuitionStatus === "paid"
                            ? "Đã đóng"
                            : row.tuitionStatus === "due-soon"
                              ? "Sắp đến hạn"
                              : "Quá hạn"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-foreground">
                        {row.tuitionAmount}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center font-mono text-[11px] text-muted-foreground">
                        {formatDisplayDate(row.tuitionDueDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.tuitionPeriod}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {row.parentName || "—"}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {row.parentPhone ? (
                          <span className="text-foreground">{row.parentPhone}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={row.targetGoal}>
                        {row.targetGoal}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={row.recentComment}>
                        {row.recentComment}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center font-mono text-[11px] text-muted-foreground">
                        {formatDisplayDate(row.joinedAt)}
                      </TableCell>
                      <TableCell className="sticky right-0 z-10 bg-card whitespace-nowrap text-center">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                            Sẵn sàng nhập
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-destructive">
                            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                            {row.errorReason}
                          </span>
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
