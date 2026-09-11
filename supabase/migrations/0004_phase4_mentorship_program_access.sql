-- ============================================================================
-- Multi-program architecture — Phase 4
-- Mentorship-ready program access and canonical enrollment identity.
-- This migration introduces mentorship data tables tied to `enrollments`
-- while preserving existing course rows and existing course purchase paths.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Preflight checks before touching schema constraints.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_orders_missing_program bigint;
  v_order_items_missing_program bigint;
  v_enrollments_missing_program bigint;
  v_enrollment_program_duplicate bigint;
  v_orders_program_id_invalid bigint;
  v_order_items_program_id_invalid bigint;
  v_enrollments_program_id_invalid bigint;
  v_orders_course_id_invalid bigint;
  v_order_items_course_id_invalid bigint;
  v_enrollments_course_id_invalid bigint;
BEGIN
  SELECT COUNT(*) INTO v_orders_missing_program
  FROM public.orders
  WHERE course_id IS NOT NULL AND program_id IS NULL;

  SELECT COUNT(*) INTO v_order_items_missing_program
  FROM public.order_items
  WHERE course_id IS NOT NULL AND program_id IS NULL;

  SELECT COUNT(*) INTO v_enrollments_missing_program
  FROM public.enrollments
  WHERE course_id IS NOT NULL AND program_id IS NULL;

  SELECT COUNT(*) INTO v_enrollment_program_duplicate
  FROM (
    SELECT user_id, program_id, COUNT(*) AS c
    FROM public.enrollments
    GROUP BY user_id, program_id
    HAVING COUNT(*) > 1
  ) dup;

  SELECT COUNT(*) INTO v_orders_program_id_invalid
  FROM public.orders o
  LEFT JOIN public.programs p ON p.id = o.program_id
  WHERE o.program_id IS NOT NULL AND p.id IS NULL;

  SELECT COUNT(*) INTO v_order_items_program_id_invalid
  FROM public.order_items oi
  LEFT JOIN public.programs p ON p.id = oi.program_id
  WHERE oi.program_id IS NOT NULL AND p.id IS NULL;

  SELECT COUNT(*) INTO v_enrollments_program_id_invalid
  FROM public.enrollments e
  LEFT JOIN public.programs p ON p.id = e.program_id
  WHERE e.program_id IS NOT NULL AND p.id IS NULL;

  SELECT COUNT(*) INTO v_orders_course_id_invalid
  FROM public.orders o
  LEFT JOIN public.courses c ON c.id = o.course_id
  WHERE o.course_id IS NOT NULL AND c.id IS NULL;

  SELECT COUNT(*) INTO v_order_items_course_id_invalid
  FROM public.order_items oi
  LEFT JOIN public.courses c ON c.id = oi.course_id
  WHERE oi.course_id IS NOT NULL AND c.id IS NULL;

  SELECT COUNT(*) INTO v_enrollments_course_id_invalid
  FROM public.enrollments e
  LEFT JOIN public.courses c ON c.id = e.course_id
  WHERE e.course_id IS NOT NULL AND c.id IS NULL;

  IF v_orders_missing_program > 0
    OR v_order_items_missing_program > 0
    OR v_enrollments_missing_program > 0 THEN
    RAISE EXCEPTION 'Phase 4 safety check failed: found rows with course_id present but program_id missing.';
  END IF;

  IF v_enrollment_program_duplicate > 0 THEN
    RAISE EXCEPTION 'Phase 4 safety check failed: duplicate (user_id, program_id) enrollments already exist.';
  END IF;

  IF v_orders_program_id_invalid > 0
    OR v_order_items_program_id_invalid > 0
    OR v_enrollments_program_id_invalid > 0 THEN
    RAISE EXCEPTION 'Phase 4 safety check failed: existing rows reference programs that do not exist.';
  END IF;

  IF v_orders_course_id_invalid > 0
    OR v_order_items_course_id_invalid > 0
    OR v_enrollments_course_id_invalid > 0 THEN
    RAISE EXCEPTION 'Phase 4 safety check failed: existing rows reference courses that do not exist.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1) Relax optional FK holders (`course_id`) while preserving values.
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ALTER COLUMN course_id DROP NOT NULL;

