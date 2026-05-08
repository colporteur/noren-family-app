import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { MeetingMode } from '../../lib/meetings';
import { modeBlurb, modeLabel } from '../../lib/meetings';

interface OptionDraft {
  starts_at: string;   // datetime-local string
  location: string;
  label: string;
}

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

export default function CreateProposalForm({ onCreated, onCancel }: Props) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [mode, setMode] = useState<MeetingMode>('available');
  const [options, setOptions] = useState<OptionDraft[]>([
    { starts_at: '', location: '', label: '' },
    { starts_at: '', location: '', label: '' },
  ]);
  const [closesAt, setClosesAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addOption = () => {
    setOptions((o) => [...o, { starts_at: '', location: '', label: '' }]);
  };
  const removeOption = (i: number) => {
    setOptions((o) => o.filter((_, idx) => idx !== i));
  };
  const updateOption = (i: number, patch: Partial<OptionDraft>) => {
    setOptions((o) => o.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (!title.trim()) {
      setError('Title is required.');
      setBusy(false);
      return;
    }

    const filledOptions = options.filter(
      (o) => o.starts_at || o.location.trim() || o.label.trim(),
    );
    if (filledOptions.length < 2) {
      setError('Add at least 2 options (each needs a date/time, location, or label).');
      setBusy(false);
      return;
    }

    const closesIso = closesAt ? new Date(closesAt).toISOString() : null;

    // 1) Insert proposal
    const propIns = await supabase
      .from('meeting_proposals')
      .insert({
        title: title.trim(),
        purpose: purpose.trim() || null,
        mode,
        closes_at: closesIso,
        created_by: profile?.id ?? null,
      })
      .select('*')
      .single();
    if (propIns.error || !propIns.data) {
      setError(propIns.error?.message ?? 'Failed to create proposal.');
      setBusy(false);
      return;
    }
    const proposalId = propIns.data.id as string;

    // 2) Insert options
    const optIns = await supabase.from('meeting_options').insert(
      filledOptions.map((o, i) => ({
        proposal_id: proposalId,
        starts_at: o.starts_at ? new Date(o.starts_at).toISOString() : null,
        location: o.location.trim() || null,
        label: o.label.trim() || null,
        sort_order: i,
      })),
    );
    if (optIns.error) {
      setError(`Proposal created but options failed: ${optIns.error.message}`);
      setBusy(false);
      return;
    }

    // 3) Banner
    await supabase.from('announcements').insert({
      source: 'meeting_proposal',
      source_id: proposalId,
      sender_id: profile?.id ?? null,
      emoji: '📅',
      message: `New meeting proposal: "${title.trim()}" — ${filledOptions.length} options · ${modeLabel(mode).toLowerCase()}`,
      variant: 'info',
      link_path: '/apps/meetings',
      expires_at: closesIso,
    });

    setBusy(false);
    onCreated();
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-primary-900">Propose a meeting</h2>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:underline">
          Cancel
        </button>
      </div>

      <div>
        <label className="label">Title</label>
        <input
          type="text"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Family meeting Q4"'
          autoFocus
          required
        />
      </div>

      <div>
        <label className="label">Purpose / description (optional)</label>
        <textarea
          className="input min-h-[60px]"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="What needs to be decided / discussed"
        />
      </div>

      <div>
        <label className="label">Response mode</label>
        <div className="grid grid-cols-3 gap-2">
          {(['available', 'voting', 'ranked'] as MeetingMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`p-3 rounded-lg border-2 text-left transition ${
                mode === m
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-slate-200 hover:border-primary-200'
              }`}
            >
              <div className="font-semibold text-primary-900 text-sm">{modeLabel(m)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{modeBlurb(m)}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Candidate options (at least 2)</label>
        <ul className="space-y-2">
          {options.map((o, i) => (
            <li key={i} className="grid grid-cols-12 gap-2 items-start p-2 rounded-md border border-slate-200">
              <span className="col-span-1 text-xs font-semibold text-primary-700 mt-2">#{i + 1}</span>
              <div className="col-span-11 grid sm:grid-cols-3 gap-2">
                <input
                  type="datetime-local"
                  className="input text-sm py-1"
                  value={o.starts_at}
                  onChange={(e) => updateOption(i, { starts_at: e.target.value })}
                  title="Date and time"
                />
                <input
                  type="text"
                  className="input text-sm py-1"
                  value={o.location}
                  onChange={(e) => updateOption(i, { location: e.target.value })}
                  placeholder="Location (optional)"
                />
                <div className="flex gap-1">
                  <input
                    type="text"
                    className="input text-sm py-1 flex-1"
                    value={o.label}
                    onChange={(e) => updateOption(i, { label: e.target.value })}
                    placeholder="Label (optional)"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-xs text-red-600 hover:text-red-700 px-2"
                      title="Remove this option"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addOption} className="btn-secondary text-sm mt-2">
          + Add option
        </button>
        <p className="text-[11px] text-slate-500 mt-1">
          Each option just needs at least one of date/time, location, or label.
        </p>
      </div>

      <div>
        <label className="label">Closes at (optional)</label>
        <input
          type="datetime-local"
          className="input"
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
        />
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-primary-100">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Posting…' : '📅 Post proposal'}
        </button>
      </div>
    </form>
  );
}
