# Account Health + Portfolio Intelligence — Phase G

The strategic layer above the product decision engine. Answers questions
Phase E/F don't: *how healthy is my business overall, what's the biggest
bottleneck, where should I spend my attention, which products are helping
or hurting, what should I discuss with my mentor.*

## Architecture: three distinct questions, three distinct layers

```
Phase E — "What is the state of THIS PRODUCT?"        (decision engine)
Phase G — "What is the state of the BUSINESS, and      (this phase)
           what's the biggest thing that needs
           attention?"
Phase F — "What should the student EXECUTE this week?" (task system)
```

```
DATA → METRICS → PRODUCT DECISION → PORTFOLIO INTELLIGENCE / BUSINESS ATTENTION → TASK EXECUTION
```

Phase G is a **pure read/derive layer with zero new schema**. Every input
comes from Phase C/D/E/F's own already-computed results
(`getProductPortfolio`, `getAccountEconomicsSummary`,
`getUnmatchedShopifyOrders`, open `mentorship_tasks` rows,
`mentorship_product_decisions`/`_overrides` history). It makes no
decisions of its own — it classifies, ranks, and summarizes decisions
Phase E already made, and reuses Phase F's task text verbatim wherever a
corresponding task exists. It never disagrees with Phase E about what a
product's state is, and it never independently decides SCALE/KILL/etc.

## Files

```
src/lib/health/
  types.ts                  — AccountHealthStatus, PortfolioInsight, AttentionBottleneck, ChangeSinceReview
  assess.ts                 — pure: assessAccountHealth()
  portfolio-intelligence.ts — pure: summarizePortfolio()
  attention.ts              — pure: rankBusinessAttention()
  change-detection.ts       — pure: getChangesSinceLastReview()
  runner.ts                 — server-only: getAccountIntelligence() (student), getMentorBriefing() (admin)
src/lib/tasks/generate.ts   — tiny additive export (UNRESOLVED_FULFILLMENT_DEDUP_KEY), no behavior change
src/app/dashboard/mentorship/[slug]/page.tsx                            — + Primary Business Focus section
src/app/admin/mentorship/[programId]/students/[enrollmentId]/page.tsx  — + Account Health & Call Prep panel
```

No migration. No new table. No new RLS policy — every query already flows
through the exact same RLS-scoped reads `getProductPortfolio` and the rest
of Phase C/D/E/F use.

## Account health methodology

