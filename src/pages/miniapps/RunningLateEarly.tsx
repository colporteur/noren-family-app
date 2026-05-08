import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

type Direction = 'late' | 'early' | 'on_time';

interface LatePing {
  id: string;
  profile_id: string;
  direction: Direction;
  minutes: number;
  note: string | null;
  event_label: string | null;
  created_at: string;
}

const directionConfig: Record<
  Direction,
  { emoji: string; label: string; verb: string; chipClass: string; cardClass: string }
> = {
  late: {
    emoji: '🐢',
    label: 'Late',
    verb: 'late',
    chipClass: 'bg-amber-500 text-white border-amber-600',
    cardClass: 'border-amber-200 bg-amber-50/50',
  },
  on_time: {
    emoji: '🕐',
    label: 'On time',
    verb: 'on time',
    chipClass: 'bg-emerald-500 text-white border-emerald-600',
    cardClass: 'border-emerald-200 bg-emerald-50/50',
  },
  early: {
    emoji: '🐰',
    label: 'Early',
    verb: 'early',
    chipClass: 'bg-sky-500 text-white border-sky-600',
    cardClass: 'border-sky-200 bg-sky-50/50',
  },
};

const MINUTES_PRESETS = [5, 10, 15, 30, 45, 60, 90];
const RECENT_HOURS = 24;

