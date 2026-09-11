# Weekly Mentor Review + Call Workflow — Phase H

Closes the core mentorship loop:

```
STUDENT EXECUTES → MENTOR REVIEWS → MENTOR GIVES DIRECTION → NEXT WEEK'S TASKS
```

on top of the existing pipeline:

```
DATA → METRICS → PRODUCT DECISION → PORTFOLIO INTELLIGENCE → TASKS
  → MENTOR REVIEW → MENTOR DIRECTION → NEXT WEEK'S TASKS
```

Phase H is composition, not computation: no new decision engine, no new
task-priority engine, no new analytics, no second notes system, no second
weekly-plan system. Every number and ranking on the review screen comes
from Phase E/F/G's existing, unmodified functions.

## Schema changes (exactly two, both additive, both approved before implementation)

1. **`mentorship_notes.is_mentor_direction boolean NOT NULL DEFAULT false`**
   (migration `0012_mentorship_review.sql`). The only way to tell a
   student-visible weekly directive apart from a general/internal mentor
   note. Existing rows default to `false` — never reinterpreted as
   direction. No RLS policy change: the existing `mentorship_notes_select_own_or_admin`
   / `mentorship_notes_admin` policies key on `enrollment_id`, not columns,
   so they already cover it.
2. **No DB constraint on `mentorship_calls.status`** — by explicit
   decision, tightened at the UI layer only: a `<select>` with exactly
   `scheduled` / `completed` / `cancelled` replaces the free-text input in
   both the create and edit call forms (and the new review screen's call
   form), with server-side validation in `addMentorshipCall`/
   `updateMentorshipCall` restricting *new* writes to those three values.
   Historical freeform values (e.g. "Completed successfully") keep
   rendering and keep matching Phase G's `resolveReviewCutoff()`
   unchanged — verified directly with a seeded legacy-status call.

## The `rankOf` mentor-priority tweak

One additive branch in `tasks/generate.ts`'s existing `rankOf()` (not a new
function, not a new ranking concept):

```
MENTOR + priority "high"   → tier 1 (alongside kill/scale/relaunch)
MENTOR + priority "medium" → tier 4 (Phase F's original default — unchanged)
MENTOR + priority "low"    → tier 6 (alongside WATCH)
```

Every other source's ranking is untouched — proved by re-running Phase F's
original 47-assertion ranking-order test unmodified (still all pass) and a
new set of Phase H assertions covering the three mentor tiers plus a
full non-mentor regression pass.

## Files changed

New:
- `supabase/migrations/0012_mentorship_review.sql`
- `src/lib/review/{types.ts, runner.ts}`
- `src/app/admin/mentorship/[programId]/students/[enrollmentId]/review/page.tsx`

Modified:
- `src/types/database.ts` — `MentorshipNote.is_mentor_direction`
- `src/lib/tasks/generate.ts` — the `rankOf` tweak above (additive)
- `src/app/admin/mentorship/[programId]/students/[enrollmentId]/actions.ts` —
  `addMentorshipNote` gained an `is_direction` flag (one function, one note
  concept, never two); `addMentorshipCall`/`updateMentorshipCall` gained
  status validation
- `src/app/admin/mentorship/[programId]/students/[enrollmentId]/page.tsx` —
  call status inputs → selects (with a legacy-value escape hatch so
  editing an old freeform-status call never silently normalizes it),
  notes list shows a DIRECTION badge, "Start Review" link added
- `src/app/dashboard/mentorship/[slug]/page.tsx` — Mentor Direction query
  now filters `is_mentor_direction = true` (previously "latest note of any
  kind"); no other student-facing section added, per the explicit
  instruction

## The review screen

`/admin/mentorship/[programId]/students/[enrollmentId]/review` — a
purpose-built, focused mentor operating screen, deliberately separate from
the long administrative workspace page (which keeps payments, access
controls, raw connections, legacy KPIs/Products, and the Product Decisions
override form). Reusing `MentorTaskForm`/`MentorTaskRow` as-is for task
management — no fork.

`src/lib/review/runner.ts`'s `getMentorReviewData()` calls Phase G's
`getMentorBriefing()` unchanged and adds only presentation composition:
raw completed/skipped/open/overdue task *lists* (re-running the same
simple filters `getMentorBriefing` already runs internally, rather than
editing that file to expose more of its internals), changes grouped by
product (a `Map` built from `briefing.changes`), the single "biggest
opportunity" (`bottlenecks.find()` for a `SCALE_OPPORTUNITY`/
`RELAUNCH_OPPORTUNITY` level), and notes split into active direction /
since-the-last-call / historical (by `is_mentor_direction` and recency
relative to `reviewCutoffIso`). `mentorship_tasks.updated_at` (an
already-existing, already-auto-updating column from Phase A's original
trigger) is the zero-schema signal for "skipped since the last call" —
`SKIPPED` has no dedicated timestamp, but every UPDATE bumps `updated_at`
regardless of which columns changed.

Eight sections, in the order specified: Student Overview, What Changed,
Portfolio (top bottlenecks joined with their metrics and per-product
changes), Execution (completed/skipped/open/overdue + a completion rate
shown only when the denominator is non-zero), Mentor Notes (direction
highlighted, current-call vs. historical split by recency), Call Prep (a
pure composition of the six items above — no advice generated, no
questions invented), Current Call (pick/create a call via query-string
navigation, edit its status/notes through the existing
`addMentorshipCall`/`updateMentorshipCall` actions, set direction through
`addMentorshipNote` with `is_direction=true`), Next Week Plan (the
existing task list + form, unmodified).

## Call → cutoff → next review

