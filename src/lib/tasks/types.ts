import type { MentorshipTaskPriority, MentorshipTaskSource, ProductDecisionState } from "@/types/database";

// One product's ALREADY-RESOLVED effective decision — this module never
// recomputes KILL/SCALE/etc. itself, it only maps an existing decision's
// reasonCode/why/nextAction onto a task. See src/lib/decisions/engine.ts
// (Phase E) for where these values actually come from.
export interface ProductDecisionContext {
  productId: string;
  productName: string;
  effectiveDecision: ProductDecisionState | null;
  reasonCode: string | null;
  why: string | null;
  nextAction: string | null;
}

export interface TaskGenerationContext {
  isoWeek: string; // e.g. "2026-W37" — used only for weekly-cadence dedup keys (TEST/WATCH/accountability)
  products: ProductDecisionContext[];
  unresolvedFulfillmentCount: number; // enrollment-wide (Phase D's getUnmatchedShopifyOrders), not per-product
  incompleteTasksFromLastWeek: number; // for the accountability nudge
}

export interface TaskCandidate {
  title: string;
  description: string | null;
  why: string;
  nextAction: string;
  priority: MentorshipTaskPriority;
  source: MentorshipTaskSource;
  productCatalogId: string | null;
  reasonCode: string | null;
  // The actual idempotency key (see migration 0011) — generation must
  // always compute the SAME key for the SAME underlying issue so re-running
  // never creates a duplicate open task.
  dedupKey: string;
}
