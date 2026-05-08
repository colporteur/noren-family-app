-- =========================================================================
-- The Noren Family App — Voting Portal additions
-- =========================================================================
-- Run in Supabase → SQL Editor → New Query → paste → Run.
-- Idempotent: safe to re-run.
--
-- The base tables (votes_polls, votes_options, votes_ballots) already exist
-- from the initial schema. This file adds the small extra column we need.
-- =========================================================================

alter table public.votes_polls
  add column if not exists hide_results_until_close boolean not null default false;
