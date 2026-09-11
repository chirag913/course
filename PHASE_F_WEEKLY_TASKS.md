# Weekly Tasks + Command-Center Dashboard — Phase F

The bridge from Product Decision Engine → Reason/Diagnostics → Recommended
Next Action → Mentor Task → Weekly Focus → Student Home Dashboard. Builds
entirely on Phase E's decision engine (`PHASE_E_DECISION_ENGINE.md`) and
Phase C/D's product metrics/economics — **no new business logic is
duplicated here**, only a deterministic mapping from an already-computed
decision onto a task.

## Architecture decision: extend, don't duplicate

`mentorship_tasks` already existed (a minimal mentor-authored weekly
checklist: title/is_done/week_start). Phase F **extends** it (ALTER TABLE)
rather than introducing a second task table — the same table now serves
both the legacy simple checklist and the new decision-derived/data-quality/
fulfillment/accountability tasks, distinguished by `source`.

## Files

```
supabase/migrations/0011_mentorship_weekly_tasks.sql
src/lib/tasks/
  types.ts             — TaskCandidate / TaskGenerationContext
  generate.ts          — pure decision -> task mapping, ranking, selection
  generate-runner.ts   — server-only orchestration: fetch, generate, dedupe, supersede
  focus.ts             — reads + ranks currently-open tasks for the dashboard
src/app/dashboard/mentorship/[slug]/actions.ts   — student: updateTaskStatus, runWeeklyTaskGeneration
src/app/dashboard/mentorship/[slug]/page.tsx     — rewritten into the command-center hierarchy
src/app/admin/mentorship/[programId]/students/[enrollmentId]/actions.ts — extended with full task CRUD
src/app/admin/mentorship/[programId]/students/[enrollmentId]/page.tsx   — extended with a Weekly Tasks section
src/lib/products/portfolio.ts   — extracted shared "product + decision + economics" summary
                                    (also used to refactor the Products list page — one formula, not two)
src/components/mentorship/task-status-toggle.tsx, refresh-focus-button.tsx
src/components/admin/mentor-task-form.tsx, mentor-task-row.tsx, generate-tasks-button.tsx
```

## Schema changes

`mentorship_tasks` gained: `status` (TODO/IN_PROGRESS/DONE/SKIPPED),
`priority` (high/medium/low — same literal values as the decision engine's,
not a new scale), `source` (DECISION_ENGINE/MENTOR/DATA_QUALITY/
FULFILLMENT/ACCOUNTABILITY), `product_catalog_id`, `description`/`why`/
`next_action`, `due_date`, `completed_at`, `reason_code`, `dedup_key`,
`mentor_notes`. `is_done`/`week_start`/`position` stay for backward
compatibility with the original simple checklist.

**Idempotency is a database constraint, not just application logic**: a
partial unique index on `(enrollment_id, dedup_key) WHERE status IN
('TODO','IN_PROGRESS')` means only one OPEN task can ever exist per
underlying issue — once it's DONE or SKIPPED, the same dedup key can
produce a fresh task later if the issue recurs.

### The column-level security problem, and how it's actually solved

Students previously had zero write access to `mentorship_tasks` (SELECT
only). Phase F needs "students can update their own task status" while
keeping title/priority/source/mentor_notes mentor-only. The complication:
**Postgres has exactly one `authenticated` role, shared by every student
AND every admin session** — the admin/student distinction is the
`profiles.role` column, checked via `is_admin()` inside RLS, not a
separate database role. RLS row policies can restrict *which rows* a
session may touch, but not *which columns* — that needs a real Postgres
column-level `GRANT`.

So the actual mechanism is two layers:
1. A new RLS policy (`mentorship_tasks_update_own_status`) restricts which
   **rows** a student's session may UPDATE (their own, active-access
   enrollment).
2. `REVOKE UPDATE ON mentorship_tasks FROM authenticated; GRANT UPDATE
   (status, is_done, completed_at) ON mentorship_tasks TO authenticated;`
   restricts which **columns** the shared role may ever write, full stop.

This means admin's own task edits (title, priority, due date, mentor
notes, product assignment) **cannot** go through the RLS-scoped client
either — they go through the service-role client
(`src/lib/supabase/admin.ts`), the same "elevated writes are server-only"
pattern already used for OAuth tokens (Phase A) and decision records
(Phase E). Verified directly: a real student session, using the Supabase
client with their own JWT, can update their own task's `status` but gets a
genuine Postgres "permission denied for table mentorship_tasks" error
attempting to change `title`/`priority` on that same row — not a
409/RLS-row error, an actual privilege error.

