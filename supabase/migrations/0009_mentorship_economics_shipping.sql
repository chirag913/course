-- ============================================================================
-- Phase D — Economics + Shipping/RTO foundation. Builds on Phase C's
-- canonical product catalog (0008) and Phase B's normalized Shopify/Meta
-- ingestion (0007). Answers "what happened, what did it cost, what did we
-- earn, is the data complete" — no decisions (Phase E).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) mentorship_product_economics — one row of PERSISTENT cost/price
-- configuration per product (not date-range dependent; see
-- PHASE_D_ECONOMICS_SHIPPING.md). Every cost field is NULLABLE with NO
-- default — a missing COGS is not the same as a ₹0 COGS, and the
-- calculation layer must treat them differently (never silently
-- substituting 0 for a missing input).
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_product_economics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  product_catalog_id uuid NOT NULL REFERENCES public.mentorship_product_catalog (id) ON DELETE CASCADE,

  selling_price_minor integer,
  selling_price_currency text NOT NULL DEFAULT 'INR',
  selling_price_source text
    CONSTRAINT mentorship_product_economics_price_source_check CHECK (selling_price_source IN ('shopify', 'manual')),

  cogs_minor integer,
  shipping_cost_minor integer, -- per order
  cod_fee_minor integer, -- per order
  packaging_cost_minor integer, -- per order
  other_variable_cost_minor integer, -- per order
  rto_cost_minor integer, -- per RTO'd order — see doc "RTO economics"

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (enrollment_id, product_catalog_id),
  CONSTRAINT mentorship_product_economics_nonnegative CHECK (
    (selling_price_minor IS NULL OR selling_price_minor >= 0) AND
    (cogs_minor IS NULL OR cogs_minor >= 0) AND
    (shipping_cost_minor IS NULL OR shipping_cost_minor >= 0) AND
    (cod_fee_minor IS NULL OR cod_fee_minor >= 0) AND
    (packaging_cost_minor IS NULL OR packaging_cost_minor >= 0) AND
    (other_variable_cost_minor IS NULL OR other_variable_cost_minor >= 0) AND
    (rto_cost_minor IS NULL OR rto_cost_minor >= 0)
  )
);
CREATE INDEX mentorship_product_economics_enrollment_idx ON public.mentorship_product_economics (enrollment_id);
CREATE TRIGGER mentorship_product_economics_set_updated_at
  BEFORE UPDATE ON public.mentorship_product_economics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Same cross-enrollment integrity pattern as Phase C's link tables — a
-- plain FK can't verify product_catalog_id belongs to the SAME enrollment
-- as the economics row itself.
CREATE OR REPLACE FUNCTION public.check_product_economics_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_enrollment uuid;
BEGIN
  SELECT enrollment_id INTO v_product_enrollment FROM public.mentorship_product_catalog WHERE id = NEW.product_catalog_id;
  IF v_product_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
    RAISE EXCEPTION 'mentorship_product_economics: product_catalog_id must belong to the same enrollment as the economics row';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mentorship_product_economics_check_enrollment
  BEFORE INSERT OR UPDATE ON public.mentorship_product_economics
  FOR EACH ROW EXECUTE FUNCTION public.check_product_economics_enrollment();

-- ----------------------------------------------------------------------------
-- 2) Shipping CSV imports + rows. `file_hash` (sha256 of the raw file
-- content) plus the unique index below is the actual idempotency
-- mechanism — re-uploading the exact same file is rejected before any row
-- is processed a second time. `status` on a row is the NORMALIZED
-- canonical value (see doc); the CSV's own raw status string and full raw
-- row are preserved in `raw_data` for audit, not in a separate column.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_shipping_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_hash text NOT NULL,
  order_column text NOT NULL, -- which CSV header was mapped to the order reference (Part R)
  status_column text NOT NULL, -- which CSV header was mapped to shipment status
  status text NOT NULL DEFAULT 'processing'
    CONSTRAINT mentorship_shipping_imports_status_check CHECK (status IN ('processing', 'completed', 'failed')),
  row_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  unmatched_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, file_hash)
);
CREATE INDEX mentorship_shipping_imports_enrollment_idx ON public.mentorship_shipping_imports (enrollment_id, imported_at DESC);

