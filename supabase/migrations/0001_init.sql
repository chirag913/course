-- ============================================================================
-- Course Platform V1 — initial schema
-- Tables, indexes, triggers, helper functions, and Row Level Security.
-- See /DATABASE.md for the human-readable schema documentation.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'student');
create type public.course_status as enum ('draft', 'published');
create type public.lesson_type as enum ('video', 'text', 'resource', 'mixed');
create type public.video_provider as enum ('youtube');
create type public.order_status as enum ('created', 'paid', 'failed', 'refunded');
create type public.discount_type as enum ('percentage', 'fixed');

-- ----------------------------------------------------------------------------
-- updated_at helper trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles — one row per auth.users, created automatically on signup
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- courses
-- ----------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  description text,
  thumbnail_url text,
  price integer not null default 0, -- in paise (INR minor unit)
  currency text not null default 'INR',
  status public.course_status not null default 'draft',
  what_you_will_learn jsonb not null default '[]'::jsonb, -- string[]
  instructor_name text,
  instructor_bio text,
  instructor_avatar_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint courses_price_nonnegative check (price >= 0)
);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create index courses_status_idx on public.courses (status);

-- ----------------------------------------------------------------------------
-- course_sections
-- ----------------------------------------------------------------------------
create table public.course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger course_sections_set_updated_at
  before update on public.course_sections
  for each row execute function public.set_updated_at();

create index course_sections_course_id_idx on public.course_sections (course_id, position);

-- ----------------------------------------------------------------------------
-- lessons
-- ----------------------------------------------------------------------------
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_section_id uuid not null references public.course_sections (id) on delete cascade,
  title text not null,
  description text,
  lesson_type public.lesson_type not null default 'video',
  video_provider public.video_provider,
  video_id text,
  duration_seconds integer not null default 0,
  content text, -- rich text HTML for text/mixed lessons
  position integer not null default 0,
  is_published boolean not null default true,
  is_free_preview boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_duration_nonnegative check (duration_seconds >= 0)
);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

create index lessons_section_id_idx on public.lessons (course_section_id, position);

-- ----------------------------------------------------------------------------
-- lesson_resources — downloadable files (Supabase Storage: course-materials bucket)
-- ----------------------------------------------------------------------------
create table public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  name text not null,
  file_path text not null, -- path within the course-materials storage bucket
  file_type text,
  file_size integer,
  description text,
  created_at timestamptz not null default now()
);

create index lesson_resources_lesson_id_idx on public.lesson_resources (lesson_id);

-- ----------------------------------------------------------------------------
-- coupons
-- ----------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type public.discount_type not null,
  discount_value integer not null, -- percentage (1-100) or fixed paise amount
  max_uses integer, -- null = unlimited
  used_count integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_discount_value_positive check (discount_value > 0)
);

create trigger coupons_set_updated_at
  before update on public.coupons
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- orders — one row per checkout attempt
-- ----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  amount integer not null, -- final amount charged, in paise
  currency text not null default 'INR',
  status public.order_status not null default 'created',
  coupon_id uuid references public.coupons (id) on delete set null,
  discount_amount integer not null default 0,
  razorpay_order_id text unique,
  razorpay_payment_id text,
  razorpay_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_amount_nonnegative check (amount >= 0)
);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index orders_user_id_idx on public.orders (user_id);
create index orders_course_id_idx on public.orders (course_id);
create index orders_status_idx on public.orders (status);

-- ----------------------------------------------------------------------------
-- order_items — kept separate from orders for future multi-item carts/bundles
-- ----------------------------------------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  price integer not null,
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);

-- ----------------------------------------------------------------------------
-- coupon_redemptions
-- ----------------------------------------------------------------------------
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coupon_id, order_id)
);

-- ----------------------------------------------------------------------------
-- enrollments — created only by the server (Razorpay webhook) after a
-- verified payment. Never inserted directly from the client.
-- ----------------------------------------------------------------------------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  enrolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create index enrollments_user_id_idx on public.enrollments (user_id);
create index enrollments_course_id_idx on public.enrollments (course_id);

