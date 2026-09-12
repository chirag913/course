"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getProductMetrics } from "@/lib/products/metrics";
import { getProductFulfillmentSummary } from "@/lib/shipping/fulfillment";
import { calculateContributionProfit, calculateBreakEvenRoas, calculateRoas } from "@/lib/economics/calculate";
import { resolveEffectiveDecision } from "@/lib/decisions/effective";
import { resolveDateRange, type DateRangePreset } from "@/lib/products/date-range";
import type {
  MentorshipProductCatalog,
  MentorshipProductDecision,
  MentorshipProductDecisionOverride,
  MentorshipProductEconomics,
} from "@/types/database";

export interface ProductDetailForMentor {
  product: MentorshipProductCatalog;
  economics: MentorshipProductEconomics | null;
  metrics: Awaited<ReturnType<typeof getProductMetrics>>;
  fulfillment: Awaited<ReturnType<typeof getProductFulfillmentSummary>>;
  breakEvenRoas: number | null;
  blendedRoas: number | null;
  metaRoas: number | null;
  contributionProfit: number | null;
  decisionHistory: MentorshipProductDecision[];
  overrideHistory: MentorshipProductDecisionOverride[];
  effectiveDecision: ReturnType<typeof resolveEffectiveDecision>;
}

// Fetched on demand when the mentor opens a product's detail drawer — never
// pre-loaded for every product on the main dashboard render (see
// PHASE_ instructions on performance: load history only when opened).
// Read-only: reuses the exact same calculation functions the student's own
// product page and getProductPortfolio use, so numbers never disagree.
export async function getProductDetailForMentor(
  enrollmentId: string,
  productId: string,
  rangePreset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): Promise<ProductDetailForMentor | null> {
  await requireAdmin();
  const supabase = await createClient();
  const range = resolveDateRange(rangePreset, customStart && customEnd ? { start: customStart, end: customEnd } : undefined);

  const { data: productRow } = await supabase
    .from("mentorship_product_catalog")
    .select("*")
    .eq("id", productId)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  if (!productRow) return null;
  const product = productRow as MentorshipProductCatalog;

  const [{ data: economicsRow }, metrics, fulfillment, { data: decisionRows }, { data: overrideRows }] = await Promise.all([
    supabase.from("mentorship_product_economics").select("*").eq("enrollment_id", enrollmentId).eq("product_catalog_id", productId).maybeSingle(),
    getProductMetrics(supabase, enrollmentId, productId, range),
    getProductFulfillmentSummary(supabase, enrollmentId, productId, range),
    supabase.from("mentorship_product_decisions").select("*").eq("enrollment_id", enrollmentId).eq("product_catalog_id", productId).order("created_at", { ascending: false }),
    supabase.from("mentorship_product_decision_overrides").select("*").eq("enrollment_id", enrollmentId).eq("product_catalog_id", productId).order("created_at", { ascending: false }),
  ]);

  const economics = (economicsRow ?? null) as MentorshipProductEconomics | null;
  const economicsInputs = {
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
  const roas = calculateRoas({ metaSpend: metrics.meta.spend, metaPurchaseValue: metrics.meta.purchaseValue, shopifyRevenue: metrics.shopify.revenue });

  const decisionHistory = (decisionRows ?? []) as MentorshipProductDecision[];
  const overrideHistory = (overrideRows ?? []) as MentorshipProductDecisionOverride[];
  const effectiveDecision = resolveEffectiveDecision(decisionHistory[0] ?? null, overrideHistory[0] ?? null);

  return {
    product,
    economics,
    metrics,
    fulfillment,
    breakEvenRoas: breakEven.value,
    blendedRoas: roas.blendedRoas,
    metaRoas: roas.metaRoas,
    contributionProfit: contribution.contributionProfit,
    decisionHistory,
    overrideHistory,
    effectiveDecision,
  };
}
