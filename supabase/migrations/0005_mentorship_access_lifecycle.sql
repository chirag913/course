-- ============================================================================
-- Ecommerce Mentorship V1 operating system — access lifecycle + payments
--
-- This is NOT a Razorpay integration. The admin manually creates a Razorpay
-- Payment Link outside this platform and pastes it into the admin dashboard;
-- this schema only stores/displays that information. All lifecycle controls
-- (activate/pause/resume/revoke/restore/extend) are admin-only.
--
-- Course access/RLS and the existing checkout/payment flow are entirely
-- untouched by this migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Access-lifecycle fields on the existing 1:1 mentorship_profiles table.
-- `access_status` only ever stores 'active' | 'paused' | 'revoked' — the
-- fourth user-facing state, 'expired', is derived (active + end_date passed)
-- rather than stored, so nothing needs a cron job to flip it.
-- ----------------------------------------------------------------------------
ALTER TABLE public.mentorship_profiles
  ADD COLUMN access_status text NOT NULL DEFAULT 'active'
    CONSTRAINT mentorship_profiles_access_status_check CHECK (access_status IN ('active', 'paused', 'revoked')),
  ADD COLUMN start_date date,
  ADD COLUMN end_date date,
  ADD COLUMN duration_days integer,
  ADD COLUMN paused_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2) Pause/resume history — one row per pause, closed out on resume. Keeps a
-- clean audit trail instead of overwriting a single "last paused" value.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_pause_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  paused_at timestamptz NOT NULL,
  resumed_at timestamptz,
  paused_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  resumed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mentorship_pause_history_enrollment_idx ON public.mentorship_pause_history (enrollment_id, paused_at);

-- ----------------------------------------------------------------------------
-- 3) Manually-tracked mentorship payments. Admin creates a Razorpay Payment
-- Link elsewhere and pastes it here; the platform never talks to Razorpay's
-- API for this. Amounts are per-record (no fixed monthly price assumption).
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  amount integer NOT NULL, -- paise, matching the orders/programs convention
  currency text NOT NULL DEFAULT 'INR',
  due_date date NOT NULL,
  razorpay_link text,
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT mentorship_payments_status_check CHECK (status IN ('pending', 'paid', 'overdue')),
  paid_date date,
  notes text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentorship_payments_amount_nonnegative CHECK (amount >= 0)
);

CREATE TRIGGER mentorship_payments_set_updated_at
  BEFORE UPDATE ON public.mentorship_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX mentorship_payments_enrollment_idx ON public.mentorship_payments (enrollment_id, due_date);

-- ----------------------------------------------------------------------------
-- 4) Access-aware helper for mentorship CONTENT tables (tasks/kpis/products/
-- calls/notes/resources) — mirrors is_program_enrolled()'s security-definer
-- pattern, but additionally requires the mentorship access record to be
-- 'active' and not past its end date. This is deliberately NOT applied to
-- mentorship_profiles or mentorship_payments themselves — a paused/revoked
-- student must still be able to see their own status and payment history,
-- just not the coaching content. See DATABASE.md-equivalent reasoning in
-- ARCHITECTURE notes: this only tightens mentorship content access; course
-- enrollments (which never have a mentorship_profiles row) are unaffected.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_mentorship_access_active(p_enrollment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.mentorship_profiles mp ON mp.enrollment_id = e.id
    WHERE e.id = p_enrollment_id
      AND e.user_id = auth.uid()
      AND mp.access_status = 'active'
      AND (mp.end_date IS NULL OR mp.end_date >= CURRENT_DATE)
  );
$$;

-- ----------------------------------------------------------------------------
-- 5) Tighten student SELECT policies on mentorship CONTENT tables to require
-- active, unexpired access — not just "an enrollment row exists". Admin
-- access (is_admin()) is untouched, so the admin workspace keeps working
-- even for paused/revoked/expired students. mentorship_profiles' own policy
-- is intentionally left unchanged (see note above).
-- ----------------------------------------------------------------------------
DROP POLICY "mentorship_tasks_select_own_or_admin" ON public.mentorship_tasks;
CREATE POLICY "mentorship_tasks_select_own_or_admin"
  ON public.mentorship_tasks FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

DROP POLICY "mentorship_kpis_select_own_or_admin" ON public.mentorship_kpis;
CREATE POLICY "mentorship_kpis_select_own_or_admin"
  ON public.mentorship_kpis FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

DROP POLICY "mentorship_products_select_own_or_admin" ON public.mentorship_products;
CREATE POLICY "mentorship_products_select_own_or_admin"
  ON public.mentorship_products FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

DROP POLICY "mentorship_calls_select_own_or_admin" ON public.mentorship_calls;
CREATE POLICY "mentorship_calls_select_own_or_admin"
  ON public.mentorship_calls FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

DROP POLICY "mentorship_notes_select_own_or_admin" ON public.mentorship_notes;
CREATE POLICY "mentorship_notes_select_own_or_admin"
  ON public.mentorship_notes FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

-- program_resources is shared by any program type; only tighten it for rows
-- belonging to enrollments that actually have a mentorship_profiles record
-- (mentorship-type enrollments). Course-type program_resources access, if
-- ever used, is unaffected (the LEFT JOIN falls through to the old check).
DROP POLICY "program_resources_select_own_or_admin" ON public.program_resources;
CREATE POLICY "program_resources_select_own_or_admin"
  ON public.program_resources FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      LEFT JOIN public.mentorship_profiles mp ON mp.enrollment_id = e.id
      WHERE e.user_id = auth.uid()
        AND e.program_id = program_resources.program_id
        AND (
          mp.enrollment_id IS NULL
          OR (mp.access_status = 'active' AND (mp.end_date IS NULL OR mp.end_date >= CURRENT_DATE))
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 6) RLS for the two new tables. Admin manages everything; students may only
-- ever read their own rows — never write, never see other students' rows.
-- Payments remain readable regardless of access_status (a paused/revoked
-- student can still see and settle what they owe).
-- ----------------------------------------------------------------------------
ALTER TABLE public.mentorship_pause_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_pause_history_admin"
  ON public.mentorship_pause_history FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
-- No student SELECT policy: pause history is an admin/audit concern — the
-- effect of any pause is already visible to the student via
-- mentorship_profiles' own status/dates.

ALTER TABLE public.mentorship_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_payments_select_own_or_admin"
  ON public.mentorship_payments FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "mentorship_payments_admin_write"
  ON public.mentorship_payments FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
