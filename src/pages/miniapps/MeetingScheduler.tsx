import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type {
  MeetingOption,
  MeetingProposal,
  MeetingResponse,
} from '../../lib/meetings';
import { isOpenNow } from '../../lib/meetings';
import type { Profile } from '../../lib/types';
import ProposalCard from '../../components/meetings/ProposalCard';
import CreateProposalForm from '../../components/meetings/CreateProposalForm';

export default function MeetingScheduler() {
  const [proposals, setProposals] = useState<MeetingProposal[]>([]);
  const [options, setOptions] = useState<MeetingOption[]>([]);
  const [responses, setResponses] = useState<MeetingResponse[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [propRes, optRes, respRes, profRes] = await Promise.all([
      supabase.from('meeting_proposals').select('*').order('created_at', { ascending: false }),
      supabase.from('meeting_options').select('*').order('sort_order', { ascending: true }),
      supabase.from('meeting_responses').select('*'),
      supabase.from('profiles').select('*').eq('is_deceased', false),
    ]);

    let firstError: string | null = null;
    const setErr = (e: { message: string } | null) => {
      if (e && !firstError) firstError = e.message;
    };

    setErr(propRes.error);
    if (!propRes.error) setProposals((propRes.data ?? []) as MeetingProposal[]);
    setErr(optRes.error);
    if (!optRes.error) setOptions((optRes.data ?? []) as MeetingOption[]);
    setErr(respRes.error);
    if (!respRes.error) setResponses((respRes.data ?? []) as MeetingResponse[]);
    setErr(profRes.error);
    if (!profRes.error) setProfiles((profRes.data ?? []) as Profile[]);

    setError(firstError);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { active, closed } = useMemo(() => {
    const a: MeetingProposal[] = [];
    const c: MeetingProposal[] = [];
    for (const p of proposals) {
      if (isOpenNow(p)) a.push(p);
      else c.push(p);
    }
    return { active: a, closed: c };
  }, [proposals]);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white grid place-items-center text-3xl shrink-0">
            📅
          </div>
          <div>
            <h1 className="font-display text-3xl text-primary-900">Meeting Scheduler</h1>
            <p className="text-slate-600">
              Propose times, see what works for everyone, decide together.
            </p>
          </div>
        </div>
        {!showCreate && (
          <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
            + New proposal
          </button>
        )}
      </header>

      {showCreate && (
        <CreateProposalForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {error && (
        <div className="card border-red-300 text-red-700 bg-red-50">{error}</div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading proposals…</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-display text-xl text-primary-900">
              Active proposals
              {active.length > 0 && (
                <span className="text-sm text-slate-500 ml-2">({active.length})</span>
              )}
            </h2>
            {active.length === 0 ? (
              <div className="card text-center text-slate-500 text-sm">
                No active proposals. Click "+ New proposal" to start one.
              </div>
            ) : (
              <ul className="space-y-3">
                {active.map((p) => (
                  <li key={p.id}>
                    <ProposalCard
                      proposal={p}
                      options={options.filter((o) => o.proposal_id === p.id)}
                      responses={responses.filter((r) =>
                        options.some((o) => o.id === r.option_id && o.proposal_id === p.id),
                      )}
                      profiles={profiles}
                      onChanged={load}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {closed.length > 0 && (
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                className="font-display text-xl text-primary-900 flex items-center gap-2 hover:underline"
              >
                <span>{showClosed ? '▾' : '▸'}</span>
                Closed proposals
                <span className="text-sm text-slate-500 font-sans">({closed.length})</span>
              </button>
              {showClosed && (
                <ul className="space-y-3">
                  {closed.map((p) => (
                    <li key={p.id}>
                      <ProposalCard
                        proposal={p}
                        options={options.filter((o) => o.proposal_id === p.id)}
                        responses={responses.filter((r) =>
                          options.some((o) => o.id === r.option_id && o.proposal_id === p.id),
                        )}
                        profiles={profiles}
                        onChanged={load}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