## Decision → task mapping (deterministic, no LLM)

`generateTaskCandidates()` never recomputes a decision — it consumes the
*already-resolved* effective decision (Phase E's `resolveEffectiveDecision`
output via `getProductPortfolio`) and its existing `reasonCode`/`why`/
`nextAction`, and maps it to a task:

| Decision | Task | Priority | Dedup cadence |
|---|---|---|---|
| DATA_NEEDED | Specific ("Add COGS for X", "Map X to Shopify", ...) per reason code | high | per issue (not weekly — persists until fixed) |
| TEST | "Continue testing X" | low | weekly |
| WATCH | "Monitor X" | low | weekly |
| ITERATE (creative) | "Refresh ad creatives for X" | medium | per issue |
| ITERATE (conversion) | "Improve the product page/offer for X" | medium | per issue |
| ITERATE (fulfillment, severe) | "Review fulfillment for X" | **high** | per issue |
| SCALE | "Scale X gradually" (never a specific % — "increase spend gradually" only) | low | per scale event, not weekly |
| RELAUNCH | "Prepare a relaunch test for X" | medium | per event |
| KILL | "Stop spend on X" (explains — never executes anything) | high | per event |

The `why`/`next_action` text is **always reused verbatim from the
decision** — the task generator never re-authors evidence-level specifics
(exact CTR%, spend, etc.); only the short task-headline ("title") is new,
since Phase E's decisions carry a sentence-style `why`, not a task-style
title.

Two non-product task sources: an **enrollment-wide** fulfillment task
("Review N unresolved shipping orders" — Phase D's `getUnmatchedShopifyOrders`,
distinct from any single product's own unresolved ratio; priority escalates
to high above 20 orders) and an **accountability** nudge (only generated
when the previous week actually left tasks incomplete — never a standing
weekly filler).

### Superseding — the fix for a decision that changes between runs

A product's effective decision can change (KILL → WATCH after a mentor
override; ITERATE → SCALE once fixed). Naively, this would leave the OLD
task open forever alongside the NEW one — a student could see both "Stop
spend" and "Monitor" for the same product simultaneously. So before
inserting new candidates, generation marks any still-open, non-mentor,
product-linked task whose dedup key isn't among *this run's* fresh
candidates for that product as `SKIPPED` (superseded, never deleted —
history stays intact). Mentor-authored tasks are never touched by this.
Verified directly: overriding a real KILL decision to WATCH correctly
superseded the old "Stop spend" task and created a new "Monitor" task
whose `why` referenced the mentor's actual override reason.

## Priority & ranking (Weekly Focus selection)

```
DATA_NEEDED blockers > KILL/SCALE/RELAUNCH > severe fulfillment ITERATE
  > plain ITERATE > TEST > WATCH
```

