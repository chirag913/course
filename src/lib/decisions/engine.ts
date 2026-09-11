// The deterministic product decision engine. Pure function, no DB/network
// access, no LLM — testable in complete isolation from Next.js. See
// PHASE_E_DECISION_ENGINE.md for the full rationale behind every rule and
// threshold here; comments in this file cover only the "why this specific
// branch," not the whole design.
import { formatCurrency } from "@/lib/utils";
import {
  ENGINE_VERSION,
  DECISION_CURRENCY,
  MIN_TEST_SPEND_MINOR,
  MIN_DECISION_SPEND_MINOR,
  MIN_PURCHASES_FOR_ECONOMIC_DECISION,
  WEAK_CTR_PERCENT,
  MIN_IMPRESSIONS_FOR_CTR_DIAGNOSTIC,
  MIN_CLICKS_FOR_CONVERSION_DIAGNOSTIC,
  WEAK_PURCHASE_RATE_PERCENT,
  RTO_RATE_WARNING_PERCENT,
  RTO_RATE_CRITICAL_PERCENT,
  MIN_ORDERS_FOR_RTO_DIAGNOSTIC,
  MAX_UNRESOLVED_FULFILLMENT_RATIO,
} from "./constants";
import type { DecisionEngineInput, DecisionResult, ReasonCode } from "./types";

export { ENGINE_VERSION };

function money(minor: number | null): string {
  return minor == null ? "—" : formatCurrency(minor, DECISION_CURRENCY);
}
function pct(value: number | null, digits = 2): string {
  return value == null ? "—" : `${value.toFixed(digits)}%`;
}

function dataNeeded(reasonCode: ReasonCode, why: string, nextAction: string, evidence: string[]): DecisionResult {
  return { decision: "DATA_NEEDED", priority: "high", reasonCode, why, nextAction, evidence };
}

// ----------------------------------------------------------------------------
// STEP 1: DATA QUALITY GATE — returns the first blocking issue found, in a
// fixed, documented order. Minor warnings (handled elsewhere, e.g. Phase
// D's own data-quality evaluator on the product page) never reach here;
// only issues that make ANY responsible decision impossible do.
// ----------------------------------------------------------------------------
function runDataQualityGate(input: DecisionEngineInput): DecisionResult | null {
  const { shopify, meta, economics, fulfillment, dataFreshness } = input;

  if (!shopify.mapped) {
    return dataNeeded(
      "DATA_MISSING_SHOPIFY_MAPPING",
      "This product isn't mapped to a Shopify product yet, so revenue and units can't be measured.",
      "Map this product to its Shopify product on the Mapping tab.",
      []
    );
  }
  if (!meta.mapped) {
    return dataNeeded(
      "DATA_MISSING_META_MAPPING",
      "This product has no Meta ads mapped, so advertising performance can't be evaluated.",
      "Map this product's Meta ads before evaluating advertising performance.",
      []
    );
  }
  if (shopify.sellingPriceCurrency !== DECISION_CURRENCY) {
    return dataNeeded(
      "DATA_CURRENCY_UNSUPPORTED",
      `This product's currency (${shopify.sellingPriceCurrency}) isn't ${DECISION_CURRENCY} — the engine's thresholds can't be safely converted without a real exchange rate, so no decision can be made.`,
      "Currency-aware decisions aren't supported yet for non-INR products.",
      []
    );
  }
  if (economics.sellingPriceAmbiguous) {
    return dataNeeded(
      "DATA_AMBIGUOUS_PRICE",
      "This product has multiple different variant prices in Shopify, so a single selling price can't be inferred.",
      "Set the selling price manually on the Economics tab.",
      []
    );
  }
  if (economics.sellingPriceMinor == null) {
    return dataNeeded("DATA_MISSING_SELLING_PRICE", "Selling price is missing, so unit economics can't be calculated.", "Enter the product's selling price.", []);
  }
  if (economics.cogsMinor == null) {
    return dataNeeded("DATA_MISSING_COGS", "COGS is missing, so contribution profit cannot be trusted.", "Enter the product's COGS.", []);
  }
  if (economics.shippingCostMinor == null) {
    return dataNeeded(
      "DATA_MISSING_SHIPPING",
      "Shipping cost is missing, so product-level contribution economics are incomplete.",
      "Enter the product's shipping cost per order.",
      []
    );
  }
  if (economics.codFeeMinor == null) {
    return dataNeeded("DATA_MISSING_COD", "COD fee is missing, so contribution profit cannot be trusted.", "Enter the product's COD fee per order.", []);
  }
  if (economics.packagingCostMinor == null) {
    return dataNeeded("DATA_MISSING_PACKAGING", "Packaging cost is missing, so contribution profit cannot be trusted.", "Enter the product's packaging cost per order.", []);
  }
  if (economics.otherVariableCostMinor == null) {
    return dataNeeded(
      "DATA_MISSING_OTHER_VARIABLE",
      "Other variable cost is missing, so contribution profit cannot be trusted.",
      "Enter the product's other variable cost per order (or 0 if none).",
      []
    );
  }
  if (economics.rtoCostMinor == null) {
    return dataNeeded("DATA_MISSING_RTO", "RTO economics are incomplete.", "Enter the product's RTO cost per returned order.", []);
  }

  if (fulfillment.ordersCount > 0) {
    const unresolvedRatio = fulfillment.unresolved / fulfillment.ordersCount;
    if (unresolvedRatio > MAX_UNRESOLVED_FULFILLMENT_RATIO) {
      return dataNeeded(
        "DATA_UNRESOLVED_FULFILLMENT",
        `${fulfillment.unresolved} of ${fulfillment.ordersCount} orders still need fulfillment classification — that's too many to trust a delivery/RTO-based conclusion.`,
        "Upload the latest shipping report, or classify the unresolved orders.",
        [`Unresolved: ${fulfillment.unresolved} of ${fulfillment.ordersCount} orders (${(unresolvedRatio * 100).toFixed(0)}%)`]
      );
    }
  }

  if (dataFreshness.shopifyStale || dataFreshness.metaStale) {
    const which = [dataFreshness.shopifyStale && "Shopify", dataFreshness.metaStale && "Meta"].filter(Boolean).join(" and ");
    return dataNeeded(
      "DATA_STALE",
      `${which} data hasn't synced recently enough to trust for a decision right now.`,
      "Sync your connections and try again.",
      []
    );
  }

  // A product with zero current activity but real HISTORY (it previously
  // had positive economics, or was previously evaluated at all) is not
  // "no data" — it's a RELAUNCH candidate, and STEP 2 needs the chance to
  // recognize that before this falls through to a generic "not enough
  // data" message.
  const hasAnyHistory = input.lifecycle.everHadPositiveContribution || input.lifecycle.mostRecentPriorDecision != null;
  if (shopify.orders === 0 && (meta.spend ?? 0) === 0 && !hasAnyHistory) {
    return dataNeeded("DATA_INSUFFICIENT", "Not enough data yet.", "Start running ads or making sales for this product before evaluating it.", []);
  }

  return null;
}

