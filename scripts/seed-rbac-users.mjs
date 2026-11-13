import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
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

loadEnv();

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env");
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const usersToSeed = [
  {
    email: process.env.DEV_ADMIN_EMAIL || "teacher@example.com",
    password: process.env.DEV_ADMIN_PASSWORD,
    fullName: "ThS. Nguyễn Minh Anh",
    appMetadata: {
      role: "admin",
      is_active: true,
    },
  },
  {
    email: process.env.DEV_STUDENT_EMAIL || "student1@example.com",
    password: process.env.DEV_STUDENT_PASSWORD,
    fullName: "Trần Bảo Ngọc",
    appMetadata: {
      role: "student",
      student_id: "stu-01",
      student_code: "HS-2026-01",
      is_active: true,
    },
  },
  {
    email: process.env.DEV_STUDENT2_EMAIL || "student2@example.com",
    password: process.env.DEV_STUDENT2_PASSWORD,
    fullName: "Lê Hoàng Minh Khôi",
    appMetadata: {
      role: "student",
      student_id: "stu-02",
      student_code: "HS-2026-02",
      is_active: true,
    },
  },
];

async function run() {
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    console.error("Failed to list users:", listErr.message);
    process.exit(1);
  }

  for (const spec of usersToSeed) {
    if (!spec.password) {
      console.error(`Missing password in .env for ${spec.email}`);
      process.exit(1);
    }
    const existing = listData.users.find(
      (u) => u.email?.toLowerCase() === spec.email.toLowerCase(),
    );
    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password: spec.password,
        email_confirm: true,
        ban_duration: "none",
        app_metadata: spec.appMetadata,
        user_metadata: { full_name: spec.fullName },
      });
      if (error) {
        console.error(`Failed updating ${spec.email}:`, error.message);
        process.exit(1);
      }
      console.log(`Updated Supabase Auth user: ${spec.email} (${spec.appMetadata.role}) id=${existing.id}`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: spec.email,
        password: spec.password,
        email_confirm: true,
        app_metadata: spec.appMetadata,
        user_metadata: { full_name: spec.fullName },
      });
      if (error) {
        console.error(`Failed creating ${spec.email}:`, error.message);
        process.exit(1);
      }
      console.log(`Created Supabase Auth user: ${spec.email} (${spec.appMetadata.role}) id=${data.user.id}`);
    }
  }
}

run();

