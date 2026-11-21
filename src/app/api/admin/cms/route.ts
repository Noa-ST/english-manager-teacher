import { z } from "zod";

import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as classroomService from "@/services/classroom.service";
import * as cmsService from "@/services/cms.service";
import { validate } from "@/services/common";
import { ValidationError } from "@/services/errors";
import * as podcastService from "@/services/podcast.service";
import * as settingsService from "@/services/settings.service";
import * as storageService from "@/services/storage.service";
import * as studentService from "@/services/student.service";

const hofSwapSchema = z.object({
  periodLabel: z.string().trim().min(1),
  rankA: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  rankB: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

const projectApproveSchema = z.object({
  id: z.string().trim().min(1),
  feedback: z
    .object({
      keyTakeaway: z.string().trim().max(1000).optional(),
      featuredMetric: z.string().trim().max(80).optional(),
    })
    .optional(),
});

const resourceToggleSchema = z.object({
  id: z.string().trim().min(1),
});

export const GET = adminRoute(async () => {
  const [
    announcements,
    podcastsPage,
    hallOfFame,
    projects,
    resources,
    folders,
    classrooms,
    students,
    teacherBrand,
  ] = await Promise.all([
    cmsService.listAnnouncements({ includeDrafts: true }),
    podcastService.listPodcasts({ includeDrafts: true, page: 1, pageSize: 100 }),
    cmsService.listHallOfFame(),
    cmsService.listStudentProjects({ includeDrafts: true }),
    storageService.listResourceFiles({ publicOnly: false }),
    storageService.listResourceFolders(),
    classroomService.listClassrooms(),
    studentService.listAllStudents({ status: "non-archived" }),
    settingsService.getTeacherBrandProfile(),
  ]);

  return ok({
    announcements,
    podcasts: podcastsPage.items,
    hallOfFame,
    projects,
    resources,
    folders,
    classrooms,
    students,
    teacherBrand,
  });
});

export const POST = adminRoute(async (request) => {
  const body = (await readJson(request)) as {
    module?: string;
    payload?: unknown;
  };

  if (!body || typeof body !== "object") {
    throw new ValidationError("Payload CMS không hợp lệ.");
  }

  switch (body.module) {
    case "announcements": {
      const created = await cmsService.createAnnouncement(body.payload);
      return ok(created, { status: 201 });
    }
    case "podcasts": {
      const created = await podcastService.createPodcast(body.payload);
      return ok(created, { status: 201 });
    }
    case "hall-of-fame": {
      const created = await cmsService.createHallOfFameEntry(body.payload);
      return ok(created, { status: 201 });
    }
    case "hall-of-fame-swap": {
      const p = validate(hofSwapSchema, body.payload);
      const list = await cmsService.swapPodiumRanks(
        p.periodLabel,
        p.rankA,
        p.rankB,
      );
      return ok(list);
    }
    case "hall-of-fame-recommend": {
      const recs = await cmsService.recommendTop3Students();
      return ok(recs);
    }
    case "projects": {
      const created = await cmsService.createStudentProject(body.payload);
      return ok(created, { status: 201 });
    }
    case "projects-approve": {
      const p = validate(projectApproveSchema, body.payload);
      const approved = await cmsService.approveStudentProject(p.id, p.feedback);
      return ok(approved);
    }
    case "resources": {
      const created = await storageService.createResourceFile(body.payload);
      return ok(created, { status: 201 });
    }
    case "resources-toggle-visibility": {
      const p = validate(resourceToggleSchema, body.payload);
      const updated = await storageService.toggleResourceFileVisibility(p.id);
      return ok(updated);
    }
    default: {
      throw new ValidationError("Phân hệ CMS không hợp lệ");
    }
  }
});

export const PATCH = adminRoute(async (request, { session }) => {
  const body = (await readJson(request)) as {
    module?: string;
    id?: string;
    payload?: unknown;
  };

  if (!body || typeof body !== "object") {
    throw new ValidationError("Payload CMS không hợp lệ.");
  }

  switch (body.module) {
    case "brand": {
      await settingsService.updateSystemSettings(body.payload, session.id);
      return ok(await settingsService.getTeacherBrandProfile());
    }
    case "podcasts": {
      const updated = await podcastService.updatePodcast(body.id, body.payload);
      return ok(updated);
    }
    case "projects": {
      const updated = await cmsService.updateStudentProject(body.id, body.payload);
      return ok(updated);
    }
    case "hall-of-fame": {
      const updated = await cmsService.updateHallOfFameEntry(body.id, body.payload);
      return ok(updated);
    }
    case "resources": {
      const updated = await storageService.updateResourceFile(body.id, body.payload, session.id);
      return ok(updated);
    }
    case "announcements": {
      const updated = await cmsService.updateAnnouncement(body.id, body.payload);
      return ok(updated);
    }
    default: {
      throw new ValidationError("Phân hệ CMS cần cập nhật không hợp lệ.");
    }
  }
});

export const DELETE = adminRoute(async (request) => {
  const query = readQuery(request);
  const { module: mod, id } = query;

  switch (mod) {
    case "podcasts":
      await podcastService.deletePodcast(id);
      break;
    case "hall-of-fame":
      await cmsService.deleteHallOfFameEntry(id);
      break;
    case "projects":
      await cmsService.deleteStudentProject(id);
      break;
    case "resources":
      await storageService.deleteResourceFile(id);
      break;
    case "announcements":
    case undefined:
      await cmsService.deleteAnnouncement(id);
      break;
    default:
      throw new ValidationError("Phân hệ CMS cần xóa không hợp lệ.");
  }

  return ok({ deleted: true });
});

