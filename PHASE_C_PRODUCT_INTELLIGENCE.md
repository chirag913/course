# Mentorship Product Intelligence — Phase C

Canonical product catalog + Shopify/Meta mapping, built on Phase B's
normalized ingestion (`PHASE_B_DATA_INGESTION.md`). This phase answers "for
this student's product, what's happening across Shopify and Meta?" with
raw, aggregated observations only. It does **not** calculate profitability,
margin, break-even ROAS, or make any kill/scale/watch decision — that's
Phase D/E.

## Canonical product architecture

`mentorship_product_catalog` is the new canonical product entity —
`enrollment_id`-scoped, `name`/`slug`/`status` (`active`/`archived`)/`source`
(`manual`/`shopify`). It exists **alongside**, not instead of, the legacy
`mentorship_products` table (the mentor's manual kill/keep/scale/testing
tracker, built in an earlier phase). That table is completely untouched by
this migration — no columns added, no rows migrated, no code path shared.
The two systems will eventually be reconciled, but that's an explicit
future decision, not something this phase assumes or forces.

Everything downstream — Shopify mapping, Meta mapping, aggregation — is
built around `mentorship_product_catalog`.

## Files

```
supabase/migrations/0008_mentorship_product_intelligence.sql   — schema + RLS + triggers
src/lib/products/
  matching.ts      — deterministic (non-LLM) name matching + confidence scoring
  discovery.ts     — auto-create/auto-link/suggest from Shopify products
  metrics.ts        — product-level raw aggregation (Shopify + Meta)
  unmapped.ts       — unmapped Shopify products / Meta ads for the UI
  date-range.ts     — reusable date-range presets
src/app/dashboard/mentorship/[slug]/products/
  actions.ts                    — CRUD + mapping Server Actions
  page.tsx                      — product list + unmapped sections
  [productId]/page.tsx          — product detail (Overview/Shopify/Meta/Mapping)
src/components/products/        — the client components those pages use
```

## Shopify mapping

`mentorship_product_shopify_links`: `product_catalog_id` → `shopify_product_id`
(internal FK) with an optional `shopify_variant_id`. `variant_id = NULL`
means "the whole product, all variants"; a set `variant_id` means "this
specific variant only" — a catalog product can hold several variant-level
links (e.g. two of a product's three variants, deliberately excluding the
third).

External Shopify IDs remain the authoritative provider identity — they're
preserved on `mentorship_shopify_products`/`..._product_variants`
themselves (from Phase B); the link table only ever references our internal
UUIDs for joins, per the established "internal IDs for joins, external IDs
for reconciliation" rule.

Uniqueness (partial unique indexes, not just app logic): a given whole
Shopify product can be product-level-linked to at most one catalog product;
a given variant can be linked to at most one catalog product. This is what
actually prevents duplicate/conflicting Shopify mappings.

## Meta mapping

`mentorship_product_meta_links` maps a catalog product directly to a
**Meta ad** (`meta_ad_id`) — never to a campaign or ad set. Campaign/ad set
names are not treated as canonical (they're often reused, edited, or
inconsistent); the ad is the level at which spend/performance is actually
reported in `mentorship_meta_ad_insights`, so it's the only level that can
support accurate product-level aggregation. The manual mapping UI still
*shows* the campaign → ad set → ad hierarchy so a student can navigate to
the right ad, but the stored link always terminates at the ad.

`UNIQUE (enrollment_id, meta_ad_id)`: one ad can only ever belong to one
product's spend — otherwise the same spend would double-count across two
products.

## Confidence system & automatic matching rules

Pure, deterministic string matching — **no LLM**. `src/lib/products/matching.ts`:

1. Normalize both names: lowercase, strip punctuation, strip common
   size/pack/unit tokens (e.g. `100ml`, `2 pack`, `50g`) so "Premium Hair
   Serum" and "Premium Hair Serum - 100ml" normalize identically.
2. **HIGH** — normalized strings are exactly equal. This is the *only*
   confidence level ever auto-applied without human confirmation.
3. **MEDIUM** — Jaccard similarity (intersection/union of normalized word
   sets) ≥ 0.6 but not exact.
4. **LOW** — Jaccard similarity ≥ 0.3 but < 0.6.
5. Below 0.3 — no suggestion at all; the item stays unmapped.

For Meta, the same scoring runs against the ad name, ad set name, and
campaign name independently, and the single best result wins (we don't
trust any one of those three to be reliably product-descriptive on its
own).

**A false-positive mapping is worse than an unmapped item** — this is why
only exact-normalized matches are ever auto-applied, and everything else
is a suggestion requiring a human click.

## Automatic product discovery (Part F)

Triggered explicitly (a "Scan Shopify for new products" button on the
Products page) — never automatically after a sync, so a student always sees
what changed. For every Shopify product not yet linked to *any* catalog
product:

- Exact match against an existing catalog product → **auto-linked** (safe:
  it's an exact match).
- No match at all against anything → a **new** catalog product is created
  from it and linked (safe: nothing to confuse it with).
- Medium/low match → **never auto-applied**; returned as a suggestion
  (`{shopifyTitle, catalogName, confidence}`) for the student to confirm or
  reject manually via the ordinary mapping UI.

Newly-created catalog products from one discovery run are added to that
run's own candidate pool immediately, so two near-duplicate unlinked
Shopify products processed in the same pass (e.g. two size variants each
sitting on their own Shopify "product" record) correctly converge onto one
catalog product instead of each creating their own.

## Manual mapping UI

`/dashboard/mentorship/[slug]/products` (list: name, Shopify/Meta mapping
status, confidence, mapped-ad count, status, last updated + Add product +
Scan Shopify + Unmapped Shopify products / Unmapped Meta ads sections) and
`/dashboard/mentorship/[slug]/products/[productId]` (Overview / Shopify /
Meta / Mapping sections, per the required structure — built so Phase D can
add an Economics section and Phase E a Decision section without
restructuring what's here).

The mapping pickers only ever offer Shopify products/variants and Meta ads
that aren't already claimed by another catalog product (claimed ones are
filtered out before rendering) — the UI shows exactly PRODUCT → SHOPIFY
(product + variant) / META (campaign → ad set → ad) before saving, and both
sides are re-verified server-side to belong to the caller's own enrollment
before insert (see RLS section).

## Aggregation rules

**Orders are counted once, not once per line item.** A Shopify order can
contain multiple line items, possibly for different products. Product-level
`ordersCount` is `COUNT(DISTINCT order_id)` among only the line items that
match this product's mapping (by internal `product_id` for a whole-product
link, or `variant_id` for a variant-level link) — verified with a real test
order containing two line items of the same mapped product (correctly
counted as 1 order, not 2).

**Units** = `SUM(line_item.quantity)` across the matching line items.

**Revenue — exact definition:** `SUM(line_item.price × line_item.quantity)`
across the matching line items. This is **gross line-item revenue**,
computed from Shopify's own per-unit line price — it explicitly does
**not** include order-level tax, shipping, or order-wide discounts, and it
is **not** the order's `total_price` divided or apportioned across items
(an order's total mixes in other products, tax, shipping, and discounts
that don't belong to any single product). This was the specific trap Part J
warned about, and the test suite verifies a product's revenue excludes a
sibling line item from a different product in the *same* order.

**Meta spend only includes explicitly mapped ads.** An unmapped ad's spend
stays visible in Phase B's account-level data but never appears inside any
product's numbers — verified with two ads in the same account, only one
mapped, confirming the unmapped one's spend is fully excluded from the
product's total.

**CTR/CPC are recomputed from summed totals** (`clicks/impressions × 100`,
`spend/clicks`), not averaged from each day's own ratio — averaging daily
ratios would misweight low-volume days.

## Date range

`src/lib/products/date-range.ts` — Today / Yesterday / 7D / 14D / 30D /
Custom, all inclusive `[start, end]` calendar dates. Default is 30D,
matching Phase B's own default Meta-insights ingestion window so the
dashboard never looks emptier than the data actually pulled. "Last data
sync" reuses Phase B's `mentorship_data_syncs` directly — no duplicated
sync-state logic.

## Unmapped data

The Products list page has permanent "Unmapped Shopify products" and
"Unmapped Meta ads" sections (ad name, ad set, campaign, spend for the
current default window) so a student always has a concrete, actionable view
of what still needs mapping, separate from the discovery flow's transient
per-run suggestions.

## RLS / security

All three new tables: RLS enabled. Students get SELECT + INSERT on their
own catalog products (`is_mentorship_access_active(enrollment_id)`, same
gate as every other mentorship content table) and UPDATE (rename,
archive/reactivate) but not DELETE (admin-only — archiving is the exposed
"remove" action, matching the two-state `active`/`archived` model). Students
get SELECT + INSERT + DELETE on both link tables (create/remove a mapping)
but no UPDATE (a mapping is created or removed, never edited in place).
Admin has full access everywhere via `is_admin()`.

**Students still cannot write to any Phase B provider-ingestion table
directly** — unchanged from Phase B, verified again in this phase's tests
as a regression check.

**Cross-enrollment integrity is enforced by database triggers**, not just
RLS or application code — a plain foreign key can't verify that a link
row's `product_catalog_id`, `shopify_product_id`/`shopify_variant_id` (or
`meta_ad_id`), *and* the link row's own `enrollment_id` all agree. RLS
alone doesn't catch this either: a student's INSERT policy only checks that
*their own* `enrollment_id` has active access — it doesn't know whether the
`product_catalog_id` they supplied actually belongs to them. Verified with
a real authenticated JWT: Student B, inserting a row with her own
`enrollment_id`, attempting to target Student A's `product_catalog_id`,
was rejected — by the trigger, not by RLS, exactly as designed. Confirmed
with real JWTs across every table: read isolation, write isolation, and
this specific cross-enrollment attempt.

## What remains for Phase D

- Economics: COGS, shipping cost, COD fee, RTO cost, contribution
  margin, break-even ROAS — none of it exists yet; this phase deliberately
  stops at raw observations.
- Decision engine (TEST/WATCH/ITERATE/SCALE/KILL) and any account-health
  scoring.
- Shipping CSV ingestion and RTO tracking.
- A UI affordance for confirming/rejecting a discovery-run suggestion
  in place (currently the student re-does the mapping manually after
  seeing the suggestion in the scan result).
- Real end-to-end verification once real Shopify/Meta ingestion has run
  (this phase's tests use directly-seeded provider rows via the
  service-role client, exercising the same real aggregation/matching code —
  not against a live OAuth-synced store).
