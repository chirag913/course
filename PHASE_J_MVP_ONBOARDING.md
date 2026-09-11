# Phase J — MVP / Onboarding Readiness

Scope: make the existing mentorship platform stable and usable for onboarding a real
paying mentorship student **now**, with manual-only admin WhatsApp contact. No cron,
no automation, no event/notification system — those remain for a later phase.

## Files changed

| File | Change |
|---|---|
| `supabase/migrations/0013_mentorship_whatsapp_phone.sql` | New migration: `mentorship_profiles.whatsapp_phone TEXT NULL` (additive only) |
| `src/types/database.ts` | Added `whatsapp_phone` to the `MentorshipProfile` type |
| `src/app/admin/mentorship/[programId]/students/[enrollmentId]/actions.ts` | `upsertMentorshipProfile` now persists `whatsapp_phone` (admin-only, `requireAdmin()`-gated) |
| `src/lib/whatsapp.ts` | New: `sanitizePhoneForWhatsApp` / `buildWhatsAppUrl` — pure helpers, no dependency, no network call |
| `src/components/admin/whatsapp-custom-message.tsx` | New: custom-message textarea that live-builds a `wa.me` link |
| `src/app/admin/mentorship/[programId]/students/[enrollmentId]/page.tsx` | New "WhatsApp" section: base button + 4 conditional quick actions + custom message; `whatsapp_phone` field added to the existing "Current state" form |

No other application files were touched. No cron route, queue, worker, event bus, or
third-party notification/messaging integration was created.

## Migration

```sql
ALTER TABLE public.mentorship_profiles
  ADD COLUMN whatsapp_phone text;
```

Applied via `npx supabase db push` against the hosted project. Purely additive —
no existing column, table, or RLS policy was modified.

## Onboarding flow (admin lifecycle)

Confirmed already fully built in Phases A–I and required **no changes**:

- Admin finds a student by email (`lookupStudentByEmail`) and activates mentorship
  access with a duration and optional start date (`approveMentorshipStudent`), which
  creates the `enrollments` + `mentorship_profiles` rows.
- Admin can Pause / Resume / Revoke / Restore / Extend access at any time
  (`MentorshipAccessPanel`), and add/edit/mark-paid payments
  (`MentorshipPaymentsPanel`).
- There is no mentorship checkout — admin collects payment via a manually-created
  Razorpay Payment Link outside the platform, consistent with the existing design.

## WhatsApp implementation (manual only)

`src/lib/whatsapp.ts` builds a `https://wa.me/<digits>?text=<encoded message>` URL
from the stored phone number. Every WhatsApp control in the admin workspace is a
plain `<a target="_blank">` link — nothing is ever sent by the app itself; the admin
reviews the draft in WhatsApp and presses Send themselves.

Flow: **Admin student workspace → WhatsApp Student → opens WhatsApp with the
correct, normalized phone number.**

Quick actions (each renders only when its underlying data exists — never
fabricated):
- **Task reminder** — reuses `getWeeklyFocusTasks` (Phase F), unmodified
- **Mentor direction** — reuses the already-fetched `mentorship_notes` row where
  `is_mentor_direction = true` (Phase H), no new query
- **Payment reminder** — reuses the next unpaid `mentorship_payments` row
- **Call reminder** — reuses the next upcoming `mentorship_calls` row
- **Custom message** — free-text box, live-updates its own "Open in WhatsApp" link

Verified live (two independent throwaway students, across two passes):
- `+91 98765 43210` → `919876543210`, `+91 91234 56789` → `919123456789` (correct
  digit-only normalization for `wa.me`)
- All four quick-action messages match the requested templates exactly, word for
  word, with real student name/task/direction/amount/date substituted in
- Custom-message box defaults to `"Hey {student}, "` and reactively rebuilds its
  link as the admin types
- With no task/note/payment/call yet, all four quick actions correctly stay hidden
  and only the base button + custom message show

## Real onboarding verification (fresh throwaway accounts, deleted after)

