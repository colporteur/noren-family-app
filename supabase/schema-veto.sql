-- =========================================================================
-- The Noren Family App — Board Game Veto schema (additive)
-- =========================================================================
-- Run this in Supabase → SQL Editor → New Query → paste → Run.
-- Idempotent: safe to re-run.
-- =========================================================================

-- 1) App-wide settings (singleton row, id always = 1)
create table if not exists public.app_settings (
    id int primary key default 1,
    veto_mode_enabled boolean not null default false,
    max_user_vetoes int not null default 1,
    updated_at timestamptz not null default now(),
    constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.tg_set_updated_at();

-- 2) Dictator master veto list (permanent until removed by a Dictator)
create table if not exists public.master_vetoes (
    game_id uuid primary key references public.board_games(id) on delete cascade,
    reason text,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

-- 3) Per-user session vetoes (cleared by "Select Game and Clear Veto List")
create table if not exists public.user_vetoes (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null references public.board_games(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (game_id, profile_id)
);

-- 4) RLS — readable by all authed users, writeable by appropriate parties

alter table public.app_settings enable row level security;
alter table public.master_vetoes enable row level security;
alter table public.user_vetoes enable row level security;

-- app_settings: everyone reads, only dictators write
drop policy if exists "All authed read app_settings" on public.app_settings;
create policy "All authed read app_settings"
  on public.app_settings for select
  to authenticated
  using (true);

drop policy if exists "Dictators write app_settings" on public.app_settings;
create policy "Dictators write app_settings"
  on public.app_settings for all
  to authenticated
  using (public.is_dictator())
  with check (public.is_dictator());

-- master_vetoes: everyone reads, only dictators write
drop policy if exists "All authed read master_vetoes" on public.master_vetoes;
create policy "All authed read master_vetoes"
  on public.master_vetoes for select
  to authenticated
  using (true);

drop policy if exists "Dictators manage master_vetoes" on public.master_vetoes;
create policy "Dictators manage master_vetoes"
  on public.master_vetoes for all
  to authenticated
  using (public.is_dictator())
  with check (public.is_dictator());

-- user_vetoes: everyone reads (so we can show the group's vetoes); each user
-- writes only their own (dictators can write any)
drop policy if exists "All authed read user_vetoes" on public.user_vetoes;
create policy "All authed read user_vetoes"
  on public.user_vetoes for select
  to authenticated
  using (true);

drop policy if exists "Users manage own vetoes" on public.user_vetoes;
create policy "Users manage own vetoes"
  on public.user_vetoes for all
  to authenticated
  using (auth.uid() = profile_id or public.is_dictator())
  with check (auth.uid() = profile_id or public.is_dictator());
