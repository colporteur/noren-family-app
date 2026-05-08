import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';
import LocationMap from '../../components/LocationMap';

interface Alternate {
  city: string;
  state?: string;
  airport?: string;
  reason: string;
}

interface AttendeeDebug {
  name: string;
  city: string;
  lat: number;
  lng: number;
  miles: number;
}

interface RecommendationDebug {
  centroid: { lat: number; lng: number };
  centroid_city?: { city: string; state: string; formatted: string } | null;
  attendees: AttendeeDebug[];
  recommended_coords?: { lat: number; lng: number; formatted?: string } | null;
}

interface Recommendation {
  recommended: {
    city: string;
    state?: string;
    airport?: string;
    reasoning: string;
    fairness_note?: string;
  };
  alternates?: Alternate[];
  method?: string;
  debug?: RecommendationDebug;
}

interface SavedQuery {
  id: string;
  title: string | null;
  locations_in: Array<{ name: string; city: string }>;
  context: string | null;
  result: Recommendation;
  created_at: string;
}

interface AttendeeRow {
  // For known profiles, profile_id is set. For custom additions, profile_id is null.
  profile_id: string | null;
  name: string;
  city: string;
  include: boolean;
}

export default function CentralLocation() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [context, setContext] = useState('');
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [resultMeta, setResultMeta] = useState<{
    locationsIn: Array<{ name: string; city: string }>;
    context: string;
  } | null>(null);
  const [savingTitle, setSavingTitle] = useState<string>('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [profilesRes, savedRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('is_deceased', false)
        .order('first_name', { ascending: true }),
      supabase
        .from('central_location_queries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (profilesRes.error) setError(profilesRes.error.message);
    else {
      const ps = (profilesRes.data ?? []) as Profile[];
      setProfiles(ps);
      // Pre-populate rows from profiles
      setRows(
        ps.map((p) => ({
          profile_id: p.id,
          name: displayName(p),
          city: p.location ?? '',
          include: Boolean(p.location?.trim()),
        })),
      );
    }

    if (savedRes.error) setError(savedRes.error.message);
    else setSaved((savedRes.data ?? []) as SavedQuery[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const updateRow = (i: number, patch: Partial<AttendeeRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addCustomRow = () => {
    setRows((prev) => [...prev, { profile_id: null, name: '', city: '', include: true }]);
  };

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const eligible = useMemo(
    () =>
      rows
        .filter((r) => r.include && r.city.trim())
        .map((r) => ({ name: r.name.trim() || '(unnamed)', city: r.city.trim() })),
    [rows],
  );

  const askClaude = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setResultMeta(null);

    if (eligible.length < 2) {
      setBusy(false);
      setError('Need at least 2 attendees with a city filled in.');
      return;
    }

    const { data, error: fnErr } = await supabase.functions.invoke<Recommendation>(
      'suggest-central-location',
      { body: { locations: eligible, context: context.trim() || undefined } },
    );

    setBusy(false);
    if (fnErr) {
      setError(fnErr.message ?? 'Function call failed.');
      return;
    }
    if (!data) {
      setError('No data returned.');
      return;
    }
    setResult(data);
    setResultMeta({ locationsIn: eligible, context: context.trim() });
  };

  const saveResult = async () => {
    if (!result || !resultMeta) return;
    setBusy(true);
    setError(null);
    const { error: insErr } = await supabase.from('central_location_queries').insert({
      requested_by: profile?.id ?? null,
      title: savingTitle.trim() || null,
      locations_in: resultMeta.locationsIn,
      context: resultMeta.context || null,
      result,
    });
    setBusy(false);
    if (insErr) setError(insErr.message);
    else {
      setSavingTitle('');
      // Reload saved list (silently)
      const { data } = await supabase
        .from('central_location_queries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setSaved(data as SavedQuery[]);
    }
  };

  const deleteSaved = async (id: string) => {
    if (!confirm('Delete this saved meet-up suggestion?')) return;
    const { error: delErr } = await supabase
      .from('central_location_queries')
      .delete()
      .eq('id', id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    setSaved((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white grid place-items-center text-3xl shrink-0">
          📍
        </div>
        <div>
          <h1 className="font-display text-3xl text-primary-900">
            Central Location Estimator
          </h1>
          <p className="text-slate-600">
            Where should the family meet? Tell Claude who's coming from where and get a fair, opinionated pick.
          </p>
        </div>
      </header>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          {/* Attendees */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg text-primary-900">Who's coming?</h2>
              <button type="button" className="btn-secondary text-sm" onClick={addCustomRow}>
                + Add person/place
              </button>
            </div>
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li
                  key={i}
                  className={`grid grid-cols-12 gap-2 items-center p-2 rounded-md border ${
                    r.include ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/50 opacity-70'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => updateRow(i, { include: e.target.checked })}
                    className="col-span-1"
                    aria-label="Include"
                  />
                  <input
                    type="text"
                    className="input col-span-4 text-sm py-1"
                    placeholder="Name"
                    value={r.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    disabled={r.profile_id !== null}
                    title={r.profile_id ? 'Pulled from family directory' : undefined}
                  />
                  <input
                    type="text"
                    className="input col-span-6 text-sm py-1"
                    placeholder="City, State (e.g. Cleveland, OH)"
                    value={r.city}
                    onChange={(e) => updateRow(i, { city: e.target.value })}
                  />
                  {r.profile_id === null && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="col-span-1 text-xs text-red-600 hover:underline"
                      title="Remove this custom row"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div>
              <label className="label">Optional context</label>
              <input
                type="text"
                className="input"
                placeholder='e.g. "Christmas — drivable preferred", "must have a major airport"'
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-slate-500">
                {eligible.length} {eligible.length === 1 ? 'person' : 'people'} ready to include.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={askClaude}
                disabled={busy || eligible.length < 2}
              >
                {busy ? 'Asking Claude…' : '✨ Suggest a central location'}
              </button>
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className="card space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-warm-600 font-semibold">
                  Recommended
                </p>
                <h2 className="font-display text-3xl text-primary-900 mt-1">
                  📍 {result.recommended.city}
                  {result.recommended.state && (
                    <span className="text-slate-500 text-2xl">, {result.recommended.state}</span>
                  )}
                  {result.recommended.airport && (
                    <span className="ml-2 text-base font-mono align-middle bg-primary-100 text-primary-800 px-2 py-0.5 rounded">
                      {result.recommended.airport}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-slate-700 mt-2">{result.recommended.reasoning}</p>
                {result.recommended.fairness_note && (
                  <p className="text-xs text-slate-500 italic mt-2">
                    {result.recommended.fairness_note}
                  </p>
                )}
              </div>

              {result.debug?.recommended_coords && result.debug.attendees.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
                    The picture
                  </p>
                  <LocationMap
                    attendees={result.debug.attendees.map((a) => ({
                      lat: a.lat,
                      lng: a.lng,
                      label: a.name,
                      sublabel: `${a.city} · ${a.miles} mi`,
                    }))}
                    destination={{
                      lat: result.debug.recommended_coords.lat,
                      lng: result.debug.recommended_coords.lng,
                      label: `${result.recommended.city}${result.recommended.state ? ', ' + result.recommended.state : ''}`,
                    }}
                    centroid={result.debug.centroid}
                  />
                  <p className="text-[11px] text-slate-400 mt-2">
                    Purple dots = attendees · gold diamond = recommendation · gray dot = exact geographic centroid.
                  </p>
                </div>
              )}

              {result.alternates && result.alternates.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
                    Alternates
                  </p>
                  <ul className="space-y-2">
                    {result.alternates.map((a, i) => (
                      <li key={i} className="text-sm border-l-2 border-primary-200 pl-3">
                        <span className="font-semibold text-primary-900">
                          {a.city}
                          {a.state && `, ${a.state}`}
                        </span>
                        {a.airport && (
                          <span className="ml-2 text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                            {a.airport}
                          </span>
                        )}
                        <span className="text-slate-600"> — {a.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.method && (
                <p className="text-[11px] text-slate-400 italic">Method: {result.method}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-primary-100">
                <input
                  type="text"
                  className="input flex-1 text-sm"
                  placeholder="Optional title (e.g. Christmas 2026)"
                  value={savingTitle}
                  onChange={(e) => setSavingTitle(e.target.value)}
                />
                <button type="button" className="btn-secondary text-sm" onClick={saveResult} disabled={busy}>
                  💾 Save this
                </button>
                <button type="button" className="btn-secondary text-sm" onClick={askClaude} disabled={busy}>
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Saved meet-ups */}
          {saved.length > 0 && (
            <div className="card space-y-3">
              <h2 className="font-display text-lg text-primary-900">Saved meet-ups</h2>
              <ul className="space-y-2">
                {saved.map((s) => (
                  <li
                    key={s.id}
                    className="border border-primary-100 rounded-lg p-3 bg-white"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-semibold text-primary-900">
                          {s.title || `Meet-up — ${new Date(s.created_at).toLocaleDateString()}`}
                        </p>
                        <p className="text-sm text-slate-700 mt-0.5">
                          📍 {s.result.recommended.city}
                          {s.result.recommended.state && `, ${s.result.recommended.state}`}
                          {s.result.recommended.airport && (
                            <span className="ml-2 text-xs font-mono bg-primary-100 text-primary-800 px-1.5 py-0.5 rounded">
                              {s.result.recommended.airport}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {s.locations_in.length} attendee{s.locations_in.length === 1 ? '' : 's'} · saved {new Date(s.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteSaved(s.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
