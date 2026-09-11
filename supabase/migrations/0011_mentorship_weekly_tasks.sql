-- ============================================================================
-- Phase F — Weekly task system + command-center dashboard. Extends the
-- existing mentorship_tasks table (created in 0004) rather than
-- introducing a second, competing task concept. Builds on Phase E's
-- product decision engine (0010) and Phase D's economics/fulfillment —
-- this migration adds NO new business logic tables, only the columns
-- needed to carry decision-engine-derived tasks alongside the existing
-- mentor-authored weekly checklist.
-- ============================================================================

ALTER TABLE public.mentorship_tasks
  ADD COLUMN status text NOT NULL DEFAULT 'TODO'
    CONSTRAINT mentorship_tasks_status_check CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'SKIPPED')),
  ADD COLUMN priority text NOT NULL DEFAULT 'medium'
    CONSTRAINT mentorship_tasks_priority_check CHECK (priority IN ('high', 'medium', 'low')),
  ADD COLUMN source text NOT NULL DEFAULT 'MENTOR'
    CONSTRAINT mentorship_tasks_source_check CHECK (source IN ('DECISION_ENGINE', 'MENTOR', 'DATA_QUALITY', 'FULFILLMENT', 'ACCOUNTABILITY')),
  ADD COLUMN product_catalog_id uuid REFERENCES public.mentorship_product_catalog (id) ON DELETE SET NULL,
  ADD COLUMN description text,
  ADD COLUMN why text,
  ADD COLUMN next_action text,
  ADD COLUMN due_date date,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN reason_code text,
  -- The actual idempotency mechanism for generated tasks (see
  -- src/lib/tasks/generate.ts) — e.g. "decision:{productId}:{reasonCode}"
  -- or "dataquality:{productId}:cogs". NULL for freely-repeatable
  -- mentor-authored tasks (they were never meant to be deduplicated).
  ADD COLUMN dedup_key text,
  -- Admin-only free-text context on a task — never student-editable.
  ADD COLUMN mentor_notes text;

-- Only one OPEN (TODO/IN_PROGRESS) task per (enrollment, dedup_key) at a
-- time — once a task is DONE or SKIPPED, the same dedup_key can produce a
-- fresh task later if the underlying issue recurs. This is what actually
-- makes "running generation twice must not create duplicate tasks" true,
-- not just application-level dedup logic — the same partial-unique-index
-- pattern already used for mentorship_connections (Phase A) and
-- mentorship_data_syncs (Phase B).
CREATE UNIQUE INDEX mentorship_tasks_open_dedup_unique
  ON public.mentorship_tasks (enrollment_id, dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('TODO', 'IN_PROGRESS');

CREATE INDEX mentorship_tasks_product_idx ON public.mentorship_tasks (product_catalog_id);
CREATE INDEX mentorship_tasks_status_idx ON public.mentorship_tasks (enrollment_id, status);

-- Cross-enrollment integrity for the new product link, same pattern as
-- every product-linked table since Phase C.
CREATE OR REPLACE FUNCTION public.check_mentorship_task_product_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_enrollment uuid;
BEGIN
  IF NEW.product_catalog_id IS NOT NULL THEN
    SELECT enrollment_id INTO v_product_enrollment FROM public.mentorship_product_catalog WHERE id = NEW.product_catalog_id;
    IF v_product_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
      RAISE EXCEPTION 'mentorship_tasks: product_catalog_id must belong to the same enrollment as the task';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mentorship_tasks_check_product_enrollment
  BEFORE INSERT OR UPDATE ON public.mentorship_tasks
  FOR EACH ROW EXECUTE FUNCTION public.check_mentorship_task_product_enrollment();

-- ----------------------------------------------------------------------------
-- RLS: students previously had SELECT-only on this table (all writes were
-- admin-only). Phase F requires "students can update their own task
-- status" — but title/priority/source/mentor_notes must stay mentor-only,
-- and Postgres has exactly one authenticated DB role shared by every
-- student AND every admin session alike (app-level admin/student
-- distinction is the `profiles.role` column, checked via is_admin() in RLS
-- — it is NOT a separate Postgres role). RLS row policies alone cannot
-- restrict WHICH COLUMNS a matched row's UPDATE may touch.
--
-- So the actual enforcement here is two layers together:
--   1. This RLS policy restricts WHICH ROWS a student's session may touch
--      (their own, active-access enrollment).
--   2. The GRANT below restricts WHICH COLUMNS the shared `authenticated`
--      role may ever write, full stop — status/is_done/completed_at only.
-- Admin's own task management (title, priority, source, due_date, mentor
-- notes, product assignment) therefore has to go through the service-role
-- client (see src/app/admin/.../actions.ts), which bypasses both RLS and
-- this column grant — the same "elevated writes are server-only" pattern
-- already used for OAuth tokens (Phase A) and decision records (Phase E).
-- ----------------------------------------------------------------------------
CREATE POLICY "mentorship_tasks_update_own_status"
  ON public.mentorship_tasks FOR UPDATE
  USING (public.is_mentorship_access_active(enrollment_id))
  WITH CHECK (public.is_mentorship_access_active(enrollment_id));

REVOKE UPDATE ON public.mentorship_tasks FROM authenticated;
GRANT UPDATE (status, is_done, completed_at) ON public.mentorship_tasks TO authenticated;
