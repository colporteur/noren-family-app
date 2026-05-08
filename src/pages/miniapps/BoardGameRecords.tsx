import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { BoardGame, GameSession } from '../../lib/boardGames';
import type { SessionScore } from '../../lib/gameStats';
import type { Profile } from '../../lib/types';
import SessionList from '../../components/boardgames/SessionList';
import SessionEditor from '../../components/boardgames/SessionEditor';
import { PlayerStatsTable, GameStatsTable } from '../../components/boardgames/StatsTables';

type Tab = 'recent' | 'players' | 'games';

export default function BoardGameRecords() {
  const [tab, setTab] = useState<Tab>('recent');
  const [games, setGames] = useState<BoardGame[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [scores, setScores] = useState<SessionScore[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [gamesRes, sessionsRes, scoresRes, profilesRes] = await Promise.all([
      supabase.from('board_games').select('*').order('name', { ascending: true }),
      supabase.from('game_sessions').select('*'),
      supabase.from('game_session_scores').select('*'),
      supabase.from('profiles').select('*'),
    ]);

    let firstError: string | null = null;
    const setErr = (e: { message: string } | null) => {
      if (e && !firstError) firstError = e.message;
    };

    setErr(gamesRes.error);
    if (!gamesRes.error) setGames((gamesRes.data ?? []) as BoardGame[]);

    setErr(sessionsRes.error);
    if (!sessionsRes.error) setSessions((sessionsRes.data ?? []) as GameSession[]);

    setErr(scoresRes.error);
    if (!scoresRes.error) setScores((scoresRes.data ?? []) as SessionScore[]);

    setErr(profilesRes.error);
    if (!profilesRes.error) setProfiles((profilesRes.data ?? []) as Profile[]);

    setError(firstError);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const editingSession = useMemo(
    () => (editingSessionId ? sessions.find((s) => s.id === editingSessionId) ?? null : null),
    [editingSessionId, sessions],
  );

  const counts = useMemo(() => {
    const needsScores = sessions.filter((s) => {
      const ss = scores.filter((sc) => sc.session_id === s.id);
      return ss.length === 0 || ss.every((sc) => sc.score == null && sc.placement == null);
    }).length;
    return { total: sessions.length, needsScores };
  }, [sessions, scores]);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white grid place-items-center text-3xl shrink-0">
          📓
        </div>
        <div>
          <h1 className="font-display text-3xl text-primary-900">Game Record Book</h1>
          <p className="text-slate-600">
            Every game played, every score, every champion — preserved for posterity.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-primary-100 rounded-lg p-1 shadow-soft w-fit">
        {(
          [
            ['recent', 'Recent Plays'],
            ['players', 'Player Stats'],
            ['games', 'Game Stats'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setEditingSessionId(null);
            }}
            className={`px-4 py-1.5 text-sm rounded-md transition ${
              tab === id
                ? 'bg-primary-600 text-white'
                : 'text-primary-800 hover:bg-primary-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card border-red-300 text-red-700 bg-red-50">{error}</div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading the record book…</p>
      ) : (
        <>
          {tab === 'recent' && (
            <>
              {counts.needsScores > 0 && !editingSession && (
                <div className="card bg-warm-50 border-warm-500/30 text-warm-600 text-sm">
                  📝 {counts.needsScores} session{counts.needsScores === 1 ? '' : 's'} need scores or winners — click any "Needs scores" card to fill it in.
                </div>
              )}
              {editingSession ? (
                <SessionEditor
                  session={editingSession}
                  scores={scores}
                  games={games}
                  profiles={profiles}
                  onSaved={() => {
                    setEditingSessionId(null);
                    load();
                  }}
                  onDeleted={() => {
                    setEditingSessionId(null);
                    load();
                  }}
                  onCancel={() => setEditingSessionId(null)}
                />
              ) : (
                <SessionList
                  sessions={sessions}
                  scores={scores}
                  games={games}
                  profiles={profiles}
                  onSelect={(id) => setEditingSessionId(id)}
                />
              )}
            </>
          )}

          {tab === 'players' && (
            <PlayerStatsTable
              sessions={sessions}
              scores={scores}
              profiles={profiles.filter((p) => !p.is_deceased)}
            />
          )}

          {tab === 'games' && (
            <GameStatsTable
              sessions={sessions}
              scores={scores}
              games={games}
              profiles={profiles}
            />
          )}
        </>
      )}
    </div>
  );
}
