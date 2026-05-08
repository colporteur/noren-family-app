-- =========================================================================
-- The Noren Family App — Announcements (home-page banner) schema
-- =========================================================================
-- Run in Supabase → SQL Editor → New Query → paste → Run.
-- Idempotent: safe to re-run.
-- =========================================================================

-- 1) Announcements: a single source of truth for any banner shown on Home.
create table if not exists public.announcements (
    id uuid primary key default gen_random_uuid(),
    source text not null,                -- 'late_ping', 'manual', etc.
    source_id uuid,                       -- optional FK back to originating record
    sender_id uuid references public.profiles(id) on delete set null,
    emoji text,
    message text not null,
    variant text not null default 'info', -- 'info', 'late', 'early', 'on_time', 'warning', 'success'
    link_path text,                       -- optional path to navigate to when clicked
    expires_at timestamptz,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists announcements_active_idx
  on public.announcements (is_active, created_at desc);

-- 2) Per-user dismissals
create table if not exists public.announcement_dismissals (
    announcement_id uuid not null references public.announcements(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    dismissed_at timestamptz not null default now(),
    primary key (announcement_id, profile_id)
);

-- 3) RLS
alter table public.announcements enable row level security;
alter table public.announcement_dismissals enable row level security;

-- announcements: everyone signed in reads. Anyone can insert (we'll restrict
-- via UI conventions). Senders OR dictators can update is_active (rescind).
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

-- dismissals: each user manages their own; everyone reads (so we know what's hidden)
drop policy if exists "All authed read dismissals" on public.announcement_dismissals;
create policy "All authed read dismissals"
  on public.announcement_dismissals for select to authenticated using (true);

drop policy if exists "Users manage own dismissals" on public.announcement_dismissals;
create policy "Users manage own dismissals"
  on public.announcement_dismissals for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- 4) Trigger: auto-create a banner when a late_ping is inserted, and
--    deactivate any prior active banner from the same person so the home
--    page never piles up duplicates from one user.
create or replace function public.create_announcement_for_late_ping()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_who text;
  v_emoji text;
  v_phrase text;
  v_msg text;
  v_variant text;
begin
  -- Pick a friendly display name for the sender
  select coalesce(nullif(nickname, ''), nullif(first_name, ''), email)
    into v_who
    from public.profiles where id = NEW.profile_id;

  v_emoji := case NEW.direction
    when 'late' then '🐢'
    when 'early' then '🐰'
    else '🕐'
  end;

  v_phrase := case NEW.direction
    when 'late' then format('%s min late', NEW.minutes)
    when 'early' then format('%s min early', NEW.minutes)
    else 'on time'
  end;

  v_variant := NEW.direction;

  v_msg := format(
    '%s is %s%s%s',
    coalesce(v_who, 'Someone'),
    v_phrase,
    case when NEW.event_label is not null then ' for ' || NEW.event_label else '' end,
    case when NEW.note is not null then ' — "' || NEW.note || '"' else '' end
  );

  -- Deactivate any prior active banner from this same user (any source 'late_ping')
  update public.announcements
    set is_active = false
    where source = 'late_ping'
      and sender_id = NEW.profile_id
      and is_active = true;

  -- Insert the new banner
  insert into public.announcements
    (source, source_id, sender_id, emoji, message, variant, link_path, expires_at)
    values
    ('late_ping', NEW.id, NEW.profile_id, v_emoji, v_msg, v_variant, '/apps/late', now() + interval '4 hours');

  return NEW;
end;
$$;

drop trigger if exists trg_late_ping_banner on public.late_pings;
create trigger trg_late_ping_banner
  after insert on public.late_pings
  for each row execute function public.create_announcement_for_late_ping();
