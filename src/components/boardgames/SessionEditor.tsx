import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { BoardGame, GameSession } from '../../lib/boardGames';
import type { SessionScore } from '../../lib/gameStats';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface PlayerLine {
  // For existing rows: id is the game_session_scores row id.
  // For new rows added in the editor: id is null.
  id: string | null;
  profile_id: string;
  score: string;       // text in the input
  placement: string;   // text in the input ('1' = winner)
}

interface Props {
  session: GameSession;
  scores: SessionScore[];
  games: BoardGame[];
  profiles: Profile[];
  onSaved: () => void;
  onDeleted: () => void;
  onCancel: () => void;
}

export default function SessionEditor({
  session,
  scores,
  games,
  profiles,
  onSaved,
  onDeleted,
  onCancel,
}: Props) {
  const [playedOn, setPlayedOn] = useState(session.played_on);
  const [gameId, setGameId] = useState<string>(session.game_id ?? '');
  const [notes, setNotes] = useState(session.notes ?? '');
  const [lines, setLines] = useState<PlayerLine[]>([]);
  const [addPick, setAddPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initial = scores
      .filter((s) => s.session_id === session.id && s.profile_id)
      .map<PlayerLine>((s) => ({
        id: s.id,
        profile_id: s.profile_id as string,
        score: s.score?.toString() ?? '',
        placement: s.placement?.toString() ?? '',
      }));
    setLines(initial);
  }, [session.id, scores]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const usedIds = new Set(lines.map((l) => l.profile_id));
  const eligibleToAdd = profiles.filter((p) => !usedIds.has(p.id));

  const setLine = (i: number, patch: Partial<PlayerLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const removeLine = (i: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  };

  const markWinner = (i: number) => {
    // Toggle placement=1 on the chosen row; clear placement=1 on others.
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx === i) {
          return { ...l, placement: l.placement === '1' ? '' : '1' };
        }
        // If single-winner mode, clear other 1s. We allow ties via the input.
        if (l.placement === '1') return { ...l, placement: '' };
        return l;
      }),
    );
  };

  const addPlayer = () => {
    if (!addPick) return;
    setLines((prev) => [
      ...prev,
      { id: null, profile_id: addPick, score: '', placement: '' },
    ]);
    setAddPick('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // 1) Update the session itself
    const { error: sessErr } = await supabase
      .from('game_sessions')
      .update({
        played_on: playedOn,
        game_id: gameId || null,
        notes: notes.trim() || null,
      })
      .eq('id', session.id);

    if (sessErr) {
      setBusy(false);
      setError(sessErr.message);
      return;
    }

    // 2) Reconcile player score rows
    const originalIds = new Set(
      scores.filter((s) => s.session_id === session.id).map((s) => s.id),
    );
    const keptIds = new Set(lines.filter((l) => l.id).map((l) => l.id as string));

    // Delete rows the user removed
    const toDelete = [...originalIds].filter((id) => !keptIds.has(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('game_session_scores')
        .delete()
        .in('id', toDelete);
      if (delErr) {
        setBusy(false);
        setError(delErr.message);
        return;
      }
    }

    // Update existing rows
    for (const l of lines.filter((x) => x.id)) {
      const { error: upErr } = await supabase
        .from('game_session_scores')
        .update({
          profile_id: l.profile_id,
          score: l.score === '' ? null : Number(l.score),
          placement: l.placement === '' ? null : Number(l.placement),
        })
        .eq('id', l.id as string);
      if (upErr) {
        setBusy(false);
        setError(upErr.message);
        return;
      }
    }

    // Insert new rows
    const newRows = lines
      .filter((l) => !l.id)
      .map((l) => ({
        session_id: session.id,
        profile_id: l.profile_id,
        score: l.score === '' ? null : Number(l.score),
        placement: l.placement === '' ? null : Number(l.placement),
      }));
    if (newRows.length > 0) {
      const { error: insErr } = await supabase
        .from('game_session_scores')
        .insert(newRows);
      if (insErr) {
        setBusy(false);
        setError(insErr.message);
        return;
      }
    }

    setBusy(false);
    onSaved();
  };

  const onDelete = async () => {
    if (!confirm('Delete this whole session and its scores? Can\'t be undone.')) return;
    setBusy(true);
    setError(null);
    // Cascade should handle scores; delete the session row.
    const { error: delErr } = await supabase
      .from('game_sessions')
      .delete()
      .eq('id', session.id);
    setBusy(false);
    if (delErr) setError(delErr.message);
    else onDeleted();
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-primary-900">Edit session</h3>
        <button type="button" className="text-xs text-slate-500 hover:underline" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Date played</label>
          <input
            type="date"
            className="input"
            value={playedOn}
            onChange={(e) => setPlayedOn(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Game</label>
          <select
            className="input"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
          >
            <option value="">— none —</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Players & scores</label>
        {lines.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No players recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((l, i) => {
              const p = profileById.get(l.profile_id);
              const isWinner = l.placement === '1';
              return (
                <li
                  key={`${l.id ?? 'new'}-${i}`}
                  className={`grid grid-cols-12 gap-2 items-center p-2 rounded-md border ${
                    isWinner ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="col-span-4 sm:col-span-3 text-sm text-primary-900 truncate">
                    {p ? displayName(p) : '(unknown)'}
                  </div>
                  <input
                    className="input col-span-3 sm:col-span-2 text-sm py-1"
                    type="number"
                    step="any"
                    placeholder="Score"
                    value={l.score}
                    onChange={(e) => setLine(i, { score: e.target.value })}
                  />
                  <input
                    className="input col-span-2 text-sm py-1"
                    type="number"
                    min={1}
                    placeholder="Place"
                    value={l.placement}
                    onChange={(e) => setLine(i, { placement: e.target.value })}
                    title="1 = winner, 2 = second, etc. Leave blank to skip."
                  />
                  <button
                    type="button"
                    onClick={() => markWinner(i)}
                    className={`col-span-2 text-xs px-2 py-1 rounded-md border ${
                      isWinner
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-amber-50'
                    }`}
                  >
                    {isWinner ? '🏆 Winner' : 'Win?'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="col-span-1 text-xs text-red-600 hover:underline"
                    title="Remove this player from the session"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {eligibleToAdd.length > 0 && (
          <div className="flex gap-2 mt-2">
            <select
              className="input flex-1 text-sm"
              value={addPick}
              onChange={(e) => setAddPick(e.target.value)}
            >
              <option value="">Add a player…</option>
              {eligibleToAdd.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={addPlayer}
              disabled={!addPick}
            >
              Add
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea
          className="input min-h-[60px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Memorable moments, house rules, etc."
        />
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="btn-danger text-sm"
          onClick={onDelete}
          disabled={busy}
        >
          Delete session
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
