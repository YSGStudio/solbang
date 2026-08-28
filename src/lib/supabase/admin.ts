import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client. Bypasses RLS.
 *
 * Only two callers are allowed to use this:
 *   - the admin approval action (R3)
 *   - the school search route handler, which owns the only writes to
 *     `schools` and the cache tables (R34)
 *
 * Never import this from a client component.
 */
export function createAdminClient() {
  return createClient<Database>(
    serverEnv.supabaseUrl,
    serverEnv.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
