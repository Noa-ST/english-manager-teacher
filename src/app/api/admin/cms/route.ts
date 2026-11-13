import { adminRoute, ok, readJson, readQuery } from "@/lib/http";
import * as cmsService from "@/services/cms.service";
import * as podcastService from "@/services/podcast.service";
import * as storageService from "@/services/storage.service";

export const GET = adminRoute(async () => {
  const [announcements, podcastsPage, hallOfFame, projects, resources] =
    await Promise.all([
      cmsService.listAnnouncements({ includeDrafts: true }),
      podcastService.listPodcasts({ includeDrafts: true, page: 1, pageSize: 50 }),
      cmsService.listHallOfFame(),
      cmsService.listStudentProjects(),
      storageService.listResourceFiles({ publicOnly: false }),
    ]);

  return ok({
    announcements,
    podcasts: podcastsPage.items,
    hallOfFame,
    projects,
    resources,
  });
});

export const POST = adminRoute(async (request) => {
  const body = (await readJson(request)) as {
    module: "announcements" | "podcasts" | "hall-of-fame" | "projects";
    payload: unknown;
  };

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
    case "projects": {
      const created = await cmsService.createStudentProject(body.payload);
      return ok(created, { status: 201 });
    }
  }
});

export const PATCH = adminRoute(async (request) => {
  const body = (await readJson(request)) as {
    module: "announcements" | "podcasts";
    id: string;
    payload: unknown;
  };

  if (body.module === "podcasts") {
    const updated = await podcastService.updatePodcast(body.id, body.payload);
    return ok(updated);
  }
  const updated = await cmsService.updateAnnouncement(body.id, body.payload);
  return ok(updated);
});

export const DELETE = adminRoute(async (request) => {
  const query = readQuery(request);
  const { module, id } = query;

  if (module === "podcasts") {
    await podcastService.deletePodcast(id);
  } else if (module === "hall-of-fame") {
    await cmsService.deleteHallOfFameEntry(id);
  } else if (module === "projects") {
    await cmsService.deleteStudentProject(id);
  } else {
    await cmsService.deleteAnnouncement(id);
  }

  return ok({ deleted: true });
});

