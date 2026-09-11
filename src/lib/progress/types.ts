import type { AccountEconomicsSummary } from "@/lib/economics/account";
import type { AttentionBottleneck } from "@/lib/health/types";
import type { ResolvedDateRange } from "@/lib/products/date-range";
import type { MentorshipTaskSource, ProductDecisionState } from "@/types/database";

// Phase I is a read-only, longitudinal composition over Phase C/D/E/G/H —
// nothing here recomputes a decision, a task priority, or an economics
// formula. See PHASE_I_LONGITUDINAL_PROGRESS.md. Deliberately no numeric
// "progress score" and no historical health score anywhere in this file.

export interface DecisionTimelineEntry {
  decision: ProductDecisionState;
  effectiveAt: string; // ISO timestamp — when this became the effective decision
  isOverride: boolean; // true when a mentor override, not a fresh engine run, is the current authority
  overrideReason: string | null;
  reasonCode: string | null; // engine reason code; null when isOverride is true
  daysInState: number; // real elapsed days this state has held, from real timestamps
  ongoing: boolean; // true only for the last (current) entry — "so far," not a completed duration
}

export interface ProductTimeline {
  productId: string;
  productName: string;
  entries: DecisionTimelineEntry[]; // chronological; entries[0] is the first-ever evaluation
}

export interface MetricComparison {
  current: number | null;
  previous: number | null;
  // null unless BOTH sides are non-null AND previous is non-zero — never a
  // divide-by-zero or a fabricated "% up from nothing" claim.
  changePercent: number | null;
  changeAbsolute: number | null;
}

export interface PeriodComparison {
  label: string;
  currentRange: ResolvedDateRange;
  previousRange: ResolvedDateRange;
  revenue: MetricComparison;
  adSpend: MetricComparison;
  orders: MetricComparison;
  delivered: MetricComparison;
  rto: MetricComparison; // raw RTO count, not a rate — see runner.ts for why
  contributionProfit: MetricComparison; // both sides null whenever either period has any product with incomplete economics
  // false when neither period shows any real activity — the UI should say
  // "not enough data yet," never render a wall of zeros/nulls.
  hasSufficientData: boolean;
}

export interface SinceJoiningSummary {
  range: ResolvedDateRange;
  truncated: boolean; // true when real data starts later than mentorship_profiles.start_date
  dataAvailableFromIso: string;
  economics: AccountEconomicsSummary;
}

export interface ExecutionWeek {
  isoWeek: string;
  weekStartIso: string;
  completed: number;
  skipped: number;
  completionRate: number | null; // completed / (completed + skipped); null when denominator is 0
}

export interface ExecutionHistory {
  weeks: ExecutionWeek[]; // chronological, oldest first, ~8 entries
  overdueNow: number; // overdue is a "right now" concept, not bucketed historically
  bySource: Partial<Record<MentorshipTaskSource, { completed: number; skipped: number }>>;
}

export interface DirectionHistoryEntry {
  note: string;
  setAt: string;
}

export interface MentorshipJourney {
  joinDateIso: string | null;
  weeksInMentorship: number | null; // null when joinDateIso is unavailable
  callsCompleted: number;
  callsScheduled: number;
  callsCancelled: number;
  directionHistory: DirectionHistoryEntry[]; // chronological, is_mentor_direction = true only
}

export interface ReviewCycleDecisionChange {
  productName: string;
  from: ProductDecisionState | null; // null when this is the product's first-ever evaluation within the cycle
  to: ProductDecisionState;
  isOverride: boolean;
}

export interface ReviewCycle {
  fromIso: string;
  toIso: string;
  isFirstCycle: boolean; // fromIso is "joined"/earliest data, not a real prior call
  isCurrent: boolean; // the trailing cycle: from the latest completed call to right now
  decisionChanges: ReviewCycleDecisionChange[];
  tasksCompletedCount: number;
  hasMeaningfulChange: boolean;
}

export interface ProgressData {
  mentorshipJourney: MentorshipJourney;
  productTimelines: ProductTimeline[];
  currentWeekComparison: PeriodComparison;
  rolling30dComparison: PeriodComparison;
  sinceJoining: SinceJoiningSummary | null; // null only when there is genuinely no data at all yet
  primaryBottleneck: AttentionBottleneck | null; // reused verbatim from Phase G, never recomputed
  executionHistory: ExecutionHistory;
  reviewCycles: ReviewCycle[]; // most recent ~5 historical cycles + 1 current trailing cycle
}
