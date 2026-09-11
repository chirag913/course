// Pure account-health assessment. No DB access, no LLM, no numeric score —
// a categorical status plus the exact real-data reasons that triggered it.
// See PHASE_G_ACCOUNT_HEALTH.md "Account health methodology."
import { formatCurrency } from "@/lib/utils";
import { RTO_RATE_CRITICAL_PERCENT, RTO_RATE_WARNING_PERCENT } from "@/lib/decisions/constants";
import type { ProductPortfolioEntry } from "@/lib/products/portfolio";
import type { AccountEconomicsSummary } from "@/lib/economics/account";
import type { AccountHealthResult } from "./types";

export interface AccountHealthInput {
  portfolio: ProductPortfolioEntry[]; // active products only (getProductPortfolio's own default filter)
  economics: AccountEconomicsSummary;
  overdueTaskCount: number;
}

// A product counts as "genuinely evaluated" only once the engine has moved
// past DATA_NEEDED (nothing can be said) and TEST (explicitly "still
// gathering enough data to judge" per the engine's own EARLY_TEST reason —
// see engine.ts). Reusing that existing semantic distinction rather than
// inventing a new "is this data enough" rule is what makes "a healthy
// status requires genuinely sufficient evaluated data" true instead of
// aspirational.
function isGenuinelyEvaluated(decision: ProductPortfolioEntry["effectiveDecision"]): boolean {
  return decision != null && decision !== "DATA_NEEDED" && decision !== "TEST";
}

export function assessAccountHealth(input: AccountHealthInput): AccountHealthResult {
  const { portfolio, economics, overdueTaskCount } = input;

  if (portfolio.length === 0) {
    return { status: "INSUFFICIENT_DATA", reasons: ["No active products yet — nothing to assess."] };
  }

  const dataNeeded = portfolio.filter((p) => p.effectiveDecision === "DATA_NEEDED");
  const evaluated = portfolio.filter((p) => isGenuinelyEvaluated(p.effectiveDecision));

  if (evaluated.length === 0) {
    return {
      status: "INSUFFICIENT_DATA",
      reasons: [
        portfolio.length === 1
          ? "The only active product doesn't have enough data for a decision yet."
          : `None of ${portfolio.length} active products have enough data for a real decision yet (all are DATA_NEEDED or still early-stage testing).`,
      ],
    };
  }

  // ---- CRITICAL gates -------------------------------------------------
  const criticalReasons: string[] = [];

  const killStillSpending = portfolio.filter((p) => p.effectiveDecision === "KILL" && (p.adSpend ?? 0) > 0);
  if (killStillSpending.length > 0) {
    criticalReasons.push(
      `${killStillSpending.length} product${killStillSpending.length === 1 ? "" : "s"} marked KILL ${killStillSpending.length === 1 ? "is" : "are"} still receiving ad spend: ${killStillSpending.map((p) => p.product.name).join(", ")}.`
    );
  }

  if (economics.totalContributionProfit != null && economics.totalContributionProfit < 0) {
    criticalReasons.push(`Portfolio contribution profit is negative (${formatCurrency(economics.totalContributionProfit, "INR")}).`);
  }

  const criticalRto = portfolio.filter((p) => p.rtoRate != null && p.rtoRate >= RTO_RATE_CRITICAL_PERCENT);
  if (criticalRto.length > 0) {
    criticalReasons.push(
      `${criticalRto.length} product${criticalRto.length === 1 ? "" : "s"} ${criticalRto.length === 1 ? "has" : "have"} an RTO rate at or above the critical threshold (${RTO_RATE_CRITICAL_PERCENT}%): ${criticalRto.map((p) => p.product.name).join(", ")}.`
    );
  }

  const majorityBlocked = dataNeeded.length / portfolio.length > 0.5;
  if (majorityBlocked) {
    criticalReasons.push(`${dataNeeded.length} of ${portfolio.length} active products are blocked on missing data — most of the portfolio can't be evaluated at all.`);
  }

  if (criticalReasons.length > 0) {
    return { status: "CRITICAL", reasons: criticalReasons };
  }

  // ---- AT_RISK gates ----------------------------------------------------
  const atRiskReasons: string[] = [];

  if (economics.productsWithIncompleteEconomics > 0) {
    atRiskReasons.push(
      `${economics.productsWithIncompleteEconomics} of ${economics.productsIncluded} product${economics.productsIncluded === 1 ? "" : "s"} have incomplete economics — portfolio profit may be understated.`
    );
  }

  const warningRto = portfolio.filter((p) => p.rtoRate != null && p.rtoRate >= RTO_RATE_WARNING_PERCENT && p.rtoRate < RTO_RATE_CRITICAL_PERCENT);
  if (warningRto.length > 0) {
    atRiskReasons.push(
      `${warningRto.length} product${warningRto.length === 1 ? "" : "s"} ${warningRto.length === 1 ? "is" : "are"} in the RTO warning range (${RTO_RATE_WARNING_PERCENT}–${RTO_RATE_CRITICAL_PERCENT}%): ${warningRto.map((p) => p.product.name).join(", ")}.`
    );
  }

  if (overdueTaskCount > 0) {
    atRiskReasons.push(`${overdueTaskCount} task${overdueTaskCount === 1 ? " is" : "s are"} overdue.`);
  }

  const iterating = portfolio.filter((p) => p.effectiveDecision === "ITERATE");
  if (iterating.length > 0) {
    atRiskReasons.push(`${iterating.length} product${iterating.length === 1 ? " needs" : "s need"} iteration: ${iterating.map((p) => p.product.name).join(", ")}.`);
  }

  if (dataNeeded.length > 0) {
    atRiskReasons.push(`${dataNeeded.length} product${dataNeeded.length === 1 ? " is" : "s are"} still blocked on missing data: ${dataNeeded.map((p) => p.product.name).join(", ")}.`);
  }

  if (atRiskReasons.length > 0) {
    return { status: "AT_RISK", reasons: atRiskReasons };
  }

  return {
    status: "HEALTHY",
    reasons: [`${evaluated.length} of ${portfolio.length} active product${portfolio.length === 1 ? "" : "s"} evaluated with no critical or at-risk signals.`],
  };
}
