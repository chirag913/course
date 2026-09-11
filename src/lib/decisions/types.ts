import type { ProductDecisionState, ProductDecisionPriority } from "@/types/database";

export type ReasonCode =
  // Data-quality gate
  | "DATA_MISSING_SHOPIFY_MAPPING"
  | "DATA_MISSING_META_MAPPING"
  | "DATA_CURRENCY_UNSUPPORTED"
  | "DATA_MISSING_SELLING_PRICE"
  | "DATA_AMBIGUOUS_PRICE"
  | "DATA_MISSING_COGS"
  | "DATA_MISSING_SHIPPING"
  | "DATA_MISSING_COD"
  | "DATA_MISSING_PACKAGING"
  | "DATA_MISSING_OTHER_VARIABLE"
  | "DATA_MISSING_RTO"
  | "DATA_UNRESOLVED_FULFILLMENT"
  | "DATA_STALE"
  | "DATA_INSUFFICIENT"
  // Lifecycle
  | "PREVIOUSLY_PROFITABLE"
  // Sufficiency
  | "EARLY_TEST"
  | "INSUFFICIENT_SAMPLE"
  // Diagnostics
  | "CREATIVE_WEAK_CTR"
  | "CONVERSION_WEAK"
  | "FULFILLMENT_HIGH_RTO"
  | "FULFILLMENT_CRITICAL_RTO"
  // Economics
  | "ECONOMICS_POSITIVE"
  | "ECONOMICS_BELOW_BREAK_EVEN";

export interface DecisionResult {
  decision: ProductDecisionState;
  priority: ProductDecisionPriority;
  reasonCode: ReasonCode;
  why: string;
  nextAction: string;
  evidence: string[];
}

export interface DecisionEngineInput {
  product: {
    id: string;
    name: string;
    status: "active" | "archived";
  };
  shopify: {
    mapped: boolean;
    orders: number;
    units: number;
    revenue: number; // minor units
    sellingPriceCurrency: string;
  };
  meta: {
    mapped: boolean;
    spend: number | null; // minor units
    impressions: number | null;
    clicks: number | null;
    ctr: number | null; // percent
    cpc: number | null;
    purchases: number | null;
    purchaseValue: number | null; // minor units
  };
  economics: {
    sellingPriceMinor: number | null;
    sellingPriceAmbiguous: boolean;
    cogsMinor: number | null;
    shippingCostMinor: number | null;
    codFeeMinor: number | null;
    packagingCostMinor: number | null;
    otherVariableCostMinor: number | null;
    rtoCostMinor: number | null;
    contributionProfit: number | null; // Phase D's calculateContributionProfit() result
    breakEvenRoas: number | null; // Phase D's calculateBreakEvenRoas() result
  };
  fulfillment: {
    ordersCount: number;
    shipped: number;
    delivered: number;
    ndr: number;
    rto: number;
    unresolved: number;
    deliveryRate: number | null;
    rtoRate: number | null;
    hasAnyShippingData: boolean;
  };
  dataFreshness: {
    shopifyStale: boolean; // true if a successful sync is required but missing/stale
    metaStale: boolean;
  };
  lifecycle: {
    isActive: boolean; // product.status === 'active' AND has recent Shopify/Meta activity
    everHadPositiveContribution: boolean; // derived from this product's own decision history
    mostRecentPriorDecision: ProductDecisionState | null;
  };
}
