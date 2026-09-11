// Deterministic decision -> task mapping. Pure function, no DB access, no
// LLM. This module NEVER re-derives a product's decision — it only takes
// the ALREADY-RESOLVED effective decision (Phase E's
// resolveEffectiveDecision output) and its existing reasonCode/why/
// nextAction, and turns that into a task headline + dedup key. See
// PHASE_F_WEEKLY_TASKS.md "Decision -> task mapping" for the full rationale.
import type { MentorshipTaskPriority } from "@/types/database";
import type { ProductDecisionContext, TaskCandidate, TaskGenerationContext } from "./types";

// Short, concrete action headlines per reason code — this is the one place
// genuinely new to the task generator (Phase E's decisions carry a
// sentence-style `why`, not a task-style title). The why/nextAction text
// itself is always reused verbatim from the decision, never re-authored,
// so evidence-level specifics (exact CTR, spend, etc.) stay owned by the
// decision engine.
const DATA_TITLE_BY_REASON: Record<string, (productName: string) => string> = {
  DATA_MISSING_SELLING_PRICE: (p) => `Set the selling price for ${p}`,
  DATA_MISSING_COGS: (p) => `Add COGS for ${p}`,
  DATA_MISSING_SHIPPING: (p) => `Add shipping cost for ${p}`,
  DATA_MISSING_COD: (p) => `Add COD fee for ${p}`,
  DATA_MISSING_PACKAGING: (p) => `Add packaging cost for ${p}`,
  DATA_MISSING_OTHER_VARIABLE: (p) => `Add other variable cost for ${p}`,
  DATA_MISSING_RTO: (p) => `Add RTO cost for ${p}`,
  DATA_AMBIGUOUS_PRICE: (p) => `Confirm the selling price for ${p}`,
  DATA_MISSING_SHOPIFY_MAPPING: (p) => `Map ${p} to its Shopify product`,
  DATA_MISSING_META_MAPPING: (p) => `Map Meta ads to ${p}`,
  DATA_UNRESOLVED_FULFILLMENT: (p) => `Resolve fulfillment data for ${p}`,
  DATA_STALE: (p) => `Reconnect/resync data for ${p}`,
  DATA_INSUFFICIENT: (p) => `Get ${p} running (no data yet)`,
  DATA_CURRENCY_UNSUPPORTED: (p) => `Review currency setup for ${p}`,
};

const ITERATE_TITLE_BY_REASON: Record<string, (productName: string) => string> = {
  CREATIVE_WEAK_CTR: (p) => `Refresh ad creatives for ${p}`,
  CONVERSION_WEAK: (p) => `Improve the product page/offer for ${p}`,
  FULFILLMENT_HIGH_RTO: (p) => `Review fulfillment for ${p}`,
};

// Exported so Phase G's attention-priority module can find the exact task
// this enrollment-wide candidate produces (to reuse its why/next_action
// verbatim) without hardcoding the same literal a second time.
export const UNRESOLVED_FULFILLMENT_DEDUP_KEY = "fulfillment:unresolved";

function isoWeekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
export function currentIsoWeek(now: Date = new Date()): string {
  return isoWeekOf(now);
}

