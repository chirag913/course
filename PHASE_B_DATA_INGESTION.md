# Mentorship Data Ingestion — Phase B

Normalized Shopify + Meta data storage, built on top of the Phase A
connection layer (`PHASE_A_CONNECTIONS.md`). This phase does **not** build
the decision engine, economics engine, shipping/RTO, AI, weekly tasks, a
dashboard redesign, or `mentorship_product_catalog` — those are later
phases. It only gets reliable, normalized provider data into Supabase and
lets a student (or admin) trigger and observe a sync.

## Files

```
supabase/migrations/0007_mentorship_data_ingestion.sql   — schema + RLS
src/lib/sync/
  money.ts            — decimal string -> integer minor-unit conversion
  state.ts            — sync attempt bookkeeping (start/complete/fail/read)
  shopify-ingest.ts    — Shopify REST pagination, transform, idempotent upsert
  meta-ingest.ts       — Meta Graph API pagination, transform, idempotent upsert
src/lib/connections/meta.ts   — added getValidMetaToken() (mirrors Phase A's
                                  getValidShopifyToken(), which Phase A built
                                  specifically for this phase to consume)
src/app/dashboard/mentorship/[slug]/connections/actions.ts
                                — added syncProvider/syncShopify/syncMeta/getSyncStatus
src/app/dashboard/mentorship/[slug]/connections/page.tsx
                                — added sync status + "Sync now" per provider
src/components/connections/sync-now-button.tsx   — client button, try/catch
```

No OAuth code was touched or duplicated. `mentorship_connections`,
`mentorship_connection_tokens`, and `oauth_states` are unchanged.

## Data model

Every table below is scoped by `enrollment_id`, the same tenant boundary as
every other mentorship table. Internal UUIDs are used for cross-table joins
(variant → product, line item → order/product/variant, ad set → campaign,
ad → ad set/campaign, insight → ad); the provider's own ID is always kept
alongside for reconciliation/debugging.

**Shopify:** `mentorship_shopify_products`, `..._product_variants`,
`..._orders`, `..._order_line_items`. No customer identifier of any
kind is stored — Phase B's analysis needs (spend, revenue, margin) never
require knowing who bought, only what/when/how much.

**Meta:** `mentorship_meta_ad_accounts`, `..._campaigns`, `..._ad_sets`,
`..._ads`, `..._ad_insights` (one row per ad + date).

**Sync state:** `mentorship_data_syncs` — one row per sync **attempt**
(audit-log style, like `mentorship_pause_history`), not one evolving row per
enrollment/provider. `last_successful_sync_at` is carried forward from the
previous attempt at start time and overwritten on success, so any single row
tells you both "how did this attempt go" and "when did we last actually
succeed" without a join. A partial unique index on
`(enrollment_id, provider) WHERE status = 'running'` is what prevents two
concurrent syncs — the same pattern Phase A used for "only one active
connection."

### Money

Every currency amount is an integer in the currency's minor unit
(paise/cents), matching `courses.price` / `mentorship_payments.amount`.
`src/lib/sync/money.ts`'s `toMinorUnits()` does the conversion from the
decimal strings Shopify/Meta return. **Known limitation:** this assumes a
2-decimal-place currency (correct for INR/USD/EUR/GBP — what this platform
actually deals in). A zero-decimal currency like JPY would be misconverted;
nothing in this codebase currently uses one.

`ctr` is a plain percentage (`numeric`), not money. `cpc`/`cpm` are
currency-per-unit amounts and follow the money convention.

### Dates

Shopify order timestamps (`created_at_external`/`updated_at_external`) and
Meta's `created_time`/`updated_time` are stored verbatim from the provider,
never reinterpreted through server timezone. A Meta insight's `date` is the
provider's own reporting date (`date_start` with `time_increment=1`).

### Missing metrics

Meta doesn't always report `actions`/`action_values` for a given ad/date. If
those keys are entirely absent from the API response, `purchases` and
`purchase_value` are stored as `NULL` (metric unavailable). If the keys are
present but contain no purchase-type action, they're stored as `0`
(tracked, zero conversions). This distinction is deliberate — see
`extractPurchaseMetrics()` in `meta-ingest.ts`.

## Sync architecture