ALTER TABLE public.order_items
  ALTER COLUMN course_id DROP NOT NULL;

ALTER TABLE public.enrollments
  ALTER COLUMN course_id DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 2) Make `program_id` canonical and enforce NOT NULL for enrollment/order data.
-- (This is now safe because the preflight above confirms integrity.)
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ALTER COLUMN program_id SET NOT NULL;

ALTER TABLE public.order_items
  ALTER COLUMN program_id SET NOT NULL;

ALTER TABLE public.enrollments
  ALTER COLUMN program_id SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 3) Canonical enrollment identity on program.
-- Keep existing (user_id, course_id) behavior for legacy course reporting.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'enrollments_user_id_program_id_key'
      AND conrelid = 'public.enrollments'::regclass
  ) THEN
    ALTER TABLE public.enrollments
      ADD CONSTRAINT enrollments_user_id_program_id_key UNIQUE (user_id, program_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4) Program-aware authorization helper.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_program_enrolled(p_program_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments
    WHERE user_id = auth.uid() AND program_id = p_program_id
  );
$$;

-- ----------------------------------------------------------------------------
-- 5) Mentorship state tables (all tied to enrollments)
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES public.enrollments (id) ON DELETE CASCADE,
  current_stage text NOT NULL DEFAULT 'discovery',
  current_objective text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER mentorship_profiles_set_updated_at
  BEFORE UPDATE ON public.mentorship_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  week_start date NOT NULL,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER mentorship_tasks_set_updated_at
  BEFORE UPDATE ON public.mentorship_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  metric_label text NOT NULL,
  value numeric NOT NULL,
  recorded_for date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER mentorship_kpis_set_updated_at
  BEFORE UPDATE ON public.mentorship_kpis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'testing'
    CONSTRAINT mentorship_products_status_check CHECK (status IN ('testing', 'keep', 'kill', 'scale')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER mentorship_products_set_updated_at
  BEFORE UPDATE ON public.mentorship_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  meeting_link text,
  recording_url text,
  call_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER mentorship_calls_set_updated_at
  BEFORE UPDATE ON public.mentorship_calls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.program_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs (id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  description text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER program_resources_set_updated_at
  BEFORE UPDATE ON public.program_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6) Indexes for mentor workspace and KPI/task workflows.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS mentorship_tasks_enrollment_week_start_idx
  ON public.mentorship_tasks (enrollment_id, week_start);

CREATE INDEX IF NOT EXISTS mentorship_kpis_enrollment_recorded_idx
  ON public.mentorship_kpis (enrollment_id, recorded_for);

CREATE INDEX IF NOT EXISTS mentorship_products_enrollment_idx
  ON public.mentorship_products (enrollment_id, status);

CREATE INDEX IF NOT EXISTS mentorship_calls_enrollment_scheduled_idx
  ON public.mentorship_calls (enrollment_id, scheduled_at);

CREATE INDEX IF NOT EXISTS mentorship_notes_enrollment_created_idx
  ON public.mentorship_notes (enrollment_id, created_at);

CREATE INDEX IF NOT EXISTS mentorship_notes_author_idx
  ON public.mentorship_notes (author_id);

CREATE INDEX IF NOT EXISTS program_resources_program_id_idx
  ON public.program_resources (program_id, position);

-- ----------------------------------------------------------------------------
-- 7) RLS for new mentorship state tables.
-- Admin => all access
-- Enrolled students => read-only access to their own enrollment-linked rows.
-- ----------------------------------------------------------------------------
ALTER TABLE public.mentorship_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_profiles_select_own_or_admin"
  ON public.mentorship_profiles FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.id = enrollment_id
        AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "mentorship_profiles_admin"
  ON public.mentorship_profiles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.mentorship_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_tasks_select_own_or_admin"
  ON public.mentorship_tasks FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.id = enrollment_id
        AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "mentorship_tasks_admin"
  ON public.mentorship_tasks FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.mentorship_kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_kpis_select_own_or_admin"
  ON public.mentorship_kpis FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.id = enrollment_id
        AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "mentorship_kpis_admin"
  ON public.mentorship_kpis FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.mentorship_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_products_select_own_or_admin"
  ON public.mentorship_products FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.id = enrollment_id
        AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "mentorship_products_admin"
  ON public.mentorship_products FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.mentorship_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_calls_select_own_or_admin"
  ON public.mentorship_calls FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.id = enrollment_id
        AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "mentorship_calls_admin"
  ON public.mentorship_calls FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.mentorship_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_notes_select_own_or_admin"
  ON public.mentorship_notes FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.id = enrollment_id
        AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "mentorship_notes_admin"
  ON public.mentorship_notes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.program_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "program_resources_select_own_or_admin"
  ON public.program_resources FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.user_id = auth.uid()
        AND e.program_id = program_resources.program_id
    )
  );
