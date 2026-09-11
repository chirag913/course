# Mentorship Economics + Shipping/RTO — Phase D

Answers "for this product, after ads + product cost + shipping + COD +
packaging + RTO, are we actually making money?" — with raw inputs, real
shipping data, and calculations that refuse to fabricate a number when the
underlying data is incomplete. Builds on Phase C's canonical product
catalog (`PHASE_C_PRODUCT_INTELLIGENCE.md`). **No decision engine, no
TEST/WATCH/SCALE/KILL, no AI, no account health score** — those are
Phase E/F.

## Files

```
supabase/migrations/0009_mentorship_economics_shipping.sql
src/lib/economics/
  calculate.ts        — contribution profit, break-even ROAS, Meta vs blended ROAS
  data-quality.ts      — the "never show a fake number" evaluator
  selling-price.ts     — Shopify-derived price suggestion, ambiguity detection
  account.ts           — reusable enrollment+range aggregation (no UI yet)
src/lib/shipping/
  csv.ts               — dependency-free RFC4180 CSV parser + column auto-detection
  normalize-status.ts   — raw CSV status -> canonical status
  matching.ts           — deterministic exact Shopify order matching
  fulfillment.ts        — per-product delivered/RTO/NDR counts and rates
  classification.ts     — unmatched-order lookup for the classification UI
  import.ts             — the full CSV import pipeline (server-only)
src/app/dashboard/mentorship/[slug]/
  products/actions.ts (extended) — saveProductEconomics
  products/[productId]/page.tsx (extended) — Economics/Fulfillment/Data Quality sections
  shipping/actions.ts, shipping/page.tsx — CSV upload + unresolved-order classification
src/components/products/economics-form.tsx
src/components/shipping/                — upload form, bulk classifier
```

## Economics schema

`mentorship_product_economics` — one row per `(enrollment_id,
product_catalog_id)`. **Every cost field is nullable with no default.** A
missing COGS is never treated as ₹0 COGS anywhere in the calculation layer
— `calculateContributionProfit()` and `calculateBreakEvenRoas()` both
return `null` with a named list of exactly what's missing, rather than
silently substituting zero. Negative values are rejected by a DB `CHECK`
constraint (and again in the Server Action, for a friendlier error).

