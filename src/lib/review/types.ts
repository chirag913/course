import type { AttentionBottleneck, ChangeSinceReview } from "@/lib/health/types";
import type { MentorshipNote, MentorshipTask } from "@/types/database";

// Phase H composes Phase G's mentor briefing into a review-screen-shaped
// structure — every field here is either already computed by
// getMentorBriefing() or a trivial grouping/lookup over it. Nothing here
// recomputes a decision, a task priority, or an economics number.

export interface ExecutionSummary {
  completedSinceCutoff: MentorshipTask[];
  skippedSinceCutoff: MentorshipTask[];
  openTasks: MentorshipTask[];
  overdueTasks: MentorshipTask[];
  // null when there's nothing to divide (never a misleading 0% or 100%).
  completionRate: number | null;
}

export interface ProductForReview {
  bottleneck: AttentionBottleneck;
  changes: ChangeSinceReview[];
}

export interface NotesForReview {
  latestDirection: MentorshipNote | null;
  // "Current call" vs "historical" is a presentation-time split by
  // recency relative to the review cutoff — not a stored category.
  sinceLastCall: MentorshipNote[];
  historical: MentorshipNote[];
}