There is no background job system — syncs run **synchronously inside the
Server Action** that triggers them (`syncProvider`). This matches the
explicit Phase B instruction not to build a job system unless the existing
architecture genuinely requires one. The `mentorship_data_syncs` partial
unique index (`status = 'running'`) is what actually prevents two
overlapping syncs for the same enrollment/provider — that guard is
independent of synchronous execution. **Known limitation:** if historical
data volume ever grows past a single serverless request's time budget, this
should move to a background job — a Phase C+ concern, not built here.

`syncType` is `"initial"` the first time a provider has no prior successful
sync, otherwise `"incremental"` — `syncProvider` decides this by checking
for a previous `last_successful_sync_at`. `"manual"` is available for
scripted/ad hoc use (used by this phase's own test scripts) but the UI
button always goes through the initial/incremental logic.

### Shopify ingestion

REST Admin API (matching the client already established for `shop.json` in
Phase A — not GraphQL), pinned to `SHOPIFY_API_VERSION` from Phase A's
`shopify.ts`. `getValidShopifyToken()` handles refresh transparently.

- **Products** (`/products.json`) — full re-pull every sync (not
  time-windowed; product catalogs are small enough that a full pull is
  simpler and more correct than tracking partial updates).
- **Orders** (`/orders.json?status=any`) — `updated_at_min` is passed on
  incremental syncs using the previous successful sync's timestamp, so
  updates/cancellations/fulfillment changes since last sync are re-pulled.
- Pagination follows Shopify's `Link` response header (`rel="next"`),
  capped at 200 pages per resource per sync as a safety net.
- **Known Shopify limitation, surfaced honestly:** the `read_orders` scope
  (no `read_all_orders`) only returns orders from roughly the last 60 days.
  This is a real platform restriction, not a bug — `ingestShopifyForConnection`
  returns an `ordersWindowNote` that's stored in the sync's `metadata`, so
  nobody looking at sync history is misled into thinking full order history
  was imported.
- Errors are classified (`ShopifyIngestError.kind`): `auth` (401/403 — token
  invalid, needs reconnect), `rate_limit` (429), `api` (anything else,
  including unparseable responses).

### Meta ingestion

Graph API, pinned to `META_GRAPH_VERSION` from Phase A's `meta.ts`.
`getValidMetaToken()` (new in this phase, added to Phase A's `meta.ts` file
since that's exactly what Phase A structured for this phase to add) returns
`null` when the stored long-lived token is within 24 hours of its recorded
expiry — Meta has no refresh grant, so this always means "the student needs
to reconnect," never "silently retried."

Pull order per sync: ad account details → campaigns → ad sets → ads → daily
ad-level insights. Each step resolves its parent's internal UUID via a map
built from the previous step's upsert result (e.g., an ad set's
`campaign_id` is looked up from the campaigns just upserted), falling back
to `null` with the external ID preserved if a parent wasn't found in this
pull (pagination edge case).

- **Historical window:** `DEFAULT_META_INSIGHTS_WINDOW_DAYS = 30` for a
  first-ever sync. Configurable via `ingestMetaForConnection(..., { windowDays })`
  at the function level (not yet exposed as a UI control — out of Part F's
  explicit UI scope for this phase). Incremental syncs pass `since` = the
  previous successful sync's date instead.
- Insights are **upserted** keyed on `(enrollment_id, external_ad_id, date)`,
  so a later sync correctly overwrites an earlier day's numbers — handling
  Meta's well-known late-arriving/adjusted attribution data.
- Errors are classified (`MetaIngestError.kind`): `auth` (code 190 / 401 —
  reconnect needed), `rate_limit` (codes 4/17/32/613 / 429), `permission`
  (codes 200/10 — app lost access to the account), `invalid_account` (code
  100/subcode 33 — account removed/not found), `api` (anything else).

## RLS / security

All ten new tables: RLS enabled, one `SELECT` policy
(`is_admin() OR is_mentorship_access_active(enrollment_id)`, identical to
every other mentorship content table) and one `FOR ALL` admin-only policy.
**No student write policy exists on any of these tables, for any operation.**
All writes happen server-side via the service-role client from
`shopify-ingest.ts`/`meta-ingest.ts`/`state.ts`, after the calling Server
Action has already verified the caller owns (or administers) the enrollment.

Verified directly against the hosted DB with two real authenticated student
JWTs (an existing test student plus a fresh throwaway one, both deleted
after the test): for every one of the 10 tables — reading your own row
succeeds, reading another student's row by ID returns zero rows with no
error, an unfiltered list returns zero rows for data you don't own,
attempting to `UPDATE` your own row directly is silently blocked (zero rows
affected, no error — no policy permits it), and attempting to `INSERT` into
your own enrollment is explicitly rejected with an RLS violation error.

Tokens remain exactly as strict as Phase A left them — this phase reads
them only through `getValidShopifyToken()`/`getValidMetaToken()`, never
directly.

## Environment variables

No new ones. Ingestion reuses Phase A's `SHOPIFY_CLIENT_ID`,
`SHOPIFY_CLIENT_SECRET`, `META_APP_ID`, `META_APP_SECRET`.

## How to manually trigger a sync

From the Connections page (`/dashboard/mentorship/[slug]/connections`),
click "Sync now" under a connected provider. Server-side, this calls
`syncProvider(enrollmentId, provider)` — the same function whether invoked
by the student or by an admin viewing that student's data (ownership is
re-derived from the enrollment row, exactly like Phase A's other actions;
admin passes because `is_admin()` bypasses the ownership check in the
`enrollments` RLS policy).

