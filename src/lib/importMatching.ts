// Maps freeform suggestions from Claude (game name strings, player name strings)
// to existing rows in the database. Pure functions — no Supabase calls here.

import type { BoardGame } from './boardGames';
import type { Profile } from './types';
import { displayName } from './types';

export interface SuggestedPlayer {
  name: string;
  score?: number;
  placement?: number;
}

export interface SuggestedSession {
  game_name?: string;
  played_on?: string;
  notes?: string;
  players: SuggestedPlayer[];
}

export interface MatchedSessionPlayer {
  raw_name: string;
  profile_id: string | null;     // null if unmatched
  score: number | null;
  placement: number | null;
}

export interface MatchedSession {
  raw: SuggestedSession;
  game_id: string | null;        // null if unmatched
  raw_game_name: string;
  played_on: string;             // YYYY-MM-DD; defaults to today if missing
  notes: string;
  players: MatchedSessionPlayer[];
  warnings: string[];            // human-readable mismatch notes
}

/* ---------------- Game matching ---------------- */

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();

export function matchGame(rawName: string | undefined, games: BoardGame[]): BoardGame | null {
  if (!rawName) return null;
  const target = norm(rawName);
  if (!target) return null;

  // 1) exact match (case- and punctuation-insensitive)
  const exact = games.find((g) => norm(g.name) === target);
  if (exact) return exact;

  // 2) one is a prefix of the other (handles "Catan" vs "Settlers of Catan")
  const prefix = games.find(
    (g) => norm(g.name).startsWith(target) || target.startsWith(norm(g.name)),
  );
  if (prefix) return prefix;

  // 3) substring match
  const sub = games.find(
    (g) => norm(g.name).includes(target) || target.includes(norm(g.name)),
  );
  if (sub) return sub;

  return null;
}

/* ---------------- Player matching ---------------- */

export function matchPlayer(rawName: string, profiles: Profile[]): Profile | null {
  if (!rawName) return null;
  const target = norm(rawName);
  if (!target) return null;

  // Build candidates: each profile has multiple "names" we can try.
  type Cand = { profile: Profile; key: string };
  const candidates: Cand[] = [];
  for (const p of profiles) {
    if (p.first_name) candidates.push({ profile: p, key: norm(p.first_name) });
    if (p.last_name) candidates.push({ profile: p, key: norm(p.last_name) });
    if (p.nickname) candidates.push({ profile: p, key: norm(p.nickname) });
    if (p.first_name && p.last_name)
      candidates.push({ profile: p, key: norm(p.first_name + p.last_name) });
    candidates.push({ profile: p, key: norm(displayName(p)) });
  }

  // 1) exact match
  for (const c of candidates) if (c.key === target) return c.profile;

  // 2) starts-with
  for (const c of candidates) if (c.key.startsWith(target) || target.startsWith(c.key)) return c.profile;

  // 3) substring
  for (const c of candidates) if (c.key.includes(target) || target.includes(c.key)) return c.profile;

  return null;
}

/* ---------------- Suggestion → matched session ---------------- */

export function matchSession(
  s: SuggestedSession,
  games: BoardGame[],
  profiles: Profile[],
): MatchedSession {
  const warnings: string[] = [];
  const matchedGame = matchGame(s.game_name, games);
  if (s.game_name && !matchedGame) {
    warnings.push(`No game matched "${s.game_name}". Pick one or leave blank.`);
  }

  const players: MatchedSessionPlayer[] = (s.players ?? []).map((p) => {
    const matched = matchPlayer(p.name, profiles);
    if (!matched) warnings.push(`No family member matched "${p.name}".`);
    return {
      raw_name: p.name,
      profile_id: matched?.id ?? null,
      score: typeof p.score === 'number' && Number.isFinite(p.score) ? p.score : null,
      placement:
        typeof p.placement === 'number' && Number.isFinite(p.placement) && p.placement > 0
          ? Math.floor(p.placement)
          : null,
    };
  });

  // Default played_on to today if Claude didn't supply a date.
  const playedOn = (() => {
    if (typeof s.played_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.played_on)) {
      return s.played_on;
    }
    if (s.played_on) warnings.push(`Couldn't parse date "${s.played_on}". Defaulting to today.`);
    return new Date().toISOString().slice(0, 10);
  })();

  return {
    raw: s,
    game_id: matchedGame?.id ?? null,
    raw_game_name: s.game_name ?? '',
    played_on: playedOn,
    notes: s.notes ?? '',
    players,
    warnings,
  };
}
