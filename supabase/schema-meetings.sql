-- =========================================================================
-- The Noren Family App — Meeting Scheduler schema (rework)
-- =========================================================================
-- Run in Supabase → SQL Editor → New Query → paste → Run.
-- Idempotent: safe to re-run.
--
-- The original schema gave each proposal a single date/place and one
-- response per family member. For a real scheduler we need multiple
-- candidate options per proposal and per-option responses, mirroring the
-- voting portal's structure.
--
-- THIS DROPS THE EXISTING meeting_proposals AND meeting_responses TABLES.
-- They've never been written to (mini-app wasn't built), so this is safe.
-- If you've inserted data into them already, copy it out first.
-- =========================================================================

drop table if exists public.meeting_responses cascade;
drop table if exists public.meeting_proposals cascade;

-- 1) Proposals — the meeting concept
create table public.meeting_proposals (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    purpose text,
    mode text not null default 'available' check (mode in ('available','voting','ranked')),
    created_by uuid references public.profiles(id) on delete set null,
    closes_at timestamptz,
    is_open boolean not null default true,
    created_at timestamptz not null default now()
);

-- 2) Options — candidate time/place slots within a proposal
create table public.meeting_options (
    id uuid primary key default gen_random_uuid(),
    proposal_id uuid not null references public.meeting_proposals(id) on delete cascade,
    starts_at timestamptz,
    location text,
    label text,
    sort_order int not null default 0,
    created_at timestamptz not null default now()
);

-- 3) Responses — one row per (option, profile)
create table public.meeting_responses (
    id uuid primary key default gen_random_uuid(),
    option_id uuid not null references public.meeting_options(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    response text check (response in ('yes','no','maybe')),
    rank int,
    note text,
    created_at timestamptz not null default now(),
    unique (option_id, profile_id)
);

create index if not exists meeting_options_proposal_idx
  on public.meeting_options (proposal_id, sort_order);
create index if not exists meeting_responses_option_idx
  on public.meeting_responses (option_id);

-- 4) RLS — permissive for the family
alter table public.meeting_proposals enable row level security;
alter table public.meeting_options enable row level security;
alter table public.meeting_responses enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['meeting_proposals','meeting_options','meeting_responses']) loop
    execute format($f$drop policy if exists "Authed read %1$s" on public.%1$I;$f$, t);
    execute format($f$create policy "Authed read %1$s" on public.%1$I for select to authenticated using (true);$f$, t);
    execute format($f$drop policy if exists "Authed write %1$s" on public.%1$I;$f$, t);
    execute format($f$create policy "Authed write %1$s" on public.%1$I for all to authenticated using (true) with check (true);$f$, t);
  end loop;
end $$;
