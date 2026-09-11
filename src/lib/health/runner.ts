import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductPortfolio, type ProductPortfolioEntry } from "@/lib/products/portfolio";
import { getAccountEconomicsSummary, type AccountEconomicsSummary } from "@/lib/economics/account";
import { getUnmatchedShopifyOrders } from "@/lib/shipping/classification";
import { getProductFulfillmentSummary } from "@/lib/shipping/fulfillment";
import { resolveDateRange, type ResolvedDateRange } from "@/lib/products/date-range";
import { toIstIsoDate, todayIstIsoDate, addDaysToIsoDate } from "@/lib/mentorship-access";
import { assessAccountHealth } from "./assess";
import { summarizePortfolio } from "./portfolio-intelligence";
import { rankBusinessAttention } from "./attention";
import { getChangesSinceLastReview } from "./change-detection";
import type { AccountHealthResult, AttentionBottleneck, ChangeSinceReview, PortfolioInsight } from "./types";
import type { MentorshipProductDecision, MentorshipProductDecisionOverride, MentorshipTask, ProductDecisionState } from "@/types/database";

// Gathers already-computed inputs (Phase C/D/E/F's own helpers) and wires
// them into the pure functions in this module — this file does no
// calculation of its own beyond that wiring, exactly like
// decisions/build-input.ts and tasks/generate-runner.ts before it.

export interface AccountIntelligence {
  health: AccountHealthResult;
  insights: PortfolioInsight[];
  bottlenecks: AttentionBottleneck[]; // ranked; [0] is the primary bottleneck
  portfolio: ProductPortfolioEntry[];
  economics: AccountEconomicsSummary;
  openTaskCount: number;
  overdueTaskCount: number;
}

async function getOpenTasks(supabase: SupabaseClient, enrollmentId: string): Promise<MentorshipTask[]> {
  const { data } = await supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollmentId).in("status", ["TODO", "IN_PROGRESS"]);
  return (data ?? []) as MentorshipTask[];
}

// The student-dashboard-weight computation: health + primary bottleneck +
// portfolio insights. No change detection here — that's heavier (two range
// queries per product) and belongs only to the mentor's occasional
// call-prep view, not every student home-page load.
export async function getAccountIntelligence(supabase: SupabaseClient, enrollmentId: string, range: ResolvedDateRange): Promise<AccountIntelligence> {
  const [portfolio, economics, unmatchedOrders, openTasks] = await Promise.all([
    getProductPortfolio(supabase, enrollmentId, range, { statusFilter: "active" }),
    getAccountEconomicsSummary(supabase, enrollmentId, range),
    getUnmatchedShopifyOrders(supabase, enrollmentId),
    getOpenTasks(supabase, enrollmentId),
  ]);

  const today = todayIstIsoDate();
  const overdueTaskCount = openTasks.filter((t) => t.due_date != null && t.due_date < today).length;

  const health = assessAccountHealth({ portfolio, economics, overdueTaskCount });
  const insights = summarizePortfolio(portfolio, economics);
  const bottlenecks = rankBusinessAttention({ portfolio, openTasks, unresolvedFulfillmentCount: unmatchedOrders.length });

  return { health, insights, bottlenecks, portfolio, economics, openTaskCount: openTasks.length, overdueTaskCount };
}

export interface MentorBriefing extends AccountIntelligence {
  changes: ChangeSinceReview[];
  reviewCutoffIso: string;
  latestOverride: {
    productId: string;
    productName: string;
    decision: ProductDecisionState;
    reason: string;
    createdAt: string;
  } | null;
}

// A range of the SAME length as `range`, but ending at `newEndIsoDate`
// instead of today — reuses resolveDateRange's own validation rather than
// building a ResolvedDateRange by hand. Exported (Phase I) so the progress
// module can build its own "previous 30 days" window with the exact same
// arithmetic this file already uses — no behavior change, just visibility.
export function shiftRangeEnd(range: ResolvedDateRange, newEndIsoDate: string): ResolvedDateRange {
  const lengthDays = Math.round((Date.parse(`${range.end}T00:00:00.000Z`) - Date.parse(`${range.start}T00:00:00.000Z`)) / 86400000);
  const newStart = addDaysToIsoDate(newEndIsoDate, -lengthDays);
  return resolveDateRange("custom", { start: newStart, end: newEndIsoDate });
}