-- ----------------------------------------------------------------------------
-- lesson_progress
-- ----------------------------------------------------------------------------
create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  is_completed boolean not null default false,
  completed_at timestamptz,
  last_position_seconds integer not null default 0,
  last_viewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create trigger lesson_progress_set_updated_at
  before update on public.lesson_progress
  for each row execute function public.set_updated_at();

create index lesson_progress_user_course_idx on public.lesson_progress (user_id, course_id);
create index lesson_progress_lesson_id_idx on public.lesson_progress (lesson_id);

-- ----------------------------------------------------------------------------
-- testimonials
-- ----------------------------------------------------------------------------
create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_name text not null,
  student_avatar_url text,
  content text not null,
  rating smallint not null default 5,
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  constraint testimonials_rating_range check (rating between 1 and 5)
);

create index testimonials_course_id_idx on public.testimonials (course_id, position);

-- ----------------------------------------------------------------------------
-- faqs
-- ----------------------------------------------------------------------------
create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  question text not null,
  answer text not null,
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index faqs_course_id_idx on public.faqs (course_id, position);

-- ============================================================================
-- HELPER FUNCTIONS (security definer — bypass RLS for internal checks only)
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_enrolled(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.enrollments
    where user_id = auth.uid() and course_id = p_course_id
  );
$$;

create or replace function public.lesson_course_id(p_lesson_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select cs.course_id
  from public.lessons l
  join public.course_sections cs on cs.id = l.course_section_id
  where l.id = p_lesson_id;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_sections enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_resources enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.testimonials enable row level security;
alter table public.faqs enable row level security;

-- profiles ---------------------------------------------------------------
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- courses ------------------------------------------------------------------
create policy "courses_select_published_or_admin"
  on public.courses for select
  using (status = 'published' or public.is_admin());

create policy "courses_insert_admin"
  on public.courses for insert
  with check (public.is_admin());

create policy "courses_update_admin"
  on public.courses for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "courses_delete_admin"
  on public.courses for delete
  using (public.is_admin());

-- course_sections ------------------------------------------------------------
create policy "sections_select_published_or_admin"
  on public.course_sections for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.courses c
      where c.id = course_id and c.status = 'published'
    )
  );

create policy "sections_write_admin"
  on public.course_sections for all
  using (public.is_admin())
  with check (public.is_admin());

-- lessons --------------------------------------------------------------------
-- Full row (including video_id/content) is only readable by admins, enrolled
-- students, or anyone for a free-preview lesson on a published course.
-- The public sales page instead reads from the `public_curriculum` view below,
-- which never exposes video_id/content for locked lessons.
create policy "lessons_select_accessible"
  on public.lessons for select
  using (
    public.is_admin()
    or (
      is_free_preview
      and exists (
        select 1 from public.course_sections cs
        join public.courses c on c.id = cs.course_id
        where cs.id = course_section_id and c.status = 'published'
      )
    )
    or public.is_enrolled(public.lesson_course_id(id))
  );

create policy "lessons_write_admin"
  on public.lessons for all
  using (public.is_admin())
  with check (public.is_admin());

-- lesson_resources -------------------------------------------------------------
create policy "resources_select_accessible"
  on public.lesson_resources for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.lessons l
      where l.id = lesson_id
        and (
          (l.is_free_preview and exists (
            select 1 from public.course_sections cs
            join public.courses c on c.id = cs.course_id
            where cs.id = l.course_section_id and c.status = 'published'
          ))
          or public.is_enrolled(public.lesson_course_id(l.id))
        )
    )
  );

create policy "resources_write_admin"
  on public.lesson_resources for all
  using (public.is_admin())
  with check (public.is_admin());

-- coupons ----------------------------------------------------------------------
-- Never selectable by regular clients; validated only through the server-side
-- checkout API route using the service-role key.
create policy "coupons_admin_only"
  on public.coupons for all
  using (public.is_admin())
  with check (public.is_admin());

-- orders -------------------------------------------------------------------------
create policy "orders_select_own_or_admin"
  on public.orders for select
  using (user_id = auth.uid() or public.is_admin());

