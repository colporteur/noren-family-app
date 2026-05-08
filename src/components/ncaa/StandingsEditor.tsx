import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { NcaaStanding } from '../../lib/ncaaPool';
import { parsePastedStandings, sortByPoints } from '../../lib/ncaaPool';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  poolYear: number;
  standings: NcaaStanding[];
  profiles: Profile[];
  onChanged: () => void;
  onClose: () => void;
}

interface EditRow {
  id: string | null;       // null = unsaved
  profile_id: string | null;
  bracket_name: string;
  points: string;          // text input
  notes: string;
}

export default function StandingsEditor({ poolYear, standings, profiles, onChanged, onClose }: Props) {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(
      sortByPoints(standings).map((s) => ({
        id: s.id,
        profile_id: s.profile_id,
        bracket_name: s.bracket_name ?? '',
        points: s.points.toString(),
        notes: s.notes ?? '',
      })),
    );
  }, [standings]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const setRow = (i: number, patch: Partial<EditRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: null, profile_id: null, bracket_name: '', points: '0', notes: '' },
    ]);
  };

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const importFromPaste = () => {
    const parsed = parsePastedStandings(pasteText);
    if (parsed.length === 0) {
      setError('Nothing parseable in the pasted text. Use lines like "Mom 142".');
      return;
    }

    // Try to match each parsed name against existing profiles or existing rows
    const newRows: EditRow[] = parsed.map((p) => {
      // Try exact (case-insensitive) match against display name first
      const target = p.bracket_name.toLowerCase();
      let matchedProfile: Profile | null = null;
      for (const prof of profiles) {
        const candidates = [
          prof.first_name,
          prof.last_name,
          prof.nickname,
          displayName(prof),
        ]
          .filter(Boolean)
          .map((s) => (s as string).toLowerCase());
        if (candidates.some((c) => c === target || c.includes(target) || target.includes(c))) {
          matchedProfile = prof;
          break;
        }
      }
      return {
        id: null,
        profile_id: matchedProfile?.id ?? null,
        bracket_name: matchedProfile ? '' : p.bracket_name,
        points: p.points.toString(),
        notes: p.notes ?? '',
      };
    });

    setRows((prev) => [...prev, ...newRows]);
    setPasteText('');
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);

    // Validate — collect errors instead of throwing so we never leave busy=true
    const validationErrors: string[] = [];
    const cleaned: Array<{
      id: string | null;
      pool_year: number;
      profile_id: string | null;
      bracket_name: string | null;
      points: number;
      notes: string | null;
    }> = [];
    rows.forEach((r, i) => {
      const profile_id = r.profile_id || null;
      const bracket_name = r.bracket_name.trim();
      if (!profile_id && !bracket_name) {
        validationErrors.push(`Row ${i + 1}: pick a family member or type a bracket name.`);
        return;
      }
      const pointsStr = r.points.trim();
      if (pointsStr === '') {
        validationErrors.push(`Row ${i + 1}: points is empty.`);
        return;
      }
      const points = parseInt(pointsStr, 10);
      if (!Number.isFinite(points)) {
        validationErrors.push(`Row ${i + 1}: "${r.points}" isn't a number.`);
        return;
      }
      cleaned.push({
        id: r.id,
        pool_year: poolYear,
        profile_id,
        bracket_name: profile_id ? null : bracket_name,
        points,
        notes: r.notes.trim() || null,
      });
    });

    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      setBusy(false);
      return;
    }

    try {
      // Compute the IDs we kept; anything in original not in new = delete
      const originalIds = new Set(standings.map((s) => s.id));
      const keptIds = new Set(cleaned.filter((c) => c.id).map((c) => c.id as string));
      const toDelete = [...originalIds].filter((id) => !keptIds.has(id));
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('ncaa_pool_standings')
          .delete()
          .in('id', toDelete);
        if (delErr) throw delErr;
      }

      // Update existing
      for (const c of cleaned.filter((x) => x.id)) {
        const { id, ...patch } = c;
        const { error: upErr } = await supabase
          .from('ncaa_pool_standings')
          .update(patch)
          .eq('id', id as string);
        if (upErr) throw upErr;
      }

      // Insert new
      const newOnes = cleaned.filter((x) => !x.id).map(({ id: _ignored, ...rest }) => rest);
      if (newOnes.length > 0) {
        const { error: insErr } = await supabase.from('ncaa_pool_standings').insert(newOnes);
        if (insErr) throw insErr;
      }

      setBusy(false);
      onChanged();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setBusy(false);
    }
  };

  const usedProfileIds = useMemo(
    () => new Set(rows.map((r) => r.profile_id).filter(Boolean) as string[]),
    [rows],
  );

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-primary-900">Edit standings — {poolYear}</h3>
        <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:underline">
          Cancel
        </button>
      </div>

      {/* Bulk paste */}
      <details className="border border-slate-200 rounded-md p-3">
        <summary className="text-sm font-semibold cursor-pointer text-primary-900">
          📋 Paste from a spreadsheet
        </summary>
        <div className="mt-3 space-y-2">
          <textarea
            className="input min-h-[100px] font-mono text-xs"
            placeholder={`Mom 142\nTodd 138\nCarter 121\nGrandpops 99 last place haha`}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <p className="text-[11px] text-slate-500">
            One row per line. Format: <code>name [points] [optional notes]</code>. Family members with matching names get auto-linked.
          </p>
          <button type="button" className="btn-secondary text-sm" onClick={importFromPaste}>
            Add to rows below
          </button>
        </div>
      </details>

      {/* Per-row editor */}
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={r.id ?? `new-${i}`}
            className="grid grid-cols-12 gap-2 items-center p-2 rounded-md border border-slate-200"
          >
            <select
              className="input col-span-4 text-sm py-1"
              value={r.profile_id ?? ''}
              onChange={(e) =>
                setRow(i, {
                  profile_id: e.target.value || null,
                  // If picking a profile, clear the freetext name
                  bracket_name: e.target.value ? '' : r.bracket_name,
                })
              }
            >
              <option value="">— freetext bracket —</option>
              {profiles.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={usedProfileIds.has(p.id) && r.profile_id !== p.id}
                >
                  {displayName(p)}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="input col-span-3 text-sm py-1"
              placeholder={r.profile_id ? '(family member)' : 'Bracket name'}
              value={r.bracket_name}
              onChange={(e) => setRow(i, { bracket_name: e.target.value })}
              disabled={!!r.profile_id}
            />
            <input
              type="number"
              className="input col-span-2 text-sm py-1 text-right"
              placeholder="Points"
              value={r.points}
              onChange={(e) => setRow(i, { points: e.target.value })}
            />
            <input
              type="text"
              className="input col-span-2 text-sm py-1"
              placeholder="Notes"
              value={r.notes}
              onChange={(e) => setRow(i, { notes: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="col-span-1 text-xs text-red-600 hover:underline"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="btn-secondary text-sm" onClick={addRow}>
        + Add row
      </button>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-primary-100">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save standings'}
        </button>
      </div>
    </div>
  );
}
