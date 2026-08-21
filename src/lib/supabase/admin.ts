import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
//
// Only import this from server-only code paths that perform their own
// authorization checks (webhooks, signed-download route, admin mutations
// that need to touch rows a user's own session cannot see). The
// `server-only` import above makes any accidental client-bundle import a
// build-time error.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
