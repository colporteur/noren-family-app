// Pure logic + types for the NCAA Tournament Pool.

export interface NcaaPoolYear {
  pool_year: number;
  title: string | null;
  is_finalized: boolean;
  winner_profile_id: string | null;
  winner_bracket_name: string | null;
  loser_profile_id: string | null;
  loser_bracket_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NcaaStanding {
  id: string;
  pool_year: number | null;
  profile_id: string | null;
  bracket_name: string | null;     // for non-family entrants or alt-name brackets
  points: number;
  rank: number | null;
  notes: string | null;
  updated_at: string;
}

/* ---------------- Sorting + ranking ---------------- */

/**
 * Sort by points desc, then bracket name asc as a stable tiebreaker.
 * Returns a *new* array — does not mutate input.
 */
export function sortByPoints(standings: NcaaStanding[]): NcaaStanding[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const an = (a.bracket_name ?? '').toLowerCase();
    const bn = (b.bracket_name ?? '').toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
}

/**
 * Assigns dense rank (1, 2, 2, 3, …) to standings sorted by points.
 */
export function withDenseRanks(standings: NcaaStanding[]): Array<NcaaStanding & { computed_rank: number }> {
  const sorted = sortByPoints(standings);
  let lastPoints: number | null = null;
  let r = 0;
  return sorted.map((s) => {
    if (lastPoints == null || s.points !== lastPoints) {
      r += 1;
      lastPoints = s.points;
    }
    return { ...s, computed_rank: r };
  });
}

/* ---------------- All-time stats ---------------- */

export interface AllTimeRow {
  /** profile_id if family, otherwise the bracket_name string is the key. */
  key: string;
  is_family: boolean;
  display_name: string;
  total_years_entered: number;
  wins: number;          // years finalized as winner
  losses: number;        // years finalized as loser (last place)
  best_finish: number | null;
  best_points: number;
}

export function computeAllTimeStats(
  years: NcaaPoolYear[],
  standings: NcaaStanding[],
  profilesById: Map<string, { display_name: string }>,
): AllTimeRow[] {
  const ranked = withDenseRanks(standings);
  const byKey = new Map<string, AllTimeRow>();

  for (const s of ranked) {
    const isFamily = !!s.profile_id;
    const key = isFamily ? (s.profile_id as string) : (s.bracket_name ?? '(unnamed)');
    const display =
      isFamily
        ? profilesById.get(s.profile_id as string)?.display_name ?? '(deleted)'
        : (s.bracket_name ?? '(unnamed)');

    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        is_family: isFamily,
        display_name: display,
        total_years_entered: 0,
        wins: 0,
        losses: 0,
        best_finish: null,
        best_points: 0,
      };
      byKey.set(key, row);
    }
    row.total_years_entered += 1;
    if (s.points > row.best_points) row.best_points = s.points;
    if (row.best_finish == null || s.computed_rank < row.best_finish) {
      row.best_finish = s.computed_rank;
    }
  }

  // Wins/losses come from finalized year metadata
  for (const y of years) {
    if (!y.is_finalized) continue;
    const winnerKey = y.winner_profile_id ?? y.winner_bracket_name;
    const loserKey = y.loser_profile_id ?? y.loser_bracket_name;
    if (winnerKey) {
      const r = byKey.get(winnerKey);
      if (r) r.wins += 1;
    }
    if (loserKey) {
      const r = byKey.get(loserKey);
      if (r) r.losses += 1;
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.total_years_entered - a.total_years_entered;
  });
}

/* ---------------- Bulk paste parsing ---------------- */

/**
 * Parses a paste-friendly text block into rows.
 * Accepts these formats per line:
 *   "Mom 142"
 *   "Mom\t142"
 *   "Mom, 142"
 *   "Mom 142 first place"   (extra trailing words become notes)
 * Returns rows with bracket_name and points; the caller can match to profiles.
 */
export interface ParsedPasteRow {
  bracket_name: string;
  points: number;
  notes: string | null;
}

export function parsePastedStandings(text: string): ParsedPasteRow[] {
  const out: ParsedPasteRow[] = [];
  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Find the last numeric token; everything before is name, everything after is notes
    const tokens = line.split(/[\s,\t]+/);
    let pointsIdx = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (/^-?\d+(\.\d+)?$/.test(tokens[i])) {
        pointsIdx = i;
        break;
      }
    }
    if (pointsIdx < 0) continue; // no number, skip
    const name = tokens.slice(0, pointsIdx).join(' ').trim();
    const points = parseFloat(tokens[pointsIdx]);
    const notes = tokens.slice(pointsIdx + 1).join(' ').trim() || null;
    if (!name) continue;
    out.push({ bracket_name: name, points: Math.round(points), notes });
  }
  return out;
}
