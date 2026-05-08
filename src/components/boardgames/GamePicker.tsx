import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type {
  AppSettings,
  BoardGame,
  GameSession,
  MasterVeto,
  PickFilters,
  UserVeto,
} from '../../lib/boardGames';
import {
  applyFilters,
  buildVetoedSet,
  pickRandom,
  pickWeightedByRecency,
  summarizePlayers,
  summarizeTime,
  summarizeWeight,
  daysSincePlayed,
} from '../../lib/boardGames';
import type { Profile } from '../../lib/types';
import VetoPanel from './VetoPanel';
import PlayersSelector from './PlayersSelector';

type Mode = 'random' | 'filtered' | 'weighted';

interface Props {
  games: BoardGame[];
  sessions: GameSession[];
  profiles: Profile[];          // active (non-deceased) family members
  settings: AppSettings | null;
  masterVetoes: MasterVeto[];
  userVetoes: UserVeto[];
  onPlayed: () => void;         // triggers a full reload of all the above
}

export default function GamePicker({
  games,
  sessions,
  profiles,
  settings,
  masterVetoes,
  userVetoes,
  onPlayed,
}: Props) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>('random');
  const [picked, setPicked] = useState<BoardGame | null>(null);
  const [poolSize, setPoolSize] = useState<number>(games.length);
  const [logged, setLogged] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // Filter inputs
  const [playerCount, setPlayerCount] = useState<string>('');
  const [maxMinutes, setMaxMinutes] = useState<string>('');
  const [maxWeightStr, setMaxWeightStr] = useState<string>('');
  const [ownedOnly, setOwnedOnly] = useState(true);

  // Player selection (for "who's playing")
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  // Pre-select the current user when their profile loads.
  useEffect(() => {
    if (profile && selectedPlayerIds.length === 0) {
      setSelectedPlayerIds([profile.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const vetoedIds = useMemo(
    () => buildVetoedSet(settings, masterVetoes, userVetoes),
    [settings, masterVetoes, userVetoes],
  );

  const filters: PickFilters = useMemo(
    () => ({
      playerCount: playerCount ? parseInt(playerCount, 10) : undefined,
      maxMinutes: maxMinutes ? parseInt(maxMinutes, 10) : undefined,
      maxWeight: maxWeightStr ? parseFloat(maxWeightStr) : undefined,
      ownedOnly,
      vetoedIds,
    }),
    [playerCount, maxMinutes, maxWeightStr, ownedOnly, vetoedIds],
  );

  const pickNow = () => {
    setLogged(false);
    setLogError(null);
    let pool: BoardGame[];
    if (mode === 'filtered') {
      pool = applyFilters(games, filters);
    } else {
      // Random + Weighted both honor ownedOnly + vetoes (but skip the filter inputs)
      pool = applyFilters(games, { ownedOnly, vetoedIds });
    }
    setPoolSize(pool.length);

    let result: BoardGame | null;
    if (mode === 'weighted') {
      result = pickWeightedByRecency(pool, sessions);
    } else {
      result = pickRandom(pool);
    }
    setPicked(result);
  };

  const selectGame = async () => {
    if (!picked) return;
    if (selectedPlayerIds.length === 0) {
      setLogError('Select at least one player.');
      return;
    }
    setLogging(true);
    setLogError(null);

    const today = new Date().toISOString().slice(0, 10);

    // 1) Create the session row
    const sessionRes = await supabase
      .from('game_sessions')
      .insert({ game_id: picked.id, played_on: today })
      .select('*')
      .single();

    if (sessionRes.error || !sessionRes.data) {
      setLogging(false);
      setLogError(sessionRes.error?.message ?? 'Failed to create session.');
      return;
    }

    const sessionId = (sessionRes.data as GameSession).id;

    // 2) Insert score rows (just to record participation; score/placement null)
    if (selectedPlayerIds.length > 0) {
      const rows = selectedPlayerIds.map((pid) => ({
        session_id: sessionId,
        profile_id: pid,
      }));
      const { error: scoresErr } = await supabase
        .from('game_session_scores')
        .insert(rows);
      if (scoresErr) {
        setLogging(false);
        setLogError(`Session created but failed to record players: ${scoresErr.message}`);
        return;
      }
    }

    // 3) If veto mode is on, clear all user vetoes (Dictator's intent: fresh round)
    if (settings?.veto_mode_enabled) {
      const { error: clearErr } = await supabase
        .from('user_vetoes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows
      if (clearErr) {
        // Non-fatal — the session is recorded, we just log the warning.
        console.warn('Could not clear user vetoes:', clearErr);
      }
    }

    setLogging(false);
    setLogged(true);
    onPlayed();
  };

  const buttonLabel = settings?.veto_mode_enabled
    ? 'Select Game and Clear Veto List'
    : 'Select Game';

  if (games.length === 0) {
    return (
      <div className="card text-center text-slate-500">
        No games on the shelf yet. Add some in <strong>The Shelf</strong> tab.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <VetoPanel
        games={games}
        profiles={profiles}
        settings={settings}
        masterVetoes={masterVetoes}
        userVetoes={userVetoes}
        onChanged={onPlayed}
      />

      {/* Mode selector */}
      <div className="card">
        <label className="label">Pick mode</label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['random', 'Random', 'Pure roll of the dice'],
              ['filtered', 'Filtered', 'By players, time, complexity'],
              ['weighted', 'Surprise but Fair', 'Favors games we haven\'t played lately'],
            ] as const
          ).map(([id, label, blurb]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`text-left p-3 rounded-lg border transition ${
                mode === id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-slate-200 hover:border-primary-200 hover:bg-primary-50/50'
              }`}
            >
              <div className="font-semibold text-primary-900 text-sm">{label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{blurb}</div>
            </button>
          ))}
        </div>

        {mode === 'filtered' && (
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            <div>
              <label className="label">Players at the table</label>
              <input
                className="input"
                type="number"
                min={1}
                value={playerCount}
                onChange={(e) => setPlayerCount(e.target.value)}
                placeholder="e.g. 4"
              />
            </div>
            <div>
              <label className="label">Max time (min)</label>
              <input
                className="input"
                type="number"
                min={5}
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(e.target.value)}
                placeholder="e.g. 60"
              />
            </div>
            <div>
              <label className="label">Max complexity (1-5)</label>
              <input
                className="input"
                type="number"
                step="0.1"
                min={1}
                max={5}
                value={maxWeightStr}
                onChange={(e) => setMaxWeightStr(e.target.value)}
                placeholder="e.g. 3.0"
              />
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700 mt-3">
          <input
            type="checkbox"
            checked={ownedOnly}
            onChange={(e) => setOwnedOnly(e.target.checked)}
          />
          Only pick games we own
        </label>

        {settings?.veto_mode_enabled && vetoedIds.size > 0 && (
          <p className="text-xs text-warm-600 mt-2">
            🛡️ {vetoedIds.size} game{vetoedIds.size === 1 ? '' : 's'} excluded by vetoes.
          </p>
        )}

        <button className="btn-primary w-full mt-4 py-3 text-lg" onClick={pickNow}>
          🎲 Pick a game!
        </button>
      </div>

      {/* Result */}
      {picked && (
        <div className="card space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-warm-600 font-semibold">
              Tonight's pick
            </p>
            <h2 className="font-display text-3xl text-primary-900 mt-1">{picked.name}</h2>
            <p className="text-sm text-slate-600 mt-1">
              {summarizePlayers(picked)} · {summarizeTime(picked)}
              {picked.weight != null && ` · ${summarizeWeight(picked.weight)}`}
            </p>
            {picked.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {picked.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-50 text-primary-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {picked.notes && (
              <p className="text-sm text-slate-600 mt-3 italic">{picked.notes}</p>
            )}
            <p className="text-xs text-slate-400 mt-3">
              {(() => {
                const d = daysSincePlayed(picked.id, sessions);
                if (!Number.isFinite(d)) return "We've never played this.";
                if (d === 0) return 'Last played: today.';
                if (d === 1) return 'Last played: yesterday.';
                return `Last played: ${d} days ago.`;
              })()}
            </p>
          </div>

          <PlayersSelector
            profiles={profiles}
            selectedIds={selectedPlayerIds}
            onChange={setSelectedPlayerIds}
          />

          {logError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {logError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={pickNow} disabled={logging}>
              Try another
            </button>
            <button
              className="btn-primary"
              onClick={selectGame}
              disabled={logging || logged || selectedPlayerIds.length === 0}
            >
              {logged
                ? '✓ Recorded'
                : logging
                  ? 'Recording…'
                  : buttonLabel}
            </button>
          </div>
          {logged && (
            <p className="text-xs text-emerald-700">
              Recorded to the archive
              {settings?.veto_mode_enabled ? ' and the veto list was cleared.' : '.'}
            </p>
          )}
        </div>
      )}

      {picked === null && poolSize === 0 && (
        <div className="card text-center text-slate-500">
          No games match those filters
          {settings?.veto_mode_enabled && vetoedIds.size > 0 && ' (after vetoes)'}.
          Try loosening them.
        </div>
      )}
    </div>
  );
}
