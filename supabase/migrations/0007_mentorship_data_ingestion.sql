-- ============================================================================
-- Phase B — Shopify + Meta data ingestion foundation
--
-- Normalized storage for data pulled from the connections established in
-- Phase A (0006_mentorship_connections.sql). This migration does NOT touch
-- mentorship_connections, mentorship_connection_tokens, or oauth_states.
--
-- Tenant boundary is enrollment_id everywhere, matching every other
-- mentorship table. Internal UUIDs are used for cross-table joins where it
-- matters (variant -> product, line item -> order/product/variant, ad set ->
-- campaign, ad -> ad set/campaign, insight -> ad); the provider's own IDs are
-- always kept alongside for reconciliation/debugging, per the "external IDs
-- for reconciliation, internal IDs for joins" rule.
--
-- Money: every currency amount is stored as an integer in the currency's
-- minor unit (paise/cents), matching the convention already used by
-- courses.price / programs.price / mentorship_payments.amount. This assumes
-- a 2-decimal-place currency (correct for INR/USD/EUR/GBP, the currencies
-- this platform actually deals in) — see PHASE_B_DATA_INGESTION.md for the
-- documented limitation around zero-decimal currencies (e.g. JPY).
--
-- RLS: students may SELECT only their own enrollment's rows (via the same
-- is_mentorship_access_active() gate as every other mentorship content
-- table) and can never INSERT/UPDATE/DELETE this data directly — all writes
-- happen server-side via the service-role client from the sync code, the
-- same posture as mentorship_connection_tokens but with SELECT open to the
-- owning student since this data (unlike tokens) is meant to be seen.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Shopify: products, variants, orders, order line items
-- ----------------------------------------------------------------------------

CREATE TABLE public.mentorship_shopify_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  title text NOT NULL,
  handle text,
  status text,
  vendor text,
  product_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, external_product_id)
);
CREATE INDEX mentorship_shopify_products_enrollment_idx ON public.mentorship_shopify_products (enrollment_id);
CREATE TRIGGER mentorship_shopify_products_set_updated_at
  BEFORE UPDATE ON public.mentorship_shopify_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_shopify_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.mentorship_shopify_products (id) ON DELETE CASCADE,
  external_variant_id text NOT NULL,
  external_product_id text NOT NULL,
  title text,
  sku text,
  price integer, -- minor units
  compare_at_price integer, -- minor units
  inventory_quantity integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, external_variant_id)
);
CREATE INDEX mentorship_shopify_variants_enrollment_idx ON public.mentorship_shopify_product_variants (enrollment_id);
CREATE INDEX mentorship_shopify_variants_product_idx ON public.mentorship_shopify_product_variants (product_id);
CREATE TRIGGER mentorship_shopify_variants_set_updated_at
  BEFORE UPDATE ON public.mentorship_shopify_product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- No customer identifier of any kind — Phase B's analysis needs (spend,
