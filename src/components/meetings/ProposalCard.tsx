import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type {
  AvailabilityResponse,
  MeetingOption,
  MeetingProposal,
  MeetingResponse,
} from '../../lib/meetings';
import {
  describeOption,
  isOpenNow,
  modeLabel,
  notRespondedYet,
  tally,
} from '../../lib/meetings';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  proposal: MeetingProposal;
  options: MeetingOption[];
  responses: MeetingResponse[];
  profiles: Profile[];        // active (non-deceased) profiles
  onChanged: () => void;
}

export default function ProposalCard({ proposal, options, responses, profiles, onChanged }: Props) {
  const { profile, isDictator } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = isOpenNow(proposal);
  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => a.sort_order - b.sort_order),
    [options],
  );
  const tallies = useMemo(
    () => tally(proposal, sortedOptions, responses),
    [proposal, sortedOptions, responses],
  );
  const tallyById = new Map(tallies.map((t) => [t.option_id, t]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const myResponses = useMemo(() => {
    if (!profile) return [];
    return responses.filter(
      (r) =>
        r.profile_id === profile.id &&
        sortedOptions.some((o) => o.id === r.option_id),
    );
  }, [responses, profile, sortedOptions]);

  const myResponseByOption = new Map(myResponses.map((r) => [r.option_id, r]));

  const waitingFor = useMemo(
    () => notRespondedYet(sortedOptions, responses, profiles.map((p) => p.id)),
    [sortedOptions, responses, profiles],
  );

  const showWaitingPanel = isDictator || profile?.id === proposal.created_by;

  /* ---------------- Response handlers ---------------- */

  const upsertAvailability = async (optionId: string, response: AvailabilityResponse | null) => {
    if (!profile) return;
    setBusy(true);
    setError(null);

    if (response === null) {
      // Clear → delete
      const { error } = await supabase
        .from('meeting_responses')
        .delete()
        .eq('option_id', optionId)
        .eq('profile_id', profile.id);
      setBusy(false);
      if (error) setError(error.message);
      else onChanged();
      return;
    }

    const { error } = await supabase.from('meeting_responses').upsert(
      {
        option_id: optionId,
        profile_id: profile.id,
        response,
        rank: null,
      },
      { onConflict: 'option_id,profile_id' },
    );
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  const toggleVote = async (optionId: string) => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const existing = myResponseByOption.get(optionId);
    if (existing) {
      const { error } = await supabase
        .from('meeting_responses')
        .delete()
        .eq('id', existing.id);
      setBusy(false);
      if (error) setError(error.message);
      else onChanged();
    } else {
      const { error } = await supabase.from('meeting_responses').insert({
        option_id: optionId,
        profile_id: profile.id,
        response: null,
        rank: null,
      });
      setBusy(false);
      if (error) setError(error.message);
      else onChanged();
    }
  };

  const submitRanking = async (orderOfOptionIds: string[]) => {
    if (!profile) return;
    setBusy(true);
    setError(null);

    // Wipe my prior responses for this proposal
    const myOptionIds = sortedOptions.map((o) => o.id);
    const { error: delErr } = await supabase
      .from('meeting_responses')
      .delete()
      .eq('profile_id', profile.id)
      .in('option_id', myOptionIds);
    if (delErr) {
      setBusy(false);
      setError(delErr.message);
      return;
    }
    if (orderOfOptionIds.length > 0) {
      const rows = orderOfOptionIds.map((optId, i) => ({
        option_id: optId,
        profile_id: profile.id,
        response: null,
        rank: i + 1,
      }));
      const { error: insErr } = await supabase.from('meeting_responses').insert(rows);
      if (insErr) {
        setBusy(false);
        setError(insErr.message);
        return;
      }
    }
    setBusy(false);
    onChanged();
  };

  /* ---------------- Dictator/proposer actions ---------------- */

  const closeNow = async () => {
    if (!confirm('Close this proposal?')) return;
    setBusy(true);
    await supabase.from('meeting_proposals').update({ is_open: false }).eq('id', proposal.id);
    await supabase
      .from('announcements')
      .update({ is_active: false })
      .eq('source', 'meeting_proposal')
      .eq('source_id', proposal.id);
    setBusy(false);
    onChanged();
  };
  const reopen = async () => {
    setBusy(true);
    await supabase.from('meeting_proposals').update({ is_open: true }).eq('id', proposal.id);
    setBusy(false);
    onChanged();
  };
  const deleteProposal = async () => {
    if (!confirm(`Delete "${proposal.title}" and all responses?`)) return;
    setBusy(true);
    await supabase.from('meeting_proposals').delete().eq('id', proposal.id);
    setBusy(false);
    onChanged();
  };

  /* ---------------- Render ---------------- */

  return (
    <div className={`card space-y-4 ${!open ? 'opacity-95' : ''}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-xl text-primary-900">{proposal.title}</h3>
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary-100 text-primary-800">
              {modeLabel(proposal.mode)}
            </span>
            {!open && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                Closed
              </span>
            )}
          </div>
          {proposal.purpose && (
            <p className="text-sm text-slate-600 mt-1">{proposal.purpose}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            By {displayName(profileById.get(proposal.created_by ?? '') ?? ({ email: '?' } as Profile))}
            {' · '}
            {profiles.length - waitingFor.length}/{profiles.length} responded
            {proposal.closes_at && (
              <>
                {' · '}
                {open
                  ? `closes ${new Date(proposal.closes_at).toLocaleString()}`
                  : `closed ${new Date(proposal.closes_at).toLocaleString()}`}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Options */}
      {proposal.mode === 'ranked' ? (
        <RankedInterface
          proposal={proposal}
          options={sortedOptions}
          tallies={tallies}
          myResponses={myResponses}
          busy={busy}
          open={open}
          onSubmit={submitRanking}
        />
      ) : (
        <ul className="space-y-2">
          {sortedOptions.map((o) => {
            const t = tallyById.get(o.id);
            const myResp = myResponseByOption.get(o.id);
            return (
              <OptionRow
                key={o.id}
                proposal={proposal}
                option={o}
                tally={t}
                myResponse={myResp ?? null}
                open={open}
                busy={busy}
                onAvailability={(r) => upsertAvailability(o.id, r)}
                onVoteToggle={() => toggleVote(o.id)}
                isWinner={t?.is_winner ?? false}
              />
            );
          })}
        </ul>
      )}

      {/* Waiting on / responded list */}
      {showWaitingPanel && profiles.length > 0 && (
        <div className="border-t border-primary-100 pt-3">
          {waitingFor.length === 0 ? (
            <p className="text-xs text-emerald-700">✓ Everyone has responded.</p>
          ) : (
            <p className="text-xs text-slate-500">
              Still waiting on:{' '}
              {waitingFor
                .map((id) => profileById.get(id))
                .filter(Boolean)
                .map((p) => displayName(p as Profile))
                .join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Dictator/proposer actions */}
      {(isDictator || profile?.id === proposal.created_by) && (
        <div className="border-t border-primary-100 pt-3 flex flex-wrap gap-2">
          {open ? (
            <button type="button" className="btn-secondary text-xs" onClick={closeNow} disabled={busy}>
              Close
            </button>
          ) : (
            <button type="button" className="btn-secondary text-xs" onClick={reopen} disabled={busy}>
              Reopen
            </button>
          )}
          <button type="button" className="btn-secondary text-xs text-red-700" onClick={deleteProposal} disabled={busy}>
            Delete
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

/* ---------------- Single-option row (for available + voting modes) ---------------- */

interface OptionRowProps {
  proposal: MeetingProposal;
  option: MeetingOption;
  tally: { yes: number; maybe: number; no: number; votes: number; voter_count: number; is_winner: boolean } | undefined;
  myResponse: MeetingResponse | null;
  open: boolean;
  busy: boolean;
  onAvailability: (r: AvailabilityResponse | null) => void;
  onVoteToggle: () => void;
  isWinner: boolean;
}

function OptionRow({ proposal, option, tally, myResponse, open, busy, onAvailability, onVoteToggle, isWinner }: OptionRowProps) {
  return (
    <li
      className={`p-3 rounded-lg border ${
        isWinner ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-primary-900">
            {isWinner && '👑 '}
            {describeOption(option)}
          </p>
          {option.location && (
            <p className="text-xs text-slate-600 mt-0.5">📍 {option.location}</p>
          )}
        </div>

        {/* Tally summary */}
        <div className="text-xs text-slate-600 shrink-0">
          {proposal.mode === 'available' && tally && (
            <span className="font-mono">
              <span className="text-emerald-700">✅ {tally.yes}</span>
              {' · '}
              <span className="text-amber-600">🤔 {tally.maybe}</span>
              {' · '}
              <span className="text-red-600">❌ {tally.no}</span>
            </span>
          )}
          {proposal.mode === 'voting' && tally && (
            <span className="font-mono">{tally.votes} vote{tally.votes === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>

      {/* My response controls */}
      {open && (
        <div className="mt-2 flex flex-wrap gap-1">
          {proposal.mode === 'available' && (
            <>
              {(['yes', 'maybe', 'no'] as AvailabilityResponse[]).map((r) => {
                const active = myResponse?.response === r;
                const label = r === 'yes' ? '✅ Yes' : r === 'maybe' ? '🤔 Maybe' : '❌ No';
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onAvailability(active ? null : r)}
                    disabled={busy}
                    className={`text-xs px-2.5 py-1 rounded-md border transition ${
                      active
                        ? r === 'yes'
                          ? 'bg-emerald-500 text-white border-emerald-600'
                          : r === 'maybe'
                            ? 'bg-amber-500 text-white border-amber-600'
                            : 'bg-red-500 text-white border-red-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-primary-400'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </>
          )}
          {proposal.mode === 'voting' && (
            <button
              type="button"
              onClick={onVoteToggle}
              disabled={busy}
              className={`text-xs px-2.5 py-1 rounded-md border transition ${
                myResponse
                  ? 'bg-primary-600 text-white border-primary-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-primary-400'
              }`}
            >
              {myResponse ? '✓ Voted' : 'Vote'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/* ---------------- Ranked interface ---------------- */

interface RankedProps {
  proposal: MeetingProposal;
  options: MeetingOption[];
  tallies: ReturnType<typeof tally>;
  myResponses: MeetingResponse[];
  busy: boolean;
  open: boolean;
  onSubmit: (orderOfOptionIds: string[]) => void;
}

function RankedInterface({ proposal: _proposal, options, tallies, myResponses, busy, open, onSubmit }: RankedProps) {
  const initialOrder = (() => {
    const ranked = myResponses
      .filter((r) => r.rank != null)
      .sort((a, b) => (a.rank as number) - (b.rank as number));
    return ranked.map((r) => r.option_id);
  })();
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [editing, setEditing] = useState<boolean>(initialOrder.length === 0);

  const click = (id: string) => {
    if (order.includes(id)) {
      setOrder(order.filter((x) => x !== id));
    } else {
      setOrder([...order, id]);
    }
  };

  const tallyById = new Map(tallies.map((t) => [t.option_id, t]));
  const max = tallies.reduce((m, t) => Math.max(m, t.borda), 0) || 1;

  return (
    <div className="space-y-3">
      {open && editing ? (
        <>
          <p className="text-xs text-slate-500">
            Click options in order of preference. Click again to remove. Top pick = #1.
          </p>
          <ul className="space-y-2">
            {options.map((o) => {
              const idx = order.indexOf(o.id);
              const ranked = idx >= 0;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => click(o.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-md border text-left transition ${
                      ranked ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-primary-300'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full grid place-items-center text-xs font-semibold ${
                        ranked ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {ranked ? `#${idx + 1}` : '—'}
                    </span>
                    <span className="text-sm text-primary-900 flex-1 min-w-0">
                      {describeOption(o)}
                      {o.location && (
                        <span className="text-xs text-slate-500 ml-2">📍 {o.location}</span>
                      )}
                    </span>
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
                onSubmit(order);
                setEditing(false);
              }}
            >
              {busy ? 'Saving…' : `Submit ranking (${order.length}/${options.length})`}
            </button>
            {myResponses.length > 0 && (
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  setOrder(initialOrder);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            )}
            {order.length > 0 && (
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => setOrder([])}
                disabled={busy}
              >
                Clear
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {myResponses.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 flex items-start justify-between gap-2">
              <div className="text-sm text-emerald-900">
                <p className="font-semibold">✓ You ranked</p>
                <p className="text-xs mt-0.5">
                  {myResponses
                    .slice()
                    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
                    .map((r) => {
                      const o = options.find((x) => x.id === r.option_id);
                      return `#${r.rank} ${o ? describeOption(o) : '?'}`;
                    })
                    .join(' · ')}
                </p>
              </div>
              {open && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs text-emerald-700 hover:underline shrink-0"
                >
                  Change
                </button>
              )}
            </div>
          )}

          {/* Borda results */}
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
              Results (Borda count — higher is better)
            </p>
            <ul className="space-y-1">
              {[...options]
                .map((o) => ({ o, t: tallyById.get(o.id) }))
                .sort((a, b) => (b.t?.borda ?? 0) - (a.t?.borda ?? 0))
                .map(({ o, t }) => (
                  <li key={o.id} className="flex items-center gap-2 text-sm">
                    <span className="w-44 truncate" title={describeOption(o)}>
                      {t?.is_winner && '👑 '}
                      {describeOption(o)}
                    </span>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${t?.is_winner ? 'bg-amber-500' : 'bg-primary-500'}`}
                        style={{ width: `${((t?.borda ?? 0) / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs text-slate-600 tabular-nums">
                      {t?.borda ?? 0}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
