/**
 * Production CLI helper: Create or promote a Teacher (Admin) account.
 *
 * Syncs BOTH:
 *   1. Supabase Auth (`auth.users` + server-only `app_metadata: { role: "admin", is_active: true }`)
 *   2. PostgreSQL `public.profiles` (`role = 'admin'`, `is_active = true`)
 *
 * Usage:
 *   node scripts/create-admin.mjs --email "teacher@domain.com" --password "StrongPassword@2026" --name "ThS. Tên Giáo Viên"
 *   npm run admin:create -- --email "teacher@domain.com" --password "StrongPassword@2026" --name "ThS. Tên Giáo Viên"
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvIfPresent() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email" || arg === "-e") {
      result.email = argv[i + 1];
      i += 1;
    } else if (arg === "--password" || arg === "-p") {
      result.password = argv[i + 1];
      i += 1;
    } else if (arg === "--name" || arg === "-n") {
      result.name = argv[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }
  return result;
}

function printUsage() {
  console.log(`
English Manager — Khởi tạo tài khoản Giáo viên (Admin)

Cách dùng:
  node scripts/create-admin.mjs --email "<email>" --password "<mat-khau>" --name "<ho-ten>"

Hoặc qua npm:
  npm run admin:create -- --email "teacher@domain.com" --password "MatKhauManh@2026" --name "ThS. Trần Diễm Hưng"

Yêu cầu biến môi trường (.env hoặc shell):
  - SUPABASE_URL
  - SUPABASE_SECRET_KEY
`);
}

loadEnvIfPresent();

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}

const email = (args.email || "").trim().toLowerCase();
const password = args.password || "";
const fullName = (args.name || "Giáo viên Quản trị").trim();

if (!email || !email.includes("@")) {
  console.error("❌ Thiếu hoặc sai định dạng --email.");
  printUsage();
  process.exit(1);
}

if (password.length < 8) {
  console.error("❌ Mật khẩu (--password) phải có ít nhất 8 ký tự.");
  process.exit(1);
}

const url = process.env.SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !secretKey) {
  console.error("❌ Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env / môi trường.");
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  // 1. Find existing auth user (paginated lookup up to 1000 users)
  let existingUser = null;
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("❌ Không thể đọc danh sách người dùng Supabase Auth:", error.message);
      process.exit(1);
    }
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      existingUser = found;
      break;
    }
    if (data.users.length < 200) break;
  }

  let userId = "";
  const appMetadata = {
    role: "admin",
    is_active: true,
    full_name: fullName,
  };

  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      ban_duration: "none",
      app_metadata: appMetadata,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      console.error("❌ Cập nhật tài khoản Supabase Auth thất bại:", error?.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`✅ Đã cập nhật tài khoản Admin trên Supabase Auth: ${email} (id=${userId})`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      console.error("❌ Tạo tài khoản Supabase Auth thất bại:", error?.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`✅ Đã tạo mới tài khoản Admin trên Supabase Auth: ${email} (id=${userId})`);
  }

  // 2. Sync to public.profiles so DB-backed RBAC matches immediately
  const nowIso = new Date().toISOString();
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role: "admin",
      is_active: true,
      updated_at: nowIso,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.warn(
      `⚠️ Đã tạo Supabase Auth user nhưng chưa ghi được vào bảng public.profiles (${profileError.message}).`,
    );
    console.warn("   Hệ thống vẫn nhận quyền admin qua app_metadata; bạn nên chạy `npm run db:push` rồi chạy lại script này.");
  } else {
    console.log(`✅ Đã đồng bộ hồ sơ Admin vào bảng public.profiles.`);
  }

  console.log(`\n🎉 Hoàn tất! Giáo viên có thể đăng nhập tại /login với email: ${email}`);
}

run().catch((err) => {
  console.error("❌ Lỗi không mong muốn:", err instanceof Error ? err.message : err);
  process.exit(1);
});
