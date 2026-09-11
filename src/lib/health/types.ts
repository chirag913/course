import type { MentorshipTask } from "@/types/database";

// Phase G answers a different question than Phase E (product state) and
// Phase F (what to execute this week): "what is the state of the BUSINESS,
// and what's the single biggest thing that needs attention." See
// PHASE_G_ACCOUNT_HEALTH.md for the full architecture rationale.

export type AccountHealthStatus = "INSUFFICIENT_DATA" | "CRITICAL" | "AT_RISK" | "HEALTHY";

// Deliberately no numeric score — `reasons` is the entire explanation, each
// entry backed by a real count/threshold, never a hidden weighted sum.
export interface AccountHealthResult {
  status: AccountHealthStatus;
  reasons: string[];
}

export type PortfolioInsightKind =
  | "NO_ACTIVE_PRODUCTS"
  | "SCALING"
  | "NEEDS_ITERATION"
  | "BLOCKED_BY_DATA"
  | "KILL_CANDIDATES"
  | "TESTING"
  | "RTO_IS_BIGGEST_ISSUE"
  | "ECONOMICS_IS_BIGGEST_ISSUE";

export interface PortfolioInsight {
  kind: PortfolioInsightKind;
  count: number;
  text: string;
}

// The business-severity ranking Phase G introduces — intentionally distinct
// from Phase F's task-execution ranking (rankTaskCandidates/rankOf). See
// attention.ts for the full ordering rationale.
export type AttentionLevel =
  | "CRITICAL_DATA_BLOCKER"
  | "SEVERE_ECONOMICS"
  | "CRITICAL_FULFILLMENT"
  | "KILL"
  | "SCALE_OPPORTUNITY"
  | "RELAUNCH_OPPORTUNITY"
  | "ITERATE"
  | "TEST"
  | "MONITOR";

export interface AttentionBottleneck {
  level: AttentionLevel;
  productId: string | null;
  productName: string | null;
  what: string;
  why: string;
  nextAction: string;
  // The Phase F task this WHY/NEXT ACTION was reused from, verbatim — null
  // when no corresponding task exists yet and the decision's own text was
  // used instead (never a newly-authored recommendation).
  matchedTask: MentorshipTask | null;
}

export type ChangeKind =
  | "DECISION_CHANGED"
  | "NEWLY_EVALUATED"
  | "RTO_CROSSED_WARNING"
  | "RTO_CROSSED_CRITICAL"
  | "CONTRIBUTION_IMPROVED"
  | "CONTRIBUTION_WORSENED"
  | "TASK_COMPLETED"
  | "TASK_OVERDUE";

export interface ChangeSinceReview {
  kind: ChangeKind;
  productId: string | null;
  productName: string | null;
  detail: string;
}
