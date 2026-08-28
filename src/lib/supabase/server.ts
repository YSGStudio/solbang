import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Supabase client bound to the caller's session cookies.
 * Every read and write through this client is subject to RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    serverEnv.supabaseUrl,
    serverEnv.supabaseAnonKey,
    {
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
            // Called from a Server Component. The middleware refreshes the
            // session instead, so this is safe to swallow.
          }
        },
      },
    },
  );
}
