-- =========================================================================
-- The Noren Family App — NCAA Tournament Pool schema additions
-- =========================================================================
-- Run in Supabase → SQL Editor → New Query → paste → Run.
-- Idempotent: safe to re-run.
--
-- The base table (ncaa_pool_standings) already exists from the initial
-- schema. This file:
--   1. Adds a `ncaa_pool_years` table so each pool year has metadata
--      (final/in-progress, who came first/last, notes).
--   2. Tightens ncaa_pool_standings with a couple of tweaks.
-- =========================================================================

-- 1) One row per pool year
create table if not exists public.ncaa_pool_years (
    pool_year int primary key,                 -- e.g. 2026
    title text,                                -- e.g. "March Madness 2026"
    is_finalized boolean not null default false,
    winner_profile_id uuid references public.profiles(id) on delete set null,
    winner_bracket_name text,                  -- if a non-family entrant won
    loser_profile_id uuid references public.profiles(id) on delete set null,
    loser_bracket_name text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists trg_ncaa_year_updated_at on public.ncaa_pool_years;
create trigger trg_ncaa_year_updated_at
  before update on public.ncaa_pool_years
  for each row execute function public.tg_set_updated_at();

-- 2) Make sure ncaa_pool_standings has what we need (it already does from
--    the initial schema; this is a no-op if already there).
alter table public.ncaa_pool_standings
  add column if not exists pool_year int;

-- 3) RLS for the new table — same permissive read+write as everything else
alter table public.ncaa_pool_years enable row level security;

drop policy if exists "Authed read ncaa_pool_years" on public.ncaa_pool_years;
create policy "Authed read ncaa_pool_years"
  on public.ncaa_pool_years for select to authenticated using (true);

drop policy if exists "Authed write ncaa_pool_years" on public.ncaa_pool_years;
create policy "Authed write ncaa_pool_years"
  on public.ncaa_pool_years for all to authenticated
  using (true) with check (true);
