import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type {
  AppSettings,
  BoardGame,
  GameSession,
  MasterVeto,
  UserVeto,
} from '../../lib/boardGames';
import type { Profile } from '../../lib/types';
import GamePicker from '../../components/boardgames/GamePicker';
import GameLibrary from '../../components/boardgames/GameLibrary';

type Tab = 'pick' | 'shelf';

export default function BoardGameSelector() {
  const [tab, setTab] = useState<Tab>('pick');
  const [games, setGames] = useState<BoardGame[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [masterVetoes, setMasterVetoes] = useState<MasterVeto[]>([]);
  const [userVetoes, setUserVetoes] = useState<UserVeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      gamesRes,
      sessionsRes,
      profilesRes,
      settingsRes,
      masterRes,
      userRes,
    ] = await Promise.all([
      supabase.from('board_games').select('*').order('name', { ascending: true }),
      supabase.from('game_sessions').select('*'),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_deceased', false)
        .order('first_name', { ascending: true }),
      supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('master_vetoes').select('*'),
      supabase.from('user_vetoes').select('*'),
    ]);

    let firstError: string | null = null;
    const setErr = (e: { message: string } | null) => {
      if (e && !firstError) firstError = e.message;
    };

    setErr(gamesRes.error);
    if (!gamesRes.error) setGames((gamesRes.data ?? []) as BoardGame[]);

    setErr(sessionsRes.error);
    if (!sessionsRes.error) setSessions((sessionsRes.data ?? []) as GameSession[]);

    setErr(profilesRes.error);
    if (!profilesRes.error) setProfiles((profilesRes.data ?? []) as Profile[]);

    setErr(settingsRes.error);
    if (!settingsRes.error) setSettings((settingsRes.data ?? null) as AppSettings | null);

    setErr(masterRes.error);
    if (!masterRes.error) setMasterVetoes((masterRes.data ?? []) as MasterVeto[]);

    setErr(userRes.error);
    if (!userRes.error) setUserVetoes((userRes.data ?? []) as UserVeto[]);

    setError(firstError);
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
        <GamePicker
          games={games}
          sessions={sessions}
          profiles={profiles}
          settings={settings}
          masterVetoes={masterVetoes}
          userVetoes={userVetoes}
          onPlayed={load}
        />
      ) : (
        <GameLibrary
          games={games}
          sessions={sessions}
          settings={settings}
          masterVetoes={masterVetoes}
          userVetoes={userVetoes}
          onChanged={load}
        />
      )}
    </div>
  );
}
