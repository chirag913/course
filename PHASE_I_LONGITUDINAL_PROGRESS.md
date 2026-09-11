# Longitudinal Progress & Business Journey — Phase I

Answers a question none of the earlier phases could: *is this student's
business actually improving over time?*

```
Phase G — CURRENT BUSINESS HEALTH
Phase H — MENTOR INTERVENTION
Phase I — LONGITUDINAL PROGRESS
```

```
DATA → METRICS → DECISIONS → HEALTH → TASKS → REVIEW → PROGRESS
```

Progress consumes every layer above it and modifies none of them. It is
**100% read-only** — no new writes anywhere, on either the student or
mentor route.

## Zero new schema

No new tables, no new columns, no new RLS policies. Two existing pure
functions were **exported without any behavior change** (verified by the
full pre-existing Phase F/G/H pure-test suites still passing byte-for-byte
after the export):
- `shiftRangeEnd` (`health/runner.ts`, Phase G)
- `mondayOf` / `mondayOfPreviousWeek` (`tasks/generate-runner.ts`, Phase F)

## Files

```
src/lib/progress/
  types.ts    — DecisionTimelineEntry, PeriodComparison, ExecutionHistory,
                MentorshipJourney, ReviewCycle, ProgressData
  timeline.ts — pure: buildDecisionTimeline(decisions, overrides)
  runner.ts   — server-only: getProgressData() — composes Phase C/D/E/G
                functions across three time windows; no new business math
src/app/dashboard/mentorship/[slug]/progress/page.tsx           — student, narrative
src/app/admin/mentorship/[programId]/students/[enrollmentId]/progress/page.tsx — mentor, denser
```

Plus two one-line navigation additions (a "Progress" link on the student
dashboard's existing utility nav row; a "View longitudinal progress" link
on the Phase H Review screen) and the two tiny exports above. Nothing else
touched.

## Timeline methodology

`buildDecisionTimeline()` merges a product's full `mentorship_product_decisions`
+ `mentorship_product_decision_overrides` history into one chronological
event stream, then replays Phase E's own `resolveEffectiveDecision()` at
every event — exactly Phase G's "as of cutoff" trick, generalized from one
cutoff to every point in the product's life. An entry is emitted **only**
when the effective decision actually changes; a re-run that reaffirms the
same state produces nothing. Each entry knows whether an active mentor
override (not a fresh engine run) is its current authority, and
`daysInState` is the real gap to the next transition (or to "now" for the
still-current, `ongoing` entry) — never a claim about *why* the change
happened. Verified against 7 categories of pure test (first decision,
repeated decision producing no duplicate, multi-transition sequences,
override-driven transitions, multiple overrides plus an engine run taking
back authority, missing/edge-case history, and exact day-count arithmetic).

## Comparison methodology

Three windows, each just `getAccountEconomicsSummary()` called twice (or
once for since-joining) and diffed:
- **This week vs. last week** — calendar weeks, Monday-start, via the
  reused `mondayOf`/`mondayOfPreviousWeek`.
- **Last 30 days vs. the 30 days before** — rolling windows via the reused
  `shiftRangeEnd`, matching the dashboard's own existing "Last 30 days"
  convention.
- **Since joining** — `start = max(mentorship_profiles.start_date, earliest real order/insight date)`. When real data starts later than the join
  date, this is stated plainly ("data available from X"); when real data
  predates the join date (a store connected with historical orders from
  before mentorship began), those pre-join orders are correctly excluded
  rather than counted as "progress since joining" — verified live.

Every percentage change is `null` unless **both** sides are non-null and
the baseline is non-zero — never a divide-by-zero, never a "% up from
nothing" claim. Contribution profit is only ever compared when both
periods are fully computable (Phase D's own null-safety inherited, not
re-decided). RTO is shown as a **raw count**, not a rate: `AccountEconomicsSummary`
doesn't already expose an account-wide RTO rate (it has no "shipped"
total to reproduce Phase D's per-product eligible-base formula), and
adding one would mean extending a Phase D/G-shared function — out of
scope for a phase that must not modify Phase D/G business logic.

## Execution methodology

