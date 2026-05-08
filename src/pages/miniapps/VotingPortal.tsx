import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Ballot, Poll, PollOption } from '../../lib/voting';
import { isOpenNow } from '../../lib/voting';
import type { Profile } from '../../lib/types';
import PollCard from '../../components/voting/PollCard';
import CreatePollForm from '../../components/voting/CreatePollForm';

export default function VotingPortal() {
  const { isDictator } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [ballots, setBallots] = useState<Ballot[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [pollsRes, optsRes, ballRes, profRes] = await Promise.all([
      supabase.from('votes_polls').select('*').order('created_at', { ascending: false }),
      supabase.from('votes_options').select('*').order('sort_order', { ascending: true }),
      supabase.from('votes_ballots').select('*'),
      supabase.from('profiles').select('*'),
    ]);

    let firstError: string | null = null;
    const setErr = (e: { message: string } | null) => {
      if (e && !firstError) firstError = e.message;
    };

    setErr(pollsRes.error);
    if (!pollsRes.error) setPolls((pollsRes.data ?? []) as Poll[]);
    setErr(optsRes.error);
    if (!optsRes.error) setOptions((optsRes.data ?? []) as PollOption[]);
    setErr(ballRes.error);
    if (!ballRes.error) setBallots((ballRes.data ?? []) as Ballot[]);
    setErr(profRes.error);
    if (!profRes.error) setProfiles((profRes.data ?? []) as Profile[]);

    setError(firstError);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { active, closed } = useMemo(() => {
    const a: Poll[] = [];
    const c: Poll[] = [];
    for (const p of polls) {
      if (isOpenNow(p)) a.push(p);
      else c.push(p);
    }
    return { active: a, closed: c };
  }, [polls]);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white grid place-items-center text-3xl shrink-0">
            🗳️
          </div>
          <div>
            <h1 className="font-display text-3xl text-primary-900">Voting Portal</h1>
            <p className="text-slate-600">
              Dictators seed options. The family votes.
            </p>
          </div>
        </div>
        {isDictator && !showCreate && (
          <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
            + New poll
          </button>
        )}
      </header>

      {showCreate && (
        <CreatePollForm
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
        <p className="text-slate-500">Loading polls…</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-display text-xl text-primary-900">
              Active polls
              {active.length > 0 && (
                <span className="text-sm text-slate-500 ml-2">({active.length})</span>
              )}
            </h2>
            {active.length === 0 ? (
              <div className="card text-center text-slate-500 text-sm">
                No active polls.{' '}
                {isDictator && 'Click "+ New poll" to start one.'}
              </div>
            ) : (
              <ul className="space-y-3">
                {active.map((p) => (
                  <li key={p.id}>
                    <PollCard
                      poll={p}
                      options={options.filter((o) => o.poll_id === p.id)}
                      ballots={ballots.filter((b) => b.poll_id === p.id)}
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
                Closed polls
                <span className="text-sm text-slate-500 font-sans">({closed.length})</span>
              </button>
              {showClosed && (
                <ul className="space-y-3">
                  {closed.map((p) => (
                    <li key={p.id}>
                      <PollCard
                        poll={p}
                        options={options.filter((o) => o.poll_id === p.id)}
                        ballots={ballots.filter((b) => b.poll_id === p.id)}
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
