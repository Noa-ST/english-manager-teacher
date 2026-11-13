import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

function loadEnvFile() {
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

loadEnvFile();

const PORT = 3199;
const BASE_URL = process.env.TEST_BASE_URL || `http://127.0.0.1:${PORT}`;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
const ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL || "teacher@example.com";
const ADMIN_PASSWORD = process.env.DEV_ADMIN_PASSWORD || "";
const STUDENT1_EMAIL = process.env.DEV_STUDENT_EMAIL || "student1@example.com";
const STUDENT1_PASSWORD = process.env.DEV_STUDENT_PASSWORD || "";

class CookieJar {
  private cookies = new Map<string, string>();

  updateFromResponse(res: Response) {
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];
    for (const raw of setCookies) {
      const firstPart = raw.split(";")[0];
      const eq = firstPart.indexOf("=");
      if (eq === -1) continue;
      const name = firstPart.slice(0, eq).trim();
      const val = firstPart.slice(eq + 1).trim();
      if (!val) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, val);
      }
    }
  }

  headerValue(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

async function fetchWithJar(
  jar: CookieJar,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.headerValue();
  if (cookie) headers.set("cookie", cookie);
  const res = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers,
    redirect: "manual",
  });
  jar.updateFromResponse(res);
  return res;
}

let serverProc: ReturnType<typeof spawn> | null = null;

