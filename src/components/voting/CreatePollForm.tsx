import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { PollMode } from '../../lib/voting';
import { modeLabel } from '../../lib/voting';

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

export default function CreatePollForm({ onCreated, onCancel }: Props) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<PollMode>('single');
  const [optionsText, setOptionsText] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [hideResults, setHideResults] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const optLines = optionsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (!title.trim()) {
      setError('Title is required.');
      setBusy(false);
      return;
    }
    if (optLines.length < 2) {
      setError('Need at least 2 options. Put one option per line.');
      setBusy(false);
      return;
    }

    // Convert local datetime input to ISO if provided
    const closesIso = closesAt ? new Date(closesAt).toISOString() : null;

    // 1) Insert the poll
    const pollIns = await supabase
      .from('votes_polls')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        mode,
        closes_at: closesIso,
        hide_results_until_close: hideResults,
        created_by: profile?.id ?? null,
      })
      .select('*')
      .single();

    if (pollIns.error || !pollIns.data) {
      setError(pollIns.error?.message ?? 'Failed to create poll.');
      setBusy(false);
      return;
    }
    const pollId = pollIns.data.id as string;

    // 2) Insert the options
    const optIns = await supabase.from('votes_options').insert(
      optLines.map((label, i) => ({
        poll_id: pollId,
        label,
        sort_order: i,
      })),
    );
    if (optIns.error) {
      setError(`Poll created but options failed: ${optIns.error.message}`);
      setBusy(false);
      return;
    }

    // 3) Post a banner so it shows up on the home page
    await supabase.from('announcements').insert({
      source: 'voting_poll',
      source_id: pollId,
      sender_id: profile?.id ?? null,
      emoji: '🗳️',
      message: `New poll: "${title.trim()}" — ${optLines.length} options · ${modeLabel(mode).toLowerCase()}`,
      variant: 'info',
      link_path: '/apps/voting',
      expires_at: closesIso,
    });

    setBusy(false);
    onCreated();
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-primary-900">Create a new poll</h2>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:underline">
          Cancel
        </button>
      </div>

      <div>
        <label className="label">Question</label>
        <input
          type="text"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Which restaurant for Sunday dinner?"'
          autoFocus
          required
        />
      </div>

      <div>
        <label className="label">Description (optional)</label>
        <textarea
          className="input min-h-[60px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="More context for the family"
        />
      </div>

      <div>
        <label className="label">Voting mode</label>
        <div className="grid grid-cols-3 gap-2">
          {(['single', 'multi', 'ranked'] as PollMode[]).map((m) => (
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
              <div className="text-[11px] text-slate-500 mt-0.5">
                {m === 'single' && 'Pick one'}
                {m === 'multi' && 'Pick any number'}
                {m === 'ranked' && 'Order them'}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Options (one per line — at least 2)</label>
        <textarea
          className="input min-h-[100px] font-mono text-sm"
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          placeholder={`The Tavern\nLuigi's\nThe Diner`}
          required
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Closes at (optional)</label>
          <input
            type="datetime-local"
            className="input"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 mt-7">
          <input
            type="checkbox"
            checked={hideResults}
            onChange={(e) => setHideResults(e.target.checked)}
          />
          Hide results until the poll closes
        </label>
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
          {busy ? 'Creating…' : '🗳️ Open the poll'}
        </button>
      </div>
    </form>
  );
}
