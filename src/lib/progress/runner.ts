import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountIntelligence, shiftRangeEnd } from "@/lib/health/runner";
import { getAccountEconomicsSummary, type AccountEconomicsSummary } from "@/lib/economics/account";
import { resolveDateRange, type ResolvedDateRange } from "@/lib/products/date-range";
import { mondayOf, mondayOfPreviousWeek } from "@/lib/tasks/generate-runner";
import { currentIsoWeek } from "@/lib/tasks/generate";
import { todayIstIsoDate } from "@/lib/mentorship-access";
import { buildDecisionTimeline } from "./timeline";
import type {
  MentorshipCall,
  MentorshipNote,
  MentorshipProductCatalog,
  MentorshipProductDecision,
  MentorshipProductDecisionOverride,
  MentorshipProfile,
  MentorshipTask,
  MentorshipTaskSource,
  ProductDecisionState,
} from "@/types/database";
import type {
  DirectionHistoryEntry,
  ExecutionHistory,
  ExecutionWeek,
  MentorshipJourney,
  MetricComparison,
  PeriodComparison,
  ProgressData,
  ProductTimeline,
  ReviewCycle,
  ReviewCycleDecisionChange,
  SinceJoiningSummary,
} from "./types";

// Composes Phase C/D/E/G/H's own already-computed functions into a
// longitudinal view. This file performs NO new business calculation
// beyond trivial, presentation-level arithmetic (percent-change formulas,
// date-window construction) — every revenue/spend/order/RTO/contribution
// number is `getAccountEconomicsSummary`'s own output, unmodified, and
// every decision-state judgment is Phase E's own `resolveEffectiveDecision`
// replayed by `buildDecisionTimeline`. See
// PHASE_I_LONGITUDINAL_PROGRESS.md for the full rationale behind every
// choice below.

function metricComparison(current: number | null, previous: number | null): MetricComparison {
  const changeAbsolute = current != null && previous != null ? current - previous : null;
  // Never a divide-by-zero, never a "% up from nothing" claim — a zero
  // baseline makes any percentage meaningless, so it's simply omitted.
  const changePercent = current != null && previous != null && previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null;
  return { current, previous, changeAbsolute, changePercent };
}

function buildPeriodComparison(
  label: string,
  currentRange: ResolvedDateRange,
  previousRange: ResolvedDateRange,
  current: AccountEconomicsSummary,
  previous: AccountEconomicsSummary
): PeriodComparison {
  const hasSufficientData = current.totalOrders > 0 || current.totalAdSpend > 0 || previous.totalOrders > 0 || previous.totalAdSpend > 0;
  // Contribution profit is only ever compared when BOTH sides are fully
  // computable — Phase D's own null-safety (never coerced to zero) is
  // inherited here rather than re-decided.
  const contributionProfit =
    current.totalContributionProfit != null && previous.totalContributionProfit != null
      ? metricComparison(current.totalContributionProfit, previous.totalContributionProfit)
      : { current: current.totalContributionProfit, previous: previous.totalContributionProfit, changeAbsolute: null, changePercent: null };

  return {
    label,
    currentRange,
    previousRange,
    revenue: metricComparison(current.totalRevenue, previous.totalRevenue),
    adSpend: metricComparison(current.totalAdSpend, previous.totalAdSpend),
    orders: metricComparison(current.totalOrders, previous.totalOrders),
    delivered: metricComparison(current.totalDelivered, previous.totalDelivered),
    // Raw RTO count, not a rate: AccountEconomicsSummary doesn't already
    // expose an account-wide RTO rate (it has no "shipped" total to build
    // the same eligible-base formula Phase D's per-product rate uses), and
    // adding one would mean extending that Phase D/G-shared function —
    // out of scope for a phase that must not modify Phase D/G. The raw
    // count is real, already-computed, and equally legible.
    rto: metricComparison(current.totalRto, previous.totalRto),
    contributionProfit,
    hasSufficientData,
  };
}

