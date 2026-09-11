"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { createOAuthState } from "@/lib/connections/state";
import { buildShopifyAuthorizeUrl, normalizeShopDomain } from "@/lib/connections/shopify";
import { buildMetaAuthorizeUrl, listMetaAdAccounts } from "@/lib/connections/meta";
import { deleteConnectionTokens, getConnectionTokens } from "@/lib/connections/tokens";
import { startSync, completeSync, failSync, getLatestSyncs } from "@/lib/sync/state";
import { ingestShopifyForConnection, ShopifyIngestError } from "@/lib/sync/shopify-ingest";
import { ingestMetaForConnection, MetaIngestError } from "@/lib/sync/meta-ingest";
import type { MentorshipConnectionProvider } from "@/types/database";

// Every action re-derives ownership from the enrollment row via the
// RLS-scoped client rather than trusting the enrollmentId argument alone —
// a student can only ever act on an enrollment RLS actually lets them read
// (their own, with active mentorship access), so a forged/foreign
// enrollmentId simply resolves to nothing.
async function requireOwnEnrollment(enrollmentId: string) {
  await requireUser();
  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, programs(slug)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enrollment) throw new Error("Mentorship access not found.");
  const slugValue = enrollment.programs as unknown as { slug: string } | { slug: string }[] | null;
  const slug = Array.isArray(slugValue) ? slugValue[0]?.slug : slugValue?.slug;
  if (!slug) throw new Error("Mentorship program not found.");
  return { slug };
}

export async function initiateShopifyConnect(enrollmentId: string, shopDomainInput: string) {
  await requireOwnEnrollment(enrollmentId);

  const shopDomain = normalizeShopDomain(shopDomainInput);
  if (!shopDomain) {
    throw new Error("Enter a valid Shopify store domain, e.g. your-store.myshopify.com.");
  }

  const state = await createOAuthState({ enrollmentId, provider: "shopify", shopDomain });
  redirect(buildShopifyAuthorizeUrl(shopDomain, state));
}

export async function initiateMetaConnect(enrollmentId: string) {
  await requireOwnEnrollment(enrollmentId);
  const state = await createOAuthState({ enrollmentId, provider: "meta" });
  redirect(buildMetaAuthorizeUrl(state));
}

export async function disconnectConnection(enrollmentId: string, connectionId: string) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();

  // RLS (mentorship_connections_update_own_active_or_admin) enforces that
  // this can only ever touch a row belonging to this enrollment.
  const { error } = await supabase
    .from("mentorship_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not disconnect. Please try again.");

  // Delete our copy of the credentials. Neither Shopify nor Meta offers a
  // simple merchant-initiated remote revocation call as part of this V1
  // scope — removing our stored token is what actually stops this platform
  // from being able to use it, which is the practical security goal here.
  await deleteConnectionTokens(connectionId);

  revalidatePath(`/dashboard/mentorship/${slug}/connections`);
}

export async function finalizeMetaAccountSelection(
  enrollmentId: string,
  connectionId: string,
  adAccountId: string,
  adAccountName: string
) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("mentorship_connections")
    .update({
      status: "connected",
      external_account_id: adAccountId,
      external_account_name: adAccountName,
      connected_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("enrollment_id", enrollmentId)
    .eq("status", "pending_selection");
  if (error) throw new Error("Could not finalize the connection. Please try again.");

  redirect(`/dashboard/mentorship/${slug}/connections`);
}

// Used by the select-account page (a Server Component) to re-list the
// student's Meta ad accounts using the token already stored for a
// pending_selection connection — the token itself never leaves this
// function; only the {id, name, currency} list is returned for rendering.
export async function listAdAccountsForPendingConnection(enrollmentId: string, connectionId: string) {
  await requireOwnEnrollment(enrollmentId);
  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("mentorship_connections")
    .select("id, enrollment_id, provider, status")
    .eq("id", connectionId)
    .eq("enrollment_id", enrollmentId)
    .eq("provider", "meta")
    .eq("status", "pending_selection")
    .maybeSingle();
  if (!connection) return [];

  const tokens = await getConnectionTokens(connectionId);
  if (!tokens) return [];

  try {
    return await listMetaAdAccounts(tokens.access_token);
  } catch {
    return [];
  }
}

// Runs the actual data pull synchronously within the Server Action call —
// there's no background job system in this codebase, and Part B of the
// Phase B spec explicitly says not to build one unless genuinely required.
// The `mentorship_data_syncs` partial unique index on status='running' is
// what actually prevents two overlapping syncs for the same
// enrollment/provider, independent of this being synchronous. If historical
// data volume ever grows past what fits in a single request's time budget,
// that's a Phase C+ concern (move to a background job), not something built
// here.
export async function syncProvider(enrollmentId: string, provider: MentorshipConnectionProvider) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();

  // RLS-scoped read: this can only ever see a connection belonging to an
  // enrollment the caller (student or admin) is actually allowed to read.
  const { data: connection } = await supabase
    .from("mentorship_connections")
    .select("id, enrollment_id, provider, status, external_account_id")
    .eq("enrollment_id", enrollmentId)
    .eq("provider", provider)
    .eq("status", "connected")
    .maybeSingle();

  if (!connection) {
    throw new Error(`Connect ${provider === "shopify" ? "Shopify" : "Meta Ads"} first before syncing.`);
  }

  const admin = createAdminClient();
  const { data: previousSuccess } = await admin
    .from("mentorship_data_syncs")
    .select("last_successful_sync_at")
    .eq("enrollment_id", enrollmentId)
    .eq("provider", provider)
    .not("last_successful_sync_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const syncType = previousSuccess?.last_successful_sync_at ? "incremental" : "initial";
  const { syncId, previousSuccessAt } = await startSync(enrollmentId, provider, syncType);

  try {
    if (provider === "shopify") {
      const result = await ingestShopifyForConnection(enrollmentId, connection, { since: previousSuccessAt });
      await completeSync(syncId, result.recordsProcessed, {
        productsImported: result.productsImported,
        variantsImported: result.variantsImported,
        ordersImported: result.ordersImported,
        lineItemsImported: result.lineItemsImported,
        ordersWindowNote: result.ordersWindowNote,
      });
    } else {
      const result = await ingestMetaForConnection(enrollmentId, connection, { since: previousSuccessAt });
      await completeSync(syncId, result.recordsProcessed, {
        campaignsImported: result.campaignsImported,
        adSetsImported: result.adSetsImported,
        adsImported: result.adsImported,
        insightsImported: result.insightsImported,
        windowDays: result.windowDays,
      });
    }
  } catch (e) {
    const message =
      e instanceof ShopifyIngestError || e instanceof MetaIngestError
        ? e.message
        : "The sync failed unexpectedly. Please try again.";
    await failSync(syncId, message);
    revalidatePath(`/dashboard/mentorship/${slug}/connections`);
    throw new Error(message);
  }

  revalidatePath(`/dashboard/mentorship/${slug}/connections`);
}

export async function syncShopify(enrollmentId: string) {
  return syncProvider(enrollmentId, "shopify");
}

export async function syncMeta(enrollmentId: string) {
  return syncProvider(enrollmentId, "meta");
}

export async function getSyncStatus(enrollmentId: string) {
  await requireOwnEnrollment(enrollmentId);
  return getLatestSyncs(enrollmentId);
}
