import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import type { CurriculumAttachment } from "@/services/classroom-data";

function detectAttachmentType(fileName: string, mime: string): CurriculumAttachment["type"] {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "pdf" || mime.includes("pdf")) return "PDF";
  if (["doc", "docx"].includes(ext) || mime.includes("word") || mime.includes("document")) return "DOCX";
  if (["ppt", "pptx", "key"].includes(ext) || mime.includes("presentation") || mime.includes("powerpoint")) return "SLIDE";
  if (["xls", "xlsx", "csv"].includes(ext) || mime.includes("sheet") || mime.includes("excel")) return "WORKSHEET";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext) || mime.startsWith("image/")) return "IMAGE";
  if (["mp3", "m4a", "wav", "aac"].includes(ext) || mime.startsWith("audio/")) return "AUDIO";
  return "PDF";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const GET = adminRoute(async () => {
  const materials = await classroomService.listAllCurriculumMaterials();
  return ok(materials);
});

export const POST = adminRoute(async (request) => {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const classId = formData.get("classId") as string | null;
    const weekNumber = Number(formData.get("weekNumber")) || 1;

    if (!file || !classId) {
      return ok({ error: "Thiếu tệp hoặc ID lớp học" }, { status: 400 });
    }

    const type = detectAttachmentType(file.name, file.type);
    const d = new Date();
    const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

    // Generate local download/preview URL
    const fileId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const attachment: CurriculumAttachment = {
      id: fileId,
      name: file.name,
      url: `/documents/${encodeURIComponent(file.name)}`,
      size: formatBytes(file.size),
      sizeBytes: file.size,
      type,
      uploadedAt: dateStr,
      classId,
      weekNumber,
    };

    const updatedClass = await classroomService.addClassroomMaterial(classId, weekNumber, attachment);
    return ok({ attachment, classroom: updatedClass }, { status: 201 });
  }

  const body = (await readJson(request)) as {
    action?: string;
    classId?: string;
    weekNumber?: number;
    attachment: CurriculumAttachment;
    assignments?: Array<{ classId: string; weekNumber: number }>;
  };

  if (body?.action === "assign") {
    const result = await classroomService.assignMaterialToClasses({
      attachment: body.attachment,
      assignments: body.assignments || [],
    });
    return ok(result, { status: 200 });
  }

  if (!body.classId) {
    return ok({ error: "Thiếu thông tin lớp học (classId)" }, { status: 400 });
  }

  const updatedClass = await classroomService.addClassroomMaterial(
    body.classId,
    body.weekNumber || 1,
    body.attachment,
  );
  return ok({ attachment: body.attachment, classroom: updatedClass }, { status: 201 });
});

export const DELETE = adminRoute(async (request) => {
  const query = readQuery(request);
  const classId = query.classId;
  const weekNumber = Number(query.weekNumber) || 1;
  const attachmentId = query.attachmentId;
  const removeAll = query.removeAll === "true" || query.all === "true";

  if (!attachmentId) {
    return ok({ error: "Thiếu attachmentId" }, { status: 400 });
  }

  if (removeAll || !classId) {
    const result = await classroomService.removeMaterialFromAllClasses(attachmentId);
    return ok(result);
  }

  const updatedClass = await classroomService.removeClassroomMaterial(
    classId,
    weekNumber,
    attachmentId,
  );
  return ok({ deleted: true, classroom: updatedClass });
});
