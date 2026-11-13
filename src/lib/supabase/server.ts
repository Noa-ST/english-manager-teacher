import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env";

/**
 * Server-side Supabase SSR client (Cookie-based session, anon/publishable key).
 * Respects RLS policies for the currently authenticated user.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where setting cookies is a no-op;
          // proxy.ts handles refreshing cookies on page navigations.
        }
      },
    },
  });
}

/**
 * Server-ONLY Supabase Admin client using SUPABASE_SECRET_KEY (Service Role).
 * NEVER import this in any client component or expose its key to the browser.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured.");
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

