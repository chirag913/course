import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductPortfolio } from "@/lib/products/portfolio";
import { getUnmatchedShopifyOrders } from "@/lib/shipping/classification";
import { resolveDateRange, DEFAULT_DATE_RANGE_PRESET } from "@/lib/products/date-range";
import { generateTaskCandidates, currentIsoWeek } from "./generate";
import type { TaskGenerationContext } from "./types";

// Exported (Phase I) so the progress module can build the exact same
// calendar-week boundaries this file already uses for week_start — no
// behavior change, just visibility.
export function mondayOf(date: Date): string {
  const day = date.getDay();
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(date.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export function mondayOfPreviousWeek(date: Date): string {
  const thisMonday = new Date(`${mondayOf(date)}T00:00:00.000Z`);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  return thisMonday.toISOString().slice(0, 10);
}

export interface GenerateWeeklyTasksResult {
  created: number;
  skippedDuplicates: number;
  superseded: number;
}

// Reads the SAME already-computed effective decisions (Phase E) and
// product economics (Phase D/portfolio) every other page in this app
// reads — generation never recalculates a decision, it only turns an
// existing one into a task. Idempotent: re-running immediately after a
// successful run always returns created=0 (every candidate collides with
// the partial unique index on (enrollment_id, dedup_key) for the still-open
// task from the first run).
export async function generateWeeklyTasks(supabase: SupabaseClient, enrollmentId: string): Promise<GenerateWeeklyTasksResult> {
  const now = new Date();
  const isoWeek = currentIsoWeek(now);
  const weekStart = mondayOf(now);
  const lastWeekStart = mondayOfPreviousWeek(now);

  const range = resolveDateRange(DEFAULT_DATE_RANGE_PRESET);
  const [portfolio, unmatchedOrders, { count: incompleteLastWeek }] = await Promise.all([
    getProductPortfolio(supabase, enrollmentId, range, { statusFilter: "active" }),
    getUnmatchedShopifyOrders(supabase, enrollmentId),
    supabase
      .from("mentorship_tasks")
      .select("*", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId)
      .eq("week_start", lastWeekStart)
      .in("status", ["TODO", "IN_PROGRESS"]),
  ]);

  const context: TaskGenerationContext = {
    isoWeek,
    products: portfolio.map((entry) => ({
      productId: entry.product.id,
      productName: entry.product.name,
      effectiveDecision: entry.effectiveDecision,
      reasonCode: entry.latestDecision?.reason_code ?? null,
      // If a mentor override is currently active, the override's own
      // reason is the actually-correct "why" (the engine's original why
      // describes the decision it made BEFORE being overridden) — the
      // next action falls back to the engine's own text, which is
      // reasonably generic per decision state.
      why: entry.isOverridden ? `Mentor override: ${entry.activeOverride?.override_reason}` : entry.latestDecision?.why ?? null,
      nextAction: entry.latestDecision?.next_action ?? null,
    })),
    unresolvedFulfillmentCount: unmatchedOrders.length,
    incompleteTasksFromLastWeek: incompleteLastWeek ?? 0,
  };

  const candidates = generateTaskCandidates(context);

  // A product's decision can CHANGE between runs (e.g. KILL -> WATCH after
  // a mentor override, or ITERATE -> SCALE once the issue is fixed). If we
  // only ever INSERTed new candidates, the old task from the previous
  // decision would stay open forever, contradicting the new one — a
  // student could see both "Stop spend" and "Monitor" for the same
  // product at once. So: any still-open, non-mentor, product-linked task
  // whose dedup key ISN'T among this run's fresh candidates for that same
  // product gets marked SKIPPED (superseded), never deleted — history
  // stays intact, but the visible task list always reflects the CURRENT
  // decision. Mentor-authored tasks (source = 'MENTOR') are never touched
  // by this — only the mentor decides their fate.
  const currentKeysByProduct = new Map<string, Set<string>>();
  for (const c of candidates) {
    if (!c.productCatalogId) continue;
    if (!currentKeysByProduct.has(c.productCatalogId)) currentKeysByProduct.set(c.productCatalogId, new Set());
    currentKeysByProduct.get(c.productCatalogId)!.add(c.dedupKey);
  }

  let superseded = 0;
  if (currentKeysByProduct.size > 0) {
    const { data: openProductTasks } = await supabase
      .from("mentorship_tasks")
      .select("id, product_catalog_id, dedup_key, source")
      .eq("enrollment_id", enrollmentId)
      .in("status", ["TODO", "IN_PROGRESS"])
      .neq("source", "MENTOR")
      .not("product_catalog_id", "is", null);

    for (const task of openProductTasks ?? []) {
      const currentKeys = currentKeysByProduct.get(task.product_catalog_id as string);
      if (!currentKeys) continue; // this product had no fresh candidate this run — leave its existing task alone
      if (task.dedup_key && !currentKeys.has(task.dedup_key)) {
        const { error } = await supabase.from("mentorship_tasks").update({ status: "SKIPPED" }).eq("id", task.id);
        if (!error) superseded += 1;
      }
    }
  }

  let created = 0;
  let skippedDuplicates = 0;
  for (const candidate of candidates) {
    const { error } = await supabase.from("mentorship_tasks").insert({
      enrollment_id: enrollmentId,
      week_start: weekStart,
      title: candidate.title,
      description: candidate.description,
      why: candidate.why,
      next_action: candidate.nextAction,
      priority: candidate.priority,
      source: candidate.source,
      product_catalog_id: candidate.productCatalogId,
      reason_code: candidate.reasonCode,
      dedup_key: candidate.dedupKey,
      status: "TODO",
      is_done: false,
    });
    if (error) {
      if (error.code === "23505") {
        skippedDuplicates += 1;
      } else {
        throw new Error(`Could not create task: ${error.message}`);
      }
    } else {
      created += 1;
    }
  }

  return { created, skippedDuplicates, superseded };
}
