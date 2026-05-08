import { useMemo } from 'react';
import type { NyePrediction, NyeQuestion } from '../../lib/nye';
import { computeLeaderboard, listSeasonYears } from '../../lib/nye';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  questions: NyeQuestion[];
  predictions: NyePrediction[];
  profiles: Profile[];
}

export default function Leaderboard({ questions, predictions, profiles }: Props) {
  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const rows = useMemo(
    () => computeLeaderboard(questions, predictions, profiles.map((p) => p.id)),
    [questions, predictions, profiles],
  );
  const years = useMemo(() => listSeasonYears(questions), [questions]);

  // Filter to people with at least one scored prediction or one asked question
  const visibleRows = rows.filter((r) => r.total_scored > 0 || r.total_questions_asked > 0);

  if (visibleRows.length === 0) {
    return (
      <div className="card text-center text-slate-500 text-sm">
        Leaderboard will appear once questions are answered and predictions are scored.
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
        Multi-year leaderboard
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-primary-100">
            <th className="py-2 pr-3 w-10 text-right">#</th>
            <th className="py-2 pr-3">Predictor</th>
            <th className="py-2 pr-3 text-right">Correct</th>
            <th className="py-2 pr-3 text-right">Scored</th>
            <th className="py-2 pr-3 text-right">Hit rate</th>
            {years.map((y) => (
              <th key={y} className="py-2 pr-3 text-right text-xs font-mono">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => {
            const p = profileById.get(r.profile_id);
            const hitRate =
              r.total_scored > 0 ? Math.round((r.total_correct / r.total_scored) * 100) : null;
            return (
              <tr key={r.profile_id} className="border-b border-primary-50 last:border-b-0">
                <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                  {r.rank === 1 && '👑 '}
                  {r.rank}
                </td>
                <td className="py-2 pr-3 font-medium text-primary-900">
                  {p ? displayName(p) : '(deleted)'}
                </td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                  {r.total_correct}
                </td>
                <td className="py-2 pr-3 text-right text-slate-600 tabular-nums">
                  {r.total_scored}
                </td>
                <td className="py-2 pr-3 text-right text-slate-500 tabular-nums">
                  {hitRate != null ? `${hitRate}%` : '—'}
                </td>
                {years.map((y) => {
                  const ys = r.by_year.get(y);
                  return (
                    <td key={y} className="py-2 pr-3 text-right tabular-nums text-slate-700 text-xs">
                      {ys ? `${ys.correct}/${ys.scored}` : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-400 mt-2">
        Per-year cells show "correct / scored." Unscored predictions don't count yet.
      </p>
    </div>
  );
}
