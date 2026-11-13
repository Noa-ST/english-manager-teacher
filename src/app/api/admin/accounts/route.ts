import { adminRoute, ok, readJson } from "@/lib/http";
import * as accountService from "@/services/account.service";
import { DomainError } from "@/services/errors";

export const GET = adminRoute(async () => {
  const accounts = await accountService.listStudentAccounts();
  return ok(accounts);
});

export const POST = adminRoute(async (request) => {
  const body = await readJson(request);
  const created = await accountService.createStudentAccount(body);
  return ok(created, { status: 201 });
});

export const PATCH = adminRoute(async (request) => {
  const body = (await readJson(request)) as Record<string, unknown>;
  if (typeof body.isActive === "boolean") {
    const updated = await accountService.toggleStudentAccountActive(body);
    return ok(updated);
  }
  if (typeof body.newPassword === "string") {
    const updated = await accountService.resetStudentPassword(body);
    return ok(updated);
  }
  throw new DomainError("VALIDATION_ERROR", "Hành động cập nhật tài khoản không hợp lệ.");
});

