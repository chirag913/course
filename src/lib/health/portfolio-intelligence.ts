// Pure portfolio-level insight generation. Every sentence is a template
// filled with a real count from getProductPortfolio()/
// getAccountEconomicsSummary() — never a fabricated observation, never a
// generic motivational line. See PHASE_G_ACCOUNT_HEALTH.md "Portfolio
// intelligence methodology."
import { RTO_RATE_WARNING_PERCENT } from "@/lib/decisions/constants";
import type { ProductPortfolioEntry } from "@/lib/products/portfolio";
import type { AccountEconomicsSummary } from "@/lib/economics/account";
import type { PortfolioInsight } from "./types";

export function summarizePortfolio(portfolio: ProductPortfolioEntry[], economics: AccountEconomicsSummary): PortfolioInsight[] {
  if (portfolio.length === 0) {
    return [{ kind: "NO_ACTIVE_PRODUCTS", count: 0, text: "No active products yet." }];
  }

  const insights: PortfolioInsight[] = [];

  const scaling = portfolio.filter((p) => p.effectiveDecision === "SCALE" && p.contributionProfit != null && p.contributionProfit > 0);
  if (scaling.length > 0) {
    insights.push({
      kind: "SCALING",
      count: scaling.length,
      text: `${scaling.length} product${scaling.length === 1 ? " is" : "s are"} profitable and scaling.`,
    });
  }

  const iterating = portfolio.filter((p) => p.effectiveDecision === "ITERATE");
  if (iterating.length > 0) {
    insights.push({
      kind: "NEEDS_ITERATION",
      count: iterating.length,
      text: `${iterating.length} product${iterating.length === 1 ? " needs" : "s need"} iteration (${iterating.map((p) => p.product.name).join(", ")}).`,
    });
  }

  const blocked = portfolio.filter((p) => p.effectiveDecision === "DATA_NEEDED");
  if (blocked.length > 0) {
    insights.push({
      kind: "BLOCKED_BY_DATA",
      count: blocked.length,
      text: `${blocked.length} product${blocked.length === 1 ? " cannot" : "s cannot"} be evaluated yet because economics or mapping data is incomplete.`,
    });
  }

  const killCandidates = portfolio.filter((p) => p.effectiveDecision === "KILL");
  if (killCandidates.length > 0) {
    insights.push({
      kind: "KILL_CANDIDATES",
      count: killCandidates.length,
      text: `${killCandidates.length} product${killCandidates.length === 1 ? " is" : "s are"} recommended to stop spending on (${killCandidates.map((p) => p.product.name).join(", ")}).`,
    });
  }

  const testing = portfolio.filter((p) => p.effectiveDecision === "TEST");
  if (testing.length > 0) {
    insights.push({
      kind: "TESTING",
      count: testing.length,
      text: `${testing.length} product${testing.length === 1 ? " is" : "s are"} still early-stage testing.`,
    });
  }

  // "Biggest blocker" — compare two real counts (products with incomplete
  // economics vs. products at/above the RTO warning threshold) and name
  // whichever is strictly larger. If they're tied (including both zero),
  // no statement is made — never invent a winner the data doesn't support.
  const rtoIssueCount = portfolio.filter((p) => p.rtoRate != null && p.rtoRate >= RTO_RATE_WARNING_PERCENT).length;
  const incompleteEconomicsCount = economics.productsWithIncompleteEconomics;
  if (incompleteEconomicsCount > rtoIssueCount && incompleteEconomicsCount > 0) {
    insights.push({
      kind: "ECONOMICS_IS_BIGGEST_ISSUE",
      count: incompleteEconomicsCount,
      text: `Your largest current blocker is incomplete product economics (${incompleteEconomicsCount} of ${economics.productsIncluded}).`,
    });
  } else if (rtoIssueCount > incompleteEconomicsCount && rtoIssueCount > 0) {
    insights.push({
      kind: "RTO_IS_BIGGEST_ISSUE",
      count: rtoIssueCount,
      text: `RTO is currently the biggest fulfillment issue (${rtoIssueCount} product${rtoIssueCount === 1 ? "" : "s"} at or above ${RTO_RATE_WARNING_PERCENT}% RTO).`,
    });
  }

  return insights;
}