-- No customer PII of any kind is extracted from the CSV into its own
-- column — only the order reference (an order ID/number, not personal
-- data) and the status. `raw_data` retains the full original row for
-- audit/debugging, scoped by the same RLS as everything else here; this is
-- a deliberate, bounded exception, not a general PII store.
CREATE TABLE public.mentorship_shipping_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.mentorship_shipping_imports (id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  external_order_reference text NOT NULL,
  status text NOT NULL
    CONSTRAINT mentorship_shipping_rows_status_check CHECK (status IN ('shipped', 'delivered', 'NDR', 'RTO', 'unknown', 'needs_review')),
  normalized_order_id uuid REFERENCES public.mentorship_shopify_orders (id) ON DELETE SET NULL,
  match_method text NOT NULL DEFAULT 'unmatched'
    CONSTRAINT mentorship_shipping_rows_match_method_check CHECK (match_method IN ('exact_order_id', 'exact_order_number', 'unmatched')),
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentorship_shipping_rows_import_idx ON public.mentorship_shipping_rows (import_id);
CREATE INDEX mentorship_shipping_rows_enrollment_idx ON public.mentorship_shipping_rows (enrollment_id);
-- The index that makes "resolve an order's CURRENT status from its most
-- recent shipping row" fast — see doc "Import idempotency / superseding".
CREATE INDEX mentorship_shipping_rows_order_created_idx ON public.mentorship_shipping_rows (normalized_order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.check_shipping_row_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_import_enrollment uuid;
  v_order_enrollment uuid;
BEGIN
  SELECT enrollment_id INTO v_import_enrollment FROM public.mentorship_shipping_imports WHERE id = NEW.import_id;
  IF v_import_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
    RAISE EXCEPTION 'mentorship_shipping_rows: import_id must belong to the same enrollment as the row';
  END IF;
  IF NEW.normalized_order_id IS NOT NULL THEN
    SELECT enrollment_id INTO v_order_enrollment FROM public.mentorship_shopify_orders WHERE id = NEW.normalized_order_id;
    IF v_order_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
      RAISE EXCEPTION 'mentorship_shipping_rows: normalized_order_id must belong to the same enrollment as the row';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mentorship_shipping_rows_check_enrollment
  BEFORE INSERT OR UPDATE ON public.mentorship_shipping_rows
  FOR EACH ROW EXECUTE FUNCTION public.check_shipping_row_enrollment();

-- ----------------------------------------------------------------------------
-- 3) Unresolved-order classification (Part G). A Shopify order absent from
-- every shipping import is NEVER assumed to be RTO/delivered/cancelled —
-- it stays unclassified until a human says otherwise via this table.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_unmatched_order_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  shopify_order_id uuid NOT NULL REFERENCES public.mentorship_shopify_orders (id) ON DELETE CASCADE,
  classification text NOT NULL DEFAULT 'needs_review'
    CONSTRAINT mentorship_unmatched_classifications_check CHECK (classification IN ('cancelled', 'rejected', 'never_shipped', 'other', 'needs_review')),
  notes text,
  classified_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  classified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, shopify_order_id)
);
CREATE INDEX mentorship_unmatched_classifications_enrollment_idx ON public.mentorship_unmatched_order_classifications (enrollment_id);
CREATE TRIGGER mentorship_unmatched_classifications_set_updated_at
  BEFORE UPDATE ON public.mentorship_unmatched_order_classifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.check_unmatched_classification_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order_enrollment uuid;
BEGIN
  SELECT enrollment_id INTO v_order_enrollment FROM public.mentorship_shopify_orders WHERE id = NEW.shopify_order_id;
  IF v_order_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
    RAISE EXCEPTION 'mentorship_unmatched_order_classifications: shopify_order_id must belong to the same enrollment as the row';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mentorship_unmatched_classifications_check_enrollment
  BEFORE INSERT OR UPDATE ON public.mentorship_unmatched_order_classifications
  FOR EACH ROW EXECUTE FUNCTION public.check_unmatched_classification_enrollment();

-- ----------------------------------------------------------------------------
-- 4) RLS — same posture as Phase C: students SELECT/INSERT/UPDATE their own
-- (is_mentorship_access_active(enrollment_id)) rows; DELETE is admin-only
-- everywhere (nothing here is "removed" by a student, only edited/
-- reclassified/re-imported); admin has full access via is_admin(). No
-- policy changes anywhere touch Phase B's provider-ingestion tables — a
-- student still cannot write to mentorship_shopify_orders etc. directly.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'mentorship_product_economics',
    'mentorship_shipping_imports',
    'mentorship_shipping_rows',
    'mentorship_unmatched_order_classifications'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id))',
      t || '_select_own_or_admin', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.is_admin() OR public.is_mentorship_access_active(enrollment_id))',
      t || '_insert_own_active', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id)) WITH CHECK (public.is_admin() OR public.is_mentorship_access_active(enrollment_id))',
      t || '_update_own_active_or_admin', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_admin())',
      t || '_delete_admin', t
    );
  END LOOP;
END $$;