-- revenue, margin, RTO down the line) never require knowing who bought,
-- only what/when/how much, so we deliberately don't capture PII we don't
-- need per the explicit "do not store unnecessary customer PII" instruction.
CREATE TABLE public.mentorship_shopify_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  external_order_id text NOT NULL,
  order_number integer,
  created_at_external timestamptz, -- Shopify's own order timestamps, preserved verbatim
  updated_at_external timestamptz,
  financial_status text,
  fulfillment_status text,
  currency text NOT NULL,
  subtotal_price integer, -- minor units
  total_discounts integer, -- minor units
  total_shipping integer, -- minor units
  total_tax integer, -- minor units
  total_price integer NOT NULL, -- minor units
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), -- our own row-insert bookkeeping
  updated_at timestamptz NOT NULL DEFAULT now(), -- our own row-update bookkeeping
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, external_order_id)
);
CREATE INDEX mentorship_shopify_orders_enrollment_idx ON public.mentorship_shopify_orders (enrollment_id, created_at_external);
CREATE TRIGGER mentorship_shopify_orders_set_updated_at
  BEFORE UPDATE ON public.mentorship_shopify_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_shopify_order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.mentorship_shopify_orders (id) ON DELETE CASCADE,
  external_line_item_id text NOT NULL,
  external_order_id text NOT NULL,
  product_id uuid REFERENCES public.mentorship_shopify_products (id) ON DELETE SET NULL,
  external_product_id text,
  variant_id uuid REFERENCES public.mentorship_shopify_product_variants (id) ON DELETE SET NULL,
  external_variant_id text,
  title text NOT NULL,
  quantity integer NOT NULL,
  price integer NOT NULL, -- minor units, per-unit
  total_discount integer NOT NULL DEFAULT 0, -- minor units
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, external_line_item_id)
);
CREATE INDEX mentorship_shopify_line_items_order_idx ON public.mentorship_shopify_order_line_items (order_id);
CREATE INDEX mentorship_shopify_line_items_enrollment_idx ON public.mentorship_shopify_order_line_items (enrollment_id);
CREATE TRIGGER mentorship_shopify_line_items_set_updated_at
  BEFORE UPDATE ON public.mentorship_shopify_order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Meta: ad accounts, campaigns, ad sets, ads, daily ad-level insights
-- ----------------------------------------------------------------------------

CREATE TABLE public.mentorship_meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  external_account_id text NOT NULL, -- "act_123456789"
  name text,
  currency text,
  timezone text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, external_account_id)
);
CREATE INDEX mentorship_meta_ad_accounts_enrollment_idx ON public.mentorship_meta_ad_accounts (enrollment_id);
CREATE TRIGGER mentorship_meta_ad_accounts_set_updated_at
  BEFORE UPDATE ON public.mentorship_meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_meta_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  ad_account_id uuid REFERENCES public.mentorship_meta_ad_accounts (id) ON DELETE CASCADE,
  external_campaign_id text NOT NULL,
  external_account_id text,
  name text,
  status text,
  objective text,
  created_time timestamptz, -- Meta's own field names, preserved verbatim
  updated_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, external_campaign_id)
);
CREATE INDEX mentorship_meta_campaigns_enrollment_idx ON public.mentorship_meta_campaigns (enrollment_id);
CREATE INDEX mentorship_meta_campaigns_account_idx ON public.mentorship_meta_campaigns (ad_account_id);
CREATE TRIGGER mentorship_meta_campaigns_set_updated_at
  BEFORE UPDATE ON public.mentorship_meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_meta_ad_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.mentorship_meta_campaigns (id) ON DELETE CASCADE,
  external_ad_set_id text NOT NULL,
  external_campaign_id text,
  name text,
  status text,
  created_time timestamptz,
  updated_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, external_ad_set_id)
);
CREATE INDEX mentorship_meta_ad_sets_enrollment_idx ON public.mentorship_meta_ad_sets (enrollment_id);
CREATE INDEX mentorship_meta_ad_sets_campaign_idx ON public.mentorship_meta_ad_sets (campaign_id);
CREATE TRIGGER mentorship_meta_ad_sets_set_updated_at
  BEFORE UPDATE ON public.mentorship_meta_ad_sets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mentorship_meta_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  ad_set_id uuid REFERENCES public.mentorship_meta_ad_sets (id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.mentorship_meta_campaigns (id) ON DELETE CASCADE,
  external_ad_id text NOT NULL,
  external_ad_set_id text,
  external_campaign_id text,
  name text,
  status text,
  created_time timestamptz,
  updated_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, external_ad_id)
);
CREATE INDEX mentorship_meta_ads_enrollment_idx ON public.mentorship_meta_ads (enrollment_id);
CREATE INDEX mentorship_meta_ads_ad_set_idx ON public.mentorship_meta_ads (ad_set_id);
CREATE INDEX mentorship_meta_ads_campaign_idx ON public.mentorship_meta_ads (campaign_id);
CREATE TRIGGER mentorship_meta_ads_set_updated_at
  BEFORE UPDATE ON public.mentorship_meta_ads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- One row per (enrollment, ad, date). `date` is the provider's own reporting
