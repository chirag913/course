-- ============================================================================
-- Multi-program architecture — Phase 1
-- Introduces `program_types` and `programs` as the generic, extensible
-- entity that will eventually sit above `courses` (and, later, other
-- program types such as mentorships). This migration is purely additive:
-- no existing table is altered, no column is dropped, and no existing
-- row is modified. `courses`, `course_sections`, `lessons`,
-- `lesson_resources`, and `lesson_progress` are untouched — the existing
-- course purchase/learn flow keeps working exactly as before.
--
-- See /DATABASE.md and /ARCHITECTURE.md for the human-readable schema.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- program_types — a text-keyed lookup table, not a Postgres enum, so a new
-- program type (e.g. a future "cohort" type) can be added later with a plain
-- INSERT instead of an ALTER TYPE migration.
-- ----------------------------------------------------------------------------
create table public.program_types (
  id text primary key,
  label text not null
);

insert into public.program_types (id, label) values
  ('course', 'Course'),
  ('mentorship', 'Mentorship')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- programs — the generic, sellable/ownable entity every program type will
-- share (catalog listing + purchase target). `courses` will eventually
-- become a thin extension table keyed by the same id as its `programs` row;
-- this migration only creates and backfills `programs` — it does not yet
-- add a foreign key from `courses.id` to `programs.id` (see note below the
-- backfill for why that is deferred).
-- ----------------------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  type_id text not null references public.program_types (id),
  slug text not null unique,
  title text not null,
  subtitle text,
  description text,
  thumbnail_url text,
  price integer not null default 0, -- in paise (INR minor unit), matching courses.price
  currency text not null default 'INR',
  -- Text + check constraint (not a Postgres enum) to stay consistent with the
  -- program_types design above and keep future status values easy to extend.
  status text not null default 'draft' constraint programs_status_check check (status in ('draft', 'published')),
  what_you_will_learn jsonb not null default '[]'::jsonb, -- string[]
  owner_name text,
  owner_bio text,
  owner_avatar_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint programs_price_nonnegative check (price >= 0)
);

create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

create index programs_type_id_idx on public.programs (type_id);
create index programs_status_idx on public.programs (status);

-- ----------------------------------------------------------------------------
-- Backfill — exactly one `programs` row per existing `courses` row, reusing
-- the course's own id so `programs.id` and `courses.id` refer to the same
-- entity. `on conflict (id) do nothing` makes this safe to re-run. No
-- `courses` row is read destructively or modified by this statement.
-- ----------------------------------------------------------------------------
insert into public.programs (
  id, type_id, slug, title, subtitle, description, thumbnail_url,
  price, currency, status, what_you_will_learn,
  owner_name, owner_bio, owner_avatar_url,
  created_by, created_at, updated_at, published_at
)
select
  c.id, 'course', c.slug, c.title, c.subtitle, c.description, c.thumbnail_url,
  c.price, c.currency, c.status::text, c.what_you_will_learn,
  c.instructor_name, c.instructor_bio, c.instructor_avatar_url,
  c.created_by, c.created_at, c.updated_at, c.published_at
from public.courses c
on conflict (id) do nothing;

-- NOTE — deliberately deferred: a hard `courses.id references programs(id)`
-- foreign key is NOT added in this migration. `admin/courses/actions.ts`
-- (`createCourse`, `duplicateCourse`) currently inserts directly into
-- `courses` without creating a matching `programs` row first; adding that FK
-- now would make every new course creation fail. That app-code path gets
-- updated to write both rows together in the phase that wires courses to
-- programs for real — until then, `courses.id` and `programs.id` are kept in
-- sync only for rows that existed at backfill time, by convention, not by
-- constraint.

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.program_types enable row level security;
alter table public.programs enable row level security;

-- program_types — plain reference data (type id + label), not sensitive.
-- Readable by anyone; only admins can manage the list of types.
create policy "program_types_select_all"
  on public.program_types for select
  using (true);

create policy "program_types_write_admin"
  on public.program_types for all
  using (public.is_admin())
  with check (public.is_admin());

-- programs — same shape as the existing `courses` policies: anyone reads
-- published programs, only admins see drafts or can write.
create policy "programs_select_published_or_admin"
  on public.programs for select
  using (status = 'published' or public.is_admin());

create policy "programs_insert_admin"
  on public.programs for insert
  with check (public.is_admin());

create policy "programs_update_admin"
  on public.programs for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "programs_delete_admin"
  on public.programs for delete
  using (public.is_admin());

-- ============================================================================
-- public_curriculum view — intentionally NOT modified.
-- It still reads `courses.status` directly, and `courses` is untouched by
-- this migration (no columns added, changed, or dropped), so the existing
-- course sales-page/learn experience is unaffected.
-- ============================================================================
