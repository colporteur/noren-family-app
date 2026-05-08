-- =========================================================================
-- The Noren Family App — Supabase schema
-- =========================================================================
-- Run this in: Supabase Dashboard → SQL Editor → New Query → paste → Run
--
-- This file is idempotent: you can re-run it safely.
-- =========================================================================

-- 1) Roles enum
do $$ begin
  create type family_role as enum ('dictator', 'family', 'guest');
exception
  when duplicate_object then null;
end $$;

-- 2) Profiles table — one row per family member, linked to auth.users
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique not null,
    first_name text,
    last_name text,
    nickname text,
    role family_role not null default 'family',
    -- "Deceased" support — graceful, non-destructive
    is_deceased boolean not null default false,
    deceased_on date,
    -- Guest support — temp accounts auto-expire
    guest_expires_at timestamptz,
    -- Directory-friendly profile fields (all optional)
    phone text,
    birthday date,
    location text,
    avatar_url text,
    bio text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3) Helpful indexes
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_is_deceased_idx on public.profiles (is_deceased);

-- 4) updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- 5) Auto-create a profile row when someone signs up via Supabase Auth.
--    First user ever becomes a 'dictator' automatically (you).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_role family_role := 'family';
begin
  select count(*) into v_count from public.profiles;
  if v_count = 0 then
    v_role := 'dictator';
  end if;
  insert into public.profiles (id, email, role)
    values (new.id, new.email, v_role)
    on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6) Convenience: helper to check whether the calling user is a dictator.
create or replace function public.is_dictator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'dictator'
  );
$$;

-- 7) Row Level Security
alter table public.profiles enable row level security;

-- Everyone signed in can SEE every profile (it's a family directory after all).
drop policy if exists "Profiles are viewable by signed-in users" on public.profiles;
create policy "Profiles are viewable by signed-in users"
  on public.profiles for select
  to authenticated
  using (true);

-- Each user can update their own profile (but cannot change their own role
-- or deceased status — only dictators can).
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
    and is_deceased = (select is_deceased from public.profiles where id = auth.uid())
  );

-- Dictators can do anything to any profile.
drop policy if exists "Dictators manage profiles" on public.profiles;
create policy "Dictators manage profiles"
  on public.profiles for all
  to authenticated
  using (public.is_dictator())
  with check (public.is_dictator());

