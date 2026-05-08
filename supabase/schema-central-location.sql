-- =========================================================================
-- The Noren Family App — Central Location Estimator schema (additive)
-- =========================================================================
-- Run in Supabase → SQL Editor → New Query → paste → Run.
-- Idempotent: safe to re-run.
-- =========================================================================

create table if not exists public.central_location_queries (
    id uuid primary key default gen_random_uuid(),
    requested_by uuid references public.profiles(id) on delete set null,
    title text,
    locations_in jsonb not null,    -- [{ name, city }] as submitted
    context text,                   -- optional free-text hint
    result jsonb not null,          -- the structured Claude response
    created_at timestamptz not null default now()
);

alter table public.central_location_queries enable row level security;

drop policy if exists "All authed read central_location_queries" on public.central_location_queries;
create policy "All authed read central_location_queries"
  on public.central_location_queries for select
  to authenticated
  using (true);

drop policy if exists "All authed write central_location_queries" on public.central_location_queries;
create policy "All authed write central_location_queries"
  on public.central_location_queries for all
  to authenticated
  using (true)
  with check (true);
