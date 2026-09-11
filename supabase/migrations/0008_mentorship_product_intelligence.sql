-- ============================================================================
-- Phase C — Product intelligence foundation: canonical product catalog +
-- Shopify/Meta mapping. Builds on Phase B's normalized ingestion tables
-- (0007_mentorship_data_ingestion.sql). Does NOT touch mentorship_products
-- (the existing legacy manual kill/keep/scale tracker used by the mentor
-- dashboard) — that stays exactly as-is; mentorship_product_catalog is a
-- separate, new, canonical entity, not a replacement in this phase.
--
-- Tenant boundary is enrollment_id everywhere, matching every other
-- mentorship table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) mentorship_product_catalog — the canonical product entity. A product
-- belongs to exactly one enrollment. `source` records how it came to exist
-- (a mentor/student typed it in, or Phase C's discovery logic created it
-- from a Shopify product) — purely informational, doesn't affect behavior.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_product_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT mentorship_product_catalog_status_check CHECK (status IN ('active', 'archived')),
  source text NOT NULL DEFAULT 'manual'
    CONSTRAINT mentorship_product_catalog_source_check CHECK (source IN ('manual', 'shopify')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, slug)
);
CREATE INDEX mentorship_product_catalog_enrollment_idx ON public.mentorship_product_catalog (enrollment_id, status);
-- Prevents a literal duplicate product name within one enrollment (e.g.
-- adding "Premium Hair Serum" twice by mistake) without blocking distinct
-- products that merely share words — case-insensitive on purpose.
CREATE UNIQUE INDEX mentorship_product_catalog_name_unique ON public.mentorship_product_catalog (enrollment_id, lower(name));
CREATE TRIGGER mentorship_product_catalog_set_updated_at
  BEFORE UPDATE ON public.mentorship_product_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) mentorship_product_shopify_links — maps a catalog product to Shopify
-- product/variant identity. `shopify_variant_id` NULL means "this whole
-- Shopify product (all its variants)"; set means "this specific variant
-- only." A catalog product may have many variant-level link rows (e.g. two
-- specific variants of one Shopify product, deliberately excluding a
-- third), but the uniqueness rule below still ensures no Shopify
-- product/variant is ever claimed by two different catalog products.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_product_shopify_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  product_catalog_id uuid NOT NULL REFERENCES public.mentorship_product_catalog (id) ON DELETE CASCADE,
  shopify_product_id uuid NOT NULL REFERENCES public.mentorship_shopify_products (id) ON DELETE CASCADE,
  shopify_variant_id uuid REFERENCES public.mentorship_shopify_product_variants (id) ON DELETE CASCADE,
  match_method text NOT NULL CONSTRAINT mentorship_product_shopify_links_method_check CHECK (match_method IN ('automatic', 'manual')),
  confidence text NOT NULL CONSTRAINT mentorship_product_shopify_links_confidence_check CHECK (confidence IN ('high', 'medium', 'low')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentorship_product_shopify_links_enrollment_idx ON public.mentorship_product_shopify_links (enrollment_id);
CREATE INDEX mentorship_product_shopify_links_product_idx ON public.mentorship_product_shopify_links (product_catalog_id);
-- A given whole Shopify product can only be product-level-linked once.
CREATE UNIQUE INDEX mentorship_product_shopify_links_product_unique
  ON public.mentorship_product_shopify_links (enrollment_id, shopify_product_id)
  WHERE shopify_variant_id IS NULL;
-- A given Shopify variant can only be linked to one catalog product.
CREATE UNIQUE INDEX mentorship_product_shopify_links_variant_unique
  ON public.mentorship_product_shopify_links (enrollment_id, shopify_variant_id)
  WHERE shopify_variant_id IS NOT NULL;
CREATE TRIGGER mentorship_product_shopify_links_set_updated_at
  BEFORE UPDATE ON public.mentorship_product_shopify_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cross-table enrollment integrity: a plain FK can't verify that the
-- catalog product, the Shopify product, and the (optional) variant all
-- belong to the SAME enrollment as the link row itself — only a trigger
-- can. This is the actual mechanism preventing a cross-enrollment mapping
-- (e.g. student A's product linked to student B's Shopify product), not
-- just application-code discipline.
CREATE OR REPLACE FUNCTION public.check_product_shopify_link_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_enrollment uuid;
  v_shopify_product_enrollment uuid;
  v_shopify_variant_enrollment uuid;
BEGIN
  SELECT enrollment_id INTO v_product_enrollment FROM public.mentorship_product_catalog WHERE id = NEW.product_catalog_id;
  SELECT enrollment_id INTO v_shopify_product_enrollment FROM public.mentorship_shopify_products WHERE id = NEW.shopify_product_id;
  IF v_product_enrollment IS DISTINCT FROM NEW.enrollment_id OR v_shopify_product_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
    RAISE EXCEPTION 'mentorship_product_shopify_links: product_catalog_id and shopify_product_id must belong to the same enrollment as the link row';
  END IF;
  IF NEW.shopify_variant_id IS NOT NULL THEN
    SELECT enrollment_id INTO v_shopify_variant_enrollment FROM public.mentorship_shopify_product_variants WHERE id = NEW.shopify_variant_id;
    IF v_shopify_variant_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
      RAISE EXCEPTION 'mentorship_product_shopify_links: shopify_variant_id must belong to the same enrollment as the link row';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mentorship_product_shopify_links_check_enrollment
  BEFORE INSERT OR UPDATE ON public.mentorship_product_shopify_links
  FOR EACH ROW EXECUTE FUNCTION public.check_product_shopify_link_enrollment();

-- ----------------------------------------------------------------------------
-- 3) mentorship_product_meta_links — maps a catalog product to a specific
-- Meta AD (never a campaign/ad set directly — campaign/ad set names are
-- unreliable and not the canonical relationship; the manual mapping UI may
-- let a student navigate campaign -> ad set -> ad, but the stored link
-- always terminates at the ad, matching how spend/performance is actually
-- reported in mentorship_meta_ad_insights).
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_product_meta_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  product_catalog_id uuid NOT NULL REFERENCES public.mentorship_product_catalog (id) ON DELETE CASCADE,
  meta_ad_id uuid NOT NULL REFERENCES public.mentorship_meta_ads (id) ON DELETE CASCADE,
  match_method text NOT NULL CONSTRAINT mentorship_product_meta_links_method_check CHECK (match_method IN ('automatic', 'manual')),
  confidence text NOT NULL CONSTRAINT mentorship_product_meta_links_confidence_check CHECK (confidence IN ('high', 'medium', 'low')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One ad can only ever belong to one product's spend — otherwise the same
  -- spend/performance would double-count across two products.
  UNIQUE (enrollment_id, meta_ad_id)
);
CREATE INDEX mentorship_product_meta_links_enrollment_idx ON public.mentorship_product_meta_links (enrollment_id);
CREATE INDEX mentorship_product_meta_links_product_idx ON public.mentorship_product_meta_links (product_catalog_id);
CREATE TRIGGER mentorship_product_meta_links_set_updated_at
  BEFORE UPDATE ON public.mentorship_product_meta_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.check_product_meta_link_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_enrollment uuid;
  v_ad_enrollment uuid;