-- 8) Mini-app data — placeholder schemas to be expanded in future sessions.
--    We create empty tables now so future sessions have predictable names.
create table if not exists public.nye_questions (
    id uuid primary key default gen_random_uuid(),
    season_year int not null,
    asked_by uuid references public.profiles(id) on delete set null,
    question text not null,
    revealed_answer text,
    answer_revealed_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.nye_predictions (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.nye_questions(id) on delete cascade,
    predictor_id uuid not null references public.profiles(id) on delete cascade,
    prediction text not null,
    is_correct boolean,
    created_at timestamptz not null default now(),
    unique (question_id, predictor_id)
);

create table if not exists public.board_games (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    min_players int,
    max_players int,
    typical_minutes int,
    weight numeric(3,2),       -- BoardGameGeek-style 1.00-5.00 difficulty
    tags text[] default '{}',
    notes text,
    is_owned boolean not null default true,
    added_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
    id uuid primary key default gen_random_uuid(),
    game_id uuid references public.board_games(id) on delete set null,
    played_on date not null default current_date,
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists public.game_session_scores (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.game_sessions(id) on delete cascade,
    profile_id uuid references public.profiles(id) on delete set null,
    score numeric,
    placement int,
    created_at timestamptz not null default now()
);

create table if not exists public.ncaa_pool_standings (
    id uuid primary key default gen_random_uuid(),
    pool_year int not null,
    profile_id uuid references public.profiles(id) on delete set null,
    bracket_name text,
    points int not null default 0,
    rank int,
    notes text,
    updated_at timestamptz not null default now()
);

create table if not exists public.plaques (
    id uuid primary key default gen_random_uuid(),
    plaque_type text not null check (plaque_type in ('ncaa_winner','ncaa_loser','nye_winner','nye_loser','custom')),
    year int not null,
    profile_id uuid references public.profiles(id) on delete set null,
    title text,
    subtitle text,
    photo_url text,
    created_at timestamptz not null default now()
);

create table if not exists public.votes_polls (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    mode text not null default 'single' check (mode in ('single','multi','ranked')),
    created_by uuid references public.profiles(id) on delete set null,
    closes_at timestamptz,
    is_open boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.votes_options (
    id uuid primary key default gen_random_uuid(),
    poll_id uuid not null references public.votes_polls(id) on delete cascade,
    label text not null,
    sort_order int not null default 0
);

create table if not exists public.votes_ballots (
    id uuid primary key default gen_random_uuid(),
    poll_id uuid not null references public.votes_polls(id) on delete cascade,
    option_id uuid not null references public.votes_options(id) on delete cascade,
    voter_id uuid not null references public.profiles(id) on delete cascade,
    rank int,
    created_at timestamptz not null default now(),
    unique (poll_id, voter_id, option_id)
);

-- Meeting Scheduler: proposals → options → responses (per-option).
-- Reworked from the original single-option schema. See schema-meetings.sql.
create table if not exists public.meeting_proposals (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    purpose text,
    mode text not null default 'available' check (mode in ('available','voting','ranked')),
    created_by uuid references public.profiles(id) on delete set null,
    closes_at timestamptz,
    is_open boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.meeting_options (
    id uuid primary key default gen_random_uuid(),
    proposal_id uuid not null references public.meeting_proposals(id) on delete cascade,
    starts_at timestamptz,
    location text,
    label text,
    sort_order int not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists public.meeting_responses (
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

create table if not exists public.late_pings (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    direction text not null check (direction in ('late','early','on_time')),
    minutes int not null default 0,
    note text,
    event_label text,           -- "Sunday dinner", "Mom's birthday party"
    created_at timestamptz not null default now()
);

-- Enable RLS on every mini-app table; default policy = "must be signed in".
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'nye_questions','nye_predictions',
      'board_games','game_sessions','game_session_scores',
      'ncaa_pool_standings','plaques',
      'votes_polls','votes_options','votes_ballots',
      'meeting_proposals','meeting_options','meeting_responses',
      'late_pings'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "Signed-in family can read %1$s" on public.%1$I;$f$, t);
    execute format($f$create policy "Signed-in family can read %1$s" on public.%1$I for select to authenticated using (true);$f$, t);
    execute format($f$drop policy if exists "Signed-in family can write %1$s" on public.%1$I;$f$, t);
    execute format($f$create policy "Signed-in family can write %1$s" on public.%1$I for all to authenticated using (true) with check (true);$f$, t);
  end loop;
end $$;

-- =========================================================================
-- 9) Board Game Veto system
--    See also supabase/schema-veto.sql for the standalone copy.
-- =========================================================================

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

create table if not exists public.master_vetoes (
    game_id uuid primary key references public.board_games(id) on delete cascade,
    reason text,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.user_vetoes (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null references public.board_games(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (game_id, profile_id)
);

alter table public.app_settings enable row level security;
alter table public.master_vetoes enable row level security;
alter table public.user_vetoes enable row level security;

drop policy if exists "All authed read app_settings" on public.app_settings;
create policy "All authed read app_settings"
  on public.app_settings for select to authenticated using (true);

drop policy if exists "Dictators write app_settings" on public.app_settings;
create policy "Dictators write app_settings"
  on public.app_settings for all to authenticated
  using (public.is_dictator()) with check (public.is_dictator());

drop policy if exists "All authed read master_vetoes" on public.master_vetoes;
create policy "All authed read master_vetoes"
  on public.master_vetoes for select to authenticated using (true);

drop policy if exists "Dictators manage master_vetoes" on public.master_vetoes;
create policy "Dictators manage master_vetoes"
  on public.master_vetoes for all to authenticated
  using (public.is_dictator()) with check (public.is_dictator());

drop policy if exists "All authed read user_vetoes" on public.user_vetoes;
create policy "All authed read user_vetoes"
  on public.user_vetoes for select to authenticated using (true);

drop policy if exists "Users manage own vetoes" on public.user_vetoes;
create policy "Users manage own vetoes"
  on public.user_vetoes for all to authenticated
  using (auth.uid() = profile_id or public.is_dictator())
  with check (auth.uid() = profile_id or public.is_dictator());

-- =========================================================================
-- 10) Central Location Estimator
--     See also supabase/schema-central-location.sql
-- =========================================================================

create table if not exists public.central_location_queries (
    id uuid primary key default gen_random_uuid(),
    requested_by uuid references public.profiles(id) on delete set null,
    title text,
    locations_in jsonb not null,
    context text,
    result jsonb not null,
    created_at timestamptz not null default now()
);

alter table public.central_location_queries enable row level security;

drop policy if exists "All authed read central_location_queries" on public.central_location_queries;
create policy "All authed read central_location_queries"
  on public.central_location_queries for select to authenticated using (true);

drop policy if exists "All authed write central_location_queries" on public.central_location_queries;
create policy "All authed write central_location_queries"
  on public.central_location_queries for all to authenticated
  using (true) with check (true);

-- =========================================================================
-- 11) Announcements (home-page banner system)
--     See also supabase/schema-announcements.sql
-- =========================================================================

create table if not exists public.announcements (
    id uuid primary key default gen_random_uuid(),
    source text not null,
    source_id uuid,
    sender_id uuid references public.profiles(id) on delete set null,
    emoji text,
    message text not null,
    variant text not null default 'info',
    link_path text,
    expires_at timestamptz,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists announcements_active_idx
  on public.announcements (is_active, created_at desc);

create table if not exists public.announcement_dismissals (
    announcement_id uuid not null references public.announcements(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    dismissed_at timestamptz not null default now(),
    primary key (announcement_id, profile_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_dismissals enable row level security;

drop policy if exists "All authed read announcements" on public.announcements;
create policy "All authed read announcements"
  on public.announcements for select to authenticated using (true);

drop policy if exists "Authed can insert announcements" on public.announcements;
create policy "Authed can insert announcements"
  on public.announcements for insert to authenticated with check (true);

drop policy if exists "Sender or dictator can update announcements" on public.announcements;
create policy "Sender or dictator can update announcements"
  on public.announcements for update to authenticated
  using (sender_id = auth.uid() or public.is_dictator())
  with check (sender_id = auth.uid() or public.is_dictator());

drop policy if exists "Sender or dictator can delete announcements" on public.announcements;
create policy "Sender or dictator can delete announcements"
  on public.announcements for delete to authenticated
  using (sender_id = auth.uid() or public.is_dictator());

drop policy if exists "All authed read dismissals" on public.announcement_dismissals;
create policy "All authed read dismissals"
  on public.announcement_dismissals for select to authenticated using (true);

drop policy if exists "Users manage own dismissals" on public.announcement_dismissals;
create policy "Users manage own dismissals"
  on public.announcement_dismissals for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create or replace function public.create_announcement_for_late_ping()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_who text;
  v_emoji text;
  v_phrase text;
  v_msg text;
begin
  select coalesce(nullif(nickname, ''), nullif(first_name, ''), email)
    into v_who from public.profiles where id = NEW.profile_id;

  v_emoji := case NEW.direction when 'late' then '🐢' when 'early' then '🐰' else '🕐' end;
  v_phrase := case NEW.direction
    when 'late' then format('%s min late', NEW.minutes)
    when 'early' then format('%s min early', NEW.minutes)
    else 'on time' end;

  v_msg := format('%s is %s%s%s',
    coalesce(v_who, 'Someone'), v_phrase,
    case when NEW.event_label is not null then ' for ' || NEW.event_label else '' end,
    case when NEW.note is not null then ' — "' || NEW.note || '"' else '' end);

  update public.announcements set is_active = false
    where source = 'late_ping' and sender_id = NEW.profile_id and is_active = true;

  insert into public.announcements
    (source, source_id, sender_id, emoji, message, variant, link_path, expires_at)
    values ('late_ping', NEW.id, NEW.profile_id, v_emoji, v_msg, NEW.direction, '/apps/late', now() + interval '4 hours');

  return NEW;
end; $$;

drop trigger if exists trg_late_ping_banner on public.late_pings;
create trigger trg_late_ping_banner
  after insert on public.late_pings
  for each row execute function public.create_announcement_for_late_ping();

-- =========================================================================
-- 12) Voting Portal additions (column on existing votes_polls)
--     See also supabase/schema-voting.sql
-- =========================================================================

alter table public.votes_polls
  add column if not exists hide_results_until_close boolean not null default false;

-- =========================================================================
-- Bootstrapping note:
--   The very first user who signs in will automatically be made a 'dictator'.
--   To promote a second dictator, run from SQL Editor:
--
--     update public.profiles set role = 'dictator'
--     where email = 'mom@example.com';
--
--   To mark someone deceased gracefully:
--
--     update public.profiles
--     set is_deceased = true, deceased_on = '2027-04-10'
--     where email = 'uncle@example.com';
--
--   Their account is preserved, their entries stay in records, and the UI
--   will show a memorial badge instead of treating them as an active user.
-- =========================================================================
