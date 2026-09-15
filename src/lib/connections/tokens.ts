import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// mentorship_connection_tokens has NO RLS policies for any role — this file
// is the only code in the app allowed to touch it, always via the
// service-role client. Nothing here is ever returned to a Server
// Component's render output or a client component; callers get back
// booleans/void, never the token value itself, except getValidShopifyToken
// (Phase B) which hands a live token directly to a server-side fetch call.

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
}

export async function storeConnectionTokens(params: {
  connectionId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope?: string | null;
  credentials?: Record<string, string> | null;
}): Promise<void> {
  const admin = createAdminClient();
  const payload: Record<string, unknown> = {
    connection_id: params.connectionId,
    access_token: params.accessToken,
    refresh_token: params.refreshToken ?? null,
    expires_at: params.expiresAt ? params.expiresAt.toISOString() : null,
    scope: params.scope ?? null,
  };
  // Keep existing OAuth providers compatible with their pre-Phase-5 schema.
  // Shiprocket is the only provider that needs the new server-only field.
  if (params.credentials !== undefined) payload.credentials = params.credentials;
  const { error } = await admin.from("mentorship_connection_tokens").upsert(
    payload,
    { onConflict: "connection_id" }
  );
  if (error) throw new Error("Could not securely store the connection.");
}

export async function getConnectionTokens(connectionId: string): Promise<TokenRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mentorship_connection_tokens")
    .select("access_token, refresh_token, expires_at, scope")
    .eq("connection_id", connectionId)
    .maybeSingle();
  return data ?? null;
}

export async function getConnectionCredentials(connectionId: string): Promise<Record<string, string> | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mentorship_connection_tokens")
    .select("credentials")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (error || !data?.credentials || typeof data.credentials !== "object") return null;
  return data.credentials as Record<string, string>;
}

export async function deleteConnectionTokens(connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("mentorship_connection_tokens").delete().eq("connection_id", connectionId);
}
