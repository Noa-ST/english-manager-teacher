import { apiRequest } from "@/lib/api-client";

export interface DirectUploadPayload {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  bucketName: string | null;
  publicUrl: string | null;
  cloudinaryPublicId: string | null;
  provider: "cloudinary" | "supabase" | "r2" | "s3" | "local";
  visibility: "public" | "private";
}

interface UploadTicketResponse {
  key: string;
  provider: "cloudinary" | "supabase" | "r2" | "s3" | "local";
  method: "POST" | "PUT";
  uploadUrl: string;
  headers: Record<string, string>;
  formFields?: Record<string, string>;
  bucketName: string | null;
  storagePath: string;
  cloudinaryPublicId: string | null;
  publicUrl: string | null;
}

function inferCurriculumMime(file: File): string {
  if (file.type && file.type.trim().length > 0) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

/**
 * Uploads a curriculum/session attachment directly from the browser to
 * Supabase Storage or Cloudinary via a signed upload ticket, completely
 * bypassing Vercel's 4.5 MB Serverless Function request body limit.
 */
export async function uploadCurriculumFileDirect(
  file: File,
  visibility: "public" | "private",
): Promise<DirectUploadPayload> {
  const mimeType = inferCurriculumMime(file);
  const isImage = mimeType.startsWith("image/");
  const isAudio = mimeType.startsWith("audio/");

  const ticket = await apiRequest<UploadTicketResponse>(
    "/api/admin/storage/upload-url",
    {
      method: "POST",
      body: JSON.stringify({
        folder: isImage ? "resources" : isAudio ? "podcasts" : "documents",
        fileName: file.name,
        contentType: mimeType,
        size: file.size,
        visibility: isImage ? "public" : visibility,
        imageCategory: isImage ? "resource" : undefined,
      }),
    },
  );

  let resolvedPublicUrl = ticket.publicUrl;
  let resolvedCloudinaryPublicId = ticket.cloudinaryPublicId;

  if (ticket.uploadUrl && ticket.provider !== "local") {
    if (ticket.method === "POST" && ticket.formFields) {
      const form = new FormData();
      Object.entries(ticket.formFields).forEach(([k, v]) => form.append(k, v));
      form.append("file", file);
      const res = await fetch(ticket.uploadUrl, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error(`Tải ảnh lên Cloudinary thất bại (HTTP ${res.status}).`);
      }
      const uploadedJson = (await res.json().catch(() => null)) as {
        secure_url?: string;
        public_id?: string;
      } | null;
      if (uploadedJson?.secure_url) resolvedPublicUrl = uploadedJson.secure_url;
      if (uploadedJson?.public_id) resolvedCloudinaryPublicId = uploadedJson.public_id;
    } else {
      const res = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: ticket.headers,
        body: file,
      });
      if (!res.ok) {
        throw new Error(`Tải tệp lên Supabase Storage thất bại (HTTP ${res.status}).`);
      }
    }
  }

  return {
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    storagePath: ticket.storagePath,
    bucketName: ticket.bucketName,
    publicUrl: resolvedPublicUrl,
    cloudinaryPublicId: resolvedCloudinaryPublicId,
    provider: ticket.provider,
    visibility: isImage ? "public" : visibility,
  };
}