CREATE POLICY "program_resources_admin"
  ON public.program_resources FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8) Verification notices for migration review.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_courses bigint;
  v_programs bigint;
  v_orders bigint;
  v_order_items bigint;
  v_enrollments bigint;
  v_order_course_mismatch bigint;
  v_order_item_course_mismatch bigint;
  v_enrollment_course_mismatch bigint;
  v_orders_missing_program bigint;
  v_order_items_missing_program bigint;
  v_enrollments_missing_program bigint;
BEGIN
  SELECT COUNT(*) INTO v_courses FROM public.courses;
  SELECT COUNT(*) INTO v_programs FROM public.programs;
  SELECT COUNT(*) INTO v_orders FROM public.orders;
  SELECT COUNT(*) INTO v_order_items FROM public.order_items;
  SELECT COUNT(*) INTO v_enrollments FROM public.enrollments;

  SELECT COUNT(*) INTO v_order_course_mismatch
  FROM public.orders
  WHERE course_id IS NOT NULL
    AND program_id IS DISTINCT FROM course_id;

  SELECT COUNT(*) INTO v_order_item_course_mismatch
  FROM public.order_items
  WHERE course_id IS NOT NULL
    AND program_id IS DISTINCT FROM course_id;

  SELECT COUNT(*) INTO v_enrollment_course_mismatch
  FROM public.enrollments
  WHERE course_id IS NOT NULL
    AND program_id IS DISTINCT FROM course_id;

  SELECT COUNT(*) INTO v_orders_missing_program
  FROM public.orders
  WHERE course_id IS NOT NULL
    AND program_id IS NULL;

  SELECT COUNT(*) INTO v_order_items_missing_program
  FROM public.order_items
  WHERE course_id IS NOT NULL
    AND program_id IS NULL;

  SELECT COUNT(*) INTO v_enrollments_missing_program
  FROM public.enrollments
  WHERE course_id IS NOT NULL
    AND program_id IS NULL;

  RAISE NOTICE 'courses=%', v_courses;
  RAISE NOTICE 'programs=%', v_programs;
  RAISE NOTICE 'orders=%', v_orders;
  RAISE NOTICE 'order_items=%', v_order_items;
  RAISE NOTICE 'enrollments=%', v_enrollments;
  RAISE NOTICE 'order course->program mismatches=%', v_order_course_mismatch;
  RAISE NOTICE 'order_item course->program mismatches=%', v_order_item_course_mismatch;
  RAISE NOTICE 'enrollment course->program mismatches=%', v_enrollment_course_mismatch;
  RAISE NOTICE 'missing program_id in orders where course exists=%', v_orders_missing_program;
  RAISE NOTICE 'missing program_id in order_items where course exists=%', v_order_items_missing_program;
  RAISE NOTICE 'missing program_id in enrollments where course exists=%', v_enrollments_missing_program;
END $$;