// "Previous review" = the most recent COMPLETED call in the past, falling
// back to 7 days ago if none exists yet. `status` on mentorship_calls is
// freeform text (no CHECK constraint), so this matches loosely rather than
// requiring an exact "completed" string.
async function resolveReviewCutoff(supabase: SupabaseClient, enrollmentId: string): Promise<string> {
  const { data: calls } = await supabase
    .from("mentorship_calls")
    .select("scheduled_at, status")
    .eq("enrollment_id", enrollmentId)
    .order("scheduled_at", { ascending: false });

  const now = new Date();
  const lastCompleted = (calls ?? []).find(
    (c) => (c.status as string).toLowerCase().includes("complet") && new Date(c.scheduled_at as string) <= now
  );
  if (lastCompleted) return lastCompleted.scheduled_at as string;

  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

// The mentor's 2-minute briefing: everything in AccountIntelligence, plus
// what changed since the last completed call. Heavier than the student
// path (re-runs fulfillment for a second, earlier range per product) —
// deliberately only computed for the admin workspace, not on every load.
export async function getMentorBriefing(supabase: SupabaseClient, enrollmentId: string, range: ResolvedDateRange): Promise<MentorBriefing> {
  const [intelligence, reviewCutoffIso, { data: allDecisionRows }, { data: allOverrideRows }, { data: productRows }] = await Promise.all([
    getAccountIntelligence(supabase, enrollmentId, range),
    resolveReviewCutoff(supabase, enrollmentId),
    supabase.from("mentorship_product_decisions").select("*").eq("enrollment_id", enrollmentId).order("created_at", { ascending: false }),
    supabase.from("mentorship_product_decision_overrides").select("*").eq("enrollment_id", enrollmentId).order("created_at", { ascending: false }),
    supabase.from("mentorship_product_catalog").select("id, name").eq("enrollment_id", enrollmentId),
  ]);

  const productNameById = new Map((productRows ?? []).map((p) => [p.id as string, p.name as string]));

  const decisionHistoryByProduct = new Map<string, MentorshipProductDecision[]>();
  for (const row of (allDecisionRows ?? []) as MentorshipProductDecision[]) {
    const list = decisionHistoryByProduct.get(row.product_catalog_id) ?? [];
    list.push(row);
    decisionHistoryByProduct.set(row.product_catalog_id, list);
  }
  const overrideHistoryByProduct = new Map<string, MentorshipProductDecisionOverride[]>();
  for (const row of (allOverrideRows ?? []) as MentorshipProductDecisionOverride[]) {
    const list = overrideHistoryByProduct.get(row.product_catalog_id) ?? [];
    list.push(row);
    overrideHistoryByProduct.set(row.product_catalog_id, list);
  }

  const cutoffDateIso = toIstIsoDate(reviewCutoffIso);
  const previousRange = shiftRangeEnd(range, cutoffDateIso);
  const activeProductIds = intelligence.portfolio.map((p) => p.product.id);

  const [currentRtoEntries, previousRtoEntries, previousEconomics, doneTasksResult, allOpenTasksFull] = await Promise.all([
    Promise.all(activeProductIds.map(async (id) => [id, (await getProductFulfillmentSummary(supabase, enrollmentId, id, range)).rates.rtoRate] as const)),
    Promise.all(activeProductIds.map(async (id) => [id, (await getProductFulfillmentSummary(supabase, enrollmentId, id, previousRange)).rates.rtoRate] as const)),
    getAccountEconomicsSummary(supabase, enrollmentId, previousRange),
    supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollmentId).eq("status", "DONE").gt("completed_at", reviewCutoffIso),
    supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollmentId).in("status", ["TODO", "IN_PROGRESS"]),
  ]);

  const today = todayIstIsoDate();
  const tasksCompletedSinceCutoff = (doneTasksResult.data ?? []) as MentorshipTask[];
  const tasksOverdueNow = ((allOpenTasksFull.data ?? []) as MentorshipTask[]).filter((t) => t.due_date != null && t.due_date < today);

  const changes = getChangesSinceLastReview({
    decisionHistoryByProduct,
    overrideHistoryByProduct,
    productNameById,
    cutoffIso: reviewCutoffIso,
    currentRtoRateByProduct: new Map(currentRtoEntries),
    previousRtoRateByProduct: new Map(previousRtoEntries),
    currentEconomics: intelligence.economics,
    previousEconomics,
    tasksCompletedSinceCutoff,
    tasksOverdueNow,
  });

  const overrideRow = (allOverrideRows ?? [])[0] as MentorshipProductDecisionOverride | undefined;
  const latestOverride = overrideRow
    ? {
        productId: overrideRow.product_catalog_id,
        productName: productNameById.get(overrideRow.product_catalog_id) ?? "Unknown product",
        decision: overrideRow.override_decision,
        reason: overrideRow.override_reason,
        createdAt: overrideRow.created_at,
      }
    : null;

  return { ...intelligence, changes, reviewCutoffIso, latestOverride };
}
