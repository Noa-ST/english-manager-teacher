import type { ErrorCode } from "@/types/api";

/**
 * Domain errors — the ONLY way services report failure.
 *
 * Services never know about HTTP. The transport layer (src/lib/http.ts for
 * Route Handlers, or Server Actions) translates these into status codes /
 * UI state. Swapping Next.js for another framework only requires a new
 * translator, not touching business logic.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends DomainError {
  constructor(message = "Invalid input", details?: unknown) {
    super("VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have access to this resource") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super("NOT_FOUND", id ? `${resource} "${id}" not found` : `${resource} not found`);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}

export class TooManyRequestsError extends DomainError {
  constructor(message = "Bạn đã thực hiện quá nhiều yêu cầu. Vui lòng thử lại sau.") {
    super("TOO_MANY_REQUESTS", message);
  }
}

/** Placeholder for scaffolded operations awaiting implementation. */
export class NotImplementedError extends DomainError {
  constructor(operation: string) {
    super("NOT_IMPLEMENTED", `Operation "${operation}" is not implemented yet`);
  }
}

