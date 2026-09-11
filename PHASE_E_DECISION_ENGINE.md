# Mentorship Product Decision Engine — Phase E

A deterministic engine that answers "what should the student do with this
product right now?" — DECISION, WHY, NEXT ACTION, PRIORITY, EVIDENCE, and
DATA QUALITY. Builds entirely on Phase C's product metrics and Phase D's
economics/fulfillment calculations (`PHASE_C_PRODUCT_INTELLIGENCE.md`,
`PHASE_D_ECONOMICS_SHIPPING.md`) — nothing here recalculates what those
phases already compute correctly.

**No LLM, ever.** The engine is a pure function over explicit rules. An AI
*explanation* layer could be added later, but it would only ever narrate a
decision this engine already made — it could never make the decision
itself. **The engine also never takes action** — it only writes a
recommendation record. Nothing here pauses an ad, kills a product, or
changes spend automatically.

## Files

```
supabase/migrations/0010_mentorship_product_decisions.sql
src/lib/decisions/
  constants.ts       — every V1 threshold, named and documented
  types.ts           — DecisionEngineInput / DecisionResult / reason codes
  engine.ts          — evaluateProductDecision() — the pure function
  build-input.ts     — gathers real data via Phase C/D functions (server-only)
  engine-runner.ts   — runs the engine + persists via service role (server-only)
  effective.ts       — resolves engine decision vs mentor override
src/app/dashboard/mentorship/[slug]/products/decisions-actions.ts
src/components/products/evaluate-decision-button.tsx
src/components/products/mentor-override-form.tsx
```

Extended: product detail page (PRODUCT DECISION + DECISION HISTORY
sections), products list page (Decision/Priority/ROAS/Break-even
ROAS/Contribution Profit/RTO Rate columns), and the admin student
workspace (`/admin/mentorship/[programId]/students/[enrollmentId]`) with a
"Product Decisions" section — this is the only place a mentor can actually
reach the override form, since admins don't have their own enrollment in a
student's program and can't view the student-scoped product page directly.

## Decision states

`DATA_NEEDED`, `TEST`, `WATCH`, `ITERATE`, `SCALE`, `RELAUNCH`, `KILL`.
Explicitly **not** built: account health score, portfolio score, weekly
task generation — those are Phase F.

## Pipeline (the actual evaluation order)

This is intentionally **not** the same as the "decision precedence" list
below — precedence describes which decision wins when multiple conditions
are simultaneously true; the pipeline describes the order checks actually
run in `evaluateProductDecision()`:

1. **Data quality gate** (`runDataQualityGate`) — returns the first
   blocking issue found, in a fixed order (see below). Never skipped.
2. **Lifecycle / RELAUNCH** — checked next, before anything else, because
   an inactive product needs to be recognized as a RELAUNCH candidate
   before it falls into a generic "not enough data" message.
3. **Sufficiency** — is there enough spend (`MIN_DECISION_SPEND_MINOR`) and
   purchases (`MIN_PURCHASES_FOR_ECONOMIC_DECISION`) for a full economic
   verdict?
   - **If yes:** catastrophic-economics KILL check → diagnostics
     (fulfillment, then creative, then conversion) → SCALE → WATCH
     fallback.
   - **If no:** diagnostics are checked anyway (a weak CTR or high RTO is
     diagnosable from ad/shipment volume alone, independent of the
     purchase-count threshold) → TEST or WATCH fallback based on spend
     alone.

KILL is checked **before** the diagnostics in the "sufficient" branch so
genuinely catastrophic economics can override a merely-explanatory
diagnostic. Diagnostics are checked **before** SCALE so the engine never
recommends scaling through an unresolved structural problem.

## Data-quality gate (STEP 1) — exact order

Returns the first blocker found; everything after it is never evaluated.
Minor warnings (already surfaced by Phase D's own data-quality evaluator
on the product page) never reach here — only issues that make *any*
responsible decision impossible do:

1. No Shopify mapping → `DATA_MISSING_SHOPIFY_MAPPING`
2. No Meta mapping → `DATA_MISSING_META_MAPPING` (Meta spend underlies
   almost every rule below, so V1 treats it as always required)
3. Non-INR product currency → `DATA_CURRENCY_UNSUPPORTED` — see "Currency"
   below
4. Ambiguous Shopify price with no saved override → `DATA_AMBIGUOUS_PRICE`
5. Missing selling price / COGS / shipping / COD / packaging / other
   variable / RTO cost → one `DATA_MISSING_*` code each, in that order
