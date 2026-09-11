# Mentorship Connections — Phase A

This is the connection foundation for the Ecommerce Mentorship's future data
layer (see `RESEARCH.md`-style planning notes from the architecture audit).
It builds Shopify and Meta Ads OAuth, secure token storage, and the
connect/disconnect UI. **No data ingestion happens yet** — that's Phase B.

## Files

```
supabase/migrations/0006_mentorship_connections.sql   — schema + RLS
src/lib/connections/
  state.ts       — OAuth CSRF/replay protection (oauth_states table)
  tokens.ts      — the ONLY code allowed to touch mentorship_connection_tokens
  shopify.ts     — Shopify OAuth URL building, token exchange/refresh
  meta.ts        — Meta OAuth URL building, token exchange, ad account listing
src/app/api/connections/
  shopify/callback/route.ts   — Shopify redirects here after authorization
  meta/callback/route.ts      — Meta redirects here after authorization
src/app/dashboard/mentorship/[slug]/connections/
  page.tsx                    — student-facing connect/disconnect UI
  actions.ts                  — server actions (initiate, disconnect, finalize)
  meta/select-account/page.tsx — Meta's "which ad account?" step
src/components/connections/   — the small client components those pages use
```

## Data model

- `mentorship_connections` — status/account metadata only, never secrets.
  Scoped by `enrollment_id`, same as every other mentorship table. A fresh
  "Connect" always inserts a new row rather than overwriting the previous
  one, so disconnect → reconnect history survives (useful once Phase B ties
  imported data to a specific `connection_id`). A partial unique index
  (`WHERE status = 'connected'`) is what actually enforces "only one active
  connection per provider" — old disconnected/error rows don't count.
- `mentorship_connection_tokens` — the real secrets. RLS enabled, **zero
  policies for any role, including admin**. The only way in or out is the
  service-role client from `src/lib/connections/tokens.ts`. This mirrors the
  `coupons` table's existing "no client SELECT policy at all" pattern, taken
  one step further (not even admin-through-the-app can read it).
- `oauth_states` — short-lived (10 min), single-use, opaque random state
  values for CSRF/replay protection. Same zero-policy posture as tokens.

## Shopify OAuth flow

1. Student enters a shop domain on the Connections page → `initiateShopifyConnect` server action verifies they own the enrollment, normalizes the domain, creates an `oauth_states` row, and redirects to Shopify's authorize URL with `scope=read_products,read_orders`.
2. Student approves on Shopify's own consent screen.
3. Shopify redirects to `/api/connections/shopify/callback?code=...&state=...&shop=...&hmac=...`. The callback:
   - Verifies Shopify's HMAC signature over the full query string (independent of `state` — confirms the request wasn't tampered with).
   - Consumes the `state` (rejects if missing/expired/already used/wrong provider).
   - Cross-checks the `shop` param against the domain recorded when the state was created.
   - Cross-checks the currently logged-in session against the enrollment the state was issued for.
   - Exchanges the code for a token, fetches the shop's display name, stores the connection + token, redirects back to the Connections page.
4. **Token lifecycle:** as of Shopify's April 2026 requirement, new public apps get expiring offline tokens with a refresh token, following standard OAuth 2.0 conventions. `getValidShopifyToken(connectionId, shopDomain)` (in `shopify.ts`) is the helper Phase B's sync code should call — it returns a valid token, refreshing first if the stored one is near expiry. **Not exercised by anything in Phase A** (no ingestion yet) — verify the exact refresh request/response shape against Shopify's current docs the first time it's actually used, since the specific field names for the new expiring-token model couldn't be independently confirmed beyond Shopify's own statement that it follows OAuth 2.0 conventions.

## Meta OAuth flow

1. Student clicks "Connect Meta Ads" → `initiateMetaConnect` creates an `oauth_states` row and redirects to Facebook's OAuth dialog with `scope=ads_read` only (never `ads_management` — this platform is read-only/analysis-only by design).
2. Meta redirects to `/api/connections/meta/callback?code=...&state=...`. The callback consumes state, cross-checks the session, exchanges the code for a short-lived token, then immediately exchanges that for a **long-lived token (~60 days)** — Meta has no refresh-token grant like Shopify; a long-lived user token is the mechanism, and it needs periodic re-exchange before it expires (a Phase B/ops concern, not handled automatically yet).
3. Lists the student's ad accounts via the Marketing API. If there's more than one (or even just one — we never silently pick), a `pending_selection` connection row is created and the student is sent to `/dashboard/mentorship/[slug]/connections/meta/select-account` to explicitly choose one.
4. Selecting finalizes the connection (`status='connected'`, `external_account_id`/`external_account_name` set).

## Security summary

- Tokens never reach a client component, a `NEXT_PUBLIC_*` variable, or the browser — every provider API call in this codebase happens server-side.
- OAuth state is single-use (marked `used_at` the instant it's checked, before anything else happens) and provider-scoped, preventing replay and callback mix-up.
- Every callback re-derives the enrollment from the state row, then cross-checks it against the *actual* logged-in session on that request — a captured/leaked `state` value alone isn't enough to attach a connection to the wrong account, because the session check would fail.
- RLS on `mentorship_connections` requires `is_mentorship_access_active(enrollment_id)` (or admin) for every operation — a paused/revoked student can't view or modify connections, same treatment as tasks/KPIs/products.

## Required environment variables

```
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
META_APP_ID=
META_APP_SECRET=
```

All server-only. `NEXT_PUBLIC_SITE_URL` (already existing) is reused to build both providers' redirect URIs — no new public variable needed.

## Testing locally

1. Fill in the four variables above in `.env.local`, pointed at a Shopify Partner/Dev Dashboard app and a Meta developer app (see provider setup below).
2. Both providers require an **HTTPS** redirect URI in production, but Shopify and Meta both accept `http://localhost:3000/...` for local development apps in their dashboard's allowed-redirect-URL list — set both callback URLs there before testing.
3. Click "Connect Shopify" / "Connect Meta Ads" from a real mentorship dashboard as a logged-in student with active access, and complete the provider's real consent screen — there is no way to test this flow without real (test-mode) provider credentials, since the callback route depends on receiving a real `code` from the provider.
