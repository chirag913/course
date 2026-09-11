import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeOAuthState } from "@/lib/connections/state";
import { SHOPIFY_API_VERSION, exchangeShopifyCode, normalizeShopDomain } from "@/lib/connections/shopify";
import { storeConnectionTokens } from "@/lib/connections/tokens";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

// Shopify signs every OAuth callback query string with the app's client
// secret. Verifying this is an additional, independent check on top of our
// own `state` — it confirms the request genuinely came from Shopify and
// wasn't tampered with in transit, even if an attacker somehow obtained a
// valid state value.
function verifyShopifyHmac(searchParams: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) return false;

  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const computed = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(computed);
  const b = Buffer.from(hmac);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function errorRedirect(reason: string) {
  return NextResponse.redirect(`${siteUrl()}/dashboard?connectionError=shopify_${reason}`);
}

async function fetchShopName(shopDomain: string, accessToken: string): Promise<string> {
  try {
    const res = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) return shopDomain;
    const body = (await res.json()) as { shop?: { name?: string } };
    return body.shop?.name || shopDomain;
  } catch {
    return shopDomain;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const shopParam = searchParams.get("shop");

  if (searchParams.get("error")) return errorRedirect("denied");
  if (!code || !state || !shopParam) return errorRedirect("invalid_request");
  if (!verifyShopifyHmac(searchParams)) return errorRedirect("invalid_signature");

  const shopDomain = normalizeShopDomain(shopParam);
  if (!shopDomain) return errorRedirect("invalid_shop");

  const verified = await consumeOAuthState(state, "shopify");
  if (!verified) return errorRedirect("expired_state");
  if (verified.shopDomain && verified.shopDomain !== shopDomain) return errorRedirect("shop_mismatch");

  // Cross-check: the browser completing this callback must be the same
  // student who owns the enrollment the state was issued for.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorRedirect("not_signed_in");

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, user_id, program_id, programs(slug)")
    .eq("id", verified.enrollmentId)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== user.id) return errorRedirect("session_mismatch");

  let tokenResponse;
  try {
    tokenResponse = await exchangeShopifyCode(shopDomain, code);
  } catch {
    return errorRedirect("token_exchange_failed");
  }

  const shopName = await fetchShopName(shopDomain, tokenResponse.access_token);

  const admin = createAdminClient();

  // A fresh connect always creates a new row (preserving disconnect/
  // reconnect history) — but guard against the rare double-submit race
  // where an active row already exists for this provider.
  const { data: existingActive } = await admin
    .from("mentorship_connections")
    .select("id")
    .eq("enrollment_id", verified.enrollmentId)
    .eq("provider", "shopify")
    .eq("status", "connected")
    .maybeSingle();

  let connectionId: string;
  if (existingActive) {
    connectionId = existingActive.id;
    await admin
      .from("mentorship_connections")
      .update({
        external_account_id: shopDomain,
        external_account_name: shopName,
        connected_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
  } else {
    const { data: created, error: insertError } = await admin
      .from("mentorship_connections")
      .insert({
        enrollment_id: verified.enrollmentId,
        provider: "shopify",
        status: "connected",
        external_account_id: shopDomain,
        external_account_name: shopName,
        connected_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertError || !created) return errorRedirect("connection_failed");
    connectionId = created.id;
  }

  try {
    await storeConnectionTokens({
      connectionId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
      expiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
      scope: tokenResponse.scope,
    });
  } catch {
    return errorRedirect("token_storage_failed");
  }

  const slug = (enrollment.programs as unknown as { slug: string } | { slug: string }[] | null);
  const programSlug = Array.isArray(slug) ? slug[0]?.slug : slug?.slug;

  return NextResponse.redirect(
    `${siteUrl()}/dashboard/mentorship/${programSlug ?? ""}/connections?connected=shopify`
  );
}
