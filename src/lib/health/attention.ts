// Pure business-attention ranking — deliberately SEPARATE from Phase F's
// task-execution ranking (tasks/generate.ts rankTaskCandidates/rankOf).
// That ranking answers "what should the student act on first" and
// intentionally ties KILL/SCALE/RELAUNCH together (all three just need
// action). This ranking answers a different question — "what is the single
// biggest BUSINESS problem right now" — so a severe, still-unresolved
// economics or fulfillment problem on a product that ISN'T decisively KILL
// yet outranks a product that's already been decided KILL and is simply
// awaiting execution (that one already has a clear, visible task). See
// PHASE_G_ACCOUNT_HEALTH.md "Attention priority methodology."
//
// This module makes NO decisions of its own — it only classifies and sorts
// products by their ALREADY-RESOLVED effectiveDecision (Phase E) and
// already-computed economics/fulfillment numbers (Phase C/D via
// getProductPortfolio). It never disagrees with Phase E about what a
// product's state is.
import { formatCurrency } from "@/lib/utils";
import { RTO_RATE_CRITICAL_PERCENT } from "@/lib/decisions/constants";
import { UNRESOLVED_FULFILLMENT_DEDUP_KEY } from "@/lib/tasks/generate";
import type { ProductPortfolioEntry } from "@/lib/products/portfolio";
import type { MentorshipTask } from "@/types/database";
import type { AttentionBottleneck, AttentionLevel } from "./types";

export interface AttentionInput {
  portfolio: ProductPortfolioEntry[];
  openTasks: MentorshipTask[]; // enrollment's open (TODO/IN_PROGRESS) tasks, any source
  unresolvedFulfillmentCount: number; // enrollment-wide, same signal Phase F's generator uses
}

const LEVEL_ORDER: Record<AttentionLevel, number> = {
  CRITICAL_DATA_BLOCKER: 0,
  SEVERE_ECONOMICS: 1,
  CRITICAL_FULFILLMENT: 2,
  KILL: 3,
  SCALE_OPPORTUNITY: 4,
  RELAUNCH_OPPORTUNITY: 5,
  ITERATE: 6,
  TEST: 7,
  MONITOR: 8,
};

function classifyProduct(entry: ProductPortfolioEntry): AttentionLevel | null {
  const decision = entry.effectiveDecision;
  if (!decision) return null; // never evaluated yet — nothing to say, never fabricate a problem

  if (decision === "DATA_NEEDED") return "CRITICAL_DATA_BLOCKER";
  if (decision === "KILL") return "KILL"; // already the most decisive outcome; already flagged, already has a task

  // A product NOT yet decided KILL that's still bleeding money, or still
  // showing a critical RTO rate, is an unresolved, unflagged problem —
  // surfaced ABOVE its nominal decision state (WATCH/ITERATE/etc.).
  if (entry.contributionProfit != null && entry.contributionProfit < 0) return "SEVERE_ECONOMICS";
  if (entry.rtoRate != null && entry.rtoRate >= RTO_RATE_CRITICAL_PERCENT) return "CRITICAL_FULFILLMENT";

  if (decision === "SCALE") return "SCALE_OPPORTUNITY";
  if (decision === "RELAUNCH") return "RELAUNCH_OPPORTUNITY";
  if (decision === "ITERATE") return "ITERATE";
  if (decision === "TEST") return "TEST";
  return "MONITOR"; // WATCH
}

function buildProductBottleneck(entry: ProductPortfolioEntry, level: AttentionLevel, openTasks: MentorshipTask[]): AttentionBottleneck {
  const decision = entry.latestDecision;
  // Phase F's supersession logic guarantees at most one open, non-mentor,
  // product-linked task reflects this product's CURRENT decision at any
  // time — so this lookup, not a re-derived dedup key, is what "the task
  // that corresponds to this bottleneck" means.
  const matchedTask = openTasks.find((t) => t.product_catalog_id === entry.product.id && t.source !== "MENTOR") ?? null;

  const decisionWhy = entry.isOverridden && entry.activeOverride ? `Mentor override: ${entry.activeOverride.override_reason}` : (decision?.why ?? "");
  const decisionNextAction = decision?.next_action ?? "";

  if (matchedTask) {
    return {
      level,
      productId: entry.product.id,
      productName: entry.product.name,
      what: matchedTask.title,
      why: matchedTask.why ?? decisionWhy,
      nextAction: matchedTask.next_action ?? decisionNextAction,
      matchedTask,
    };
  }

  // No task exists yet (e.g. generation hasn't run since this decision, or
  // the task was already completed/skipped) — expose the decision's own
  // already-computed why/next_action rather than inventing new copy. For
  // the two levels that reclassify a product ABOVE its nominal decision
  // state, append the real number that justifies the elevated urgency.
  let why = decisionWhy;
  if (level === "SEVERE_ECONOMICS" && entry.contributionProfit != null) {
    why = `${decisionWhy} (Contribution profit: ${formatCurrency(entry.contributionProfit, "INR")}.)`;
  } else if (level === "CRITICAL_FULFILLMENT" && entry.rtoRate != null) {
    why = `${decisionWhy} (RTO rate: ${entry.rtoRate.toFixed(1)}%.)`;
  }

  return {
    level,
    productId: entry.product.id,
    productName: entry.product.name,
    what: `${entry.product.name} — ${(entry.effectiveDecision ?? "").replace("_", " ")}`,
    why,
    nextAction: decisionNextAction,
    matchedTask: null,
  };
}

function buildFulfillmentBottleneck(unresolvedFulfillmentCount: number, openTasks: MentorshipTask[]): AttentionBottleneck {
  const matchedTask = openTasks.find((t) => t.product_catalog_id === null && t.dedup_key === UNRESOLVED_FULFILLMENT_DEDUP_KEY) ?? null;
  const level: AttentionLevel = unresolvedFulfillmentCount >= 20 ? "CRITICAL_DATA_BLOCKER" : "CRITICAL_FULFILLMENT";
  const fallbackWhy = `${unresolvedFulfillmentCount} order${unresolvedFulfillmentCount === 1 ? " has" : "s have"} no shipping status recorded at all — fulfillment/RTO economics for the account can't be fully trusted.`;
  const fallbackNextAction = "Upload the latest shipping report, or classify these orders manually.";

  return {
    level,
    productId: null,
    productName: null,
    what: matchedTask?.title ?? `${unresolvedFulfillmentCount} unresolved shipping order${unresolvedFulfillmentCount === 1 ? "" : "s"}`,
    why: matchedTask?.why ?? fallbackWhy,
    nextAction: matchedTask?.next_action ?? fallbackNextAction,
    matchedTask,
  };
}

// Returns the full ranked list — index 0 is the single primary bottleneck
// for the dashboard's "Primary Business Focus" section; the rest are
// available for the mentor briefing's "products requiring attention."
export function rankBusinessAttention(input: AttentionInput): AttentionBottleneck[] {
  const candidates: AttentionBottleneck[] = [];

  for (const entry of input.portfolio) {
    const level = classifyProduct(entry);
    if (!level) continue;
    candidates.push(buildProductBottleneck(entry, level, input.openTasks));
  }

  if (input.unresolvedFulfillmentCount > 0) {
    candidates.push(buildFulfillmentBottleneck(input.unresolvedFulfillmentCount, input.openTasks));
  }

  return candidates.sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    if (levelDiff !== 0) return levelDiff;
    return (a.productName ?? "").localeCompare(b.productName ?? "");
  });
}