6. Unresolved fulfillment ratio too high (see below) →
   `DATA_UNRESOLVED_FULFILLMENT`
7. Required provider data stale (see below) → `DATA_STALE`
8. Zero current activity **and no history at all** → `DATA_INSUFFICIENT`
   ("not enough data yet") — the "no history" qualifier is what lets a
   dormant-but-previously-profitable product reach the RELAUNCH check
   instead of stopping here

**Every one of Phase D's six cost fields is required**, unconditionally —
even for a `TEST` verdict. This is a deliberate reading of the spec's own
examples (a missing COGS is `DATA_NEEDED` with no "unless it's early"
carve-out) and it resolves an apparent tension between two of the spec's
worked examples: a product with ₹1,200 spend and "valid economics" gets
`TEST`, while a product with the same spend and a missing COGS gets
`DATA_NEEDED` — the economics being complete is itself a precondition, not
an optional nicety.

### Unresolved fulfillment ratio

`MAX_UNRESOLVED_FULFILLMENT_RATIO = 0.15` (15%) — a V1 heuristic, not a
law. The spec's own example (20 of 100 orders unresolved = 20%) exceeds
this, correctly triggering `DATA_NEEDED`.

### Stale data

`STALE_DATA_HOURS = 24`. Only checked for a provider the product is
actually mapped to — Meta staleness is irrelevant if the product has no
Meta ads, and vice versa.

### Currency

Thresholds throughout this engine (`MIN_TEST_SPEND_MINOR`, etc.) are
defined in **INR minor units** — the only currency this platform can
safely reason about, since there's no exchange-rate table anywhere in the
codebase. A product priced in any other currency gets `DATA_NEEDED`
(`DATA_CURRENCY_UNSUPPORTED`) rather than a silently-wrong converted
threshold.

## Sufficiency thresholds (V1 product heuristics, not industry benchmarks)

```
MIN_TEST_SPEND_MINOR                    = ₹2,000
MIN_DECISION_SPEND_MINOR                = ₹5,000
MIN_PURCHASES_FOR_ECONOMIC_DECISION     = 3
```