Marking a call `completed` needs no extra step: Phase G's
`resolveReviewCutoff()` already finds "the most recent completed call in
the past" every time it runs, so the very next review automatically uses
today's completed call as its new cutoff. No historical snapshot was
added — verified directly across a real multi-call cycle (see Testing).

## Security

No new RLS policies. The one new column inherits existing notes policies.
The review route is `requireAdmin()`-gated exactly like the existing
workspace page, same `enrollmentId` param, no new cross-enrollment
surface. On the student side, only the Mentor Direction query's filter
changed; RLS itself still allows a student's own session to read *all*
their notes (unchanged from pre-Phase-H) — only the dashboard's specific
query now asks for direction-only, which is what was actually requested
("students must not be able to edit mentor direction," not "students must
be blocked from ever reading a general note"). Insert/update on
`mentorship_notes` remains admin-only, unchanged, and was re-verified with
a real student JWT attempting both.

## Tests performed (mapped to the approved 24-case matrix)

**Pure unit** (`test_phase_h_pure.js`, 15 new assertions, all passing):
HIGH/MEDIUM/LOW mentor-task tiering (cases 10–13), a full non-mentor
regression re-proving DATA_NEEDED > KILL > severe-fulfillment > ITERATE >
TEST > WATCH is untouched (case 12–13). Phase F's own 47-assertion suite
and Phase G's 66-assertion suite were re-run unmodified — both still
report ALL PASSED (cases 23–24 regression).

**Real database** (`test_phase_h_db.js`, seeded against the hosted
Supabase project, all assertions passing): a KILL product and a SCALE
product evaluated by the real, unmodified decision engine (case 5–6, 11,
13); two historical completed calls — one using a **legacy freeform**
status string — proving the cutoff always resolves to the most recent
genuinely-completed call, never the legacy one, never an older one (cases
3, 4, 7, 8, 9); a task completed *between* two calls correctly excluded
from the second review's "completed since cutoff" while a task completed
*after* the second call is correctly included (case 16, 17, multi-cycle
"What Changed"); "biggest opportunity" correctly isolates the SCALE
product while "primary bottleneck" stays on the KILL product (case 11);
general vs. direction notes stored with the correct boolean, latest
direction correctly wins over an earlier one (cases 1, 2, 5, 6); a real
student JWT's exact dashboard-shaped query returns only the direction
note and never the general one (case 3); the same student session's
INSERT and UPDATE attempts on `mentorship_notes` both correctly affect
zero rows (case 4); a HIGH mentor task is confirmed, via the real
`getWeeklyFocusTasks()`, to outrank a LOW mentor task in actual selected
output (case 10); a mentor override still triggers Phase F's real
supersession logic and correctly changes only the *effective* decision,
never the engine's own KILL record (case 14, 15); cross-enrollment
isolation via a second real student session returns an empty portfolio
and `INSUFFICIENT_DATA`, never Rahul's real data (case 19); a real admin
session sees full data while the specific student is paused, while the
student's own session loses visibility (case 20, 21); the same pattern
re-verified for an expired (`end_date` in the past) enrollment (case 22).

**Live browser verification**: as a real (non-service-role) admin —
opened the student workspace, clicked "Start Review," read the full
2-minute briefing on a real seeded KILL-decision product (all numbers —
ROAS 1.43x, break-even 1.71x, profit −₹1,150, RTO 10% — hand-verified
against the exact same figures the DB test computed), set a new mentor
direction, created a HIGH-priority next-week task through the reused
`MentorTaskForm`, and marked a call `completed` through the new status
select (confirming a call whose `scheduled_at` is still in the future
correctly does *not* become the review cutoff even when marked completed
early — the cutoff logic's `scheduled_at <= now` guard held). As the real
student — confirmed the new direction text appeared in Mentor Direction,
confirmed the general/internal notes from earlier phases did **not**
appear there, and confirmed the HIGH-priority mentor task the admin had
just created appeared in This Week's Focus ranked in the same tier as
(and ahead of, by recency) the KILL-decision task — the mentor-priority
tweak working end-to-end through real UI, real actions, and real ranking
output, not just in isolation.

All seeded data, notes, tasks, and the mutated call status were cleaned
up and independently re-verified empty; the throwaway admin account was
deleted. `npm run typecheck`, `npm run lint`, and `npm run build` all pass
clean.

## Known limitations

- "Skipped since cutoff" relies on `updated_at`, which bumps on *any*
  update to a task row — if a task were edited (say, its wording) after
  being skipped, that edit would also (harmlessly) refresh `updated_at`
  and keep it inside the "since cutoff" window. Low-risk in practice since
  skipped tasks are rarely edited afterward, but worth naming.
- The "Next call" figure (on both the review screen and student
  dashboard) is based purely on `scheduled_at >= now`, independent of
  status — a call marked `completed` ahead of its scheduled time (an
  unusual, mentor-error scenario, exercised deliberately in live testing)
  still displays as the "next call" until its scheduled time passes. This
  predates Phase H and was intentionally left unchanged.
- No DB-level CHECK constraint on call status, by explicit decision — a
  direct API/script write could still insert an arbitrary string. The UI
  path is fully constrained; only the RLS-authorized-but-out-of-band write
  path is not.
- Call Prep and Portfolio never generate advice or invent unresolved
  questions, per the explicit scope rule — there is intentionally no
  "questions to ask" field anywhere on the review screen.

## Recommended next phase

Not specified here — Phase H's own scope ends at the review/call/direction
workflow. Explicitly not started: AI-generated advice, notifications
(email/WhatsApp), scheduled/automatic weekly generation, or any automated
ad/spend action. That remains your call for a future phase.
