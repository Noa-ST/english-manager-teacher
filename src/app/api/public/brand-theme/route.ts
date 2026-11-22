import { ok } from "@/lib/http";
import * as settingsService from "@/services/settings.service";

export async function GET() {
  try {
    const brandTheme = await settingsService.getPublicBrandTheme();
    return ok({ brandTheme });
  } catch {
    return ok({ brandTheme: null });
  }
}
