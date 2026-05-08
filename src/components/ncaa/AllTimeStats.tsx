import { useMemo } from 'react';
import type { NcaaPoolYear, NcaaStanding } from '../../lib/ncaaPool';
import { computeAllTimeStats } from '../../lib/ncaaPool';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  years: NcaaPoolYear[];
  standings: NcaaStanding[];
  profiles: Profile[];
}

export default function AllTimeStats({ years, standings, profiles }: Props) {
  const profilesById = useMemo(() => {
    const m = new Map<string, { display_name: string }>();
    for (const p of profiles) m.set(p.id, { display_name: displayName(p) });
    return m;
  }, [profiles]);

  const rows = useMemo(
    () => computeAllTimeStats(years, standings, profilesById),
    [years, standings, profilesById],
  );

  if (rows.length === 0) {
    return (
      <div className="card text-center text-slate-500 text-sm">
        No history yet. Once you finalize a year, all-time stats will appear.
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
        All-time
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-primary-100">
            <th className="py-2 pr-3">Bracket</th>
            <th className="py-2 pr-3 text-right">Years</th>
            <th className="py-2 pr-3 text-right">🏆 Wins</th>
            <th className="py-2 pr-3 text-right">🪦 Last places</th>
            <th className="py-2 pr-3 text-right">Best finish</th>
            <th className="py-2 pr-3 text-right">High score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-primary-50 last:border-b-0">
              <td className="py-2 pr-3 font-medium text-primary-900">
                {r.wins > 0 && '👑 '}
                {r.display_name}
              </td>
              <td className="py-2 pr-3 text-right">{r.total_years_entered}</td>
              <td className="py-2 pr-3 text-right font-semibold">{r.wins}</td>
              <td className="py-2 pr-3 text-right text-slate-500">{r.losses}</td>
              <td className="py-2 pr-3 text-right">
                {r.best_finish != null ? `#${r.best_finish}` : '—'}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.best_points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
