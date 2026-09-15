-- Phase 5 — student connections and data-source provenance.
-- Extends the existing enrollment-scoped connection and shipping architecture.
-- No existing course, order, enrollment, product-mapping, or fulfillment data is changed.

ALTER TABLE public.mentorship_connections
  DROP CONSTRAINT IF EXISTS mentorship_connections_provider_check;
ALTER TABLE public.mentorship_connections
  ADD CONSTRAINT mentorship_connections_provider_check
  CHECK (provider IN ('shopify', 'meta', 'shiprocket'));

ALTER TABLE public.mentorship_data_syncs
  DROP CONSTRAINT IF EXISTS mentorship_data_syncs_provider_check;
ALTER TABLE public.mentorship_data_syncs
  ADD CONSTRAINT mentorship_data_syncs_provider_check
  CHECK (provider IN ('shopify', 'meta', 'shiprocket'));

-- This column remains in the same zero-RLS-policy table as all provider
-- tokens. It is only for server-side provider credentials such as the
-- Shiprocket API user email/password; it is never selected into the UI.
ALTER TABLE public.mentorship_connection_tokens
  ADD COLUMN IF NOT EXISTS credentials jsonb;

-- Every imported record carries its origin. Existing API-ingested data is
-- preserved as Shopify API data by the defaults below.
ALTER TABLE public.mentorship_shopify_products
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'shopify_api'
  CHECK (source IN ('shopify_api', 'shopify_csv'));
ALTER TABLE public.mentorship_shopify_product_variants
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'shopify_api'
  CHECK (source IN ('shopify_api', 'shopify_csv'));
ALTER TABLE public.mentorship_shopify_orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'shopify_api'
  CHECK (source IN ('shopify_api', 'shopify_csv'));
ALTER TABLE public.mentorship_shopify_order_line_items
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'shopify_api'
  CHECK (source IN ('shopify_api', 'shopify_csv'));

ALTER TABLE public.mentorship_shipping_imports
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual_csv'
  CHECK (source IN ('shiprocket_api', 'shiprocket_csv', 'manual_csv'));

CREATE INDEX IF NOT EXISTS mentorship_shipping_imports_source_idx
  ON public.mentorship_shipping_imports (enrollment_id, source, imported_at DESC);
