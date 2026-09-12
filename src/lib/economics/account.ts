// Reusable ENROLLMENT + date-range aggregation (Part O). No UI consumes
// this in Phase D — it exists so a future account-level dashboard doesn't
// have to re-derive this logic. Deliberately reuses the exact same
// per-product functions the product detail page uses, so totals are always
// consistent with what a student sees on any individual product.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedDateRange } from "@/lib/products/date-range";
import { getProductMetrics } from "@/lib/products/metrics";
import { getProductFulfillmentSummary } from "@/lib/shipping/fulfillment";
import { calculateContributionProfit, type EconomicsInputs } from "./calculate";
import type { MentorshipProductEconomics } from "@/types/database";

export interface AccountEconomicsSummary {
  productsIncluded: number;
  productsWithIncompleteEconomics: number;
  totalAdSpend: number;
  totalOrders: number;
  totalShipped: number;
  totalDelivered: number;
  totalNdr: number;
  totalRto: number;
  totalRevenue: number;
  totalContributionProfit: number | null; // null only if EVERY product lacks complete economics
}

function toEconomicsInputs(row: MentorshipProductEconomics | undefined): EconomicsInputs {
  return {
    sellingPriceMinor: row?.selling_price_minor ?? null,
    cogsMinor: row?.cogs_minor ?? null,
    shippingCostMinor: row?.shipping_cost_minor ?? null,
    codFeeMinor: row?.cod_fee_minor ?? null,
    packagingCostMinor: row?.packaging_cost_minor ?? null,
    otherVariableCostMinor: row?.other_variable_cost_minor ?? null,
    rtoCostMinor: row?.rto_cost_minor ?? null,
  };
}

export async function getAccountEconomicsSummary(
  supabase: SupabaseClient,
  enrollmentId: string,
  range: ResolvedDateRange
): Promise<AccountEconomicsSummary> {
  const [{ data: products }, { data: economicsRows }] = await Promise.all([
    supabase.from("mentorship_product_catalog").select("id").eq("enrollment_id", enrollmentId).eq("status", "active"),
    supabase.from("mentorship_product_economics").select("*").eq("enrollment_id", enrollmentId),
  ]);

  const economicsByProduct = new Map((economicsRows ?? []).map((r) => [r.product_catalog_id as string, r as MentorshipProductEconomics]));

  let totalAdSpend = 0;
  let totalOrders = 0;
  let totalShipped = 0;
  let totalDelivered = 0;
  let totalNdr = 0;
  let totalRto = 0;
  let totalRevenue = 0;
  let totalContributionProfit = 0;
  let anyComplete = false;
  let incompleteCount = 0;

  for (const product of products ?? []) {
    const productId = product.id as string;
    const [metrics, fulfillment] = await Promise.all([
      getProductMetrics(supabase, enrollmentId, productId, range),
      getProductFulfillmentSummary(supabase, enrollmentId, productId, range),
    ]);

    totalOrders += metrics.shopify.ordersCount;
    totalRevenue += metrics.shopify.revenue;
    totalAdSpend += metrics.meta.spend ?? 0;
    totalShipped += fulfillment.counts.shipped;
    totalDelivered += fulfillment.counts.delivered;
    totalNdr += fulfillment.counts.ndr;
    totalRto += fulfillment.counts.rto;

    const result = calculateContributionProfit({
      economics: toEconomicsInputs(economicsByProduct.get(productId)),
      revenue: metrics.shopify.revenue,
      unitsSold: metrics.shopify.unitsSold,
      ordersCount: metrics.shopify.ordersCount,
      rtoCount: fulfillment.counts.rto,
      adSpend: metrics.meta.spend,
    });

    if (result.contributionProfit != null) {
      totalContributionProfit += result.contributionProfit;
      anyComplete = true;
    } else {
      incompleteCount += 1;
    }
  }

  return {
    productsIncluded: products?.length ?? 0,
    productsWithIncompleteEconomics: incompleteCount,
    totalAdSpend,
    totalOrders,
    totalShipped,
    totalDelivered,
    totalNdr,
    totalRto,
    totalRevenue,
    totalContributionProfit: anyComplete ? totalContributionProfit : null,
  };
}
