import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { BoardGame, GameSession, PickFilters } from '../../lib/boardGames';
import {
  applyFilters,
  pickRandom,
  pickWeightedByRecency,
  summarizePlayers,
  summarizeTime,
  summarizeWeight,
  daysSincePlayed,
} from '../../lib/boardGames';

type Mode = 'random' | 'filtered' | 'weighted';

interface Props {
  games: BoardGame[];
  sessions: GameSession[];
  onPlayed: () => void;     // refresh sessions after marking played
}

export default function GamePicker({ games, sessions, onPlayed }: Props) {
  const [mode, setMode] = useState<Mode>('random');
  const [picked, setPicked] = useState<BoardGame | null>(null);
  const [poolSize, setPoolSize] = useState<number>(games.length);
  const [logged, setLogged] = useState(false);
  const [logging, setLogging] = useState(false);

  // Filter inputs
  const [playerCount, setPlayerCount] = useState<string>('');
  const [maxMinutes, setMaxMinutes] = useState<string>('');
  const [maxWeightStr, setMaxWeightStr] = useState<string>('');
  const [ownedOnly, setOwnedOnly] = useState(true);

  const filters: PickFilters = useMemo(
    () => ({
      playerCount: playerCount ? parseInt(playerCount, 10) : undefined,
      maxMinutes: maxMinutes ? parseInt(maxMinutes, 10) : undefined,
      maxWeight: maxWeightStr ? parseFloat(maxWeightStr) : undefined,
      ownedOnly,
    }),
    [playerCount, maxMinutes, maxWeightStr, ownedOnly],
  );

  const pickNow = () => {
    setLogged(false);
    let pool: BoardGame[];
    if (mode === 'filtered') {
      pool = applyFilters(games, filters);
    } else if (ownedOnly) {
      pool = games.filter((g) => g.is_owned);
    } else {
      pool = games;
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

  const markPlayed = async () => {
    if (!picked) return;
    setLogging(true);
    const { error } = await supabase.from('game_sessions').insert({
      game_id: picked.id,
      played_on: new Date().toISOString().slice(0, 10),
    });
    setLogging(false);
    if (error) {
      alert(error.message);
    } else {
      setLogged(true);
      onPlayed();
    }
  };

  if (games.length === 0) {
    return (
      <div className="card text-center text-slate-500">
        No games on the shelf yet. Add some in <strong>The Shelf</strong> tab.
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

        <button className="btn-primary w-full mt-4 py-3 text-lg" onClick={pickNow}>
          🎲 Pick a game!
        </button>
      </div>

      {/* Result */}
      {picked && (
        <div className="card">
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

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={pickNow}>
              Try another
            </button>
            <button className="btn-primary" onClick={markPlayed} disabled={logging || logged}>
              {logged ? '✓ Logged' : logging ? 'Logging…' : 'Mark as played'}
            </button>
          </div>
          {logged && (
            <p className="text-xs text-emerald-700 mt-2">
              Saved to the record book. Future "Surprise but Fair" picks will avoid this for a while.
            </p>
          )}
        </div>
      )}

      {picked === null && poolSize === 0 && (
        <div className="card text-center text-slate-500">
          No games match those filters. Try loosening them.
        </div>
      )}
    </div>
  );
}
