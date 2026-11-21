import { ok, studentRoute } from "@/lib/http";
import { canAccessStudent } from "@/lib/rbac";
import { sanitizeClassroomRoadmapForStudent } from "@/services/classroom-helpers";
import * as classroomService from "@/services/classroom.service";
import type { CurriculumAttachment } from "@/services/domain-types";
import { ForbiddenError, NotFoundError } from "@/services/errors";
import * as storageService from "@/services/storage.service";
import * as studentService from "@/services/student.service";
import type { UserProfile } from "@/types";

/**
 * GET /api/student/materials/[fileId]
 * Verifies student enrollment in the classroom AND ensures the week is unlocked,
 * then returns a verified download/Signed URL.
 */
export const GET = studentRoute<{ params: Promise<{ fileId: string }> }>(
  async (request, context) => {
    const { session } = context;
    const { fileId } = await context.params;
    const url = new URL(request.url);
    const requestedStudentId = url.searchParams.get("studentId")?.trim();

    if (requestedStudentId) {
      const profileOverride: UserProfile = {
        id: session.id,
        email: session.label,
        fullName: session.fullName ?? session.label,
        avatarUrl: null,
        role: session.role,
        isActive: true,
        studentId: session.studentId ?? null,
        studentCode: session.studentCode ?? null,
      };
      const allowed = await canAccessStudent(requestedStudentId, profileOverride);
      if (!allowed) {
        throw new ForbiddenError(
          "Bạn không có quyền truy cập tài liệu học tập của học sinh khác.",
        );
      }
    }

    const targetKey = requestedStudentId || session.studentId || session.studentCode;
    if (!targetKey) {
      throw new NotFoundError("Học sinh liên kết tài khoản");
    }

    const student = await studentService.getStudentById(targetKey);
    if (student.status === "archived" || student.deletedAt) {
      throw new ForbiddenError("Hồ sơ học sinh đã được lưu trữ, không thể truy cập tài liệu.");
    }

    const allClasses = await classroomService.listAllClassrooms(true);
    const matchedClass = allClasses.find(
      (c) =>
        c.id === student.classId ||
        c.code.toUpperCase() === student.classId.toUpperCase() ||
        c.name.toLowerCase() === student.className.toLowerCase(),
    );
    if (!matchedClass) {
      throw new NotFoundError("Classroom", student.classId);
    }

    let matchedAttachment: CurriculumAttachment | undefined;
    if (session.role === "admin") {
      for (const week of matchedClass.curriculum ?? []) {
        const hit = week.attachments?.find(
          (a) => a.id === fileId || a.storedFileId === fileId,
        );
        if (hit) {
          matchedAttachment = hit;
          break;
        }
      }
    } else {
      const roadmap = sanitizeClassroomRoadmapForStudent(matchedClass);
      for (const week of roadmap.weeks) {
        if (week.isLocked) continue;
        const hit = week.attachments.find(
          (a) => a.id === fileId || a.storedFileId === fileId,
        );
        if (hit) {
          matchedAttachment = hit;
          break;
        }
      }
    }

    if (!matchedAttachment) {
      throw new ForbiddenError(
        "Tài liệu này không thuộc lớp học của bạn hoặc tuần học chưa được mở khóa.",
      );
    }

    const storedId = matchedAttachment.storedFileId;
    if (storedId) {
      const storedRecord = await storageService.findStoredFileById(storedId);
      if (storedRecord) {
        if (storedRecord.isPublic && storedRecord.publicUrl) {
          return ok({
            url: storedRecord.publicUrl,
            expiresInSeconds: null,
            fileName: matchedAttachment.name,
          });
        }
        const signed = await storageService.getSignedFileUrl({
          fileId: storedRecord.id,
          actorId: session.id,
          actorRole: session.role,
          downloadName: matchedAttachment.name,
        });
        return ok({
          url: signed.url,
          expiresInSeconds: signed.expiresInSeconds,
          fileName: matchedAttachment.name,
        });
      }
    }

    return ok({
      url: matchedAttachment.url,
      expiresInSeconds: null,
      fileName: matchedAttachment.name,
    });
  },
);
