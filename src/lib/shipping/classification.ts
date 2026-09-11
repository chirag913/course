import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnmatchedOrderClassification } from "@/types/database";

export interface UnmatchedOrder {
  shopifyOrderId: string;
  externalOrderId: string;
  orderNumber: number | null;
  createdAtExternal: string | null;
  existingClassification: UnmatchedOrderClassification | null;
}

// A Shopify order is "unmatched" here if it has NO shipping row pointing at
// it at all — i.e. it's genuinely absent from every shipping report ever
// uploaded. This is enrollment-wide housekeeping, not date-range scoped:
// per Part G, these orders must NEVER be assumed to be RTO/delivered/
// cancelled; they sit in this list until a human explicitly classifies
// them via mentorship_unmatched_order_classifications.
export async function getUnmatchedShopifyOrders(
  supabase: SupabaseClient,
  enrollmentId: string
): Promise<UnmatchedOrder[]> {
  const [{ data: orders }, { data: matchedRows }, { data: classifications }] = await Promise.all([
    supabase
      .from("mentorship_shopify_orders")
      .select("id, external_order_id, order_number, created_at_external")
      .eq("enrollment_id", enrollmentId)
      .order("created_at_external", { ascending: false }),
    supabase
      .from("mentorship_shipping_rows")
      .select("normalized_order_id")
      .eq("enrollment_id", enrollmentId)
      .not("normalized_order_id", "is", null),
    supabase
      .from("mentorship_unmatched_order_classifications")
      .select("shopify_order_id, classification")
      .eq("enrollment_id", enrollmentId),
  ]);

  const matchedOrderIds = new Set((matchedRows ?? []).map((r) => r.normalized_order_id as string));
  const classificationByOrder = new Map((classifications ?? []).map((c) => [c.shopify_order_id as string, c.classification as UnmatchedOrderClassification]));

  return (orders ?? [])
    .filter((o) => !matchedOrderIds.has(o.id as string))
    .map((o) => ({
      shopifyOrderId: o.id as string,
      externalOrderId: o.external_order_id as string,
      orderNumber: o.order_number as number | null,
      createdAtExternal: o.created_at_external as string | null,
      existingClassification: classificationByOrder.get(o.id as string) ?? null,
    }));
}
