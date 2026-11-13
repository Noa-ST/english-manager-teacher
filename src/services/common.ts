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

