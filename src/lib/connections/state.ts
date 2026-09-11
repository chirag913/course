import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MentorshipConnectionProvider } from "@/types/database";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a real OAuth grant screen

// Opaque, single-use, server-verified OAuth state. Deliberately not a
// self-encoding signed token: an opaque random value looked up server-side
// is simpler to make single-use (mark `used_at` the instant it's checked)
// and carries no information an attacker could learn from intercepting it.
export async function createOAuthState(params: {
  enrollmentId: string;
  provider: MentorshipConnectionProvider;
  shopDomain?: string;
}): Promise<string> {
  const state = crypto.randomBytes(32).toString("hex");
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_states").insert({
    state,
    enrollment_id: params.enrollmentId,
    provider: params.provider,
    shop_domain: params.shopDomain ?? null,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });
  if (error) throw new Error("Could not start the connection. Please try again.");
  return state;
}

export interface VerifiedOAuthState {
  enrollmentId: string;
  shopDomain: string | null;
}

// Verifies and immediately consumes a state value. Returns null for any
// failure (missing, expired, already-used, wrong provider) rather than
// throwing with detail — callers should treat every failure identically
// ("this connection link is invalid or has expired") to avoid leaking which
// specific check failed.
export async function consumeOAuthState(
  state: string,
  expectedProvider: MentorshipConnectionProvider
): Promise<VerifiedOAuthState | null> {
  if (!state) return null;
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("oauth_states")
    .select("id, enrollment_id, provider, shop_domain, expires_at, used_at")
    .eq("state", state)
    .maybeSingle();

  if (!row) return null;
  if (row.used_at) return null; // replay
  if (row.provider !== expectedProvider) return null; // provider mix-up
  if (new Date(row.expires_at).getTime() < Date.now()) return null; // expired

  // Mark used before doing anything else with it, closing the replay window
  // as early as possible even if the rest of the callback later fails.
  const { error: markError } = await admin
    .from("oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null);
  if (markError) return null;

  return { enrollmentId: row.enrollment_id, shopDomain: row.shop_domain };
}
