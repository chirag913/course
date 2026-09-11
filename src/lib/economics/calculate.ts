// Pure calculation functions — no DB access. See
// PHASE_D_ECONOMICS_SHIPPING.md "Contribution profit" and "Break-even
// ROAS" for the full derivation and the reasoning behind every judgment
// call made here (especially how RTO is folded in differently between the
// two calculations).

export interface EconomicsInputs {
  sellingPriceMinor: number | null;
  cogsMinor: number | null; // per unit
  shippingCostMinor: number | null; // per order
  codFeeMinor: number | null; // per order
  packagingCostMinor: number | null; // per order
  otherVariableCostMinor: number | null; // per order
  rtoCostMinor: number | null; // per RTO'd order
}

export interface ContributionProfitInputs {
  economics: EconomicsInputs;
  revenue: number; // actual Shopify revenue in the selected range (minor units)
  unitsSold: number;
  ordersCount: number;
  rtoCount: number; // ACTUAL RTO'd orders observed in the range (from fulfillment data)
  adSpend: number | null; // Meta spend in range; null if no Meta ads mapped / no data
}

export interface ContributionProfitResult {
  revenue: number;
  adSpend: number | null;
  cogsTotal: number | null;
  shippingTotal: number | null;
  codTotal: number | null;
  packagingTotal: number | null;
  otherVariableTotal: number | null;
  rtoTotal: number | null;
  contributionProfit: number | null;
  missingInputs: string[];
}

// Contribution Profit = Revenue − COGS − Shipping − COD − Packaging −
// Other variable − RTO costs − Ad spend, using the ACTUAL observed
// rtoCount for this date range (not a rate-based estimate) — this
// calculation describes what actually happened, so it uses real counts
// wherever they exist.
export function calculateContributionProfit(input: ContributionProfitInputs): ContributionProfitResult {
  const { economics, revenue, unitsSold, ordersCount, rtoCount, adSpend } = input;
  const missingInputs: string[] = [];

  function totalOrNull(perUnitOrOrder: number | null, multiplier: number, label: string): number | null {
    if (perUnitOrOrder == null) {
      missingInputs.push(label);
      return null;
    }
    return perUnitOrOrder * multiplier;
  }

  const cogsTotal = totalOrNull(economics.cogsMinor, unitsSold, "COGS");
  const shippingTotal = totalOrNull(economics.shippingCostMinor, ordersCount, "Shipping cost");
  const codTotal = totalOrNull(economics.codFeeMinor, ordersCount, "COD fee");
  const packagingTotal = totalOrNull(economics.packagingCostMinor, ordersCount, "Packaging cost");
  const otherVariableTotal = totalOrNull(economics.otherVariableCostMinor, ordersCount, "Other variable cost");
  const rtoTotal = totalOrNull(economics.rtoCostMinor, rtoCount, "RTO cost");
  if (adSpend == null) missingInputs.push("Meta ad spend (map at least one ad to this product)");

  const contributionProfit =
    missingInputs.length === 0
      ? revenue -
        (cogsTotal as number) -
        (shippingTotal as number) -
        (codTotal as number) -
        (packagingTotal as number) -
        (otherVariableTotal as number) -
        (rtoTotal as number) -
        (adSpend as number)
      : null;

  return { revenue, adSpend, cogsTotal, shippingTotal, codTotal, packagingTotal, otherVariableTotal, rtoTotal, contributionProfit, missingInputs };
}

export interface BreakEvenRoasResult {
  value: number | null;
  contributionBeforeAdsPerOrder: number | null;
  expectedRtoCostPerOrder: number | null;
  reason: string | null;
}

// Break-even ROAS is UNIT ECONOMICS — it answers "what ROAS do I need on
// the next order," so it's computed from the persistent per-unit/per-order
// cost inputs directly, not from any date-range's aggregate revenue.
//
// RTO cost is configured as a cost PER RTO'D ORDER (a fact, not every
// order becomes one) — so folding it into a single hypothetical order's
// economics requires an RTO RATE (an expected value), not the raw cost:
//   expectedRtoCostPerOrder = rtoCostMinor × (rtoRatePercent / 100)
// That rate comes from real observed shipping data (Part H's fulfillment
// summary) for the selected date range — this is the one place a
// "persistent configuration" number and "date-range dependent" data mix,
// and it's why break-even ROAS is unavailable without real shipping data:
// assuming rtoRate = 0 would be inventing a number, which Part J explicitly
// forbids.
export function calculateBreakEvenRoas(economics: EconomicsInputs, rtoRatePercent: number | null): BreakEvenRoasResult {
  const empty = { value: null, contributionBeforeAdsPerOrder: null, expectedRtoCostPerOrder: null };

  if (economics.sellingPriceMinor == null) return { ...empty, reason: "Selling price is required." };
  if (economics.cogsMinor == null) return { ...empty, reason: "COGS is required." };
  if (economics.shippingCostMinor == null) return { ...empty, reason: "Shipping cost is required." };
  if (economics.codFeeMinor == null) return { ...empty, reason: "COD fee is required." };
  if (economics.packagingCostMinor == null) return { ...empty, reason: "Packaging cost is required." };
  if (economics.otherVariableCostMinor == null) return { ...empty, reason: "Other variable cost is required." };
  if (economics.rtoCostMinor == null) return { ...empty, reason: "RTO cost is required." };
  if (rtoRatePercent == null) {
    return { ...empty, reason: "Break-even ROAS unavailable — RTO economics incomplete. Upload shipping data to calculate an accurate RTO rate." };
  }

  const expectedRtoCostPerOrder = Math.round(economics.rtoCostMinor * (rtoRatePercent / 100));
  const contributionBeforeAdsPerOrder =
    economics.sellingPriceMinor -
    economics.cogsMinor -
    economics.shippingCostMinor -
    economics.codFeeMinor -
    economics.packagingCostMinor -
    economics.otherVariableCostMinor -
    expectedRtoCostPerOrder;

  if (contributionBeforeAdsPerOrder <= 0) {
    return {
      value: null,
      contributionBeforeAdsPerOrder,
      expectedRtoCostPerOrder,
      reason: "Break-even ROAS unavailable — contribution before ads is zero or negative at these costs.",
    };
  }

  return {
    value: economics.sellingPriceMinor / contributionBeforeAdsPerOrder,
    contributionBeforeAdsPerOrder,
    expectedRtoCostPerOrder,
    reason: null,
  };
}

export interface RoasResult {
  metaRoas: number | null; // Meta purchase value ÷ Meta spend — "attributed" ROAS Meta itself reports
  blendedRoas: number | null; // Shopify revenue ÷ Meta spend — actual business revenue against ad spend
}

// These two numbers answer different questions and are never allowed to
// silently stand in for each other — see PHASE_D_ECONOMICS_SHIPPING.md
// "Meta ROAS vs blended ROAS."
export function calculateRoas(params: { metaSpend: number | null; metaPurchaseValue: number | null; shopifyRevenue: number }): RoasResult {
  const hasSpend = params.metaSpend != null && params.metaSpend > 0;
  return {
    metaRoas: hasSpend && params.metaPurchaseValue != null ? params.metaPurchaseValue / (params.metaSpend as number) : null,
    blendedRoas: hasSpend ? params.shopifyRevenue / (params.metaSpend as number) : null,
  };
}
