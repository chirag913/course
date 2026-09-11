// V1 PRODUCT-ENGINE HEURISTICS. Every threshold here is a deliberate,
// documented starting point for THIS platform's decision engine — none of
// these are industry benchmarks, and all are meant to be revisited as v2+
// once real usage data exists. See PHASE_E_DECISION_ENGINE.md.
export const ENGINE_VERSION = "v1";

// Amounts are in INR minor units (paise) — this is the only currency the
// engine can safely reason about in V1. A product configured in any other
// currency cannot have these thresholds applied without a real conversion
// rate, which this platform doesn't have; see engine.ts's currency gate.
export const MIN_TEST_SPEND_MINOR = 200_000; // ₹2,000
export const MIN_DECISION_SPEND_MINOR = 500_000; // ₹5,000
export const MIN_PURCHASES_FOR_ECONOMIC_DECISION = 3;
export const DECISION_CURRENCY = "INR";

// Creative/CTR diagnostic
export const WEAK_CTR_PERCENT = 1.0;
export const MIN_IMPRESSIONS_FOR_CTR_DIAGNOSTIC = 1000;

// Click -> purchase conversion diagnostic
export const MIN_CLICKS_FOR_CONVERSION_DIAGNOSTIC = 100;
export const WEAK_PURCHASE_RATE_PERCENT = 0.5;

// Fulfillment / RTO diagnostics
export const RTO_RATE_WARNING_PERCENT = 20;
export const RTO_RATE_CRITICAL_PERCENT = 30;
export const MIN_ORDERS_FOR_RTO_DIAGNOSTIC = 10;

// A Shopify order absent from every shipping report (Phase D) is never
// assumed to be anything — but if TOO MANY of a product's orders are in
// that state, no fulfillment-dependent conclusion can be trusted at all.
export const MAX_UNRESOLVED_FULFILLMENT_RATIO = 0.15; // 15%

// How old a required successful sync (Phase B) can be before the engine
// refuses to treat that provider's data as current.
export const STALE_DATA_HOURS = 24;
