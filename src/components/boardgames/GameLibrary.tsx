import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type {
  AppSettings,
  BoardGame,
  GameSession,
  MasterVeto,
  UserVeto,
} from '../../lib/boardGames';
import {
  summarizePlayers,
  summarizeTime,
  summarizeWeight,
  daysSincePlayed,
} from '../../lib/boardGames';
import GameForm from './GameForm';

interface Props {
  games: BoardGame[];
  sessions: GameSession[];
  settings: AppSettings | null;
  masterVetoes: MasterVeto[];
  userVetoes: UserVeto[];
  onChanged: () => void;       // ask the parent to refetch
}

export default function GameLibrary({
  games,
  sessions,
  settings,
  masterVetoes,
  userVetoes,
  onChanged,
}: Props) {
  const { profile, isDictator } = useAuth();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<BoardGame | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const vetoModeOn = settings?.veto_mode_enabled ?? false;
  const maxPerUser = settings?.max_user_vetoes ?? 1;

  const masterIds = useMemo(
    () => new Set(masterVetoes.map((m) => m.game_id)),
    [masterVetoes],
  );
  const myVetoIds = useMemo(() => {
    const m = new Map<string, string>(); // game_id -> veto_id
    for (const v of userVetoes) {
      if (v.profile_id === profile?.id) m.set(v.game_id, v.id);
    }
    return m;
  }, [userVetoes, profile?.id]);
  const myVetoCount = myVetoIds.size;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [query, games]);

  const remove = async (g: BoardGame) => {
    if (!confirm(`Remove "${g.name}" from the shelf? This can't be undone.`)) return;
    setBusyId(g.id);
    const { error } = await supabase.from('board_games').delete().eq('id', g.id);
    setBusyId(null);
    if (error) alert(error.message);
    else onChanged();
  };

  const toggleMyVeto = async (g: BoardGame) => {
    if (!profile) return;
    setBusyId(g.id);
    const existingVetoId = myVetoIds.get(g.id);
    if (existingVetoId) {
      const { error } = await supabase.from('user_vetoes').delete().eq('id', existingVetoId);
      if (error) alert(error.message);
    } else {
      if (myVetoCount >= maxPerUser) {
        alert(`You've already used your ${maxPerUser} veto pick${maxPerUser === 1 ? '' : 's'}.`);
        setBusyId(null);
        return;
      }
      const { error } = await supabase
        .from('user_vetoes')
        .insert({ game_id: g.id, profile_id: profile.id });
      if (error) alert(error.message);
    }
    setBusyId(null);
    onChanged();
  };

  const toggleMasterVeto = async (g: BoardGame) => {
    if (!isDictator) return;
    setBusyId(g.id);
    if (masterIds.has(g.id)) {
      const { error } = await supabase
        .from('master_vetoes')
        .delete()
        .eq('game_id', g.id);
      if (error) alert(error.message);
    } else {
      const reason = window.prompt(
        `Add "${g.name}" to the master veto list?\n\nOptional reason (visible to family):`,
        '',
      );
      if (reason === null) {
        setBusyId(null);
        return;
      }
      const { error } = await supabase.from('master_vetoes').insert({
        game_id: g.id,
        reason: reason.trim() || null,
        created_by: profile?.id ?? null,
      });
      if (error) alert(error.message);
    }
    setBusyId(null);
    onChanged();
  };

  const lastPlayedLabel = (g: BoardGame) => {
    const d = daysSincePlayed(g.id, sessions);
    if (!Number.isFinite(d)) return 'never played';
    if (d === 0) return 'played today';
    if (d === 1) return 'played yesterday';
    if (d < 30) return `${d}d ago`;
    if (d < 365) return `${Math.round(d / 30)}mo ago`;
    return `${Math.round(d / 365)}y ago`;
  };

  if (adding || editing) {
    return (
      <GameForm
        game={editing}
        onSaved={() => {
          setAdding(false);
          setEditing(null);
          onChanged();
        }}
        onCancel={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Search by name or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + Add a game
        </button>
      </div>

      {vetoModeOn && (
        <p className="text-xs text-warm-600">
          🛡️ Veto Mode is on. {myVetoCount}/{maxPerUser} veto pick{maxPerUser === 1 ? '' : 's'} used.
          Tap "Veto" on a game to add it to your veto list for tonight.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="card text-center text-slate-500">
          {games.length === 0
            ? "No games on the shelf yet. Add the first one!"
            : 'No games match that search.'}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((g) => {
            const isMaster = masterIds.has(g.id);
            const isMyVeto = myVetoIds.has(g.id);
            return (
              <li
                key={g.id}
                className={`card flex items-start justify-between gap-3 ${
                  isMaster ? 'border-slate-300 bg-slate-50/40' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-semibold text-primary-900 truncate">
                      {g.name}
                    </h3>
                    {!g.is_owned && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-warm-100 text-warm-600">
                        not owned
                      </span>
                    )}
                    {isMaster && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-700"
                        title="On the master veto list"
                      >
                        ⛔ master vetoed
                      </span>
                    )}
                    {isMyVeto && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700"
                        title="You've vetoed this for tonight"
                      >
                        🚫 your veto
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {summarizePlayers(g)} · {summarizeTime(g)}
                    {g.weight != null && ` · ${summarizeWeight(g.weight)}`}
                  </p>
                  {g.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {g.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-50 text-primary-700"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1.5 italic">{lastPlayedLabel(g)}</p>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  {vetoModeOn && (
                    <button
                      className={`text-xs py-1 px-2 rounded-md border transition ${
                        isMyVeto
                          ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200'
                          : 'bg-white border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50'
                      }`}
                      onClick={() => toggleMyVeto(g)}
                      disabled={busyId === g.id || isMaster || (!isMyVeto && myVetoCount >= maxPerUser)}
                      title={
                        isMaster
                          ? 'Already on master veto list'
                          : isMyVeto
                            ? 'Remove your veto'
                            : myVetoCount >= maxPerUser
                              ? `Max ${maxPerUser} veto${maxPerUser === 1 ? '' : 's'} per round`
                              : 'Veto for tonight'
                      }
                    >
                      {isMyVeto ? '↶ Un-veto' : '🚫 Veto'}
                    </button>
                  )}
                  {isDictator && vetoModeOn && (
                    <button
                      className={`text-xs py-1 px-2 rounded-md border transition ${
                        isMaster
                          ? 'bg-slate-200 border-slate-400 text-slate-800 hover:bg-slate-300'
                          : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                      onClick={() => toggleMasterVeto(g)}
                      disabled={busyId === g.id}
                      title={isMaster ? 'Remove from master veto list' : 'Add to master veto list'}
                    >
                      {isMaster ? '⛔ On master' : '⛔ Master veto'}
                    </button>
                  )}
                  <button
                    className="btn-secondary text-xs py-1"
                    onClick={() => setEditing(g)}
                    disabled={busyId === g.id}
                  >
                    Edit
                  </button>
                  <button
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    onClick={() => remove(g)}
                    disabled={busyId === g.id}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-slate-500 text-center">
        {games.length} game{games.length === 1 ? '' : 's'} on the shelf
        {games.length !== filtered.length && ` · ${filtered.length} matching`}
      </p>
    </div>
  );
}
