# Architecture

## Stack

Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind CSS · Supabase (Postgres + Auth + Storage) · Razorpay · Vercel.

## Directory layout

```
src/
  app/
    (auth)/login, signup, reset-password, update-password   — public auth pages
    auth/callback/route.ts                                   — Supabase email-link handler
    logout/route.ts
    page.tsx                                                 — public course catalog
    courses/[slug]/page.tsx                                  — course sales page
    courses/[slug]/preview/[lessonId]/page.tsx                — public free-preview lesson
    dashboard/...                                              — student area (auth required)
      page.tsx                                                — My Courses
      profile/page.tsx
      learn/[courseSlug]/[lessonId]/page.tsx                  — course player
    admin/...                                                  — creator/admin area (admin required)
      page.tsx                                                — dashboard home
      courses/, students/, orders/, settings/
    api/
      checkout/route.ts, checkout/verify/route.ts             — Razorpay order + fast-path verify
      webhooks/razorpay/route.ts                              — durable payment confirmation
      lessons/[lessonId]/progress|complete/route.ts           — progress tracking
      materials/[resourceId]/download/route.ts                — signed download URLs
  components/
    ui/          — Button, Input, Card, Badge, EmptyState, Spinner (design primitives)
    admin/        — course builder UI (drag-and-drop curriculum, lesson editor drawer, etc.)
    player/        — student course-player UI (curriculum sidebar, lesson player)
    video/          — the ONE component that renders a video embed
    checkout/        — Razorpay checkout box
  lib/
    supabase/client.ts, server.ts, admin.ts   — the three Supabase client factories (see below)
    auth.ts                                    — getCurrentUser / requireUser / requireAdmin
    video/                                      — video provider abstraction (see VIDEO_ARCHITECTURE.md)
    razorpay.ts, payments.ts, pricing.ts        — payment verification + coupon math
    progress.ts                                 — course completion % / resume-lesson logic
    validations.ts                              — zod schemas for every mutation
  types/database.ts                             — hand-written types mirroring the SQL schema
supabase/migrations/0001_init.sql                — full schema + RLS + storage policies
```

## The three Supabase clients — and why there are three

| File | Auth context | RLS applies? | Used from |
|---|---|---|---|
| `lib/supabase/client.ts` | Browser session (anon key) | Yes | Client components |
| `lib/supabase/server.ts` | Request's cookies (anon key) | Yes | Server components, route handlers, server actions |
| `lib/supabase/admin.ts` | Service role key | **No — bypasses RLS entirely** | Only: webhook handler, signed-download route, coupon lookup at checkout, listing auth users for the admin/students page |

The `admin.ts` client is imported with `import "server-only"` so any accidental import from client-bundled code fails at build time, not at runtime in production. Everywhere else, authorization is enforced by Postgres Row Level Security (see DATABASE.md) — application code does not re-implement access checks in JavaScript; it simply queries as the signed-in user and trusts Postgres to filter/reject.

## Request flow: purchase → access

```
Sales page (CheckoutBox, client)
  → POST /api/checkout                      [user's session, RLS-checked insert]
      creates Razorpay order + a `created` order row
  → Razorpay checkout.js modal
  → on success, POST /api/checkout/verify     [verifies HMAC signature server-side]
      → lib/payments.ts confirmPayment()      [service role: order → paid, enrollment upserted]
  → Razorpay webhook → POST /api/webhooks/razorpay  [independently verifies + calls the same
      confirmPayment(), idempotent — this is the durable source of truth if the browser
      never reaches the verify step]
```

Access is never granted because "the browser said success." Both paths that grant access (`/api/checkout/verify` and the webhook) independently verify a Razorpay HMAC signature before calling `confirmPayment`, and `confirmPayment` itself is idempotent (guards on `status = 'created'` before flipping to `paid`), so duplicate webhook deliveries or a race between the two paths cannot double-process a payment.

## Authorization layers

1. **Middleware** (`src/middleware.ts`) — redirects signed-out users away from `/admin` and `/dashboard`. Fast, but not authoritative.
2. **Page-level guards** (`lib/auth.ts`: `requireUser`, `requireAdmin`) — redirect based on the `profiles.role` column.
3. **Row Level Security** — the real enforcement layer for every table. A signed-in student's own Supabase session simply cannot `SELECT` a locked lesson's `video_id`, insert an enrollment, or read another student's orders — not because the UI hides the button, but because Postgres returns no rows / rejects the write. See DATABASE.md for the full policy set.
4. **Signed URLs for files** — `course-materials` is a private bucket with no public or per-user read policy. The only way to a file is `/api/materials/[id]/download`, which re-checks access via RLS on `lesson_resources` and then mints a 60-second signed URL with the service-role client.

## Server actions vs. API routes

Admin mutations (course/section/lesson/coupon/testimonial/FAQ CRUD) are Next.js **Server Actions** — they run server-side, use the RLS-respecting server client, and are protected by `requireAdmin()`. Payment and webhook endpoints are **Route Handlers** because they need to be called by Razorpay's servers and by `fetch()` from client components with precise control over the response.

## What's intentionally NOT built (V1 scope)

Community/chat/forums, affiliates, subscriptions/memberships, multiple instructors, custom domains/white-labeling, an AI assistant, drip content, gamification, certificates, and mobile apps are all out of scope for V1 per the product spec. Nothing in the architecture blocks adding them later; they simply don't exist yet.