## How this was tested

No real Shopify/Meta app credentials exist yet, so this phase does **not**
claim a live OAuth-based sync happened — per instruction, that would be
fabricated. What was actually exercised:

1. **Mocked-provider, real-database tests** (Node scripts using a small
   loader that runs the actual TypeScript source directly — see
   `ts-loader.js` pattern, not reimplemented logic): `global.fetch` is
   swapped for a fixture server simulating Shopify's REST pagination and
   Meta's Graph API pagination; all DB writes go through the real
   `createAdminClient()` against the hosted Supabase project, using a
   temporary connection/token row on the existing test student's real
   enrollment, cleaned up after each run.
   - Shopify: 2-page products + 2-page orders pulled correctly; internal
     product_id/variant_id resolved onto line items; re-running with changed
     data (product title, order financial_status) updated the same rows in
     place rather than duplicating (row counts stayed at 2/2, not 4/4).
   - Meta: paginated campaigns (2 pages) plus ad sets/ads/insights pulled
     and linked correctly; the null-vs-zero purchase metric distinction
     verified for all three cases (real purchase data, tracked-zero,
     field-entirely-absent); re-running with a changed campaign status and
     changed daily spend updated in place rather than duplicating.
2. **Sync-state tests** (real DB, no mocking needed): concurrent
   `startSync` calls for the same enrollment/provider — the second is
   correctly rejected by the partial unique index; `last_successful_sync_at`
   correctly carries forward across attempts; a forced ingestion failure
   (mocked 401) correctly produces a `failed` sync row with a specific,
   non-generic error message, while the previous success timestamp is
   preserved (not wiped by the failure).
3. **RLS isolation** (real DB, two real authenticated student JWTs, one
   throwaway, deleted after): all ten new tables verified for
   read-isolation, write-blocking, and insert-blocking as described above.
4. **Live browser test of the real failure path** (no mocking): a real
   `mentorship_connections` row was created pointing at a Shopify domain
   that doesn't correspond to a real store, and "Sync now" was clicked in
   an actual signed-in browser session. The real network call reached
   Shopify's servers and got a real 404, which the UI displayed as
   "Shopify API returned an unexpected error (status 404)." with no crash,
   blank page, or raw 500 — both inline (via the button's own error state)
   and as a persisted "Last sync failed" banner on reload. This test
   connection was deleted afterward.
5. `npm run typecheck`, `npm run lint`, `npm run build` all pass clean.

**Not tested:** an actual successful sync against a real Shopify store or
Meta ad account, since no real provider app credentials are configured.

## What remains for Phase C

- Product identity/matching (tie a Shopify product to ad spend driving it)
  and the canonical `mentorship_product_catalog` — deliberately not built
  here.
- Economics engine (margin, break-even ROAS), RTO/shipping-CSV ingestion,
  decision engine, weekly task automation, account health scoring, AI,
  dashboard redesign, mentor override — all untouched, as scoped.
- If sync volume grows past a single request's time budget, move
  `syncProvider` to a background job.
- A UI control for the Meta insights historical window (currently a
  function-level default/parameter only).
- Real end-to-end verification against live Shopify/Meta credentials once
  those are configured (see `PHASE_A_CONNECTIONS.md`'s provider setup
  section — unchanged by this phase).