// ----------------------------------------------------------------------------
// STEP 2: PRODUCT STATE / LIFECYCLE — RELAUNCH candidacy
// ----------------------------------------------------------------------------
function checkRelaunch(input: DecisionEngineInput): DecisionResult | null {
  const { lifecycle } = input;
  if (lifecycle.isActive) return null;
  if (!lifecycle.everHadPositiveContribution) return null;
  if (lifecycle.mostRecentPriorDecision === "KILL") return null; // don't flip-flop on a recent kill

  return {
    decision: "RELAUNCH",
    priority: "medium",
    reasonCode: "PREVIOUSLY_PROFITABLE",
    why: "This product previously demonstrated viable economics but is no longer active.",
    nextAction: "Consider relaunching the product with a fresh creative/offer test.",
    evidence: [],
  };
}

// ----------------------------------------------------------------------------
// STEPS 3-6: economic / fulfillment / ad / conversion health signals
// ----------------------------------------------------------------------------
interface HealthSignals {
  blendedRoas: number | null;
  hasSufficientSpendForTest: boolean;
  hasSufficientForDecision: boolean;
  creativeIssue: boolean;
  conversionIssue: boolean;
  fulfillmentWarning: boolean;
  fulfillmentCritical: boolean;
  scaleConditionsMet: boolean;
  killConditionsMet: boolean;
}

