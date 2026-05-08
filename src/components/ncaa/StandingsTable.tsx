import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NcaaStanding } from '../../lib/ncaaPool';
import { withDenseRanks } from '../../lib/ncaaPool';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  standings: NcaaStanding[];
  profiles: Profile[];
}

export default function StandingsTable({ standings, profiles }: Props) {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const ranked = useMemo(() => withDenseRanks(standings), [standings]);

  const chartData = useMemo(
    () =>
      ranked.map((s) => ({
        name:
          s.profile_id && profileById.get(s.profile_id)
            ? displayName(profileById.get(s.profile_id) as Profile)
            : s.bracket_name ?? '?',
        points: s.points,
        rank: s.computed_rank,
      })),
    [ranked, profileById],
  );

  const max = chartData.reduce((m, r) => Math.max(m, r.points), 0) || 1;

  if (ranked.length === 0) {
    return (
      <div className="card text-center text-slate-500 text-sm">
        No standings posted for this year yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
          Standings
        </p>
        <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 32 + 60)}>
          <BarChart
            data={chartData}
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
              width={120}
            />
            <Tooltip
              cursor={{ fill: '#f5f3ff' }}
              contentStyle={{ borderRadius: 8, border: '1px solid #ede9fe', fontSize: 12 }}
            />
            <Bar dataKey="points" radius={[0, 4, 4, 0]}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={
                    d.rank === 1
                      ? '#f59e0b'
                      : d.rank === chartData.length
                        ? '#94a3b8'
                        : '#7c3aed'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-primary-100">
              <th className="py-2 pr-3 w-12 text-right">#</th>
              <th className="py-2 pr-3">Bracket</th>
              <th className="py-2 pr-3 text-right">Points</th>
              <th className="py-2 pr-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((s) => {
              const isFirst = s.computed_rank === 1;
              const isLast = s.computed_rank === ranked[ranked.length - 1].computed_rank;
              const who =
                s.profile_id && profileById.get(s.profile_id)
                  ? displayName(profileById.get(s.profile_id) as Profile)
                  : s.bracket_name ?? '?';
              return (
                <tr key={s.id} className="border-b border-primary-50 last:border-b-0">
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                    {isFirst && '🏆 '}
                    {isLast && ranked.length > 1 && '🪦 '}
                    {s.computed_rank}
                  </td>
                  <td className="py-2 pr-3 font-medium text-primary-900">{who}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                    {s.points}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500 italic">{s.notes ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
