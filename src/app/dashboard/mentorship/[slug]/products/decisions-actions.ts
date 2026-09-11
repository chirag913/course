"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { runAndRecordDecision } from "@/lib/decisions/engine-runner";
import { resolveDateRange, DEFAULT_DATE_RANGE_PRESET, type DateRangePreset } from "@/lib/products/date-range";
import type { ProductDecisionState } from "@/types/database";

async function requireOwnEnrollment(enrollmentId: string) {
  const user = await requireUser();
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
  return { slug, user };
}

function revalidateProduct(slug: string, productId: string) {
  revalidatePath(`/dashboard/mentorship/${slug}/products/${productId}`);
  revalidatePath(`/dashboard/mentorship/${slug}/products`);
}

// A student CAN trigger a fresh evaluation — the engine's own judgment is
// the same regardless of who asks for it — but the actual write always
// goes through the service-role engine runner, never the caller's own
// session (see engine-runner.ts).
export async function evaluateProductDecision(enrollmentId: string, productCatalogId: string, rangePreset?: DateRangePreset) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();
  const range = resolveDateRange(rangePreset ?? DEFAULT_DATE_RANGE_PRESET);

  const decision = await runAndRecordDecision(supabase, enrollmentId, productCatalogId, range);
  revalidateProduct(slug, productCatalogId);
  return decision;
}

// Admin-only. Never touches the engine's own decision row — see
// src/lib/decisions/effective.ts for how the two are reconciled at read
// time.
export async function createMentorOverride(
  enrollmentId: string,
  productCatalogId: string,
  overrideDecision: ProductDecisionState,
  reason: string
) {
  const { slug, user } = await requireOwnEnrollment(enrollmentId);
  if (user.profile.role !== "admin") throw new Error("Only mentors can override a decision.");
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("A reason is required for a mentor override.");

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_product_decision_overrides").insert({
    enrollment_id: enrollmentId,
    product_catalog_id: productCatalogId,
    override_decision: overrideDecision,
    override_reason: trimmedReason,
    created_by: user.id,
  });
  if (error) throw new Error("Could not save the override.");
  revalidateProduct(slug, productCatalogId);
}
