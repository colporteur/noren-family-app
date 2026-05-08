import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { BoardGame } from '../../lib/boardGames';
import type { MatchedSession } from '../../lib/importMatching';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  source: 'photo' | 'excel';
  initial: MatchedSession[];
  games: BoardGame[];
  profiles: Profile[];
  confidence?: 'high' | 'medium' | 'low';
  sourceNotes?: string;
  onCancel: () => void;
  onImported: (count: number) => void;
}

/**
 * Reviews proposed sessions from photo or Excel ingestion. Each row is editable
 * inline — pick game, set date, fix unmatched players, edit scores/placements.
 * User checks rows to import and clicks "Import N." We insert sessions + score
 * rows in one batch and return a count to the parent.
 */
export default function ImportPreview({
  source,
  initial,
  games,
  profiles,
  confidence,
  sourceNotes,
  onCancel,
  onImported,
}: Props) {
  // Local editable state — clone of initial.
  const [rows, setRows] = useState<MatchedSession[]>(() =>
    initial.map((r) => ({ ...r, players: r.players.map((p) => ({ ...p })) })),
  );
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initial.map((_, i) => i)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSelect = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  const updateRow = (i: number, patch: Partial<MatchedSession>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const updatePlayer = (sessIdx: number, playerIdx: number, patch: Partial<MatchedSession['players'][number]>) => {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== sessIdx) return r;
        return {
          ...r,
          players: r.players.map((p, pi) => (pi === playerIdx ? { ...p, ...patch } : p)),
        };
      }),
    );
  };

  const removePlayer = (sessIdx: number, playerIdx: number) => {
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === sessIdx ? { ...r, players: r.players.filter((_, pi) => pi !== playerIdx) } : r,
      ),
    );
  };

  const importNow = async () => {
    const toImport = rows.filter((_, i) => selected.has(i));
    if (toImport.length === 0) return;

    setBusy(true);
    setError(null);

    let imported = 0;
    for (const r of toImport) {
      // 1) Create the session
      const sessRes = await supabase
        .from('game_sessions')
        .insert({
          game_id: r.game_id,
          played_on: r.played_on,
          notes: r.notes || null,
        })
        .select('id')
        .single();
      if (sessRes.error || !sessRes.data) {
        setError(`Failed on session "${r.raw_game_name || '(no game)'}": ${sessRes.error?.message ?? 'no data'}`);
        setBusy(false);
        return;
      }
      const sessionId = sessRes.data.id as string;

      // 2) Create score rows for matched players (skip unmatched)
      const scoreRows = r.players
        .filter((p) => p.profile_id)
        .map((p) => ({
          session_id: sessionId,
          profile_id: p.profile_id,
          score: p.score,
          placement: p.placement,
        }));
      if (scoreRows.length > 0) {
        const scoresRes = await supabase.from('game_session_scores').insert(scoreRows);
        if (scoresRes.error) {
          setError(`Saved session but failed to add players: ${scoresRes.error.message}`);
          setBusy(false);
          return;
        }
      }
      imported++;
    }

    setBusy(false);
    onImported(imported);
  };

  const sourceLabel = source === 'photo' ? 'photo' : 'Excel sheet';

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-xl text-primary-900">
              Review {rows.length} session{rows.length === 1 ? '' : 's'} from your {sourceLabel}
            </h2>
            {confidence && (
              <p className="text-xs text-slate-500 mt-1">
                AI confidence:{' '}
                <span
                  className={
                    confidence === 'high'
                      ? 'text-emerald-700 font-semibold'
                      : confidence === 'medium'
                        ? 'text-warm-600 font-semibold'
                        : 'text-red-700 font-semibold'
                  }
                >
                  {confidence}
                </span>
              </p>
            )}
            {sourceNotes && (
              <p className="text-xs text-slate-500 italic mt-1">{sourceNotes}</p>
            )}
          </div>
          <button type="button" className="text-sm text-slate-500 hover:underline" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Uncheck any rows you don't want. Edit fields as needed. Players that
          weren't matched to a family member are skipped on import unless you
          assign them.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center text-slate-500">
          No sessions found. Try a clearer photo or check the spreadsheet layout.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => {
            const isOn = selected.has(i);
            return (
              <li
                key={i}
                className={`card transition ${isOn ? '' : 'opacity-50'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => toggleSelect(i)}
                    className="mt-1.5"
                    aria-label={`Include session ${i + 1}`}
                  />
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Game</label>
                        <select
                          className="input"
                          value={r.game_id ?? ''}
                          onChange={(e) => updateRow(i, { game_id: e.target.value || null })}
                        >
                          <option value="">— pick a game —</option>
                          {games.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        {r.raw_game_name && !r.game_id && (
                          <p className="text-[11px] text-warm-600 mt-1">
                            From {sourceLabel}: "{r.raw_game_name}"
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="label">Date</label>
                        <input
                          type="date"
                          className="input"
                          value={r.played_on}
                          onChange={(e) => updateRow(i, { played_on: e.target.value })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">
                        Players ({r.players.filter((p) => p.profile_id).length}/{r.players.length} matched)
                      </label>
                      {r.players.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No players in this session.</p>
                      ) : (
                        <ul className="space-y-1">
                          {r.players.map((p, pi) => {
                            const matched = profiles.find((x) => x.id === p.profile_id);
                            const isWinner = p.placement === 1;
                            return (
                              <li
                                key={pi}
                                className={`grid grid-cols-12 gap-2 items-center p-2 rounded-md border text-sm ${
                                  isWinner ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'
                                }`}
                              >
                                <select
                                  className="input col-span-5 sm:col-span-4 text-sm py-1"
                                  value={p.profile_id ?? ''}
                                  onChange={(e) =>
                                    updatePlayer(i, pi, { profile_id: e.target.value || null })
                                  }
                                >
                                  <option value="">— unmatched: "{p.raw_name}" —</option>
                                  {profiles.map((pr) => (
                                    <option key={pr.id} value={pr.id}>
                                      {displayName(pr)}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="input col-span-3 sm:col-span-2 text-sm py-1"
                                  type="number"
                                  step="any"
                                  placeholder="Score"
                                  value={p.score == null ? '' : p.score}
                                  onChange={(e) =>
                                    updatePlayer(i, pi, {
                                      score: e.target.value === '' ? null : Number(e.target.value),
                                    })
                                  }
                                />
                                <input
                                  className="input col-span-2 text-sm py-1"
                                  type="number"
                                  min={1}
                                  placeholder="Place"
                                  value={p.placement == null ? '' : p.placement}
                                  onChange={(e) =>
                                    updatePlayer(i, pi, {
                                      placement: e.target.value === '' ? null : Number(e.target.value),
                                    })
                                  }
                                />
                                <span className="col-span-1 text-center text-xs">
                                  {matched ? '✓' : '⚠'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removePlayer(i, pi)}
                                  className="col-span-1 text-xs text-red-600 hover:underline"
                                  title="Remove player"
                                >
                                  ✕
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {r.notes && (
                      <div>
                        <label className="label">Notes</label>
                        <textarea
                          className="input min-h-[40px] text-sm"
                          value={r.notes}
                          onChange={(e) => updateRow(i, { notes: e.target.value })}
                        />
                      </div>
                    )}

                    {r.warnings.length > 0 && (
                      <ul className="text-xs text-warm-600 list-disc pl-4">
                        {r.warnings.map((w, wi) => (
                          <li key={wi}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div className="card border-red-300 text-red-700 bg-red-50">{error}</div>
      )}

      <div className="card sticky bottom-0 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {selected.size} of {rows.length} selected
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={importNow}
            disabled={busy || selected.size === 0}
          >
            {busy ? 'Importing…' : `Import ${selected.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}
