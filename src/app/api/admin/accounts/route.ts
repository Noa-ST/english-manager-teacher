import { adminRoute, ok, readJson } from "@/lib/http";
import * as accountService from "@/services/account.service";
import { DomainError } from "@/services/errors";
import * as settingsService from "@/services/settings.service";

export const GET = adminRoute(async () => {
  const accounts = await accountService.listStudentAccounts();
  return ok(accounts);
});

export const POST = adminRoute(async (request, { session }) => {
  const body = await readJson(request);
  const created = await accountService.createStudentAccount(body);
  await settingsService.recordSettingsAuditLog({
    action: "CREATE_STUDENT_ACCOUNT",
    actorId: session.id,
    changedFields: ["studentAccount"],
    summary: `Cấp tài khoản học sinh cho ${created.studentCode} (${created.email ?? "N/A"}).`,
  });
  return ok(created, { status: 201 });
});

export const PATCH = adminRoute(async (request, { session }) => {
  const body = (await readJson(request)) as Record<string, unknown>;
  if (typeof body.isActive === "boolean") {
    const updated = await accountService.toggleStudentAccountActive(body);
    await settingsService.recordSettingsAuditLog({
      action: "TOGGLE_STUDENT_ACCOUNT",
      actorId: session.id,
      changedFields: ["isActive"],
      summary: `${updated.isActive ? "Mở khóa" : "Vô hiệu hóa"} tài khoản học sinh (${updated.profileId}).`,
    });
    return ok(updated);
  }
  if (typeof body.newPassword === "string") {
    const updated = await accountService.resetStudentPassword(body);
    await settingsService.recordSettingsAuditLog({
      action: "RESET_STUDENT_PASSWORD",
      actorId: session.id,
      changedFields: ["password"],
      summary: `Đặt lại mật khẩu tài khoản học sinh (${updated.profileId}) — đã ẩn mật khẩu mới.`,
    });
    return ok(updated);
  }
  throw new DomainError("VALIDATION_ERROR", "Hành động cập nhật tài khoản không hợp lệ.");
});