function candidateForProduct(ctx: ProductDecisionContext, isoWeek: string): TaskCandidate | null {
  const { productId, productName, effectiveDecision, reasonCode, why, nextAction } = ctx;
  if (!effectiveDecision || !why || !nextAction) return null;

  switch (effectiveDecision) {
    case "DATA_NEEDED": {
      const titleFn = (reasonCode && DATA_TITLE_BY_REASON[reasonCode]) || ((p: string) => `Fix missing data for ${p}`);
      const isFulfillment = reasonCode === "DATA_UNRESOLVED_FULFILLMENT";
      return {
        title: titleFn(productName),
        description: null,
        why,
        nextAction,
        priority: "high",
        source: isFulfillment ? "FULFILLMENT" : "DATA_QUALITY",
        productCatalogId: productId,
        reasonCode,
        dedupKey: `data:${productId}:${reasonCode ?? "unknown"}`,
      };
    }

    case "TEST":
      return {
        title: `Continue testing ${productName}`,
        description: null,
        why,
        nextAction,
        priority: "low",
        source: "DECISION_ENGINE",
        productCatalogId: productId,
        reasonCode,
        // Weekly cadence, not per-run — re-evaluating the same product
        // mid-week must not spawn a second "continue testing" task.
        dedupKey: `test:${productId}:${isoWeek}`,
      };

    case "WATCH":
      return {
        title: `Monitor ${productName}`,
        description: null,
        why,
        nextAction,
        priority: "low",
        source: "DECISION_ENGINE",
        productCatalogId: productId,
        reasonCode,
        dedupKey: `watch:${productId}:${isoWeek}`,
      };

    case "ITERATE": {
      const titleFn = (reasonCode && ITERATE_TITLE_BY_REASON[reasonCode]) || ((p: string) => `Investigate ${p}`);
      const priority: MentorshipTaskPriority = reasonCode === "FULFILLMENT_HIGH_RTO" ? "high" : "medium";
      return {
        title: titleFn(productName),
        description: null,
        why,
        nextAction,
        priority,
        source: reasonCode === "FULFILLMENT_HIGH_RTO" ? "FULFILLMENT" : "DECISION_ENGINE",
        productCatalogId: productId,
        reasonCode,
        // Not week-scoped — the same structural issue shouldn't spawn a
        // fresh task every week while it remains unresolved.
        dedupKey: `iterate:${productId}:${reasonCode ?? "unknown"}`,
      };
    }

    case "SCALE":
      return {
        title: `Scale ${productName} gradually`,
        description: null,
        why,
        nextAction,
        priority: "low",
        source: "DECISION_ENGINE",
        productCatalogId: productId,
        reasonCode,
        // Not week-scoped — one nudge per scale verdict. A NEW one only
        // appears once the student completes/skips this one AND the
        // product is (re-)evaluated as SCALE again — never a standing
        // weekly reminder to "increase spend."
        dedupKey: `scale:${productId}`,
      };

    case "RELAUNCH":
      return {
        title: `Prepare a relaunch test for ${productName}`,
        description: null,
        why,
        nextAction,
        priority: "medium",
        source: "DECISION_ENGINE",
        productCatalogId: productId,
        reasonCode,
        dedupKey: `relaunch:${productId}`,
      };

    case "KILL":
      return {
        title: `Stop spend on ${productName}`,
        description: null,
        why,
        nextAction,
        priority: "high",
        source: "DECISION_ENGINE",
        productCatalogId: productId,
        reasonCode,
        dedupKey: `kill:${productId}`,
      };

    default:
      return null;
  }
}

