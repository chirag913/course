import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedDateRange } from "@/lib/products/date-range";
import { getProductMetrics } from "@/lib/products/metrics";
import { getProductFulfillmentSummary } from "@/lib/shipping/fulfillment";
import { calculateContributionProfit, calculateBreakEvenRoas, type EconomicsInputs } from "@/lib/economics/calculate";
import { getShopifySuggestedSellingPrice } from "@/lib/economics/selling-price";
import { STALE_DATA_HOURS } from "./constants";
import type { DecisionEngineInput } from "./types";
import type { MentorshipProductCatalog, MentorshipProductEconomics, ProductDecisionState } from "@/types/database";

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

// Gathers everything the pure engine needs, reusing Phase C's product
// metrics/fulfillment aggregation and Phase D's economics calculations
// exactly as-is — this function does no calculation of its own beyond
// wiring those existing results together.
export async function buildDecisionEngineInput(
  supabase: SupabaseClient,
  enrollmentId: string,
  productCatalogId: string,
  range: ResolvedDateRange
): Promise<DecisionEngineInput> {
  const [{ data: productRow }, { data: economicsRow }, metrics, fulfillment, priceSuggestion, { data: syncRows }, { data: pastDecisions }] = await Promise.all([
    supabase.from("mentorship_product_catalog").select("*").eq("id", productCatalogId).eq("enrollment_id", enrollmentId).single(),
    supabase.from("mentorship_product_economics").select("*").eq("enrollment_id", enrollmentId).eq("product_catalog_id", productCatalogId).maybeSingle(),
    getProductMetrics(supabase, enrollmentId, productCatalogId, range),
    getProductFulfillmentSummary(supabase, enrollmentId, productCatalogId, range),
    getShopifySuggestedSellingPrice(supabase, enrollmentId, productCatalogId),
    supabase
      .from("mentorship_data_syncs")
      .select("provider, last_successful_sync_at")
      .eq("enrollment_id", enrollmentId)
      .not("last_successful_sync_at", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("mentorship_product_decisions")
      .select("decision, reason_code, created_at")
      .eq("enrollment_id", enrollmentId)
      .eq("product_catalog_id", productCatalogId)
      .order("created_at", { ascending: false }),
  ]);

  const product = productRow as MentorshipProductCatalog;
  const economics = economicsRow as MentorshipProductEconomics | null;

  const economicsInputs: EconomicsInputs = {
    sellingPriceMinor: economics?.selling_price_minor ?? null,
    cogsMinor: economics?.cogs_minor ?? null,
    shippingCostMinor: economics?.shipping_cost_minor ?? null,
    codFeeMinor: economics?.cod_fee_minor ?? null,
    packagingCostMinor: economics?.packaging_cost_minor ?? null,
    otherVariableCostMinor: economics?.other_variable_cost_minor ?? null,
    rtoCostMinor: economics?.rto_cost_minor ?? null,
  };

  const contribution = calculateContributionProfit({
    economics: economicsInputs,
    revenue: metrics.shopify.revenue,
    unitsSold: metrics.shopify.unitsSold,
    ordersCount: metrics.shopify.ordersCount,
    rtoCount: fulfillment.counts.rto,
    adSpend: metrics.meta.spend,
  });
  const breakEven = calculateBreakEvenRoas(economicsInputs, fulfillment.rates.rtoRate);

  const lastSyncByProvider = new Map<string, string>();
  for (const row of syncRows ?? []) {
    if (!lastSyncByProvider.has(row.provider) && row.last_successful_sync_at) {
      lastSyncByProvider.set(row.provider, row.last_successful_sync_at as string);
    }
  }
  function isStale(provider: string, required: boolean): boolean {
    if (!required) return false;
    const hours = hoursSince(lastSyncByProvider.get(provider) ?? null);
    return hours == null || hours > STALE_DATA_HOURS;
  }

  const everHadPositiveContribution = (pastDecisions ?? []).some((d) => d.reason_code === "ECONOMICS_POSITIVE");
  const mostRecentPriorDecision = (pastDecisions?.[0]?.decision as ProductDecisionState | undefined) ?? null;

  const isActive = product.status === "active" && (metrics.shopify.ordersCount > 0 || (metrics.meta.spend ?? 0) > 0);

  return {
    product: { id: product.id, name: product.name, status: product.status },
    shopify: {
      mapped: metrics.shopifyMapped,
      orders: metrics.shopify.ordersCount,
      units: metrics.shopify.unitsSold,
      revenue: metrics.shopify.revenue,
      sellingPriceCurrency: economics?.selling_price_currency ?? "INR",
    },
    meta: {
      mapped: metrics.metaMapped,
      spend: metrics.meta.spend,
      impressions: metrics.meta.impressions,
      clicks: metrics.meta.clicks,
      ctr: metrics.meta.ctr,
      cpc: metrics.meta.cpc,
      purchases: metrics.meta.purchases,
      purchaseValue: metrics.meta.purchaseValue,
    },
    economics: {
      sellingPriceMinor: economicsInputs.sellingPriceMinor,
      // Ambiguity only matters when there's no SAVED price to fall back on —
      // once a student has explicitly saved a manual price, that resolves
      // the ambiguity regardless of what Shopify's variants still show.
      sellingPriceAmbiguous: economicsInputs.sellingPriceMinor == null && priceSuggestion.ambiguous,
      cogsMinor: economicsInputs.cogsMinor,
      shippingCostMinor: economicsInputs.shippingCostMinor,
      codFeeMinor: economicsInputs.codFeeMinor,
      packagingCostMinor: economicsInputs.packagingCostMinor,
      otherVariableCostMinor: economicsInputs.otherVariableCostMinor,
      rtoCostMinor: economicsInputs.rtoCostMinor,
      contributionProfit: contribution.contributionProfit,
      breakEvenRoas: breakEven.value,
    },
    fulfillment: {
      ordersCount: fulfillment.counts.ordersCount,
      shipped: fulfillment.counts.shipped,
      delivered: fulfillment.counts.delivered,
      ndr: fulfillment.counts.ndr,
      rto: fulfillment.counts.rto,
      unresolved: fulfillment.counts.unresolved,
      deliveryRate: fulfillment.rates.deliveryRate,
      rtoRate: fulfillment.rates.rtoRate,
      hasAnyShippingData: !fulfillment.rates.insufficientData,
    },
    dataFreshness: {
      shopifyStale: isStale("shopify", metrics.shopifyMapped),
      metaStale: isStale("meta", metrics.metaMapped),
    },
    lifecycle: {
      isActive,
      everHadPositiveContribution,
      mostRecentPriorDecision,
    },
  };
}
