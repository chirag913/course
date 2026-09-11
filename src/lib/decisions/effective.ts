import type { MentorshipProductDecision, MentorshipProductDecisionOverride, ProductDecisionState } from "@/types/database";

export interface EffectiveDecision {
  engineDecision: MentorshipProductDecision | null;
  activeOverride: MentorshipProductDecisionOverride | null;
  effectiveDecision: ProductDecisionState | null;
  isOverridden: boolean;
}

// The engine's own decision record is NEVER edited to reflect a mentor
// override (Part S). Instead, the "effective" decision is resolved here at
// read time: a mentor override only counts as "active" if it was created
// AFTER the most recent engine run — so re-running the engine naturally
// returns control to the system's own judgment unless the mentor
// overrides that new result too. This is a deliberate V1 design choice
// (there's no explicit "clear override" affordance) — see
// PHASE_E_DECISION_ENGINE.md "Effective decision."
export function resolveEffectiveDecision(
  latestEngineDecision: MentorshipProductDecision | null,
  latestOverride: MentorshipProductDecisionOverride | null
): EffectiveDecision {
  const overrideIsActive =
    latestOverride != null && (latestEngineDecision == null || new Date(latestOverride.created_at) > new Date(latestEngineDecision.created_at));

  return {
    engineDecision: latestEngineDecision,
    activeOverride: overrideIsActive ? latestOverride : null,
    effectiveDecision: overrideIsActive ? (latestOverride as MentorshipProductDecisionOverride).override_decision : latestEngineDecision?.decision ?? null,
    isOverridden: overrideIsActive,
  };
}