before(async () => {
  if (process.env.TEST_BASE_URL) return;
  const isWin = process.platform === "win32";
  serverProc = spawn(
    isWin ? "npx.cmd" : "npx",
    ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
      shell: isWin,
    },
  );

  // Wait for server readiness
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/login`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(`Next.js server did not become ready on ${BASE_URL}`);
});

after(() => {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
});

test("Supabase Auth: student cannot self-escalate app_metadata.role via user_metadata", async () => {
  assert.ok(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY, "Supabase env vars required");
  assert.ok(STUDENT1_PASSWORD, "DEV_STUDENT_PASSWORD required");

  const signInRes = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: STUDENT1_EMAIL,
        password: STUDENT1_PASSWORD,
      }),
    },
  );
  assert.equal(signInRes.status, 200);
  const signInJson = (await signInRes.json()) as {
    access_token: string;
    user: { app_metadata?: Record<string, unknown> };
  };
  assert.equal(signInJson.user.app_metadata?.role, "student");

  // Attempt privilege escalation via user-editable metadata
  const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${signInJson.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      data: { role: "admin", is_active: true },
    }),
  });
  assert.equal(updateRes.status, 200);
  const updateJson = (await updateRes.json()) as {
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
  // app_metadata MUST remain "student", untouched by user_metadata
  assert.equal(updateJson.app_metadata?.role, "student");
  assert.equal(updateJson.app_metadata?.student_id, "stu-01");
});

test("Unauthenticated requests are blocked (401 on APIs, 307 to /login on protected pages)", async () => {
  const jar = new CookieJar();

  const adminApi = await fetchWithJar(jar, "/api/admin/accounts");
  assert.equal(adminApi.status, 401);

  const studentApi = await fetchWithJar(jar, "/api/student/me");
  assert.equal(studentApi.status, 401);

  const verifyApi = await fetchWithJar(jar, "/api/viewer/student-portal/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentCode: "HS-2026-01", accessKey: "123456" }),
  });
  assert.equal(verifyApi.status, 401);

  const dashboardPage = await fetchWithJar(jar, "/dashboard");
  assert.equal(dashboardPage.status, 307);
  assert.match(dashboardPage.headers.get("location") ?? "", /\/login/);

  const studentPage = await fetchWithJar(jar, "/student");
  assert.equal(studentPage.status, 307);
  assert.match(studentPage.headers.get("location") ?? "", /\/login/);
});

test("Wrong password login returns 401", async () => {
  const jar = new CookieJar();
  const res = await fetchWithJar(jar, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: STUDENT1_EMAIL,
      password: "WrongPassword!999",
    }),
  });
  assert.equal(res.status, 401);
});

test("STUDENT role: accesses own data, blocked from other students (403) and ADMIN routes (403/redirect)", async () => {
  assert.ok(STUDENT1_PASSWORD, "DEV_STUDENT_PASSWORD required");
  const jar = new CookieJar();

  // 1. Login as Student 1 (stu-1 / HS-2026-01)
  const loginRes = await fetchWithJar(jar, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: STUDENT1_EMAIL,
      password: STUDENT1_PASSWORD,
    }),
  });
  assert.equal(loginRes.status, 200);
  const loginJson = (await loginRes.json()) as {
    ok: boolean;
    data: { user: { role: string; studentId?: string }; redirectTo: string };
  };
  assert.equal(loginJson.ok, true);
  assert.equal(loginJson.data.user.role, "student");
  assert.equal(loginJson.data.redirectTo, "/student");

  // 2. /api/auth/me confirms student session
  const meRes = await fetchWithJar(jar, "/api/auth/me");
  assert.equal(meRes.status, 200);
  const meJson = (await meRes.json()) as {
    ok: boolean;
    data: { user: { role: string; studentId?: string } };
  };
  assert.equal(meJson.ok, true);
  assert.equal(meJson.data.user.role, "student");
  assert.equal(meJson.data.user.studentId, "stu-01");

  // 3. Can read own student data
  const ownDataRes = await fetchWithJar(jar, "/api/student/me");
  assert.equal(ownDataRes.status, 200);
  const ownDataJson = (await ownDataRes.json()) as {
    ok: boolean;
    data: { student: { id: string; code: string } };
  };
  assert.equal(ownDataJson.data.student.id, "stu-01");
  assert.equal(ownDataJson.data.student.code, "HS-2026-01");

  // 4. Cannot read Student 2's data (403 Forbidden)
  const crossStudentRes = await fetchWithJar(
    jar,
    "/api/student/me?studentId=stu-02",
  );
  assert.equal(crossStudentRes.status, 403);

  const crossVerifyRes = await fetchWithJar(
    jar,
    "/api/viewer/student-portal/verify",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentCode: "HS-2026-02", accessKey: "123456" }),
    },
  );
  assert.equal(crossVerifyRes.status, 403);

  // 5. Cannot access ADMIN APIs (403 Forbidden)
  const adminAccountsRes = await fetchWithJar(jar, "/api/admin/accounts");
  assert.equal(adminAccountsRes.status, 403);

  const createAccRes = await fetchWithJar(jar, "/api/admin/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      studentId: "stu-3",
      email: "hacker@example.com",
      password: "Password123!",
    }),
  });
  assert.equal(createAccRes.status, 403);

  // 6. Accessing /dashboard redirects student back to /student
  const adminPageRes = await fetchWithJar(jar, "/dashboard");
  assert.equal(adminPageRes.status, 307);
  assert.match(adminPageRes.headers.get("location") ?? "", /\/student/);

  // 7. Logout clears session
  const logoutRes = await fetchWithJar(jar, "/api/auth/logout", {
    method: "POST",
  });
  assert.equal(logoutRes.status, 200);

  const afterLogoutMe = await fetchWithJar(jar, "/api/auth/me");
  assert.equal(afterLogoutMe.status, 401);
});

test("ADMIN role: accesses /dashboard, /api/admin/accounts, and can preview any student", async () => {
  assert.ok(ADMIN_PASSWORD, "DEV_ADMIN_PASSWORD required");
  const jar = new CookieJar();

  const loginRes = await fetchWithJar(jar, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });
  assert.equal(loginRes.status, 200);
  const loginJson = (await loginRes.json()) as {
    ok: boolean;
    data: { user: { role: string }; redirectTo: string };
  };
  assert.equal(loginJson.data.user.role, "admin");
  assert.equal(loginJson.data.redirectTo, "/dashboard");

  const accountsRes = await fetchWithJar(jar, "/api/admin/accounts");
  assert.equal(accountsRes.status, 200);

  const dashboardRes = await fetchWithJar(jar, "/dashboard");
  assert.equal(dashboardRes.status, 200);

  const previewStudentRes = await fetchWithJar(
    jar,
    "/api/student/me?studentId=stu-02",
  );
  assert.equal(previewStudentRes.status, 200);
  const previewJson = (await previewStudentRes.json()) as {
    data: { student: { id: string } };
  };
  assert.equal(previewJson.data.student.id, "stu-02");
});

