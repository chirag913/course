import "server-only";
import { getConnectionTokens, storeConnectionTokens } from "./tokens";

// REST/GraphQL Admin API version — Shopify releases a new one quarterly and
// supports each for 12+ months. Confirmed current as of this
// implementation (2026-01 and 2026-04 are also still valid; review this
// each quarter). Not used for the OAuth token endpoints themselves (those
// are unversioned), only for authenticated Admin API calls like fetching
// the shop's display name.
export const SHOPIFY_API_VERSION = "2026-07";

// Read-only, least-privilege — see PHASE_A_CONNECTIONS.md for why these two
// and not more.
export const SHOPIFY_SCOPES = "read_products,read_orders";

function redirectUri(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${site.replace(/\/$/, "")}/api/connections/shopify/callback`;
}

// Accepts either a bare shop name ("my-store") or a full domain
// ("my-store.myshopify.com") and returns the canonical *.myshopify.com
// domain, or null if the input doesn't look like a real Shopify shop —
// this is the only thing standing between a student's typed input and a
// URL we redirect their browser to, so it's deliberately strict.
export function normalizeShopDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const bare = trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const candidate = bare.includes(".") ? bare : `${bare}.myshopify.com`;
  const valid = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(candidate);
  return valid ? candidate : null;
}

export function buildShopifyAuthorizeUrl(shopDomain: string, state: string): string {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) throw new Error("Shopify is not configured.");

  const url = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SHOPIFY_SCOPES);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

interface ShopifyTokenResponse {
  access_token: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
}

// Exchanges the authorization code for an access token. Per Shopify's
// April 2026 requirement that new public apps issue expiring offline
// tokens with a refresh token, this follows the standard OAuth 2.0 token
// exchange shape — verify the exact response fields against Shopify's
// current docs once the app is registered and this is live-tested; the
// April 2026 change was recent enough that some field names could not be
// independently confirmed beyond Shopify's own statement that it follows
// OAuth 2.0 conventions.
export async function exchangeShopifyCode(shopDomain: string, code: string): Promise<ShopifyTokenResponse> {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify is not configured.");

  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  if (!res.ok) throw new Error("Shopify rejected the authorization code.");
  return (await res.json()) as ShopifyTokenResponse;
}

async function refreshShopifyToken(shopDomain: string, refreshToken: string): Promise<ShopifyTokenResponse> {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify is not configured.");

  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error("Could not refresh the Shopify connection.");
  return (await res.json()) as ShopifyTokenResponse;
}

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Phase B's data-ingestion code calls this instead of ever reading
// mentorship_connection_tokens directly — it returns a token guaranteed
// valid for at least a few minutes, refreshing first if needed. Not called
// anywhere in Phase A (no ingestion yet), but the connection layer is built
// so this can work without further schema changes.
export async function getValidShopifyToken(connectionId: string, shopDomain: string): Promise<string | null> {
  const tokens = await getConnectionTokens(connectionId);
  if (!tokens) return null;

  const stillValid = !tokens.expires_at || new Date(tokens.expires_at).getTime() - Date.now() > EXPIRY_BUFFER_MS;
  if (stillValid) return tokens.access_token;

  if (!tokens.refresh_token) return null; // expired with nothing to refresh from — needs re-auth

  const refreshed = await refreshShopifyToken(shopDomain, tokens.refresh_token);
  await storeConnectionTokens({
    connectionId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? tokens.refresh_token,
    expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
    scope: refreshed.scope,
  });
  return refreshed.access_token;
}
