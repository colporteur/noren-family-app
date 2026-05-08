import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { BoardGame } from '../../lib/boardGames';

interface Props {
  /** Pass an existing game to edit, or null to add a new one. */
  game: BoardGame | null;
  /** Called after a successful save with the saved game. */
  onSaved: (g: BoardGame) => void;
  /** Called when the user cancels (close modal). */
  onCancel: () => void;
}

const emptyForm = {
  name: '',
  min_players: '',
  max_players: '',
  typical_minutes: '',
  weight: '',
  tags: '',          // comma-separated in the input, split into array on save
  notes: '',
  is_owned: true,
};

interface LookupResult {
  confidence: 'high' | 'medium' | 'low';
  min_players?: number;
  max_players?: number;
  typical_minutes?: number;
  weight?: number;
  tags?: string[];
  notes?: string;
  canonical_name?: string;
}

export default function GameForm({ game, onSaved, onCancel }: Props) {
  const { profile } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Look up with Claude" state
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);

  useEffect(() => {
    if (game) {
      setForm({
        name: game.name,
        min_players: game.min_players?.toString() ?? '',
        max_players: game.max_players?.toString() ?? '',
        typical_minutes: game.typical_minutes?.toString() ?? '',
        weight: game.weight?.toString() ?? '',
        tags: (game.tags ?? []).join(', '),
        notes: game.notes ?? '',
        is_owned: game.is_owned,
      });
    } else {
      setForm(emptyForm);
    }
    setLookupMsg(null);
    setLookupErr(null);
  }, [game]);

  // Reset lookup status messages whenever the user changes the name.
  const onNameChange = (v: string) => {
    setForm({ ...form, name: v });
    setLookupMsg(null);
    setLookupErr(null);
  };

  const lookup = async () => {
    const name = form.name.trim();
    if (!name) {
      setLookupErr('Type the game name first.');
      return;
    }
    setLooking(true);
    setLookupErr(null);
    setLookupMsg(null);

    const { data, error } = await supabase.functions.invoke<LookupResult>(
      'enrich-board-game',
      { body: { name } },
    );

    setLooking(false);

    if (error) {
      setLookupErr(error.message ?? 'Lookup failed.');
      return;
    }
    if (!data) {
      setLookupErr('No data returned.');
      return;
    }
    if (data.confidence === 'low') {
      setLookupErr(
        "Claude wasn't sure that's a real game. Double-check the name (or fill the fields by hand).",
      );
      return;
    }

    // Merge: only fill empty fields (don't overwrite anything the user typed).
    const filled: string[] = [];
    setForm((prev) => {
      const next = { ...prev };
      const setIfEmpty = (
        key: keyof typeof emptyForm,
        value: string | undefined,
        label: string,
      ) => {
        if (value && !next[key]) {
          (next as any)[key] = value;
          filled.push(label);
        }
      };
      setIfEmpty('min_players', data.min_players?.toString(), 'min players');
      setIfEmpty('max_players', data.max_players?.toString(), 'max players');
      setIfEmpty('typical_minutes', data.typical_minutes?.toString(), 'time');
      // Round weight to nearest 0.1 — the form's complexity input uses step="0.1"
      // and rejects values like 1.85. Round defensively in case Claude gives us
      // a 2-decimal value despite the prompt asking for 1.
      const roundedWeight =
        data.weight != null
          ? (Math.round(data.weight * 10) / 10).toFixed(1)
          : undefined;
      setIfEmpty('weight', roundedWeight, 'complexity');
      setIfEmpty(
        'tags',
        data.tags && data.tags.length ? data.tags.join(', ') : undefined,
        'tags',
      );
      setIfEmpty('notes', data.notes, 'notes');

      // If the user typed a near-miss, suggest the canonical name only when
      // their input is empty-ish or wildly different (and don't overwrite).
      if (data.canonical_name && !next.name) {
        next.name = data.canonical_name;
        filled.push('name');
      }
      return next;
    });

    if (filled.length === 0) {
      setLookupMsg('Looked up — all fields already filled, nothing changed.');
    } else {
      setLookupMsg(
        `Filled in: ${filled.join(', ')}. Edit anything that doesn't look right, then save.` +
          (data.confidence === 'medium' ? ' (Medium confidence — worth a glance.)' : ''),
      );
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      min_players: form.min_players ? parseInt(form.min_players, 10) : null,
      max_players: form.max_players ? parseInt(form.max_players, 10) : null,
      typical_minutes: form.typical_minutes ? parseInt(form.typical_minutes, 10) : null,
      weight: form.weight ? parseFloat(form.weight) : null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: form.notes.trim() || null,
      is_owned: form.is_owned,
      added_by: profile?.id ?? null,
    };

    if (!payload.name) {
      setError('Game name is required.');
      setBusy(false);
      return;
    }

    let result;
    if (game) {
      // Don't overwrite added_by on edit
      const { added_by: _ignored, ...updatePayload } = payload;
      result = await supabase
        .from('board_games')
        .update(updatePayload)
        .eq('id', game.id)
        .select('*')
        .single();
    } else {
      result = await supabase
        .from('board_games')
        .insert(payload)
        .select('*')
        .single();
    }

    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onSaved(result.data as BoardGame);
  };

  return (
    <form onSubmit={onSubmit} className="card grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Name</label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={form.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Catan"
            autoFocus
            required
          />
          <button
            type="button"
            className="btn-secondary whitespace-nowrap"
            onClick={lookup}
            disabled={looking || !form.name.trim()}
            title="Ask Claude to fill in the rest"
          >
            {looking ? 'Looking up…' : '✨ Look it up'}
          </button>
        </div>
        {lookupMsg && (
          <p className="text-xs text-emerald-700 mt-1">{lookupMsg}</p>
        )}
        {lookupErr && (
          <p className="text-xs text-red-700 mt-1">{lookupErr}</p>
        )}
      </div>

      <div>
        <label className="label">Min players</label>
        <input
          className="input"
          type="number"
          min={1}
          value={form.min_players}
          onChange={(e) => setForm({ ...form, min_players: e.target.value })}
          placeholder="2"
        />
      </div>
      <div>
        <label className="label">Max players</label>
        <input
          className="input"
          type="number"
          min={1}
          value={form.max_players}
          onChange={(e) => setForm({ ...form, max_players: e.target.value })}
          placeholder="4"
        />
      </div>

      <div>
        <label className="label">Typical play time (min)</label>
        <input
          className="input"
          type="number"
          min={1}
          value={form.typical_minutes}
          onChange={(e) => setForm({ ...form, typical_minutes: e.target.value })}
          placeholder="60"
        />
      </div>
      <div>
        <label className="label">Complexity (1.0 light → 5.0 heavy)</label>
        <input
          className="input"
          type="number"
          step="0.1"
          min={1}
          max={5}
          value={form.weight}
          onChange={(e) => setForm({ ...form, weight: e.target.value })}
          placeholder="2.5"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="label">Tags (comma-separated)</label>
        <input
          className="input"
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          placeholder="strategy, family, 30-minute, party"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="label">Notes</label>
        <textarea
          className="input min-h-[60px]"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="House rules, where it lives on the shelf, etc."
        />
      </div>

      <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.is_owned}
          onChange={(e) => setForm({ ...form, is_owned: e.target.checked })}
        />
        We own this game
      </label>

      {error && (
        <div className="sm:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="sm:col-span-2 flex items-center justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : game ? 'Save changes' : 'Add to shelf'}
        </button>
      </div>
    </form>
  );
}
