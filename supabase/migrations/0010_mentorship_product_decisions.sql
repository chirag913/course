-- ============================================================================
-- Phase E — Deterministic product decision engine. Builds on Phase C's
-- product catalog (0008) and Phase D's economics/shipping (0009). This
-- migration only adds the APPEND-ONLY decision history and the ADMIN-ONLY
-- mentor override — no AI, no automated actions, no account health score.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) mentorship_product_decisions — append-only. One row per engine run
-- that produced a meaningful decision. NEVER updated or deleted by the
-- app — this is the historical record of "what did the system think, and
-- when." Only the service-role client (from the engine's own Server
-- Action) ever writes here; see RLS below.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_product_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  product_catalog_id uuid NOT NULL REFERENCES public.mentorship_product_catalog (id) ON DELETE CASCADE,
  decision text NOT NULL
    CONSTRAINT mentorship_product_decisions_decision_check
    CHECK (decision IN ('DATA_NEEDED', 'TEST', 'WATCH', 'ITERATE', 'SCALE', 'RELAUNCH', 'KILL')),
  reason_code text NOT NULL,
  priority text NOT NULL
    CONSTRAINT mentorship_product_decisions_priority_check CHECK (priority IN ('high', 'medium', 'low')),
  why text NOT NULL,
  next_action text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  engine_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentorship_product_decisions_product_idx ON public.mentorship_product_decisions (product_catalog_id, created_at DESC);
CREATE INDEX mentorship_product_decisions_enrollment_idx ON public.mentorship_product_decisions (enrollment_id);

CREATE OR REPLACE FUNCTION public.check_product_decision_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_enrollment uuid;
BEGIN
  SELECT enrollment_id INTO v_product_enrollment FROM public.mentorship_product_catalog WHERE id = NEW.product_catalog_id;
  IF v_product_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
    RAISE EXCEPTION 'mentorship_product_decisions: product_catalog_id must belong to the same enrollment as the decision row';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mentorship_product_decisions_check_enrollment
  BEFORE INSERT ON public.mentorship_product_decisions
  FOR EACH ROW EXECUTE FUNCTION public.check_product_decision_enrollment();

-- ----------------------------------------------------------------------------
-- 2) mentorship_product_decision_overrides — admin-only, append-only. The
-- engine's own decisions are NEVER edited to reflect an override; the
-- "effective decision" is computed at read time (see
-- src/lib/decisions/effective.ts) by comparing timestamps against the
-- latest engine decision.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_product_decision_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  product_catalog_id uuid NOT NULL REFERENCES public.mentorship_product_catalog (id) ON DELETE CASCADE,
  override_decision text NOT NULL
    CONSTRAINT mentorship_product_decision_overrides_decision_check
    CHECK (override_decision IN ('DATA_NEEDED', 'TEST', 'WATCH', 'ITERATE', 'SCALE', 'RELAUNCH', 'KILL')),
  override_reason text NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentorship_product_decision_overrides_product_idx ON public.mentorship_product_decision_overrides (product_catalog_id, created_at DESC);
CREATE INDEX mentorship_product_decision_overrides_enrollment_idx ON public.mentorship_product_decision_overrides (enrollment_id);

CREATE OR REPLACE FUNCTION public.check_decision_override_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_enrollment uuid;
BEGIN
  SELECT enrollment_id INTO v_product_enrollment FROM public.mentorship_product_catalog WHERE id = NEW.product_catalog_id;
  IF v_product_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
    RAISE EXCEPTION 'mentorship_product_decision_overrides: product_catalog_id must belong to the same enrollment as the override row';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mentorship_product_decision_overrides_check_enrollment
  BEFORE INSERT ON public.mentorship_product_decision_overrides
  FOR EACH ROW EXECUTE FUNCTION public.check_decision_override_enrollment();

-- ----------------------------------------------------------------------------
-- 3) RLS.
--
-- mentorship_product_decisions: students (and admin) may SELECT their own
-- product's decisions. NOBODY gets an INSERT/UPDATE/DELETE policy through
-- the app's normal session — even admin. The engine writes exclusively via
-- the service-role client (src/lib/decisions/engine-runner.ts), after the
-- calling Server Action has verified the caller owns (or administers) the
-- enrollment. This is what actually enforces "students cannot create or
-- modify engine decisions directly" — it's not just a UI restriction.
--
-- mentorship_product_decision_overrides: students may only SELECT (so they
-- can see they were overridden, per Part R). Only admin may INSERT.
-- ----------------------------------------------------------------------------
ALTER TABLE public.mentorship_product_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_product_decisions_select_own_or_admin"
  ON public.mentorship_product_decisions FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

ALTER TABLE public.mentorship_product_decision_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_product_decision_overrides_select_own_or_admin"
  ON public.mentorship_product_decision_overrides FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));
CREATE POLICY "mentorship_product_decision_overrides_insert_admin"
  ON public.mentorship_product_decision_overrides FOR INSERT
  WITH CHECK (public.is_admin());
