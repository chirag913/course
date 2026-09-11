import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MentorshipDataSync, SyncProvider, SyncType } from "@/types/database";

// mentorship_data_syncs is one row per sync ATTEMPT, not one evolving row.
// `last_successful_sync_at` is carried forward from the previous attempt at
// start time and overwritten on success, so any single row tells you both
// "how did this attempt go" and "when did we last actually succeed" with no
// join. The partial unique index on (enrollment_id, provider) WHERE
// status='running' is what actually prevents two concurrent syncs — this
// throws a friendly error on that race rather than letting both proceed.
export async function startSync(
  enrollmentId: string,
  provider: SyncProvider,
  syncType: SyncType
): Promise<{ syncId: string; previousSuccessAt: string | null }> {
  const admin = createAdminClient();

  const { data: previous } = await admin
    .from("mentorship_data_syncs")
    .select("last_successful_sync_at")
    .eq("enrollment_id", enrollmentId)
    .eq("provider", provider)
    .not("last_successful_sync_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousSuccessAt = previous?.last_successful_sync_at ?? null;

  const { data, error } = await admin
    .from("mentorship_data_syncs")
    .insert({
      enrollment_id: enrollmentId,
      provider,
      sync_type: syncType,
      status: "running",
      started_at: new Date().toISOString(),
      last_successful_sync_at: previousSuccessAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new Error(`A ${provider} sync is already running for this enrollment.`);
    }
    throw new Error("Could not start the sync. Please try again.");
  }

  return { syncId: data.id as string, previousSuccessAt };
}

export async function completeSync(
  syncId: string,
  recordsProcessed: number,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin
    .from("mentorship_data_syncs")
    .update({
      status: "success",
      completed_at: now,
      last_successful_sync_at: now,
      records_processed: recordsProcessed,
      metadata,
    })
    .eq("id", syncId);
}

export async function failSync(
  syncId: string,
  errorMessage: string,
  recordsProcessed = 0,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("mentorship_data_syncs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      records_processed: recordsProcessed,
      error_message: errorMessage.slice(0, 2000),
      metadata,
    })
    .eq("id", syncId);
}

// Most recent sync attempt per provider, for the Connections page. Reads
// through the service-role client because it's called from a Server Action
// that has already verified ownership (see requireOwnEnrollment) — the page
// itself reads mentorship_data_syncs directly via the RLS-scoped client, so
// this helper is only needed where a Server Action wants the same data.
export async function getLatestSyncs(
  enrollmentId: string
): Promise<Record<SyncProvider, MentorshipDataSync | null>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mentorship_data_syncs")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .order("created_at", { ascending: false });

  const result: Record<SyncProvider, MentorshipDataSync | null> = { shopify: null, meta: null };
  for (const row of (data ?? []) as MentorshipDataSync[]) {
    if (!result[row.provider]) result[row.provider] = row;
  }
  return result;
}
