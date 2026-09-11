import "server-only";
import { getConnectionTokens } from "./tokens";

// Graph API version — Meta ships new versions roughly twice a year and
// retires old ones; review this periodically. Confirmed current as of this
// implementation via Meta's own developer docs.
export const META_GRAPH_VERSION = "v25.0";

// Analysis-only: we never modify ads, so `ads_management` is never
// requested — `ads_read` is sufficient for everything this platform does.
export const META_SCOPES = "ads_read";

function redirectUri(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${site.replace(/\/$/, "")}/api/connections/meta/callback`;
}

export function buildMetaAuthorizeUrl(state: string): string {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("Meta is not configured.");

  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_SCOPES);
  return url.toString();
}

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

async function exchangeMetaCode(code: string): Promise<MetaTokenResponse> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Meta is not configured.");

  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Meta rejected the authorization code.");
  return (await res.json()) as MetaTokenResponse;
}

// The initial code exchange returns a short-lived user token (typically
// ~1-2 hours). We immediately exchange it for a long-lived token (~60
// days) so the connection survives longer than a single session — this is
// Meta's documented mechanism for extending token life; there is no
// separate refresh_token grant like Shopify's, so Phase B's sync job (or an
// admin re-connect prompt) will need to re-run this exchange before expiry.
async function exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Meta is not configured.");

  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Could not extend the Meta connection's token lifetime.");
  return (await res.json()) as MetaTokenResponse;
}

export async function exchangeMetaCodeForLongLivedToken(code: string): Promise<MetaTokenResponse> {
  const shortLived = await exchangeMetaCode(code);
  return exchangeForLongLivedToken(shortLived.access_token);
}

export interface MetaAdAccount {
  id: string; // "act_123456789"
  accountId: string; // "123456789"
  name: string;
  currency: string;
}

export async function listMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts`);
  url.searchParams.set("fields", "id,account_id,name,currency");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Could not read ad accounts from Meta.");
  const body = (await res.json()) as { data?: Array<{ id: string; account_id: string; name: string; currency: string }> };

  return (body.data ?? []).map((a) => ({
    id: a.id,
    accountId: a.account_id,
    name: a.name,
    currency: a.currency,
  }));
}

// Meta has no refresh-token grant like Shopify's — a long-lived user token
// (~60 days) is the whole mechanism, and there's no way to extend it
// automatically once it's close to expiry. So unlike getValidShopifyToken(),
// this never refreshes; it just tells the caller plainly when the student
// needs to reconnect (a fresh OAuth round-trip re-establishes the ~60-day
// window). Phase B's sync code treats a null return as a failed sync with a
// "reconnect Meta" error, not a crash.
const META_EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day — small relative to a 60-day token

export async function getValidMetaToken(connectionId: string): Promise<string | null> {
  const tokens = await getConnectionTokens(connectionId);
  if (!tokens) return null;
  if (tokens.expires_at && new Date(tokens.expires_at).getTime() - Date.now() <= META_EXPIRY_BUFFER_MS) {
    return null;
  }
  return tokens.access_token;
}
