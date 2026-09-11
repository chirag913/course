-- ============================================================================
-- Multi-program architecture — Phase 2
-- Dual program_id foundation
-- This migration is additive and preserves the existing course-based flow.
-- Existing `course_id` columns are intentionally retained for backward
-- compatibility.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Add nullable program_id columns (do not make NOT NULL yet).
-- ----------------------------------------------------------------------------
alter table public.orders
  add column if not exists program_id uuid;

alter table public.order_items
  add column if not exists program_id uuid;

alter table public.enrollments
  add column if not exists program_id uuid;

-- ----------------------------------------------------------------------------
-- 2) Backfill from existing course IDs.
-- Phase 1 intentionally re-used existing course UUIDs for `programs.id`, so the
-- mapping is 1:1 for current records.
-- ----------------------------------------------------------------------------
update public.orders
set program_id = course_id
where program_id is null;

update public.order_items
set program_id = course_id
where program_id is null;

update public.enrollments
set program_id = course_id
where program_id is null;

-- ----------------------------------------------------------------------------
-- 3) Add foreign keys to the new generic layer.
-- ----------------------------------------------------------------------------
alter table public.orders
add constraint orders_program_id_fkey
  foreign key (program_id) references public.programs (id) on delete restrict;

alter table public.order_items
  add constraint order_items_program_id_fkey
  foreign key (program_id) references public.programs (id) on delete restrict;

alter table public.enrollments
  add constraint enrollments_program_id_fkey
  foreign key (program_id) references public.programs (id) on delete restrict;

-- ----------------------------------------------------------------------------
-- 4) Indexes for the new relationship field (keeps joins/searches efficient).
-- ----------------------------------------------------------------------------
create index if not exists orders_program_id_idx on public.orders (program_id);
create index if not exists order_items_program_id_idx on public.order_items (program_id);
create index if not exists enrollments_program_id_idx on public.enrollments (program_id);

-- ----------------------------------------------------------------------------
-- 5) Verification queries (run as part of migration review / smoke checks).
-- ---------------------------------------------------------------------------
-- Expected outcomes:
--   - course_id and program_id are aligned 1:1 for existing rows.
--   - there are no rows with null program_id where course_id is present.
-- ----------------------------------------------------------------------------
do $$
declare
  v_courses bigint;
  v_programs bigint;
  v_orders bigint;
  v_order_items bigint;
  v_enrollments bigint;
  v_order_mismatch bigint;
  v_order_item_mismatch bigint;
  v_enrollment_mismatch bigint;
  v_orders_missing_program bigint;
  v_order_items_missing_program bigint;
  v_enrollments_missing_program bigint;
begin
  select count(*) into v_courses from public.courses;
  select count(*) into v_programs from public.programs;
  select count(*) into v_orders from public.orders;
  select count(*) into v_order_items from public.order_items;
  select count(*) into v_enrollments from public.enrollments;

  select count(*) into v_order_mismatch
  from public.orders
  where course_id is distinct from program_id;

  select count(*) into v_order_item_mismatch
  from public.order_items
  where course_id is distinct from program_id;

  select count(*) into v_enrollment_mismatch
  from public.enrollments
  where course_id is distinct from program_id;

  select count(*) into v_orders_missing_program
  from public.orders
  where course_id is not null and program_id is null;

  select count(*) into v_order_items_missing_program
  from public.order_items
  where course_id is not null and program_id is null;

  select count(*) into v_enrollments_missing_program
  from public.enrollments
  where course_id is not null and program_id is null;

  raise notice 'courses=%', v_courses;
  raise notice 'programs=%', v_programs;
  raise notice 'orders=%', v_orders;
  raise notice 'order_items=%', v_order_items;
  raise notice 'enrollments=%', v_enrollments;
  raise notice 'mismatch orders(c_id != p_id)=%', v_order_mismatch;
  raise notice 'mismatch order_items(c_id != p_id)=%', v_order_item_mismatch;
  raise notice 'mismatch enrollments(c_id != p_id)=%', v_enrollment_mismatch;
  raise notice 'missing program_id in orders where course_id present=%', v_orders_missing_program;
  raise notice 'missing program_id in order_items where course_id present=%', v_order_items_missing_program;
  raise notice 'missing program_id in enrollments where course_id present=%', v_enrollments_missing_program;
end $$;