- Spend below `MIN_TEST_SPEND_MINOR` → `TEST` ("still gathering data").
- Spend at/above `MIN_TEST_SPEND_MINOR` but the full decision threshold
  isn't met (spend below `MIN_DECISION_SPEND_MINOR`, OR purchases below
  `MIN_PURCHASES_FOR_ECONOMIC_DECISION`) → `WATCH` ("enough activity to
  observe, not enough for a structural call").
- Both met → eligible for KILL/SCALE/diagnostic ITERATE.

## Diagnostics (STEPS 3-6)

Each diagnostic has its **own** data-sufficiency gate, independent of the
overall spend/purchase threshold above — this is what makes a weak-CTR
product correctly return `ITERATE` even before it has enough purchases for
a full economic verdict (the spec's CASE 5).

**Creative / CTR** — `WEAK_CTR_PERCENT = 1.0%`, requires
`MIN_IMPRESSIONS_FOR_CTR_DIAGNOSTIC = 1000` impressions to even consider
it. Below that many impressions, CTR is too noisy to diagnose from, so no
`creative_issue` flag is raised regardless of how low the number looks.

**Click → purchase conversion** — `MIN_CLICKS_FOR_CONVERSION_DIAGNOSTIC =
100`, `WEAK_PURCHASE_RATE_PERCENT = 0.5%`. Never computed at all if clicks
or purchase data is unavailable.

**Fulfillment / RTO** — `RTO_RATE_WARNING_PERCENT = 20%`,
`RTO_RATE_CRITICAL_PERCENT = 30%`, requires
`MIN_ORDERS_FOR_RTO_DIAGNOSTIC = 10` orders with a *resolved* fulfillment
status. Missing shipping data is never treated as "healthy" by omission —
the diagnostic simply doesn't fire, and (separately) `SCALE` itself
requires real, acceptable fulfillment data to be present at all (see
below) — literally unknown fulfillment is not "acceptable," it's
"unassessed."

## SCALE — all six required

1. `spend >= MIN_DECISION_SPEND_MINOR`
2. `purchases >= MIN_PURCHASES_FOR_ECONOMIC_DECISION`
3. `contributionProfit > 0` (Phase D's calculation, unmodified)
4. `blendedRoas > breakEvenRoas` (see "Which ROAS drives decisions" below)
5. Fulfillment data actually exists, is diagnostic-eligible, and RTO rate
   is below the warning threshold (20%) — not just "not critical"
6. No data-quality blocker (already guaranteed by the gate)

## KILL — deliberately does not look at CTR or RTO at all

1. `spend >= MIN_DECISION_SPEND_MINOR`
2. `purchases >= MIN_PURCHASES_FOR_ECONOMIC_DECISION`
3. Economics complete (guaranteed by the gate)
4. `blendedRoas < breakEvenRoas`
5. `contributionProfit < 0`

A weak CTR or a high RTO rate on their own never produce KILL — they
produce `ITERATE`, which is checked *after* KILL in the pipeline so
catastrophic economics can still override a milder diagnostic explanation,
but a mere diagnostic issue can never manufacture a KILL on its own.

## RELAUNCH

```
!lifecycle.isActive
&& lifecycle.everHadPositiveContribution   (derived from this product's OWN decision history — see below)
&& lifecycle.mostRecentPriorDecision !== "KILL"   (don't flip-flop on a recent kill)
```

`isActive` = `product.status === "active"` AND the product had real
Shopify orders or Meta spend in the evaluated range. `
everHadPositiveContribution` is derived by checking this product's own
`mentorship_product_decisions` history for a prior `ECONOMICS_POSITIVE`
reason code — there's no separate historical-snapshot table; the engine's
own audit trail *is* the history.

## Decision precedence (final tie-break, for reference)

```
DATA_NEEDED > RELAUNCH > KILL > SCALE > ITERATE > WATCH > TEST
```

This describes *priority if multiple were somehow simultaneously true*; it
is not the literal code path (see "Pipeline" above, which checks
diagnostics before SCALE specifically so the engine never scales through
an unresolved structural problem).

## Which ROAS drives decisions

Phase D produces two ROAS numbers that must never be conflated: **Meta
ROAS** (purchase value ÷ spend, Meta's own attribution) and **Blended
ROAS** (real Shopify revenue ÷ spend). SCALE/KILL/break-even comparisons
in this engine use **Blended ROAS** — because break-even ROAS itself is
derived from the product's *real* selling price and costs, blended ROAS is
the apples-to-apples number to compare it against. Meta ROAS is still
surfaced in the decision's evidence for context, but it never drives the
SCALE/KILL branch — this is a deliberate, documented choice, not an
oversight.

## Priority

```
HIGH:   DATA_NEEDED (always — it only ever fires because of a real blocker),
        KILL, critical fulfillment ITERATE (RTO >= 30%)
MEDIUM: creative/conversion ITERATE, WATCH, RELAUNCH (not specified by the
        original spec; assigned MEDIUM as a sensible default — meaningful
        enough for mentor attention, not as urgent as KILL/DATA_NEEDED)
LOW:    TEST, SCALE (a scale verdict is "keep monitoring while growing,"
        not urgent)
```

## Reason codes

Stable, internal identifiers — never free text. See `src/lib/decisions/types.ts`
for the complete list (`DATA_MISSING_COGS`, `CREATIVE_WEAK_CTR`,
`CONVERSION_WEAK`, `FULFILLMENT_HIGH_RTO`, `FULFILLMENT_CRITICAL_RTO`,
`ECONOMICS_POSITIVE`, `ECONOMICS_BELOW_BREAK_EVEN`, `PREVIOUSLY_PROFITABLE`,
`EARLY_TEST`, `INSUFFICIENT_SAMPLE`, and one `DATA_*` code per gate check).

## Evidence

A short, deterministic list of plain facts (spend, CTR, clicks, purchases,
blended ROAS, break-even ROAS, contribution profit, RTO rate — whichever
are relevant/available), built from string templates, never generated
prose.

## Decision history

`mentorship_product_decisions` — **append-only**. One row per engine run
that produced a result; nothing is ever updated or deleted by the app.
Verified directly: running the engine twice on the same product produces
two distinct rows with different IDs, not one row being overwritten.

**Who can write to it:** nobody, through a normal session — not even
admin. There is no INSERT policy at all on this table. The only way a row
is ever created is `runAndRecordDecision()` (server-only), which uses the
service-role client after the calling Server Action has already verified
the caller owns (or administers) the enrollment. A student *can* trigger a
fresh evaluation (the engine's judgment doesn't depend on who asks for
it), but they can never insert a decision themselves, correct or fake.

## Mentor override

Admin-only (`mentorship_product_decision_overrides`, INSERT restricted to
`is_admin()`). **Never edits the engine's own record.** The "effective
decision" is resolved at read time (`resolveEffectiveDecision`): an
override only counts as active if it was created *after* the most recent
engine run — so re-running the engine naturally hands control back to the
system's own judgment unless the mentor overrides that new result too.
There's no explicit "clear override" button in V1; re-running the engine
is how a stale override stops applying.

The UI always shows both: "System decision: KILL" / "Mentor override:
WATCH" / "Reason: ..." — verified live end-to-end (admin overrides SCALE
to WATCH on the admin student workspace; the student's own product page
correctly shows WATCH as the headline decision with the system/override/
reason breakdown, while Decision History still shows the original SCALE
row annotated "Later overridden to WATCH").

**Admin access note:** admins don't have their own enrollment in a
student's mentorship program, so they can't reach the student-scoped
`/dashboard/mentorship/[slug]/products/[productId]` route directly. The
override form is therefore surfaced on the existing admin student
workspace (`/admin/mentorship/[programId]/students/[enrollmentId]`,
already used for Connections since Phase A) instead of retrofitting the
whole student product page for dual access — a Phase C/D-era gap this
phase had to work around, not something new.

## Security / RLS

Both new tables: RLS enabled, `SELECT` open to the owning student or
admin. `mentorship_product_decisions` has **no** INSERT/UPDATE/DELETE
policy for anyone through a session — service-role only.
`mentorship_product_decision_overrides` allows INSERT for admin only.
Cross-enrollment integrity enforced by database triggers on both tables
(same pattern as Phase C/D). Verified with real JWTs: full read isolation
across both tables, a student blocked from inserting a decision directly
even for their own enrollment, a student blocked from creating an
override, and a regression check that Phase B's provider tables remain
untouched.

## Testing performed

- **Pure engine tests**: all 11 numbered spec cases plus 4 explicit
  conflict cases (weak CTR + strong economics ≠ KILL; excellent CTR +
  catastrophic economics ≠ SCALE; high RTO + strong acquisition → ITERATE
  not KILL; truly insufficient data + poor CTR → TEST not ITERATE) — all
  passing, run directly against `evaluateProductDecision()` with no DB.
- **Pure effective-decision tests**: override-after-engine wins,
  override-before-engine loses to the newer engine run, no-override,
  override-with-no-engine-decision, neither-exists.
- **Real-database, end-to-end test**: seeded genuinely realistic
  Shopify/Meta/shipping/economics data on a real enrollment and ran the
  actual `runAndRecordDecision()` pipeline (build-input reusing Phase C/D
  functions → engine → service-role persistence) — produced `SCALE` for
  data that should scale; ran it twice and confirmed two distinct
  append-only rows (CASE 13); created a real mentor override and confirmed
  the engine's own row stayed untouched; confirmed cross-enrollment
  trigger rejection on both new tables.
- **RLS isolation**: two real authenticated student JWTs, full read
  isolation, insert-blocking on both tables, admin-only override
  enforcement, and a Phase B regression check.
- **Live browser walkthrough**: seeded real data, clicked "Re-evaluate" on
  the product page, confirmed the SCALE decision rendered with correct
  evidence/next-action/priority; confirmed the Products list page showed
  the same decision plus ROAS/break-even ROAS/contribution profit/RTO
  rate; logged in as a real (throwaway) admin, found and used the mentor
  override form on the admin student workspace, overrode SCALE to WATCH
  with a reason; logged back in as the student and confirmed the
  effective decision correctly showed WATCH with the full system/override/
  reason breakdown and the annotated decision history.
- `npm run typecheck`, `npm run lint`, `npm run build` all pass clean.

## Known limitations

- Non-INR products get `DATA_NEEDED` rather than a real currency
  conversion — there's no exchange-rate source in this codebase.
- RELAUNCH's "previously profitable" signal depends entirely on this
  engine's own decision history existing — a product that was profitable
  before Phase E existed (or before it was ever evaluated) has no
  historical record to detect that from.
- No "clear override" UI — a stale override stops applying automatically
  only once the engine is re-run.
- All thresholds in `constants.ts` are V1 starting points for this
  specific platform, not calibrated against real usage data yet.

## What remains for Phase F

Converting decisions into weekly mentor tasks, and — separately —
account/portfolio health scoring across a student's whole product
catalog. Both explicitly out of scope here.