**No 0–100 score.** A categorical status — `INSUFFICIENT_DATA` /
`CRITICAL` / `AT_RISK` / `HEALTHY` — evaluated as an ordered gate (the same
shape as the decision engine's own gate-then-diagnose structure), with the
*exact triggering reasons* returned as plain-language strings, never a
hidden weighted sum.

1. **INSUFFICIENT_DATA**: zero active products, or none of them have moved
   past `DATA_NEEDED`/`TEST` — reusing the engine's own EARLY_TEST/
   INSUFFICIENT_SAMPLE semantics for "not enough data yet" rather than
   inventing a new "evaluated" concept. This is what makes "a healthy
   status requires genuinely sufficient evaluated data" actually true: a
   portfolio of all-TEST products can never read HEALTHY.
2. **CRITICAL**: any KILL-decision product still showing ad spend;
   portfolio contribution profit computably negative; any product at/above
   the engine's own `RTO_RATE_CRITICAL_PERCENT`; a majority of active
   products blocked on `DATA_NEEDED`.
3. **AT_RISK**: any incomplete-economics products (reusing
   `productsWithIncompleteEconomics` — incompleteness is itself a signal,
   never treated as ₹0); RTO in the warning range; overdue tasks; products
   needing iteration; minority data-blocked.
4. **HEALTHY**: none of the above, and at least one product is genuinely
   evaluated.

## Portfolio intelligence methodology

`summarizePortfolio()` turns `getProductPortfolio()`'s entries into typed
sentences — never a sentence without a real count behind it, never a
generic motivational line. Scaling/iterating/blocked/kill counts are
literal `portfolio.filter(...).length`. The "biggest blocker" statement
(RTO vs. incomplete economics) compares two real counts and names
whichever is strictly larger; a tie (including 0–0) produces no statement
— no fabricated winner.

## Attention priority methodology — deliberately separate from Phase F

Phase F's `rankTaskCandidates`/`rankOf` answers *"what should the student
execute first"* and ties KILL/SCALE/RELAUNCH together — reasonable for
execution, since all three just need action. Phase G's
`rankBusinessAttention()` answers a different question — *"what is the
single biggest business problem right now"* — with its own ordering:

```
1. CRITICAL_DATA_BLOCKER   — DATA_NEEDED (by definition, no decision is possible)
2. SEVERE_ECONOMICS        — non-KILL product with negative contribution profit
                              (an unflagged, still-active bleed — more urgent
                              than an already-decided KILL sitting in a task)
3. CRITICAL_FULFILLMENT    — non-KILL product at/above critical RTO
4. KILL                    — already decided, already has a "stop spend" task
5. SCALE_OPPORTUNITY
6. RELAUNCH_OPPORTUNITY
7. ITERATE
8. TEST
9. MONITOR                 — WATCH
```

A product is classified into exactly one level (first match wins) — a
KILL product is never *also* flagged as SEVERE_ECONOMICS, and a
DATA_NEEDED product is never *also* flagged as CRITICAL_FULFILLMENT
(fulfillment can't be trusted until the data gap is closed). Levels 2/3
are what make this genuinely different from Phase F: they promote a
product ABOVE its nominal decision state when it's quietly bleeding money
or RTO despite not (yet) being a decided KILL.

**Text reuse, never a second recommendation engine**: for any product-tied
bottleneck, the module looks for a currently-open, non-mentor task on that
product (Phase F's own supersession logic guarantees at most one such task
reflects the CURRENT decision at any time) and reuses its
title/why/next_action **verbatim**. Only when no task exists yet does it
fall back to the underlying decision's own why/next_action — for the two
"promoted" levels, the real contribution-profit or RTO number is appended
to that existing text, never a new recommendation. An enrollment-wide
"unresolved shipping orders" candidate (reusing Phase D's
`getUnmatchedShopifyOrders` count) follows the identical pattern via a
newly-exported `UNRESOLVED_FULFILLMENT_DEDUP_KEY` constant shared with
Phase F's own generator — the only two-line change made to `generate.ts`
in this entire phase.

## Portfolio breakdown & aggregation

The breakdown is `getProductPortfolio()`'s own entries, plus attention
rank. Totals reuse `getAccountEconomicsSummary()` directly:
- **Portfolio blended ROAS** = `totalRevenue / totalAdSpend` (only when
  spend > 0) — never an average of per-product ROAS.
- **Portfolio contribution** = `totalContributionProfit`, already
  null-safe (null only when every product's economics are incomplete).

## Change detection methodology — no snapshot table

Decisions are append-only (Phase E never mutates
`mentorship_product_decisions`) and overrides likewise, so "what changed
since the last review" is derived by comparing "latest as of now" against
"latest as of the review cutoff" — using Phase E's own
`resolveEffectiveDecision()` fed two different points in time, so an
**override-driven** change (e.g. a mentor overriding KILL to WATCH) is
correctly detected too, not just raw engine-decision changes. RTO and
contribution drift reuse the existing range-parameterized
`getProductFulfillmentSummary`/`getAccountEconomicsSummary` called twice —
once for the current range, once for a same-length range ending at the
cutoff — never a new aggregation. A ₹1,000 materiality floor
(`MATERIAL_CONTRIBUTION_CHANGE_MINOR`, a V1 documented threshold like the
engine's own constants) filters out noise. Completed/overdue tasks read
directly off existing `mentorship_tasks` columns. "Review cutoff" = the
most recent completed `mentorship_calls` row, falling back to 7 days ago.

**Known, deliberate limitation**: "currently overdue" states what's true
right now, not "became overdue since the review" — there's no historical
snapshot of overdue status to diff against, and fabricating that timeline
would violate "never fabricate."

## Dashboard changes

Student home gained exactly one new compact section — **Primary Business
Focus** — inserted between the header and This Week's Focus: a health
badge plus the single top-ranked bottleneck's WHAT/WHY/NEXT ACTION, with
the health's own explanatory reasons shown only when status isn't
HEALTHY. The existing Product Portfolio section gained 2–4 lines of
portfolio-intelligence bullets prepended above its unchanged card grid.
Nothing else in Phase F's command-center hierarchy was touched.

## Mentor changes — the 2-minute briefing

One new panel in the admin student workspace (after the access/payments
panels, before Connections): health badge, primary business focus,
portfolio bullets, up to 3 additional products needing attention, open/
overdue task counts, latest mentor override, and a "Since last review"
change list. No giant analytics screen; no invented "unresolved
questions" section (the current data model has no mechanism for tracking
open questions, so per the phase's own scope rule, that bullet was
omitted rather than fabricated).

## Security

Zero new tables, zero new RLS policies. Every Phase G read goes through
the same RLS-scoped client Phase C/D/E/F already use. Verified directly: a
real student session sees only their own portfolio (cross-enrollment
queries return an empty portfolio and `INSUFFICIENT_DATA`, never another
student's real data); a real (non-service-role) admin session correctly
sees full account intelligence via the existing `is_admin()` bypass; a
paused student's own session loses visibility exactly like Phase F's
dashboard gate already enforces, while the admin retains full visibility
regardless of the student's access status.

## Testing performed

- **62 pure unit assertions**: health status gates (all four categories,
  including the "TEST-only portfolio is still INSUFFICIENT_DATA" case),
  portfolio-intelligence sentence generation (including the tie-break "no
  fabricated winner" case), attention-priority classification and ranking
  (including the two "a product classifies into exactly one level" cases
  and the mentor-task-must-not-match case), and change detection
  (including the override-driven transition case and the noise-filter
  case).
- **Real-database integration test**: seeded four genuinely distinct
  products (SCALE/profitable, KILL/unprofitable, WATCH-with-negative-
  contribution, DATA_NEEDED) plus 12 genuinely orphaned unresolved orders
  against the real hosted Supabase project; ran the real, unmodified
  Phase E engine and Phase F generator; hand-verified every contribution
  profit and blended ROAS number against the real returned values;
  confirmed the "unflagged bleed ranks above an already-decided KILL"
  design decision holds with real engine-computed decisions, not just
  fixtures; confirmed task-text reuse becomes verbatim-exact once Phase F
  generates the corresponding task; performed a real mentor override and
  confirmed both the effective-decision resolution and the change-
  detection "since last review" text correctly reflect it; ran
  `getMentorBriefing`/`getAccountIntelligence` through real authenticated
  RLS-scoped sessions for the student, a cross-enrollment student, and a
  real admin account; toggled `mentorship_profiles.access_status` to
  `paused` and confirmed the RLS-scoped student session loses visibility
  while the service-role admin path retains it.
- **Live browser verification**: seeded one real KILL-decision product,
  confirmed the student dashboard's new Primary Business Focus section and
  the admin's new Account Health & Call Prep panel both render correctly
  with exact hand-verified numbers (revenue, ad spend, contribution
  profit, ROAS, break-even ROAS, RTO rate all matched precisely), and
  confirmed Phase E's Product Decisions section, Phase F's Weekly Tasks
  section, and the legacy KPIs/Products sections all remained visually and
  functionally unchanged.
- `npm run typecheck`, `npm run lint`, and `npm run build` all pass clean.

## Known limitations

- "Currently overdue" in change detection is a present-tense fact, not a
  "became overdue since the review" timeline (no historical snapshot
  exists to support that claim).
- No "unresolved questions" call-prep bullet — the data model has no
  mechanism for tracking open questions.
- The mentor briefing's RTO/contribution "since last review" comparison
  depends on there being real data in both the current and the
  previous-review-length window; a student with no historical data before
  the cutoff will simply show no drift signals rather than a fabricated
  comparison.
- Attention ranking and account health both operate ONLY on `active`
  products (matching `getProductPortfolio`'s own default) — archived
  products never appear as a "bottleneck," even if they were the reason
  for a RELAUNCH candidacy in their prior life.

## Recommended next phase

Not specified by this phase — Phase G's own scope ends at account health,
portfolio intelligence, attention priority, and change detection. A
natural next step (not started, not scoped here) would be turning "what
changed since the last review" into a lightweight, opt-in notification —
but that is explicitly out of this phase's scope and remains your call.
