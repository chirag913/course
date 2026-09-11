import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShippingMatchMethod } from "@/types/database";

export interface OrderMatchResult {
  orderId: string | null;
  method: ShippingMatchMethod;
}

// Deterministic matching only — exact Shopify order ID, then exact order
// number. Deliberately never matches on customer name/phone/address (per
// explicit instruction: those aren't reliable identifiers and a false
// match here would silently corrupt fulfillment/RTO data for the wrong
// order). Anything that doesn't hit one of the two exact identifiers stays
// unmatched — see Part G, "never assume."
export async function buildOrderMatchIndex(
  supabase: SupabaseClient,
  enrollmentId: string
): Promise<{ byExternalId: Map<string, string>; byOrderNumber: Map<string, string> }> {
  const { data: orders } = await supabase
    .from("mentorship_shopify_orders")
    .select("id, external_order_id, order_number")
    .eq("enrollment_id", enrollmentId);

  const byExternalId = new Map<string, string>();
  const byOrderNumber = new Map<string, string>();
  for (const order of orders ?? []) {
    byExternalId.set(String(order.external_order_id).trim(), order.id as string);
    if (order.order_number != null) {
      byOrderNumber.set(String(order.order_number).trim(), order.id as string);
    }
  }
  return { byExternalId, byOrderNumber };
}

export function matchOrderReference(
  reference: string,
  index: { byExternalId: Map<string, string>; byOrderNumber: Map<string, string> }
): OrderMatchResult {
  const cleaned = reference.trim();
  if (!cleaned) return { orderId: null, method: "unmatched" };

  const byId = index.byExternalId.get(cleaned);
  if (byId) return { orderId: byId, method: "exact_order_id" };

  // Shopify order numbers are frequently displayed with a "#" prefix in
  // exported reports (e.g. "#1001") — strip it before the exact-number
  // comparison. Still an exact match, not a fuzzy one.
  const withoutHash = cleaned.replace(/^#/, "");
  const byNumber = index.byOrderNumber.get(withoutHash);
  if (byNumber) return { orderId: byNumber, method: "exact_order_number" };

  return { orderId: null, method: "unmatched" };
}
