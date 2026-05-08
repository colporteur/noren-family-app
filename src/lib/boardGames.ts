// Pure logic for picking a board game.
// Kept separate from React/Supabase code so it's easy to unit-test
// and reason about. No side effects in here.

export interface BoardGame {
  id: string;
  name: string;
  min_players: number | null;
  max_players: number | null;
  typical_minutes: number | null;
  weight: number | null;          // BGG-style 1.00 (light) - 5.00 (heavy)
  tags: string[];
  notes: string | null;
  is_owned: boolean;
  added_by: string | null;
  created_at: string;
}

export interface GameSession {
  id: string;
  game_id: string | null;
  played_on: string;              // YYYY-MM-DD
  notes: string | null;
  created_at: string;
}

/* ---------------- Veto types ---------------- */

export interface AppSettings {
  id: number;
  veto_mode_enabled: boolean;
  max_user_vetoes: number;
  updated_at: string;
}

export interface MasterVeto {
  game_id: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface UserVeto {
  id: string;
  game_id: string;
  profile_id: string;
  created_at: string;
}

/**
 * The set of game IDs that should be excluded from any pick when veto mode
 * is on. Combines the master list and every family member's user vetoes.
 * Returns an empty set when veto mode is off.
 */
export function buildVetoedSet(
  settings: AppSettings | null,
  masterVetoes: MasterVeto[],
  userVetoes: UserVeto[],
): Set<string> {
  if (!settings?.veto_mode_enabled) return new Set();
  const out = new Set<string>();
  for (const m of masterVetoes) out.add(m.game_id);
  for (const u of userVetoes) out.add(u.game_id);
  return out;
}

export interface PickFilters {
  /** Number of people who'll play. Filters out games whose min/max range doesn't include it. */
  playerCount?: number;
  /** Cap on minutes. Games above this (or with no time set) are excluded. */
  maxMinutes?: number;
  /** Inclusive upper bound on BGG weight. Games above this are excluded. */
  maxWeight?: number;
  /** If set, only games whose tags include ALL of these are kept. */
  requiredTags?: string[];
  /** If true, exclude games marked as not owned. */
  ownedOnly?: boolean;
  /** Game IDs that are vetoed (master list + user lists, combined). Excluded from picks. */
  vetoedIds?: Set<string>;
}

/* ---------------- Filtering ---------------- */

export function applyFilters(games: BoardGame[], f: PickFilters): BoardGame[] {
  return games.filter((g) => {
    if (f.vetoedIds && f.vetoedIds.has(g.id)) return false;
    if (f.ownedOnly && !g.is_owned) return false;

    if (f.playerCount != null) {
      const min = g.min_players ?? 1;
      const max = g.max_players ?? 99;
      if (f.playerCount < min || f.playerCount > max) return false;
    }

    if (f.maxMinutes != null) {
      // If a game has no recorded time, treat it as "we don't know" and EXCLUDE
      // when a max is set — better to surprise the user with games we know fit.
      if (g.typical_minutes == null) return false;
      if (g.typical_minutes > f.maxMinutes) return false;
    }

    if (f.maxWeight != null) {
      if (g.weight != null && g.weight > f.maxWeight) return false;
    }

    if (f.requiredTags && f.requiredTags.length > 0) {
      for (const t of f.requiredTags) {
        if (!g.tags.includes(t)) return false;
      }
    }

    return true;
  });
}

/* ---------------- Pick modes ---------------- */

/** Pure-uniform random pick. Returns null if the pool is empty. */
export function pickRandom(games: BoardGame[]): BoardGame | null {
  if (games.length === 0) return null;
  return games[Math.floor(Math.random() * games.length)];
}

/**
 * "Surprise but fair": each game's weight grows with how long since it was last
 * played. A game never played gets the highest weight. The freshly-played one
 * is least likely to come up again.
 *
 * Implementation: weight = days-since-last-played, with a floor of 1 and an
 * unplayed bonus equal to (oldest known game + 30) days, so unplayed games
 * always beat played games but don't dwarf them by 1000x.
 */
export function pickWeightedByRecency(
  games: BoardGame[],
  sessions: GameSession[],
  today: Date = new Date(),
): BoardGame | null {
  if (games.length === 0) return null;

  // Build a map of game_id -> most recent played_on (Date)
  const lastPlayed = new Map<string, Date>();
  for (const s of sessions) {
    if (!s.game_id) continue;
    const d = new Date(s.played_on + 'T00:00:00');
    const prev = lastPlayed.get(s.game_id);
    if (!prev || d > prev) lastPlayed.set(s.game_id, d);
  }

  // Days-since-last-played for each game (Infinity if never played)
  const daysSince = games.map((g) => {
    const last = lastPlayed.get(g.id);
    if (!last) return Infinity;
    const ms = today.getTime() - last.getTime();
    return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)));
  });

  // Convert Infinity to a finite "unplayed bonus": oldest played + 30
  const finiteMax = daysSince.filter((d) => Number.isFinite(d)).reduce((a, b) => Math.max(a, b), 0);
  const unplayedWeight = finiteMax + 30;
  const weights = daysSince.map((d) => (Number.isFinite(d) ? d : unplayedWeight));

  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pickRandom(games);

  let r = Math.random() * total;
  for (let i = 0; i < games.length; i++) {
    r -= weights[i];
    if (r <= 0) return games[i];
  }
  return games[games.length - 1];
}

/* ---------------- Helpers ---------------- */

export function summarizePlayers(g: BoardGame): string {
  if (g.min_players == null && g.max_players == null) return '? players';
  if (g.min_players === g.max_players) return `${g.min_players} players`;
  if (g.min_players == null) return `up to ${g.max_players}`;
  if (g.max_players == null) return `${g.min_players}+`;
  return `${g.min_players}–${g.max_players} players`;
}

export function summarizeTime(g: BoardGame): string {
  return g.typical_minutes != null ? `~${g.typical_minutes} min` : '? min';
}

export function summarizeWeight(w: number | null): string {
  if (w == null) return '';
  if (w < 1.5) return 'Light';
  if (w < 2.5) return 'Medium-light';
  if (w < 3.5) return 'Medium';
  if (w < 4.5) return 'Medium-heavy';
  return 'Heavy';
}

/** Days since a game was last played (Infinity if never). */
export function daysSincePlayed(
  gameId: string,
  sessions: GameSession[],
  today: Date = new Date(),
): number {
  let last: Date | null = null;
  for (const s of sessions) {
    if (s.game_id !== gameId) continue;
    const d = new Date(s.played_on + 'T00:00:00');
    if (!last || d > last) last = d;
  }
  if (!last) return Infinity;
  return Math.max(0, Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)));
}