export function generateTaskCandidates(context: TaskGenerationContext): TaskCandidate[] {
  const candidates: TaskCandidate[] = [];

  for (const product of context.products) {
    const candidate = candidateForProduct(product, context.isoWeek);
    if (candidate) candidates.push(candidate);
  }

  // Enrollment-wide fulfillment task — distinct from any single product's
  // DATA_UNRESOLVED_FULFILLMENT (which is that product's own ratio); this
  // one is Phase D's account-wide "orders absent from every shipping
  // report" list (never assumed to be RTO — see PHASE_D_ECONOMICS_SHIPPING.md).
  if (context.unresolvedFulfillmentCount > 0) {
    candidates.push({
      title: `Review ${context.unresolvedFulfillmentCount} unresolved shipping order${context.unresolvedFulfillmentCount === 1 ? "" : "s"}`,
      description: null,
      why: "Fulfillment data is incomplete and may affect RTO/profitability.",
      nextAction: "Upload the latest shipping report, or classify these orders manually.",
      priority: context.unresolvedFulfillmentCount >= 20 ? "high" : "medium",
      source: "FULFILLMENT",
      productCatalogId: null,
      reasonCode: "DATA_UNRESOLVED_FULFILLMENT",
      dedupKey: UNRESOLVED_FULFILLMENT_DEDUP_KEY,
    });
  }

  // Accountability nudge — only when there's something to actually flag,
  // never a standing weekly filler.
  if (context.incompleteTasksFromLastWeek > 0) {
    candidates.push({
      title: `Follow up on last week's unfinished tasks`,
      description: null,
      why: `${context.incompleteTasksFromLastWeek} task${context.incompleteTasksFromLastWeek === 1 ? "" : "s"} from last week ${context.incompleteTasksFromLastWeek === 1 ? "wasn't" : "weren't"} completed.`,
      nextAction: "Review and finish, or explicitly skip, last week's remaining tasks.",
      priority: "medium",
      source: "ACCOUNTABILITY",
      productCatalogId: null,
      reasonCode: null,
      dedupKey: `accountability:${context.isoWeek}`,
    });
  }

  return candidates;
}

// Deterministic priority ranking for Weekly Focus selection (Part K/W)
// order: DATA_NEEDED blockers > KILL/SCALE/RELAUNCH > severe fulfillment >
// ITERATE > TEST > WATCH. Generalized over a minimal shape so both
// freshly-generated candidates (always have a dedupKey) and persisted rows
// read back from the DB (a mentor-created task may have no dedup_key at
// all) can share exactly one ranking implementation.
export interface RankableTask {
  source: string;
  reasonCode: string | null;
  priority: MentorshipTaskPriority;
  dedupKey: string | null;
}

function rankOf(task: RankableTask): number {
  const key = task.dedupKey ?? "";
  if (task.source === "DATA_QUALITY" || key.startsWith("data:")) return 0;
  if (key.startsWith("kill:") || key.startsWith("scale:") || key.startsWith("relaunch:")) return 1;
  if (task.reasonCode === "FULFILLMENT_HIGH_RTO" && task.priority === "high") return 2;
  if (task.source === "FULFILLMENT") return 3;
  if (key.startsWith("iterate:")) return 4;
  if (key.startsWith("test:")) return 5;
  if (key.startsWith("watch:")) return 6;
  // Mentor-created tasks (no generated dedup key): Phase H makes the
  // mentor's own priority genuinely drive execution rank, rather than a
  // flat tier regardless of intent. HIGH sits alongside kill/scale/relaunch
  // (tier 1) — a mentor can put something above even data-quality blockers'
  // neighbors when they judge it urgent enough. MEDIUM keeps Phase F's
  // original default (tier 4, alongside plain ITERATE) so existing mentor
  // tasks are unaffected. LOW sits alongside WATCH (tier 6).
  if (task.source === "MENTOR") {
    if (task.priority === "high") return 1;
    if (task.priority === "low") return 6;
    return 4;
  }
  return 4;
}

export function rankTaskCandidates<T extends RankableTask>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => rankOf(a) - rankOf(b));
}

export const MAX_WEEKLY_FOCUS_TASKS = 5;
export const PREFERRED_WEEKLY_FOCUS_TASKS = 4;

export function selectWeeklyFocus<T extends { priority: MentorshipTaskPriority }>(rankedTasks: T[]): T[] {
  // Prefer 3-4; only extend to 5 if there's a 5th HIGH-priority item that
  // would otherwise be dropped — never pad the list with low-value filler
  // just to reach a round number.
  const preferred = rankedTasks.slice(0, PREFERRED_WEEKLY_FOCUS_TASKS);
  const fifth = rankedTasks[PREFERRED_WEEKLY_FOCUS_TASKS];
  if (fifth && fifth.priority === "high" && preferred.length === PREFERRED_WEEKLY_FOCUS_TASKS) {
    return [...preferred, fifth];
  }
  return preferred;
}
