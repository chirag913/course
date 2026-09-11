import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMentorBriefing, type MentorBriefing } from "@/lib/health/runner";
import { todayIstIsoDate } from "@/lib/mentorship-access";
import type { ResolvedDateRange } from "@/lib/products/date-range";
import type { AttentionBottleneck, ChangeSinceReview } from "@/lib/health/types";
import type { MentorshipNote, MentorshipTask } from "@/types/database";
import type { ExecutionSummary, NotesForReview, ProductForReview } from "./types";

// Gathers everything the mentor review screen needs by calling Phase G's
// getMentorBriefing() UNCHANGED and adding only presentation-shaped
// composition on top: raw task lists (getMentorBriefing already computes
// completed/overdue internally but only returns counts, so this re-runs
// those same simple filtered SELECTs rather than reaching into Phase G's
// internals or editing that file), changes grouped by product, the single
// "biggest opportunity" pick, and notes split into direction/current-call/
// historical. No decision, task-priority, or economics logic lives here.

export interface MentorReviewData extends MentorBriefing {
  execution: ExecutionSummary;
  biggestOpportunity: AttentionBottleneck | null;
  productsForReview: ProductForReview[];
  notes: NotesForReview;
}

const OPPORTUNITY_LEVELS = new Set(["SCALE_OPPORTUNITY", "RELAUNCH_OPPORTUNITY"]);

export async function getMentorReviewData(supabase: SupabaseClient, enrollmentId: string, range: ResolvedDateRange): Promise<MentorReviewData> {
  const briefing = await getMentorBriefing(supabase, enrollmentId, range);

  const [{ data: openRows }, { data: completedRows }, { data: skippedRows }, { data: notesRows }] = await Promise.all([
    supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollmentId).in("status", ["TODO", "IN_PROGRESS"]),
    supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollmentId).eq("status", "DONE").gt("completed_at", briefing.reviewCutoffIso),
    // SKIPPED has no dedicated timestamp column — mentorship_tasks.updated_at
    // already auto-bumps on every UPDATE (a trigger from Phase A's original
    // migration), so it's a reliable, zero-schema proxy for "skipped since
    // the last review" without inventing a new column.
    supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollmentId).eq("status", "SKIPPED").gt("updated_at", briefing.reviewCutoffIso),
    supabase.from("mentorship_notes").select("*").eq("enrollment_id", enrollmentId).order("created_at", { ascending: false }),
  ]);

  const openTasks = (openRows ?? []) as MentorshipTask[];
  const today = todayIstIsoDate();
  const overdueTasks = openTasks.filter((t) => t.due_date != null && t.due_date < today);
  const completedSinceCutoff = (completedRows ?? []) as MentorshipTask[];
  const skippedSinceCutoff = (skippedRows ?? []) as MentorshipTask[];

  const executionDenominator = completedSinceCutoff.length + skippedSinceCutoff.length;
  const completionRate = executionDenominator > 0 ? completedSinceCutoff.length / executionDenominator : null;

  const execution: ExecutionSummary = { completedSinceCutoff, skippedSinceCutoff, openTasks, overdueTasks, completionRate };

  const changesByProduct = new Map<string, ChangeSinceReview[]>();
  for (const change of briefing.changes) {
    if (!change.productId) continue;
    const list = changesByProduct.get(change.productId) ?? [];
    list.push(change);
    changesByProduct.set(change.productId, list);
  }
  const productsForReview: ProductForReview[] = briefing.bottlenecks
    .filter((b): b is AttentionBottleneck & { productId: string } => b.productId != null)
    .map((b) => ({ bottleneck: b, changes: changesByProduct.get(b.productId) ?? [] }));

  const biggestOpportunity = briefing.bottlenecks.find((b) => OPPORTUNITY_LEVELS.has(b.level)) ?? null;

  const allNotes = (notesRows ?? []) as MentorshipNote[];
  const latestDirection = allNotes.find((n) => n.is_mentor_direction) ?? null;
  const sinceLastCall = allNotes.filter((n) => n.created_at > briefing.reviewCutoffIso);
  const historical = allNotes.filter((n) => n.created_at <= briefing.reviewCutoffIso);

  return {
    ...briefing,
    execution,
    biggestOpportunity,
    productsForReview,
    notes: { latestDirection, sinceLastCall, historical },
  };
}
