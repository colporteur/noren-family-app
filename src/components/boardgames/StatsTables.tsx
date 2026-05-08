import { useMemo, useState } from 'react';
import type { BoardGame, GameSession } from '../../lib/boardGames';
import type { SessionScore } from '../../lib/gameStats';
import {
  computePlayerStats,
  computeGameStats,
  formatPercent,
  relativeDate,
} from '../../lib/gameStats';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

/* ---------------- Player Stats ---------------- */

type PlayerSortKey = 'wins' | 'plays' | 'win_rate' | 'name' | 'recent';

export function PlayerStatsTable({
  sessions,
  scores,
  profiles,
}: {
  sessions: GameSession[];
  scores: SessionScore[];
  profiles: Profile[];
}) {
  const [sortKey, setSortKey] = useState<PlayerSortKey>('wins');
  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const stats = useMemo(
    () => computePlayerStats(sessions, scores, profiles.map((p) => p.id)),
    [sessions, scores, profiles],
  );

  const sorted = useMemo(() => {
    const out = [...stats];
    out.sort((a, b) => {
      switch (sortKey) {
        case 'plays':
          return b.total_plays - a.total_plays;
        case 'win_rate':
          if (a.total_plays === 0 && b.total_plays > 0) return 1;
          if (b.total_plays === 0 && a.total_plays > 0) return -1;
          return b.win_rate - a.win_rate;
        case 'name': {
          const an = displayName(profileById.get(a.profile_id) ?? ({} as Profile));
          const bn = displayName(profileById.get(b.profile_id) ?? ({} as Profile));
          return an.localeCompare(bn);
        }
        case 'recent': {
          const ad = a.last_played_on ?? '';
          const bd = b.last_played_on ?? '';
          return ad > bd ? -1 : ad < bd ? 1 : 0;
        }
        case 'wins':
        default:
          return b.total_wins - a.total_wins;
      }
    });
    return out;
  }, [stats, sortKey, profileById]);

  if (profiles.length === 0) {
    return (
      <div className="card text-center text-slate-500">
        No active family members on file yet.
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-primary-100">
            <Th k="name" current={sortKey} onClick={setSortKey}>Player</Th>
            <Th k="plays" current={sortKey} onClick={setSortKey} right>Plays</Th>
            <Th k="wins" current={sortKey} onClick={setSortKey} right>Wins</Th>
            <Th k="win_rate" current={sortKey} onClick={setSortKey} right>Win rate</Th>
            <th className="py-2 pr-3 text-right">Games</th>
            <Th k="recent" current={sortKey} onClick={setSortKey} right>Last played</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, idx) => {
            const p = profileById.get(s.profile_id);
            const isLeader = idx === 0 && sortKey === 'wins' && s.total_wins > 0;
            return (
              <tr key={s.profile_id} className="border-b border-primary-50 last:border-b-0">
                <td className="py-2 pr-3 font-medium text-primary-900">
                  {isLeader && '👑 '}
                  {p ? displayName(p) : '(deleted)'}
                </td>
                <td className="py-2 pr-3 text-right">{s.total_plays}</td>
                <td className="py-2 pr-3 text-right font-semibold">{s.total_wins}</td>
                <td className="py-2 pr-3 text-right">{formatPercent(s.win_rate)}</td>
                <td className="py-2 pr-3 text-right">{s.games_played}</td>
                <td className="py-2 pr-3 text-right text-slate-500">
                  {relativeDate(s.last_played_on)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-400 mt-3">
        Click a column to sort. Players with no plays are sorted to the bottom.
      </p>
    </div>
  );
}

/* ---------------- Game Stats ---------------- */

type GameSortKey = 'plays' | 'name' | 'recent';

export function GameStatsTable({
  sessions,
  scores,
  games,
  profiles,
}: {
  sessions: GameSession[];
  scores: SessionScore[];
  games: BoardGame[];
  profiles: Profile[];
}) {
  const [sortKey, setSortKey] = useState<GameSortKey>('plays');

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const gameStats = useMemo(
    () => computeGameStats(sessions, scores),
    [sessions, scores],
  );

  const rows = useMemo(() => {
    const arr = games.map((g) => {
      const s = gameStats.get(g.id);
      return {
        game: g,
        plays: s?.total_plays ?? 0,
        last_played_on: s?.last_played_on ?? null,
        top_winner_id: s?.top_winner_id ?? null,
        top_winner_count: s?.top_winner_id ? s.winner_counts.get(s.top_winner_id) ?? 0 : 0,
        highest_score: s?.highest_score ?? null,
        highest_score_by: s?.highest_score_by ?? null,
        biggest_blowout: s?.biggest_blowout ?? null,
      };
    });

    arr.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.game.name.localeCompare(b.game.name);
        case 'recent': {
          const ad = a.last_played_on ?? '';
          const bd = b.last_played_on ?? '';
          return ad > bd ? -1 : ad < bd ? 1 : 0;
        }
        case 'plays':
        default:
          return b.plays - a.plays;
      }
    });
    return arr;
  }, [games, gameStats, sortKey]);

  if (games.length === 0) {
    return (
      <div className="card text-center text-slate-500">
        No games on the shelf yet. Add some in the Picker → Shelf tab.
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-primary-100">
            <Th k="name" current={sortKey} onClick={setSortKey}>Game</Th>
            <Th k="plays" current={sortKey} onClick={setSortKey} right>Plays</Th>
            <th className="py-2 pr-3">Top winner</th>
            <th className="py-2 pr-3 text-right">High score</th>
            <th className="py-2 pr-3 text-right">Biggest blowout</th>
            <Th k="recent" current={sortKey} onClick={setSortKey} right>Last played</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const winner = r.top_winner_id ? profileById.get(r.top_winner_id) : null;
            const highScorer = r.highest_score_by ? profileById.get(r.highest_score_by) : null;
            return (
              <tr key={r.game.id} className="border-b border-primary-50 last:border-b-0">
                <td className="py-2 pr-3 font-medium text-primary-900">{r.game.name}</td>
                <td className="py-2 pr-3 text-right">{r.plays}</td>
                <td className="py-2 pr-3 text-slate-700">
                  {winner ? (
                    <>
                      {displayName(winner)}{' '}
                      <span className="text-xs text-slate-500">
                        ({r.top_winner_count})
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right text-slate-700">
                  {r.highest_score != null ? (
                    <>
                      {r.highest_score}
                      {highScorer && (
                        <span className="text-xs text-slate-500 ml-1">
                          {displayName(highScorer)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right text-slate-700">
                  {r.biggest_blowout != null ? (
                    `+${r.biggest_blowout}`
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right text-slate-500">
                  {relativeDate(r.last_played_on)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Sortable header helper ---------------- */

function Th<K extends string>({
  k,
  current,
  onClick,
  children,
  right = false,
}: {
  k: K;
  current: K;
  onClick: (k: K) => void;
  children: React.ReactNode;
  right?: boolean;
}) {
  const active = k === current;
  return (
    <th className={`py-2 pr-3 ${right ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`hover:text-primary-700 transition ${
          active ? 'text-primary-700 font-semibold' : ''
        }`}
      >
        {children}
        {active && <span className="ml-1">▾</span>}
      </button>
    </th>
  );
}
