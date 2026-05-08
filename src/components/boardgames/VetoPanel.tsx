import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type {
  AppSettings,
  BoardGame,
  MasterVeto,
  UserVeto,
} from '../../lib/boardGames';
import { displayName } from '../../lib/types';
import type { Profile } from '../../lib/types';

interface Props {
  games: BoardGame[];
  profiles: Profile[];
  settings: AppSettings | null;
  masterVetoes: MasterVeto[];
  userVetoes: UserVeto[];
  onChanged: () => void;
}

/**
 * Veto panel shown on the Picker tab.
 *  - Always shows the current Veto Mode state.
 *  - When mode is on: shows current vetoes (master + everyone's user picks),
 *    lets each user manage their own vetoes, and gives Dictators inline
 *    settings + master-list management.
 *  - When mode is off: collapsed informational note + (for Dictators) the
 *    toggle so they can flip it on.
 */
export default function VetoPanel({
  games,
  profiles,
  settings,
  masterVetoes,
  userVetoes,
  onChanged,
}: Props) {
  const { profile, isDictator } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addPick, setAddPick] = useState<string>('');

  const enabled = settings?.veto_mode_enabled ?? false;
  const maxPerUser = settings?.max_user_vetoes ?? 1;

  const gameById = useMemo(() => {
    const m = new Map<string, BoardGame>();
    for (const g of games) m.set(g.id, g);
    return m;
  }, [games]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  const myVetoes = userVetoes.filter((v) => v.profile_id === profile?.id);
  const otherVetoes = userVetoes.filter((v) => v.profile_id !== profile?.id);
  const masterIds = new Set(masterVetoes.map((m) => m.game_id));

  const eligibleToVeto = useMemo(() => {
    const myIds = new Set(myVetoes.map((v) => v.game_id));
    return games
      .filter((g) => !myIds.has(g.id) && !masterIds.has(g.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [games, myVetoes, masterIds]);

  const setSettings = async (patch: Partial<Pick<AppSettings, 'veto_mode_enabled' | 'max_user_vetoes'>>) => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('app_settings').update(patch).eq('id', 1);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  const addMyVeto = async (gameId: string) => {
    if (!profile) return;
    if (myVetoes.length >= maxPerUser) {
      setError(`You've already used your ${maxPerUser} veto pick${maxPerUser === 1 ? '' : 's'}.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('user_vetoes')
      .insert({ game_id: gameId, profile_id: profile.id });
    setBusy(false);
    setAddPick('');
    if (error) setError(error.message);
    else onChanged();
  };

  const removeUserVeto = async (vetoId: string) => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('user_vetoes').delete().eq('id', vetoId);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  const removeMasterVeto = async (gameId: string) => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('master_vetoes').delete().eq('game_id', gameId);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  /* ---------------- Veto mode OFF ---------------- */

  if (!enabled) {
    return (
      <div className="card border-dashed border-slate-300 bg-slate-50/50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-slate-700">Veto Mode is off</p>
            <p className="text-xs text-slate-500">
              Picks include every game on the shelf.
              {isDictator && ' Turn it on to enable the master veto list and let everyone submit veto picks.'}
            </p>
          </div>
          {isDictator && (
            <button
              className="btn-primary"
              onClick={() => setSettings({ veto_mode_enabled: true })}
              disabled={busy}
            >
              Turn on Veto Mode
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
      </div>
    );
  }

  /* ---------------- Veto mode ON ---------------- */

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-primary-900">🛡️ Veto Mode is on</p>
          <p className="text-xs text-slate-500">
            Vetoed games are skipped by all pick modes. Each family member can
            veto up to {maxPerUser} game{maxPerUser === 1 ? '' : 's'} per round.
          </p>
        </div>
        {isDictator && (
          <div className="flex gap-2 items-center">
            <label className="text-xs text-slate-600">Max per person:</label>
            <input
              type="number"
              min={0}
              max={20}
              className="input py-1 text-sm w-16"
              value={maxPerUser}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n >= 0) setSettings({ max_user_vetoes: n });
              }}
              disabled={busy}
            />
            <button
              className="btn-secondary text-xs"
              onClick={() => setSettings({ veto_mode_enabled: false })}
              disabled={busy}
            >
              Turn off
            </button>
          </div>
        )}
      </div>

      {/* My vetoes */}
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
          My veto picks ({myVetoes.length}/{maxPerUser})
        </p>
        {myVetoes.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No veto yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 mb-2">
            {myVetoes.map((v) => (
              <li
                key={v.id}
                className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-800 px-2 py-1 rounded-full text-xs"
              >
                {gameById.get(v.game_id)?.name ?? 'Unknown game'}
                <button
                  className="ml-1 text-red-500 hover:text-red-700"
                  onClick={() => removeUserVeto(v.id)}
                  disabled={busy}
                  aria-label="Remove veto"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {myVetoes.length < maxPerUser && eligibleToVeto.length > 0 && (
          <div className="flex gap-2">
            <select
              className="input flex-1 text-sm"
              value={addPick}
              onChange={(e) => setAddPick(e.target.value)}
            >
              <option value="">Add a veto pick…</option>
              {eligibleToVeto.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary text-sm"
              onClick={() => addPick && addMyVeto(addPick)}
              disabled={!addPick || busy}
            >
              Veto
            </button>
          </div>
        )}
      </div>

      {/* Other family members' vetoes */}
      {otherVetoes.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
            Other vetoes ({otherVetoes.length})
          </p>
          <ul className="flex flex-wrap gap-2">
            {otherVetoes.map((v) => {
              const g = gameById.get(v.game_id);
              const p = profileById.get(v.profile_id);
              return (
                <li
                  key={v.id}
                  className="inline-flex items-center gap-1.5 bg-warm-50 border border-warm-500/30 text-warm-600 px-2 py-1 rounded-full text-xs"
                  title={p ? `Vetoed by ${displayName(p)}` : 'Vetoed'}
                >
                  <span className="font-medium">{g?.name ?? 'Unknown'}</span>
                  <span className="opacity-70">· {p ? displayName(p) : 'someone'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Master veto list */}
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
          Master veto list ({masterVetoes.length})
        </p>
        {masterVetoes.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            None set. {isDictator && 'Add games from the Shelf tab.'}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {masterVetoes.map((m) => {
              const g = gameById.get(m.game_id);
              return (
                <li
                  key={m.game_id}
                  className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-700 px-2 py-1 rounded-full text-xs"
                >
                  <span className="font-medium">⛔ {g?.name ?? 'Unknown'}</span>
                  {m.reason && <span className="opacity-70 italic">— {m.reason}</span>}
                  {isDictator && (
                    <button
                      className="ml-1 text-slate-500 hover:text-red-600"
                      onClick={() => removeMasterVeto(m.game_id)}
                      disabled={busy}
                      aria-label="Remove from master list"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