BEGIN
  SELECT enrollment_id INTO v_product_enrollment FROM public.mentorship_product_catalog WHERE id = NEW.product_catalog_id;
  SELECT enrollment_id INTO v_ad_enrollment FROM public.mentorship_meta_ads WHERE id = NEW.meta_ad_id;
  IF v_product_enrollment IS DISTINCT FROM NEW.enrollment_id OR v_ad_enrollment IS DISTINCT FROM NEW.enrollment_id THEN
    RAISE EXCEPTION 'mentorship_product_meta_links: product_catalog_id and meta_ad_id must belong to the same enrollment as the link row';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mentorship_product_meta_links_check_enrollment
  BEFORE INSERT OR UPDATE ON public.mentorship_product_meta_links
  FOR EACH ROW EXECUTE FUNCTION public.check_product_meta_link_enrollment();

-- ----------------------------------------------------------------------------
-- 4) RLS. Students may read/create/archive their own catalog products and
-- create/delete their own mappings — but NOT touch Phase B's provider-
-- ingestion tables directly (no policy changes there; that restriction
-- already exists from Phase B and is untouched by this migration). Admin
-- gets full access via is_admin(), consistent with every other mentorship
-- table.
-- ----------------------------------------------------------------------------
ALTER TABLE public.mentorship_product_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_product_catalog_select_own_or_admin"
  ON public.mentorship_product_catalog FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));
CREATE POLICY "mentorship_product_catalog_insert_own_active"
  ON public.mentorship_product_catalog FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));
CREATE POLICY "mentorship_product_catalog_update_own_active_or_admin"
  ON public.mentorship_product_catalog FOR UPDATE
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id))
  WITH CHECK (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));
CREATE POLICY "mentorship_product_catalog_delete_admin"
  ON public.mentorship_product_catalog FOR DELETE
  USING (public.is_admin());

ALTER TABLE public.mentorship_product_shopify_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_product_shopify_links_select_own_or_admin"
  ON public.mentorship_product_shopify_links FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));
CREATE POLICY "mentorship_product_shopify_links_insert_own_active"
  ON public.mentorship_product_shopify_links FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));
CREATE POLICY "mentorship_product_shopify_links_delete_own_active_or_admin"
  ON public.mentorship_product_shopify_links FOR DELETE
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

ALTER TABLE public.mentorship_product_meta_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentorship_product_meta_links_select_own_or_admin"
  ON public.mentorship_product_meta_links FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));
CREATE POLICY "mentorship_product_meta_links_insert_own_active"
  ON public.mentorship_product_meta_links FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));
CREATE POLICY "mentorship_product_meta_links_delete_own_active_or_admin"
  ON public.mentorship_product_meta_links FOR DELETE
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));