function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getProgressData(supabase: SupabaseClient, enrollmentId: string): Promise<ProgressData> {
  const now = new Date();
  const today = todayIstIsoDate();

  // ---- the three windows -------------------------------------------
  const currentWeekRange = resolveDateRange("custom", { start: mondayOf(now), end: today });
  const previousWeekRange = resolveDateRange("custom", { start: mondayOfPreviousWeek(now), end: dayBefore(mondayOf(now)) });
  const current30dRange = resolveDateRange("30d");
  const previous30dRange = shiftRangeEnd(current30dRange, dayBefore(current30dRange.start));

  // ---- fetch everything ONCE, in parallel ---------------------------
  const [
    intelligence,
    { data: mentorProfileRow },
    { data: catalogRows },
    { data: allDecisionRows },
    { data: allOverrideRows },
    { data: callRows },
    { data: notesRows },
    { data: earliestOrderRow },
    { data: earliestInsightRow },
    { data: allDoneRows },
    { data: allSkippedRows },
    { data: openRows },
    currentWeekEconomics,
    previousWeekEconomics,
    previous30dEconomics,
  ] = await Promise.all([
    getAccountIntelligence(supabase, enrollmentId, current30dRange), // reused for economics AND the primary bottleneck — never recomputed
    supabase.from("mentorship_profiles").select("*").eq("enrollment_id", enrollmentId).maybeSingle(),
    supabase.from("mentorship_product_catalog").select("*").eq("enrollment_id", enrollmentId),
    supabase.from("mentorship_product_decisions").select("*").eq("enrollment_id", enrollmentId).order("created_at", { ascending: true }),
    supabase.from("mentorship_product_decision_overrides").select("*").eq("enrollment_id", enrollmentId).order("created_at", { ascending: true }),
    supabase.from("mentorship_calls").select("*").eq("enrollment_id", enrollmentId).order("scheduled_at", { ascending: true }),
    supabase.from("mentorship_notes").select("*").eq("enrollment_id", enrollmentId).order("created_at", { ascending: true }),
    supabase.from("mentorship_shopify_orders").select("created_at_external").eq("enrollment_id", enrollmentId).order("created_at_external", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("mentorship_meta_ad_insights").select("date").eq("enrollment_id", enrollmentId).order("date", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollmentId).eq("status", "DONE"),
    supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollmentId).eq("status", "SKIPPED"),
    supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollmentId).in("status", ["TODO", "IN_PROGRESS"]),
    getAccountEconomicsSummary(supabase, enrollmentId, currentWeekRange),
    getAccountEconomicsSummary(supabase, enrollmentId, previousWeekRange),
    getAccountEconomicsSummary(supabase, enrollmentId, previous30dRange),
  ]);

  // ---- decision timelines, once per product, from data already fetched --
  const catalogProducts = (catalogRows ?? []) as MentorshipProductCatalog[];
  const productNameById = new Map(catalogProducts.map((p) => [p.id, p.name]));

  const decisionsByProduct = new Map<string, MentorshipProductDecision[]>();
  for (const row of (allDecisionRows ?? []) as MentorshipProductDecision[]) {
    const list = decisionsByProduct.get(row.product_catalog_id) ?? [];
    list.push(row);
    decisionsByProduct.set(row.product_catalog_id, list);
  }
  const overridesByProduct = new Map<string, MentorshipProductDecisionOverride[]>();
  for (const row of (allOverrideRows ?? []) as MentorshipProductDecisionOverride[]) {
    const list = overridesByProduct.get(row.product_catalog_id) ?? [];
    list.push(row);
    overridesByProduct.set(row.product_catalog_id, list);
  }
  const productIds = new Set<string>([...decisionsByProduct.keys(), ...overridesByProduct.keys()]);
  const productTimelines: ProductTimeline[] = [...productIds]
    .map((productId) => ({
      productId,
      productName: productNameById.get(productId) ?? "Unknown product",
      entries: buildDecisionTimeline(decisionsByProduct.get(productId) ?? [], overridesByProduct.get(productId) ?? [], now),
    }))
    .filter((timeline) => timeline.entries.length > 0)
    .sort((a, b) => a.productName.localeCompare(b.productName));

  // ---- mentorship journey --------------------------------------------
  const mentorProfile = mentorProfileRow as MentorshipProfile | null;
  const joinDateIso = mentorProfile?.start_date ?? null;
  const weeksInMentorship = joinDateIso
    ? Math.floor((now.getTime() - new Date(`${joinDateIso}T00:00:00.000Z`).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    : null;

  const calls = (callRows ?? []) as MentorshipCall[];
  const completedCalls = calls.filter((c) => c.status.toLowerCase().includes("complet") && new Date(c.scheduled_at) <= now);
  const cancelledCalls = calls.filter((c) => c.status.toLowerCase().includes("cancel"));
  const scheduledCalls = calls.filter((c) => !c.status.toLowerCase().includes("complet") && !c.status.toLowerCase().includes("cancel") && new Date(c.scheduled_at) > now);

  const notes = (notesRows ?? []) as MentorshipNote[];
  const directionHistory: DirectionHistoryEntry[] = notes.filter((n) => n.is_mentor_direction).map((n) => ({ note: n.note, setAt: n.created_at }));

  const mentorshipJourney: MentorshipJourney = {
    joinDateIso,
    weeksInMentorship,
    callsCompleted: completedCalls.length,
    callsScheduled: scheduledCalls.length,
    callsCancelled: cancelledCalls.length,
    directionHistory,
  };

  // ---- since joining: start = max(join date, earliest real data) ------
  const earliestOrderDate = earliestOrderRow?.created_at_external ? isoDateOnly(earliestOrderRow.created_at_external as string) : null;
  const earliestInsightDate = (earliestInsightRow?.date as string | undefined) ?? null;
  const candidateDataDates = [earliestOrderDate, earliestInsightDate].filter((d): d is string => d != null).sort();
  const earliestDataDate = candidateDataDates[0] ?? null;

  let sinceJoining: SinceJoiningSummary | null = null;
  const anchors = [joinDateIso, earliestDataDate].filter((d): d is string => d != null);
  if (anchors.length > 0) {
    const startDate = [...anchors].sort().pop()!; // the LATER of the two — never implies coverage further back than data exists
    const range = resolveDateRange("custom", { start: startDate, end: today });
    const economics = await getAccountEconomicsSummary(supabase, enrollmentId, range);
    sinceJoining = {
      range,
      dataAvailableFromIso: startDate,
      truncated: earliestDataDate != null && joinDateIso != null && earliestDataDate > joinDateIso,
      economics,
    };
  }

  // ---- execution history: bucket already-fetched tasks by ISO week ----
  const allDoneTasks = (allDoneRows ?? []) as MentorshipTask[];
  const allSkippedTasks = (allSkippedRows ?? []) as MentorshipTask[];
  const openTasks = (openRows ?? []) as MentorshipTask[];
  const overdueNow = openTasks.filter((t) => t.due_date != null && t.due_date < today).length;

  const weekBuckets: { isoWeek: string; weekStartIso: string }[] = [];
  const seenWeeks = new Set<string>();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const isoWeek = currentIsoWeek(d);
    if (seenWeeks.has(isoWeek)) continue;
    seenWeeks.add(isoWeek);
    weekBuckets.push({ isoWeek, weekStartIso: mondayOf(d) });
  }

  const weeks: ExecutionWeek[] = weekBuckets.map(({ isoWeek, weekStartIso }) => {
    const completed = allDoneTasks.filter((t) => t.completed_at && currentIsoWeek(new Date(t.completed_at)) === isoWeek).length;
    const skipped = allSkippedTasks.filter((t) => currentIsoWeek(new Date(t.updated_at)) === isoWeek).length;
    const denominator = completed + skipped;
    return { isoWeek, weekStartIso, completed, skipped, completionRate: denominator > 0 ? completed / denominator : null };
  });

  const bySource: Partial<Record<MentorshipTaskSource, { completed: number; skipped: number }>> = {};
  for (const t of allDoneTasks) {
    bySource[t.source] = bySource[t.source] ?? { completed: 0, skipped: 0 };
    bySource[t.source]!.completed += 1;
  }
  for (const t of allSkippedTasks) {
    bySource[t.source] = bySource[t.source] ?? { completed: 0, skipped: 0 };
    bySource[t.source]!.skipped += 1;
  }

  const executionHistory: ExecutionHistory = { weeks, overdueNow, bySource };

  // ---- review cycles: derived from the SAME already-built decision ----
  // timelines and task lists — never a re-invocation of Phase G's
  // getChangesSinceLastReview() for historical pairs, because that
  // function is intentionally anchored to wall-clock "now" (Phase G/H's
  // own valid use case) and cannot be repurposed for an arbitrary past
  // upper bound without modifying it, which this phase must not do. Every
  // cycle here — including the trailing "current" one — uses the exact
  // same derivation for consistency: decision transitions and completed
  // tasks whose real timestamps fall inside the cycle's window.
  function decisionChangesInWindow(fromIso: string, toIso: string): ReviewCycleDecisionChange[] {
    const changes: ReviewCycleDecisionChange[] = [];
    for (const timeline of productTimelines) {
      const inWindow = timeline.entries.filter((e) => e.effectiveAt > fromIso && e.effectiveAt <= toIso);
      if (inWindow.length === 0) continue;
      const before = timeline.entries.filter((e) => e.effectiveAt <= fromIso);
      const priorDecision: ProductDecisionState | null = before.length > 0 ? before[before.length - 1]!.decision : null;
      const last = inWindow[inWindow.length - 1]!;
      changes.push({ productName: timeline.productName, from: priorDecision, to: last.decision, isOverride: inWindow.some((e) => e.isOverride) });
    }
    return changes;
  }
  function tasksCompletedInWindow(fromIso: string, toIso: string): number {
    return allDoneTasks.filter((t) => t.completed_at && t.completed_at > fromIso && t.completed_at <= toIso).length;
  }

  const reviewCycles: ReviewCycle[] = [];
  const recentCompletedCalls = completedCalls.slice(-6); // bound the list: last 6 completed calls -> up to 5 historical cycles + 1 trailing
  for (let i = 0; i < recentCompletedCalls.length; i++) {
    const toCall = recentCompletedCalls[i]!;
    const isFirstCycle = i === 0;
    const fromIso = isFirstCycle ? (sinceJoining?.dataAvailableFromIso ?? joinDateIso ?? toCall.scheduled_at) : recentCompletedCalls[i - 1]!.scheduled_at;
    const decisionChanges = decisionChangesInWindow(fromIso, toCall.scheduled_at);
    const tasksCompletedCount = tasksCompletedInWindow(fromIso, toCall.scheduled_at);
    reviewCycles.push({
      fromIso,
      toIso: toCall.scheduled_at,
      isFirstCycle,
      isCurrent: false,
      decisionChanges,
      tasksCompletedCount,
      hasMeaningfulChange: decisionChanges.length > 0 || tasksCompletedCount > 0,
    });
  }
  if (recentCompletedCalls.length > 0) {
    const lastCall = recentCompletedCalls[recentCompletedCalls.length - 1]!;
    const nowIso = now.toISOString();
    const decisionChanges = decisionChangesInWindow(lastCall.scheduled_at, nowIso);
    const tasksCompletedCount = tasksCompletedInWindow(lastCall.scheduled_at, nowIso);
    reviewCycles.push({
      fromIso: lastCall.scheduled_at,
      toIso: nowIso,
      isFirstCycle: false,
      isCurrent: true,
      decisionChanges,
      tasksCompletedCount,
      hasMeaningfulChange: decisionChanges.length > 0 || tasksCompletedCount > 0,
    });
  }

  return {
    mentorshipJourney,
    productTimelines,
    currentWeekComparison: buildPeriodComparison("This week vs. last week", currentWeekRange, previousWeekRange, currentWeekEconomics, previousWeekEconomics),
    rolling30dComparison: buildPeriodComparison("Last 30 days vs. the 30 days before that", current30dRange, previous30dRange, intelligence.economics, previous30dEconomics),
    sinceJoining,
    primaryBottleneck: intelligence.bottlenecks[0] ?? null,
    executionHistory,
    reviewCycles,
  };
}
