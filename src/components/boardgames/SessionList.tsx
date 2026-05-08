import { useMemo } from 'react';
import type { BoardGame, GameSession } from '../../lib/boardGames';
import type { SessionScore } from '../../lib/gameStats';
import { gameNameOrDash, relativeDate } from '../../lib/gameStats';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  sessions: GameSession[];
  scores: SessionScore[];
  games: BoardGame[];
  profiles: Profile[];
  onSelect: (sessionId: string) => void;
}

/**
 * Chronological list of game sessions (newest first). Each card shows the
 * game, date, player roster, and the winner(s) if recorded.
 */
export default function SessionList({ sessions, scores, games, profiles, onSelect }: Props) {
  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const scoresBySession = useMemo(() => {
    const m = new Map<string, SessionScore[]>();
    for (const s of scores) {
      const arr = m.get(s.session_id);
      if (arr) arr.push(s);
      else m.set(s.session_id, [s]);
    }
    return m;
  }, [scores]);

  const sorted = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        // Newer first by played_on, then by created_at
        if (a.played_on !== b.played_on) return a.played_on < b.played_on ? 1 : -1;
        return a.created_at < b.created_at ? 1 : -1;
      }),
    [sessions],
  );

  if (sorted.length === 0) {
    return (
      <div className="card text-center text-slate-500">
        No game sessions yet. Play something with the Picker — it'll show up here.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {sorted.map((s) => {
        const ss = scoresBySession.get(s.id) ?? [];
        const winners = ss
          .filter((row) => row.placement === 1 && row.profile_id)
          .map((row) => profileById.get(row.profile_id as string))
          .filter(Boolean) as Profile[];
        const players = ss
          .map((row) => (row.profile_id ? profileById.get(row.profile_id) : null))
          .filter(Boolean) as Profile[];
        const hasScores = ss.some((row) => row.score != null || row.placement != null);

        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className="card w-full text-left hover:-translate-y-0.5 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-semibold text-primary-900 text-lg truncate">
                    {gameNameOrDash(games, s.game_id)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {new Date(s.played_on + 'T00:00:00').toLocaleDateString()}{' '}
                    · {relativeDate(s.played_on)}
                  </p>
                </div>
                {!hasScores && (
                  <span
                    className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-warm-100 text-warm-600"
                    title="No scores or placements recorded yet — click to add them"
                  >
                    Needs scores
                  </span>
                )}
              </div>

              {players.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                    Players ({players.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {players.map((p) => {
                      const won = winners.some((w) => w.id === p.id);
                      return (
                        <span
                          key={p.id}
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            won
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-primary-50 text-primary-800'
                          }`}
                        >
                          {won && '🏆 '}
                          {displayName(p)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {s.notes && (
                <p className="text-sm text-slate-600 mt-2 italic line-clamp-2">{s.notes}</p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
