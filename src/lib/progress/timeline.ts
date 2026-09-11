// Pure decision-timeline construction — Phase I. No DB access, no
// recomputation of any decision: this module only replays Phase E's own
// resolveEffectiveDecision() across a product's FULL chronological
// history, rather than the single "now vs. one cutoff" comparison Phase G
// already does. An entry is emitted only when the effective decision
// ACTUALLY changes — a decision re-run that reaffirms the same state (or
// an override that doesn't change what's currently in effect) produces no
// new entry.
//
// This module never claims a transition was CAUSED by anything — it only
// records what the effective decision was and whether the current
// authority for that state is an engine run or an active mentor override.
// See PHASE_I_LONGITUDINAL_PROGRESS.md "Timeline methodology."
import { resolveEffectiveDecision } from "@/lib/decisions/effective";
import type { MentorshipProductDecision, MentorshipProductDecisionOverride, ProductDecisionState } from "@/types/database";
import type { DecisionTimelineEntry } from "./types";

type TimelineEvent =
  | { kind: "decision"; at: string; decision: MentorshipProductDecision }
  | { kind: "override"; at: string; override: MentorshipProductDecisionOverride };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildDecisionTimeline(
  decisions: MentorshipProductDecision[],
  overrides: MentorshipProductDecisionOverride[],
  now: Date = new Date()
): DecisionTimelineEntry[] {
  const events: TimelineEvent[] = [
    ...decisions.map((decision) => ({ kind: "decision" as const, at: decision.created_at, decision })),
    ...overrides.map((override) => ({ kind: "override" as const, at: override.created_at, override })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  if (events.length === 0) return [];

  const entries: Omit<DecisionTimelineEntry, "daysInState" | "ongoing">[] = [];
  let latestDecision: MentorshipProductDecision | null = null;
  let latestOverride: MentorshipProductDecisionOverride | null = null;
  let lastEffective: ProductDecisionState | null = null;

  for (const event of events) {
    if (event.kind === "decision") latestDecision = event.decision;
    else latestOverride = event.override;

    const effective = resolveEffectiveDecision(latestDecision, latestOverride);
    if (!effective.effectiveDecision) continue; // nothing evaluable yet
    if (effective.effectiveDecision === lastEffective) continue; // no real change -> no entry

    entries.push({
      decision: effective.effectiveDecision,
      effectiveAt: event.at,
      isOverride: effective.isOverridden,
      overrideReason: effective.isOverridden ? (latestOverride?.override_reason ?? null) : null,
      reasonCode: effective.isOverridden ? null : (latestDecision?.reason_code ?? null),
    });
    lastEffective = effective.effectiveDecision;
  }

  return entries.map((entry, i) => {
    const startMs = new Date(entry.effectiveAt).getTime();
    const isLast = i === entries.length - 1;
    const endMs = isLast ? now.getTime() : new Date(entries[i + 1]!.effectiveAt).getTime();
    return {
      ...entry,
      daysInState: Math.max(0, Math.round((endMs - startMs) / MS_PER_DAY)),
      ongoing: isLast,
    };
  });
}
