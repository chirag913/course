# Database

Schema lives in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — this file explains it. Apply it via `supabase db push` or by pasting it into the Supabase SQL editor (see SETUP.md).

## Tables

| Table | Purpose | Notable columns |
|---|---|---|
| `profiles` | One row per `auth.users`, created automatically by a trigger on signup. | `role` (`admin` \| `student`) |
| `courses` | A sellable course. | `price` (paise), `status` (`draft` \| `published`), `slug` (public URL) |
| `course_sections` | A curriculum section within a course. | `position` (drag-and-drop order) |
| `lessons` | A lesson within a section. | `lesson_type`, `video_provider`/`video_id`, `content` (rich text HTML), `is_free_preview` |
| `lesson_resources` | Downloadable files attached to a lesson. | `file_path` (Storage path, never a public URL) |
| `orders` | One row per checkout attempt. | `status` (`created`→`paid`/`failed`/`refunded`), `razorpay_order_id` (unique) |
| `order_items` | Line items per order. Only one per order in V1; kept separate so bundles/multi-item carts don't require a schema change later. | |
| `coupons` | Discount codes. | `discount_type`, `discount_value`, `max_uses`, `used_count` |
| `coupon_redemptions` | Audit trail of which order used which coupon. | |
| `enrollments` | Grants a student access to a course. **Only ever written by the server** (webhook/verify route using the service-role client). | unique (`user_id`, `course_id`) |
| `lesson_progress` | Per-student, per-lesson progress. | `is_completed`, `last_position_seconds`, `last_viewed_at` |
| `testimonials`, `faqs` | Sales-page content, managed per-course in the admin course builder. | `position`, `is_published` |

All money columns are **integers in paise** (INR minor unit) — `₹4,999` is stored as `499900`. This avoids floating-point rounding in pricing/coupon math (`lib/pricing.ts`).

## The one exposed view: `public_curriculum`

Sales pages need to show every lesson's title/duration for a published course — including lessons a visitor can't yet play — without leaking `video_id` or `content` for locked lessons. Row Level Security is row-level, not column-level, so instead of loosening the `lessons` policy, the migration creates a view that selects only five harmless columns (`title`, `lesson_type`, `duration_seconds`, `position`, `is_free_preview`) for lessons in published courses, owned by the migration role so it bypasses the restrictive `lessons` RLS by design. This is the one intentional RLS exception in the schema, and it's scoped to columns that can't leak anything.

## Row Level Security, table by table

RLS is enabled on every table. The policies (see the migration for exact SQL) boil down to:

- **`profiles`** — read/update your own row; admins read all.
- **`courses`** — anyone reads `published` courses; only admins see drafts or can write.
- **`course_sections` / `lessons`** — readable if the course is published *and* (`is_free_preview` or you're enrolled), or if you're an admin. Writes are admin-only.
- **`lesson_resources`** — same access rule as the lesson they belong to.
- **`coupons`** — no client-side SELECT policy at all. Validated only through the server-side checkout route using the service-role key, so coupon codes can't be enumerated or scraped.
- **`orders`** — read your own; admins read all. You may INSERT your own order in `created` status only — transitioning to `paid`/`failed`/`refunded` requires the service role (i.e., only the webhook/verify path can do it).
- **`enrollments`** — read your own; admins read all. No client INSERT policy — created exclusively server-side after a verified payment.
- **`lesson_progress`** — read/write your own, and only for a course you're enrolled in.
- **`testimonials` / `faqs`** — public reads where `is_published`; admin-only writes.

## Storage buckets

- **`course-thumbnails`** — public bucket. Anyone can read; only admins (checked via the same `is_admin()` function used in table RLS) can write.
- **`course-materials`** — private bucket. Only admins can read/write directly. Students never get a bucket URL — they always go through `/api/materials/[id]/download`, which checks `lesson_resources` RLS for the requesting user and then mints a 60-second signed URL server-side.

## Helper functions

`is_admin()`, `is_enrolled(course_id)`, and `lesson_course_id(lesson_id)` are `security definer` SQL functions used inside RLS policies. They run with the privileges of their owner (bypassing RLS on the tables *they* query, e.g. checking `profiles.role`), which is what avoids infinite-recursion problems you'd otherwise hit writing an RLS policy on `profiles` that itself queries `profiles`.
