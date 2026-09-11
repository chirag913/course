-- Phase H — weekly mentor review + call workflow.
--
-- The ONLY schema change genuinely required: a discriminator on
-- mentorship_notes so "mentor direction" (a specific, student-visible
-- weekly directive) can be told apart from a general/internal mentor note.
-- Without this, the student dashboard's "Mentor Direction" section would
-- have to keep guessing (today it just shows the single most recent note
-- of ANY kind, which is exactly the ambiguity this column removes).
--
-- Existing rows default to false — no reinterpretation of history. No RLS
-- policy changes needed: mentorship_notes_select_own_or_admin and
-- mentorship_notes_admin both key on enrollment_id, not columns, so they
-- already cover this new column.
--
-- Call status remains free-text (no CHECK constraint added here, by
-- explicit decision) — Phase H tightens it only at the UI layer (a
-- <select> instead of a text input), so existing historical values keep
-- working unchanged with Phase G's resolveReviewCutoff() matching.

ALTER TABLE public.mentorship_notes
  ADD COLUMN is_mentor_direction boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mentorship_notes.is_mentor_direction IS
  'True only for the mentor-authored weekly directive shown on the student dashboard. The most recent true row is the active direction (latest wins, same pattern as resolveEffectiveDecision). All pre-Phase-H notes default to false and are never reinterpreted as direction.';
