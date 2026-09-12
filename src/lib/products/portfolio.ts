import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedDateRange } from "./date-range";
import { getProductMetrics } from "./metrics";
import { getProductFulfillmentSummary } from "@/lib/shipping/fulfillment";
import { calculateContributionProfit, calculateBreakEvenRoas, calculateRoas } from "@/lib/economics/calculate";
import { resolveEffectiveDecision } from "@/lib/decisions/effective";
import type {
  MentorshipProductCatalog,
  MentorshipProductEconomics,
  MentorshipProductDecision,
  MentorshipProductDecisionOverride,
  ProductDecisionState,
  ProductDecisionPriority,
} from "@/types/database";

// One consolidated "product + decision + economics" summary, shared by the
// Products list page (Phase C) and the student/admin dashboards (Phase F)
// so there is exactly one place that combines these — never two different
// formulas answering "what's this product's ROAS/contribution/decision."
export interface ProductPortfolioEntry {
  product: MentorshipProductCatalog;
  effectiveDecision: ProductDecisionState | null;
  isOverridden: boolean;
  priority: ProductDecisionPriority | null;
  latestDecision: MentorshipProductDecision | null;
  activeOverride: MentorshipProductDecisionOverride | null;
  blendedRoas: number | null;
  breakEvenRoas: number | null;
  contributionProfit: number | null;
  rtoRate: number | null;
  revenue: number;
  ordersCount: number;
  adSpend: number | null;
  shopifyMapped: boolean;
  metaMapped: boolean;
}

export async function getProductPortfolio(
  supabase: SupabaseClient,
  enrollmentId: string,
  range: ResolvedDateRange,
  options: { statusFilter?: "active" | "archived" | "all" } = {}
): Promise<ProductPortfolioEntry[]> {
  const statusFilter = options.statusFilter ?? "active";

  let query = supabase.from("mentorship_product_catalog").select("*").eq("enrollment_id", enrollmentId).order("created_at", { ascending: false });
  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  const { data: productRows } = await query;
  const products = (productRows ?? []) as MentorshipProductCatalog[];
  if (products.length === 0) return [];

  const [{ data: economicsRows }, { data: decisionRows }, { data: overrideRows }] = await Promise.all([
    supabase.from("mentorship_product_economics").select("*").eq("enrollment_id", enrollmentId),
    supabase.from("mentorship_product_decisions").select("*").eq("enrollment_id", enrollmentId).order("created_at", { ascending: false }),
    supabase.from("mentorship_product_decision_overrides").select("*").eq("enrollment_id", enrollmentId).order("created_at", { ascending: false }),
  ]);

  const economicsByProduct = new Map((economicsRows ?? []).map((r) => [r.product_catalog_id as string, r as MentorshipProductEconomics]));
  const latestDecisionByProduct = new Map<string, MentorshipProductDecision>();
  for (const d of (decisionRows ?? []) as MentorshipProductDecision[]) {
    if (!latestDecisionByProduct.has(d.product_catalog_id)) latestDecisionByProduct.set(d.product_catalog_id, d);
  }
  const latestOverrideByProduct = new Map<string, MentorshipProductDecisionOverride>();
  for (const o of (overrideRows ?? []) as MentorshipProductDecisionOverride[]) {
    if (!latestOverrideByProduct.has(o.product_catalog_id)) latestOverrideByProduct.set(o.product_catalog_id, o);
  }

  return Promise.all(
    products.map(async (product) => {
      const [metrics, fulfillment] = await Promise.all([
        getProductMetrics(supabase, enrollmentId, product.id, range),
        getProductFulfillmentSummary(supabase, enrollmentId, product.id, range),
      ]);
      const economics = economicsByProduct.get(product.id);
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

      const latestDecision = latestDecisionByProduct.get(product.id) ?? null;
      const activeOverrideRow = latestOverrideByProduct.get(product.id) ?? null;
      const effective = resolveEffectiveDecision(latestDecision, activeOverrideRow);

      return {
        product,
        effectiveDecision: effective.effectiveDecision,
        isOverridden: effective.isOverridden,
        priority: latestDecision?.priority ?? null,
        latestDecision,
        activeOverride: effective.activeOverride,
        blendedRoas: roas.blendedRoas,
        breakEvenRoas: breakEven.value,
        contributionProfit: contribution.contributionProfit,
        rtoRate: fulfillment.rates.rtoRate,
        revenue: metrics.shopify.revenue,
        ordersCount: metrics.shopify.ordersCount,
        adSpend: metrics.meta.spend,
        shopifyMapped: metrics.shopifyMapped,
        metaMapped: metrics.metaMapped,
      };
    })
  );
}
