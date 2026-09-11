// Pure "what changed since the last review" diffing. Uses ONLY data that
// already exists: mentorship_product_decisions is append-only (Phase E
// never mutates it) and mentorship_product_decision_overrides likewise, so
// comparing "latest as of now" against "latest as of the review cutoff" is
// enough — no snapshot table needed. Decision transitions are computed via
// Phase E's OWN resolveEffectiveDecision() fed two different points in
// time, so an override-driven change (e.g. a mentor overriding KILL to
// WATCH) is correctly detected too, without a second effective-decision
// concept. RTO/contribution drift reuses the existing range-parameterized
// fulfillment/economics functions called twice (current range vs. a range
// ending at the review cutoff), not a new aggregation. See
// PHASE_G_ACCOUNT_HEALTH.md "Change detection methodology."
import { formatCurrency } from "@/lib/utils";
import { RTO_RATE_CRITICAL_PERCENT, RTO_RATE_WARNING_PERCENT } from "@/lib/decisions/constants";
import { resolveEffectiveDecision } from "@/lib/decisions/effective";
import type { AccountEconomicsSummary } from "@/lib/economics/account";
import type { MentorshipProductDecision, MentorshipProductDecisionOverride, MentorshipTask } from "@/types/database";
import type { ChangeSinceReview } from "./types";

// V1, documented threshold — purely a noise filter (a ₹3 wobble isn't worth
// a mentor's attention), not a re-derivation of any business rule. Expected
// to be revisited once real usage data exists, exactly like the decision
// engine's own thresholds in decisions/constants.ts.
export const MATERIAL_CONTRIBUTION_CHANGE_MINOR = 100_000; // ₹1,000

export interface ChangeDetectionInput {
  decisionHistoryByProduct: Map<string, MentorshipProductDecision[]>; // DESC by created_at, FULL history per product
  overrideHistoryByProduct: Map<string, MentorshipProductDecisionOverride[]>; // DESC by created_at, FULL history per product
  productNameById: Map<string, string>;
  cutoffIso: string;
  currentRtoRateByProduct: Map<string, number | null>;
  previousRtoRateByProduct: Map<string, number | null>;
  currentEconomics: AccountEconomicsSummary;
  previousEconomics: AccountEconomicsSummary;
  tasksCompletedSinceCutoff: MentorshipTask[];
  tasksOverdueNow: MentorshipTask[];
}

function latestAsOf<T extends { created_at: string }>(rowsDesc: T[], cutoffIso: string): T | null {
  return rowsDesc.find((r) => r.created_at <= cutoffIso) ?? null;
}

export function getChangesSinceLastReview(input: ChangeDetectionInput): ChangeSinceReview[] {
  const changes: ChangeSinceReview[] = [];

  const productIds = new Set<string>([...input.decisionHistoryByProduct.keys(), ...input.overrideHistoryByProduct.keys()]);

  for (const productId of productIds) {
    const decisions = input.decisionHistoryByProduct.get(productId) ?? [];
    const overrides = input.overrideHistoryByProduct.get(productId) ?? [];
    if (decisions.length === 0) continue; // never evaluated at all — nothing to diff
    const productName = input.productNameById.get(productId) ?? "Unknown product";

    const nowEffective = resolveEffectiveDecision(decisions[0] ?? null, overrides[0] ?? null).effectiveDecision;
    const decisionAsOfCutoff = latestAsOf(decisions, input.cutoffIso);
    const overrideAsOfCutoff = latestAsOf(overrides, input.cutoffIso);

    if (!decisionAsOfCutoff) {
      // Only worth flagging if the product's FIRST-ever decision happened
      // after the cutoff — otherwise a product with a long history but no
      // recent activity would show as "newly evaluated" every time.
      if (nowEffective && decisions[decisions.length - 1]!.created_at > input.cutoffIso) {
        changes.push({
          kind: "NEWLY_EVALUATED",
          productId,
          productName,
          detail: `${productName} was evaluated for the first time: ${nowEffective.replace("_", " ")}.`,
        });
      }
      continue;
    }

    const previousEffective = resolveEffectiveDecision(decisionAsOfCutoff, overrideAsOfCutoff).effectiveDecision;
    if (nowEffective && previousEffective !== nowEffective) {
      changes.push({
        kind: "DECISION_CHANGED",
        productId,
        productName,
        detail: `${productName} moved from ${(previousEffective ?? "no decision").replace("_", " ")} to ${nowEffective.replace("_", " ")}.`,
      });
    }
  }

  for (const [productId, currentRto] of input.currentRtoRateByProduct) {
    if (currentRto == null) continue;
    const previousRto = input.previousRtoRateByProduct.get(productId) ?? null;
    const productName = input.productNameById.get(productId) ?? "Unknown product";

    if (currentRto >= RTO_RATE_CRITICAL_PERCENT && (previousRto == null || previousRto < RTO_RATE_CRITICAL_PERCENT)) {
      changes.push({
        kind: "RTO_CROSSED_CRITICAL",
        productId,
        productName,
        detail: `${productName}'s RTO rate crossed the critical threshold (${RTO_RATE_CRITICAL_PERCENT}%) — now ${currentRto.toFixed(1)}%.`,
      });
    } else if (currentRto >= RTO_RATE_WARNING_PERCENT && (previousRto == null || previousRto < RTO_RATE_WARNING_PERCENT)) {
      changes.push({
        kind: "RTO_CROSSED_WARNING",
        productId,
        productName,
        detail: `${productName}'s RTO rate crossed the warning threshold (${RTO_RATE_WARNING_PERCENT}%) — now ${currentRto.toFixed(1)}%.`,
      });
    }
  }

  const { currentEconomics, previousEconomics } = input;
  if (currentEconomics.totalContributionProfit != null && previousEconomics.totalContributionProfit != null) {
    const delta = currentEconomics.totalContributionProfit - previousEconomics.totalContributionProfit;
    if (Math.abs(delta) >= MATERIAL_CONTRIBUTION_CHANGE_MINOR) {
      changes.push({
        kind: delta > 0 ? "CONTRIBUTION_IMPROVED" : "CONTRIBUTION_WORSENED",
        productId: null,
        productName: null,
        detail: `Portfolio contribution profit ${delta > 0 ? "improved" : "worsened"} by ${formatCurrency(Math.abs(delta), "INR")} since the last review.`,
      });
    }
  }

  for (const task of input.tasksCompletedSinceCutoff) {
    changes.push({
      kind: "TASK_COMPLETED",
      productId: task.product_catalog_id,
      productName: task.product_catalog_id ? (input.productNameById.get(task.product_catalog_id) ?? null) : null,
      detail: `Completed: "${task.title}".`,
    });
  }

  // "Currently overdue," not "became overdue since the last review" — there
  // is no historical snapshot of overdue status, so this states only what
  // can actually be verified right now rather than a fabricated timeline.
  for (const task of input.tasksOverdueNow) {
    changes.push({
      kind: "TASK_OVERDUE",
      productId: task.product_catalog_id,
      productName: task.product_catalog_id ? (input.productNameById.get(task.product_catalog_id) ?? null) : null,
      detail: `Currently overdue: "${task.title}"${task.due_date ? ` (due ${task.due_date})` : ""}.`,
    });
  }

  return changes;
}
