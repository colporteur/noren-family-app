import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { BoardGame, GameSession } from '../../lib/boardGames';
import GamePicker from '../../components/boardgames/GamePicker';
import GameLibrary from '../../components/boardgames/GameLibrary';

type Tab = 'pick' | 'shelf';

export default function BoardGameSelector() {
  const [tab, setTab] = useState<Tab>('pick');
  const [games, setGames] = useState<BoardGame[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [gamesRes, sessionsRes] = await Promise.all([
      supabase.from('board_games').select('*').order('name', { ascending: true }),
      supabase.from('game_sessions').select('*'),
    ]);
    if (gamesRes.error) setError(gamesRes.error.message);
    else setGames((gamesRes.data ?? []) as BoardGame[]);

    if (sessionsRes.error) setError(sessionsRes.error.message);
    else setSessions((sessionsRes.data ?? []) as GameSession[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white grid place-items-center text-3xl shrink-0">
          🎲
        </div>
        <div>
          <h1 className="font-display text-3xl text-primary-900">Board Game Picker</h1>
          <p className="text-slate-600">
            Mom's shelf, smarter. Pick a game, log it played, never argue about
            "what should we play?" again.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-primary-100 rounded-lg p-1 shadow-soft w-fit">
        {(
          [
            ['pick', 'Pick a Game'],
            ['shelf', 'The Shelf'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 text-sm rounded-md transition ${
              tab === id
                ? 'bg-primary-600 text-white'
                : 'text-primary-800 hover:bg-primary-50'
            }`}
          >
            {label}
            {id === 'shelf' && (
              <span
                className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                  tab === id ? 'bg-white/20' : 'bg-primary-100 text-primary-700'
                }`}
              >
                {games.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="card border-red-300 text-red-700 bg-red-50">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading the shelf…</p>
      ) : tab === 'pick' ? (
        <GamePicker games={games} sessions={sessions} onPlayed={load} />
      ) : (
        <GameLibrary games={games} sessions={sessions} onChanged={load} />
      )}
    </div>
  );
}
