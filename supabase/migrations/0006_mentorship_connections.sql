-- ============================================================================
-- Phase A — Connections foundation (Shopify + Meta Ads)
--
-- This migration adds ONLY the connection layer: metadata about what's
-- connected, secure token storage, and short-lived OAuth state tracking for
-- CSRF/replay protection. No data ingestion tables yet (Phase B).
--
-- Everything is scoped by enrollment_id, matching every existing mentorship
-- table — a student can have exactly one active connection per provider per
-- enrollment, and nothing here is reachable across enrollments.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) mentorship_connections — connection metadata only. Never holds secrets.
-- A fresh "Connect" always inserts a NEW row rather than overwriting the
-- previous one, so disconnect/reconnect history is preserved (useful once
-- Phase B ties imported data to a specific connection_id). The partial
-- unique index below is what actually enforces "only one active connection
-- per provider" — old disconnected/error rows don't count against it.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  provider text NOT NULL
    CONSTRAINT mentorship_connections_provider_check CHECK (provider IN ('shopify', 'meta')),
  status text NOT NULL DEFAULT 'disconnected'
    CONSTRAINT mentorship_connections_status_check
    CHECK (status IN ('connected', 'disconnected', 'pending_selection', 'error')),
  external_account_id text,
  external_account_name text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER mentorship_connections_set_updated_at
  BEFORE UPDATE ON public.mentorship_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX mentorship_connections_enrollment_idx ON public.mentorship_connections (enrollment_id, provider);

-- Only one CONNECTED row per (enrollment, provider) at a time. Rows in any
-- other status (disconnected/pending_selection/error) are excluded, so
-- reconnecting after a disconnect — or retrying a failed Meta account
-- selection — never conflicts with history.
CREATE UNIQUE INDEX mentorship_connections_active_unique
  ON public.mentorship_connections (enrollment_id, provider)
  WHERE status = 'connected';

-- ----------------------------------------------------------------------------
-- 2) mentorship_connection_tokens — the actual secrets. Deliberately
-- stricter than every other table in this schema: RLS is enabled with NO
-- policies at all, for any role, including admin. The only way to read or
-- write this table is the service-role client from server-only code (the
-- OAuth callback route handlers and the future getValidShopifyToken()
-- helper) — never through a student or admin's own authenticated session,
-- and never through the browser.
-- ----------------------------------------------------------------------------
CREATE TABLE public.mentorship_connection_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL UNIQUE REFERENCES public.mentorship_connections (id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER mentorship_connection_tokens_set_updated_at
  BEFORE UPDATE ON public.mentorship_connection_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) oauth_states — short-lived, single-use CSRF/replay protection for the
-- OAuth round trip. An opaque random value (not a self-encoding token) is
-- generated server-side, stored here, and embedded as the `state` param in
-- the provider's authorize URL. The callback looks it up, checks it hasn't
-- expired or already been used, and only then trusts the request. Same
-- zero-policy posture as tokens — this is internal plumbing, never meant to
-- be read through the app.
-- ----------------------------------------------------------------------------
CREATE TABLE public.oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('shopify', 'meta')),
  shop_domain text, -- Shopify only; cross-checked against the callback's own `shop` param
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX oauth_states_state_idx ON public.oauth_states (state);

-- ----------------------------------------------------------------------------
-- 4) RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.mentorship_connections ENABLE ROW LEVEL SECURITY;

-- Students see/manage only their own enrollment's connections, and only
-- while their mentorship access is active — connections are business
-- tooling, gated the same way tasks/KPIs/products already are. Admin is
-- unrestricted, matching every other mentorship table.
CREATE POLICY "mentorship_connections_select_own_or_admin"
  ON public.mentorship_connections FOR SELECT
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

CREATE POLICY "mentorship_connections_insert_own_active"
  ON public.mentorship_connections FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

CREATE POLICY "mentorship_connections_update_own_active_or_admin"
  ON public.mentorship_connections FOR UPDATE
  USING (public.is_admin() OR public.is_mentorship_access_active(enrollment_id))
  WITH CHECK (public.is_admin() OR public.is_mentorship_access_active(enrollment_id));

CREATE POLICY "mentorship_connections_delete_admin"
  ON public.mentorship_connections FOR DELETE
  USING (public.is_admin());

-- mentorship_connection_tokens: RLS enabled, intentionally NO policies for
-- any role. Only the service-role client (which bypasses RLS entirely) can
-- read or write this table.
ALTER TABLE public.mentorship_connection_tokens ENABLE ROW LEVEL SECURITY;

-- oauth_states: same — RLS enabled, no policies, service-role only.
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
