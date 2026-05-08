// Pure stats calculations for the Game Record Book.
// No React, no Supabase — easy to reason about and unit-test.

import type { BoardGame, GameSession } from './boardGames';

export interface SessionScore {
  id: string;
  session_id: string;
  profile_id: string | null;
  score: number | null;
  placement: number | null;
  created_at: string;
}

export interface PlayerStats {
  profile_id: string;
  total_plays: number;
  total_wins: number;            // count of rows where placement=1
  win_rate: number;              // wins / plays, 0 if no plays
  games_played: number;          // distinct game_ids
  highest_score: number | null;
  last_played_on: string | null; // YYYY-MM-DD
}

export interface PerGameStats {
  game_id: string;
  total_plays: number;
  last_played_on: string | null;
  winner_counts: Map<string, number>;   // profile_id -> wins
  top_winner_id: string | null;
  highest_score: number | null;
  highest_score_by: string | null;      // profile_id of highest scorer
  biggest_blowout: number | null;       // win-margin (top - 2nd) within a session
}

/* ---------------- Per-player ---------------- */

export function computePlayerStats(
  sessions: GameSession[],
  scores: SessionScore[],
  profileIds: string[],
): PlayerStats[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  return profileIds.map((pid) => {
    const mine = scores.filter((s) => s.profile_id === pid);
    const wins = mine.filter((s) => s.placement === 1).length;
    const games = new Set<string>();
    let highest: number | null = null;
    let last: string | null = null;
    for (const sc of mine) {
      const sess = sessionById.get(sc.session_id);
      if (sess?.game_id) games.add(sess.game_id);
      if (sc.score != null && (highest == null || sc.score > highest)) {
        highest = sc.score;
      }
      if (sess?.played_on && (last == null || sess.played_on > last)) {
        last = sess.played_on;
      }
    }
    return {
      profile_id: pid,
      total_plays: mine.length,
      total_wins: wins,
      win_rate: mine.length === 0 ? 0 : wins / mine.length,
      games_played: games.size,
      highest_score: highest,
      last_played_on: last,
    };
  });
}

/* ---------------- Per-game ---------------- */

export function computeGameStats(
  sessions: GameSession[],
  scores: SessionScore[],
): Map<string, PerGameStats> {
  // Bucket scores by session for placement/score lookups
  const scoresBySession = new Map<string, SessionScore[]>();
  for (const sc of scores) {
    const arr = scoresBySession.get(sc.session_id);
    if (arr) arr.push(sc);
    else scoresBySession.set(sc.session_id, [sc]);
  }

  // Bucket sessions by game
  const sessionsByGame = new Map<string, GameSession[]>();
  for (const sess of sessions) {
    if (!sess.game_id) continue;
    const arr = sessionsByGame.get(sess.game_id);
    if (arr) arr.push(sess);
    else sessionsByGame.set(sess.game_id, [sess]);
  }

  const out = new Map<string, PerGameStats>();
  for (const [gameId, gameSessions] of sessionsByGame) {
    const stats: PerGameStats = {
      game_id: gameId,
      total_plays: gameSessions.length,
      last_played_on: null,
      winner_counts: new Map(),
      top_winner_id: null,
      highest_score: null,
      highest_score_by: null,
      biggest_blowout: null,
    };

    for (const sess of gameSessions) {
      if (sess.played_on && (stats.last_played_on == null || sess.played_on > stats.last_played_on)) {
        stats.last_played_on = sess.played_on;
      }

      const sessScores = scoresBySession.get(sess.id) ?? [];

      // Winners (placement === 1)
      for (const sc of sessScores) {
        if (sc.placement === 1 && sc.profile_id) {
          stats.winner_counts.set(
            sc.profile_id,
            (stats.winner_counts.get(sc.profile_id) ?? 0) + 1,
          );
        }
        // Highest score across all sessions of this game
        if (sc.score != null && sc.profile_id) {
          if (stats.highest_score == null || sc.score > stats.highest_score) {
            stats.highest_score = sc.score;
            stats.highest_score_by = sc.profile_id;
          }
        }
      }

      // Biggest blowout for this session: top - second-best (when ≥2 scores set)
      const numericScores = sessScores
        .map((s) => s.score)
        .filter((n): n is number => n != null)
        .sort((a, b) => b - a);
      if (numericScores.length >= 2) {
        const margin = numericScores[0] - numericScores[1];
        if (stats.biggest_blowout == null || margin > stats.biggest_blowout) {
          stats.biggest_blowout = margin;
        }
      }
    }

    // Top winner
    let topId: string | null = null;
    let topCount = 0;
    for (const [pid, count] of stats.winner_counts) {
      if (count > topCount) {
        topCount = count;
        topId = pid;
      }
    }
    stats.top_winner_id = topId;

    out.set(gameId, stats);
  }
  return out;
}

/* ---------------- Helpers ---------------- */

export function formatPercent(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  return `${Math.round(n * 100)}%`;
}

export function relativeDate(dateStr: string | null, today: Date = new Date()): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const days = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return d.toLocaleDateString();
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function gameNameOrDash(games: BoardGame[], id: string | null | undefined): string {
  if (!id) return '—';
  return games.find((g) => g.id === id)?.name ?? '(deleted game)';
}
