import { getServerEnv } from "@/lib/env";
import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import type { CurriculumAttachment } from "@/services/classroom-data";
import { ValidationError } from "@/services/errors";
import * as storageService from "@/services/storage.service";

export const maxDuration = 30;

export const GET = adminRoute(async () => {
  const materials = await classroomService.listAllCurriculumMaterials();
  return ok(materials);
});

export const POST = adminRoute(async (request, { session }) => {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const classId = (formData.get("classId") as string | null)?.trim();
    const weekNumber = Number(formData.get("weekNumber")) || 1;
    const visibilityRaw = formData.get("visibility") as string | null;
    const visibility: "public" | "private" =
      visibilityRaw === "public" ? "public" : "private";

    if (!file || !classId || file.size <= 0) {
      throw new ValidationError("Thiếu tệp hợp lệ hoặc ID lớp học (classId).");
    }

    const env = getServerEnv();
    const maxBytes = env.MAX_PDF_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new ValidationError(
        `Tệp vượt quá giới hạn dung lượng cho phép (${env.MAX_PDF_SIZE_MB} MB).`,
      );
    }

    const cls = await classroomService.getClassroomById(classId);
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { storedFile, attachment } =
      await storageService.uploadCurriculumAttachment({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        fileBuffer,
        classId: cls.id,
        classCode: cls.code,
        weekNumber,
        visibility,
        actorId: session.id,
        actorRole: session.role,
      });

    const updatedClass = await classroomService.addClassroomMaterial(
      cls.id,
      weekNumber,
      attachment,
    );
    return ok(
      { attachment, storedFile, classroom: updatedClass },
      { status: 201 },
    );
  }

  const body = (await readJson(request)) as {
    action?: string;
    classId?: string;
    weekNumber?: number;
    attachment?: CurriculumAttachment;
    assignments?: Array<{ classId: string; weekNumber: number }>;
    directUpload?: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storagePath: string;
      bucketName?: string | null;
      publicUrl?: string | null;
      cloudinaryPublicId?: string | null;
      provider?: "cloudinary" | "supabase" | "r2" | "s3" | "local";
      visibility?: "public" | "private";
    };
  };

  if (body?.action === "register-direct") {
    if (!body.classId || !body.directUpload) {
      throw new ValidationError("Thiếu thông tin lớp học hoặc tệp đã tải lên.");
    }
    const cls = await classroomService.getClassroomById(body.classId);
    const weekNumber = Number(body.weekNumber) || 1;
    const { storedFile, attachment } =
      await storageService.registerDirectCurriculumAttachment({
        ...body.directUpload,
        classId: cls.id,
        classCode: cls.code,
        weekNumber,
        visibility: body.directUpload.visibility ?? "private",
        actorId: session.id,
        actorRole: session.role,
      });
    const updatedClass = await classroomService.addClassroomMaterial(
      cls.id,
      weekNumber,
      attachment,
    );
    return ok(
      { attachment, storedFile, classroom: updatedClass },
      { status: 201 },
    );
  }

  if (body?.action === "assign") {
    if (!body.attachment) {
      throw new ValidationError("Thiếu thông tin tài liệu (attachment).");
    }
    const result = await classroomService.assignMaterialToClasses({
      attachment: body.attachment,
      assignments: body.assignments || [],
    });
    return ok(result, { status: 200 });
  }

  if (!body?.classId || !body?.attachment) {
    throw new ValidationError("Thiếu thông tin lớp học (classId) hoặc tài liệu.");
  }

  const updatedClass = await classroomService.addClassroomMaterial(
    body.classId,
    body.weekNumber || 1,
    body.attachment,
  );
  return ok(
    { attachment: body.attachment, classroom: updatedClass },
    { status: 201 },
  );
});

export const DELETE = adminRoute(async (request) => {
  const query = readQuery(request);
  const classId = query.classId;
  const weekNumber = Number(query.weekNumber) || 1;
  const attachmentId = query.attachmentId;
  const removeAll = query.removeAll === "true" || query.all === "true";

  if (!attachmentId) {
    throw new ValidationError("Thiếu attachmentId để xóa tài liệu.");
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
