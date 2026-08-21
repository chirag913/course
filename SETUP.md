# Setup

## 1. Install dependencies

```bash
npm install
```

## 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, paste the full contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run it. This creates every table, RLS policy, helper function, the `public_curriculum` view, and the two storage buckets (`course-thumbnails`, `course-materials`).
   - If you'd rather use the CLI: `supabase link --project-ref <ref>` then `supabase db push`.
3. Go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — never commit it, never send it to the browser)

## 3. Create a Razorpay account

1. Sign up at [razorpay.com](https://razorpay.com). Use **Test Mode** while developing.
2. Go to **Settings → API Keys**, generate a key pair:
   - `Key ID` → `NEXT_PUBLIC_RAZORPAY_KEY_ID`
   - `Key Secret` → `RAZORPAY_KEY_SECRET`
3. Go to **Settings → Webhooks**, add a webhook:
   - URL: `https://<your-deployed-domain>/api/webhooks/razorpay` (for local testing, use a tunnel like `ngrok http 3000` and point it at `https://<tunnel>/api/webhooks/razorpay`)
   - Active events: `payment.captured`, `payment.failed`, `refund.processed`
   - Copy the generated **Webhook Secret** → `RAZORPAY_WEBHOOK_SECRET`

## 4. Environment variables

```bash
cp .env.example .env.local
```

Fill in every value from steps 2 and 3, plus `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000` locally).

## 5. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`.

## 6. Create your admin account

There's no UI for granting admin access — this is intentional (no "make me admin" button should exist in a shipped product). Sign up for a normal account through `/signup`, then in the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Reload the app and you'll see `/admin` instead of `/dashboard` in the header.

## 7. Try the full flow

1. As admin: `/admin/courses` → New Course → fill in the Course Information tab, add a thumbnail, add a section, add a lesson with a YouTube **Unlisted** video URL, upload a PDF, mark one lesson as Free Preview, Publish.
2. Open the course's public sales page (top-right "View sales page" button).
3. In an incognito window (or after logging out), sign up as a student and purchase the course using a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-upi-details/) (Test Mode only charges test cards).
4. Confirm the student lands on `/dashboard`, can start the course, watch the video, download the PDF, mark lessons complete, and that progress persists on reload.

## 8. Deploy

1. Push this repository to GitHub.
2. Import it into [Vercel](https://vercel.com).
3. Add all the same environment variables from `.env.local` in the Vercel project settings (**do not** commit `.env.local`).
4. Set `NEXT_PUBLIC_SITE_URL` to your production domain.
5. Update the Razorpay webhook URL to point at the production domain, and update the Supabase Auth **Redirect URLs** (Authentication → URL Configuration) to include `https://<your-domain>/auth/callback`.

## Notes

- Supabase Auth's default email templates work out of the box for signup confirmation and password reset; customize them under **Authentication → Email Templates** if you want your own branding.
- If you disable "Confirm email" in Supabase Auth settings, signup grants an active session immediately (matches the "don't force unnecessary steps before checkout" guidance); if you leave it on, students confirm via email before they can log in.
