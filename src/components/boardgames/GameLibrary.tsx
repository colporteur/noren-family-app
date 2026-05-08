import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { BoardGame, GameSession } from '../../lib/boardGames';
import { summarizePlayers, summarizeTime, summarizeWeight, daysSincePlayed } from '../../lib/boardGames';
import GameForm from './GameForm';

interface Props {
  games: BoardGame[];
  sessions: GameSession[];
  onChanged: () => void;       // ask the parent to refetch
}

export default function GameLibrary({ games, sessions, onChanged }: Props) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<BoardGame | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

      {filtered.length === 0 ? (
        <div className="card text-center text-slate-500">
          {games.length === 0
            ? "No games on the shelf yet. Add the first one!"
            : 'No games match that search.'}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((g) => (
            <li key={g.id} className="card flex items-start justify-between gap-3">
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
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-500 text-center">
        {games.length} game{games.length === 1 ? '' : 's'} on the shelf
        {games.length !== filtered.length && ` · ${filtered.length} matching`}
      </p>
    </div>
  );
}
