import { getServerEnv } from "@/lib/env";
import { adminRoute, ok } from "@/lib/http";
import type { SessionAttachment } from "@/services/classroom-data";
import { ValidationError } from "@/services/errors";
import * as storageService from "@/services/storage.service";
import * as teachingJournalService from "@/services/teaching-journal.service";

const CURRICULUM_TO_SESSION_TYPE: Record<string, SessionAttachment["type"]> = {
  PDF: "PDF",
  SLIDE: "SLIDE",
  IMAGE: "IMAGE",
  DOCX: "DOCX",
  WORKSHEET: "WORKSHEET",
  AUDIO: "AUDIO",
};

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const { id } = await context.params;
    const session = await teachingJournalService.getClassSessionById(id);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ValidationError("Dữ liệu tải tệp phải sử dụng multipart/form-data.");
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      throw new ValidationError("Vui lòng chọn tệp đính kèm hợp lệ.");
    }

    const env = getServerEnv();
    const maxBytes = env.MAX_PDF_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new ValidationError(
        `Tệp đính kèm vượt quá giới hạn dung lượng (${env.MAX_PDF_SIZE_MB} MB).`,
      );
    }

    const visibilityRaw = formData.get("visibility");
    const visibility = visibilityRaw === "private" ? "private" : "public";
    const buffer = new Uint8Array(await file.arrayBuffer());

    const { storedFile, attachment } = await storageService.uploadCurriculumAttachment({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      fileBuffer: buffer,
      classId: session.classId,
      classCode: session.classCode,
      weekNumber: session.weekNumber,
      visibility,
      actorId: context.session.id || "admin",
      actorRole: context.session.role,
    });

    const sessionAttachment: SessionAttachment = {
      id: attachment.id,
      storedFileId: attachment.storedFileId ?? storedFile.id,
      name: attachment.name,
      type: CURRICULUM_TO_SESSION_TYPE[attachment.type] ?? "PDF",
      size: attachment.size,
      url: attachment.url,
      uploadedAt: attachment.uploadedAt,
    };

    const updatedSession = await teachingJournalService.addSessionAttachment(
      id,
      sessionAttachment,
    );

    return ok(
      {
        session: updatedSession,
        attachment: sessionAttachment,
      },
      { status: 201 },
    );
  },
);