`rankTaskCandidates()` implements this and is used by **both** generation
(no consumer needs it there directly, but it's the same function) and
`getWeeklyFocusTasks()` reading persisted rows — one ranking
implementation, not two. Mentor-created tasks (no generated dedup key)
rank alongside plain ITERATE by default.

`selectWeeklyFocus()` prefers 3-4 tasks, extends to 5 only if a 5th item is
itself high-priority — never pads the list with low-value filler to hit a
round number.

## Dashboard hierarchy (student home)

Rewritten in the specified progressive-disclosure order: Header/Current
State (compact) → **This Week's Focus** (dominant, bordered prominently,
max 5 tasks with WHAT/WHY/NEXT ACTION inline, no second page needed) →
Business Snapshot (Phase D's `getAccountEconomicsSummary` — built in Phase
D specifically for this, never consumed until now) → Product Portfolio
(the new shared `getProductPortfolio` helper, also used to refactor the
Products list page so there's exactly one "product + decision + ROAS +
profit" formula in the codebase) → Next Mentor Call → Mentor Direction
(latest note only) → Membership/Payments → Resources. A small utility link
row (Connections/Products/Fulfillment Data) preserves access to the setup
pages that used to be large nav cards on this page — still reachable,
no longer dominant.

Incomplete economics are communicated explicitly ("N products have
incomplete economics — contribution profit excludes them rather than
guessing"), never silently shown as ₹0.

## Admin experience

The admin student workspace (`/admin/mentorship/[programId]/students/[enrollmentId]`,
already the home of Connections since Phase A and Product Decisions since
Phase E) gained a **Weekly Tasks** section: Open / Completed-Skipped
grouping, full create/edit form (title, why, next action, description,
priority, due date, product assignment, mentor-only notes), and
Complete/Skip/Reopen actions — none of which ever write to
`mentorship_product_decisions` or `mentorship_product_decision_overrides`.
Decision Engine and Mentor Override remain entirely separate systems from
task management, exactly as required. A "Generate this week's tasks"
button runs the identical engine the student's own button runs.

## Security / RLS

Students: SELECT their own tasks (unchanged), UPDATE only
status/is_done/completed_at on their own (column-grant-enforced, see
above), no INSERT policy at all (task creation stays mentor/admin-only —
verified: a student's own session gets a genuine RLS violation attempting
to insert even into their own enrollment). Cross-enrollment integrity for
`product_catalog_id` enforced by a database trigger, same pattern as every
product-linked table since Phase C. Verified with two real student JWTs:
full read isolation, row-level update blocking on another student's task,
insert blocking, and a regression check that Phase E's decision tables
remain untouched by any of this.

## Testing performed

- **Pure unit tests**: one candidate per decision state with exact
  title/priority/dedup-key assertions (including the SCALE title
  deliberately avoiding "increase spend by X%"), the enrollment-wide
  fulfillment/accountability tasks' materiality thresholds, dedup-key
  stability across repeated calls, "no decision yet → no task" (never
  fabricate), the full ranking order, and weekly-focus selection's
  prefer-4-extend-to-5-only-if-high-priority rule.
- **Real-database, end-to-end test**: seeded genuinely realistic Shopify/
  Meta/shipping/economics data, ran the real decision engine (got a real
  KILL), ran real task generation (got the right task with `why` reused
  verbatim), ran it again (idempotent — 0 new, 1 duplicate skipped, still
  exactly one row), created a real mentor override, ran generation again
  and confirmed the old KILL task was superseded (SKIPPED) while a new
  task reflecting the override's actual reason appeared, confirmed the
  column-grant restriction with a real Postgres permission error, and
  confirmed cross-enrollment trigger rejection.
- **RLS isolation**: two real authenticated student JWTs — full read
  isolation, row-level update blocking, insert blocking, and a Phase E
  regression check.
- **Live browser walkthrough**: real seeded product data (ITERATE/weak
  CTR) plus Rahul's existing mentor-authored tasks/notes/calls/payments —
  confirmed This Week's Focus correctly interleaved a decision-engine task
  and a fulfillment task ahead of pre-existing mentor tasks by priority;
  confirmed Business Snapshot's contribution profit matched hand-computed
  math exactly; confirmed Product Portfolio's card matched the same
  numbers; clicked a task through TODO → IN_PROGRESS → DONE as the
  student and confirmed the database state at each step; switched to a
  real (throwaway) admin session and confirmed the Weekly Tasks section
  showed the student's just-completed task immediately, created a new
  mentor task through the actual form, and skipped it — all reflected
  live.
- **Regression checks**: Phase E's Product Decisions section (with mentor
  override) still renders and functions on the admin page; the Products
  list page (refactored to use the new shared portfolio helper) still
  builds and typechecks with no behavior change; existing
  payments/KPIs/calls/mentor-notes/legacy-products sections on the admin
  page untouched.
- `npm run typecheck`, `npm run lint`, `npm run build` all pass clean.

## Known limitations

- The enrollment-wide "unresolved shipping orders" task and the weekly
  accountability nudge aren't auto-superseded the way per-product
  decision tasks are — if the underlying count later drops to zero, the
  old open task doesn't auto-resolve (a mentor can still skip/complete it
  manually). Only per-product decision-derived tasks get automatic
  superseding.
- Weekly Focus and task generation always use the same default 30-day
  window as the rest of the app (Phase C's `DEFAULT_DATE_RANGE_PRESET`) —
  there's no separate date-range control for tasks specifically.
- No "snooze" or explicit due-date reminder mechanism beyond the plain
  `due_date` field and the OVERDUE badge on the admin view.
- Task generation is triggered explicitly (a button, student or admin) —
  there's no scheduled/cron-based automatic weekly run.

## What remains for Phase G

Not specified by this phase's instructions — this phase's own scope ends
at the command-center dashboard and weekly task system; no account
health/portfolio scoring, no further automation, and no product decisions
were added beyond what Phase E already produces.