-- date (Meta Insights API's date_start with time_increment=1), never
-- reinterpreted through server timezone. Ratio fields (ctr) are stored as
-- plain numeric percentages, not money; cpc/cpm are currency-per-unit
-- amounts and follow the same minor-unit convention as spend. Metrics Meta
-- didn't return for a row are NULL, never estimated or defaulted to 0.
CREATE TABLE public.mentorship_meta_ad_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  ad_id uuid REFERENCES public.mentorship_meta_ads (id) ON DELETE CASCADE,
  external_ad_id text NOT NULL,
  date date NOT NULL,
  spend integer, -- minor units
  impressions integer,
  reach integer,
  clicks integer,
  link_clicks integer,
  ctr numeric(10, 4),
  cpc integer, -- minor units
  cpm integer, -- minor units
  purchases integer,
  purchase_value integer, -- minor units
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, external_ad_id, date)
);
CREATE INDEX mentorship_meta_insights_ad_date_idx ON public.mentorship_meta_ad_insights (ad_id, date);
CREATE INDEX mentorship_meta_insights_enrollment_date_idx ON public.mentorship_meta_ad_insights (enrollment_id, date);
CREATE TRIGGER mentorship_meta_ad_insights_set_updated_at
  BEFORE UPDATE ON public.mentorship_meta_ad_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) Sync state — one row per sync attempt (audit-log style, like
-- mentorship_pause_history), not one evolving row per enrollment/provider.
-- `last_successful_sync_at` is carried forward from the previous attempt at
-- start time and overwritten on success, so any single row tells you both
-- "how did this attempt go" and "when did we last actually succeed" without
-- a join. The partial unique index is what actually prevents two concurrent
-- syncs for the same enrollment/provider — mirrors the
-- mentorship_connections_active_unique pattern from Phase A exactly.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_data_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  provider text NOT NULL CONSTRAINT mentorship_data_syncs_provider_check CHECK (provider IN ('shopify', 'meta')),
  sync_type text NOT NULL CONSTRAINT mentorship_data_syncs_sync_type_check CHECK (sync_type IN ('initial', 'incremental', 'manual')),
  status text NOT NULL DEFAULT 'idle'
    CONSTRAINT mentorship_data_syncs_status_check CHECK (status IN ('idle', 'running', 'success', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  last_successful_sync_at timestamptz,
  records_processed integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentorship_data_syncs_enrollment_idx ON public.mentorship_data_syncs (enrollment_id, provider, created_at DESC);
CREATE UNIQUE INDEX mentorship_data_syncs_running_unique
  ON public.mentorship_data_syncs (enrollment_id, provider)
  WHERE status = 'running';
CREATE TRIGGER mentorship_data_syncs_set_updated_at
  BEFORE UPDATE ON public.mentorship_data_syncs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) RLS — students SELECT only their own (active-access) enrollment's rows;
-- no student write policies on any table here at all (all writes are
-- service-role, from server-side sync code, verified against the caller's
-- ownership before the service-role call is ever made). Admin gets full
-- access via is_admin(), consistent with every other mentorship table.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'mentorship_shopify_products',
    'mentorship_shopify_product_variants',
    'mentorship_shopify_orders',
    'mentorship_shopify_order_line_items',
    'mentorship_meta_ad_accounts',
    'mentorship_meta_campaigns',
    'mentorship_meta_ad_sets',
    'mentorship_meta_ads',
    'mentorship_meta_ad_insights',
    'mentorship_data_syncs'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id))',
      t || '_select_own_or_admin', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())',
      t || '_admin_write', t
    );
  END LOOP;
END $$;
