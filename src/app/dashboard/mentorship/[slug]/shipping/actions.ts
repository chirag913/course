"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { importShippingCsv, ShippingImportError } from "@/lib/shipping/import";
import type { UnmatchedOrderClassification } from "@/types/database";

// Mirrors the identical helper in connections/actions.ts and
// products/actions.ts — re-derives ownership from the enrollment row via
// the RLS-scoped client rather than trusting the enrollmentId argument.
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
  return { slug, userId: user.id };
}

function revalidateShipping(slug: string) {
  revalidatePath(`/dashboard/mentorship/${slug}/shipping`);
  revalidatePath(`/dashboard/mentorship/${slug}/products`, "layout");
}

export async function uploadShippingCsv(
  enrollmentId: string,
  params: { filename: string; csvText: string; orderColumn: string; statusColumn: string }
) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();

  try {
    const result = await importShippingCsv(supabase, { enrollmentId, ...params });
    revalidateShipping(slug);
    return result;
  } catch (e) {
    throw new Error(e instanceof ShippingImportError ? e.message : "Could not import this file. Please try again.");
  }
}

export async function classifyUnmatchedOrder(
  enrollmentId: string,
  shopifyOrderId: string,
  classification: UnmatchedOrderClassification,
  notes: string | null
) {
  const { slug, userId } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();

  const { error } = await supabase.from("mentorship_unmatched_order_classifications").upsert(
    {
      enrollment_id: enrollmentId,
      shopify_order_id: shopifyOrderId,
      classification,
      notes,
      classified_by: userId,
      classified_at: new Date().toISOString(),
    },
    { onConflict: "enrollment_id,shopify_order_id" }
  );
  if (error) throw new Error("Could not save this classification.");
  revalidateShipping(slug);
}

// Bulk classification (Part G: "do not make the user manually classify 500
// rows one-by-one if they can safely classify a group") — same
// classification and notes applied to every selected order in one call.
export async function bulkClassifyUnmatchedOrders(
  enrollmentId: string,
  shopifyOrderIds: string[],
  classification: UnmatchedOrderClassification,
  notes: string | null
) {
  const { slug, userId } = await requireOwnEnrollment(enrollmentId);
  if (shopifyOrderIds.length === 0) throw new Error("Select at least one order to classify.");
  const supabase = await createClient();

  const rows = shopifyOrderIds.map((shopifyOrderId) => ({
    enrollment_id: enrollmentId,
    shopify_order_id: shopifyOrderId,
    classification,
    notes,
    classified_by: userId,
    classified_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("mentorship_unmatched_order_classifications").upsert(rows, { onConflict: "enrollment_id,shopify_order_id" });
  if (error) throw new Error("Could not save these classifications.");
  revalidateShipping(slug);
}