-- Students may create their own pending order (status defaults to 'created').
-- Only the service role (webhook) may transition status to paid/failed/refunded.
create policy "orders_insert_own_pending"
  on public.orders for insert
  with check (user_id = auth.uid() and status = 'created');

create policy "orders_update_admin"
  on public.orders for update
  using (public.is_admin())
  with check (public.is_admin());

-- order_items ----------------------------------------------------------------------
create policy "order_items_select_own_or_admin"
  on public.order_items for select
  using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

create policy "order_items_write_admin"
  on public.order_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- coupon_redemptions -----------------------------------------------------------------
create policy "coupon_redemptions_admin_only"
  on public.coupon_redemptions for all
  using (public.is_admin())
  with check (public.is_admin());

-- enrollments ------------------------------------------------------------------------
create policy "enrollments_select_own_or_admin"
  on public.enrollments for select
  using (user_id = auth.uid() or public.is_admin());

-- No insert/update/delete policy for regular users: enrollments are created
-- exclusively by the Razorpay webhook route using the service-role key,
-- which bypasses RLS entirely.
create policy "enrollments_admin_manage"
  on public.enrollments for all
  using (public.is_admin())
  with check (public.is_admin());

-- lesson_progress --------------------------------------------------------------------
create policy "progress_select_own_or_admin"
  on public.lesson_progress for select
  using (user_id = auth.uid() or public.is_admin());

create policy "progress_insert_own_if_enrolled"
  on public.lesson_progress for insert
  with check (user_id = auth.uid() and public.is_enrolled(course_id));

create policy "progress_update_own"
  on public.lesson_progress for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- testimonials -----------------------------------------------------------------------
create policy "testimonials_select_published_or_admin"
  on public.testimonials for select
  using (is_published or public.is_admin());

create policy "testimonials_write_admin"
  on public.testimonials for all
  using (public.is_admin())
  with check (public.is_admin());

-- faqs -----------------------------------------------------------------------
create policy "faqs_select_published_or_admin"
  on public.faqs for select
  using (is_published or public.is_admin());

create policy "faqs_write_admin"
  on public.faqs for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- PUBLIC CURRICULUM VIEW
-- Exposes only safe columns for every lesson of a published course, so a
-- sales page can render the full curriculum (titles/durations) without
-- leaking video IDs or rich content for lessons the visitor cannot access.
-- Created by the migration-running role (table owner), so it bypasses the
-- restrictive `lessons` RLS policy above by design — this is the one
-- intentional exception, and it is limited to five harmless columns.
-- ============================================================================
create view public.public_curriculum
with (security_invoker = false) as
select
  l.id,
  l.course_section_id,
  cs.course_id,
  l.title,
  l.lesson_type,
  l.duration_seconds,
  l.position,
  l.is_free_preview
from public.lessons l
join public.course_sections cs on cs.id = l.course_section_id
join public.courses c on c.id = cs.course_id
where c.status = 'published' and l.is_published;

grant select on public.public_curriculum to anon, authenticated;

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('course-thumbnails', 'course-thumbnails', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('course-materials', 'course-materials', false)
on conflict (id) do nothing;

-- Thumbnails: public read, admin write.
create policy "thumbnails_public_read"
  on storage.objects for select
  using (bucket_id = 'course-thumbnails');

create policy "thumbnails_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'course-thumbnails' and public.is_admin());

create policy "thumbnails_admin_update"
  on storage.objects for update
  using (bucket_id = 'course-thumbnails' and public.is_admin());

create policy "thumbnails_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'course-thumbnails' and public.is_admin());

-- Materials: private. Admin can manage; reads always go through the signed-URL
-- API route (service role), never direct client access, so no student SELECT
-- policy is defined here.
create policy "materials_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'course-materials' and public.is_admin());

create policy "materials_admin_select"
  on storage.objects for select
  using (bucket_id = 'course-materials' and public.is_admin());

create policy "materials_admin_update"
  on storage.objects for update
  using (bucket_id = 'course-materials' and public.is_admin());

create policy "materials_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'course-materials' and public.is_admin());
