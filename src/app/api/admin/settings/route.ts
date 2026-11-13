import { adminRoute, ok, readJson } from "@/lib/http";
import * as settingsService from "@/services/settings.service";

export const GET = adminRoute(async () => {
  const settings = await settingsService.getSystemSettings();
  return ok(settings);
});

export const PUT = adminRoute(async (request) => {
  const updated = await settingsService.updateSystemSettings(
    await readJson(request),
  );
  return ok(updated);
});

