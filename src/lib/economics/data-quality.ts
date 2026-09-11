// Reusable data-quality evaluator (Part L). The goal is singular: NEVER
// present a precise-looking profit/ROAS number when the underlying data is
// incomplete. Every check here produces a plain-language reason, never a
// silently-substituted default.
import type { EconomicsInputs } from "./calculate";

export type DataQualityLevel = "complete" | "incomplete" | "warning";

export interface DataQualityIssue {
  level: DataQualityLevel;
  message: string;
}

export interface DataQualityContext {
  economics: EconomicsInputs | null; // null if no economics row saved yet at all
  shopifyMapped: boolean;
  metaMapped: boolean;
  sellingPriceAmbiguous: boolean;
  hasAnyShippingData: boolean; // any shipping rows exist anywhere in this enrollment
  unresolvedFulfillmentCount: number; // this product's mapped orders with no resolved status
  metaSpend: number | null;
}

export function evaluateEconomicsDataQuality(ctx: DataQualityContext): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  if (!ctx.shopifyMapped) {
    issues.push({ level: "warning", message: "This product isn't mapped to a Shopify product yet — revenue/units will show as zero." });
  }
  if (!ctx.metaMapped) {
    issues.push({ level: "warning", message: "Meta ads are not mapped to this product — ad spend and ROAS will be unavailable." });
  }
  if (ctx.sellingPriceAmbiguous) {
    issues.push({ level: "warning", message: "Product has multiple variant prices; confirm selling price manually." });
  }

  const economics = ctx.economics;
  if (!economics || economics.sellingPriceMinor == null) {
    issues.push({ level: "incomplete", message: "Selling price required to calculate break-even ROAS." });
  }
  if (!economics || economics.cogsMinor == null) {
    issues.push({ level: "incomplete", message: "COGS required to calculate contribution profit." });
  }
  if (!economics || economics.shippingCostMinor == null) {
    issues.push({ level: "incomplete", message: "Shipping cost required." });
  }
  if (!economics || economics.codFeeMinor == null) {
    issues.push({ level: "incomplete", message: "COD fee required." });
  }
  if (!economics || economics.packagingCostMinor == null) {
    issues.push({ level: "incomplete", message: "Packaging cost required." });
  }
  if (!economics || economics.otherVariableCostMinor == null) {
    issues.push({ level: "incomplete", message: "Other variable cost required." });
  }
  if (!economics || economics.rtoCostMinor == null) {
    issues.push({ level: "incomplete", message: "RTO cost required for complete fulfillment economics." });
  }

  if (!ctx.hasAnyShippingData) {
    issues.push({ level: "incomplete", message: "Upload a shipping report to calculate actual delivery/RTO rates." });
  } else if (ctx.unresolvedFulfillmentCount > 0) {
    issues.push({
      level: "warning",
      message: `${ctx.unresolvedFulfillmentCount} order${ctx.unresolvedFulfillmentCount === 1 ? "" : "s"} for this product ${ctx.unresolvedFulfillmentCount === 1 ? "has" : "have"} no resolved fulfillment status yet.`,
    });
  }

  if (ctx.metaMapped && ctx.metaSpend == null) {
    issues.push({ level: "warning", message: "Not enough data to calculate Meta performance for this range." });
  }

  return issues;
}
