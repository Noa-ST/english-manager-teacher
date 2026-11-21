import { z } from "zod";

import { ValidationError } from "./errors";

/**
 * Shared service-layer helpers.
 *
 * Services are the trust boundary: every public service function receives
 * `unknown` input from its caller and validates it here, regardless of
 * whether the caller is a Route Handler, a Server Action, a CLI script or a
 * test. Never trust the transport layer to have validated anything.
 */
export function validate<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Invalid input", z.flattenError(result.error));
  }
  return result.data;
}

export const idSchema = z.string().trim().min(1).max(64);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.input<typeof paginationSchema>;

/** Checks whether an internal redirect path is single-slash relative (prevents //evil.com open redirect). */
export function isSafeRelativeRedirect(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return false;
  return !/[\u0000-\u001f\u007f]/.test(trimmed);
}

/** Checks whether a URL is safe http(s):// or single-slash relative /path (blocks javascript:, data:, vbscript:, //). */
export function isSafeHttpOrRelativeUrl(
  raw: string | null | undefined,
  options?: { allowMailtoTel?: boolean; allowHashPlaceholder?: string },
): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return false;
  if (options?.allowHashPlaceholder && trimmed === options.allowHashPlaceholder) {
    return true;
  }
  if (trimmed.startsWith("/")) {
    return isSafeRelativeRedirect(trimmed);
  }
  if (options?.allowMailtoTel && /^(mailto|tel):[^\s]+$/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export const safeUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine(
    (val) => isSafeHttpOrRelativeUrl(val),
    "URL không hợp lệ hoặc chứa giao thức không an toàn (chỉ chấp nhận http/https hoặc đường dẫn nội bộ).",
  );

export const optionalSafeUrlSchema = z
  .string()
  .trim()
  .max(1024)
  .refine(
    (val) => val === "" || isSafeHttpOrRelativeUrl(val),
    "URL không hợp lệ hoặc chứa giao thức không an toàn.",
  )
  .nullish();

/** Normalizes YYYY-MM-DD or DD/MM/YYYY to calendar-validated YYYY-MM-DD; returns null if invalid. */
export function normalizeDateToIso(raw: string): string | null {
  const trimmed = raw.trim();
  let year: number;
  let month: number;
  let day: number;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const viMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (isoMatch) {
    year = Number.parseInt(isoMatch[1], 10);
    month = Number.parseInt(isoMatch[2], 10);
    day = Number.parseInt(isoMatch[3], 10);
  } else if (viMatch) {
    day = Number.parseInt(viMatch[1], 10);
    month = Number.parseInt(viMatch[2], 10);
    year = Number.parseInt(viMatch[3], 10);
  } else {
    return null;
  }

  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

