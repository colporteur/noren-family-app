import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BoardGame, GameSession } from '../../lib/boardGames';
import type { SessionScore } from '../../lib/gameStats';
import { computeGameStats, computePlayerStats } from '../../lib/gameStats';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

// Tailwind primary/warm/accent colors expressed as hex for Recharts.
const PRIMARY = '#7c3aed';
const WARM = '#f59e0b';
const EMERALD = '#10b981';
const SLATE = '#94a3b8';

/* ---------------- Player wins chart ---------------- */

export function PlayerWinsChart({
  sessions,
  scores,
  profiles,
}: {
  sessions: GameSession[];
  scores: SessionScore[];
  profiles: Profile[];
}) {
  const data = useMemo(() => {
    const stats = computePlayerStats(
      sessions,
      scores,
      profiles.map((p) => p.id),
    );
    return stats
      .filter((s) => s.total_plays > 0)
      .map((s) => {
        const p = profiles.find((x) => x.id === s.profile_id);
        return {
          name: p ? displayName(p) : '?',
          wins: s.total_wins,
          losses: Math.max(0, s.total_plays - s.total_wins),
        };
      })
      .sort((a, b) => b.wins - a.wins);
  }, [sessions, scores, profiles]);

  if (data.length === 0) {
    return (
      <div className="card text-sm text-slate-500 italic">
        No plays recorded yet — chart will appear once you've logged a few sessions.
      </div>
    );
  }

  // Reasonable height: ~36px per row + padding
  const height = Math.max(180, data.length * 38 + 60);

  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
        Wins per player
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 10, right: 20, top: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" />
          <XAxis type="number" allowDecimals={false} stroke="#94a3b8" />
          <YAxis
            dataKey="name"
            type="category"
            stroke="#94a3b8"
            tick={{ fontSize: 12 }}
            width={110}
          />
          <Tooltip
            cursor={{ fill: '#f5f3ff' }}
            contentStyle={{ borderRadius: 8, border: '1px solid #ede9fe', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="wins" stackId="a" fill={PRIMARY} name="Wins" radius={[0, 0, 0, 0]} />
          <Bar dataKey="losses" stackId="a" fill={SLATE} name="Other plays" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- Game plays chart ---------------- */

export function GamePlaysChart({
  sessions,
  scores,
  games,
}: {
  sessions: GameSession[];
  scores: SessionScore[];
  games: BoardGame[];
}) {
  const data = useMemo(() => {
    const stats = computeGameStats(sessions, scores);
    const arr = games
      .map((g) => {
        const s = stats.get(g.id);
        return { name: g.name, plays: s?.total_plays ?? 0 };
      })
      .filter((d) => d.plays > 0)
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10); // Top 10 most-played to keep the chart readable
    return arr;
  }, [sessions, scores, games]);

  if (data.length === 0) {
    return (
      <div className="card text-sm text-slate-500 italic">
        No plays recorded yet — chart will appear once you've logged a few sessions.
      </div>
    );
  }

  const height = Math.max(180, data.length * 36 + 60);

  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
        Most-played games {data.length === 10 && '(top 10)'}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 10, right: 20, top: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" />
          <XAxis type="number" allowDecimals={false} stroke="#94a3b8" />
          <YAxis
            dataKey="name"
            type="category"
            stroke="#94a3b8"
            tick={{ fontSize: 12 }}
            width={140}
          />
          <Tooltip
            cursor={{ fill: '#fffbeb' }}
            contentStyle={{ borderRadius: 8, border: '1px solid #fef3c7', fontSize: 12 }}
          />
          <Bar dataKey="plays" fill={WARM} name="Plays" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- Head-to-head bar ---------------- */

/**
 * A tiny two-bar chart for head-to-head wins between two players.
 */
export function HeadToHeadChart({
  aName,
  aWins,
  bName,
  bWins,
  ties,
}: {
  aName: string;
  aWins: number;
  bName: string;
  bWins: number;
  ties: number;
}) {
  const data = [
    { who: aName, wins: aWins, color: PRIMARY },
    { who: 'Tied', wins: ties, color: SLATE },
    { who: bName, wins: bWins, color: EMERALD },
  ];

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" vertical={false} />
        <XAxis dataKey="who" stroke="#94a3b8" tick={{ fontSize: 12 }} />
        <YAxis stroke="#94a3b8" allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: '#f5f3ff' }}
          contentStyle={{ borderRadius: 8, border: '1px solid #ede9fe', fontSize: 12 }}
        />
        <Bar dataKey="wins" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