Two full end-to-end passes were run against the live dev server and real hosted
Supabase project, using freshly created throwaway auth users (never Rahul's or
Student B's real fixtures):

1. **Admin finds student by email** → found correctly.
2. **Admin activates mentorship** → `enrollments` + `mentorship_profiles` rows
   created with the correct program, 30-day duration, `active` status.
3. **WhatsApp phone set** via the admin "Current state" form → persisted and
   correctly normalized into the WhatsApp button/links.
4. **Student logs in** → dashboard loads, greets the student by name.
5. **Mentorship dashboard, Connections, Products, and Progress pages** all load
   correctly for a zero-data account (graceful "not enough data yet" states, no
   crashes), and correctly populate once tasks/notes/payments/calls exist.
6. **Admin workspace** shows the WhatsApp section, all quick actions verified as
   above.
7. **Pause → Resume → Revoke → Restore**, each verified two ways: directly against
   the database (`access_status`/`paused_at` transitions) and from the student's
   own live session (blocked with a clear "ACCESS REVOKED" message while revoked;
   fully restored after Restore).
8. **Expired access** (derived, not a stored status): set `end_date` to yesterday
   → student session correctly shows "Your mentorship period has ended," reverted
   after the check. Confirms `getEffectiveMentorshipStatus` needs no cron to work.
9. **Historical data preserved**: the seeded task/note/payment/call all survived
   the full pause/resume/revoke/restore cycle unmutated.
10. **Cross-student isolation**: a second throwaway student, given the same program
    slug, saw only their own empty state — zero visibility into the first
    student's task, direction, payment, or call. Confirmed structurally too: every
    student-side query re-derives `enrollment_id` from the session's own `user_id`
    server-side, never from a URL parameter.
11. **Student cannot reach admin controls**: navigating directly to the admin
    workspace URL as a student redirects to `/dashboard` (`requireAdmin()`
    guard) — so `whatsapp_phone`, mentor-direction notes, and payments are
    structurally unreachable from a student session, not just hidden in the UI.
12. **Existing course functionality**: admin course list and a public course page
    both spot-checked and render correctly (untouched by this pass).

## Tests

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run build` — clean, every route compiled and generated successfully
- **Phase F regression** (pure, DB, RLS) — ALL PASSED, including column-level task
  restrictions and cross-enrollment trigger rejection
- **Phase G regression** (pure, DB) — ALL PASSED, including RLS-scoped account
  intelligence, cross-enrollment isolation, and paused-mentorship visibility gates
- **Phase H regression** (pure, DB) — ALL PASSED, including a real-DB confirmation
  that a student cannot insert or edit a mentor note/direction, and that
  paused/expired access blocks the student's direction query
- **Phase I regression** (pure, DB) — ALL PASSED, including cross-enrollment
  isolation and paused/expired progress-data gates

(Two of the regression scripts had stale references to a throwaway admin fixture
deleted in a previous cleanup pass; the fixture was recreated and the scripts
re-run clean. All test data these scripts create is self-cleaned at the end of
each run, confirmed by a final scan showing zero leftover rows on the real
fixture enrollment.)

## Production-readiness status

**Ready to onboard a real paying student.** The full lifecycle — signup, admin
approval, active mentorship, dashboard, tasks/products/payments/connections/
progress, manual WhatsApp contact, pause/resume/revoke/restore, expiry — is
verified working end to end against the real hosted database, with no code
changes needed to Phases A–I beyond the WhatsApp addition.

Safety confirmed: Rahul's and Student B's real fixture accounts were read-only
touched by regression scripts (which self-clean) and are verified byte-for-byte
intact; only newly-created throwaway accounts were ever mutated or deleted; no
secrets reach the client; the WhatsApp phone number never leaves the app except
as a `wa.me` URL the admin opens themselves.

## Remaining limitations (intentional, deferred)

- No automated notifications of any kind — admin must manually check the
  dashboard and manually send WhatsApp messages.
- No automatic Shopify/Meta sync — "Sync Now" remains a manual click.
- No automatic task generation on a schedule — generation is a manual action.
- No email integration.
- These are all deliberate scope exclusions for this pass, not gaps — the full
  automation architecture (data sync → evaluation → task generation → event
  detection → notification) remains a separate, later phase.

**Stopping here, as instructed. Not starting the full Phase J automation
architecture.**
