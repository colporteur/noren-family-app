import { useMemo, useState } from 'react';
import type { BoardGame, GameSession } from '../../lib/boardGames';
import type { SessionScore } from '../../lib/gameStats';
import { gameNameOrDash, relativeDate } from '../../lib/gameStats';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';
import { HeadToHeadChart } from './StatsCharts';

interface Props {
  games: BoardGame[];
  sessions: GameSession[];
  scores: SessionScore[];
  profiles: Profile[];
}

interface JointSession {
  session: GameSession;
  aPlace: number | null;
  aScore: number | null;
  bPlace: number | null;
  bScore: number | null;
  outcome: 'a' | 'b' | 'tie' | 'neither';
}

export default function HeadToHead({ games, sessions, scores, profiles }: Props) {
  // Default to the first two profiles if available.
  const [aId, setAId] = useState<string>(profiles[0]?.id ?? '');
  const [bId, setBId] = useState<string>(profiles[1]?.id ?? '');

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const a = profileById.get(aId) ?? null;
  const b = profileById.get(bId) ?? null;

  const joint: JointSession[] = useMemo(() => {
    if (!aId || !bId || aId === bId) return [];
    const out: JointSession[] = [];
    for (const sess of sessions) {
      const sessScores = scores.filter((s) => s.session_id === sess.id);
      const aRow = sessScores.find((s) => s.profile_id === aId);
      const bRow = sessScores.find((s) => s.profile_id === bId);
      if (!aRow || !bRow) continue; // both must have played

      let outcome: JointSession['outcome'] = 'neither';
      if (aRow.placement === 1 && bRow.placement === 1) outcome = 'tie';
      else if (aRow.placement === 1) outcome = 'a';
      else if (bRow.placement === 1) outcome = 'b';

      out.push({
        session: sess,
        aPlace: aRow.placement,
        aScore: aRow.score,
        bPlace: bRow.placement,
        bScore: bRow.score,
        outcome,
      });
    }
    return out.sort((x, y) => (x.session.played_on < y.session.played_on ? 1 : -1));
  }, [aId, bId, sessions, scores]);

  const tally = useMemo(() => {
    let aWins = 0, bWins = 0, ties = 0, neither = 0;
    for (const j of joint) {
      if (j.outcome === 'a') aWins++;
      else if (j.outcome === 'b') bWins++;
      else if (j.outcome === 'tie') ties++;
      else neither++;
    }
    return { aWins, bWins, ties, neither };
  }, [joint]);

  if (profiles.length < 2) {
    return (
      <div className="card text-center text-slate-500">
        Need at least two family members to compare. Invite more people!
      </div>
    );
  }

  const swap = () => {
    const tmp = aId;
    setAId(bId);
    setBId(tmp);
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
          Pick two family members
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input flex-1 min-w-[140px]"
            value={aId}
            onChange={(e) => setAId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={swap}
            className="btn-secondary text-sm"
            title="Swap"
          >
            ⇄
          </button>
          <span className="text-slate-500 text-sm">vs.</span>
          <select
            className="input flex-1 min-w-[140px]"
            value={bId}
            onChange={(e) => setBId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {aId && bId && aId === bId ? (
        <div className="card text-center text-slate-500">
          Pick two different people.
        </div>
      ) : joint.length === 0 ? (
        <div className="card text-center text-slate-500">
          {a && b
            ? `${displayName(a)} and ${displayName(b)} haven't played a recorded game together yet.`
            : 'Pick two family members.'}
        </div>
      ) : (
        <>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
              All-time record ({joint.length} game{joint.length === 1 ? '' : 's'})
            </p>
            {a && b && (
              <HeadToHeadChart
                aName={displayName(a)}
                aWins={tally.aWins}
                bName={displayName(b)}
                bWins={tally.bWins}
                ties={tally.ties}
              />
            )}
            <div className="grid grid-cols-3 gap-2 text-center mt-2">
              <Stat label={a ? displayName(a) : 'A'} value={tally.aWins} accent="primary" />
              <Stat label="Tied" value={tally.ties} accent="slate" />
              <Stat label={b ? displayName(b) : 'B'} value={tally.bWins} accent="emerald" />
            </div>
            {tally.neither > 0 && (
              <p className="text-[11px] text-slate-400 text-center mt-2 italic">
                {tally.neither} session{tally.neither === 1 ? '' : 's'} where neither was the recorded winner
                (placement not tracked or co-op).
              </p>
            )}
          </div>

          <div className="card overflow-x-auto">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
              Session history
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-primary-100">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Game</th>
                  <th className="py-2 pr-3 text-right">{a ? displayName(a) : 'A'}</th>
                  <th className="py-2 pr-3 text-right">{b ? displayName(b) : 'B'}</th>
                  <th className="py-2 pr-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {joint.map((j) => (
                  <tr key={j.session.id} className="border-b border-primary-50 last:border-b-0">
                    <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                      {new Date(j.session.played_on + 'T00:00:00').toLocaleDateString()}
                      <span className="text-xs text-slate-400 ml-2">
                        {relativeDate(j.session.played_on)}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{gameNameOrDash(games, j.session.game_id)}</td>
                    <td className="py-2 pr-3 text-right">
                      {formatScore(j.aScore, j.aPlace)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {formatScore(j.bScore, j.bPlace)}
                    </td>
                    <td className="py-2 pr-3">
                      {j.outcome === 'a' && a && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">
                          🏆 {displayName(a)}
                        </span>
                      )}
                      {j.outcome === 'b' && b && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          🏆 {displayName(b)}
                        </span>
                      )}
                      {j.outcome === 'tie' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          tied
                        </span>
                      )}
                      {j.outcome === 'neither' && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'primary' | 'slate' | 'emerald';
}) {
  const cls =
    accent === 'primary'
      ? 'bg-primary-50 text-primary-800'
      : accent === 'emerald'
        ? 'bg-emerald-50 text-emerald-800'
        : 'bg-slate-100 text-slate-700';
  return (
    <div className={`rounded-lg py-2 ${cls}`}>
      <div className="text-2xl font-display font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide truncate">{label}</div>
    </div>
  );
}

function formatScore(score: number | null, place: number | null): string {
  const pieces: string[] = [];
  if (score != null) pieces.push(score.toString());
  if (place != null) pieces.push(`#${place}`);
  return pieces.join(' · ') || '—';
}