function computeHealthSignals(input: DecisionEngineInput): HealthSignals {
  const { shopify, meta, economics, fulfillment } = input;
  const spend = meta.spend ?? 0;
  const purchases = meta.purchases ?? 0;

  const blendedRoas = spend > 0 ? shopify.revenue / spend : null;

  const hasSufficientSpendForTest = spend >= MIN_TEST_SPEND_MINOR;
  const hasSufficientForDecision = spend >= MIN_DECISION_SPEND_MINOR && purchases >= MIN_PURCHASES_FOR_ECONOMIC_DECISION;

  const creativeIssue =
    meta.ctr != null && meta.impressions != null && meta.impressions >= MIN_IMPRESSIONS_FOR_CTR_DIAGNOSTIC && meta.ctr < WEAK_CTR_PERCENT;

  const purchaseRate = meta.clicks && meta.clicks > 0 ? ((meta.purchases ?? 0) / meta.clicks) * 100 : null;
  const conversionIssue =
    meta.clicks != null && meta.clicks >= MIN_CLICKS_FOR_CONVERSION_DIAGNOSTIC && purchaseRate != null && purchaseRate < WEAK_PURCHASE_RATE_PERCENT;

  const rtoDiagnosticEligible = fulfillment.rtoRate != null && fulfillment.ordersCount >= MIN_ORDERS_FOR_RTO_DIAGNOSTIC;
  const fulfillmentWarning = rtoDiagnosticEligible && (fulfillment.rtoRate as number) >= RTO_RATE_WARNING_PERCENT;
  const fulfillmentCritical = rtoDiagnosticEligible && (fulfillment.rtoRate as number) >= RTO_RATE_CRITICAL_PERCENT;

  const contributionPositive = economics.contributionProfit != null && economics.contributionProfit > 0;
  const contributionNegative = economics.contributionProfit != null && economics.contributionProfit < 0;
  const aboveBreakEven = blendedRoas != null && economics.breakEvenRoas != null && blendedRoas > economics.breakEvenRoas;
  const belowBreakEven = blendedRoas != null && economics.breakEvenRoas != null && blendedRoas < economics.breakEvenRoas;

  // SCALE requires fulfillment to be genuinely known-acceptable — literally
  // unknown fulfillment (no shipping data) is not "acceptable," it's
  // "unassessed," so it fails this condition rather than passing by default.
  const fulfillmentAcceptableForScale = fulfillment.hasAnyShippingData && rtoDiagnosticEligible && !fulfillmentWarning;

  const scaleConditionsMet = hasSufficientForDecision && contributionPositive && aboveBreakEven && fulfillmentAcceptableForScale;

  // KILL deliberately does NOT require fulfillment data — a product can be
  // killed on pure economics alone; RTO problems get ITERATE, never KILL,
  // unless economics independently fail too (see the pipeline below).
  const killConditionsMet = hasSufficientForDecision && contributionNegative && belowBreakEven;

  return {
    blendedRoas,
    hasSufficientSpendForTest,
    hasSufficientForDecision,
    creativeIssue,
    conversionIssue,
    fulfillmentWarning,
    fulfillmentCritical,
    scaleConditionsMet,
    killConditionsMet,
  };
}

function evidenceFor(input: DecisionEngineInput, signals: HealthSignals): string[] {
  const { meta, fulfillment } = input;
  const lines: string[] = [`Spend: ${money(meta.spend)}`];
  if (meta.ctr != null) lines.push(`CTR: ${pct(meta.ctr)}`);
  if (meta.clicks != null) lines.push(`Clicks: ${meta.clicks}`);
  if (meta.purchases != null) lines.push(`Purchases: ${meta.purchases}`);
  if (signals.blendedRoas != null) lines.push(`Blended ROAS: ${signals.blendedRoas.toFixed(2)}x`);
  if (input.economics.breakEvenRoas != null) lines.push(`Break-even ROAS: ${input.economics.breakEvenRoas.toFixed(2)}x`);
  if (input.economics.contributionProfit != null) lines.push(`Contribution profit: ${money(input.economics.contributionProfit)}`);
  if (fulfillment.rtoRate != null) lines.push(`RTO rate: ${pct(fulfillment.rtoRate, 1)}`);
  return lines;
}

function diagnosticResult(signals: HealthSignals, evidence: string[]): DecisionResult | null {
  // Order matters: fulfillment (highest real-money impact) before creative
  // before conversion. A specific, diagnosable acquisition/fulfillment
  // problem is reported even when there isn't yet enough spend/purchases
  // for a full economic verdict — CTR and RTO are visible from ad/shipment
  // volume alone, independent of the purchase-count threshold (Part L/Part
  // G both diagnose from their own data, not from "enough purchases").
  if (signals.fulfillmentCritical) {
    return {
      decision: "ITERATE",
      priority: "high",
      reasonCode: "FULFILLMENT_HIGH_RTO",
      why: "Acquisition may be working, but fulfillment economics are hurting the product.",
      nextAction: "Fix COD confirmation, courier/serviceability, shipping process, or offer.",
      evidence,
    };
  }
  if (signals.creativeIssue) {
    return {
      decision: "ITERATE",
      priority: "medium",
      reasonCode: "CREATIVE_WEAK_CTR",
      why: "Ads are not generating enough clicks.",
      nextAction: "Test new creatives/hooks before increasing spend.",
      evidence,
    };
  }
  if (signals.conversionIssue) {
    return {
      decision: "ITERATE",
      priority: "medium",
      reasonCode: "CONVERSION_WEAK",
      why: "People are clicking, but the offer/product page is not converting strongly enough.",
      nextAction: "Improve the product page, offer, price, trust, or checkout experience.",
      evidence,
    };
  }
  return null;
}

