import { adminRoute, ok, readJson } from "@/lib/http";
import { ValidationError } from "@/services/errors";
import * as settingsService from "@/services/settings.service";
import * as storageService from "@/services/storage.service";

async function buildSettingsPayload() {
  const [settings, health, auditLogs] = await Promise.all([
    settingsService.getSystemSettings(),
    settingsService.getSystemHealthSummary(),
    settingsService.listSettingsAuditLogs(50),
  ]);
  return {
    ...settings,
    storageStatus: storageService.getStorageStatus(),
    health,
    auditLogs,
  };
}

export const GET = adminRoute(async () => {
  return ok(await buildSettingsPayload());
});

export const PUT = adminRoute(async (request, { session }) => {
  await settingsService.updateSystemSettings(
    await readJson(request),
    session.id,
  );
  return ok(await buildSettingsPayload());
});

export const POST = adminRoute(async (request, { session }) => {
  const body = (await readJson(request)) as { action?: string };

  if (body.action === "reset") {
    await settingsService.resetSystemSettings(session.id);
    return ok(await buildSettingsPayload());
  }

  if (body.action === "exportSnapshot") {
    const snapshot = await settingsService.exportSystemSnapshot(session.id);
    return ok({
      snapshot,
      auditLogs: await settingsService.listSettingsAuditLogs(50),
    });
  }

  throw new ValidationError("Hành động cài đặt không hợp lệ.");
});
