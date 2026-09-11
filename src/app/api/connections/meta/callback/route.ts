import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeOAuthState } from "@/lib/connections/state";
import { exchangeMetaCodeForLongLivedToken, listMetaAdAccounts } from "@/lib/connections/meta";
import { storeConnectionTokens } from "@/lib/connections/tokens";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function errorRedirect(reason: string) {
  return NextResponse.redirect(`${siteUrl()}/dashboard?connectionError=meta_${reason}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Meta sends error/error_reason (not a generic "error" only) when the
  // student cancels the consent screen.
  if (searchParams.get("error")) return errorRedirect("denied");
  if (!code || !state) return errorRedirect("invalid_request");

  const verified = await consumeOAuthState(state, "meta");
  if (!verified) return errorRedirect("expired_state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorRedirect("not_signed_in");

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, user_id, programs(slug)")
    .eq("id", verified.enrollmentId)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== user.id) return errorRedirect("session_mismatch");

  const slugValue = enrollment.programs as unknown as { slug: string } | { slug: string }[] | null;
  const programSlug = Array.isArray(slugValue) ? slugValue[0]?.slug : slugValue?.slug;

  let tokenResponse;
  try {
    tokenResponse = await exchangeMetaCodeForLongLivedToken(code);
  } catch {
    return errorRedirect("token_exchange_failed");
  }

  let adAccounts;
  try {
    adAccounts = await listMetaAdAccounts(tokenResponse.access_token);
  } catch {
    return errorRedirect("ad_accounts_fetch_failed");
  }

  if (adAccounts.length === 0) {
    return errorRedirect("no_ad_accounts");
  }

  const admin = createAdminClient();

  // A previous, abandoned account-selection attempt shouldn't pile up
  // orphaned pending rows — reuse one if it exists, otherwise create fresh.
  const { data: existingPending } = await admin
    .from("mentorship_connections")
    .select("id")
    .eq("enrollment_id", verified.enrollmentId)
    .eq("provider", "meta")
    .eq("status", "pending_selection")
    .maybeSingle();

  let connectionId: string;
  if (existingPending) {
    connectionId = existingPending.id;
  } else {
    const { data: created, error: insertError } = await admin
      .from("mentorship_connections")
      .insert({ enrollment_id: verified.enrollmentId, provider: "meta", status: "pending_selection" })
      .select("id")
      .single();
    if (insertError || !created) return errorRedirect("connection_failed");
    connectionId = created.id;
  }

  try {
    await storeConnectionTokens({
      connectionId,
      accessToken: tokenResponse.access_token,
      expiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
    });
  } catch {
    return errorRedirect("token_storage_failed");
  }

  return NextResponse.redirect(
    `${siteUrl()}/dashboard/mentorship/${programSlug ?? ""}/connections/meta/select-account?connectionId=${connectionId}`
  );
}