// ----------------------------------------------------------------------------
// STEPS 7-9: DECISION + WHY + NEXT ACTION
//
// Evaluation order (documented precisely — this is NOT the same as the
// tie-break priority list in PHASE_E_DECISION_ENGINE.md "Decision
// precedence", which describes final output priority, not the order rules
// are checked in):
//
//   data quality -> lifecycle/relaunch -> [if enough data for a strong
//   decision: catastrophic-economics KILL check, then diagnostics, then
//   SCALE] -> [otherwise: diagnostics anyway, then WATCH/TEST fallback]
//
// KILL is checked before the diagnostics so genuinely catastrophic
// economics can override a merely-explanatory diagnostic (Part L).
// Diagnostics are checked before SCALE so the engine never recommends
// scaling through an unresolved structural problem (Part K). Diagnostics
// are ALSO checked even when overall spend/purchases aren't yet enough for
// a full economic verdict, because a weak CTR or a high RTO rate is
// diagnosable from ad/shipment volume alone — this is what makes "weak
// CTR with enough impressions, but not enough purchases yet" correctly
// return ITERATE instead of a generic TEST/WATCH.
// ----------------------------------------------------------------------------
export function evaluateProductDecision(input: DecisionEngineInput): DecisionResult {
  const gateResult = runDataQualityGate(input);
  if (gateResult) return gateResult;

  const relaunch = checkRelaunch(input);
  if (relaunch) return relaunch;

  const signals = computeHealthSignals(input);
  const evidence = evidenceFor(input, signals);

  if (signals.hasSufficientForDecision) {
    if (signals.killConditionsMet) {
      return {
        decision: "KILL",
        priority: "high",
        reasonCode: "ECONOMICS_BELOW_BREAK_EVEN",
        why: "After sufficient testing, the product is not meeting its break-even economics.",
        nextAction: "Stop spend and move to the next product.",
        evidence,
      };
    }

    const diagnostic = diagnosticResult(signals, evidence);
    if (diagnostic) return diagnostic;

    if (signals.scaleConditionsMet) {
      return {
        decision: "SCALE",
        priority: "low",
        reasonCode: "ECONOMICS_POSITIVE",
        why: "Product economics are positive and performance is above break-even.",
        nextAction: "Increase spend gradually while monitoring ROAS, CPA, and RTO.",
        evidence,
      };
    }

    // Sufficient data, but no clear SCALE/KILL/diagnostic condition applies
    // (e.g. ROAS close to break-even, or fulfillment visibility
    // incomplete) — borderline, not yet a structural call.
    return {
      decision: "WATCH",
      priority: "medium",
      reasonCode: "ECONOMICS_BELOW_BREAK_EVEN",
      why: "Currently close to break-even, but the evidence isn't strong enough for a scaling or kill decision.",
      nextAction: "Keep spend controlled and collect more data.",
      evidence,
    };
  }

  // Not yet enough spend/purchases for a full economic verdict — but a
  // specific, diagnosable problem can still be surfaced from ad/shipment
  // data alone (Part L/CASE 5).
  const diagnostic = diagnosticResult(signals, evidence);
  if (diagnostic) return diagnostic;

  if (!signals.hasSufficientSpendForTest) {
    return {
      decision: "TEST",
      priority: "low",
      reasonCode: "EARLY_TEST",
      why: "Still gathering enough data to judge the product.",
      nextAction: "Continue the test until there is enough data for a reliable decision.",
      evidence,
    };
  }

  return {
    decision: "WATCH",
    priority: "medium",
    reasonCode: "INSUFFICIENT_SAMPLE",
    why: "There's meaningful activity, but not yet enough spend or purchases for a reliable economic decision.",
    nextAction: "Keep spend controlled and collect more data.",
    evidence,
  };
}
