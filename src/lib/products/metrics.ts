import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedDateRange } from "./date-range";

// RAW/AGGREGATED OBSERVATIONS ONLY — no profitability, no margin, no
// decisions. See PHASE_C_PRODUCT_INTELLIGENCE.md "Aggregation rules" for
// the exact definition of every field here, especially `revenue`.
export interface ProductShopifyMetrics {
  ordersCount: number;
  unitsSold: number;
  revenue: number; // minor units — see doc: sum(line_item.price * quantity)
}

export interface ProductMetaMetrics {
  spend: number | null; // minor units
  impressions: number | null;
  clicks: number | null;
  ctr: number | null; // percent, recomputed from summed clicks/impressions
  cpc: number | null; // minor units, recomputed from summed spend/clicks
  purchases: number | null;
  purchaseValue: number | null; // minor units
}

export interface ProductMetrics {
  shopifyMapped: boolean;
  metaMapped: boolean;
  mappedAdCount: number;
  shopify: ProductShopifyMetrics;
  meta: ProductMetaMetrics;
}

const EMPTY_META: ProductMetaMetrics = {
  spend: null,
  impressions: null,
  clicks: null,
  ctr: null,
  cpc: null,
  purchases: null,
  purchaseValue: null,
};

// Accepts any Supabase client (RLS-scoped from a Server Component, or
// service-role from a Server Action that already verified ownership) —
// this module has no opinion on authorization, only on aggregation math.
export async function getProductMetrics(
  supabase: SupabaseClient,
  enrollmentId: string,
  productCatalogId: string,
  range: ResolvedDateRange
): Promise<ProductMetrics> {
  const [{ data: shopifyLinks }, { data: metaLinks }] = await Promise.all([
    supabase
      .from("mentorship_product_shopify_links")
      .select("shopify_product_id, shopify_variant_id")
      .eq("enrollment_id", enrollmentId)
      .eq("product_catalog_id", productCatalogId),
    supabase
      .from("mentorship_product_meta_links")
      .select("meta_ad_id")
      .eq("enrollment_id", enrollmentId)
      .eq("product_catalog_id", productCatalogId),
  ]);

  const shopifyMapped = (shopifyLinks?.length ?? 0) > 0;
  const adIds = (metaLinks ?? []).map((l) => l.meta_ad_id as string);
  const metaMapped = adIds.length > 0;

  const shopify = await aggregateShopifyMetrics(supabase, enrollmentId, shopifyLinks ?? [], range);
  const meta = adIds.length > 0 ? await aggregateMetaMetrics(supabase, enrollmentId, adIds, range) : EMPTY_META;

  return { shopifyMapped, metaMapped, mappedAdCount: adIds.length, shopify, meta };
}

// Exported for Phase D's fulfillment module, which needs the same
// "which orders belong to this product, in this range" resolution to join
// against shipping status — reusing this instead of re-deriving the
// product-level-vs-variant-level link logic a second time.
export async function getMappedShopifyLineItems(
  supabase: SupabaseClient,
  enrollmentId: string,
  links: { shopify_product_id: string; shopify_variant_id: string | null }[],
  range: ResolvedDateRange
): Promise<{ orderId: string; quantity: number; price: number }[]> {
  if (links.length === 0) return [];

  // variant_id NULL means "the whole product" (all its variants);
  // variant_id set means "only this specific variant."
  const productLevelIds = links.filter((l) => !l.shopify_variant_id).map((l) => l.shopify_product_id);
  const variantLevelIds = links.filter((l) => l.shopify_variant_id).map((l) => l.shopify_variant_id as string);

  // Two-step query (orders in range, then their line items) rather than a
  // single embedded-join filter — simpler to reason about and test than
  // PostgREST's embedded-resource filter syntax, at the cost of one extra
  // round trip.
  const { data: ordersInRange } = await supabase
    .from("mentorship_shopify_orders")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .gte("created_at_external", `${range.start}T00:00:00.000Z`)
    .lte("created_at_external", `${range.end}T23:59:59.999Z`);

  const orderIds = (ordersInRange ?? []).map((o) => o.id as string);
  if (orderIds.length === 0) return [];

  const orFilterParts: string[] = [];
  if (productLevelIds.length > 0) orFilterParts.push(`product_id.in.(${productLevelIds.join(",")})`);
  if (variantLevelIds.length > 0) orFilterParts.push(`variant_id.in.(${variantLevelIds.join(",")})`);
  if (orFilterParts.length === 0) return [];

  const { data: lineItems } = await supabase
    .from("mentorship_shopify_order_line_items")
    .select("order_id, quantity, price")
    .eq("enrollment_id", enrollmentId)
    .in("order_id", orderIds)
    .or(orFilterParts.join(","));

  return (lineItems ?? []).map((li) => ({
    orderId: li.order_id as string,
    quantity: (li.quantity as number) ?? 0,
    price: (li.price as number) ?? 0,
  }));
}

async function aggregateShopifyMetrics(
  supabase: SupabaseClient,
  enrollmentId: string,
  links: { shopify_product_id: string; shopify_variant_id: string | null }[],
  range: ResolvedDateRange
): Promise<ProductShopifyMetrics> {
  const lineItems = await getMappedShopifyLineItems(supabase, enrollmentId, links, range);
  const distinctOrderIds = new Set<string>();
  let unitsSold = 0;
  let revenue = 0;
  for (const li of lineItems) {
    distinctOrderIds.add(li.orderId);
    unitsSold += li.quantity;
    revenue += li.price * li.quantity;
  }
  return { ordersCount: distinctOrderIds.size, unitsSold, revenue };
}

async function aggregateMetaMetrics(
  supabase: SupabaseClient,
  enrollmentId: string,
  adIds: string[],
  range: ResolvedDateRange
): Promise<ProductMetaMetrics> {
  const { data: insights } = await supabase
    .from("mentorship_meta_ad_insights")
    .select("spend, impressions, clicks, purchases, purchase_value")
    .eq("enrollment_id", enrollmentId)
    .in("ad_id", adIds)
    .gte("date", range.start)
    .lte("date", range.end);

  if (!insights || insights.length === 0) return EMPTY_META;

  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let purchases = 0;
  let purchaseValue = 0;
  for (const row of insights) {
    spend += (row.spend as number) ?? 0;
    impressions += (row.impressions as number) ?? 0;
    clicks += (row.clicks as number) ?? 0;
    purchases += (row.purchases as number) ?? 0;
    purchaseValue += (row.purchase_value as number) ?? 0;
  }

  return {
    spend,
    impressions,
    clicks,
    // Recomputed from summed totals, not an average of daily ratios — an
    // average-of-averages would misweight low-volume days.
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: clicks > 0 ? Math.round(spend / clicks) : null,
    purchases,
    purchaseValue,
  };
}