**Cost unit conventions** (documented explicitly, since the schema alone
doesn't say this): COGS is **per unit sold**; shipping, COD fee, packaging,
and other variable cost are **per order**; RTO cost is **per RTO'd order**.
This mirrors how these costs actually behave in a real fulfillment
business — the product itself costs money per unit shipped, while
shipping/COD/packaging/RTO are shipment-level costs, and RTO in particular
only happens to *some* orders, not all of them. There is currently no
COD-vs-prepaid distinction in the ingested Shopify data, so the COD fee is
applied uniformly to every order — a known, explicitly documented
limitation, not a silent assumption.

### Selling price

Phase C's Shopify mapping can suggest a price
(`getShopifySuggestedSellingPrice`): if the product maps to a single
Shopify product/variant (or several variants that all share one price), that
price is suggested. If the mapped Shopify product has **multiple different
variant prices**, no price is suggested — the UI shows an explicit warning
("multiple variant prices; confirm manually") instead of averaging or
guessing.

The suggestion only ever pre-fills the **form field**; nothing writes to
`mentorship_product_economics` until the student clicks **Save Economics**.
Nothing in Phase B's sync process, or anywhere else, ever touches this
table automatically — so a manually-saved price can never be silently
overwritten by a later Shopify sync. `selling_price_source` (`shopify` |
`manual`) records which one produced the currently-saved value, purely for
display; it has no effect on any calculation.

## Shipping CSV

### Format & parsing

`src/lib/shipping/csv.ts` is a small, dependency-free RFC4180-ish parser
(quoted fields, embedded commas/newlines, escaped `""`, CRLF/LF, ragged
rows) — the same implementation runs client-side (to preview detected
columns before import) and server-side (to actually import), so there's
exactly one parsing behavior to trust.

### Column mapping

The student picks a file; the browser reads it locally and shows the
detected header row with two dropdowns (order reference column, status
column), pre-selected via a conservative pattern match
(`guessOrderColumn`/`guessStatusColumn`) but always requiring explicit
confirmation before import — the system never silently guesses a mapping
it can't show the user first.

### Canonical statuses

Exactly four meaningful values plus two "we're not sure" values:
`shipped`, `delivered`, `NDR`, `RTO`, `unknown` (recognizable but
unmapped text), `needs_review` (blank/missing). `normalizeShippingStatus()`
only maps a raw string to one of the four meaningful statuses on a
confident pattern match (see the pattern lists in that file); anything else
becomes `unknown`, never guessed into a real status.

### Shopify order matching

Deterministic only — exact match against the order's `external_order_id`
first, then its `order_number` (with a leading `#` stripped, since exports
often display order numbers that way). **Never** matches on customer name,
phone, or address. No match → the row is stored with `match_method =
'unmatched'` and `normalized_order_id = NULL`.

### Unresolved orders (never assumed)

A Shopify order that never appears in **any** shipping row is not RTO, not
delivered, not cancelled — it just sits in
`mentorship_unmatched_order_classifications` as `needs_review` until a
human explicitly classifies it (`cancelled` / `rejected` / `never_shipped`
/ `other` / `needs_review`), individually or in bulk. Classifying an order
is **purely informational** — it never changes that order's fulfillment
status or feeds into the delivery/RTO/NDR rates. Verified directly: an
order classified `cancelled` still contributes to the "unresolved" bucket
in fulfillment counts, not to RTO or delivered.

### Import idempotency & superseding

Every import's file content is SHA-256 hashed; `UNIQUE(enrollment_id,
file_hash)` rejects an exact re-upload before any row is even parsed.

A **different** file that reports an updated status for a previously-seen
order is not blocked — it's a new import with a new hash. Nothing is ever
mutated or deleted: **an order's current status is always resolved as the
most recent shipping row matched to it** (`ORDER BY created_at DESC`,
first row wins). This is the entire mechanism behind "a later report
supersedes an earlier one" and "delivered + RTO never both count as
current for the same order" — verified directly: after importing a second
file that changed one order from `shipped` to `delivered`, both rows still
exist in the table, but fulfillment counts reflect only the newer one.

## Fulfillment calculations

Per product, per date range (`getProductFulfillmentSummary`): resolve every
mapped order's current status, then count `shipped` / `delivered` / `NDR`
/ `RTO` / `unresolved` (no shipping data, or `unknown`/`needs_review`).

**Rate formulas** — the denominator is every order that actually entered
the shipment lifecycle:

```
eligibleBase = shipped + delivered + NDR + RTO
deliveryRate = delivered / eligibleBase × 100
rtoRate      = RTO / eligibleBase × 100
ndrRate      = NDR / eligibleBase × 100
```

`shipped` counts toward the denominator because it represents an order
that has left the warehouse but hasn't yet resolved to a terminal state —
excluding it would understate the base. Orders with **no** shipping data
at all are excluded from both the numerator and denominator entirely, never
counted as a failure. If `eligibleBase = 0`, every rate is `null` and the
UI shows **"Not enough data"**, never `0%`.

## Contribution profit

```
Contribution Profit =
  Revenue
  − (COGS per unit × units sold)
  − (Shipping per order × orders)
  − (COD fee per order × orders)
  − (Packaging per order × orders)
  − (Other variable cost per order × orders)
  − (RTO cost per RTO'd order × ACTUAL RTO count observed in this range)
  − Ad spend (Meta, this range)
```

Revenue/units/orders reuse Phase C's exact aggregation
(`getProductMetrics`) — same order-dedup and gross-line-item-revenue
definition as documented there. RTO cost uses the **actual** RTO count
observed for this date range (real data — "what actually happened"), not
an estimate. If *any* of the seven inputs above is missing, the whole
result is `null`, and the caller gets back exactly which inputs were
missing by name — never a partial or approximated number.

## Break-even ROAS

This is **unit economics** — "what ROAS do I need on the next order" — so
it's computed from the persistent per-unit/per-order cost configuration
directly, not from any date range's aggregate revenue:

```
expectedRtoCostPerOrder = RTO cost per RTO'd order × (RTO rate ÷ 100)
contributionBeforeAdsPerOrder =
  Selling price − COGS − Shipping − COD fee − Packaging − Other variable cost
  − expectedRtoCostPerOrder
Break-even ROAS = Selling price ÷ contributionBeforeAdsPerOrder
```

**Why RTO uses a rate here but a count in Contribution Profit:** a single
hypothetical future order doesn't have an RTO cost with certainty — only
some fraction of orders come back. Break-even ROAS asks a forward-looking
question, so it has to express RTO as an *expected value* (rate × cost),
sourced from the real observed RTO rate for the selected date range (the
same number Part H's fulfillment summary computes). If that rate can't be
computed yet (no shipping data), break-even ROAS is unavailable rather
than silently assuming a 0% RTO rate — verified: the worked example (₹1000
price / ₹300 COGS / ₹70 shipping / ₹20 COD / ₹10 packaging, 0% RTO) gives
exactly 1.67×, matching the spec's own example, and the same inputs at a
20% RTO rate correctly reduce the break-even ROAS. Any missing cost input,
or a missing/undefined RTO rate, or a break-even contribution ≤ 0, produces
a specific "unavailable" reason — never a fabricated number.

## Meta ROAS vs Blended ROAS

Two different questions, never allowed to stand in for each other:

- **Meta ROAS (attributed)** = Meta purchase value ÷ Meta spend — what Meta
  itself reports as attributed to its ads.
- **Blended ROAS** = Shopify revenue ÷ Meta spend — actual business revenue
  against ad spend, regardless of what Meta thinks it drove.

Both are labeled explicitly in the UI; both are `null` (not `0` or an
error) when spend is zero or missing.

## Data quality

`evaluateEconomicsDataQuality()` is the single place that decides what
warnings/incomplete-notices to show — every missing cost input, ambiguous
selling price, absent Shopify/Meta mapping, absent shipping data, and any
unresolved fulfillment status for this product each produce their own
plain-language message. Verified live: saving complete economics inputs
collapses the list to just "upload shipping data"; removing one input
(RTO cost) brings back exactly that one warning, nothing else.

## Date range

Reuses Phase C's `resolveDateRange`/`DateRangePreset` exactly — no second
date-range system. Economics **inputs** (selling price, costs) are
persistent configuration, unaffected by the date-range picker. Performance
numbers (revenue, ad spend, fulfillment counts/rates, contribution profit)
are date-range dependent. Break-even ROAS sits in between: its cost inputs
are persistent, but it borrows the date range's observed RTO rate — this
is called out explicitly in the UI copy so it doesn't look like a Phase-C
performance metric.

## Account-level aggregation (reusable, no UI yet)

`src/lib/economics/account.ts`'s `getAccountEconomicsSummary(enrollmentId,
range)` sums the exact same per-product functions this phase's product
page uses (spend, orders, delivered/NDR/RTO, revenue, contribution profit)
across every active product in an enrollment. Nothing renders this yet —
it exists so a future account-level dashboard (Phase F) doesn't have to
re-derive the aggregation logic.

## Security / RLS

`mentorship_product_economics`, `mentorship_shipping_imports`,
`mentorship_shipping_rows`, `mentorship_unmatched_order_classifications`:
RLS enabled, students SELECT/INSERT/UPDATE their own
(`is_mentorship_access_active`), DELETE admin-only. Cross-enrollment
integrity is enforced by a **database trigger** on each table (mirroring
Phase C's pattern) — a plain FK can't verify that, say, an economics row's
`product_catalog_id` belongs to the *same* enrollment as the row itself.
Verified with real JWTs: full read/write isolation across all four tables,
a positive control confirming a student CAN manage her own economics, and
confirmation that Phase B's provider-ingestion tables remain completely
un-writable by students (regression check, unchanged from Phase B/C).

## Testing performed

- **Pure unit tests**: CSV parsing (quoted/escaped/embedded-newline/
  ragged/CRLF/empty rows), status normalization (every canonical status
  plus "never guess" cases), exact order matching, contribution profit
  (complete inputs, each missing-input case individually), break-even ROAS
  (the spec's own worked example reproduced exactly, RTO-rate
  incorporation, every "unavailable" reason), Meta vs blended ROAS staying
  distinct.
- **Real-database tests** (seeded via the service-role client, exercising
  the actual production code path): a 10-order product with a 7-row
  shipping CSV — verified the **critical case** that the other 3 orders are
  never assumed to be RTO/delivered and enter the unresolved-classification
  workflow instead; exact fulfillment counts and rate math; duplicate-file
  rejection; a second, different import correctly superseding one order's
  status while preserving both historical rows; classification proven to
  be informational-only; contribution profit computed from real aggregated
  data; cross-enrollment trigger rejection on all three trigger-protected
  tables.
- **RLS isolation**: two real authenticated student JWTs, full read/write
  isolation across all four new tables, a positive control, and a
  regression check on Phase B's provider tables.
- **Live browser walkthrough** (real seeded data, no mocked OAuth):
  opened a product, entered and saved economics, confirmed contribution
  profit/ROAS numbers matched hand-computed expectations exactly, uploaded
  a real shipping CSV with column auto-detection, confirmed the import
  summary and fulfillment metrics/rates matched exactly, bulk-classified
  the one unresolved order, confirmed break-even ROAS appeared with the
  RTO rate correctly incorporated, then removed the RTO cost input and
  confirmed contribution profit/break-even ROAS reverted to "incomplete"
  with the exact right reason and the data-quality list updated live.
- `npm run typecheck`, `npm run lint`, `npm run build` all pass clean.

## Known limitations

- COD fee is applied to every order uniformly — there's no COD-vs-prepaid
  field in the ingested Shopify data yet to restrict it correctly.
- Break-even ROAS's RTO-rate blending is a deliberate, documented judgment
  call (see above) — a future phase could refine this further if the
  mentorship program's real usage reveals a better model.
- No UI yet for the account-level aggregation functions (Part O
  deliberately doesn't ask for one).
- Shipping CSV column mapping is manual-confirm only; there's no saved
  "remember my mapping for this provider" convenience yet.

## What remains for Phase E

The decision engine: turning this phase's contribution profit, break-even
ROAS, actual/blended ROAS, and fulfillment rates into
TEST/WATCH/ITERATE/SCALE/KILL recommendations, account health scoring, and
weekly mentor tasks — all deliberately untouched here.
