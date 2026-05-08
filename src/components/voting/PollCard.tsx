import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Ballot, Poll, PollOption } from '../../lib/voting';
import { distinctVoterCount, isOpenNow, modeLabel, tallyPoll } from '../../lib/voting';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  poll: Poll;
  options: PollOption[];
  ballots: Ballot[];
  profiles: Profile[];
  onChanged: () => void;
}

export default function PollCard({ poll, options, ballots, profiles, onChanged }: Props) {
  const { profile, isDictator } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [editingVote, setEditingVote] = useState(false);

  const open = isOpenNow(poll);
  const myBallots = useMemo(
    () => ballots.filter((b) => b.voter_id === profile?.id),
    [ballots, profile?.id],
  );
  const hasVoted = myBallots.length > 0;
  const showResults = !poll.hide_results_until_close || !open;

  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => a.sort_order - b.sort_order),
    [options],
  );

  /* ---------------- Voting submit ---------------- */

  const submitVote = async (newOptionIds: string[], ranks?: Record<string, number>) => {
    if (!profile) return;
    setBusy(true);
    setError(null);

    // Wipe any prior ballots from this voter on this poll, then insert fresh.
    const { error: delErr } = await supabase
      .from('votes_ballots')
      .delete()
      .eq('poll_id', poll.id)
      .eq('voter_id', profile.id);
    if (delErr) {
      setError(delErr.message);
      setBusy(false);
      return;
    }

    if (newOptionIds.length > 0) {
      const rows = newOptionIds.map((optionId) => ({
        poll_id: poll.id,
        voter_id: profile.id,
        option_id: optionId,
        rank: ranks?.[optionId] ?? null,
      }));
      const { error: insErr } = await supabase.from('votes_ballots').insert(rows);
      if (insErr) {
        setError(insErr.message);
        setBusy(false);
        return;
      }
    }

    setBusy(false);
    setEditingVote(false);
    onChanged();
  };

  /* ---------------- Dictator actions ---------------- */

  const closeNow = async () => {
    if (!confirm('Close this poll now? Family members can still see results, but no more votes.')) return;
    setBusy(true);
    const { error } = await supabase
      .from('votes_polls')
      .update({ is_open: false })
      .eq('id', poll.id);
    // Also rescind the announcement banner
    await supabase
      .from('announcements')
      .update({ is_active: false })
      .eq('source', 'voting_poll')
      .eq('source_id', poll.id);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  const reopen = async () => {
    setBusy(true);
    const { error } = await supabase
      .from('votes_polls')
      .update({ is_open: true })
      .eq('id', poll.id);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  const deletePoll = async () => {
    if (!confirm(`Delete "${poll.title}" and all its ballots? This cannot be undone.`)) return;
    setBusy(true);
    const { error } = await supabase.from('votes_polls').delete().eq('id', poll.id);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  /* ---------------- Render ---------------- */

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const totalVoters = distinctVoterCount(ballots);
  const showVoteForm = open && (!hasVoted || editingVote);

  return (
    <div className={`card space-y-3 ${!open ? 'opacity-95' : ''}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-xl text-primary-900">{poll.title}</h3>
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary-100 text-primary-800">
              {modeLabel(poll.mode)}
            </span>
            {!open && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                Closed
              </span>
            )}
            {poll.hide_results_until_close && open && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-warm-100 text-warm-600">
                🤐 Results hidden
              </span>
            )}
          </div>
          {poll.description && (
            <p className="text-sm text-slate-600 mt-1">{poll.description}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {totalVoters} {totalVoters === 1 ? 'voter' : 'voters'}
            {poll.closes_at && (
              <span>
                {' · '}
                {open
                  ? `closes ${new Date(poll.closes_at).toLocaleString()}`
                  : `closed ${new Date(poll.closes_at).toLocaleString()}`}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Vote interface */}
      {showVoteForm && (
        <VoteInterface
          poll={poll}
          options={sortedOptions}
          existingBallots={myBallots}
          busy={busy}
          onSubmit={submitVote}
          onCancel={hasVoted ? () => setEditingVote(false) : undefined}
        />
      )}

      {/* Your vote summary */}
      {hasVoted && !editingVote && (
        <YourVoteSummary
          poll={poll}
          options={sortedOptions}
          myBallots={myBallots}
          onEdit={open ? () => setEditingVote(true) : undefined}
        />
      )}

      {/* Results */}
      {showResults && (
        <Results
          poll={poll}
          options={sortedOptions}
          ballots={ballots}
        />
      )}

      {/* Dictator audit */}
      {isDictator && totalVoters > 0 && (
        <div className="border-t border-primary-100 pt-3">
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            className="text-xs text-primary-700 hover:underline"
          >
            {showAudit ? 'Hide' : 'Show'} audit trail (Dictator-only)
          </button>
          {showAudit && (
            <ul className="mt-2 text-xs text-slate-600 space-y-1">
              {ballots
                .slice()
                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                .map((b) => {
                  const v = profileById.get(b.voter_id);
                  const opt = options.find((o) => o.id === b.option_id);
                  return (
                    <li key={b.id}>
                      <strong>{v ? displayName(v) : '?'}</strong> picked{' '}
                      <em>{opt?.label ?? '?'}</em>
                      {b.rank != null && <span> (rank #{b.rank})</span>}
                      <span className="text-slate-400"> · {new Date(b.created_at).toLocaleString()}</span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}

      {/* Dictator close/delete */}
      {isDictator && (
        <div className="border-t border-primary-100 pt-3 flex flex-wrap gap-2">
          {open ? (
            <button type="button" className="btn-secondary text-xs" onClick={closeNow} disabled={busy}>
              Close poll
            </button>
          ) : (
            <button type="button" className="btn-secondary text-xs" onClick={reopen} disabled={busy}>
              Reopen poll
            </button>
          )}
          <button type="button" className="btn-secondary text-xs text-red-700" onClick={deletePoll} disabled={busy}>
            Delete poll
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

/* ---------------- Vote interface ---------------- */

interface VoteIfaceProps {
  poll: Poll;
  options: PollOption[];
  existingBallots: Ballot[];
  busy: boolean;
  onSubmit: (optionIds: string[], ranks?: Record<string, number>) => void;
  onCancel?: () => void;
}

function VoteInterface({ poll, options, existingBallots, busy, onSubmit, onCancel }: VoteIfaceProps) {
  if (poll.mode === 'single') return <VoteSingle {...{ poll, options, existingBallots, busy, onSubmit, onCancel }} />;
  if (poll.mode === 'multi') return <VoteMulti {...{ poll, options, existingBallots, busy, onSubmit, onCancel }} />;
  return <VoteRanked {...{ poll, options, existingBallots, busy, onSubmit, onCancel }} />;
}

function VoteSingle({ options, existingBallots, busy, onSubmit, onCancel }: VoteIfaceProps) {
  const initial = existingBallots[0]?.option_id ?? '';
  const [selected, setSelected] = useState<string>(initial);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {options.map((o) => (
          <li key={o.id}>
            <label className="flex items-center gap-3 p-2 rounded-md border border-slate-200 hover:border-primary-300 cursor-pointer">
              <input
                type="radio"
                name="vote"
                value={o.id}
                checked={selected === o.id}
                onChange={() => setSelected(o.id)}
              />
              <span className="text-sm text-primary-900">{o.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !selected}
          onClick={() => onSubmit(selected ? [selected] : [])}
        >
          {busy ? 'Saving…' : 'Cast vote'}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function VoteMulti({ options, existingBallots, busy, onSubmit, onCancel }: VoteIfaceProps) {
  const initial = new Set(existingBallots.map((b) => b.option_id));
  const [selected, setSelected] = useState<Set<string>>(initial);

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {options.map((o) => (
          <li key={o.id}>
            <label className="flex items-center gap-3 p-2 rounded-md border border-slate-200 hover:border-primary-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                onChange={() => toggle(o.id)}
              />
              <span className="text-sm text-primary-900">{o.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || selected.size === 0}
          onClick={() => onSubmit(Array.from(selected))}
        >
          {busy ? 'Saving…' : `Cast vote (${selected.size})`}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function VoteRanked({ options, existingBallots, busy, onSubmit, onCancel }: VoteIfaceProps) {
  // Build initial order from existing ballots' ranks
  const initial = (() => {
    const ranked = existingBallots
      .filter((b) => b.rank != null)
      .sort((a, b) => (a.rank as number) - (b.rank as number));
    return ranked.map((b) => b.option_id);
  })();
  const [order, setOrder] = useState<string[]>(initial);

  const click = (id: string) => {
    if (order.includes(id)) {
      setOrder(order.filter((x) => x !== id));
    } else {
      setOrder([...order, id]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Click an option to rank it. Click again to remove. Your top pick is rank #1.
      </p>
      <ul className="space-y-2">
        {options.map((o) => {
          const rankIdx = order.indexOf(o.id);
          const ranked = rankIdx >= 0;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => click(o.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-md border text-left transition ${
                  ranked
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-slate-200 hover:border-primary-300'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-full grid place-items-center text-xs font-semibold ${
                    ranked ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {ranked ? `#${rankIdx + 1}` : '—'}
                </span>
                <span className="text-sm text-primary-900">{o.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || order.length === 0}
          onClick={() => {
            const ranks: Record<string, number> = {};
            order.forEach((id, i) => {
              ranks[id] = i + 1;
            });
            onSubmit(order, ranks);
          }}
        >
          {busy ? 'Saving…' : `Submit ranking (${order.length}/${options.length})`}
        </button>
        {order.length > 0 && (
          <button type="button" className="btn-secondary text-sm" onClick={() => setOrder([])} disabled={busy}>
            Clear
          </button>
        )}
        {onCancel && (
          <button type="button" className="btn-secondary text-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Your vote summary ---------------- */

interface YourVoteProps {
  poll: Poll;
  options: PollOption[];
  myBallots: Ballot[];
  onEdit?: () => void;
}

function YourVoteSummary({ poll, options, myBallots, onEdit }: YourVoteProps) {
  const optById = new Map(options.map((o) => [o.id, o]));
  const sorted = [...myBallots].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 flex items-start justify-between gap-2">
      <div className="text-sm text-emerald-900">
        <p className="font-semibold">✓ You voted</p>
        <p className="text-xs mt-0.5">
          {poll.mode === 'single' && (optById.get(myBallots[0].option_id)?.label ?? '?')}
          {poll.mode === 'multi' && sorted.map((b) => optById.get(b.option_id)?.label ?? '?').join(', ')}
          {poll.mode === 'ranked' &&
            sorted.map((b) => `#${b.rank} ${optById.get(b.option_id)?.label ?? '?'}`).join(' · ')}
        </p>
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="text-xs text-emerald-700 hover:underline shrink-0">
          Change
        </button>
      )}
    </div>
  );
}

/* ---------------- Results ---------------- */

function Results({ poll, options, ballots }: { poll: Poll; options: PollOption[]; ballots: Ballot[] }) {
  const results = tallyPoll(poll, options, ballots);
  const max = results.reduce((m, r) => Math.max(m, r.score), 0) || 1;

  if (ballots.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic">No votes yet.</div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
        Results {poll.mode === 'ranked' && '(Borda count — higher is better)'}
      </p>
      <ul className="space-y-1">
        {results.map((r) => (
          <li key={r.option_id} className="flex items-center gap-2 text-sm">
            <span className="w-44 truncate" title={r.label}>
              {r.is_winner && '👑 '}
              {r.label}
            </span>
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${r.is_winner ? 'bg-amber-500' : 'bg-primary-500'}`}
                style={{ width: `${(r.score / max) * 100}%` }}
              />
            </div>
            <span className="w-16 text-right text-xs text-slate-600 tabular-nums">
              {r.score}
              {r.avg_rank != null && (
                <span className="text-slate-400"> · avg #{r.avg_rank.toFixed(1)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
