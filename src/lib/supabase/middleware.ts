import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";

/**
 * Refreshes the Supabase SSR session cookie on incoming requests inside `src/proxy.ts`.
 * Returns the updated NextResponse and the authenticated Supabase User (if any).
 */
export async function updateSupabaseSession(
  request: NextRequest,
  extraRequestHeaders?: Record<string, string>,
): Promise<{
  response: NextResponse;
  user: User | null;
}> {
  const buildRequestHeaders = () => {
    const requestHeaders = new Headers(request.headers);
    if (extraRequestHeaders) {
      for (const [key, value] of Object.entries(extraRequestHeaders)) {
        requestHeaders.set(key, value);
      }
    }
    const serializedCookies = request.cookies.toString();
    if (serializedCookies) {
      requestHeaders.set("cookie", serializedCookies);
    }
    return requestHeaders;
  };

  let response = NextResponse.next({
    request: { headers: buildRequestHeaders() },
  });

  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { response, user: null };
  }

  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));
  if (!hasSupabaseAuthCookie) {
    return { response, user: null };
  }

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({
          request: { headers: buildRequestHeaders() },
        });
        const isProd = env.NODE_ENV === "production";
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure: isProd,
            sameSite: "lax",
          });
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}

