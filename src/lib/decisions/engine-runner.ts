import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDecisionEngineInput } from "./build-input";
import { evaluateProductDecision, ENGINE_VERSION } from "./engine";
import type { ResolvedDateRange } from "@/lib/products/date-range";
import type { MentorshipProductDecision } from "@/types/database";

// Runs the engine and persists the result via the service-role client —
// the ONLY code path that ever writes to mentorship_product_decisions,
// regardless of who triggered it. RLS on that table has NO insert policy
// for any normal session (student or admin) — this is what actually
// enforces "students cannot create or modify engine decisions directly,"
// not just a UI restriction. `supabaseForRead` is the caller's own
// RLS-scoped client, used only to gather inputs (nothing sensitive).
export async function runAndRecordDecision(
  supabaseForRead: SupabaseClient,
  enrollmentId: string,
  productCatalogId: string,
  range: ResolvedDateRange
): Promise<MentorshipProductDecision> {
  const input = await buildDecisionEngineInput(supabaseForRead, enrollmentId, productCatalogId, range);
  const result = evaluateProductDecision(input);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mentorship_product_decisions")
    .insert({
      enrollment_id: enrollmentId,
      product_catalog_id: productCatalogId,
      decision: result.decision,
      reason_code: result.reasonCode,
      priority: result.priority,
      why: result.why,
      next_action: result.nextAction,
      evidence: result.evidence,
      engine_version: ENGINE_VERSION,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not record the decision.");
  return data as MentorshipProductDecision;
}