Three unbounded queries (all `DONE`, all `SKIPPED`, all currently-open
tasks for the enrollment — realistic totals over a mentorship's lifetime,
not a performance concern) are fetched once and bucketed **in memory** by
ISO week (reusing `currentIsoWeek`) for the last 8 weeks. No consistency
score — only real counts and a completion rate (`completed/(completed+skipped)`,
`null` when there's nothing to divide). Overdue is reported once, for
right now, never bucketed historically (there's no historical snapshot of
"was this overdue on that day" to derive it from honestly). Split by
`source` for the mentor's denser view.

## Student UX

A narrative, not a dashboard: header ("Week N of your mentorship"), Your
Journey (per-product decision timelines with override markers), What's
Improved (the three comparisons, each with an explicit "not enough
activity yet" fallback), What Still Needs Work (Phase G's own
`primaryBottleneck`, reused verbatim — never a competing opinion), 8-week
Execution History, and Mentor Direction History. No raw Meta/Shopify
metric dump anywhere on this page.

## Mentor UX

Same `getProgressData()`, denser rendering: full decision timelines with
reason codes and override reasons, underlying comparison numbers (not
just a sentence), execution history split by task source, Review History
(what changed between **every** pair of consecutive completed calls, not
just the latest), and mentor direction history placed directly alongside
business progress — with an explicit, visible statement that the page
does **not** claim direction caused any change. Review History is
deliberately derived uniformly from the already-built decision timelines
and task lists for **every** cycle, including the trailing "since the
last call" one — Phase G's `getChangesSinceLastReview()` is intentionally
*not* reused for historical pairs, because it's anchored to wall-clock
"now" (its valid domain in Phase G/H) and cannot be repurposed for an
arbitrary past upper bound without modifying it, which this phase must
not do. The richer "vs. right now" view (RTO/contribution drift included)
stays on the Phase H Review screen, one link away, rather than being
duplicated here.

## Security

Zero new RLS surface. Both routes read through the same RLS-scoped client
every other mentorship page uses; the student route additionally gates on
`getEffectiveMentorshipStatus` exactly like the existing dashboard (no
progress computed at all when access isn't active); the mentor route uses
`requireAdmin()` exactly like every other admin page. No new write path
exists anywhere in this phase.

## Tests performed

**27 pure assertions** (`buildDecisionTimeline`): first decision, repeated
identical decisions producing no duplicate, a 4-state transition sequence,
an override-driven transition, multiple overrides including an engine
re-run taking back authority from a stale override, an override with no
prior decision, empty history, and exact day-count arithmetic for both a
completed and an ongoing state. Phase F's 47-, Phase G's 66-, and Phase
H's 15-assertion pure suites were all re-run unmodified after the two tiny
exports — all still ALL PASSED.

**Real database** — seeded a real 4-state decision+override history, real
revenue data placed via the exact same boundary functions the code under
test uses (robust to whatever weekday the test happens to run on), 3
completed calls, direction + general notes, and a multi-week task history,
then verified: the timeline sequence and override flag exactly; week and
30-day revenue/order figures matching hand calculations exactly;
since-joining correctly truncated to the later of join-date/earliest-data;
execution history correctly bucketed by ISO week and split by source;
completed-call counts; direction history excluding the general note and
ordered correctly; and multiple review cycles correctly reflecting
decision transitions and task completions in each window — including a
real pre-existing completed call from earlier phase testing interleaving
with the seeded ones, which the review-cycle logic handled correctly
without any special-casing. RLS-isolated sessions for the student, a
second (cross-enrollment) student, and the admin; paused and expired
mentorship correctly hide all progress data from the student's own
session while the service-role admin path retains it.

**Live browser** — both pages rendered against real seeded data with
every number (revenue, ad spend, RTO count, contribution profit, days in
each decision state, review-cycle transitions) hand-verified against the
displayed figures; confirmed the "since joining" window correctly
excludes pre-join historical orders; confirmed both navigation links
resolve to the correct routes; confirmed the mentor page's non-causal
framing renders as written.

All test data, the mutated `start_date`/`end_date`/`access_status`, and
the throwaway admin account were cleaned up and independently
re-verified empty/restored. `npm run typecheck`, `npm run lint`, and
`npm run build` all pass clean.

## Known limitations

- Review History caps at the last 6 completed calls (5 historical cycles
  + 1 trailing) to bound the page's size and cost — a deliberate,
  documented limit, not silent truncation (a mentorship with more history
  simply shows its most recent cycles).
- No continuous "health over time" chart, by explicit design decision —
  reconstructing full historical health at many past points would mean
  recomputing an entire portfolio snapshot per point, which is real
  analytics-dump territory the brief asked to avoid.
- No numeric progress score and no historical health score anywhere, by
  explicit instruction — every figure is an independently-labeled real
  quantity.
- RTO in the comparison windows is a raw count, not a rate, since
  computing a rate would require extending a Phase D/G-shared function
  this phase must not modify.

## Recommendation for Phase J

Not specified here — Phase I's own scope ends at this read-only
longitudinal layer. Nothing in this phase implies or requires a next
phase; that remains your call.
