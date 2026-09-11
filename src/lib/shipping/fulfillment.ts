import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedDateRange } from "@/lib/products/date-range";
import { getMappedShopifyLineItems } from "@/lib/products/metrics";
import type { CanonicalShippingStatus } from "@/types/database";

export interface FulfillmentCounts {
  ordersCount: number; // total mapped Shopify orders for this product in range
  shipped: number;
  delivered: number;
  ndr: number;
  rto: number;
  unresolved: number; // no shipping data yet, or status is unknown/needs_review
}

export interface FulfillmentRates {
  deliveryRate: number | null; // percent
  rtoRate: number | null;
  ndrRate: number | null;
  insufficientData: boolean;
}

export interface FulfillmentSummary {
  counts: FulfillmentCounts;
  rates: FulfillmentRates;
}

// Resolves each order's CURRENT status as the most recent shipping row
// matched to it (by created_at DESC). This is the entire mechanism behind
// "a later shipping report supersedes an earlier one" and "delivered +
// RTO never both count as current for the same order" — no row is ever
// mutated or deleted; we just always read the latest one per order.
async function resolveCurrentStatusByOrder(
  supabase: SupabaseClient,
  enrollmentId: string,
  orderIds: string[]
): Promise<Map<string, CanonicalShippingStatus>> {
  if (orderIds.length === 0) return new Map();
  const { data: rows } = await supabase
    .from("mentorship_shipping_rows")
    .select("normalized_order_id, status, created_at")
    .eq("enrollment_id", enrollmentId)
    .in("normalized_order_id", orderIds)
    .order("created_at", { ascending: false });

  const result = new Map<string, CanonicalShippingStatus>();
  for (const row of rows ?? []) {
    const orderId = row.normalized_order_id as string | null;
    if (!orderId || result.has(orderId)) continue; // keep only the first (= most recent) row seen per order
    result.set(orderId, row.status as CanonicalShippingStatus);
  }
  return result;
}

export async function getProductFulfillmentSummary(
  supabase: SupabaseClient,
  enrollmentId: string,
  productCatalogId: string,
  range: ResolvedDateRange
): Promise<FulfillmentSummary> {
  const { data: shopifyLinks } = await supabase
    .from("mentorship_product_shopify_links")
    .select("shopify_product_id, shopify_variant_id")
    .eq("enrollment_id", enrollmentId)
    .eq("product_catalog_id", productCatalogId);

  const lineItems = await getMappedShopifyLineItems(supabase, enrollmentId, shopifyLinks ?? [], range);
  const orderIds = Array.from(new Set(lineItems.map((li) => li.orderId)));

  const statusByOrder = await resolveCurrentStatusByOrder(supabase, enrollmentId, orderIds);

  let shipped = 0;
  let delivered = 0;
  let ndr = 0;
  let rto = 0;
  let unresolved = 0;
  for (const orderId of orderIds) {
    const status = statusByOrder.get(orderId);
    if (!status || status === "unknown" || status === "needs_review") {
      unresolved += 1;
      continue;
    }
    if (status === "shipped") shipped += 1;
    else if (status === "delivered") delivered += 1;
    else if (status === "NDR") ndr += 1;
    else if (status === "RTO") rto += 1;
  }

  const counts: FulfillmentCounts = { ordersCount: orderIds.length, shipped, delivered, ndr, rto, unresolved };

  // Denominator = orders that actually entered the shipment lifecycle
  // (shipped, delivered, NDR, RTO are all post-dispatch states — "shipped"
  // just means still in transit / not yet resolved to a terminal state).
  // Orders with no shipping data, or an unrecognized status, are excluded
  // from the rate entirely rather than counted as a failure of any kind —
  // see PHASE_D_ECONOMICS_SHIPPING.md "Delivery/RTO/NDR rate formulas."
  const eligibleBase = shipped + delivered + ndr + rto;
  const rates: FulfillmentRates =
    eligibleBase === 0
      ? { deliveryRate: null, rtoRate: null, ndrRate: null, insufficientData: true }
      : {
          deliveryRate: (delivered / eligibleBase) * 100,
          rtoRate: (rto / eligibleBase) * 100,
          ndrRate: (ndr / eligibleBase) * 100,
          insufficientData: false,
        };

  return { counts, rates };
}