export default function RunningLateEarly() {
  const { profile } = useAuth();
  const [pings, setPings] = useState<LatePing[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showOlder, setShowOlder] = useState(false);

  // Form state
  const [direction, setDirection] = useState<Direction>('late');
  const [minutes, setMinutes] = useState<number>(15);
  const [customMinutes, setCustomMinutes] = useState<string>('');
  const [eventLabel, setEventLabel] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  const load = useCallback(async () => {
    const [pingsRes, profilesRes] = await Promise.all([
      supabase
        .from('late_pings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('profiles').select('*'),
    ]);
    if (!pingsRes.error) setPings((pingsRes.data ?? []) as LatePing[]);
    if (!profilesRes.error) setProfiles((profilesRes.data ?? []) as Profile[]);
  }, []);

  // Initial load + polling refresh every 15s
  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  // Recent event labels (distinct, from past 7 days) for quick-fill
  const recentLabels = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const p of pings) {
      if (!p.event_label) continue;
      if (new Date(p.created_at).getTime() < cutoff) continue;
      const lc = p.event_label.toLowerCase();
      if (seen.has(lc)) continue;
      seen.add(lc);
      labels.push(p.event_label);
      if (labels.length >= 4) break;
    }
    return labels;
  }, [pings]);

  // My most recent ping within the last 24h (pinned card)
  const myLatest = useMemo(() => {
    if (!profile) return null;
    const cutoff = Date.now() - RECENT_HOURS * 60 * 60 * 1000;
    return (
      pings.find(
        (p) => p.profile_id === profile.id && new Date(p.created_at).getTime() >= cutoff,
      ) ?? null
    );
  }, [pings, profile]);

  // Filter feed to past 24h unless "show older" is on
  const visibleFeed = useMemo(() => {
    if (showOlder) return pings;
    const cutoff = Date.now() - RECENT_HOURS * 60 * 60 * 1000;
    return pings.filter((p) => new Date(p.created_at).getTime() >= cutoff);
  }, [pings, showOlder]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    setJustSent(false);

    let finalMinutes = direction === 'on_time' ? 0 : minutes;
    if (customMinutes) {
      const n = parseInt(customMinutes, 10);
      if (!Number.isFinite(n) || n < 0) {
        setError('Custom minutes must be a non-negative number.');
        setBusy(false);
        return;
      }
      finalMinutes = n;
    }

    const { error: insErr } = await supabase.from('late_pings').insert({
      profile_id: profile.id,
      direction,
      minutes: finalMinutes,
      event_label: eventLabel.trim() || null,
      note: note.trim() || null,
    });

    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setNote('');
    setCustomMinutes('');
    setJustSent(true);
    setTimeout(() => setJustSent(false), 2500);
    load();
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 text-white grid place-items-center text-3xl shrink-0">
          ⏱️
        </div>
        <div>
          <h1 className="font-display text-3xl text-primary-900">
            Running Late / Early
          </h1>
          <p className="text-slate-600">
            One tap to tell the family how your timing's looking.
          </p>
        </div>
      </header>

      {/* My latest pinned */}
      {myLatest && (
        <div className={`card border ${directionConfig[myLatest.direction].cardClass}`}>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            Your latest ETA
          </p>
          <p className="text-lg font-display text-primary-900 mt-1">
            {directionConfig[myLatest.direction].emoji}{' '}
            {summarizePing(myLatest)}
            {myLatest.event_label && (
              <span className="text-base text-slate-600"> for {myLatest.event_label}</span>
            )}
          </p>
          {myLatest.note && (
            <p className="text-sm text-slate-700 italic mt-1">"{myLatest.note}"</p>
          )}
          <p className="text-xs text-slate-500 mt-1">
            Posted {timeAgo(myLatest.created_at)}. Want to update? Just send a new one.
          </p>
        </div>
      )}

      {/* Post form */}
      <form onSubmit={onSubmit} className="card space-y-4">
        <div>
          <label className="label">How's your timing?</label>
          <div className="grid grid-cols-3 gap-2">
            {(['late', 'on_time', 'early'] as Direction[]).map((d) => {
              const cfg = directionConfig[d];
              const active = direction === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`py-3 rounded-lg border-2 transition text-center ${
                    active
                      ? cfg.chipClass + ' border-2'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
                  }`}
                >
                  <div className="text-2xl">{cfg.emoji}</div>
                  <div className="text-sm font-semibold mt-0.5">{cfg.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {direction !== 'on_time' && (
          <div>
            <label className="label">By how many minutes?</label>
            <div className="flex flex-wrap gap-2">
              {MINUTES_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMinutes(m);
                    setCustomMinutes('');
                  }}
                  className={`px-3 py-1.5 rounded-md border text-sm transition ${
                    minutes === m && !customMinutes
                      ? 'bg-primary-600 text-white border-primary-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-primary-400'
                  }`}
                >
                  {m} min
                </button>
              ))}
              <input
                type="number"
                min={0}
                placeholder="custom"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                className="input w-24 text-sm py-1"
              />
            </div>
          </div>
        )}

        <div>
          <label className="label">For what? (optional)</label>
          <input
            type="text"
            className="input"
            placeholder={`e.g. "Sunday dinner", "Mom's birthday party"`}
            value={eventLabel}
            onChange={(e) => setEventLabel(e.target.value)}
          />
          {recentLabels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-xs text-slate-500 mr-1">Recent:</span>
              {recentLabels.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setEventLabel(l)}
                  className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-800 hover:bg-primary-100"
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <input
            type="text"
            className="input"
            placeholder='e.g. "Hit traffic on 77", "Got out of church early"'
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary w-full py-3 text-lg" disabled={busy}>
          {busy ? 'Sending…' : justSent ? '✓ Sent!' : '📣 Tell the family'}
        </button>
      </form>

      {/* Family feed */}
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-xl text-primary-900">Family feed</h2>
          <button
            type="button"
            onClick={() => setShowOlder((v) => !v)}
            className="text-xs text-primary-700 hover:underline"
          >
            {showOlder ? 'Past 24 hours only' : 'Show older'}
          </button>
        </div>

        {visibleFeed.length === 0 ? (
          <div className="card text-center text-slate-500">
            No pings {showOlder ? 'on record yet' : 'in the past 24 hours'}.
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleFeed.map((p) => {
              const cfg = directionConfig[p.direction];
              const who = profileById.get(p.profile_id);
              const isMe = profile?.id === p.profile_id;
              return (
                <li
                  key={p.id}
                  className={`card border ${cfg.cardClass} ${isMe ? 'ring-2 ring-primary-300' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl shrink-0">{cfg.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-primary-900">
                        {isMe ? 'You' : who ? displayName(who) : '(unknown)'}{' '}
                        <span className="font-normal text-slate-700">
                          {summarizePing(p)}
                        </span>
                      </p>
                      {p.event_label && (
                        <p className="text-xs text-slate-500 mt-0.5">→ {p.event_label}</p>
                      )}
                      {p.note && (
                        <p className="text-sm text-slate-700 italic mt-1">"{p.note}"</p>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 shrink-0">
                      {timeAgo(p.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {visibleFeed.length > 0 && (
          <p className="text-xs text-slate-400 text-center pt-2">
            Auto-refreshes every 15 seconds.
          </p>
        )}
      </div>
    </div>
  );
}

function summarizePing(p: LatePing): string {
  const cfg = directionConfig[p.direction];
  if (p.direction === 'on_time') return `is ${cfg.verb}`;
  return `is ${p.minutes} min ${cfg.verb}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 30) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
