-- ==================================================================
-- Course display ordering
-- Phase: homepage + admin ordering control.
-- Adds an explicit `display_order` column to support deterministic
-- ordering in listings. Existing `created_at`/`published_at` behavior is
-- preserved through backfill so existing rows keep their relative order.
-- ==================================================================

alter table public.courses
  add column if not exists display_order integer;

with ranked_courses as (
  select
    id,
    row_number() over (
      order by
        published_at desc nulls last,
        created_at desc
    ) as calculated_display_order
  from public.courses
)
update public.courses as c
set display_order = ranked_courses.calculated_display_order
from ranked_courses
where ranked_courses.id = c.id;

alter table public.courses
  alter column display_order set default 0,
  alter column display_order set not null;

create index if not exists courses_display_order_idx on public.courses (display_order);
