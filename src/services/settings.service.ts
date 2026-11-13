import { z } from "zod";

import { validate } from "./common";
import { getRuntimeStore, type SystemSettingsState } from "./runtime-store";

export const updateSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  slogan: z.string().trim().min(1).max(240).optional(),
  shortBio: z.string().trim().max(1500).optional(),
  officeHours: z.string().trim().max(160).optional(),
  location: z.string().trim().max(200).optional(),
  currentTerm: z.string().trim().max(120).optional(),
  defaultPortalPin: z.string().trim().min(4).max(32).optional(),
  autoNotifyParents: z.boolean().optional(),
  presignedExpirySeconds: z.coerce.number().int().min(60).max(86400).optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export async function getSystemSettings(): Promise<SystemSettingsState> {
  return getRuntimeStore().settings;
}

export async function updateSystemSettings(
  input: unknown,
): Promise<SystemSettingsState> {
  const data = validate(updateSettingsSchema, input);
  const store = getRuntimeStore();

  store.settings = {
    ...store.settings,
    ...data,
  };

  return store.settings;
}

